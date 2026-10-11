# API contract

Generated from `docs/openapi.json` by `python scripts/export_openapi.py`. Do not edit by hand.

Base path `/api/v1`. All errors use `{"error": {"code", "message", "details?"}}` (see `ErrorResponse`). Dates are ISO 8601; the source data has no exact sample dates, so `sample_date` is always `null` (use `sample_year`, `festival`, `phase`). Timestamps are UTC.

Typical status codes: 200 OK, 201 created (POST /cases), 404 unknown resource, 409 invalid case status transition, 413 body too large, 422 invalid input, 429 AI rate limit, 503 AI unavailable (only when `require_ai` is true).

## `GET /api/v1/health`
Service health

| Status | Response |
|---|---|
| 200 | `Health` |

## `GET /api/v1/metadata`
Data coverage, parameters and sources

| Status | Response |
|---|---|
| 200 | `Metadata` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/auth/config`
Public auth configuration

| Status | Response |
|---|---|
| 200 | `AuthConfig` |

## `POST /api/v1/auth/login`
Log in with email and password

Request body: `LoginRequest`

| Status | Response |
|---|---|
| 200 | `TokenResponse` |
| 401 | `ErrorResponse` |
| 429 | `ErrorResponse` |
| 422 | `ErrorResponse` |

## `POST /api/v1/auth/register`
Self-register a community (citizen) account

Request body: `RegisterRequest`

| Status | Response |
|---|---|
| 201 | `TokenResponse` |
| 409 | `ErrorResponse` |
| 422 | `ErrorResponse` |

## `GET /api/v1/auth/me`
Current user

| Status | Response |
|---|---|
| 200 | `AuthUser` |
| 401 | `ErrorResponse` |

## `GET /api/v1/ghats`
List ghats found in the imported data

| Parameter | In | Required | Type |
|---|---|---|---|
| `search` | query | no | string |
| `limit` | query | no | integer |
| `offset` | query | no | integer |

| Status | Response |
|---|---|
| 200 | `GhatList` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/ghats/ranked`
Ghats ranked by review priority

Deterministic project-defined heuristic; not an official classification. Date filters apply at year granularity. cpcb_class selects the intended use (default B, outdoor bathing).

| Parameter | In | Required | Type |
|---|---|---|---|
| `as_of` | query | no | string |
| `start_date` | query | no | string |
| `end_date` | query | no | string |
| `cpcb_class` | query | no | string |

| Status | Response |
|---|---|
| 200 | `RankedResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/ghats/{ghat_id}`
Ghat details

| Parameter | In | Required | Type |
|---|---|---|---|
| `ghat_id` | path | yes | string |
| `cpcb_class` | query | no | string |

| Status | Response |
|---|---|
| 200 | `GhatDetail` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/ghats/{ghat_id}/readings`
Observed readings with provenance

| Parameter | In | Required | Type |
|---|---|---|---|
| `ghat_id` | path | yes | string |
| `parameter` | query | no | string |
| `start_date` | query | no | string |
| `end_date` | query | no | string |
| `limit` | query | no | integer |
| `offset` | query | no | integer |
| `evaluate` | query | no | boolean |
| `cpcb_class` | query | no | string |

| Status | Response |
|---|---|
| 200 | `ReadingsPage` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/ghats/{ghat_id}/trends`
Historical series and descriptive trends

| Parameter | In | Required | Type |
|---|---|---|---|
| `ghat_id` | path | yes | string |
| `parameter` | query | no | string |
| `start_date` | query | no | string |
| `end_date` | query | no | string |

| Status | Response |
|---|---|
| 200 | `TrendsResponse` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/analytics/overview`
Dashboard metrics

| Parameter | In | Required | Type |
|---|---|---|---|
| `cpcb_class` | query | no | string |

| Status | Response |
|---|---|
| 200 | `Overview` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/analytics/findings`
Outside-criterion readings, most severe first

| Parameter | In | Required | Type |
|---|---|---|---|
| `ghat_id` | query | no | string |
| `parameter` | query | no | string |
| `cpcb_class` | query | no | string |
| `limit` | query | no | integer |
| `offset` | query | no | integer |

| Status | Response |
|---|---|
| 200 | `FindingsPage` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/analytics/benchmark`
Bhopal vs statewide (only when comparable)

| Parameter | In | Required | Type |
|---|---|---|---|
| `parameter` | query | yes | string |
| `year` | query | no | integer |
| `region` | query | no | string |
| `phase` | query | no | string |
| `cpcb_class` | query | no | string |

| Status | Response |
|---|---|
| 200 | `Benchmark` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/criteria`
CPCB criteria used by the comparison engine

| Parameter | In | Required | Type |
|---|---|---|---|
| `cpcb_class` | query | no | string |

| Status | Response |
|---|---|
| 200 | `CriteriaList` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/predict/oct20`
Experimental 20 October seasonal outlook

Returns an experimental estimate only when enough comparable history exists; otherwise a historical comparison or insufficient_data. Never an observed reading. parameter defaults to 'Dissolved oxygen'; omitting ghat_id pools ghats into a historical comparison only.

| Parameter | In | Required | Type |
|---|---|---|---|
| `ghat_id` | query | no | string |
| `parameter` | query | no | string |
| `year` | query | no | integer |

| Status | Response |
|---|---|
| 200 | `Oct20Outlook` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `POST /api/v1/brief/generate`
Evidence-backed municipal brief

Request body: `BriefRequest`

| Status | Response |
|---|---|
| 200 | `BriefResponse` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 429 | `ErrorResponse` |
| 503 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `POST /api/v1/brief/whatsapp`
Copyable WhatsApp-ready brief

Request body: `app__schemas__brief__WhatsAppRequest`

| Status | Response |
|---|---|
| 200 | `WhatsAppResponse` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 429 | `ErrorResponse` |
| 503 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `POST /api/v1/citizen/ask`
Ask a question about approved guidance

Request body: `CitizenQuestion`

| Status | Response |
|---|---|
| 200 | `AIResponse` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 429 | `ErrorResponse` |
| 503 | `ErrorResponse` |

## `GET /api/v1/citizen/ghats`
Historical comparison and sample freshness (not live)

| Status | Response |
|---|---|
| 200 | `CitizenGhats` |

## `GET /api/v1/citizen/guide`
Pollution-prevention guidance

| Parameter | In | Required | Type |
|---|---|---|---|
| `language` | query | no | en|hi |

| Status | Response |
|---|---|
| 200 | `Guide` |
| 422 | `ErrorResponse` |

## `GET /api/v1/citizen/resources`
Official resources and source metadata

| Status | Response |
|---|---|
| 200 | `Resources` |

## `GET /api/v1/cases`
Verification queue (workers see only their assigned cases)

| Parameter | In | Required | Type |
|---|---|---|---|
| `status` | query | no | string |
| `ghat_id` | query | no | string |
| `limit` | query | no | integer |
| `offset` | query | no | integer |

| Status | Response |
|---|---|
| 200 | `CaseList` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `POST /api/v1/cases`
Create a verification case

Request body: `CaseCreate`

| Status | Response |
|---|---|
| 201 | `ReviewCase` |
| 404 | `ErrorResponse` |
| 409 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/cases/{case_id}`
Get one case

| Parameter | In | Required | Type |
|---|---|---|---|
| `case_id` | path | yes | string |

| Status | Response |
|---|---|
| 200 | `ReviewCase` |
| 404 | `ErrorResponse` |
| 409 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `PATCH /api/v1/cases/{case_id}`
Update status, assignee and notes

Officers/developers may change any field. Workers may only update their own assigned cases: notes, resolution_summary and status (under_review or resolved).

| Parameter | In | Required | Type |
|---|---|---|---|
| `case_id` | path | yes | string |

Request body: `CaseUpdate`

| Status | Response |
|---|---|
| 200 | `ReviewCase` |
| 404 | `ErrorResponse` |
| 409 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `POST /api/v1/reports/generate`
Evidence report (JSON, or CSV download)

format=json returns the structured Report. format=csv returns a text/csv attachment with one row per reading, its criterion comparison and ghat priority.

Request body: `ReportRequest`

| Status | Response |
|---|---|
| 200 | `Report` |
| 404 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/messaging/config`
Messaging channels status (no secrets)

| Status | Response |
|---|---|
| 200 | `MessagingConfig` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `GET /api/v1/messaging/contacts`
Active officers and workers for the recipient picker

| Status | Response |
|---|---|
| 200 | `ContactList` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |

## `POST /api/v1/messaging/email`
Send a brief by e-mail (one message per recipient)

Per-recipient failures are reported in `results`; the request itself still returns 200. 503 CHANNEL_NOT_CONFIGURED when SMTP is not set up (unless MESSAGING_DRY_RUN).

Request body: `EmailRequest`

| Status | Response |
|---|---|
| 200 | `SendResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 429 | `ErrorResponse` |
| 503 | `ErrorResponse` |

## `POST /api/v1/messaging/whatsapp`
Send a brief by WhatsApp (Meta Cloud API)

Template mode is deliverable any time; text mode only inside Meta's 24-hour customer-service window. Per-recipient failures are reported in `results`.

Request body: `app__schemas__messaging__WhatsAppRequest`

| Status | Response |
|---|---|
| 200 | `SendResponse` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |
| 422 | `ErrorResponse` |
| 429 | `ErrorResponse` |
| 503 | `ErrorResponse` |

## `GET /api/v1/messaging/log`
Audit log of sent messages, newest first

| Parameter | In | Required | Type |
|---|---|---|---|
| `channel` | query | no | string |
| `limit` | query | no | integer |
| `offset` | query | no | integer |

| Status | Response |
|---|---|
| 200 | `MessageList` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |
| 422 | `ErrorResponse` |

## `GET /api/v1/users`
List users (officer, developer)

| Parameter | In | Required | Type |
|---|---|---|---|
| `role` | query | no | string |
| `limit` | query | no | integer |
| `offset` | query | no | integer |

| Status | Response |
|---|---|
| 200 | `UserList` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |
| 422 | `ErrorResponse` |

## `POST /api/v1/users`
Create a worker/officer/developer account

Officers may create worker and officer accounts; only developers may create developer accounts. Citizens self-register via /auth/register.

Request body: `UserCreate`

| Status | Response |
|---|---|
| 201 | `UserOut` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |
| 409 | `ErrorResponse` |
| 422 | `ErrorResponse` |

## `PATCH /api/v1/users/{user_id}`
Activate/deactivate or rename a user

| Parameter | In | Required | Type |
|---|---|---|---|
| `user_id` | path | yes | string |

Request body: `UserUpdate`

| Status | Response |
|---|---|
| 200 | `UserOut` |
| 401 | `ErrorResponse` |
| 403 | `ErrorResponse` |
| 404 | `ErrorResponse` |
| 409 | `ErrorResponse` |
| 422 | `ErrorResponse` |

## Schemas

### AIResponse

| Field | Type | Required |
|---|---|---|
| `answer` | string | yes |
| `language` | en|hi | yes |
| `evidence` | array | yes |
| `limitations` | array | yes |
| `generated_at` | string | yes |
| `generation_mode` | template|ai | no |
| `ai_status` | string | no |

### AuthConfig

| Field | Type | Required |
|---|---|---|
| `auth_enabled` | boolean | yes |
| `roles` | array | yes |
| `demo_accounts` | array | yes |

### AuthUser

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `email` | string | yes |
| `name` | string | yes |
| `role` | officer|worker|citizen|developer|demo | yes |

### Benchmark

| Field | Type | Required |
|---|---|---|
| `parameter` | string | yes |
| `year` | integer | yes |
| `region` | string | yes |
| `comparable` | boolean | yes |
| `unit` | string | yes |
| `cpcb_class` | string | yes |
| `criterion_applied` | string | yes |
| `aggregation_method` | string | yes |
| `bhopal` | ? | yes |
| `statewide` | ? | yes |
| `statewide_excluding_bhopal_office` | ? | yes |
| `region_stats` | ? | yes |
| `bhopal_sample_count` | integer | yes |
| `statewide_sample_count` | integer | yes |
| `missing_data_exclusions` | object | yes |
| `source_coverage` | object | yes |
| `warnings` | array | yes |
| `limitations` | array | yes |

### BriefRequest

| Field | Type | Required |
|---|---|---|
| `ghat_ids` | array | no |
| `start_date` | string | no |
| `end_date` | string | no |
| `language` | en|hi | no |
| `use_ai` | boolean | no |
| `require_ai` | boolean | no |

### BriefResponse

| Field | Type | Required |
|---|---|---|
| `title` | string | yes |
| `content` | string | yes |
| `language` | en|hi | yes |
| `generated_at` | string | yes |
| `evidence` | array | yes |
| `limitations` | array | yes |
| `generation_mode` | template|ai | yes |
| `ai_status` | string | no |
| `brief_id` | string | no |

### CaseCreate

| Field | Type | Required |
|---|---|---|
| `ghat_id` | string | yes |
| `reading_ids` | array | no |
| `recommended_action` | string | yes |
| `notes` | string | no |

### CaseList

| Field | Type | Required |
|---|---|---|
| `total` | integer | yes |
| `limit` | integer | yes |
| `offset` | integer | yes |
| `items` | array | yes |

### CaseUpdate

| Field | Type | Required |
|---|---|---|
| `status` | string | no |
| `assigned_to` | string | no |
| `notes` | string | no |
| `resolution_summary` | string | no |

### CitizenGhat

| Field | Type | Required |
|---|---|---|
| `ghat_id` | string | yes |
| `name` | string | yes |
| `water_body` | string | yes |
| `last_sample_year` | integer | yes |
| `last_sample_date` | string | yes |
| `latest_season` | string | yes |
| `latest_season_summary` | array | yes |
| `historical_comparison` | string | yes |
| `evaluated_reading_count` | integer | no |
| `historical_exceedance_rate` | number | no |
| `current_conditions` | string | no |
| `limitations` | array | yes |

### CitizenGhats

| Field | Type | Required |
|---|---|---|
| `items` | array | yes |
| `current_conditions_available` | boolean | no |
| `notice` | string | yes |

### CitizenQuestion

| Field | Type | Required |
|---|---|---|
| `question` | string | yes |
| `language` | en|hi | no |
| `ghat_id` | string | no |
| `use_ai` | boolean | no |
| `require_ai` | boolean | no |

### ComparisonResult

| Field | Type | Required |
|---|---|---|
| `reading_id` | string | yes |
| `criterion_id` | string | yes |
| `result` | within_criterion|outside_criterion|insufficient_data|not_comparable | yes |
| `observed_value` | number | yes |
| `unit` | string | yes |
| `threshold` | number | yes |
| `comparison_operator` | string | yes |
| `sample_date` | string | no |
| `source_reference` | string | yes |
| `reason` | string | yes |
| `parameter` | string | no |
| `cpcb_class` | string | no |
| `threshold_upper` | number | no |
| `sample_period` | string | no |
| `relative_exceedance` | number | no |

### Contact

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `name` | string | yes |
| `role` | officer|worker|citizen|developer|demo | yes |
| `email` | string | yes |
| `phone` | string | no |

### ContactList

| Field | Type | Required |
|---|---|---|
| `items` | array | yes |

### CriteriaList

| Field | Type | Required |
|---|---|---|
| `items` | array | yes |
| `classes` | object | yes |
| `default_cpcb_class` | string | yes |
| `note` | string | yes |

### Criterion

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `parameter` | string | yes |
| `intended_use` | string | yes |
| `comparison_operator` | string | yes |
| `threshold` | number | yes |
| `unit` | string | yes |
| `source_reference` | string | yes |
| `cpcb_class` | string | no |
| `threshold_upper` | number | no |

### DataQuality

| Field | Type | Required |
|---|---|---|
| `completeness` | number | yes |
| `numeric_count` | integer | yes |
| `missing_count` | integer | yes |
| `censored_count` | integer | yes |
| `seasons_covered` | array | yes |
| `seasons_missing` | array | yes |
| `site_match_confidence` | string | yes |
| `warnings` | array | yes |

### DemoAccount

| Field | Type | Required |
|---|---|---|
| `role` | officer|worker|citizen|developer|demo | yes |
| `email` | string | yes |
| `password` | string | yes |

### EmailConfig

| Field | Type | Required |
|---|---|---|
| `configured` | boolean | yes |
| `from_address` | string | no |

### EmailRequest

| Field | Type | Required |
|---|---|---|
| `to` | array | yes |
| `subject` | string | yes |
| `body` | string | yes |
| `brief_id` | string | no |

### ErrorDetail

| Field | Type | Required |
|---|---|---|
| `code` | string | yes |
| `message` | string | yes |
| `details` | array | no |

### ErrorResponse

| Field | Type | Required |
|---|---|---|
| `error` | ErrorDetail | yes |

### EvidenceItem

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `type` | observation|calculation|guidance|resource|forecast | yes |
| `text` | string | yes |
| `ghat_id` | string | no |
| `ghat_name` | string | no |
| `parameter` | string | no |
| `value` | number | no |
| `unit` | string | no |
| `sample_period` | string | no |
| `source_file` | string | no |
| `source_record_id` | string | no |
| `source_page` | string | no |
| `source_reference` | string | no |

### FactorOut

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `label` | string | yes |
| `raw_value` | number | yes |
| `max_points` | number | yes |
| `points` | number | yes |
| `explanation` | string | yes |

### Finding

| Field | Type | Required |
|---|---|---|
| `ghat_id` | string | yes |
| `ghat_name` | string | yes |
| `reading` | Reading | yes |

### FindingsPage

| Field | Type | Required |
|---|---|---|
| `total` | integer | yes |
| `limit` | integer | yes |
| `offset` | integer | yes |
| `items` | array | yes |
| `cpcb_class` | string | yes |
| `intended_use` | string | yes |
| `note` | string | yes |

### GhatDetail

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `name` | string | yes |
| `water_body` | string | no |
| `latitude` | number | no |
| `longitude` | number | no |
| `last_sample_date` | string | no |
| `last_sample_year` | integer | no |
| `first_sample_year` | integer | no |
| `observation_count` | integer | no |
| `data_status` | historical|no_data | no |
| `data_status_note` | string | no |
| `parameters` | array | yes |
| `cpcb_class` | string | yes |
| `latest_readings` | array | yes |
| `data_quality` | DataQuality | yes |
| `limitations` | array | yes |

### GhatList

| Field | Type | Required |
|---|---|---|
| `total` | integer | yes |
| `limit` | integer | yes |
| `offset` | integer | yes |
| `items` | array | yes |

### GhatSummary

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `name` | string | yes |
| `water_body` | string | no |
| `latitude` | number | no |
| `longitude` | number | no |
| `last_sample_date` | string | no |
| `last_sample_year` | integer | no |
| `first_sample_year` | integer | no |
| `observation_count` | integer | no |
| `data_status` | historical|no_data | no |
| `data_status_note` | string | no |

### GuidanceItem

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `title` | string | yes |
| `body` | string | yes |
| `category` | string | yes |
| `approval_status` | string | yes |
| `basis` | string | yes |

### Guide

| Field | Type | Required |
|---|---|---|
| `language` | en|hi | yes |
| `items` | array | yes |
| `notice` | string | yes |

### Health

| Field | Type | Required |
|---|---|---|
| `status` | ok|degraded | yes |
| `timestamp` | string | yes |
| `database` | ok|error | yes |
| `data_loaded` | boolean | yes |
| `ghats_loaded` | integer | yes |
| `readings_loaded` | integer | yes |
| `ai_configured` | boolean | yes |
| `app` | string | yes |
| `env` | string | yes |

### LoginRequest

| Field | Type | Required |
|---|---|---|
| `email` | string | yes |
| `password` | string | yes |

### MessageList

| Field | Type | Required |
|---|---|---|
| `total` | integer | yes |
| `limit` | integer | yes |
| `offset` | integer | yes |
| `items` | array | yes |

### MessageOut

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `channel` | email|whatsapp | yes |
| `recipient` | string | yes |
| `subject` | string | no |
| `status` | sent|failed|dry_run | yes |
| `error` | string | no |
| `provider_message_id` | string | no |
| `sent_by` | string | yes |
| `brief_id` | string | no |
| `created_at` | string (format date-time) | yes |

### MessagingConfig

| Field | Type | Required |
|---|---|---|
| `email` | EmailConfig | yes |
| `whatsapp` | WhatsAppConfig | yes |
| `dry_run` | boolean | yes |
| `max_recipients` | integer | yes |

### Metadata

| Field | Type | Required |
|---|---|---|
| `app` | string | yes |
| `version` | string | yes |
| `api_prefix` | string | yes |
| `docs_url` | string | yes |
| `openapi_url` | string | yes |
| `total_ghats` | integer | yes |
| `total_readings` | integer | yes |
| `year_range` | array | yes |
| `parameters` | array | yes |
| `sources` | array | yes |
| `cpcb_classes` | object | yes |
| `default_cpcb_class` | string | yes |
| `enums` | object | yes |
| `ai_configured` | boolean | yes |
| `date_convention` | string | yes |
| `limitations` | array | yes |

### Oct20Outlook

| Field | Type | Required |
|---|---|---|
| `forecast_status` | experimental_estimate|historical_comparison|insufficient_data | yes |
| `is_prediction` | boolean | yes |
| `target_date` | string (format date) | yes |
| `ghat_id` | string | yes |
| `parameter` | string | yes |
| `prediction` | number | yes |
| `unit` | string | yes |
| `method` | string | yes |
| `historical_sample_count` | integer | yes |
| `date_range_used` | array | no |
| `historical_values` | array | yes |
| `uncertainty` | ? | yes |
| `assumptions` | array | yes |
| `limitations` | array | yes |

### OfficialResource

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `title` | string | yes |
| `url` | string | yes |
| `issuing_organization` | string | yes |
| `resource_type` | string | yes |
| `last_verified` | string | yes |
| `description` | string | yes |
| `verification_note` | string | yes |

### Overview

| Field | Type | Required |
|---|---|---|
| `total_ghats` | integer | yes |
| `total_readings` | integer | yes |
| `numeric_readings` | integer | yes |
| `missing_readings` | integer | yes |
| `censored_readings` | integer | yes |
| `latest_sample_year` | integer | yes |
| `latest_sample_date` | string | no |
| `flagged_readings` | integer | yes |
| `evaluated_readings` | integer | yes |
| `cpcb_class` | string | yes |
| `intended_use` | string | yes |
| `cases_by_status` | object | yes |
| `data_quality_warnings` | array | yes |
| `statewide_rows` | integer | yes |
| `generated_at` | string | yes |

### ParameterInfo

| Field | Type | Required |
|---|---|---|
| `parameter` | string | yes |
| `unit` | string | yes |
| `observation_count` | integer | yes |
| `numeric_count` | integer | yes |
| `missing_count` | integer | yes |
| `censored_count` | integer | yes |
| `first_year` | integer | yes |
| `last_year` | integer | yes |

### ParameterMeta

| Field | Type | Required |
|---|---|---|
| `parameter` | string | yes |
| `unit` | string | yes |
| `observation_count` | integer | yes |
| `cpcb_classes_with_limit` | array | yes |

### ParameterTrend

| Field | Type | Required |
|---|---|---|
| `parameter` | string | yes |
| `unit` | string | yes |
| `sample_count` | integer | yes |
| `missing_count` | integer | yes |
| `censored_count` | integer | yes |
| `start_year` | integer | yes |
| `end_year` | integer | yes |
| `series` | array | yes |
| `period_summary` | array | yes |
| `trend_summaries` | array | yes |
| `limitations` | array | yes |

### PeriodSummary

| Field | Type | Required |
|---|---|---|
| `sample_year` | integer | yes |
| `festival` | string | yes |
| `phase` | string | yes |
| `n` | integer | yes |
| `mean` | number | yes |
| `median` | number | yes |
| `min` | number | yes |
| `max` | number | yes |

### RankedGhat

| Field | Type | Required |
|---|---|---|
| `ghat_id` | string | yes |
| `ghat_name` | string | yes |
| `priority_level` | high|review|routine|insufficient_data | yes |
| `priority_score` | number | yes |
| `factors` | array | yes |
| `reasons` | array | yes |
| `last_sample_date` | string | no |
| `last_sample_year` | integer | no |
| `data_completeness` | number | yes |
| `limitations` | array | yes |
| `cpcb_class` | string | yes |
| `evaluated_reading_count` | integer | yes |
| `outside_reading_ids` | array | no |

### RankedResponse

| Field | Type | Required |
|---|---|---|
| `items` | array | yes |
| `method` | string | yes |
| `cpcb_class` | string | yes |
| `intended_use` | string | yes |
| `as_of` | string (format date) | yes |
| `disclaimer` | string | yes |

### Reading

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `ghat_id` | string | yes |
| `sample_date` | string | no |
| `parameter` | string | yes |
| `value` | number | no |
| `unit` | string | yes |
| `source_file` | string | yes |
| `source_record_id` | string | yes |
| `sample_year` | integer | yes |
| `festival` | string | yes |
| `phase` | string | yes |
| `sample_period` | string | yes |
| `flag` | string | no |
| `value_as_printed` | string | no |
| `source_page` | string | no |
| `evaluation` | ? | no |

### ReadingsPage

| Field | Type | Required |
|---|---|---|
| `total` | integer | yes |
| `limit` | integer | yes |
| `offset` | integer | yes |
| `items` | array | yes |
| `limitations` | array | yes |

### RegisterRequest

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `email` | string | yes |
| `password` | string | yes |

### Report

| Field | Type | Required |
|---|---|---|
| `title` | string | yes |
| `generated_at` | string | yes |
| `language` | en|hi | yes |
| `selection` | object | yes |
| `categories_note` | string | yes |
| `criteria` | array | yes |
| `criteria_selection_note` | string | yes |
| `calculations` | array | yes |
| `sections` | array | yes |
| `historical_context` | array | yes |
| `outlook` | ? | yes |
| `ai_explanations` | array | yes |
| `limitations` | array | yes |

### ReportGhatSection

| Field | Type | Required |
|---|---|---|
| `ghat_id` | string | yes |
| `ghat_name` | string | yes |
| `water_body` | string | yes |
| `readings` | array | yes |
| `comparisons` | array | yes |
| `priority` | RankedGhat | yes |
| `exceedance_counts_by_parameter` | object | yes |
| `cases` | array | yes |

### ReportRequest

| Field | Type | Required |
|---|---|---|
| `ghat_ids` | array | no |
| `start_date` | string | no |
| `end_date` | string | no |
| `language` | en|hi | no |
| `format` | json|csv | no |

### Resources

| Field | Type | Required |
|---|---|---|
| `items` | array | yes |
| `notice` | string | yes |

### ReviewCase

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `ghat_id` | string | yes |
| `reading_ids` | array | yes |
| `created_at` | string (format date-time) | yes |
| `updated_at` | string (format date-time) | yes |
| `priority_level` | string | yes |
| `recommended_action` | string | yes |
| `status` | needs_verification|under_review|action_assigned|resolved | yes |
| `assigned_to` | string | yes |
| `notes` | string | yes |
| `resolution_summary` | string | yes |
| `created_by` | string | no |

### SeasonValue

| Field | Type | Required |
|---|---|---|
| `sample_year` | integer | yes |
| `festival` | string | yes |
| `phase` | string | yes |
| `value` | number | yes |
| `flag` | string | no |
| `reading_ids` | array | no |
| `n_sites` | integer | no |

### SendResponse

| Field | Type | Required |
|---|---|---|
| `results` | array | yes |
| `sent` | integer | yes |
| `failed` | integer | yes |
| `dry_run` | boolean | yes |

### SendResult

| Field | Type | Required |
|---|---|---|
| `recipient` | string | yes |
| `status` | sent|failed|dry_run | yes |
| `error` | string | no |
| `message_id` | string | no |

### SourceMeta

| Field | Type | Required |
|---|---|---|
| `file_name` | string | yes |
| `source_url` | string | yes |
| `retrieved_at` | string | yes |
| `sha256` | string | yes |
| `imported_at` | string | yes |
| `row_count` | integer | yes |
| `valid_row_count` | integer | yes |
| `invalid_row_count` | integer | yes |
| `year_range` | array | yes |
| `warnings` | array | yes |
| `errors` | array | yes |

### StatBlock

| Field | Type | Required |
|---|---|---|
| `label` | string | yes |
| `sample_count` | integer | yes |
| `excluded_missing` | integer | yes |
| `excluded_censored` | integer | yes |
| `excluded_duplicates` | integer | no |
| `site_count` | integer | yes |
| `median` | number | yes |
| `mean` | number | yes |
| `p25` | number | yes |
| `p75` | number | yes |
| `min` | number | yes |
| `max` | number | yes |
| `exceedance_count` | integer | no |
| `exceedance_rate` | number | no |
| `years` | array | yes |

### TokenResponse

| Field | Type | Required |
|---|---|---|
| `access_token` | string | yes |
| `token_type` | bearer | no |
| `expires_in` | integer | yes |
| `user` | AuthUser | yes |

### TrendPoint

| Field | Type | Required |
|---|---|---|
| `reading_id` | string | yes |
| `sample_year` | integer | yes |
| `festival` | string | yes |
| `phase` | string | yes |
| `sample_period` | string | yes |
| `value` | number | yes |
| `flag` | string | yes |
| `source_page` | string | no |

### TrendSummary

| Field | Type | Required |
|---|---|---|
| `festival` | string | yes |
| `phase` | string | yes |
| `supported` | boolean | yes |
| `observation_count` | integer | yes |
| `start_year` | integer | yes |
| `end_year` | integer | yes |
| `method` | string | yes |
| `first_value` | number | no |
| `last_value` | number | no |
| `change` | number | no |
| `direction` | string | no |
| `statistically_tested` | boolean | no |
| `limitations` | array | yes |

### TrendsResponse

| Field | Type | Required |
|---|---|---|
| `ghat_id` | string | yes |
| `items` | array | yes |

### Uncertainty

| Field | Type | Required |
|---|---|---|
| `method` | string | yes |
| `lower` | number | yes |
| `upper` | number | yes |
| `std` | number | yes |
| `note` | string | yes |

### UserCreate

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `email` | string | yes |
| `password` | string | yes |
| `role` | officer|worker|citizen|developer|demo | yes |
| `phone` | string | no |

### UserList

| Field | Type | Required |
|---|---|---|
| `total` | integer | yes |
| `limit` | integer | yes |
| `offset` | integer | yes |
| `items` | array | yes |

### UserOut

| Field | Type | Required |
|---|---|---|
| `id` | string | yes |
| `email` | string | yes |
| `name` | string | yes |
| `role` | officer|worker|citizen|developer|demo | yes |
| `is_active` | boolean | yes |
| `phone` | string | no |
| `created_at` | string (format date-time) | yes |

### UserUpdate

| Field | Type | Required |
|---|---|---|
| `is_active` | boolean | no |
| `name` | string | no |
| `phone` | string | no |

### WhatsAppConfig

| Field | Type | Required |
|---|---|---|
| `configured` | boolean | yes |
| `mode` | template|text | yes |
| `template_name` | string | no |
| `language` | string | yes |

### WhatsAppResponse

| Field | Type | Required |
|---|---|---|
| `content` | string | yes |
| `language` | en|hi|bilingual | yes |
| `evidence` | array | yes |
| `limitations` | array | yes |
| `generated_at` | string | yes |
| `generation_mode` | template|ai | yes |
| `ai_status` | string | no |
| `brief_id` | string | no |

### app__schemas__brief__WhatsAppRequest

| Field | Type | Required |
|---|---|---|
| `ghat_ids` | array | no |
| `language` | en|hi|bilingual | no |
| `include_actions` | boolean | no |
| `use_ai` | boolean | no |
| `require_ai` | boolean | no |

### app__schemas__messaging__WhatsAppRequest

| Field | Type | Required |
|---|---|---|
| `to` | array | yes |
| `body` | string | yes |
| `brief_id` | string | no |
