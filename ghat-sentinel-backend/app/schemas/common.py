from typing import Literal

from pydantic import BaseModel, Field

Language = Literal["en", "hi"]
BriefLanguage = Literal["en", "hi", "bilingual"]
ComparisonOutcome = Literal["within_criterion", "outside_criterion", "insufficient_data", "not_comparable"]
PriorityLevel = Literal["high", "review", "routine", "insufficient_data"]
CaseStatus = Literal["needs_verification", "under_review", "action_assigned", "resolved"]
GenerationMode = Literal["template", "ai"]


class ErrorDetail(BaseModel):
    code: str = Field(examples=["GHAT_NOT_FOUND"])
    message: str
    details: list[dict] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class Page(BaseModel):
    total: int
    limit: int
    offset: int


class EvidenceItem(BaseModel):
    """One traceable fact supplied to a brief / answer. `id` is what AI output may cite."""

    id: str = Field(description="Stable evidence ID (a reading ID, or calc:/guide:/res:/forecast: prefixed ID)")
    type: Literal["observation", "calculation", "guidance", "resource", "forecast"]
    text: str = Field(description="Human-readable statement of the fact")
    ghat_id: str | None = None
    ghat_name: str | None = None
    parameter: str | None = None
    value: float | None = None
    unit: str | None = None
    sample_period: str | None = Field(None, description="e.g. '2025 Ganesh (during)'. The source has no exact dates.")
    source_file: str | None = None
    source_record_id: str | None = None
    source_page: str | None = None
    source_reference: str | None = None


class AIResponse(BaseModel):
    answer: str
    language: Language
    evidence: list[EvidenceItem]
    limitations: list[str]
    generated_at: str
    generation_mode: GenerationMode = "template"
    ai_status: str | None = Field(None, description="Why AI wording was not used, if applicable")
