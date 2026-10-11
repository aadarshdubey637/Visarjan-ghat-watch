"""Validate the downloaded CSVs (no database writes) and print/save a validation report.

Usage: python scripts/validate_data.py [--json out.json]
Exit code 1 if any file is missing or has schema errors.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services import ingestion as ing  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write the full report to this file")
    args = ap.parse_args()
    raw = settings.raw_data_dir
    reports, bad = {}, False
    jobs = [(ing.BHOPAL_FILE, ing.validate_bhopal), (ing.STATE_FILE, ing.validate_statewide),
            (ing.CRITERIA_FILE, lambda df, _n: ing.parse_criteria(df))]
    for name, fn in jobs:
        path = raw / name
        if not path.exists():
            print(f"MISSING  {path}  (run scripts/download_data.py)")
            bad = True
            continue
        _, rep = fn(ing._read_csv(path), name)
        reports[name] = rep
        status = "ERRORS" if rep["errors"] else "ok"
        print(f"{status:7}  {name}: rows={rep['row_count']} valid={rep['valid_row_count']} "
              f"invalid={rep['invalid_row_count']} duplicates={rep['duplicate_count']} "
              f"years={rep['year_range']} sites={rep['site_count']} parameters={rep['parameter_count']}")
        for w in rep["warnings"]:
            print(f"         warning: {w}")
        for e in rep["errors"]:
            print(f"         ERROR: {e}")
        bad = bad or bool(rep["errors"])
    if args.json:
        Path(args.json).write_text(json.dumps(reports, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Report written to {args.json}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
