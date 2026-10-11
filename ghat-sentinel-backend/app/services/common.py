from datetime import date, datetime, timezone

from app.exceptions import UnprocessableError

FESTIVAL_ORDER = {"Ganesh": 0, "Durga": 1}  # Ganesh immersion (Sep) precedes Durga (Oct) within a year
PHASE_ORDER = {"pre": 0, "during": 1, "after": 2}
PHASE_LABEL_EN = {"pre": "pre-immersion", "during": "during immersion", "after": "one week after"}
PHASE_LABEL_HI = {"pre": "विसर्जन से पहले", "during": "विसर्जन के दौरान", "after": "एक सप्ताह बाद"}

GENERAL_LIMITATIONS = [
    "Data are historical MPPCB immersion-season samples (2023-2025) and do not describe current water conditions.",
    "The source reports give year, festival and sampling phase only; exact sample dates are not available.",
    "Units are assumed by the dataset curators; the original PDF reports print no units.",
    "A blank / 'not sampled' value is missing data, never 'clean'. BDL/ND means below detection, not zero.",
    "Priorities are a project-defined review heuristic, not an official CPCB classification.",
]


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_now() -> str:
    return utcnow().isoformat(timespec="seconds") + "Z"


def sample_period(year: int, festival: str, phase: str | None = None) -> str:
    return f"{year} {festival}" + (f" ({phase})" if phase else "")


def season_key(year: int, festival: str) -> tuple[int, int]:
    return (year, FESTIVAL_ORDER.get(festival, 9))


def year_bounds(start: date | None, end: date | None, as_of: date | None = None) -> tuple[int | None, int | None]:
    """Source data only has years, so date filters are applied at year granularity."""
    if start and end and start > end:
        raise UnprocessableError("start_date must not be after end_date.")
    lo = start.year if start else None
    hi = end.year if end else None
    if as_of:
        hi = as_of.year if hi is None else min(hi, as_of.year)
    return lo, hi
