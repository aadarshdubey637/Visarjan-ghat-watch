from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ErrorResponse
from app.schemas.forecast import Oct20Outlook
from app.services import forecasting

router = APIRouter(prefix="/predict", tags=["outlook"])


@router.get("/oct20", response_model=Oct20Outlook, summary="Experimental 20 October seasonal outlook",
            description="Returns an experimental estimate only when enough comparable history exists; otherwise a "
                        "historical comparison or insufficient_data. Never an observed reading. parameter defaults "
                        "to 'Dissolved oxygen'; omitting ghat_id pools ghats into a historical comparison only.",
            responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
def oct20(ghat_id: str | None = Query(None, max_length=80), parameter: str | None = Query(None, max_length=80),
          year: int | None = Query(None, ge=2000, le=2100), db: Session = Depends(get_db)):
    return forecasting.get_oct20(db, ghat_id, parameter, year)
