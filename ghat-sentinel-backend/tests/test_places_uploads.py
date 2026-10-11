import io

from app.services import places as places_svc
from tests.conftest import GHAT_A

P = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
HEADER = "year,festival,site,phase,parameter,value\n"


def test_places_seed_list_and_unlocated(client, db):
    assert places_svc.seed_places(db) == 0  # fixture ghats are not in the demo coordinate list
    r = client.get(f"{P}/places").json()
    assert r["items"] == [] and GHAT_A in {g["id"] for g in r["unlocated_ghats"]}


def test_officer_adds_and_moves_a_place(client):
    r = client.post(f"{P}/places", json={"name": "Test Kund", "kind": "kund", "latitude": 23.25, "longitude": 77.4,
                                         "ghat_id": GHAT_A})
    assert r.status_code == 201
    pl = r.json()
    assert pl["review_level"] in {"high", "review", "routine", "insufficient_data"} and pl["verified"] is False
    assert GHAT_A not in {g["id"] for g in client.get(f"{P}/places").json()["unlocated_ghats"]}
    u = client.patch(f"{P}/places/{pl['id']}", json={"verified": True, "latitude": 23.26})
    assert u.status_code == 200 and u.json()["verified"] and u.json()["latitude"] == 23.26
    assert client.patch(f"{P}/places/{pl['id']}", json={}).status_code == 422
    assert client.patch(f"{P}/places/nope", json={"verified": True}).status_code == 404
    bad = client.post(f"{P}/places", json={"name": "X Y", "kind": "ghat", "latitude": 99, "longitude": 0})
    assert bad.status_code == 422
    assert client.patch(f"{P}/places/{pl['id']}", json={"active": False}).status_code == 200
    assert client.get(f"{P}/places").json()["items"] == []


def test_evidence_upload_list_download_and_rejections(client):
    r = client.post(f"{P}/evidence", files={"file": ("../../site photo.png", PNG, "image/png")},
                    data={"ghat_id": GHAT_A, "latitude": "23.25", "longitude": "77.4", "note": "foam near steps"})
    assert r.status_code == 201
    ev = r.json()
    assert ev["kind"] == "image" and ev["filename"] == "site photo.png" and ev["ghat_name"]
    f = client.get(f"{P}/evidence/{ev['id']}/file")
    assert f.status_code == 200 and f.content == PNG and f.headers["content-type"] == "image/png"
    assert client.get(f"{P}/evidence", params={"ghat_id": GHAT_A}).json()["total"] == 1
    # the type comes from the bytes, not from the client's claim
    assert client.post(f"{P}/evidence", files={"file": ("x.png", b"MZ\x90\x00\x03", "image/png")}).status_code == 422
    html = client.post(f"{P}/evidence", files={"file": ("a.html", b"<script>alert(1)</script>", "text/html")})
    assert html.status_code == 201 and html.json()["content_type"] == "text/plain"
    assert client.get(f"{P}/evidence/{html.json()['id']}/file").headers["content-disposition"].startswith("attachment")
    assert client.post(f"{P}/evidence", files={"file": ("e.png", b"", "image/png")}).status_code == 422
    assert client.post(f"{P}/evidence", files={"file": ("p.png", PNG, "image/png")},
                       data={"latitude": "1"}).status_code == 422
    assert client.post(f"{P}/evidence", files={"file": ("p.png", PNG, "image/png")},
                       data={"ghat_id": "nope"}).status_code == 404
    big = b"\xff\xd8\xff" + b"0" * (5 * 1024 * 1024 + 10)
    assert client.post(f"{P}/evidence", files={"file": ("b.jpg", big, "image/jpeg")}).status_code == 422


def _csv(rows):
    return io.BytesIO((HEADER + "".join(rows)).encode())


def test_readings_csv_preview_commit_and_idempotence(client):
    rows = ["2026,Durga,Test Ghat A,pre,pH,7.1\n", "2026,Durga,Brand New Ghat,pre,pH,6.9\n",
            "2026,Durga,Brand New Ghat,pre,BOD,12\n"]
    pre = client.post(f"{P}/uploads/readings", files={"file": ("lab.csv", _csv(rows))}).json()
    assert pre["committed"] is False and pre["new_readings"] == 3 and pre["new_ghats"] == ["Brand New Ghat"]
    names = {g["name"] for g in client.get(f"{P}/ghats").json()["items"]}
    assert "Brand New Ghat" not in names  # a preview writes nothing
    done = client.post(f"{P}/uploads/readings", files={"file": ("lab.csv", _csv(rows))}, data={"commit": "true"}).json()
    assert done["committed"] is True and done["new_readings"] == 3
    ghats = {g["name"]: g for g in client.get(f"{P}/ghats").json()["items"]}
    assert "Brand New Ghat" in ghats and ghats["Brand New Ghat"]["latitude"] is None
    again = client.post(f"{P}/uploads/readings", files={"file": ("lab.csv", _csv(rows))},
                        data={"commit": "true"}).json()
    assert again["committed"] is False and again["new_readings"] == 0 and again["skipped_existing"] == 3


def test_readings_csv_errors_and_bad_rows(client):
    miss = client.post(f"{P}/uploads/readings", files={"file": ("x.csv", io.BytesIO(b"a,b\n1,2\n"))})
    assert miss.status_code == 422 and miss.json()["error"]["code"] == "MISSING_COLUMNS"
    rows = ["2026,Durga,Test Ghat A,pre,pH,abc\n", "2026,Holi,Test Ghat A,pre,pH,7\n", "2026,Durga,,pre,pH,7\n"]
    r = client.post(f"{P}/uploads/readings", files={"file": ("x.csv", _csv(rows))}, data={"commit": "true"}).json()
    assert r["committed"] is False and r["invalid_row_count"] == 3 and r["new_readings"] == 0
    t = client.get(f"{P}/uploads/readings/template")
    assert t.status_code == 200 and t.text.startswith("year,festival,site")
