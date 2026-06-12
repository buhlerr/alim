import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PASSWORD = process.env.AUTH_PASSWORD || "localdev";
const OUT = "docs/screenshots";

const routes = [
  ["dashboard", "/dashboard"],
  ["create", "/create"],
  ["registry", "/registry"],
  ["query", "/query"],
  ["coolify", "/coolify"],
  ["npm", "/npm"],
  ["cloudflare", "/cloudflare"],
  ["deploy", "/deploy"],
  ["migrations", "/migrations"],
  ["secrets", "/secrets"],
  ["audit", "/audit"],
  ["settings", "/settings"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();

// Hide the Next.js dev-mode indicator so it doesn't appear in the screenshots.
const HIDE_DEV_BADGE = "nextjs-portal{display:none!important}";
async function shoot(path) {
  await page.addStyleTag({ content: HIDE_DEV_BADGE }).catch(() => {});
  await page.screenshot({ path });
}

// 1. Login page (unauthenticated → middleware sends us here).
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await shoot(`${OUT}/login.png`);
console.log("captured login");

// 2. Sign in with the shared password.
await page.fill("#password", PASSWORD);
await Promise.all([
  page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
console.log("signed in →", page.url());

// 3. Each main section.
for (const [name, path] of routes) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500); // let the route compile + data settle
    await shoot(`${OUT}/${name}.png`);
    console.log("captured", name);
  } catch (err) {
    console.error("FAILED", name, err.message);
  }
}

await browser.close();
console.log("done");
