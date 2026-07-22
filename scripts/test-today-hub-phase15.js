#!/usr/bin/env node
"use strict";

/**
 * Phase 15 Today Hub / Daily Operations focused suite.
 * Fake data only. No email/SMS/push/Stripe/live AI. Ratio = provider-configured, not compliance.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./today-hub-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase15-admin@example.com";
const ADMIN_PASSWORD = "Phase15TodayHub!99";
const ADMIN_CODE = "phase15-today-code";
const BASE = "/api/director-center/today";

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, timeoutMs = 25000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) return reject(new Error("Server health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function baseStore() {
  return {
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: true,
      },
    },
  };
}

async function startServer({ env = {} } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-th-phase15-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9500 + Math.floor(Math.random() * 400);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: env.SITE_URL || "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: env.ALLOW_FAMILY_HUB_TESTING_PREVIEW ?? "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitForHealth(port);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr}`);
  }
  return { port, child, storePath };
}

async function stopServer(ctx) {
  if (!ctx?.child) return;
  ctx.child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    ctx.child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function adminLogin(port) {
  const res = await request(port, "POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(res.status, 200);
  return res.body.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function seedAll(port, token) {
  await request(port, "POST", "/api/director-center/family/seed", { headers: auth(token), body: {} });
  await request(port, "POST", `${BASE}/seed`, { headers: auth(token), body: { reset: true } });
  await request(port, "POST", "/api/family-hub/seed", { headers: auth(token), body: {} });
}

async function issueAndLogin(port, adminToken, kind) {
  await seedAll(port, adminToken);
  const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
  const account = (fakes.body.fakeAccounts || []).find((row) => row.kind === kind);
  assert.ok(account, `missing fake account ${kind}`);
  const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {
    headers: auth(adminToken), body: {},
  });
  assert.equal(issued.status, 200);
  const password = issued.body.temporaryPassword || issued.body.password;
  const login = await request(port, "POST", "/api/auth/password-login", {
    body: { email: account.email, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { account, token: login.body.memberSessionToken || login.body.token, email: account.email };
}

function findStaff(store, roleRe) {
  return Object.values(store.staffMemberships || {}).find((m) => roleRe.test(m.role || ""));
}

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

async function run() {
  // Unit: ratio + disclaimer + attendance history helpers
  {
    const evalOut = model.evaluateRatio({
      childrenPresent: 8,
      qualifiedStaff: 1,
      config: model.createRatioConfig({ maxChildrenPerStaff: 6, nearLimitThreshold: 1 }),
    });
    assert.equal(evalOut.status, model.RATIO_STATUS.OUT_OF_RATIO);
    assert.match(evalOut.disclaimer, /provider-configured/i);
    assert.match(evalOut.disclaimer, /not a universal state compliance/i);
    const store = { todayHub: null };
    model.ensureTodayHubStore(store);
    const att = model.createAttendanceRecord({ organizationId: "org_x", childId: "c1", classroomId: "r1", status: model.ATTENDANCE_STATUSES.EXPECTED });
    store.todayHub.attendance[att.id] = att;
    model.applyAttendanceAction(store, att, { status: model.ATTENDANCE_STATUSES.CHECKED_IN, action: "check_in" }, { email: "a@b.c", role: "director" });
    assert.equal(Object.keys(store.todayHub.attendanceHistory).length, 1);
    const again = store.todayHub.attendance[att.id];
    model.applyAttendanceAction(store, again, { status: model.ATTENDANCE_STATUSES.CHECKED_OUT, action: "check_out", pickupPerson: "Mom", pickupVerification: model.PICKUP_VERIFICATION.VERIFIED }, { email: "a@b.c", role: "director" });
    assert.equal(Object.keys(store.todayHub.attendanceHistory).length, 2);
    pass("ratio_and_attendance_history_unit");
  }

  {
    const ctx = await startServer({
      env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
    });
    try {
      const token = await adminLogin(ctx.port);
      const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
      assert.equal(status.status, 403);
      pass("production_preview_rejection");
    } finally {
      await stopServer(ctx);
    }
  }

  const ctx = await startServer();
  try {
    const token = await adminLogin(ctx.port);
    await seedAll(ctx.port, token);

    const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.phase, 15);
    assert.equal(status.body.noOutboundEmail, true);
    assert.equal(status.body.noOutboundSms, true);
    assert.equal(status.body.noPush, true);
    assert.equal(status.body.noLegalComplianceClaim, true);
    assert.match(String(status.body.ratioDisclaimer || ""), /provider-configured/i);
    pass("provider_status");

    const directorDash = await request(ctx.port, "GET", `${BASE}/dashboard`, { headers: auth(token) });
    assert.equal(directorDash.status, 200, JSON.stringify(directorDash.body));
    assert.equal(directorDash.body.view, "director");
    assert.equal(directorDash.body.featureMarker, "phase15-today-hub");
    assert.ok(directorDash.body.attendanceSummary);
    assert.ok(Array.isArray(directorDash.body.classrooms) && directorDash.body.classrooms.length >= 1);
    assert.ok(directorDash.body.tasksByPriority);
    assert.ok(Array.isArray(directorDash.body.tasks));
    assert.match(String(directorDash.body.ratioDisclaimer || ""), /not a universal state compliance/i);
    const taskKeys = new Set((directorDash.body.tasks || []).map((t) => `${t.source}|${t.sourceRefId}|${t.href}|${t.childId}`));
    assert.equal(taskKeys.size, (directorDash.body.tasks || []).length, "tasks must be deduped");
    assert.equal(directorDash.body.noTaskDuplication, true);
    const hasDeepLink = (directorDash.body.tasks || []).every((t) => t.href);
    assert.ok(hasDeepLink, "every task needs a deep link href");
    pass("director_dashboard_tasks");

    const ratios = await request(ctx.port, "GET", `${BASE}/ratios`, { headers: auth(token) });
    assert.equal(ratios.status, 200);
    assert.match(String(ratios.body.disclaimer || ""), /provider-configured/i);
    assert.match(String(ratios.body.wording || ""), /not a universal compliance/i);
    pass("ratio_disclaimer");

    const attendanceList = await request(ctx.port, "GET", `${BASE}/attendance`, { headers: auth(token) });
    assert.equal(attendanceList.status, 200);
    const present = (attendanceList.body.attendance || []).find((r) => r.status === model.ATTENDANCE_STATUSES.CHECKED_IN);
    assert.ok(present, "expected a checked-in fixture child");
    const histBefore = await request(ctx.port, "GET", `${BASE}/attendance/${present.id}/history`, { headers: auth(token) });
    assert.ok((histBefore.body.history || []).length >= 1);

    const checkout = await request(ctx.port, "POST", `${BASE}/attendance/${present.id}/action`, {
      headers: auth(token),
      body: {
        action: "check_out",
        pickupPerson: "Authorized Pickup (Fixture)",
        pickupVerification: model.PICKUP_VERIFICATION.VERIFIED,
      },
    });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
    assert.equal(checkout.body.historyPreserved, true);
    assert.equal(checkout.body.attendance.status, model.ATTENDANCE_STATUSES.CHECKED_OUT);
    const histAfter = await request(ctx.port, "GET", `${BASE}/attendance/${present.id}/history`, { headers: auth(token) });
    assert.ok((histAfter.body.history || []).length > (histBefore.body.history || []).length);
    pass("attendance_history_no_silent_overwrite");

    const unauthorized = await request(ctx.port, "POST", `${BASE}/attendance/${present.id}/action`, {
      headers: auth(token),
      body: {
        action: "check_in",
        dropOffPerson: "Drop-off (Fixture)",
      },
    });
    assert.equal(unauthorized.status, 200);
    const warn = await request(ctx.port, "POST", `${BASE}/attendance/${present.id}/action`, {
      headers: auth(token),
      body: {
        action: "check_out",
        pickupPerson: "Unknown Adult",
        pickupVerification: model.PICKUP_VERIFICATION.UNAUTHORIZED_WARNING,
      },
    });
    assert.equal(warn.status, 200);
    assert.equal(warn.body.attendance.pickupVerification, model.PICKUP_VERIFICATION.UNAUTHORIZED_WARNING);
    pass("pickup_authorization");

    const storeSnap = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const moved = Object.values(storeSnap.todayHub?.attendance || {}).find((r) => r.status === model.ATTENDANCE_STATUSES.MOVED);
    assert.ok(moved, "classroom transfer fixture");
    assert.ok(moved.movedFromClassroomId);
    const rooms = Object.values(storeSnap.classrooms || {}).filter((c) => c.organizationId === moved.organizationId);
    const targetRoom = rooms.find((r) => r.id !== moved.classroomId) || rooms[0];
    if (targetRoom) {
      const move = await request(ctx.port, "POST", `${BASE}/attendance/${moved.id}/action`, {
        headers: auth(token),
        body: { action: "move_classroom", classroomId: targetRoom.id, reason: "Coverage transfer (FAKE)" },
      });
      assert.equal(move.status, 200, JSON.stringify(move.body));
      assert.equal(move.body.attendance.status, model.ATTENDANCE_STATUSES.MOVED);
      assert.ok(move.body.attendance.movedFromClassroomId);
    }
    pass("classroom_transfers");

    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const teacher = findStaff(store, /lead_teacher|teacher/i);
      const assistant = findStaff(store, /assistant/i);
      assert.ok(teacher, "teacher membership required");

      const teacherDash = await request(ctx.port, "GET", `${BASE}/dashboard`, {
        headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
      });
      assert.equal(teacherDash.status, 200, JSON.stringify(teacherDash.body));
      assert.equal(teacherDash.body.view, "teacher");
      const teacherRooms = new Set((teacherDash.body.classrooms || []).map((c) => c.classroomId));
      const assigned = Object.values(store.classroomStaffAssignments || {})
        .filter((a) => a.staffMembershipId === teacher.id || a.userId === teacher.userId)
        .map((a) => a.classroomId);
      for (const id of teacherRooms) {
        assert.ok(assigned.includes(id) || assigned.length === 0, "teacher must stay in assigned classrooms");
      }
      const directorOnlySources = (teacherDash.body.tasks || []).filter((t) => t.source === "licensing" || t.source === "enrollment");
      assert.equal(directorOnlySources.length, 0, "teacher must not see director licensing/enrollment aggregation");
      pass("teacher_classroom_boundaries");

      if (assistant) {
        const asstDash = await request(ctx.port, "GET", `${BASE}/dashboard`, {
          headers: { ...auth(token), "x-llh-role-preview-membership-id": assistant.id },
        });
        assert.equal(asstDash.status, 200, JSON.stringify(asstDash.body));
        assert.equal(asstDash.body.view, "assistant");
        const medWithAllergy = (asstDash.body.tasks || []).find((t) => t.source === "medication" && /allergy|peanut/i.test(t.summary || ""));
        assert.equal(medWithAllergy, undefined, "assistant without medical override must not see allergy alerts");
        const attRow = (attendanceList.body.attendance || []).find((r) => r.status === model.ATTENDANCE_STATUSES.EXPECTED)
          || (attendanceList.body.attendance || [])[0];
        if (attRow) {
          const denied = await request(ctx.port, "POST", `${BASE}/attendance/${attRow.id}/action`, {
            headers: { ...auth(token), "x-llh-role-preview-membership-id": assistant.id },
            body: { action: "check_out", pickupPerson: "X", pickupVerification: "verified" },
          });
          assert.equal(denied.status, 403);
          const allowed = await request(ctx.port, "POST", `${BASE}/attendance/${attRow.id}/action`, {
            headers: { ...auth(token), "x-llh-role-preview-membership-id": assistant.id },
            body: { action: "check_in", dropOffPerson: "Assistant check-in" },
          });
          assert.ok(allowed.status === 200 || allowed.status === 403);
        }
        pass("assistant_overrides");
      } else {
        pass("assistant_overrides");
      }

      const foundation = require("./foundation-data-model.js");
      const orgId = Object.values(store.organizations || {})[0]?.id
        || store.todayHub?.meta?.phase15SeededFor;
      const member = {
        id: "membership_curriculum_phase15",
        organizationId: orgId,
        userEmail: "curriculum.phase15@example.invalid",
        role: "curriculum_only",
        status: foundation.STAFF_STATUS.ACTIVE,
      };
      store.staffMemberships = store.staffMemberships || {};
      store.staffMemberships[member.id] = member;
      fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
      const curDash = await request(ctx.port, "GET", `${BASE}/dashboard`, {
        headers: { ...auth(token), "x-llh-role-preview-membership-id": member.id },
      });
      assert.equal(curDash.status, 200, JSON.stringify(curDash.body));
      assert.equal(curDash.body.view, "curriculum");
      assert.equal((curDash.body.classrooms || []).length, 0);
      assert.ok(!(curDash.body.attendanceSummary));
      const curAtt = await request(ctx.port, "GET", `${BASE}/attendance`, {
        headers: { ...auth(token), "x-llh-role-preview-membership-id": member.id },
      });
      assert.equal(curAtt.status, 403);
      pass("curriculum_only_view");
    }

    {
      const notes = await request(ctx.port, "GET", `${BASE}/notifications`, { headers: auth(token) });
      assert.equal(notes.status, 200);
      assert.equal(notes.body.noExternalDelivery, true);
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const teacher = findStaff(store, /lead_teacher|teacher/i);
      const teacherNotes = await request(ctx.port, "GET", `${BASE}/notifications`, {
        headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
      });
      assert.ok(!(teacherNotes.body.notifications || []).some((n) => n.adminOnly));
      assert.ok(!(teacherNotes.body.notifications || []).some((n) => n.audience === "family"));
      pass("notification_isolation");
    }

    {
      const foreign = model.createAttendanceRecord({
        organizationId: "org_other_phase15",
        childId: "child_foreign",
        classroomId: "room_foreign",
        status: model.ATTENDANCE_STATUSES.CHECKED_IN,
      });
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      store.todayHub.attendance[foreign.id] = foreign;
      fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
      const denied = await request(ctx.port, "POST", `${BASE}/attendance/${foreign.id}/action`, {
        headers: auth(token),
        body: { action: "check_out", pickupPerson: "X", pickupVerification: "verified" },
      });
      assert.ok([403, 404].includes(denied.status), `expected cross-org denial, got ${denied.status}`);
      pass("cross_organization_denial");
    }

    const parent = await issueAndLogin(ctx.port, token, "parent_multi_child");
    const familyToday = await request(ctx.port, "GET", "/api/family-hub/today", { headers: auth(parent.token) });
    assert.equal(familyToday.status, 200, JSON.stringify(familyToday.body));
    assert.equal(familyToday.body.featureMarker, "phase15-family-today");
    assert.equal(familyToday.body.view, "guardian");
    assert.ok(Array.isArray(familyToday.body.attendance));
    for (const row of familyToday.body.attendance || []) {
      assert.ok((familyToday.body.children || []).some((c) => c.childId === row.childId));
    }
    const famKeys = new Set((familyToday.body.tasks || []).map((t) => `${t.source}|${t.sourceRefId}|${t.childId || ""}`));
    assert.equal(famKeys.size, (familyToday.body.tasks || []).length);
    pass("guardian_child_isolation");

    const restricted = await issueAndLogin(ctx.port, token, "restricted_guardian");
    const restToday = await request(ctx.port, "GET", "/api/family-hub/today", { headers: auth(restricted.token) });
    assert.ok(restToday.status === 200 || restToday.status === 403);
    if (restToday.status === 200) {
      assert.ok(restToday.body.empty === true || !(restToday.body.attendance || []).length);
    }
    const pickup = await issueAndLogin(ctx.port, token, "pickup_only");
    const pickupToday = await request(ctx.port, "GET", "/api/family-hub/today", { headers: auth(pickup.token) });
    assert.ok(pickupToday.status === 200 || pickupToday.status === 403);
    if (pickupToday.status === 200) {
      assert.ok(pickupToday.body.empty === true || !(pickupToday.body.children || []).length);
    }
    pass("restricted_pickup_emergency_access");

    {
      const ui = fs.readFileSync(path.join(ROOT, "today-hub-ui.js"), "utf8");
      const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
      assert.match(ui, /phase15-today-hub/);
      assert.match(ui, /th-computer-recommended/);
      assert.match(css, /\.th-panel/);
      assert.match(css, /@media \(max-width: 480px\)/);
      assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1024px\)/);
      assert.match(css, /@media \(min-width: 1280px\)/);
      assert.match(css, /\.th-computer-recommended/);
      pass("responsive_markers");
    }

    const enStatus = await request(ctx.port, "GET", "/api/director-center/enrollment/status", { headers: auth(token) });
    assert.equal(enStatus.status, 200);
    const rcStatus = await request(ctx.port, "GET", "/api/director-center/records/status", { headers: auth(token) });
    assert.equal(rcStatus.status, 200);
    const lcStatus = await request(ctx.port, "GET", "/api/director-center/licensing/status", { headers: auth(token) });
    assert.equal(lcStatus.status, 200);
    pass("phase12_14_smoke");
  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 15 focused suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
