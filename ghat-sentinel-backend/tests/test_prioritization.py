from datetime import date

from app.services.prioritization import rank_ghats
from tests.conftest import GHAT_A, GHAT_C


def get(db, ghat, **kw):
    kw.setdefault("as_of", date(2025, 10, 1))
    return rank_ghats(db, ghat_ids=[ghat], **kw).items[0]


def test_score_is_reproducible_and_exact(db):
    a, b = get(db, GHAT_A), get(db, GHAT_A)
    assert a.priority_score == b.priority_score == 47.7
    assert a.priority_level == "review"
    assert a.evaluated_reading_count == 53 and len(a.outside_reading_ids) == 8


def test_factor_contributions_exposed_and_sum(db):
    a = get(db, GHAT_A)
    f = {x.name: x for x in a.factors}
    assert set(f) == {"exceedance_rate", "severity", "recurrence", "staleness"}
    assert f["severity"].points == 20.0 and f["staleness"].points == 5.0
    assert round(sum(x.points for x in a.factors), 1) == a.priority_score
    assert all(x.explanation for x in a.factors) and a.reasons


def test_insufficient_evidence_never_low_risk(db):
    c = get(db, GHAT_C)
    assert c.priority_level == "insufficient_data" and c.priority_score is None and c.factors == []
    assert "evidence does not support" in c.reasons[0]


def test_changing_evidence_changes_output(db):
    early = get(db, GHAT_A, end_date=date(2020, 12, 31))  # only 2019-2020: no exceedances
    assert early.priority_level == "routine" and early.priority_score == 15.0  # staleness only
    assert early.priority_score < get(db, GHAT_A).priority_score


def test_staleness_depends_on_as_of(db):
    assert get(db, GHAT_A, as_of=date(2024, 6, 1)).priority_score < get(db, GHAT_A).priority_score


def test_ranking_order_and_insufficient_last(db):
    items = rank_ghats(db, as_of=date(2025, 10, 1)).items
    assert items[-1].ghat_id == GHAT_C
    scored = [i.priority_score for i in items if i.priority_score is not None]
    assert scored == sorted(scored, reverse=True)


def test_ranked_endpoint_contract(client):
    r = client.get("/api/v1/ghats/ranked", params={"as_of": "2025-10-01"}).json()
    assert r["cpcb_class"] == "B" and "not official" in r["disclaimer"]
    item = r["items"][0]
    for k in ("ghat_id", "priority_level", "priority_score", "factors", "last_sample_date", "data_completeness",
              "limitations"):
        assert k in item
    assert client.get("/api/v1/ghats/ranked", params={"cpcb_class": "Q"}).status_code == 422
