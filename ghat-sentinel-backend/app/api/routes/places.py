from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import AUTH_RESPONSES, managers
from app.database import get_db
from app.schemas.auth import AuthUser
from app.schemas.common import ErrorResponse
from app.schemas.places import PlaceCreate, PlaceList, PlaceOut, PlaceUpdate
from app.services import places

router = APIRouter(prefix="/places", tags=["places"])
E = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, **AUTH_RESPONSES}


@router.get("", response_model=PlaceList, summary="Map places: ghats, kunds and hotspots (public, historical)",
            description="Public so citizens and organisers can find the nearest immersion site. Review levels are "
                        "historical, not live. Locations are approximate unless `verified`.")
def list_places(db: Session = Depends(get_db)):
    return places.list_places(db)


@router.post("", response_model=PlaceOut, status_code=201, summary="Add a place (officer)", responses=E)
def create_place(body: PlaceCreate, user: AuthUser = Depends(managers), db: Session = Depends(get_db)):
    return places.create_place(db, body, user.email)


@router.patch("/{place_id}", response_model=PlaceOut, summary="Move, rename, verify or hide a place (officer)",
              responses=E)
def update_place(place_id: str, body: PlaceUpdate, _: AuthUser = Depends(managers), db: Session = Depends(get_db)):
    return places.update_place(db, place_id, body)
