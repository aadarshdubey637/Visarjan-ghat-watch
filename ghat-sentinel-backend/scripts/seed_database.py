"""Create tables and import the datasets into SQLite. Idempotent: safe to re-run (rows are upserted by ID).

Files whose sha256 matches the last import (and whose table has rows) are skipped; --force re-imports them.

Usage: python scripts/seed_database.py [--force]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import database  # noqa: E402
from app.config import settings  # noqa: E402
from app.services import ingestion  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create tables and import the datasets (idempotent).")
    parser.add_argument("--force", action="store_true", help="re-import even when the file checksum is unchanged")
    args = parser.parse_args(argv)
    database.init_db()
    with database.SessionLocal() as db:
        reports = ingestion.import_all(db, force=args.force)
    failed = False
    for name, rep in reports.items():
        errs = rep.get("errors") or []
        if rep.get("skipped"):
            print(f"{name}: unchanged, skipped")
            continue
        print(f"{name}: valid={rep.get('valid_row_count', 0)} invalid={rep.get('invalid_row_count', 0)} "
              f"duplicates={rep.get('duplicate_count', 0)}" + (f"  ERRORS: {errs}" if errs else ""))
        failed = failed or bool(errs)
    # never print the URL itself: it can contain credentials
    print(f"Database: {database.engine.dialect.name}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
