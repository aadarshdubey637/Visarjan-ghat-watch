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


def test_ghat_detail_latest_readings_carry_evaluation(client):
    g = client.get(f"{P}/ghats/{GHAT_A}").json()
    assert g["cpcb_class"] == "B" and g["latest_readings"]
    assert all(r["evaluation"] is not None for r in g["latest_readings"])
    bod = [r for r in g["latest_readings"] if r["parameter"] == "BOD" and r["phase"] == "during"][0]
    assert bod["sample_year"] == 2024 and bod["evaluation"]["result"] == "insufficient_data"  # not sampled
    assert client.get(f"{P}/ghats/{GHAT_A}", params={"cpcb_class": "Z"}).status_code == 422


def test_findings_are_outside_criterion_only_and_sorted(client):
    f = client.get(f"{P}/analytics/findings", params={"limit": 100}).json()
    assert f["total"] == 10 and f["cpcb_class"] == "B" and len(f["items"]) == 10
    assert all(i["reading"]["evaluation"]["result"] == "outside_criterion" for i in f["items"])
    rel = [i["reading"]["evaluation"]["relative_exceedance"] for i in f["items"]]
    assert rel == sorted(rel, reverse=True) and f["items"][0]["reading"]["value"] == 0.0
    assert f["items"][0]["ghat_name"] == "Test Ghat A"


def test_findings_filters_and_pagination(client):
    a = client.get(f"{P}/analytics/findings", params={"ghat_id": GHAT_B}).json()
    assert a["total"] == 2 and {i["ghat_id"] for i in a["items"]} == {GHAT_B}
    bod = client.get(f"{P}/analytics/findings", params={"parameter": "bod"}).json()
    assert bod["total"] == 3 and all(i["reading"]["parameter"] == "BOD" for i in bod["items"])
    p1 = client.get(f"{P}/analytics/findings", params={"limit": 4}).json()
    p2 = client.get(f"{P}/analytics/findings", params={"limit": 4, "offset": 4}).json()
    assert len(p1["items"]) == 4 and not {i["reading"]["id"] for i in p1["items"]} & {i["reading"]["id"] for i in p2["items"]}
    assert client.get(f"{P}/analytics/findings", params={"ghat_id": "nope"}).status_code == 404
    assert client.get(f"{P}/analytics/findings", params={"limit": 500}).status_code == 422


def test_criteria_endpoint(client):
    j = client.get(f"{P}/criteria").json()
    assert len(j["items"]) == 19 and set(j["classes"]) == {"A", "B", "C", "D", "E"} and j["default_cpcb_class"] == "B"
    b = client.get(f"{P}/criteria", params={"cpcb_class": "B"}).json()["items"]
    assert {c["parameter"] for c in b} == {"Total coliform", "pH", "Dissolved oxygen", "BOD (5 days 20C)"}
    assert all(c["source_reference"] and c["comparison_operator"] for c in b)
    assert client.get(f"{P}/criteria", params={"cpcb_class": "Q"}).status_code == 422


def test_data_quality_lists_missing_seasons(client):
    q = client.get(f"{P}/ghats/{GHAT_B}").json()["data_quality"]
    assert "2019 Durga" in q["seasons_missing"] and q["completeness"] < 1
