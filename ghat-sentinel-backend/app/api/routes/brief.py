from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import AUTH_RESPONSES, managers
from app.database import get_db
from app.dependencies import ai_rate_limit
from app.schemas.brief import BriefRequest, BriefResponse, WhatsAppRequest, WhatsAppResponse
from app.schemas.common import ErrorResponse
from app.services import briefs

router = APIRouter(prefix="/brief", tags=["briefs"], dependencies=[Depends(managers), Depends(ai_rate_limit)])
ERR = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, 429: {"model": ErrorResponse},
       503: {"model": ErrorResponse}, **AUTH_RESPONSES}


@router.post("/generate", response_model=BriefResponse, summary="Evidence-backed municipal brief", responses=ERR)
def generate(req: BriefRequest, db: Session = Depends(get_db)):
    return briefs.generate_municipal_brief(db, req)


@router.post("/whatsapp", response_model=WhatsAppResponse, summary="Copyable WhatsApp-ready brief", responses=ERR)
def whatsapp(req: WhatsAppRequest, db: Session = Depends(get_db)):
    return briefs.generate_whatsapp_brief(db, req)
