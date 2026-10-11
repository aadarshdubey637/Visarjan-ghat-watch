from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import AUTH_RESPONSES, managers
from app.database import get_db
from app.schemas.auth import AuthUser
from app.schemas.common import ErrorResponse
from app.schemas.messaging import (Channel, ContactList, EmailRequest, MessageList, MessagingConfig, SendResponse,
                                   WhatsAppRequest)
from app.services import messaging

router = APIRouter(prefix="/messaging", tags=["messaging"])
E = {**AUTH_RESPONSES, 422: {"model": ErrorResponse}}
SEND = {**E, 429: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}


@router.get("/config", response_model=MessagingConfig, summary="Messaging channels status (no secrets)",
            responses=AUTH_RESPONSES)
def config(_: AuthUser = Depends(managers)):
    return messaging.get_config()


@router.get("/contacts", response_model=ContactList, summary="Active officers and workers for the recipient picker",
            responses=AUTH_RESPONSES)
def contacts(_: AuthUser = Depends(managers), db: Session = Depends(get_db)):
    return messaging.list_contacts(db)


@router.post("/email", response_model=SendResponse, summary="Send a brief by e-mail (one message per recipient)",
             description="Per-recipient failures are reported in `results`; the request itself still returns 200. "
                         "503 CHANNEL_NOT_CONFIGURED when SMTP is not set up (unless MESSAGING_DRY_RUN).",
             responses=SEND)
def send_email(body: EmailRequest, user: AuthUser = Depends(managers), db: Session = Depends(get_db)):
    return messaging.send_email(db, body.to, body.subject, body.body, body.brief_id, user.email)


@router.post("/whatsapp", response_model=SendResponse, summary="Send a brief by WhatsApp (Meta Cloud API)",
             description="Template mode is deliverable any time; text mode only inside Meta's 24-hour "
                         "customer-service window. Per-recipient failures are reported in `results`.",
             responses=SEND)
def send_whatsapp(body: WhatsAppRequest, user: AuthUser = Depends(managers), db: Session = Depends(get_db)):
    return messaging.send_whatsapp(db, body.to, body.body, body.brief_id, user.email)


@router.get("/log", response_model=MessageList, summary="Audit log of sent messages, newest first",
            responses=E)
def message_log(channel: Channel | None = None, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                _: AuthUser = Depends(managers), db: Session = Depends(get_db)):
    return messaging.list_log(db, channel, limit, offset)
