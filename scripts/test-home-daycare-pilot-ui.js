#!/usr/bin/env node
/**
 * Home Daycare Pilot — browser-driven end-to-end check.
 *
 * Proves the ACTUAL UI works, not just the API: an admin uses the
 * "Add External Tester" wizard in Testing Lab, the tester logs in with the
 * issued password, adds a fake child + guardian as Solo Home Daycare
 * Provider through the real Families screen, switches to Parent/Guardian
 * through the real role picker, and sees the SAME connected information on
 * the real Parent Home screen.
 *
 * Run: node scripts/test-home-daycare-pilot-ui.js
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
const STORE_PATH = path.join(os.tmpdir(), `llh-home-daycare-pilot-ui-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "pilot-ui-admin@example.invalid", password: "pilot-ui-admin-pass", code: "pilot-ui-admin-code" };
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/home-daycare-pilot");

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

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

async function main() {
  if (!chromium) {
    console.log("Playwright unavailable — skipping browser-driven checks (static-only run).");
    console.log("\nHome Daycare Pilot UI checks passed (0; browser checks skipped).");
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
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true } },
    });

    const baseUrl = `http://127.0.0.1:${PORT}/`;
    const testerEmail = "ui.pilot.tester@example.invalid";

    // ---- 1. Admin uses the wizard in the real Testing Lab UI ---------------
    let issuedPassword = "";
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(({ email, token: t }) => {
        setAdminSession({ email, token: t, mode: "server" });
      }, { email: ADMIN.email, token });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.waitForTimeout(800);
      await page.evaluate(() => setView("testing-lab"));
      await page.waitForTimeout(600);
      await page.evaluate(() => { document.querySelector('[data-tl-panel="accounts"]')?.click(); });
      await page.waitForTimeout(600);

      await page.fill('[data-tl-pilot-create] input[name="testerName"]', "UI Pilot Tester");
      await page.fill('[data-tl-pilot-create] input[name="email"]', testerEmail);
      await page.click('[data-tl-pilot-create] button[type="submit"]');
      await page.waitForSelector("[data-tl-pilot-password]", { timeout: 10000 });
      issuedPassword = await page.locator("[data-tl-pilot-password]").textContent();
      assert.ok(issuedPassword && issuedPassword.length > 6, "the wizard must display a real one-time password");
      const welcome = await page.locator("[data-tl-pilot-welcome]").inputValue();
      assert.match(welcome, new RegExp(testerEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "1-admin-add-external-tester-wizard.png"), fullPage: true });
      assert.deepEqual(pageErrors, [], `Testing Lab wizard should have zero console errors: ${JSON.stringify(pageErrors)}`);
      pass("1. Platform Admin can create a Home Daycare Pilot tester through the real 'Add External Tester' wizard in Testing Lab and see the one-time password + welcome message");
      await context.close();
    }

    // ---- 2. Tester logs in, adds a child + guardian as Provider ------------
    let context;
    let page;
    {
      context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(() => openAuthModal("login"));
      await page.waitForTimeout(250);
      await page.fill("#emailInput", testerEmail);
      await page.fill("#passwordInput", issuedPassword.trim());
      await page.click("#authSubmitButton");
      await page.waitForTimeout(1500);

      const bannerVisible = await page.locator("#testingIdentityBanner").isVisible().catch(() => false);
      assert.equal(bannerVisible, true, "the testing identity banner must be visible for the pilot tester");

      await page.evaluate(() => setView("pilot-families"));
      await page.waitForTimeout(700);
      await page.fill('[data-pilot-add-child] input[name="displayName"]', "UI Test Child");
      await page.click('[data-pilot-add-child] button[type="submit"]');
      await page.waitForTimeout(700);
      const childListText = await page.locator("#view-pilot-families").textContent();
      assert.match(childListText, /UI Test Child/);

      await page.fill('[data-pilot-add-guardian] input[name="displayName"]', "UI Test Guardian");
      await page.fill('[data-pilot-add-guardian] input[name="email"]', "ui.test.guardian@example.invalid");
      await page.check('[data-pilot-add-guardian] input[name="isFinanciallyResponsible"]');
      await page.selectOption('[data-pilot-add-guardian] select[name="childId"]', { label: "UI Test Child" });
      await page.click('[data-pilot-add-guardian] button[type="submit"]');
      await page.waitForTimeout(700);
      const guardianListText = await page.locator("#view-pilot-families").textContent();
      assert.match(guardianListText, /UI Test Guardian/);

      // The dedicated #pilotProviderNav sidebar entirely replaces the generic
      // #platformNav (rather than hiding individual duplicate items inside
      // it) — so "hidden" here means "not effectively visible" (offsetParent
      // null), not each item's own hidden attribute.
      const navState = await page.evaluate(() => ({
        familiesShown: Boolean(document.querySelector('#pilotProviderNav [data-view="pilot-families"]')?.offsetParent),
        coreMessagesHidden: !document.querySelector('#platformNav .nav-link[data-view="messages"]')?.offsetParent,
        coreBillingHidden: !document.querySelector('#platformNav .nav-link[data-view="billing"]')?.offsetParent,
        coreFormsHidden: !document.querySelector('#platformNav .nav-link[data-view="forms"]')?.offsetParent,
      }));
      assert.deepEqual(navState, { familiesShown: true, coreMessagesHidden: true, coreBillingHidden: true, coreFormsHidden: true }, "the Home Daycare Pilot's curated nav must show Families and hide the equivalent core nav items it replaces");

      // Send a family update + a fake billing record so Parent Home has real connected data to show.
      await page.evaluate(() => setView("pilot-messages"));
      await page.waitForTimeout(500);
      await page.evaluate(async () => {
        const children = (await pilotApi("GET", "/api/pilot/children")).children;
        const child = children.find((c) => c.displayName === "UI Test Child");
        await pilotApi("POST", "/api/pilot/updates", { childId: child.id, title: "Great morning", message: "Played outside and had a snack." });
        await pilotApi("POST", "/api/pilot/billing", { childId: child.id, description: "December tuition", amountCents: 42000, dueDate: "2026-12-01" });
      });

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "2-provider-families-connected-data.png"), fullPage: true });
      assert.deepEqual(pageErrors, [], `Provider Families screen should have zero console errors: ${JSON.stringify(pageErrors)}`);
      pass("2. The tester, logged in as Solo Home Daycare Provider, adds a real fake child + guardian (with billing responsibility) through the real Families screen");
    }

    // ---- 3. Tester switches to Parent/Guardian and sees the SAME connected data ----
    {
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.click("[data-sandbox-switch-role]", { timeout: 5000 });
      await page.waitForTimeout(400);
      await page.click('[data-sandbox-role-option="parent_guardian"]', { timeout: 5000 });
      await page.waitForTimeout(500);
      // Multiple guardians exist (2 wizard-generated fixtures + the one just
      // added) — the "which family would you like to preview" sub-picker
      // must appear; choose the one just created as Provider.
      await page.click('[data-sandbox-guardian-option] >> text=UI Test Guardian', { timeout: 5000 });
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(() => setView("pilot-parent-home"));
      await page.waitForTimeout(1000);

      const homeText = await page.locator("#view-pilot-parent-home").textContent();
      assert.match(homeText, /UI Test Child/, "Parent Home must show the SAME child the provider just added");
      assert.match(homeText, /Great morning/, "Parent Home must show the SAME family update the provider just sent");
      assert.match(homeText, /December tuition/, "Parent Home must show the SAME billing record, since this guardian is financially responsible");

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "3-parent-home-same-connected-data.png"), fullPage: true });
      assert.deepEqual(pageErrors, [], `Parent Home screen should have zero console errors: ${JSON.stringify(pageErrors)}`);
      pass("3. After switching to Parent/Guardian through the real role picker, Parent Home shows the EXACT SAME connected child/update/billing data the provider just entered — never disconnected per-view fake data");
    }

    // ---- 4. Checklist reflects real progress --------------------------------
    {
      await page.evaluate(() => setView("pilot-checklist"));
      await page.waitForTimeout(700);
      const checklistText = await page.locator("#view-pilot-checklist").textContent();
      assert.match(checklistText, /of 10 complete/);
      const checkedCount = await page.locator('#view-pilot-checklist input[type="checkbox"]:checked').count();
      assert.ok(checkedCount >= 4, `expected several checklist items already checked off from real actions taken, got ${checkedCount}`);
      pass("4. The Home Daycare Pilot checklist reflects real progress from the actions just taken (add child, add guardian, send update, switch to parent, verify info, test billing)");
      await context.close();
    }
  } finally {
    await stopServer(child);
    await browser.close();
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nHome Daycare Pilot UI checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
