from sqlalchemy import update

from app.models import StatewideReading
from tests.conftest import P

URL = f"{P}/analytics/benchmark"
DO = "Dissolved oxygen"


def get(client, **params):
    params.setdefault("parameter", DO)
    return client.get(URL, params=params)


def test_counts_filters_and_statistics(client):
    b = get(client, year=2024).json()
    assert b["comparable"] and b["unit"] == "mg/l"
    assert b["bhopal_sample_count"] == 6 and b["statewide_sample_count"] == 36
    assert b["bhopal"]["median"] == 5.75 and b["bhopal"]["site_count"] == 2
    assert b["bhopal"]["exceedance_count"] == 2 and b["bhopal"]["exceedance_rate"] == 0.3333
    assert b["bhopal"]["years"] == [2024] and b["statewide"]["years"] == [2024]
    assert b["criterion_applied"].startswith("CPCB class B")
    assert b["aggregation_method"] and b["source_coverage"]["bhopal_file"]


def test_exclusions_reported(client):
    b = get(client, year=2024).json()
    ex = b["missing_data_exclusions"]
    assert ex["bhopal_censored"] == 1 and ex["statewide_missing"] == 2 and ex["statewide_duplicates"] == 0
    assert any("BDL" in w for w in b["warnings"])
    dup = get(client, year=2023).json()
    assert dup["missing_data_exclusions"]["statewide_duplicates"] == 1


def test_statewide_excluding_bhopal_office(client):
    b = get(client, year=2024).json()
    other = b["statewide_excluding_bhopal_office"]
    assert other["sample_count"] < b["statewide"]["sample_count"] and other["label"].endswith("R.O. Bhopal")


def test_region_filter(client):
    b = get(client, year=2024, region="R.O. Indore").json()
    assert b["region_stats"]["label"] == "R.O. Indore" and b["region_stats"]["sample_count"] == 12
    r = get(client, year=2024, region="R.O. Nowhere")
    assert r.status_code == 404 and r.json()["error"]["code"] == "REGION_NOT_FOUND"


def test_phase_filter(client):
    b = get(client, year=2024, phase="during").json()
    assert b["bhopal_sample_count"] == 2


def test_no_statewide_data_for_parameter_gives_limitation_not_conclusion(client):
    b = get(client, parameter="pH").json()
    assert b["comparable"] is False and b["statewide"] is None and b["bhopal"] is None
    assert any("no numeric observations" in w or "no comparison" in w for w in b["warnings"])


def test_incompatible_units_not_compared(client, db):
    db.execute(update(StatewideReading).where(StatewideReading.parameter == DO).values(unit="mg/kg"))
    db.commit()
    b = get(client, year=2024).json()
    assert b["comparable"] is False and b["statewide"] is None
    assert any("Incompatible units" in w for w in b["warnings"])


def test_insufficient_sample_blocks_comparison(client, db):
    db.execute(update(StatewideReading).where(StatewideReading.regional_office != "R.O. Bhopal").values(value=None,
                                                                                                         flag="not sampled"))
    db.execute(update(StatewideReading).where(StatewideReading.sample_year == 2024,
                                              StatewideReading.regional_office == "R.O. Bhopal",
                                              StatewideReading.phase != "pre").values(value=None, flag="not sampled"))
    db.commit()
    b = get(client, year=2024).json()
    assert b["comparable"] is False and any("insufficient" in w.lower() or "Fewer than" in w for w in b["warnings"])


def test_unknown_parameter_404_and_missing_parameter_422(client):
    assert get(client, parameter="Unobtainium").status_code == 404
    assert client.get(URL).status_code == 422
