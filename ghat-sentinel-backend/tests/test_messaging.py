import json
import logging
import smtplib
from unittest import mock

import httpx
import pytest
from sqlalchemy import create_engine, inspect, select, text

from app import database
from app.config import settings
from app.dependencies import reset_messaging_limits
from app.models import Brief, Message
from app.services import messaging as svc
from app.services import users as users_svc
from app.services.common import utcnow
from tests.conftest import P

TOKEN = "EAAB-super-secret-token-123"
SMTP_PASSWORD = "app-password-secret-xyz"
HINDI = "घाट सेंटिनल: जल गुणवत्ता रिपोर्ट"


@pytest.fixture(autouse=True)
def reset_limits():
    reset_messaging_limits()
    yield
    reset_messaging_limits()


@pytest.fixture
def email_on(monkeypatch):
    for k, v in {"SMTP_HOST": "smtp.example.test", "SMTP_PORT": 587, "SMTP_USERNAME": "sender@example.test",
                 "SMTP_PASSWORD": SMTP_PASSWORD, "SMTP_FROM": "Ghat Sentinel <sender@example.test>",
                 "SMTP_STARTTLS": True, "SMTP_USE_SSL": False, "MESSAGING_DRY_RUN": False,
                 "MESSAGING_MAX_RECIPIENTS": 20, "MESSAGING_MAX_PER_HOUR": 60}.items():
        monkeypatch.setattr(settings, k, v)


@pytest.fixture
def wa_on(monkeypatch):
    for k, v in {"WHATSAPP_ACCESS_TOKEN": TOKEN, "WHATSAPP_PHONE_NUMBER_ID": "10987654321",
                 "WHATSAPP_API_VERSION": "v21.0", "WHATSAPP_MODE": "template",
                 "WHATSAPP_TEMPLATE_NAME": "ghat_sentinel_brief", "WHATSAPP_TEMPLATE_LANG": "en",
                 "MESSAGING_DRY_RUN": False, "MESSAGING_MAX_RECIPIENTS": 20, "MESSAGING_MAX_PER_HOUR": 60}.items():
        monkeypatch.setattr(settings, k, v)


class FakeResp:
    def __init__(self, status, data):
        self.status_code, self._data = status, data

    def json(self):
        if self._data is None:
            raise ValueError("no json")
        return self._data


def ok(i="wamid.1"):
    return FakeResp(200, {"messaging_product": "whatsapp", "messages": [{"id": i}]})


def meta_err(code, msg="boom", status=400):
    return FakeResp(status, {"error": {"message": msg, "type": "OAuthException", "code": code}})


@pytest.fixture
def post(monkeypatch):
    m = mock.Mock(return_value=ok())
    monkeypatch.setattr(httpx, "post", m)
    return m


def make_brief(bid="brf_test1"):
    with database.SessionLocal() as db:
        db.add(Brief(id=bid, kind="whatsapp", language="en", ghat_ids=[], title="t", content="c",
                     generation_mode="template", generated_at=utcnow(), evidence=[], limitations=[]))
        db.commit()
    return bid


def rows():
    with database.SessionLocal() as db:
        return db.scalars(select(Message).order_by(Message.created_at)).all()


# ------------------------------------------------------------------ config

def test_config_flags_and_no_secrets(client, monkeypatch):
    body = client.get(f"{P}/messaging/config").json()
    assert body == {"email": {"configured": False, "from_address": None},
                    "whatsapp": {"configured": False, "mode": "template", "template_name": None, "language": "en"},
                    "dry_run": False, "max_recipients": 20}
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(settings, "SMTP_USERNAME", "u@example.test")
    assert client.get(f"{P}/messaging/config").json()["email"]["configured"] is False  # password missing
    monkeypatch.setattr(settings, "SMTP_PASSWORD", SMTP_PASSWORD)
    monkeypatch.setattr(settings, "SMTP_FROM", "Ghat Sentinel <from@example.test>")
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", TOKEN)
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "123")
    r = client.get(f"{P}/messaging/config")
    cfg = r.json()
    assert cfg["email"] == {"configured": True, "from_address": "from@example.test"}
    assert cfg["whatsapp"]["configured"] is False  # template mode needs a template name
    monkeypatch.setattr(settings, "WHATSAPP_TEMPLATE_NAME", "ghat_sentinel_brief")
    cfg = client.get(f"{P}/messaging/config").json()
    assert cfg["whatsapp"] == {"configured": True, "mode": "template", "template_name": "ghat_sentinel_brief",
                               "language": "en"}
    monkeypatch.setattr(settings, "WHATSAPP_TEMPLATE_NAME", "")
    monkeypatch.setattr(settings, "WHATSAPP_MODE", "text")
    assert client.get(f"{P}/messaging/config").json()["whatsapp"]["configured"] is True
    dumped = json.dumps(client.get(f"{P}/messaging/config").json())
    assert TOKEN not in dumped and SMTP_PASSWORD not in dumped


def test_from_falls_back_to_username(client, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "h")
    monkeypatch.setattr(settings, "SMTP_USERNAME", "only@example.test")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "x")
    assert client.get(f"{P}/messaging/config").json()["email"]["from_address"] == "only@example.test"


# ------------------------------------------------------------------ e-mail

def test_email_success(client, email_on):
    with mock.patch("smtplib.SMTP") as smtp:
        r = client.post(f"{P}/messaging/email", json={
            "to": ["A@Example.test", "b@example.test", "a@example.test"], "subject": "Brief: घाट", "body": HINDI})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent"] == 2 and body["failed"] == 0 and body["dry_run"] is False
    assert [x["recipient"] for x in body["results"]] == ["a@example.test", "b@example.test"]
    assert all(x["status"] == "sent" and x["error"] is None for x in body["results"])
    assert smtp.call_count == 2
    smtp.assert_called_with("smtp.example.test", 587, timeout=15.0)
    inst = smtp.return_value
    assert inst.starttls.call_count == 2
    inst.login.assert_called_with("sender@example.test", SMTP_PASSWORD)
    msgs = [c.args[0] for c in inst.send_message.call_args_list]
    assert [m["To"] for m in msgs] == ["a@example.test", "b@example.test"]  # no shared To list
    for m in msgs:
        assert m["From"] == "Ghat Sentinel <sender@example.test>"
        assert m["Subject"] == "Brief: घाट"
        assert m.get_content_type() == "text/plain" and m.get_content_charset() == "utf-8"
        assert m.get_content().strip() == HINDI
        m.as_bytes()  # serialises without error
    assert SMTP_PASSWORD not in json.dumps(body)
    assert [(m.channel, m.status, m.sent_by, m.subject) for m in rows()] == [
        ("email", "sent", "anonymous@local", "Brief: घाट")] * 2


def test_email_without_login_when_no_username(client, email_on, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_USERNAME", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")
    with mock.patch("smtplib.SMTP") as smtp:
        r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "s", "body": "b"})
    assert r.status_code == 200 and r.json()["sent"] == 1
    smtp.return_value.login.assert_not_called()


def test_email_ssl_mode(client, email_on, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_USE_SSL", True)
    monkeypatch.setattr(settings, "SMTP_PORT", 465)
    with mock.patch("smtplib.SMTP") as plain, mock.patch("smtplib.SMTP_SSL") as ssl:
        r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "s", "body": "b"})
    assert r.status_code == 200 and r.json()["sent"] == 1
    plain.assert_not_called()
    ssl.assert_called_once_with("smtp.example.test", 465, timeout=15.0)
    ssl.return_value.starttls.assert_not_called()
    ssl.return_value.login.assert_called_once()


def test_email_partial_failure_continues(client, email_on):
    def send(msg):
        if msg["To"] == "bad@example.test":
            raise smtplib.SMTPRecipientsRefused({"bad@example.test": (550, b"no such user")})

    with mock.patch("smtplib.SMTP") as smtp:
        smtp.return_value.send_message.side_effect = send
        r = client.post(f"{P}/messaging/email", json={
            "to": ["a@example.test", "bad@example.test", "c@example.test"], "subject": "s", "body": "b"})
    body = r.json()
    assert r.status_code == 200 and body["sent"] == 2 and body["failed"] == 1
    assert [x["status"] for x in body["results"]] == ["sent", "failed", "sent"]
    assert body["results"][1]["error"] == "Recipient refused"
    assert [m.status for m in rows()] == ["sent", "failed", "sent"]


@pytest.mark.parametrize("exc,expected", [
    (smtplib.SMTPAuthenticationError(535, b"bad creds " + SMTP_PASSWORD.encode()), "Authentication failed"),
    (smtplib.SMTPServerDisconnected("gone"), "Could not connect to the mail server"),
    (ConnectionRefusedError("refused"), "Could not connect to the mail server"),
    (TimeoutError("slow"), "Mail server timed out"),
    (smtplib.SMTPException("weird " + SMTP_PASSWORD), "Mail server error"),
])
def test_email_error_mapping_is_sanitised(client, email_on, caplog, exc, expected):
    caplog.set_level(logging.DEBUG)
    with mock.patch("smtplib.SMTP") as smtp:
        smtp.return_value.login.side_effect = exc
        r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "s", "body": "b"})
    assert r.status_code == 200 and r.json()["results"][0]["error"] == expected
    assert SMTP_PASSWORD not in r.text and SMTP_PASSWORD not in caplog.text
    assert SMTP_PASSWORD not in (rows()[0].error or "")


def test_email_connect_failure(client, email_on):
    with mock.patch("smtplib.SMTP", side_effect=OSError("network down")):
        r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "s", "body": "b"})
    assert r.json()["results"][0]["error"] == "Could not connect to the mail server"


@pytest.mark.parametrize("payload", [
    {"to": ["a@example.test"], "subject": "Hi\r\nBcc: evil@example.test", "body": "b"},
    {"to": ["a@example.test"], "subject": "Hi\nthere", "body": "b"},
    {"to": ["a@example.test\r\nBcc: evil@example.test"], "subject": "s", "body": "b"},
    {"to": ["a@example.test\n"], "subject": "s", "body": "b"},
    {"to": ["not-an-email"], "subject": "s", "body": "b"},
    {"to": [], "subject": "s", "body": "b"},
    {"to": ["a@example.test"], "subject": "", "body": "b"},
    {"to": ["a@example.test"], "subject": "x" * 151, "body": "b"},
    {"to": ["a@example.test"], "subject": "s", "body": ""},
    {"to": ["a@example.test"], "subject": "s", "body": "x" * 30001},
])
def test_email_validation_422(client, email_on, payload):
    with mock.patch("smtplib.SMTP") as smtp:
        r = client.post(f"{P}/messaging/email", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    smtp.assert_not_called()


def test_build_email_rejects_header_injection():
    with pytest.raises(ValueError):
        svc.build_email("a@b.co", "c@d.co", "x\r\nBcc: e@f.co", "body")
    with pytest.raises(ValueError):
        svc.build_email("a@b.co", "c@d.co\nBcc: e@f.co", "x", "body")


def test_email_not_configured_503(client, monkeypatch):
    r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "s", "body": "b"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "CHANNEL_NOT_CONFIGURED"
    assert "SMTP_HOST" in r.json()["error"]["message"]
    assert rows() == []


def test_email_dry_run_needs_no_config(client, monkeypatch):
    monkeypatch.setattr(settings, "MESSAGING_DRY_RUN", True)
    with mock.patch("smtplib.SMTP") as smtp:
        r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test", "b@example.test"], "subject": "s",
                                                      "body": HINDI})
    body = r.json()
    assert r.status_code == 200 and body["dry_run"] is True and body["sent"] == 0 and body["failed"] == 0
    assert [x["status"] for x in body["results"]] == ["dry_run", "dry_run"]
    smtp.assert_not_called()
    assert [(m.status, m.body) for m in rows()] == [("dry_run", HINDI)] * 2


# ------------------------------------------------------------------ WhatsApp

def test_whatsapp_template_payload_exact(client, wa_on, post):
    body = "Line one\nLine two\t\ttabbed      many   spaces  \n\n"
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["+91 98765-43210"], "body": body})
    assert r.status_code == 200, r.text
    assert r.json() == {"results": [{"recipient": "919876543210", "status": "sent", "error": None,
                                     "message_id": "wamid.1"}], "sent": 1, "failed": 0, "dry_run": False}
    post.assert_called_once()
    assert post.call_args.args[0] == "https://graph.facebook.com/v21.0/10987654321/messages"
    assert post.call_args.kwargs["headers"]["Authorization"] == f"Bearer {TOKEN}"
    assert post.call_args.kwargs["timeout"] == 15.0
    param = post.call_args.kwargs["json"]["template"]["components"][0]["parameters"][0]["text"]
    assert post.call_args.kwargs["json"] == {
        "messaging_product": "whatsapp", "to": "919876543210", "type": "template",
        "template": {"name": "ghat_sentinel_brief", "language": {"code": "en"},
                     "components": [{"type": "body", "parameters": [{"type": "text", "text": param}]}]}}
    assert param == "Line one | Line two | tabbed    many   spaces"
    assert "\n" not in param and "\t" not in param and "     " not in param
    assert rows()[0].body == param
    assert TOKEN not in r.text


def test_sanitise_template_text_rules():
    assert svc.sanitise_template_text("a" + " " * 9 + "b") == "a    b"
    assert svc.sanitise_template_text("  x\r\ny ") == "x | y"
    long = svc.sanitise_template_text("x" * 1500)
    assert len(long) == 1000 and long.endswith("…")


def test_whatsapp_long_body_truncated(client, wa_on, post):
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "y" * 1500})
    assert r.status_code == 200
    text_sent = post.call_args.kwargs["json"]["template"]["components"][0]["parameters"][0]["text"]
    assert len(text_sent) == 1000 and text_sent.endswith("…")
    # long input is accepted and shortened to the provider limit; only absurd sizes are rejected
    assert client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "y" * 20001}
                       ).status_code == 422


def test_whatsapp_accepts_a_full_length_brief_and_shortens_it(client, wa_on, post, monkeypatch):
    brief = ("घाट सेंटिनल " * 1100)[:13000]  # a Hindi all-ghats brief is about this long
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": brief})
    assert r.status_code == 200, r.text
    sent = post.call_args.kwargs["json"]["template"]["components"][0]["parameters"][0]["text"]
    assert len(sent) == 1000 and sent.endswith("…")
    monkeypatch.setattr(settings, "WHATSAPP_MODE", "text")
    monkeypatch.setattr(settings, "WHATSAPP_TEMPLATE_NAME", "")
    assert client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": brief}).status_code == 200
    text_sent = post.call_args.kwargs["json"]["text"]["body"]
    assert len(text_sent) == 4000 and text_sent.endswith("…")


def test_email_accepts_a_full_length_brief(client, email_on):
    brief = ("घाट सेंटिनल समीक्षा। " * 900)[:13500]
    with mock.patch("smtplib.SMTP") as smtp:
        r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "Brief", "body": brief})
    assert r.status_code == 200 and r.json()["sent"] == 1
    assert smtp.return_value.send_message.call_args.args[0].get_content().strip() == brief
    assert client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "x", "body": "z" * 30001}
                       ).status_code == 422


def test_whatsapp_text_mode_payload(client, wa_on, post, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_MODE", "text")
    monkeypatch.setattr(settings, "WHATSAPP_TEMPLATE_NAME", "")
    body = "Line one\nLine two"
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": body})
    assert r.status_code == 200 and r.json()["sent"] == 1
    assert post.call_args.kwargs["json"] == {"messaging_product": "whatsapp", "to": "919876543210", "type": "text",
                                             "text": {"preview_url": False, "body": body}}
    assert rows()[0].body == body


def test_whatsapp_phone_normalisation_and_dedupe(client, wa_on, post):
    r = client.post(f"{P}/messaging/whatsapp", json={
        "to": ["+91 98765-43210", "919876543210", "(044) 2345 6789", "+91 98765 43210"], "body": "hi"})
    assert r.status_code == 200
    assert [x["recipient"] for x in r.json()["results"]] == ["919876543210", "04423456789"]
    assert post.call_count == 2


@pytest.mark.parametrize("bad", ["1234567", "1" * 16, "abc", "98765x3210", "", "+"])
def test_whatsapp_invalid_phone_422(client, wa_on, post, bad):
    r = client.post(f"{P}/messaging/whatsapp", json={"to": [bad], "body": "hi"})
    assert r.status_code == 422
    post.assert_not_called()


@pytest.mark.parametrize("code,expected", [
    (190, "WhatsApp access token is invalid or expired"),
    (131030, "Recipient is not allowed or not on WhatsApp (in test mode only verified numbers can receive "
             "messages)"),
    (131026, "Recipient is not allowed or not on WhatsApp (in test mode only verified numbers can receive "
             "messages)"),
    (132001, "Template missing or parameters invalid"),
    (132000, "Template missing or parameters invalid"),
])
def test_whatsapp_meta_error_mapping(client, wa_on, post, caplog, code, expected):
    caplog.set_level(logging.DEBUG)
    post.return_value = meta_err(code, f"detail with {TOKEN}", 400 if code != 190 else 401)
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi"})
    res = r.json()
    assert r.status_code == 200 and res["failed"] == 1 and res["results"][0]["status"] == "failed"
    assert res["results"][0]["error"] == expected
    assert TOKEN not in r.text and TOKEN not in caplog.text and TOKEN not in (rows()[0].error or "")


def test_whatsapp_unknown_error_keeps_meta_text_without_token(client, wa_on, post, caplog):
    caplog.set_level(logging.DEBUG)
    post.return_value = meta_err(100, f"Invalid parameter. Bearer {TOKEN} and {TOKEN}")
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi"})
    err = r.json()["results"][0]["error"]
    assert err.startswith("WhatsApp rejected the message (code 100)") and "Invalid parameter" in err
    assert TOKEN not in r.text and TOKEN not in caplog.text and TOKEN not in rows()[0].error


def test_whatsapp_non_json_failure(client, wa_on, post):
    post.return_value = FakeResp(502, None)
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi"})
    assert r.json()["results"][0]["error"] == "WhatsApp rejected the message (HTTP 502)"


def test_whatsapp_timeout_and_connect_errors_continue(client, wa_on, post):
    post.side_effect = [httpx.ReadTimeout("slow"), httpx.ConnectError("down"), ok("wamid.3")]
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210", "919876543211", "919876543212"],
                                                     "body": "hi"})
    res = r.json()
    assert [x["error"] for x in res["results"]] == ["WhatsApp request timed out", "Could not connect to WhatsApp",
                                                    None]
    assert res["sent"] == 1 and res["failed"] == 2 and res["results"][2]["message_id"] == "wamid.3"


def test_whatsapp_partial_failure(client, wa_on, post):
    post.side_effect = [ok("w1"), meta_err(131030), ok("w3")]
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210", "919876543211", "919876543212"],
                                                     "body": "hi"})
    assert [x["status"] for x in r.json()["results"]] == ["sent", "failed", "sent"]


def test_token_never_logged_or_returned_on_success(client, wa_on, post, caplog):
    caplog.set_level(logging.DEBUG)
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi"})
    assert TOKEN not in r.text and TOKEN not in caplog.text
    assert TOKEN not in client.get(f"{P}/messaging/log").text


def test_whatsapp_not_configured_503(client, post):
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "CHANNEL_NOT_CONFIGURED"
    assert "WHATSAPP_ACCESS_TOKEN" in r.json()["error"]["message"]
    post.assert_not_called()


def test_whatsapp_template_mode_needs_template_name(client, wa_on, post, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_TEMPLATE_NAME", "")
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi"})
    assert r.status_code == 503 and "WHATSAPP_TEMPLATE_NAME" in r.json()["error"]["message"]


def test_whatsapp_dry_run(client, post, monkeypatch):
    monkeypatch.setattr(settings, "MESSAGING_DRY_RUN", True)
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi\nthere"})
    assert r.status_code == 200 and r.json()["dry_run"] is True
    assert r.json()["results"] == [{"recipient": "919876543210", "status": "dry_run", "error": None,
                                    "message_id": None}]
    post.assert_not_called()
    assert rows()[0].status == "dry_run"


# ------------------------------------------------------------------ roles

@pytest.fixture
def auth_on(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ENABLED", True)
    with database.SessionLocal() as db:
        users_svc.seed_users(db)


def login(client, role):
    acc = next(a for a in users_svc.DEMO_ACCOUNTS if a["role"] == role)
    r = client.post(f"{P}/auth/login", json={"email": acc["email"], "password": acc["password"]})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, acc["email"]


ENDPOINTS = [("get", "/messaging/config", None), ("get", "/messaging/contacts", None),
             ("get", "/messaging/log", None),
             ("post", "/messaging/email", {"to": ["a@example.test"], "subject": "s", "body": "b"}),
             ("post", "/messaging/whatsapp", {"to": ["919876543210"], "body": "b"})]


def test_role_matrix(client, auth_on, email_on, wa_on, post):
    for method, path, body in ENDPOINTS:
        assert getattr(client, method)(P + path, **({"json": body} if body else {})).status_code == 401, path
    for role in ("worker", "citizen"):
        h, _ = login(client, role)
        for method, path, body in ENDPOINTS:
            r = getattr(client, method)(P + path, headers=h, **({"json": body} if body else {}))
            assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN", (role, path)
    assert rows() == []
    for role in ("officer", "demo", "developer"):
        h, email = login(client, role)
        with mock.patch("smtplib.SMTP"):
            for method, path, body in ENDPOINTS:
                r = getattr(client, method)(P + path, headers=h, **({"json": body} if body else {}))
                assert r.status_code == 200, (role, path, r.text)
        assert {m.sent_by for m in rows()} == {email} or role != "officer"
    assert {m.sent_by for m in rows()} >= {"officer@ghat.demo", "presenter@ghat.demo", "developer@ghat.demo"}


def test_auth_disabled_is_open(client, email_on):
    assert client.get(f"{P}/messaging/config").status_code == 200
    assert client.get(f"{P}/messaging/log").status_code == 200


# ------------------------------------------------------------------ contacts

def test_contacts_only_active_officers_and_workers(client, auth_on):
    with database.SessionLocal() as db:
        w = users_svc.create_user(db, "Inactive Worker", "gone@x.io", "longenough1", "worker", "+919876543210")
        w.is_active = False
        db.commit()
        users_svc.create_user(db, "Zed Worker", "zed@x.io", "longenough1", "worker", "+919000000001")
    h, _ = login(client, "officer")
    items = client.get(f"{P}/messaging/contacts", headers=h).json()["items"]
    assert {i["role"] for i in items} == {"officer", "worker"}
    emails = {i["email"] for i in items}
    assert emails == {"officer@ghat.demo", "worker@ghat.demo", "zed@x.io"}
    assert set(items[0]) == {"id", "name", "role", "email", "phone"}
    zed = next(i for i in items if i["email"] == "zed@x.io")
    assert zed["phone"] == "+919000000001" and zed["name"] == "Zed Worker"
    assert next(i for i in items if i["email"] == "officer@ghat.demo")["phone"] is None
    assert "password_hash" not in json.dumps(items)


# ------------------------------------------------------------------ limits, brief, log

def test_recipient_cap_422(client, email_on, monkeypatch):
    monkeypatch.setattr(settings, "MESSAGING_MAX_RECIPIENTS", 2)
    with mock.patch("smtplib.SMTP") as smtp:
        r = client.post(f"{P}/messaging/email", json={
            "to": ["a@example.test", "b@example.test", "c@example.test"], "subject": "s", "body": "b"})
        assert r.status_code == 422 and "2" in r.json()["error"]["message"]
        smtp.assert_not_called()
        assert client.post(f"{P}/messaging/email", json={
            "to": ["a@example.test", "b@example.test"], "subject": "s", "body": "b"}).status_code == 200
    assert client.get(f"{P}/messaging/config").json()["max_recipients"] == 2


def test_hourly_cap_429_per_user(client, email_on, monkeypatch):
    monkeypatch.setattr(settings, "MESSAGING_MAX_PER_HOUR", 3)
    send = lambda to: client.post(f"{P}/messaging/email", json={"to": to, "subject": "s", "body": "b"})  # noqa: E731
    with mock.patch("smtplib.SMTP"):
        assert send(["a@example.test", "b@example.test"]).status_code == 200
        r = send(["c@example.test", "d@example.test"])
        assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"
        assert send(["c@example.test"]).status_code == 200
        assert send(["d@example.test"]).status_code == 429
        reset_messaging_limits()
        assert send(["d@example.test"]).status_code == 200
    assert len(rows()) == 4


def test_invalid_brief_id(client, email_on, wa_on, post):
    r = client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi", "brief_id": "brf_nope"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_BRIEF_ID"
    r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "s", "body": "b",
                                                  "brief_id": "brf_nope"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_BRIEF_ID"
    post.assert_not_called()
    assert rows() == []


def test_valid_brief_id_recorded(client, wa_on, post):
    bid = make_brief()
    assert client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210"], "body": "hi",
                                                        "brief_id": bid}).status_code == 200
    assert rows()[0].brief_id == bid


def test_log_pagination_filter_and_order(client, email_on, wa_on, post):
    with mock.patch("smtplib.SMTP"):
        client.post(f"{P}/messaging/email", json={"to": ["a@example.test", "b@example.test"], "subject": "S1",
                                                  "body": "b"})
    client.post(f"{P}/messaging/whatsapp", json={"to": ["919876543210", "919876543211", "919876543212"],
                                                 "body": "hi"})
    page = client.get(f"{P}/messaging/log").json()
    assert page["total"] == 5 and page["limit"] == 50 and page["offset"] == 0
    assert [i["recipient"] for i in page["items"]] == ["919876543212", "919876543211", "919876543210",
                                                       "b@example.test", "a@example.test"]
    assert set(page["items"][0]) == {"id", "channel", "recipient", "subject", "status", "error",
                                     "provider_message_id", "sent_by", "brief_id", "created_at"}
    assert page["items"][0]["id"].startswith("msg_") and len(page["items"][0]["id"]) == 14
    p2 = client.get(f"{P}/messaging/log", params={"limit": 2, "offset": 1}).json()
    assert [i["recipient"] for i in p2["items"]] == ["919876543211", "919876543210"] and p2["total"] == 5
    em = client.get(f"{P}/messaging/log", params={"channel": "email"}).json()
    assert em["total"] == 2 and {i["channel"] for i in em["items"]} == {"email"}
    assert em["items"][0]["subject"] == "S1" and em["items"][0]["status"] == "sent"
    assert client.get(f"{P}/messaging/log", params={"limit": 0}).status_code == 422
    assert client.get(f"{P}/messaging/log", params={"limit": 101}).status_code == 422
    assert client.get(f"{P}/messaging/log", params={"channel": "sms"}).status_code == 422


# ------------------------------------------------------------------ users.phone

def test_users_phone_create_patch_list_validation(client, auth_on):
    h, _ = login(client, "officer")
    new = {"name": "Phone Worker", "email": "pw@x.io", "password": "longenough1", "role": "worker"}
    r = client.post(f"{P}/users", json={**new, "phone": "+91 98765-43210"}, headers=h)
    assert r.status_code == 201 and r.json()["phone"] == "+919876543210"
    uid = r.json()["id"]
    r = client.post(f"{P}/users", json={**new, "email": "np@x.io"}, headers=h)
    assert r.status_code == 201 and r.json()["phone"] is None
    for bad in ("12345", "1" * 16, "call-me"):
        r = client.post(f"{P}/users", json={**new, "email": "bad@x.io", "phone": bad}, headers=h)
        assert r.status_code == 422, bad
    r = client.patch(f"{P}/users/{uid}", json={"phone": "919000000002"}, headers=h)
    assert r.status_code == 200 and r.json()["phone"] == "919000000002"
    assert client.patch(f"{P}/users/{uid}", json={"name": "Renamed One"}, headers=h).json()["phone"] == "919000000002"
    assert client.patch(f"{P}/users/{uid}", json={"phone": "12"}, headers=h).status_code == 422
    listed = {u["email"]: u["phone"] for u in client.get(f"{P}/users", headers=h).json()["items"]}
    assert listed["pw@x.io"] == "919000000002" and listed["np@x.io"] is None
    r = client.patch(f"{P}/users/{uid}", json={"phone": None}, headers=h)
    assert r.status_code == 200 and r.json()["phone"] is None


def test_migration_adds_phone_column_to_old_users_table():
    eng = create_engine("sqlite://")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE review_cases (id VARCHAR(40) PRIMARY KEY, created_by VARCHAR(120))"))
        conn.execute(text("CREATE TABLE users (id VARCHAR(40) PRIMARY KEY, email VARCHAR(254), name VARCHAR(80), "
                          "role VARCHAR(20), password_hash VARCHAR(300), is_active BOOLEAN, created_at DATETIME)"))
        conn.execute(text("INSERT INTO users (id, email, name, role, password_hash, is_active) "
                          "VALUES ('usr_1', 'a@b.co', 'A', 'worker', 'h', 1)"))
    database._migrate(eng)
    assert "phone" in {c["name"] for c in inspect(eng).get_columns("users")}
    with eng.connect() as conn:
        assert conn.execute(text("SELECT phone FROM users")).scalar() is None
    database._migrate(eng)  # idempotent


# ---------------------------------------------------- tolerant reading of pasted settings

def test_from_without_angle_brackets_is_repaired(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_FROM", "Ghat Sentinel someone@gmail.com")
    assert settings.smtp_sender == "Ghat Sentinel <someone@gmail.com>"
    monkeypatch.setattr(settings, "SMTP_FROM", "Ghat Sentinel <someone@gmail.com>")
    assert settings.smtp_sender == "Ghat Sentinel <someone@gmail.com>"
    monkeypatch.setattr(settings, "SMTP_FROM", "")
    monkeypatch.setattr(settings, "SMTP_USERNAME", "only@gmail.com")
    assert settings.smtp_sender == "only@gmail.com"


def test_gmail_app_password_spaces_are_ignored(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "abcd efgh ijkl mnop")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.gmail.com")
    assert settings.smtp_password == "abcdefghijklmnop"
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test")
    assert settings.smtp_password == "abcd efgh ijkl mnop"  # other providers are left untouched


def test_login_uses_the_cleaned_password_and_header(client, email_on, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "abcd efgh ijkl mnop")
    monkeypatch.setattr(settings, "SMTP_FROM", "Ghat Sentinel sender@example.test")
    with mock.patch("smtplib.SMTP") as smtp:
        r = client.post(f"{P}/messaging/email", json={"to": ["a@example.test"], "subject": "s", "body": "b"})
    assert r.status_code == 200 and r.json()["sent"] == 1
    smtp.return_value.login.assert_called_with("sender@example.test", "abcdefghijklmnop")
    assert smtp.return_value.send_message.call_args.args[0]["From"] == "Ghat Sentinel <sender@example.test>"
