# data/

- `raw/` - the public CSVs, created by `python scripts/download_data.py` (git-ignored; see `docs/DATA_SOURCES.md`).
  Also holds `sources.json` (URL, retrieval time, SHA-256 per file).
- The CPCB criteria CSV is also kept, version-controlled, in `app/resources/criteria/` and the draft public guidance
  and resource list in `app/resources/public_guidance/`.
- The automated tests use the small synthetic fixtures in `tests/fixtures/` (clearly artificial "Test Ghat A/B/C"
  data), never the real files.

Point the app at another folder with `DATA_DIR` (it reads `DATA_DIR/raw/`).
