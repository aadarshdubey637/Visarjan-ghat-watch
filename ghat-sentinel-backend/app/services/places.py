"""Map places: where people can go, plus an honest note about where each location came from."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, UnprocessableError
from app.models import Ghat, Place
from app.schemas.places import PlaceCreate, PlaceList, PlaceOut, PlaceUpdate, UnlocatedGhat

log = logging.getLogger("ghat_sentinel.places")

DISCLAIMER = ("Map locations are approximate unless marked verified. Review levels come from historical MPPCB samples "
              "(2023-2025), not live monitoring. Confirm a site with the municipal corporation before travelling.")

# Approximate centre of the named site, for the demo only. The source CSVs carry no coordinates, so these are NOT
# from the data: they are flagged `approximate_demo` and unverified until an officer confirms or moves them.
# Sites that are not listed here (e.g. Malikhedi kund) stay unlocated until an officer places them on the map.
APPROX_DEMO = {
    "ghat_khatlapura_ghat": (23.2490, 77.4050),
    "ghat_prempura_ghat": (23.2560, 77.4010),
    "ghat_rani_kamlapati_ghat_kamla_park_kund": (23.2583, 77.3960),
    "ghat_bairagarh_sant_hirdaram_kund": (23.2780, 77.3390),
    "ghat_hathaikheda_dam_kund": (23.1710, 77.4220),
    "ghat_shahpura_lake_ghat": (23.1980, 77.4330),
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def kind_for(name: str) -> str:
    return "kund" if "kund" in name.lower() else "ghat"


def _note(p: Place) -> str:
    if p.verified:
        return "Location confirmed by an officer."
    if p.location_source == "approximate_demo":
        return "Approximate demo location, not from the source data. Confirm on site."
    return "Location added by staff, not yet confirmed."


def _review_levels(db: Session) -> dict[str, str]:
    try:
        from app.services import prioritization
        return {i.ghat_id: i.priority_level for i in prioritization.rank_ghats(db).items}
    except Exception:  # the map must still work if scoring fails
        log.exception("Could not compute review levels for the map")
        return {}


def to_out(p: Place, levels: dict[str, str]) -> PlaceOut:
    return PlaceOut(id=p.id, name=p.name, kind=p.kind, latitude=p.latitude, longitude=p.longitude, ghat_id=p.ghat_id,
                    description=p.description, location_source=p.location_source, verified=p.verified, active=p.active,
                    review_level=levels.get(p.ghat_id) if p.ghat_id else None, location_note=_note(p))


def list_places(db: Session) -> PlaceList:
    levels = _review_levels(db)
    places = list(db.scalars(select(Place).where(Place.active.is_(True)).order_by(Place.name)))
    placed = {p.ghat_id for p in places if p.ghat_id}
    unlocated = [UnlocatedGhat(id=g.id, name=g.name, water_body=g.water_body)
                 for g in db.scalars(select(Ghat).order_by(Ghat.name)) if g.id not in placed]
    return PlaceList(items=[to_out(p, levels) for p in places], unlocated_ghats=unlocated, disclaimer=DISCLAIMER)


def create_place(db: Session, body: PlaceCreate, email: str) -> PlaceOut:
    if body.ghat_id and db.get(Ghat, body.ghat_id) is None:
        raise NotFoundError("No ghat with that ID.", "GHAT_NOT_FOUND")
    p = Place(id=f"pl_{secrets.token_hex(5)}", name=body.name.strip(), kind=body.kind, latitude=body.latitude,
              longitude=body.longitude, ghat_id=body.ghat_id, description=(body.description or "").strip() or None,
              location_source="officer", verified=body.verified, active=True, created_by=email, created_at=_now())
    db.add(p)
    db.commit()
    return to_out(p, _review_levels(db))


def update_place(db: Session, place_id: str, body: PlaceUpdate) -> PlaceOut:
    p = db.get(Place, place_id)
    if p is None:
        raise NotFoundError("No place with that ID.", "PLACE_NOT_FOUND")
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise UnprocessableError("Nothing to update.", "EMPTY_UPDATE")
    if ("latitude" in data or "longitude" in data) and p.location_source == "approximate_demo":
        p.location_source = "officer"  # a person has now set the position
    for k, v in data.items():
        if v is None and k in {"name", "kind", "latitude", "longitude", "verified", "active"}:
            continue
        setattr(p, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return to_out(p, _review_levels(db))


def seed_places(db: Session) -> int:
    """Create approximate demo places for the known ghats that have none. Idempotent."""
    have = {gid for gid in db.scalars(select(Place.ghat_id)) if gid}
    n = 0
    for g in db.scalars(select(Ghat)):
        if g.id in have or g.id not in APPROX_DEMO:
            continue
        lat, lon = APPROX_DEMO[g.id]
        db.add(Place(id=f"pl_{secrets.token_hex(5)}", name=g.name, kind=kind_for(g.name), latitude=lat, longitude=lon,
                     ghat_id=g.id, description=g.water_body and f"Immersion site on {g.water_body}.",
                     location_source="approximate_demo", verified=False, active=True, created_by=None,
                     created_at=_now()))
        n += 1
    if n:
        db.commit()
    return n
