"""Export the OpenAPI schema to docs/openapi.json (no database or network needed).

Usage: python scripts/export_openapi.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL", "sqlite://")

from app.main import app  # noqa: E402


def main() -> int:
    out = ROOT / "docs" / "openapi.json"
    out.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
