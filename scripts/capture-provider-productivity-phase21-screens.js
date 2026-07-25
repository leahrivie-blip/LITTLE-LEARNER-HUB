#!/usr/bin/env node
"use strict";

/**
 * Phase 21 screenshots (max 2):
 * 1) Phone — child-led / activity workflow
 * 2) Computer — guided setup or universal search
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { assertFeatureScreen, assertNotHomepageFallback } = require("./capture-screen-assert.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.P21_SCREENSHOT_DIR || "/opt/cursor/artifacts/provider-productivity-phase21";
const ADMIN_EMAIL = "phase21-screens@example.com";
const ADMIN_PASSWORD = "Phase21ScreenPass!99";
const ADMIN_CODE = "phase21-screen-code";

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

async function openEasePlanning(page, port, token, panel) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.evaluate((adminToken) => {
    localStorage.setItem("llhAdminToken", adminToken);
    sessionStorage.setItem("llhAdminToken", adminToken);
    localStorage.setItem("llhAdminUnlocked", "true");
    localStorage.setItem("llhAdminSession", JSON.stringify({ token: adminToken, email: "phase21-screens@example.com" }));
  }, token);
  await page.goto(`http://127.0.0.1:${port}/#director-center`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.LLHPlatformPerf?.ensureViewScripts === "function", null, { timeout: 20000 });
  await page.evaluate(async () => {
    await window.LLHPlatformPerf.ensureViewScripts("director-center");
  });
  await page.waitForFunction(() => typeof window.renderDirectorCenterPage === "function" || typeof window.renderProviderProductivityTab === "function", null, { timeout: 25000 });
  await page.evaluate(async (desiredPanel) => {
    document.querySelectorAll(".view").forEach((el) => {
      el.classList.remove("active-view");
      el.hidden = true;
    });
    let section = document.querySelector("#view-director-center");
    if (!section) {
      section = document.createElement("section");
      section.id = "view-director-center";
      document.body.appendChild(section);
    }
    section.classList.add("active-view");
    section.hidden = false;
    section.style.display = "block";
    section.innerHTML = `<div id="dc-provider-productivity-mount"></div>`;
    const mount = section.querySelector("#dc-provider-productivity-mount");
    if (typeof window.renderProviderProductivityTab === "function") {
      await window.renderProviderProductivityTab(mount, { initialPanel: desiredPanel });
    }
  }, panel);
}

async function main() {
  const playwright = require("playwright");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of ["1-phone-child-led-activity.png", "2-computer-setup-or-search.png"]) {
    const stale = path.join(OUT_DIR, name);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
  const storePath = path.join(os.tmpdir(), `llh-p21-screens-${Date.now()}.json`);
  const port = 19620 + Math.floor(Math.random() * 80);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true, testingLab: true } },
    users: {}, adminSessions: {},
  }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE: ADMIN_CODE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_AI_CALLS: "true",
      EMAIL_AUTOMATIONS_ENABLED: "false",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHealth(port);
    const login = await request(port, "POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE } });
    if (login.status !== 200) throw new Error(`login failed ${login.status}`);
    const token = login.json.token;
    await request(port, "POST", "/api/director-center/productivity/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });

    const browser = await playwright.chromium.launch({ headless: true });

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await openEasePlanning(phone, port, token, "child_led");
    await phone.waitForSelector('[data-feature-marker="phase21-child-led-mobile"], [data-pp-panel="child_led"]', { timeout: 20000 });
    await assertFeatureScreen(phone, { marker: "phase21-child-led-mobile", label: "Phase 21 phone child-led", optional: true });
    await assertNotHomepageFallback(phone);
    await phone.screenshot({ path: path.join(OUT_DIR, "1-phone-child-led-activity.png"), fullPage: true });

    const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openEasePlanning(desk, port, token, "setup");
    await desk.waitForSelector('[data-feature-marker="phase21-provider-productivity"], [data-pp-panel="setup"]', { timeout: 20000 });
    const setupVisible = await desk.locator('[data-pp-panel="setup"]').count();
    if (!setupVisible) {
      await desk.evaluate(async () => {
        if (typeof window.renderProviderProductivityTab === "function") {
          const mount = document.querySelector("#dc-provider-productivity-mount") || document.body;
          await window.renderProviderProductivityTab(mount, { initialPanel: "search" });
        }
      });
    }
    await assertFeatureScreen(desk, { marker: "phase21-provider-productivity", label: "Phase 21 computer setup/search" });
    await assertNotHomepageFallback(desk);
    await desk.screenshot({ path: path.join(OUT_DIR, "2-computer-setup-or-search.png"), fullPage: true });

    await browser.close();
    console.log("Wrote screenshots to", OUT_DIR);
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
