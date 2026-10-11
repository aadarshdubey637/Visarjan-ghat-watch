import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import GHAT_A, P

ROUTES_GET = [
    "/health", "/metadata", "/ghats", "/ghats/ranked", f"/ghats/{GHAT_A}", f"/ghats/{GHAT_A}/readings",
    f"/ghats/{GHAT_A}/trends", "/analytics/overview", "/analytics/benchmark?parameter=Dissolved%20oxygen",
    "/predict/oct20", "/analytics/findings", "/criteria", "/citizen/ghats", "/citizen/guide", "/citizen/resources", "/cases",
]


def test_health_and_metadata(client):
    h = client.get(f"{P}/health").json()
    assert h["status"] == "ok" and h["data_loaded"] is True and h["ghats_loaded"] == 3 and h["ai_configured"] is False
    m = client.get(f"{P}/metadata").json()
    assert m["total_ghats"] == 3 and m["year_range"] == [2019, 2024] and m["default_cpcb_class"] == "B"
    assert "outside_criterion" in m["enums"]["comparison_result"] and m["docs_url"] == "/docs"
    assert {p["parameter"] for p in m["parameters"]} >= {"BOD", "pH"}
    assert "sk-ant" not in str(m) and "test-key" not in str(m)


@pytest.mark.parametrize("path", ROUTES_GET)
def test_every_get_route_returns_200_json(client, path):
    r = client.get(P + path)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")


def test_post_routes_return_expected_status(client):
    assert client.post(f"{P}/brief/generate", json={}).status_code == 200
    assert client.post(f"{P}/brief/whatsapp", json={}).status_code == 200
    assert client.post(f"{P}/citizen/ask", json={"question": "How to reduce pollution?"}).status_code == 200
    assert client.post(f"{P}/reports/generate", json={}).status_code == 200


def test_ghat_list_pagination_and_search(client):
    p1 = client.get(f"{P}/ghats", params={"limit": 2}).json()
    p2 = client.get(f"{P}/ghats", params={"limit": 2, "offset": 2}).json()
    assert p1["total"] == p2["total"] == 3 and len(p1["items"]) == 2 and len(p2["items"]) == 1
    assert {i["id"] for i in p1["items"]}.isdisjoint({i["id"] for i in p2["items"]})
    found = client.get(f"{P}/ghats", params={"search": "ghat b"}).json()["items"]
    assert [i["id"] for i in found] == ["ghat_test_ghat_b"]
    item = p1["items"][0]
    assert item["latitude"] is None and item["last_sample_date"] is None and item["data_status"] == "historical"


def test_readings_pagination(client):
    a = client.get(f"{P}/ghats/{GHAT_A}/readings", params={"limit": 10, "offset": 0}).json()
    b = client.get(f"{P}/ghats/{GHAT_A}/readings", params={"limit": 10, "offset": 10}).json()
    assert a["total"] == b["total"] == 56 and len(a["items"]) == len(b["items"]) == 10
    assert {i["id"] for i in a["items"]}.isdisjoint({i["id"] for i in b["items"]})


@pytest.mark.parametrize("path", ["/ghats/nope", "/ghats/nope/readings", "/ghats/nope/trends", "/cases/case_x"])
def test_unknown_resources_404_with_envelope(client, path):
    r = client.get(P + path)
    assert r.status_code == 404 and set(r.json()["error"]) >= {"code", "message"}
    assert "Traceback" not in r.text


@pytest.mark.parametrize("path", [
    "/ghats?limit=0", "/ghats?limit=101", "/ghats?offset=-1", f"/ghats/{GHAT_A}/readings?limit=500",
    f"/ghats/{GHAT_A}/readings?start_date=not-a-date",
    f"/ghats/{GHAT_A}/readings?start_date=2024-01-01&end_date=2023-01-01",
    "/analytics/benchmark", "/predict/oct20?year=abc", "/ghats/ranked?as_of=yesterday", "/cases?limit=0",
])
def test_invalid_inputs_422(client, path):
    r = client.get(P + path)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unknown_route_and_method(client):
    assert client.get(f"{P}/nothing").json()["error"]["code"] == "NOT_FOUND"
    assert client.delete(f"{P}/cases/x").status_code == 405


def test_internal_errors_are_masked():
    @app.get("/boom-test", include_in_schema=False)
    def boom():
        raise RuntimeError("secret internal detail")

    r = TestClient(app, raise_server_exceptions=False).get("/boom-test")
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "INTERNAL_ERROR", "message": "An internal error occurred."}}


def test_report_json_structure(client):
    r = client.post(f"{P}/reports/generate", json={"ghat_ids": [GHAT_A], "language": "en"}).json()
    for k in ("generated_at", "criteria", "calculations", "sections", "limitations", "outlook", "ai_explanations",
              "categories_note", "criteria_selection_note"):
        assert k in r
    s = r["sections"][0]
    assert len(s["readings"]) == 56 and len(s["comparisons"]) == 56 and s["priority"]["ghat_id"] == GHAT_A
    assert s["readings"][0]["source_record_id"] and s["readings"][0]["evaluation"] is not None
    assert s["exceedance_counts_by_parameter"]["Dissolved oxygen"]["outside_criterion"] == 4
    assert r["outlook"]["is_prediction"] is True and r["ai_explanations"] == []
    assert client.post(f"{P}/reports/generate", json={"ghat_ids": ["nope"]}).status_code == 404
    assert client.post(f"{P}/reports/generate", json={"format": "pdf"}).status_code == 422


def test_report_csv_download(client):
    r = client.post(f"{P}/reports/generate", json={"ghat_ids": [GHAT_A], "format": "csv"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("generated_at,ghat_id") and len(lines) == 57
    assert "outside_criterion" in r.text and "bhopal_ghats_2023_2025.csv" in r.text


def test_cors_restricted_to_configured_origin(client):
    ok = client.get(f"{P}/health", headers={"Origin": "http://localhost:3000"})
    bad = client.get(f"{P}/health", headers={"Origin": "http://evil.example"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in bad.headers


def test_request_size_limit(client):
    r = client.post(f"{P}/citizen/ask", content=b"x" * 2_000_000, headers={"Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["error"]["code"] == "REQUEST_TOO_LARGE"


def test_openapi_schema_available(client):
    paths = client.get("/openapi.json").json()["paths"]
    for p in ["/ghats", "/ghats/ranked", "/ghats/{ghat_id}", "/ghats/{ghat_id}/readings", "/ghats/{ghat_id}/trends",
              "/analytics/overview", "/analytics/findings", "/analytics/benchmark", "/criteria", "/predict/oct20",
              "/brief/generate", "/brief/whatsapp",
              "/citizen/ask", "/citizen/ghats", "/citizen/guide", "/citizen/resources", "/cases", "/cases/{case_id}",
              "/reports/generate", "/health", "/metadata"]:
        assert P + p in paths
    assert "patch" in paths[P + "/cases/{case_id}"] and "post" in paths[P + "/cases"]
    assert client.get("/docs").status_code == 200
