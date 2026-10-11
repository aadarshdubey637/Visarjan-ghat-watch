import os
import tempfile
from pathlib import Path

# Configure BEFORE importing the app: in-memory SQLite, empty data dir, no AI credentials.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="ghat_test_data_")
os.environ["CEREBRAS_API_KEY"] = ""
os.environ["CEREBRAS_MODEL"] = ""
os.environ["AI_RATE_LIMIT_PER_MINUTE"] = "1000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import database  # noqa: E402
from app.config import settings  # noqa: E402
from app.dependencies import reset_rate_limits  # noqa: E402
from app.main import app  # noqa: E402
from app.services import cerebras, ingestion  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
GHAT_A = "ghat_test_ghat_a"
GHAT_B = "ghat_test_ghat_b"
GHAT_C = "ghat_test_ghat_c"
P = "/api/v1"


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    """Every test gets freshly created tables loaded with the small synthetic fixture data."""
    database.Base.metadata.drop_all(bind=database.engine)
    database.init_db()
    with database.SessionLocal() as db:
        ingestion.import_all(db, FIXTURES / "raw")
    monkeypatch.setattr(settings, "CEREBRAS_API_KEY", "")
    monkeypatch.setattr(settings, "CEREBRAS_MODEL", "")
    monkeypatch.setattr(settings, "AI_RATE_LIMIT_PER_MINUTE", 1000)
    monkeypatch.setattr(cerebras, "_TRANSPORT", None)
    reset_rate_limits()
    yield


@pytest.fixture
def db():
    with database.SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def ai_on(monkeypatch):
    monkeypatch.setattr(settings, "CEREBRAS_API_KEY", "test-key")
    monkeypatch.setattr(settings, "CEREBRAS_MODEL", "test-model")
