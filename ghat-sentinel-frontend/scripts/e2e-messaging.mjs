// Browser test of the Send dialog (email + WhatsApp) as the presenter account.
// SAFE BY DEFAULT: it refuses to run unless the backend reports dry_run=true, so no real message can be sent.
//   FRONTEND_URL=http://localhost:3100 API=http://localhost:8010 node scripts/e2e-messaging.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.FRONTEND_URL ?? "http://localhost:3100";
const API = process.env.API ?? "http://localhost:8010";
const OUT = process.env.SHOTS_DIR ?? "e2e-shots";
const CHROME = process.env.CHROME_PATH ?? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const cfg = await (await fetch(`${API}/api/v1/auth/config`)).json();
const acct = cfg.demo_accounts.find((d) => d.role === "demo");
const login = await (await fetch(`${API}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(acct) })).json();
const mcfg = await (await fetch(`${API}/api/v1/messaging/config`, { headers: { Authorization: `Bearer ${login.access_token}` } })).json();
if (!mcfg.dry_run) { console.error("Refusing to run: the backend is not in MESSAGING_DRY_RUN mode, so this test could send real messages."); process.exit(2); }

let fails = 0; const errors = [];
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : "  " + x}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript((t) => window.localStorage.setItem("gs:token", t), login.access_token);
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
const body = async () => page.locator("body").innerText();

await page.goto(`${BASE}/intelligence`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Generate brief" }).first().click();
await page.getByRole("button", { name: /Send…/ }).waitFor({ timeout: 60000 });
check("brief generated and a Send button appears", true);
await page.getByRole("button", { name: /Send…/ }).click(); await page.waitForTimeout(800);
check("dry-run banner is shown in the dialog", /Dry-run mode/.test(await body()));

// email: validation, review, confirm, send
await page.fill("#sr", "not-an-email"); await page.waitForTimeout(300);
check("invalid email is flagged", /Not valid: not-an-email/.test(await body()));
check("Review is disabled while a recipient is invalid", await page.getByRole("button", { name: /Review/ }).isDisabled());
await page.fill("#sr", "officer@example.com, second@example.com"); await page.waitForTimeout(300);
await page.getByRole("button", { name: /Review \(2\)/ }).click(); await page.waitForTimeout(500);
check("review step lists both recipients and needs confirmation", /officer@example.com/.test(await body()) && await page.getByRole("button", { name: /Record dry run/ }).isDisabled());
await page.getByLabel(/I have checked the message/).check();
await page.getByRole("button", { name: /Record dry run/ }).click(); await page.waitForTimeout(1500);
check("email dry run completes with a result per recipient", /Dry run complete/.test(await body()) && /second@example.com/.test(await body()));
await page.screenshot({ path: `${OUT}/send-email-result.png` });
await page.getByRole("button", { name: "Done" }).click();

// whatsapp tab: number validation
await page.getByRole("button", { name: /Send…/ }).click(); await page.waitForTimeout(500);
await page.getByRole("tab", { name: "WhatsApp", exact: true }).click(); await page.waitForTimeout(300);
await page.fill("#sr", "12"); await page.waitForTimeout(300);
check("short phone number is flagged", /Not valid: 12/.test(await body()));
await page.fill("#sr", "+91 98765 43210"); await page.waitForTimeout(300);
await page.getByRole("button", { name: /Review \(1\)/ }).click(); await page.waitForTimeout(400);
check("review shows the normalised +91 number", /\+919876543210/.test(await body()));
await page.getByLabel(/I have checked the message/).check();
await page.getByRole("button", { name: /Record dry run/ }).click(); await page.waitForTimeout(1500);
check("WhatsApp dry run completes", /Dry run complete/.test(await body()) && /\+919876543210/.test(await body()));
await page.getByRole("button", { name: "Done" }).click();

// history page
await page.goto(`${BASE}/messages`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
const t = await body();
check("history lists the email and WhatsApp dry runs", /second@example.com/.test(t) && /\+919876543210/.test(t) && /dry run/.test(t));
await page.screenshot({ path: `${OUT}/messages-history.png`, fullPage: true });

// access: a field worker must not reach messaging
const wacct = cfg.demo_accounts.find((d) => d.role === "worker");
const w = await (await fetch(`${API}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(wacct) })).json();
const r = await fetch(`${API}/api/v1/messaging/log`, { headers: { Authorization: `Bearer ${w.access_token}` } });
check("worker is forbidden from the message log (403)", r.status === 403, String(r.status));

await browser.close();
if (errors.length) { console.log("\nConsole errors:"); [...new Set(errors)].forEach((e) => console.log("  " + e)); }
console.log(fails ? `\n${fails} check(s) failed` : "\nAll messaging checks passed");
process.exit(fails ? 1 : 0);
