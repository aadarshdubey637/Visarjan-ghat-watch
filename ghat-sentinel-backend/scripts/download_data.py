"""Download the public Track 2 datasets into DATA_DIR/raw (records URL, time and SHA-256 in sources.json).

Usage: python scripts/download_data.py [--force]
Exit code 1 with a clear message if a download fails; nothing is substituted or faked.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services.ingestion import download_datasets  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download even if the file exists")
    args = ap.parse_args()
    try:
        results = download_datasets(settings.raw_data_dir, force=args.force)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print("The datasets could NOT be downloaded. Check network access to raw.githubusercontent.com, or copy the "
              f"CSV files manually into {settings.raw_data_dir}.", file=sys.stderr)
        return 1
    for r in results:
        print(f"{r['status']:>15}  {r['file']}  sha256={r['sha256'][:16]}...")
    print(f"Files are in {settings.raw_data_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
