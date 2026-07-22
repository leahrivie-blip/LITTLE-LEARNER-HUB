#!/usr/bin/env node
"use strict";

/**
 * Phase 20 screenshots (max 2):
 * 1) Computer — Release Readiness Center
 * 2) Phone — status summary
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { assertFeatureScreen, assertNotHomepageFallback } = require("./capture-screen-assert.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.P20_SCREENSHOT_DIR || "/opt/cursor/artifacts/security-migration-phase20";
const ADMIN_EMAIL = "phase20-screens@example.com";
const ADMIN_PASSWORD = "Phase20ScreenPass!99";
const ADMIN_CODE = "phase20-screen-code";

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
  for (const name of ["1-computer-release-readiness.png", "2-phone-status-summary.png"]) {
    const stale = path.join(OUT_DIR, name);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
  const storePath = path.join(os.tmpdir(), `llh-p20-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true, testingLab: true } },
  }, null, 2));
  const port = 9050 + Math.floor(Math.random() * 80);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, SITE_URL: "http://127.0.0.1",
      LLH_GIT_BRANCH: "cursor/director-family-foundation-bc66", LLH_GIT_SHA: "phase20screens",
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

    browser = await playwright.chromium.launch({ headless: true });

    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const deskPage = await desk.newPage();
    await openLab(deskPage, port, token);
    await deskPage.click('[data-tl-panel="release"]');
    await deskPage.waitForSelector('[data-feature-marker="phase20-release-readiness"]', { timeout: 15000 });
    await assertFeatureScreen(deskPage, { marker: "phase20-release-readiness", label: "Phase 20 computer release readiness" });
    await assertNotHomepageFallback(deskPage, "Phase 20 computer release readiness");
    await deskPage.screenshot({ path: path.join(OUT_DIR, "1-computer-release-readiness.png"), fullPage: true });
    await desk.close();

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    await openLab(phonePage, port, token);
    await phonePage.waitForSelector('[data-phase20-marker="phase20-release-readiness-mobile"]', { timeout: 15000 });
    await assertFeatureScreen(phonePage, { marker: "phase18-testing-lab-mobile", label: "Phase 20 phone status summary" });
    await assertNotHomepageFallback(phonePage, "Phase 20 phone status summary");
    await phonePage.screenshot({ path: path.join(OUT_DIR, "2-phone-status-summary.png"), fullPage: true });
    await phone.close();

    console.log("Wrote screenshots to", OUT_DIR);
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
