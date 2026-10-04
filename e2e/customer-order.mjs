import { launch, watch, login, shot, issues, log } from "./lib.mjs";
const browser = await launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
watch(page, "cust");
const step = async (name, fn) => { try { await fn(); log("OK  ", name); } catch (e) { log("FAIL", name, "-", e.message.split("\n")[0]); await shot(page, "fail-" + name.replace(/\W+/g, "-")); throw e; } };
try {
  await step("login", () => login(page, "cust"));
  await step("open restaurant", async () => {
    await page.getByRole("button", { name: /Dhaka Biryani House/ }).click();
    await page.waitForSelector("text=Kacchi Biryani", { timeout: 20000 });
    await shot(page, "20-menu");
  });
  await step("branch picker present", async () => {
    const select = page.locator(".branch-picker select");
    const n = await select.count();
    log("     branch pickers:", n, n ? "options: " + (await select.locator("option").allInnerTexts()).join(" | ") : "(none -- restaurant has <2 branches)");
  });
  await step("add two items", async () => {
    await page.locator(".menu-row", { hasText: "Kacchi Biryani" }).getByRole("button", { name: "Add" }).click();
    await page.locator(".menu-row", { hasText: "Borhani" }).getByRole("button", { name: "Add" }).click();
    await page.waitForSelector(".cart-bar");
    log("     cart bar:", (await page.locator(".cart-bar").innerText()).replace(/\s+/g, " "));
  });
  await step("open cart and check totals", async () => {
    await page.getByRole("button", { name: /View cart/ }).click();
    await page.waitForSelector("text=Delivery");
    log("     totals:", (await page.locator(".cart-totals").innerText()).replace(/\s+/g, " "));
    await shot(page, "21-cart");
  });
  await step("place order", async () => {
    await page.getByPlaceholder("House, road, area, city").fill("House 7, Road 3, Dhanmondi, Dhaka");
    await page.getByPlaceholder("01XXXXXXXXX").fill("01712345678");
    await page.getByRole("button", { name: /Place order/ }).click();
    await page.waitForURL(/\/orders$/, { timeout: 30000 });
    await page.waitForTimeout(2500);
    await shot(page, "22-orders");
    log("     orders page:", (await page.innerText("main")).replace(/\s+/g, " ").slice(0, 300));
  });
  await step("order shows items", async () => {
    await page.getByRole("button", { name: /Show items/ }).first().click();
    await page.waitForSelector(".order-items li", { timeout: 15000 });
    log("     items:", (await page.locator(".order-items").first().innerText()).replace(/\s+/g, " "));
  });
} catch { /* reported above */ }
log("\nISSUES RECORDED:", issues.length); for (const i of issues) log(" -", i.kind, i.detail);
await browser.close();
