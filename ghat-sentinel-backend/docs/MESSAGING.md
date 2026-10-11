# Messaging: e-mail and WhatsApp

Officers (roles `officer`, `developer`, `demo`) can send a generated brief to people by **e-mail (SMTP)** and
**WhatsApp (Meta WhatsApp Cloud API)**. Every recipient gets one row in the `messages` audit table. Workers and
citizens receive `403`; unauthenticated callers `401`; with `AUTH_ENABLED=false` the endpoints are open (sender is
recorded as `anonymous@local`).

## Architecture

```
frontend  ->  /api/v1/messaging/*  (app/api/routes/messaging.py, guard: managers)
                  |
              app/services/messaging.py
                  |-- e-mail:    smtplib (STARTTLS or SSL), one UTF-8 text/plain message per recipient
                  |-- WhatsApp:  httpx POST https://graph.facebook.com/{version}/{phone_number_id}/messages
                  `-- audit:     table `messages` (channel, recipient, subject, body, status, error, ...)
```

* One message per recipient (no shared `To` list, so recipients never see each other).
* One recipient failing never stops the others; per-recipient results are returned with HTTP 200.
* Header injection is rejected (CR/LF in subject or addresses gives `422`).
* Secrets are read from the environment only. They are never returned, stored in the audit table or logged; error
  texts are short and sanitised.
* Limits: at most `MESSAGING_MAX_RECIPIENTS` recipients per request (`422`), and `MESSAGING_MAX_PER_HOUR` messages
  per user per hour (`429 RATE_LIMITED`, in-memory per process).
* `brief_id`, if supplied, must exist (`422 INVALID_BRIEF_ID`).
* Channel not configured and not dry-run gives `503 CHANNEL_NOT_CONFIGURED` naming the missing settings (not values).
* `MESSAGING_DRY_RUN=true` does everything except the network call: rows are logged with status `dry_run` and no
  configuration is required. Use it to try the UI safely.

### Endpoints (prefix `/api/v1`)

| Method and path | Purpose |
|---|---|
| `GET /messaging/config` | channel status without secrets: e-mail `configured` and `from_address`, WhatsApp `configured`, `mode`, `template_name`, `language`, `dry_run`, `max_recipients` |
| `GET /messaging/contacts` | active officers and workers (id, name, role, email, phone) for the recipient picker |
| `POST /messaging/email` | `{to[], subject (1-150), body (1-5000), brief_id?}` |
| `POST /messaging/whatsapp` | `{to[] phone numbers, body (1-1500), brief_id?}`; numbers like `+91 98765-43210` are normalised to digits (8-15) and de-duplicated |
| `GET /messaging/log` | audit log, newest first (`channel`, `limit` 1-100, `offset`) |

Send response: `{"results":[{"recipient","status":"sent|failed|dry_run","error","message_id"}],"sent","failed","dry_run"}`.

Users have an optional `phone` (digits with optional leading `+`, 8-15 digits; set on `POST /users`, `PATCH /users/{id}`).
Existing databases get the column automatically at startup.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_HOST` | empty | SMTP server, e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` | 587 for STARTTLS, 465 for SSL |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | empty | login; set both or neither |
| `SMTP_FROM` | empty | e.g. `Ghat Sentinel <you@example.com>`; falls back to `SMTP_USERNAME` |
| `SMTP_STARTTLS` | `true` | upgrade the connection with STARTTLS (port 587) |
| `SMTP_USE_SSL` | `false` | implicit TLS (port 465); then STARTTLS is not used |
| `SMTP_TIMEOUT_SECONDS` | `15` | connect/IO timeout |
| `WHATSAPP_ACCESS_TOKEN` | empty | Meta access token (secret) |
| `WHATSAPP_PHONE_NUMBER_ID` | empty | the sending number's Phone Number ID |
| `WHATSAPP_API_VERSION` | `v21.0` | Graph API version |
| `WHATSAPP_MODE` | `template` | `template` or `text` (see below) |
| `WHATSAPP_TEMPLATE_NAME` | empty | approved template name (required in template mode) |
| `WHATSAPP_TEMPLATE_LANG` | `en` | template language code, e.g. `en`, `hi` |
| `WHATSAPP_TIMEOUT_SECONDS` | `15` | HTTP timeout |
| `MESSAGING_DRY_RUN` | `false` | log only, never call SMTP/Meta |
| `MESSAGING_MAX_RECIPIENTS` | `20` | per request |
| `MESSAGING_MAX_PER_HOUR` | `60` | per user |

Put them in `.env` (never commit it) or in your host's secret store. `.env.example` has placeholders only.

## Setup 1: Gmail SMTP

1. Sign in to the Google account that will send the mail and turn on **2-Step Verification**
   (Google Account > Security).
2. Open <https://myaccount.google.com/apppasswords>, create an app password (name it e.g. "Ghat Sentinel"). Google
   shows a 16-character password.
3. Set (remove the spaces from the app password):

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_STARTTLS=true
   SMTP_USERNAME=<your gmail address>
   SMTP_PASSWORD=<16-character app password, no spaces>
   SMTP_FROM=Ghat Sentinel <your gmail address>
   ```
4. Restart the backend, check `GET /messaging/config` shows `email.configured: true`, then send a test to yourself.

Notes: a personal Gmail account allows roughly 500 messages per day (Google Workspace more); Gmail rewrites the From
address to the authenticated account. Use a dedicated sender account, not a personal one.

Alternatives: **Brevo** (`SMTP_HOST=smtp-relay.brevo.com`, port 587, STARTTLS, username = your Brevo login, password =
an SMTP key from SMTP & API). **Outlook/Microsoft 365** (`SMTP_HOST=smtp.office365.com`, port 587, STARTTLS; SMTP AUTH
must be enabled for the mailbox).

## Setup 2: WhatsApp Cloud API

1. Go to <https://developers.facebook.com>, create an app (type **Business**) and add the **WhatsApp** product.
2. Open **WhatsApp > API Setup**. Copy the **Phone Number ID** (not the phone number or the WhatsApp Business Account
   ID) into `WHATSAPP_PHONE_NUMBER_ID`.
3. In **API Setup > To**, add your **test recipient numbers** and verify each with the code WhatsApp sends. While the
   app uses Meta's test number, only up to **5 verified recipients** can receive messages.
4. Create a message template: **WhatsApp Manager > Message templates > Create template**. Category **Utility**, name
   `ghat_sentinel_brief`, language English (add Hindi `hi` as a second language if you want), body:

   ```
   Ghat Sentinel update: {{1}}
   ```

   Provide a sample value for `{{1}}` (e.g. "Sample brief text"). Submit and wait for **Approved** (usually minutes).
5. Token: the temporary token on the API Setup page expires in **24 hours**. For production create a **System User**
   in Business Settings > Users > System users, assign it your app and WhatsApp account with full control, and
   generate a token with the `whatsapp_business_messaging` permission (and `whatsapp_business_management`). Choose
   "never expires".
6. Set:

   ```
   WHATSAPP_ACCESS_TOKEN=<system user token>
   WHATSAPP_PHONE_NUMBER_ID=<phone number id>
   WHATSAPP_API_VERSION=v21.0
   WHATSAPP_MODE=template
   WHATSAPP_TEMPLATE_NAME=ghat_sentinel_brief
   WHATSAPP_TEMPLATE_LANG=en
   ```
7. Restart, check `GET /messaging/config`, and send a test to a verified number.

### Template vs text mode and the 24-hour window

* **template** (default): sends your approved template with the brief as the single body parameter `{{1}}`. It can be
  delivered at any time, including to people who never wrote to you first. Meta forbids newlines, tabs and more than
  4 consecutive spaces in a parameter, so the platform converts line breaks to ` | `, collapses long runs of spaces
  and truncates to 1000 characters (with an ellipsis). Long briefs therefore arrive condensed.
* **text**: sends free-form text (up to 1500 characters, newlines kept). Meta only delivers it **inside the 24-hour
  customer-service window**, i.e. if the recipient messaged your number in the last 24 hours. Otherwise it fails
  (code 131047 / reported as a rejection). Use it for testing or for replies.

## Privacy and consent

* Message only people who agreed to receive Ghat Sentinel updates. WhatsApp recipients must be on WhatsApp and have
  opted in to your business; Meta can restrict or ban numbers that send unwanted messages.
* Do not send personal data (names, phone numbers, addresses of citizens) in briefs; briefs describe historical
  water-quality samples only.
* The audit log stores the recipient address/number and the message text as sent. Restrict access to it (managers
  only) and delete old rows according to your retention policy.
* Never share the SMTP password or WhatsApp token; rotate them if exposed.

## Troubleshooting

| Error shown | Meaning and fix |
|---|---|
| `503 CHANNEL_NOT_CONFIGURED` | required settings are missing (the message names them); or use `MESSAGING_DRY_RUN=true` |
| `Authentication failed` | wrong SMTP username/password; for Gmail use the app password without spaces |
| `Recipient refused` | the mail server rejected the address |
| `Sender address refused` | `SMTP_FROM` is not allowed for this account |
| `Could not connect to the mail server` | wrong host/port, firewall, or STARTTLS/SSL mismatch (587 + STARTTLS, 465 + SSL) |
| `Mail server timed out` | server slow or blocked; raise `SMTP_TIMEOUT_SECONDS` |
| `WhatsApp access token is invalid or expired` (190) | token expired (temporary tokens last 24 h); create a System User token |
| `Recipient is not allowed or not on WhatsApp ...` (131030/131026) | number is not verified in API Setup (test mode) or has no WhatsApp |
| `Template missing or parameters invalid` (132000/132001) | `WHATSAPP_TEMPLATE_NAME`/`WHATSAPP_TEMPLATE_LANG` do not match an approved template, or it does not have exactly one body parameter |
| `WhatsApp rejected the message (code N)` | other Meta error; the Meta text is appended (token removed). See Meta's error-code reference |
| `WhatsApp request timed out` / `Could not connect to WhatsApp` | network problem; raise `WHATSAPP_TIMEOUT_SECONDS` or retry |
| `429 RATE_LIMITED` | per-user hourly cap reached |
| `422` on send | invalid address/number, too many recipients, or unknown `brief_id` (`INVALID_BRIEF_ID`) |
