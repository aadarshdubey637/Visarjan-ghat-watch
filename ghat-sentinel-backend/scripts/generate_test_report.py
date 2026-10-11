"""Run the test suite and write a short Markdown summary (docs/TEST_REPORT.md) with the ACTUAL outcome.

Usage: python scripts/generate_test_report.py
"""
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    proc = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=ROOT,
                          capture_output=True, text=True)
    out = proc.stdout + proc.stderr
    summary = next((ln for ln in reversed(out.splitlines()) if " passed" in ln or " failed" in ln or "error" in ln),
                   "no summary line found")
    report = (f"# Test report\n\nGenerated: {datetime.now(timezone.utc).isoformat(timespec='seconds')}Z\n\n"
              f"Command: `pytest -q`\n\nExit code: {proc.returncode}\n\nSummary: **{summary.strip()}**\n\n"
              f"```\n{out[-4000:]}\n```\n")
    (ROOT / "docs" / "TEST_REPORT.md").write_text(report, encoding="utf-8")
    print(summary)
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
