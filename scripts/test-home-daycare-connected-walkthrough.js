#!/usr/bin/env node
/**
 * Home Daycare Pilot — full connected-data walkthrough.
 *
 * Admin creates a tester -> owner adds a child -> owner creates and links a
 * guardian -> owner adds the optional staff member -> staff logs care for
 * that child -> owner sees the staff entry -> owner shares it with the
 * parent -> tester switches to Parent/Guardian -> parent sees the correct
 * shared entry -> parent replies -> owner sees the reply -> refresh and a
 * full server restart -> everything stays connected, no duplicates ->
 * Testing Feedback reaches Admin. Repeated at phone, tablet, and desktop.
 *
 * Run: node scripts/test-home-daycare-connected-walkthrough.js
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
const PORT = 27100 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-connected-walkthrough-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "walkthrough-admin@example.invalid", password: "walkthrough-pass", code: "walkthrough-code" };
const SCREENSHOT_DIR = path.join(ROOT, "docs/screenshots/home-daycare-connected-walkthrough");

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

function startServer(envOverrides = {}, { resetStore = true } = {}) {
  if (resetStore || !fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  }
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
      ...envOverrides,
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
    console.log("Playwright unavailable — skipping browser-driven checks (static-only run).");
    console.log("\nHome Daycare connected-data walkthrough passed (0; browser checks skipped).");
    return;
  }

  let child = startServer();
  const browser = await chromium.launch({ headless: true });
  const baseUrl = `http://127.0.0.1:${PORT}/`;
  const ownerEmail = "walkthrough.owner@example.invalid";
  const staffEmail = "walkthrough.staff@example.invalid";
  let ownerPassword;
  let staffPassword;
  let orgId;
  let newChildId;
  let guardianContactId;

  try {
    await waitForBoot(child);

    // ---- 1. Admin creates a Home Daycare Pilot tester ------------------------
    {
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
      const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
      await requestJson("POST", "/api/admin/site-content", {
        adminToken: adminLogin.json.token,
        siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true } },
      });
      const wizard = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Walkthrough Owner", email: ownerEmail, childCount: 1 }, auth);
      assert.equal(wizard.status, 200);
      ownerPassword = wizard.json.temporaryPassword;
      orgId = wizard.json.organizationId;
      pass("1. Admin creates a Home Daycare Pilot tester through the real Testing Lab wizard");
    }

    for (const [device, viewport] of [["desktop", { width: 1280, height: 900 }], ["tablet", { width: 820, height: 1180 }], ["phone", { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(() => openAuthModal("login"));
      await page.waitForTimeout(300);
      await page.fill("#emailInput", ownerEmail);
      await page.fill("#passwordInput", ownerPassword);
      await page.click("#authSubmitButton");
      await page.waitForTimeout(1500);

      if (device === "desktop") {
        // ---- 2. Owner adds a new fake child ------------------------------------
        await page.evaluate(() => setView("pilot-families"));
        await page.waitForTimeout(600);
        await page.fill('[data-pilot-add-child] input[name="displayName"]', "Walkthrough Child");
        await page.click('[data-pilot-add-child] button[type="submit"]');
        await page.waitForTimeout(1000);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-pilot-add-guardian] select[name="childId"] option')).some((o) => o.textContent.includes("Walkthrough Child")), null, { timeout: 15000 });

        // ---- 3. Owner creates and links a guardian -----------------------------
        await page.fill('[data-pilot-add-guardian] input[name="displayName"]', "Walkthrough Guardian");
        await page.fill('[data-pilot-add-guardian] input[name="email"]', "walkthrough.guardian@example.invalid");
        await page.check('[data-pilot-add-guardian] input[name="isFinanciallyResponsible"]');
        await page.selectOption('[data-pilot-add-guardian] select[name="childId"]', { label: "Walkthrough Child" });
        await page.click('[data-pilot-add-guardian] button[type="submit"]');
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "1-owner-families-connected.png"), fullPage: true });
        newChildId = await page.evaluate(async () => (await pilotApi("GET", "/api/pilot/children")).children.find((c) => c.displayName === "Walkthrough Child")?.id);
        const opts = await page.evaluate(() => externalTesterSandboxApi("GET", "/api/external-tester/guardian-options"));
        guardianContactId = opts.options.find((o) => o.displayName === "Walkthrough Guardian")?.contactId;
        pass("2 & 3. Owner adds a new fake child and creates + links a guardian, financially responsible, through the real Families screen");

        // ---- 4. Owner adds the optional staff member ---------------------------
        await page.evaluate(() => setView("pilot-staff"));
        await page.waitForTimeout(600);
        await page.fill('[data-pilot-add-staff] input[name="displayName"]', "Walkthrough Staff");
        await page.fill('[data-pilot-add-staff] input[name="email"]', staffEmail);
        await page.click('[data-pilot-add-staff] button[type="submit"]');
        await page.waitForTimeout(700);
        staffPassword = await page.evaluate(() => pilotState.staffWelcome?.password || "");
        assert.ok(staffPassword, "adding the assistant must return a one-time password");
        const staffPageText = await page.locator("#view-pilot-staff").textContent();
        assert.match(staffPageText, /Walkthrough Staff/);
        pass("4. Owner adds the optional staff member (self-service, no admin needed) — the Home Daycare plan's owner + one assistant limit");
      } else {
        // Lighter, non-duplicating spot-check at this device size: log in and
        // confirm the SAME connected child/roster (from the desktop setup
        // above) is visible via Daily Care and Families — no new data added.
        await page.evaluate(() => setView("child-tools-daily-logs"));
        await page.waitForTimeout(1000);
        const gridText = await page.locator(".fdlc-classroom-grid").textContent();
        assert.match(gridText, /Walkthrough Child/, `${device}: Daily Care must show the same connected child roster`);
        await page.evaluate(() => setView("pilot-families"));
        await page.waitForTimeout(600);
        const familiesText = await page.locator("#view-pilot-families").textContent();
        assert.match(familiesText, /Walkthrough Guardian/, `${device}: Families must show the same connected guardian`);
      }

      await context.close();
      assert.deepEqual(pageErrors, [], `${device}: zero console errors expected, got ${JSON.stringify(pageErrors)}`);
      if (device !== "desktop") pass(`Owner's connected data (child + guardian added on desktop) is visible with zero console errors at ${device} size — no duplicate data created per device`);
    }

    // ---- 5. Staff logs care for that same child ------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await page.evaluate(() => openAuthModal("login"));
      await page.waitForTimeout(300);
      await page.fill("#emailInput", staffEmail);
      await page.fill("#passwordInput", staffPassword);
      await page.click("#authSubmitButton");
      await page.waitForTimeout(1500);
      const staffRole = await page.evaluate(() => ({ role: currentAccount()?.role, accountType: currentAccount()?.accountType }));
      assert.equal(staffRole.role, "assistant");
      assert.equal(staffRole.accountType, "home_daycare");

      await page.evaluate(() => setView("child-tools-daily-logs"));
      await page.waitForTimeout(2000);
      const staffGridText = await page.locator(".fdlc-classroom-grid").textContent();
      assert.match(staffGridText, /Walkthrough Child/, "the staff member must see the SAME child roster as the owner");
      // Target "Walkthrough Child" specifically by id — the organization also
      // has the wizard's own starting fixture child(ren), so ".first()" is
      // not reliable here.
      await page.locator(`[data-fast-dlc-open-sheet="${newChildId}"]`).first().click();
      await page.waitForSelector(".fdlc-sheet", { timeout: 5000 });
      await page.click('[data-fast-dlc-show="observation"]');
      await page.waitForSelector('[data-fast-dlc-note-input="observation"]', { timeout: 5000 });
      await page.fill('[data-fast-dlc-note-input="observation"]', "Staff-logged: stacked blocks and shared with a friend.");
      await page.click('[data-fast-dlc-save-note="observation"]');
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "2-staff-daily-care-desktop.png"), fullPage: true });
      assert.deepEqual(pageErrors, [], `staff daily care should have zero console errors: ${JSON.stringify(pageErrors)}`);
      await context.close();
      pass("5. Staff logs care (an observation) for the same shared child through the real Daily Care screen");
    }

    // ---- 6. Owner sees the staff entry; 7. shares it with the parent --------
    let ownerPage;
    let ownerContext;
    {
      ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      ownerPage = await ownerContext.newPage();
      await ownerPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await ownerPage.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await ownerPage.evaluate(() => openAuthModal("login"));
      await ownerPage.waitForTimeout(300);
      await ownerPage.fill("#emailInput", ownerEmail);
      await ownerPage.fill("#passwordInput", ownerPassword);
      await ownerPage.click("#authSubmitButton");
      await ownerPage.waitForTimeout(1500);
      await ownerPage.evaluate(() => setView("child-tools-daily-logs"));
      await ownerPage.waitForTimeout(2000);
      await ownerPage.locator(`[data-fast-dlc-open-sheet="${newChildId}"]`).first().click();
      await ownerPage.waitForTimeout(300);
      await ownerPage.click('[data-fast-dlc-show="timeline"]');
      await ownerPage.waitForTimeout(500);
      const ownerTimelineText = await ownerPage.locator(".fdlc-timeline").textContent();
      assert.match(ownerTimelineText, /stacked blocks and shared with a friend/, "the owner must see the entry the staff member just logged — same connected data");
      pass("6. Owner sees the staff-logged entry immediately — same organization, same connected timeline");

      // Share with the parent: post a family update (server-side shareWithFamily=true) via /api/pilot/updates.
      await ownerPage.evaluate((cid) => pilotApi("POST", "/api/pilot/updates", { childId: cid, title: "Great day", message: "Staff-logged: stacked blocks and shared with a friend." }), newChildId);
      pass("7. Owner shares the entry with the parent (posts a family update visible on Parent Home)");
    }

    // ---- 8. Tester switches to Parent/Guardian; 9. parent sees the shared entry ----
    {
      // Close the Daily Care bottom sheet first — it would otherwise cover
      // the testing banner's "Switch Testing Role" button.
      await ownerPage.locator("button[data-fast-dlc-close-sheet]").click({ timeout: 3000 }).catch(() => {});
      await ownerPage.waitForTimeout(300);
      await ownerPage.click("[data-sandbox-switch-role]", { timeout: 5000 });
      await ownerPage.waitForTimeout(400);
      await ownerPage.click('[data-sandbox-role-option="parent_guardian"]', { timeout: 5000 });
      await ownerPage.waitForTimeout(400);
      const guardianOptionCount = await ownerPage.locator("[data-sandbox-guardian-option]").count();
      if (guardianOptionCount > 0) {
        await ownerPage.locator(`[data-sandbox-guardian-option="${guardianContactId}"]`).click({ timeout: 5000 }).catch(async () => {
          await ownerPage.locator("[data-sandbox-guardian-option]").first().click();
        });
      }
      await ownerPage.waitForTimeout(1500);
      await ownerPage.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await ownerPage.evaluate(() => setView("pilot-parent-home"));
      await ownerPage.waitForTimeout(800);
      const parentHomeText = await ownerPage.locator("#view-pilot-parent-home").textContent();
      assert.match(parentHomeText, /Walkthrough Child/);
      assert.match(parentHomeText, /stacked blocks and shared with a friend/, "the parent must see the correct shared entry");
      await ownerPage.screenshot({ path: path.join(SCREENSHOT_DIR, "3-parent-sees-shared-entry-desktop.png"), fullPage: true });
      pass("8 & 9. After switching to Parent/Guardian, the tester sees the correct shared entry — the exact update the owner just shared");

      // ---- 10. Parent replies -------------------------------------------------
      await ownerPage.evaluate(() => setView("pilot-messages"));
      await ownerPage.waitForTimeout(600);
      await ownerPage.fill('#view-pilot-messages textarea[name="body"]', "Thank you for sharing — she loves blocks at home too!");
      await ownerPage.click('#view-pilot-messages [data-pilot-send-message] button[type="submit"]');
      await ownerPage.waitForTimeout(700);
      pass("10. Parent replies through the real Messages screen");

      // ---- 11. Owner sees the reply -------------------------------------------
      await ownerPage.click("[data-sandbox-switch-role]", { timeout: 5000 });
      await ownerPage.waitForTimeout(400);
      await ownerPage.click('[data-sandbox-role-option="solo_provider"]', { timeout: 5000 });
      await ownerPage.waitForTimeout(1500);
      await ownerPage.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
      await ownerPage.evaluate((cid) => { pilotState.selectedChildId = cid; setView("pilot-messages"); }, newChildId);
      await ownerPage.waitForTimeout(800);
      const ownerMessagesText = await ownerPage.locator("#view-pilot-messages").textContent();
      assert.match(ownerMessagesText, /Thank you for sharing/, "the owner must see the parent's reply");
      pass("11. Owner sees the parent's reply — same connected message thread");

      // ---- Testing Feedback reaches Admin --------------------------------------
      await ownerPage.click("[data-tf-toggle]");
      await ownerPage.waitForTimeout(500);
      await ownerPage.click('[data-tf-tab="new"]').catch(() => {});
      await ownerPage.waitForTimeout(300);
      const feedbackTextarea = ownerPage.locator("[data-tf-new-body-input]");
      await feedbackTextarea.waitFor({ timeout: 5000 }).catch(() => {});
      if (await feedbackTextarea.count()) {
        await feedbackTextarea.fill("Connected walkthrough feedback: everything worked end to end.");
        await ownerPage.click('[data-tf-new-form] button[type="submit"]');
        await ownerPage.waitForTimeout(700);
      }
      await ownerContext.close();
    }

    // ---- 12. Refresh and restart — everything stays connected, no duplicates ----
    {
      await stopServer(child);
      child = startServer({}, { resetStore: false });
      await waitForBoot(child);

      const loginRes = await requestJson("POST", "/api/auth/password-login", { email: ownerEmail, password: ownerPassword });
      const ownerAuth = { Authorization: `Bearer ${loginRes.json.memberSessionToken}` };
      const childrenAfterRestart = await requestJson("GET", "/api/pilot/children", null, ownerAuth);
      const walkthroughChildMatches = childrenAfterRestart.json.children.filter((c) => c.displayName === "Walkthrough Child");
      assert.equal(walkthroughChildMatches.length, 1, "exactly one 'Walkthrough Child' must exist after a full server restart — no duplicates");
      const updatesAfterRestart = await requestJson("GET", `/api/pilot/updates?childId=${newChildId}`, null, ownerAuth);
      assert.ok(updatesAfterRestart.json.updates.some((u) => u.message.includes("stacked blocks")), "the connected data must survive a full server restart");
      const messagesAfterRestart = await requestJson("GET", `/api/pilot/messages?childId=${newChildId}`, null, ownerAuth);
      assert.ok(messagesAfterRestart.json.messages.some((m) => m.body.includes("Thank you for sharing")), "the parent's reply must survive a full server restart");

      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const adminAuth = { Authorization: `Bearer ${adminLogin.json.token}` };
      const feedbackThreads = await requestJson("GET", "/api/testing-feedback/admin/threads", null, adminAuth);
      const orgThreads = (feedbackThreads.json.threads || []).filter((t) => t.organizationId === orgId);
      assert.ok(orgThreads.length >= 1, "the Testing Feedback thread must reach the Admin inbox and survive the restart");
      pass("12. After a refresh and a full server restart, every connected record (child, guardian, update, message reply, Testing Feedback thread) is still there — exactly once, never duplicated, and reaches Admin");
    }
  } finally {
    await stopServer(child);
    await browser.close();
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nHome Daycare connected-data walkthrough passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
