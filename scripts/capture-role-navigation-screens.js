#!/usr/bin/env node
/**
 * Screenshot capture for the role-navigation / testing-account handoff:
 * Home Daycare owner (desktop + mobile) and Parent/Guardian (desktop +
 * mobile), using the generalized /api/pilot/* connected data (works for
 * any Testing Lab fake account, not only External Tester Sandbox).
 *
 * Run: node scripts/capture-role-navigation-screens.js
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 26700 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-role-nav-screens-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "role-nav-shots-admin@example.invalid", password: "role-nav-shots-pass", code: "role-nav-shots-code" };
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/role-navigation");

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function loginViaUi(page, email, password) {
  await page.evaluate(() => openAuthModal("login"));
  await page.waitForTimeout(300);
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", password);
  await page.click("#authSubmitButton");
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = adminLogin.json.token;
    const auth = { Authorization: `Bearer ${token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
    });

    const wizard = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Home Daycare Owner", email: "screenshot.owner@example.invalid", childCount: 3 }, auth);
    const ownerEmail = "screenshot.owner@example.invalid";
    const ownerPassword = wizard.json.temporaryPassword;
    const orgId = wizard.json.organizationId;

    // Seed a bit of connected data so the screenshots aren't empty.
    const children = wizard.json.children;
    const ownerLoginRes = await requestJson("POST", "/api/auth/password-login", { email: ownerEmail, password: ownerPassword });
    const ownerAuth = { Authorization: `Bearer ${ownerLoginRes.json.memberSessionToken}` };
    await requestJson("POST", "/api/pilot/updates", { childId: children[0].id, title: "Great morning", message: "Painted, sang songs, had a healthy lunch." }, ownerAuth);
    await requestJson("POST", "/api/pilot/billing", { childId: children[0].id, description: "October tuition", amountCents: 45000, dueDate: "2026-10-01" }, ownerAuth);
    await requestJson("POST", "/api/pilot/forms", { childId: children[0].id, title: "Field trip permission slip" }, ownerAuth);

    const guardianOptions = await requestJson("GET", "/api/external-tester/guardian-options", null, ownerAuth);
    const contactId = guardianOptions.json.options[0].contactId;

    const baseUrl = `http://127.0.0.1:${PORT}/`;

    // ---- Home Daycare owner: desktop ----
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await loginViaUi(page, ownerEmail, ownerPassword);
      await page.evaluate(() => setView("child-tools-daily-logs"));
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "1-home-daycare-owner-desktop.png"), fullPage: true });
      await page.evaluate(() => setView("pilot-families"));
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "2-home-daycare-families-desktop.png"), fullPage: true });
      await context.close();
    }

    // ---- Home Daycare owner: mobile ----
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await loginViaUi(page, ownerEmail, ownerPassword);
      await page.evaluate(() => setView("child-tools-daily-logs"));
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "3-home-daycare-owner-mobile.png"), fullPage: true });
      await context.close();
    }

    // ---- Parent/Guardian: desktop + mobile (via the connected pilot-parent-home view) ----
    for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await loginViaUi(page, ownerEmail, ownerPassword);
      await page.click("[data-sandbox-switch-role]", { timeout: 5000 });
      await page.waitForTimeout(400);
      await page.click(`[data-sandbox-role-option="parent_guardian"]`, { timeout: 5000 });
      await page.waitForTimeout(300);
      const guardianPicker = await page.locator("[data-sandbox-guardian-option]").count();
      if (guardianPicker > 1) {
        await page.locator(`[data-sandbox-guardian-option="${contactId}"]`).click({ timeout: 5000 }).catch(async () => {
          await page.locator("[data-sandbox-guardian-option]").first().click();
        });
      }
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(800);
      await page.evaluate(() => setView("pilot-parent-home"));
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `4-parent-${label}.png`), fullPage: true });
      await context.close();
    }

    console.log("Screenshots captured in", SCREENSHOT_DIR);
    void orgId;
  } finally {
    await stopServer(child);
    await browser.close();
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
