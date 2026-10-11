from tests.conftest import GHAT_A, GHAT_B, P


def test_counts_and_dates(client):
    g = client.get(f"{P}/ghats/{GHAT_A}").json()
    assert g["observation_count"] == 56 and g["first_sample_year"] == 2019 and g["last_sample_year"] == 2024
    assert g["last_sample_date"] is None and g["data_status"] == "historical"
    assert {p["parameter"] for p in g["parameters"]} == {"Dissolved oxygen", "pH", "BOD", "Conductivity"}


def test_parameter_filter_and_provenance(client):
    r = client.get(f"{P}/ghats/{GHAT_A}/readings", params={"parameter": "BOD", "limit": 100}).json()
    assert r["total"] == 18 and all(i["parameter"] == "BOD" for i in r["items"])
    first = r["items"][0]
    assert first["unit"] == "mg/l" and first["source_file"] and first["source_record_id"] and first["source_page"]


def test_year_filter_uses_date_years(client):
    r = client.get(f"{P}/ghats/{GHAT_A}/readings",
                   params={"parameter": "Dissolved oxygen", "start_date": "2023-01-01",
                           "end_date": "2023-12-31"}).json()
    assert r["total"] == 3 and {i["sample_year"] for i in r["items"]} == {2023}


def test_time_series_and_missing_not_zero(client):
    t = client.get(f"{P}/ghats/{GHAT_A}/trends", params={"parameter": "BOD"}).json()["items"][0]
    assert t["sample_count"] == 17 and t["missing_count"] == 1
    missing = [p for p in t["series"] if p["flag"] == "not sampled"]
    assert len(missing) == 1 and missing[0]["value"] is None
    years = [p["sample_year"] for p in t["series"]]
    assert years == sorted(years)
    assert all(ps["n"] >= 1 for ps in t["period_summary"])


def test_trend_summary_only_when_supported(client):
    do = client.get(f"{P}/ghats/{GHAT_A}/trends", params={"parameter": "Dissolved oxygen"}).json()["items"][0]
    durga = next(s for s in do["trend_summaries"] if s["festival"] == "Durga")
    assert durga["supported"] and durga["first_value"] == 6.0 and durga["last_value"] == 3.0
    assert durga["change"] == -3.0 and durga["direction"] == "decrease" and durga["statistically_tested"] is False
    ganesh = next(s for s in do["trend_summaries"] if s["festival"] == "Ganesh")
    assert not ganesh["supported"] and ganesh["direction"] is None and ganesh["limitations"]


def test_trend_unknown_parameter_404(client):
    r = client.get(f"{P}/ghats/{GHAT_A}/trends", params={"parameter": "Zinc"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "PARAMETER_NOT_FOUND"


def test_overview(client):
    o = client.get(f"{P}/analytics/overview").json()
    assert o["total_ghats"] == 3 and o["total_readings"] == 69 and o["latest_sample_year"] == 2024
    assert o["flagged_readings"] == 10 and o["evaluated_readings"] == 64 and o["cpcb_class"] == "B"
    assert o["cases_by_status"] == {"needs_verification": 0, "under_review": 0, "action_assigned": 0, "resolved": 0}
    assert o["missing_readings"] == 2 and o["censored_readings"] == 2
    assert any("Coordinates" in w for w in o["data_quality_warnings"])


def test_evaluate_flag_attaches_comparison(client):
    r = client.get(f"{P}/ghats/{GHAT_B}/readings", params={"parameter": "pH", "evaluate": True}).json()
    assert all(i["evaluation"]["result"] == "within_criterion" for i in r["items"])


def test_data_quality_lists_missing_seasons(client):
    q = client.get(f"{P}/ghats/{GHAT_B}").json()["data_quality"]
    assert "2019 Durga" in q["seasons_missing"] and q["completeness"] < 1
