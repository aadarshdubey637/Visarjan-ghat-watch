from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import AUTH_RESPONSES, managers, staff
from app.database import get_db
from app.exceptions import ForbiddenError, NotFoundError
from app.schemas.auth import AuthUser
from app.schemas.case import CaseCreate, CaseList, CaseUpdate, ReviewCase
from app.schemas.common import CaseStatus, ErrorResponse
from app.services import cases

router = APIRouter(prefix="/cases", tags=["cases"])
ERR = {404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse},
       **AUTH_RESPONSES}
WORKER_STATUSES = {"under_review", "resolved"}
WORKER_FIELDS = {"notes", "resolution_summary", "status"}


def _identities(user: AuthUser) -> list[str]:
    return [user.email.strip().lower(), user.name.strip().lower()]


def _owned_case(db: Session, case_id: str, user: AuthUser):
    """Load a case; workers only see cases assigned to them (others look like 404)."""
    case = cases.get_case(db, case_id)
    if user.role == "worker" and not cases.is_assigned_to(case, _identities(user)):
        raise NotFoundError(f"Case '{case_id}' was not found.", code="CASE_NOT_FOUND")
    return case


@router.get("", response_model=CaseList, summary="Verification queue (workers see only their assigned cases)",
            responses={422: {"model": ErrorResponse}, **AUTH_RESPONSES})
def list_cases(status: CaseStatus | None = None, ghat_id: str | None = Query(None, max_length=80),
               limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
               user: AuthUser = Depends(staff), db: Session = Depends(get_db)):
    identities = _identities(user) if user.role == "worker" else None
    return cases.list_cases(db, status, ghat_id, limit, offset, identities)


@router.post("", response_model=ReviewCase, status_code=201, summary="Create a verification case", responses=ERR)
def create_case(body: CaseCreate, user: AuthUser = Depends(managers), db: Session = Depends(get_db)):
    created_by = None if user.id == "usr_anonymous" else user.email
    return cases.to_schema(cases.create_case(db, body, created_by))


@router.get("/{case_id}", response_model=ReviewCase, summary="Get one case", responses=ERR)
def get_case(case_id: str, user: AuthUser = Depends(staff), db: Session = Depends(get_db)):
    return cases.to_schema(_owned_case(db, case_id, user))


@router.patch("/{case_id}", response_model=ReviewCase, summary="Update status, assignee and notes",
              description="Officers/developers may change any field. Workers may only update their own assigned "
                          "cases: notes, resolution_summary and status (under_review or resolved).", responses=ERR)
def update_case(case_id: str, body: CaseUpdate, user: AuthUser = Depends(staff), db: Session = Depends(get_db)):
    if user.role == "worker":
        _owned_case(db, case_id, user)
        if body.model_fields_set - WORKER_FIELDS:
            raise ForbiddenError("Workers may only update notes, resolution_summary and status.")
        if body.status is not None and body.status not in WORKER_STATUSES:
            raise ForbiddenError("Workers may only set status to 'under_review' or 'resolved'.")
    return cases.to_schema(cases.update_case(db, case_id, body))
