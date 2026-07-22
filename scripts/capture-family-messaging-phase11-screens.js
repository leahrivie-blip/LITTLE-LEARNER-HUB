#!/usr/bin/env node
"use strict";

/**
 * Credit-saving Phase 11 screenshots:
 * 1) Phone — Family Hub Messages inbox
 * 2) Computer — Provider Family Messaging inbox
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.FM_PHASE11_SCREENSHOT_DIR || "/opt/cursor/artifacts/family-messaging-phase11";
const ADMIN_EMAIL = "phase11-screens@example.com";
const ADMIN_PASSWORD = "Phase11ScreenPass!99";
const ADMIN_CODE = "phase11-screen-code";

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
  let playwright;
  try { playwright = require("playwright"); } catch (error) { console.error("playwright required:", error.message); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-fm-phase11-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true } },
  }, null, 2));

  const port = 8850 + Math.floor(Math.random() * 80);
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
    await request(port, "POST", "/api/director-center/family-messaging/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    await request(port, "POST", "/api/family-hub/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: { Authorization: `Bearer ${token}` } });
    const parent = (fakes.json.fakeAccounts || []).find((row) => row.kind === "parent_multi_child");
    const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${parent.id}/issue-password`, {
      headers: { Authorization: `Bearer ${token}` }, body: {},
    });
    const password = issued.json.password || issued.json.temporaryPassword;
    const memberLogin = await request(port, "POST", "/api/auth/password-login", { body: { email: parent.email, password } });
    const memberToken = memberLogin.json.memberSessionToken || memberLogin.json.token;

    browser = await playwright.chromium.launch({ headless: true });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    await phonePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await phonePage.evaluate(({ email, memberToken: mt }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhMemberSessionToken", mt);
      localStorage.setItem("llhAccountType", "parent");
    }, { email: parent.email, memberToken });
    await phonePage.goto(`http://127.0.0.1:${port}/#family-hub`, { waitUntil: "networkidle" });
    await phonePage.waitForTimeout(1200);
    await phonePage.evaluate(() => { if (typeof window.renderFamilyHubPage === "function") window.renderFamilyHubPage(); });
    await phonePage.waitForTimeout(1500);
    await phonePage.evaluate(() => {
      const btn = document.querySelector('[data-fh-tab="messages"]');
      if (btn) btn.click();
    });
    await phonePage.waitForTimeout(2000);
    await phonePage.screenshot({ path: path.join(OUT_DIR, "1-family-hub-messages-phone.png"), fullPage: true });

    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const deskPage = await desktop.newPage();
    await deskPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await deskPage.evaluate((adminToken) => {
      localStorage.setItem("llhAdminToken", adminToken);
      sessionStorage.setItem("llhAdminToken", adminToken);
    }, token);
    await deskPage.goto(`http://127.0.0.1:${port}/#director-center`, { waitUntil: "networkidle" });
    await deskPage.waitForTimeout(1200);
    await deskPage.evaluate(() => { if (typeof window.renderDirectorCenterPreviewUI === "function") window.renderDirectorCenterPreviewUI(); });
    await deskPage.waitForTimeout(1000);
    const tab = deskPage.locator('[data-dc-tab="family_messaging"]');
    if (await tab.count()) {
      await tab.click();
      await deskPage.waitForTimeout(2000);
    }
    await deskPage.screenshot({ path: path.join(OUT_DIR, "2-provider-messaging-inbox-desktop.png"), fullPage: true });
    console.log(JSON.stringify({ ok: true, outDir: OUT_DIR }, null, 2));
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
