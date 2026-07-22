#!/usr/bin/env node
"use strict";

/**
 * Capture desktop + mobile screenshots of every Director Center Phase 2 page.
 * Uses fake preview data only. No emails / Stripe.
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.DC_SCREENSHOT_DIR
  || "/opt/cursor/artifacts/director-center-phase2";
const ADMIN_EMAIL = "phase2-screens@example.com";
const ADMIN_PASSWORD = "Phase2ScreenPass!99";
const ADMIN_CODE = "phase2-screen-code";

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
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          let json = {};
          try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
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
  const storePath = path.join(os.tmpdir(), `llh-dc-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: false, familyHub: false } },
  }, null, 2));

  const port = 4700 + Math.floor(Math.random() * 200);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
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
    await request(port, "POST", "/api/director-center/seed", {
      headers: { Authorization: `Bearer ${token}` },
      body: { scenario: "small_center" },
    });

    browser = await playwright.chromium.launch({ headless: true });
    const viewports = [
      { name: "desktop", width: 1440, height: 1100 },
      { name: "mobile", width: 390, height: 844 },
    ];

    const tabs = [
      ["overview", "overview"],
      ["classrooms", "classrooms"],
      ["staff", "staff"],
      ["children", "children"],
      ["program_profile", "program-profile"],
      ["roles_permissions", "roles-permissions"],
    ];

    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
      await page.evaluate(({ email, token: adminToken }) => {
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
          name: "Phase 2 Screens",
          mode: "server",
        }));
        localStorage.setItem("llhAdminUnlocked", "true");
        localStorage.setItem("llhAdminPreviewMode", "Admin");
        localStorage.setItem("llhAdminRememberEmail", email);
      }, { email: ADMIN_EMAIL, token });

      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/foundation/feature-flags") && r.status() === 200, { timeout: 45000 }).catch(() => null),
        page.reload({ waitUntil: "domcontentloaded" }),
      ]);
      await page.waitForFunction(() => typeof setView === "function" && typeof hasAdminFullAccess === "function" && hasAdminFullAccess(), null, { timeout: 45000 });
      await page.evaluate(async () => {
        if (typeof loadExpansionFeatureFlagsFromBackend === "function") {
          await loadExpansionFeatureFlagsFromBackend();
        }
      });

      await page.evaluate(() => setView("director-center"));
      await page.waitForSelector("#view-director-center .dc-shell", { timeout: 20000 });
      await page.waitForSelector(".dc-subnav", { timeout: 20000 });
      // Ensure overview data loaded
      await page.waitForFunction(() => {
        const el = document.querySelector("#view-director-center .dc-metric-grid, #view-director-center .dc-panel");
        return Boolean(el);
      }, null, { timeout: 20000 });

      for (const [tabId, fileSlug] of tabs) {
        await page.evaluate((id) => {
          const btn = document.querySelector(`[data-dc-tab="${id}"]`);
          if (btn) btn.click();
        }, tabId);
        await page.waitForTimeout(700);
        await page.waitForSelector("#view-director-center .dc-panel, #view-director-center .dc-form", { timeout: 15000 });
        const filePath = path.join(OUT_DIR, `${fileSlug}-${viewport.name}.png`);
        await page.locator("#view-director-center").screenshot({ path: filePath, fullPage: true });
        console.log(filePath);
      }

      // Classroom detail page
      await page.evaluate(() => {
        const btn = document.querySelector('[data-dc-tab="classrooms"]');
        if (btn) btn.click();
      });
      await page.waitForTimeout(600);
      const opened = await page.evaluate(() => {
        const openBtn = document.querySelector("[data-dc-open-classroom]");
        if (!openBtn) return false;
        openBtn.click();
        return true;
      });
      if (opened) {
        await page.waitForTimeout(800);
        await page.waitForSelector("#view-director-center .dc-detail-header, #view-director-center h3", { timeout: 15000 });
        const detailPath = path.join(OUT_DIR, `classroom-detail-${viewport.name}.png`);
        await page.locator("#view-director-center").screenshot({ path: detailPath, fullPage: true });
        console.log(detailPath);
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
