# Authentication and roles

JWT bearer authentication with five roles (`demo` is a presenter role with officer rights except user management). Send `Authorization: Bearer <access_token>`; Swagger `/docs` has an
**Authorize** button.

## Roles and permissions

| Endpoint | public | citizen | worker | officer | developer | demo |
|---|---|---|---|---|---|---|
| `GET /health`, `GET /auth/config`, `POST /auth/login`, `POST /auth/register` | yes | yes | yes | yes | yes | yes |
| `GET /citizen/guide`, `/citizen/resources`, `/citizen/ghats`, `POST /citizen/ask` | yes | yes | yes | yes | yes | yes |
| `GET /auth/me` | - | yes | yes | yes | yes | yes |
| `GET /metadata`, `/ghats*`, `/analytics/*`, `/criteria`, `/predict/oct20` | - | - | yes | yes | yes | yes |
| `POST /brief/generate`, `/brief/whatsapp`, `POST /reports/generate` | - | - | - | yes | yes | yes |
| `POST /cases`, `PATCH /cases/{id}` (any case), `GET /cases`, `GET /cases/{id}` (all) | - | - | - | yes | yes | yes |
| `GET /cases`, `GET /cases/{id}` | - | - | own assigned only | all | all | all |
| `PATCH /cases/{id}` | - | - | own assigned only; `notes`, `resolution_summary`, `status` (to `under_review` or `resolved`) | any | any | any |
| `GET /messaging/config`, `/contacts`, `/log`, `POST /messaging/email`, `/messaging/whatsapp` (see MESSAGING.md) | - | - | - | yes | yes | yes |
| `GET /users`, `POST /users`, `PATCH /users/{id}` | - | - | - | yes (no developer accounts) | yes | - |

Worker rules: cases are matched on `assigned_to` equal (case-insensitive) to the worker's email or name. A case not
assigned to them returns `404 CASE_NOT_FOUND`. Sending `assigned_to` (or any other field) in a worker PATCH returns
`403 FORBIDDEN`; the usual status transition and resolution rules still apply.

User management: officers may create `worker` and `officer` accounts; only developers may create `developer`;
`citizen` accounts are created only through `/auth/register` (the role cannot be chosen); `demo` accounts cannot be
created through `POST /users` (403) and are provisioned only by seeding (below). You cannot deactivate
yourself (`409 CANNOT_DEACTIVATE_SELF`); officers cannot modify developer accounts.

## Errors

`401 UNAUTHENTICATED` (missing/invalid/expired token, unknown or deactivated user; includes
`WWW-Authenticate: Bearer`), `401 INVALID_CREDENTIALS` (login; identical for wrong email, wrong password and inactive
user), `403 FORBIDDEN`, `409 EMAIL_TAKEN`, `404 USER_NOT_FOUND`, `429 RATE_LIMITED`.

## Token

HS256 JWT with claims `sub` (user id), `role`, `iat`, `exp`. Lifetime `ACCESS_TOKEN_MINUTES` (default 480); login
returns `expires_in` in seconds. The user is re-loaded from the database on every request, so deactivation and role
changes take effect immediately (the role used is the database role, not the token claim). There is no refresh token:
log in again after expiry.

## Configuration

`AUTH_ENABLED` (default true), `JWT_SECRET`, `ACCESS_TOKEN_MINUTES`, `DEMO_USERS`, `BOOTSTRAP_OFFICER_EMAIL`,
`BOOTSTRAP_OFFICER_PASSWORD`, `PRESENTER_EMAIL`, `PRESENTER_PASSWORD`. With `AUTH_ENABLED=false` no token is needed and every request acts as a synthetic
developer (`GET /auth/me` returns `usr_anonymous`). If `JWT_SECRET` is empty the app refuses to start when
`APP_ENV=production`; otherwise it generates a random secret (tokens die on restart).

Demo accounts (`officer@ghat.demo`, `worker@ghat.demo`, `citizen@ghat.demo`, `developer@ghat.demo`,
`presenter@ghat.demo` / `Presenter#Demo2026`) are created and
advertised by `GET /auth/config` only when `DEMO_USERS=true` and `APP_ENV=development`.

## Presenter (demo role)

The `demo` role lets one login show every feature: it has officer rights everywhere (including creating cases with
`created_by` set to its email, assigning cases, briefs and reports, and sees all cases rather than a worker's own)
except `/users`, which returns `403 FORBIDDEN`. `presenter@ghat.demo` (name "Demo Presenter") is created in development
with `DEMO_USERS=true`. For a hosted pitch deployment keep `DEMO_USERS=false` and set `PRESENTER_EMAIL` and
`PRESENTER_PASSWORD`: that demo-role account is created at startup in any environment if missing. Note that it can
create cases, briefs and reports, so use a strong password and rotate or remove it afterwards.

## Sample cases

When `DEMO_USERS=true`, `APP_ENV=development` and readings exist, startup creates 6 sample review cases (once; skipped
if any case with `created_by` `demo-seed@ghat.demo` exists). They link real readings outside the class B criterion
(worst first, spread across ghats), have notes prefixed `[Demo data] `, and cover `needs_verification`,
`under_review`, `action_assigned` and `resolved`; 4 are assigned to `worker@ghat.demo`.

## Security notes

- Passwords are hashed with scrypt (`scrypt$n$r$p$salt$hash`, random 16-byte salt, constant-time compare). Plaintext
  passwords and tokens are never stored or logged.
- The login rate limit (5 failures per minute per client IP + email) is in memory and per process; behind a proxy the
  client IP is the proxy's unless it is configured to forward it, and multiple instances do not share counters.
- Tokens are bearer tokens: anyone holding one can use it until expiry. The client stores it (prefer memory or
  sessionStorage; localStorage is readable by any XSS). Always serve over HTTPS in production.
- Rotating `JWT_SECRET` invalidates all tokens.
- Create the first real officer with `BOOTSTRAP_OFFICER_*` or `python scripts/create_user.py`.
