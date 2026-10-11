from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ErrorResponse
from app.schemas.report import Report, ReportRequest
from app.services import reports

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/generate", response_model=Report, summary="Evidence report (JSON, or CSV download)",
             description="format=json returns the structured Report. format=csv returns a text/csv attachment with "
                         "one row per reading, its criterion comparison and ghat priority.",
             responses={200: {"content": {"text/csv": {}}, "description": "JSON report or CSV file"},
                        404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
def generate(req: ReportRequest, db: Session = Depends(get_db)):
    report = reports.generate_report(db, req)
    if req.format == "csv":
        return Response(content=reports.to_csv(report), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="ghat-sentinel-report.csv"'})
    return report
