#!/usr/bin/env node
"use strict";

/**
 * Capture desktop + mobile screenshots of the Teacher Classroom Phase 3 preview.
 * Uses fake preview data only. No emails / Stripe / AI.
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.DC_PHASE3_SCREENSHOT_DIR
  || "/opt/cursor/artifacts/director-center-phase3";
const ADMIN_EMAIL = "phase3-screens@example.com";
const ADMIN_PASSWORD = "Phase3ScreenPass!99";
const ADMIN_CODE = "phase3-screen-code";
const PHASE3 = "/api/director-center/phase3";

function request(port, method, pathname, { headers = {}, body = null, query = "" } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname + query,
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
      }
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
  const storePath = path.join(os.tmpdir(), `llh-dc-phase3-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: false, familyHub: false } },
  }, null, 2));

  const port = 5700 + Math.floor(Math.random() * 200);
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
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "",
      SENDGRID_API_KEY: "",
      DISABLE_EMAIL_SENDS: "true",
      DISABLE_STRIPE: "true",
      DISABLE_AI: "true",
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
    await request(port, "POST", `${PHASE3}/seed`, {
      headers: { Authorization: `Bearer ${token}` },
      body: { scenario: "small_center" },
    });
    const roleOptions = await request(port, "GET", `${PHASE3}/role-preview-options`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const assistant = (roleOptions.json.memberships || []).find((member) => (
      member.role === "assistant_staff" && member.status === "active" && member.assignedClassrooms.length
    ));

    browser = await playwright.chromium.launch({ headless: true });
    const viewports = [
      { name: "desktop", width: 1440, height: 1100 },
      { name: "mobile", width: 390, height: 844 },
    ];
    const tabs = [
      ["home", "home"],
      ["calendar", "calendar"],
      ["children", "children"],
      ["daily-logs", "logs"],
      ["goals", "goals"],
    ];

    for (const viewport of viewports) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
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
          name: "Phase 3 Screens",
          mode: "server",
        }));
        localStorage.setItem("llhAdminUnlocked", "true");
        localStorage.setItem("llhAdminPreviewMode", "Admin");
        localStorage.setItem("llhAdminRememberEmail", email);
        localStorage.removeItem("llhPhase3RolePreviewMembershipId");
      }, { email: ADMIN_EMAIL, adminToken: token });

      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/api/foundation/feature-flags") && res.status() === 200, { timeout: 45000 }).catch(() => null),
        page.reload({ waitUntil: "domcontentloaded" }),
      ]);
      await page.waitForFunction(() => typeof setView === "function" && typeof hasAdminFullAccess === "function" && hasAdminFullAccess(), null, { timeout: 45000 });
      await page.evaluate(async () => {
        if (typeof loadExpansionFeatureFlagsFromBackend === "function") {
          await loadExpansionFeatureFlagsFromBackend();
        }
      });
      await page.evaluate(() => setView("teacher-center"));
      await page.waitForSelector("#view-teacher-center .tc-shell", { timeout: 20000 });
      await page.waitForSelector("#view-teacher-center .tc-week-grid", { timeout: 20000 });

      for (const [tabId, fileSlug] of tabs) {
        await page.evaluate((id) => {
          const btn = document.querySelector(`[data-tc-tab="${id}"]`);
          if (btn) btn.click();
        }, tabId);
        await page.waitForTimeout(800);
        await page.waitForSelector("#view-teacher-center .tc-panel", { timeout: 15000 });
        const filePath = path.join(OUT_DIR, `${fileSlug}-${viewport.name}.png`);
        await page.locator("#view-teacher-center").screenshot({ path: filePath, fullPage: true });
        console.log(filePath);
      }

      if (assistant) {
        await page.evaluate((membershipId) => {
          localStorage.setItem("llhPhase3RolePreviewMembershipId", membershipId);
          if (typeof setView === "function") setView("teacher-center");
        }, assistant.membershipId);
        await page.waitForTimeout(1000);
        await page.waitForSelector("#view-teacher-center .tc-role-status", { timeout: 15000 });
        const assistantPath = path.join(OUT_DIR, `role-preview-assistant-${viewport.name}.png`);
        await page.locator("#view-teacher-center").screenshot({ path: assistantPath, fullPage: true });
        console.log(assistantPath);
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
