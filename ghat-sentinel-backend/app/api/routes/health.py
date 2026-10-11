from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Criterion, DataSource, Ghat, Reading
from app.schemas.meta import Health, Metadata, ParameterMeta, SourceMeta
from app.services.common import GENERAL_LIMITATIONS, iso_now

router = APIRouter(tags=["health"])


@router.get("/health", response_model=Health, summary="Service health")
def health(db: Session = Depends(get_db)) -> Health:
    try:
        db.execute(text("SELECT 1"))
        ghats = db.scalar(select(func.count()).select_from(Ghat)) or 0
        readings = db.scalar(select(func.count()).select_from(Reading)) or 0
        db_ok = True
    except Exception:
        ghats = readings = 0
        db_ok = False
    return Health(status="ok" if db_ok else "degraded", timestamp=iso_now(), database="ok" if db_ok else "error",
                  data_loaded=readings > 0, ghats_loaded=ghats, readings_loaded=readings,
                  ai_configured=settings.ai_configured, app=settings.APP_NAME, env=settings.APP_ENV)


@router.get("/metadata", response_model=Metadata, summary="Data coverage, parameters and sources")
def metadata(db: Session = Depends(get_db)) -> Metadata:
    params = db.execute(select(Reading.parameter, func.max(Reading.unit), func.count()).group_by(Reading.parameter)
                        .order_by(Reading.parameter)).all()
    crit_rows = db.execute(select(Criterion.dataset_parameter, Criterion.cpcb_class, Criterion.intended_use)).all()
    classes = {c: u for _, c, u in crit_rows}
    by_param: dict[str, set] = {}
    for p, c, _ in crit_rows:
        by_param.setdefault(p, set()).add(c)
    yr = db.execute(select(func.min(Reading.sample_year), func.max(Reading.sample_year))).one()
    sources = []
    for ds in db.scalars(select(DataSource).order_by(DataSource.file_name)):
        rep = ds.validation_report or {}
        sources.append(SourceMeta(
            file_name=ds.file_name, source_url=ds.source_url,
            retrieved_at=ds.retrieved_at.isoformat() + "Z" if ds.retrieved_at else None, sha256=ds.sha256,
            imported_at=ds.imported_at.isoformat() + "Z", row_count=ds.row_count, valid_row_count=ds.valid_row_count,
            invalid_row_count=ds.invalid_row_count, year_range=rep.get("year_range"),
            warnings=rep.get("warnings", []), errors=rep.get("errors", [])))
    return Metadata(
        app=settings.APP_NAME, version="1.0.0", api_prefix=settings.API_PREFIX, docs_url="/docs",
        openapi_url="/openapi.json", total_ghats=db.scalar(select(func.count()).select_from(Ghat)) or 0,
        total_readings=db.scalar(select(func.count()).select_from(Reading)) or 0,
        year_range=[yr[0], yr[1]] if yr[0] is not None else None,
        parameters=[ParameterMeta(parameter=p, unit=u, observation_count=n,
                                  cpcb_classes_with_limit=sorted(by_param.get(p, set()))) for p, u, n in params],
        sources=sources, cpcb_classes=dict(sorted(classes.items())), default_cpcb_class=settings.DEFAULT_CPCB_CLASS,
        enums={
            "comparison_result": ["within_criterion", "outside_criterion", "insufficient_data", "not_comparable"],
            "priority_level": ["high", "review", "routine", "insufficient_data"],
            "case_status": ["needs_verification", "under_review", "action_assigned", "resolved"],
            "language": ["en", "hi"], "whatsapp_language": ["en", "hi", "bilingual"],
            "forecast_status": ["experimental_estimate", "historical_comparison", "insufficient_data"],
            "festival": ["Ganesh", "Durga"], "phase": ["pre", "during", "after"],
            "generation_mode": ["template", "ai"]},
        ai_configured=settings.ai_configured,
        date_convention="Dates are ISO 8601. Source data have no exact sample dates: readings carry sample_year, "
                        "festival and phase; sample_date is null. Timestamps are UTC with a trailing Z.",
        limitations=GENERAL_LIMITATIONS)
