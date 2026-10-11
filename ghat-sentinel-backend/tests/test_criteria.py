from types import SimpleNamespace as NS

import pytest

from app.exceptions import UnprocessableError
from app.services import criteria as crit


def reading(value, unit="mg/l", flag=None, parameter="Dissolved oxygen"):
    return NS(id="r1", parameter=parameter, value=value, unit=unit, flag=flag, sample_year=2024, festival="Durga",
              phase="during", sample_date=None)


def criterion(op, t, upper=None, unit="mg/l"):
    return NS(id="c1", cpcb_class="B", intended_use="Outdoor bathing (organised)", parameter="Dissolved oxygen",
              comparison_operator=op, threshold=t, threshold_upper=upper, unit=unit, source_reference="CPCB test ref")


def test_inside_and_outside_min_threshold():
    c = criterion(">=", 5.0)
    assert crit.evaluate(reading(6.0), c).result == "within_criterion"
    out = crit.evaluate(reading(2.0), c)
    assert out.result == "outside_criterion" and out.relative_exceedance == 0.6


def test_equality_boundaries():
    assert crit.evaluate(reading(5.0), criterion(">=", 5.0)).result == "within_criterion"
    assert crit.evaluate(reading(5.0), criterion(">", 5.0)).result == "outside_criterion"
    assert crit.evaluate(reading(3.0), criterion("<=", 3.0)).result == "within_criterion"
    assert crit.evaluate(reading(3.0), criterion("<", 3.0)).result == "outside_criterion"


def test_range_inclusive_and_exclusive():
    inc, exc = criterion("between_inclusive", 6.5, 8.5, unit=""), criterion("between_exclusive", 6.5, 8.5, unit="")

    def ph(v):
        return reading(v, unit="pH", parameter="pH")

    assert crit.evaluate(ph(6.5), inc).result == "within_criterion"
    assert crit.evaluate(ph(8.5), inc).result == "within_criterion"
    assert crit.evaluate(ph(6.5), exc).result == "outside_criterion"
    assert crit.evaluate(ph(9.0), inc).result == "outside_criterion"
    assert crit.evaluate(ph(6.0), inc).result == "outside_criterion"


def test_missing_reading_is_insufficient_not_clean():
    for flag in (None, "not sampled", "BDL"):
        res = crit.evaluate(reading(None, flag=flag), criterion(">=", 5.0))
        assert res.result == "insufficient_data" and res.observed_value is None


def test_incompatible_unit_is_not_comparable():
    res = crit.evaluate(reading(10.0, unit="mg/kg"), criterion(">=", 5.0))
    assert res.result == "not_comparable" and "not comparable" in res.reason


def test_documented_unit_equivalences():
    c = criterion("<=", 2250.0, unit="micromhos/cm")
    assert crit.evaluate(reading(1000, unit="µS/cm", parameter="Conductivity"), c).result == "within_criterion"
    assert crit.normalize_unit("pH") == crit.normalize_unit("") == "dimensionless"


def test_no_criterion_is_not_comparable():
    res = crit.evaluate(reading(1.0, parameter="Zinc"), None, "B")
    assert res.result == "not_comparable" and res.criterion_id is None


def test_every_result_references_source():
    res = crit.evaluate(reading(6.0), criterion(">=", 5.0))
    assert res.source_reference == "CPCB test ref" and res.criterion_id == "c1"
    assert res.threshold == 5.0 and res.comparison_operator == ">="


def test_class_is_explicit_and_validated(db):
    with pytest.raises(UnprocessableError):
        crit.check_class("Z")
    assert set(crit.criteria_index(db, "B")) == {"pH", "Dissolved oxygen", "BOD", "Total coliform"}
    assert "Conductivity" in crit.criteria_index(db, "E") and "Conductivity" not in crit.criteria_index(db, "B")
