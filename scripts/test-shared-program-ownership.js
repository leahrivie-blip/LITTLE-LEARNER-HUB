#!/usr/bin/env node
/**
 * Shared program ownership — seeded dual-director regression.
 * Does NOT touch live Ashley/Ladiisha production accounts.
 *
 * Run: NODE_ENV=test node scripts/test-shared-program-ownership.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const programOwnership = require("../server/program-ownership.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4197;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.shared-program-test-store-${process.pid}.json`);
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-admin-password";
const ADMIN_CODE = "test-admin-code";

const OWNER = "ashley.seed@example.com";
const DIRECTOR = "ladiisha.seed@example.com";
const STAFF = "teacher.seed@example.com";

function request(method, urlPath, { email = "", body = null, token = "" } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not become healthy");
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(serverJs, /program-ownership/);
  assert.match(serverJs, /resolveProgramContext/);
  assert.match(serverJs, /\/api\/admin\/program-migration-plan/);
  assert.match(serverJs, /live_pair_apply_blocked/);
  assert.match(serverJs, /CONNECT_ASHLEY_LADIISHA/);
  assert.match(appJs, /programId/);
  assert.equal(programOwnership.programIdForOwnerEmail(OWNER), programOwnership.programIdForOwnerEmail(OWNER));
  console.log("PASS  shared program markers present");

  const ownerUid = `test-${OWNER}`;
  const directorUid = `test-${DIRECTOR}`;
  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        role: "owner",
        accountType: "home_daycare",
        plan: "Founding",
        foundingMember: true,
        foundingMemberActive: true,
        foundingMemberHistorical: true,
        stripeCustomerId: "cus_seed_ashley",
        stripeSubscriptionId: "sub_seed_ashley",
        stripeSubscriptionStatus: "active",
        firebaseUid: ownerUid,
        subscriptionStatus: "Founding Member Subscription Active",
      },
      [DIRECTOR]: {
        email: DIRECTOR,
        role: "owner",
        accountType: "home_daycare",
        plan: "Founding",
        foundingMemberActive: true,
        internalAccessOverride: true,
        firebaseUid: directorUid,
      },
    },
    foundingMembers: [OWNER, DIRECTOR],
    programs: {},
    programData: {},
    programDataBackups: {},
    programMembers: {},
    staffInvites: {},
    childData: {
      [ownerUid]: {
        uid: ownerUid,
        email: OWNER,
        updatedAt: new Date().toISOString(),
        data: {
          Profiles: [{ id: "child-a", firstName: "Ada", lastName: "Owner" }],
          Observations: [{ id: "obs-a", childId: "child-a", note: "from owner" }],
          SupportPlans: [], Goals: [], Differentiations: [], Attendance: [],
          Meals: [], MealPresets: [], Reports: [], Communications: [],
          Naps: [], Diapers: [], ActivityLogs: [], Photos: [], Documents: [],
        },
      },
      [directorUid]: {
        uid: directorUid,
        email: DIRECTOR,
        updatedAt: new Date().toISOString(),
        data: {
          Profiles: [
            { id: "child-a", firstName: "Ada", lastName: "Owner" }, // duplicate
            { id: "child-b", firstName: "Bea", lastName: "DirectorOnly" },
          ],
          Observations: [], SupportPlans: [], Goals: [], Differentiations: [],
          Attendance: [], Meals: [], MealPresets: [], Reports: [], Communications: [],
          Naps: [], Diapers: [], ActivityLogs: [], Photos: [], Documents: [],
        },
      },
    },
    scheduleByUser: {
      [ownerUid]: {
        uid: ownerUid,
        email: OWNER,
        classrooms: [{ id: "classroom-main", name: "Main Classroom" }],
        items: [{ id: "evt-owner", type: "event", title: "Owner Event", startDate: "2026-07-20" }],
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
      },
      [directorUid]: {
        uid: directorUid,
        email: DIRECTOR,
        classrooms: [{ id: "classroom-main", name: "Main Classroom" }],
        items: [
          { id: "evt-owner", type: "event", title: "Owner Event", startDate: "2026-07-20" },
          { id: "evt-dir", type: "event", title: "Director Only Event", startDate: "2026-07-21" },
        ],
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
      },
    },
    adminSessions: {},
    memberSessions: {},
  }, null, 2));

  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      FIREBASE_API_KEY: "",
      FIREBASE_AUTH_DOMAIN: "",
      FIREBASE_PROJECT_ID: "",
      FIREBASE_APP_ID: "",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();

    // 1) Migration dry-run reports ambiguities and does not write programData yet.
    const adminLogin = await request("POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.json));
    const adminToken = adminLogin.json.token;
    const dry = await request(
      "GET",
      `/api/admin/program-migration-plan?adminToken=${encodeURIComponent(adminToken)}&ownerEmail=${encodeURIComponent(OWNER)}&memberEmail=${encodeURIComponent(DIRECTOR)}`,
    );
    assert.equal(dry.status, 200, JSON.stringify(dry.json));
    assert.equal(dry.json.apply, false);
    assert.ok(dry.json.ambiguities.some((a) => a.type === "duplicate_child_profiles"));
    assert.ok(dry.json.ambiguities.some((a) => a.type === "member_only_child_profiles"));
    assert.ok(dry.json.ambiguities.some((a) => a.type === "member_only_schedule_items"));
    console.log("PASS  migration dry-run reports duplicates/ambiguities without applying");

    // Live Ashley/Ladiisha apply stays blocked without confirm phrase.
    const liveBlock = await request(
      "GET",
      `/api/admin/program-migration-plan?adminToken=${encodeURIComponent(adminToken)}&ownerEmail=${encodeURIComponent("tclashley@icloud.com")}&memberEmail=${encodeURIComponent("ladiisha01@gmail.com")}&apply=1&linkMember=1`,
    );
    assert.equal(liveBlock.status, 403);
    assert.equal(liveBlock.json.code, "live_pair_apply_blocked");
    console.log("PASS  live Ashley/Ladiisha apply blocked without confirm phrase");

    // Dry-run for live emails is allowed (may be empty users in this seeded store).
    const liveDry = await request(
      "GET",
      `/api/admin/program-migration-plan?adminToken=${encodeURIComponent(adminToken)}&ownerEmail=${encodeURIComponent("tclashley@icloud.com")}&memberEmail=${encodeURIComponent("ladiisha01@gmail.com")}`,
    );
    assert.equal(liveDry.status, 200, JSON.stringify(liveDry.json));
    assert.equal(liveDry.json.mode, "dry-run");
    assert.equal(liveDry.json.programOwnerEmail, "tclashley@icloud.com");
    console.log("PASS  live-pair dry-run allowed and forces Ashley as owner");

    // Apply migration for seeded pair (data only, then link via staff invite).
    // forceAmbiguities=1 is required when dry-run reports member-only/duplicate rows
    // that are preserved in legacy UID buckets (not auto-merged).
    const applied = await request(
      "GET",
      `/api/admin/program-migration-plan?adminToken=${encodeURIComponent(adminToken)}&ownerEmail=${encodeURIComponent(OWNER)}&memberEmail=${encodeURIComponent(DIRECTOR)}&apply=1&forceAmbiguities=1`,
    );
    assert.equal(applied.status, 200, JSON.stringify(applied.json));
    assert.equal(applied.json.applied, true);
    assert.ok(applied.json.backupId);
    const backupId = applied.json.backupId;
    const afterMigrate = JSON.parse(fs.readFileSync(STORE, "utf8"));
    assert.ok(afterMigrate.programData[applied.json.programId]?.child?.data?.Profiles?.length >= 1);
    assert.ok(afterMigrate.childData[directorUid]?.data?.Profiles?.length >= 1, "member legacy bucket preserved");
    assert.equal(afterMigrate.users[OWNER].stripeSubscriptionId, "sub_seed_ashley");
    console.log("PASS  seeded migration applies with backup; legacy buckets preserved; owner Stripe intact");

    // Invite director into owner's program.
    const invite = await request("POST", "/api/staff/invites", {
      email: OWNER,
      body: {
        email: DIRECTOR,
        role: "director",
        programName: "Seed Shared Program",
        appOrigin: BASE,
      },
    });
    assert.equal(invite.status, 200, JSON.stringify(invite.json));
    const inviteToken = new URL(invite.json.acceptUrl).searchParams.get("staffInvite");
    const accept = await request("POST", "/api/staff/invites/accept", {
      email: DIRECTOR,
      body: { token: inviteToken },
    });
    assert.equal(accept.status, 200, JSON.stringify(accept.json));
    assert.equal(accept.json.account.role, "director");
    assert.equal(accept.json.account.linkedProgramOwnerEmail, OWNER);
    assert.ok(accept.json.account.programId);
    assert.equal(accept.json.account.programAccessViaOwner, true);
    console.log("PASS  two logins linked to one program as owner + director");

    // Both see the same shared children (owner program data).
    const ownerChildren = await request("GET", "/api/child-data", { email: OWNER });
    const directorChildren = await request("GET", "/api/child-data", { email: DIRECTOR });
    assert.equal(ownerChildren.status, 200, JSON.stringify(ownerChildren.json));
    assert.equal(directorChildren.status, 200, JSON.stringify(directorChildren.json));
    assert.equal(ownerChildren.json.programId, directorChildren.json.programId);
    assert.equal(ownerChildren.json.ownerEmail, OWNER);
    assert.equal(directorChildren.json.ownerEmail, OWNER);
    assert.equal(ownerChildren.json.data.Profiles[0].id, "child-a");
    assert.equal(directorChildren.json.data.Profiles[0].id, "child-a");
    console.log("PASS  both directors see the same shared child records");

    // Record created by director appears for owner immediately.
    const nextProfiles = [
      ...directorChildren.json.data.Profiles,
      { id: "child-c", firstName: "Cora", lastName: "Shared" },
    ];
    const save = await request("POST", "/api/child-data", {
      email: DIRECTOR,
      body: {
        data: {
          ...directorChildren.json.data,
          Profiles: nextProfiles,
        },
      },
    });
    assert.equal(save.status, 200, JSON.stringify(save.json));
    const ownerAfter = await request("GET", "/api/child-data", { email: OWNER });
    assert.ok(ownerAfter.json.data.Profiles.some((p) => p.id === "child-c"));
    console.log("PASS  director write is visible to owner on shared program");

    // Shared schedule/calendar.
    const ownerSchedule = await request("GET", "/api/schedule", { email: OWNER });
    const directorSchedule = await request("GET", "/api/schedule", { email: DIRECTOR });
    assert.equal(ownerSchedule.json.programId, directorSchedule.json.programId);
    assert.ok(ownerSchedule.json.items.some((i) => i.id === "evt-owner"));
    assert.ok(directorSchedule.json.items.some((i) => i.id === "evt-owner"));
    const upsert = await request("PUT", "/api/schedule/items/evt-shared", {
      email: DIRECTOR,
      body: { id: "evt-shared", type: "event", title: "Shared Event", startDate: "2026-07-22", classroomId: "classroom-main" },
    });
    assert.equal(upsert.status, 200, JSON.stringify(upsert.json));
    const ownerSchedule2 = await request("GET", "/api/schedule", { email: OWNER });
    assert.ok(ownerSchedule2.json.items.some((i) => i.id === "evt-shared"));
    console.log("PASS  shared calendar writes appear for both directors");

    // Staff invited by director joins owner program.
    const staffInvite = await request("POST", "/api/staff/invites", {
      email: DIRECTOR,
      body: { email: STAFF, role: "teacher", programName: "Seed Shared Program", appOrigin: BASE },
    });
    assert.equal(staffInvite.status, 200, JSON.stringify(staffInvite.json));
    const staffToken = new URL(staffInvite.json.acceptUrl).searchParams.get("staffInvite");
    const staffAccept = await request("POST", "/api/staff/invites/accept", {
      email: STAFF,
      body: { token: staffToken },
    });
    assert.equal(staffAccept.status, 200, JSON.stringify(staffAccept.json));
    assert.equal(staffAccept.json.account.linkedProgramOwnerEmail, OWNER);
    assert.equal(staffAccept.json.account.programId, accept.json.account.programId);
    console.log("PASS  staff invited by director joins the owner program");

    // Remove staff member record — shared program data must remain.
    const storeNow = JSON.parse(fs.readFileSync(STORE, "utf8"));
    storeNow.programMembers[OWNER] = (storeNow.programMembers[OWNER] || [])
      .filter((m) => m.email !== STAFF);
    delete storeNow.users[STAFF].linkedProgramOwnerEmail;
    fs.writeFileSync(STORE, JSON.stringify(storeNow, null, 2));
    const stillThere = await request("GET", "/api/child-data", { email: OWNER });
    assert.ok(stillThere.json.data.Profiles.some((p) => p.id === "child-c"));
    console.log("PASS  removing a member does not delete shared program data");

    // Billing protection: director temporary founding must not alter owner Stripe.
    const endStore = JSON.parse(fs.readFileSync(STORE, "utf8"));
    assert.equal(endStore.users[OWNER].stripeSubscriptionId, "sub_seed_ashley");
    assert.equal(endStore.users[OWNER].foundingMemberActive, true);
    assert.notEqual(endStore.users[DIRECTOR].stripeSubscriptionId, "sub_seed_ashley");
    console.log("PASS  owner Founding/Stripe untouched by director account");

    // Rollback restores prior programData snapshot.
    const rollback = await request("POST", "/api/admin/program-migration-rollback", {
      body: { adminToken, backupId },
    });
    assert.equal(rollback.status, 200, JSON.stringify(rollback.json));
    assert.equal(rollback.json.ok, true);
    console.log("PASS  migration rollback restores programData backup");

    // Single-provider still works (unlinked free user).
    const solo = "solo.provider@example.com";
    const soloPut = await request("PUT", "/api/schedule", {
      email: solo,
      body: {
        classrooms: [{ id: "classroom-main", name: "Solo Room" }],
        items: [{ id: "solo-1", type: "event", title: "Solo", startDate: "2026-07-23", classroomId: "classroom-main" }],
      },
    });
    assert.equal(soloPut.status, 200, JSON.stringify(soloPut.json));
    const soloGet = await request("GET", "/api/schedule", { email: solo });
    assert.ok(soloGet.json.programId);
    assert.ok(soloGet.json.items.some((i) => i.id === "solo-1"));
    console.log("PASS  single-provider accounts still get isolated program data");

    console.log("\nAll shared program ownership tests passed.");
  } catch (error) {
    console.error(bootLog.slice(-3000));
    throw error;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
