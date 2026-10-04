import { launch, watch, login, shot, issues, log, BASE } from "./lib.mjs";
const browser = await launch();
const mk = async (who, w = 1360, h = 1000) => { const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: w, height: h } }); const page = await ctx.newPage(); watch(page, who); return page; };
const text = async (page, sel = "main") => (await page.innerText(sel)).replace(/\s+/g, " ");
const step = async (page, name, fn) => { try { await fn(); log("OK  ", name); } catch (e) { log("FAIL", name, "-", e.message.split("\n")[0]); await shot(page, "fail-" + name.replace(/\W+/g, "-")); return false; } return true; };
const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: "networkidle" }); await page.waitForTimeout(2500); };
const busyDone = async (page, label, ms = 300000) => {
  await page.waitForFunction((l) => document.body.innerText.includes(l), label, { timeout: 20000 });
  await page.waitForFunction((l) => !document.body.innerText.includes(l), label, { timeout: ms });
  await page.waitForTimeout(2500);
};

// A real customer browsing the restaurant, so Channels has genuine web-app presence.
const cust = await mk("cust", 1100, 800);
await step(cust, "customer: browse restaurant menu (real presence)", async () => {
  await login(cust, "cust");
  await cust.getByRole("button", { name: /Dhaka Biryani House/ }).click();
  await cust.waitForSelector("text=Kacchi Biryani");
  await cust.locator(".menu-row", { hasText: "Firni" }).getByRole("button", { name: "Add" }).click();
});

const mgr = await mk("mgr");
await step(mgr, "login", () => login(mgr, "mgr"));

await step(mgr, "devices: demo kiosks", async () => {
  await go(mgr, "/admin/devices");
  const btn = mgr.getByRole("button", { name: /Add demo kiosks \(dev\)/ });
  if (await btn.count()) { await btn.click(); await busyDone(mgr, "Adding demo kiosks..."); }
  await shot(mgr, "50-devices-initial");
  log("     ", (await text(mgr)).slice(0, 520));
});
await step(mgr, "devices: simulator makes kiosks online", async () => {
  await mgr.getByRole("button", { name: /Start simulating/ }).click();
  await mgr.waitForTimeout(30000);
  await shot(mgr, "51-devices-simulating");
  log("     tiles:", (await mgr.locator(".metrics").innerText()).replace(/\s+/g, " "));
});
await step(mgr, "devices: printer fault shows an issue", async () => {
  const select = mgr.locator(".sim-grid select").first();
  await select.selectOption({ label: "Printer fault" });
  await mgr.waitForTimeout(32000);
  await shot(mgr, "52-devices-fault");
  log("     issue chips:", (await mgr.locator(".chip.issue-problem, .chip.issue-warning").allInnerTexts()).join(" | "));
  log("     tiles:", (await mgr.locator(".metrics").innerText()).replace(/\s+/g, " "));
});

await step(mgr, "channels: simulator + real customer", async () => {
  await mgr.getByRole("link", { name: "Channels" }).click();
  await mgr.waitForSelector(".channel-cards"); await mgr.waitForTimeout(2000);
  await mgr.getByRole("button", { name: /Start simulating/ }).click();
  await mgr.waitForTimeout(40000);
  await shot(mgr, "53-channels");
  const cards = await mgr.locator(".channel-card").allInnerTexts();
  for (const c of cards) log("     card:", c.replace(/\s+/g, " "));
  log("     trend drawn:", (await mgr.locator("svg.trend").count()) > 0);
});

log("\nISSUES RECORDED:", issues.length); for (const i of issues) log(" -", `[${i.who}]`, i.kind, i.detail);
await browser.close();
