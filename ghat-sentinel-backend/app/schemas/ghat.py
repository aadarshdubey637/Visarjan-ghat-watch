from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import Page, PriorityLevel
from app.schemas.reading import Reading


class GhatSummary(BaseModel):
    id: str
    name: str
    water_body: str | None = None
    latitude: float | None = Field(None, description="Null: coordinates are not in the source data")
    longitude: float | None = None
    last_sample_date: date | None = Field(None, description="Null: source has no exact dates; see last_sample_year")
    last_sample_year: int | None = None
    first_sample_year: int | None = None
    observation_count: int = 0
    data_status: Literal["historical", "no_data"] = "historical"
    data_status_note: str = "Historical MPPCB immersion-season samples; not live monitoring."


class GhatList(Page):
    items: list[GhatSummary]


class ParameterInfo(BaseModel):
    parameter: str
    unit: str | None
    observation_count: int
    numeric_count: int
    missing_count: int
    censored_count: int
    first_year: int | None
    last_year: int | None


class DataQuality(BaseModel):
    completeness: float | None = Field(description="Share of rows with a numeric value or BDL/ND flag (0-1)")
    numeric_count: int
    missing_count: int
    censored_count: int
    seasons_covered: list[str]
    seasons_missing: list[str]
    site_match_confidence: str | None
    warnings: list[str]


class GhatDetail(GhatSummary):
    parameters: list[ParameterInfo]
    cpcb_class: str = Field(description="Class used for the `evaluation` on latest_readings")
    latest_readings: list[Reading] = Field(description="Most recent season per parameter, all phases, with evaluation")
    data_quality: DataQuality
    limitations: list[str]


class FactorOut(BaseModel):
    name: str
    label: str
    raw_value: float | None
    max_points: float
    points: float
    explanation: str


class RankedGhat(BaseModel):
    ghat_id: str
    ghat_name: str
    priority_level: PriorityLevel
    priority_score: float | None
    factors: list[FactorOut]
    reasons: list[str]
    last_sample_date: date | None = None
    last_sample_year: int | None = None
    data_completeness: float | None
    limitations: list[str]
    cpcb_class: str
    evaluated_reading_count: int
    outside_reading_ids: list[str] = Field(default_factory=list, description="Readings outside the criterion")


class RankedResponse(BaseModel):
    items: list[RankedGhat]
    method: str
    cpcb_class: str
    intended_use: str | None
    as_of: date
    disclaimer: str
