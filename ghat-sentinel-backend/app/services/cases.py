"""Municipal review cases (persisted in SQLite)."""
from __future__ import annotations

import uuid
from datetime import timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import ConflictError, NotFoundError, UnprocessableError
from app.models import CaseReading, Reading, ReviewCase
from app.schemas.case import CaseCreate, CaseList, CaseUpdate
from app.schemas.case import ReviewCase as CaseOut
from app.services.analytics import get_ghat
from app.services.common import utcnow
from app.services.prioritization import rank_ghats

TRANSITIONS: dict[str, set[str]] = {
    "needs_verification": {"under_review"},
    "under_review": {"action_assigned", "resolved", "needs_verification"},
    "action_assigned": {"under_review", "resolved"},
    "resolved": {"under_review"},  # re-open
}


def to_schema(c: ReviewCase) -> CaseOut:
    return CaseOut(
        id=c.id, ghat_id=c.ghat_id, reading_ids=sorted(link.reading_id for link in c.links),
        created_at=c.created_at.replace(tzinfo=timezone.utc), updated_at=c.updated_at.replace(tzinfo=timezone.utc),
        priority_level=c.priority_level, recommended_action=c.recommended_action,
        status=c.status, assigned_to=c.assigned_to, notes=c.notes or "", resolution_summary=c.resolution_summary)


def get_case(db: Session, case_id: str) -> ReviewCase:
    c = db.get(ReviewCase, case_id)
    if c is None:
        raise NotFoundError(f"Case '{case_id}' was not found.", code="CASE_NOT_FOUND")
    return c


def create_case(db: Session, data: CaseCreate) -> ReviewCase:
    get_ghat(db, data.ghat_id)
    ids = list(dict.fromkeys(data.reading_ids))
    if ids:
        found = set(db.scalars(select(Reading.id).where(Reading.id.in_(ids), Reading.ghat_id == data.ghat_id)))
        missing = [i for i in ids if i not in found]
        if missing:
            raise UnprocessableError(f"Reading IDs not found for ghat '{data.ghat_id}': {missing}",
                                     code="INVALID_READING_IDS")
    priority = rank_ghats(db, ghat_ids=[data.ghat_id]).items[0].priority_level
    now = utcnow()
    case = ReviewCase(
        id=f"case_{uuid.uuid4().hex[:10]}", ghat_id=data.ghat_id, created_at=now, updated_at=now,
        priority_level=priority, recommended_action=data.recommended_action.strip(), status="needs_verification",
        notes=data.notes or "", assigned_to=None, resolution_summary=None,
        links=[CaseReading(reading_id=i) for i in ids])
    try:
        db.add(case)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return case


def update_case(db: Session, case_id: str, data: CaseUpdate) -> ReviewCase:
    case = get_case(db, case_id)
    new_status = data.status or case.status
    if new_status != case.status and new_status not in TRANSITIONS[case.status]:
        raise ConflictError(
            f"Status change '{case.status}' -> '{new_status}' is not allowed. "
            f"Allowed from '{case.status}': {sorted(TRANSITIONS[case.status])}.", code="INVALID_STATUS_TRANSITION")
    assigned = data.assigned_to if data.assigned_to is not None else case.assigned_to
    summary = data.resolution_summary if data.resolution_summary is not None else case.resolution_summary
    if new_status == "action_assigned" and not (assigned and assigned.strip()):
        raise UnprocessableError("assigned_to is required when status is 'action_assigned'.")
    if new_status == "resolved":
        summary = summary or data.notes
        if not (summary and summary.strip()):
            raise UnprocessableError("resolution_summary (or notes) is required when status is 'resolved'.")
    try:
        case.status = new_status
        case.assigned_to = assigned.strip() if assigned else None
        if data.notes is not None:
            case.notes = data.notes
        case.resolution_summary = summary if new_status == "resolved" else case.resolution_summary
        case.updated_at = utcnow()
        db.commit()
    except Exception:
        db.rollback()
        raise
    return case


def list_cases(db: Session, status: str | None, ghat_id: str | None, limit: int, offset: int) -> CaseList:
    q = select(ReviewCase)
    if status:
        q = q.where(ReviewCase.status == status)
    if ghat_id:
        q = q.where(ReviewCase.ghat_id == ghat_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(ReviewCase.created_at.desc(), ReviewCase.id).limit(limit).offset(offset)).all()
    return CaseList(items=[to_schema(c) for c in rows], total=total, limit=limit, offset=offset)
