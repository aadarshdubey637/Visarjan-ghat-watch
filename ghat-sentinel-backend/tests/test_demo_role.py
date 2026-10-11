import pytest
from sqlalchemy import select

from app import database
from app.config import settings
from app.models import ReviewCase
from app.services import demo as demo_svc
from app.services import users as users_svc
from tests.conftest import GHAT_A, P

SECRET = "test-secret-" + "x" * 32
PRESENTER = next(a for a in users_svc.DEMO_ACCOUNTS if a["role"] == "demo")


@pytest.fixture(autouse=True)
def auth_on(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "JWT_SECRET", SECRET)
    with database.SessionLocal() as db:
        users_svc.seed_users(db)


def hdr(client, email, password):
    r = client.post(f"{P}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def presenter(client):
    return hdr(client, PRESENTER["email"], PRESENTER["password"])


def test_demo_allowed_on_officer_endpoints(client):
    h = presenter(client)
    assert client.get(f"{P}/auth/me", headers=h).json()["role"] == "demo"
    for path in ("/metadata", "/ghats", f"/ghats/{GHAT_A}", "/analytics/overview", "/analytics/findings",
                 "/criteria", "/predict/oct20"):
        r = client.get(P + path, headers=h)
        assert r.status_code == 200, (path, r.status_code, r.text)
    for path in ("/brief/generate", "/reports/generate"):
        r = client.post(P + path, json={"ghat_id": GHAT_A}, headers=h)
        assert r.status_code not in (401, 403), (path, r.text)
    assert client.post(f"{P}/brief/whatsapp", json={"ghat_id": GHAT_A}, headers=h).status_code not in (401, 403)


def test_demo_full_case_rights_and_sees_all(client):
    h = presenter(client)
    r = client.post(f"{P}/cases", json={"ghat_id": GHAT_A, "recommended_action": "Verify sample"}, headers=h)
    assert r.status_code == 201 and r.json()["created_by"] == PRESENTER["email"]
    cid = r.json()["id"]
    r = client.patch(f"{P}/cases/{cid}", json={"assigned_to": "someone@else.io", "status": "under_review"}, headers=h)
    assert r.status_code == 200 and r.json()["assigned_to"] == "someone@else.io"
    # a case assigned to a different person is still visible (no worker isolation)
    assert client.get(f"{P}/cases/{cid}", headers=h).status_code == 200
    assert client.get(f"{P}/cases", headers=h).json()["total"] == 1


def test_demo_forbidden_on_users_and_cannot_be_created(client):
    h = presenter(client)
    assert client.get(f"{P}/users", headers=h).status_code == 403
    body = {"name": "New Person", "email": "n@x.io", "password": "longenough1", "role": "worker"}
    r = client.post(f"{P}/users", json=body, headers=h)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    assert client.patch(f"{P}/users/usr_x", json={"is_active": False}, headers=h).status_code == 403
    for role in ("officer", "developer"):
        acc = next(a for a in users_svc.DEMO_ACCOUNTS if a["role"] == role)
        r = client.post(f"{P}/users", json={**body, "role": "demo"}, headers=hdr(client, acc["email"], acc["password"]))
        assert r.status_code == 403, role


def test_auth_config_lists_presenter_only_in_development(client, monkeypatch):
    cfg = client.get(f"{P}/auth/config").json()
    assert cfg["roles"] == ["officer", "worker", "citizen", "developer", "demo"]
    assert len(cfg["demo_accounts"]) == 5 and cfg["demo_accounts"][-1]["email"] == "presenter@ghat.demo"
    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert client.get(f"{P}/auth/config").json()["demo_accounts"] == []


def test_presenter_bootstrap_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "DEMO_USERS", False)
    monkeypatch.setattr(settings, "PRESENTER_EMAIL", "Pitch@Example.org")
    monkeypatch.setattr(settings, "PRESENTER_PASSWORD", "pitch-pass-2026")
    with database.SessionLocal() as db:
        users_svc.seed_users(db)
        users_svc.seed_users(db)  # idempotent
        assert demo_svc.seed_demo(db) == 0  # no sample data outside development
    h = hdr(client, "pitch@example.org", "pitch-pass-2026")
    assert client.get(f"{P}/auth/me", headers=h).json()["role"] == "demo"
    assert client.get(f"{P}/users", headers=h).status_code == 403
    # a configured presenter login is shown on the sign-in page; nothing else is
    accs = client.get(f"{P}/auth/config").json()["demo_accounts"]
    assert [(a["role"], a["email"]) for a in accs] == [("demo", "pitch@example.org")]


def test_seed_demo_creates_sample_cases_once(client):
    with database.SessionLocal() as db:
        assert demo_svc.seed_demo(db) == 6
        assert demo_svc.seed_demo(db) == 0
        rows = db.scalars(select(ReviewCase)).all()
        assert len(rows) == 6 and {c.created_by for c in rows} == {"demo-seed@ghat.demo"}
        assert {c.status for c in rows} == {"needs_verification", "under_review", "action_assigned", "resolved"}
        assert sum(c.assigned_to == "worker@ghat.demo" for c in rows) == 4
        assert all(c.notes.startswith("[Demo data] ") and c.priority_level for c in rows)
        resolved = next(c for c in rows if c.status == "resolved")
        assert resolved.resolution_summary.startswith("[Demo data] ")
        linked = {link.reading_id for c in rows for link in c.links}
    assert len(linked) == 6
    outside = {i["reading"]["id"] for i in client.get(
        f"{P}/analytics/findings", params={"limit": 100}, headers=presenter(client)).json()["items"]}
    assert linked <= outside
    worker = hdr(client, "worker@ghat.demo", "Worker#Demo2026")
    assert client.get(f"{P}/cases", headers=worker).json()["total"] == 4


def test_seed_demo_skipped_when_disabled_or_cases_exist(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_USERS", False)
    with database.SessionLocal() as db:
        assert demo_svc.seed_demo(db) == 0
    monkeypatch.setattr(settings, "DEMO_USERS", True)
    r = client.post(f"{P}/cases", json={"ghat_id": GHAT_A, "recommended_action": "Verify sample"},
                    headers=presenter(client))
    assert r.status_code == 201
    with database.SessionLocal() as db:
        assert demo_svc.seed_demo(db) == 6  # other people's cases do not block the sample set


def test_auth_disabled_unchanged(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", False)
    assert client.get(f"{P}/users").status_code == 200
    assert client.get(f"{P}/auth/me").json()["id"] == "usr_anonymous"
