"""Evidence-first municipal briefs and WhatsApp messages (English / Hindi).

Order of operations (analytics first, AI second):
  1. retrieve readings and run the deterministic criteria + priority engines  -> EvidencePack
  2. render a deterministic template brief from the pack (always available)
  3. optionally ask Cerebras to re-word it from the SAME evidence; validate; else keep the template
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Brief, Ghat, Reading
from app.schemas.brief import BriefRequest, BriefResponse, WhatsAppRequest, WhatsAppResponse
from app.schemas.common import EvidenceItem
from app.schemas.ghat import RankedGhat
from app.schemas.reading import ComparisonResult
from app.services import cerebras
from app.services import criteria as crit
from app.services.analytics import resolve_ghats
from app.services.common import GENERAL_LIMITATIONS, PHASE_LABEL_EN, PHASE_LABEL_HI, iso_now, utcnow
from app.services.prioritization import rank_ghats

PER_GHAT_READINGS = 4
WHATSAPP_MAX_CHARS = 3500
FESTIVAL_HI = {"Ganesh": "गणेश", "Durga": "दुर्गा"}
PARAM_HI = {"Dissolved oxygen": "घुलित ऑक्सीजन (Dissolved oxygen)", "BOD": "BOD (जैव रासायनिक ऑक्सीजन मांग)",
            "pH": "pH"}
LEVEL = {
    "en": {"high": "HIGH", "review": "REVIEW", "routine": "ROUTINE", "insufficient_data": "INSUFFICIENT DATA"},
    "hi": {"high": "उच्च", "review": "समीक्षा", "routine": "सामान्य", "insufficient_data": "अपर्याप्त डेटा"},
}
LIMITATIONS_HI = [
    "डेटा MPPCB के पिछले विसर्जन-मौसम के नमूने (2023-2025) हैं; ये वर्तमान स्थिति नहीं बताते।",
    "स्रोत में सटीक नमूना-तिथि नहीं है; केवल वर्ष, त्योहार और चरण (पहले/दौरान/बाद) दिए गए हैं।",
    "इकाइयाँ डेटा-संकलकों द्वारा मानी गई हैं; मूल रिपोर्टों में इकाइयाँ छपी नहीं हैं।",
    "खाली/'not sampled' मान का अर्थ अनुपलब्ध है, साफ नहीं। BDL का अर्थ पहचान-सीमा से नीचे है, शून्य नहीं।",
    "प्राथमिकता परियोजना द्वारा परिभाषित समीक्षा-अनुमान है, आधिकारिक CPCB वर्गीकरण नहीं।",
]


@dataclass
class Finding:
    ghat: Ghat
    ranked: RankedGhat
    items: list[tuple[Reading, ComparisonResult]]


@dataclass
class Pack:
    findings: list[Finding]
    evidence: list[EvidenceItem]
    limitations: list[str]
    cpcb_class: str
    intended_use: str | None
    criteria_text: str
    years: str
    extra_notes: list[str] = field(default_factory=list)


def limit_text(r: ComparisonResult | None, c_op: str | None = None, lang: str = "en") -> str:
    if r is None or r.comparison_operator is None:
        return "-"
    op, t, u, unit = r.comparison_operator, r.threshold, r.threshold_upper, (f" {r.unit}" if r.unit else "")
    if op.startswith("between"):
        return f"{t:g}-{u:g}{unit}"
    sym = {"<": "<", "<=": "≤", ">": ">", ">=": "≥"}[op]
    return f"{sym} {t:g}{unit}"


def period_label(r: Reading, lang: str) -> str:
    if lang == "hi":
        return f"{r.sample_year} {FESTIVAL_HI.get(r.festival, r.festival)} ({PHASE_LABEL_HI[r.phase]})"
    return f"{r.sample_year} {r.festival} ({PHASE_LABEL_EN[r.phase]})"


def _obs_evidence(g: Ghat, r: Reading, res: ComparisonResult) -> EvidenceItem:
    unit = f" {r.unit}" if r.unit else ""
    val = f"{r.value:g}{unit}" if r.value is not None else "no numeric value"
    page = f", PDF page {r.source_page}" if r.source_page else ""
    verdict = {"outside_criterion": "outside the limit", "within_criterion": "within the limit",
               "insufficient_data": "not comparable (missing)", "not_comparable": "not comparable"}[res.result]
    return EvidenceItem(
        id=r.id, type="observation", ghat_id=g.id, ghat_name=g.name, parameter=r.parameter, value=r.value,
        unit=r.unit, sample_period=f"{r.sample_year} {r.festival} ({r.phase})", source_file=r.source_file,
        source_record_id=r.source_record_id, source_page=r.source_page, source_reference=res.source_reference,
        text=(f"{g.name}: {r.parameter} {val}, {r.sample_year} {r.festival} ({PHASE_LABEL_EN[r.phase]}); "
              f"CPCB class {res.cpcb_class} limit {limit_text(res)}; {verdict}. "
              f"Source: {r.source_file} row {r.source_record_id}{page}."))


def build_pack(db: Session, ghat_ids: list[str] | None, start_date: date | None = None, end_date: date | None = None,
               cpcb_class: str | None = None, per_ghat: int = PER_GHAT_READINGS) -> Pack:
    cls = crit.check_class(cpcb_class)
    ghats = resolve_ghats(db, ghat_ids)
    ranking = rank_ghats(db, start_date=start_date, end_date=end_date, cpcb_class=cls, ghat_ids=[g.id for g in ghats])
    idx = crit.criteria_index(db, cls)
    by_ghat = {g.id: g for g in ghats}
    findings: list[Finding] = []
    evidence: list[EvidenceItem] = []
    crit_parts = []
    for p, c in sorted(idx.items()):
        probe = ComparisonResult(reading_id="", criterion_id=c.id, result="within_criterion", observed_value=None,
                                 unit=c.unit, threshold=c.threshold, comparison_operator=c.comparison_operator,
                                 source_reference=c.source_reference, reason="", threshold_upper=c.threshold_upper)
        crit_parts.append(f"{p} {limit_text(probe)}")
    intended = crit.intended_use(db, cls)
    criteria_text = (f"CPCB class {cls} ({intended}) limits applied: " + "; ".join(crit_parts) +
                     ". Parameters without a class limit are not scored.")
    evidence.append(EvidenceItem(id="calc:criteria", type="calculation", text=criteria_text,
                                 source_reference=next((c.source_reference for c in idx.values()), None)))
    all_years: list[int] = []
    for rk in ranking.items:
        g = by_ghat[rk.ghat_id]
        rows = list(db.scalars(select(Reading).where(Reading.ghat_id == g.id)))
        lo, hi = (start_date.year if start_date else None), (end_date.year if end_date else None)
        rows = [r for r in rows if (lo is None or r.sample_year >= lo) and (hi is None or r.sample_year <= hi)]
        all_years += [r.sample_year for r in rows]
        res = {r.id: crit.evaluate(r, idx.get(r.parameter), cls) for r in rows}
        by_sev = sorted((r for r in rows if res[r.id].result == "outside_criterion"),
                        key=lambda r: (-(res[r.id].relative_exceedance or 0), r.id))
        # worst reading of each parameter first (variety), then the next most severe overall
        first_per_param = list({r.parameter: r for r in reversed(by_sev)}.values())
        first_per_param.sort(key=lambda r: (-(res[r.id].relative_exceedance or 0), r.id))
        outs = (first_per_param + [r for r in by_sev if r not in first_per_param])[:per_ghat]
        if not outs:
            ok = sorted((r for r in rows if res[r.id].result == "within_criterion"),
                        key=lambda r: (-r.sample_year, r.id))[:3]
            outs = ok
        items = [(r, res[r.id]) for r in outs]
        findings.append(Finding(g, rk, items))
        factor_txt = "; ".join(f"{f.name} {f.points:g}/{f.max_points:g}" for f in rk.factors) or "not computed"
        score_txt = f"score {rk.priority_score:g}/100" if rk.priority_score is not None else "no score"
        evidence.append(EvidenceItem(
            id=f"calc:{g.id}:priority", type="calculation", ghat_id=g.id, ghat_name=g.name,
            text=(f"{g.name}: review priority {rk.priority_level} ({score_txt}; project-defined heuristic, CPCB class "
                  f"{cls}). {rk.evaluated_reading_count} readings evaluated, {len(rk.outside_reading_ids)} outside "
                  f"limits. Factors: {factor_txt}. Latest sample year {rk.last_sample_year}.")))
        evidence += [_obs_evidence(g, r, x) for r, x in items]
    years = f"{min(all_years)}-{max(all_years)}" if all_years else "no data"
    return Pack(findings=findings, evidence=evidence, limitations=list(GENERAL_LIMITATIONS), cpcb_class=cls,
                intended_use=intended, criteria_text=criteria_text, years=years)


# --------------------------------------------------------------------------- template rendering
def _action(lang: str, f: Finding) -> str:
    worst = f.items[0] if f.items and f.items[0][1].result == "outside_criterion" else None
    lvl = f.ranked.priority_level
    if lvl == "insufficient_data":
        return ("Consider additional sampling; current evidence is insufficient for a priority."
                if lang == "en" else "अतिरिक्त नमूना लेने पर विचार करें; वर्तमान साक्ष्य प्राथमिकता तय करने के लिए अपर्याप्त है।")
    if worst:
        r, _ = worst
        page = f" (PDF p.{r.source_page})" if r.source_page else ""
        if lang == "en":
            return (f"Verify the recorded {r.parameter} measurement against the MPPCB report{page} and consider "
                    "fresh sampling before immersion.")
        return (f"MPPCB रिपोर्ट{page} से {PARAM_HI.get(r.parameter, r.parameter)} का दर्ज मान सत्यापित करें और "
                "विसर्जन से पहले नया नमूना लेने पर विचार करें।")
    return ("Include in the routine sampling schedule and re-verify the latest values."
            if lang == "en" else "नियमित नमूना-कार्यक्रम में शामिल रखें और नवीनतम मानों का पुनः सत्यापन करें।")


def _reading_line(r: Reading, x: ComparisonResult, lang: str, with_src: bool) -> str:
    unit = f" {r.unit}" if r.unit else ""
    name = PARAM_HI.get(r.parameter, r.parameter) if lang == "hi" else r.parameter
    verdict = {"outside_criterion": ("outside", "सीमा से बाहर"), "within_criterion": ("within", "सीमा के भीतर")}.get(
        x.result, ("n/a", "लागू नहीं"))[0 if lang == "en" else 1]
    lbl = "limit" if lang == "en" else "सीमा"
    src = ""
    if with_src:
        src = f" [{r.id}" + (f"; PDF p.{r.source_page}" if r.source_page else "") + "]"
    return f"{name} {r.value:g}{unit}, {period_label(r, lang)}: {lbl} {limit_text(x)} → {verdict}{src}"


def _why(lang: str, f: Finding) -> str:
    rk = f.ranked
    if rk.priority_level == "insufficient_data":
        return rk.reasons[0] if lang == "en" else (
            f"केवल {rk.evaluated_reading_count} पठन CPCB सीमा से तुलना योग्य हैं; वर्गीकरण के लिए साक्ष्य अपर्याप्त।")
    n_out, n_eval = len(rk.outside_reading_ids), rk.evaluated_reading_count
    pct = round(100 * n_out / n_eval) if n_eval else 0
    if lang == "en":
        return (f"{n_out} of {n_eval} comparable readings ({pct}%) are outside CPCB class {rk.cpcb_class} limits "
                f"(score {rk.priority_score:g}/100); latest sample year {rk.last_sample_year}.")
    return (f"{n_eval} तुलना-योग्य पठनों में से {n_out} ({pct}%) CPCB वर्ग {rk.cpcb_class} की सीमा से बाहर हैं "
            f"(स्कोर {rk.priority_score:g}/100); नवीनतम नमूना वर्ष {rk.last_sample_year}।")


def render_municipal(pack: Pack, lang: str, generated_at: str) -> tuple[str, str]:
    en = lang == "en"
    title = "Ghat Sentinel - Municipal Review Brief" if en else "घाट सेंटिनल - नगर निगम समीक्षा सारांश"
    L = [title, (f"Generated: {generated_at}" if en else f"तैयार किया गया: {generated_at}"),
         (f"Scope: {len(pack.findings)} ghat(s). Data: MPPCB immersion-season samples {pack.years} "
          "(historical, not live monitoring)." if en else
          f"दायरा: {len(pack.findings)} घाट। डेटा: MPPCB विसर्जन-मौसम नमूने {pack.years} (ऐतिहासिक, लाइव निगरानी नहीं)।"),
         pack.criteria_text if en else f"लागू मानक: CPCB वर्ग {pack.cpcb_class} ({pack.intended_use}); पठन-सीमाएँ नीचे दर्शाई गई हैं।", ""]
    for i, f in enumerate(pack.findings, 1):
        lvl = LEVEL[lang][f.ranked.priority_level]
        wb = f" ({f.ghat.water_body})" if f.ghat.water_body else ""
        L.append(f"{i}. {f.ghat.name}{wb} - " + (f"Priority: {lvl}" if en else f"प्राथमिकता: {lvl}"))
        L.append(("   Why: " if en else "   कारण: ") + _why(lang, f))
        if f.items:
            L.append("   " + ("Key readings:" if en else "मुख्य पठन:"))
            L += ["   - " + _reading_line(r, x, lang, True) for r, x in f.items]
        L.append(("   Suggested verification step: " if en else "   सुझाया गया सत्यापन-चरण: ") + _action(lang, f))
        L.append("")
    L.append("Limitations:" if en else "सीमाएँ:")
    L += ["- " + t for t in (pack.limitations if en else LIMITATIONS_HI)]
    L.append("Sources: bhopal_ghats_2023_2025.csv (from MPPCB reports); CPCB water quality criteria." if en else
             "स्रोत: bhopal_ghats_2023_2025.csv (MPPCB रिपोर्टों से); CPCB जल-गुणवत्ता मानक।")
    return title, "\n".join(L)


def _wa_block(pack: Pack, lang: str, include_actions: bool) -> str:
    en = lang == "en"
    L = ["*Ghat Sentinel - review summary*" if en else "*घाट सेंटिनल - समीक्षा सारांश*",
         (f"Historical MPPCB samples {pack.years}; NOT current conditions. CPCB class {pack.cpcb_class} limits."
          if en else f"MPPCB के ऐतिहासिक नमूने {pack.years}; वर्तमान स्थिति नहीं। CPCB वर्ग {pack.cpcb_class} सीमाएँ।"), ""]
    for f in pack.findings:
        L.append(f"*{f.ghat.name}* - " + (f"priority {LEVEL[lang][f.ranked.priority_level]}"
                                          if en else f"प्राथमिकता {LEVEL[lang][f.ranked.priority_level]}"))
        L.append(("Reason: " if en else "कारण: ") + _why(lang, f))
        L += ["• " + _reading_line(r, x, lang, False) for r, x in f.items[:2]]
        if include_actions:
            L.append(("Next step: " if en else "अगला कदम: ") + _action(lang, f))
        L.append("")
    L.append("Limits: past samples, no exact dates, units assumed, blank = not sampled. Review heuristic, not an official order."
             if en else "सीमाएँ: पुराने नमूने, सटीक तिथि नहीं, इकाइयाँ अनुमानित, खाली = नमूना नहीं। यह समीक्षा-अनुमान है, आधिकारिक आदेश नहीं।")
    L.append("Source: MPPCB reports via bhopal_ghats_2023_2025.csv" if en else "स्रोत: MPPCB रिपोर्ट (bhopal_ghats_2023_2025.csv)")
    return "\n".join(L)


def render_whatsapp(pack: Pack, lang: str, include_actions: bool) -> str:
    if lang == "bilingual":
        return _wa_block(pack, "hi", include_actions) + "\n\n----------\n\n" + _wa_block(pack, "en", include_actions)
    return _wa_block(pack, lang, include_actions)


# --------------------------------------------------------------------------- orchestration
def _persist(db: Session, kind: str, language: str, ghat_ids: list[str], title: str | None, content: str, mode: str,
             generated_at: str, evidence: list[EvidenceItem], limitations: list[str]) -> str:
    bid = f"brief_{uuid.uuid4().hex[:10]}"
    try:
        db.add(Brief(id=bid, kind=kind, language=language, ghat_ids=ghat_ids, title=title, content=content,
                     generation_mode=mode, generated_at=utcnow(), evidence=[e.model_dump() for e in evidence],
                     limitations=limitations))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return bid


def generate_municipal_brief(db: Session, req: BriefRequest) -> BriefResponse:
    pack = build_pack(db, req.ghat_ids, req.start_date, req.end_date)
    generated_at = iso_now()
    title, content = render_municipal(pack, req.language, generated_at)
    mode, status = "template", None
    result, status = cerebras.try_ai(
        req.use_ai, req.require_ai,
        "Write a concise municipal review brief for a Bhopal municipal officer: one short section per ghat with its "
        "review priority and the reason, the key readings with units and sampling periods, the applicable limits, "
        "and one review-oriented verification step per ghat; finish with limitations. Cite evidence IDs.",
        req.language, pack.evidence)
    limitations = list(pack.limitations if req.language == "en" else LIMITATIONS_HI)
    if result:
        mode, content = "ai", result.content
        limitations.append("Wording of this brief was produced by an AI model from the supplied evidence and "
                           "validated against it; the facts, limits and priorities come from deterministic calculations."
                           if req.language == "en" else
                           "इस सारांश की भाषा AI मॉडल ने दिए गए साक्ष्य से तैयार की; तथ्य, सीमाएँ और प्राथमिकताएँ निर्धारित गणनाओं से हैं।")
    bid = _persist(db, "municipal", req.language, [f.ghat.id for f in pack.findings], title, content, mode,
                   generated_at, pack.evidence, limitations)
    return BriefResponse(title=title, content=content, language=req.language, generated_at=generated_at,
                         evidence=pack.evidence, limitations=limitations, generation_mode=mode, ai_status=status,
                         brief_id=bid)


def generate_whatsapp_brief(db: Session, req: WhatsAppRequest) -> WhatsAppResponse:
    pack = build_pack(db, req.ghat_ids, per_ghat=2)
    generated_at = iso_now()
    content = render_whatsapp(pack, req.language, req.include_actions)
    mode = "template"
    result, status = cerebras.try_ai(
        req.use_ai, req.require_ai,
        "Write a compact WhatsApp message (plain text, mobile-readable, under 1500 characters per language) for a "
        "municipal officer to forward. For each ghat give: name, priority and its reason, actual values WITH units and "
        "sampling periods, and " + ("one review-oriented verification step. " if req.include_actions else "no actions. ")
        + "End with a one-line limitation. Cite evidence IDs.",
        req.language, pack.evidence, max_len=WHATSAPP_MAX_CHARS)
    if result:
        mode, content = "ai", result.content
    limitations = list(LIMITATIONS_HI if req.language == "hi" else pack.limitations)
    bid = _persist(db, "whatsapp", req.language, [f.ghat.id for f in pack.findings], None, content, mode,
                   generated_at, pack.evidence, limitations)
    return WhatsAppResponse(content=content, language=req.language, evidence=pack.evidence, limitations=limitations,
                            generated_at=generated_at, generation_mode=mode, ai_status=status, brief_id=bid)
