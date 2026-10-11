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
docker build -t ghat-sentinel .
docker run -p 8000:8000 -e FRONTEND_ORIGIN=http://localhost:3000 ghat-sentinel
```

The container downloads the datasets on start; mount a volume and set `DATABASE_URL`/`DATA_DIR` to keep cases.

## Environment checklist

`FRONTEND_ORIGIN` correct (CORS), `DATABASE_URL`/`DATA_DIR` on the persistent disk, `ANTHROPIC_*` set only if you want AI
wording, `APP_ENV=production`. No authentication exists: treat the public URL as a demo; case endpoints accept writes
from any allowed browser origin, and non-browser clients can write regardless of CORS. Put the API behind access
control before real municipal use.

## Cold starts and outages

Free-tier hosts sleep when idle; the first request can take tens of seconds. Frontends should show a loading state and
retry. If the GitHub download fails at start, the app still boots (health shows `data_loaded: false`); fix the network
or place the CSVs in `DATA_DIR/raw/` and restart.
