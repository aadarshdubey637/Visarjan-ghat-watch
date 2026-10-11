// Browser smoke test (system Chrome via playwright-core), signed in as the developer demo account (every page is reachable). Visits every route, fails on console errors, page errors,
// failed/5xx network calls or an empty page, and saves screenshots.
//   FRONTEND_URL=http://localhost:3100 npm run e2e:smoke
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.FRONTEND_URL ?? "http://localhost:3100";
const OUT = process.env.SHOTS_DIR ?? "e2e-shots";
const CHROME = process.env.CHROME_PATH ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["/", "dashboard"], ["/ghats", "ghats"], ["/analytics", "analytics"], ["/prioritization", "prioritization"],
  ["/intelligence", "intelligence"], ["/cases", "cases"], ["/reports", "reports"], ["/citizen", "citizen"],
  ["/methodology", "methodology"], ["/settings", "settings"],
];

const API_BASE = process.env.API ?? "http://localhost:8010";
const cfg = await (await fetch(`${API_BASE}/api/v1/auth/config`)).json();
let TOKEN = null;
if (cfg.auth_enabled) {
  const acct = process.env.CHECK_EMAIL ? { email: process.env.CHECK_EMAIL, password: process.env.CHECK_PASSWORD } : cfg.demo_accounts.find((d) => d.role === "developer") ?? cfg.demo_accounts[0];
  TOKEN = (await (await fetch(`${API_BASE}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(acct) })).json()).access_token;
}
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failures = 0;
async function visit(page, url, name, viewportLabel) {
  const problems = [];
  const onConsole = (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`); };
  const onPageError = (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`);
  const onResponse = (r) => { if (r.status() >= 500) problems.push(`http ${r.status()}: ${r.url()}`); };
  const onFail = (r) => { const err = r.failure()?.errorText ?? ""; if (!err.includes("ERR_ABORTED")) problems.push(`requestfailed: ${r.url()} ${err}`); }; // aborted = prefetch/navigation cancel, benign
  page.on("console", onConsole); page.on("pageerror", onPageError); page.on("response", onResponse); page.on("requestfailed", onFail);
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  const text = (await page.locator("body").innerText()).trim();
  if (text.length < 200) problems.push(`page looks empty (${text.length} chars)`);
  if (/Application error|Unhandled Runtime Error|This page could not be found/i.test(text)) problems.push("error page rendered");
  await page.screenshot({ path: `${OUT}/${name}-${viewportLabel}.png`, fullPage: true });
  page.off("console", onConsole); page.off("pageerror", onPageError); page.off("response", onResponse); page.off("requestfailed", onFail);
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${viewportLabel.padEnd(7)} ${url}${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
  if (problems.length) failures++;
}

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport });
  if (TOKEN) await ctx.addInitScript((tok) => window.localStorage.setItem("gs:token", tok), TOKEN);
  const page = await ctx.newPage();
  for (const [url, name] of ROUTES) await visit(page, url, name, label);
  if (label === "desktop") {
    // dynamic routes: first ghat and a case if present
    const auth = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
    const ghat = await (await fetch(`${API_BASE}/api/v1/ghats?limit=1`, { headers: auth })).json();
    await visit(page, `/ghats/${ghat.items[0].id}`, "ghat-detail", label);
    const cases = await (await fetch(`${API_BASE}/api/v1/cases?limit=1`, { headers: auth })).json();
    if (cases.items[0]) await visit(page, `/cases/${cases.items[0].id}`, "case-detail", label);
  }
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} page(s) with problems` : "\nAll pages OK");
process.exit(failures ? 1 : 0);
