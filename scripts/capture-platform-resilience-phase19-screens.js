#!/usr/bin/env node
"use strict";

/**
 * Phase 19 screenshots (max 2):
 * 1) Phone accessibility / recovery summary
 * 2) Computer Testing Lab health / performance summary
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { assertFeatureScreen, assertNotHomepageFallback } = require("./capture-screen-assert.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.P19_SCREENSHOT_DIR || "/opt/cursor/artifacts/platform-resilience-phase19";
const ADMIN_EMAIL = "phase19-screens@example.com";
const ADMIN_PASSWORD = "Phase19ScreenPass!99";
const ADMIN_CODE = "phase19-screen-code";

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...headers } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => { let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; } resolve({ status: res.statusCode, json }); });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port) {
  for (let i = 0; i < 90; i += 1) {
    try { const res = await request(port, "GET", "/api/health"); if (res.status === 200) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("health timeout");
}

async function openLab(page, port, token) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.evaluate((adminToken) => {
    localStorage.setItem("llhAdminToken", adminToken);
    sessionStorage.setItem("llhAdminToken", adminToken);
  }, token);
  await page.goto(`http://127.0.0.1:${port}/#testing-lab`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.LLHPlatformPerf?.ensureViewScripts === "function", null, { timeout: 20000 });
  await page.evaluate(async () => {
    await window.LLHPlatformPerf.ensureViewScripts("testing-lab");
  });
  await page.waitForFunction(() => typeof window.renderTestingLabPage === "function", null, { timeout: 20000 });
  await page.evaluate(async () => {
    document.querySelectorAll(".view").forEach((el) => {
      el.classList.remove("active-view");
      el.hidden = true;
    });
    const section = document.querySelector("#view-testing-lab") || document.body;
    section.classList.add("active-view");
    section.hidden = false;
    section.style.display = "block";
    await window.renderTestingLabPage(section);
  });
}

async function main() {
  const playwright = require("playwright");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of ["1-phone-a11y-recovery.png", "2-computer-health-performance.png"]) {
    const stale = path.join(OUT_DIR, name);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
  const storePath = path.join(os.tmpdir(), `llh-p19-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true, testingLab: true } },
  }, null, 2));
  const port = 9010 + Math.floor(Math.random() * 80);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true", ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "", STRIPE_SECRET_KEY: "", DISABLE_OUTBOUND_EMAIL: "true", DISABLE_STRIPE_CHECKOUT: "true", DISABLE_AI_CALLS: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  try {
    await waitForHealth(port);
    const login = await request(port, "POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE } });
    const token = login.json.token;
    await request(port, "POST", "/api/testing-lab/seed", { headers: { Authorization: `Bearer ${token}` }, body: { scenario: "small_center", reset: true } });
    await request(port, "POST", "/api/testing-lab/resilience/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });

    browser = await playwright.chromium.launch({ headless: true });

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    await openLab(phonePage, port, token);
    await phonePage.waitForSelector('[data-feature-marker="phase18-testing-lab-mobile"]', { timeout: 15000 });
    await assertFeatureScreen(phonePage, { marker: "phase18-testing-lab-mobile", label: "Phase 19 phone a11y/recovery" });
    await assertNotHomepageFallback(phonePage, "Phase 19 phone a11y/recovery");
    const leak = await phonePage.locator('input[type="password"]').count();
    if (leak > 0) {
      const visible = await phonePage.evaluate(() => [...document.querySelectorAll('#view-testing-lab input[type="password"]')].some((el) => el.offsetParent !== null));
      if (visible) throw new Error("password visible on phone");
    }
    await phonePage.screenshot({ path: path.join(OUT_DIR, "1-phone-a11y-recovery.png"), fullPage: true });
    await phone.close();

    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const deskPage = await desk.newPage();
    await openLab(deskPage, port, token);
    await deskPage.waitForSelector('[data-feature-marker="phase18-testing-lab"]', { timeout: 15000 });
    await deskPage.click('[data-tl-panel="health"]');
    await deskPage.waitForSelector('[data-feature-marker="phase19-platform-resilience"]', { timeout: 15000 });
    await assertFeatureScreen(deskPage, { marker: "phase19-platform-resilience", label: "Phase 19 computer health" });
    await assertNotHomepageFallback(deskPage, "Phase 19 computer health");
    await deskPage.screenshot({ path: path.join(OUT_DIR, "2-computer-health-performance.png"), fullPage: true });
    await desk.close();

    console.log("Wrote screenshots to", OUT_DIR);
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
