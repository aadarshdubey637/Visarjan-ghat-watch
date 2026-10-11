import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import database
from app.api.routes import analytics, auth, brief, cases, citizen, criteria, ghats, health, predict, reports
from app.config import ensure_jwt_secret, settings
from app.exceptions import install_exception_handlers
from app.services import demo, ingestion, users

logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ghat_sentinel")


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_jwt_secret()
    database.init_db()
    with database.SessionLocal() as db:
        users.seed_users(db)
    # Make the API self-sufficient: import the data if the DB is empty and the CSVs are present locally.
    with database.SessionLocal() as db:
        if not ingestion.has_data(db):
            if (settings.raw_data_dir / ingestion.BHOPAL_FILE).exists():
                log.info("Empty database: importing datasets from %s", settings.raw_data_dir)
                ingestion.import_all(db)
            else:
                log.warning("No data loaded and %s not found. Run scripts/download_data.py then "
                            "scripts/seed_database.py.", settings.raw_data_dir / ingestion.BHOPAL_FILE)
    with database.SessionLocal() as db:
        demo.seed_demo(db)
    yield


app = FastAPI(
    title="Ghat Sentinel API",
    version="1.0.0",
    description=("Environmental intelligence for Bhopal Visarjan Ghat Watch. Observations, deterministic calculations, "
                 "AI explanations, experimental forecasts and human-reviewed cases are kept distinct. Historical "
                 "MPPCB samples (2023-2025) only: this API does not provide live monitoring. JWT bearer "
                 "authentication with roles officer, worker, citizen, developer and demo (see docs/AUTH.md)."),
    lifespan=lifespan,
)
install_exception_handlers(app)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PATCH"],
                   allow_headers=["Content-Type", "Authorization"], allow_credentials=False)


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > settings.MAX_REQUEST_BYTES:
        return JSONResponse(status_code=413, content={"error": {"code": "REQUEST_TOO_LARGE",
                                                                "message": "Request body is too large."}})
    return await call_next(request)


for module in (health, auth, ghats, analytics, criteria, predict, brief, citizen, cases, reports):
    app.include_router(module.router, prefix=settings.API_PREFIX)
app.include_router(auth.users_router, prefix=settings.API_PREFIX)


@app.get("/", include_in_schema=False)
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": f"{settings.API_PREFIX}/health"}
