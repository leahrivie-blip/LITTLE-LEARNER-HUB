#!/usr/bin/env node
/**
 * Daily Care storage architecture — client-side offline queue, correction
 * re-sync, and logout cache-clearing, driven through the real browser UI
 * (not direct API calls — see test-daily-care-server-authoritative-sync.js
 * for the server-contract-only checks).
 *
 * Verifies:
 *  1. An entry logged while the network is unreachable is saved locally
 *     immediately (never lost), marked pending, and — once the network
 *     comes back — the very next sync pass flushes it to the server
 *     exactly once (no duplicate from the retry).
 *  2. A correction the owner makes AFTER the entry already synced is
 *     itself pushed to the server, so the staff member's next sync
 *     reflects the corrected value, not the stale original.
 *  3. Logging out clears the in-memory pilot cache so a second tester
 *     logging in on the same page never sees a flash of the first
 *     tester's organization data.
 *
 * Run: node scripts/test-daily-care-offline-queue-and-corrections-sync.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 27300 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-dlc-offline-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "dlcoffline-admin@example.invalid", password: "dlcoffline-pass", code: "dlcoffline-code" };

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
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", { adminToken: adminLogin.json.token, siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true } } });

    const ownerEmail = "dlcoffline.owner@example.invalid";
    const wizard = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Offline Queue Owner", email: ownerEmail, childCount: 1 }, auth);
    const ownerPassword = wizard.json.temporaryPassword;

    // ---- 1. Offline queue: log an entry with the network blocked, then reconnect ----
    let childId = "";
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, ownerEmail, ownerPassword);
      childId = await page.evaluate(async () => (await pilotApi("GET", "/api/pilot/children")).children[0].id);

      // Simulate the network being unreachable for the pilot API specifically.
      await page.route("**/api/pilot/daily-care-entries", (route) => route.abort("internetdisconnected"));

      await page.evaluate(() => setView("child-tools-daily-logs"));
      await page.waitForTimeout(800);
      await page.locator("[data-fast-dlc-open-sheet]").first().click();
      await page.waitForSelector(".fdlc-sheet", { timeout: 5000 });
      await page.click('[data-fast-dlc-show="observation"]');
      await page.waitForSelector('[data-fast-dlc-note-input="observation"]', { timeout: 5000 });
      await page.fill('[data-fast-dlc-note-input="observation"]', "Logged while offline — must not be lost.");
      await page.click('[data-fast-dlc-save-note="observation"]');
      await page.waitForTimeout(700);

      const pendingState = await page.evaluate(() => {
        const items = childStore("Observations");
        const record = items.find((r) => r.text === "Logged while offline — must not be lost.");
        return { savedLocally: Boolean(record), pending: Boolean(record?._pendingSync) };
      });
      assert.equal(pendingState.savedLocally, true, "an entry logged while offline must be saved locally immediately — never lost");
      assert.equal(pendingState.pending, true, "an entry that failed to reach the server must be marked pending, not silently treated as synced");
      pass("1a. Logging an entry while the network is unreachable saves it locally immediately and marks it pending (never lost, never silently dropped)");

      // Reconnect: remove the network block and trigger the sync pass the same way a real reconnect would (reopening Daily Care).
      await page.unroute("**/api/pilot/daily-care-entries");
      await page.evaluate(() => syncPilotDailyCareEntriesIntoLocalStore());
      await page.waitForTimeout(800);
      const afterReconnect = await page.evaluate(() => {
        const items = childStore("Observations");
        const record = items.find((r) => r.text === "Logged while offline — must not be lost.");
        return { pending: Boolean(record?._pendingSync) };
      });
      assert.equal(afterReconnect.pending, false, "once reconnected, the queued entry must be flushed and marked synced");
      await page.close();
    }
    {
      // A second, independent client confirms the server actually received it exactly once (proving the reconnect flush worked, not just a local flag flip).
      const serverEntries = await requestJson("GET", "/api/pilot/daily-care-entries", null, { Authorization: `Bearer ${(await requestJson("POST", "/api/auth/password-login", { email: ownerEmail, password: ownerPassword })).json.memberSessionToken}` });
      const matches = serverEntries.json.entries.filter((e) => e.record.text === "Logged while offline — must not be lost.");
      assert.equal(matches.length, 1, "the reconnect sync must have pushed the queued entry to the server exactly once — no duplicate, and not lost");
      pass("1b. On reconnect, the queued entry reaches the server exactly once (verified independently via a fresh login) — an offline write is never lost and never duplicated");
    }

    // ---- 2. A correction made after syncing is itself pushed to the server ----
    let staffPassword = "";
    const staffEmail = "dlcoffline.staff@example.invalid";
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, ownerEmail, ownerPassword);
      await page.evaluate(() => setView("pilot-staff"));
      await page.waitForTimeout(600);
      await page.fill('[data-pilot-add-staff] input[name="displayName"]', "Offline Queue Staff");
      await page.fill('[data-pilot-add-staff] input[name="email"]', staffEmail);
      await page.click('[data-pilot-add-staff] button[type="submit"]');
      await page.waitForTimeout(700);
      staffPassword = await page.evaluate(() => pilotState.staffWelcome?.password || "");

      await page.evaluate(() => setView("child-tools-daily-logs"));
      await page.waitForTimeout(800);
      await page.locator(`[data-fast-dlc-open-sheet="${childId}"]`).first().click();
      await page.waitForTimeout(300);
      await page.click('[data-fast-dlc-show="timeline"]');
      await page.waitForTimeout(500);
      // Find the just-synced observation and apply a correction to it.
      const recordId = await page.evaluate(() => childStore("Observations").find((r) => r.text === "Logged while offline — must not be lost.")?.id);
      await page.evaluate((id) => applyChildRecordCorrection("Observations", id, { notes: "Corrected: logged while offline, confirmed accurate.", reason: "Added detail after review", notesField: "text" }), recordId);
      await page.waitForTimeout(1200); // allow the fire-and-forget re-sync to complete
      await page.close();
    }
    {
      const staffPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(staffPage, staffEmail, staffPassword);
      await staffPage.evaluate(() => syncPilotDailyCareEntriesIntoLocalStore());
      await staffPage.waitForTimeout(800);
      const staffSeesCorrection = await staffPage.evaluate(() => {
        const record = childStore("Observations").find((r) => r.text?.includes("Corrected: logged while offline"));
        return { found: Boolean(record), hasCorrectionHistory: Array.isArray(record?.corrections) && record.corrections.length > 0 };
      });
      assert.equal(staffSeesCorrection.found, true, "the staff member's next sync must show the CORRECTED text, not the stale original");
      assert.equal(staffSeesCorrection.hasCorrectionHistory, true, "the correction history must travel with the record, not just the corrected value");
      await staffPage.close();
      pass("2. A correction made by the owner after an entry already synced is itself pushed to the server — the staff member's next sync sees the corrected value AND its correction history, never a stale original");
    }

    // ---- 3. Logout clears the in-memory pilot cache ----
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, ownerEmail, ownerPassword);
      await page.evaluate(() => setView("pilot-families"));
      await page.waitForTimeout(1200);
      const beforeLogout = await page.evaluate(() => pilotState.children.length);
      assert.ok(beforeLogout > 0, "sanity check: pilotState should be populated before logout");
      await page.evaluate(() => signOut());
      await page.waitForTimeout(500);
      const afterLogout = await page.evaluate(() => ({
        children: pilotState.children.length,
        guardians: pilotState.guardians.length,
        messages: pilotState.messages.length,
        sandboxActive: externalTesterSandboxState.active,
      }));
      assert.deepEqual(afterLogout, { children: 0, guardians: 0, messages: 0, sandboxActive: false }, "logging out must clear the identity-specific in-memory pilot cache, not just the auth token");
      await page.close();
      pass("3. Logging out clears the in-memory Home Daycare Pilot cache (children/guardians/messages/sandbox state) — a second tester logging in on the same page never sees a flash of the previous tester's organization data");
    }
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nDaily Care offline queue / corrections sync / logout-clearing checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
