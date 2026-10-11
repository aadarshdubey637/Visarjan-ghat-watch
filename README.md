# Ghat Sentinel

**Live demo: <https://visarjan-ghat-watch-omega.vercel.app/>**

Environmental intelligence for Bhopal's Visarjan Ghat Watch (Bhopal Impact Lab 2026, Track 2). It turns three years of MPPCB
immersion-season water tests into evidence-backed review priorities, Hindi/English briefs, tracked verification cases and a
citizen guide. All data are **historical** (2023–2025): this is not live monitoring.

| Folder | What it is |
|---|---|
| `ghat-sentinel-backend/` | FastAPI + SQLite: data import, CPCB criteria engine, analytics, priorities, briefs (optional Claude wording), cases, reports, JWT auth with roles |
| `ghat-sentinel-frontend/` | Next.js app: landing, sign-in, municipal console, worker view, community guide, developer status |
| `docker-compose.yml` | runs both |
| `master frontend build prompt` | the original frontend brief |

## Run everything

```bash
docker compose up -d --build
```

- App: <http://localhost:3100> · API docs: <http://localhost:8010/docs>
- Ports are 3100 / 8010 so they do not clash with other local projects; override with `FRONTEND_PORT` / `BACKEND_PORT`
  (and `API_PUBLIC_URL` / `FRONTEND_ORIGIN` to match).
- First start downloads the public CSVs (about 15 s). Cases, users and briefs persist in the `ghat-data` volume.
- `docker compose down -v` also deletes that data.

Optional AI wording: put `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` in a `.env` next to `docker-compose.yml`. Without them
everything works with deterministic template text.

## Accounts and roles

Four roles: municipal **officer**, field **worker**, **community** member, **developer**. In development mode demo accounts are
created (`presenter@ghat.demo` for demonstrations, `officer@ghat.demo`, `worker@ghat.demo`, `citizen@ghat.demo`, `developer@ghat.demo`) along with six sample cases; see
`ghat-sentinel-backend/docs/AUTH.md` for the passwords, the permission matrix and production setup. In production set
`APP_ENV=production`, a long random `JWT_SECRET`, `DEMO_USERS=false` and bootstrap the first officer.

## Sending briefs by email and WhatsApp

Officers and the presenter account can send a generated brief from **AI Intelligence → Send…** (email through SMTP, WhatsApp
through the Meta Cloud API). Every send needs a review-and-confirm step and is recorded on the **Messages** page. Setup steps
for a Gmail app password, the WhatsApp phone number ID and the required approved template are in
`ghat-sentinel-backend/docs/MESSAGING.md`. Put the settings in the root `.env` as `NAME=value` lines (never commit it), and set
`MESSAGING_DRY_RUN=true` to rehearse without sending anything.

## Documentation

Backend: `ghat-sentinel-backend/README.md` and `docs/` (architecture, API contract, analytics methodology, data sources, AI,
auth, deployment). Frontend: `ghat-sentinel-frontend/README.md`.

## Limitations

Historical data only; no exact sample dates or coordinates in the source; only pH, dissolved oxygen and BOD are compared with
CPCB class B limits; the public guidance text is a draft pending municipal review; email/WhatsApp sending and password change
are not built yet.

MIT licence (see `ghat-sentinel-backend/LICENSE`). Source data belong to MPPCB and the Track 2 organisers.
