#!/usr/bin/env node
/**
 * Release-candidate validation for linked-program / multi-director access.
 * Covers role repair, audit logging, idempotency, permissions, multi-director
 * shared data, and billing isolation. Uses temp JSON store only — never production.
 *
 * Run: npm run test:linked-program-release-candidate
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4530 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-rc-linked-${crypto.randomBytes(4).toString("hex")}.json`);
const BASE = `http://127.0.0.1:${PORT}`;

const OWNER = "owner.rc@example.com";
const DIRECTOR_A = "director-a.rc@example.com";
const DIRECTOR_B = "director-b.rc@example.com";
const OWNER_UID = "uid-owner-rc";
const DIR_A_UID = "uid-director-a-rc";
const DIR_B_UID = "uid-director-b-rc";

const accountAccess = require("./account-access.js");
const programOwnership = require("../server/program-ownership.js");

function request(method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
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
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}

function seedStore() {
  const programId = programOwnership.programIdForOwnerEmail(OWNER);
  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        role: "owner",
        accountType: "home_daycare",
        plan: "Founding",
        foundingMemberActive: true,
        stripeCustomerId: "cus_rc_owner",
        stripeSubscriptionId: "sub_rc_owner",
        stripeSubscriptionStatus: "active",
        firebaseUid: OWNER_UID,
        programId,
        subscriptionStatus: "Founding Member Subscription Active",
      },
      [DIRECTOR_A]: {
        email: DIRECTOR_A,
        role: "owner",
        linkedProgramOwnerEmail: OWNER,
        programAccessViaOwner: true,
        firebaseUid: DIR_A_UID,
        plan: "Free",
      },
      [DIRECTOR_B]: {
        email: DIRECTOR_B,
        role: "owner",
        linkedProgramOwnerEmail: OWNER,
        programAccessViaOwner: true,
        firebaseUid: DIR_B_UID,
        plan: "Free",
      },
    },
    programs: {
      [programId]: {
        id: programId,
        ownerEmail: OWNER,
        name: "RC Shared Program",
      },
    },
    programData: {
      [programId]: {
        child: {
          uid: OWNER_UID,
          email: OWNER,
          data: {
            Profiles: [{ id: "child-rc", firstName: "River", lastName: "Child" }],
            Observations: [{ id: "obs-rc", childId: "child-rc", note: "baseline" }],
            Attendance: [],
            Communications: [],
            Documents: [],
            SupportPlans: [], Goals: [], Differentiations: [],
            Meals: [], MealPresets: [], Reports: [],
            Naps: [], Diapers: [], ActivityLogs: [], Photos: [],
          },
        },
      },
    },
    programMembers: {},
    scheduleByUser: {
      [OWNER_UID]: {
        uid: OWNER_UID,
        email: OWNER,
        classrooms: [{ id: "room-rc", name: "RC Room" }],
        items: [{ id: "evt-rc", type: "event", title: "RC Event", startDate: "2026-07-28", classroomId: "room-rc" }],
        schemaVersion: 1,
      },
    },
    messages: [],
    forms: [],
    membershipAudit: [],
    roleReconciliationAudit: [],
  }, null, 2));
}

async function main() {
  seedStore();

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), LLH_STORE_PATH: STORE, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth();

    // --- Role repair + audit on subscription-status ---
    const t0 = Date.now();
    const statusA = await request("GET", `/api/subscription-status?email=${encodeURIComponent(DIRECTOR_A)}`);
    const firstRepairMs = Date.now() - t0;
    assert.equal(statusA.status, 200);
    assert.equal(statusA.json.subscription.role, "director");
    assert.equal(statusA.json.subscription.linkedProgramOwnerEmail, OWNER);
    assert.ok(firstRepairMs < 500, `first repair should be fast (${firstRepairMs}ms)`);

    const storeAfterA = readStore();
    const audits = storeAfterA.roleReconciliationAudit || [];
    assert.ok(audits.length >= 1, "audit log should record first reconciliation");
    const auditA = audits.find((e) => e.email === DIRECTOR_A);
    assert.ok(auditA, "director A audit entry missing");
    assert.equal(auditA.previousRole, "owner");
    assert.equal(auditA.newRole, "director");
    assert.equal(auditA.userId, DIR_A_UID);
    assert.ok(auditA.programId);
    assert.ok(auditA.reason);
    assert.ok(auditA.createdAt);
    console.log("PASS  role repair + audit logging on subscription-status");

    // --- Idempotency: second read must not add duplicate audits ---
    const auditCountBefore = readStore().roleReconciliationAudit.length;
    const timings = [];
    for (let i = 0; i < 10; i += 1) {
      const start = Date.now();
      const res = await request("GET", `/api/subscription-status?email=${encodeURIComponent(DIRECTOR_A)}`);
      timings.push(Date.now() - start);
      assert.equal(res.json.subscription.role, "director");
    }
    const auditCountAfter = readStore().roleReconciliationAudit.length;
    assert.equal(auditCountAfter, auditCountBefore, "idempotent reads must not create duplicate audit entries");
    const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    assert.ok(avgMs < 200, `repaired subscription-status avg ${avgMs.toFixed(1)}ms should stay fast`);
    console.log(`PASS  idempotent repair (avg subscription-status ${avgMs.toFixed(1)}ms, no duplicate audits)`);

    // --- Multi-director: repair director B ---
    const statusB = await request("GET", `/api/subscription-status?email=${encodeURIComponent(DIRECTOR_B)}`);
    assert.equal(statusB.json.subscription.role, "director");
    const members = readStore().programMembers[OWNER] || [];
    assert.equal(members.filter((m) => m.status === "active").length, 2, "both directors in programMembers");
    console.log("PASS  multiple linked directors reconcile independently");

    // --- Permission boundaries ---
    const ownerCaps = accountAccess.summarizeAccountAccess(readStore().users[OWNER]).capabilities;
    const dirCaps = accountAccess.summarizeAccountAccess(readStore().users[DIRECTOR_A]).capabilities;
    assert.ok(ownerCaps.includes("billing"), "owner retains billing");
    assert.ok(!dirCaps.includes("billing"), "director must not get billing");
    assert.ok(dirCaps.includes("staff_management"), "director keeps staff_management");
    assert.ok(dirCaps.includes("child_profiles"), "director keeps child_profiles");
    console.log("PASS  owner vs director permission boundaries");

    // --- Shared program data: both directors see same children ---
    const ownerChildren = await request("GET", "/api/child-data", { email: OWNER });
    const dirAChildren = await request("GET", "/api/child-data", { email: DIRECTOR_A });
    const dirBChildren = await request("GET", "/api/child-data", { email: DIRECTOR_B });
    assert.equal(ownerChildren.json.programId, dirAChildren.json.programId);
    assert.equal(ownerChildren.json.programId, dirBChildren.json.programId);
    assert.equal(dirAChildren.json.data.Profiles[0].id, "child-rc");
    assert.equal(dirBChildren.json.data.Profiles[0].id, "child-rc");
    console.log("PASS  owner + multiple directors see identical shared children");

    // --- Cross-user writes: director A edit visible to owner and director B ---
    const profiles = [
      ...dirAChildren.json.data.Profiles,
      { id: "child-rc-2", firstName: "Sky", lastName: "Shared" },
    ];
    const saveChild = await request("POST", "/api/child-data", {
      email: DIRECTOR_A,
      body: { data: { ...dirAChildren.json.data, Profiles: profiles } },
    });
    assert.equal(saveChild.status, 200);
    const ownerAfter = await request("GET", "/api/child-data", { email: OWNER });
    const dirBAfter = await request("GET", "/api/child-data", { email: DIRECTOR_B });
    assert.ok(ownerAfter.json.data.Profiles.some((p) => p.id === "child-rc-2"));
    assert.ok(dirBAfter.json.data.Profiles.some((p) => p.id === "child-rc-2"));
    console.log("PASS  director create propagates to owner and other director");

    // --- Calendar shared writes ---
    const ownerSched = await request("GET", "/api/schedule", { email: OWNER });
    const dirSched = await request("GET", "/api/schedule", { email: DIRECTOR_B });
    assert.equal(ownerSched.json.programId, dirSched.json.programId);
    const calWrite = await request("PUT", "/api/schedule/items/evt-rc-b", {
      email: DIRECTOR_B,
      body: { id: "evt-rc-b", type: "event", title: "Director B Event", startDate: "2026-07-29", classroomId: "room-rc" },
    });
    assert.equal(calWrite.status, 200);
    const ownerSched2 = await request("GET", "/api/schedule", { email: OWNER });
    assert.ok(ownerSched2.json.items.some((i) => i.id === "evt-rc-b"));
    console.log("PASS  shared calendar writes visible across linked accounts");

    // --- Profile sync cannot escalate linked director to owner ---
    const profile = await request("POST", "/api/account/profile", {
      body: {
        email: DIRECTOR_A,
        firstName: "Director",
        lastName: "Alpha",
        role: "owner",
        lastLogin: true,
      },
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.json.user.role, "director");
    console.log("PASS  profile sync blocks role escalation for linked directors");

    // --- Billing / Stripe data isolation ---
    const endStore = readStore();
    assert.equal(endStore.users[OWNER].stripeCustomerId, "cus_rc_owner");
    assert.equal(endStore.users[OWNER].stripeSubscriptionId, "sub_rc_owner");
    assert.notEqual(endStore.users[DIRECTOR_A].stripeSubscriptionId, "sub_rc_owner");
    assert.notEqual(endStore.users[DIRECTOR_B].stripeSubscriptionId, "sub_rc_owner");
    assert.equal(endStore.users[OWNER].role, "owner");
    console.log("PASS  billing/Stripe data unchanged for owner; directors remain unlinked from owner Stripe");

    // --- Unrelated solo user unaffected ---
    const solo = "solo.rc@example.com";
    const soloBefore = { plan: "Pro", role: "owner", stripeCustomerId: "cus_solo" };
    endStore.users[solo] = { email: solo, ...soloBefore };
    fs.writeFileSync(STORE, JSON.stringify(endStore, null, 2));
    const soloStatus = await request("GET", `/api/subscription-status?email=${encodeURIComponent(solo)}`);
    assert.equal(soloStatus.json.subscription.role, "owner");
    const soloEnd = readStore().users[solo];
    assert.equal(soloEnd.stripeCustomerId, "cus_solo");
    assert.equal(soloEnd.role, "owner");
    console.log("PASS  unrelated solo accounts unaffected");

    console.log("\nAll linked-program release-candidate tests passed.");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("test-linked-program-release-candidate failed:", error.message || error);
  process.exit(1);
});
