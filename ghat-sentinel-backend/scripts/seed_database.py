"""Create tables and import the datasets into SQLite. Idempotent: safe to re-run (rows are upserted by ID).

Usage: python scripts/seed_database.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import database  # noqa: E402
from app.config import settings  # noqa: E402
from app.services import ingestion  # noqa: E402


def main() -> int:
    database.init_db()
    with database.SessionLocal() as db:
        reports = ingestion.import_all(db)
    failed = False
    for name, rep in reports.items():
        errs = rep.get("errors") or []
        print(f"{name}: valid={rep.get('valid_row_count', 0)} invalid={rep.get('invalid_row_count', 0)} "
              f"duplicates={rep.get('duplicate_count', 0)}" + (f"  ERRORS: {errs}" if errs else ""))
        failed = failed or bool(errs)
    print(f"Database: {settings.DATABASE_URL}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
