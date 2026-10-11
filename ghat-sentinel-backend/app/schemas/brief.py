from datetime import date

from pydantic import BaseModel, Field

from app.schemas.common import BriefLanguage, EvidenceItem, GenerationMode, Language


class BriefRequest(BaseModel):
    ghat_ids: list[str] | None = Field(None, max_length=10, description="Null/empty = all ghats")
    start_date: date | None = Field(None, description="Only the year is used (source has no exact dates)")
    end_date: date | None = None
    language: Language = "en"
    use_ai: bool = Field(True, description="Use Claude wording when configured; falls back to template")
    require_ai: bool = Field(False, description="Return 503 instead of falling back when AI is unavailable")


class BriefResponse(BaseModel):
    title: str
    content: str
    language: Language
    generated_at: str
    evidence: list[EvidenceItem]
    limitations: list[str]
    generation_mode: GenerationMode
    ai_status: str | None = None
    brief_id: str | None = None


class WhatsAppRequest(BaseModel):
    ghat_ids: list[str] | None = Field(None, max_length=10)
    language: BriefLanguage = "hi"
    include_actions: bool = True
    use_ai: bool = True
    require_ai: bool = False


class WhatsAppResponse(BaseModel):
    content: str
    language: BriefLanguage
    evidence: list[EvidenceItem]
    limitations: list[str]
    generated_at: str
    generation_mode: GenerationMode
    ai_status: str | None = None
    brief_id: str | None = None
