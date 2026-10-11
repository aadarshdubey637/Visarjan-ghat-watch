import httpx

from app.config import settings
from app.services import messaging

P = "/api/v1"


class FakeResp:
    def __init__(self, status, payload):
        self.status_code, self._p = status, payload

    def json(self):
        return self._p


def _setup(monkeypatch, resp=None, exc=None):
    monkeypatch.setattr(settings, "MESSAGING_DRY_RUN", False)
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key_123")
    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append((url, headers, json))
        if exc:
            raise exc
        return resp or FakeResp(200, {"id": "abc"})

    monkeypatch.setattr(messaging.httpx, "post", fake_post)
    return calls


def test_email_via_https_api(client, monkeypatch):
    calls = _setup(monkeypatch)
    assert client.get(f"{P}/messaging/config").json()["email"] == {"configured": True,
                                                                    "from_address": "onboarding@resend.dev"}
    r = client.post(f"{P}/messaging/email", json={"to": ["a@b.co"], "subject": "Hi", "body": "Body"}).json()
    assert r["sent"] == 1 and r["failed"] == 0
    url, headers, body = calls[0]
    assert url == "https://api.resend.com/emails" and headers["Authorization"] == "Bearer re_test_key_123"
    assert body == {"from": "Ghat Sentinel <onboarding@resend.dev>", "to": ["a@b.co"], "subject": "Hi", "text": "Body"}


def test_api_errors_are_short_and_never_leak_the_key(client, monkeypatch):
    _setup(monkeypatch, FakeResp(403, {"message": "You can only send testing emails to your own address"}))
    r = client.post(f"{P}/messaging/email", json={"to": ["a@b.co"], "subject": "Hi", "body": "B"}).json()
    assert r["failed"] == 1 and "testing emails" in r["results"][0]["error"]
    _setup(monkeypatch, FakeResp(401, {"message": "API key is invalid re_test_key_123"}))
    r = client.post(f"{P}/messaging/email", json={"to": ["a@b.co"], "subject": "Hi", "body": "B"}).json()
    assert r["results"][0]["error"] == "Mail service API key is invalid"
    _setup(monkeypatch, exc=httpx.ConnectError("boom"))
    r = client.post(f"{P}/messaging/email", json={"to": ["a@b.co"], "subject": "Hi", "body": "B"}).json()
    assert r["results"][0]["error"] == "Could not connect to the mail service"
    assert "re_test_key_123" not in str(r)


def test_smtp_path_unchanged_without_api_key(client, monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    assert client.get(f"{P}/messaging/config").json()["email"]["configured"] is False
