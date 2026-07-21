#!/usr/bin/env node
/**
 * Phase 1+2 Director / Family / Forms foundation + admin-preview security tests.
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
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-admin-password";
const ADMIN_CODE = "test-admin-code";

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

function request(method, urlPath, { body = null, adminToken = "", headers = {} } = {}) {
  const nextHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...headers,
  };
  if (adminToken) nextHeaders.Authorization = `Bearer ${adminToken}`;
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers: nextHeaders }, (res) => {
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
      directorCenter: true,
      formsCenter: true,
      familyHub: true,
    });
    assert.equal(normalized.directorCenter, true);
    assert.equal(normalized.formsCenter, true);
    assert.equal(normalized.familyHub, false);
  });

  await test("production locks directorCenter even when stored ON", () => {
    const env = expansionFlags.resolveExpansionEnvironment({
      liveProduction: true,
      env: { ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
      siteUrl: "https://littlelearnershubbyleah.com",
    });
    assert.equal(env.liveProduction, true);
    assert.equal(env.allowDirectorCenterAdminPreview, false);
    const effective = expansionFlags.resolveEffectiveExpansionFlags({ directorCenter: true }, env);
    assert.equal(effective.directorCenter, false);
    const denied = expansionFlags.evaluateExpansionAccess({
      flagKey: "directorCenter",
      storedFlags: { directorCenter: true },
      environment: env,
      isVerifiedAdmin: true,
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, "production_locked");
  });

  await test("private preview allows directorCenter only for verified admin", () => {
    const env = expansionFlags.resolveExpansionEnvironment({
      env: { ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true", NODE_ENV: "test" },
      siteUrl: "http://127.0.0.1:4219",
    });
    assert.equal(env.liveProduction, false);
    assert.equal(env.allowDirectorCenterAdminPreview, true);
    const nonAdmin = expansionFlags.evaluateExpansionAccess({
      flagKey: "directorCenter",
      storedFlags: { directorCenter: true },
      environment: env,
      isVerifiedAdmin: false,
    });
    assert.equal(nonAdmin.allowed, false);
    assert.equal(nonAdmin.reason, "admin_required");
    const admin = expansionFlags.evaluateExpansionAccess({
      flagKey: "directorCenter",
      storedFlags: { directorCenter: true },
      environment: env,
      isVerifiedAdmin: true,
    });
    assert.equal(admin.allowed, true);
    assert.equal(admin.reason, "ok");
  });

  await test("formsCenter follows private preview env while familyHub stays forced OFF", () => {
    const formsEnv = expansionFlags.resolveExpansionEnvironment({
      env: { ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true" },
      siteUrl: "http://localhost:4242",
    });
    const forms = expansionFlags.evaluateExpansionAccess({
      flagKey: "formsCenter",
      storedFlags: { formsCenter: true, directorCenter: true },
      environment: formsEnv,
      isVerifiedAdmin: true,
    });
    assert.equal(forms.allowed, true);
    assert.equal(forms.reason, "ok");
    const formsNoEnv = expansionFlags.evaluateExpansionAccess({
      flagKey: "formsCenter",
      storedFlags: { formsCenter: true, directorCenter: true },
      environment: expansionFlags.resolveExpansionEnvironment({
        env: { ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
        siteUrl: "http://localhost:4242",
      }),
      isVerifiedAdmin: true,
    });
    assert.equal(formsNoEnv.allowed, false);
    assert.equal(formsNoEnv.reason, "preview_env_disabled");
    const family = expansionFlags.evaluateExpansionAccess({
      flagKey: "familyHub",
      storedFlags: { familyHub: true },
      environment: formsEnv,
      isVerifiedAdmin: true,
    });
    assert.equal(family.allowed, false);
    assert.equal(family.reason, "feature_forced_off");
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
  });

  await test("teachers are restricted to assigned classrooms", () => {
    const { store, org, classroomA, classroomB, childA, childB } = buildPermissionFixture();
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_teacher", email: "teacher@alpha.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CLASSROOM_VIEW,
      classroomId: classroomA.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    }).allowed, true);
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_teacher", email: "teacher@alpha.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CLASSROOM_VIEW,
      classroomId: classroomB.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    }).reason, "classroom_not_assigned");
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_teacher", email: "teacher@alpha.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childB.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    }).allowed, false);
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_teacher", email: "teacher@alpha.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childA.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    }).allowed, true);
  });

  await test("assistants respect limited permissions", () => {
    const { store, org, classroomA } = buildPermissionFixture();
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_assistant", email: "assistant@alpha.test", role: "assistant" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CLASSROOM_VIEW,
      classroomId: classroomA.id,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    }).allowed, true);
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_assistant", email: "assistant@alpha.test", role: "assistant" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.ORG_MANAGE_STAFF,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    }).reason, "role_denied");
  });

  await test("parents are restricted to connected verified children", () => {
    const { store, org, childA, childB } = buildPermissionFixture();
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_parent", email: "parent@family.test", role: "parent" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childA.id,
      featureFlags: { familyHub: true },
      requiredFeature: "familyHub",
    }).allowed, false); // familyHub forced off in feature helper
    // Permission matrix itself still allows parent+verified child when feature gate is not required.
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_parent", email: "parent@family.test", role: "parent" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childA.id,
    }).allowed, true);
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_parent", email: "parent@family.test", role: "parent" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CHILD_VIEW,
      childId: childB.id,
    }).reason, "child_relationship_unverified");
  });

  await test("cross-organization access is denied", () => {
    const { store, org } = buildPermissionFixture();
    assert.equal(orgPermissions.evaluateAccess({
      store,
      actor: { userId: "uid_beta", email: "teacher@beta.test", role: "teacher" },
      organizationId: org.id,
      action: orgPermissions.ACTIONS.CLASSROOM_VIEW,
      featureFlags: { directorCenter: true },
      requiredFeature: "directorCenter",
    }).reason, "not_organization_member");
  });

  await test("navigation keeps Family Hub out and Forms Center flag-gated", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(html, /data-view="director-center"[^>]*data-feature-flag="directorCenter"[^>]*data-nav-hidden="true"/);
    assert.match(html, /data-view="forms-center"[^>]*data-feature-flag="formsCenter"[^>]*data-nav-hidden="true"/);
    const sidebarStart = html.indexOf('id="platformNav"');
    const sidebarEnd = html.indexOf("</nav>", sidebarStart);
    const sidebar = html.slice(sidebarStart, sidebarEnd);
    assert.doesNotMatch(sidebar, /Family Hub/);
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    assert.match(appJs, /canAccessDirectorCenter/);
    assert.match(appJs, /canAccessFormsCenter/);
    assert.match(appJs, /admin_preview_only|Admin Preview/);
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
  });

  fs.writeFileSync(STORE, JSON.stringify({
    users: {},
    adminSessions: {},
    siteContent: {
      featureFlags: {
        playBasedCurriculum: true,
        directorCenter: true,
        formsCenter: true,
        familyHub: true,
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
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      ADMIN_NAME: "Test Owner",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverErr = "";
  child.stderr.on("data", (chunk) => { serverErr += chunk.toString(); });

  try {
    await waitForHealth();

    await test("anonymous feature flags stay OFF even when stored ON in preview", async () => {
      const res = await request("GET", "/api/foundation/feature-flags");
      assert.equal(res.status, 200);
      assert.equal(res.json.flags.directorCenter, false);
      assert.equal(res.json.flags.formsCenter, false);
      assert.equal(res.json.flags.familyHub, false);
      assert.equal(res.json.policy.formsCenter, "admin_preview_only");
      assert.equal(res.json.policy.familyHub, "forced_off");
      assert.equal(res.json.policy.directorCenter, "admin_preview_only");
      assert.equal(res.json.viewer.canAccessDirectorCenter, false);
      assert.equal(res.json.viewer.canAccessFormsCenter, false);
      assert.equal(res.json.storedFlags.formsCenter, true);
      assert.equal(res.json.storedFlags.familyHub, false);
    });

    await test("disabled expansion routes reject non-admin access", async () => {
      const director = await request("GET", "/api/director-center/overview");
      assert.equal(director.status, 403);
      assert.ok(["feature_unavailable", "admin_required"].includes(director.json.code));

      const forms = await request("POST", "/api/forms-center/templates");
      assert.equal(forms.status, 403);
      assert.equal(forms.json.feature, "formsCenter");

      const family = await request("GET", "/api/family-hub/children");
      assert.equal(family.status, 403);
      assert.equal(family.json.feature, "familyHub");
    });

    await test("verified admin can access Director Center preview APIs", async () => {
      const login = await request("POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
      });
      assert.equal(login.status, 200, login.json.error || "admin login failed");
      const token = login.json.token;
      assert.ok(token);

      const flags = await request("GET", "/api/foundation/feature-flags", { adminToken: token });
      assert.equal(flags.status, 200);
      assert.equal(flags.json.viewer.isVerifiedAdmin, true);
      assert.equal(flags.json.viewer.canAccessDirectorCenter, true);
      assert.equal(flags.json.viewer.canAccessFormsCenter, true);
      assert.equal(flags.json.flags.directorCenter, true);
      assert.equal(flags.json.flags.formsCenter, true);
      assert.equal(flags.json.flags.familyHub, false);

      const overview = await request("GET", "/api/director-center/overview", { adminToken: token });
      assert.equal(overview.status, 200, overview.json.error || "overview failed");
      assert.equal(overview.json.adminOnly, true);
      assert.ok(overview.json.organization?.id);

      const created = await request("POST", "/api/director-center/classrooms", {
        adminToken: token,
        body: { name: "Infants", ageGroupDefault: "Infant" },
      });
      assert.equal(created.status, 201, created.json.error || "create classroom failed");
      assert.equal(created.json.classroom.name, "Infants");

      const staff = await request("POST", "/api/director-center/staff/assign", {
        adminToken: token,
        body: {
          classroomId: created.json.classroom.id,
          userEmail: "teacher.preview@example.com",
          role: "lead_teacher",
        },
      });
      assert.equal(staff.status, 201, staff.json.error || "staff assign failed");

      const childAssign = await request("POST", "/api/director-center/children/assign", {
        adminToken: token,
        body: {
          classroomId: created.json.classroom.id,
          displayName: "Preview Child",
        },
      });
      assert.equal(childAssign.status, 201, childAssign.json.error || "child assign failed");
      assert.ok(childAssign.json.child.id);
      assert.equal(childAssign.json.assignment.classroomId, created.json.classroom.id);

      const formsHome = await request("GET", "/api/forms-center/home", { adminToken: token });
      assert.equal(formsHome.status, 200, formsHome.json.error || "forms home failed");
      assert.equal(formsHome.json.adminOnly, true);
      assert.equal(formsHome.json.responseCollection, false);
    });

    await test("existing staff invite route is not blocked by expansion flags", async () => {
      const res = await request("GET", "/api/staff/invites");
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

  // Second server: production-like lock (no preview env, production host)
  const prodStore = path.join(ROOT, "server", `.director-family-prodlock-test-${process.pid}.json`);
  fs.writeFileSync(prodStore, JSON.stringify({
    users: {},
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true } },
  }));
  const prodPort = 4220;
  const prodBase = `http://127.0.0.1:${prodPort}`;
  const prodChild = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(prodPort),
      NODE_ENV: "production",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: prodStore,
      SITE_URL: "https://littlelearnershubbyleah.com",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      // Preview opt-in intentionally absent / ignored on live production host
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prodRequest = (method, urlPath, opts = {}) => new Promise((resolve, reject) => {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (opts.adminToken) headers.Authorization = `Bearer ${opts.adminToken}`;
    const req = http.request(`${prodBase}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });

  try {
    for (let i = 0; i < 60; i += 1) {
      try {
        const res = await prodRequest("GET", "/api/health");
        if (res.status === 200) break;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 100));
    }

    await test("live production host keeps Director Center OFF even for admin", async () => {
      const login = await prodRequest("POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
      });
      assert.equal(login.status, 200);
      const flags = await prodRequest("GET", "/api/foundation/feature-flags", { adminToken: login.json.token });
      assert.equal(flags.json.policy.productionLocked, true);
      assert.equal(flags.json.flags.directorCenter, false);
      assert.equal(flags.json.flags.formsCenter, false);
      assert.equal(flags.json.flags.familyHub, false);
      assert.equal(flags.json.viewer.canAccessDirectorCenter, false);
      assert.equal(flags.json.viewer.canAccessFormsCenter, false);
      const overview = await prodRequest("GET", "/api/director-center/overview", { adminToken: login.json.token });
      assert.equal(overview.status, 403);
      assert.equal(overview.json.code, "feature_unavailable");
      const forms = await prodRequest("GET", "/api/forms-center/home", { adminToken: login.json.token });
      assert.equal(forms.status, 403);
      assert.equal(forms.json.code, "feature_unavailable");
    });
  } finally {
    prodChild.kill("SIGTERM");
    try { fs.unlinkSync(prodStore); } catch { /* ignore */ }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
  console.log("\nAll Phase 1/2 director/family foundation security tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
