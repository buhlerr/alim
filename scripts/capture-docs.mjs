import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD || "localdev";
const OUT = "docs/screenshots";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();
const HIDE = "nextjs-portal{display:none!important}";

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.fill("#password", PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);

for (const [name, path] of [
  ["docs", "/docs"],
  ["docs-authentication", "/docs/authentication"],
  ["docs-databases", "/docs/databases"],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name, "→", page.url());
}

await browser.close();
console.log("done");
