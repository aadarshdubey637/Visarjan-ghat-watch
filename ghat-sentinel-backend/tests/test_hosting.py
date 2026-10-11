"""Hosting features: PostgreSQL URL handling, checksum-based import skipping, SEED_DEMO_CASES, CORS regex."""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import database
from app.config import Settings, settings
from app.main import cors_options
from app.models import DataSource, Reading, ReviewCase, StatewideReading
from app.services import demo as demo_svc
from app.services import ingestion as ing
from app.services import users as users_svc
from tests.conftest import FIXTURES

ROOT = Path(__file__).resolve().parent.parent


# --------------------------------------------------------------------------- database URL / engine
@pytest.mark.parametrize("raw", ["postgres://u:p@h/db?sslmode=require&channel_binding=require",
                                 "postgresql://u:p@h/db?sslmode=require&channel_binding=require"])
def test_postgres_urls_use_psycopg_and_keep_query(raw):
    out = database.normalise_database_url(raw)
    assert out == "postgresql+psycopg://u:p@h/db?sslmode=require&channel_binding=require"


def test_other_urls_untouched():
    assert database.normalise_database_url("sqlite:///./x.db") == "sqlite:///./x.db"
    assert database.normalise_database_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_postgres_engine_settings_without_connecting():
    eng = database.make_engine("postgres://u:p@localhost:1/db?sslmode=require")
    assert eng.dialect.name == "postgresql" and eng.dialect.driver == "psycopg"
    assert eng.pool.size() == 5 and eng.pool._max_overflow == 5 and eng.pool._recycle == 300
    assert eng.pool._pre_ping is True
    assert eng.url.query["sslmode"] == "require"
    eng.dispose()


def test_sqlite_engine_keeps_sqlite_only_options():
    eng = database.make_engine("sqlite://")
    assert eng.dialect.name == "sqlite"
    with eng.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1


# --------------------------------------------------------------------------- checksum skip
def _counts(db):
    return (db.scalar(select(func.count()).select_from(Reading)),
            db.scalar(select(func.count()).select_from(StatewideReading)))


def _raw_copy(tmp_path):
    raw = tmp_path / "raw"
    shutil.copytree(FIXTURES / "raw", raw)
    return raw


def test_unchanged_files_are_skipped(db, tmp_path, caplog):
    raw = _raw_copy(tmp_path)
    ing.import_all(db, raw)
    caplog.set_level("INFO", logger="ghat_sentinel.ingestion")
    before = _counts(db)
    reports = ing.import_all(db, raw)
    assert reports[ing.BHOPAL_FILE]["skipped"] and reports[ing.STATE_FILE]["skipped"]
    assert reports[ing.BHOPAL_FILE]["valid_row_count"] > 0
    assert "unchanged, skipped" in caplog.text
    assert _counts(db) == before


def test_skip_needs_rows_in_table(db, tmp_path):
    raw = _raw_copy(tmp_path)
    ing.import_all(db, raw)
    db.query(Reading).delete()
    db.commit()
    reports = ing.import_all(db, raw)
    assert not reports[ing.BHOPAL_FILE].get("skipped")
    assert db.scalar(select(func.count()).select_from(Reading)) == 69


def test_changed_file_is_reimported(db, tmp_path):
    raw = _raw_copy(tmp_path)
    ing.import_all(db, raw)
    path = raw / ing.BHOPAL_FILE
    lines = path.read_text("utf-8").splitlines()
    path.write_text("\n".join(lines[:-1]) + "\n", encoding="utf-8")  # drop the last data row
    reports = ing.import_all(db, raw)
    assert not reports[ing.BHOPAL_FILE].get("skipped") and reports[ing.STATE_FILE]["skipped"]
    sha = db.scalar(select(DataSource.sha256).where(DataSource.file_name == ing.BHOPAL_FILE))
    assert sha == ing.sha256_of(path)
    assert ing.import_all(db, raw)[ing.BHOPAL_FILE]["skipped"]  # and now it is unchanged again


def test_force_imports_unchanged_files(db, tmp_path):
    raw = _raw_copy(tmp_path)
    ing.import_all(db, raw)
    reports = ing.import_all(db, raw, force=True)
    assert not any(r.get("skipped") for r in reports.values())
    assert _counts(db) == (69, 75)


def test_seed_script_force_flag(tmp_path):
    """Run the real script against a temporary SQLite file: second run skips, --force imports."""
    raw = tmp_path / "data" / "raw"
    shutil.copytree(FIXTURES / "raw", raw)
    env = {"DATABASE_URL": f"sqlite:///{(tmp_path / 't.db').as_posix()}", "DATA_DIR": str(tmp_path / "data"),
           "PATH": os.environ.get("PATH", ""), "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")}

    def run(*args):
        return subprocess.run([sys.executable, str(ROOT / "scripts" / "seed_database.py"), *args],
                              capture_output=True, text=True, env=env, cwd=ROOT, timeout=120)

    first, second, forced = run(), run(), run("--force")
    assert first.returncode == second.returncode == forced.returncode == 0, first.stderr + second.stderr
    assert "unchanged, skipped" not in first.stdout
    assert second.stdout.count("unchanged, skipped") == 3
    assert "unchanged, skipped" not in forced.stdout and "valid=" in forced.stdout


# --------------------------------------------------------------------------- SEED_DEMO_CASES
def _production(monkeypatch, seed: bool):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "DEMO_USERS", False)
    monkeypatch.setattr(settings, "SEED_DEMO_CASES", seed)


def test_seed_demo_cases_off_by_default_in_production(monkeypatch):
    assert Settings.model_fields["SEED_DEMO_CASES"].default is False
    _production(monkeypatch, False)
    with database.SessionLocal() as db:
        assert demo_svc.seed_demo(db) == 0


def test_seed_demo_cases_in_production_uses_unusable_worker_password(monkeypatch):
    _production(monkeypatch, True)
    with database.SessionLocal() as db:
        assert demo_svc.seed_demo(db) == 6
        assert db.scalar(select(func.count()).select_from(ReviewCase)) == 6
        worker = users_svc.get_by_email(db, demo_svc.WORKER_EMAIL)
        assert worker is not None
        known = next(a["password"] for a in users_svc.DEMO_ACCOUNTS if a["email"] == demo_svc.WORKER_EMAIL)
        assert not users_svc.verify_password(known, worker.password_hash)
        assert users_svc.get_by_email(db, "officer@ghat.demo") is None  # no other demo account appears


def test_seed_demo_cases_in_development_keeps_known_worker_password(monkeypatch):
    monkeypatch.setattr(settings, "SEED_DEMO_CASES", True)
    with database.SessionLocal() as db:
        assert demo_svc.seed_demo(db) == 6
        worker = users_svc.get_by_email(db, demo_svc.WORKER_EMAIL)
        assert users_svc.verify_password("Worker#Demo2026", worker.password_hash)


# --------------------------------------------------------------------------- CORS
def _client():
    mini = FastAPI()
    mini.add_middleware(CORSMiddleware, **cors_options())

    @mini.get("/x")
    def x():
        return {}

    return TestClient(mini)


def _allowed(client, origin):
    return client.options("/x", headers={"Origin": origin, "Access-Control-Request-Method": "GET"}
                          ).headers.get("access-control-allow-origin")


def test_cors_default_has_no_regex():
    assert settings.CORS_ORIGIN_REGEX == ""
    assert cors_options()["allow_origin_regex"] is None
    c = _client()
    assert _allowed(c, "http://localhost:3000") == "http://localhost:3000"
    assert _allowed(c, "https://my-app-git-x.vercel.app") is None


def test_cors_origin_regex_allows_vercel_previews(monkeypatch):
    monkeypatch.setattr(settings, "FRONTEND_ORIGIN", "https://prod.example.org, http://localhost:3000")
    monkeypatch.setattr(settings, "CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")
    c = _client()
    assert _allowed(c, "https://my-app-git-x.vercel.app") == "https://my-app-git-x.vercel.app"
    assert _allowed(c, "https://prod.example.org") == "https://prod.example.org"
    assert _allowed(c, "http://localhost:3000") == "http://localhost:3000"
    assert _allowed(c, "https://evil.example.com") is None
    assert _allowed(c, "https://x.vercel.app.evil.com") is None
