# Ghat Sentinel Frontend

Next.js 14 (App Router) · TypeScript (strict) · Tailwind · TanStack Query · Recharts · React Hook Form + Zod.
It talks only to the Ghat Sentinel FastAPI backend (`../ghat-sentinel-backend`) through one typed client
(`src/lib/api/client.ts`). It never computes criteria, priorities or trends itself; it displays what the backend returns.

## Who can do what

Sign-in uses the backend's JWT accounts. Pages are gated by role in `src/lib/access.ts` (and enforced again by the API).

| Role | Lands on | Can open |
|---|---|---|
| Visitor (no account) | landing page | landing, citizen guide, sign in, register |
| Community member | `/citizen` | citizen guide: history, guide, resources, Q&A |
| Field worker | `/cases` ("My cases") | only the cases assigned to them (notes, status → under review / resolved), ghat explorer |
| Municipal officer | `/` dashboard | everything municipal: dashboard, ghats, analytics, prioritization, AI briefs, cases (assign to workers), reports, **Team** (create worker/officer accounts), methodology |
| Developer | `/` dashboard | everything above plus **System status** (`/settings`): backend health, dataset and AI status |
| **Presenter** (demo) | `/` dashboard | every municipal screen from one login, with a **View as** switch (Officer / Worker / Community) to preview each role without signing out; no Team page or System status |

Backend health and system status are developer tools; officers and citizens never see them.

## Run it

```bash
# 1. backend (see ../ghat-sentinel-backend/README.md) on http://localhost:8000
# 2. frontend
cp .env.example .env.local        # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000  (origin only, no path)
npm install
npm run dev                       # http://localhost:3000
```

With the backend in development mode (`APP_ENV=development`, the default) demo accounts exist and the login page offers a
"Fill in the demo login" shortcut (`presenter@ghat.demo`, `officer@ghat.demo`, `worker@ghat.demo`, `citizen@ghat.demo`, `developer@ghat.demo`;
passwords are in the backend `docs/AUTH.md`). They are never created in production.

Both services together with Docker (from the repository root): `docker compose up -d --build`, then open
<http://localhost:3100> (API on 8010).

> `NEXT_PUBLIC_API_BASE_URL` is inlined at **build** time. For Docker it is the `API_PUBLIC_URL` build argument and must
> be the address the *browser* uses to reach the backend. The backend must list the frontend origin in `FRONTEND_ORIGIN`.

## Checks

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | Next/ESLint |
| `npm test` | Vitest: domain rules, API client, chart data, components, role access (41 tests) |
| `npm run check:api` | calls every backend endpoint the UI uses against a running backend and checks the response shapes |
| `npm run e2e:smoke` | headless Chrome visits every page at desktop and mobile size and fails on console errors or 5xx |
| `node scripts/e2e-roles.mjs` | headless Chrome walks the visitor, officer, worker, community and developer journeys (needs demo accounts) |
| `npm run build` | production build |

The browser scripts use your installed Chrome or Edge through `playwright-core` (no browser download). Set
`FRONTEND_URL`, `API` and `CHROME_PATH` if needed.

## Presenting the project

In a development backend the landing page shows **Launch live demo**, which signs in the presenter account in one click. The
database is pre-loaded with six sample verification cases (all four statuses, labelled "[Demo data]"), so the case queue,
dashboard counts and worker view are populated. Everything you create while presenting (cases, briefs, reports) is saved in
the database. Use **View as** in the top bar to show the officer, field-worker and community experiences.

## Landing page images

The landing page photographs come from `src/lib/landing-images.ts`. Drop more pictures into `public/` and add them to that
list (see `public/landing/README.md`). The current photographs contain stock-agency watermarks; replace them with clean,
properly licensed images before a public release.

## Design notes

Editorial look (Fraunces + Inter, warm paper palette, marigold accent), the project's photographs as a slow cross-fading
hero background, a ghat × season heatmap of outside-limit readings on the dashboard, a compact parameter matrix on each
ghat, count-up numbers and drifting water. Motion respects `prefers-reduced-motion`. Status is always shown with an icon and
text, never colour alone.

## Data honesty rules the UI follows

- No exact sample dates exist: charts use seasons (year + festival), phases as series, never invented dates.
- Missing / below-detection values show their flag (`not sampled`, `BDL`), never zero; gaps are drawn as gaps.
- Only pH, dissolved oxygen and BOD have CPCB class B limits; everything else shows "No applicable criterion".
- "Within criterion" is never worded as "safe"; priorities are labelled a project heuristic.
- AI output is labelled "AI-worded" or "Deterministic template"; template text is a normal result, not an error.

## Known limitations

- The session token is kept in `localStorage` (simple, but readable by any script on the page); a hardened deployment would
  move it to an httpOnly cookie behind a same-site proxy.
- There is no "change password" screen yet (the API has no endpoint for it); officers set a temporary password when they
  create a worker.
- Email and WhatsApp sending are not implemented; briefs are copied or downloaded and shared manually.
- Only navigation and key labels are translated to Hindi; backend-generated briefs and the citizen guide are returned in the
  requested language.
- No coordinates exist in the source data, so there is no map.

## Troubleshooting

- *"The backend is not reachable"*: start the backend and check `NEXT_PUBLIC_API_BASE_URL` (origin only).
- *Requests blocked by CORS*: add the frontend origin to the backend `FRONTEND_ORIGIN`.
- *Signed out after the backend restarts*: with an empty `JWT_SECRET` the dev backend generates a new secret each start.
- *Docker build on Windows says the lockfile is out of sync*: regenerate it on Linux
  (`docker run --rm -v "$PWD:/app" -w /app node:20-alpine npm install --package-lock-only`).
