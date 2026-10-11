"""Download, validate and import the public datasets (idempotent).

Schemas below were taken from the real CSV files (see docs/DATA_DICTIONARY.md):

* Bhopal file : year, festival, site, water_body, phase, parameter, value, unit_assumed, flag,
                value_as_printed, parameter_as_printed, site_as_printed, site_match_confidence, source_page
* Statewide   : year, festival, regional_office, phase, parameter, value, unit_assumed, flag,
                value_as_printed, parameter_as_printed, site_as_printed, needs_check, source_page

The source data has NO exact sample dates: only year + festival + phase (pre / during / after).
`readings.sample_date` therefore stays null; nothing is invented.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.config import RESOURCES_DIR, settings
from app.models import Criterion, DataSource, Ghat, Reading, StatewideReading

log = logging.getLogger("ghat_sentinel.ingestion")

BASE_URL = (
    "https://raw.githubusercontent.com/Vishal4742/bhopal-impact-lab-2026-problem-statements/"
    "main/track-2-visarjan-ghat-watch/data/"
)
BHOPAL_FILE = "bhopal_ghats_2023_2025.csv"
STATE_FILE = "mp_immersion_sites_2023_2025.csv"
CRITERIA_FILE = "cpcb_water_quality_criteria.csv"
SOURCE_URLS = {
    BHOPAL_FILE: BASE_URL + BHOPAL_FILE,
    STATE_FILE: BASE_URL + STATE_FILE,
    CRITERIA_FILE: BASE_URL + CRITERIA_FILE,
}
CPCB_REFERENCE_URL = "https://cpcb.gov.in/water-quality-criteria/"
SOURCES_META = "sources.json"

FESTIVALS = {"Ganesh", "Durga"}
PHASES = {"pre", "during", "after"}
CENSORED_FLAGS = {"BDL", "ND"}  # below detection / not detected: very low, not zero, not missing
BHOPAL_REQUIRED = ["year", "festival", "site", "water_body", "phase", "parameter", "value",
                   "unit_assumed", "flag", "value_as_printed", "source_page"]
STATE_REQUIRED = ["year", "festival", "regional_office", "phase", "parameter", "value",
                  "unit_assumed", "flag", "value_as_printed", "site_as_printed", "needs_check", "source_page"]
CRITERIA_REQUIRED = ["class", "designated_best_use", "parameter", "limit_type", "limit", "unit"]

# dataset parameter -> parameter name used in the CPCB criteria file (explicit, reviewable mapping)
PARAMETER_ALIASES = {
    "BOD": "BOD (5 days 20C)",
    "Conductivity": "Electrical conductivity at 25C",
}
MAX_LISTED_EXCLUSIONS = 200


# --------------------------------------------------------------------------- helpers
def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def ghat_id_for(site: str) -> str:
    return f"ghat_{slugify(site)}"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _read_csv(path: Path) -> pd.DataFrame:
    # keep every cell as text and keep "NA"-like strings (e.g. "na", "ND") as text
    return pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")


def _clean(v: Any) -> str:
    return str(v).strip() if v is not None else ""


# --------------------------------------------------------------------------- download
def download_datasets(dest: Path | None = None, timeout: float = 60.0, force: bool = False) -> list[dict]:
    """Download the public CSVs. Raises RuntimeError with a clear message on failure."""
    dest = dest or settings.raw_data_dir
    dest.mkdir(parents=True, exist_ok=True)
    meta_path = dest / SOURCES_META
    meta = json.loads(meta_path.read_text("utf-8")) if meta_path.exists() else {}
    results = []
    for name, url in SOURCE_URLS.items():
        target = dest / name
        if target.exists() and not force:
            results.append({"file": name, "status": "already_present", "sha256": sha256_of(target)})
            meta.setdefault(name, {"url": url, "retrieved_at": None, "sha256": sha256_of(target)})
            continue
        try:
            resp = httpx.get(url, timeout=timeout, follow_redirects=True)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Failed to download {name} from {url}: {exc}") from exc
        target.write_bytes(resp.content)
        meta[name] = {"url": url, "retrieved_at": now_utc().isoformat() + "Z", "sha256": sha256_of(target)}
        results.append({"file": name, "status": "downloaded", "bytes": len(resp.content), "sha256": meta[name]["sha256"]})
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return results


# --------------------------------------------------------------------------- validation
def _new_report(file_name: str, df: pd.DataFrame | None) -> dict:
    return {
        "file_name": file_name,
        "row_count": 0 if df is None else len(df),
        "valid_row_count": 0,
        "invalid_row_count": 0,
        "duplicate_count": 0,
        "missing_value_counts": {},
        "censored_count": 0,
        "year_range": None,
        "site_count": 0,
        "parameter_count": 0,
        "units_by_parameter": {},
        "warnings": [],
        "errors": [],
        "exclusions": [],
        "source_note": "Units are assumed by the dataset curators; the original reports print no units.",
    }


def _exclude(report: dict, row_no: int, reason: str) -> None:
    report["invalid_row_count"] += 1
    if len(report["exclusions"]) < MAX_LISTED_EXCLUSIONS:
        report["exclusions"].append({"row": row_no, "reason": reason})


def _parse_common(row: dict) -> tuple[dict | None, str | None]:
    """Parse the columns shared by both immersion CSVs. Returns (parsed, error)."""
    try:
        year = int(_clean(row.get("year")))
    except ValueError:
        return None, "invalid year"
    if not 1990 <= year <= 2100:
        return None, f"year out of range: {year}"
    festival, phase, parameter = _clean(row.get("festival")), _clean(row.get("phase")), _clean(row.get("parameter"))
    if festival not in FESTIVALS:
        return None, f"unknown festival '{festival}'"
    if phase not in PHASES:
        return None, f"unknown phase '{phase}'"
    if not parameter:
        return None, "missing parameter"
    raw_value = _clean(row.get("value"))
    value = None
    if raw_value:
        try:
            value = float(raw_value)
        except ValueError:
            return None, f"non-numeric value '{raw_value}'"
        if value != value or value < 0:
            return None, f"invalid value '{raw_value}'"
    flag = _clean(row.get("flag")) or None
    unit = _clean(row.get("unit_assumed")) or None
    if unit is None and parameter == "pH":
        unit = "pH"  # dimensionless; the dataset leaves the unit blank for pH
    return {
        "sample_year": year, "festival": festival, "phase": phase, "parameter": parameter,
        "value": value, "unit": unit, "flag": flag, "source_page": _clean(row.get("source_page")) or None,
        "value_as_printed": _clean(row.get("value_as_printed")) or None,
    }, None


def _finish_report(report: dict, parsed: list[dict], sites: set, df: pd.DataFrame) -> None:
    report["valid_row_count"] = len(parsed)
    years = [p["sample_year"] for p in parsed]
    report["year_range"] = [min(years), max(years)] if years else None
    report["site_count"] = len(sites)
    report["parameter_count"] = len({p["parameter"] for p in parsed})
    report["missing_value_counts"] = {
        "value_empty": sum(1 for p in parsed if p["value"] is None),
        "value_empty_with_flag": sum(1 for p in parsed if p["value"] is None and p["flag"]),
        "value_empty_without_flag": sum(1 for p in parsed if p["value"] is None and not p["flag"]),
        "flag_counts": dict(Counter(p["flag"] for p in parsed if p["flag"])),
    }
    report["censored_count"] = sum(1 for p in parsed if p["flag"] in CENSORED_FLAGS)
    units: dict[str, set] = {}
    for p in parsed:
        units.setdefault(p["parameter"], set()).add(p["unit"] or "")
    report["units_by_parameter"] = {k: sorted(v) for k, v in units.items()}
    for param, us in units.items():
        if len(us) > 1:
            report["warnings"].append(f"Unit inconsistency for '{param}': {sorted(us)}")
    if report["missing_value_counts"]["value_empty_without_flag"]:
        report["warnings"].append(
            f"{report['missing_value_counts']['value_empty_without_flag']} rows have no value and no explanatory flag "
            "(kept as missing)."
        )


def validate_bhopal(df: pd.DataFrame, file_name: str = BHOPAL_FILE) -> tuple[list[dict], dict]:
    report = _new_report(file_name, df)
    missing = [c for c in BHOPAL_REQUIRED if c not in df.columns]
    if missing:
        report["errors"].append(f"Missing required columns: {missing}")
        report["invalid_row_count"] = len(df)
        return [], report
    rows, seen, sites = [], set(), set()
    for i, row in enumerate(df.to_dict("records"), start=1):
        parsed, err = _parse_common(row)
        site = _clean(row.get("site"))
        if parsed is not None and not site:
            err = "missing site"
        if err:
            _exclude(report, i, err)
            continue
        key = (site, parsed["sample_year"], parsed["festival"], parsed["phase"], parsed["parameter"])
        if key in seen:
            report["duplicate_count"] += 1
            _exclude(report, i, "duplicate of an earlier row (same site/year/festival/phase/parameter)")
            continue
        seen.add(key)
        sites.add(site)
        parsed.update(
            row_no=i, site=site, water_body=_clean(row.get("water_body")) or None,
            site_match_confidence=_clean(row.get("site_match_confidence")) or None,
        )
        rows.append(parsed)
    _finish_report(report, rows, sites, df)
    return rows, report


def validate_statewide(df: pd.DataFrame, file_name: str = STATE_FILE) -> tuple[list[dict], dict]:
    report = _new_report(file_name, df)
    missing = [c for c in STATE_REQUIRED if c not in df.columns]
    if missing:
        report["errors"].append(f"Missing required columns: {missing}")
        report["invalid_row_count"] = len(df)
        return [], report
    rows, seen, sites = [], set(), set()
    for i, row in enumerate(df.to_dict("records"), start=1):
        parsed, err = _parse_common(row)
        office = _clean(row.get("regional_office"))
        if parsed is not None and not office:
            err = "missing regional_office"
        if err:
            _exclude(report, i, err)
            continue
        needs_check = _clean(row.get("needs_check")).lower() in {"yes", "true", "1"}
        site_printed = _clean(row.get("site_as_printed")) or None
        is_dup = False
        if not needs_check and site_printed:
            key = (office, parsed["sample_year"], parsed["festival"], parsed["phase"], parsed["parameter"],
                   site_printed, parsed["value_as_printed"])
            if key in seen:
                is_dup = True
                report["duplicate_count"] += 1
            seen.add(key)
        if site_printed and not needs_check:
            sites.add((office, site_printed))
        parsed.update(row_no=i, regional_office=office, needs_check=needs_check,
                      site_as_printed=site_printed, is_duplicate=is_dup)
        rows.append(parsed)
    _finish_report(report, rows, sites, df)
    report["warnings"].append(
        f"{report['duplicate_count']} duplicate rows (tables spanning two pages) are stored but flagged "
        "is_duplicate=true and excluded from benchmarks."
    )
    n_check = sum(1 for r in rows if r["needs_check"])
    if n_check:
        report["warnings"].append(f"{n_check} rows have needs_check=yes (site name unreadable); "
                                  "they count toward region statistics but not site counts.")
    return rows, report


# --------------------------------------------------------------------------- criteria
_RANGE_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$")


def parse_criteria(df: pd.DataFrame) -> tuple[list[dict], dict]:
    report = _new_report(CRITERIA_FILE, df)
    missing = [c for c in CRITERIA_REQUIRED if c not in df.columns]
    if missing:
        report["errors"].append(f"Missing required columns: {missing}")
        return [], report
    out = []
    for i, row in enumerate(df.to_dict("records"), start=1):
        kind, limit = _clean(row["limit_type"]), _clean(row["limit"])
        op = lo = hi = None
        if kind == "max":
            op, lo = "<=", _num(limit)
        elif kind == "min":
            op, lo = ">=", _num(limit)
        elif kind == "range":
            m = _RANGE_RE.match(limit)
            if m:
                op, lo, hi = "between_inclusive", float(m.group(1)), float(m.group(2))
        if op is None or lo is None:
            _exclude(report, i, f"unparseable limit '{limit}' ({kind})")
            continue
        param = _clean(row["parameter"])
        dataset_param = next((k for k, v in PARAMETER_ALIASES.items() if v == param), param)
        out.append({
            "id": f"cpcb_{_clean(row['class'])}_{slugify(param)}",
            "cpcb_class": _clean(row["class"]), "intended_use": _clean(row["designated_best_use"]),
            "parameter": param, "dataset_parameter": dataset_param, "comparison_operator": op,
            "threshold": lo, "threshold_upper": hi, "unit": _clean(row["unit"]) or None,
            "source_reference": f"CPCB water quality criteria, class {_clean(row['class'])} "
                                f"({CRITERIA_FILE} row {i}); {CPCB_REFERENCE_URL}",
        })
    report["valid_row_count"] = len(out)
    report["year_range"] = None
    report["parameter_count"] = len({c["parameter"] for c in out})
    return out, report


def _num(s: str) -> float | None:
    try:
        return float(s)
    except ValueError:
        return None


# --------------------------------------------------------------------------- import
def _upsert(db: Session, model, rows: list[dict], chunk: int = 2000) -> None:
    if not rows:
        return
    cols = [c.name for c in model.__table__.columns if c.name != "id"]
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    for start in range(0, len(rows), chunk):
        part = rows[start:start + chunk]
        stmt = insert(model)
        stmt = stmt.on_conflict_do_update(index_elements=["id"], set_={c: stmt.excluded[c] for c in cols})
        db.execute(stmt, part)


def _water_body(values: list[str | None]) -> str | None:
    cleaned = [re.sub(r"\s*\(as printed.*\)$", "", v) for v in values if v]
    return Counter(cleaned).most_common(1)[0][0] if cleaned else None


def _record_source(db: Session, report: dict, raw_dir: Path, url: str | None) -> None:
    meta_path = raw_dir / SOURCES_META
    meta = json.loads(meta_path.read_text("utf-8")).get(report["file_name"], {}) if meta_path.exists() else {}
    path = raw_dir / report["file_name"]
    rec = db.scalar(select(DataSource).where(DataSource.file_name == report["file_name"])) or DataSource(
        file_name=report["file_name"])
    rec.source_url = meta.get("url") or url
    rec.retrieved_at = datetime.fromisoformat(meta["retrieved_at"].rstrip("Z")) if meta.get("retrieved_at") else None
    rec.sha256 = sha256_of(path) if path.exists() else None
    rec.imported_at = now_utc()
    rec.row_count, rec.valid_row_count = report["row_count"], report["valid_row_count"]
    rec.invalid_row_count = report["invalid_row_count"]
    rec.validation_report = report
    db.add(rec)


def import_bhopal(db: Session, path: Path) -> dict:
    rows, report = validate_bhopal(_read_csv(path), path.name)
    ghat_rows: dict[str, dict] = {}
    for r in rows:
        gid = ghat_id_for(r["site"])
        g = ghat_rows.setdefault(gid, {"id": gid, "name": r["site"], "bodies": [], "conf": set()})
        g["bodies"].append(r["water_body"])
        if r["site_match_confidence"]:
            g["conf"].add(r["site_match_confidence"])
    _upsert(db, Ghat, [{
        "id": g["id"], "name": g["name"], "water_body": _water_body(g["bodies"]),
        "latitude": None, "longitude": None,
        "site_match_confidence": "medium" if "medium" in g["conf"] else ("high" if g["conf"] else None),
    } for g in ghat_rows.values()])
    _upsert(db, Reading, [{
        "id": f"bhopal-{r['row_no']:05d}", "ghat_id": ghat_id_for(r["site"]), "sample_year": r["sample_year"],
        "festival": r["festival"], "phase": r["phase"], "sample_date": None, "parameter": r["parameter"],
        "value": r["value"], "unit": r["unit"], "flag": r["flag"], "value_as_printed": r["value_as_printed"],
        "source_file": path.name, "source_record_id": str(r["row_no"]), "source_page": r["source_page"],
    } for r in rows])
    _record_source(db, report, path.parent, SOURCE_URLS.get(path.name))
    return report


def import_statewide(db: Session, path: Path) -> dict:
    rows, report = validate_statewide(_read_csv(path), path.name)
    _upsert(db, StatewideReading, [{
        "id": f"mp-{r['row_no']:05d}", "regional_office": r["regional_office"], "sample_year": r["sample_year"],
        "festival": r["festival"], "phase": r["phase"], "parameter": r["parameter"], "value": r["value"],
        "unit": r["unit"], "flag": r["flag"], "site_as_printed": r["site_as_printed"],
        "needs_check": r["needs_check"], "is_duplicate": r["is_duplicate"], "source_file": path.name,
        "source_record_id": str(r["row_no"]), "source_page": r["source_page"],
    } for r in rows])
    _record_source(db, report, path.parent, SOURCE_URLS.get(path.name))
    return report


def import_criteria(db: Session, path: Path) -> dict:
    rows, report = parse_criteria(_read_csv(path))
    _upsert(db, Criterion, rows)
    _record_source(db, report, path.parent, SOURCE_URLS.get(path.name))
    return report


def default_criteria_path() -> Path:
    return RESOURCES_DIR / "criteria" / CRITERIA_FILE


def _unchanged(db: Session, path: Path, model) -> bool:
    """True when this file was already imported (same sha256 in data_sources) and its table still has rows."""
    rec = db.scalar(select(DataSource).where(DataSource.file_name == path.name))
    if rec is None or not rec.sha256 or rec.sha256 != sha256_of(path):
        return False
    return db.scalar(select(func.count()).select_from(model)) > 0


def import_all(db: Session, raw_dir: Path | None = None, criteria_path: Path | None = None,
               force: bool = False) -> dict[str, dict]:
    """Import everything that is available. Safe to re-run: rows are upserted by deterministic ID.

    A file whose sha256 matches its data_sources row (and whose table already has rows) is skipped, so restarts
    on a remote database do not re-upsert ~23,000 rows. ``force=True`` imports regardless.
    """
    raw_dir = raw_dir or settings.raw_data_dir
    reports: dict[str, dict] = {}

    def run(path: Path, model, importer) -> dict:
        if not force and _unchanged(db, path, model):
            log.info("%s: unchanged, skipped", path.name)
            rec = db.scalar(select(DataSource).where(DataSource.file_name == path.name))
            return {"file_name": path.name, "skipped": True, "errors": [],
                    "valid_row_count": rec.valid_row_count, "invalid_row_count": rec.invalid_row_count,
                    "duplicate_count": (rec.validation_report or {}).get("duplicate_count", 0)}
        return importer(db, path)

    try:
        crit = criteria_path or (raw_dir / CRITERIA_FILE if (raw_dir / CRITERIA_FILE).exists() else default_criteria_path())
        reports[CRITERIA_FILE] = run(crit, Criterion, import_criteria)
        if (raw_dir / BHOPAL_FILE).exists():
            reports[BHOPAL_FILE] = run(raw_dir / BHOPAL_FILE, Reading, import_bhopal)
        else:
            reports[BHOPAL_FILE] = {"file_name": BHOPAL_FILE, "errors": [f"File not found: {raw_dir / BHOPAL_FILE}. "
                                                                        "Run scripts/download_data.py"]}
        if (raw_dir / STATE_FILE).exists():
            reports[STATE_FILE] = run(raw_dir / STATE_FILE, StatewideReading, import_statewide)
        else:
            reports[STATE_FILE] = {"file_name": STATE_FILE, "errors": [f"File not found: {raw_dir / STATE_FILE}. "
                                                                      "Run scripts/download_data.py"]}
        db.commit()
    except Exception:
        db.rollback()
        raise
    return reports


def has_data(db: Session) -> bool:
    return db.scalar(select(Reading.id).limit(1)) is not None
