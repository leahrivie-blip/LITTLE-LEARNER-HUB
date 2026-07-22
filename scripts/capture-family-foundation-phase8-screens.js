#!/usr/bin/env node
"use strict";

/**
 * Credit-saving Phase 8 visual review:
 * 1) One desktop screenshot of household/guardian management
 * 2) One phone screenshot of fake guardian placeholder
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.FF_PHASE8_SCREENSHOT_DIR || "/opt/cursor/artifacts/family-foundation-phase8";
const ADMIN_EMAIL = "phase8-screens@example.com";
const ADMIN_PASSWORD = "Phase8ScreenPass!99";
const ADMIN_CODE = "phase8-screen-code";

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
  const storePath = path.join(os.tmpdir(), `llh-ff-phase8-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: false } } }, null, 2));

  const port = 8860 + Math.floor(Math.random() * 100);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true", ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE: ADMIN_CODE,
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

    // Seed family foundation and issue a guardian password for mobile screenshot
    await request(port, "POST", "/api/director-center/family/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: { Authorization: `Bearer ${token}` } });
    const parent = (fakes.json.fakeAccounts || []).find((row) => row.kind === "parent_multi_child");
    const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${parent.id}/issue-password`, {
      headers: { Authorization: `Bearer ${token}` }, body: {},
    });
    if (issued.status !== 200) throw new Error(`issue password failed: ${issued.status}`);
    const guardianLogin = await request(port, "POST", "/api/auth/password-login", {
      body: { email: parent.email, password: issued.json.temporaryPassword },
    });
    if (guardianLogin.status !== 200) throw new Error(`guardian login failed: ${guardianLogin.status}`);

    browser = await playwright.chromium.launch({ headless: true });

    // Desktop: household/guardian management
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await desktop.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await desktop.evaluate(({ email, adminToken }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({ [email]: { email, plan: "Pro", subscriptionStatus: "Pro Active", stripeSubscriptionStatus: "active", monthlyPrice: "$19.99/month" } }));
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAdminSession", JSON.stringify({ token: adminToken, email, name: "Phase 8 Screens", mode: "server" }));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Admin");
      localStorage.setItem("llhAdminRememberEmail", email);
    }, { email: ADMIN_EMAIL, adminToken: token });
    await desktop.reload({ waitUntil: "domcontentloaded" });
    await desktop.waitForFunction(() => typeof setView === "function" && typeof hasAdminFullAccess === "function" && hasAdminFullAccess(), null, { timeout: 45000 });
    await desktop.evaluate(async () => {
      if (typeof loadExpansionFeatureFlagsFromBackend === "function") await loadExpansionFeatureFlagsFromBackend();
      setView("director-center");
    });
    await desktop.waitForSelector("#view-director-center .dc-shell", { timeout: 30000 });
    await desktop.evaluate(() => document.querySelector('[data-dc-tab="families"]')?.click());
    await desktop.waitForSelector("[data-ff-shell]", { timeout: 20000 });
    await desktop.waitForTimeout(600);
    // Open first household for detail
    await desktop.evaluate(() => document.querySelector("[data-ff-open-hh]")?.click());
    await desktop.waitForSelector(".ff-detail", { timeout: 15000 });
    await desktop.waitForTimeout(500);
    await desktop.screenshot({ path: path.join(OUT_DIR, "1-household-guardian-management-desktop.png"), fullPage: true });

    // Phone: guardian placeholder
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await phone.evaluate(({ email, memberToken }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({ [email]: { email, plan: "Free", testingAccount: true } }));
      localStorage.setItem("llhMemberSessionToken", memberToken);
      localStorage.setItem("llhPlan", "Free");
    }, { email: parent.email, memberToken: guardianLogin.json.memberSessionToken });
    await phone.reload({ waitUntil: "domcontentloaded" });
    await phone.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
    await phone.evaluate(() => setView("guardian-session", { skipExpansionFeatureRedirect: true, skipAccessRedirect: true }));
    await phone.waitForSelector(".ff-guardian-placeholder", { timeout: 20000 });
    await phone.waitForTimeout(500);
    await phone.screenshot({ path: path.join(OUT_DIR, "2-guardian-placeholder-mobile.png"), fullPage: true });

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
