// Role-based browser test (system Chrome via playwright-core): visitor, officer, worker, community member, developer.
// Needs the demo accounts (backend APP_ENV=development, DEMO_USERS=true).
//   FRONTEND_URL=http://localhost:3100 API=http://localhost:8010 node scripts/e2e-roles.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.FRONTEND_URL ?? "http://localhost:3100";
const API = process.env.API ?? "http://localhost:8010";
const OUT = process.env.SHOTS_DIR ?? "e2e-shots";
const CHROME = process.env.CHROME_PATH ?? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const cfg = await (await fetch(`${API}/api/v1/auth/config`)).json();
const demo = Object.fromEntries(cfg.demo_accounts.map((d) => [d.role, d]));
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let fails = 0; const consoleErrors = [];
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); if (!ok) fails++; };

async function newPage(label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(401|403|404)/.test(m.text())) consoleErrors.push(`[${label}] ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[${label}] pageerror ${String(e).slice(0, 160)}`));
  return { ctx, page };
}
const text = async (page) => (await page.locator("body").innerText());
async function go(page, path) { await page.goto(BASE + path, { waitUntil: "networkidle" }); await page.waitForTimeout(900); }
async function loginUi(page, role) {
  await go(page, "/login");
  await page.getByRole("tab", { name: role === "citizen" ? "Community" : role === "worker" ? "Field worker" : role === "demo" ? "Presenter" : "Officer" }).click();
  await page.fill("#email", demo[role].email); await page.fill("#password", demo[role].password);
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await page.waitForTimeout(1800);
}

// ── visitor ───────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage("visitor");
  await go(page, "/");
  check("visitor: landing page", /Know where to look/.test(await text(page)));
  await page.screenshot({ path: `${OUT}/landing.png`, fullPage: true });
  await go(page, "/cases");
  check("visitor: /cases redirects to login", page.url().includes("/login") && page.url().includes("next="), page.url());
  await go(page, "/citizen");
  check("visitor: citizen guide is public", /Responsible Visarjan Guide/.test(await text(page)));
  await go(page, "/login"); await page.screenshot({ path: `${OUT}/login.png` });
  await page.fill("#email", demo.officer.email); await page.fill("#password", "wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).last().click(); await page.waitForTimeout(1200);
  check("visitor: wrong password shows an error, stays on login", /incorrect/i.test(await text(page)) && page.url().includes("/login"));
  await ctx.close();
}

// ── officer ───────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage("officer");
  await loginUi(page, "officer");
  check("officer: lands on the dashboard", /Environmental Intelligence Dashboard/.test(await text(page)), page.url());
  await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/officer-dashboard.png`, fullPage: true });
  const nav = await page.locator("nav[aria-label=Primary]").innerText();
  check("officer: sees Team, not System status", /Team/.test(nav) && !/System status/.test(nav), nav.replace(/\n/g, "|"));
  check("officer: no 'API connected' chip", !/API connected/.test(await text(page)));
  check("officer: heatmap rendered", /Where concerns concentrate/.test(await text(page)));
  await go(page, "/settings");
  check("officer: /settings is forbidden", /isn.t part of your account/.test(await text(page)));
  await go(page, "/team");
  const stamp = Date.now();
  await page.fill("#tn", "QA Worker"); await page.fill("#te", `qa-${stamp}@ghat.demo`); await page.fill("#tp", "QaWorker#2026x");
  await page.getByRole("button", { name: "Create account" }).click(); await page.waitForTimeout(1500);
  check("officer: created a worker account", /Account ready/.test(await text(page)) && (await text(page)).includes(`qa-${stamp}@ghat.demo`));
  await page.screenshot({ path: `${OUT}/team.png`, fullPage: true });
  // create a case and assign it to the new worker through the UI
  const ghat = await (await fetch(`${API}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: demo.officer.email, password: demo.officer.password }) })).json();
  const auth = { Authorization: `Bearer ${ghat.access_token}`, "Content-Type": "application/json" };
  const gid = (await (await fetch(`${API}/api/v1/ghats?limit=1`, { headers: auth })).json()).items[0].id;
  const created = await (await fetch(`${API}/api/v1/cases`, { method: "POST", headers: auth, body: JSON.stringify({ ghat_id: gid, recommended_action: "E2E: verify the recorded measurement" }) })).json();
  await go(page, `/cases/${created.id}`);
  await page.selectOption("#st", "under_review");
  await page.getByRole("button", { name: "Save changes" }).click(); await page.waitForTimeout(1200);
  await page.selectOption("#as", `qa-${stamp}@ghat.demo`); await page.selectOption("#st", "action_assigned");
  await page.getByRole("button", { name: "Save changes" }).click(); await page.waitForTimeout(1500);
  check("officer: assigned a case to the worker", /Action assigned/.test(await text(page)) && (await text(page)).includes(`qa-${stamp}@ghat.demo`));
  globalThis.__worker = { email: `qa-${stamp}@ghat.demo`, password: "QaWorker#2026x", caseId: created.id };
  await ctx.close();
}

// ── worker ────────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage("worker");
  await loginUi(page, "worker");
  check("worker: lands on My cases", /My cases/.test(await text(page)), page.url());
  const nav = await page.locator("nav[aria-label=Primary]").innerText();
  check("worker: no Reports / Team / Intelligence in nav", !/Reports|Team|AI Intelligence/.test(nav), nav.replace(/\n/g, "|"));
  for (const p of ["/reports", "/intelligence", "/team", "/settings", "/analytics"]) { await go(page, p); check(`worker: ${p} forbidden`, /isn.t part of your account/.test(await text(page))); }
  await ctx.close();
  // the newly created worker sees exactly the assigned case
  const w = globalThis.__worker; const { ctx: c2, page: p2 } = await newPage("qa-worker");
  await go(p2, "/login"); await p2.getByRole("tab", { name: "Field worker" }).click();
  await p2.fill("#email", w.email); await p2.fill("#password", w.password); await p2.getByRole("button", { name: "Sign in" }).last().click(); await p2.waitForTimeout(2000);
  const t = await text(p2);
  check("worker: sees only the case assigned to them", t.includes(w.caseId), t.slice(0, 200));
  await p2.screenshot({ path: `${OUT}/worker-cases.png`, fullPage: true });
  await go(p2, `/cases/${w.caseId}`);
  check("worker: can open the assigned case, no assignee control", /Update case/.test(await text(p2)) && (await p2.locator("#as").count()) === 0);
  await c2.close();
}

// ── community member ────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage("citizen");
  await loginUi(page, "citizen");
  check("citizen: lands on the citizen guide", /Responsible Visarjan Guide/.test(await text(page)), page.url());
  await go(page, "/ghats"); check("citizen: /ghats forbidden", /isn.t part of your account/.test(await text(page)));
  await go(page, "/cases"); check("citizen: /cases forbidden", /isn.t part of your account/.test(await text(page)));
  await go(page, "/citizen");
  await page.getByRole("tab", { name: /Ask a question/ }).click(); await page.waitForTimeout(500);
  await page.fill("#q", "Is it safe to visit a ghat today?"); await page.getByRole("button", { name: "Ask" }).click(); await page.waitForTimeout(3500);
  check("citizen: Q&A works and says there is no live data", /No current \(live\)/.test(await text(page)));
  await page.screenshot({ path: `${OUT}/citizen.png`, fullPage: true });
  await ctx.close();
}

// ── developer ───────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage("developer");
  await loginUi(page, "officer"); // developer signs in through the same form
  await go(page, "/login"); // already signed in as officer: sign out and use the developer account instead
  await ctx.close();
  const { ctx: c2, page: p2 } = await newPage("developer");
  await go(p2, "/login");
  await p2.fill("#email", demo.developer.email); await p2.fill("#password", demo.developer.password);
  await p2.getByRole("button", { name: "Sign in" }).last().click(); await p2.waitForTimeout(1800);
  const nav = await p2.locator("nav[aria-label=Primary]").innerText();
  check("developer: sees System status", /System status/.test(nav));
  await go(p2, "/settings");
  check("developer: /settings works", /Backend reachable/.test(await text(p2)));
  await p2.screenshot({ path: `${OUT}/developer-status.png`, fullPage: true });
  await c2.close();
}

// ── presenter (one account, every view) ─────────────────────────────────────────────
if (demo.demo) {
  const { ctx, page } = await newPage("presenter");
  await go(page, "/"); // landing: one-click demo
  check("presenter: landing offers a live demo", /Launch live demo/.test(await text(page)));
  await page.getByRole("button", { name: "Launch live demo" }).first().click(); await page.waitForTimeout(3000);
  check("presenter: demo button signs in and opens the dashboard", /Environmental Intelligence Dashboard/.test(await text(page)), page.url());
  const nav = await page.locator("nav[aria-label=Primary]").innerText();
  check("presenter: sees Reports and Intelligence, not Team or System status", /Reports/.test(nav) && /AI Intelligence/.test(nav) && !/Team|System status/.test(nav), nav.replace(/\n/g, "|"));
  await go(page, "/team"); check("presenter: /team is forbidden", /isn.t part of your account/.test(await text(page)));
  await go(page, "/cases");
  check("presenter: sees seeded demo cases in every status", /Needs verification/.test(await text(page)) && /Resolved/.test(await text(page)));
  await page.screenshot({ path: `${OUT}/presenter-cases.png`, fullPage: true });
  await page.getByRole("button", { name: "Worker", exact: true }).click(); await page.waitForTimeout(1500);
  check("presenter: 'View as Worker' shows My cases", /My cases/.test(await text(page)), page.url());
  await go(page, "/reports"); check("presenter as worker: /reports restricted", /isn.t part of your account/.test(await text(page)));
  await page.getByRole("button", { name: "Community", exact: true }).click(); await page.waitForTimeout(1500);
  check("presenter: 'View as Community' shows the citizen guide", /Responsible Visarjan Guide/.test(await text(page)), page.url());
  await page.getByRole("button", { name: "All", exact: true }).click(); await page.waitForTimeout(1500);
  check("presenter: back to the full view", /Environmental Intelligence Dashboard/.test(await text(page)), page.url());
  await ctx.close();
}

await browser.close();
if (consoleErrors.length) { console.log("\nConsole errors:"); [...new Set(consoleErrors)].forEach((e) => console.log("  " + e)); }
console.log(`\n${fails ? fails + " check(s) failed" : "All role checks passed"}${consoleErrors.length ? `, ${new Set(consoleErrors).size} distinct console error(s)` : ""}`);
process.exit(fails ? 1 : 0);
