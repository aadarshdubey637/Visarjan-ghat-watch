"""Cerebras Inference integration (OpenAI-compatible chat-completions endpoint) with strict output validation.

AI only *explains* evidence that the backend already retrieved/calculated. Every response is validated:
  * must be JSON {"answerable": bool, "content": str, "cited_ids": [str]}
  * every cited ID must belong to the evidence supplied for this request
  * every number in the text must appear in the supplied evidence (no invented measurements/thresholds)
  * every URL in the text must appear in the supplied evidence
Anything else is rejected and the caller falls back to deterministic template text.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

import httpx

from app.config import settings
from app.exceptions import AIUnavailableError
from app.schemas.common import EvidenceItem

log = logging.getLogger("ghat_sentinel.cerebras")

MAX_EVIDENCE_CHARS = 12_000
MAX_OUTPUT_CHARS = 4_000
_TRANSPORT: httpx.BaseTransport | None = None  # tests inject httpx.MockTransport here

SYSTEM_PROMPT = (
    "You are a careful assistant for Bhopal municipal officers and citizens. Use ONLY the evidence items provided "
    "by the user message. Rules: never invent numbers, thresholds, dates, ghat names, helplines, URLs, official "
    "orders or source references; do not calculate risk scores; do not say or imply that historical readings "
    "describe current conditions; do not claim health effects; recommendations must be review-oriented (verify a "
    "measurement, consider additional sampling) and never official directives; every factual statement must be "
    "supported by evidence items whose IDs you list in cited_ids. If the evidence cannot answer the request, say so "
    "plainly and set answerable=false. Output ONLY a JSON object: "
    '{"answerable": true|false, "content": "<text>", "cited_ids": ["<evidence id>", ...]}.'
)


class InvalidAIOutput(Exception):
    pass


@dataclass
class AIResult:
    content: str
    cited_ids: list[str]
    answerable: bool


def _client() -> httpx.Client:
    return httpx.Client(timeout=settings.CEREBRAS_TIMEOUT_SECONDS, transport=_TRANSPORT)


def chat_completion(system: str, user: str, max_tokens: int = 1200) -> str:
    """Call Cerebras and return the assistant message text. Raises AIUnavailableError with safe messages."""
    if not settings.ai_configured:
        raise AIUnavailableError("AI is not configured (CEREBRAS_API_KEY / CEREBRAS_MODEL missing).",
                                 code="AI_NOT_CONFIGURED")
    url = settings.CEREBRAS_BASE_URL.rstrip("/") + "/chat/completions"
    payload = {"model": settings.CEREBRAS_MODEL, "max_tokens": max_tokens, "temperature": 0.1,
               "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    try:
        with _client() as client:
            resp = client.post(url, json=payload, headers={"Authorization": f"Bearer {settings.CEREBRAS_API_KEY}"})
    except httpx.TimeoutException:
        raise AIUnavailableError("The AI service timed out.", code="AI_TIMEOUT") from None
    except httpx.HTTPError:
        raise AIUnavailableError("The AI service could not be reached.", code="AI_UPSTREAM_ERROR") from None
    if resp.status_code != 200:
        log.warning("Cerebras returned HTTP %s", resp.status_code)  # never log the key or the body
        raise AIUnavailableError(f"The AI service returned an error (HTTP {resp.status_code}).",
                                 code="AI_UPSTREAM_ERROR")
    try:
        return resp.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise AIUnavailableError("The AI service returned an unreadable response.", code="AI_BAD_RESPONSE") from None


# --------------------------------------------------------------------------- validation
_DEVANAGARI = str.maketrans("०१२३४५६७८९", "0123456789")
_NUM_RE = re.compile(r"\d+(?:\.\d+)?")
_URL_RE = re.compile(r"https?://[^\s)\]>\"']+")


def _numbers(text: str) -> set[str]:
    return {n.rstrip("0").rstrip(".") if "." in n else n for n in _NUM_RE.findall(text.translate(_DEVANAGARI))}


def parse_and_validate(raw: str, evidence: list[EvidenceItem]) -> AIResult:
    m = re.search(r"\{.*\}", raw or "", re.DOTALL)
    if not m:
        raise InvalidAIOutput("no JSON object in model output")
    try:
        obj = json.loads(m.group(0))
    except ValueError:
        raise InvalidAIOutput("model output is not valid JSON") from None
    if not isinstance(obj, dict):
        raise InvalidAIOutput("model output is not an object")
    content, cited, answerable = obj.get("content"), obj.get("cited_ids", []), obj.get("answerable", True)
    if not isinstance(content, str) or not content.strip():
        raise InvalidAIOutput("missing content")
    if len(content) > MAX_OUTPUT_CHARS:
        raise InvalidAIOutput("content too long")
    if not isinstance(cited, list) or not all(isinstance(c, str) for c in cited):
        raise InvalidAIOutput("cited_ids must be a list of strings")
    if not isinstance(answerable, bool):
        raise InvalidAIOutput("answerable must be boolean")
    allowed = {e.id for e in evidence}
    unknown = [c for c in cited if c not in allowed]
    if unknown:
        raise InvalidAIOutput(f"cited IDs not in supplied evidence: {unknown}")
    if answerable and evidence and not cited:
        raise InvalidAIOutput("answer cites no evidence")
    allowed_numbers = set()
    allowed_text = ""
    for e in evidence:
        blob = " ".join(str(x) for x in (e.id, e.text, e.value, e.sample_period, e.source_record_id, e.source_page,
                                         e.source_reference, e.source_file) if x is not None)
        allowed_numbers |= _numbers(blob)
        allowed_text += " " + blob
    extra = {n for n in _numbers(content) if n not in allowed_numbers and not (n.isdigit() and int(n) <= 10)}
    if extra:
        raise InvalidAIOutput(f"numbers not present in evidence: {sorted(extra)}")
    for url in _URL_RE.findall(content):
        if url.rstrip(".,") not in allowed_text:
            raise InvalidAIOutput("URL not present in evidence")
    return AIResult(content=content.strip(), cited_ids=cited, answerable=answerable)


def evidence_payload(evidence: list[EvidenceItem]) -> list[dict]:
    out, size = [], 0
    for e in evidence:
        item = {"id": e.id, "type": e.type, "text": e.text}
        size += len(json.dumps(item, ensure_ascii=False))
        if size > MAX_EVIDENCE_CHARS:
            break
        out.append(item)
    return out


def generate_grounded(task: str, language: str, evidence: list[EvidenceItem], question: str | None = None,
                      max_tokens: int = 1200) -> AIResult:
    payload = evidence_payload(evidence)
    kept = [e for e in evidence if e.id in {p["id"] for p in payload}]
    lang = {"hi": "Hindi (Devanagari script)", "en": "English", "bilingual": "Hindi first, then English"}[language]
    user = json.dumps({"task": task, "write_in": lang, "question": question, "evidence": payload},
                      ensure_ascii=False)
    raw = chat_completion(SYSTEM_PROMPT, user, max_tokens=max_tokens)
    return parse_and_validate(raw, kept)


def try_ai(use_ai: bool, require_ai: bool, task: str, language: str, evidence: list[EvidenceItem],
           question: str | None = None, max_len: int | None = None) -> tuple[AIResult | None, str | None]:
    """Returns (result, status). status explains why AI wording was not used. Never raises unless require_ai."""
    if not use_ai:
        return None, "AI wording not requested; deterministic template used."
    try:
        result = generate_grounded(task, language, evidence, question)
        if max_len and len(result.content) > max_len:
            raise InvalidAIOutput("content exceeds length limit")
        return result, None
    except AIUnavailableError as exc:
        if require_ai:
            raise
        return None, f"{exc.message} Deterministic template used instead."
    except InvalidAIOutput as exc:
        log.warning("AI output rejected: %s", exc)
        if require_ai:
            raise AIUnavailableError("The AI output failed evidence validation.", code="AI_INVALID_OUTPUT") from None
        return None, "AI output failed evidence validation and was discarded; deterministic template used."
