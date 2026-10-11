from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.analytics import Benchmark, FindingsPage, Overview
from app.schemas.common import ErrorResponse
from app.services import analytics, benchmarking

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=Overview, summary="Dashboard metrics",
            responses={422: {"model": ErrorResponse}})
def overview(cpcb_class: str | None = Query(None, max_length=1), db: Session = Depends(get_db)):
    return analytics.overview(db, cpcb_class)


@router.get("/findings", response_model=FindingsPage, summary="Outside-criterion readings, most severe first",
            responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
def findings(ghat_id: str | None = Query(None, max_length=80), parameter: str | None = Query(None, max_length=80),
             cpcb_class: str | None = Query(None, max_length=1), limit: int = Query(20, ge=1, le=100),
             offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return analytics.findings(db, ghat_id, parameter, cpcb_class, limit, offset)


@router.get("/benchmark", response_model=Benchmark, summary="Bhopal vs statewide (only when comparable)",
            responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
def benchmark(parameter: str = Query(..., max_length=80), year: int | None = Query(None, ge=1990, le=2100),
              region: str | None = Query(None, max_length=120, description="MPPCB regional office, e.g. 'R.O. Bhopal'"),
              phase: Literal["pre", "during", "after"] | None = None, cpcb_class: str | None = Query(None, max_length=1),
              db: Session = Depends(get_db)):
    return benchmarking.benchmark(db, parameter, year, region, phase, cpcb_class)
