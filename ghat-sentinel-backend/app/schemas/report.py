from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.case import ReviewCase
from app.schemas.common import Language
from app.schemas.ghat import RankedGhat
from app.schemas.reading import ComparisonResult, Criterion, Reading
from app.schemas.forecast import Oct20Outlook


class ReportRequest(BaseModel):
    ghat_ids: list[str] | None = Field(None, max_length=10, description="Null/empty = all ghats")
    start_date: date | None = None
    end_date: date | None = None
    language: Language = "en"
    format: Literal["json", "csv"] = "json"


class ReportGhatSection(BaseModel):
    ghat_id: str
    ghat_name: str
    water_body: str | None
    readings: list[Reading]
    comparisons: list[ComparisonResult]
    priority: RankedGhat
    exceedance_counts_by_parameter: dict[str, dict[str, int]]
    cases: list[ReviewCase]


class Report(BaseModel):
    title: str
    generated_at: str
    language: Language
    selection: dict
    categories_note: str
    criteria: list[Criterion]
    criteria_selection_note: str
    calculations: list[str]
    sections: list[ReportGhatSection]
    historical_context: list[str]
    outlook: Oct20Outlook | None
    ai_explanations: list[str]
    limitations: list[str]
