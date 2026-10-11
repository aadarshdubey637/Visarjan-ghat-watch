> **Historical brief.** This is the original instruction given to the frontend developer. The app that was built goes further:
> it adds sign-in with roles (officer, field worker, community member, developer and a presenter demo account), a landing page,
> a team page, a ghat x season heatmap and developer-only system status. Where this brief says "no authentication exists" or
> lists `/settings` for everyone, the code and `README.md` are authoritative.

# MASTER BUILD PROMPT — GHAT SENTINEL FRONTEND
## Environmental Intelligence, Water-Quality Analysis & Municipal Action Platform

**Role:** Senior Frontend Engineer + Product Designer + Data Visualization Specialist

**Project:** Ghat Sentinel
**Event:** Claude Impact Lab × Cerebras Café Compute, Bhopal (11 Oct 2026)
**Track:** Track 2 — Visarjan Ghat Watch
**Objective:** Build a complete, responsive, production-quality **Next.js frontend** for the already-built Ghat Sentinel FastAPI backend, and deliver it as a runnable project.

You work **outside the backend repository**. You cannot read the backend source, so this document contains the **complete, verified API contract** (Section 17 and Appendices A–D). Treat it as authoritative. Before coding, confirm it against the running backend's OpenAPI schema (`GET {backend}/openapi.json` or `{backend}/docs`). If the live schema differs from this document, the live schema wins; record the difference in your endpoint checklist.

---

# 0. READ THIS FIRST — FACTS ABOUT THE DATA THAT SHAPE THE UI

These facts are true of the real backend data. Ignoring them will produce a misleading product.

1. **There are NO exact sample dates.** The source (MPPCB reports) gives only **year**, **festival** (`Ganesh` or `Durga`) and **phase** (`pre` = before immersion, `during`, `after` = one week after). Every `sample_date` and `last_sample_date` in the API is `null`. Use `sample_year`, `festival`, `phase` and the ready-made label `sample_period` (e.g. `"2024 Durga (during)"`). **Never show a fake date.** Chart X-axes are *seasons* (e.g. `2023 Ganesh`, `2023 Durga`, `2024 Ganesh` …), ordered by year, then Ganesh before Durga, with phase as the series.
2. **There are NO coordinates.** `latitude`/`longitude` are `null` for every ghat. **Do not build a map** (no Leaflet). Build a list/card explorer. Add a map component only behind a check that coordinates are non-null (stretch goal; currently never rendered).
3. **Date filters are year-granular.** The backend accepts `start_date`/`end_date`/`as_of` as ISO dates but only uses the **year**. Build year pickers (2023–2025 from `/metadata`) and send `YYYY-01-01` / `YYYY-12-31`.
4. **Only 7 ghats and 1,524 readings.** Everything fits in a few requests; client-side filtering and sorting of ghats is fine.
5. **Only three parameters are compared with CPCB limits** under the default class **B (Outdoor bathing, organised)**: `pH` (6.5–8.5, inclusive), `Dissolved oxygen` (≥ 5 mg/l), `BOD` (≤ 3 mg/l). The other ten parameters (COD, Total solids, Dissolved solids, Suspended solids, Turbidity, Conductivity, Chromium, Lead, Zinc, Copper) have **no class-B limit**: their `evaluation.result` is `not_comparable`. The UI must show this as a neutral "No CPCB class B limit" state, not as a problem or an error. Conductivity has a limit only in class E.
6. **Missing is not clean and BDL is not zero.** `value` is `null` for missing readings (`flag`: `not sampled`, `*`, `**`, `DRY`, `na`) and for below-detection readings (`flag`: `BDL`, `ND`). Show the `flag` text; never plot null as 0; never colour it as "good".
7. **Units are assumed** by the dataset curators (the PDFs print none). Show the unit and keep the "units assumed" note in the methodology page.
8. **Real headline numbers** (use only as a sanity check, always render live values): 7 ghats; 1,524 readings; 1,289 numeric; 61 missing; 174 BDL/ND; of 343 evaluable readings (class B) **148 are outside the limit**; years 2023–2025; 42 of 116 dissolved-oxygen readings are < 5 mg/l and 100 of 112 BOD readings are > 3 mg/l.
9. **The October 20 outlook currently never returns a number.** Only 3 Durga seasons exist, an experimental estimate needs 5. Expect `forecast_status: "historical_comparison"` (or `insufficient_data`). The UI must treat that as a normal, honest result.
10. **Durga visarjan is on 20 October 2026**, nine days after the event. Frame the product as "review where to verify before Durga visarjan", not as live monitoring.
11. **No authentication exists.** Present it as a demo/internal tool. Do not build a login page.
12. **AI is optional and degrades gracefully.** The backend (not the browser) calls the Claude API. When AI is unavailable or its output fails validation, brief/answer endpoints still return **HTTP 200** with deterministic template text and `generation_mode: "template"` plus an `ai_status` string. See Section 11.

---

# 1. YOUR MISSION

Build the entire frontend for **Ghat Sentinel**, a decision-support platform that turns historical water-quality readings from immersion ghats into evidence-backed concerns, review priorities, Hindi/English briefs, tracked verification cases and a citizen guide.

It is **not** a generic environmental dashboard and **not** a collection of mockups. No fabricated numbers anywhere.

Users:

1. **Environmental analysts** — investigate readings, trends, criteria and differences between ghats.
2. **Municipal officers** — decide which ghats to verify first and track follow-up cases (the primary persona: the Bhopal Municipal Corporation officer who plans Durga visarjan).
3. **Judges / decision-makers** — understand the problem, evidence, priority logic and actions in seconds.
4. **Citizens and Durga Puja organisers** — learn responsible immersion practices and see clearly-dated historical information.

## The central journey (every screen supports it)

Dashboard → select a ghat → inspect readings, trends and criteria → understand why it is prioritised → generate a Hindi/English brief → create a verification case → track it → export a report → switch to the citizen view.

---

# 2. MANDATORY FIRST STEP: CONFIRM THE BACKEND

## Get and run the backend

Repository: `https://github.com/abhaysahu403/visarjan-ghat-watch` — backend folder `ghat-sentinel-backend/`. (If the repo copy is older than this document, ask the project owner for the latest backend; the contract below describes the current one.)

```bash
cd ghat-sentinel-backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/download_data.py && python scripts/seed_database.py
uvicorn app.main:app --reload --port 8000
```

- Swagger: `http://localhost:8000/docs` · OpenAPI JSON: `http://localhost:8000/openapi.json`
- Health: `http://localhost:8000/api/v1/health`
- CORS allows `http://localhost:3000` by default (backend env `FRONTEND_ORIGIN`, comma-separated).
- AI works only if the backend has `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` set; otherwise AI-optional endpoints return template text. You do **not** need an AI key to build or test the frontend.

The source CSVs and Track 2 problem statement (for context only — the frontend must **not** download or parse CSVs; the backend is the source of truth):
`https://github.com/Vishal4742/bhopal-impact-lab-2026-problem-statements/tree/main/track-2-visarjan-ghat-watch`

## API contract rule

Create an **endpoint compatibility checklist** (a markdown table in your README: endpoint, method, verified against live backend yes/no, UI consumer). Mark an endpoint "verified" only after you called it. Do not invent response fields. If a response differs from Section 17, adapt the client and types to the live backend; never change backend semantics to make a chart easier.

---

# 3. LOCKED TECHNOLOGY STACK

- Next.js (App Router), React, **TypeScript strict**.
- Tailwind CSS + shadcn/ui, Lucide React icons.
- Recharts for charts.
- React Hook Form + Zod for forms.
- TanStack Table where tables need sorting/filtering.
- A lightweight toast system (shadcn `sonner`).
- A small data-fetching layer (TanStack Query is acceptable and recommended; plain fetch + hooks is also fine). No heavy global state library.
- Vitest + React Testing Library (unit/component) and, if time allows, Playwright for one end-to-end journey. Use `msw` or a mocked fetch for component tests.
- **Not used:** Leaflet/maps (no coordinates), any AI SDK in the browser, any analytics engine.

Package manager: npm unless the repo already uses another.

**Deployment:** frontend on Vercel; backend wherever the owner deploys it (e.g. Render).

**Architecture rule:** the browser talks only to the backend through one centralized, typed API client. No secrets in the browser. Do not recompute criterion results, priority scores or trends in the frontend — display what the backend returns. (Formatting, sorting, grouping for charts and counting backend-provided labels is fine.)

---

# 4. PRODUCT DESIGN DIRECTION

A modern environmental intelligence console: serious public-sector operations tool + clean analytics SaaS. Avoid a generic admin look with many colourful cards.

**Name:** Ghat Sentinel · **Tagline:** *Environmental Intelligence. Evidence. Action.*
**Description:** "Turn historical water-quality data into transparent environmental insights and actionable field verification."

### Colour tokens (use CSS variables / Tailwind theme)

| Purpose | Colour |
|---|---|
| Primary dark green | `#123B32` |
| Primary green | `#19765B` |
| Soft green surface | `#EAF5EF` |
| Deep navy | `#172B3A` |
| Background | `#F5F7F5` |
| Card | `#FFFFFF` |
| Primary text | `#182522` |
| Secondary text | `#65736D` |
| Border | `#E0E7E2` |
| Caution | `#B7791F` |
| Critical concern | `#B42318` |
| Info blue | `#3567A8` |

Colour carries meaning, never decoration. Red = a specific, supported concern (e.g. `outside_criterion`, priority `high`). **Never rely on colour alone**: every status needs a text label and an icon.

### Assessment and priority styling (centralise in `assessment-badge.tsx` / `priority-badge.tsx`)

| Backend value | Label | Style |
|---|---|---|
| `within_criterion` | Within criterion | green + check icon |
| `outside_criterion` | Outside criterion | red + alert icon |
| `insufficient_data` | Insufficient data (missing/BDL) | amber + minus-circle icon |
| `not_comparable` | No applicable criterion | neutral grey + info icon |
| priority `high` | High review priority | red |
| `review` | Review | amber |
| `routine` | Routine | green-grey |
| `insufficient_data` | Insufficient data | grey (never "low risk") |

"Within criterion" must never be worded as "safe".

### Typography and layout

Inter (or system UI). Clear hierarchy; tabular numerals for measurements. Desktop-first, responsive to phones, consistent radii, subtle borders/shadows, small purposeful motion with reduced-motion support. No glassmorphism, no heavy gradients, no emoji as icons.

### Visual assets and imagery (no photos of real places)

- Build the logo as an inline SVG: a rounded dark-green square, a white water drop with a check mark, and a thin blue wave line; wordmark "Ghat Sentinel" in Inter bold. Provide a favicon from the same mark.
- Use **inline SVG illustrations** (abstract water layers, stepped-ghat silhouette, leaf) for: the dashboard hero banner (dark-green gradient with a faint data line), the citizen page hero, and the empty / error / "insufficient data" states. Keep them in `public/illustrations/` or as React components.
- **Do not use stock photos or images that claim to show a specific ghat.** The data has no site photos; the product must not imply it does. If the owner supplies photos, place them in `public/images/` with a caption and credit; otherwise use illustrations and icons only.
- Add an Open Graph / social preview image (1200×630 SVG/PNG, logo + tagline).
- Charts, badges and icons are the main "pictures": make them excellent. Every chart needs a title, units, legend and an accessible table alternative.

### Sidebar (collapsible on desktop; bottom sheet/hamburger on mobile)

Overview · Ghat Explorer · Analytics & Trends · Site Prioritization · AI Intelligence · Field Cases · Reports · Citizen Guide · Data & Methodology · Settings / API Status — with matching Lucide icons, active state and keyboard access.

### Top bar

Breadcrumb/title · **dataset coverage badge** ("Historical dataset · 2023–2025", from `/metadata.year_range`) · backend connectivity indicator · language selector (en/hi) · "Demo mode — no login" indicator · mobile menu. **Never show a "Live" indicator.** Use "Historical dataset", "API connected".

### Page layout sketches (guide, not pixel-exact)

```
DASHBOARD (/)
+----------------------------------------------------------------------+
| Hero: Ghat Sentinel — Environmental Intelligence Dashboard           |
| [Historical dataset · 2023–2025]   Not live monitoring               |
+----------+-----------+------------------+----------------+-----------+
| Ghats    | Readings  | Outside-criterion| Sites needing  | Open      |
| covered  | 1,524     | 148 of 343 (B)   | review  7      | cases  0  |
+----------+-----------+------------------+----------------+-----------+
| Seasonal trend chart (param ▾, ghat ▾)   | Priority review panel     |
| X = season, series = phase, class-B line | 1 Bairagarh… 74.6  High   |
|                                          | 2 Malikhedi… 70.5  High   |
+------------------------------------------+---------------------------+
| Important findings (worst first)         | Recent field cases        |
+------------------------------------------+---------------------------+
| [Generate brief] [Compare ghats] [Create case] [Generate report]     |
+----------------------------------------------------------------------+

GHAT DETAIL (/ghats/[id])
+----------------------------------------------------------------------+
| Breadcrumb · Ghat name · water body · priority badge · data coverage |
| Notice: findings describe historical records, not current conditions |
| [Generate brief] [WhatsApp summary] [Create case] [Report]           |
+----------------------+-----------------------------------------------+
| Summary + data       | Parameter results table (latest season,       |
| quality warnings     | assessment badge, source page, evidence)      |
+----------------------+-----------------------------------------------+
| Trend explorer (chart/table toggle, parameter ▾, years ▾)            |
+----------------------------------------------------------------------+
| Why this site is prioritised: 4 factors with points/max + explanation|
+----------------------------------------------------------------------+
| Findings list (outside criterion) with evidence links                |
+----------------------------------------------------------------------+

CASE DETAIL (/cases/[id])
+----------------------------------------------------------------------+
| Case ID · ghat · status stepper · priority · created/updated         |
| Recommended action · notes · linked readings (evidence links)        |
| Status form: next allowed statuses only, assignee, summary           |
+----------------------------------------------------------------------+
```

---

# 5. APPLICATION ROUTES

| Route | Purpose |
|---|---|
| `/` | Dashboard |
| `/ghats` | Ghat directory |
| `/ghats/[ghatId]` | Ghat intelligence detail |
| `/analytics` | Trends, comparison, benchmark, completeness, Oct 20 outlook |
| `/prioritization` | Ranked review priorities with explanation drawer |
| `/intelligence` | Brief generator, WhatsApp brief, citizen-style Q&A |
| `/cases` | Case queue |
| `/cases/[caseId]` | Case detail and updates |
| `/reports` | Report generation and export |
| `/citizen` | Citizen guide (distinct, simpler layout) |
| `/methodology` | Sources, criteria, classifications, scoring, limitations |
| `/settings` | API status and preferences |

Every nav item leads to a working page. If a backend capability is missing, show an honest "not available" state and list it in the README.

---

# 6. PAGE 1 — DASHBOARD (`/`)

Question answered: *"What does the available evidence show, which ghats deserve closer review, and what can the team do next?"*

**Header:** "Ghat Sentinel — Environmental Intelligence Dashboard", subtitle "Explore historical water-quality records, understand site-level concerns, and coordinate evidence-backed verification.", coverage badge from `/metadata`, and a permanent note "Historical MPPCB samples, not real-time monitoring."

**Metric cards** (loading / empty / error states each):

| Card | Source |
|---|---|
| Ghats covered | `overview.total_ghats` |
| Historical readings | `overview.total_readings` (subtext: `numeric_readings` numeric, `missing_readings` missing, `censored_readings` BDL/ND) |
| Outside-criterion readings | `overview.flagged_readings` of `evaluated_readings`, labelled with `overview.cpcb_class` and `intended_use` |
| Ghats needing review | count of `/ghats/ranked` items whose `priority_level` is `high` or `review` (a count of backend labels, not a new rule) |
| Open cases | sum of `overview.cases_by_status` for `needs_verification`, `under_review`, `action_assigned` |

Do not mix reading counts with ghat counts; each card says which it is. Show `overview.data_quality_warnings` in a collapsible "Data quality notes" card.

**Left: seasonal trend chart.** Parameter dropdown (from `/metadata.parameters`), optional ghat filter, optional year range. Data: `GET /ghats/{id}/trends?parameter=` (for "all ghats" fetch the 7 ghats in parallel and plot one line per ghat for the chosen phase, default `during`). X-axis = season label; Y = value with unit; tooltip shows ghat, `sample_period`, value, unit, flag, source page. Draw **criterion reference lines only** when Appendix C maps the parameter to a class-B criterion (from `GET /criteria?cpcb_class=B`); `pH` has two lines (6.5 and 8.5). Missing/BDL points are shown as gaps with a marker/legend ("not sampled" / "BDL"), never as 0.

**Right: priority review panel** from `GET /ghats/ranked`: rank, ghat, score (or "—" for `insufficient_data`), band badge, `outside_reading_ids.length` supporting findings, `last_sample_year`, "View details". Label: *"Project-defined review-priority score (0–100). Not an official CPCB index and not a probability of contamination."* Link to `/methodology`.

**Important findings panel:** `GET /analytics/findings?limit=5` (outside-criterion readings, worst first). Each item: ghat, parameter, value + unit, criterion text (from `reading.evaluation`: operator + threshold + source_reference), `sample_period`, `evaluation.reason`, "Inspect evidence" → ghat detail with that reading highlighted, and "Create case" prefilled.

**Recent field activity:** `GET /cases?limit=5`. Empty state → "Create verification case".

**Quick actions:** Generate brief → `/intelligence`; Compare ghats → `/analytics#compare`; Create case → case dialog; Generate report → `/reports`.

---

# 7. PAGE 2 — GHAT EXPLORER (`/ghats`)

Data: `GET /ghats?limit=100` merged (client-side) with `GET /ghats/ranked` by `ghat_id`.

- Search by name (use the backend `search` param or filter locally).
- Filters (client-side, only what exists): priority band, water body, "has Durga 2025 data". Show result count and "Clear filters".
- Card and table views. Card: name, water body, `first_sample_year–last_sample_year`, `observation_count`, priority badge + score, outside-criterion count (`outside_reading_ids.length`), data-quality chip if `site_match_confidence` is `medium`, "Explore ghat".
- No map, no coordinates, no photos. Show a small note: "Coordinates are not available in the source data."
- Add a compare selector (checkboxes) that sends the user to `/analytics?ghats=a,b#compare`.

---

# 8. PAGE 3 — GHAT DETAIL (`/ghats/[ghatId]`)

Data: `GET /ghats/{id}` (summary, parameters, `latest_readings` **with evaluation**, data quality), `GET /ghats/ranked` (this ghat's priority entry), `GET /ghats/{id}/trends`, `GET /ghats/{id}/readings`, `GET /analytics/findings?ghat_id=`.

A. **Header:** name, breadcrumb, water body, `id`, coverage ("2023–2025, N readings"), priority badge, buttons (Generate brief, WhatsApp summary, Create case, Generate report). Always show: *"Findings describe available historical records and do not establish current water conditions."* Show `data_quality.warnings` (e.g. "No data for: 2025 Durga", medium site-match confidence, no coordinates).

B. **Summary:** readings, numeric/missing/BDL counts, parameters, `seasons_covered` vs `seasons_missing`, `data_quality.completeness` (as %), outside-criterion count, priority score with factors.

C. **Parameter results table** from `latest_readings` (most recent season per parameter, all three phases): columns Parameter · Phase · Value + unit (or flag text) · Sample period · Applicable criterion (`evaluation.comparison_operator` + `threshold`[–`threshold_upper`] + unit; or "No class B limit") · Assessment badge · Evidence (source file, row `source_record_id`, PDF page `source_page`). Sort/filter/paginate. Null value → show `flag` (e.g. "BDL", "not sampled"), never 0. Class selector (A–E, default B) re-fetches `GET /ghats/{id}?cpcb_class=`.

D. **Trend analysis:** parameter selector, year range, chart/table toggle. Chart: X = season, one line per phase (pre/during/after), gaps for missing, class-B reference lines where valid, units on the axis. Below: `trend_summaries` ("Durga, during immersion: first 0.0 → last 2.2 mg/l, change +2.2, increase — descriptive only, n seasons, no significance test"); show `limitations`. If `supported` is false, show the reason, not a trend. Raw readings table with pagination (`limit ≤ 100`, `offset`) and `evaluate=true`.

E. **Findings:** chronological list from `/analytics/findings?ghat_id=` (re-sorted by season client-side if desired) with title, `sample_period`, parameter, value, criterion, badge, evidence link, `evaluation.reason`.

F. **"Why this site is prioritised":** the four backend factors verbatim — `exceedance_rate` (max 40), `severity` (max 20), `recurrence` (max 25), `staleness` (max 15) — as a bar per factor (`points` / `max_points`) with `label` and `explanation`; total score; `reasons`; `limitations`; link to `/methodology`. If `priority_level` is `insufficient_data`, say so ("evidence does not support a classification") — never "low".

G. **Related actions** prefilled with `ghat_id` and relevant reading IDs: brief, WhatsApp, case, report.

---

# 9. PAGE 4 — ANALYTICS & TRENDS (`/analytics`)

A. **Trend explorer** — same chart component as the dashboard, with parameter, ghat(s), year filters and unit-compatible series only.

B. **Ghat comparison** (`#compare`): choose 2+ ghats and one parameter; call trends per ghat; show season-aligned lines, sample counts (`sample_count`), coverage years, `missing_count`, and assessment of the latest `during` value. Parameters with different units are never plotted on one axis.

C. **Statewide benchmark:** `GET /analytics/benchmark?parameter=…&year=…&region=…&phase=…` (`parameter` required). Show `bhopal`, `statewide`, `statewide_excluding_bhopal_office`, optional `region_stats` as side-by-side stat blocks (n, median, mean, p25/p75, min/max, exceedance rate, site count, years). Always show `aggregation_method`, `missing_data_exclusions`, `source_coverage` and every entry in `warnings` and `limitations`. If `comparable` is `false`, the blocks are `null`: show the warnings as the result and never invent a comparison. Do not say Bhopal is the best/worst. Region choices: `R.O. Bhopal` and other MPPCB regional offices (unknown region → 404 `REGION_NOT_FOUND`).

D. **Data completeness:** from `/ghats/{id}` for each ghat: completeness %, seasons covered/missing, numeric/missing/BDL counts per parameter (`parameters[]`), a ghat × season coverage grid (derived from `seasons_covered`).

E. **October 20 outlook:** `GET /predict/oct20?ghat_id=&parameter=&year=` (defaults: parameter "Dissolved oxygen", year 2026, `ghat_id` omitted = pooled). Render by `forecast_status`:
- `experimental_estimate` (needs ≥ 5 seasons; not reachable with current data): show `prediction` + unit, method, `uncertainty` (range/SD), `historical_sample_count`, `date_range_used`, assumptions, limitations, with a bold "Experimental — not an observed reading" tag.
- `historical_comparison`: no prediction. Show the past Durga "during" values (`historical_values`) as a small chart/table with min/median/max in the limitation text, plus the message that a forecast is not defensible.
- `insufficient_data`: honest empty state + link to historical trends.
Always display `limitations` and `assumptions`. Never display a number as a forecast unless `is_prediction` is `true`. Target date is `target_date` (20 Oct of the year).

---

# 10. PAGE 5 — SITE PRIORITIZATION (`/prioritization`)

Data: `GET /ghats/ranked` with optional `as_of`, `start_date`/`end_date` (year pickers) and `cpcb_class` (class selector, default B; label the class and `intended_use`).

Table: Rank · Ghat · Score · Band · Supporting findings (`outside_reading_ids.length` of `evaluated_reading_count`) · Completeness (`data_completeness` %) · Latest sample year (`last_sample_year`) · Primary reason (`reasons[0]`) · Actions (Details, Create case, Report). Search, sort (score, name), filter by band.

**Explanation drawer** on row click: overall score and the definition text from `method`; the four factors (`label`, `raw_value`, `points`/`max_points`, `explanation`); `reasons`; `limitations`; "why a field verification may help" (derived from outside findings and recurrence, using backend text only); link to methodology. Show the `disclaimer` string from the response.

Safeguards: `insufficient_data` rows are shown last with "—" for score and the backend reason; a low score never reads as "good water". Never call the score a CPCB index or a probability.

---

# 11. PAGE 6 — AI INTELLIGENCE (`/intelligence`)

The backend does all AI work (Claude) and validates it against evidence; the frontend collects input and displays results. No client-side AI, no fallback chatbot.

### How AI behaves (important for the UI)

- Requests accept `use_ai` (default true) and `require_ai` (default false).
- Responses carry `generation_mode`: `"ai"` (wording written by the AI model from backend evidence and validated) or `"template"` (deterministic text), and `ai_status` (null when AI was used; otherwise a reason such as "AI is not configured…", "…timed out…", "AI output failed evidence validation…").
- With `require_ai: false` the call succeeds (HTTP 200) with template text on any AI problem. Show a badge: **"AI-worded"** vs **"Deterministic template"**, and show `ai_status` as a quiet note when present. Do not treat the template as an error.
- With `require_ai: true` AI problems return **503** (`AI_NOT_CONFIGURED`, `AI_TIMEOUT`, `AI_UPSTREAM_ERROR`, `AI_BAD_RESPONSE`, `AI_REFUSED`, `AI_INVALID_OUTPUT`). Default the UI to `require_ai: false`; offer an "AI wording only" toggle that sets it true and handles 503 with a retry.
- AI calls can take 5–30 s: use a 60 s timeout for these three endpoints, a spinner (no invented progress steps), and prevent double submit.
- AI endpoints are rate limited (default 20 requests/min/IP): handle **429** `RATE_LIMITED` with a "try again in a minute" message.
- `health.ai_configured` / `metadata.ai_configured` tells you if AI is available; show it in Settings and hint in the UI ("AI wording unavailable — template text will be used").

### A. Brief generator — `POST /brief/generate`

Inputs (only these exist): ghats (multi-select of up to 10; empty = all), year range (`start_date`/`end_date`, year-granular), language `en` | `hi`, `use_ai`. Do **not** build brief types, audiences or "include evidence" toggles; the backend has none.

Output: `title`, `content` (plain text with line breaks — render in a `<pre>`-style block with `white-space: pre-wrap`, never as HTML), `language`, `generated_at`, `generation_mode`, `ai_status`, `evidence[]`, `limitations[]`, `brief_id`. Show: the brief; an **Evidence** panel (each `EvidenceItem`: `id`, `type` observation | calculation | guidance | resource | forecast, `text`, source file/row/page) — clicking an observation evidence ID opens that ghat's reading; **Limitations** list; Copy and Download (.txt) buttons that really work.

### B. WhatsApp brief — `POST /brief/whatsapp`

Inputs: ghats (multi), language `en` | `hi` | `bilingual`, `include_actions` (boolean), `use_ai`. Output: `content` (WhatsApp-style text with `*bold*` markers), `evidence`, `limitations`, `generation_mode`, `ai_status`. Show a phone-style preview (render `*bold*` as bold safely), character count, **Copy** (must copy to clipboard), Regenerate. Say "Prepared for manual sharing" — do not claim anything was sent.

### C. Citizen-style Q&A — `POST /citizen/ask`

Body: `question` (3–500 characters; enforce with a counter), `language` `en` | `hi`, optional `ghat_id`, `use_ai`. **Stateless**: the backend has no conversation memory, so each message is independent; keep the transcript client-side only and make "Clear" a local action. Show suggested questions (examples, not canned answers): "How can we reduce pollution during visarjan?", "What should organizers do with non-biodegradable decorations?", "Where can I find official immersion instructions?", "What does a historical water-quality reading mean?", "Is this ghat safe today?" (the answer will state that no current observations exist). Display `answer`, `evidence` (guidance/resource/observation chips), `limitations` (always visible — the first limitation states there is no live data when the question is about current safety), `generation_mode` badge.

Never add regulatory claims, helplines or site lists in the UI; show only returned content.

### D. Transparency note

*"AI-generated explanations are based on available records and backend-provided evidence. They do not replace official environmental assessments or current water testing."*

---

# 12. PAGE 7 — FIELD CASES (`/cases`, `/cases/[caseId]`)

A case = a request to verify a concern. It does not mean authorities accepted it or pollution is confirmed.

### Backend model (use exactly this)

`ReviewCase`: `id` (e.g. `case_ab12cd34ef`), `ghat_id`, `reading_ids[]`, `created_at`, `updated_at` (UTC ISO), `priority_level` (assigned by the server at creation from the ranking: `high` | `review` | `routine` | `insufficient_data`), `recommended_action`, `status`, `assigned_to` (nullable), `notes`, `resolution_summary` (nullable).

There is **no title, description, due date, creator, history/timeline or "overdue"**. Do not build them. Show the real fields only.

**Statuses:** `needs_verification` → `under_review` → `action_assigned` → `resolved`.

**Allowed transitions (enforced by the backend, mirror them in the UI):**

| From | Allowed next |
|---|---|
| `needs_verification` | `under_review` |
| `under_review` | `action_assigned`, `resolved`, `needs_verification` |
| `action_assigned` | `under_review`, `resolved` |
| `resolved` | `under_review` (re-open) |

Rules: moving to `action_assigned` requires `assigned_to` (else 422); moving to `resolved` requires `resolution_summary` (or `notes` in the same request) (else 422); an invalid transition returns **409** `INVALID_STATUS_TRANSITION`. Show only the allowed next statuses in the status control and still surface backend errors.

### Case dashboard (`/cases`)

Counts per status from `GET /analytics/overview` → `cases_by_status`. Table from `GET /cases?status=&ghat_id=&limit=&offset=` (pagination `total/limit/offset`; filters exist only for `status` and `ghat_id`). Columns: Case ID · Ghat (name via ghat list) · Priority · Status · Recommended action (truncated) · Created · Updated. Row click opens detail.

### Create case — `POST /cases` (201)

Body: `ghat_id` (required), `reading_ids[]` (optional, each must belong to that ghat else 422 `INVALID_READING_IDS`), `recommended_action` (3–1000 chars, required — offer review-oriented suggestions such as "Verify the recorded Dissolved oxygen measurement against the MPPCB report"), `notes` (optional ≤ 4000). Prefill ghat and reading IDs when opened from a finding or ghat page. Validate with Zod, show backend `details[]` per field, disable submit while pending, show success only after the 201, then navigate to the new case.

### Case detail

Show all fields, a status stepper, linked readings (each fetched/linked as evidence with source file, row and PDF page), and a form: status (allowed next only), `assigned_to`, `notes`, `resolution_summary` → `PATCH /cases/{id}` with only changed fields. Refresh after mutation. No fake timeline: show created/updated timestamps only.

---

# 13. PAGE 8 — REPORTS (`/reports`)

`POST /reports/generate` with `{ghat_ids?, start_date?, end_date?, language: "en"|"hi", format: "json"|"csv"}`. **There is no PDF, no section toggles and no report history** — do not build them.

- `format: "json"` → structured `Report`: `title`, `generated_at`, `selection`, `categories_note`, `criteria[]`, `criteria_selection_note`, `calculations[]`, `sections[]` (per ghat: `readings[]` with evaluation, `comparisons[]`, `priority`, `exceedance_counts_by_parameter`, `cases[]`), `historical_context[]`, `outlook`, `ai_explanations[]` (currently always empty), `limitations[]`. Render a readable preview with the sections kept visually separate: **Observations** (readings), **Calculations** (comparisons, priority), **Forecast/outlook**, **Human-reviewed cases**, **AI** (empty — say "no AI text included"). A report for one ghat is large (~250 KB): paginate/virtualise the readings table.
- `format: "csv"` → file response (`text/csv`, `Content-Disposition: attachment`). Download via blob; one row per reading with its comparison and ghat priority.
- Offer "Download JSON" (save the returned JSON) and "Print / Save as PDF" (browser print stylesheet on the preview). Label the latter honestly as browser printing; never claim the backend produced a PDF.
- Selection UI: ghat multi-select (max 10; empty = all), year range, language, format.

---

# 14. PAGE 9 — CITIZEN GUIDE (`/citizen`)

A distinct, simpler, mobile-first layout with larger type and plain language, using the same evidence standards. English/Hindi toggle (guide content is returned in both).

A. **Intro:** "Understand historical environmental information and learn responsible ways to reduce pollution during immersion activities." Hero illustration (inline SVG).

B. **Historical information** — `GET /citizen/ghats`: per ghat `name`, `water_body`, `last_sample_year`, `latest_season`, `latest_season_summary[]` (plain sentences), `historical_comparison`, `limitations`, `current_conditions` ("unknown"). The response has `current_conditions_available: false` and a `notice`: display the notice prominently at the top. **Do not sort or label ghats as "safest", "best", "clean" or "safe today"**; list them alphabetically (the response is already alphabetical). `historical_exceedance_rate` is a record of past samples, not a safety score — if shown, label it "Share of past comparable readings outside CPCB class B limits".

C. **Responsible immersion guide** — `GET /citizen/guide?language=en|hi`: `items[]` {`id`, `title`, `body`, `category`, `approval_status`, `basis`}; group by `category` (idols, offerings, decorations, sites, practices, safety, understanding_data). Show the response `notice` ("DRAFT for municipal review… not an official order") and each item's `approval_status` (currently `draft_pending_municipal_review`) as a visible "Draft guidance" chip. Do not add rules of your own.

D. **Verified resources** — `GET /citizen/resources`: `items[]` {`title`, `url`, `issuing_organization` (nullable), `resource_type`, `last_verified` (nullable), `description`, `verification_note`}. Show the response `notice`. Render links only if the URL is `https://`, with `rel="noopener noreferrer"` and `target="_blank"`. Show `verification_note` and `last_verified` (or "not verified"). Resource types include news reports and a calendar site: label them as such, not as official orders. The backend publishes no helplines and no approved-site list: do not add any.

E. **Ask a question** — reuse Q&A (Section 11C) with simple styling.

F. **Disclaimer (always visible):** *"Historical measurements do not establish current water safety. Follow current official instructions and rely on appropriate testing and official advisories for present conditions."*

---

# 15. PAGE 10 — DATA & METHODOLOGY (`/methodology`)

Built from live endpoints so it never drifts from the backend:

A. **Data sources** — `GET /metadata.sources[]`: file name, URL, retrieved-at, SHA-256 (short), imported-at, row counts (`row_count`, `valid_row_count`, `invalid_row_count`), year range, `warnings`, `errors`. Link the Track 2 repository.
B. **Parameters and units** — `GET /metadata.parameters[]`: name, unit (assumed), observation count, `cpcb_classes_with_limit`. Note the units-assumed caveat and the 13 parameters.
C. **Criteria** — `GET /criteria` (all 19, filter by class): class, intended use (`classes` map), parameter, operator, threshold (+ upper), unit, `source_reference`. Explain: the class is an explicit project choice (default **B**, outdoor bathing); only parameters listed for a class are compared; range limits are treated as inclusive; dataset "BOD" corresponds to criteria "BOD (5 days 20C)".
D. **Assessment classifications** — explain the four values (Section 4 table) with their exact enum names.
E. **Prioritization** — from `/ghats/ranked`: show the `method` string, the four factors with max points (40/20/25/15), thresholds (high ≥ 60, review ≥ 35, routine < 35, `insufficient_data` when fewer than 6 evaluable readings), and the `disclaimer`. State it is a project heuristic, not an official CPCB index or probability.
F. **Forecast policy** — outlook is refused unless ≥ 5 comparable seasons exist for one ghat; today only 3 exist.
G. **Limitations** — historical ≠ current; no exact sample dates; units assumed; blank = not sampled (not clean); BDL ≠ zero; incompatible units/criteria are not compared; "outside a criterion" is not a complete environmental or health assessment; the statewide file was not checked table-by-table and has flagged duplicates; the AI only re-words validated evidence; Rani Kamlapati/Kamla Park may be two places; Bairagarh and Malikhedi have no Durga 2025 table; no authentication.
Link this page from the dashboard, ghat detail and the prioritization drawer.

---

# 16. SETTINGS & API STATUS (`/settings`)

Backend base URL (non-secret), connectivity (from `GET /health`), `status` (`ok` | `degraded`), `database`, `data_loaded`, `ghats_loaded`, `readings_loaded`, `ai_configured`, last successful request time (client-tracked), dataset metadata, frontend version/build id, language preference. Distinguish four states and do not mark everything green because `/health` answered: **Backend reachable**, **Dataset loaded** (`data_loaded`), **Analytics available** (derive from successful `/analytics/overview`), **AI configured** (`ai_configured`; says nothing about quota or model availability). Never show env values or keys.

---

# 17. BACKEND API CONTRACT (VERIFIED)

Base: `{NEXT_PUBLIC_API_BASE_URL}/api/v1`. Dates are ISO 8601; timestamps are UTC (`…Z` or `+00:00`). JSON in/out. Nulls are meaningful.

## 17.1 Error envelope (all non-2xx)

```json
{ "error": { "code": "GHAT_NOT_FOUND", "message": "Ghat 'x' was not found.", "details": [{"field":"limit","message":"…"}] } }
```
`details` appears only for `VALIDATION_ERROR` (422). Codes: `NOT_FOUND`, `GHAT_NOT_FOUND`, `CASE_NOT_FOUND`, `PARAMETER_NOT_FOUND`, `REGION_NOT_FOUND` (404); `VALIDATION_ERROR`, `INVALID_READING_IDS` (422); `INVALID_STATUS_TRANSITION` (409); `REQUEST_TOO_LARGE` (413); `RATE_LIMITED` (429); `AI_NOT_CONFIGURED`, `AI_TIMEOUT`, `AI_UPSTREAM_ERROR`, `AI_BAD_RESPONSE`, `AI_REFUSED`, `AI_INVALID_OUTPUT` (503, only when `require_ai: true`); `METHOD_NOT_ALLOWED` (405); `INTERNAL_ERROR` (500). Never display raw stack traces; map codes to friendly messages and keep `message`.

## 17.2 Endpoints

| Method | Path | Query / body | Notes |
|---|---|---|---|
| GET | `/health` | – | `{status, timestamp, database, data_loaded, ghats_loaded, readings_loaded, ai_configured, app, env}` |
| GET | `/metadata` | – | coverage, parameters, sources, classes, enums (Appendix A) |
| GET | `/ghats` | `search`, `limit` (1–100, default 50), `offset` | `{items[GhatSummary], total, limit, offset}` |
| GET | `/ghats/ranked` | `as_of`, `start_date`, `end_date`, `cpcb_class` (A–E) | `RankedResponse` |
| GET | `/ghats/{ghat_id}` | `cpcb_class` | `GhatDetail` |
| GET | `/ghats/{ghat_id}/readings` | `parameter`, `start_date`, `end_date`, `limit` (≤100), `offset`, `evaluate` (bool), `cpcb_class` | `{items[Reading], total, limit, offset, limitations}` |
| GET | `/ghats/{ghat_id}/trends` | `parameter`, `start_date`, `end_date` | `{ghat_id, items[ParameterTrend]}` |
| GET | `/analytics/overview` | `cpcb_class` | `Overview` |
| GET | `/analytics/findings` | `ghat_id`, `parameter`, `cpcb_class`, `limit` (≤100, default 20), `offset` | outside-criterion readings, worst first |
| GET | `/analytics/benchmark` | `parameter` (**required**), `year`, `region`, `phase`, `cpcb_class` | `Benchmark` |
| GET | `/criteria` | `cpcb_class` | all CPCB criteria |
| GET | `/predict/oct20` | `ghat_id`, `parameter`, `year` | `Oct20Outlook` |
| POST | `/brief/generate` | body below | `BriefResponse` (AI route) |
| POST | `/brief/whatsapp` | body below | `WhatsAppResponse` (AI route) |
| POST | `/citizen/ask` | body below | `AIResponse` (AI route) |
| GET | `/citizen/ghats` | – | `CitizenGhats` |
| GET | `/citizen/guide` | `language` (`en`\|`hi`) | `Guide` |
| GET | `/citizen/resources` | – | `Resources` |
| GET | `/cases` | `status`, `ghat_id`, `limit` (≤100, default 50), `offset` | `{items[ReviewCase], total, limit, offset}` |
| POST | `/cases` | body below | **201** `ReviewCase` |
| GET | `/cases/{case_id}` | – | `ReviewCase` |
| PATCH | `/cases/{case_id}` | body below | `ReviewCase` |
| POST | `/reports/generate` | body below | `Report` JSON, or `text/csv` attachment |

Request bodies:

```jsonc
// POST /brief/generate
{ "ghat_ids": ["ghat_khatlapura_ghat"], "start_date": null, "end_date": null, "language": "en", "use_ai": true, "require_ai": false }
// ghat_ids: null/[] = all ghats, max 10. language: "en" | "hi"

// POST /brief/whatsapp
{ "ghat_ids": null, "language": "hi", "include_actions": true, "use_ai": true, "require_ai": false }
// language: "en" | "hi" | "bilingual"

// POST /citizen/ask
{ "question": "Is the ghat safe today?", "language": "en", "ghat_id": null, "use_ai": true, "require_ai": false }
// question: 3–500 chars

// POST /cases
{ "ghat_id": "ghat_khatlapura_ghat", "reading_ids": ["bhopal-00052"], "recommended_action": "Verify the recorded measurement", "notes": "" }

// PATCH /cases/{id}   (send only changed fields)
{ "status": "under_review", "assigned_to": "reviewer", "notes": "Verification requested", "resolution_summary": null }

// POST /reports/generate
{ "ghat_ids": ["ghat_khatlapura_ghat"], "start_date": null, "end_date": null, "language": "en", "format": "json" }
```

Request bodies over 1 MB are rejected (413). Unknown extra fields are ignored.

## 17.3 Pagination

`limit` 1–100 (values outside → 422). Responses include `total`, `limit`, `offset`. Implement real next/previous using `offset += limit`.

## 17.4 Ghats in the current data (IDs are slugs of the names — do not hardcode; always read `/ghats`)

| `id` | Name | Water body |
|---|---|---|
| `ghat_bairagarh_sant_hirdaram_kund` | Bairagarh (Sant Hirdaram) kund | Upper Lake |
| `ghat_hathaikheda_dam_kund` | Hathaikheda dam / kund | Hathaikheda dam |
| `ghat_khatlapura_ghat` | Khatlapura ghat | Lower Lake |
| `ghat_malikhedi_kund` | Malikhedi kund | Kund |
| `ghat_prempura_ghat` | Prempura ghat | Upper Lake |
| `ghat_rani_kamlapati_ghat_kamla_park_kund` | Rani Kamlapati ghat / Kamla Park kund | Lower Lake |
| `ghat_shahpura_lake_ghat` | Shahpura lake ghat | Shahpura Lake |

Reading IDs look like `bhopal-00052` (the CSV row). `source_page` is the page in the MPPCB PDF report.

---

# 18. CENTRALIZED API CLIENT

`src/lib/api/client.ts` plus per-area modules (`health.ts`, `metadata.ts`, `ghats.ts`, `analytics.ts`, `criteria.ts`, `predict.ts`, `briefs.ts`, `citizen.ts`, `cases.ts`, `reports.ts`).

Responsibilities: resolve base URL; serialize query params (omit undefined/empty); JSON + blob (CSV) handling; normalise errors into a typed `ApiError { status, code, message, details? }`; timeouts (15 s default, **60 s for `/brief/*` and `/citizen/ask`**); `AbortSignal` support; network-failure handling; no duplicated fetch logic in components.

**Environment:** `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` — the **origin only, no path**. The client appends `/api/v1`. Never produce `/api/v1/api/v1`. Provide `.env.example`. No secrets in `NEXT_PUBLIC_*`. No hardcoded localhost in components.

**Error UX** — distinct states for: network unavailable, timeout, validation error (field-level), not found, rate limited, AI unavailable/invalid (when `require_ai`), no data, insufficient evidence. Retry buttons where useful. Never replace a failed call with fake demo data.

---

# 19. TYPESCRIPT TYPES

Mirror the schemas in Appendix B exactly (strict, no `any`). Use string-literal union types for every enum in Appendix A. Nullable fields stay `T | null`. Keep `id`s for evidence linking. Suggested files: `src/lib/types/{common,ghat,reading,analytics,forecast,brief,citizen,case,report,meta}.ts`.

---

# 20. STATE AND DATA FLOW

Server components for first paint where it helps; client components for charts, filters, forms. Use TanStack Query (or equivalent) for caching with sensible `staleTime`, and **invalidate** `cases`, `overview` and `ranked` after case mutations. Required behaviour: the dashboard loads real metadata/overview/ranked/findings; selecting a ghat opens its detail; changing parameter/year refetches trends; filters change what is shown; creating/updating a case sends real POST/PATCH; brief/WhatsApp/Q&A/report call the backend; refreshing the page keeps persisted cases. Each async action has idle / loading / success / empty / error states and shows success only after the server confirms.

---

# 21. COMPONENT ARCHITECTURE

```text
src/
  app/ (layout, page, ghats/[ghatId], analytics, prioritization, intelligence, cases/[caseId], reports, citizen, methodology, settings)
  components/
    layout/    app-shell, sidebar, topbar, page-header
    dashboard/ metric-card, trend-chart, priority-panel, findings-panel, recent-cases
    ghats/     ghat-card, ghat-table, ghat-filters, parameter-results-table, priority-explanation
    analytics/ trend-explorer, compare-chart, benchmark-panel, data-completeness, outlook-panel
    intelligence/ brief-generator, whatsapp-preview, citizen-chat, evidence-list
    cases/     case-table, case-form, case-status-stepper, case-details
    reports/   report-builder, report-preview
    citizen/   guide-section, resource-list, ghat-history-card
    shared/    loading-state, empty-state, error-state, api-status, assessment-badge, priority-badge,
               evidence-link, generation-badge, season-axis helpers, confirmation-dialog
  lib/ (api, types, utils, formatters, constants, i18n)
  hooks/
```

Adapt as needed; keep presentation, API access and formatting separated. Centralise season ordering (`year`, then `Ganesh` < `Durga`, then phase `pre` < `during` < `after`), assessment/priority mappings, the parameter→criterion mapping (Appendix C) and status transitions.

---

# 22. CHARTING AND DATA RULES

Every chart has a title, labelled axes with units, a legend, tooltips (ghat, `sample_period`, value, unit, flag, source page), loading/empty states, responsive layout and an accessible table alternative.

Integrity rules: never convert null to zero; never combine incompatible units; never share an axis across different parameters; never present interpolated values (draw gaps; do not smooth); show reference lines only for applicable class-B criteria; distinguish sample counts from ghat counts; label derived metrics; preserve `sample_year`/festival/phase (there are no dates to invent); do not infer stability for unobserved seasons. If the backend returns no data, explain why instead of showing an empty chart.

---

# 23. RESPONSIVE DESIGN AND ACCESSIBILITY

Desktop (collapsible sidebar, multi-column), tablet (fewer columns), phone (compact nav, stacked metrics, scrollable/card tables, large tap targets, no chart overflow; the citizen page must be especially good on mobile). Semantic HTML, keyboard-accessible menus/dialogs, visible focus, labelled forms, AA contrast, `aria-live` for status messages, no colour-only indicators, reduced-motion support.

---

# 24. LOCALIZATION

English and Hindi. Use a translation dictionary (e.g. `next-intl` or a small custom provider) for UI labels, navigation, buttons, status labels and static citizen text. Backend content arrives in the requested language (`language` param on brief/ask/guide) — pass the user's selection and display it as returned. Never machine-translate criteria, evidence text or backend numbers. Parameter names stay in English (the backend uses them as keys). Do not claim full bilingual coverage if only part is translated; list what is translated in the README.

---

# 25. SECURITY AND RELIABILITY

No secrets in the browser; constrain inputs (question ≤ 500 chars, ghat selection ≤ 10); render AI/backend text **as plain text** (no `dangerouslySetInnerHTML`; if you render Markdown/WhatsApp bold, use a safe renderer that never executes HTML); validate external URLs (`https://` only) before linking; no stack traces; one failed widget must not crash the page (error boundaries); prevent duplicate submits; request timeouts; present the app as an unauthenticated demo and document that case endpoints are open writes.

---

# 26. PERFORMANCE

Lazy-load chart bundles; use backend pagination (`limit ≤ 100`); avoid duplicate requests (shared query keys); parallelise per-ghat trend calls; virtualise or paginate the large report readings table; avoid unneeded libraries.

---

# 27. TESTING REQUIREMENTS

Do not stop when pages look good; test the journeys.

**API integration (against the real backend):** health, metadata, ghats, ranked, ghat detail, readings (with `evaluate`), trends, overview, findings, criteria, benchmark, oct20, brief/generate, brief/whatsapp, citizen/ask, citizen/ghats, guide, resources, cases create/list/get/patch (including a valid transition, an invalid transition → 409, and resolve-without-summary → 422), reports json + csv. Mark only the endpoints you actually exercised.

**UI tests (at least):** dashboard loading/error; ghat search/filter; opening a detail page; switching chart parameter; null/BDL/insufficient/not_comparable rendering; creating a case; updating status; generating and copying a brief and WhatsApp text; asking a citizen question; generating a report/CSV download; mobile navigation; backend-down handling; AI `template` vs `ai` badges; 429 handling.

**Quality gates:** `tsc --noEmit`, ESLint, production build, tests. Fix failures before packaging. Never claim a test passed unless it ran.

---

# 28. REQUIRED DELIVERABLES

A ZIP named `ghat-sentinel-frontend.zip` containing: complete Next.js source, components, API modules, types, styling/tokens, `.env.example`, README, tests, config files, and **no** `node_modules`, `.next` or secrets. It must extract and install independently.

**README must cover:** prerequisites; install; env config (`NEXT_PUBLIC_API_BASE_URL`); running locally with the backend; running tests; production build; Vercel deployment; the endpoint compatibility checklist (verified/unverified); features complete / incomplete / unavailable; known limitations (including no dates, no coordinates, no auth, no PDF from backend); localization coverage; troubleshooting (CORS: add the frontend origin to the backend `FRONTEND_ORIGIN`; backend sleeping on free hosting; AI not configured).

**Final delivery report:** folder structure, routes completed, features, endpoints verified vs unavailable/incompatible, build and test results (real output), run and deploy instructions, limitations.

Before packaging: install, typecheck, lint, test, build, run with the documented env, and confirm the ZIP extracts to a usable project.

---

# 29. IMPLEMENTATION ORDER

1. **Confirm the backend:** run it, hit every endpoint in 17.2, build the checklist, set up env.
2. **Foundation:** Next.js + Tailwind + shadcn, tokens, app shell, nav, shared states, API client, types, season/assessment helpers.
3. **Core evidence experience:** dashboard, ghat explorer, ghat detail, trends, parameter assessments, prioritization, methodology.
4. **Action workflows:** briefs, WhatsApp, Q&A, cases, reports.
5. **Citizen experience:** guide, historical info, resources, Q&A, translations.
6. **Quality:** tests, responsive pass, accessibility pass, accuracy review of every claim and number, docs, ZIP, report.

---

# 30. ACCEPTANCE CRITERIA

**Product:** cohesive environmental-intelligence feel; all routes implemented and navigable; responsive; consistent hierarchy; thoughtful empty/error states; no dead buttons.

**Data integrity:** all data from the backend; missing stays missing; historical clearly separated from present; criteria shown only where the backend evaluated them; priority transparent with the four factors; **no invented dates, coordinates, measurements, resources, helplines or official claims**; the Oct 20 outlook shown honestly as a historical comparison.

**Functional:** ghat selection/detail work; charts respond to filters; brief, WhatsApp and Q&A call the backend and show `generation_mode`; cases can be created and updated with the real transitions; reports (JSON + CSV) use the real endpoint; copy and download actually work.

**Technical:** strict TypeScript passes; no secrets exposed; consistent error handling; production build succeeds; docs complete; ZIP verified.

**Demonstration:** a judge can follow *Dashboard → select a ghat → inspect evidence → understand priority → generate brief → create case → open report → view citizen guidance* unaided, on real backend responses.

---

# 31. PRODUCT PRINCIPLES

1. Evidence before decoration. 2. Action, not just analytics. 3. Transparency over false certainty. 4. AI explains; the backend establishes the evidence. 5. Historical data is not live monitoring — keep the coverage visible. 6. Build complete workflows; a button that does nothing is not a feature. 7. Prefer a smaller, fully functional feature over an impressive fake. 8. Preserve the backend contract; report gaps honestly. 9. Make it easy to judge within seconds. 10. Deliver a runnable project.

---

# APPENDIX A — ENUMS (exact values)

| Name | Values |
|---|---|
| `comparison_result` (`evaluation.result`) | `within_criterion`, `outside_criterion`, `insufficient_data`, `not_comparable` |
| `priority_level` | `high`, `review`, `routine`, `insufficient_data` |
| `case_status` | `needs_verification`, `under_review`, `action_assigned`, `resolved` |
| `language` (brief, ask, guide, report) | `en`, `hi` |
| WhatsApp `language` | `en`, `hi`, `bilingual` |
| `forecast_status` | `experimental_estimate`, `historical_comparison`, `insufficient_data` |
| `festival` | `Ganesh`, `Durga` |
| `phase` | `pre`, `during`, `after` |
| `generation_mode` | `template`, `ai` |
| evidence `type` | `observation`, `calculation`, `guidance`, `resource`, `forecast` |
| `cpcb_class` | `A`, `B` (default), `C`, `D`, `E` |
| report `format` | `json`, `csv` |
| ghat `data_status` | `historical`, `no_data` |
| health `status` / `database` | `ok`, `degraded` / `ok`, `error` |

`GET /metadata.enums` returns the same lists.

# APPENDIX B — RESPONSE SHAPES (abridged; nullable fields marked `| null`)

```ts
GhatSummary { id; name; water_body: string|null; latitude: number|null; longitude: number|null;
  last_sample_date: string|null /*always null*/; last_sample_year: number|null; first_sample_year: number|null;
  observation_count: number; data_status; data_status_note: string }

Reading { id; ghat_id; sample_date: string|null /*always null*/; parameter; value: number|null; unit: string|null;
  source_file; source_record_id; sample_year; festival; phase; sample_period: string; flag: string|null;
  value_as_printed: string|null; source_page: string|null; evaluation: ComparisonResult|null }

ComparisonResult { reading_id; criterion_id: string|null; result; observed_value: number|null; unit: string|null;
  threshold: number|null; comparison_operator: string|null /* "<=", ">=", "between_inclusive" … */;
  threshold_upper: number|null; sample_date: null; source_reference: string|null; reason: string;
  parameter; cpcb_class; sample_period; relative_exceedance: number|null }

Criterion { id; parameter; intended_use; comparison_operator; threshold: number|null; threshold_upper: number|null;
  unit: string|null; source_reference; cpcb_class }

RankedResponse { items: RankedGhat[]; method: string; cpcb_class; intended_use: string|null; as_of: string; disclaimer: string }
RankedGhat { ghat_id; ghat_name; priority_level; priority_score: number|null; factors: Factor[]; reasons: string[];
  last_sample_date: null; last_sample_year: number|null; data_completeness: number|null /*0-1*/; limitations: string[];
  cpcb_class; evaluated_reading_count: number; outside_reading_ids: string[] }
Factor { name /* exceedance_rate|severity|recurrence|staleness */; label; raw_value: number|null; max_points; points; explanation }

GhatDetail extends GhatSummary { parameters: ParameterInfo[]; cpcb_class; latest_readings: Reading[] /*with evaluation*/;
  data_quality: { completeness: number|null; numeric_count; missing_count; censored_count; seasons_covered: string[];
    seasons_missing: string[]; site_match_confidence: string|null; warnings: string[] }; limitations: string[] }
ParameterInfo { parameter; unit: string|null; observation_count; numeric_count; missing_count; censored_count; first_year; last_year }

ParameterTrend { parameter; unit: string|null; sample_count; missing_count; censored_count; start_year; end_year;
  series: { reading_id; sample_year; festival; phase; sample_period; value: number|null; flag: string|null; source_page: string|null }[];
  period_summary: { sample_year; festival; phase; n; mean; median; min; max }[];
  trend_summaries: { festival; phase; supported: boolean; observation_count; start_year: number|null; end_year: number|null;
    method; first_value: number|null; last_value: number|null; change: number|null; direction: "increase"|"decrease"|"unchanged"|null;
    statistically_tested: false; limitations: string[] }[];
  limitations: string[] }

Overview { total_ghats; total_readings; numeric_readings; missing_readings; censored_readings; latest_sample_year: number|null;
  latest_sample_date: null; flagged_readings; evaluated_readings; cpcb_class; intended_use: string|null;
  cases_by_status: Record<case_status, number>; data_quality_warnings: string[]; statewide_rows: number; generated_at }

FindingsPage { items: { ghat_id; ghat_name; reading: Reading /*with evaluation*/ }[]; total; limit; offset; cpcb_class; intended_use; note }

Benchmark { parameter; year: number|null; region: string|null; comparable: boolean; unit: string|null; cpcb_class;
  criterion_applied: string|null; aggregation_method; bhopal: StatBlock|null; statewide: StatBlock|null;
  statewide_excluding_bhopal_office: StatBlock|null; region_stats: StatBlock|null; bhopal_sample_count; statewide_sample_count;
  missing_data_exclusions: Record<string, number>; source_coverage: Record<string, string[]>; warnings: string[]; limitations: string[] }
StatBlock { label; sample_count; excluded_missing; excluded_censored; excluded_duplicates; site_count: number|null;
  median|mean|p25|p75|min|max: number|null; exceedance_count: number|null; exceedance_rate: number|null; years: number[] }

Oct20Outlook { forecast_status; is_prediction: boolean; target_date: string /*YYYY-10-20*/; ghat_id: string|null; parameter;
  prediction: number|null; unit: string|null; method: string|null; historical_sample_count; date_range_used: [number, number]|null;
  historical_values: { sample_year; festival; phase; value: number|null; flag: string|null; reading_ids: string[]; n_sites: number|null }[];
  uncertainty: { method; lower: number|null; upper: number|null; std: number|null; note }|null; assumptions: string[]; limitations: string[] }

EvidenceItem { id; type; text; ghat_id: string|null; ghat_name: string|null; parameter: string|null; value: number|null; unit: string|null;
  sample_period: string|null; source_file: string|null; source_record_id: string|null; source_page: string|null; source_reference: string|null }

BriefResponse { title; content; language; generated_at; evidence: EvidenceItem[]; limitations: string[]; generation_mode; ai_status: string|null; brief_id: string|null }
WhatsAppResponse { content; language; evidence; limitations; generated_at; generation_mode; ai_status: string|null; brief_id: string|null }
AIResponse /* citizen/ask */ { answer; language; evidence; limitations; generated_at; generation_mode; ai_status: string|null }

CitizenGhats { items: { ghat_id; name; water_body: string|null; last_sample_year: number|null; last_sample_date: null;
  latest_season: string|null; latest_season_summary: string[]; historical_comparison: string; evaluated_reading_count;
  historical_exceedance_rate: number|null; current_conditions: "unknown"; limitations: string[] }[];
  current_conditions_available: false; notice: string }
Guide { language; items: { id; title; body; category; approval_status; basis }[]; notice }
Resources { items: { id; title; url; issuing_organization: string|null; resource_type; last_verified: string|null;
  description; verification_note }[]; notice }

ReviewCase { id; ghat_id; reading_ids: string[]; created_at; updated_at; priority_level: priority_level|null;
  recommended_action; status; assigned_to: string|null; notes: string; resolution_summary: string|null }
CaseList { items: ReviewCase[]; total; limit; offset }

Report { title; generated_at; language; selection: { ghat_ids; start_year; end_year; cpcb_class; intended_use };
  categories_note; criteria: Criterion[]; criteria_selection_note; calculations: string[];
  sections: { ghat_id; ghat_name; water_body; readings: Reading[]; comparisons: ComparisonResult[]; priority: RankedGhat;
    exceedance_counts_by_parameter: Record<string, Record<comparison_result, number>>; cases: ReviewCase[] }[];
  historical_context: string[]; outlook: Oct20Outlook|null; ai_explanations: string[]; limitations: string[] }

Metadata { app; version; api_prefix; docs_url; openapi_url; total_ghats; total_readings; year_range: [number, number]|null;
  parameters: { parameter; unit: string|null; observation_count; cpcb_classes_with_limit: string[] }[];
  sources: { file_name; source_url: string|null; retrieved_at: string|null; sha256: string|null; imported_at; row_count;
    valid_row_count; invalid_row_count; year_range: [number, number]|null; warnings: string[]; errors: string[] }[];
  cpcb_classes: Record<string, string>; default_cpcb_class; enums: Record<string, string[]>; ai_configured: boolean;
  date_convention: string; limitations: string[] }
```

# APPENDIX C — PARAMETER → CPCB CLASS B CRITERION (for reference lines)

| Dataset parameter | Criterion parameter (in `/criteria`) | Line(s) | Unit |
|---|---|---|---|
| `pH` | `pH` | 6.5 and 8.5 (range, inclusive) | none |
| `Dissolved oxygen` | `Dissolved oxygen` | 5 (minimum) | mg/l |
| `BOD` | `BOD (5 days 20C)` | 3 (maximum) | mg/l |
| `Conductivity` | `Electrical conductivity at 25C` (class **E** only) | 2250 (maximum, class E) | µS/cm |
| COD, Total solids, Dissolved solids, Suspended solids, Turbidity, Chromium, Lead, Zinc, Copper | – | none | – |

Total coliform has a class-B limit but no readings in the data.

# APPENDIX D — EXAMPLE RESPONSES (real data, trimmed)

`GET /ghats?limit=1`
```json
{ "total": 7, "limit": 1, "offset": 0, "items": [ { "id": "ghat_bairagarh_sant_hirdaram_kund",
  "name": "Bairagarh (Sant Hirdaram) kund", "water_body": "Upper Lake", "latitude": null, "longitude": null,
  "last_sample_date": null, "last_sample_year": 2025, "first_sample_year": 2023, "observation_count": 192,
  "data_status": "historical", "data_status_note": "Historical MPPCB immersion-season samples; not live monitoring." } ] }
```

`GET /ghats/ranked` (first item)
```json
{ "ghat_id": "ghat_bairagarh_sant_hirdaram_kund", "ghat_name": "Bairagarh (Sant Hirdaram) kund", "priority_level": "high",
  "priority_score": 74.6, "last_sample_year": 2025, "data_completeness": 0.8646, "evaluated_reading_count": 39,
  "factors": [ { "name": "exceedance_rate", "label": "Share of readings outside limits", "raw_value": 0.6154,
                 "max_points": 40.0, "points": 24.62, "explanation": "24 of 39 evaluable readings are outside the limit." } ] }
```

`GET /ghats/{id}/readings?parameter=Dissolved oxygen&limit=1&evaluate=true` (item)
```json
{ "id": "bhopal-00052", "parameter": "Dissolved oxygen", "value": 5.6, "unit": "mg/l", "sample_date": null,
  "sample_year": 2023, "festival": "Ganesh", "phase": "pre", "sample_period": "2023 Ganesh (pre)", "flag": null,
  "source_file": "bhopal_ghats_2023_2025.csv", "source_record_id": "52", "source_page": "26",
  "evaluation": { "result": "within_criterion", "criterion_id": "cpcb_B_dissolved_oxygen", "threshold": 5.0,
    "comparison_operator": ">=", "reason": "5.6 mg/l meets the limit >= 5 mg/l (CPCB class B: Outdoor bathing (organised)).",
    "source_reference": "CPCB water quality criteria, class B (cpcb_water_quality_criteria.csv row 7); https://cpcb.gov.in/water-quality-criteria/" } }
```

`GET /predict/oct20` (current data)
```json
{ "forecast_status": "historical_comparison", "is_prediction": false, "target_date": "2026-10-20", "ghat_id": null,
  "parameter": "Dissolved oxygen", "prediction": null, "unit": "mg/l", "method": null, "historical_sample_count": 3,
  "date_range_used": [2023, 2025], "uncertainty": null,
  "historical_values": [ { "sample_year": 2023, "festival": "Durga", "phase": "during", "value": 4.3, "n_sites": 7 },
                         { "sample_year": 2024, "festival": "Durga", "phase": "during", "value": 5.4, "n_sites": 7 },
                         { "sample_year": 2025, "festival": "Durga", "phase": "during", "value": 4.9, "n_sites": 5 } ] }
```

`POST /brief/generate` with AI unavailable (still HTTP 200)
```json
{ "title": "Ghat Sentinel - Municipal Review Brief", "generation_mode": "template",
  "ai_status": "AI is not configured (ANTHROPIC_API_KEY / ANTHROPIC_MODEL missing). Deterministic template used instead.",
  "content": "…plain text…", "evidence": [ { "id": "calc:criteria", "type": "calculation", "text": "CPCB class B (Outdoor bathing (organised)) limits applied: …" } ] }
```

`PATCH /cases/{id}` invalid transition (HTTP 409)
```json
{ "error": { "code": "INVALID_STATUS_TRANSITION",
  "message": "Status change 'needs_verification' -> 'resolved' is not allowed. Allowed from 'needs_verification': ['under_review']." } }
```

`GET /citizen/ghats` (head)
```json
{ "current_conditions_available": false,
  "notice": "No current (live) water-quality observations are available to this service. The latest records are historical MPPCB samples from 2025, so nothing here shows whether a ghat is safe today." }
```

---

Now confirm the backend contract against the running API, build the entire Ghat Sentinel frontend as specified, test it against the real backend, and deliver the verified `ghat-sentinel-frontend.zip` with the endpoint checklist, build/test results and README. Do not stop at a design proposal.
