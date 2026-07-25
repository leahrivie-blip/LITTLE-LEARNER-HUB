#!/usr/bin/env node
/**
 * Captures the 3 screenshots requested for the External Tester Sandbox
 * confirmation:
 *  1. Platform Admin assigning allowed roles to a sandbox account.
 *  2. The tester's "Switch Testing Role" picker (approved roles only).
 *  3. The tester viewing the Parent/Guardian experience, testing banner
 *     showing "CURRENTLY VIEWING AS: PARENT/GUARDIAN".
 *
 * Also asserts zero page errors and the exact required banner wording at
 * each step — this is a demonstration + smoke check together, not merely a
 * screenshot tool.
 *
 * Run: node scripts/capture-external-tester-sandbox-screens.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  chromium = null;
}

const ROOT = path.join(__dirname, "..");
const PORT = 25900 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-ets-screens-${crypto.randomBytes(4).toString("hex")}.json`);
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/external-tester-sandbox");
const ADMIN = { email: "ets-screens-admin@example.invalid", password: "ets-screens-pass", code: "ets-screens-code" };

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
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
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

async function main() {
  if (!chromium) {
    console.log("Playwright unavailable — skipping screenshot capture.");
    return;
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const adminLoginRes = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = adminLoginRes.json.token;
    const auth = { Authorization: `Bearer ${token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
    await requestJson("POST", "/api/admin/site-content", { adminToken: token, siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true, familyHub: true, directorCenter: true } } });

    // The Phase 8 primary org (via /api/director-center/family/seed) is the
    // one fake organization that already has REAL guardian contacts linked
    // to real fake children — donor data the sandbox's Parent/Guardian role
    // needs for a meaningful Family Hub view. Testing Lab's own scenario
    // packs (home_daycare/small_center/etc.) are staff-only previews with no
    // guardian contacts, so they can't demonstrate this role realistically.
    const seedFamily = await requestJson("POST", "/api/director-center/family/seed", {}, auth);
    const ORG = seedFamily.json.organizationId;
    if (!ORG) throw new Error(`Could not seed the Phase 8 family org: ${JSON.stringify(seedFamily.json)}`);
    const create = await requestJson("POST", "/api/external-tester/create", {
      organizationId: ORG,
      email: "sandbox.screenshot@example.invalid",
      displayName: "External Tester (Demo)",
      allowedRoleKeys: ["director", "lead_teacher", "assistant", "parent_guardian"],
    }, auth);
    const issue = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: create.json.account.id }, auth);

    const baseUrl = `http://127.0.0.1:${PORT}/`;

    // ---- Screenshot 1: Platform Admin assigning allowed roles -------------
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(({ email, token: t }) => {
        setAdminSession({ email, token: t, mode: "server" });
        localStorage.setItem("llhAdminLastView", "admin");
      }, { email: ADMIN.email, token });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(800);
      await page.evaluate(() => setView("testing-lab"));
      await page.waitForSelector('[data-tl-panel="accounts"]', { timeout: 15000 });
      await page.click('[data-tl-panel="accounts"]', { timeout: 5000 });
      await page.waitForFunction(() => document.querySelectorAll("[data-sandbox-edit-roles]").length > 0, null, { timeout: 15000 });
      await page.waitForTimeout(500);
      // Scroll the sandbox manager section into view for a clean screenshot.
      await page.evaluate(() => document.querySelector("[data-tl-sandbox-manager]")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
      assert.deepEqual(pageErrors, [], `Admin assigning roles screen should have zero page errors: ${JSON.stringify(pageErrors)}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "1-admin-assigns-allowed-roles.png") });
      await page.close();
      console.log("Saved screenshot 1/3: Platform Admin assigning allowed roles");
    }

    // ---- Screenshot 2: tester switching roles ------------------------------
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(() => openAuthModal("login"));
      await page.waitForTimeout(250);
      await page.fill("#emailInput", "sandbox.screenshot@example.invalid");
      await page.fill("#passwordInput", issue.json.temporaryPassword);
      await page.click("#authSubmitButton");
      await page.waitForTimeout(1500);
      const bannerText = await page.locator("#testingIdentityBannerText").textContent();
      assert.match(bannerText || "", /LITTLE LEARNER HUB TESTING — FAKE DATA ONLY/);
      await page.click("[data-sandbox-switch-role]", { timeout: 5000 });
      await page.waitForTimeout(500);
      assert.deepEqual(pageErrors, [], `Tester switching roles screen should have zero page errors: ${JSON.stringify(pageErrors)}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "2-tester-switching-roles.png") });
      await page.close();
      console.log("Saved screenshot 2/3: tester switching roles");
    }

    // ---- Screenshot 3: tester viewing the Parent/Guardian experience ------
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(() => openAuthModal("login"));
      await page.waitForTimeout(250);
      await page.fill("#emailInput", "sandbox.screenshot@example.invalid");
      await page.fill("#passwordInput", issue.json.temporaryPassword);
      await page.click("#authSubmitButton");
      await page.waitForTimeout(1500);
      await page.click("[data-sandbox-switch-role]", { timeout: 5000 });
      await page.waitForTimeout(400);
      await page.click('[data-sandbox-role-option="parent_guardian"]', { timeout: 5000 });
      await page.waitForTimeout(1500); // location.reload()
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(2500);
      const roleText = await page.locator("#testingIdentityRoleText").textContent();
      assert.match(roleText || "", /CURRENTLY VIEWING AS: PARENT\/GUARDIAN/);
      const debugInfo = await page.evaluate(() => ({
        view: document.querySelector(".active-view")?.id,
        familyHubGuardian: (typeof currentAccount === "function") ? currentAccount()?.familyHubGuardian : null,
        canAccessFamilyHub: (typeof expansionViewerAccessCache !== "undefined") ? expansionViewerAccessCache.canAccessFamilyHub : null,
        familyHubFlag: (typeof expansionFeatureFlags === "function") ? expansionFeatureFlags()?.familyHub : null,
        allowPolicy: (typeof expansionFeaturePolicyCache !== "undefined") ? expansionFeaturePolicyCache.allowFamilyHubTestingPreview : null,
      }));
      console.log("debug family-hub routing state:", JSON.stringify(debugInfo));
      const view = debugInfo.view;
      assert.equal(view, "view-family-hub", `Parent/Guardian role must land in Family Hub, got ${view}`);
      assert.deepEqual(pageErrors, [], `Parent/Guardian experience screen should have zero page errors: ${JSON.stringify(pageErrors)}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "3-tester-parent-guardian-view.png") });
      await page.close();
      console.log("Saved screenshot 3/3: tester viewing the Parent/Guardian experience (banner confirmed: " + roleText.trim() + ")");
    }
  } finally {
    await stopServer(child);
    await browser.close();
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
  console.log("\nAll 3 External Tester Sandbox screenshots captured successfully.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
