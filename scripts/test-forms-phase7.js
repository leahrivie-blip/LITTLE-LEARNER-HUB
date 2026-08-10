#!/usr/bin/env node
/**
 * Phase 7 — Forms Completion (testing spine, no production).
 * Covers: lifecycle, assignment targets → canonical IDs, signature versioning,
 * staff forms, Family Hub progress/sign ACL, isolation, no second roster.
 *
 * Run: npm run test:forms-phase7
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const formsLib = require("../server/forms-lib.js");
const familyHubLib = require("../server/family-hub-lib.js");
const canonicalData = require("../server/canonical-data.js");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function request(port, method, pathname, { email, body, familyToken } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (email) {
      headers["X-LLH-User-Email"] = email;
      headers.Authorization = `Bearer test:${email}`;
    }
    if (familyToken) {
      headers.Authorization = `Bearer ${familyToken}`;
      headers["X-LLH-Family-Session"] = familyToken;
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers,
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "1",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return res.json;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server on ${port} did not become healthy`);
}

function sourceMarkers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(appJs, /function assignFormByTarget/);
  assert.match(appJs, /function resolveFormAssignmentTargetsClient/);
  assert.match(appJs, /function assignFormDocumentToStaff/);
  assert.match(appJs, /function duplicateFormTemplate/);
  assert.match(appJs, /function hashFormBodyClient/);
  assert.match(appJs, /normalizeFormLifecycleStatus/);
  assert.match(appJs, /staffFormDocuments/);
  assert.match(appJs, /data-family-hub-save-progress/);
  assert.match(appJs, /sourceType: "system"/);
  assert.match(appJs, /data-fh-billing-live|Billing/);
  assert.match(serverJs, /handleFamilyHubDocumentProgress/);
  assert.match(serverJs, /formsLib\.buildSignatureRecord/);
  assert.match(serverJs, /require\("\.\/forms-lib"\)/);
  assert.match(stylesCss, /fh-form-progress/);
  assert.match(stylesCss, /font-size: 16px/);
  // No second rosters
  assert.doesNotMatch(appJs, /llhFormsChildRoster|formsChildrenByUser|parallelFormsRoster/);
  assert.doesNotMatch(serverJs, /formsChildRoster|duplicateFormsAssignmentStore/);
  // AI must remain review-before-save
  assert.match(appJs, /Nothing is sent to families yet|Save as template|saveAiFormAsProgramTemplate/);
  pass("source_markers_phase7");
}

function lifecycleUnit() {
  assert.equal(formsLib.normalizeFormStatus("notified"), "assigned");
  assert.equal(formsLib.normalizeFormStatus("signed"), "submitted");
  assert.equal(formsLib.normalizeFormStatus("on_file"), "completed");
  assert.equal(formsLib.formStatusLabel("in_progress"), "In progress");
  const hash1 = formsLib.hashFormBody("Hello family");
  const hash2 = formsLib.hashFormBody("Hello family");
  const hash3 = formsLib.hashFormBody("Hello family changed");
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);

  const signed = {
    draftText: "Hello family",
    bodyHash: hash1,
    contentVersion: 1,
    signedAt: "2026-08-08T12:00:00.000Z",
    signedBy: "Parent",
    signedSnapshot: "Hello family",
    status: "submitted",
  };
  const invalidated = formsLib.applyFormBodyEdit(signed, "Hello family changed");
  assert.equal(invalidated.status, "needs_correction");
  assert.equal(invalidated.signedAt, "");
  assert.ok(invalidated.signatureInvalidatedReason);

  const sig = formsLib.buildSignatureRecord({
    draftText: "Policy text",
    bodyHash: formsLib.hashFormBody("Policy text"),
    contentVersion: 2,
  }, { signerName: "Sam Parent", signedRole: "guardian" });
  assert.equal(sig.status, "submitted");
  assert.equal(sig.signedBy, "Sam Parent");
  assert.equal(sig.signedRole, "guardian");
  assert.equal(sig.contentVersionSigned, 2);
  pass("lifecycle_and_signature_invalidation");
}

function assignmentTargetsUnit() {
  const profiles = [
    { id: "c1", name: "Ava", classroomId: "room-a" },
    { id: "c2", name: "Ben", classroomId: "room-b" },
    { id: "c3", name: "Cara", classroomId: "room-a", archived: true },
  ];
  const households = [
    { id: "hh1", childIds: ["c1"] },
    { id: "hh2", children: [{ id: "c2" }] },
  ];
  const classroom = formsLib.resolveFormAssignmentTargets({
    mode: "classroom",
    classroomId: "room-a",
    profiles,
  });
  assert.deepEqual(classroom.childIds, ["c1"]);

  const program = formsLib.resolveFormAssignmentTargets({ mode: "program", profiles });
  assert.deepEqual(program.childIds.sort(), ["c1", "c2"]);

  const family = formsLib.resolveFormAssignmentTargets({
    mode: "household",
    householdIds: ["hh1", "hh2"],
    households,
  });
  assert.deepEqual(family.childIds.sort(), ["c1", "c2"]);

  const staff = formsLib.resolveFormAssignmentTargets({
    mode: "staff",
    staffEmails: ["teacher@example.com", "bad"],
  });
  assert.deepEqual(staff.staffEmails, ["teacher@example.com"]);
  assert.deepEqual(staff.childIds, []);
  pass("assignment_targets_canonical_ids");
}

function dashboardUnit() {
  const today = "2026-08-08";
  const summary = formsLib.formsDashboardSummary([
    { id: "1", status: "notified", shareWithFamily: true, dueDate: "2026-08-01" },
    { id: "2", status: "submitted", signedAt: "2026-08-07", providerReviewed: false },
    { id: "3", status: "completed", providerReviewed: true },
  ], { todayIso: today });
  assert.ok(summary.overdue >= 1);
  assert.ok(summary.needsAttention >= 2);
  assert.ok(summary.completed >= 1);
  const reminder = formsLib.buildFormReminderStub({
    id: "1",
    status: "notified",
    shareWithFamily: true,
    dueDate: "2026-08-01",
  }, { now: new Date("2026-08-08T12:00:00Z") });
  assert.equal(reminder.overdue, true);
  assert.equal(reminder.ready, true);
  pass("dashboard_and_reminder_foundation");
}

function canonicalHomesUnit() {
  const homes = canonicalData.describeCanonicalHomes();
  assert.match(homes.FormsAssigned, /Documents/);
  assert.match(homes.FormsAssigned, /staffDocuments|staffFormDocuments/);
  assert.match(homes.FormsLibrary, /formTemplates|formGroups|forms\.templates/);
  assert.ok(homes.FormsSignatures);
  assert.match(homes.FormsAudit || "", /formsAudit|append-only/i);
  pass("canonical_homes_forms");
}

async function runtimePhase7() {
  const port = 4700 + Math.floor(Math.random() * 400);
  const storePath = path.join(os.tmpdir(), `llh-phase7-${crypto.randomBytes(4).toString("hex")}.json`);
  const hdOwner = "hd.phase7@example.invalid";
  const centerOwner = "center.phase7@example.invalid";
  const teacher = "teacher.phase7@example.invalid";

  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [hdOwner]: { email: hdOwner, role: "owner", accountType: "home_daycare", plan: "Pro" },
      [centerOwner]: { email: centerOwner, role: "owner", accountType: "center", plan: "Pro" },
      [teacher]: {
        email: teacher,
        role: "teacher",
        linkedProgramOwnerEmail: centerOwner,
        classroomIds: ["room-a"],
      },
    },
  }, null, 2));

  const childProc = spawnServer({ port, storePath });
  let killed = false;
  const kill = () => {
    if (killed) return;
    killed = true;
    try { childProc.kill("SIGTERM"); } catch (_e) { /* ignore */ }
  };
  process.on("exit", kill);

  try {
    await waitForHealth(port, childProc);
    const today = new Date().toISOString().slice(0, 10);
    const bodyText = "Handbook acknowledgment — version A. Parents agree to policies.";

    // Home daycare child + shared form
    const hdSeed = await request(port, "POST", "/api/child-data", {
      email: hdOwner,
      body: {
        data: {
          Profiles: [{ id: "hd-kid", name: "Ava HD", classroomId: "classroom-main" }],
          Documents: [{
            id: "hd-doc-1",
            childId: "hd-kid",
            title: "Handbook",
            category: "Handbook acknowledgment",
            status: "notified",
            statusLabel: "Shared — awaiting parent",
            draftText: bodyText,
            bodyHash: formsLib.hashFormBody(bodyText),
            contentVersion: 1,
            shareWithFamily: true,
            requiresSignature: true,
            assignedAt: today,
            dueDate: "2099-01-01",
          }, {
            id: "hd-doc-nosig",
            childId: "hd-kid",
            title: "Supply list",
            category: "Other",
            status: "notified",
            draftText: "Bring spare clothes.",
            bodyHash: formsLib.hashFormBody("Bring spare clothes."),
            contentVersion: 1,
            shareWithFamily: true,
            requiresSignature: false,
            assignedAt: today,
          }, {
            id: "hd-doc-staffonly",
            childId: "hd-kid",
            title: "Internal checklist",
            status: "assigned",
            draftText: "SECRET_FORM",
            shareWithFamily: false,
          }],
        },
      },
    });
    assert.equal(hdSeed.status, 200, hdSeed.text);

    const invite = await request(port, "POST", "/api/family-hub/households", {
      email: hdOwner,
      body: {
        label: "Ava Family",
        email: "ava.p7@example.invalid",
        children: [{ id: "hd-kid" }],
        appOrigin: `http://127.0.0.1:${port}`,
        programName: "Phase7 HD",
      },
    });
    assert.equal(invite.status, 200, invite.text);
    const login = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "ava.p7@example.invalid", code: invite.json.loginCode },
    });
    assert.equal(login.status, 200, login.text);
    const token = login.json.sessionToken;
    const me = await request(port, "GET", "/api/family-hub/me", { familyToken: token });
    assert.equal(me.status, 200, me.text);
    assert.ok((me.json.documents || []).some((d) => d.id === "hd-doc-1"));
    assert.ok(!(me.json.documents || []).some((d) => d.id === "hd-doc-staffonly"));
    pass("home_daycare_child_form_family_visibility");

    // Save progress → in_progress
    const progress = await request(port, "POST", "/api/family-hub/documents/hd-doc-1/progress", {
      familyToken: token,
      body: { progressText: "Read pages 1-3" },
    });
    assert.equal(progress.status, 200, progress.text);
    assert.equal(formsLib.normalizeFormStatus(progress.json.document.status), "in_progress");
    assert.equal(progress.json.document.parentProgressText, "Read pages 1-3");
    pass("family_hub_save_progress");

    // Sign / submit
    const sign = await request(port, "POST", "/api/family-hub/documents/hd-doc-1/acknowledge", {
      familyToken: token,
      body: { signerName: "Ava Parent", signedRole: "guardian" },
    });
    assert.equal(sign.status, 200, sign.text);
    assert.equal(formsLib.normalizeFormStatus(sign.json.document.status), "submitted");
    assert.equal(sign.json.document.signedBy, "Ava Parent");
    assert.equal(sign.json.document.signedRole, "guardian");
    // Idempotent re-sign should not invent a second signature row
    const resign = await request(port, "POST", "/api/family-hub/documents/hd-doc-1/acknowledge", {
      familyToken: token,
      body: { signerName: "Ava Parent", signedRole: "guardian" },
    });
    assert.equal(resign.status, 200, resign.text);
    assert.equal(resign.json.document.signedAt, sign.json.document.signedAt);
    pass("signature_required_submit_idempotent");

    // Staff-only / cross-doc denied
    const deny = await request(port, "POST", "/api/family-hub/documents/hd-doc-staffonly/acknowledge", {
      familyToken: token,
      body: { signerName: "Hacker" },
    });
    assert.equal(deny.status, 404);
    pass("staff_only_form_hidden_and_denied");

    // Center: multi-child classroom + isolation
    const centerSeed = await request(port, "POST", "/api/child-data", {
      email: centerOwner,
      body: {
        data: {
          Profiles: [
            { id: "c-maya", name: "Maya", classroomId: "room-a" },
            { id: "c-noah", name: "Noah", classroomId: "room-b" },
            { id: "c-other", name: "Other", classroomId: "room-a" },
          ],
          Documents: [
            {
              id: "c-doc-maya",
              childId: "c-maya",
              title: "Enrollment",
              status: "notified",
              draftText: "Enrollment for Maya",
              bodyHash: formsLib.hashFormBody("Enrollment for Maya"),
              contentVersion: 1,
              shareWithFamily: true,
              assignedAt: today,
            },
            {
              id: "c-doc-other",
              childId: "c-other",
              title: "Enrollment",
              status: "notified",
              draftText: "Enrollment for Other SECRET",
              shareWithFamily: true,
            },
          ],
        },
      },
    });
    assert.equal(centerSeed.status, 200, centerSeed.text);

    const targets = formsLib.resolveFormAssignmentTargets({
      mode: "classroom",
      classroomId: "room-a",
      profiles: centerSeed.json?.data?.Profiles || [
        { id: "c-maya", classroomId: "room-a" },
        { id: "c-noah", classroomId: "room-b" },
        { id: "c-other", classroomId: "room-a" },
      ],
    });
    assert.ok(targets.childIds.includes("c-maya"));
    assert.ok(targets.childIds.includes("c-other"));
    assert.ok(!targets.childIds.includes("c-noah"));
    pass("center_classroom_assignment_resolution");

    const hhA = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Maya Family",
        email: "maya.p7@example.invalid",
        guardianEmail: "maya.g2@example.invalid",
        children: [{ id: "c-maya" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    const hhB = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Other Family",
        email: "other.p7@example.invalid",
        children: [{ id: "c-other" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(hhA.status, 200, hhA.text);
    assert.equal(hhB.status, 200, hhB.text);

    const tokenA = (await request(port, "POST", "/api/family-hub/login", {
      body: { email: "maya.p7@example.invalid", code: hhA.json.loginCode },
    })).json.sessionToken;
    const tokenB = (await request(port, "POST", "/api/family-hub/login", {
      body: { email: "other.p7@example.invalid", code: hhB.json.loginCode },
    })).json.sessionToken;

    const cross = await request(port, "POST", "/api/family-hub/documents/c-doc-maya/acknowledge", {
      familyToken: tokenB,
      body: { signerName: "Wrong Household" },
    });
    assert.equal(cross.status, 404);
    const meA = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenA });
    assert.ok(!(JSON.stringify(meA.json).includes("Enrollment for Other SECRET")));
    pass("household_isolation_forms");

    // Multi-guardian login
    const g2 = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "maya.g2@example.invalid", code: hhA.json.loginCode },
    });
    assert.equal(g2.status, 200, g2.text);
    pass("multi_guardian_form_access");

    // Multi-child assignment (siblings household)
    const sib = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Siblings",
        email: "sib.p7@example.invalid",
        children: [{ id: "c-maya" }, { id: "c-noah" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    // First invite for maya email was different; this is new email — ok
    assert.equal(sib.status, 200, sib.text);
    // Patch documents for noah as shared
    await request(port, "POST", "/api/child-data", {
      email: centerOwner,
      body: {
        data: {
          Profiles: [
            { id: "c-maya", name: "Maya", classroomId: "room-a" },
            { id: "c-noah", name: "Noah", classroomId: "room-b" },
            { id: "c-other", name: "Other", classroomId: "room-a" },
          ],
          Documents: [
            {
              id: "c-doc-maya",
              childId: "c-maya",
              title: "Enrollment",
              status: "notified",
              draftText: "Enrollment for Maya",
              bodyHash: formsLib.hashFormBody("Enrollment for Maya"),
              contentVersion: 1,
              shareWithFamily: true,
            },
            {
              id: "c-doc-noah",
              childId: "c-noah",
              title: "Enrollment",
              status: "notified",
              draftText: "Enrollment for Noah",
              bodyHash: formsLib.hashFormBody("Enrollment for Noah"),
              contentVersion: 1,
              shareWithFamily: true,
            },
            {
              id: "c-doc-other",
              childId: "c-other",
              title: "Enrollment",
              status: "notified",
              draftText: "Enrollment for Other SECRET",
              shareWithFamily: true,
            },
          ],
        },
      },
    });
    const sibToken = (await request(port, "POST", "/api/family-hub/login", {
      body: { email: "sib.p7@example.invalid", code: sib.json.loginCode },
    })).json.sessionToken;
    const sibMe = await request(port, "GET", "/api/family-hub/me", { familyToken: sibToken });
    const sibDocIds = (sibMe.json.documents || []).map((d) => d.id);
    assert.ok(sibDocIds.includes("c-doc-maya"));
    assert.ok(sibDocIds.includes("c-doc-noah"));
    assert.ok(!sibDocIds.includes("c-doc-other"));
    pass("multiple_child_assignment_household");

    // Overdue derived
    assert.equal(formsLib.isFormOverdue({
      dueDate: "2020-01-01",
      status: "notified",
      shareWithFamily: true,
    }, today), true);
    pass("overdue_behavior");

    // Revoke access
    const revoke = await request(port, "DELETE", `/api/family-hub/households/${encodeURIComponent(hhA.json.household.id)}`, {
      email: centerOwner,
    });
    assert.equal(revoke.status, 200, revoke.text);
    const afterRevoke = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenA });
    assert.equal(afterRevoke.status, 401);
    pass("revoked_family_access_forms");

    // Drift check (non-destructive)
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const programId = Object.keys(store.programs || {})[0] || "";
    const drift = canonicalData.reportCanonicalDrift(store, programId);
    assert.ok(drift && typeof drift === "object");
    pass("canonical_drift_check_non_destructive");
  } finally {
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

function mobileMarkers() {
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(stylesCss, /font-size: 16px/);
  assert.match(stylesCss, /min-height: 44px/);
  assert.match(appJs, /data-family-hub-save-progress/);
  assert.match(appJs, /data-family-hub-sign-form/);
  pass("mobile_form_markers");
}

async function main() {
  try { sourceMarkers(); } catch (error) { fail("source_markers_phase7", error); }
  try { lifecycleUnit(); } catch (error) { fail("lifecycle_and_signature_invalidation", error); }
  try { assignmentTargetsUnit(); } catch (error) { fail("assignment_targets_canonical_ids", error); }
  try { dashboardUnit(); } catch (error) { fail("dashboard_and_reminder_foundation", error); }
  try { canonicalHomesUnit(); } catch (error) { fail("canonical_homes_forms", error); }
  try { mobileMarkers(); } catch (error) { fail("mobile_form_markers", error); }
  if (process.exitCode) return;
  try {
    await runtimePhase7();
  } catch (error) {
    fail("runtime_phase7", error);
  }
  if (!process.exitCode) {
    console.log("\nPhase 7 Forms completion suite: ALL PASSED");
  }
}

main();
