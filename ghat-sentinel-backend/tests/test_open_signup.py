from app.config import settings

P = "/api/v1"


def _body(email, role=None):
    b = {"name": "Test Person", "email": email, "password": "Passw0rd-2026"}
    if role:
        b["role"] = role
    return b


def test_staff_signup_open_by_default(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    assert client.get(f"{P}/auth/config").json()["open_staff_signup"] is True
    for i, role in enumerate(["officer", "worker", "citizen"]):
        r = client.post(f"{P}/auth/register", json=_body(f"p{i}@example.org", role))
        assert r.status_code == 201 and r.json()["user"]["role"] == role


def test_default_role_is_citizen(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    r = client.post(f"{P}/auth/register", json=_body("plain@example.org"))
    assert r.json()["user"]["role"] == "citizen"


def test_staff_signup_can_be_closed_and_roles_are_limited(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "OPEN_STAFF_SIGNUP", False)
    assert client.post(f"{P}/auth/register", json=_body("a@example.org", "officer")).status_code == 403
    assert client.post(f"{P}/auth/register", json=_body("b@example.org", "citizen")).status_code == 201
    monkeypatch.setattr(settings, "OPEN_STAFF_SIGNUP", True)
    for role in ("developer", "demo"):  # never self-service
        assert client.post(f"{P}/auth/register", json=_body(f"{role}@example.org", role)).status_code == 422
