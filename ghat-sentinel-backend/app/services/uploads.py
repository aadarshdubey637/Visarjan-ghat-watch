"""Officer uploads: site photos / report files (evidence) and new lab-result CSVs (readings).

Nothing here trusts the client: file types are sniffed from the bytes, sizes are capped, names are sanitised, and CSV
rows go through the same validation as the MPPCB import. A CSV is previewed first; only `commit=true` writes.
"""
from __future__ import annotations

import hashlib
import io
import re
import secrets
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, UnprocessableError
from app.models import DataSource, EvidenceFile, Ghat, Place, Reading
from app.schemas.places import EvidenceList, EvidenceOut, ImportReport
from app.services import ingestion

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_REPORT_BYTES = 8 * 1024 * 1024
MAX_CSV_BYTES = 8 * 1024 * 1024
MAX_CSV_ROWS = 20000
# Minimal columns for a new lab CSV; the other MPPCB columns are optional and filled with blanks.
CSV_REQUIRED = ["year", "festival", "site", "phase", "parameter", "value"]
CSV_OPTIONAL = ["water_body", "unit_assumed", "flag", "value_as_printed", "site_match_confidence", "source_page"]
TEMPLATE_HEADER = ",".join(CSV_REQUIRED + CSV_OPTIONAL) + "\n"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def safe_name(name: str | None, fallback: str = "upload") -> str:
    base = (name or fallback).replace("\\", "/").rsplit("/", 1)[-1]
    base = re.sub(r"[^A-Za-z0-9._ -]+", "_", base).strip(" .") or fallback
    return base[:120]


def sniff(data: bytes) -> tuple[str, str] | None:
    """Return (kind, content_type) from the leading bytes, or None if the type is not allowed."""
    if data[:3] == b"\xff\xd8\xff":
        return "image", "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image", "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image", "image/webp"
    if data[:5] == b"%PDF-":
        return "report", "application/pdf"
    if b"\x00" not in data[:4096]:
        try:
            data[:65536].decode("utf-8-sig")
            return "report", "text/plain"  # csv / txt lab notes; always served as plain text, never as HTML
        except UnicodeDecodeError:
            pass
    return None


def _to_out(e: EvidenceFile, ghat_names: dict[str, str]) -> EvidenceOut:
    return EvidenceOut(id=e.id, kind=e.kind, filename=e.filename, content_type=e.content_type, size_bytes=e.size_bytes,
                       ghat_id=e.ghat_id, ghat_name=ghat_names.get(e.ghat_id) if e.ghat_id else None,
                       place_id=e.place_id, latitude=e.latitude, longitude=e.longitude, note=e.note,
                       uploaded_by=e.uploaded_by, created_at=e.created_at)


def save_evidence(db: Session, data: bytes, filename: str | None, ghat_id: str | None, place_id: str | None,
                  latitude: float | None, longitude: float | None, note: str | None, email: str) -> EvidenceOut:
    if not data:
        raise UnprocessableError("The file is empty.", "EMPTY_FILE")
    found = sniff(data)
    if found is None:
        raise UnprocessableError("Unsupported file. Upload a JPG, PNG or WebP photo, or a PDF, CSV or text report.",
                                 "UNSUPPORTED_FILE_TYPE")
    kind, content_type = found
    limit = MAX_IMAGE_BYTES if kind == "image" else MAX_REPORT_BYTES
    if len(data) > limit:
        raise UnprocessableError(f"File is too large (max {limit // (1024 * 1024)} MB for this type).", "FILE_TOO_LARGE")
    if ghat_id and db.get(Ghat, ghat_id) is None:
        raise NotFoundError("No ghat with that ID.", "GHAT_NOT_FOUND")
    if place_id and db.get(Place, place_id) is None:
        raise NotFoundError("No place with that ID.", "PLACE_NOT_FOUND")
    if (latitude is None) != (longitude is None):
        raise UnprocessableError("Give both latitude and longitude, or neither.", "INVALID_LOCATION")
    if latitude is not None and not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise UnprocessableError("Latitude or longitude is out of range.", "INVALID_LOCATION")
    e = EvidenceFile(id=f"ev_{secrets.token_hex(5)}", kind=kind, filename=safe_name(filename), content_type=content_type,
                     size_bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), data=data, ghat_id=ghat_id,
                     place_id=place_id, latitude=latitude, longitude=longitude,
                     note=(note or "").strip()[:1000] or None, uploaded_by=email, created_at=_now())
    db.add(e)
    db.commit()
    return _to_out(e, {g.id: g.name for g in db.scalars(select(Ghat).where(Ghat.id == ghat_id))} if ghat_id else {})


def list_evidence(db: Session, ghat_id: str | None, kind: str | None, limit: int, offset: int) -> EvidenceList:
    q = select(EvidenceFile)
    if ghat_id:
        q = q.where(EvidenceFile.ghat_id == ghat_id)
    if kind:
        q = q.where(EvidenceFile.kind == kind)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = list(db.scalars(q.order_by(EvidenceFile.created_at.desc()).limit(limit).offset(offset)))
    names = {g.id: g.name for g in db.scalars(select(Ghat))}
    return EvidenceList(items=[_to_out(e, names) for e in rows], total=total)


def get_evidence_file(db: Session, evidence_id: str) -> EvidenceFile:
    e = db.get(EvidenceFile, evidence_id)
    if e is None:
        raise NotFoundError("No file with that ID.", "FILE_NOT_FOUND")
    return e


# ---------------------------------------------------------------------------- readings CSV
def import_readings_csv(db: Session, data: bytes, filename: str | None, commit: bool, email: str) -> ImportReport:
    if not data:
        raise UnprocessableError("The file is empty.", "EMPTY_FILE")
    if len(data) > MAX_CSV_BYTES:
        raise UnprocessableError("CSV is too large (max 8 MB).", "FILE_TOO_LARGE")
    name = safe_name(filename, "readings.csv")
    sha = hashlib.sha256(data).hexdigest()
    source_file = f"upload-{sha[:10]}-{name}"[:120]
    try:
        df = pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False, encoding="utf-8-sig")
    except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise UnprocessableError(f"Could not read this file as a CSV: {exc.__class__.__name__}.", "INVALID_CSV") from exc
    df.columns = [str(c).strip() for c in df.columns]
    if len(df) > MAX_CSV_ROWS:
        raise UnprocessableError(f"Too many rows (max {MAX_CSV_ROWS}).", "TOO_MANY_ROWS")
    missing = [c for c in CSV_REQUIRED if c not in df.columns]
    if missing:
        raise UnprocessableError(f"Missing required columns: {missing}. Download the template for the layout.",
                                 "MISSING_COLUMNS")
    for col in CSV_OPTIONAL:
        if col not in df.columns:
            df[col] = df["value"] if col == "value_as_printed" else ""
    rows, rep = ingestion.validate_bhopal(df, name)

    existing_ids = set(db.scalars(select(Ghat.id)))
    ghat_names: dict[str, str] = {}
    for r in rows:
        ghat_names[ingestion.ghat_id_for(r["site"])] = r["site"]
    new_ghats = sorted(n for gid, n in ghat_names.items() if gid not in existing_ids)
    old_ghats = sorted(n for gid, n in ghat_names.items() if gid in existing_ids)

    taken = set(db.execute(select(Reading.ghat_id, Reading.sample_year, Reading.festival, Reading.phase,
                                  Reading.parameter).where(Reading.ghat_id.in_(list(ghat_names) or [""]))).all())
    fresh, skipped = [], 0
    for r in rows:
        key = (ingestion.ghat_id_for(r["site"]), r["sample_year"], r["festival"], r["phase"], r["parameter"])
        # re-uploading the same file is a no-op (ids are stable), and an existing site/season/parameter is never doubled
        if key in taken:
            skipped += 1
        else:
            fresh.append(r)
    warnings = list(rep["warnings"])
    if skipped:
        warnings.append(f"{skipped} rows were skipped because a reading for that site, year, festival, phase and "
                        "parameter already exists.")
    if rep["year_range"] and rep["year_range"][0] < 2023:
        warnings.append("Years before 2023 are outside the MPPCB dataset; they are accepted but check them.")
    new_ghats = sorted({r["site"] for r in fresh if ingestion.ghat_id_for(r["site"]) not in existing_ids})
    old_ghats = sorted({r["site"] for r in fresh if ingestion.ghat_id_for(r["site"]) in existing_ids})
    errors = list(rep["errors"])
    if not fresh and not errors:
        warnings.append("Nothing new to import from this file.")

    if commit and not errors and fresh:
        bodies: dict[str, list] = {}
        for r in fresh:
            bodies.setdefault(ingestion.ghat_id_for(r["site"]), []).append(r["water_body"])
        new_ids = [gid for gid in bodies if gid not in existing_ids]
        # only INSERT new ghats: the shared upsert would overwrite an existing ghat's name and coordinates
        ingestion._upsert(db, Ghat, [{"id": gid, "name": ghat_names[gid], "water_body": ingestion._water_body(bodies[gid]),
                                      "latitude": None, "longitude": None, "site_match_confidence": None}
                                     for gid in new_ids])
        ingestion._upsert(db, Reading, [{
            "id": f"up{sha[:8]}-{r['row_no']:05d}", "ghat_id": ingestion.ghat_id_for(r["site"]),
            "sample_year": r["sample_year"], "festival": r["festival"], "phase": r["phase"], "sample_date": None,
            "parameter": r["parameter"], "value": r["value"], "unit": r["unit"], "flag": r["flag"],
            "value_as_printed": r["value_as_printed"], "source_file": source_file,
            "source_record_id": str(r["row_no"]), "source_page": r["source_page"],
        } for r in fresh])
        src = db.scalar(select(DataSource).where(DataSource.file_name == source_file)) or DataSource(
            file_name=source_file)
        src.source_url = None
        src.retrieved_at = _now()
        src.sha256 = sha
        src.imported_at = _now()
        src.row_count, src.valid_row_count, src.invalid_row_count = rep["row_count"], len(fresh), rep["invalid_row_count"]
        src.validation_report = {**rep, "uploaded_by": email, "original_file_name": name, "skipped_existing": skipped}
        db.add(src)
        db.commit()

    return ImportReport(
        committed=bool(commit and not errors and fresh), file_name=name, source_file=source_file,
        row_count=rep["row_count"], valid_row_count=rep["valid_row_count"], invalid_row_count=rep["invalid_row_count"],
        duplicate_count=rep["duplicate_count"], new_readings=len(fresh), skipped_existing=skipped,
        new_ghats=new_ghats, existing_ghats=old_ghats, year_range=rep["year_range"], warnings=warnings,
        errors=errors, exclusions=rep["exclusions"][:50])
