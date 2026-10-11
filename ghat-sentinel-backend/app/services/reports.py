"""Structured evidence report (JSON, with CSV export). Observations, calculations, AI text and forecasts are
kept in separate fields."""
from __future__ import annotations

import csv
import io

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Reading, ReviewCase
from app.schemas.report import Report, ReportGhatSection, ReportRequest
from app.services import cases as case_svc
from app.services import criteria as crit
from app.services.analytics import reading_out, resolve_ghats
from app.services.common import GENERAL_LIMITATIONS, PHASE_ORDER, iso_now, season_key
from app.services.forecasting import get_oct20
from app.services.prioritization import METHOD, rank_ghats

CATEGORIES_NOTE = {
    "en": "Sections are separated by kind: 'readings' are observed measurements from MPPCB reports; 'comparisons', "
          "'priority' and 'calculations' are deterministic calculations; 'outlook' is an exploratory estimate or "
          "historical comparison (never an observation); 'ai_explanations' is empty because no AI text is included "
          "in this report; 'cases' are human-reviewed actions.",
    "hi": "खंड प्रकार के अनुसार अलग हैं: 'readings' MPPCB रिपोर्टों के प्रेक्षित माप हैं; 'comparisons', 'priority' और "
          "'calculations' निर्धारित गणनाएँ हैं; 'outlook' प्रारंभिक अनुमान या ऐतिहासिक तुलना है (प्रेक्षण नहीं); "
          "'ai_explanations' खाली है क्योंकि इस रिपोर्ट में AI पाठ शामिल नहीं है; 'cases' मानव-समीक्षित कार्रवाइयाँ हैं।",
}


def generate_report(db: Session, req: ReportRequest) -> Report:
    cls = crit.check_class(None)
    ghats = resolve_ghats(db, req.ghat_ids)
    idx = crit.criteria_index(db, cls)
    ranking = rank_ghats(db, start_date=req.start_date, end_date=req.end_date, cpcb_class=cls,
                         ghat_ids=[g.id for g in ghats])
    ranked = {r.ghat_id: r for r in ranking.items}
    lo = req.start_date.year if req.start_date else None
    hi = req.end_date.year if req.end_date else None
    sections = []
    for g in ghats:
        rows = [r for r in db.scalars(select(Reading).where(Reading.ghat_id == g.id))
                if (lo is None or r.sample_year >= lo) and (hi is None or r.sample_year <= hi)]
        rows.sort(key=lambda r: (season_key(r.sample_year, r.festival), r.parameter, PHASE_ORDER[r.phase]))
        comps = crit.evaluate_readings(rows, idx, cls)
        counts: dict[str, dict[str, int]] = {}
        for x in comps:
            c = counts.setdefault(x.parameter or "", {"within_criterion": 0, "outside_criterion": 0,
                                                       "insufficient_data": 0, "not_comparable": 0})
            c[x.result] += 1
        by_id = {x.reading_id: x for x in comps}
        cases = [case_svc.to_schema(c) for c in db.scalars(select(ReviewCase).where(ReviewCase.ghat_id == g.id))]
        sections.append(ReportGhatSection(
            ghat_id=g.id, ghat_name=g.name, water_body=g.water_body,
            readings=[reading_out(r, by_id[r.id]) for r in rows], comparisons=comps, priority=ranked[g.id],
            exceedance_counts_by_parameter=counts, cases=cases))
    outlook = None
    if len(ghats) == 1:
        outlook = get_oct20(db, ghats[0].id, None, None)
    elif ghats:
        outlook = get_oct20(db, None, None, None)
    history = ["Durga 'during immersion' history for the outlook is listed under outlook.historical_values."]
    generated = iso_now()
    return Report(
        title="Ghat Sentinel - Evidence Report" if req.language == "en" else "घाट सेंटिनल - साक्ष्य रिपोर्ट",
        generated_at=generated, language=req.language,
        selection={"ghat_ids": [g.id for g in ghats], "start_year": lo, "end_year": hi,
                   "cpcb_class": cls, "intended_use": crit.intended_use(db, cls)},
        categories_note=CATEGORIES_NOTE[req.language], criteria=[crit.criterion_out(c) for c in idx.values()],
        criteria_selection_note=(f"CPCB class {cls} ({crit.intended_use(db, cls)}) is the project's explicit choice "
                                 "for immersion ghats. Only parameters listed in that class are scored."),
        calculations=[
            "Each reading is compared with the class limit after unit normalisation (within / outside / "
            "insufficient_data / not_comparable); missing values are never treated as clean.",
            METHOD,
            "exceedance_counts_by_parameter tallies the comparison outcomes per parameter."],
        sections=sections, historical_context=history, outlook=outlook, ai_explanations=[],
        limitations=GENERAL_LIMITATIONS)


CSV_COLUMNS = ["generated_at", "ghat_id", "ghat_name", "parameter", "sample_year", "festival", "phase", "value",
               "unit", "flag", "source_file", "source_record_id", "source_page", "cpcb_class", "criterion_id",
               "operator", "threshold", "threshold_upper", "result", "reason", "priority_level", "priority_score"]


def to_csv(report: Report) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    for s in report.sections:
        for r in s.readings:
            x = r.evaluation
            w.writerow([report.generated_at, s.ghat_id, s.ghat_name, r.parameter, r.sample_year, r.festival, r.phase,
                        "" if r.value is None else r.value, r.unit or "", r.flag or "", r.source_file,
                        r.source_record_id, r.source_page or "", x.cpcb_class if x else "",
                        x.criterion_id if x and x.criterion_id else "", x.comparison_operator if x and x.comparison_operator else "",
                        "" if not x or x.threshold is None else x.threshold,
                        "" if not x or x.threshold_upper is None else x.threshold_upper,
                        x.result if x else "", x.reason if x else "", s.priority.priority_level,
                        "" if s.priority.priority_score is None else s.priority.priority_score])
    return buf.getvalue()
