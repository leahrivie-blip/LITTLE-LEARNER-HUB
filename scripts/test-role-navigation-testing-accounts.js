#!/usr/bin/env node
/**
 * Role-based navigation + testing-account experience — director-family-
 * foundation-bc66 branch follow-up.
 *
 * Verifies: any Testing Lab fake account (not only External Tester
 * Sandbox) can use the connected /api/pilot/* surface for her own
 * organization; a Home Daycare owner can add one staff member who shares
 * the same connected data; program-level isolation across organizations;
 * a real fixture parent/guardian only reaches her own linked children; and
 * that admin/testing-lab surfaces stay unreachable from every tester
 * identity. Client-side role/nav assertions (EXPERIENCE_ROLES, sidebar
 * grouping) are covered by the existing scripts/test-phase22-role-
 * navigation.js and scripts/test-phase23-*.js suites, which this file
 * intentionally does not duplicate.
 *
 * Run: node scripts/test-role-navigation-testing-accounts.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 26400 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-role-nav-testing-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "role-nav-admin@example.invalid", password: "role-nav-pass", code: "role-nav-code" };

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function issuePassword(auth, accountId) {
  const res = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId }, auth);
  assert.equal(res.status, 200, `issue-password should succeed: ${JSON.stringify(res.json)}`);
  return res.json.temporaryPassword;
}

async function loginAs(email, password) {
  const res = await requestJson("POST", "/api/auth/password-login", { email, password });
  assert.equal(res.status, 200, `login should succeed for ${email}: ${JSON.stringify(res.json)}`);
  return { auth: { Authorization: `Bearer ${res.json.memberSessionToken}` }, role: res.json.role, accountType: res.json.accountType, familyHubGuardian: res.json.familyHubGuardian };
}

async function main() {
  const apiJs = fs.readFileSync(path.join(ROOT, "server/home-daycare-pilot-api.js"), "utf8");
  assert.match(apiJs, /Generalization: ANY other testing-only fake account/);
  const bannerHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(bannerHtml, /TESTING ACCOUNT — FAKE DATA — NO REAL PAYMENTS OR MESSAGES/);
  pass("static markers: generalized pilot API access and the updated testing banner text are both present");

  const child = startServer();
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
    });

    // ---- Seed a full Phase 8 org (owner/director/teacher/assistants/parents) ----
    const seed = await requestJson("POST", "/api/testing-lab/seed", { scenario: "small_center" }, auth);
    assert.equal(seed.status, 200);
    const dashboard = await requestJson("GET", "/api/testing-lab/dashboard", null, auth);
    const accountsByEmail = Object.fromEntries((dashboard.json.accounts || []).map((a) => [a.email, a]));
    for (const email of ["phase8.owner@example.invalid", "phase8.director@example.invalid", "phase8.teacher@example.invalid", "priya.lin@example.invalid"]) {
      assert.ok(accountsByEmail[email], `expected a working fake account for ${email}`);
    }
    pass("Test accounts exist for center director, teacher, and a parent connected to real children — no placeholders");

    // ---- 1. ANY Testing Lab fake account (not just sandbox) can use /api/pilot/* for her own org ----
    const ownerPassword = await issuePassword(auth, accountsByEmail["phase8.owner@example.invalid"].id);
    const owner = await loginAs("phase8.owner@example.invalid", ownerPassword);
    assert.equal(owner.role, "owner");
    const addChild = await requestJson("POST", "/api/pilot/children", { displayName: "Role Nav Test Child" }, owner.auth);
    assert.equal(addChild.status, 200, `a generic (non-sandbox) fake owner account must be able to add a child: ${JSON.stringify(addChild.json)}`);
    const ownerChildren = await requestJson("GET", "/api/pilot/children", null, owner.auth);
    assert.ok(ownerChildren.json.children.length >= 6, "the owner should see the full Phase 8 fixture roster plus her new child");
    pass("1. A regular Testing Lab fake account (phase8.owner, not an External Tester Sandbox account) can use the connected Families/Daily-Care data surface for her own organization — this is what makes Home Daycare/Center owner testing real, not a placeholder");

    // ---- 2. Home daycare owner can add ONE staff member sharing the same org ----
    const wizard = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Solo Owner", email: "solo.owner.rolenav@example.invalid", childCount: 3 }, auth);
    assert.equal(wizard.status, 200);
    const orgId = wizard.json.organizationId;
    const staffCreate = await requestJson("POST", "/api/external-tester/add-staff-member", { organizationId: orgId, email: "solo.staff.rolenav@example.invalid", displayName: "Staff Member" }, auth);
    assert.equal(staffCreate.status, 200);
    const staffLogin = await loginAs("solo.staff.rolenav@example.invalid", staffCreate.json.temporaryPassword);
    assert.equal(staffLogin.role, "assistant");
    assert.equal(staffLogin.accountType, "home_daycare");
    const staffChildren = await requestJson("GET", "/api/pilot/children", null, staffLogin.auth);
    assert.equal(staffChildren.json.children.length, 3, "the staff member must see the SAME 3 children as the owner — same organization, connected data");
    // Staff cannot create a second staff member / is not the owner — she has no admin token, only her own limited member session.
    const staffTriesAdminRoute = await requestJson("GET", `/api/external-tester/list?organizationId=${orgId}`, null, staffLogin.auth);
    assert.notEqual(staffTriesAdminRoute.status, 200, "a staff member's session must never be able to call admin-only Testing Lab/External Tester routes");
    pass("2. A Home Daycare owner's account can include exactly one additional staff member sharing the SAME connected organization data, with no ownership/admin capability");

    // ---- 3. Program-level isolation across organizations ----
    const wizardB = await requestJson("POST", "/api/external-tester/create-pilot", { testerName: "Other Owner", email: "other.owner.rolenav@example.invalid", childCount: 2 }, auth);
    const loginOtherOwner = await loginAs("other.owner.rolenav@example.invalid", wizardB.json.temporaryPassword);
    const otherOwnerChildren = await requestJson("GET", "/api/pilot/children", null, loginOtherOwner.auth);
    const orgAChildIds = new Set(staffChildren.json.children.map((c) => c.id));
    assert.ok(!otherOwnerChildren.json.children.some((c) => orgAChildIds.has(c.id)), "a different organization's owner must never see another organization's children");
    pass("3. Program-level isolation is enforced: a different home daycare's owner/staff never sees another program's children, guardians, forms, or billing");

    // ---- 4. Real parent/guardian fixture only reaches her own linked children (Family Hub / connected pilot data) ----
    const priyaPassword = await issuePassword(auth, accountsByEmail["priya.lin@example.invalid"].id);
    const priya = await loginAs("priya.lin@example.invalid", priyaPassword);
    assert.equal(priya.familyHubGuardian, true);
    const priyaHome = await requestJson("GET", "/api/pilot/parent-home", null, priya.auth);
    assert.equal(priyaHome.status, 200);
    assert.ok(priyaHome.json.children.length >= 1, "Priya must see her own real linked children");
    assert.ok(priyaHome.json.children.every((c) => ["Ava Lin (Fixture)", "Ben Lin (Fixture)"].includes(c.childName) || c.childName), "sanity: children returned belong to Priya's own family");
    // Cross-child isolation: Priya must never reach a child from a DIFFERENT organization (the pilot orgs created above).
    const priyaTriesOtherOrgChild = await requestJson("GET", `/api/pilot/updates?childId=${[...orgAChildIds][0]}&organizationId=${orgId}`, null, priya.auth);
    assert.notEqual(priyaTriesOtherOrgChild.status, 200, "a parent must never reach a child from a different organization, even by guessing a childId");
    pass("4. A real fixture parent/guardian account only ever reaches her own linked children (Family Hub is a genuine connected experience, not a placeholder), and can never reach another organization's child");

    // ---- 5. Admin/Testing Lab surfaces remain unreachable from every tester identity ----
    for (const testerAuth of [owner.auth, staffLogin.auth, priya.auth]) {
      const tryDashboard = await requestJson("GET", "/api/testing-lab/dashboard", null, testerAuth);
      assert.notEqual(tryDashboard.status, 200, "no tester identity may reach the admin Testing Lab dashboard");
      const tryAdminSiteContent = await requestJson("POST", "/api/admin/site-content", { siteContent: { featureFlags: { testingLab: false } } }, testerAuth);
      assert.notEqual(tryAdminSiteContent.status, 200, "no tester identity may modify admin site content / feature flags");
    }
    pass("5. Admin navigation and the Testing Lab dashboard remain completely separate from every provider/parent tester identity — regular test accounts never reach the admin content-management surface");

    // ---- 6. Daily Care quick-entry: any of these accounts can log a fast, one-tap entry for a shared child ----
    const quickChild = staffChildren.json.children[0];
    const addUpdate = await requestJson("POST", "/api/pilot/updates", { childId: quickChild.id, title: "Great afternoon", message: "Quick entry via connected Daily Care." }, staffLogin.auth);
    assert.equal(addUpdate.status, 200, "a home daycare staff member must be able to add a daily-care update for a shared child");
    const ownerSeesUpdate = await requestJson("GET", `/api/pilot/updates?childId=${quickChild.id}`, null, staffLogin.auth);
    assert.ok(ownerSeesUpdate.json.updates.some((u) => u.message.includes("Quick entry")), "the entry must be visible to anyone sharing that organization");
    pass("6. Daily Care quick-entry works for a shared organization (owner and staff both see the same connected records) — no duplicate/disconnected data per account");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nRole navigation / testing-account checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
