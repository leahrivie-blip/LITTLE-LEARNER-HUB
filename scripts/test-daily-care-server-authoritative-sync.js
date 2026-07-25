#!/usr/bin/env node
/**
 * Daily Care storage architecture — server/Neon-backed authoritative sync
 * for a connected Home Daycare Pilot account (owner + her one optional
 * staff member).
 *
 * Verifies, against the REAL server API (no client browser needed for most
 * of this — these are properties of the server contract itself):
 *
 *  1. Each entry has a permanent unique id (idempotency key) that is never
 *     regenerated on retry.
 *  2. Retrying the exact same POST (same id) never creates a duplicate —
 *     the server upserts.
 *  3. A correction (re-POST of the same id with different content)
 *     updates the mirrored copy rather than adding a second entry, and the
 *     corrections/original-value history on the record itself survives
 *     the round trip untouched.
 *  4. One organization can never read (or overwrite) another
 *     organization's Daily Care entries, even by guessing/reusing another
 *     org's record id.
 *  5. Restart/redeploy (a full server restart against the same store
 *     file) retains every entry exactly once.
 *
 * Run: node scripts/test-daily-care-server-authoritative-sync.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 27200 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-dlc-server-sync-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "dlcsync-admin@example.invalid", password: "dlcsync-pass", code: "dlcsync-code" };

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

function startServer({ resetStore = true } = {}) {
  if (resetStore || !fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  }
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

async function main() {
  let child = startServer();
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const adminAuth = { Authorization: `Bearer ${adminLogin.json.token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", { adminToken: adminLogin.json.token, siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true } } });

    const orgAEmail = "dlcsync.orgA@example.invalid";
    const orgBEmail = "dlcsync.orgB@example.invalid";
    const wizardA = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Org A Owner", email: orgAEmail, childCount: 1 }, adminAuth);
    const wizardB = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Org B Owner", email: orgBEmail, childCount: 1 }, adminAuth);
    const loginA = await requestJson("POST", "/api/auth/password-login", { email: orgAEmail, password: wizardA.json.temporaryPassword });
    const loginB = await requestJson("POST", "/api/auth/password-login", { email: orgBEmail, password: wizardB.json.temporaryPassword });
    const authA = { Authorization: `Bearer ${loginA.json.memberSessionToken}` };
    const authB = { Authorization: `Bearer ${loginB.json.memberSessionToken}` };
    const childrenA = (await requestJson("GET", "/api/pilot/children", null, authA)).json.children;
    const childIdA = childrenA[0].id;

    // ---- 1 & 2. Permanent unique id; retrying the same POST never duplicates ----
    const recordId = `Observations-${crypto.randomUUID()}`;
    const originalRecord = { id: recordId, childId: childIdA, date: "2026-07-25", time: "09:00", text: "Original observation text.", title: "Observation | 2026-07-25" };
    const firstPost = await requestJson("POST", "/api/pilot/daily-care-entries", { childId: childIdA, storeKey: "Observations", record: originalRecord }, authA);
    assert.equal(firstPost.status, 200);
    const retryPost = await requestJson("POST", "/api/pilot/daily-care-entries", { childId: childIdA, storeKey: "Observations", record: originalRecord }, authA);
    assert.equal(retryPost.status, 200);
    const afterRetry = await requestJson("GET", "/api/pilot/daily-care-entries", null, authA);
    const matchingEntries = afterRetry.json.entries.filter((e) => e.record.id === recordId);
    assert.equal(matchingEntries.length, 1, "retrying the identical POST (same permanent id) must never create a second entry");
    pass("1 & 2. Each entry has a permanent unique id, and retrying the exact same POST (e.g. after a dropped response) never creates a duplicate — the server upserts by id");

    // ---- 2b. Simulated offline-queue retry storm (5x rapid retries) never duplicates ----
    const stormId = `Meals-${crypto.randomUUID()}`;
    const stormRecord = { id: stormId, childId: childIdA, date: "2026-07-25", time: "12:00", lunch: "Ate all", title: "Meals | 2026-07-25" };
    await Promise.all(Array.from({ length: 5 }, () => requestJson("POST", "/api/pilot/daily-care-entries", { childId: childIdA, storeKey: "Meals", record: stormRecord }, authA)));
    const afterStorm = await requestJson("GET", "/api/pilot/daily-care-entries", null, authA);
    assert.equal(afterStorm.json.entries.filter((e) => e.record.id === stormId).length, 1, "5 concurrent retries of the same idempotency key must still resolve to exactly one entry");
    pass("2b. A burst of concurrent retries for the same idempotency key (simulating an unreliable connection retrying a queued write) still resolves to exactly one entry, never five");

    // ---- 3. A correction (re-POST of the same id with different content + history) updates in place ----
    const correctedRecord = {
      ...originalRecord,
      text: "Corrected observation text.",
      originalText: originalRecord.text,
      corrections: [{ correctedAt: new Date().toISOString(), correctedBy: orgAEmail, reason: "Typo fix", changes: { text: { from: originalRecord.text, to: "Corrected observation text." } } }],
    };
    const correctionPost = await requestJson("POST", "/api/pilot/daily-care-entries", { childId: childIdA, storeKey: "Observations", record: correctedRecord }, authA);
    assert.equal(correctionPost.status, 200);
    const afterCorrection = await requestJson("GET", "/api/pilot/daily-care-entries", null, authA);
    const correctedEntries = afterCorrection.json.entries.filter((e) => e.record.id === recordId);
    assert.equal(correctedEntries.length, 1, "a correction must update the SAME entry, never add a second one");
    assert.equal(correctedEntries[0].record.text, "Corrected observation text.");
    assert.equal(correctedEntries[0].record.corrections.length, 1);
    assert.equal(correctedEntries[0].record.originalText, "Original observation text.", "the original value must survive the correction round-trip");
    pass("3. A correction re-syncs as an update to the SAME server entry (never a duplicate), and the correction history / original value survive the round trip");

    // ---- 4. Cross-organization isolation: reads and writes ----
    const orgBRead = await requestJson("GET", "/api/pilot/daily-care-entries", null, authB);
    assert.equal(orgBRead.json.entries.filter((e) => e.record.id === recordId).length, 0, "Org B must never see Org A's Daily Care entries");
    pass("4a. One organization can never READ another organization's Daily Care entries");

    // Org B attempts to write using Org A's exact child id (guessed/reused) — must be scoped to Org B's own organizationId regardless, and never visible to/overwritable by Org A.
    const crossWriteAttempt = await requestJson("POST", "/api/pilot/daily-care-entries", { childId: childIdA, storeKey: "Observations", record: { id: recordId, childId: childIdA, text: "Malicious overwrite attempt from Org B" } }, authB);
    assert.equal(crossWriteAttempt.status, 200); // the write itself succeeds (it's just scoped to Org B's own organizationId — childId isn't independently validated against the caller's org here, since Daily Care entries are keyed by organizationId+storeKey+id)
    const orgAAfterCrossWrite = await requestJson("GET", "/api/pilot/daily-care-entries", null, authA);
    const orgAEntryStillIntact = orgAAfterCrossWrite.json.entries.find((e) => e.record.id === recordId);
    assert.equal(orgAEntryStillIntact.record.text, "Corrected observation text.", "Org A's own entry must be completely unaffected by another organization's write using the same record id");
    pass("4b. Org A's entry is completely unaffected by Org B writing a same-id record — entries are namespaced by organizationId+storeKey+id, so two organizations can never collide or overwrite each other's data even via a guessed/reused id");

    // ---- 5. Restart/redeploy retains records ----
    await stopServer(child);
    child = startServer({ resetStore: false });
    await waitForBoot(child);
    const loginAAfterRestart = await requestJson("POST", "/api/auth/password-login", { email: orgAEmail, password: wizardA.json.temporaryPassword });
    const authAAfterRestart = { Authorization: `Bearer ${loginAAfterRestart.json.memberSessionToken}` };
    const afterRestart = await requestJson("GET", "/api/pilot/daily-care-entries", null, authAAfterRestart);
    const survivingEntries = afterRestart.json.entries.filter((e) => e.record.id === recordId || e.record.id === stormId);
    assert.equal(survivingEntries.length, 2, "both entries must survive a full server restart, exactly once each");
    const survivingCorrected = survivingEntries.find((e) => e.record.id === recordId);
    assert.equal(survivingCorrected.record.text, "Corrected observation text.", "the corrected value (not the stale original) must be what survives the restart");
    pass("5. Restart/redeploy retains every Daily Care entry exactly once, including corrections made before the restart");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nDaily Care server-authoritative sync checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
