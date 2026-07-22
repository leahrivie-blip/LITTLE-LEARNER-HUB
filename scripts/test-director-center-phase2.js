#!/usr/bin/env node
"use strict";

/**
 * Phase 2 — Director Center private admin-preview workflow tests.
 * Fake preview data only. No emails. No Stripe. No production unlock.
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const assert = require("assert");
const { EXPANSION_FEATURE_KEYS } = require("./expansion-feature-flags");
const orgPermissions = require("./org-permissions");
const { PLAN_KEYS, PLANNED_PLAN_CATALOG, FEATURE_ENTITLEMENTS } = require("./entitlement-model");

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase2-admin@example.com";
const ADMIN_PASSWORD = "Phase2AdminPass!99";
const ADMIN_CODE = "phase2-admin-code";

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
        res.on("data", (c) => {
          raw += c;
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

async function startServer(env = {}) {
  const storePath = path.join(os.tmpdir(), `llh-dc-phase2-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
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
  const port = 4500 + Math.floor(Math.random() * 1000);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
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
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (c) => {
    stderr += String(c);
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
  assert.strictEqual(login.status, 200, `admin login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

async function run() {
  const failures = [];
  const pass = (name) => console.log(`PASS ${name}`);
  const fail = (name, err) => {
    failures.push(`${name}: ${err && err.message ? err.message : err}`);
    console.error(`FAIL ${name}: ${err && err.message ? err.message : err}`);
  };

  // Production remains locked
  {
    const server = await startServer({
      SITE_URL: "https://littlelearnershubbyleah.com",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
    });
    try {
      const token = await adminLogin(server.port);
      const flags = await request(server.port, "GET", "/api/foundation/feature-flags", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(flags.body.flags.directorCenter, false);
      assert.strictEqual(flags.body.flags.formsCenter, false);
      assert.strictEqual(flags.body.flags.familyHub, false);
      assert.strictEqual(flags.body.policy.productionLocked, true);
      const seed = await request(server.port, "POST", "/api/director-center/seed", {
        headers: { Authorization: `Bearer ${token}` },
        body: { scenario: "small_center" },
      });
      assert.strictEqual(seed.status, 403);
      pass("production remains locked (Director/Forms/Family OFF)");
    } catch (e) {
      fail("production lock", e);
    } finally {
      await server.stop();
    }
  }

  const server = await startServer();
  try {
    const token = await adminLogin(server.port);
    const auth = { Authorization: `Bearer ${token}` };

    {
      const flags = await request(server.port, "GET", "/api/foundation/feature-flags", { headers: auth });
      assert.strictEqual(flags.body.flags.directorCenter, true);
      assert.strictEqual(flags.body.flags.formsCenter, false);
      assert.strictEqual(flags.body.flags.familyHub, false);
      assert.strictEqual(flags.body.viewer.canAccessDirectorCenter, true);
      pass("Forms Center and Family Hub remain OFF; Director preview ON for admin");
    }

    {
      const page = await request(server.port, "GET", "/");
      assert.ok(!String(page.raw).includes('data-nav-target="director-center"'));
      const unauth = await request(server.port, "GET", "/api/director-center/overview");
      assert.strictEqual(unauth.status, 403);
      const flags = await request(server.port, "GET", "/api/foundation/feature-flags");
      assert.strictEqual(flags.body.viewer.canAccessDirectorCenter, false);
      assert.strictEqual(flags.body.flags.directorCenter, false);
      pass("regular users blocked from UI signal and APIs");
    }

    {
      const rejected = await request(server.port, "GET", "/api/director-center/overview", {
        query: `?adminToken=${encodeURIComponent(token)}`,
      });
      assert.strictEqual(rejected.status, 403);
      assert.strictEqual(rejected.body.code, "query_admin_token_rejected");
      const foundation = await request(server.port, "GET", "/api/foundation/status", {
        query: `?adminToken=${encodeURIComponent(token)}`,
      });
      assert.strictEqual(foundation.status, 403);
      pass("query-string admin tokens rejected for Director + foundation APIs");
    }

    {
      const ok = await request(server.port, "GET", "/api/foundation/status", { headers: auth });
      assert.strictEqual(ok.status, 200);
      const entitlements = await request(server.port, "GET", "/api/foundation/entitlements", { headers: auth });
      assert.strictEqual(entitlements.status, 200);
      pass("internal foundation endpoints require verified admin access");
    }

    {
      const seed = await request(server.port, "POST", "/api/director-center/seed", {
        headers: auth,
        body: { scenario: "small_center" },
      });
      assert.strictEqual(seed.status, 200, JSON.stringify(seed.body));
      assert.strictEqual(seed.body.emailSent, false);
      assert.strictEqual(seed.body.stripeTouched, false);
      assert.ok(/Admin Preview/i.test(seed.body.label || ""));
      const overview = await request(server.port, "GET", "/api/director-center/overview", { headers: auth });
      assert.strictEqual(overview.status, 200);
      assert.ok(overview.body.programProfile?.programName || overview.body.organization?.name);
      assert.ok(overview.body.metrics.activeClassrooms >= 1);
      assert.ok(Array.isArray(overview.body.attention));
      pass("seed fake preview + director overview");
    }

    {
      const created = await request(server.port, "POST", "/api/director-center/classrooms", {
        headers: auth,
        body: { name: "Phase2 Room", ageGroup: "Toddlers", capacity: 10, color: "#7c3aed", description: "Test room" },
      });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      const id = created.body.classroom.id;
      assert.ok(id.startsWith("classroom_"));
      const edited = await request(server.port, "PATCH", `/api/director-center/classrooms/${id}`, {
        headers: auth,
        body: { name: "Phase2 Room Edited", capacity: 12 },
      });
      assert.strictEqual(edited.status, 200);
      assert.strictEqual(edited.body.classroom.name, "Phase2 Room Edited");
      assert.strictEqual(edited.body.classroom.capacity, 12);
      pass("creating and editing classrooms");
    }

    {
      const list = await request(server.port, "GET", "/api/director-center/classrooms?status=active", { headers: auth });
      const active = list.body.classrooms[0];
      assert.ok(active?.id);
      const preview = await request(server.port, "POST", `/api/director-center/classrooms/${active.id}/archive`, {
        headers: auth,
        body: {},
      });
      assert.strictEqual(preview.status, 200);
      assert.strictEqual(preview.body.requiresConfirmation, true);
      assert.ok(typeof preview.body.assignedChildren === "number");
      const archived = await request(server.port, "POST", `/api/director-center/classrooms/${active.id}/archive`, {
        headers: auth,
        body: { confirm: true },
      });
      assert.strictEqual(archived.status, 200);
      assert.strictEqual(archived.body.classroom.status, "archived");
      assert.ok(archived.body.classroom.archivedAt);
      assert.strictEqual(archived.body.preserved, true);
      const children = await request(server.port, "GET", "/api/director-center/children", { headers: auth });
      assert.ok(children.body.children.length > 0);
      const restored = await request(server.port, "POST", `/api/director-center/classrooms/${active.id}/restore`, {
        headers: auth,
        body: {},
      });
      assert.strictEqual(restored.status, 200);
      assert.strictEqual(restored.body.classroom.status, "active");
      pass("archiving and restoring classrooms (records retained)");
    }

    {
      const invite = await request(server.port, "POST", "/api/director-center/staff/invite", {
        headers: auth,
        body: { email: "new.preview.teacher@example.com", name: "New Preview Teacher", role: "lead_teacher" },
      });
      assert.strictEqual(invite.status, 201, JSON.stringify(invite.body));
      assert.strictEqual(invite.body.emailSent, false);
      assert.strictEqual(invite.body.membership.emailSent, false);
      assert.strictEqual(invite.body.membership.status, "invitation_pending");
      const staffId = invite.body.membership.id;
      const rooms = await request(server.port, "GET", "/api/director-center/classrooms?status=active", { headers: auth });
      const roomId = rooms.body.classrooms[0].id;
      const assigned = await request(server.port, "PATCH", `/api/director-center/staff/${staffId}`, {
        headers: auth,
        body: { classroomIds: [roomId] },
      });
      assert.strictEqual(assigned.status, 200);
      const staffList = await request(server.port, "GET", "/api/director-center/staff", { headers: auth });
      const member = staffList.body.staff.find((row) => row.id === staffId);
      assert.ok(member.assignedClassrooms.some((room) => room.id === roomId));
      pass("creating staff preview records + assigning staff to classrooms (no email)");
    }

    {
      const children = await request(server.port, "GET", "/api/director-center/children", { headers: auth });
      const child = children.body.children.find((c) => c.classroomId) || children.body.children[0];
      const rooms = await request(server.port, "GET", "/api/director-center/classrooms?status=active", { headers: auth });
      const fromId = child.classroomId || rooms.body.classrooms[0].id;
      const toRoom = rooms.body.classrooms.find((c) => c.id !== fromId) || rooms.body.classrooms[0];
      await request(server.port, "POST", "/api/director-center/children/assign", {
        headers: auth,
        body: { childIds: [child.id], classroomId: fromId },
      });
      const moved = await request(server.port, "POST", "/api/director-center/children/assign", {
        headers: auth,
        body: { childIds: [child.id], classroomId: toRoom.id },
      });
      assert.strictEqual(moved.status, 201, JSON.stringify(moved.body));
      assert.ok(moved.body.assignment?.id);
      const refreshed = await request(server.port, "GET", "/api/director-center/children", { headers: auth });
      const updated = refreshed.body.children.find((row) => row.id === child.id);
      assert.ok(updated.history.length >= 2);
      assert.ok(updated.history.some((a) => a.status === "historical" && a.endsAt));
      assert.ok(updated.history.some((a) => a.status === "active" && a.classroomId === toRoom.id));
      pass("assigning/moving children while retaining assignment history");
    }

    {
      await request(server.port, "POST", "/api/director-center/seed", {
        headers: auth,
        body: { scenario: "home_daycare" },
      });
      const foreign = await request(server.port, "GET", "/api/director-center/classrooms/classroom_not_in_org", {
        headers: auth,
      });
      assert.strictEqual(foreign.status, 404);
      const denied = orgPermissions.evaluateAccess({
        store: {
          staffMemberships: {},
          classroomStaffAssignments: {},
          childGuardianRelationships: {},
          classroomChildAssignments: {},
        },
        organizationId: "org_someone_else",
        actor: { userId: "user_x", userEmail: "x@example.com", role: "assistant" },
        action: orgPermissions.ACTIONS.ORG_MANAGE_CLASSROOMS,
      });
      assert.strictEqual(denied.allowed, false);
      pass("cross-organization access denial");
    }

    {
      await request(server.port, "POST", "/api/director-center/seed", {
        headers: auth,
        body: { scenario: "at_limit" },
      });
      const limits = await request(server.port, "GET", "/api/director-center/limits", { headers: auth });
      assert.strictEqual(limits.status, 200);
      assert.strictEqual(limits.body.limits.classroomAtLimit, true);
      const blocked = await request(server.port, "POST", "/api/director-center/classrooms", {
        headers: auth,
        body: { name: "Over Limit Room", ageGroup: "Mixed", capacity: 8 },
      });
      assert.strictEqual(blocked.status, 409);
      assert.ok(String(blocked.body.error).toLowerCase().includes("classroom") || blocked.body.code === "classroom_limit_reached" || blocked.body.code === "home_daycare_upgrade_recommended");
      pass("classroom limits enforced on server");
    }

    {
      const limits = await request(server.port, "GET", "/api/director-center/limits", { headers: auth });
      assert.strictEqual(limits.body.limits.staffAtLimit, true);
      const blocked = await request(server.port, "POST", "/api/director-center/staff/invite", {
        headers: auth,
        body: { email: "over.limit@example.com", name: "Over Limit", role: "assistant" },
      });
      assert.strictEqual(blocked.status, 409);
      assert.ok(String(blocked.body.error).toLowerCase().includes("staff") || blocked.body.code === "staff_limit_reached");
      pass("staff limits enforced on server");
    }

    {
      await request(server.port, "POST", "/api/director-center/seed", {
        headers: auth,
        body: { scenario: "home_daycare" },
      });
      const limits = await request(server.port, "GET", "/api/director-center/limits", { headers: auth });
      assert.ok(limits.body.limits.upgradeRecommendation?.recommendUpgrade || limits.body.upgradeRecommendation?.recommendUpgrade || limits.body.limits.messages?.homeDaycareUpgrade);
      const msg = [
        limits.body.limits.upgradeRecommendation?.message,
        limits.body.upgradeRecommendation?.message,
        limits.body.limits.messages?.homeDaycareUpgrade,
        limits.body.limits.messages?.addOnUpgrade,
      ].filter(Boolean).join(" ");
      assert.ok(/upgrading your plan will save you money|upgrade to a center plan/i.test(msg));
      const blocked = await request(server.port, "POST", "/api/director-center/classrooms", {
        headers: auth,
        body: { name: "Second Home Room", ageGroup: "Mixed", capacity: 6 },
      });
      assert.strictEqual(blocked.status, 409);
      pass("classroom add-on / upgrade recommendation simulation (no checkout)");
    }

    {
      await request(server.port, "POST", "/api/director-center/seed", {
        headers: auth,
        body: { scenario: "small_center" },
      });
      const updated = await request(server.port, "PATCH", "/api/director-center/program-profile", {
        headers: auth,
        body: { programName: "Updated Preview Center", phone: "(555) 999-0000", licenseNumber: "LIC-NEW" },
      });
      assert.strictEqual(updated.status, 200);
      assert.strictEqual(updated.body.programProfile.programName, "Updated Preview Center");
      pass("program profile editable in preview");
    }

    {
      const roles = await request(server.port, "GET", "/api/director-center/roles-permissions", { headers: auth });
      assert.strictEqual(roles.status, 200);
      assert.ok(roles.body.catalog.rolePermissions);
      assert.ok(roles.body.catalog.actions);
      pass("roles and permissions matrix available");
    }

    {
      const page = await request(server.port, "GET", "/");
      assert.ok(page.raw.includes("platform-perf.js"), "platform-perf loader present");
      assert.ok(page.raw.includes('data-view="director-center"'));
      const perf = fs.readFileSync(path.join(__dirname, "..", "platform-perf.js"), "utf8");
      assert.ok(perf.includes("director-center-ui.js"), "Director Center lazy-loaded via platform-perf");
      pass("Director Center UI assets present");
    }

    {
      const plan = PLANNED_PLAN_CATALOG[PLAN_KEYS.CURRICULUM_ONLY];
      assert.ok(plan.excludes.includes(FEATURE_ENTITLEMENTS.DIRECTOR_CENTER));
      assert.strictEqual(plan.classroomLimit, 0);
      assert.strictEqual(plan.allowsClassroomAddOns, false);
      pass("Curriculum Only plan excludes Director Center / classrooms / add-ons");
    }
  } catch (e) {
    fail("phase2 suite", e);
  } finally {
    await server.stop();
  }

  {
    try {
      const check = spawnSync("npm", ["run", "check"], { cwd: ROOT, encoding: "utf8" });
      assert.strictEqual(check.status, 0, check.stderr || check.stdout);
      pass("npm run check");
      const foundation = spawnSync("npm", ["run", "test:director-family-foundation"], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 120000,
      });
      assert.strictEqual(foundation.status, 0, foundation.stderr || foundation.stdout);
      pass("existing director-family-foundation tests");
    } catch (e) {
      fail("existing checks", e);
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("\nAll Phase 2 Director Center tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
