import { launch, watch, login, shot, issues, log, BASE } from "./lib.mjs";
const browser = await launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1360, height: 1000 } });
const page = await ctx.newPage();
watch(page, "mgr");
const text = async (sel = "main") => (await page.innerText(sel)).replace(/\s+/g, " ");
const step = async (name, fn) => { try { await fn(); log("OK  ", name); } catch (e) { log("FAIL", name, "-", e.message.split("\n")[0]); await shot(page, "fail-" + name.replace(/\W+/g, "-")); return false; } return true; };
const go = async (path) => { await page.goto(BASE + path, { waitUntil: "networkidle" }); await page.waitForTimeout(2500); };
// appear THEN disappear: avoids racing React's first render of the pending state
const busyDone = async (label, ms = 300000) => {
  await page.waitForFunction((l) => document.body.innerText.includes(l), label, { timeout: 20000 });
  await page.waitForFunction((l) => !document.body.innerText.includes(l), label, { timeout: ms });
  await page.waitForTimeout(2500);
};

await step("login", () => login(page, "mgr"));
await step("dashboard (demo orders finished?)", async () => {
  await go("/admin"); await shot(page, "40-dashboard");
  log("     ", (await text()).slice(0, 900));
});
await step("kitchen board numbers", async () => {
  await go("/admin/kitchen"); await shot(page, "41-kitchen");
  log("     columns:", (await page.locator(".kanban-col h3").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | "));
  log("     tiles:", (await page.locator(".metrics").innerText()).replace(/\s+/g, " "));
  const late = await page.locator(".ticket.late").count(); log("     overdue tickets highlighted:", late);
});
await step("inventory: empty state then demo inventory", async () => {
  await go("/admin/inventory");
  log("     before:", (await text()).slice(0, 220));
  const btn = page.getByRole("button", { name: /Add demo inventory \(dev\)/ });
  if (await btn.count()) { await btn.click(); await busyDone("Adding demo inventory..."); }
  await shot(page, "42-inventory");
  log("     after:", (await text()).slice(0, 700));
});
await step("kitchen: accept a ticket that has a branch, then check stock moved", async () => {
  await go("/admin/kitchen");
  const ticket = page.locator(".kanban-col").nth(0).locator(".ticket", { hasText: /Dhanmondi|Second branch/ }).first();
  if (!(await ticket.count())) throw new Error("no New ticket with a branch to accept");
  const id = (await ticket.locator("header strong").innerText()).trim();
  log("     accepting", id, "-", (await ticket.innerText()).replace(/\s+/g, " ").slice(0, 120));
  await ticket.getByRole("button", { name: "Accept" }).click();
  await page.waitForTimeout(6000);
  const err = await page.locator(".alert-error").allInnerTexts(); if (err.length) log("     ALERT:", err.join(" / "));
  await go("/admin/inventory");
  await shot(page, "43-inventory-after-accept");
  const moves = await page.locator(".live-list li").allInnerTexts();
  log("     recent movements:", moves.slice(0, 6).map((m) => m.replace(/\s+/g, " ")).join(" || ") || "(none)");
});
log("\nISSUES SO FAR:", issues.length); for (const i of issues) log(" -", i.kind, i.detail);
await browser.close();
