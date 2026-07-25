#!/usr/bin/env node
/**
 * Fast Daily Logs — Parent share + Home Daycare Provider nav acceptance.
 *
 * Proves the approved redesign is reachable from #pilotProviderNav and that
 * "Share with Parent" / Parent Communication are NOT localStorage-only:
 * they land in the connected Parent Home / Messages via /api/pilot/*.
 *
 * Run: npm run test:fast-daily-logs-parent-share
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
const STORE_PATH = path.join(os.tmpdir(), `llh-fdlc-parent-share-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "fdlc-parent-admin@example.invalid", password: "fdlc-parent-pass", code: "fdlc-parent-code" };
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/fast-daily-logs-parent-share");

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...headers,
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
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
      EMAIL_AUTOMATIONS_ENABLED: "false",
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      RESEND_API_KEY: "",
      TWILIO_AUTH_TOKEN: "",
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
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  if (!chromium) {
    console.log("Playwright unavailable — skipping browser-driven Fast Daily Logs parent-share checks.");
    return;
  }

  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);

    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLogin.status, 200);
    const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
    });

    const testerEmail = "fdlc.parent.share@example.invalid";
    const wizard = await requestJson("POST", "/api/external-tester/create-pilot", {
      testerName: "FDLC Parent Share",
      email: testerEmail,
      childCount: 1,
    }, auth);
    assert.equal(wizard.status, 200, `create-pilot failed: ${JSON.stringify(wizard.json)}`);
    const orgId = wizard.json.organizationId;
    const tempPassword = wizard.json.temporaryPassword;
    assert.ok(orgId && tempPassword);

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e?.message || e)));
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });

    await page.evaluate(() => openAuthModal("login"));
    await page.fill("#emailInput", testerEmail);
    await page.fill("#passwordInput", tempPassword);
    await page.click("#authSubmitButton");
    await page.waitForTimeout(2000);
    assert.equal(await page.evaluate(() => currentUser), testerEmail);
    await page.waitForSelector("#pilotProviderNav", { timeout: 20000 });
    pass("Home Daycare Provider navigation is present after login");

    // Provider nav → Daily Logs (approved redesign)
    const logNav = page.locator('#pilotProviderNav [data-view="child-tools-daily-logs"]');
    assert.equal(await logNav.count(), 1, "Provider bottom/side nav must expose Daily Logs");
    await logNav.click({ force: true });
    await page.waitForTimeout(1500);
    await page.waitForSelector(".fdlc-classroom-grid", { timeout: 15000 });
    assert.ok(await page.locator(".fdlc-classroom-grid").count() > 0);
    assert.ok(await page.locator("[data-fast-dlc-open-sheet]").count() >= 1, "classroom child-card grid must list children");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "1-provider-nav-classroom-grid.png"), fullPage: true });
    pass("Home Daycare Provider nav opens Fast Daily Logs classroom grid (not a mock / classic-only path)");

    // Wait for pilot children to sync into local Profiles if needed.
    await page.waitForFunction(() => (typeof childRecords === "function" ? childRecords().children.length : 0) >= 1, null, { timeout: 15000 });
    const childId = await page.evaluate(() => childRecords().children[0].id);
    const childName = await page.evaluate(() => childRecords().children[0].name || childRecords().children[0].displayName || "");

    await page.locator(`[data-fast-dlc-open-sheet="${childId}"]`).first().click();
    await page.waitForSelector(".fdlc-sheet", { timeout: 8000 });
    await page.click('[data-fast-dlc-show="timeline"]');
    await page.waitForSelector(".fdlc-ai-summary-section", { timeout: 8000 });
    const summaryText = await page.locator(".fdlc-ai-summary-section").textContent();
    assert.match(summaryText, /Create Parent Summary/);
    assert.doesNotMatch(summaryText, /AI Parent Summary/i);
    const parentCommText = await page.locator(".fdlc-parent-comm-section").textContent();
    assert.match(parentCommText, /Parent Communication/);

    const uniqueSummary = `Stabilization parent summary ${Date.now().toString(36)} — sunny outdoor play.`;
    await page.fill(`[data-dlc-summary-input="${childId}"]`, uniqueSummary);
    await page.check(`[data-dlc-summary-share="${childId}"]`);
    await page.click(`[data-dlc-save-summary="${childId}"]`);
    await page.waitForTimeout(1200);

    // Server-authoritative Parent Home must show the shared summary.
    const memberLogin = await requestJson("POST", "/api/auth/password-login", { email: testerEmail, password: tempPassword });
    const memberAuth = { Authorization: `Bearer ${memberLogin.json.memberSessionToken}` };
    const guardianOptions = await requestJson("GET", "/api/external-tester/guardian-options", null, memberAuth);
    const contactId = guardianOptions.json.options[0].contactId;
    await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "parent_guardian", previewContactId: contactId }, memberAuth);
    const parentHome = await requestJson("GET", "/api/pilot/parent-home", null, memberAuth);
    const todays = parentHome.json?.children?.[0]?.todaysUpdate || parentHome.json?.todaysUpdate || null;
    const updateMessage = todays?.message || todays?.title || "";
    // Also accept updates list if parent-home nests differently.
    const updates = await requestJson("GET", `/api/pilot/updates?childId=${childId}`, null, memberAuth);
    const updateHit = (updates.json?.updates || []).some((u) => String(u.message || "").includes(uniqueSummary.slice(0, 40)));
    assert.ok(
      updateHit || String(updateMessage).includes(uniqueSummary.slice(0, 40)),
      `Parent view must see Share-with-Parent summary via /api/pilot (got home=${JSON.stringify(todays)} updates=${JSON.stringify(updates.json)})`,
    );
    pass("Share with Parent bridges into /api/pilot/updates — Parent Home sees the same summary (not localStorage-only)");

    // Switch UI back to provider and send Parent Communication.
    await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "solo_provider" }, memberAuth);
    await page.evaluate(async () => {
      if (typeof refreshExternalTesterSandboxState === "function") await refreshExternalTesterSandboxState();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => setView("child-tools-daily-logs"));
    await page.waitForTimeout(800);
    await page.locator(`[data-fast-dlc-open-sheet="${childId}"]`).first().click();
    await page.waitForSelector(".fdlc-sheet", { timeout: 8000 });
    await page.click('[data-fast-dlc-show="timeline"]');
    await page.waitForSelector(".fdlc-parent-comm-section", { timeout: 8000 });
    const uniqueMsg = `Stabilization parent message ${Date.now().toString(36)} — please bring spare socks.`;
    await page.fill('[data-fast-dlc-note-input="parent-message"]', uniqueMsg);
    await page.click('[data-fast-dlc-save-note="parent-message"]');
    await page.waitForTimeout(1200);

    await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "parent_guardian", previewContactId: contactId }, memberAuth);
    const messages = await requestJson("GET", `/api/pilot/messages?childId=${childId}`, null, memberAuth);
    assert.ok(
      (messages.json?.messages || []).some((m) => String(m.body || "").includes(uniqueMsg.slice(0, 40))),
      `Parent Messages must include Parent Communication text via /api/pilot/messages: ${JSON.stringify(messages.json)}`,
    );
    pass("Parent Communication bridges into /api/pilot/messages — connected Parent inbox sees it");

    // UI Parent Home: apply the same identity update switchSandboxRole uses,
    // reload chrome for the parent role, then confirm Parent Home shows the summary.
    await page.evaluate(async (contactId) => {
      fastDlcOpenChildId = "";
      const data = await externalTesterSandboxApi("POST", "/api/external-tester/switch-role", {
        roleKey: "parent_guardian",
        previewContactId: contactId,
      });
      if (currentUser && typeof updateAccount === "function" && data?.identity) {
        updateAccount(currentUser, {
          role: data.identity.role,
          accountType: data.identity.accountType,
          familyHubGuardian: data.identity.familyHubGuardian,
        });
      }
    }, contactId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => setView("pilot-parent-home"));
    await page.waitForTimeout(1500);
    await page.waitForSelector("#view-pilot-parent-home", { timeout: 15000 });
    await page.waitForFunction(() => {
      const text = document.querySelector("#view-pilot-parent-home")?.textContent || "";
      return /sunny outdoor play|Parent Summary|Stabilization parent summary/i.test(text);
    }, null, { timeout: 20000 });
    const homeText = await page.locator("#view-pilot-parent-home").textContent();
    assert.match(homeText, new RegExp(childName.split(" ")[0] || "Child", "i"));
    assert.match(homeText, /sunny outdoor play|Parent Summary|Stabilization parent summary/i);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "2-parent-home-sees-summary.png"), fullPage: true });
    pass("Parent role UI shows the shared Daily Logs summary on Parent Home");

    const actionable = consoleErrors.filter((msg) => !/favicon|ResizeObserver|net::ERR_/i.test(msg));
    assert.deepEqual(actionable, [], `no console errors: ${JSON.stringify(actionable)}`);
    pass("No console errors during Fast Daily Logs parent-share acceptance");

    void orgId;
    await context.close();
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nFast Daily Logs parent-share acceptance passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
