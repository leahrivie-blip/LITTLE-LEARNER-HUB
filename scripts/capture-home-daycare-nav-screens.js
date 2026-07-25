#!/usr/bin/env node
/**
 * Captures screenshots of the new Home Daycare Pilot navigation for the
 * handoff: owner sidebar (desktop), owner phone bottom nav + "More" sheet,
 * staff sidebar (desktop), parent phone bottom nav.
 *
 * Run: node scripts/capture-home-daycare-nav-screens.js
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 27800 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-nav-screens-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "navshots-admin@example.invalid", password: "navshots-pass", code: "navshots-code" };
const OUT_DIR = path.join(ROOT, "docs/screenshots/home-daycare-navigation");

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
    env: { ...process.env, PORT: String(PORT), SITE_URL: `http://127.0.0.1:${PORT}`, ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, ADMIN_ACCESS_CODE: ADMIN.code, DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: STORE_PATH, NODE_ENV: "test", ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try { const res = await requestJson("GET", "/api/health"); if (res.status === 200) return; } catch { /* retry */ }
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

async function loginAs(page, email, password) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(() => openAuthModal("login"));
  await page.waitForTimeout(300);
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", password);
  await page.click("#authSubmitButton");
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", { adminToken: adminLogin.json.token, siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true } } });

    const ownerEmail = "navshots.owner@example.invalid";
    const staffEmail = "navshots.staff@example.invalid";
    const wizard = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Nav Shots Owner", email: ownerEmail, childCount: 2 }, auth);
    const ownerPassword = wizard.json.temporaryPassword;

    // 1. Owner desktop sidebar (Primary/Planning/More).
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, ownerEmail, ownerPassword);
      await page.screenshot({ path: path.join(OUT_DIR, "1-owner-sidebar-desktop.png") });
      await page.close();
    }

    // 2. Owner phone: bottom nav + "More" sheet open.
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await loginAs(page, ownerEmail, ownerPassword);
      await page.click("[data-pilot-open-more]");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, "2-owner-phone-bottom-nav-more-sheet.png") });
      await page.close();
    }

    // 3. Owner adds a staff member; capture the staff member's own read-only
    //    profile view AND her desktop sidebar (Families/Billing/Staff/full
    //    Program Settings absent).
    let staffPassword = "";
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, ownerEmail, ownerPassword);
      await page.evaluate(() => setView("pilot-staff"));
      await page.waitForTimeout(600);
      await page.fill('[data-pilot-add-staff] input[name="displayName"]', "Nav Shots Staff");
      await page.fill('[data-pilot-add-staff] input[name="email"]', staffEmail);
      await page.click('[data-pilot-add-staff] button[type="submit"]');
      await page.waitForTimeout(700);
      staffPassword = await page.evaluate(() => pilotState.staffWelcome?.password || "");
      await page.close();
    }
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, staffEmail, staffPassword);
      await page.screenshot({ path: path.join(OUT_DIR, "3-staff-sidebar-desktop.png") });
      await page.close();
    }

    // Link a guardian so the role switch to Parent/Guardian has someone to preview as.
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, ownerEmail, ownerPassword);
      await page.evaluate(() => setView("pilot-families"));
      await page.waitForTimeout(600);
      await page.fill('[data-pilot-add-guardian] input[name="displayName"]', "Nav Shots Guardian");
      await page.fill('[data-pilot-add-guardian] input[name="email"]', "navshots.guardian@example.invalid");
      await page.check('[data-pilot-add-guardian] input[name="isFinanciallyResponsible"]');
      await page.click('[data-pilot-add-guardian] button[type="submit"]');
      await page.waitForTimeout(700);
      await page.click("[data-sandbox-switch-role]");
      await page.waitForTimeout(400);
      await page.click('[data-sandbox-role-option="parent_guardian"]');
      await page.waitForTimeout(400);
      if (await page.locator("[data-sandbox-guardian-option]").count()) {
        await page.locator("[data-sandbox-guardian-option]").first().click();
      }
      await page.waitForTimeout(1200);
      await page.close();
    }

    // 4. Parent phone: bottom nav (Home/My Child/Messages/Forms/More).
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await loginAs(page, ownerEmail, ownerPassword);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT_DIR, "4-parent-phone-bottom-nav.png") });
      await page.close();
    }

    console.log("Captured navigation screenshots to", OUT_DIR);
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
