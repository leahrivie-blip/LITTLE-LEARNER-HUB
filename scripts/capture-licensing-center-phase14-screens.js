#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { assertFeatureScreen, assertNotHomepageFallback } = require("./capture-screen-assert.js");
const { mountDirectorFeature, openFamilyHubTab } = require("./capture-mount-helpers.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.LC_PHASE14_SCREENSHOT_DIR || "/opt/cursor/artifacts/licensing-center-phase14";
const ADMIN_EMAIL = "phase14-screens@example.com";
const ADMIN_PASSWORD = "Phase14ScreenPass!99";
const ADMIN_CODE = "phase14-screen-code";

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
  for (const name of ["1-licensing-dashboard-desktop.png", "2-family-licensing-tasks-phone.png"]) {
    const stale = path.join(OUT_DIR, name);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
  const storePath = path.join(os.tmpdir(), `llh-lc-phase14-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true } } }, null, 2));
  const port = 8970 + Math.floor(Math.random() * 80);
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
    await request(port, "POST", "/api/director-center/licensing/seed", { headers: { Authorization: `Bearer ${token}` }, body: { reset: true } });
    await request(port, "POST", "/api/family-hub/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: { Authorization: `Bearer ${token}` } });
    const parent = (fakes.json.fakeAccounts || []).find((row) => row.kind === "parent_multi_child");
    const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${parent.id}/issue-password`, { headers: { Authorization: `Bearer ${token}` }, body: {} });
    const password = issued.json.password || issued.json.temporaryPassword;
    const memberLogin = await request(port, "POST", "/api/auth/password-login", { body: { email: parent.email, password } });
    const memberToken = memberLogin.json.memberSessionToken || memberLogin.json.token;

    browser = await playwright.chromium.launch({ headless: true });
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const deskPage = await desktop.newPage();
    await deskPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await deskPage.evaluate((adminToken) => {
      localStorage.setItem("llhAdminToken", adminToken);
      sessionStorage.setItem("llhAdminToken", adminToken);
    }, token);
    await deskPage.goto(`http://127.0.0.1:${port}/#director-center`, { waitUntil: "domcontentloaded" });
    await mountDirectorFeature(deskPage, {
      tab: "licensing_center",
      renderName: "renderLicensingCenterTab",
      mountId: "dc-licensing-center-mount",
      marker: "phase14-licensing",
    });
    await assertFeatureScreen(deskPage, { marker: "phase14-licensing", label: "Phase 14 desktop Licensing Center" });
    await assertNotHomepageFallback(deskPage, "Phase 14 desktop Licensing Center");
    await deskPage.screenshot({ path: path.join(OUT_DIR, "1-licensing-dashboard-desktop.png"), fullPage: true });

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    await phonePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await phonePage.evaluate(({ email, memberToken: mt }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhMemberSessionToken", mt);
      localStorage.setItem("llhAccountType", "parent");
    }, { email: parent.email, memberToken });
    await phonePage.goto(`http://127.0.0.1:${port}/#family-hub`, { waitUntil: "domcontentloaded" });
    await openFamilyHubTab(phonePage, "home");
    await phonePage.waitForTimeout(800);
    const opened = await phonePage.evaluate(() => {
      const cardBtn = document.querySelector('[data-fh-licensing-home-card] [data-fh-tab="licensing"]');
      if (cardBtn) {
        cardBtn.click();
        return "home-card";
      }
      return "";
    });
    if (!opened) {
      await openFamilyHubTab(phonePage, "licensing");
    } else {
      await phonePage.waitForTimeout(1000);
    }
    await assertFeatureScreen(phonePage, { marker: "phase14-family-licensing-tasks", label: "Phase 14 phone family licensing tasks" });
    await assertNotHomepageFallback(phonePage, "Phase 14 phone family licensing tasks");
    const hasComputerRecommended = await phonePage.locator("[data-fh-computer-recommended], .fh-computer-recommended-chip").first().isVisible();
    if (!hasComputerRecommended) {
      throw new Error("Computer Recommended UI missing from real Family Hub licensing screen.");
    }
    await phonePage.screenshot({ path: path.join(OUT_DIR, "2-family-licensing-tasks-phone.png"), fullPage: true });
    console.log("Wrote screenshots to", OUT_DIR);
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
