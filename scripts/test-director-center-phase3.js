#!/usr/bin/env node
"use strict";

/**
 * Phase 3 — Teacher Classroom admin-preview workflow tests.
 * Fake preview data only. No emails. No Stripe. No AI calls. No production unlock.
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const assert = require("node:assert/strict");
const expansionFeatureFlags = require("./expansion-feature-flags");
const { EXPANSION_FEATURE_KEYS } = expansionFeatureFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase3-admin@example.com";
const ADMIN_PASSWORD = "Phase3AdminPass!99";
const ADMIN_CODE = "phase3-admin-code";
const PHASE3 = "/api/director-center/phase3";

function request(port, method, pathname, { headers = {}, body = null, query = "" } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname + query,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch {
        /* retry */
      }
      if (Date.now() - started > timeoutMs) return reject(new Error("Server health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function writeInitialStore(storePath) {
  fs.writeFileSync(
    storePath,
    JSON.stringify(
      {
        siteContent: {
          featureFlags: {
            [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: true,
            [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: false,
            [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: false,
          },
        },
      },
      null,
      2
    )
  );
}

async function startServer(env = {}) {
  const storePath = path.join(os.tmpdir(), `llh-dc-phase3-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  writeInitialStore(storePath);
  const port = 5200 + Math.floor(Math.random() * 900);
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
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW || "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "",
      SENDGRID_API_KEY: "",
      DISABLE_EMAIL_SENDS: "true",
      DISABLE_STRIPE: "true",
      DISABLE_AI: "true",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  try {
    await waitForHealth(port);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr}`);
  }
  return {
    port,
    storePath,
    readStore: () => JSON.parse(fs.readFileSync(storePath, "utf8")),
    writeStore: (store) => fs.writeFileSync(storePath, JSON.stringify(store, null, 2)),
    stop: () =>
      new Promise((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

async function adminLogin(port) {
  const login = await request(port, "POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(login.status, 200, `admin login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

function mondayIsoDate(input = "") {
  const raw = String(input || "").trim();
  const date = raw ? new Date(`${raw.slice(0, 10)}T00:00:00.000Z`) : new Date();
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function roleHeader(member) {
  return { "x-llh-role-preview-membership-id": member.membershipId || member.id };
}

function daySnapshotFilled(snapshot) {
  const weekly = snapshot && snapshot.weekly ? snapshot.weekly : {};
  return ["monday", "tuesday", "wednesday", "thursday", "friday"].every((day) => {
    const value = weekly[day] || {};
    return Boolean(value.dailyTheme && value.circleTime && value.activity1 && value.activity2 && value.activity3);
  });
}

function childInClassroom(children, classroomId) {
  return children.find((child) => child.classroomId === classroomId);
}

async function run() {
  const failures = [];
  const pass = (name) => console.log(`PASS ${name}`);
  const fail = (name, error) => {
    failures.push(`${name}: ${error && error.message ? error.message : error}`);
    console.error(`FAIL ${name}: ${error && error.message ? error.message : error}`);
  };

  try {
    const decision = expansionFeatureFlags.evaluateExpansionAccess({
      flagKey: EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER,
      storedFlags: { directorCenter: true, formsCenter: true, familyHub: true },
      environment: expansionFeatureFlags.resolveExpansionEnvironment({
        siteUrl: "https://app.littlelearnershubbyleah.com",
        env: { ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
      }),
      isVerifiedAdmin: true,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "production_locked");
    assert.equal(decision.environment.liveProduction, true);
    pass("production lock unit check reports production_locked");
  } catch (error) {
    fail("production lock unit check", error);
  }

  for (const [name, env] of [
    ["preview disabled", { ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "false" }],
    ["production host", { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" }],
  ]) {
    const locked = await startServer(env);
    try {
      const token = await adminLogin(locked.port);
      const res = await request(locked.port, "GET", `${PHASE3}/context`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-llh-role-preview-membership-id": "staff_fake_preview",
        },
      });
      assert.equal(res.status, 403);
      pass(`role preview header rejected when ${name}`);
    } catch (error) {
      fail(`role preview header rejected when ${name}`, error);
    } finally {
      await locked.stop();
    }
  }

  const server = await startServer();
  try {
    const token = await adminLogin(server.port);
    const auth = { Authorization: `Bearer ${token}` };

    let seedBody = null;
    let roleOptions = [];
    let classrooms = [];
    let allChildren = [];
    let firstRoom = null;
    let firstChild = null;
    let teacher = null;
    let deniedAssistant = null;
    let allowedAssistant = null;

    try {
      const flags = await request(server.port, "GET", "/api/foundation/feature-flags", { headers: auth });
      assert.equal(flags.status, 200);
      assert.equal(flags.body.flags.directorCenter, true);
      assert.equal(flags.body.flags.formsCenter, false);
      assert.equal(flags.body.flags.familyHub, false);
      assert.equal(flags.body.policy.productionLocked, false);
      pass("formsCenter and familyHub remain forced off");
    } catch (error) {
      fail("formsCenter and familyHub forced off", error);
    }

    try {
      const seed = await request(server.port, "POST", `${PHASE3}/seed`, {
        headers: auth,
        body: { scenario: "small_center" },
      });
      assert.equal(seed.status, 200, JSON.stringify(seed.body));
      seedBody = seed.body;
      assert.equal(seed.body.emailSent, false);
      assert.equal(seed.body.stripeTouched, false);
      if (Object.prototype.hasOwnProperty.call(seed.body, "aiTouched")) assert.equal(seed.body.aiTouched, false);
      const context = await request(server.port, "GET", `${PHASE3}/context`, { headers: auth });
      assert.equal(context.status, 200, JSON.stringify(context.body));
      assert.equal(context.body.preview, true);
      assert.equal(context.body.fakeDataOnly, true);
      classrooms = context.body.classroomsVisible || [];
      assert.ok(classrooms.length >= 3);
      firstRoom = classrooms[0];
      const children = await request(server.port, "GET", `${PHASE3}/children`, { headers: auth });
      allChildren = children.body.children || [];
      firstChild = allChildren.find((child) => child.classroomId === firstRoom.id) || allChildren[0];
      assert.ok(firstChild && firstChild.id);
      pass("admin preview access for Phase 3 context and safe seed flags");
    } catch (error) {
      fail("admin preview access for Phase 3 context", error);
    }

    try {
      const page = await request(server.port, "GET", "/");
      assert.equal(page.status, 200);
      assert.match(page.raw, /teacher-center-ui\.js\?v=20260721-phase4/);
      assert.match(page.raw, /forms-center-ui\.js\?v=20260721-phase4/);
      assert.match(page.raw, /view-teacher-center/);
      pass("HTML includes Teacher Center shell and script");
    } catch (error) {
      fail("HTML includes teacher-center-ui.js", error);
    }

    try {
      const context = await request(server.port, "GET", `${PHASE3}/context`, { headers: auth });
      assert.equal(context.status, 200);
      assert.equal(context.body.classroomsVisible.length, classrooms.length);
      assert.ok(context.body.permissions.actions.viewAllClassrooms);
      pass("director owner accesses all classrooms");
    } catch (error) {
      fail("director accesses all classrooms", error);
    }

    try {
      const options = await request(server.port, "GET", `${PHASE3}/role-preview-options`, { headers: auth });
      assert.equal(options.status, 200);
      roleOptions = options.body.memberships || [];
      teacher = roleOptions.find((member) => member.role === "lead_teacher" && member.status === "active" && member.assignedClassrooms.length === 1);
      assert.ok(teacher, "active single-classroom lead teacher missing");
      const ownerRoleBefore = server.readStore().staffMemberships[seedBody.ownerMembershipId].role;
      const teacherContext = await request(server.port, "GET", `${PHASE3}/context`, {
        headers: { ...auth, ...roleHeader(teacher) },
      });
      assert.equal(teacherContext.status, 200, JSON.stringify(teacherContext.body));
      assert.equal(teacherContext.body.rolePreview.active, true);
      assert.equal(teacherContext.body.actor.role, "lead_teacher");
      assert.deepEqual(
        teacherContext.body.classroomsVisible.map((room) => room.id).sort(),
        teacher.assignedClassrooms.map((room) => room.id).sort()
      );
      const otherRoom = classrooms.find((room) => !teacher.assignedClassrooms.some((assigned) => assigned.id === room.id));
      assert.ok(otherRoom, "teacher denial classroom missing");
      const deniedCalendar = await request(server.port, "GET", `${PHASE3}/calendar`, {
        headers: { ...auth, ...roleHeader(teacher) },
        query: `?classroomId=${encodeURIComponent(otherRoom.id)}`,
      });
      assert.equal(deniedCalendar.status, 403);
      assert.equal(server.readStore().staffMemberships[seedBody.ownerMembershipId].role, ownerRoleBefore);
      pass("role preview scopes teacher and preserves owner membership role");
    } catch (error) {
      fail("teacher role preview scope and owner role preservation", error);
    }

    try {
      const store = server.readStore();
      const overrides = Object.values(store.assistantPermissionOverrides || {});
      allowedAssistant = roleOptions.find((member) => (
        member.role === "assistant_staff"
        && member.status === "active"
        && member.assignedClassrooms.length
        && overrides.some((override) => override.staffMembershipId === member.membershipId && override.permissions?.createDailyLogs === true)
      ));
      deniedAssistant = roleOptions.find((member) => (
        member.role === "assistant_staff"
        && member.status === "active"
        && member.assignedClassrooms.length
        && member.membershipId !== allowedAssistant?.membershipId
      ));
      assert.ok(allowedAssistant, "allowed assistant missing");
      assert.ok(deniedAssistant, "denied assistant missing");
      Object.keys(store.assistantPermissionOverrides || {}).forEach((id) => {
        if (store.assistantPermissionOverrides[id].staffMembershipId === deniedAssistant.membershipId) {
          delete store.assistantPermissionOverrides[id];
        }
      });
      server.writeStore(store);

      const deniedRoomId = deniedAssistant.assignedClassrooms[0].id;
      const allowedRoomId = allowedAssistant.assignedClassrooms[0].id;
      const deniedChild = childInClassroom(allChildren, deniedRoomId);
      const allowedChild = childInClassroom(allChildren, allowedRoomId);
      assert.ok(deniedChild, "denied assistant child missing");
      assert.ok(allowedChild, "allowed assistant child missing");
      const denied = await request(server.port, "POST", `${PHASE3}/daily-logs`, {
        headers: { ...auth, ...roleHeader(deniedAssistant) },
        body: { childId: deniedChild.id, classroomId: deniedRoomId, date: mondayIsoDate(), attendance: "present" },
      });
      assert.equal(denied.status, 403);
      const allowed = await request(server.port, "POST", `${PHASE3}/daily-logs`, {
        headers: { ...auth, ...roleHeader(allowedAssistant) },
        body: { childId: allowedChild.id, classroomId: allowedRoomId, date: mondayIsoDate(), attendance: "present", teacherNotes: "Assistant override allowed" },
      });
      assert.equal(allowed.status, 201, JSON.stringify(allowed.body));
      assert.equal(allowed.body.dailyLogs.length, 1);
      pass("assistant denied without override and allowed with daily-log override");
    } catch (error) {
      fail("assistant override daily log access", error);
    }

    try {
      assert.ok(seedBody.report.foreignChildId);
      assert.ok(seedBody.report.foreignClassroomId);
      const foreignChild = await request(server.port, "GET", `${PHASE3}/children/${encodeURIComponent(seedBody.report.foreignChildId)}`, { headers: auth });
      assert.equal(foreignChild.status, 403);
      const foreignCalendar = await request(server.port, "GET", `${PHASE3}/calendar`, {
        headers: auth,
        query: `?classroomId=${encodeURIComponent(seedBody.report.foreignClassroomId)}`,
      });
      assert.equal(foreignCalendar.status, 404);
      pass("cross-org child and classroom access denied");
    } catch (error) {
      fail("cross-org child/classroom denied", error);
    }

    try {
      const roomId = deniedAssistant.assignedClassrooms[0].id;
      const child = childInClassroom(allChildren, roomId);
      assert.ok(child, "medical redaction child missing");
      const patch = await request(server.port, "PATCH", `${PHASE3}/assistant-permissions/${encodeURIComponent(deniedAssistant.membershipId)}`, {
        headers: auth,
        body: { permissions: { viewChildProfiles: true } },
      });
      assert.equal(patch.status, 200, JSON.stringify(patch.body));
      const profile = await request(server.port, "GET", `${PHASE3}/children/${encodeURIComponent(child.id)}`, {
        headers: { ...auth, ...roleHeader(deniedAssistant) },
      });
      assert.equal(profile.status, 200, JSON.stringify(profile.body));
      assert.equal(profile.body.child.profile.medicalInformation.redacted, true);
      assert.equal(profile.body.child.profile.allergies.redacted, true);
      pass("medical and allergy fields redacted without CHILD_VIEW_MEDICAL");
    } catch (error) {
      fail("medical redaction", error);
    }

    let createdAssignment = null;
    try {
      const weekStart = addDays(mondayIsoDate(), 7);
      const assign = await request(server.port, "POST", `${PHASE3}/calendar/assign`, {
        headers: auth,
        body: {
          classroomId: firstRoom.id,
          weekStart,
          lessonPlanId: "phase3-test-sparse",
          lessonPlanTitle: "Sparse Phase 3 Test Plan",
          snapshot: { lessonPlanTitle: "Sparse Phase 3 Test Plan", weekly: { monday: { dailyTheme: "Only Monday" } } },
        },
      });
      assert.equal(assign.status, 201, JSON.stringify(assign.body));
      createdAssignment = assign.body.assignment;
      assert.equal(createdAssignment.weekStartDate, weekStart);
      assert.ok(daySnapshotFilled(createdAssignment.snapshot));
      const replaceNoConfirm = await request(server.port, "POST", `${PHASE3}/calendar/replace`, {
        headers: auth,
        body: {
          assignmentId: createdAssignment.id,
          lessonPlanId: "phase3-test-replace",
          lessonPlanTitle: "Replacement Without Confirm",
        },
      });
      assert.equal(replaceNoConfirm.status, 409);
      assert.equal(replaceNoConfirm.body.code, "confirmation_required");
      const replaceConfirm = await request(server.port, "POST", `${PHASE3}/calendar/replace`, {
        headers: auth,
        body: {
          assignmentId: createdAssignment.id,
          lessonPlanId: "phase3-test-replace",
          lessonPlanTitle: "Replacement With Confirm",
          confirm: true,
        },
      });
      assert.equal(replaceConfirm.status, 200, JSON.stringify(replaceConfirm.body));
      assert.equal(replaceConfirm.body.previousAssignment.status, "replaced");
      assert.equal(replaceConfirm.body.assignment.status, "active");
      assert.ok(daySnapshotFilled(replaceConfirm.body.assignment.snapshot));
      pass("assign lesson fills weekdays and replacement requires confirmation");
    } catch (error) {
      fail("assign and replace lesson", error);
    }

    try {
      const roomChildren = allChildren.filter((child) => child.classroomId === firstRoom.id).slice(0, 2);
      assert.equal(roomChildren.length, 2, "need two children in first room");
      const group = await request(server.port, "POST", `${PHASE3}/daily-logs`, {
        headers: auth,
        body: {
          childIds: roomChildren.map((child) => child.id),
          classroomId: firstRoom.id,
          date: mondayIsoDate(),
          attendance: "present",
          activities: "Group daily log test",
        },
      });
      assert.equal(group.status, 201, JSON.stringify(group.body));
      assert.equal(group.body.dailyLogs.length, 2);
      assert.ok(group.body.groupBatchId);
      assert.ok(group.body.dailyLogs.every((log) => log.groupBatchId === group.body.groupBatchId));
      pass("group daily log creates per-child records with one groupBatchId");
    } catch (error) {
      fail("group daily log", error);
    }

    let goalId = "";
    try {
      const observation = await request(server.port, "POST", `${PHASE3}/observations`, {
        headers: auth,
        body: {
          childId: firstChild.id,
          classroomId: firstChild.classroomId,
          date: mondayIsoDate(),
          text: "Shared with family should remain preview-disabled",
          sharingStatus: "shared_with_family",
        },
      });
      assert.equal(observation.status, 201, JSON.stringify(observation.body));
      assert.equal(observation.body.observation.sharingStatus, "shared_with_family");
      assert.equal(observation.body.observation.familyShareEnabled, false);
      const goal = await request(server.port, "POST", `${PHASE3}/goals`, {
        headers: auth,
        body: {
          childId: firstChild.id,
          classroomId: firstChild.classroomId,
          learningDomain: "Language",
          description: "Use new words during center play.",
          targetOrNextStep: "Offer picture prompts.",
        },
      });
      assert.equal(goal.status, 201, JSON.stringify(goal.body));
      goalId = goal.body.goal.id;
      const progress = await request(server.port, "POST", `${PHASE3}/goals/${encodeURIComponent(goalId)}/progress`, {
        headers: auth,
        body: { text: "Used two new words today.", date: mondayIsoDate() },
      });
      assert.equal(progress.status, 201, JSON.stringify(progress.body));
      assert.ok(progress.body.goal.progressNotes.some((note) => note.id === progress.body.progress.id));
      pass("observation sharing remains disabled and goal progress saves");
    } catch (error) {
      fail("observation sharing and goal progress", error);
    }

    try {
      const timeline = await request(server.port, "GET", `${PHASE3}/children/${encodeURIComponent(firstChild.id)}/timeline`, { headers: auth });
      assert.equal(timeline.status, 200, JSON.stringify(timeline.body));
      assert.ok(Array.isArray(timeline.body.timeline));
      assert.ok(timeline.body.timeline.length >= 1);
      pass("child timeline returns items");
    } catch (error) {
      fail("timeline returns items", error);
    }

    try {
      const dryRun = await request(server.port, "GET", `${PHASE3}/migration-dry-run`, { headers: auth });
      assert.equal(dryRun.status, 200);
      assert.equal(dryRun.body.applied, false);
      assert.equal(dryRun.body.fakeDataOnly, true);
      pass("migration dry-run is unapplied and fake-data only");
    } catch (error) {
      fail("migration dry-run", error);
    }
  } finally {
    await server.stop();
  }

  try {
    const check = spawnSync("npm", ["run", "check"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
    pass("nested npm run check");
  } catch (error) {
    fail("nested npm run check", error);
  }

  if (failures.length) {
    console.error("\nPhase 3 failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log("\nPhase 3 Teacher Classroom tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
