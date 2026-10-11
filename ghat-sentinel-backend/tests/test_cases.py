from app import database
from app.models import ReviewCase
from tests.conftest import GHAT_A, GHAT_B, P


def reading_id(client, ghat=GHAT_A):
    return client.get(f"{P}/ghats/{ghat}/readings", params={"parameter": "BOD", "limit": 1}).json()["items"][0]["id"]


def create(client, **over):
    body = {"ghat_id": GHAT_A, "reading_ids": [reading_id(client)], "recommended_action": "Verify the recorded "
                                                                                           "measurement", "notes": ""}
    body.update(over)
    return client.post(f"{P}/cases", json=body)


def test_create_assigns_server_fields_and_persists(client):
    r = create(client)
    assert r.status_code == 201
    c = r.json()
    assert c["id"].startswith("case_") and c["status"] == "needs_verification" and c["created_at"]
    assert c["priority_level"] in ("high", "review", "routine", "insufficient_data") and c["reading_ids"]
    with database.SessionLocal() as s:  # persisted in SQLite, not process memory
        row = s.get(ReviewCase, c["id"])
        assert row is not None and row.recommended_action == "Verify the recorded measurement"
        assert [link.reading_id for link in row.links] == c["reading_ids"]
    assert client.get(f"{P}/cases/{c['id']}").json()["id"] == c["id"]


def test_create_validation(client):
    assert create(client, ghat_id="nope").status_code == 404
    bad = create(client, reading_ids=["bhopal-99999"])
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "INVALID_READING_IDS"
    other = create(client, ghat_id=GHAT_B, reading_ids=[reading_id(client, GHAT_A)])  # reading of another ghat
    assert other.status_code == 422
    assert create(client, recommended_action="").status_code == 422


def test_valid_transitions_and_persistence(client):
    cid = create(client).json()["id"]
    r = client.patch(f"{P}/cases/{cid}", json={"status": "under_review", "assigned_to": "reviewer",
                                              "notes": "Verification requested"})
    assert r.status_code == 200 and r.json()["status"] == "under_review" and r.json()["assigned_to"] == "reviewer"
    assert r.json()["updated_at"] >= r.json()["created_at"]
    r = client.patch(f"{P}/cases/{cid}", json={"status": "action_assigned"})
    assert r.json()["status"] == "action_assigned"
    r = client.patch(f"{P}/cases/{cid}", json={"status": "resolved", "resolution_summary": "Re-measured: OK"})
    assert r.json()["status"] == "resolved" and r.json()["resolution_summary"] == "Re-measured: OK"
    with database.SessionLocal() as s:
        assert s.get(ReviewCase, cid).status == "resolved"


def test_invalid_transition_rejected(client):
    cid = create(client).json()["id"]
    r = client.patch(f"{P}/cases/{cid}", json={"status": "resolved", "resolution_summary": "x"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"
    assert client.get(f"{P}/cases/{cid}").json()["status"] == "needs_verification"


def test_unknown_status_value_is_422_and_unknown_case_404(client):
    cid = create(client).json()["id"]
    assert client.patch(f"{P}/cases/{cid}", json={"status": "bogus"}).status_code == 422
    assert client.patch(f"{P}/cases/case_nope", json={"notes": "x"}).status_code == 404
    assert client.get(f"{P}/cases/case_nope").status_code == 404


def test_business_rules_for_assignment_and_resolution(client):
    cid = create(client).json()["id"]
    client.patch(f"{P}/cases/{cid}", json={"status": "under_review"})
    assert client.patch(f"{P}/cases/{cid}", json={"status": "action_assigned"}).status_code == 422
    assert client.patch(f"{P}/cases/{cid}", json={"status": "resolved"}).status_code == 422
    assert client.patch(f"{P}/cases/{cid}", json={"status": "resolved", "notes": "Checked on site"}).status_code == 200


def test_list_filters_and_pagination(client):
    ids = [create(client).json()["id"] for _ in range(3)]
    other = create(client, ghat_id=GHAT_B, reading_ids=[reading_id(client, GHAT_B)]).json()["id"]
    client.patch(f"{P}/cases/{ids[0]}", json={"status": "under_review"})
    page = client.get(f"{P}/cases", params={"limit": 2}).json()
    assert page["total"] == 4 and len(page["items"]) == 2 and page["limit"] == 2
    assert client.get(f"{P}/cases", params={"status": "under_review"}).json()["total"] == 1
    assert client.get(f"{P}/cases", params={"ghat_id": GHAT_B}).json()["items"][0]["id"] == other
    assert client.get(f"{P}/cases", params={"status": "bogus"}).status_code == 422
    assert client.get(f"{P}/analytics/overview").json()["cases_by_status"]["under_review"] == 1
