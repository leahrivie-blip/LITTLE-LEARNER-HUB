#!/usr/bin/env node
/**
 * Wave 2 — Connected Paperwork UX (testing only).
 *
 * Covers: Paperwork HQ rails/filters helpers, same canonical record IDs across
 * surfaces, Child/Staff/My Paperwork/Family Hub buckets, manual reminder stub,
 * dirty-state filter safety, HD + Center fixtures, and server-side ACL matrix.
 *
 * Run: npm run test:forms-wave2-surfaces
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const formsLib = require("../server/forms-lib.js");
const familyHubLib = require("../server/family-hub-lib.js");
const programFormsLib = require("../server/program-forms-lib.js");
const paperwork = require("./paperwork-surfaces.js");
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

function unitBucketHelpers() {
  const today = "2026-08-10";
  const childDoc = {
    id: "doc-child-1",
    childId: "child-a",
    title: "Enrollment",
    category: "Enrollment",
    status: "notified",
    shareWithFamily: true,
    dueDate: "2026-08-09",
    assignedAt: "2026-08-01",
  };
  const rails = paperwork.hqRailsForDoc(childDoc, today);
  assert.ok(rails.includes("overdue"));
  assert.ok(rails.includes("awaiting_signature"));
  assert.ok(rails.includes("needs_attention"));
  assert.ok(rails.includes("not_opened"));

  const dueSoon = paperwork.hqRailsForDoc({
    ...childDoc,
    id: "doc-soon",
    dueDate: "2026-08-12",
    status: "assigned",
  }, today);
  assert.ok(dueSoon.includes("due_soon"));

  const completed = paperwork.childBucketsForDoc({
    id: "doc-done",
    status: "completed",
    providerReviewed: true,
    completedAt: "2026-08-08",
  }, today);
  assert.deepEqual(completed, ["completed"]);

  const staff = paperwork.staffBucketsForDoc({
    id: "staff-1",
    assigneeEmail: "teacher@example.com",
    status: "assigned",
    dueDate: "2026-08-08",
  }, today);
  assert.ok(staff.includes("overdue"));
  assert.ok(staff.includes("needs_signature"));

  const family = paperwork.familyBucketsForDoc({
    id: "fh-1",
    status: "in_progress",
    parentProgressText: "halfway",
    shareWithFamily: true,
  });
  assert.ok(family.includes("in_progress"));

  const rows = paperwork.buildPaperworkHqRows({
    childDocuments: [childDoc],
    staffDocuments: [{
      id: "staff-1",
      assigneeEmail: "teacher@example.com",
      title: "Handbook ack",
      status: "assigned",
    }],
    children: [{ id: "child-a", name: "Ava", classroomId: "room-1" }],
    classrooms: [{ id: "room-1", name: "Toddlers" }],
    staffDirectory: [{ email: "teacher@example.com", name: "Taylor" }],
    today,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.id === "doc-child-1").recordId, "doc-child-1");
  assert.equal(rows.find((r) => r.id === "staff-1").canonicalStore, "forms.staffDocuments");
  assert.equal(rows.find((r) => r.id === "doc-child-1").canonicalStore, "child.Documents");

  const filtered = paperwork.filterHqRows(rows, { rail: "overdue", childId: "child-a" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].recordId, "doc-child-1");

  assert.equal(paperwork.canBrowseStaffPaperwork("teacher"), false);
  assert.equal(paperwork.canBrowseStaffPaperwork("owner"), true);
  assert.deepEqual(
    paperwork.staffSelfServiceDocuments([
      { id: "a", assigneeEmail: "teacher@example.com" },
      { id: "b", assigneeEmail: "peer@example.com" },
    ], "teacher@example.com").map((d) => d.id),
    ["a"],
  );
  pass("unit.bucket-helpers-and-same-ids");
}

function unitDirtyStateFilters() {
  dirtyState.clearForm("paperworkHqFilters");
  dirtyState.touch("paperworkHqFilters", "query", "ava");
  assert.equal(dirtyState.shouldKeepLocal("paperworkHqFilters", "query", 0), true);
  const applied = dirtyState.applyIfNotStale("paperworkHqFilters", "query", "server", 0);
  assert.equal(applied.keptLocal, true);
  assert.equal(applied.value, "ava");
  pass("unit.dirty-state-hq-filters");
}

function unitDenyDefaultStillLocked() {
  const liveNull = familyHubLib.liveDocumentsForChildren({
    Documents: [{ id: "x", childId: "c1", shareWithFamily: null, title: "Nope" }],
  }, ["c1"], []);
  assert.equal(liveNull.length, 0);
  const liveMissing = familyHubLib.liveDocumentsForChildren({
    Documents: [{ id: "y", childId: "c1", title: "Nope" }],
  }, ["c1"], []);
  assert.equal(liveMissing.length, 0);
  assert.equal(formsLib.normalizeFormStatus("notified"), "assigned");
  assert.equal(formsLib.normalizeFormStatus("signed"), "submitted");
  pass("unit.deny-default-and-status-normalize");
}

async function runtimeWave2() {
  const storePath = path.join(os.tmpdir(), `llh-wave2-${Date.now()}.json`);
  const port = 42000 + Math.floor(Math.random() * 1000);
  const hdOwner = "hd.owner.wave2@example.invalid";
  const centerOwner = "center.owner.wave2@example.invalid";
  const teacherA = "teacher.a.wave2@example.invalid";
  const teacherB = "teacher.b.wave2@example.invalid";
  const assistant = "assistant.wave2@example.invalid";
  const otherProgramOwner = "other.owner.wave2@example.invalid";

  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [hdOwner]: { email: hdOwner, role: "owner", accountType: "home_daycare", plan: "Pro" },
      [centerOwner]: { email: centerOwner, role: "owner", accountType: "center", plan: "Pro" },
      [teacherA]: {
        email: teacherA,
        role: "teacher",
        linkedProgramOwnerEmail: centerOwner,
        classroomIds: ["room-a"],
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

    // --- Home Daycare fixture ---
    const hdSeed = await request(port, "POST", "/api/child-data", {
      email: hdOwner,
      body: {
        data: {
          Profiles: [
            { id: "hd-ava", name: "Ava" },
            { id: "hd-ben", name: "Ben" },
            { id: "hd-cy", name: "Cy" },
          ],
          Documents: [
            {
              id: "hd-assigned",
              childId: "hd-ava",
              title: "Enrollment packet",
              category: "Enrollment",
              status: "notified",
              draftText: "Please complete enrollment.",
              bodyHash: formsLib.hashFormBody("Please complete enrollment."),
              shareWithFamily: true,
              assignedAt: "2026-08-01T00:00:00.000Z",
              dueDate: "2026-08-20",
            },
            {
              id: "hd-completed",
              childId: "hd-ben",
              title: "Handbook receipt",
              category: "Handbook",
              status: "completed",
              draftText: "Handbook",
              bodyHash: formsLib.hashFormBody("Handbook"),
              shareWithFamily: true,
              signedAt: "2026-08-05T00:00:00.000Z",
              signedBy: "Parent A",
              providerReviewed: true,
              completedAt: "2026-08-05T00:00:00.000Z",
            },
            {
              id: "hd-provider-only",
              childId: "hd-ava",
              title: "Internal checklist",
              category: "Internal",
              status: "assigned",
              draftText: "SECRET_PROVIDER",
              shareWithFamily: false,
            },
            {
              id: "hd-null-share",
              childId: "hd-ava",
              title: "Missing share flag",
              status: "assigned",
              draftText: "SECRET_NULL",
            },
            {
              id: "hd-family-b-only",
              childId: "hd-cy",
              title: "Family B form",
              status: "notified",
              draftText: "B only",
              shareWithFamily: true,
            },
          ],
        },
      },
    });
    assert.equal(hdSeed.status, 200, hdSeed.text);

    const inviteA = await request(port, "POST", "/api/family-hub/households", {
      email: hdOwner,
      body: {
        label: "Family A Siblings",
        email: "parent.a.wave2@example.invalid",
        children: [{ id: "hd-ava" }, { id: "hd-ben" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(inviteA.status, 200, inviteA.text);

    const inviteB = await request(port, "POST", "/api/family-hub/households", {
      email: hdOwner,
      body: {
        label: "Family B",
        email: "parent.b.wave2@example.invalid",
        children: [{ id: "hd-cy" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(inviteB.status, 200, inviteB.text);

    const loginA = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "parent.a.wave2@example.invalid", code: inviteA.json.loginCode },
    });
    assert.equal(loginA.status, 200, loginA.text);
    const tokenA = loginA.json.sessionToken;
    const meA = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenA });
    assert.equal(meA.status, 200, meA.text);
    const docsA = meA.json.documents || [];
    assert.ok(docsA.some((d) => d.id === "hd-assigned"), "parent A sees assigned shared form");
    assert.ok(docsA.some((d) => d.id === "hd-completed"), "parent A sees completed shared form");
    assert.ok(!docsA.some((d) => d.id === "hd-provider-only"), "provider-only denied");
    assert.ok(!docsA.some((d) => d.id === "hd-null-share"), "null share denied");
    pass("security.parent-a-shared-only");

    // Family Hub buckets share same IDs as HQ/child file
    const fhAssigned = docsA.find((d) => d.id === "hd-assigned");
    assert.equal(fhAssigned.id, "hd-assigned");
    const fhBuckets = paperwork.familyBucketsForDoc(fhAssigned);
    assert.ok(fhBuckets.includes("needs_attention") || fhBuckets.includes("needs_signature"));
    pass("surface.family-hub-forms-buckets");

    const loginB = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "parent.b.wave2@example.invalid", code: inviteB.json.loginCode },
    });
    assert.equal(loginB.status, 200, loginB.text);
    const tokenB = loginB.json.sessionToken;
    const meB = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenB });
    assert.ok(!(meB.json.documents || []).some((d) => d.id === "hd-assigned"));
    pass("security.parent-b-cannot-see-parent-a");

    const swap = await request(port, "POST", "/api/family-hub/documents/hd-assigned/progress", {
      familyToken: tokenB,
      body: { text: "steal" },
    });
    assert.ok(swap.status === 404 || swap.status === 403, `id swap got ${swap.status}`);
    pass("security.direct-record-id-swap-fails-closed");

    // Parent cannot access staff/program forms API
    const parentStaff = await request(port, "GET", "/api/program-forms", { familyToken: tokenA });
    assert.ok(parentStaff.status === 401 || parentStaff.status === 403 || parentStaff.status === 404);
    pass("security.parent-cannot-see-staff-paperwork-api");

    // Manual reminder stub (no auto engine)
    const reminder = formsLib.buildFormReminderStub({
      id: "hd-assigned",
      childId: "hd-ava",
      status: "notified",
      shareWithFamily: true,
      dueDate: "2026-08-20",
    });
    assert.equal(reminder.documentId, "hd-assigned");
    assert.equal(reminder.suggestedChannel, "family_hub_notification");
    assert.equal(reminder.ready, true);
    pass("manual-reminder.surface-ready");

    // HD HQ rows use same IDs
    const hdRead = await request(port, "GET", "/api/child-data", { email: hdOwner });
    const hdDocs = hdRead.json?.data?.Documents || [];
    const hdProfiles = hdRead.json?.data?.Profiles || [];
    const hdHq = paperwork.buildPaperworkHqRows({
      childDocuments: hdDocs,
      staffDocuments: [],
      children: hdProfiles,
      households: [{ id: "hhA", name: "Family A Siblings", childIds: ["hd-ava", "hd-ben"] }],
      today: "2026-08-10",
    });
    assert.ok(hdHq.some((r) => r.recordId === "hd-assigned"));
    assert.ok(hdHq.some((r) => r.recordId === "hd-completed" && r.hqRails.includes("completed")));
    const childBuckets = paperwork.childBucketsForDoc(hdDocs.find((d) => d.id === "hd-assigned"));
    assert.ok(childBuckets.includes("needs_action"));
    assert.equal(
      hdHq.find((r) => r.recordId === "hd-assigned").recordId,
      docsA.find((d) => d.id === "hd-assigned").id,
    );
    pass("fixture.home-daycare-same-ids");

    // Seed HD staff member paperwork
    const hdStaff = await request(port, "POST", "/api/program-forms/staff-documents", {
      email: hdOwner,
      body: {
        id: "hd-staff-self",
        assigneeEmail: hdOwner,
        title: "Owner self paperwork",
        draftText: "staff body",
        status: "assigned",
      },
    });
    assert.equal(hdStaff.status, 200, hdStaff.text);
    const hdForms = await request(port, "GET", "/api/program-forms", { email: hdOwner });
    const myDocs = paperwork.staffSelfServiceDocuments(hdForms.json.staffDocuments || [], hdOwner);
    assert.ok(myDocs.some((d) => d.id === "hd-staff-self"));
    pass("surface.my-paperwork-self-only");

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
              dueDate: "2026-08-12",
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

    const assignTeacher = await request(port, "POST", "/api/program-forms/staff-documents", {
      email: centerOwner,
      body: {
        id: "c-staff-a",
        assigneeEmail: teacherA,
        title: "Teacher A handbook",
        draftText: "TEACHER_A_ONLY",
        status: "assigned",
        dueDate: "2026-08-09",
      },
    });
    assert.equal(assignTeacher.status, 200, assignTeacher.text);
    const assignTeacherB = await request(port, "POST", "/api/program-forms/staff-documents", {
      email: centerOwner,
      body: {
        id: "c-staff-b",
        assigneeEmail: teacherB,
        title: "Teacher B handbook",
        draftText: "TEACHER_B_ONLY",
        status: "assigned",
      },
    });
    assert.equal(assignTeacherB.status, 200, assignTeacherB.text);

    const teacherAView = await request(port, "GET", "/api/program-forms", { email: teacherA });
    assert.equal(teacherAView.status, 200, teacherAView.text);
    assert.ok(teacherAView.json.staffDocuments.every((d) => d.assigneeEmail === teacherA));
    assert.ok(!teacherAView.json.staffDocuments.some((d) => d.id === "c-staff-b"));
    pass("security.teacher-cannot-see-peer-staff");

    const ownerView = await request(port, "GET", "/api/program-forms", { email: centerOwner });
    assert.ok((ownerView.json.staffDocuments || []).some((d) => d.id === "c-staff-a"));
    assert.ok((ownerView.json.staffDocuments || []).some((d) => d.id === "c-staff-b"));
    const staffProfileRows = paperwork.staffSelfServiceDocuments(ownerView.json.staffDocuments || [], teacherA);
    assert.equal(staffProfileRows.length, 1);
    assert.equal(staffProfileRows[0].id, "c-staff-a");
    const staffBuckets = paperwork.staffBucketsForDoc(staffProfileRows[0], "2026-08-10");
    assert.ok(staffBuckets.includes("overdue") || staffBuckets.includes("needs_signature"));
    pass("surface.staff-profile-manager-view");

    const assistantCreate = await request(port, "POST", "/api/program-forms/staff-documents", {
      email: assistant,
      body: {
        assigneeEmail: teacherB,
        title: "Unauthorized",
        draftText: "nope",
      },
    });
    assert.ok(assistantCreate.status === 403 || assistantCreate.status === 400, `got ${assistantCreate.status}`);
    pass("security.assistant-cannot-unauthorized-write");

    const assistantWrite = await request(port, "POST", "/api/child-data", {
      email: assistant,
      body: {
        data: {
          Documents: [{ id: "hack", childId: "c-maya", title: "Nope", shareWithFamily: true }],
        },
      },
    });
    const ownerRead = await request(port, "GET", "/api/child-data", { email: centerOwner });
    const docs = ownerRead.json?.data?.Documents || [];
    assert.ok(!docs.some((d) => d.id === "hack"), `assistant write status=${assistantWrite.status}`);
    pass("security.assistant-cannot-gain-documents-write");

    const inviteMaya = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Maya Family",
        email: "maya.parent.wave2@example.invalid",
        children: [{ id: "c-maya" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(inviteMaya.status, 200, inviteMaya.text);
    const loginMaya = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "maya.parent.wave2@example.invalid", code: inviteMaya.json.loginCode },
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
    const parentStaffAck = await request(port, "POST", "/api/family-hub/documents/c-staff-a/acknowledge", {
      familyToken: tokenMaya,
      body: { signerName: "Intruder" },
    });
    assert.equal(parentStaffAck.status, 404);
    pass("security.center-parent-isolation");

    // Cross-program child document ID cannot be used from other program parent
    const otherPeek = await request(port, "POST", "/api/family-hub/documents/hd-assigned/acknowledge", {
      familyToken: tokenMaya,
      body: { signerName: "Intruder" },
    });
    assert.equal(otherPeek.status, 404);
    pass("security.child-profile-cross-program-id-denied");

    const otherGet = await request(port, "GET", "/api/program-forms", { email: otherProgramOwner });
    assert.ok(!(otherGet.json.staffDocuments || []).some((d) => d.id === "c-staff-a"));
    pass("security.cross-program-staff-isolated");

    // Center HQ rows + classroom filters
    const centerHq = paperwork.buildPaperworkHqRows({
      childDocuments: docs,
      staffDocuments: ownerView.json.staffDocuments || [],
      children: ownerRead.json?.data?.Profiles || [],
      classrooms: [
        { id: "room-a", name: "Infants" },
        { id: "room-b", name: "Toddlers" },
      ],
      staffDirectory: [
        { email: teacherA, name: "Teacher A" },
        { email: teacherB, name: "Teacher B" },
      ],
      today: "2026-08-10",
    });
    assert.ok(centerHq.some((r) => r.classroomName === "Infants" && r.recordId === "c-doc-maya"));
    assert.ok(centerHq.some((r) => r.assigneeType === "staff" && r.recordId === "c-staff-a"));
    const filteredRoom = paperwork.filterHqRows(centerHq, { rail: "all", classroomId: "room-a" });
    // rail "all" is not in matchesHqFilters as special — check classroom filter alone with awaiting
    const roomOnly = paperwork.filterHqRows(centerHq, { rail: "awaiting_signature", classroomId: "room-a" });
    assert.ok(roomOnly.every((r) => !r.childId || r.classroomId === "room-a" || r.assigneeType === "staff"));
    assert.ok(roomOnly.some((r) => r.recordId === "c-doc-maya"));
    pass("fixture.center-hq-classroom-staff");

    // Revoked / logged-out guardian
    await request(port, "POST", "/api/family-hub/logout", { familyToken: tokenMaya });
    const revoked = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenMaya });
    assert.ok(revoked.status === 401 || revoked.status === 403 || revoked.status === 404);
    pass("security.revoked-or-logged-out-guardian");

    // Fallback gate still active; no dual-store drift invented
    const disk = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const centerProgramId = ownerView.json.programId;
    const formsNs = disk.programData?.[centerProgramId]?.forms;
    assert.ok(formsNs);
    assert.ok(Array.isArray(formsNs.staffDocuments));
    const gate = programFormsLib.describeFallbackRemovalGate(formsNs, {});
    assert.equal(gate.readyToRemoveFallback, false);
    assert.equal(gate.status, "fallback_read_only_active");
    pass("compat.fallback-active-no-new-store");

    // UI wiring markers
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    assert.ok(appJs.includes("data-paperwork-hq"));
    assert.ok(appJs.includes("renderStaffProfilePaperworkPanel"));
    assert.ok(appJs.includes("renderMyPaperworkPanel"));
    assert.ok(appJs.includes("data-family-hub-forms"));
    assert.ok(appJs.includes("data-archive-child-document"));
    assert.ok(appJs.includes("lastNotifiedAt"));
    const surfacesSrc = fs.readFileSync(path.join(ROOT, "scripts/paperwork-surfaces.js"), "utf8");
    assert.ok(!surfacesSrc.includes("formPackets"));
    pass("ui.wiring-and-no-formPackets");

    // Desktop/mobile CSS markers present
    const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
    assert.ok(css.includes(".paperwork-hq-rails"));
    assert.ok(css.includes("@media (max-width: 720px)"));
    assert.ok(css.includes(".paperwork-hq-filters"));
    pass("ui.responsive-css-markers");

    pass("runtime_wave2_hd_and_center");
  } finally {
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  console.log("Wave 2 — Paperwork surfaces tests\n");
  try { unitBucketHelpers(); } catch (error) { fail("unit.bucket-helpers-and-same-ids", error); }
  try { unitDirtyStateFilters(); } catch (error) { fail("unit.dirty-state-hq-filters", error); }
  try { unitDenyDefaultStillLocked(); } catch (error) { fail("unit.deny-default-and-status-normalize", error); }
  try {
    await runtimeWave2();
  } catch (error) {
    fail("runtime_wave2", error);
  }
  if (process.exitCode) {
    console.error("\nWAVE 2 BLOCKED — DO NOT CONTINUE");
    process.exit(1);
  }
  console.log("\nAll Wave 2 surface tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
