from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import AUTH_RESPONSES, staff
from app.config import settings
from app.database import get_db
from app.schemas.auth import AuthUser
from app.schemas.common import ErrorResponse
from app.schemas.places import EvidenceList, EvidenceOut
from app.services import uploads

router = APIRouter(prefix="/evidence", tags=["evidence"])
E = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}, **AUTH_RESPONSES}


@router.post("", response_model=EvidenceOut, status_code=201,
             summary="Upload a site photo or report file (staff)",
             description="JPG/PNG/WebP photos up to 5 MB; PDF/CSV/text reports up to 8 MB. The type is checked from "
                         "the file contents. Optionally link a ghat, a place and a GPS position.", responses=E)
async def upload(file: UploadFile = File(...), ghat_id: str | None = Form(None), place_id: str | None = Form(None),
                 latitude: float | None = Form(None), longitude: float | None = Form(None),
                 note: str | None = Form(None), user: AuthUser = Depends(staff), db: Session = Depends(get_db)):
    data = await file.read(settings.MAX_UPLOAD_BYTES + 1)
    return uploads.save_evidence(db, data, file.filename, ghat_id or None, place_id or None, latitude, longitude, note,
                                 user.email)


@router.get("", response_model=EvidenceList, summary="List uploaded files (staff)", responses=E)
def list_files(ghat_id: str | None = Query(None, max_length=80),
               kind: str | None = Query(None, pattern="^(image|report)$"), limit: int = Query(30, ge=1, le=100),
               offset: int = Query(0, ge=0), _: AuthUser = Depends(staff), db: Session = Depends(get_db)):
    return uploads.list_evidence(db, ghat_id, kind, limit, offset)


@router.get("/{evidence_id}/file", summary="Download an uploaded file (staff)", responses=E, response_class=Response)
def download(evidence_id: str, _: AuthUser = Depends(staff), db: Session = Depends(get_db)):
    e = uploads.get_evidence_file(db, evidence_id)
    disposition = "inline" if e.kind == "image" else "attachment"
    return Response(content=e.data, media_type=e.content_type,
                    headers={"Content-Disposition": f'{disposition}; filename="{e.filename}"',
                             "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300"})
