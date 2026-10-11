# Ghat Sentinel Backend

FastAPI backend for **Ghat Sentinel**, built for Bhopal Impact Lab 2026, Track 2: *Visarjan Ghat Watch*.
It turns three years of MPPCB immersion-season water tests at Bhopal's ghats into traceable findings, review
priorities, Hindi/English briefs and a verification-case workflow for municipal officers, plus a small public guide
for citizens.

**User it is built for:** the Bhopal Municipal Corporation officer who plans Durga visarjan (20 October 2026).

> Everything is **historical** (2023-2025). Nothing here is live monitoring, and the review priorities are a
> project-defined heuristic, not an official CPCB classification.

## What it does

| Area | Endpoints |
|---|---|
| Health / metadata | `GET /api/v1/health`, `GET /api/v1/metadata` |
| Ghats and readings | `GET /ghats`, `/ghats/ranked`, `/ghats/{id}`, `/ghats/{id}/readings`, `/ghats/{id}/trends` |
| Analytics | `GET /analytics/overview`, `/analytics/benchmark` |
| Oct 20 outlook | `GET /predict/oct20` (experimental; refuses to forecast without enough data) |
| Briefs | `POST /brief/generate`, `/brief/whatsapp` (en / hi / bilingual) |
| Citizen | `POST /citizen/ask`, `GET /citizen/ghats`, `/citizen/guide`, `/citizen/resources` |
| Cases | `GET/POST /cases`, `GET/PATCH /cases/{id}` (persisted in SQLite) |
| Reports | `POST /reports/generate` (JSON or CSV download) |

Principle: **analytics first, AI second.** Criteria checks, trends, priorities and benchmarks are deterministic
Python/pandas. Claude (optional) only re-words evidence the backend already computed, and its output is validated
(see [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md)). Without an API key everything still works with template text.

## Quick start (5 steps)

Requires Python 3.11+.

```bash
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # optional; defaults work without it
python scripts/download_data.py && python scripts/seed_database.py
uvicorn app.main:app --reload --port 8000
```

- Swagger UI: <http://localhost:8000/docs> - OpenAPI JSON: <http://localhost:8000/openapi.json>
- Health: <http://localhost:8000/api/v1/health>
- Run the tests: `pytest -q` (no network or API key needed; uses a small synthetic fixture)

### Or with Docker

```bash
docker compose up -d --build            # API on http://localhost:8000 (first start downloads the data, ~15 s)
BACKEND_PORT=8010 docker compose up -d  # if port 8000 is already in use
docker compose down                     # stop (add -v to also delete the saved database/cases)
```

The `ghat-data` volume keeps the SQLite database (cases, briefs) and the downloaded CSVs across restarts. Optional AI
wording: put `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` in a `.env` file next to `docker-compose.yml` (compose reads it).
The container runs as a non-root user and has a health check.

If GitHub is unreachable, `download_data.py` exits with an error and nothing is faked: copy the three CSVs manually
into `data/raw/` (see [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)). On startup the app also imports the CSVs
automatically when the database is empty and `data/raw/` exists.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | default `sqlite:///./ghat_sentinel.db` |
| `DATA_DIR` | folder containing `raw/` CSVs, default `./data` |
| `FRONTEND_ORIGIN` | comma-separated allowed CORS origins, default `http://localhost:3000` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional; enable Claude wording. Model must be one enabled for your key (a Haiku or Sonnet model). Never exposed to the frontend. |
| `AI_TIMEOUT_SECONDS`, `AI_RATE_LIMIT_PER_MINUTE` | AI timeout (20 s) and per-IP limit on AI routes (20/min) |

## Repository layout

```
app/            FastAPI app: api/routes, schemas (Pydantic), models (SQLAlchemy), services (all logic), resources
scripts/        download_data, validate_data, seed_database, export_openapi, generate_test_report
tests/          pytest suite + synthetic fixtures (tests/fixtures)
data/raw/       downloaded public CSVs (git-ignored)
docs/           architecture, API contract, methodology, data sources, AI, deployment, frontend guide, openapi.json
```

## Documentation

[ARCHITECTURE](docs/ARCHITECTURE.md) - [API_CONTRACT](docs/API_CONTRACT.md) -
[FRONTEND_INTEGRATION](docs/FRONTEND_INTEGRATION.md) - [ANALYTICS_METHODOLOGY](docs/ANALYTICS_METHODOLOGY.md) -
[DATA_SOURCES](docs/DATA_SOURCES.md) - [AI_INTEGRATION](docs/AI_INTEGRATION.md) - [DEPLOYMENT](docs/DEPLOYMENT.md)

Regenerate the OpenAPI file with `python scripts/export_openapi.py` (writes `docs/openapi.json`).

## What the data does and does not support (known limitations)

- **No exact sample dates.** The MPPCB tables give only year, festival (Ganesh/Durga) and phase (pre/during/after).
  `sample_date` is `null` everywhere; the API exposes `sample_year`, `festival`, `phase` and `sample_period`.
  Date filters (`start_date`/`end_date`/`as_of`) are applied at **year** granularity.
- **No coordinates.** `latitude`/`longitude` are `null`; the frontend cannot map the ghats from this API.
- **Units are assumed** by the dataset curators (the PDFs print none).
- **Only pH, dissolved oxygen and BOD** are scored against CPCB class B (outdoor bathing); other parameters have
  no class-B limit. The class is an explicit project choice and can be changed per request with `cpcb_class`.
- **The Oct 20 outlook never produces a number with the current data**: only 3 Durga seasons exist (an
  experimental estimate needs 5), so it returns a historical comparison.
- **Rani Kamlapati ghat / Kamla Park kund** may be two physical places; Bairagarh and Malikhedi have no Durga 2025
  table. These are surfaced as data-quality warnings.
- **Statewide data** were not checked table by table by the dataset curators; 140 duplicate rows are flagged and
  excluded from benchmarks, and 879 rows have unreadable site names.
- The public guidance (`app/resources/public_guidance/guidance.json`) is **draft general guidance pending municipal
  review**, labelled as such in the API. No helplines or approved-site lists are published because none are in the
  verified sources.
- No authentication (public demo deployment). Case endpoints are open writes; put the API behind access control
  before real municipal use.
- The Claude path is covered by mocked tests only; it has not been exercised against the live API in this repo.

## License

MIT (see `LICENSE`). Source data belong to MPPCB / the Track 2 organisers; the repository has no stated data
licence, so the CSVs are downloaded, not redistributed.
