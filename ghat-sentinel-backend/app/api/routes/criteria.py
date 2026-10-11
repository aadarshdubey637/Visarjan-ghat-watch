from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.auth import AUTH_RESPONSES, staff
from app.database import get_db
from app.models import Criterion
from app.schemas.common import ErrorResponse
from app.schemas.reading import Criterion as CriterionOut
from app.services import criteria as crit

router = APIRouter(prefix="/criteria", tags=["criteria"], dependencies=[Depends(staff)])


class CriteriaList(BaseModel):
    items: list[CriterionOut]
    classes: dict[str, str]
    default_cpcb_class: str
    note: str


@router.get("", response_model=CriteriaList, summary="CPCB criteria used by the comparison engine",
            responses={422: {"model": ErrorResponse}, **AUTH_RESPONSES})
def list_criteria(cpcb_class: str | None = Query(None, max_length=1, description="Filter to one class (A-E)"),
                  db: Session = Depends(get_db)):
    q = select(Criterion).order_by(Criterion.cpcb_class, Criterion.parameter)
    if cpcb_class:
        q = q.where(Criterion.cpcb_class == crit.check_class(cpcb_class))
    rows = list(db.scalars(q))
    classes = {c: u for c, u in db.execute(select(Criterion.cpcb_class, Criterion.intended_use).distinct()).all()}
    return CriteriaList(
        items=[crit.criterion_out(c) for c in rows], classes=dict(sorted(classes.items())),
        default_cpcb_class=settings.DEFAULT_CPCB_CLASS,
        note="Only parameters listed for a class are compared for that class. Range limits are treated as inclusive. "
             "Operators: <=, >=, between_inclusive.")
