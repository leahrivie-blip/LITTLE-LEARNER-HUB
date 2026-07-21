#!/usr/bin/env node
/**
 * Phase 1 Director / Family / Forms foundation tests.
 * Run: NODE_ENV=test node scripts/test-director-family-foundation.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const foundation = require("./foundation-data-model.js");
const orgPermissions = require("./org-permissions.js");
const entitlements = require("./entitlement-model.js");
const accountAccess = require("./account-access.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4219;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.director-family-foundation-test-${process.pid}.json`);

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => console.log(`PASS  ${name}`)).catch((error) => {
        console.error(`FAIL  ${name}`);
        console.error(error);
        process.exitCode = 1;
      });
    }
    console.log(`PASS  ${name}`);
    return Promise.resolve();
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
    return Promise.resolve();
  }
}

function request(method, urlPath, { body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
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
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not become healthy");
}

function buildPermissionFixture() {
  const org = foundation.createOrganizationRecord({
    id: "org_alpha",
    name: "Alpha Center",
    ownerEmail: "owner@alpha.test",
    accountType: "center",
  });
  const orgB = foundation.createOrganizationRecord({
    id: "org_beta",
    name: "Beta Center",
    ownerEmail: "owner@beta.test",
    accountType: "center",
  });
  const classroomA = foundation.createClassroomRecord({
    id: "classroom_a",
    organizationId: org.id,
    name: "Toddlers",
  });
  const classroomB = foundation.createClassroomRecord({
    id: "classroom_b",
    organizationId: org.id,
    name: "Preschool",
  });
  const director = foundation.createStaffMembershipRecord({
    id: "staff_director",
    organizationId: org.id,
    userId: "uid_director",
    userEmail: "director@alpha.test",
    role: orgPermissions.ORG_ROLES.DIRECTOR,
  });
  const teacher = foundation.createStaffMembershipRecord({
    id: "staff_teacher",
    organizationId: org.id,
    userId: "uid_teacher",
    userEmail: "teacher@alpha.test",
    role: orgPermissions.ORG_ROLES.LEAD_TEACHER,
  });
  const assistant = foundation.createStaffMembershipRecord({
    id: "staff_assistant",
    organizationId: org.id,
    userId: "uid_assistant",
    userEmail: "assistant@alpha.test",
    role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
  });
  const outsider = foundation.createStaffMembershipRecord({
    id: "staff_beta",
    organizationId: orgB.id,
    userId: "uid_beta",
    userEmail: "teacher@beta.test",
    role: orgPermissions.ORG_ROLES.LEAD_TEACHER,
  });
  const childA = foundation.createChildRecord({
    id: "child_a",
    organizationId: org.id,
    displayName: "Child A",
  });
  const childB = foundation.createChildRecord({
    id: "child_b",
    organizationId: org.id,
    displayName: "Child B",
  });
  const guardian = foundation.createGuardianRecord({
    id: "guardian_1",
    userId: "uid_parent",
    email: "parent@family.test",
    displayName: "Parent One",
  });
  const store = foundation.ensureFoundationStore({});
  store.organizations[org.id] = org;
  store.organizations[orgB.id] = orgB;
  store.classrooms[classroomA.id] = classroomA;
  store.classrooms[classroomB.id] = classroomB;
  store.staffMemberships[director.id] = director;
  store.staffMemberships[teacher.id] = teacher;
  store.staffMemberships[assistant.id] = assistant;
  store.staffMemberships[outsider.id] = outsider;
  store.childRecords[childA.id] = childA;
  store.childRecords[childB.id] = childB;
  store.classroomStaffAssignments.csa1 = foundation.createClassroomStaffAssignmentRecord({
    id: "csa1",
    organizationId: org.id,
    classroomId: classroomA.id,
    staffMembershipId: teacher.id,
    userId: teacher.userId,
  });
  store.classroomStaffAssignments.csa2 = foundation.createClassroomStaffAssignmentRecord({
    id: "csa2",
    organizationId: org.id,
    classroomId: classroomA.id,
    staffMembershipId: assistant.id,
    userId: assistant.userId,
  });
  store.classroomChildAssignments.cca1 = foundation.createClassroomChildAssignmentRecord({
    id: "cca1",
    organizationId: org.id,
    classroomId: classroomA.id,
    childId: childA.id,
  });
  store.classroomChildAssignments.cca2 = foundation.createClassroomChildAssignmentRecord({
    id: "cca2",
    organizationId: org.id,
    classroomId: classroomB.id,
    childId: childB.id,
  });
  store.guardians[guardian.id] = guardian;
  store.childGuardianRelationships.cgr1 = foundation.createChildGuardianRelationshipRecord({
    id: "cgr1",
    organizationId: org.id,
    childId: childA.id,
    guardianId: guardian.id,
    verified: true,
  });
  return { store, org, orgB, classroomA, classroomB, childA, childB, guardian };
}

async function main() {
  await test("all expansion feature flags default OFF", () => {
    const defaults = expansionFlags.defaultExpansionFeatureFlags();
    assert.equal(defaults.directorCenter, false);
    assert.equal(defaults.formsCenter, false);
    assert.equal(defaults.familyHub, false);
    const normalized = expansionFlags.normalizeExpansionFeatureFlags({
      directorCenter: "true",
      formsCenter: 1,
      familyHub: "yes",
      playBasedCurriculum: false,
    });
    assert.equal(normalized.directorCenter, false);
    assert.equal(normalized.formsCenter, false);
    assert.equal(normalized.familyHub, false);
    assert.equal(expansionFlags.mergeFeatureFlags({}).playBasedCurriculum, true);
  });

  await test("existing account roles continue to work as before", () => {
    const owner = { accountType: "home_daycare", role: "owner" };
    assert.equal(accountAccess.canAccessCapability(owner, "daily_logs"), true);
    assert.equal(accountAccess.canAccessCapability(owner, "staff_management"), true);
    assert.equal(accountAccess.canAccessCapability(owner, "billing"), true);
    assert.equal(accountAccess.canAccessCapability(owner, "classrooms"), false);

    const teacher = { accountType: "center", role: "teacher" };
    assert.equal(accountAccess.canAccessCapability(teacher, "daily_logs"), true);
    assert.equal(accountAccess.canAccessCapability(teacher, "billing"), false);
    assert.equal(accountAccess.canAccessCapability(teacher, "staff_management"), false);

    const director = { accountType: "center", role: "director" };
    assert.equal(accountAccess.canAccessCapability(director, "enrollment"), true);
    assert.equal(accountAccess.canAccessCapability(director, "billing"), false);
  });

  await test("disabled expansion views are mapped and stay OFF by default", () => {
    const flags = expansionFlags.defaultExpansionFeatureFlags();
    assert.equal(expansionFlags.isExpansionViewEnabled(flags, "director-center"), false);
    assert.equal(expansionFlags.isExpansionViewEnabled(flags, "forms-center"), false);
    assert.equal(expansionFlags.isExpansionViewEnabled(flags, "family-hub"), false);
    assert.equal(expansionFlags.isExpansionViewEnabled(flags, "calendar"), true);
    assert.equal(expansionFlags.isExpansionViewEnabled(flags, "staff"), true);
  });

  await test("navigation markers keep expansion features permanently hidden", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(html, /data-view="director-center"[^>]*data-feature-flag="directorCenter"[^>]*data-nav-hidden="true"/);
    assert.match(html, /id="view-forms-center"/);
    assert.match(html, /id="view-family-hub"/);
    assert.doesNotMatch(html, /data-view="forms-center"(?![^>]*data-nav-hidden)/);
    // Forms Center / Family Hub are not added to the production sidebar in Phase 1.
    const sidebarStart = html.indexOf('id="platformNav"');
    const sidebarEnd = html.indexOf("</nav>", sidebarStart);
    const sidebar = html.slice(sidebarStart, sidebarEnd);
    assert.doesNotMatch(sidebar, /Forms Center/);
    assert.doesNotMatch(sidebar, /Family Hub/);
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    assert.match(appJs, /DEFAULT_EXPANSION_FEATURE_FLAGS/);
    assert.match(appJs, /isExpansionViewEnabled/);
    assert.match(appJs, /loadExpansionFeatureFlagsFromBackend/);
    assert.match(appJs, /data-feature-flag/);
  });

  await test("directors can have organization-wide permission", () => {
    const { store, org, classroomB, childB } = buildPermissionFixture();
    const decision = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_director", email: "director@alpha.test", role: "director" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.ORG_VIEW_ALL_CHILDREN,
      classroomId: classroomB.id,
      childId: childB.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "ok");
  });

  await test("teachers are restricted to assigned classrooms", () => {
    const { store, org, classroomA, classroomB, childA, childB } = buildPermissionFixture();
    const allowedRoom = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_teacher", email: "teacher@alpha.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CLASSROOM_VIEW,
      classroomId: classroomA.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(allowedRoom.allowed, true);

    const deniedRoom = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_teacher", email: "teacher@alpha.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CLASSROOM_VIEW,
      classroomId: classroomB.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(deniedRoom.allowed, false);
    assert.equal(deniedRoom.reason, "classroom_not_assigned");

    const deniedChild = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_teacher", email: "teacher@alpha.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childB.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(deniedChild.allowed, false);

    const allowedChild = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_teacher", email: "teacher@alpha.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childA.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(allowedChild.allowed, true);
  });

  await test("assistants respect limited permissions", () => {
    const { store, org, classroomA } = buildPermissionFixture();
    const canView = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_assistant", email: "assistant@alpha.test", role: "assistant" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CLASSROOM_VIEW,
      classroomId: classroomA.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(canView.allowed, true);

    const cannotManageStaff = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_assistant", email: "assistant@alpha.test", role: "assistant" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.ORG_MANAGE_STAFF,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(cannotManageStaff.allowed, false);
    assert.equal(cannotManageStaff.reason, "role_denied");

    const cannotBilling = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_assistant", email: "assistant@alpha.test", role: "assistant" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.ORG_MANAGE_BILLING,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(cannotBilling.allowed, false);
  });

  await test("parents are restricted to connected verified children", () => {
    const { store, org, childA, childB } = buildPermissionFixture();
    const allowed = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_parent", email: "parent@family.test", role: "parent" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childA.id,
      featureFlags: { familyHub: true },
      requiredFeature: "familyHub",
    });
    assert.equal(allowed.allowed, true);

    const denied = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_parent", email: "parent@family.test", role: "parent" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childB.id,
      featureFlags: { familyHub: true },
      requiredFeature: "familyHub",
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, "child_relationship_unverified");
  });

  await test("cross-organization access is denied", () => {
    const { store, org } = buildPermissionFixture();
    const denied = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_beta", email: "teacher@beta.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CLASSROOM_VIEW,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, "not_organization_member");
  });

  await test("feature-disabled access is denied even for directors", () => {
    const { store, org } = buildPermissionFixture();
    const denied = orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_director", email: "director@alpha.test", role: "director" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.ORG_VIEW_ALL_CLASSROOMS,
      featureFlags: expansionFlags.defaultExpansionFeatureFlags(),
      requiredFeature: "directorCenter",
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, "feature_disabled");
  });

  await test("foundation store ensure is additive and idempotent", () => {
    const store = { users: { "a@test.com": { email: "a@test.com", plan: "Pro" } } };
    foundation.ensureFoundationStore(store);
    foundation.ensureFoundationStore(store);
    assert.equal(store.users["a@test.com"].plan, "Pro");
    assert.equal(typeof store.organizations, "object");
    assert.equal(Object.keys(store.organizations).length, 0);
    assert.equal(store.foundationMeta.migratedExistingUsers, false);
    const plan = foundation.buildExistingUserMigrationPlan(store);
    assert.equal(plan.dryRun, true);
    assert.equal(plan.executed, false);
  });

  await test("entitlement catalog keeps billing concepts separate and live=false", () => {
    const ent = entitlements.createOrganizationEntitlementRecord({
      organizationId: "org_alpha",
      basePlanKey: entitlements.PLAN_KEYS.SMALL_CENTER,
      classroomAddOnQuantity: 2,
    });
    assert.equal(ent.live, false);
    assert.equal(ent.classroomLimit, 10);
    assert.equal(ent.staffAccountLimit, 19);
    assert.ok(ent.featureEntitlements.includes("director_center"));
    const rec = entitlements.recommendUpgradeInsteadOfAddOns({
      currentPlanKey: entitlements.PLAN_KEYS.SMALL_CENTER,
      billingInterval: entitlements.BILLING_INTERVALS.MONTHLY,
      additionalClassroomsNeeded: 20,
    });
    assert.equal(rec.recommendUpgrade, true);
    assert.match(rec.message, /upgrading your plan will save you money/i);
    const live = entitlements.describeCurrentLiveBillingModel();
    assert.equal(live.livePlans.founding, "$9.99/month lifetime lock while continuously active (FOUNDING_LIMIT default 50)");
    assert.equal(live.livePlans.proMonthly, "$19.99/month");
  });

  fs.writeFileSync(STORE, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: {
        playBasedCurriculum: true,
        directorCenter: false,
        formsCenter: false,
        familyHub: false,
      },
    },
  }));

  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      SITE_URL: BASE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverErr = "";
  child.stderr.on("data", (chunk) => { serverErr += chunk.toString(); });

  try {
    await waitForHealth();

    await test("API feature flags default OFF", async () => {
      const res = await request("GET", "/api/foundation/feature-flags");
      assert.equal(res.status, 200);
      assert.equal(res.json.flags.directorCenter, false);
      assert.equal(res.json.flags.formsCenter, false);
      assert.equal(res.json.flags.familyHub, false);
      assert.equal(res.json.allOff, true);
    });

    await test("disabled expansion routes reject access", async () => {
      const director = await request("GET", "/api/director-center/overview");
      assert.equal(director.status, 403);
      assert.equal(director.json.code, "feature_unavailable");
      assert.equal(director.json.feature, "directorCenter");

      const forms = await request("POST", "/api/forms-center/templates");
      assert.equal(forms.status, 403);
      assert.equal(forms.json.feature, "formsCenter");

      const family = await request("GET", "/api/family-hub/children");
      assert.equal(family.status, 403);
      assert.equal(family.json.feature, "familyHub");
    });

    await test("foundation status and migration plan are dry-run only", async () => {
      const status = await request("GET", "/api/foundation/status");
      assert.equal(status.status, 200);
      assert.equal(status.json.liveExposure, false);
      assert.equal(status.json.migration.dryRunOnlyInPhase1, true);
      assert.equal(status.json.featureFlags.allOff, true);

      const plan = await request("GET", "/api/foundation/migration-plan");
      assert.equal(plan.status, 200);
      assert.equal(plan.json.executed, false);
      assert.equal(plan.json.plan.dryRun, true);
    });

    await test("existing staff invite route is not blocked by expansion flags", async () => {
      const res = await request("GET", "/api/staff/invites");
      // Unauthorized without identity is fine; must not be feature_unavailable.
      assert.notEqual(res.json.code, "feature_unavailable");
      assert.notEqual(res.json.feature, "directorCenter");
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
    if (serverErr && process.exitCode) {
      console.error(serverErr.slice(-2000));
    }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
  console.log("\nAll Phase 1 director/family foundation tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
