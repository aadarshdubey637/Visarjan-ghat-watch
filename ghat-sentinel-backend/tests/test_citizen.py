from tests.conftest import GHAT_A, P


def ask(client, q, **over):
    body = {"question": q, "language": "en"}
    body.update(over)
    return client.post(f"{P}/citizen/ask", json=body)


def test_guide_both_languages(client):
    en = client.get(f"{P}/citizen/guide").json()
    hi = client.get(f"{P}/citizen/guide", params={"language": "hi"}).json()
    assert en["language"] == "en" and hi["language"] == "hi" and len(en["items"]) == len(hi["items"]) >= 5
    assert any("ऀ" <= ch <= "ॿ" for ch in hi["items"][0]["body"])
    assert all(i["approval_status"] for i in en["items"]) and "not an official order" in en["notice"]
    assert client.get(f"{P}/citizen/guide", params={"language": "fr"}).status_code == 422


def test_resources_have_urls_and_metadata_and_no_invented_helplines(client):
    j = client.get(f"{P}/citizen/resources").json()
    assert j["items"] and all(i["url"].startswith("https://") and i["title"] and i["resource_type"] for i in j["items"])
    assert all("verification_note" in i and "last_verified" in i for i in j["items"])
    assert "helpline" in j["notice"].lower()


def test_citizen_ghats_is_historical_not_live(client):
    j = client.get(f"{P}/citizen/ghats").json()
    assert j["current_conditions_available"] is False and "safe today" in j["notice"]
    g = next(i for i in j["items"] if i["ghat_id"] == GHAT_A)
    assert g["current_conditions"] == "unknown" and g["last_sample_year"] == 2024 and g["last_sample_date"] is None
    assert "not a safety ranking" in g["historical_comparison"]
    assert "safest" not in str(j).lower()


def test_guidance_question_uses_approved_guidance(client):
    j = ask(client, "What should organizers do with non-biodegradable decorations like plastic?").json()
    assert j["generation_mode"] == "template" and "thermocol" in j["answer"].lower()
    assert any(e["id"] == "guide:non_biodegradable_decor" for e in j["evidence"])


def test_hindi_question_and_answer(client):
    j = ask(client, "मूर्ति में कौन सा रंग इस्तेमाल करें?", language="hi").json()
    assert j["language"] == "hi" and "रंग" in j["answer"]


def test_safe_today_discloses_no_current_data(client):
    j = ask(client, "Is the ghat safe to visit today?", ghat_id=GHAT_A).json()
    assert "No current (live)" in j["answer"] and "No current (live)" in j["limitations"][0]
    assert any(e["type"] == "observation" for e in j["evidence"])
    j2 = ask(client, "Is it safe right now?").json()
    assert "No current (live)" in j2["answer"]


def test_out_of_scope_question_discloses_uncertainty(client):
    j = ask(client, "What is the capital of France?").json()
    assert "cannot answer" in j["answer"] and any("does not cover" in x for x in j["limitations"])


def test_official_resources_question_returns_links(client):
    j = ask(client, "Where can I find the official reports?").json()
    assert "https://" in j["answer"] and any(e["type"] == "resource" for e in j["evidence"])


def test_validation_and_errors(client):
    assert ask(client, "x" * 501).status_code == 422
    assert ask(client, "ab").status_code == 422
    assert ask(client, "How to reduce pollution?", ghat_id="nope").status_code == 404
    assert ask(client, "How to reduce pollution?", language="fr").status_code == 422


def test_citizen_endpoints_do_not_write_cases(client):
    before = client.get(f"{P}/cases").json()["total"]
    ask(client, "How can we reduce pollution during visarjan?")
    assert client.get(f"{P}/cases").json()["total"] == before
