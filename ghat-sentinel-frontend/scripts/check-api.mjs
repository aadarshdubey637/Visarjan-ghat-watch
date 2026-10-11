// Contract smoke test: calls every backend endpoint the UI uses and checks status codes and key fields.
//   npm run check:api            (uses NEXT_PUBLIC_API_BASE_URL or http://localhost:8000)
// Exit code 1 if any check fails. Creates one verification case (the backend has no delete).
const ORIGIN = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "").replace(/\/api\/v1$/, "");
const API = `${ORIGIN}/api/v1`;
const rows = [];
let failed = 0;
let TOKEN = null;

async function call(method, path, body, expect = 200) {
  const headers = { ...(body ? { "Content-Type": "application/json" } : {}), ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text, ok: res.status === expect, headers: res.headers };
}
function check(name, ok, detail = "") { rows.push({ name, ok, detail }); if (!ok) failed++; }
const has = (o, keys) => keys.every((k) => o && Object.prototype.hasOwnProperty.call(o, k));

async function main() {
  // Public endpoints first (no token), then sign in with the officer demo account (or CHECK_EMAIL / CHECK_PASSWORD).
  let r = await call("GET", "/auth/config"); check("GET /auth/config (public)", r.ok && has(r.json, ["auth_enabled", "roles", "demo_accounts"]));
  if (r.json?.auth_enabled) {
    r = await call("GET", "/ghats", null, 401); check("protected route without a token -> 401", r.ok && r.json?.error?.code === "UNAUTHENTICATED");
    const acct = process.env.CHECK_EMAIL ? { email: process.env.CHECK_EMAIL, password: process.env.CHECK_PASSWORD } : r.json && (await call("GET", "/auth/config")).json.demo_accounts.find((d) => d.role === "officer");
    if (!acct) throw new Error("No credentials: set CHECK_EMAIL and CHECK_PASSWORD (demo accounts are disabled).");
    r = await call("POST", "/auth/login", { email: acct.email, password: acct.password }); check("POST /auth/login", r.ok && !!r.json?.access_token && r.json.user.role);
    TOKEN = r.json?.access_token;
    r = await call("GET", "/auth/me"); check("GET /auth/me", r.ok && has(r.json, ["id", "email", "name", "role"]));
  }
  r = await call("GET", "/health"); check("GET /health", r.ok && has(r.json, ["status", "data_loaded", "ai_configured", "ghats_loaded"]));
  r = await call("GET", "/metadata"); check("GET /metadata", r.ok && has(r.json, ["year_range", "parameters", "sources", "enums", "cpcb_classes"]));
  const params = r.json?.parameters ?? [];
  r = await call("GET", "/ghats?limit=100"); check("GET /ghats", r.ok && Array.isArray(r.json?.items) && r.json.items.length > 0, `${r.json?.total} ghats`);
  const gid = r.json?.items?.[0]?.id;
  r = await call("GET", "/ghats/ranked"); check("GET /ghats/ranked", r.ok && has(r.json, ["items", "method", "disclaimer"]) && has(r.json.items[0], ["priority_level", "factors", "outside_reading_ids"]));
  r = await call("GET", `/ghats/${gid}`); check("GET /ghats/{id}", r.ok && has(r.json, ["parameters", "latest_readings", "data_quality", "cpcb_class"]) && r.json.latest_readings.every((x) => x.evaluation));
  r = await call("GET", `/ghats/${gid}/readings?evaluate=true&limit=5`); check("GET /ghats/{id}/readings", r.ok && has(r.json, ["items", "total", "limit", "offset"]) && has(r.json.items[0], ["sample_year", "festival", "phase", "sample_period", "evaluation"]));
  const readingId = r.json?.items?.[0]?.id;
  const bod = params.find((p) => /BOD/i.test(p.parameter))?.parameter ?? params[0]?.parameter;
  r = await call("GET", `/ghats/${gid}/trends?parameter=${encodeURIComponent(bod)}`); check("GET /ghats/{id}/trends", r.ok && has(r.json?.items?.[0], ["series", "period_summary", "trend_summaries"]));
  r = await call("GET", "/analytics/overview"); check("GET /analytics/overview", r.ok && has(r.json, ["total_ghats", "flagged_readings", "cases_by_status", "data_quality_warnings"]));
  r = await call("GET", "/analytics/findings?limit=5"); check("GET /analytics/findings", r.ok && has(r.json, ["items", "total", "cpcb_class"]) && r.json.items.every((f) => f.reading.evaluation?.result === "outside_criterion"), `${r.json?.total} outside criterion`);
  r = await call("GET", `/analytics/benchmark?parameter=${encodeURIComponent(bod)}&year=2024`); check("GET /analytics/benchmark", r.ok && has(r.json, ["comparable", "bhopal", "statewide", "warnings", "missing_data_exclusions"]));
  r = await call("GET", "/criteria"); check("GET /criteria", r.ok && Array.isArray(r.json?.items) && r.json.items.length > 0, `${r.json?.items?.length} criteria`);
  r = await call("GET", "/predict/oct20"); check("GET /predict/oct20", r.ok && has(r.json, ["forecast_status", "is_prediction", "target_date", "historical_values", "limitations"]), r.json?.forecast_status);
  r = await call("POST", "/brief/generate", { ghat_ids: [gid], language: "en", use_ai: true, require_ai: false }); check("POST /brief/generate", r.ok && has(r.json, ["content", "evidence", "generation_mode", "ai_status"]), r.json?.generation_mode);
  r = await call("POST", "/brief/whatsapp", { ghat_ids: [gid], language: "bilingual", include_actions: true, use_ai: true, require_ai: false }); check("POST /brief/whatsapp", r.ok && has(r.json, ["content", "evidence", "generation_mode"]));
  r = await call("POST", "/citizen/ask", { question: "Is this ghat safe today?", language: "en", ghat_id: gid, use_ai: true, require_ai: false }); check("POST /citizen/ask", r.ok && has(r.json, ["answer", "limitations", "evidence"]) && /live|current/i.test(r.json.answer + r.json.limitations.join(" ")));
  r = await call("GET", "/citizen/ghats"); check("GET /citizen/ghats", r.ok && r.json?.current_conditions_available === false);
  r = await call("GET", "/citizen/guide?language=hi"); check("GET /citizen/guide", r.ok && r.json?.items?.length > 0 && r.json.language === "hi");
  r = await call("GET", "/citizen/resources"); check("GET /citizen/resources", r.ok && r.json?.items?.every((x) => x.url.startsWith("https://")));
  r = await call("POST", "/cases", { ghat_id: gid, reading_ids: [readingId], recommended_action: "Contract check: verify the recorded measurement" }, 201); check("POST /cases", r.status === 201 && r.json?.status === "needs_verification");
  const cid = r.json?.id;
  r = await call("GET", "/cases?limit=5"); check("GET /cases", r.ok && has(r.json, ["items", "total"]));
  r = await call("GET", `/cases/${cid}`); check("GET /cases/{id}", r.ok && r.json?.id === cid);
  r = await call("PATCH", `/cases/${cid}`, { status: "resolved", resolution_summary: "x" }, 409); check("PATCH /cases/{id} invalid transition -> 409", r.ok && r.json?.error?.code === "INVALID_STATUS_TRANSITION");
  r = await call("PATCH", `/cases/${cid}`, { status: "under_review" }); check("PATCH /cases/{id} valid transition", r.ok && r.json?.status === "under_review");
  r = await call("POST", "/reports/generate", { ghat_ids: [gid], language: "en", format: "json" }); check("POST /reports/generate (json)", r.ok && has(r.json, ["sections", "criteria", "limitations", "generated_at"]));
  r = await call("POST", "/reports/generate", { ghat_ids: [gid], language: "en", format: "csv" }); check("POST /reports/generate (csv)", r.ok && (r.headers.get("content-type") ?? "").startsWith("text/csv") && r.text.startsWith("generated_at,"));
  r = await call("GET", "/ghats/nope", null, 404); check("404 envelope", r.ok && r.json?.error?.code === "GHAT_NOT_FOUND");
  r = await call("GET", "/ghats?limit=0", null, 422); check("422 envelope", r.ok && r.json?.error?.code === "VALIDATION_ERROR");
}

main().catch((e) => { check("backend reachable", false, String(e?.cause?.message ?? e)); }).finally(() => {
  console.log(`Backend: ${API}\n`);
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  process.exit(failed ? 1 : 0);
});
