from tests.conftest import GHAT_A, GHAT_B, GHAT_C, P

URL = f"{P}/predict/oct20"


def get(client, **params):
    return client.get(URL, params=params)


def test_adequate_history_gives_labelled_experimental_estimate(client):
    r = get(client, ghat_id=GHAT_A, parameter="Dissolved oxygen", year=2026)
    j = r.json()
    assert r.status_code == 200 and j["target_date"] == "2026-10-20"
    assert j["forecast_status"] == "experimental_estimate" and j["is_prediction"] is True
    assert j["prediction"] == 3.5 and j["unit"] == "mg/l" and j["historical_sample_count"] == 6
    assert j["date_range_used"] == [2019, 2024] and "median" in j["method"]
    assert j["uncertainty"]["lower"] == 0.0 and j["uncertainty"]["upper"] == 6.0 and j["uncertainty"]["std"] > 0
    assert j["assumptions"] and any("not a validated forecast" in x for x in j["limitations"])
    assert len(j["historical_values"]) == 6 and all(h["reading_ids"] for h in j["historical_values"])


def test_sparse_history_gives_comparison_without_prediction(client):
    j = get(client, ghat_id=GHAT_B, parameter="Dissolved oxygen", year=2026).json()
    assert j["forecast_status"] == "historical_comparison" and j["prediction"] is None
    assert j["is_prediction"] is False and j["uncertainty"] is None and j["method"] is None
    assert j["historical_sample_count"] == 2
    assert any("No forecast produced" in x for x in j["limitations"])


def test_no_history_is_insufficient_data(client):
    j = get(client, ghat_id=GHAT_C, parameter="Dissolved oxygen", year=2026).json()
    assert j["forecast_status"] == "insufficient_data" and j["prediction"] is None
    assert j["historical_sample_count"] == 0 and j["target_date"] == "2026-10-20"
    assert any("Insufficient comparable" in x for x in j["limitations"])


def test_only_earlier_seasons_are_used(client):
    j = get(client, ghat_id=GHAT_A, parameter="Dissolved oxygen", year=2022).json()
    assert j["historical_sample_count"] == 3 and j["forecast_status"] == "historical_comparison"
    assert j["date_range_used"] == [2019, 2021]


def test_pooled_selection_never_forecasts(client):
    j = get(client, parameter="Dissolved oxygen", year=2026).json()
    assert j["ghat_id"] is None and j["forecast_status"] == "historical_comparison" and j["prediction"] is None


def test_defaults_and_target_year(client):
    j = get(client).json()
    assert j["parameter"] == "Dissolved oxygen" and j["target_date"].endswith("-10-20")
    assert get(client, year=2031).json()["target_date"] == "2031-10-20"


def test_errors(client):
    assert get(client, ghat_id="nope").status_code == 404
    assert get(client, parameter="Unobtainium").status_code == 404
    assert get(client, year=1800).status_code == 422
