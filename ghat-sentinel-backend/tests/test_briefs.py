import re

from app import database
from app.models import Brief
from sqlalchemy import func, select
from tests.conftest import GHAT_A, GHAT_C, P


def brief(client, **over):
    body = {"ghat_ids": [GHAT_A], "language": "en"}
    body.update(over)
    return client.post(f"{P}/brief/generate", json=body)


def test_template_brief_contains_evidence_values_units_and_periods(client):
    r = brief(client)
    j = r.json()
    assert r.status_code == 200 and j["generation_mode"] == "template" and j["generated_at"].endswith("Z")
    text = j["content"]
    assert "Test Ghat A" in text and "mg/l" in text and re.search(r"20\d\d Durga \(", text)
    assert "Priority:" in text and "Suggested verification step" in text and "Limitations:" in text
    assert "not live monitoring" in text
    obs = [e for e in j["evidence"] if e["type"] == "observation"]
    assert obs and all(e["source_file"] and e["source_record_id"] for e in obs)
    assert any(e["id"] == "calc:criteria" for e in j["evidence"])
    assert j["ai_status"] and "not configured" in j["ai_status"]


def test_brief_avoids_unsupported_directives(client):
    text = brief(client).json()["content"].lower()
    for banned in ("aerator", "ban immersion", "enforcement", "is safe", "prosecute"):
        assert banned not in text


def test_hindi_brief(client):
    j = brief(client, language="hi").json()
    assert j["language"] == "hi" and "प्राथमिकता" in j["content"] and "mg/l" in j["content"]
    assert "सीमाएँ" in j["content"]


def test_insufficient_data_ghat_is_not_called_low_risk(client):
    text = brief(client, ghat_ids=[GHAT_C]).json()["content"]
    assert "INSUFFICIENT DATA" in text and "ROUTINE" not in text


def test_all_ghats_when_none_given_and_unknown_404(client):
    j = client.post(f"{P}/brief/generate", json={}).json()
    assert j["content"].count("Priority:") == 3
    assert brief(client, ghat_ids=["nope"]).status_code == 404
    assert brief(client, language="fr").status_code == 422
    assert brief(client, ghat_ids=["a"] * 11).status_code == 422


def test_date_range_limits_evidence(client):
    j = brief(client, start_date="2019-01-01", end_date="2020-12-31").json()
    assert "2019-2020" in j["content"] and "2024" not in " ".join(e["text"] for e in j["evidence"])


def test_whatsapp_hindi_and_english(client):
    hi = client.post(f"{P}/brief/whatsapp", json={"ghat_ids": [GHAT_A], "language": "hi", "include_actions": True})
    j = hi.json()
    assert hi.status_code == 200 and j["language"] == "hi" and "mg/l" in j["content"] and "अगला कदम" in j["content"]
    assert "*Test Ghat A*" in j["content"] and j["evidence"] and j["limitations"] and j["generated_at"]
    en = client.post(f"{P}/brief/whatsapp", json={"ghat_ids": [GHAT_A], "language": "en", "include_actions": False})
    assert "Next step" not in en.json()["content"] and re.search(r"20\d\d Durga", en.json()["content"])
    assert len(en.json()["content"]) < 1500


def test_whatsapp_bilingual_and_validation(client):
    j = client.post(f"{P}/brief/whatsapp", json={"ghat_ids": [GHAT_A], "language": "bilingual"}).json()
    assert "घाट सेंटिनल" in j["content"] and "Ghat Sentinel" in j["content"]
    assert client.post(f"{P}/brief/whatsapp", json={"language": "xx"}).status_code == 422
    assert client.post(f"{P}/brief/whatsapp", json={"ghat_ids": ["nope"]}).status_code == 404


def test_briefs_are_persisted(client):
    brief(client)
    with database.SessionLocal() as s:
        assert s.scalar(select(func.count()).select_from(Brief)) == 1
