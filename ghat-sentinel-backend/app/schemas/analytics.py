from datetime import date

from pydantic import BaseModel, Field

from app.schemas.common import CaseStatus, Page
from app.schemas.reading import Reading


class TrendPoint(BaseModel):
    reading_id: str
    sample_year: int
    festival: str
    phase: str
    sample_period: str
    value: float | None
    flag: str | None
    source_page: str | None = None


class PeriodSummary(BaseModel):
    sample_year: int
    festival: str
    phase: str
    n: int
    mean: float | None
    median: float | None
    min: float | None
    max: float | None


class TrendSummary(BaseModel):
    festival: str
    phase: str
    supported: bool
    observation_count: int
    start_year: int | None
    end_year: int | None
    method: str
    first_value: float | None = None
    last_value: float | None = None
    change: float | None = None
    direction: str | None = Field(None, description="increase | decrease | unchanged (descriptive only)")
    statistically_tested: bool = False
    limitations: list[str]


class ParameterTrend(BaseModel):
    parameter: str
    unit: str | None
    sample_count: int = Field(description="Observations with a numeric value")
    missing_count: int
    censored_count: int
    start_year: int | None
    end_year: int | None
    series: list[TrendPoint]
    period_summary: list[PeriodSummary]
    trend_summaries: list[TrendSummary]
    limitations: list[str]


class TrendsResponse(BaseModel):
    ghat_id: str
    items: list[ParameterTrend]


class Finding(BaseModel):
    ghat_id: str
    ghat_name: str
    reading: Reading = Field(description="The reading, with its criterion comparison in `reading.evaluation`")


class FindingsPage(Page):
    items: list[Finding]
    cpcb_class: str
    intended_use: str | None
    note: str


class Overview(BaseModel):
    total_ghats: int
    total_readings: int
    numeric_readings: int
    missing_readings: int
    censored_readings: int
    latest_sample_year: int | None
    latest_sample_date: date | None = Field(None, description="Null: source has no exact dates")
    flagged_readings: int = Field(description="Readings outside the applicable criterion (cpcb_class)")
    evaluated_readings: int
    cpcb_class: str
    intended_use: str | None
    cases_by_status: dict[CaseStatus, int]
    data_quality_warnings: list[str]
    statewide_rows: int
    generated_at: str


class StatBlock(BaseModel):
    label: str
    sample_count: int = Field(description="Numeric observations used")
    excluded_missing: int
    excluded_censored: int
    excluded_duplicates: int = 0
    site_count: int | None
    median: float | None
    mean: float | None
    p25: float | None
    p75: float | None
    min: float | None
    max: float | None
    exceedance_count: int | None = None
    exceedance_rate: float | None = None
    years: list[int]


class Benchmark(BaseModel):
    parameter: str
    year: int | None
    region: str | None
    comparable: bool
    unit: str | None
    cpcb_class: str
    criterion_applied: str | None
    aggregation_method: str
    bhopal: StatBlock | None
    statewide: StatBlock | None
    statewide_excluding_bhopal_office: StatBlock | None
    region_stats: StatBlock | None
    bhopal_sample_count: int
    statewide_sample_count: int
    missing_data_exclusions: dict[str, int]
    source_coverage: dict[str, list[str]]
    warnings: list[str]
    limitations: list[str]
