#!/usr/bin/env node
/**
 * Wave 1 — Forms durable foundations + security hardening (testing only).
 *
 * Covers: programData.forms namespace, staff/template migration dual-read,
 * Family Hub deny-default, append-only formsAudit, server assignment validation,
 * dirty-state module, Home Daycare + Center fixtures.
 *
 * Run: npm run test:forms-wave1-foundations
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
const programFormsLib = require("../server/program-forms-lib.js");
const dirtyState = require("./forms-dirty-state.js");

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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, childProc, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    if (childProc.exitCode != null) throw new Error(`Server exited early: ${childProc.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server health timeout");
}

function unitDenyDefault() {
  const shared = { id: "d1", childId: "c1", shareWithFamily: true, title: "Shared" };
  const missing = { id: "d2", childId: "c1", title: "Missing flag" };
  const nulled = { id: "d3", childId: "c1", shareWithFamily: null, title: "Null flag" };
  const falsey = { id: "d4", childId: "c1", shareWithFamily: false, title: "False" };
  const live = familyHubLib.liveDocumentsForChildren(
    { Documents: [shared, missing, nulled, falsey] },
    ["c1"],
    [missing, nulled, { id: "d5", childId: "c1", title: "Fallback null" }],
  );
  assert.equal(live.length, 1);
  assert.equal(live[0].id, "d1");
  assert.equal(familyHubLib.isDocumentSharedWithFamily(missing), false);
  assert.equal(familyHubLib.publicFamilyDocument(missing).shareWithFamily, false);
  pass("unit_family_hub_deny_default");
}

function unitDirtyState() {
  dirtyState.clearForm("f1");
  const a = dirtyState.touch("f1", "notes", "hello");
  dirtyState.touch("f1", "notes", "hello world");
  assert.equal(dirtyState.shouldKeepLocal("f1", "notes", a.rev), true);
  const kept = dirtyState.applyIfNotStale("f1", "notes", "STALE_SERVER", a.rev);
  assert.equal(kept.keptLocal, true);
  assert.equal(kept.value, "hello world");
  const applied = dirtyState.applyIfNotStale("f1", "notes", "fresh", 99);
  assert.equal(applied.applied, true);
  assert.equal(applied.value, "fresh");
  pass("unit_dirty_state_foundation");
}

function unitMigrationMerge() {
  const store = { programData: {}, formsAudit: [], formsAuditArchive: [], users: {}, familyHouseholds: {} };
  const forms = programFormsLib.ensureProgramFormsNamespace(store, "prog_a");
  assert.ok(Array.isArray(forms.staffDocuments));
  assert.ok(Array.isArray(forms.templates));

  // Seed server row
  programFormsLib.upsertStaffDocument(store, "prog_a", {
    id: "staff-shared",
    assigneeEmail: "t@example.com",
    title: "Server wins",
    draftText: "server body",
  }, { actorUserId: "owner@example.com", actorRole: "owner" });

  const first = programFormsLib.migrateClientFormsPayload(store, "prog_a", {
    staffDocuments: [
      { id: "staff-shared", assigneeEmail: "t@example.com", title: "Client should lose", draftText: "client" },
      { id: "staff-client-only", assigneeEmail: "t@example.com", title: "Client only", draftText: "keep" },
    ],
    templates: [
      { id: "tmpl-1", title: "T1", body: "Body 1" },
      { id: "tmpl-1", title: "T1 duplicate id in batch", body: "ignored second in same batch after insert" },
    ],
  }, { actorUserId: "owner@example.com", actorRole: "owner" });

  assert.equal(first.staff.inserted, 1);
  assert.equal(first.staff.skippedExistingServerWins, 1);
  assert.equal(store.programData.prog_a.forms.staffDocuments.find((d) => d.id === "staff-shared").title, "Server wins");
  assert.ok(store.programData.prog_a.forms.staffDocuments.some((d) => d.id === "staff-client-only"));

  const second = programFormsLib.migrateClientFormsPayload(store, "prog_a", {
    staffDocuments: [
      { id: "staff-client-only", assigneeEmail: "t@example.com", title: "Client only", draftText: "keep" },
    ],
    templates: [{ id: "tmpl-1", title: "T1", body: "Body 1" }],
  }, { actorUserId: "owner@example.com", actorRole: "owner" });
  assert.equal(second.staff.inserted, 0);
  assert.equal(second.templates.inserted, 0);
  assert.equal(first.removalGate.status, "fallback_read_only_active");
  assert.equal(first.removalGate.readyToRemoveFallback, false);

  // Audit append-only + no client actor forge via lib (caller supplies identity)
  const before = store.formsAudit.length;
  programFormsLib.appendFormsAudit(store, {
    programId: "prog_a",
    action: "SIGNED",
    actorUserId: "real@example.com",
    actorRole: "guardian",
    documentId: "doc-1",
    detail: "signed",
  });
  assert.equal(store.formsAudit.length, before + 1);
  // Ensure we never truncate critical history with a FIFO slice in this module
  const src = fs.readFileSync(path.join(ROOT, "server/program-forms-lib.js"), "utf8");
  assert.doesNotMatch(src, /formsAudit\s*=\s*store\.formsAudit\.slice/);
  pass("unit_migration_and_audit_retention");
}

async function runtimeWave1() {
  const port = 4800 + Math.floor(Math.random() * 400);
  const storePath = path.join(os.tmpdir(), `llh-wave1-${crypto.randomBytes(4).toString("hex")}.json`);
  const hdOwner = "hd.wave1@example.invalid";
  const centerOwner = "center.wave1@example.invalid";
  const teacherA = "teacher.a.wave1@example.invalid";
  const teacherB = "teacher.b.wave1@example.invalid";
  const assistant = "assistant.wave1@example.invalid";
  const otherProgramOwner = "other.wave1@example.invalid";

  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [hdOwner]: { email: hdOwner, role: "owner", accountType: "home_daycare", plan: "Pro" },
      [centerOwner]: { email: centerOwner, role: "owner", accountType: "center", plan: "Pro" },
      [teacherA]: {
        email: teacherA,
        role: "teacher",
        linkedProgramOwnerEmail: centerOwner,
        classroomIds: ["room-a"],
        programId: "",
      },
      [teacherB]: {
        email: teacherB,
        role: "teacher",
        linkedProgramOwnerEmail: centerOwner,
        classroomIds: ["room-b"],
      },
      [assistant]: {
        email: assistant,
        role: "assistant",
        linkedProgramOwnerEmail: centerOwner,
      },
      [otherProgramOwner]: { email: otherProgramOwner, role: "owner", accountType: "home_daycare", plan: "Pro" },
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

    // --- Home Daycare: seed children/docs ---
    const hdSeed = await request(port, "POST", "/api/child-data", {
      email: hdOwner,
      body: {
        data: {
          Profiles: [{ id: "hd-kid", name: "Ava HD" }],
          Documents: [
            {
              id: "hd-shared",
              childId: "hd-kid",
              title: "Handbook",
              status: "notified",
              draftText: "Shared handbook",
              bodyHash: formsLib.hashFormBody("Shared handbook"),
              shareWithFamily: true,
            },
            {
              id: "hd-null-share",
              childId: "hd-kid",
              title: "Should stay private",
              status: "assigned",
              draftText: "SECRET_NULL",
              // shareWithFamily missing
            },
            {
              id: "hd-provider-only",
              childId: "hd-kid",
              title: "Provider only",
              status: "assigned",
              draftText: "SECRET_PROVIDER",
              shareWithFamily: false,
            },
          ],
        },
      },
    });
    assert.equal(hdSeed.status, 200, hdSeed.text);

    const inviteA = await request(port, "POST", "/api/family-hub/households", {
      email: hdOwner,
      body: {
        label: "Family A",
        email: "parent.a.wave1@example.invalid",
        children: [{ id: "hd-kid" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(inviteA.status, 200, inviteA.text);
    // Household snapshot must not include null-share docs
    const snapDocs = inviteA.json?.household?.documents || inviteA.json?.documents || [];
    if (Array.isArray(snapDocs) && snapDocs.length) {
      assert.ok(!snapDocs.some((d) => d.id === "hd-null-share" || d.id === "hd-provider-only"));
    }

    const loginA = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "parent.a.wave1@example.invalid", code: inviteA.json.loginCode },
    });
    assert.equal(loginA.status, 200, loginA.text);
    const tokenA = loginA.json.sessionToken;
    const meA = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenA });
    assert.equal(meA.status, 200, meA.text);
    const docsA = meA.json.documents || [];
    assert.ok(docsA.some((d) => d.id === "hd-shared"));
    assert.ok(!docsA.some((d) => d.id === "hd-null-share"), "null shareWithFamily denied");
    assert.ok(!docsA.some((d) => d.id === "hd-provider-only"));
    pass("hd_family_deny_default_null_and_provider_only");

    // Parent cannot access staff paperwork API
    const parentStaff = await request(port, "GET", "/api/program-forms", { familyToken: tokenA });
    assert.ok(parentStaff.status === 401 || parentStaff.status === 403 || parentStaff.status === 404);
    pass("parent_cannot_access_program_forms_api");

    // Migrate client-only staff + templates for HD
    const migrateHd = await request(port, "POST", "/api/program-forms/migrate", {
      email: hdOwner,
      body: {
        staffFormDocuments: [
          { id: "hd-staff-1", assigneeEmail: hdOwner, title: "HD Staff Form", draftText: "staff body" },
        ],
        formTemplates: [
          { id: "hd-tmpl-1", title: "HD Template", body: "template body" },
        ],
      },
    });
    assert.equal(migrateHd.status, 200, migrateHd.text);
    assert.equal(migrateHd.json.migration.staff.inserted, 1);
    assert.equal(migrateHd.json.migration.templates.inserted, 1);
    assert.equal(migrateHd.json.migration.authoritative, "programData.forms");
    assert.equal(migrateHd.json.migration.removalGate.readyToRemoveFallback, false);

    const migrateHdAgain = await request(port, "POST", "/api/program-forms/migrate", {
      email: hdOwner,
      body: {
        staffDocuments: [
          { id: "hd-staff-1", assigneeEmail: hdOwner, title: "HD Staff Form CHANGED", draftText: "nope" },
        ],
        templates: [{ id: "hd-tmpl-1", title: "HD Template", body: "template body" }],
      },
    });
    assert.equal(migrateHdAgain.status, 200, migrateHdAgain.text);
    assert.equal(migrateHdAgain.json.migration.staff.inserted, 0);
    assert.equal(migrateHdAgain.json.migration.staff.skippedExistingServerWins, 1);

    const hdForms = await request(port, "GET", "/api/program-forms", { email: hdOwner });
    assert.equal(hdForms.status, 200, hdForms.text);
    assert.ok(hdForms.json.staffDocuments.some((d) => d.id === "hd-staff-1" && d.title === "HD Staff Form"));
    assert.ok(hdForms.json.templates.some((t) => t.id === "hd-tmpl-1"));
    pass("hd_migration_idempotent_server_wins");

    // New write server-only
    const newStaff = await request(port, "POST", "/api/program-forms/staff-documents", {
      email: hdOwner,
      body: { id: "hd-staff-new", assigneeEmail: hdOwner, title: "New server write", draftText: "x" },
    });
    assert.equal(newStaff.status, 200, newStaff.text);
    assert.equal(newStaff.json.authoritative, "programData.forms.staffDocuments");
    pass("hd_new_writes_server_authoritative");

    // --- Center fixture ---
    const centerSeed = await request(port, "POST", "/api/child-data", {
      email: centerOwner,
      body: {
        data: {
          Profiles: [
            { id: "c-maya", name: "Maya", classroomId: "room-a" },
            { id: "c-noah", name: "Noah", classroomId: "room-b" },
          ],
          Documents: [
            {
              id: "c-doc-maya",
              childId: "c-maya",
              title: "Enrollment",
              status: "notified",
              draftText: "Maya enrollment",
              shareWithFamily: true,
            },
            {
              id: "c-doc-noah",
              childId: "c-noah",
              title: "Enrollment",
              status: "notified",
              draftText: "Noah SECRET",
              shareWithFamily: true,
            },
          ],
        },
      },
    });
    assert.equal(centerSeed.status, 200, centerSeed.text);

    // Link teachers to center programId via child-data context (owner write creates program)
    const centerFormsGet = await request(port, "GET", "/api/program-forms", { email: centerOwner });
    assert.equal(centerFormsGet.status, 200, centerFormsGet.text);
    const centerProgramId = centerFormsGet.json.programId;
    assert.ok(centerProgramId);

    // Patch users onto program for membership checks — via migrate/assign after ensuring linked owner
    // Assign staff doc to teacherA
    const assignTeacher = await request(port, "POST", "/api/program-forms/staff-documents", {
      email: centerOwner,
      body: {
        id: "c-staff-a",
        assigneeEmail: teacherA,
        title: "Teacher A handbook",
        draftText: "TEACHER_A_ONLY",
      },
    });
    // May 403 if teacher not yet on program membership set — seed user programId via store is empty.
    // validate uses linkedProgramOwnerEmail === ownerEmail, so teacherA should work.
    assert.equal(assignTeacher.status, 200, assignTeacher.text);

    const assignTeacherB = await request(port, "POST", "/api/program-forms/staff-documents", {
      email: centerOwner,
      body: {
        id: "c-staff-b",
        assigneeEmail: teacherB,
        title: "Teacher B handbook",
        draftText: "TEACHER_B_ONLY",
      },
    });
    assert.equal(assignTeacherB.status, 200, assignTeacherB.text);

    const teacherAView = await request(port, "GET", "/api/program-forms", { email: teacherA });
    assert.equal(teacherAView.status, 200, teacherAView.text);
    assert.ok(teacherAView.json.staffDocuments.every((d) => d.assigneeEmail === teacherA));
    assert.ok(!teacherAView.json.staffDocuments.some((d) => d.id === "c-staff-b"));
    pass("center_teacher_cannot_see_peer_staff_docs");

    // Parent A / Parent B isolation on center
    const inviteMaya = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Maya Family",
        email: "maya.parent.wave1@example.invalid",
        children: [{ id: "c-maya" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(inviteMaya.status, 200, inviteMaya.text);
    const loginMaya = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "maya.parent.wave1@example.invalid", code: inviteMaya.json.loginCode },
    });
    const tokenMaya = loginMaya.json.sessionToken;
    const meMaya = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenMaya });
    assert.ok((meMaya.json.documents || []).some((d) => d.id === "c-doc-maya"));
    assert.ok(!(meMaya.json.documents || []).some((d) => d.id === "c-doc-noah"));
    const crossAck = await request(port, "POST", "/api/family-hub/documents/c-doc-noah/acknowledge", {
      familyToken: tokenMaya,
      body: { signerName: "Intruder" },
    });
    assert.equal(crossAck.status, 404);
    pass("center_parent_a_cannot_access_parent_b_form");

    // Parent cannot ack staff doc id
    const parentStaffAck = await request(port, "POST", "/api/family-hub/documents/c-staff-a/acknowledge", {
      familyToken: tokenMaya,
      body: { signerName: "Intruder" },
    });
    assert.equal(parentStaffAck.status, 404);
    pass("parent_cannot_access_staff_paperwork");

    // Forged programId / childId / householdId / staff
    const forgedProgram = await request(port, "POST", "/api/program-forms/assign/validate", {
      email: centerOwner,
      body: { mode: "children", childIds: ["c-maya"], programId: "forged_program" },
    });
    assert.equal(forgedProgram.status, 403);

    const forgedChild = await request(port, "POST", "/api/program-forms/assign/validate", {
      email: centerOwner,
      body: { mode: "children", childIds: ["not-a-real-child"] },
    });
    assert.equal(forgedChild.status, 403);

    const forgedHousehold = await request(port, "POST", "/api/program-forms/assign/validate", {
      email: centerOwner,
      body: { mode: "household", householdIds: ["hh_forged"] },
    });
    assert.equal(forgedHousehold.status, 403);

    const forgedStaff = await request(port, "POST", "/api/program-forms/assign/validate", {
      email: centerOwner,
      body: { mode: "staff", staffEmails: ["stranger@example.invalid"] },
    });
    assert.equal(forgedStaff.status, 403);
    pass("forged_program_child_household_staff_denied");

    // Assistant cannot assign
    const assistantAssign = await request(port, "POST", "/api/program-forms/assign/validate", {
      email: assistant,
      body: { mode: "children", childIds: ["c-maya"] },
    });
    assert.equal(assistantAssign.status, 403);
    pass("assistant_cannot_assign_paperwork");

    // Assistant cannot write Documents via child-data (existing ACL)
    const assistantWrite = await request(port, "POST", "/api/child-data", {
      email: assistant,
      body: {
        data: {
          Documents: [{ id: "hack", childId: "c-maya", title: "Nope", shareWithFamily: true }],
        },
      },
    });
    // Scoped merge should not persist assistant Documents — verify via owner read
    const ownerRead = await request(port, "GET", "/api/child-data", { email: centerOwner });
    assert.equal(ownerRead.status, 200, ownerRead.text);
    const docs = ownerRead.json?.data?.Documents || [];
    assert.ok(!docs.some((d) => d.id === "hack"));
    pass("assistant_cannot_gain_documents_write");

    // Other program cannot read center forms
    const otherGet = await request(port, "GET", "/api/program-forms", { email: otherProgramOwner });
    assert.equal(otherGet.status, 200, otherGet.text);
    assert.ok(!(otherGet.json.staffDocuments || []).some((d) => d.id === "c-staff-a"));
    pass("staff_cannot_access_another_program_forms");

    // Audit: client cannot forge actor / mutate / delete
    const auditGet = await request(port, "GET", "/api/program-forms/audit", { email: centerOwner });
    assert.equal(auditGet.status, 200, auditGet.text);
    assert.ok(Array.isArray(auditGet.json.audit));
    const forgedAudit = await request(port, "POST", "/api/program-forms/audit", {
      email: centerOwner,
      body: { action: "SIGNED", actorUserId: "forged@evil.invalid" },
    });
    assert.equal(forgedAudit.status, 405);
    const deleteAudit = await request(port, "DELETE", "/api/program-forms/audit/anything", {
      email: centerOwner,
    });
    assert.equal(deleteAudit.status, 405);
    // validate ignores client actor fields
    const validateIgnore = await request(port, "POST", "/api/program-forms/assign/validate", {
      email: centerOwner,
      body: {
        mode: "children",
        childIds: ["c-maya"],
        actorUserId: "forged@evil.invalid",
        performedBy: "forged@evil.invalid",
      },
    });
    assert.equal(validateIgnore.status, 200, validateIgnore.text);
    assert.equal(validateIgnore.json.ignoredClientActor, true);
    assert.equal(validateIgnore.json.actorUserId, centerOwner);
    pass("audit_append_only_and_forged_actor_ignored");

    // Revoked guardian: logout/clear session then deny
    await request(port, "POST", "/api/family-hub/logout", { familyToken: tokenMaya });
    const revoked = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenMaya });
    assert.ok(revoked.status === 401 || revoked.status === 403 || revoked.status === 404);
    pass("revoked_guardian_denied");

    // Classroom validation for teacherA (room-a only)
    const badRoom = await request(port, "POST", "/api/program-forms/assign/validate", {
      email: teacherA,
      body: { mode: "classroom", classroomId: "room-b" },
    });
    assert.equal(badRoom.status, 403);
    const okRoom = await request(port, "POST", "/api/program-forms/assign/validate", {
      email: teacherA,
      body: { mode: "classroom", classroomId: "room-a" },
    });
    assert.equal(okRoom.status, 200, okRoom.text);
    assert.deepEqual(okRoom.json.resolved.childIds, ["c-maya"]);
    pass("teacher_classroom_scope_enforced");

    // Persist store file still has forms namespace + audit (no destructive wipe)
    const disk = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const progForms = disk.programData?.[centerProgramId]?.forms;
    assert.ok(progForms);
    assert.ok(Array.isArray(progForms.staffDocuments));
    assert.ok((disk.formsAudit || []).length >= 1);
    pass("durable_namespace_persisted_no_destructive_cleanup");

    pass("runtime_wave1_hd_and_center");
  } finally {
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  try { unitDenyDefault(); } catch (error) { fail("unit_family_hub_deny_default", error); }
  try { unitDirtyState(); } catch (error) { fail("unit_dirty_state_foundation", error); }
  try { unitMigrationMerge(); } catch (error) { fail("unit_migration_and_audit_retention", error); }
  try { await runtimeWave1(); } catch (error) { fail("runtime_wave1", error); }

  if (process.exitCode && process.exitCode !== 0) {
    console.error("\nWAVE 1 BLOCKED — DO NOT CONTINUE");
    process.exit(process.exitCode);
  }
  console.log("\nAll Wave 1 foundation checks passed.");
}

main().catch((error) => {
  fail("main", error);
  process.exit(1);
});
