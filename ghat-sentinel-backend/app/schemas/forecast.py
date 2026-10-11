from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class SeasonValue(BaseModel):
    sample_year: int
    festival: str
    phase: str
    value: float | None
    flag: str | None = None
    reading_ids: list[str] = Field(default_factory=list)
    n_sites: int | None = Field(None, description="Ghats pooled (only when ghat_id is omitted)")


class Uncertainty(BaseModel):
    method: str
    lower: float | None
    upper: float | None
    std: float | None
    note: str


class Oct20Outlook(BaseModel):
    forecast_status: Literal["experimental_estimate", "historical_comparison", "insufficient_data"]
    is_prediction: bool = Field(description="True only for experimental_estimate; never an observed reading")
    target_date: date
    ghat_id: str | None
    parameter: str
    prediction: float | None
    unit: str | None
    method: str | None
    historical_sample_count: int
    date_range_used: list[int] | None = Field(None, description="[first_year, last_year] of seasons used")
    historical_values: list[SeasonValue]
    uncertainty: Uncertainty | None
    assumptions: list[str]
    limitations: list[str]
