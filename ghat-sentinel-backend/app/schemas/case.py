from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import CaseStatus, Page, PriorityLevel


class CaseCreate(BaseModel):
    ghat_id: str
    reading_ids: list[str] = Field(default_factory=list, max_length=100)
    recommended_action: str = Field(min_length=3, max_length=1000)
    notes: str = Field("", max_length=4000)


class CaseUpdate(BaseModel):
    status: CaseStatus | None = None
    assigned_to: str | None = Field(None, max_length=120)
    notes: str | None = Field(None, max_length=4000)
    resolution_summary: str | None = Field(None, max_length=4000)


class ReviewCase(BaseModel):
    id: str
    ghat_id: str
    reading_ids: list[str]
    created_at: datetime
    updated_at: datetime
    priority_level: PriorityLevel | None
    recommended_action: str
    status: CaseStatus
    assigned_to: str | None
    notes: str
    resolution_summary: str | None


class CaseList(Page):
    items: list[ReviewCase]
