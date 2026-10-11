# Frontend integration guide

The full, field-level contract is generated in [API_CONTRACT.md](API_CONTRACT.md) and `docs/openapi.json` (also live at
`/openapi.json` and `/docs`). This page is the short orientation.

## Run the backend

```bash
pip install -r requirements.txt
python scripts/download_data.py && python scripts/seed_database.py
uvicorn app.main:app --reload --port 8000
```

Base URL `http://localhost:8000`, API prefix `/api/v1`. In Next.js set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
(origin only; the client adds `/api/v1`). CORS allows `FRONTEND_ORIGIN` (default `http://localhost:3000`); add your
deployed origin there.

## Conventions

- **Dates:** the data have no exact dates. `sample_date`/`last_sample_date` are always `null`; use `sample_year`,
  `festival` (`Ganesh`|`Durga`), `phase` (`pre`|`during`|`after`) and `sample_period`. Date filters use only the year.
- **Nulls:** `value: null` means missing or below detection (see `flag`); never plot it as 0.
- **Units:** assumed; shown in `unit`. pH unit is `pH`.
- **Pagination:** `limit` 1-100, `offset`; responses carry `total`, `limit`, `offset`.
- **Errors:** `{"error": {"code", "message", "details?"}}`; 404 unknown ghat/case/parameter/region, 409 invalid case
  transition, 422 invalid input, 429 AI rate limit, 503 AI unavailable (only with `require_ai: true`).
- **AI endpoints** (`/brief/generate`, `/brief/whatsapp`, `/citizen/ask`) return 200 with template text when AI is
  unavailable: read `generation_mode` (`ai`|`template`) and `ai_status`. Allow a 60 s timeout.

## Enums

`comparison_result`: within_criterion, outside_criterion, insufficient_data, not_comparable - `priority_level`: high,
review, routine, insufficient_data - `case_status`: needs_verification, under_review, action_assigned, resolved -
`language`: en, hi (WhatsApp also bilingual) - `forecast_status`: experimental_estimate, historical_comparison,
insufficient_data. `GET /metadata` returns them all.

## Case status rules

needs_verification -> under_review; under_review -> action_assigned | resolved | needs_verification; action_assigned ->
under_review | resolved; resolved -> under_review. `action_assigned` needs `assigned_to`; `resolved` needs
`resolution_summary` (or `notes`).

## Which endpoint powers which page

| Page | Endpoints |
|---|---|
| Dashboard | `/metadata`, `/analytics/overview`, `/ghats/ranked`, `/analytics/findings`, `/ghats/{id}/trends`, `/cases` |
| Ghat explorer | `/ghats`, `/ghats/ranked` |
| Ghat detail | `/ghats/{id}`, `/ghats/{id}/readings?evaluate=true`, `/ghats/{id}/trends`, `/analytics/findings?ghat_id=` |
| Analytics | `/ghats/{id}/trends`, `/analytics/benchmark`, `/predict/oct20` |
| Prioritization | `/ghats/ranked` |
| AI intelligence | `/brief/generate`, `/brief/whatsapp`, `/citizen/ask` |
| Cases | `/cases`, `/cases/{id}`, `POST /cases`, `PATCH /cases/{id}` |
| Reports | `POST /reports/generate` (`json` or `csv` download) |
| Citizen | `/citizen/ghats`, `/citizen/guide`, `/citizen/resources`, `/citizen/ask` |
| Methodology | `/metadata`, `/criteria`, `/ghats/ranked` (method text) |
| Settings | `/health` |

`master frontend build prompt` in the repository root is the complete build brief for the frontend, including example
responses.
