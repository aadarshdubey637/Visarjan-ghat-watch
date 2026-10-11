from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.auth import Role, _valid_email, normalise_phone
from app.schemas.common import Page

Channel = Literal["email", "whatsapp"]
MessageStatus = Literal["sent", "failed", "dry_run"]


def _dedupe(items: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for item in items:
        seen.setdefault(item, None)
    return list(seen)


class EmailRequest(BaseModel):
    to: list[str] = Field(min_length=1, description="Recipient e-mail addresses (one message is sent to each)")
    subject: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1, max_length=30000)
    brief_id: str | None = Field(None, max_length=40)

    @field_validator("to")
    @classmethod
    def _to(cls, v: list[str]) -> list[str]:
        out = []
        for address in v:
            if "\r" in address or "\n" in address:
                raise ValueError("e-mail addresses must not contain line breaks")
            out.append(_valid_email(address))
        return _dedupe(out)

    @field_validator("subject")
    @classmethod
    def _subject(cls, v: str) -> str:
        if "\r" in v or "\n" in v:
            raise ValueError("subject must not contain line breaks")
        if not v.strip():
            raise ValueError("subject must not be blank")
        return v.strip()

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("body must not be blank")
        return v


class WhatsAppRequest(BaseModel):
    to: list[str] = Field(min_length=1, description="Phone numbers, e.g. '+91 98765-43210' or '919876543210'")
    body: str = Field(min_length=1, max_length=20000)  # shortened to the provider limit when sent
    brief_id: str | None = Field(None, max_length=40)

    @field_validator("to")
    @classmethod
    def _to(cls, v: list[str]) -> list[str]:
        return _dedupe([normalise_phone(p).lstrip("+") for p in v])

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("body must not be blank")
        return v


class SendResult(BaseModel):
    recipient: str
    status: MessageStatus
    error: str | None = None
    message_id: str | None = None


class SendResponse(BaseModel):
    results: list[SendResult]
    sent: int
    failed: int
    dry_run: bool


class EmailConfig(BaseModel):
    configured: bool
    from_address: str | None = None


class WhatsAppConfig(BaseModel):
    configured: bool
    mode: Literal["template", "text"]
    template_name: str | None = None
    language: str


class MessagingConfig(BaseModel):
    email: EmailConfig
    whatsapp: WhatsAppConfig
    dry_run: bool
    max_recipients: int


class Contact(BaseModel):
    id: str
    name: str
    role: Role
    email: str
    phone: str | None = None


class ContactList(BaseModel):
    items: list[Contact]


class MessageOut(BaseModel):
    id: str
    channel: Channel
    recipient: str
    subject: str | None = None
    status: MessageStatus
    error: str | None = None
    provider_message_id: str | None = None
    sent_by: str
    brief_id: str | None = None
    created_at: datetime


class MessageList(Page):
    items: list[MessageOut]
