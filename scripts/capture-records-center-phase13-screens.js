#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { assertFeatureScreen, assertNotHomepageFallback } = require("./capture-screen-assert.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.RC_PHASE13_SCREENSHOT_DIR || "/opt/cursor/artifacts/records-center-phase13";
const ADMIN_EMAIL = "phase13-screens@example.com";
const ADMIN_PASSWORD = "Phase13ScreenPass!99";
const ADMIN_CODE = "phase13-screen-code";

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
  for (const name of ["1-records-center-overview-desktop.png", "2-family-documents-phone.png"]) {
    const stale = path.join(OUT_DIR, name);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
  const storePath = path.join(os.tmpdir(), `llh-rc-phase13-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true } } }, null, 2));
  const port = 8870 + Math.floor(Math.random() * 80);
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
    await request(port, "POST", "/api/director-center/records/seed", { headers: { Authorization: `Bearer ${token}` }, body: { reset: true } });
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
    await deskPage.goto(`http://127.0.0.1:${port}/#director-center`, { waitUntil: "networkidle" });
    await deskPage.waitForTimeout(800);
    await deskPage.evaluate(() => { if (typeof window.renderDirectorCenterPreviewUI === "function") window.renderDirectorCenterPreviewUI(); });
    await deskPage.waitForTimeout(600);
    const tab = deskPage.locator('[data-dc-tab="records_center"]');
    if (await tab.count()) {
      await tab.click();
    } else {
      await deskPage.evaluate(() => {
        if (typeof window.renderRecordsCenterTab === "function") {
          const mount = document.querySelector("#view-director-center") || document.body;
          mount.innerHTML = '<div id="dc-records-center-mount"></div>';
          window.renderRecordsCenterTab(document.querySelector("#dc-records-center-mount"));
        }
      });
    }
    await assertFeatureScreen(deskPage, { marker: "phase13-records", label: "Phase 13 desktop Records Center" });
    await assertNotHomepageFallback(deskPage, "Phase 13 desktop Records Center");
    await deskPage.screenshot({ path: path.join(OUT_DIR, "1-records-center-overview-desktop.png"), fullPage: true });

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    await phonePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await phonePage.evaluate(({ email, memberToken: mt }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhMemberSessionToken", mt);
      localStorage.setItem("llhAccountType", "parent");
    }, { email: parent.email, memberToken });
    await phonePage.goto(`http://127.0.0.1:${port}/#family-hub`, { waitUntil: "networkidle" });
    await phonePage.waitForTimeout(800);
    await phonePage.evaluate(() => { if (typeof window.renderFamilyHubPage === "function") window.renderFamilyHubPage(); });
    await phonePage.waitForTimeout(1000);
    await phonePage.evaluate(() => {
      const btn = document.querySelector('[data-fh-tab="records"]');
      if (btn) btn.click();
    });
    await assertFeatureScreen(phonePage, { marker: "phase13-records", label: "Phase 13 phone family documents" });
    await assertNotHomepageFallback(phonePage, "Phase 13 phone family documents");
    await phonePage.evaluate(() => {
      const open = document.querySelector("[data-fh-open-record]");
      if (open) open.click();
    });
    await phonePage.waitForTimeout(1000);
    await assertFeatureScreen(phonePage, { marker: "phase13-records", label: "Phase 13 phone requested document" });
    await phonePage.screenshot({ path: path.join(OUT_DIR, "2-family-documents-phone.png"), fullPage: true });
    console.log("Wrote screenshots to", OUT_DIR);
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
