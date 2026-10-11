import time

import jwt
import pytest
from sqlalchemy import create_engine, text

from app import database
from app.auth import ALGORITHM
from app.config import ensure_jwt_secret, settings
from app.models import User
from app.services import users as users_svc
from tests.conftest import GHAT_A, P

SECRET = "test-secret-" + "x" * 32
DEMO = {a["role"]: a for a in users_svc.DEMO_ACCOUNTS}


@pytest.fixture(autouse=True)
def auth_on(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "JWT_SECRET", SECRET)
    with database.SessionLocal() as db:
        users_svc.seed_users(db)


def login(client, role):
    acc = DEMO[role]
    r = client.post(f"{P}/auth/login", json={"email": acc["email"], "password": acc["password"]})
    assert r.status_code == 200, r.text
    return r.json()


def hdr(client, role):
    return {"Authorization": f"Bearer {login(client, role)['access_token']}"}


def make_case(client, assigned_to=None):
    r = client.post(f"{P}/cases", json={"ghat_id": GHAT_A, "recommended_action": "Verify sample"},
                    headers=hdr(client, "officer"))
    assert r.status_code == 201, r.text
    case = r.json()
    if assigned_to:
        r = client.patch(f"{P}/cases/{case['id']}", json={"assigned_to": assigned_to, "status": "under_review"},
                         headers=hdr(client, "officer"))
        assert r.status_code == 200, r.text
        case = r.json()
    return case


def test_register_login_me_flow(client):
    r = client.post(f"{P}/auth/register", json={"name": "Asha Rao", "email": "  Asha@Example.COM ",
                                                "password": "s3cretpass"})
    assert r.status_code == 201
    body = r.json()
    assert body["token_type"] == "bearer" and body["expires_in"] == settings.ACCESS_TOKEN_MINUTES * 60
    assert body["user"]["email"] == "asha@example.com" and body["user"]["role"] == "citizen"
    assert "s3cretpass" not in r.text
    lg = client.post(f"{P}/auth/login", json={"email": "ASHA@example.com", "password": "s3cretpass"})
    assert lg.status_code == 200
    me = client.get(f"{P}/auth/me", headers={"Authorization": f"Bearer {lg.json()['access_token']}"})
    assert me.status_code == 200 and me.json() == body["user"]
    with database.SessionLocal() as db:
        stored = db.query(User).filter_by(email="asha@example.com").one().password_hash
    assert stored.startswith("scrypt$") and "s3cretpass" not in stored


def test_register_validation_duplicate_and_no_role(client):
    base = {"name": "Asha", "email": "a@b.co", "password": "longenough"}
    assert client.post(f"{P}/auth/register", json={**base, "role": "officer"}).json()["user"]["role"] == "citizen"
    dup = client.post(f"{P}/auth/register", json={**base, "email": "A@B.co"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "EMAIL_TAKEN"
    for bad in ({"name": "A"}, {"email": "not-an-email"}, {"password": "short"}, {"password": "x" * 129}):
        r = client.post(f"{P}/auth/register", json={**base, "email": "n@b.co", **bad})
        assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_wrong_password_and_unknown_email_identical(client):
    a = client.post(f"{P}/auth/login", json={"email": DEMO["officer"]["email"], "password": "nope-nope"})
    b = client.post(f"{P}/auth/login", json={"email": "ghost@nowhere.io", "password": "nope-nope"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() and a.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_rate_limit(client):
    payload = {"email": DEMO["officer"]["email"], "password": "wrong-pass"}
    assert [client.post(f"{P}/auth/login", json=payload).status_code for _ in range(5)] == [401] * 5
    r = client.post(f"{P}/auth/login", json=payload)
    assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"
    good = {"email": DEMO["officer"]["email"], "password": DEMO["officer"]["password"]}
    assert client.post(f"{P}/auth/login", json=good).status_code == 429
    other = {"email": DEMO["worker"]["email"], "password": DEMO["worker"]["password"]}
    assert client.post(f"{P}/auth/login", json=other).status_code == 200


def test_token_problems_are_401(client):
    info = login(client, "officer")
    tok, uid = info["access_token"], info["user"]["id"]
    url = f"{P}/ghats"
    r = client.get(url)
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"
    bad = [tok[:-3] + ("abc" if tok[-3:] != "abc" else "xyz"),
           jwt.encode({"sub": uid, "exp": int(time.time()) + 600}, "other-secret-" + "y" * 32, algorithm=ALGORITHM),
           jwt.encode({"sub": uid, "role": "officer", "exp": int(time.time()) - 10}, SECRET, algorithm=ALGORITHM),
           jwt.encode({"sub": "usr_missing", "exp": int(time.time()) + 600}, SECRET, algorithm=ALGORITHM),
           jwt.encode({"sub": uid}, SECRET, algorithm=ALGORITHM), "garbage"]
    for t in bad:
        r = client.get(url, headers={"Authorization": f"Bearer {t}"})
        assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHENTICATED", t
    assert client.get(url, headers={"Authorization": f"Bearer {tok}"}).status_code == 200


def test_deactivated_user_token_stops_working(client):
    h = hdr(client, "citizen")
    assert client.get(f"{P}/auth/me", headers=h).status_code == 200
    with database.SessionLocal() as db:
        db.query(User).filter_by(email=DEMO["citizen"]["email"]).one().is_active = False
        db.commit()
    assert client.get(f"{P}/auth/me", headers=h).status_code == 401
    r = client.post(f"{P}/auth/login", json={"email": DEMO["citizen"]["email"],
                                             "password": DEMO["citizen"]["password"]})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_public_endpoints_open(client):
    for path in ("/health", "/auth/config", "/citizen/guide", "/citizen/resources", "/citizen/ghats"):
        assert client.get(P + path).status_code == 200, path
    assert client.post(f"{P}/citizen/ask", json={"question": "How should I immerse idols?"}).status_code != 401


STAFF_GETS = ["/metadata", "/ghats", "/ghats/ranked", f"/ghats/{GHAT_A}", f"/ghats/{GHAT_A}/readings",
              f"/ghats/{GHAT_A}/trends", "/analytics/overview", "/analytics/findings", "/criteria", "/predict/oct20",
              "/analytics/benchmark?parameter=pH"]
MANAGER_POSTS = [("/brief/generate", {"ghat_ids": [GHAT_A]}), ("/brief/whatsapp", {"ghat_ids": [GHAT_A]}),
                 ("/reports/generate", {"ghat_ids": [GHAT_A]}),
                 ("/cases", {"ghat_id": GHAT_A, "recommended_action": "Verify sample"})]


def test_role_matrix(client):
    h = {r: hdr(client, r) for r in ("officer", "worker", "citizen", "developer")}
    for path in STAFF_GETS:
        assert client.get(P + path, headers=h["citizen"]).status_code == 403, path
        assert client.get(P + path).status_code == 401, path
        for role in ("officer", "worker", "developer"):
            assert client.get(P + path, headers=h[role]).status_code not in (401, 403), (role, path)
    for path, body in MANAGER_POSTS:
        for role in ("citizen", "worker"):
            r = client.post(P + path, json=body, headers=h[role])
            assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN", (role, path)
        assert client.post(P + path).status_code == 401
        for role in ("officer", "developer"):
            r = client.post(P + path, json=body, headers=h[role])
            assert r.status_code not in (401, 403), (role, path, r.text)
    for role in ("citizen", "worker"):
        assert client.get(f"{P}/users", headers=h[role]).status_code == 403
    assert client.get(f"{P}/cases", headers=h["citizen"]).status_code == 403
    for role in ("officer", "developer"):
        assert client.get(f"{P}/users", headers=h[role]).status_code == 200
        assert client.get(f"{P}/cases", headers=h[role]).status_code == 200


def test_case_created_by(client):
    assert make_case(client)["created_by"] == DEMO["officer"]["email"]


def test_worker_case_isolation(client):
    mine = make_case(client, assigned_to=DEMO["worker"]["email"].upper())
    by_name = make_case(client, assigned_to="demo field worker")
    other = make_case(client, assigned_to="someone@else.io")
    unassigned = make_case(client)
    w = hdr(client, "worker")
    listed = client.get(f"{P}/cases", headers=w).json()
    assert {c["id"] for c in listed["items"]} == {mine["id"], by_name["id"]} and listed["total"] == 2
    assert client.get(f"{P}/cases/{mine['id']}", headers=w).status_code == 200
    for c in (other, unassigned):
        r = client.get(f"{P}/cases/{c['id']}", headers=w)
        assert r.status_code == 404 and r.json()["error"]["code"] == "CASE_NOT_FOUND"
        assert client.patch(f"{P}/cases/{c['id']}", json={"notes": "x"}, headers=w).status_code == 404
    assert len(client.get(f"{P}/cases", headers=hdr(client, "officer")).json()["items"]) == 4

    url = f"{P}/cases/{mine['id']}"
    r = client.patch(url, json={"assigned_to": "me"}, headers=w)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    assert client.patch(url, json={"status": "action_assigned"}, headers=w).status_code == 403
    assert client.patch(url, json={"status": "needs_verification"}, headers=w).status_code == 403
    assert client.patch(url, json={"status": "resolved"}, headers=w).status_code == 422
    r = client.patch(url, json={"status": "resolved", "resolution_summary": "Cleaned", "notes": "done"}, headers=w)
    assert r.status_code == 200 and r.json()["status"] == "resolved" and r.json()["notes"] == "done"
    assert client.patch(url, json={"status": "under_review"}, headers=w).status_code == 200
    # transition rules still enforced for workers (needs_verification -> resolved is not allowed)
    fresh = make_case(client)
    client.patch(f"{P}/cases/{fresh['id']}", json={"assigned_to": DEMO["worker"]["email"]},
                 headers=hdr(client, "officer"))
    r = client.patch(f"{P}/cases/{fresh['id']}", json={"status": "resolved", "resolution_summary": "x"}, headers=w)
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"
    r = client.post(f"{P}/cases", json={"ghat_id": GHAT_A, "recommended_action": "abc"}, headers=w)
    assert r.status_code == 403


def test_officer_user_management(client):
    off = hdr(client, "officer")
    new = {"name": "Field Two", "email": "Two@Ghat.Demo", "password": "workerpass1", "role": "worker"}
    r = client.post(f"{P}/users", json=new, headers=off)
    assert r.status_code == 201 and r.json()["email"] == "two@ghat.demo" and r.json()["is_active"] is True
    assert "workerpass1" not in r.text
    wid = r.json()["id"]
    dup = client.post(f"{P}/users", json=new, headers=off)
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "EMAIL_TAKEN"
    for role in ("developer", "citizen"):
        r = client.post(f"{P}/users", json={**new, "email": f"{role}@x.io", "role": role}, headers=off)
        assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    dev = hdr(client, "developer")
    assert client.post(f"{P}/users", json={**new, "email": "dev2@x.io", "role": "developer"},
                       headers=dev).status_code == 201
    assert client.post(f"{P}/users", json={**new, "email": "c@x.io", "role": "citizen"},
                       headers=dev).status_code == 403

    lst = client.get(f"{P}/users?role=worker", headers=off).json()
    assert {u["email"] for u in lst["items"]} == {"worker@ghat.demo", "two@ghat.demo"} and lst["total"] == 2
    assert set(lst["items"][0]) == {"id", "email", "name", "role", "is_active", "created_at"}
    assert client.get(f"{P}/users?role=hacker", headers=off).status_code == 422

    wtok = client.post(f"{P}/auth/login", json={"email": "two@ghat.demo", "password": "workerpass1"}).json()
    wh = {"Authorization": f"Bearer {wtok['access_token']}"}
    assert client.get(f"{P}/auth/me", headers=wh).status_code == 200
    r = client.patch(f"{P}/users/{wid}", json={"is_active": False, "name": "Renamed"}, headers=off)
    assert r.status_code == 200 and r.json()["is_active"] is False and r.json()["name"] == "Renamed"
    assert client.get(f"{P}/auth/me", headers=wh).status_code == 401

    me = client.get(f"{P}/auth/me", headers=off).json()
    r = client.patch(f"{P}/users/{me['id']}", json={"is_active": False}, headers=off)
    assert r.status_code == 409 and r.json()["error"]["code"] == "CANNOT_DEACTIVATE_SELF"
    r = client.patch(f"{P}/users/usr_nope", json={"is_active": False}, headers=off)
    assert r.status_code == 404 and r.json()["error"]["code"] == "USER_NOT_FOUND"
    dev_id = client.get(f"{P}/auth/me", headers=dev).json()["id"]
    assert client.patch(f"{P}/users/{dev_id}", json={"name": "Hax"}, headers=off).status_code == 403


def test_auth_config_demo_only_in_development(client, monkeypatch):
    cfg = client.get(f"{P}/auth/config").json()
    assert cfg["auth_enabled"] is True and cfg["roles"] == ["officer", "worker", "citizen", "developer", "demo"]
    assert {a["role"] for a in cfg["demo_accounts"]} == set(DEMO) and cfg["demo_accounts"][0]["password"]
    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert client.get(f"{P}/auth/config").json()["demo_accounts"] == []
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "DEMO_USERS", False)
    assert client.get(f"{P}/auth/config").json()["demo_accounts"] == []


def test_seeding_idempotent_and_env_gated(monkeypatch):
    with database.SessionLocal() as db:
        users_svc.seed_users(db)
        users_svc.seed_users(db)
        assert db.query(User).count() == 5
        db.query(User).delete()
        db.commit()
        monkeypatch.setattr(settings, "APP_ENV", "production")
        monkeypatch.setattr(settings, "BOOTSTRAP_OFFICER_EMAIL", "Boss@City.gov")
        monkeypatch.setattr(settings, "BOOTSTRAP_OFFICER_PASSWORD", "bootstrap-pass")
        users_svc.seed_users(db)
        users_svc.seed_users(db)
        rows = db.query(User).all()
        assert [(u.email, u.role) for u in rows] == [("boss@city.gov", "officer")]


def test_created_by_migration():
    eng = create_engine("sqlite://")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE ghats (id VARCHAR(80) PRIMARY KEY, name VARCHAR(200), "
                          "water_body VARCHAR(200), latitude FLOAT, longitude FLOAT, "
                          "site_match_confidence VARCHAR(20))"))
        conn.execute(text("CREATE TABLE review_cases (id VARCHAR(40) PRIMARY KEY, ghat_id VARCHAR(80), "
                          "created_at DATETIME, updated_at DATETIME, priority_level VARCHAR(30), "
                          "recommended_action TEXT, status VARCHAR(30), assigned_to VARCHAR(120), notes TEXT, "
                          "resolution_summary TEXT)"))
        conn.execute(text("INSERT INTO review_cases (id, ghat_id, recommended_action, status, notes) "
                          "VALUES ('case_old', 'g', 'act', 'needs_verification', '')"))
    database.init_db(bind=eng)
    database.init_db(bind=eng)  # idempotent
    with eng.connect() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(review_cases)"))}
        assert "created_by" in cols
        assert [tuple(r) for r in conn.execute(text("SELECT id, created_by FROM review_cases"))] == [("case_old", None)]
        assert conn.execute(text("SELECT count(*) FROM users")).scalar() == 0


def test_auth_disabled_returns_anonymous_developer(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", False)
    assert client.get(f"{P}/auth/me").json() == {
        "id": "usr_anonymous", "email": "anonymous@local", "name": "Anonymous (auth disabled)", "role": "developer"}
    assert client.get(f"{P}/ghats").status_code == 200
    assert client.get(f"{P}/users").status_code == 200


def test_secret_policy(monkeypatch):
    monkeypatch.setattr(settings, "JWT_SECRET", "")
    monkeypatch.setattr(settings, "APP_ENV", "production")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        ensure_jwt_secret()
    monkeypatch.setattr(settings, "APP_ENV", "development")
    ensure_jwt_secret()
    assert len(settings.JWT_SECRET) >= 32


def test_openapi_has_bearer_scheme(client):
    spec = client.get("/openapi.json").json()
    assert any(s.get("scheme") == "bearer" for s in spec["components"]["securitySchemes"].values())
    assert "401" in spec["paths"][f"{P}/ghats"]["get"]["responses"]
