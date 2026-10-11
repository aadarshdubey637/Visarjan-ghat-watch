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
| Cases | `GET/POST /cases`, `GET/PATCH /cases/{id}` (persisted in SQLite locally, PostgreSQL in production) |
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
- Run the tests: `pip install -r requirements-dev.txt && pytest -q` (no network or API key needed; small synthetic fixture). To run on PostgreSQL: `TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DB pytest` (that database is dropped and recreated: use a throwaway one)

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
| `DATABASE_URL` | default `sqlite:///./ghat_sentinel.db`; a `postgres://` / `postgresql://` URL (e.g. Neon) switches to PostgreSQL via psycopg 3 |
| `DATA_DIR` | folder containing `raw/` CSVs, default `./data` |
| `FRONTEND_ORIGIN` | comma-separated allowed CORS origins, default `http://localhost:3000` |
| `CORS_ORIGIN_REGEX` | optional regex of extra allowed origins, e.g. `https://.*\.vercel\.app` for Vercel previews (empty = off) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional; enable Claude wording. Model must be one enabled for your key (a Haiku or Sonnet model). Never exposed to the frontend. |
| `AI_TIMEOUT_SECONDS`, `AI_RATE_LIMIT_PER_MINUTE` | AI timeout (20 s) and per-IP limit on AI routes (20/min) |
| `AUTH_ENABLED` | default `true`; `false` disables auth entirely (every request is an anonymous developer) |
| `JWT_SECRET` | signing secret; required when `APP_ENV=production` (otherwise a random one is generated at startup) |
| `ACCESS_TOKEN_MINUTES` | token lifetime, default 480 |
| `DEMO_USERS` | default `true`; demo accounts exist only when also `APP_ENV=development` |
| `BOOTSTRAP_OFFICER_EMAIL`, `BOOTSTRAP_OFFICER_PASSWORD` | optional; creates the first officer at startup if missing |
| `PRESENTER_EMAIL`, `PRESENTER_PASSWORD` | optional; creates a `demo`-role presenter account at startup in any environment if missing. It can create cases, briefs and reports. |
| `SEED_DEMO_CASES` | default `false`; `true` creates the six sample cases outside development too (the sample worker then gets a random, unusable password) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS`, `SMTP_USE_SSL`, `SMTP_TIMEOUT_SECONDS` | optional e-mail sending of briefs (SMTP). Secrets never leave the server. See [docs/MESSAGING.md](docs/MESSAGING.md). |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_MODE`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_TIMEOUT_SECONDS` | optional WhatsApp Cloud API sending (`template` or `text` mode). |
| `MESSAGING_DRY_RUN`, `MESSAGING_MAX_RECIPIENTS`, `MESSAGING_MAX_PER_HOUR` | log-only mode, recipients per request (20) and per-user hourly cap (60) |

## Authentication

JWT bearer auth with roles `officer`, `worker`, `citizen`, `developer`, `demo` (full matrix and security notes in
[docs/AUTH.md](docs/AUTH.md)). Log in via `POST /api/v1/auth/login`, then send `Authorization: Bearer <token>`.
Citizens self-register at `/auth/register`; officers create workers/officers via `POST /users`.

Demo accounts (only when `DEMO_USERS=true` and `APP_ENV=development`): `officer@ghat.demo` / `Officer#Demo2026`,
`worker@ghat.demo` / `Worker#Demo2026`, `citizen@ghat.demo` / `Citizen#Demo2026`,
`developer@ghat.demo` / `Developer#Demo2026`, `presenter@ghat.demo` / `Presenter#Demo2026`.

The `demo` role (presenter) behaves like an officer everywhere except user management (`/users` returns 403): one
login to demo every feature. In development with `DEMO_USERS=true`, startup also creates 6 sample review cases
(created by `demo-seed@ghat.demo`, notes prefixed `[Demo data]`) covering all four statuses.

Create or update a user in the configured database:

```bash
python scripts/create_user.py --email chief@city.gov --name "Chief Officer" --role officer   # prompts for password
```

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
[DATA_SOURCES](docs/DATA_SOURCES.md) - [AI_INTEGRATION](docs/AI_INTEGRATION.md) - [DEPLOYMENT](docs/DEPLOYMENT.md) - [MESSAGING](docs/MESSAGING.md)

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
- Authentication is JWT bearer with an in-memory, per-process login rate limit; see docs/AUTH.md for security notes.
  Never run production with `DEMO_USERS` accounts or `AUTH_ENABLED=false`.
- The Claude path is covered by mocked tests only; it has not been exercised against the live API in this repo.

## License

MIT (see `LICENSE`). Source data belong to MPPCB / the Track 2 organisers; the repository has no stated data
licence, so the CSVs are downloaded, not redistributed.
