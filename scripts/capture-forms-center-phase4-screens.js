#!/usr/bin/env node
"use strict";

/**
 * Capture desktop + mobile screenshots of Forms Center Phase 4 preview.
 * Uses fake preview data only. No emails / Stripe / AI / responses.
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.FC_PHASE4_SCREENSHOT_DIR || "/opt/cursor/artifacts/forms-center-phase4";
const ADMIN_EMAIL = "phase4-forms-screens@example.com";
const ADMIN_PASSWORD = "Phase4ScreenPass!99";
const ADMIN_CODE = "phase4-screen-code";

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let json = {};
          try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
          resolve({ status: res.statusCode, json, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port) {
  for (let i = 0; i < 90; i += 1) {
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("health timeout");
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (error) {
    console.error("playwright required:", error.message);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-fc-phase4-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: false } },
  }, null, 2));

  const port = 6900 + Math.floor(Math.random() * 200);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "",
      SENDGRID_API_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForHealth(port);
    const login = await request(port, "POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    if (login.status !== 200) throw new Error(`admin login failed: ${login.status}`);
    const token = login.json.token;
    const seed = await request(port, "POST", "/api/forms-center/seed", {
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
    if (seed.status !== 200) throw new Error(`forms seed failed: ${seed.status}`);

    browser = await playwright.chromium.launch({ headless: true });
    const viewports = [
      { name: "desktop", width: 1440, height: 1100 },
      { name: "mobile", width: 390, height: 844 },
    ];
    const tabs = [
      ["home", "home"],
      ["forms", "my-forms"],
      ["templates", "templates"],
      ["archived", "archived"],
      ["builder", "builder"],
      ["preview", "preview"],
    ];

    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(({ email, adminToken }) => {
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhAccounts", JSON.stringify({
          [email]: {
            email,
            plan: "Pro",
            subscriptionStatus: "Pro Active",
            stripeSubscriptionStatus: "active",
            monthlyPrice: "$19.99/month",
          },
        }));
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhAdminSession", JSON.stringify({
          token: adminToken,
          email,
          name: "Phase 4 Forms Screens",
          mode: "server",
        }));
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
      await page.waitForSelector("#view-forms-center .fc-form-card", { timeout: 30000 });

      const firstFormId = await page.evaluate(() => document.querySelector("[data-fc-open]")?.getAttribute("data-fc-open") || "");
      for (const [tabId, fileSlug] of tabs) {
        if (tabId === "builder" && firstFormId) {
          await page.evaluate((id) => document.querySelector(`[data-fc-open="${id}"]`)?.click(), firstFormId);
        } else if (tabId === "preview" && firstFormId) {
          await page.evaluate((id) => document.querySelector(`[data-fc-preview="${id}"]`)?.click(), firstFormId);
        } else {
          await page.evaluate((id) => document.querySelector(`[data-fc-tab="${id}"]`)?.click(), tabId);
        }
        await page.waitForTimeout(900);
        await page.waitForSelector("#view-forms-center .fc-panel", { timeout: 15000 });
        const filePath = path.join(OUT_DIR, `${fileSlug}-${viewport.name}.png`);
        await page.locator("#view-forms-center").screenshot({ path: filePath, fullPage: true });
        console.log(filePath);
      }
      await page.close();
    }

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
