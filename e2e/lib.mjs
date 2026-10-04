import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const here = path.dirname(fileURLToPath(import.meta.url));
// Screenshots land in e2e/.out (gitignored). Credentials come from a JSON file
// OUTSIDE the repo: E2E_CREDS=/path/creds.json with {"mgr":{"email","password"},"cust":{...}}.
export const SP = path.join(here, ".out");
fs.mkdirSync(path.join(SP, "shots"), { recursive: true });
if (!process.env.E2E_CREDS) throw new Error("Set E2E_CREDS to a JSON file of test-user credentials (kept outside the repo).");
export const BASE = process.env.E2E_BASE ?? "https://dbnyre-eoeuw.slsblx.com:5173";
const creds = JSON.parse(fs.readFileSync(process.env.E2E_CREDS, "utf8"));
export const issues = [];
export const log = (...a) => console.log(...a);

export async function launch() {
  return chromium.launch({ executablePath: process.env.E2E_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
}

// Records everything that would otherwise be invisible: console errors, page
// exceptions, failed API calls, and GraphQL errors hidden inside HTTP 200s.
export function watch(page, who) {
  const note = (kind, detail) => { issues.push({ who, kind, detail }); log(`  !! [${who}] ${kind}: ${detail}`); };
  page.on("pageerror", (e) => note("pageerror", e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) note("console", m.text().slice(0, 300)); });
  page.on("response", async (r) => {
    const url = r.url();
    if (!url.startsWith("https://blocksapi.slsblx.com")) return;
    const path = url.replace("https://blocksapi.slsblx.com", "").split("?")[0];
    if (r.status() >= 400 && !(r.status() === 401 && path.endsWith("/auth/me"))) note("http " + r.status(), `${r.request().method()} ${path}`);
    if (path.endsWith("/data/v4/gateway")) {
      try {
        const body = await r.json();
        if (Array.isArray(body?.errors) && body.errors.length) {
          const op = JSON.parse(r.request().postData() || "{}").operationName;
          note("graphql", `${op}: ${body.errors.map((e) => e.message).join("; ").slice(0, 300)}`);
        }
      } catch { /* non-JSON body */ }
    }
  });
}

export async function shot(page, name) { await page.screenshot({ path: `${SP}/shots/${name}.png`, fullPage: true }); }

export async function login(page, who) {
  const c = creds[who];
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Continue with Blocks/i }).click();
  await page.waitForURL(/iam\.seliseblocks\.com\/oidc\/login/, { timeout: 30000 });
  await page.waitForSelector("input", { timeout: 30000 });
  const inputs = page.locator("input");
  await inputs.nth(0).fill(c.email);
  await page.locator('input[type="password"]').first().fill(c.password);
  await page.getByRole("button", { name: /^login$/i }).click();
  await page.waitForURL((u) => u.origin === BASE && !u.pathname.startsWith("/login"), { timeout: 45000 });
  await page.waitForLoadState("networkidle");
}
