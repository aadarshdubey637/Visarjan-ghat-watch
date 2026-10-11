from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import AUTH_RESPONSES, managers
from app.config import settings
from app.database import get_db
from app.schemas.auth import AuthUser
from app.schemas.common import ErrorResponse
from app.schemas.places import ImportReport
from app.services import uploads

router = APIRouter(prefix="/uploads", tags=["uploads"])
E = {422: {"model": ErrorResponse}, **AUTH_RESPONSES}


@router.get("/readings/template", summary="CSV template for new lab results (officer)", responses=AUTH_RESPONSES,
            response_class=Response)
def template(_: AuthUser = Depends(managers)):
    return Response(content=uploads.TEMPLATE_HEADER, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="ghat-readings-template.csv"'})


@router.post("/readings", response_model=ImportReport, summary="Preview or import new readings from a CSV (officer)",
             description="Same validation as the MPPCB import. With commit=false (default) nothing is written and a "
                         "report is returned. With commit=true new rows are added; rows that already exist for the "
                         "same site, year, festival, phase and parameter are skipped, so a file can be re-uploaded "
                         "safely. New sites are created without a map location.", responses=E)
async def import_readings(file: UploadFile = File(...), commit: bool = Form(False),
                          user: AuthUser = Depends(managers), db: Session = Depends(get_db)):
    data = await file.read(settings.MAX_UPLOAD_BYTES + 1)
    return uploads.import_readings_csv(db, data, file.filename, commit, user.email)
