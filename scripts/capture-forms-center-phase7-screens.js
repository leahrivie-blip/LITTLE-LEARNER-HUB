#!/usr/bin/env node
"use strict";

/**
 * Credit-saving Phase 7 visual review:
 * 1) One desktop screenshot of generated suggestions + review
 * 2) One phone screenshot of the simplified review experience
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.FC_PHASE7_SCREENSHOT_DIR || "/opt/cursor/artifacts/forms-center-phase7";
const ADMIN_EMAIL = "phase7-screens@example.com";
const ADMIN_PASSWORD = "Phase7ScreenPass!99";
const ADMIN_CODE = "phase7-screen-code";

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

async function openAiReview(page, port, token) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(({ email, adminToken }) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({ [email]: { email, plan: "Pro", subscriptionStatus: "Pro Active", stripeSubscriptionStatus: "active", monthlyPrice: "$19.99/month" } }));
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAdminSession", JSON.stringify({ token: adminToken, email, name: "Phase 7 Screens", mode: "server" }));
    localStorage.setItem("llhAdminUnlocked", "true");
    localStorage.setItem("llhAdminPreviewMode", "Admin");
    localStorage.setItem("llhAdminRememberEmail", email);
  }, { email: ADMIN_EMAIL, adminToken: token });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function" && typeof hasAdminFullAccess === "function" && hasAdminFullAccess(), null, { timeout: 45000 });
  await page.evaluate(async () => {
    if (typeof loadExpansionFeatureFlagsFromBackend === "function") await loadExpansionFeatureFlagsFromBackend();
    setView("forms-center");
  });
  await page.waitForSelector("#view-forms-center .fc-shell", { timeout: 30000 });
  await page.evaluate(() => document.querySelector('[data-fc-tab="ai-builder"]')?.click());
  await page.waitForSelector("#fc-ai-builder-mount .afb-card", { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.fill("#afb-prompt", "I need an emergency contact form for parents, including authorized pickup and a parent signature.");
  await page.selectOption("select[data-afb-field=\"category\"]", "emergency_contacts");
  await page.click("[data-afb-generate]");
  await page.waitForSelector("#fc-ai-builder-mount .afb-review", { timeout: 20000 });
  await page.waitForTimeout(700);
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); } catch (error) { console.error("playwright required:", error.message); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-fc-phase7-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: false } } }, null, 2));

  const port = 8850 + Math.floor(Math.random() * 100);
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

    browser = await playwright.chromium.launch({ headless: true });

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await openAiReview(desktop, port, token);
    await desktop.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, "1-ai-builder-review-desktop.png"), fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await openAiReview(mobile, port, token);
    await mobile.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, "2-ai-builder-review-mobile.png"), fullPage: true });

    console.log(`Screenshots written to ${OUT_DIR}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
