#!/usr/bin/env node
"use strict";

/**
 * Capture desktop + mobile screenshots of the Phase 5 Built-In Form Library preview.
 * Uses fake preview data only. No emails / Stripe / AI / responses.
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.FC_PHASE5_SCREENSHOT_DIR || "/opt/cursor/artifacts/forms-center-phase5";
const ADMIN_EMAIL = "phase5-library-screens@example.com";
const ADMIN_PASSWORD = "Phase5ScreenPass!99";
const ADMIN_CODE = "phase5-screen-code";

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
  const storePath = path.join(os.tmpdir(), `llh-fc-phase5-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: false } },
  }, null, 2));

  const port = 7200 + Math.floor(Math.random() * 200);
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
    // Warm the built-in library catalog + org preview scenario before opening the UI.
    const home = await request(port, "GET", "/api/forms-center/library/home", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (home.status !== 200) throw new Error(`library home warm-up failed: ${home.status}`);

    browser = await playwright.chromium.launch({ headless: true });
    const viewports = [
      { name: "desktop", width: 1440, height: 1100 },
      { name: "mobile", width: 390, height: 844 },
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
          name: "Phase 5 Library Screens",
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

      // Forms Home (renamed nav)
      await page.waitForTimeout(700);
      await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `home-${viewport.name}.png`), fullPage: true });

      // Built-In Library browse
      await page.evaluate(() => document.querySelector('[data-fc-tab="library"]')?.click());
      await page.waitForSelector("#view-forms-center .fcl-hero", { timeout: 20000 });
      await page.waitForTimeout(900);
      await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `library-browse-${viewport.name}.png`), fullPage: true });

      // Built-In Library search/filter results
      await page.evaluate(() => {
        const input = document.querySelector('[data-fcl-filter="q"]');
        if (input) { input.value = "permission"; input.dispatchEvent(new Event("input", { bubbles: true })); }
        document.querySelector("[data-fcl-search]")?.click();
      });
      await page.waitForTimeout(900);
      await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `library-search-${viewport.name}.png`), fullPage: true });

      // Template preview
      const firstTemplateId = await page.evaluate(() => document.querySelector("[data-fcl-preview]")?.getAttribute("data-fcl-preview") || "");
      if (firstTemplateId) {
        await page.evaluate((id) => document.querySelector(`[data-fcl-preview="${id}"]`)?.click(), firstTemplateId);
        await page.waitForSelector("#view-forms-center .fcl-preview-shell", { timeout: 20000 });
        await page.waitForTimeout(700);
        await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `library-preview-${viewport.name}.png`), fullPage: true });

        // Use This Template confirmation modal
        await page.evaluate((id) => document.querySelector(`[data-fcl-use="${id}"]`)?.click(), firstTemplateId);
        await page.waitForSelector(".fcl-modal", { timeout: 10000 });
        await page.waitForTimeout(400);
        await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `library-use-template-confirm-${viewport.name}.png`), fullPage: true });
        await page.evaluate(() => document.querySelector("[data-fcl-cancel-use]")?.click());
      }

      // My Forms (shows built-in source badge on any seeded org copies)
      await page.evaluate(() => document.querySelector('[data-fc-tab="forms"]')?.click());
      await page.waitForSelector("#view-forms-center .fc-form-card", { timeout: 20000 });
      await page.waitForTimeout(700);
      await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `my-forms-with-built-in-badge-${viewport.name}.png`), fullPage: true });

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
