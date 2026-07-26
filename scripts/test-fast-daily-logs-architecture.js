#!/usr/bin/env node
/**
 * Fast Daily Logs / Daily Care architecture proof (testing accounts only).
 *
 * Proves the persistence + isolation contract used by the Home Daycare Pilot
 * Daily Logs path that backs Fast Daily Logs on connected testing accounts:
 *
 *  1. Server store is authoritative (entries survive clearing localStorage)
 *  2. localStorage is only an offline queue/cache (_pendingSync)
 *  3. Permanent UUID / idempotency key on every entry
 *  4. Retry cannot create duplicates
 *  5. Corrections preserve append-only history
 *  6. Provider entries remain after logout → login (server pull restores)
 *  7. Provider entries remain after server restart
 *  8. Parent sees only shared records for linked children
 *  9. Staff sees only this organization's classroom children (assigned roster)
 * 10. Cross-organization / wrong-child requests return 403
 * 11. Incomplete medication drafts cannot be shared (client guard + flag)
 * 12. Photos have no public URL and stay child/org scoped
 *
 * Run: node scripts/test-fast-daily-logs-architecture.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const { resolveTestPort } = require("./test-port.js");
const PORT = resolveTestPort(27300, 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-fdlc-arch-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "fdlc-arch-admin@example.invalid", password: "fdlc-arch-pass", code: "fdlc-arch-code" };

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

function startServer({ resetStore = true } = {}) {
  if (resetStore || !fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({
      users: {},
      siteContent: { featureFlags: { testingLab: true } },
      adminSessions: {},
    }, null, 2));
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
    if (child.exitCode !== null) throw new Error("server exited early");
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
  await page.waitForTimeout(1800);
}

async function adminAuth() {
  const login = await requestJson("POST", "/api/admin/login", ADMIN);
  assert.equal(login.status, 200);
  const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${login.json.token}`);
  await requestJson("POST", "/api/admin/site-content", {
    adminToken: login.json.token,
    siteContent: {
      updatedAt: siteContentGet.json?.siteContent?.updatedAt || "",
      featureFlags: { testingLab: true, testingFeedback: true },
    },
  });
  return { Authorization: `Bearer ${login.json.token}` };
}

async function createPilot(auth, { email, testerName, childCount = 1 }) {
  const wizard = await requestJson("POST", "/api/external-tester/create-pilot", {
    testerName,
    email,
    childCount,
  }, auth);
  assert.equal(wizard.status, 200, `create-pilot failed for ${email}: ${JSON.stringify(wizard.json)}`);
  const password = wizard.json.temporaryPassword;
  const memberLogin = await requestJson("POST", "/api/auth/password-login", { email, password });
  assert.equal(memberLogin.status, 200);
  return {
    email,
    password,
    organizationId: wizard.json.organizationId || memberLogin.json.organizationId,
    auth: { Authorization: `Bearer ${memberLogin.json.memberSessionToken}` },
    wizard,
  };
}

async function main() {
  // Static architecture markers
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /PILOT_SYNCED_DAILY_CARE_KEYS/);
  assert.match(appJs, /_pendingSync/);
  assert.match(appJs, /generateChildRecordId/);
  assert.match(appJs, /needs_provider_information/);
  assert.match(appJs, /Finish the required medication fields before sharing/);
  assert.match(appJs, /function undoChildRecord/);
  assert.match(appJs, /function applyChildRecordCorrection/);
  pass("static: server-sync, offline queue, UUID, medication share guard, undo/correction markers present");

  let child = startServer({ resetStore: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    const auth = await adminAuth();

    const ownerA = await createPilot(auth, { email: "fdlc.arch.owner.a@example.invalid", testerName: "Arch Owner A", childCount: 1 });
    const ownerB = await createPilot(auth, { email: "fdlc.arch.owner.b@example.invalid", testerName: "Arch Owner B", childCount: 1 });

    const childrenA = await requestJson("GET", "/api/pilot/children", null, ownerA.auth);
    assert.equal(childrenA.status, 200);
    const childIdA = childrenA.json.children[0].id;
    assert.ok(childIdA);

    const childrenB = await requestJson("GET", "/api/pilot/children", null, ownerB.auth);
    const childIdB = childrenB.json.children[0].id;

    // Staff for org A
    const staffEmail = "fdlc.arch.staff.a@example.invalid";
    const addStaff = await requestJson("POST", "/api/pilot/staff", {
      displayName: "Arch Staff A",
      email: staffEmail,
    }, ownerA.auth);
    assert.equal(addStaff.status, 200);
    const staffPassword = addStaff.json.temporaryPassword;
    const staffLogin = await requestJson("POST", "/api/auth/password-login", { email: staffEmail, password: staffPassword });
    const staffAuth = { Authorization: `Bearer ${staffLogin.json.memberSessionToken}` };

    // ---- UUID + idempotent write ----
    const recordId = crypto.randomUUID();
    const payload = {
      childId: childIdA,
      storeKey: "Observations",
      record: {
        id: recordId,
        childId: childIdA,
        text: "Architecture persistence observation",
        shareWithFamily: false,
      },
    };
    const first = await requestJson("POST", "/api/pilot/daily-care-entries", payload, ownerA.auth);
    assert.equal(first.status, 200);
    const retry = await requestJson("POST", "/api/pilot/daily-care-entries", payload, ownerA.auth);
    assert.equal(retry.status, 200);
    let listed = await requestJson("GET", "/api/pilot/daily-care-entries", null, ownerA.auth);
    assert.equal(listed.json.entries.filter((e) => e.record.id === recordId).length, 1);
    pass("3+4. Permanent UUID idempotency key — retry cannot create duplicates");

    // ---- Correction append-only ----
    const corrected = {
      ...payload,
      record: {
        ...payload.record,
        text: "Corrected architecture observation",
        originalText: "Architecture persistence observation",
        corrections: [{ reason: "Typo", correctedAt: new Date().toISOString() }],
      },
    };
    const corr = await requestJson("POST", "/api/pilot/daily-care-entries", corrected, ownerA.auth);
    assert.equal(corr.status, 200);
    listed = await requestJson("GET", "/api/pilot/daily-care-entries", null, ownerA.auth);
    const entry = listed.json.entries.find((e) => e.record.id === recordId);
    assert.equal(listed.json.entries.filter((e) => e.record.id === recordId).length, 1);
    assert.equal(entry.record.text, "Corrected architecture observation");
    assert.equal(entry.record.originalText, "Architecture persistence observation");
    assert.equal(entry.record.corrections.length, 1);
    pass("5. Corrections update in place and preserve append-only history");

    // ---- Wrong-child / cross-org 403 ----
    const wrongWrite = await requestJson("POST", "/api/pilot/daily-care-entries", {
      childId: childIdB,
      storeKey: "Observations",
      record: { id: crypto.randomUUID(), childId: childIdB, text: "should fail" },
    }, ownerA.auth);
    assert.equal(wrongWrite.status, 403);
    assert.equal(wrongWrite.json.code, "wrong_child");
    const wrongList = await requestJson("GET", `/api/pilot/daily-care-entries?childId=${encodeURIComponent(childIdB)}`, null, ownerA.auth);
    assert.equal(wrongList.status, 403);
    pass("10. Cross-organization / wrong-child Daily Care requests return 403");

    // ---- Staff sees only org classroom children ----
    const staffChildren = await requestJson("GET", "/api/pilot/children", null, staffAuth);
    assert.equal(staffChildren.status, 200);
    assert.ok(staffChildren.json.children.every((c) => c.id === childIdA || childrenA.json.children.some((x) => x.id === c.id)));
    assert.equal(staffChildren.json.children.some((c) => c.id === childIdB), false, "staff must never see another organization's children");
    const staffWrong = await requestJson("POST", "/api/pilot/daily-care-entries", {
      childId: childIdB,
      storeKey: "Observations",
      record: { id: crypto.randomUUID(), childId: childIdB, text: "staff cross-org" },
    }, staffAuth);
    assert.equal(staffWrong.status, 403);
    const staffOk = await requestJson("POST", "/api/pilot/daily-care-entries", {
      childId: childIdA,
      storeKey: "Observations",
      record: { id: crypto.randomUUID(), childId: childIdA, text: "staff classroom note" },
    }, staffAuth);
    assert.equal(staffOk.status, 200);
    pass("9. Staff sees only this organization's assigned classroom children; other-org child writes return 403");

    // Ensure a shared parent-facing update exists before role switch.
    const update = await requestJson("POST", "/api/pilot/updates", {
      childId: childIdA,
      title: "Shared daily note",
      message: "Parent-visible summary for architecture proof",
    }, ownerA.auth);
    assert.equal(update.status, 200);

    // ---- Parent shared-only (role switch on same fake account) ----
    const guardianOptions = await requestJson("GET", "/api/external-tester/guardian-options", null, ownerA.auth);
    assert.equal(guardianOptions.status, 200);
    const contactId = guardianOptions.json.options?.[0]?.contactId;
    assert.ok(contactId, "pilot must expose at least one guardian option");
    await requestJson("POST", "/api/external-tester/switch-role", {
      roleKey: "parent_guardian",
      previewContactId: contactId,
    }, ownerA.auth);
    const parentDaily = await requestJson("GET", "/api/pilot/daily-care-entries", null, ownerA.auth);
    assert.equal(parentDaily.status, 403, "parent role must not read the provider Daily Care mirror");
    const parentHome = await requestJson("GET", "/api/pilot/parent-home", null, ownerA.auth);
    assert.equal(parentHome.status, 200);
    const parentChildIds = (parentHome.json.children || []).map((c) => c.childId);
    assert.ok(parentChildIds.includes(childIdA), "parent home includes the linked child");
    assert.equal(parentChildIds.includes(childIdB), false, "parent home must never include another org's child");
    assert.ok((parentHome.json.children || []).some((c) => {
      const updateTitle = c.todaysUpdate?.title || "";
      const updateMessage = c.todaysUpdate?.message || "";
      return /Shared daily note/i.test(updateTitle) || /architecture proof/i.test(updateMessage);
    }), "parent home must show the shared update for the linked child");
    await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "solo_provider" }, ownerA.auth);
    pass("8. Parent/Guardian sees only shared records for their connected child; Daily Care mirror stays provider-only (403)");

    // ---- Photos scoped, no public URL ----
    const fakeDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const photo = await requestJson("POST", "/api/pilot/photos", {
      childId: childIdA,
      caption: "Arch photo",
      dataUrl: fakeDataUrl,
    }, ownerA.auth);
    assert.equal(photo.status, 200);
    assert.equal(photo.json.photo.dataUrl, undefined, "create response must not echo image bytes / public URL");
    assert.ok(!photo.json.photo.url && !photo.json.photo.publicUrl, "photos must not expose a public URL");
    const crossPhoto = await requestJson("GET", `/api/pilot/photos?childId=${encodeURIComponent(childIdA)}`, null, ownerB.auth);
    assert.equal(crossPhoto.status, 403);
    pass("12. Photos are child/org scoped, create response strips data, no public URL, cross-org returns 403");

    // ---- Incomplete medication share guard ----
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, ownerA.email, ownerA.password);
      const medGuard = await page.evaluate(async () => {
        const id = generateChildRecordId();
        saveChildStoreLocalOnly("Communications", [
          ...childStore("Communications"),
          {
            id,
            childId: "tmp",
            type: "Medication",
            status: "needs_provider_information",
            medicationName: "",
            shareWithFamily: false,
          },
        ]);
        const ok = await setChildRecordFamilyShare("Communications", id, true);
        const after = childStore("Communications").find((r) => r.id === id);
        return { ok, shared: after?.shareWithFamily === true, status: after?.status };
      });
      assert.equal(medGuard.ok, false);
      assert.equal(medGuard.shared, false);
      assert.equal(medGuard.status, "needs_provider_information");
      await page.close();
      pass("11. Incomplete medication drafts remain private and cannot be shared");
    }

    // ---- Logout/login restore from server (localStorage cleared) ----
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await loginAs(page, ownerA.email, ownerA.password);
      const restored = await page.evaluate(async (rid) => {
        await syncPilotDailyCareEntriesIntoLocalStore();
        Object.keys(localStorage).filter((k) => k.startsWith("llhChild:")).forEach((k) => localStorage.removeItem(k));
        await syncPilotDailyCareEntriesIntoLocalStore();
        const observations = childStore("Observations");
        return {
          found: observations.some((r) => r && r.id === rid),
          pendingFlags: observations.filter((r) => r && r.id === rid && r._pendingSync).length,
        };
      }, recordId);
      assert.equal(restored.found, true, "after clearing localStorage cache, server pull must restore the provider entry");
      assert.equal(restored.pendingFlags, 0, "restored authoritative records must not remain marked pending");

      await page.evaluate(() => signOut());
      await page.waitForTimeout(800);
      await loginAs(page, ownerA.email, ownerA.password);
      const afterRelogin = await page.evaluate(async (rid) => {
        await syncPilotDailyCareEntriesIntoLocalStore();
        return childStore("Observations").some((r) => r && r.id === rid);
      }, recordId);
      assert.equal(afterRelogin, true, "provider entry must remain after logout/login via server-authoritative restore");
      await page.close();
      pass("1+2+6. Server store is authoritative; localStorage is cache/queue; provider entries remain after logout/login");
    }

    // ---- Server restart ----
    await stopServer(child);
    child = startServer({ resetStore: false });
    await waitForBoot(child);
    const reloginA = await requestJson("POST", "/api/auth/password-login", { email: ownerA.email, password: ownerA.password });
    const authA2 = { Authorization: `Bearer ${reloginA.json.memberSessionToken}` };
    const afterRestart = await requestJson("GET", "/api/pilot/daily-care-entries", null, authA2);
    assert.equal(afterRestart.json.entries.filter((e) => e.record.id === recordId).length, 1);
    const surviving = afterRestart.json.entries.find((e) => e.record.id === recordId);
    assert.equal(surviving.record.text, "Corrected architecture observation");
    pass("7. Provider entries remain after a server restart");
  } finally {
    await browser.close();
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* */ }
  }

  console.log(`\nFast Daily Logs architecture checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
