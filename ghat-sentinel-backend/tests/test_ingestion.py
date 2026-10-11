from sqlalchemy import func, select

from app.models import Criterion, Ghat, Reading, StatewideReading
from app.services import ingestion as ing
from tests.conftest import FIXTURES


def count(db, model):
    return db.scalar(select(func.count()).select_from(model))


def test_loads_supported_schemas(db):
    assert count(db, Ghat) == 3
    assert count(db, Reading) == 69
    assert count(db, StatewideReading) == 75
    assert count(db, Criterion) == 19


def test_ghats_derived_from_data_not_hardcoded(db):
    assert set(db.scalars(select(Ghat.name))) == {"Test Ghat A", "Test Ghat B", "Test Ghat C"}
    assert all(g.latitude is None and g.longitude is None for g in db.scalars(select(Ghat)))


def test_dates_are_years_and_sample_date_stays_null(db):
    r = db.scalars(select(Reading)).first()
    assert isinstance(r.sample_year, int) and r.sample_date is None
    assert r.source_file == "bhopal_ghats_2023_2025.csv" and r.source_record_id.isdigit()


def test_missing_and_censored_values_are_never_zero(db):
    ns = db.scalars(select(Reading).where(Reading.flag == "not sampled")).all()
    bdl = db.scalars(select(Reading).where(Reading.flag == "BDL")).all()
    assert ns and bdl
    assert all(r.value is None for r in ns + bdl)
    assert db.scalar(select(func.count()).select_from(Reading).where(Reading.value == 0)) == 1  # the real DO 0.0


def test_ph_unit_normalised_and_micro_sign_kept(db):
    assert db.scalar(select(Reading.unit).where(Reading.parameter == "pH").limit(1)) == "pH"
    assert db.scalar(select(Reading.unit).where(Reading.parameter == "Conductivity").limit(1)) == "µS/cm"


def test_malformed_rows_are_reported_not_dropped_silently():
    df = ing._read_csv(FIXTURES / "malformed" / "bhopal_ghats_2023_2025.csv")
    rows, rep = ing.validate_bhopal(df)
    assert rep["row_count"] == 7 and rep["valid_row_count"] == 2 and rep["invalid_row_count"] == 5
    assert rep["duplicate_count"] == 1
    reasons = " | ".join(e["reason"] for e in rep["exclusions"])
    for expected in ("invalid year", "unknown phase", "non-numeric value", "missing site", "duplicate"):
        assert expected in reasons
    assert len(rep["exclusions"]) == 5 and all("row" in e for e in rep["exclusions"])
    assert any("no explanatory flag" in w for w in rep["warnings"])
    assert [r["value"] for r in rows] == [3.0, None]  # missing stays None


def test_missing_required_columns_is_an_error():
    df = ing._read_csv(FIXTURES / "malformed" / "missing_cols.csv")
    rows, rep = ing.validate_bhopal(df)
    assert rows == [] and rep["errors"] and "Missing required columns" in rep["errors"][0]


def test_statewide_duplicates_flagged_and_needs_check(db):
    assert db.scalar(select(func.count()).select_from(StatewideReading).where(StatewideReading.is_duplicate)) == 1
    assert db.scalar(select(func.count()).select_from(StatewideReading).where(StatewideReading.needs_check)) == 1


def test_import_is_idempotent(db):
    models = (Ghat, Reading, StatewideReading, Criterion)
    before = [count(db, m) for m in models]
    ing.import_all(db, FIXTURES / "raw")
    ing.import_all(db, FIXTURES / "raw")
    assert before == [count(db, m) for m in models]


def test_criteria_parsed_with_operators(db):
    bod = db.get(Criterion, "cpcb_B_bod_5_days_20c")
    ph = db.get(Criterion, "cpcb_B_ph")
    do = db.get(Criterion, "cpcb_B_dissolved_oxygen")
    assert (bod.comparison_operator, bod.threshold, bod.dataset_parameter) == ("<=", 3.0, "BOD")
    assert (ph.comparison_operator, ph.threshold, ph.threshold_upper) == ("between_inclusive", 6.5, 8.5)
    assert (do.comparison_operator, do.threshold) == (">=", 5.0)
    assert "cpcb.gov.in" in do.source_reference


def test_data_sources_recorded(client):
    meta = client.get("/api/v1/metadata").json()
    names = {s["file_name"] for s in meta["sources"]}
    assert {"bhopal_ghats_2023_2025.csv", "mp_immersion_sites_2023_2025.csv",
            "cpcb_water_quality_criteria.csv"} <= names


def test_missing_file_is_reported_not_faked(db, tmp_path):
    reports = ing.import_all(db, tmp_path)
    assert reports[ing.BHOPAL_FILE]["errors"] and "download_data.py" in reports[ing.BHOPAL_FILE]["errors"][0]
