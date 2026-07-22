#!/usr/bin/env node
"use strict";

/**
 * Phase 16 Staff Experience focused suite.
 * Fake data only. No payroll/banking/Stripe/email/SMS/push/live AI.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./staff-experience-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase16-admin@example.com";
const ADMIN_PASSWORD = "Phase16StaffExp!99";
const ADMIN_CODE = "phase16-staff-code";
const BASE = "/api/director-center/staff-experience";

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
  const storePath = path.join(os.tmpdir(), `llh-sx-phase16-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9600 + Math.floor(Math.random() * 400);
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
  await request(port, "POST", "/api/director-center/today/seed", { headers: auth(token), body: { reset: true } });
  await request(port, "POST", `${BASE}/seed`, { headers: auth(token), body: { reset: true } });
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
  {
    const store = { staffExperience: null };
    model.ensureStaffExperienceStore(store);
    const entry = model.createTimeEntry({ organizationId: "org", membershipId: "m1", type: model.TIME_ENTRY_TYPES.CLOCK_IN });
    store.staffExperience.timeEntries[entry.id] = entry;
    model.applyTimeAction(store, entry, { type: model.TIME_ENTRY_TYPES.CLOCK_OUT, action: "clock_out", reason: "end" }, { email: "a@b.c" });
    assert.equal(Object.keys(store.staffExperience.timeEntryHistory).length, 1);
    assert.match(model.RATIO_DISCLAIMER, /provider-configured/i);
    pass("time_history_unit");
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
    assert.equal(status.body.phase, 16);
    assert.equal(status.body.noPayroll, true);
    assert.equal(status.body.noOutboundEmail, true);
    assert.equal(status.body.noStripe, true);
    pass("provider_status");

    const directory = await request(ctx.port, "GET", `${BASE}/directory`, { headers: auth(token) });
    assert.equal(directory.status, 200, JSON.stringify(directory.body));
    assert.equal(directory.body.featureMarker, "phase16-staff-experience");
    assert.ok((directory.body.staff || []).length >= 5);
    assert.ok(directory.body.counts);
    assert.ok(directory.body.limits);
    assert.ok(!(directory.body.staff || []).some((s) => s.privateNotes));
    pass("staff_profiles_directory");

    const onboarding = await request(ctx.port, "GET", `${BASE}/onboarding`, { headers: auth(token) });
    assert.equal(onboarding.status, 200);
    assert.ok((onboarding.body.checklists || []).length >= 1);
    const checklistId = onboarding.body.checklists[0].id;
    const step = await request(ctx.port, "POST", `${BASE}/onboarding/${checklistId}`, {
      headers: auth(token),
      body: { step: "orientation", complete: true },
    });
    assert.equal(step.status, 200);
    assert.equal(step.body.externalSendDisabled, true);
    pass("onboarding");

    // Staff limit: fill until blocked (or confirm gate responds with 409 when at limit)
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const orgId = Object.values(store.organizations || {})[0]?.id;
      store.organizationEntitlements = store.organizationEntitlements || {};
      const entId = Object.keys(store.organizationEntitlements)[0] || "ent_phase16";
      store.organizationEntitlements[entId] = {
        ...(store.organizationEntitlements[entId] || {}),
        id: entId,
        organizationId: orgId,
        basePlanKey: "home_daycare",
        classroomAddOnQuantity: 0,
      };
      fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
      let hitLimit = false;
      for (let i = 0; i < 8; i += 1) {
        const invite = await request(ctx.port, "POST", `${BASE}/invite`, {
          headers: auth(token),
          body: { email: `phase16.limit${i}@example.invalid`, displayName: `Limit ${i}` },
        });
        if (invite.status === 409) {
          hitLimit = true;
          break;
        }
      }
      assert.ok(hitLimit, "expected staff limit enforcement");
      pass("staff_limit_enforcement");
    }

    const schedules = await request(ctx.port, "GET", `${BASE}/schedules`, { headers: auth(token) });
    assert.equal(schedules.status, 200);
    assert.equal(schedules.body.featureMarker, "phase16-schedule-manager");
    assert.equal(schedules.body.noExternalNotifications, true);
    assert.ok((schedules.body.history || []).length >= 1);
    assert.ok((schedules.body.shifts || []).some((s) => s.coverageGap));
    pass("scheduling_and_history");

    const store0 = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const teacher = findStaff(store0, /lead_teacher|teacher/i);
    assert.ok(teacher);

    const avail = listValues(store0.staffExperience.availability).filter((a) => a.membershipId === teacher.id);
    assert.ok(avail.length >= 1);
    pass("availability");

    const timeOffList = await request(ctx.port, "GET", `${BASE}/time-off`, { headers: auth(token) });
    assert.equal(timeOffList.status, 200);
    const pending = (timeOffList.body.requests || []).find((r) => r.status === "pending");
    assert.ok(pending);
    const approved = await request(ctx.port, "POST", `${BASE}/time-off/${pending.id}`, {
      headers: auth(token),
      body: { action: "approve", note: "Approved in testing", coverageAssignedMembershipId: store0.staffExperience.meta.phase16Ids.substituteMembershipId },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.decisionHistoryPreserved, true);
    assert.ok((approved.body.request.decisionHistory || []).length >= 2);
    pass("time_off");

    const clock = await request(ctx.port, "POST", `${BASE}/time-clock`, {
      headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
      body: { action: "clock_in", classroomId: Object.keys(store0.classrooms || {})[0] },
    });
    assert.equal(clock.status, 200, JSON.stringify(clock.body));
    assert.equal(clock.body.historyPreserved, true);
    assert.equal(clock.body.payrollProcessed, false);
    pass("time_clock");

    const corrections = await request(ctx.port, "GET", `${BASE}/corrections`, { headers: auth(token) });
    assert.equal(corrections.status, 200);
    const pendingCorr = (corrections.body.corrections || []).find((c) => c.status === "pending");
    assert.ok(pendingCorr, "missed punch correction fixture");
    const bad = await request(ctx.port, "POST", `${BASE}/corrections/${pendingCorr.id}`, {
      headers: auth(token),
      body: { status: "approved" },
    });
    assert.equal(bad.status, 400);
    const okCorr = await request(ctx.port, "POST", `${BASE}/corrections/${pendingCorr.id}`, {
      headers: auth(token),
      body: { status: "approved", reason: "Director verified missed punch (FAKE)" },
    });
    assert.equal(okCorr.status, 200);
    assert.equal(okCorr.body.historyPreserved, true);
    pass("missed_punch_corrections");

    const coverage = await request(ctx.port, "GET", `${BASE}/coverage`, { headers: auth(token) });
    assert.equal(coverage.status, 200);
    assert.match(String(coverage.body.ratioDisclaimer || ""), /provider-configured/i);
    assert.equal(coverage.body.autoMoveDisabled, true);
    assert.equal(coverage.body.noLegalComplianceClaim, true);
    const suggestion = (schedules.body.coverageSuggestions || [])[0];
    if (suggestion) {
      const assigned = await request(ctx.port, "POST", `${BASE}/schedules/assign-coverage`, {
        headers: auth(token),
        body: { suggestionId: suggestion.id, shiftId: suggestion.shiftId },
      });
      assert.equal(assigned.status, 200);
      assert.equal(assigned.body.autoMoved, false);
    }
    pass("ratio_coverage_connection");

    const training = await request(ctx.port, "GET", `${BASE}/training`, { headers: auth(token) });
    assert.equal(training.status, 200);
    assert.ok((training.body.categories || []).includes("CPR"));
    assert.ok((training.body.certifications || []).some((c) => c.status === "expiring_soon"));
    assert.ok((training.body.trainings || []).some((t) => t.status === "missing"));
    pass("qualifications_training_expiration");

    const self = await request(ctx.port, "GET", `${BASE}/self-service`, {
      headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
    });
    assert.equal(self.status, 200, JSON.stringify(self.body));
    assert.equal(self.body.featureMarker, "phase16-staff-self-service");
    assert.equal(self.body.privateNotesHidden, true);
    assert.equal(self.body.payHidden, true);
    assert.ok(self.body.permissionSummary?.plainLanguage?.length);
    pass("staff_self_service");

    const teacherProfile = (directory.body.staff || []).find((s) => s.membershipId === teacher.id);
    assert.ok(teacherProfile);
    const prof = await request(ctx.port, "GET", `${BASE}/profiles/${teacherProfile.id}`, { headers: auth(token) });
    assert.equal(prof.status, 200);
    assert.ok((prof.body.privateNotes || []).length >= 1);
    assert.ok(prof.body.permissionSummary?.plainLanguage?.length);
    const teacherSelfProf = await request(ctx.port, "GET", `${BASE}/profiles/${teacherProfile.id}`, {
      headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
    });
    assert.equal(teacherSelfProf.status, 200);
    assert.equal((teacherSelfProf.body.privateNotes || []).length, 0);
    pass("permission_summaries_and_sensitive_notes");

    const notesAsTeacher = await request(ctx.port, "GET", `${BASE}/private-notes`, {
      headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
    });
    assert.equal(notesAsTeacher.status, 403);
    pass("sensitive_note_isolation");

    const offboardTarget = (directory.body.staff || []).find((s) => /broad|assistant/i.test(s.displayName || "") && s.directoryStatus === "active")
      || (directory.body.staff || []).find((s) => s.directoryStatus === "active" && !/owner|director/i.test(s.role || ""));
    assert.ok(offboardTarget);
    const beforeMessages = Object.keys(JSON.parse(fs.readFileSync(ctx.storePath, "utf8")).familyMessaging?.messages || {}).length;
    const off = await request(ctx.port, "POST", `${BASE}/offboard`, {
      headers: auth(token),
      body: { membershipId: offboardTarget.membershipId, reasonCategory: "resignation", endDate: model.todayDate() },
    });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.accessRevoked, true);
    assert.equal(off.body.historyPreserved, true);
    assert.equal(off.body.childRecordsPreserved, true);
    const storeAfter = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    assert.equal(storeAfter.staffMemberships[offboardTarget.membershipId].status, "deactivated");
    const afterMessages = Object.keys(storeAfter.familyMessaging?.messages || {}).length;
    assert.equal(afterMessages, beforeMessages);
    pass("offboarding_and_history_preservation");

    {
      const assistant = findStaff(storeAfter, /assistant/i);
      const asstDir = await request(ctx.port, "GET", `${BASE}/directory`, {
        headers: { ...auth(token), "x-llh-role-preview-membership-id": assistant.id },
      });
      assert.equal(asstDir.status, 403);
      const asstSelf = await request(ctx.port, "GET", `${BASE}/self-service`, {
        headers: { ...auth(token), "x-llh-role-preview-membership-id": assistant.id },
      });
      assert.equal(asstSelf.status, 200);
      const asstSched = await request(ctx.port, "GET", `${BASE}/schedules`, {
        headers: { ...auth(token), "x-llh-role-preview-membership-id": teacher.id },
      });
      assert.equal(asstSched.status, 200);
      assert.ok((asstSched.body.shifts || []).every((s) => !s.membershipId || s.membershipId === teacher.id || s.coverageGap));
      pass("teacher_assistant_boundaries");
    }

    {
      const foreign = model.createStaffProfile({
        organizationId: "org_other_phase16",
        membershipId: "membership_foreign",
        displayName: "Foreign",
        email: "foreign@example.invalid",
      });
      storeAfter.staffExperience.profiles[foreign.id] = foreign;
      fs.writeFileSync(ctx.storePath, JSON.stringify(storeAfter, null, 2));
      const denied = await request(ctx.port, "GET", `${BASE}/profiles/${foreign.id}`, { headers: auth(token) });
      assert.ok([403, 404].includes(denied.status));
      pass("cross_organization_denial");
    }

    {
      const ui = fs.readFileSync(path.join(ROOT, "staff-experience-ui.js"), "utf8");
      const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
      assert.match(ui, /phase16-staff-experience/);
      assert.match(ui, /phase16-staff-self-service/);
      assert.match(css, /\.sx-panel/);
      assert.match(css, /@media \(max-width: 480px\)/);
      assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1024px\)/);
      assert.match(css, /@media \(min-width: 1280px\)/);
      pass("responsive_markers");
    }

    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      assert.equal(store.staffExperience?.meta?.noOutboundEmail, true);
      assert.equal(store.staffExperience?.meta?.noPayroll, true);
      assert.equal(store.staffExperience?.meta?.noStripe, true);
      pass("external_services_disabled");
    }

    const todayStatus = await request(ctx.port, "GET", "/api/director-center/today/status", { headers: auth(token) });
    assert.equal(todayStatus.status, 200);
    const lcStatus = await request(ctx.port, "GET", "/api/director-center/licensing/status", { headers: auth(token) });
    assert.equal(lcStatus.status, 200);
    pass("phase15_regression_smoke");

    const reports = await request(ctx.port, "GET", `${BASE}/reports`, { headers: auth(token) });
    assert.equal(reports.status, 200);
    assert.equal(reports.body.noPayroll, true);
    assert.equal(reports.body.noTaxReporting, true);
    pass("reports_foundation");
  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 16 focused suite: ${passed} PASS`);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
