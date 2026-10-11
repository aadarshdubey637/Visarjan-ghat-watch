"""Sample review cases for demonstrations (development + DEMO_USERS, or SEED_DEMO_CASES; idempotent)."""
from __future__ import annotations

import logging
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Reading, ReviewCase
from app.schemas.case import CaseCreate, CaseUpdate
from app.services import analytics, cases, users

log = logging.getLogger("ghat_sentinel")

SEED_EMAIL = "demo-seed@ghat.demo"
WORKER_EMAIL = "worker@ghat.demo"
PREFIX = "[Demo data] "
SAMPLE_COUNT = 6
# (target status, assigned to the demo worker?) walked through the real transition rules, in order.
PLAN: list[tuple[str, bool]] = [
    ("needs_verification", False), ("needs_verification", False),
    ("under_review", True), ("under_review", True), ("action_assigned", True), ("resolved", True),
]
PATHS = {
    "needs_verification": [], "under_review": ["under_review"],
    "action_assigned": ["under_review", "action_assigned"], "resolved": ["under_review", "resolved"],
}


def _pick_findings(db: Session) -> list:
    """Worst outside-criterion readings, one per ghat first (round robin), up to SAMPLE_COUNT."""
    items = analytics.findings(db, None, None, None, 1000, 0).items  # already worst first
    by_ghat: dict[str, list] = {}
    for f in items:
        by_ghat.setdefault(f.ghat_id, []).append(f)
    picked: list = []
    while len(picked) < SAMPLE_COUNT and any(by_ghat.values()):
        for queue in by_ghat.values():
            if queue and len(picked) < SAMPLE_COUNT:
                picked.append(queue.pop(0))
    return picked


def seed_demo(db: Session) -> int:
    """Create the sample review cases; returns how many were created (0 when skipped)."""
    if not users.demo_cases_enabled():
        return 0
    if not db.scalar(select(func.count()).select_from(Reading)):
        return 0
    if db.scalar(select(func.count()).select_from(ReviewCase).where(ReviewCase.created_by == SEED_EMAIL)):
        return 0
    picked = _pick_findings(db)
    if not picked:
        return 0
    if not users.get_by_email(db, WORKER_EMAIL):
        acc = next(a for a in users.DEMO_ACCOUNTS if a["email"] == WORKER_EMAIL)
        # Outside development there must be no well-known credential: the worker gets a random unusable password.
        password = acc["password"] if users.demo_enabled() else secrets.token_urlsafe(32)
        users.create_user(db, acc["name"], acc["email"], password, acc["role"])
    created = 0
    for finding, (status, assign) in zip(picked, PLAN):
        r = finding.reading
        action = (f"Verify the recorded {r.parameter} measurement against the MPPCB report "
                  f"({finding.ghat_name}, {r.sample_period or r.sample_year}).")
        case = cases.create_case(db, CaseCreate(
            ghat_id=finding.ghat_id, reading_ids=[r.id], recommended_action=action,
            notes=f"{PREFIX}{r.parameter} recorded as {r.value:g} {r.unit or ''} is outside the class B criterion; "
                  "sample case for demonstration."), SEED_EMAIL)
        if assign:
            cases.update_case(db, case.id, CaseUpdate(assigned_to=WORKER_EMAIL))
        for step in PATHS[status]:
            summary = f"{PREFIX}Re-checked against the MPPCB page; value confirmed" if step == "resolved" else None
            cases.update_case(db, case.id, CaseUpdate(status=step, resolution_summary=summary))
        created += 1
    log.info("Created %d demo sample cases.", created)
    return created
