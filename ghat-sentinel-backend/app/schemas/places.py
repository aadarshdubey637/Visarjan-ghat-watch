from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PlaceKind = Literal["ghat", "kund", "hotspot", "water_body"]
LocationSource = Literal["approximate_demo", "officer", "survey"]


class PlaceOut(BaseModel):
    id: str
    name: str
    kind: PlaceKind
    latitude: float
    longitude: float
    ghat_id: str | None = None
    description: str | None = None
    location_source: LocationSource
    verified: bool
    active: bool = True
    review_level: Literal["high", "review", "routine", "insufficient_data"] | None = Field(
        None, description="Historical review priority of the linked ghat (not live monitoring); null if not linked")
    location_note: str


class UnlocatedGhat(BaseModel):
    id: str
    name: str
    water_body: str | None = None


class PlaceList(BaseModel):
    items: list[PlaceOut]
    unlocated_ghats: list[UnlocatedGhat] = Field(description="Ghats in the data that have no map location yet")
    disclaimer: str


def _lat(v: float) -> float:
    if not -90 <= v <= 90:
        raise ValueError("latitude must be between -90 and 90")
    return v


def _lon(v: float) -> float:
    if not -180 <= v <= 180:
        raise ValueError("longitude must be between -180 and 180")
    return v


class PlaceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    kind: PlaceKind
    latitude: float
    longitude: float
    ghat_id: str | None = Field(None, max_length=80)
    description: str | None = Field(None, max_length=1000)
    verified: bool = False

    _v_lat = field_validator("latitude")(_lat)
    _v_lon = field_validator("longitude")(_lon)


class PlaceUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    kind: PlaceKind | None = None
    latitude: float | None = None
    longitude: float | None = None
    description: str | None = Field(None, max_length=1000)
    verified: bool | None = None
    active: bool | None = None

    @field_validator("latitude")
    @classmethod
    def _check_lat(cls, v):
        return v if v is None else _lat(v)

    @field_validator("longitude")
    @classmethod
    def _check_lon(cls, v):
        return v if v is None else _lon(v)


class EvidenceOut(BaseModel):
    id: str
    kind: Literal["image", "report"]
    filename: str
    content_type: str
    size_bytes: int
    ghat_id: str | None = None
    ghat_name: str | None = None
    place_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    note: str | None = None
    uploaded_by: str
    created_at: datetime


class EvidenceList(BaseModel):
    items: list[EvidenceOut]
    total: int


class ImportReport(BaseModel):
    committed: bool
    file_name: str
    source_file: str
    row_count: int
    valid_row_count: int
    invalid_row_count: int
    duplicate_count: int
    new_readings: int = Field(description="Rows that are new and would be (or were) added")
    skipped_existing: int = Field(description="Valid rows skipped because that site/season/parameter already exists")
    new_ghats: list[str]
    existing_ghats: list[str]
    year_range: list[int] | None = None
    warnings: list[str]
    errors: list[str]
    exclusions: list[dict]
