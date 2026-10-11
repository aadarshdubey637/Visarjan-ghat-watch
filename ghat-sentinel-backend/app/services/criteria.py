"""Deterministic criteria evaluation. No AI is involved anywhere in this module.

Rules
* A criterion is only applied to a parameter if it is explicitly listed for the selected CPCB class
  (dataset parameter names are mapped to criteria names in ingestion.PARAMETER_ALIASES).
* The CPCB class (intended use) is always explicit; the project default is class B (outdoor bathing).
* Units are compared after normalisation; an incompatible unit gives `not_comparable`.
* Range criteria are inclusive unless the operator says `between_exclusive`.
"""
from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import UnprocessableError
from app.models import Criterion
from app.schemas.reading import ComparisonResult
from app.schemas.reading import Criterion as CriterionOut
from app.services.common import sample_period

OPERATORS = {"<", "<=", ">", ">=", "between_inclusive", "between_exclusive"}
# Documented safe unit equivalences (1 micromho/cm == 1 microsiemens/cm).
_UNIT_ALIASES = {
    "": "dimensionless", "ph": "dimensionless", "ph units": "dimensionless",
    "micromhos/cm": "us/cm", "umho/cm": "us/cm", "umhos/cm": "us/cm", "us/cm": "us/cm",
    "mg/l": "mg/l", "mg/litre": "mg/l", "ntu": "ntu",
}
VALID_CLASSES = {"A", "B", "C", "D", "E"}


def normalize_unit(unit: str | None) -> str:
    u = (unit or "").strip().lower().replace("µ", "u").replace("μ", "u")
    return _UNIT_ALIASES.get(u, u)


def criterion_out(c: Any) -> CriterionOut:
    return CriterionOut(
        id=c.id, parameter=c.parameter, intended_use=c.intended_use, comparison_operator=c.comparison_operator,
        threshold=c.threshold, unit=c.unit, source_reference=c.source_reference, cpcb_class=c.cpcb_class,
        threshold_upper=c.threshold_upper,
    )


def check_class(cpcb_class: str | None) -> str:
    cls = (cpcb_class or settings.DEFAULT_CPCB_CLASS).upper()
    if cls not in VALID_CLASSES:
        raise UnprocessableError(f"cpcb_class must be one of {sorted(VALID_CLASSES)}.")
    return cls


def criteria_index(db: Session, cpcb_class: str | None = None) -> dict[str, Criterion]:
    """dataset parameter name -> criterion for the selected class."""
    cls = check_class(cpcb_class)
    rows = db.scalars(select(Criterion).where(Criterion.cpcb_class == cls)).all()
    return {r.dataset_parameter: r for r in rows if r.dataset_parameter}


def intended_use(db: Session, cpcb_class: str | None = None) -> str | None:
    cls = check_class(cpcb_class)
    return db.scalar(select(Criterion.intended_use).where(Criterion.cpcb_class == cls).limit(1))


def _describe(c: Any) -> str:
    if c.comparison_operator.startswith("between"):
        lo, hi = c.threshold, c.threshold_upper
        return f"{lo:g} to {hi:g}" + ("" if c.comparison_operator == "between_inclusive" else " (exclusive)")
    return f"{c.comparison_operator} {c.threshold:g}"


def _holds(op: str, value: float, c: Any) -> bool:
    t = c.threshold
    if op == "<":
        return value < t
    if op == "<=":
        return value <= t
    if op == ">":
        return value > t
    if op == ">=":
        return value >= t
    if op == "between_inclusive":
        return t <= value <= c.threshold_upper
    if op == "between_exclusive":
        return t < value < c.threshold_upper
    raise ValueError(f"Unsupported operator {op}")


def _relative_exceedance(value: float, c: Any) -> float | None:
    """How far outside the limit, as a fraction of the violated limit (>=0)."""
    op = c.comparison_operator
    if op in ("<", "<="):
        limit, gap = c.threshold, value - c.threshold
    elif op in (">", ">="):
        limit, gap = c.threshold, c.threshold - value
    else:
        if value < c.threshold:
            limit, gap = c.threshold, c.threshold - value
        else:
            limit, gap = c.threshold_upper, value - c.threshold_upper
    if limit == 0:
        return None
    return round(max(gap, 0.0) / abs(limit), 4)


def evaluate(reading: Any, criterion: Any | None, cpcb_class: str | None = None) -> ComparisonResult:
    """Evaluate one reading against one criterion (or none)."""
    period = sample_period(reading.sample_year, reading.festival, reading.phase)
    base = dict(
        reading_id=reading.id, observed_value=reading.value, unit=reading.unit,
        sample_date=getattr(reading, "sample_date", None), parameter=reading.parameter,
        cpcb_class=cpcb_class, sample_period=period,
    )
    if criterion is None:
        return ComparisonResult(
            **base, criterion_id=None, result="not_comparable", threshold=None, comparison_operator=None,
            source_reference=None,
            reason=f"No CPCB class {cpcb_class or '?'} criterion is defined for '{reading.parameter}'.")
    crit = dict(
        criterion_id=criterion.id, threshold=criterion.threshold, comparison_operator=criterion.comparison_operator,
        source_reference=criterion.source_reference, threshold_upper=criterion.threshold_upper,
    )
    if criterion.comparison_operator not in OPERATORS:
        return ComparisonResult(**base, **crit, result="not_comparable",
                                reason=f"Unsupported operator '{criterion.comparison_operator}'.")
    if reading.value is None:
        why = f" (recorded as '{reading.flag}')" if reading.flag else ""
        return ComparisonResult(**base, **crit, result="insufficient_data",
                                reason=f"No numeric value{why}; cannot compare. Missing is not treated as clean.")
    if normalize_unit(reading.unit) != normalize_unit(criterion.unit):
        return ComparisonResult(
            **base, **crit, result="not_comparable",
            reason=f"Unit '{reading.unit}' is not comparable with criterion unit '{criterion.unit}'.")
    ok = _holds(criterion.comparison_operator, reading.value, criterion)
    unit = f" {criterion.unit}" if criterion.unit else ""
    reason = (f"{reading.value:g}{unit} {'meets' if ok else 'does not meet'} the limit "
              f"{_describe(criterion)}{unit} (CPCB class {criterion.cpcb_class}: {criterion.intended_use}).")
    return ComparisonResult(
        **base, **crit, result="within_criterion" if ok else "outside_criterion", reason=reason,
        relative_exceedance=None if ok else _relative_exceedance(reading.value, criterion))


def evaluate_readings(readings: Iterable[Any], index: dict[str, Any], cpcb_class: str | None = None) -> list[ComparisonResult]:
    cls = check_class(cpcb_class)
    return [evaluate(r, index.get(r.parameter), cls) for r in readings]
