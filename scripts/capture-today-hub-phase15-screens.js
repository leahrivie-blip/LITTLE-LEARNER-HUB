#!/usr/bin/env node
"use strict";

/**
 * Phase 15 screenshots (max 2):
 * 1) Phone — teacher Today Hub
 * 2) Computer — director Today Hub
 * Fails if feature marker missing or marketing homepage loads.
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { assertFeatureScreen, assertNotHomepageFallback } = require("./capture-screen-assert.js");
const { mountDirectorFeature } = require("./capture-mount-helpers.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.TH_PHASE15_SCREENSHOT_DIR || "/opt/cursor/artifacts/today-hub-phase15";
const ADMIN_EMAIL = "phase15-screens@example.com";
const ADMIN_PASSWORD = "Phase15ScreenPass!99";
const ADMIN_CODE = "phase15-screen-code";

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

async function main() {
  const playwright = require("playwright");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of ["1-today-hub-teacher-phone.png", "2-today-hub-director-desktop.png"]) {
    const stale = path.join(OUT_DIR, name);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
  const storePath = path.join(os.tmpdir(), `llh-th-phase15-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true } } }, null, 2));
  const port = 8980 + Math.floor(Math.random() * 80);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true", ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
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
    await request(port, "POST", "/api/director-center/family/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    await request(port, "POST", "/api/director-center/today/seed", { headers: { Authorization: `Bearer ${token}` }, body: { reset: true } });
    await request(port, "POST", "/api/family-hub/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });

    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const teacher = Object.values(store.staffMemberships || {}).find((m) => /lead_teacher|teacher/i.test(m.role || "") && !/director|owner/i.test(m.role || ""));
    if (!teacher) throw new Error("Missing teacher membership for phone capture");

    browser = await playwright.chromium.launch({ headless: true });

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    await phonePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await phonePage.evaluate(({ adminToken, membershipId }) => {
      localStorage.setItem("llhAdminToken", adminToken);
      sessionStorage.setItem("llhAdminToken", adminToken);
      sessionStorage.setItem("llhRolePreviewMembershipId", membershipId);
    }, { adminToken: token, membershipId: teacher.id });
    await phonePage.goto(`http://127.0.0.1:${port}/#director-center`, { waitUntil: "domcontentloaded" });
    await mountDirectorFeature(phonePage, {
      tab: "today_hub",
      renderName: "renderTodayHubTab",
      mountId: "dc-today-hub-mount",
      marker: "phase15-today-hub",
    });
    await assertFeatureScreen(phonePage, { marker: "phase15-today-hub", label: "Phase 15 phone teacher Today Hub" });
    await assertNotHomepageFallback(phonePage, "Phase 15 phone teacher Today Hub");
    await phonePage.screenshot({ path: path.join(OUT_DIR, "1-today-hub-teacher-phone.png"), fullPage: true });
    await phone.close();

    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const deskPage = await desktop.newPage();
    await deskPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await deskPage.evaluate((adminToken) => {
      localStorage.setItem("llhAdminToken", adminToken);
      sessionStorage.setItem("llhAdminToken", adminToken);
      sessionStorage.removeItem("llhRolePreviewMembershipId");
    }, token);
    await deskPage.goto(`http://127.0.0.1:${port}/#director-center`, { waitUntil: "domcontentloaded" });
    await mountDirectorFeature(deskPage, {
      tab: "today_hub",
      renderName: "renderTodayHubTab",
      mountId: "dc-today-hub-mount",
      marker: "phase15-today-hub",
    });
    await assertFeatureScreen(deskPage, { marker: "phase15-today-hub", label: "Phase 15 desktop director Today Hub" });
    await assertNotHomepageFallback(deskPage, "Phase 15 desktop director Today Hub");
    const hasClassroom = await deskPage.locator("[data-th-classroom]").count();
    const hasTasks = await deskPage.locator("[data-th-task], .th-section").count();
    if (!hasClassroom && !hasTasks) {
      throw new Error("Director Today Hub missing classroom/task summary markers");
    }
    await deskPage.screenshot({ path: path.join(OUT_DIR, "2-today-hub-director-desktop.png"), fullPage: true });
    await desktop.close();

    console.log(`Phase 15 screenshots written to ${OUT_DIR}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
