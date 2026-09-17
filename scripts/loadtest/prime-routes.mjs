// Vite's dev module graph only knows about a server function once some route
// that imports it has actually been crawled/transformed — hitting /_serverFn/
// directly for a function whose owning route was never visited in this dev
// server process gets "Invalid server function ID". Visiting every route
// once via a real browser forces that registration, exactly once, before the
// load test starts firing raw RPC calls at scale.
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

async function settle() {
  const hasTsr = await page.evaluate(() => "$_TSR" in window).catch(() => false);
  if (hasTsr) await page.waitForFunction(() => window.$_TSR?.hydrated === true, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await settle();
await page.getByRole("button", { name: /need an account/i }).click();
await page.waitForTimeout(300);
await page.getByLabel("Name").fill("Prime Route");
await page.getByLabel("Email").fill(`prime-${Date.now()}@example.test`);
await page.getByLabel("Password").fill("correct horse battery staple");
await page.getByRole("button", { name: /create account/i }).click();
await settle();
await page.waitForURL(/\/onboarding$/, { timeout: 25000 }).catch(() => {});
await settle();
if (page.url().includes("/onboarding")) {
  await page.getByLabel("Index number").fill(`prime${Date.now()}`.slice(0, 12));
  await page.getByLabel("Programme").fill("Priming");
  await page.getByRole("button", { name: /Continue/i }).click();
  await settle();
}

for (const path of ["/studio", "/studio/group", "/studio/opportunity", "/studio/select", "/studio/venture"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await settle();
}

console.log("routes primed");
await browser.close();
