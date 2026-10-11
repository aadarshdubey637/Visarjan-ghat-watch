"""Citizen guide, official resources and grounded Q&A. Never presents historical data as live monitoring."""
from __future__ import annotations

import json
import re
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import RESOURCES_DIR
from app.models import Reading
from app.schemas.citizen import (CitizenGhat, CitizenGhats, CitizenQuestion, GuidanceItem, Guide, OfficialResource,
                                 Resources)
from app.schemas.common import AIResponse, EvidenceItem
from app.services import ai
from app.services import criteria as crit
from app.services.analytics import get_ghat
from app.services.briefs import LIMITATIONS_HI, PARAM_HI, build_pack, limit_text, period_label
from app.services.common import GENERAL_LIMITATIONS, iso_now, season_key
from app.services.prioritization import rank_ghats

GUIDE_DIR = RESOURCES_DIR / "public_guidance"
NO_LIVE = {
    "en": "No current (live) water-quality observations are available to this service. The latest records are "
          "historical MPPCB samples from {year}, so nothing here shows whether a ghat is safe today.",
    "hi": "इस सेवा के पास वर्तमान (लाइव) जल-गुणवत्ता अवलोकन उपलब्ध नहीं हैं। नवीनतम रिकॉर्ड {year} के MPPCB के "
          "ऐतिहासिक नमूने हैं, इसलिए यहाँ से यह नहीं कहा जा सकता कि आज कोई घाट सुरक्षित है।",
}
CURRENT_INTENT = re.compile(
    r"\b(safe|safety|today|now|current|currently|live|clean|polluted|right now|tonight)\b|सुरक्षित|आज|अभी|वर्तमान|साफ|प्रदूषित|लाइव",
    re.IGNORECASE)
RESOURCE_INTENT = re.compile(
    r"\b(official|resource|resources|link|links|website|report|reports|source|sources|where can i find|instructions)\b|आधिकारिक|लिंक|रिपोर्ट|स्रोत|निर्देश|वेबसाइट",
    re.IGNORECASE)
_TOKEN = re.compile(r"[\wऀ-ॿ]+")


@lru_cache
def _load(name: str) -> dict:
    return json.loads((GUIDE_DIR / name).read_text(encoding="utf-8"))


def get_guide(language: str) -> Guide:
    data = _load("guidance.json")
    items = [GuidanceItem(id=i["id"], title=i["title"][language], body=i["body"][language], category=i["category"],
                          approval_status=i["approval_status"], basis=i["basis"]) for i in data["items"]]
    return Guide(language=language, items=items, notice=data["approval_notice"][language])


def get_resources() -> Resources:
    data = _load("resources.json")
    return Resources(items=[OfficialResource(**i) for i in data["items"]], notice=data["notice"])


def _tokens(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN.findall(text)}


def match_guidance(question: str, k: int = 3) -> list[dict]:
    q = _tokens(question)
    scored = []
    for item in _load("guidance.json")["items"]:
        hits = len(q & {w.lower() for w in item["keywords"]})
        if hits:
            scored.append((hits, item))
    scored.sort(key=lambda s: (-s[0], s[1]["id"]))
    return [i for _, i in scored[:k]]


def citizen_ghats(db: Session) -> CitizenGhats:
    ranking = rank_ghats(db)  # only used for the reading-level evaluation counts
    idx = crit.criteria_index(db)
    out, latest_year = [], None
    for rk in ranking.items:
        g = get_ghat(db, rk.ghat_id)
        rows = list(db.scalars(select(Reading).where(Reading.ghat_id == g.id)))
        latest_year = max([y for y in [latest_year, rk.last_sample_year] if y is not None], default=None)
        summary: list[str] = []
        season = None
        if rows:
            best = max(season_key(r.sample_year, r.festival) for r in rows)
            season = f"{best[0]} " + next(r.festival for r in rows if season_key(r.sample_year, r.festival) == best)
            for r in sorted((r for r in rows if season_key(r.sample_year, r.festival) == best and r.phase == "during"),
                            key=lambda r: r.parameter):
                if r.parameter in idx and r.value is not None:
                    x = crit.evaluate(r, idx[r.parameter], "B")
                    unit = f" {r.unit}" if r.unit else ""
                    summary.append(f"{r.parameter} {r.value:g}{unit} during immersion ({season}); CPCB class B limit "
                                   f"{limit_text(x)} - {'outside' if x.result == 'outside_criterion' else 'within'} "
                                   "the limit.")
        n_eval = rk.evaluated_reading_count
        rate = round(len(rk.outside_reading_ids) / n_eval, 4) if n_eval else None
        hist = (f"In {n_eval} comparable past readings, {len(rk.outside_reading_ids)} ({round(rate * 100)}%) were "
                f"outside CPCB class B limits. This is a record of past samples, not a safety ranking."
                if rate is not None else "Too few comparable past readings for a historical comparison.")
        out.append(CitizenGhat(
            ghat_id=g.id, name=g.name, water_body=g.water_body, last_sample_year=rk.last_sample_year,
            last_sample_date=None, latest_season=season, latest_season_summary=summary, historical_comparison=hist,
            evaluated_reading_count=n_eval, historical_exceedance_rate=rate,
            limitations=GENERAL_LIMITATIONS[:3]))
    out.sort(key=lambda c: c.name)
    return CitizenGhats(items=out, current_conditions_available=False,
                        notice=NO_LIVE["en"].format(year=latest_year or "unknown"))


def _guidance_evidence(item: dict, lang: str) -> EvidenceItem:
    return EvidenceItem(id=f"guide:{item['id']}", type="guidance", source_reference=item["basis"],
                        text=f"{item['title'][lang]}: {item['body'][lang]} (status: {item['approval_status']})")


def _resource_evidence(item: dict) -> EvidenceItem:
    org = item["issuing_organization"] or "issuer not stated"
    return EvidenceItem(id=f"res:{item['id']}", type="resource", source_reference=item["url"],
                        text=f"{item['title']} ({org}). {item['description']} URL: {item['url']}")


def answer_question(db: Session, req: CitizenQuestion) -> AIResponse:
    lang = req.language
    ghat = get_ghat(db, req.ghat_id) if req.ghat_id else None
    wants_current = bool(CURRENT_INTENT.search(req.question))
    wants_resources = bool(RESOURCE_INTENT.search(req.question))
    matched = match_guidance(req.question)
    resources = _load("resources.json")["items"]
    evidence: list[EvidenceItem] = [_guidance_evidence(i, lang) for i in matched]
    if wants_resources or not matched:
        evidence += [_resource_evidence(r) for r in resources if r["resource_type"] in ("standard", "monitoring_report")][:3]
    pack = None
    if ghat is not None:
        pack = build_pack(db, [ghat.id], per_ghat=2)
        evidence += [e for e in pack.evidence if e.type == "observation" or e.id.startswith("calc:")][:8]
    years = [r.sample_year for r in db.scalars(select(Reading).limit(5000))]
    latest_year = max(years) if years else None
    limitations = list(GENERAL_LIMITATIONS[:3] if lang == "en" else LIMITATIONS_HI[:3])
    if wants_current or ghat is not None:
        limitations.insert(0, NO_LIVE[lang].format(year=latest_year or "unknown"))
    if not matched and ghat is None:
        limitations.append("The approved guidance does not cover this question; see the official resources listed."
                           if lang == "en" else "स्वीकृत मार्गदर्शन इस प्रश्न को कवर नहीं करता; सूचीबद्ध आधिकारिक संसाधन देखें।")

    # deterministic answer first
    parts: list[str] = []
    if wants_current:
        parts.append(NO_LIVE[lang].format(year=latest_year or "unknown"))
    for item in matched:
        parts.append(f"{item['title'][lang]}: {item['body'][lang]}")
    if pack is not None and ghat is not None:
        for f in pack.findings:
            for r, x in f.items[:2]:
                unit = f" {r.unit}" if r.unit else ""
                name = PARAM_HI.get(r.parameter, r.parameter) if lang == "hi" else r.parameter
                parts.append(f"{f.ghat.name}: {name} {r.value:g}{unit} ({period_label(r, lang)}), "
                             f"{'CPCB B limit' if lang == 'en' else 'CPCB B सीमा'} {limit_text(x)}.")
    if not matched and not wants_current:
        parts.append("I could not find this in the approved guidance, so I cannot answer it reliably. Please check the "
                     "official resources below." if lang == "en" else
                     "यह जानकारी स्वीकृत मार्गदर्शन में नहीं मिली, इसलिए मैं विश्वसनीय उत्तर नहीं दे सकता। कृपया नीचे दिए गए आधिकारिक संसाधन देखें।")
    if wants_resources or not matched:
        for r in resources:
            if r["resource_type"] in ("standard", "monitoring_report"):
                parts.append(f"{r['title']}: {r['url']}")
                if len(parts) > 12:
                    break
    answer = "\n\n".join(parts)
    mode, status = "template", None
    result, status = ai.try_ai(
        req.use_ai, req.require_ai,
        "Answer the citizen's question using only the evidence. If the question asks about current water safety, state "
        "that no current observations are available. Do not invent sites, timings, permissions or helplines.",
        lang, evidence, question=req.question)
    if result:
        mode, answer = "ai", result.content
        if not result.answerable:
            limitations.append("The evidence did not fully answer the question." if lang == "en" else
                               "उपलब्ध साक्ष्य प्रश्न का पूर्ण उत्तर नहीं देते।")
    return AIResponse(answer=answer, language=lang, evidence=evidence, limitations=limitations,
                      generated_at=iso_now(), generation_mode=mode, ai_status=status)
