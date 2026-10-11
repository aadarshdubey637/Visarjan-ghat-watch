"""Outbound e-mail (SMTP) and WhatsApp (Meta Cloud API) messaging with an audit log.

Secrets (SMTP password, WhatsApp token) are only read from settings at send time. They are never returned,
stored or logged; error strings stored/returned are short, fixed or sanitised texts.
"""
from __future__ import annotations

import logging
import re
import smtplib
import socket
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import parseaddr

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import check_messaging_allowed
from app.exceptions import ChannelNotConfigured, UnprocessableError
from app.models import Brief, Message, User
from app.schemas.messaging import (Contact, ContactList, EmailConfig, MessageList, MessageOut, MessagingConfig,
                                   SendResponse, SendResult, WhatsAppConfig)
from app.services.common import utcnow

log = logging.getLogger("ghat_sentinel")

WA_TEMPLATE_MAX = 1000
WA_TEXT_MAX = 4000  # WhatsApp text messages allow 4096 characters
CONTACT_ROLES = ("officer", "worker")


def wa_mode() -> str:
    return "text" if settings.WHATSAPP_MODE.strip().lower() == "text" else "template"


def get_config() -> MessagingConfig:
    from_address = parseaddr(settings.mail_sender)[1] or None
    template = settings.WHATSAPP_TEMPLATE_NAME.strip() or None
    return MessagingConfig(
        email=EmailConfig(configured=settings.email_configured, from_address=from_address),
        whatsapp=WhatsAppConfig(configured=settings.whatsapp_configured, mode=wa_mode(), template_name=template,
                                language=settings.WHATSAPP_TEMPLATE_LANG),
        dry_run=settings.MESSAGING_DRY_RUN, max_recipients=settings.MESSAGING_MAX_RECIPIENTS)


def list_contacts(db: Session) -> ContactList:
    rows = db.scalars(select(User).where(User.is_active.is_(True), User.role.in_(CONTACT_ROLES))
                      .order_by(User.name, User.email)).all()
    return ContactList(items=[Contact(id=u.id, name=u.name, role=u.role, email=u.email, phone=u.phone)
                              for u in rows])


def list_log(db: Session, channel: str | None, limit: int, offset: int) -> MessageList:
    q = select(Message)
    if channel:
        q = q.where(Message.channel == channel)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit).offset(offset)).all()
    return MessageList(items=[MessageOut(
        id=m.id, channel=m.channel, recipient=m.recipient, subject=m.subject, status=m.status, error=m.error,
        provider_message_id=m.provider_message_id, sent_by=m.sent_by, brief_id=m.brief_id,
        created_at=m.created_at.replace(tzinfo=timezone.utc)) for m in rows], total=total, limit=limit,
        offset=offset)


# ----------------------------------------------------------------------------- e-mail

class EmailApiError(Exception):
    """A failure from the HTTPS e-mail API; `args[0]` is already a short, credential-free message."""


def _send_email_api(sender: str, recipient: str, subject: str, body: str) -> None:
    try:
        resp = httpx.post("https://api.resend.com/emails",
                          headers={"Authorization": f"Bearer {settings.RESEND_API_KEY.strip().strip(chr(34) + chr(39))}"},
                          json={"from": sender, "to": [recipient], "subject": subject, "text": body},
                          timeout=settings.SMTP_TIMEOUT_SECONDS)
    except httpx.TimeoutException:
        raise EmailApiError("Mail service timed out") from None
    except httpx.HTTPError:
        raise EmailApiError("Could not connect to the mail service") from None
    if 200 <= resp.status_code < 300:
        return
    try:
        detail = str(resp.json().get("message") or "")
    except Exception:  # noqa: BLE001
        detail = ""
    if resp.status_code == 403 and "only send testing emails" in detail.lower():
        raise EmailApiError("Demo email mode: the free sender can only deliver to the project owner's inbox. "
                            "A verified sending domain is needed to email anyone else.")
    if resp.status_code == 401:
        raise EmailApiError("Mail service API key is invalid (it should start with re_)")
    raise EmailApiError(f"Mail service rejected the message: {_clean_provider_text(detail, 160)}" if detail
                        else f"Mail service rejected the message (HTTP {resp.status_code})")


def _smtp_error(exc: Exception) -> str:
    """Short, fixed, credential-free text for an SMTP/network failure."""
    if isinstance(exc, EmailApiError):
        return str(exc)
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "Authentication failed"
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return "Recipient refused"
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return "Sender address refused"
    if isinstance(exc, smtplib.SMTPDataError):
        return "Message rejected by the mail server"
    if isinstance(exc, (socket.timeout, TimeoutError)):
        return "Mail server timed out"
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return "Mail server does not support the required security mode"
    if isinstance(exc, (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected)):
        return "Could not connect to the mail server"
    if isinstance(exc, smtplib.SMTPException):  # note: SMTPException subclasses OSError
        return "Mail server error"
    if isinstance(exc, OSError):
        return "Could not connect to the mail server"
    return "Mail server error"


def build_email(sender: str, recipient: str, subject: str, body: str) -> EmailMessage:
    for value in (sender, recipient, subject):
        if "\r" in value or "\n" in value:
            raise ValueError("line break in header value")
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.set_content(body, subtype="plain", charset="utf-8")
    return msg


def _send_smtp(msg: EmailMessage) -> None:
    host, port, timeout = settings.SMTP_HOST.strip(), settings.SMTP_PORT, settings.SMTP_TIMEOUT_SECONDS
    server = smtplib.SMTP_SSL(host, port, timeout=timeout) if settings.SMTP_USE_SSL \
        else smtplib.SMTP(host, port, timeout=timeout)
    try:
        if not settings.SMTP_USE_SSL and settings.SMTP_STARTTLS:
            server.starttls()
        if settings.SMTP_USERNAME.strip():
            server.login(settings.SMTP_USERNAME.strip(), settings.smtp_password)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:  # noqa: BLE001  (closing a broken connection must not mask the real result)
            pass


# ----------------------------------------------------------------------------- WhatsApp

def sanitise_template_text(body: str) -> str:
    """Meta forbids newlines, tabs and more than 4 consecutive spaces in template parameters."""
    text = re.sub(r"[ \t]*[\r\n\t]+[ \t]*", " | ", body.strip())
    text = re.sub(r" {5,}", "    ", text).strip()
    if len(text) > WA_TEMPLATE_MAX:
        text = text[:WA_TEMPLATE_MAX - 1].rstrip() + "…"
    return text


def whatsapp_payload(to: str, body: str) -> tuple[dict, str]:
    """Returns (payload, text_as_sent)."""
    if wa_mode() == "text":
        text_body = body if len(body) <= WA_TEXT_MAX else body[:WA_TEXT_MAX - 1].rstrip() + "…"
        return {"messaging_product": "whatsapp", "to": to, "type": "text",
                "text": {"preview_url": False, "body": text_body}}, text_body
    text = sanitise_template_text(body)
    return {"messaging_product": "whatsapp", "to": to, "type": "template",
            "template": {"name": settings.WHATSAPP_TEMPLATE_NAME.strip(),
                         "language": {"code": settings.WHATSAPP_TEMPLATE_LANG},
                         "components": [{"type": "body", "parameters": [{"type": "text", "text": text}]}]}}, text


def _clean_provider_text(text: str, limit: int = 200) -> str:
    for secret in (settings.WHATSAPP_ACCESS_TOKEN.strip(), settings.RESEND_API_KEY.strip()):
        if secret:
            text = text.replace(secret, "[redacted]")
    text = re.sub(r"(?i)bearer\s+\S+", "Bearer [redacted]", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def map_whatsapp_error(status_code: int, payload: object) -> str:
    err = payload.get("error") if isinstance(payload, dict) else None
    code = err.get("code") if isinstance(err, dict) else None
    if code == 190:
        return "WhatsApp access token is invalid or expired"
    if code in (131030, 131026):
        return ("Recipient is not allowed or not on WhatsApp (in test mode only verified numbers can receive "
                "messages)")
    if code in (132000, 132001):
        return "Template missing or parameters invalid"
    base = f"WhatsApp rejected the message (code {code})" if code is not None \
        else f"WhatsApp rejected the message (HTTP {status_code})"
    meta_message = err.get("message") if isinstance(err, dict) else None
    if isinstance(meta_message, str) and meta_message.strip():
        return f"{base}: {_clean_provider_text(meta_message)}"
    return base


def _send_whatsapp(to: str, payload: dict) -> tuple[str | None, str | None]:
    """Returns (message_id, error). Never raises for provider/network problems."""
    url = (f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/"
           f"{settings.WHATSAPP_PHONE_NUMBER_ID.strip()}/messages")
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN.strip()}",
               "Content-Type": "application/json"}
    try:
        resp = httpx.post(url, headers=headers, json=payload, timeout=settings.WHATSAPP_TIMEOUT_SECONDS)
    except httpx.TimeoutException:
        return None, "WhatsApp request timed out"
    except httpx.HTTPError:
        return None, "Could not connect to WhatsApp"
    try:
        data = resp.json()
    except ValueError:
        data = None
    if 200 <= resp.status_code < 300:
        try:
            return str(data["messages"][0]["id"]), None
        except (KeyError, IndexError, TypeError):
            return None, "WhatsApp returned an unexpected response"
    return None, map_whatsapp_error(resp.status_code, data)


# ----------------------------------------------------------------------------- orchestration

def _check_common(db: Session, recipients: list[str], brief_id: str | None) -> None:
    if len(recipients) > settings.MESSAGING_MAX_RECIPIENTS:
        raise UnprocessableError(f"At most {settings.MESSAGING_MAX_RECIPIENTS} recipients are allowed per request.")
    if brief_id is not None and db.get(Brief, brief_id) is None:
        raise UnprocessableError(f"Brief '{brief_id}' was not found.", code="INVALID_BRIEF_ID")


def _require(configured: bool, missing: list[str], channel: str) -> None:
    if settings.MESSAGING_DRY_RUN or configured:
        return
    raise ChannelNotConfigured(f"{channel} is not configured. Set or fix: {', '.join(missing)}.")


def _persist(db: Session, rows: list[Message]) -> None:
    try:
        db.add_all(rows)
        db.commit()
    except Exception:
        db.rollback()
        log.error("Could not write the message audit log")
        raise


def _finish(db: Session, channel: str, rows: list[Message], dry: bool) -> SendResponse:
    _persist(db, rows)
    results = [SendResult(recipient=r.recipient, status=r.status, error=r.error, message_id=r.provider_message_id)
               for r in rows]
    sent = sum(r.status == "sent" for r in rows)
    failed = sum(r.status == "failed" for r in rows)
    log.info("Messaging %s: %d sent, %d failed, %d dry-run", channel, sent, failed,
             sum(r.status == "dry_run" for r in rows))
    return SendResponse(results=results, sent=sent, failed=failed, dry_run=dry)


class _Clock:
    """Strictly increasing created_at values so the log order matches send order."""

    def __init__(self) -> None:
        self.last: datetime | None = None

    def next(self) -> datetime:
        now = utcnow()
        if self.last is not None and now <= self.last:
            now = self.last + timedelta(microseconds=1)
        self.last = now
        return now


def _row(clock: _Clock, channel: str, recipient: str, subject: str | None, body: str, sent_by: str,
         brief_id: str | None, status: str, error: str | None = None, provider_id: str | None = None) -> Message:
    return Message(id=f"msg_{uuid.uuid4().hex[:10]}", channel=channel, recipient=recipient, subject=subject,
                   body=body[:5000], status=status, error=error, provider_message_id=provider_id, sent_by=sent_by,
                   brief_id=brief_id, created_at=clock.next())


def send_email(db: Session, to: list[str], subject: str, body: str, brief_id: str | None,
               sent_by: str) -> SendResponse:
    _check_common(db, to, brief_id)
    _require(settings.email_configured, settings.email_missing, "E-mail")
    check_messaging_allowed(sent_by, len(to))
    dry, clock, rows = settings.MESSAGING_DRY_RUN, _Clock(), []
    for rcpt in to:
        if dry:
            rows.append(_row(clock, "email", rcpt, subject, body, sent_by, brief_id, "dry_run"))
            continue
        try:
            if settings.email_api:
                build_email(settings.mail_sender, rcpt, subject, body)  # same header-injection checks as SMTP
                _send_email_api(settings.mail_sender, rcpt, subject, body)
            else:
                _send_smtp(build_email(settings.smtp_sender, rcpt, subject, body))
            rows.append(_row(clock, "email", rcpt, subject, body, sent_by, brief_id, "sent"))
        except Exception as exc:  # noqa: BLE001  (one recipient must never stop the rest)
            log.warning("E-mail delivery failed (%s)", type(exc).__name__)
            rows.append(_row(clock, "email", rcpt, subject, body, sent_by, brief_id, "failed", _smtp_error(exc)))
    return _finish(db, "email", rows, dry)


def send_whatsapp(db: Session, to: list[str], body: str, brief_id: str | None, sent_by: str) -> SendResponse:
    _check_common(db, to, brief_id)
    _require(settings.whatsapp_configured, settings.whatsapp_missing, "WhatsApp")
    check_messaging_allowed(sent_by, len(to))
    dry, clock, rows = settings.MESSAGING_DRY_RUN, _Clock(), []
    for number in to:
        payload, as_sent = whatsapp_payload(number, body)
        if dry:
            rows.append(_row(clock, "whatsapp", number, None, as_sent, sent_by, brief_id, "dry_run"))
            continue
        message_id, error = _send_whatsapp(number, payload)
        if error:
            log.warning("WhatsApp delivery failed: %s", error)
            rows.append(_row(clock, "whatsapp", number, None, as_sent, sent_by, brief_id, "failed", error))
        else:
            rows.append(_row(clock, "whatsapp", number, None, as_sent, sent_by, brief_id, "sent",
                             provider_id=message_id))
    return _finish(db, "whatsapp", rows, dry)
