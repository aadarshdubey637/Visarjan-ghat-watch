from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Ghat(Base):
    __tablename__ = "ghats"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    water_body: Mapped[str | None] = mapped_column(String(200))
    latitude: Mapped[float | None] = mapped_column(Float)  # never invented; null unless a source supplies it
    longitude: Mapped[float | None] = mapped_column(Float)
    site_match_confidence: Mapped[str | None] = mapped_column(String(20))

    readings: Mapped[list["Reading"]] = relationship(back_populates="ghat")


class Reading(Base):
    __tablename__ = "readings"
    __table_args__ = (
        UniqueConstraint("source_file", "source_record_id", name="uq_reading_source"),
        Index("ix_readings_ghat_param", "ghat_id", "parameter"),
        Index("ix_readings_year", "sample_year"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    ghat_id: Mapped[str] = mapped_column(ForeignKey("ghats.id"), index=True)
    sample_year: Mapped[int] = mapped_column(Integer)
    festival: Mapped[str] = mapped_column(String(20))  # Ganesh | Durga
    phase: Mapped[str] = mapped_column(String(10))  # pre | during | after
    sample_date: Mapped[date | None] = mapped_column(Date)  # source has no exact dates -> null
    parameter: Mapped[str] = mapped_column(String(80), index=True)
    value: Mapped[float | None] = mapped_column(Float)  # null = missing/censored, never zero
    unit: Mapped[str | None] = mapped_column(String(30))
    flag: Mapped[str | None] = mapped_column(String(30))  # BDL, ND, not sampled, *, **, ...
    value_as_printed: Mapped[str | None] = mapped_column(String(50))
    source_file: Mapped[str] = mapped_column(String(120))
    source_record_id: Mapped[str] = mapped_column(String(40))  # CSV data-row number (1-based)
    source_page: Mapped[str | None] = mapped_column(String(20))  # PDF page in the MPPCB report

    ghat: Mapped[Ghat] = relationship(back_populates="readings")


class StatewideReading(Base):
    __tablename__ = "statewide_readings"
    __table_args__ = (
        UniqueConstraint("source_file", "source_record_id", name="uq_state_source"),
        Index("ix_state_param_year", "parameter", "sample_year"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    regional_office: Mapped[str] = mapped_column(String(120), index=True)
    sample_year: Mapped[int] = mapped_column(Integer)
    festival: Mapped[str] = mapped_column(String(20))
    phase: Mapped[str] = mapped_column(String(10))
    parameter: Mapped[str] = mapped_column(String(80))
    value: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(30))
    flag: Mapped[str | None] = mapped_column(String(30))
    site_as_printed: Mapped[str | None] = mapped_column(String(300))
    needs_check: Mapped[bool] = mapped_column(Boolean, default=False)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    source_file: Mapped[str] = mapped_column(String(120))
    source_record_id: Mapped[str] = mapped_column(String(40))
    source_page: Mapped[str | None] = mapped_column(String(20))


class Criterion(Base):
    __tablename__ = "criteria"
    __table_args__ = (Index("ix_criteria_lookup", "cpcb_class", "dataset_parameter"),)

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    cpcb_class: Mapped[str] = mapped_column(String(2))
    intended_use: Mapped[str] = mapped_column(String(300))
    parameter: Mapped[str] = mapped_column(String(120))  # as written in the CPCB file
    dataset_parameter: Mapped[str | None] = mapped_column(String(80))  # mapped dataset parameter name
    comparison_operator: Mapped[str] = mapped_column(String(30))
    threshold: Mapped[float | None] = mapped_column(Float)  # single limit, or lower bound for ranges
    threshold_upper: Mapped[float | None] = mapped_column(Float)  # upper bound for ranges
    unit: Mapped[str | None] = mapped_column(String(30))
    source_reference: Mapped[str] = mapped_column(String(300))


class ReviewCase(Base):
    __tablename__ = "review_cases"
    __table_args__ = (Index("ix_cases_status", "status"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    ghat_id: Mapped[str] = mapped_column(ForeignKey("ghats.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)
    priority_level: Mapped[str | None] = mapped_column(String(30))
    recommended_action: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30))
    assigned_to: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str] = mapped_column(Text, default="")
    resolution_summary: Mapped[str | None] = mapped_column(Text)

    links: Mapped[list["CaseReading"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class CaseReading(Base):
    __tablename__ = "case_readings"

    case_id: Mapped[str] = mapped_column(ForeignKey("review_cases.id"), primary_key=True)
    reading_id: Mapped[str] = mapped_column(ForeignKey("readings.id"), primary_key=True)


class Brief(Base):
    __tablename__ = "briefs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))  # municipal | whatsapp
    language: Mapped[str] = mapped_column(String(20))
    ghat_ids: Mapped[list] = mapped_column(JSON)
    title: Mapped[str | None] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text)
    generation_mode: Mapped[str] = mapped_column(String(20))  # template | ai
    generated_at: Mapped[datetime] = mapped_column(DateTime)
    evidence: Mapped[list] = mapped_column(JSON)
    limitations: Mapped[list] = mapped_column(JSON)


class DataSource(Base):
    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_name: Mapped[str] = mapped_column(String(120), unique=True)
    source_url: Mapped[str | None] = mapped_column(String(500))
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime)
    sha256: Mapped[str | None] = mapped_column(String(64))
    imported_at: Mapped[datetime] = mapped_column(DateTime)
    row_count: Mapped[int] = mapped_column(Integer)
    valid_row_count: Mapped[int] = mapped_column(Integer)
    invalid_row_count: Mapped[int] = mapped_column(Integer)
    validation_report: Mapped[dict] = mapped_column(JSON)
