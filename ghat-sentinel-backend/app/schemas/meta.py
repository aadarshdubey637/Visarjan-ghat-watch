from typing import Literal

from pydantic import BaseModel


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    timestamp: str
    database: Literal["ok", "error"]
    data_loaded: bool
    ghats_loaded: int
    readings_loaded: int
    ai_configured: bool
    app: str
    env: str


class ParameterMeta(BaseModel):
    parameter: str
    unit: str | None
    observation_count: int
    cpcb_classes_with_limit: list[str]


class SourceMeta(BaseModel):
    file_name: str
    source_url: str | None
    retrieved_at: str | None
    sha256: str | None
    imported_at: str
    row_count: int
    valid_row_count: int
    invalid_row_count: int
    year_range: list[int] | None
    warnings: list[str]
    errors: list[str]


class Metadata(BaseModel):
    app: str
    version: str
    api_prefix: str
    docs_url: str
    openapi_url: str
    total_ghats: int
    total_readings: int
    year_range: list[int] | None
    parameters: list[ParameterMeta]
    sources: list[SourceMeta]
    cpcb_classes: dict[str, str]
    default_cpcb_class: str
    enums: dict[str, list[str]]
    ai_configured: bool
    date_convention: str
    limitations: list[str]
