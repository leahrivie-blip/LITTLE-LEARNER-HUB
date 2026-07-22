#!/usr/bin/env node
"use strict";

/**
 * Credit-saving Phase 9 visual review:
 * 1) Phone — Family Hub Home with child switching + Action Needed
 * 2) Computer — Family Hub Forms or Child view
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.FH_PHASE9_SCREENSHOT_DIR || "/opt/cursor/artifacts/family-hub-phase9";
const ADMIN_EMAIL = "phase9-screens@example.com";
const ADMIN_PASSWORD = "Phase9ScreenPass!99";
const ADMIN_CODE = "phase9-screen-code";

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
  const storePath = path.join(os.tmpdir(), `llh-fh-phase9-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true } },
  }, null, 2));

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
    if (login.status !== 200) throw new Error(`admin login failed: ${login.status}`);
    const token = login.json.token;
    await request(port, "POST", "/api/director-center/family/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    await request(port, "POST", "/api/family-hub/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: { Authorization: `Bearer ${token}` } });
    const parent = (fakes.json.fakeAccounts || []).find((row) => row.kind === "parent_multi_child");
    const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${parent.id}/issue-password`, {
      headers: { Authorization: `Bearer ${token}` }, body: {},
    });
    const guardianLogin = await request(port, "POST", "/api/auth/password-login", {
      body: { email: parent.email, password: issued.json.temporaryPassword },
    });
    if (guardianLogin.status !== 200) throw new Error(`guardian login failed: ${guardianLogin.status}`);

    browser = await playwright.chromium.launch({ headless: true });

    async function openFamilyHub(page, viewport) {
      await page.setViewportSize(viewport);
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(({ email, memberToken }) => {
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhAccounts", JSON.stringify({ [email]: { email, plan: "Free", testingAccount: true } }));
        localStorage.setItem("llhMemberSessionToken", memberToken);
        localStorage.setItem("llhPlan", "Free");
      }, { email: parent.email, memberToken: guardianLogin.json.memberSessionToken });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
      await page.evaluate(async () => {
        if (typeof loadExpansionFeatureFlagsFromBackend === "function") await loadExpansionFeatureFlagsFromBackend();
        setView("family-hub", { skipExpansionFeatureRedirect: true, skipAccessRedirect: true });
      });
      await page.waitForSelector(".fh-shell", { timeout: 30000 });
      await page.waitForTimeout(700);
    }

    // Phone Home
    const phone = await browser.newPage({ isMobile: true, hasTouch: true });
    await openFamilyHub(phone, { width: 390, height: 844 });
    await phone.waitForSelector(".fh-welcome", { timeout: 15000 });
    await phone.waitForSelector("[data-fh-child-switch], .fh-section", { timeout: 15000 });
    await phone.screenshot({ path: path.join(OUT_DIR, "1-family-hub-home-phone.png"), fullPage: true });

    // Desktop Forms
    const desktop = await browser.newPage();
    await openFamilyHub(desktop, { width: 1440, height: 1100 });
    await desktop.evaluate(() => document.querySelector('[data-fh-tab="forms"]')?.click());
    await desktop.waitForTimeout(800);
    await desktop.waitForSelector(".fh-panel h1", { timeout: 15000 });
    // Prefer opening a form if present; otherwise open Children detail
    const opened = await desktop.evaluate(async () => {
      const formBtn = document.querySelector("[data-fh-open-form]");
      if (formBtn) { formBtn.click(); return "form"; }
      document.querySelector('[data-fh-tab="children"]')?.click();
      return "children";
    });
    await desktop.waitForTimeout(900);
    if (opened === "children") {
      await desktop.evaluate(() => document.querySelector("[data-fh-open-child]")?.click());
      await desktop.waitForSelector(".fh-child-hero, .fh-panel h1", { timeout: 15000 });
    }
    await desktop.screenshot({ path: path.join(OUT_DIR, "2-family-hub-forms-or-child-desktop.png"), fullPage: true });

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
