from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.case import CaseCreate, CaseList, CaseUpdate, ReviewCase
from app.schemas.common import CaseStatus, ErrorResponse
from app.services import cases

router = APIRouter(prefix="/cases", tags=["cases"])
ERR = {404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


@router.get("", response_model=CaseList, summary="Verification queue", responses={422: {"model": ErrorResponse}})
def list_cases(status: CaseStatus | None = None, ghat_id: str | None = Query(None, max_length=80),
               limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return cases.list_cases(db, status, ghat_id, limit, offset)


@router.post("", response_model=ReviewCase, status_code=201, summary="Create a verification case", responses=ERR)
def create_case(body: CaseCreate, db: Session = Depends(get_db)):
    return cases.to_schema(cases.create_case(db, body))


@router.get("/{case_id}", response_model=ReviewCase, summary="Get one case", responses=ERR)
def get_case(case_id: str, db: Session = Depends(get_db)):
    return cases.to_schema(cases.get_case(db, case_id))


@router.patch("/{case_id}", response_model=ReviewCase, summary="Update status, assignee and notes", responses=ERR)
def update_case(case_id: str, body: CaseUpdate, db: Session = Depends(get_db)):
    return cases.to_schema(cases.update_case(db, case_id, body))
