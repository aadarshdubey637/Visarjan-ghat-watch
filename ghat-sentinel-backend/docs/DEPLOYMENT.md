# Deployment

## Render (`render.yaml`)

1. Create a Blueprint from the repository (the backend lives in `ghat-sentinel-backend/`; set that as the service root
   directory).
2. Set secrets in the dashboard: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (both optional), and `FRONTEND_ORIGIN` (the
   exact origin of your Vercel site, e.g. `https://your-app.vercel.app`; comma-separate several).
3. Start command (already in `render.yaml`): download the CSVs, import them (idempotent), then run `uvicorn`.
4. Health check path: `/api/v1/health`.

### SQLite persistence

Render's filesystem is **ephemeral** unless a persistent disk is attached, and disks need a paid plan. `render.yaml`
mounts a 1 GB disk at `/var/data` and sets `DATABASE_URL=sqlite:////var/data/ghat_sentinel.db` and `DATA_DIR=/var/data`.

- With the disk: cases and stored briefs survive restarts and redeploys; the data import is repeated harmlessly.
- Without a disk (free plan): remove the `disk` block and use the defaults. **Cases and briefs are lost on every restart
  or redeploy**; readings are re-imported automatically from the public CSVs at start.
- SQLite is single-writer: run one instance. The AI rate limiter is also per-process.

## Docker

```bash
docker compose up -d --build        # or: BACKEND_PORT=8010 docker compose up -d
```

`docker-compose.yml` builds the image, publishes `${BACKEND_PORT:-8000}`, passes `FRONTEND_ORIGIN` and the optional
`ANTHROPIC_*` variables, and mounts the `ghat-data` volume at `/data` (SQLite file `/data/ghat_sentinel.db`, CSVs in
`/data/raw`). The image runs as a non-root user and defines a health check (`/api/v1/health`).

Verified with Docker 29: the image builds, the container turns healthy in about 15 s, the data are downloaded and
imported, every endpoint answers, CORS allows `http://localhost:3000`, a case created through the API survives
`docker compose restart` (and the download is skipped the second time), and with no network at all the container still
starts and reports `data_loaded: false`.

Without compose: `docker build -t ghat-sentinel . && docker run -p 8000:8000 -v ghat-data:/data ghat-sentinel`.

Note: a compose file for the frontend can be added next to the backend service (a commented example is included).

## Environment checklist

`FRONTEND_ORIGIN` correct (CORS), `DATABASE_URL`/`DATA_DIR` on the persistent disk, `ANTHROPIC_*` set only if you want AI
wording, `APP_ENV=production`. No authentication exists: treat the public URL as a demo; case endpoints accept writes
from any allowed browser origin, and non-browser clients can write regardless of CORS. Put the API behind access
control before real municipal use.

## Cold starts and outages

Free-tier hosts sleep when idle; the first request can take tens of seconds. Frontends should show a loading state and
retry. If the GitHub download fails at start, the app still boots (health shows `data_loaded: false`); fix the network
or place the CSVs in `DATA_DIR/raw/` and restart.
