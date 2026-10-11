from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import AUTH_RESPONSES, staff
from app.database import get_db
from app.schemas.analytics import TrendsResponse
from app.schemas.common import ErrorResponse
from app.schemas.ghat import GhatDetail, GhatList, RankedResponse
from app.schemas.reading import ReadingsPage
from app.services import analytics, prioritization
from app.services.common import year_bounds

router = APIRouter(prefix="/ghats", tags=["ghats"], dependencies=[Depends(staff)])
E404 = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, **AUTH_RESPONSES}


@router.get("", response_model=GhatList, summary="List ghats found in the imported data",
            responses={422: {"model": ErrorResponse}, **AUTH_RESPONSES})
def list_ghats(search: str | None = Query(None, max_length=100), limit: int = Query(50, ge=1, le=100),
               offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return analytics.list_ghats(db, search, limit, offset)


@router.get("/ranked", response_model=RankedResponse, summary="Ghats ranked by review priority",
            description="Deterministic project-defined heuristic; not an official classification. "
                        "Date filters apply at year granularity. cpcb_class selects the intended use "
                        "(default B, outdoor bathing).", responses={422: {"model": ErrorResponse}, **AUTH_RESPONSES})
def ranked(as_of: date | None = None, start_date: date | None = None, end_date: date | None = None,
           cpcb_class: str | None = Query(None, max_length=1), db: Session = Depends(get_db)):
    return prioritization.rank_ghats(db, as_of, start_date, end_date, cpcb_class)


@router.get("/{ghat_id}", response_model=GhatDetail, summary="Ghat details", responses=E404)
def ghat_detail(ghat_id: str, cpcb_class: str | None = Query(None, max_length=1), db: Session = Depends(get_db)):
    return analytics.ghat_detail(db, ghat_id, cpcb_class)


@router.get("/{ghat_id}/readings", response_model=ReadingsPage, summary="Observed readings with provenance",
            responses=E404)
def readings(ghat_id: str, parameter: str | None = Query(None, max_length=80), start_date: date | None = None,
             end_date: date | None = None, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
             evaluate: bool = Query(False, description="Attach the deterministic criterion comparison"),
             cpcb_class: str | None = Query(None, max_length=1), db: Session = Depends(get_db)):
    lo, hi = year_bounds(start_date, end_date)
    return analytics.query_readings(db, ghat_id, parameter, lo, hi, limit, offset, evaluate, cpcb_class)


@router.get("/{ghat_id}/trends", response_model=TrendsResponse, summary="Historical series and descriptive trends",
            responses=E404)
def trends(ghat_id: str, parameter: str | None = Query(None, max_length=80), start_date: date | None = None,
           end_date: date | None = None, db: Session = Depends(get_db)):
    lo, hi = year_bounds(start_date, end_date)
    return analytics.ghat_trends(db, ghat_id, parameter, lo, hi)
