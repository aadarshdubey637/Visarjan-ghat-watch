// Browser test for the map and uploads pages (system Chrome via playwright-core).
// Needs demo accounts (backend APP_ENV=development, DEMO_USERS=true).
//   FRONTEND_URL=http://localhost:3100 API=http://localhost:8010 node scripts/e2e-places.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.FRONTEND_URL ?? "http://localhost:3100";
const API = process.env.API ?? "http://localhost:8010";
const OUT = process.env.SHOTS_DIR ?? "e2e-shots";
const CHROME = process.env.CHROME_PATH ?? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const cfg = await (await fetch(`${API}/api/v1/auth/config`)).json();
const demo = Object.fromEntries(cfg.demo_accounts.map((d) => [d.role, d]));
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let fails = 0; const errors = [];
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); if (!ok) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gs-"));
const png = path.join(tmp, "site.png");
fs.writeFileSync(png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(80)]));
const site = `E2E Test Ghat ${Date.now()}`; // unique per run: existing rows are skipped on re-import
const csv = path.join(tmp, "lab-2026.csv");
fs.writeFileSync(csv, `year,festival,site,phase,parameter,value
2026,Durga,${site},pre,pH,7.2
2026,Durga,${site},during,pH,7.9
`);

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${String(e).slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tile\.openstreetmap|nominatim/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  return { ctx, page };
}
const go = async (page, p) => { await page.goto(BASE + p, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2500); };

// ── visitor: map is public ───────────────────────────────
{
  const { page } = await newPage({ geolocation: { latitude: 23.2599, longitude: 77.4126 }, permissions: ["geolocation"] });
  await go(page, "/map");
  check("map: page renders without login", /Visarjan map/.test(await page.locator("body").innerText()));
  check("map: leaflet map mounted", (await page.locator(".leaflet-container").count()) === 1);
  const markers = await page.locator(".leaflet-marker-icon").count();
  check("map: place markers drawn", markers >= 5, `markers=${markers}`);
  check("map: places listed", /Khatlapura/.test(await page.locator("body").innerText()));
  check("map: approximate-location warning shown", /approximate/i.test(await page.locator("body").innerText()));
  check("map: no officer tools for visitors", (await page.getByText("Officer tools").count()) === 0);
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.waitForTimeout(1500);
  const t = await page.locator("body").innerText();
  check("map: distances appear after sharing location", /Nearest first/.test(t) && /\b\d+(\.\d)? km\b|\b\d+ m\b/.test(t));
  await page.getByRole("button", { name: /Khatlapura/ }).first().click();
  await page.waitForTimeout(500);
  check("map: selecting a place offers directions", (await page.getByRole("link", { name: /Directions/ }).count()) >= 1);
  await page.screenshot({ path: `${OUT}/map-visitor.png` });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  check("map: no horizontal scroll on mobile", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: `${OUT}/map-mobile.png` });
}

// ── officer: tools and uploads ───────────────────────────
{
  const { page } = await newPage();
  await go(page, "/login");
  await page.getByRole("tab", { name: "Officer" }).click();
  await page.fill("#email", demo.officer.email); await page.fill("#password", demo.officer.password);
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await page.waitForTimeout(2500);
  await go(page, "/map");
  check("officer: sees officer tools on map", (await page.getByText("Officer tools").count()) === 1);
  await page.getByRole("button", { name: "Add a place" }).click();
  await page.locator(".leaflet-container").click({ position: { x: 120, y: 500 } });
  await page.fill("#pn", "E2E Municipal Kund");
  await page.getByRole("button", { name: "Save place" }).click();
  await page.waitForTimeout(1500);
  check("officer: added place appears in the list", /E2E Municipal Kund/.test(await page.locator("body").innerText()));

  await go(page, "/uploads");
  check("officer: uploads page has both tabs", (await page.getByRole("tab", { name: /Lab results/ }).count()) === 1);
  await page.setInputFiles("#ef", png);
  await page.fill("#en", "E2E photo");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page.waitForTimeout(2000);
  check("officer: photo upload appears in recent uploads", /site\.png/.test(await page.locator("body").innerText()));
  await page.getByRole("tab", { name: /Lab results/ }).click();
  await page.setInputFiles("#cf", csv);
  await page.getByRole("button", { name: "Check file" }).click();
  await page.waitForTimeout(1500);
  let t = await page.locator("body").innerText();
  check("officer: CSV preview shows new site and counts", t.includes(site) && /Will import/.test(t));
  await page.getByRole("button", { name: /Import 2 readings/ }).click();
  await page.waitForTimeout(2000);
  t = await page.locator("body").innerText();
  check("officer: CSV import confirmed", /Done\. The new readings/.test(t));
  await page.screenshot({ path: `${OUT}/uploads-officer.png`, fullPage: true });
}

// ── worker: photos only; community: no uploads ───────────
{
  const { page } = await newPage();
  await go(page, "/login");
  await page.getByRole("tab", { name: "Field worker" }).click();
  await page.fill("#email", demo.worker.email); await page.fill("#password", demo.worker.password);
  await page.getByRole("button", { name: "Sign in" }).last().click();
  await page.waitForTimeout(2500);
  await go(page, "/uploads");
  check("worker: can upload photos", (await page.locator("#ef").count()) === 1);
  check("worker: no CSV tab", (await page.getByRole("tab", { name: /Lab results/ }).count()) === 0);
}
{
  const { page } = await newPage();
  await go(page, "/uploads");
  check("visitor: uploads redirects to sign-in", /\/login/.test(page.url()));
}

console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
await browser.close();
if (fails) { console.log(`\n${fails} check(s) failed`); process.exit(1); }
console.log("\nAll map/upload checks passed");
