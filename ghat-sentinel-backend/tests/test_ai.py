"""AI layer tests. The Anthropic client is always faked: no network, no real key."""
import json
from types import SimpleNamespace as NS

import anthropic
import httpx
import pytest

from app.config import settings
from app.exceptions import AIUnavailableError
from app.schemas.common import EvidenceItem
from app.services import ai
from tests.conftest import GHAT_A, GHAT_C, P

EVIDENCE = [
    EvidenceItem(id="bhopal-00001", type="observation", text="Test Ghat A: Dissolved oxygen 2 mg/l, 2022 Durga "
                 "(during); CPCB class B limit ≥ 5 mg/l; outside the limit.", value=2.0, unit="mg/l"),
    EvidenceItem(id="calc:criteria", type="calculation", text="CPCB class B limits: Dissolved oxygen ≥ 5 mg/l."),
]


def good(**over):
    obj = {"answerable": True, "content": "Dissolved oxygen was 2 mg/l against a limit of 5 mg/l.",
           "cited_ids": ["bhopal-00001", "calc:criteria"]}
    obj.update(over)
    return json.dumps(obj)


def fake_client(text=None, stop_reason="end_turn", raises=None):
    def create(**kwargs):
        if raises:
            raise raises
        return NS(stop_reason=stop_reason, content=[NS(type="text", text=text or "")])
    return NS(messages=NS(create=create))


def req():
    return httpx.Request("POST", "https://api.anthropic.com/v1/messages")


# ---- output validation --------------------------------------------------------------------------
def test_valid_output_accepted():
    r = ai.parse_and_validate(good(), EVIDENCE)
    assert r.answerable and r.cited_ids == ["bhopal-00001", "calc:criteria"]


def test_json_wrapped_in_prose_is_extracted():
    assert ai.parse_and_validate("Here you go:\n" + good() + "\nThanks", EVIDENCE).content


@pytest.mark.parametrize("raw", [
    "not json at all",
    good(cited_ids=["bhopal-99999"]),            # cites unknown evidence
    good(cited_ids=[]),                          # answers without citations
    good(content="Dissolved oxygen was 7.5 mg/l."),   # invented measurement
    good(content="See https://invented.example/helpline"),  # invented URL
    good(content=""),
    good(answerable="yes"),
    json.dumps(["a list"]),
])
def test_invalid_output_rejected(raw):
    with pytest.raises(ai.InvalidAIOutput):
        ai.parse_and_validate(raw, EVIDENCE)


def test_unanswerable_without_citations_is_allowed():
    r = ai.parse_and_validate(good(answerable=False, cited_ids=[], content="The evidence cannot answer this."),
                              EVIDENCE)
    assert r.answerable is False


def test_devanagari_digits_are_checked_too():
    with pytest.raises(ai.InvalidAIOutput):
        ai.parse_and_validate(good(content="ऑक्सीजन ९९ mg/l थी"), EVIDENCE)


# ---- client behaviour -----------------------------------------------------------------------------
def test_missing_credentials_handled(client):
    with pytest.raises(AIUnavailableError) as e:
        ai.chat_completion("s", "u")
    assert e.value.code == "AI_NOT_CONFIGURED"
    j = client.post(f"{P}/brief/generate", json={"ghat_ids": [GHAT_A]}).json()
    assert j["generation_mode"] == "template" and "not configured" in j["ai_status"]


def test_chat_completion_success_and_request_shape(ai_on, monkeypatch):
    seen = {}

    def create(**kw):
        seen.update(kw)
        return NS(stop_reason="end_turn", content=[NS(type="thinking", text="x"), NS(type="text", text="hello")])

    monkeypatch.setattr(ai, "make_client", lambda: NS(messages=NS(create=create)))
    assert ai.chat_completion("sys", "usr") == "hello"
    assert seen["model"] == "test-model" and seen["system"] == "sys" and seen["messages"][0]["role"] == "user"
    assert "temperature" not in seen  # sampling params are rejected by newer models


@pytest.mark.parametrize("exc,code", [
    (anthropic.APITimeoutError(request=req()), "AI_TIMEOUT"),
    (anthropic.APIConnectionError(request=req()), "AI_UPSTREAM_ERROR"),
    (anthropic.APIStatusError("boom sk-ant-secret", response=httpx.Response(500, request=req()), body=None),
     "AI_UPSTREAM_ERROR"),
    (RuntimeError("weird"), "AI_UPSTREAM_ERROR"),
])
def test_upstream_failures_are_controlled_and_leak_nothing(ai_on, monkeypatch, exc, code):
    monkeypatch.setattr(ai, "make_client", lambda: fake_client(raises=exc))
    with pytest.raises(AIUnavailableError) as e:
        ai.chat_completion("s", "u")
    assert e.value.code == code and "secret" not in e.value.message and "test-key" not in e.value.message


@pytest.mark.parametrize("stop,code", [("refusal", "AI_REFUSED"), ("max_tokens", "AI_BAD_RESPONSE")])
def test_refusal_and_truncation(ai_on, monkeypatch, stop, code):
    monkeypatch.setattr(ai, "make_client", lambda: fake_client(text="x", stop_reason=stop))
    with pytest.raises(AIUnavailableError) as e:
        ai.chat_completion("s", "u")
    assert e.value.code == code


# ---- end-to-end through the API (chat_completion patched) -------------------------------------------
def pack_ids(client, **body):
    ev = client.post(f"{P}/brief/generate", json={"ghat_ids": [GHAT_A], "use_ai": False, **body}).json()["evidence"]
    return [e["id"] for e in ev]


def test_ai_brief_used_when_valid(client, ai_on, monkeypatch):
    ids = pack_ids(client)
    monkeypatch.setattr(ai, "chat_completion", lambda s, u, max_tokens=0: json.dumps(
        {"answerable": True, "content": "Test Ghat A needs verification; see evidence.", "cited_ids": ids[:2]}))
    j = client.post(f"{P}/brief/generate", json={"ghat_ids": [GHAT_A]}).json()
    assert j["generation_mode"] == "ai" and j["ai_status"] is None and "needs verification" in j["content"]
    assert any("AI model" in x for x in j["limitations"]) and j["evidence"]


def test_payload_sent_to_model_contains_only_evidence(client, ai_on, monkeypatch):
    captured = {}

    def fake(system, user, max_tokens=0):
        captured["user"] = json.loads(user)
        return "garbage"

    monkeypatch.setattr(ai, "chat_completion", fake)
    client.post(f"{P}/brief/generate", json={"ghat_ids": [GHAT_A], "language": "hi"})
    assert captured["user"]["evidence"] and "Hindi" in captured["user"]["write_in"]
    assert all(set(e) == {"id", "type", "text"} for e in captured["user"]["evidence"])


def test_invalid_ai_output_falls_back_to_template(client, ai_on, monkeypatch):
    monkeypatch.setattr(ai, "chat_completion", lambda s, u, max_tokens=0: good(content="Oxygen was 99.9 mg/l"))
    r = client.post(f"{P}/brief/generate", json={"ghat_ids": [GHAT_A]})
    j = r.json()
    assert r.status_code == 200 and j["generation_mode"] == "template" and "failed evidence validation" in j["ai_status"]
    assert "Priority:" in j["content"]


def test_require_ai_returns_503(client, ai_on, monkeypatch):
    monkeypatch.setattr(ai, "chat_completion", lambda s, u, max_tokens=0: "garbage")
    r = client.post(f"{P}/brief/generate", json={"ghat_ids": [GHAT_A], "require_ai": True})
    assert r.status_code == 503 and r.json()["error"]["code"] == "AI_INVALID_OUTPUT"
    r = client.post(f"{P}/brief/whatsapp", json={"ghat_ids": [GHAT_A], "require_ai": True})
    assert r.status_code == 503


def test_timeout_does_not_crash_and_deterministic_api_keeps_working(client, ai_on, monkeypatch):
    def boom(system, user, max_tokens=0):
        raise AIUnavailableError("The AI service timed out.", code="AI_TIMEOUT")

    monkeypatch.setattr(ai, "chat_completion", boom)
    j = client.post(f"{P}/citizen/ask", json={"question": "How to reduce pollution during visarjan?"}).json()
    assert j["generation_mode"] == "template" and "timed out" in j["ai_status"] and j["answer"]
    assert client.post(f"{P}/citizen/ask", json={"question": "How to reduce pollution?", "require_ai": True}
                       ).status_code == 503
    assert client.get(f"{P}/ghats/ranked").status_code == 200
    assert client.get(f"{P}/predict/oct20").status_code == 200
    assert client.get(f"{P}/health").json()["ai_configured"] is True


def test_citizen_ai_answer_must_cite_supplied_evidence(client, ai_on, monkeypatch):
    monkeypatch.setattr(ai, "chat_completion", lambda s, u, max_tokens=0: json.dumps(
        {"answerable": True, "content": "Use clay idols.", "cited_ids": ["guide:invented"]}))
    j = client.post(f"{P}/citizen/ask", json={"question": "Which idols should I choose? clay or plaster"}).json()
    assert j["generation_mode"] == "template"
    monkeypatch.setattr(ai, "chat_completion", lambda s, u, max_tokens=0: json.dumps(
        {"answerable": True, "content": "Prefer natural clay idols.", "cited_ids": ["guide:clay_idols"]}))
    j = client.post(f"{P}/citizen/ask", json={"question": "Which idols should I choose? clay or plaster"}).json()
    assert j["generation_mode"] == "ai" and j["answer"] == "Prefer natural clay idols."


def test_unsupported_question_discloses_uncertainty_with_ai(client, ai_on, monkeypatch):
    monkeypatch.setattr(ai, "chat_completion", lambda s, u, max_tokens=0: json.dumps(
        {"answerable": False, "content": "The available guidance does not cover this.", "cited_ids": []}))
    j = client.post(f"{P}/citizen/ask", json={"question": "What is the capital of France?"}).json()
    assert j["generation_mode"] == "ai"
    assert any("did not fully answer" in x or "does not cover" in x for x in j["limitations"])


def test_whatsapp_ai_length_guard(client, ai_on, monkeypatch):
    ids = pack_ids(client)
    long = json.dumps({"answerable": True, "content": "word " * 1000, "cited_ids": ids[:1]})
    monkeypatch.setattr(ai, "chat_completion", lambda s, u, max_tokens=0: long)
    j = client.post(f"{P}/brief/whatsapp", json={"ghat_ids": [GHAT_C], "language": "en"}).json()
    assert j["generation_mode"] == "template"


def test_ai_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "AI_RATE_LIMIT_PER_MINUTE", 2)
    codes = [client.post(f"{P}/brief/generate", json={"use_ai": False}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    assert client.post(f"{P}/brief/generate", json={}).json()["error"]["code"] == "RATE_LIMITED"
    assert client.get(f"{P}/ghats").status_code == 200  # non-AI routes are not limited
