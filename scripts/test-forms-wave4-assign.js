#!/usr/bin/env node
/**
 * Wave 4 — Confirm & Send / bulk routing (testing only).
 * Run: npm run test:forms-wave4-assign
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
const formsAssignLib = require("../server/forms-assign-lib.js");
const programFormsLib = require("../server/program-forms-lib.js");
const familyHubLib = require("../server/family-hub-lib.js");
const assignFlow = require("./forms-assign-flow.js");
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

async function waitForHealth(port, childProc, attempts = 80) {
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

function unitSiblingDedupe() {
  const profiles = [
    { id: "c1", name: "Waylon" },
    { id: "c2", name: "Sister" },
    { id: "c3", name: "Solo" },
  ];
  const households = [
    { id: "hh-sib", childIds: ["c1", "c2"] },
    { id: "hh-solo", childIds: ["c3"] },
  ];
  const childPlan = formsAssignLib.buildRecipientPlan({
    audience: "family",
    assignmentScope: "child",
    resolvedChildIds: ["c1", "c2", "c3"],
    profiles,
    households,
  });
  assert.equal(childPlan.counts.assignmentCount, 3);
  assert.equal(childPlan.counts.householdCount, 2);

  const hhPlan = formsAssignLib.buildRecipientPlan({
    audience: "family",
    assignmentScope: "household",
    resolvedChildIds: ["c1", "c2", "c3"],
    profiles,
    households,
  });
  assert.equal(hhPlan.counts.assignmentCount, 2, "sibling household gets one assignment");
  assert.equal(hhPlan.assignments.filter((a) => a.kind === "household").length, 2);
  pass("unit.child-vs-household-sibling-dedupe");
}

function unitCountMismatch() {
  const match = formsAssignLib.countsMatch(
    { childCount: 12, householdCount: 12, assignmentCount: 12 },
    { childCount: 14, householdCount: 12, assignmentCount: 14 },
  );
  assert.equal(match.ok, false);
  assert.ok(match.mismatches.some((m) => m.key === "childCount"));
  pass("unit.recipient-count-mismatch-helper");
}

function unitDirtyAssignFlow() {
  dirtyState.clearForm("assignFlow");
  dirtyState.touch("assignFlow", "childIds", "a,b");
  dirtyState.touch("assignFlow", "dueDate", "2026-08-20");
  dirtyState.touch("assignFlow", "childIds", "a,b,c");
  assert.equal(dirtyState.get("assignFlow", "childIds").value, "a,b,c");
  assert.equal(dirtyState.shouldKeepLocal("assignFlow", "dueDate", 0), true);
  const state = assignFlow.createAssignFlowState({ formSpec: { title: "T" }, childIds: ["a"] });
  const next = assignFlow.touchState(state, { dueDate: "2026-08-21", childIds: ["a", "b"] });
  assert.equal(next.dueDate, "2026-08-21");
  assert.deepEqual(next.childIds, ["a", "b"]);
  assert.ok(next.dirtyRev > state.dirtyRev);
  pass("unit.dirty-state-assign-flow");
}

function unitMarkers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /openAssignSendFlow/);
  assert.match(appJs, /confirmAssignSendFlow/);
  assert.match(appJs, /\/api\/program-forms\/assign\/confirm-send/);
  assert.match(appJs, /data-assign-confirm/);
  assert.match(appJs, /recipient_count_mismatch/);
  assert.doesNotMatch(appJs, /data-assign-template-form=\"\$\{escapeHtml\(template\.id\)\}\"/);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /forms-assign-flow\.js/);
  pass("unit.ui-markers-confirm-send");
}

async function runtimeWave4() {
  const storePath = path.join(os.tmpdir(), `llh-wave4-${Date.now()}.json`);
  const port = 45000 + Math.floor(Math.random() * 800);
  const hdOwner = "hd.wave4@example.invalid";
  const centerOwner = "center.wave4@example.invalid";
  const otherOwner = "other.wave4@example.invalid";
  const teacher = "teacher.wave4@example.invalid";
  const assistant = "assistant.wave4@example.invalid";
  const parentA = "parent.a.wave4@example.invalid";
  const parentB = "parent.b.wave4@example.invalid";
  const staffTeacher = "staff.teacher.wave4@example.invalid";
  const staffAsst = "staff.asst.wave4@example.invalid";

  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [hdOwner]: { email: hdOwner, role: "owner", accountType: "home_daycare", plan: "Pro" },
      [centerOwner]: { email: centerOwner, role: "owner", accountType: "center", plan: "Pro" },
      [otherOwner]: { email: otherOwner, role: "owner", accountType: "home_daycare", plan: "Pro" },
      [teacher]: { email: teacher, role: "teacher", linkedProgramOwnerEmail: centerOwner, classroomIds: ["infant"] },
      [assistant]: { email: assistant, role: "assistant", linkedProgramOwnerEmail: centerOwner },
      [staffTeacher]: { email: staffTeacher, role: "teacher", linkedProgramOwnerEmail: centerOwner, classroomIds: ["preschool"] },
      [staffAsst]: { email: staffAsst, role: "assistant", linkedProgramOwnerEmail: centerOwner },
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
    await request(port, "POST", "/api/child-data", {
      email: hdOwner,
      body: {
        data: {
          Profiles: [
            { id: "hd-waylon", name: "Waylon" },
            { id: "hd-sib", name: "Sibling" },
            { id: "hd-solo1", name: "Solo One" },
            { id: "hd-solo2", name: "Solo Two" },
          ],
          Documents: [],
        },
      },
    });

    const tpl = await request(port, "POST", "/api/program-forms/templates", {
      email: hdOwner,
      body: {
        title: "Program Policy Acknowledgment",
        body: "Please acknowledge our policies.",
        fields: [{ id: "ack", type: "yes_no", label: "I agree", required: true }],
        requiresSignature: true,
      },
    });
    assert.equal(tpl.status, 200, tpl.text);
    const templateId = tpl.json.template.id;

    const hhSib = await request(port, "POST", "/api/family-hub/households", {
      email: hdOwner,
      body: {
        label: "Sibling Family",
        email: parentA,
        children: [{ id: "hd-waylon" }, { id: "hd-sib" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(hhSib.status, 200, hhSib.text);
    const hhSolo = await request(port, "POST", "/api/family-hub/households", {
      email: hdOwner,
      body: {
        label: "Solo Family",
        email: parentB,
        children: [{ id: "hd-solo1" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(hhSolo.status, 200, hhSolo.text);

    // Individual child-specific send
    const previewOne = await request(port, "POST", "/api/program-forms/assign/preview", {
      email: hdOwner,
      body: {
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: ["hd-waylon"],
      },
    });
    assert.equal(previewOne.status, 200, previewOne.text);
    assert.equal(previewOne.json.counts.assignmentCount, 1);

    const key1 = crypto.randomUUID();
    const sendOne = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: hdOwner,
      body: {
        idempotencyKey: key1,
        templateId,
        formSpec: {
          title: "Medication Authorization",
          body: "Meds for Waylon",
          fields: [{ id: "med", type: "short_text", label: "Medication", required: true }],
          templateId,
          requiresSignature: true,
        },
        target: {
          audience: "family",
          mode: "children",
          assignmentScope: "child",
          childIds: ["hd-waylon"],
        },
        dueDate: "2026-08-20",
        shareWithFamily: true,
        expected: previewOne.json.counts,
      },
    });
    assert.equal(sendOne.status, 200, sendOne.text);
    assert.equal(sendOne.json.createdCount, 1);
    assert.equal(sendOne.json.shareWithFamily, true);
    pass("runtime.hd-child-specific-send");

    // Idempotent replay
    const sendOneReplay = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: hdOwner,
      body: {
        idempotencyKey: key1,
        templateId,
        formSpec: { title: "Medication Authorization", body: "Meds for Waylon", templateId },
        target: { audience: "family", mode: "children", assignmentScope: "child", childIds: ["hd-waylon"] },
        shareWithFamily: true,
        expected: previewOne.json.counts,
      },
    });
    assert.equal(sendOneReplay.status, 200, sendOneReplay.text);
    assert.equal(sendOneReplay.json.idempotentReplay, true);
    assert.equal(sendOneReplay.json.createdCount, sendOne.json.createdCount);
    pass("runtime.idempotency-replay");

    // Double-click same key again still one open doc
    const childAfter = await request(port, "GET", "/api/child-data", { email: hdOwner });
    const docsWaylon = (childAfter.json?.data?.Documents || childAfter.json?.Documents || [])
      .filter((d) => String(d.childId) === "hd-waylon" && /Medication|Policy|Meds/i.test(d.title || ""));
    // At least the medication one; open count for that template/title should be 1
    const medDocs = (childAfter.json?.data?.Documents || childAfter.json?.Documents || [])
      .filter((d) => String(d.childId) === "hd-waylon" && String(d.title).includes("Medication"));
    assert.equal(medDocs.length, 1);
    pass("runtime.double-click-no-duplicate");

    // Household-specific all families — sibling household one assignment
    const previewHH = await request(port, "POST", "/api/program-forms/assign/preview", {
      email: hdOwner,
      body: { audience: "family", mode: "program", assignmentScope: "household" },
    });
    assert.equal(previewHH.status, 200, previewHH.text);
    assert.ok(previewHH.json.counts.assignmentCount >= 2);
    assert.ok(previewHH.json.counts.assignmentCount < previewHH.json.counts.childCount
      || previewHH.json.counts.childCount === previewHH.json.counts.assignmentCount);

    const keyHH = crypto.randomUUID();
    const sendHH = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: hdOwner,
      body: {
        idempotencyKey: keyHH,
        templateId,
        formSpec: {
          title: "Program Policy Acknowledgment",
          body: "Please acknowledge our policies.",
          fields: [{ id: "ack", type: "yes_no", label: "I agree", required: true }],
          templateId,
        },
        target: { audience: "family", mode: "program", assignmentScope: "household" },
        shareWithFamily: true,
        expected: previewHH.json.counts,
      },
    });
    assert.equal(sendHH.status, 200, sendHH.text);
    const afterHH = await request(port, "GET", "/api/child-data", { email: hdOwner });
    const docs = afterHH.json?.data?.Documents || afterHH.json?.Documents || [];
    const policyDocs = docs.filter((d) => d.title === "Program Policy Acknowledgment" && d.assignmentScope === "household");
    assert.ok(policyDocs.length >= 2, `expected >=2 household policy docs, got ${policyDocs.length}`);
    const sibDocs = policyDocs.filter((d) => d.householdId === hhSib.json.household.id);
    assert.equal(sibDocs.length, 1, "sibling household one household-level form");
    pass("runtime.hd-household-sibling-dedupe");

    // Count mismatch protection
    const mismatch = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: hdOwner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        templateId,
        formSpec: { title: "X", body: "Y", templateId },
        target: { audience: "family", mode: "program", assignmentScope: "child" },
        shareWithFamily: true,
        expected: { childCount: 999, householdCount: 999, assignmentCount: 999, staffCount: 0 },
      },
    });
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.json.code, "recipient_count_mismatch");
    pass("security.recipient-count-mismatch-stops-send");

    // Family Hub visibility for sibling parent
    const loginA = await request(port, "POST", "/api/family-hub/login", {
      body: { email: parentA, code: hhSib.json.loginCode },
    });
    assert.equal(loginA.status, 200, loginA.text);
    const fhA = await request(port, "GET", "/api/family-hub/me", {
      familyToken: loginA.json.sessionToken,
    });
    assert.equal(fhA.status, 200, fhA.text);
    const fhDocs = fhA.json?.documents || fhA.json?.household?.documents || [];
    assert.ok(fhDocs.some((d) => String(d.title || "").includes("Medication") || d.assignmentScope === "household" || d.title === "Program Policy Acknowledgment"), fhA.text);
    // Wrong household must not see Waylon-only med form if not their child — parentB
    const loginB = await request(port, "POST", "/api/family-hub/login", {
      body: { email: parentB, code: hhSolo.json.loginCode },
    });
    const fhB = await request(port, "GET", "/api/family-hub/me", {
      familyToken: loginB.json.sessionToken,
    });
    assert.equal(fhB.status, 200, fhB.text);
    const fhDocsB = fhB.json?.documents || fhB.json?.household?.documents || [];
    assert.ok(!fhDocsB.some((d) => String(d.title || "").includes("Medication")));
    pass("runtime.family-hub-isolation");

    // Snapshot: edit template does not mutate assignment body
    const editTpl = await request(port, "POST", "/api/program-forms/templates", {
      email: hdOwner,
      body: {
        id: templateId,
        title: "Program Policy Acknowledgment",
        body: "CHANGED AFTER SEND",
        fields: [{ id: "ack", type: "yes_no", label: "I agree", required: true }],
      },
    });
    assert.equal(editTpl.status, 200, editTpl.text);
    const afterEdit = await request(port, "GET", "/api/child-data", { email: hdOwner });
    const docs2 = afterEdit.json?.data?.Documents || afterEdit.json?.Documents || [];
    const policyAfter = docs2.filter((d) => d.title === "Program Policy Acknowledgment");
    assert.ok(policyAfter.every((d) => !String(d.draftText || "").includes("CHANGED AFTER SEND")));
    pass("runtime.assignment-snapshot-immune-to-template-edit");

    // --- Center fixture ---
    await request(port, "POST", "/api/child-data", {
      email: centerOwner,
      body: {
        data: {
          Profiles: [
            { id: "inf-1", name: "Infant A", classroomId: "infant" },
            { id: "tod-1", name: "Toddler A", classroomId: "toddler" },
            { id: "pre-1", name: "Preschool A", classroomId: "preschool" },
            { id: "pre-2", name: "Preschool B", classroomId: "preschool" },
            { id: "pre-sib", name: "Preschool Sib", classroomId: "preschool" },
          ],
          Documents: [],
        },
      },
    });
    await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Pre Sib Family",
        email: "pre.sib.wave4@example.invalid",
        children: [{ id: "pre-1" }, { id: "pre-sib" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });

    const centerTpl = await request(port, "POST", "/api/program-forms/templates", {
      email: centerOwner,
      body: {
        title: "Field Trip Permission",
        body: "Zoo trip next Friday",
        fields: [{ id: "perm", type: "yes_no", label: "Permission", required: true }],
      },
    });
    assert.equal(centerTpl.status, 200, centerTpl.text);

    const prevPre = await request(port, "POST", "/api/program-forms/assign/preview", {
      email: centerOwner,
      body: {
        audience: "family",
        mode: "classroom",
        classroomId: "preschool",
        assignmentScope: "child",
      },
    });
    assert.equal(prevPre.status, 200, prevPre.text);
    assert.equal(prevPre.json.counts.childCount, 3);

    const sendPre = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: centerOwner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        templateId: centerTpl.json.template.id,
        formSpec: {
          title: "Field Trip Permission",
          body: "Zoo trip next Friday",
          fields: [{ id: "perm", type: "yes_no", label: "Permission", required: true }],
          templateId: centerTpl.json.template.id,
        },
        target: {
          audience: "family",
          mode: "classroom",
          classroomId: "preschool",
          assignmentScope: "child",
        },
        shareWithFamily: true,
        expected: prevPre.json.counts,
      },
    });
    assert.equal(sendPre.status, 200, sendPre.text);
    assert.equal(sendPre.json.createdCount, 3);
    pass("runtime.center-classroom-child-send");

    const staffTpl = await request(port, "POST", "/api/program-forms/templates", {
      email: centerOwner,
      body: { title: "Staff Policy", body: "Staff handbook ack", category: "Staff" },
    });
    const prevTeachers = await request(port, "POST", "/api/program-forms/assign/preview", {
      email: centerOwner,
      body: { audience: "staff", mode: "all_teachers" },
    });
    assert.equal(prevTeachers.status, 200, prevTeachers.text);
    assert.ok(prevTeachers.json.counts.staffCount >= 2);

    const sendTeachers = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: centerOwner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        templateId: staffTpl.json.template.id,
        formSpec: {
          title: "Staff Policy",
          body: "Staff handbook ack",
          templateId: staffTpl.json.template.id,
        },
        target: { audience: "staff", mode: "all_teachers" },
        shareWithFamily: false,
        expected: prevTeachers.json.counts,
      },
    });
    assert.equal(sendTeachers.status, 200, sendTeachers.text);
    assert.ok(sendTeachers.json.createdCount + sendTeachers.json.refreshedCount >= 2);
    pass("runtime.center-all-teachers-send");

    const oneStaff = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: centerOwner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        formSpec: { title: "Individual Staff Form", body: "Just for you" },
        target: {
          audience: "staff",
          mode: "staff",
          staffEmails: [staffAsst],
        },
        expected: { staffCount: 1, assignmentCount: 1, childCount: 0, householdCount: 0 },
      },
    });
    assert.equal(oneStaff.status, 200, oneStaff.text);
    const staffForms = await request(port, "GET", "/api/program-forms", { email: centerOwner });
    const asstDocs = (staffForms.json.staffDocuments || []).filter((d) => d.assigneeEmail === staffAsst);
    assert.ok(asstDocs.some((d) => d.title === "Individual Staff Form"));
    assert.ok(asstDocs.every((d) => d.shareWithFamily === false));
    pass("runtime.center-one-staff-send");

    // Security matrix
    const forgeChild = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: hdOwner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        formSpec: { title: "Forge", body: "x" },
        target: { audience: "family", mode: "children", childIds: ["pre-1"] },
        expected: { childCount: 1, assignmentCount: 1, householdCount: 0, staffCount: 0 },
      },
    });
    assert.ok(forgeChild.status === 403 || forgeChild.status === 400);
    pass("security.forged-childId-denied");

    const crossProgram = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: otherOwner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        templateId,
        formSpec: { title: "Steal", body: "x", templateId },
        target: { audience: "family", mode: "children", childIds: ["hd-waylon"] },
        expected: { childCount: 1, assignmentCount: 1, householdCount: 0, staffCount: 0 },
      },
    });
    assert.ok(crossProgram.status === 403 || crossProgram.status === 400 || crossProgram.status === 404);
    pass("security.cross-program-assign-denied");

    const asstAssign = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: assistant,
      body: {
        idempotencyKey: crypto.randomUUID(),
        formSpec: { title: "Nope", body: "x" },
        target: { audience: "staff", mode: "staff", staffEmails: [staffTeacher] },
        expected: { staffCount: 1, assignmentCount: 1, childCount: 0, householdCount: 0 },
      },
    });
    assert.equal(asstAssign.status, 403);
    pass("security.assistant-assign-denied");

    const parentAssign = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      familyToken: loginA.json.sessionToken,
      body: {
        idempotencyKey: crypto.randomUUID(),
        formSpec: { title: "Parent forge", body: "x" },
        target: { audience: "family", mode: "program" },
        expected: { childCount: 1, assignmentCount: 1, householdCount: 1, staffCount: 0 },
      },
    });
    assert.ok(parentAssign.status === 401 || parentAssign.status === 403 || parentAssign.status === 404);
    pass("security.parent-assign-denied");

    // Different intentional send later allowed
    const later = await request(port, "POST", "/api/program-forms/assign/confirm-send", {
      email: hdOwner,
      body: {
        idempotencyKey: crypto.randomUUID(),
        formSpec: { title: "Later Send", body: "new intentional" },
        target: { audience: "family", mode: "children", assignmentScope: "child", childIds: ["hd-solo2"] },
        shareWithFamily: false,
        expected: { childCount: 1, householdCount: 0, assignmentCount: 1, staffCount: 0 },
      },
    });
    assert.equal(later.status, 200, later.text);
    assert.equal(later.json.shareWithFamily, false);
    pass("runtime.later-intentional-send-allowed");

    // Audit has ASSIGNED / SENT_SHARED
    const audit = await request(port, "GET", "/api/program-forms/audit?limit=100", { email: hdOwner });
    assert.equal(audit.status, 200, audit.text);
    const actions = (audit.json.audit || []).map((r) => r.action);
    assert.ok(actions.includes("ASSIGNED") || actions.includes("SENT_SHARED"));
    assert.ok(actions.includes("SENT_SHARED"));
    pass("runtime.audit-assigned-sent");

    // Public family document exposes scope
    const pub = familyHubLib.publicFamilyDocument({
      id: "x",
      childId: "c1",
      householdId: "hh1",
      assignmentScope: "household",
      title: "Policy",
      shareWithFamily: true,
      status: "notified",
    });
    assert.equal(pub.assignmentScope, "household");
    assert.equal(pub.scopeLabel, "Family form");
    pass("unit.family-hub-scope-label");

    // Fallback still present
    const gate = programFormsLib.describeFallbackRemovalGate(
      { staffDocuments: [], templates: [] },
      {},
    );
    assert.equal(gate.readyToRemoveFallback, false);
    pass("compat.fallback-still-active");

    pass("runtime_wave4");
  } finally {
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  console.log("\nWave 4 — Confirm & Send / bulk routing tests\n");
  try { unitSiblingDedupe(); } catch (e) { fail("unit.child-vs-household-sibling-dedupe", e); }
  try { unitCountMismatch(); } catch (e) { fail("unit.recipient-count-mismatch-helper", e); }
  try { unitDirtyAssignFlow(); } catch (e) { fail("unit.dirty-state-assign-flow", e); }
  try { unitMarkers(); } catch (e) { fail("unit.ui-markers-confirm-send", e); }
  try {
    await runtimeWave4();
  } catch (e) {
    fail("runtime_wave4", e);
  }
  if (process.exitCode) {
    console.error("\nWAVE 4 BLOCKED — DO NOT CONTINUE\n");
    process.exit(1);
  }
  console.log("\nAll Wave 4 assign tests passed.\n");
}

main();
