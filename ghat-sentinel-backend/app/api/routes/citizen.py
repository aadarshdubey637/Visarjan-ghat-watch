from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import ai_rate_limit
from app.schemas.citizen import CitizenGhats, CitizenQuestion, Guide, Resources
from app.schemas.common import AIResponse, ErrorResponse, Language
from app.services import citizen

router = APIRouter(prefix="/citizen", tags=["citizen"])


@router.post("/ask", response_model=AIResponse, summary="Ask a question about approved guidance",
             dependencies=[Depends(ai_rate_limit)],
             responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse},
                        429: {"model": ErrorResponse}, 503: {"model": ErrorResponse}})
def ask(req: CitizenQuestion, db: Session = Depends(get_db)):
    return citizen.answer_question(db, req)


@router.get("/ghats", response_model=CitizenGhats, summary="Historical comparison and sample freshness (not live)")
def ghats(db: Session = Depends(get_db)):
    return citizen.citizen_ghats(db)


@router.get("/guide", response_model=Guide, summary="Pollution-prevention guidance",
            responses={422: {"model": ErrorResponse}})
def guide(language: Language = Query("en")):
    return citizen.get_guide(language)


@router.get("/resources", response_model=Resources, summary="Official resources and source metadata")
def resources():
    return citizen.get_resources()
