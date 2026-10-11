from datetime import date

from pydantic import BaseModel, Field

from app.schemas.common import ComparisonOutcome, Page


class Criterion(BaseModel):
    id: str
    parameter: str
    intended_use: str
    comparison_operator: str = Field(description="<, <=, >, >=, between_inclusive, between_exclusive")
    threshold: float | None = Field(description="Single limit, or the lower bound for ranges")
    unit: str | None
    source_reference: str
    cpcb_class: str | None = None
    threshold_upper: float | None = Field(None, description="Upper bound for range criteria")


class ComparisonResult(BaseModel):
    reading_id: str
    criterion_id: str | None
    result: ComparisonOutcome
    observed_value: float | None
    unit: str | None
    threshold: float | None
    comparison_operator: str | None
    sample_date: date | None = Field(None, description="Always null for the supplied data (no exact dates)")
    source_reference: str | None
    reason: str
    parameter: str | None = None
    cpcb_class: str | None = None
    threshold_upper: float | None = None
    sample_period: str | None = None
    relative_exceedance: float | None = Field(
        None, description="Distance outside the limit as a fraction of the limit (only when outside_criterion)")


class Reading(BaseModel):
    id: str
    ghat_id: str
    sample_date: date | None = Field(None, description="Null: source reports give year/festival/phase only")
    parameter: str
    value: float | None = Field(None, description="Null when missing or below detection; never zero-filled")
    unit: str | None
    source_file: str
    source_record_id: str
    sample_year: int
    festival: str
    phase: str
    sample_period: str
    flag: str | None = Field(None, description="BDL / ND (censored) or 'not sampled', '*', '**' (missing)")
    value_as_printed: str | None = None
    source_page: str | None = Field(None, description="Page in the MPPCB PDF report")
    evaluation: ComparisonResult | None = Field(None, description="Present when evaluate=true")


class ReadingsPage(Page):
    items: list[Reading]
    limitations: list[str]
