from datetime import date

from pydantic import BaseModel, Field

from app.schemas.common import EvidenceItem, Language


class CitizenQuestion(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    language: Language = "en"
    ghat_id: str | None = None
    use_ai: bool = True
    require_ai: bool = False


class CitizenGhat(BaseModel):
    ghat_id: str
    name: str
    water_body: str | None
    last_sample_year: int | None
    last_sample_date: date | None
    latest_season: str | None
    latest_season_summary: list[str] = Field(description="Plain statements about the latest recorded values")
    historical_comparison: str
    evaluated_reading_count: int = 0
    historical_exceedance_rate: float | None = Field(
        None, description="Share of past evaluable readings outside CPCB class B limits (0-1). Not a safety ranking.")
    current_conditions: str = "unknown"
    limitations: list[str]


class CitizenGhats(BaseModel):
    items: list[CitizenGhat]
    current_conditions_available: bool = False
    notice: str


class GuidanceItem(BaseModel):
    id: str
    title: str
    body: str
    category: str
    approval_status: str
    basis: str


class Guide(BaseModel):
    language: Language
    items: list[GuidanceItem]
    notice: str


class OfficialResource(BaseModel):
    id: str
    title: str
    url: str
    issuing_organization: str | None
    resource_type: str
    last_verified: str | None
    description: str
    verification_note: str


class Resources(BaseModel):
    items: list[OfficialResource]
    notice: str
