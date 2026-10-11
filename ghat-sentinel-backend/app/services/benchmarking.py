"""Bhopal vs statewide comparison, only where it is defensible."""
from __future__ import annotations

from types import SimpleNamespace

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError
from app.models import Reading, StatewideReading
from app.schemas.analytics import Benchmark, StatBlock
from app.services import criteria as crit
from app.services.common import GENERAL_LIMITATIONS
from app.services.ingestion import BHOPAL_FILE, CENSORED_FLAGS, STATE_FILE

MIN_SAMPLES = 3
AGGREGATION = ("Pooled descriptive statistics (median, mean, quartiles) over all numeric observations in the selected "
               "year/phase. BDL, ND, 'not sampled' and blank values are excluded (never zero-filled). Exact "
               "statewide duplicate rows are excluded.")


def _block(label: str, rows: list, sites: int | None, idx: dict, cls: str, parameter: str) -> StatBlock:
    nums = [r.value for r in rows if r.value is not None]
    censored = sum(1 for r in rows if r.value is None and r.flag in CENSORED_FLAGS)
    missing = sum(1 for r in rows if r.value is None and r.flag not in CENSORED_FLAGS)
    arr = np.array(nums, dtype=float)
    kw = dict(median=None, mean=None, p25=None, p75=None, min=None, max=None)
    if nums:
        kw = dict(median=float(np.median(arr)), mean=float(arr.mean()), p25=float(np.percentile(arr, 25)),
                  p75=float(np.percentile(arr, 75)), min=float(arr.min()), max=float(arr.max()))
        kw = {k: round(v, 4) for k, v in kw.items()}
    exc_n = exc_rate = None
    c = idx.get(parameter)
    if c is not None and nums:
        outs = 0
        for r in rows:
            if r.value is None:
                continue
            probe = SimpleNamespace(id=r.id, parameter=parameter, value=r.value, unit=r.unit, flag=r.flag,
                                    sample_year=r.sample_year, festival=r.festival, phase=r.phase, sample_date=None)
            if crit.evaluate(probe, c, cls).result == "outside_criterion":
                outs += 1
        exc_n, exc_rate = outs, round(outs / len(nums), 4)
    return StatBlock(label=label, sample_count=len(nums), excluded_missing=missing, excluded_censored=censored,
                     site_count=sites, exceedance_count=exc_n, exceedance_rate=exc_rate,
                     years=sorted({r.sample_year for r in rows}), **kw)


def _periods(rows) -> set[tuple]:
    return {(r.sample_year, r.festival, r.phase) for r in rows if r.value is not None}


def benchmark(db: Session, parameter: str, year: int | None, region: str | None, phase: str | None,
              cpcb_class: str | None = None) -> Benchmark:
    cls = crit.check_class(cpcb_class)
    idx = crit.criteria_index(db, cls)
    p_lower = parameter.strip().lower()
    canonical = (db.scalar(select(Reading.parameter).where(func.lower(Reading.parameter) == p_lower).limit(1))
                 or db.scalar(select(StatewideReading.parameter).where(
                     func.lower(StatewideReading.parameter) == p_lower).limit(1)))
    if canonical is None:
        raise NotFoundError(f"Parameter '{parameter}' was not found in the loaded datasets.", code="PARAMETER_NOT_FOUND")
    bq = select(Reading).where(Reading.parameter == canonical)
    sq = select(StatewideReading).where(StatewideReading.parameter == canonical)
    if year is not None:
        bq, sq = bq.where(Reading.sample_year == year), sq.where(StatewideReading.sample_year == year)
    if phase:
        bq, sq = bq.where(Reading.phase == phase), sq.where(StatewideReading.phase == phase)
    b_rows = list(db.scalars(bq))
    s_all = list(db.scalars(sq))
    s_rows = [r for r in s_all if not r.is_duplicate]
    dups = len(s_all) - len(s_rows)
    warnings: list[str] = []

    region_block = None
    if region:
        offices = {r.regional_office for r in db.scalars(select(StatewideReading).where(
            StatewideReading.parameter == canonical))}
        match = next((o for o in offices if o.lower() == region.strip().lower()), None)
        if match is None:
            raise NotFoundError(f"Region '{region}' was not found. Known regional offices: {sorted(offices)}",
                                code="REGION_NOT_FOUND")
        region_block = _block(match, [r for r in s_rows if r.regional_office == match], None, idx, cls, canonical)

    units = {crit.normalize_unit(r.unit) for r in b_rows} | {crit.normalize_unit(r.unit) for r in s_rows}
    unit_raw = next((r.unit for r in b_rows + s_rows if r.unit), None)
    comparable = True
    if len(units) > 1:
        comparable = False
        warnings.append(f"Incompatible units across datasets ({sorted(units)}); no comparison is made.")
    b_periods, s_periods = _periods(b_rows), _periods(s_rows)
    if not b_periods or not s_periods:
        comparable = False
        warnings.append("One dataset has no numeric observations for this selection; no comparison is possible.")
    elif not b_periods <= s_periods:
        comparable = False
        warnings.append("Bhopal sampling periods are not covered by the statewide data; no fair comparison.")
    elif b_periods != s_periods:
        warnings.append("Sampling periods differ: the statewide data cover additional year/festival/phase combinations.")
    n_b = sum(1 for r in b_rows if r.value is not None)
    n_s = sum(1 for r in s_rows if r.value is not None)
    if min(n_b, n_s) < MIN_SAMPLES:
        comparable = False
        warnings.append(f"Fewer than {MIN_SAMPLES} numeric samples in at least one dataset; sample is insufficient.")
    if any(r.needs_check for r in s_rows):
        warnings.append(f"{sum(1 for r in s_rows if r.needs_check)} statewide rows have unreadable site names "
                        "(needs_check); they count in statistics but not in site counts.")
    warnings.append("The statewide file's 'R.O. Bhopal' office overlaps with the Bhopal dataset; see "
                    "statewide_excluding_bhopal_office for an independent comparison.")
    censored = sum(1 for r in b_rows + s_rows if r.value is None and r.flag in CENSORED_FLAGS)
    if censored:
        warnings.append(f"{censored} BDL/ND observations are excluded from statistics, which can bias medians upward "
                        "for parameters with many below-detection values.")

    b_block = _block("Bhopal ghats", b_rows, len({r.ghat_id for r in b_rows}), idx, cls, canonical)
    s_sites = len({(r.regional_office, r.site_as_printed) for r in s_rows if r.site_as_printed and not r.needs_check})
    s_block = _block("Madhya Pradesh (all regional offices)", s_rows, s_sites, idx, cls, canonical)
    other_rows = [r for r in s_rows if "bhopal" not in r.regional_office.lower()]
    other_sites = len({(r.regional_office, r.site_as_printed) for r in other_rows if r.site_as_printed and not r.needs_check})
    o_block = _block("Madhya Pradesh excluding R.O. Bhopal", other_rows, other_sites, idx, cls, canonical)
    b_block.excluded_duplicates = 0
    s_block.excluded_duplicates = o_block.excluded_duplicates = dups
    crit_c = idx.get(canonical)
    return Benchmark(
        parameter=canonical, year=year, region=region, comparable=comparable, unit=unit_raw, cpcb_class=cls,
        criterion_applied=(f"CPCB class {cls}: {crit_c.comparison_operator} {crit_c.threshold:g}"
                           + (f"-{crit_c.threshold_upper:g}" if crit_c.threshold_upper is not None else "")
                           if crit_c else None),
        aggregation_method=AGGREGATION, bhopal=b_block if comparable else None,
        statewide=s_block if comparable else None,
        statewide_excluding_bhopal_office=o_block if comparable else None, region_stats=region_block,
        bhopal_sample_count=n_b, statewide_sample_count=n_s,
        missing_data_exclusions={
            "bhopal_missing": b_block.excluded_missing, "bhopal_censored": b_block.excluded_censored,
            "statewide_missing": s_block.excluded_missing, "statewide_censored": s_block.excluded_censored,
            "statewide_duplicates": dups},
        source_coverage={"bhopal_file": [BHOPAL_FILE], "statewide_file": [STATE_FILE],
                         "bhopal_years": [str(y) for y in b_block.years], "statewide_years": [str(y) for y in s_block.years]},
        warnings=warnings,
        limitations=GENERAL_LIMITATIONS[:3] + ["Statewide data were not checked table-by-table by the dataset "
                                               "curators; treat as context, not as a substitute for Bhopal data."])
