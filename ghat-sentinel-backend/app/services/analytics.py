"""Historical analytics: ghat registry, readings, trends and overview (pandas-backed)."""
from __future__ import annotations

from datetime import date

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError
from app.models import DataSource, Ghat, Reading, ReviewCase, StatewideReading
from app.schemas.analytics import Overview, ParameterTrend, PeriodSummary, TrendPoint, TrendsResponse, TrendSummary
from app.schemas.common import CaseStatus
from app.schemas.ghat import DataQuality, GhatDetail, GhatList, GhatSummary, ParameterInfo
from app.schemas.reading import Reading as ReadingOut
from app.schemas.reading import ReadingsPage
from app.services import criteria as crit
from app.services.common import (GENERAL_LIMITATIONS, PHASE_ORDER, iso_now, sample_period, season_key)
from app.services.ingestion import CENSORED_FLAGS

CASE_STATUSES: list[str] = ["needs_verification", "under_review", "action_assigned", "resolved"]


def is_censored(r) -> bool:
    return r.value is None and r.flag in CENSORED_FLAGS


def is_reported(r) -> bool:
    return r.value is not None or r.flag in CENSORED_FLAGS


def completeness(rows) -> float | None:
    rows = list(rows)
    return round(sum(1 for r in rows if is_reported(r)) / len(rows), 4) if rows else None


def reading_out(r: Reading, evaluation=None) -> ReadingOut:
    return ReadingOut(
        id=r.id, ghat_id=r.ghat_id, sample_date=r.sample_date, parameter=r.parameter, value=r.value, unit=r.unit,
        source_file=r.source_file, source_record_id=r.source_record_id, sample_year=r.sample_year,
        festival=r.festival, phase=r.phase, sample_period=sample_period(r.sample_year, r.festival, r.phase),
        flag=r.flag, value_as_printed=r.value_as_printed, source_page=r.source_page, evaluation=evaluation)


def get_ghat(db: Session, ghat_id: str) -> Ghat:
    g = db.get(Ghat, ghat_id)
    if g is None:
        raise NotFoundError(f"Ghat '{ghat_id}' was not found.", code="GHAT_NOT_FOUND")
    return g


def resolve_ghats(db: Session, ghat_ids: list[str] | None) -> list[Ghat]:
    if not ghat_ids:
        return list(db.scalars(select(Ghat).order_by(Ghat.name)))
    out = []
    for gid in dict.fromkeys(ghat_ids):
        out.append(get_ghat(db, gid))
    return out


def _stats_by_ghat(db: Session) -> dict[str, tuple[int, int, int]]:
    rows = db.execute(select(Reading.ghat_id, func.count(), func.min(Reading.sample_year),
                             func.max(Reading.sample_year)).group_by(Reading.ghat_id)).all()
    return {gid: (n, lo, hi) for gid, n, lo, hi in rows}


def _summary(g: Ghat, stats: dict) -> GhatSummary:
    n, lo, hi = stats.get(g.id, (0, None, None))
    return GhatSummary(
        id=g.id, name=g.name, water_body=g.water_body, latitude=g.latitude, longitude=g.longitude,
        last_sample_date=None, last_sample_year=hi, first_sample_year=lo, observation_count=n,
        data_status="historical" if n else "no_data")


def list_ghats(db: Session, search: str | None, limit: int, offset: int) -> GhatList:
    q = select(Ghat)
    if search:
        q = q.where(func.lower(Ghat.name).contains(search.strip().lower()))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    ghats = db.scalars(q.order_by(Ghat.name).limit(limit).offset(offset)).all()
    stats = _stats_by_ghat(db)
    return GhatList(items=[_summary(g, stats) for g in ghats], total=total, limit=limit, offset=offset)


def all_seasons(db: Session) -> list[tuple[int, str]]:
    rows = db.execute(select(Reading.sample_year, Reading.festival).distinct()).all()
    return sorted({(y, f) for y, f in rows}, key=lambda s: season_key(*s))


def ghat_detail(db: Session, ghat_id: str) -> GhatDetail:
    g = get_ghat(db, ghat_id)
    rows = db.scalars(select(Reading).where(Reading.ghat_id == ghat_id)).all()
    summary = _summary(g, _stats_by_ghat(db))
    params: dict[str, list[Reading]] = {}
    for r in rows:
        params.setdefault(r.parameter, []).append(r)
    infos = []
    for p, rs in sorted(params.items()):
        years = [r.sample_year for r in rs]
        infos.append(ParameterInfo(
            parameter=p, unit=rs[0].unit, observation_count=len(rs),
            numeric_count=sum(1 for r in rs if r.value is not None),
            missing_count=sum(1 for r in rs if not is_reported(r)),
            censored_count=sum(1 for r in rs if is_censored(r)), first_year=min(years), last_year=max(years)))
    # latest readings: all phases of the most recent season for each parameter
    latest: list[Reading] = []
    for p, rs in params.items():
        best = max(season_key(r.sample_year, r.festival) for r in rs)
        latest += [r for r in rs if season_key(r.sample_year, r.festival) == best]
    latest.sort(key=lambda r: (r.parameter, PHASE_ORDER.get(r.phase, 9)))
    mine = sorted({(r.sample_year, r.festival) for r in rows}, key=lambda s: season_key(*s))
    missing = [s for s in all_seasons(db) if s not in set(mine)]
    warnings = []
    if g.site_match_confidence == "medium":
        warnings.append("Site name match confidence is 'medium': the name may cover more than one physical place.")
    if missing:
        warnings.append("No data for: " + ", ".join(f"{y} {f}" for y, f in missing) + ".")
    if g.latitude is None:
        warnings.append("Coordinates are not available in the source data.")
    dq = DataQuality(
        completeness=completeness(rows), numeric_count=sum(1 for r in rows if r.value is not None),
        missing_count=sum(1 for r in rows if not is_reported(r)), censored_count=sum(1 for r in rows if is_censored(r)),
        seasons_covered=[f"{y} {f}" for y, f in mine], seasons_missing=[f"{y} {f}" for y, f in missing],
        site_match_confidence=g.site_match_confidence, warnings=warnings)
    return GhatDetail(**summary.model_dump(), parameters=infos, latest_readings=[reading_out(r) for r in latest],
                      data_quality=dq, limitations=GENERAL_LIMITATIONS)


def query_readings(db: Session, ghat_id: str, parameter: str | None, lo: int | None, hi: int | None,
                   limit: int, offset: int, evaluate: bool = False, cpcb_class: str | None = None) -> ReadingsPage:
    get_ghat(db, ghat_id)
    q = select(Reading).where(Reading.ghat_id == ghat_id)
    if parameter:
        q = q.where(func.lower(Reading.parameter) == parameter.strip().lower())
    if lo is not None:
        q = q.where(Reading.sample_year >= lo)
    if hi is not None:
        q = q.where(Reading.sample_year <= hi)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    q = q.order_by(Reading.sample_year, Reading.festival.desc(), Reading.parameter, Reading.id).limit(limit).offset(offset)
    rows = db.scalars(q).all()
    rows.sort(key=lambda r: (r.sample_year, season_key(r.sample_year, r.festival), r.parameter, PHASE_ORDER[r.phase]))
    results = {}
    if evaluate:
        idx = crit.criteria_index(db, cpcb_class)
        cls = crit.check_class(cpcb_class)
        results = {r.id: crit.evaluate(r, idx.get(r.parameter), cls) for r in rows}
    return ReadingsPage(items=[reading_out(r, results.get(r.id)) for r in rows], total=total, limit=limit,
                        offset=offset, limitations=GENERAL_LIMITATIONS[:4])


def _df(rows: list[Reading]) -> pd.DataFrame:
    return pd.DataFrame([{"id": r.id, "year": r.sample_year, "festival": r.festival, "phase": r.phase,
                          "value": r.value, "flag": r.flag, "page": r.source_page} for r in rows])


def ghat_trends(db: Session, ghat_id: str, parameter: str | None, lo: int | None, hi: int | None) -> TrendsResponse:
    get_ghat(db, ghat_id)
    q = select(Reading).where(Reading.ghat_id == ghat_id)
    if parameter:
        q = q.where(func.lower(Reading.parameter) == parameter.strip().lower())
    if lo is not None:
        q = q.where(Reading.sample_year >= lo)
    if hi is not None:
        q = q.where(Reading.sample_year <= hi)
    rows = db.scalars(q).all()
    if parameter and not rows:
        known = db.scalar(select(func.count()).select_from(Reading).where(
            Reading.ghat_id == ghat_id, func.lower(Reading.parameter) == parameter.strip().lower()))
        if not known:
            raise NotFoundError(f"Parameter '{parameter}' has no observations for ghat '{ghat_id}'.",
                                code="PARAMETER_NOT_FOUND")
    by_param: dict[str, list[Reading]] = {}
    for r in rows:
        by_param.setdefault(r.parameter, []).append(r)
    items = [_parameter_trend(p, rs) for p, rs in sorted(by_param.items())]
    return TrendsResponse(ghat_id=ghat_id, items=items)


def _parameter_trend(parameter: str, rows: list[Reading]) -> ParameterTrend:
    rows = sorted(rows, key=lambda r: (season_key(r.sample_year, r.festival), PHASE_ORDER[r.phase]))
    df = _df(rows)
    series = [TrendPoint(reading_id=r.id, sample_year=r.sample_year, festival=r.festival, phase=r.phase,
                         sample_period=sample_period(r.sample_year, r.festival, r.phase), value=r.value,
                         flag=r.flag, source_page=r.source_page) for r in rows]
    summaries = []
    num = df[df["value"].notna()]
    period = []
    if not num.empty:
        g = num.groupby(["year", "festival", "phase"])["value"]
        agg = g.agg(["count", "mean", "median", "min", "max"]).reset_index()
        for rec in agg.to_dict("records"):
            period.append(PeriodSummary(
                sample_year=int(rec["year"]), festival=rec["festival"], phase=rec["phase"], n=int(rec["count"]),
                mean=round(float(rec["mean"]), 4), median=round(float(rec["median"]), 4),
                min=float(rec["min"]), max=float(rec["max"])))
        period.sort(key=lambda p: (season_key(p.sample_year, p.festival), PHASE_ORDER[p.phase]))
    # Trend: like-with-like only (same festival, phase = during immersion), earliest vs latest season.
    for fest in ("Ganesh", "Durga"):
        sub = num[(num["festival"] == fest) & (num["phase"] == "during")].sort_values("year")
        n = len(sub)
        method = (f"Descriptive difference between the earliest and latest {fest} 'during immersion' value "
                  "(same festival and phase only).")
        if n < 2:
            summaries.append(TrendSummary(
                festival=fest, phase="during", supported=False, observation_count=n,
                start_year=int(sub["year"].min()) if n else None, end_year=int(sub["year"].max()) if n else None,
                method=method, limitations=[f"Only {n} comparable observation(s); a trend needs at least 2 seasons."]))
            continue
        first, last = float(sub["value"].iloc[0]), float(sub["value"].iloc[-1])
        change = round(last - first, 4)
        summaries.append(TrendSummary(
            festival=fest, phase="during", supported=True, observation_count=n, start_year=int(sub["year"].iloc[0]),
            end_year=int(sub["year"].iloc[-1]), method=method, first_value=first, last_value=last, change=change,
            direction="increase" if change > 0 else "decrease" if change < 0 else "unchanged",
            statistically_tested=False,
            limitations=[f"Based on {n} seasons only; no significance test was performed and none is claimed.",
                         "Sampling conditions and exact dates differ between years and are not recorded."]))
    n_num = int(num.shape[0])
    limits = ["Missing observations are left missing (not interpolated or zero-filled).",
              "Values are historical; exact sample dates are not available."]
    return ParameterTrend(
        parameter=parameter, unit=rows[0].unit if rows else None, sample_count=n_num,
        missing_count=sum(1 for r in rows if not is_reported(r)), censored_count=sum(1 for r in rows if is_censored(r)),
        start_year=min(r.sample_year for r in rows), end_year=max(r.sample_year for r in rows), series=series,
        period_summary=period, trend_summaries=summaries, limitations=limits)


def overview(db: Session, cpcb_class: str | None = None) -> Overview:
    cls = crit.check_class(cpcb_class)
    rows = db.scalars(select(Reading)).all()
    idx = crit.criteria_index(db, cls)
    results = [crit.evaluate(r, idx.get(r.parameter), cls) for r in rows]
    evaluated = [x for x in results if x.result in ("within_criterion", "outside_criterion")]
    flagged = sum(1 for x in results if x.result == "outside_criterion")
    status_counts = dict(db.execute(select(ReviewCase.status, func.count()).group_by(ReviewCase.status)).all())
    ghats = db.scalars(select(Ghat)).all()
    latest_year = max((r.sample_year for r in rows), default=None)
    state_n = db.scalar(select(func.count()).select_from(StatewideReading)) or 0
    warnings: list[str] = []
    if not rows:
        warnings.append("No readings are loaded. Run scripts/seed_database.py (after scripts/download_data.py).")
    else:
        missing = sum(1 for r in rows if not is_reported(r))
        warnings.append(f"{missing} of {len(rows)} readings have no numeric value and no BDL/ND flag (missing, "
                        "not clean).")
        seasons = all_seasons(db)
        for g in ghats:
            have = {(r.sample_year, r.festival) for r in rows if r.ghat_id == g.id}
            gone = [s for s in seasons if s not in have]
            if gone:
                warnings.append(f"{g.name}: no data for " + ", ".join(f"{y} {f}" for y, f in gone) + ".")
            if g.site_match_confidence == "medium":
                warnings.append(f"{g.name}: site-name match confidence is medium (may cover two places).")
        warnings.append("Coordinates are not in the source data; ghats cannot be placed on a map from this API.")
        warnings.append("Exact sample dates are not available; only year, festival and phase.")
    for ds in db.scalars(select(DataSource)).all():
        rep = ds.validation_report or {}
        if rep.get("errors"):
            warnings.append(f"{ds.file_name}: " + "; ".join(rep["errors"]))
        if ds.invalid_row_count:
            warnings.append(f"{ds.file_name}: {ds.invalid_row_count} row(s) excluded during validation.")
    return Overview(
        total_ghats=len(ghats), total_readings=len(rows),
        numeric_readings=sum(1 for r in rows if r.value is not None),
        missing_readings=sum(1 for r in rows if not is_reported(r)),
        censored_readings=sum(1 for r in rows if is_censored(r)), latest_sample_year=latest_year,
        latest_sample_date=None, flagged_readings=flagged, evaluated_readings=len(evaluated), cpcb_class=cls,
        intended_use=crit.intended_use(db, cls),
        cases_by_status={s: int(status_counts.get(s, 0)) for s in CASE_STATUSES},
        data_quality_warnings=warnings, statewide_rows=state_n, generated_at=iso_now())
