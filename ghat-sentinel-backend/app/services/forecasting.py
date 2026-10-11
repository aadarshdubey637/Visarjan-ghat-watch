"""Exploratory October 20 outlook.

Never fabricates a number. Possible outcomes:
  experimental_estimate  - >= FORECAST_MIN_SEASONS previous Durga 'during immersion' values for ONE ghat and
                           parameter; baseline = median of those values, uncertainty = empirical range and sd.
  historical_comparison  - 2..MIN-1 usable seasons (or pooled over ghats): past values only, no prediction.
  insufficient_data      - fewer than 2 usable seasons.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import NotFoundError
from app.models import Reading
from app.schemas.forecast import Oct20Outlook, SeasonValue, Uncertainty
from app.services.analytics import get_ghat
from app.services.common import GENERAL_LIMITATIONS

DEFAULT_PARAMETER = "Dissolved oxygen"
METHOD = "Naive seasonal baseline: median of previous Durga 'during immersion' values"


def default_year(today: date | None = None) -> int:
    today = today or datetime.now(timezone.utc).date()
    return today.year if (today.month, today.day) <= (10, 20) else today.year + 1


def get_oct20(db: Session, ghat_id: str | None, parameter: str | None, year: int | None) -> Oct20Outlook:
    year = year or default_year()
    target = date(year, 10, 20)
    if ghat_id:
        get_ghat(db, ghat_id)
    p_lower = (parameter or DEFAULT_PARAMETER).strip().lower()
    canonical = db.scalar(select(Reading.parameter).where(func.lower(Reading.parameter) == p_lower).limit(1))
    if canonical is None:
        raise NotFoundError(f"Parameter '{parameter}' was not found in the loaded data.", code="PARAMETER_NOT_FOUND")

    q = select(Reading).where(Reading.parameter == canonical, Reading.festival == "Durga",
                              Reading.phase == "during", Reading.sample_year < year)
    if ghat_id:
        q = q.where(Reading.ghat_id == ghat_id)
    rows = list(db.scalars(q.order_by(Reading.sample_year)))
    unit = next((r.unit for r in rows if r.unit), None)

    history: list[SeasonValue] = []
    if ghat_id:
        for r in rows:
            history.append(SeasonValue(sample_year=r.sample_year, festival="Durga", phase="during", value=r.value,
                                       flag=r.flag, reading_ids=[r.id]))
    else:
        for y in sorted({r.sample_year for r in rows}):
            yr = [r for r in rows if r.sample_year == y]
            vals = [r.value for r in yr if r.value is not None]
            history.append(SeasonValue(sample_year=y, festival="Durga", phase="during",
                                       value=round(float(np.median(vals)), 4) if vals else None,
                                       reading_ids=[r.id for r in yr], n_sites=len(vals)))
    usable = [h.value for h in history if h.value is not None]
    n = len(usable)
    years = [h.sample_year for h in history if h.value is not None]
    limitations = list(GENERAL_LIMITATIONS[:3]) + [
        "Historical samples were taken on different (unrecorded) days of each Durga immersion season; none are "
        "specifically from 20 October.",
        "Immersion-day conditions depend on crowding, rainfall and lake levels, which are not in the data."]
    assumptions = ["Same-ghat, same-parameter, Durga 'during immersion' observations are treated as comparable "
                   "seasonal samples."]
    base = dict(target_date=target, ghat_id=ghat_id, parameter=canonical, unit=unit,
                historical_sample_count=n, historical_values=history,
                date_range_used=[min(years), max(years)] if years else None, assumptions=assumptions)
    if n < 2:
        return Oct20Outlook(
            forecast_status="insufficient_data", is_prediction=False, prediction=None, method=None, uncertainty=None,
            limitations=limitations + [f"Insufficient comparable historical observations (found {n}; at least 2 "
                                       "are needed even for a historical comparison)."], **base)
    arr = np.array(usable, dtype=float)
    if ghat_id and n >= settings.FORECAST_MIN_SEASONS:
        sd = float(arr.std(ddof=1))
        return Oct20Outlook(
            forecast_status="experimental_estimate", is_prediction=True, prediction=round(float(np.median(arr)), 4),
            method=METHOD,
            uncertainty=Uncertainty(method="empirical_range_and_sample_sd", lower=float(arr.min()),
                                    upper=float(arr.max()), std=round(sd, 4),
                                    note="Range of past values; not a statistical prediction interval."),
            limitations=limitations + ["Experimental baseline, not a validated forecast. Do not treat it as an "
                                       "expected measurement."], **base)
    reason = ("Pooled across ghats, so no single-site forecast is made." if not ghat_id else
              f"Only {n} usable seasons; at least {settings.FORECAST_MIN_SEASONS} are required for an experimental "
              "estimate.")
    return Oct20Outlook(
        forecast_status="historical_comparison", is_prediction=False, prediction=None, method=None, uncertainty=None,
        limitations=limitations + [f"No forecast produced. {reason} Showing historical Durga 'during' values "
                                   f"({min(years)}-{max(years)}): min {arr.min():g}, median {np.median(arr):g}, "
                                   f"max {arr.max():g}" + (f" {unit}" if unit else "") + "."], **base)
