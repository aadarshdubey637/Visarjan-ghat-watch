# Architecture

A modular monolith: one FastAPI app, logic in independent service modules, SQLite (local) or PostgreSQL (production) for storage.

```
Next.js frontend (separate project)
        |  HTTPS / JSON
FastAPI  /api/v1   routes -> Pydantic schemas -> services
        |
  services/ingestion      download, validate, import (idempotent upserts)
  services/criteria       deterministic CPCB comparison (no AI)
  services/analytics      ghats, readings, trends, overview (pandas)
  services/prioritization review-priority score with factor breakdown
  services/benchmarking   Bhopal vs statewide, only when comparable
  services/forecasting    Oct 20 outlook / refusal
  services/briefs         evidence pack -> template text -> optional AI wording
  services/citizen        guidance + resources + grounded Q&A
  services/cases          verification cases + status workflow
  services/reports        evidence report (JSON / CSV)
  services/ai             Claude call + output validation
        |
SQLite (SQLAlchemy)   ghats, readings, statewide_readings, criteria, review_cases, case_readings,
                      briefs, data_sources
```

## Dependency rule

Analytics first, AI second. `services/ai.py` is only called by `briefs` and `citizen`, after the evidence has been
retrieved and calculated. If AI is unconfigured, slow, refuses, or returns something that fails validation, those
services return their deterministic template text (HTTP 200 with `generation_mode: "template"` and an `ai_status`
explanation), unless the caller sets `require_ai: true` (then HTTP 503).

## Five kinds of content (never mixed)

1. **Observed measurements** - `readings`, with source file, row and PDF page.
2. **Deterministic calculations** - comparisons, priorities, benchmarks, trends.
3. **AI-generated wording** - `generation_mode: "ai"`, validated against supplied evidence.
4. **Experimental forecasts** - `/predict/oct20`, `is_prediction` true only for `experimental_estimate`.
5. **Human-reviewed actions** - cases.

## Database

| Table | Notes |
|---|---|
| `ghats` | derived from the CSV; coordinates null |
| `readings` | unique `(source_file, source_record_id)`; `value` null for missing/BDL, never 0 |
| `statewide_readings` | statewide CSV; `is_duplicate`, `needs_check` flags |
| `criteria` | CPCB limits with operator, thresholds, unit, source reference |
| `review_cases`, `case_readings` | cases and the readings attached to them |
| `briefs` | every generated brief (content, evidence, mode) |
| `data_sources` | file, URL, retrieval time, SHA-256, validation report |

Reading IDs are `bhopal-<row>` (row = CSV data row, header excluded), so re-importing the same file updates rows
instead of duplicating them.

## Cross-cutting

- Errors: `{"error": {"code", "message", "details?"}}`; stack traces are logged, never returned.
- CORS limited to `FRONTEND_ORIGIN`; request bodies over 1 MB get 413.
- AI routes have an in-memory per-IP limit (single-process; use a gateway limiter if you scale out).
- Cases and briefs are written inside transactions with rollback on error.
