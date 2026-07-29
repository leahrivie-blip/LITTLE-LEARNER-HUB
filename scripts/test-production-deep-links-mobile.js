#!/usr/bin/env node
/** Mobile + desktop deep-link production check after SPA hotfix. */
const { chromium } = require("playwright");
const PROD = process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com";
const viewports = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function gotoWithRetry(page, url, attempts = 4) {
  let lastError = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1200 * i);
    }
  }
  throw lastError;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let failed = 0;
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    for (const route of ["/", "/login", "/signup"]) {
      const url = `${PROD}${route === "/" ? "" : route}`;
      try {
        await gotoWithRetry(page, url);
        await page.waitForFunction(
          () => document.body.classList.contains("app-boot-ready")
            || document.querySelector(".landing-home")
            || (document.body?.innerText || "").length > 100,
          null,
          { timeout: 90000 },
        );
        const ok = await page.evaluate(() => {
          const text = document.body?.innerText || "";
          return text.length > 100 && !/^Not found$/i.test(text.trim());
        });
        if (ok) console.log(`PASS  ${vp.name} ${route || "/"} loads app shell`);
        else { console.error(`FAIL  ${vp.name} ${route}`); failed += 1; }
      } catch (error) {
        console.error(`FAIL  ${vp.name} ${route} — ${error.message}`);
        failed += 1;
      }
    }
    await page.close();
  }
  await browser.close();
  if (failed) process.exit(1);
  console.log("All deep-link mobile/desktop checks passed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
