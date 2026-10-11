# Deployment

Production route: **Neon** (PostgreSQL) + **Render** (this API, free web service) + **Vercel** (the Next.js frontend).
SQLite stays the default for local development and the test suite; the same code runs on both.

## 1. Neon (database)

1. Create a Neon project (a region close to the Render region) and a database.
2. In the dashboard open **Connect**. Neon shows two connection strings for the same database:
   - **Pooled** (host contains `-pooler`): goes through PgBouncer in transaction mode. **Use this one for the app**
     (`DATABASE_URL` on Render). The app already disables server-side prepared statements, which PgBouncer in
     transaction mode does not support.
   - **Direct** (no `-pooler`): only needed for tools that require session features (for example `pg_dump` or manual
     migrations). Not needed by this app.
3. Both look like `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require&channel_binding=require`. Paste it **as it is**:
   the app rewrites `postgres://` and `postgresql://` to the psycopg 3 driver and keeps `sslmode` and
   `channel_binding`. SSL is mandatory on Neon; do not remove `sslmode=require`.
4. Scale to zero: a free Neon compute suspends after about 5 minutes without queries and the next query wakes it (a
   second or two, sometimes more). The engine uses `pool_pre_ping`, `pool_recycle=300` and a 15 s connect timeout so
   stale connections are replaced silently. If the very first request after a long idle fails, retry it.
5. Free-tier limits (check Neon's current pricing page, they change): a small storage allowance (this dataset is a few
   MB), limited compute hours per month and a limited point-in-time history window.

Tables are created automatically at start (`init_db`), including the small additive migrations
(`review_cases.created_by`, `users.phone`) for older databases; they work on SQLite and PostgreSQL.

## 2. Render (API)

`render.yaml` is at the **repository root** because Render reads blueprints from the root of the repo. It sets
`rootDir: ghat-sentinel-backend`, so build and start run inside the backend folder.

1. Render dashboard: **New > Blueprint**, pick the repository. Render reads `render.yaml` and asks for the values marked
   `sync: false` (section 4).
2. The service is a **web service on the free plan with no persistent disk**. Build: `pip install -r requirements.txt`.
   Start command:

   ```
   (python scripts/download_data.py || echo "download failed; continuing"); (python scripts/seed_database.py || echo "seed failed; continuing"); uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

   The filesystem is ephemeral, so the three CSVs are downloaded into `DATA_DIR=/tmp/ghat-data` on every start. The
   import compares each file's sha256 with the `data_sources` table and logs `unchanged, skipped` when nothing changed
   and the table already has rows, so a restart does not re-upsert about 23,000 rows over the network. Force a full
   re-import with `python scripts/seed_database.py --force` (for example from the Render shell).
3. Health check path: `/api/v1/health` (reports `database`, `data_loaded`, `readings_loaded`).
4. A failed download or seed does not stop the API from starting; health then shows `data_loaded: false`.

### Free plan: sleep and cold starts

A free web service sleeps after **15 minutes** without traffic. The next request wakes it and takes roughly
**30 to 60 seconds** (container start, download, seed check, Neon wake-up). Mitigations:

- Before a pitch, open `/api/v1/health` a minute in advance.
- A keep-alive ping to `https://YOUR-SERVICE.onrender.com/api/v1/health` every 10 minutes from an external uptime
  monitor (cron-job.org, UptimeRobot, a scheduled GitHub Action). This keeps the service awake, uses free instance hours
  (a free workspace has roughly 750 per month, enough for one always-on service) and keeps Neon awake too.
- Or use a paid plan (always on).
- Frontends should show a loading state and retry the first request.

Run a single instance (the AI and login rate limiters are per process). Anything written to the local filesystem is lost
on restart; cases, users, briefs and messages live in Neon and persist.

## 3. Vercel (frontend) and CORS

Deploy the frontend separately and point it at the Render URL (see the frontend docs). On Render set:

- `FRONTEND_ORIGIN`: the exact production origin(s), comma-separated, no trailing slash, e.g. `https://your-app.vercel.app`.
- `CORS_ORIGIN_REGEX` (optional): also allow preview deployments, e.g. `https://.*\.vercel\.app`. Anything matching the
  regex is allowed, so keep it as narrow as you can (for example `https://your-app(-[a-z0-9-]+)?\.vercel\.app`). The exact
  origins and the regex are combined.

## 4. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `PYTHON_VERSION` | set in `render.yaml` | `3.11.9` |
| `APP_ENV` | set | `production` |
| `AUTH_ENABLED` | set | `true` |
| `DEMO_USERS` | set | `false` (the demo accounts and their well-known passwords never exist in production) |
| `DATA_DIR` | set | `/tmp/ghat-data` (ephemeral) |
| `JWT_SECRET` | generated | Render generates it; the app refuses to start in production without one. Rotating it logs everyone out. |
| `DATABASE_URL` | **yes** | Neon **pooled** connection string |
| `FRONTEND_ORIGIN` | **yes** | Vercel origin(s) for CORS |
| `BOOTSTRAP_OFFICER_EMAIL`, `BOOTSTRAP_OFFICER_PASSWORD` | **yes, first deploy** | create the first officer |
| `CORS_ORIGIN_REGEX` | optional | Vercel previews |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional | AI wording; without them template text is used |
| `PRESENTER_EMAIL`, `PRESENTER_PASSWORD`, `SEED_DEMO_CASES` | optional | pitch account and sample cases (below) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS`, `SMTP_USE_SSL` | optional | e-mail, see `MESSAGING.md` |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_MODE` | optional | WhatsApp, see `MESSAGING.md` |
| `MESSAGING_DRY_RUN` | optional | `true` logs messages without sending anything |

Never commit values; enter secrets only in the Render dashboard.

### First officer

Set `BOOTSTRAP_OFFICER_EMAIL` and `BOOTSTRAP_OFFICER_PASSWORD` before the first deploy. The account is created at startup
if it does not exist. Log in, then create workers from the UI or `POST /api/v1/users`; afterwards you may remove the
password variable. Alternative: run `python scripts/create_user.py` from the Render shell. See `AUTH.md`.

### Presenter account for a pitch

Set `PRESENTER_EMAIL` and `PRESENTER_PASSWORD` (a strong password) to get a `demo`-role account in production, and
`SEED_DEMO_CASES=true` to fill the case queue with six sample cases labelled `[Demo data]` (created once, only if the
seed user has no cases yet). The sample cases are assigned to `worker@ghat.demo`, which outside development gets a random
password nobody knows, so no well-known credential exists. **Caution:** the presenter has officer-level rights over
cases: it can create and update cases, generate briefs and reports and **send e-mail/WhatsApp messages** if SMTP or
WhatsApp is configured. Use `MESSAGING_DRY_RUN=true` for demos, and remove the account/variables after the event.

## 5. Docker (local, SQLite or PostgreSQL)

```bash
docker compose up -d --build        # or: BACKEND_PORT=8010 docker compose up -d
```

`docker-compose.yml` builds the image, publishes `${BACKEND_PORT:-8010}`, passes `FRONTEND_ORIGIN`, `APP_ENV`
(default `development`), `AUTH_ENABLED`, `JWT_SECRET`, `DEMO_USERS` and the optional variables, and mounts the
`ghat-data` volume at `/data` (SQLite file `/data/ghat_sentinel.db`, CSVs in `/data/raw`). The image runs as a non-root
user and defines a health check. The same image works with PostgreSQL: pass `-e DATABASE_URL=postgresql://...`
(psycopg 3 is installed in the image).

Without compose: `docker build -t ghat-sentinel . && docker run -p 8000:8000 -v ghat-data:/data ghat-sentinel`.

## 6. What was verified

The full test suite passes on SQLite and on PostgreSQL 16 (`TEST_DATABASE_URL=...`), and the seed script (including the
checksum skip), login, ghats, analytics, case create/patch, brief and CSV report were exercised against a PostgreSQL 16
container. **Not verified against Neon itself or on Render**: the pooled-endpoint settings follow Neon's documentation.

## 7. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Browser shows a CORS error | `FRONTEND_ORIGIN` must equal the exact origin (scheme + host, no trailing slash); for preview URLs set `CORS_ORIGIN_REGEX`. Redeploy after changing. |
| First request takes 30-60 s or times out | The Render free plan was asleep (and Neon suspended). Retry; use a keep-alive ping or a paid plan. |
| `/api/v1/health` says `database: error` | Wrong `DATABASE_URL`, missing `sslmode=require`, or the Neon project is unavailable. Check the Render logs (credentials are never logged). |
| `data_loaded: false` | The CSV download failed at start. Restart the service, or run `python scripts/download_data.py && python scripts/seed_database.py --force` in the Render shell. |
| `prepared statement ... does not exist` / `already exists` | Prepared statements through PgBouncer. The app disables them; do not override the engine options, and use the pooled URL. |
| Connection closed after idle | Neon suspended the compute; `pool_pre_ping` normally recovers. Retry once. |
| App refuses to start: `JWT_SECRET must be set` | Add `JWT_SECRET` (the blueprint generates it). |
| Cannot log in on a fresh deploy | `BOOTSTRAP_OFFICER_EMAIL`/`PASSWORD` were not set before the first start; set them and restart. |
| Sample cases missing | `SEED_DEMO_CASES=true` must be set and readings must be loaded; cases are created once per database. |
| `ModuleNotFoundError: psycopg` | The build did not install `requirements.txt` from the backend folder; check `rootDir`. |
