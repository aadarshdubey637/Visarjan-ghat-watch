"""Transparent, deterministic review-priority heuristic (score 0-100).

This is a PROJECT-DEFINED heuristic to help officers decide what to verify first. It is not an official
CPCB index, not a probability of contamination and not a statement that a ghat is safe or unsafe.

Evaluable readings = numeric readings of parameters that have a limit in the selected CPCB class
(class B: pH, Dissolved oxygen, BOD). Missing / BDL values are never evaluated and never treated as clean.

Factors (points add up to 100):
  exceedance_rate  40 * outside / evaluable
  severity         20 * min(1, worst relative exceedance)      (distance past the limit / the limit)
  recurrence       25 * seasons with >=1 exceedance / seasons with evaluable data
  staleness        15 * min(1, years since latest sample / 3)  (older evidence => more need to re-verify)

Levels:  score >= 60 'high' | >= 35 'review' | otherwise 'routine' | 'insufficient_data' when fewer than
MIN_EVALUABLE evaluable readings exist (score is then null).
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Ghat, Reading
from app.schemas.ghat import FactorOut, RankedGhat, RankedResponse
from app.services import criteria as crit
from app.services.analytics import completeness, resolve_ghats, all_seasons
from app.services.common import GENERAL_LIMITATIONS, sample_period, year_bounds

MIN_EVALUABLE = 6
HIGH_THRESHOLD = 60.0
REVIEW_THRESHOLD = 35.0
WEIGHTS = {"exceedance_rate": 40.0, "severity": 20.0, "recurrence": 25.0, "staleness": 15.0}
STALENESS_YEARS_AT_MAX = 3
METHOD = (
    "Review-priority score (0-100) = 40*exceedance_rate + 20*severity + 25*recurrence + 15*staleness. "
    "high >= 60, review >= 35, routine < 35; insufficient_data when fewer than 6 evaluable readings. "
    "Project-defined heuristic; not an official CPCB index."
)
DISCLAIMER = ("Review priorities are project-defined and deterministic. They indicate where verification is "
              "most useful; they are not official classifications or statements of safety.")


def level_for(score: float) -> str:
    return "high" if score >= HIGH_THRESHOLD else "review" if score >= REVIEW_THRESHOLD else "routine"


def score_ghat(ghat: Ghat, readings: list[Reading], index: dict, cpcb_class: str, as_of_year: int,
               seasons_all: list[tuple[int, str]] | None = None) -> RankedGhat:
    results = crit.evaluate_readings(readings, index, cpcb_class)
    by_id = {r.id: r for r in readings}
    evaluable = [x for x in results if x.result in ("within_criterion", "outside_criterion")]
    outside = [x for x in evaluable if x.result == "outside_criterion"]
    last_year = max((r.sample_year for r in readings), default=None)
    comp = completeness(readings)
    limitations = list(GENERAL_LIMITATIONS)
    evaluated_params = sorted({x.parameter for x in evaluable})
    not_evaluated = sorted({r.parameter for r in readings} - set(index))
    if not_evaluated:
        limitations.append(f"No CPCB class {cpcb_class} limit exists for: {', '.join(not_evaluated)}; "
                           "these were not scored.")
    if ghat.site_match_confidence == "medium":
        limitations.append("Site-name match confidence is medium: this name may cover more than one place.")
    if seasons_all:
        have = {(r.sample_year, r.festival) for r in readings}
        gone = [s for s in seasons_all if s not in have]
        if gone:
            limitations.append("No data for: " + ", ".join(f"{y} {f}" for y, f in gone) + ".")
    base = dict(ghat_id=ghat.id, ghat_name=ghat.name, last_sample_year=last_year, last_sample_date=None,
                data_completeness=comp, cpcb_class=cpcb_class, evaluated_reading_count=len(evaluable),
                outside_reading_ids=[x.reading_id for x in outside])
    if len(evaluable) < MIN_EVALUABLE:
        return RankedGhat(
            **base, priority_level="insufficient_data", priority_score=None, factors=[],
            reasons=[f"Only {len(evaluable)} readings can be compared with CPCB class {cpcb_class} limits "
                     f"(minimum {MIN_EVALUABLE}); evidence does not support a classification."],
            limitations=limitations)
    rate = len(outside) / len(evaluable)
    worst = max(outside, key=lambda x: x.relative_exceedance or 0, default=None)
    sev = min(1.0, (worst.relative_exceedance or 0.0)) if worst else 0.0
    seasons_eval = {(by_id[x.reading_id].sample_year, by_id[x.reading_id].festival) for x in evaluable}
    seasons_out = {(by_id[x.reading_id].sample_year, by_id[x.reading_id].festival) for x in outside}
    rec = len(seasons_out) / len(seasons_eval)
    age = max(0, as_of_year - last_year)
    stale = min(1.0, age / STALENESS_YEARS_AT_MAX)
    raw = {"exceedance_rate": rate, "severity": sev, "recurrence": rec, "staleness": stale}
    labels = {
        "exceedance_rate": ("Share of readings outside limits",
                            f"{len(outside)} of {len(evaluable)} evaluable readings are outside the limit."),
        "severity": ("Severity of worst exceedance",
                     (f"Worst: {worst.parameter} {worst.observed_value:g} {worst.unit or ''} in {worst.sample_period} "
                      f"({worst.relative_exceedance:.0%} past the limit; capped at 100%).") if worst
                     else "No exceedances."),
        "recurrence": ("Recurrence across seasons",
                       f"Outside limits in {len(seasons_out)} of {len(seasons_eval)} seasons with evaluable data."),
        "staleness": ("Age of latest sample",
                      f"Latest sample is from {last_year}, {age} year(s) before {as_of_year}."),
    }
    factors = [FactorOut(name=k, label=labels[k][0], raw_value=round(raw[k], 4), max_points=WEIGHTS[k],
                         points=round(WEIGHTS[k] * raw[k], 2), explanation=labels[k][1]) for k in WEIGHTS]
    score = round(sum(f.points for f in factors), 1)
    reasons = [f.explanation for f in factors if f.points > 0 or f.name == "exceedance_rate"]
    reasons.append(f"Evaluated parameters: {', '.join(evaluated_params)} against CPCB class {cpcb_class}.")
    return RankedGhat(**base, priority_level=level_for(score), priority_score=score, factors=factors,
                      reasons=reasons, limitations=limitations)


def rank_ghats(db: Session, as_of: date | None = None, start_date: date | None = None, end_date: date | None = None,
               cpcb_class: str | None = None, ghat_ids: list[str] | None = None) -> RankedResponse:
    cls = crit.check_class(cpcb_class)
    as_of = as_of or datetime.now(timezone.utc).date()
    lo, hi = year_bounds(start_date, end_date, as_of)
    idx = crit.criteria_index(db, cls)
    seasons = all_seasons(db)
    items = []
    for g in resolve_ghats(db, ghat_ids):
        q = select(Reading).where(Reading.ghat_id == g.id)
        if lo is not None:
            q = q.where(Reading.sample_year >= lo)
        if hi is not None:
            q = q.where(Reading.sample_year <= hi)
        items.append(score_ghat(g, list(db.scalars(q)), idx, cls, as_of.year, seasons))
    order = {"high": 0, "review": 1, "routine": 2, "insufficient_data": 3}
    items.sort(key=lambda x: (order[x.priority_level], -(x.priority_score or 0), x.ghat_name))
    return RankedResponse(items=items, method=METHOD, cpcb_class=cls, intended_use=crit.intended_use(db, cls),
                          as_of=as_of, disclaimer=DISCLAIMER)
