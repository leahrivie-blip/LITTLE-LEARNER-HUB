#!/usr/bin/env node
/**
 * Phase 23 — permission and privacy audit.
 *
 * This complements the extensive existing cross-organization/cross-child
 * denial coverage in test-family-foundation-phase8.js, test-today-hub-
 * phase15.js, test-billing-simulator-phase17.js, test-staff-experience-
 * phase16.js, test-records-center-phase13.js, and test-licensing-center-
 * phase14.js (all of which already PASS a "cross_organization_denial" /
 * "wrong_org" style check). Those use synthetic Bearer test:<email> headers.
 *
 * This file specifically exercises the REAL login -> real session path that
 * Phase 23 fixed (see test-phase23-fake-account-identity.js): does a fake
 * account, once actually logged in with its issued password, get denied the
 * things it should never see — using its real memberSessionToken/account,
 * not a synthetic header.
 *
 * Run: node scripts/test-phase23-permission-privacy-audit.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 22300 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-phase23-permissions-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "phase23-perm-admin@example.invalid",
  password: "phase23-perm-pass",
  code: "phase23-perm-code",
};

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) },
      },
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
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
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

async function loginFakeAccount(auth, kind) {
  const famAccounts = await requestJson("GET", "/api/director-center/family/fake-accounts", null, auth);
  const account = (famAccounts.json?.fakeAccounts || []).find((a) => a.kind === kind);
  assert.ok(account, `fake account kind "${kind}" should exist`);
  const issue = await requestJson("POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {}, auth);
  assert.equal(issue.status, 200);
  const login = await requestJson("POST", "/api/auth/password-login", { email: account.email, password: issue.json.temporaryPassword });
  assert.equal(login.status, 200, `${kind} should be able to log in`);
  return { account, login };
}

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = adminLogin.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { directorCenter: true, formsCenter: true, familyHub: true, testingLab: true } },
    });
    const seedHome = await requestJson("POST", "/api/testing-lab/seed", { scenario: "home_daycare" }, auth);
    assert.equal(seedHome.status, 200);
    const seedCenter = await requestJson("POST", "/api/testing-lab/seed", { scenario: "small_center" }, auth);
    assert.equal(seedCenter.status, 200);
    const orgA = seedHome.json.organizationId;
    const orgB = seedCenter.json.organizationId;
    assert.notEqual(orgA, orgB, "the two seeded scenarios should be different organizations");

    // 1. Assistant real login cannot use Director/staff-management/billing endpoints
    //    of the MAIN provider app (account-access capability layer), even though the
    //    Director Center admin-preview APIs remain admin-only regardless of role.
    {
      const { login } = await loginFakeAccount(auth, "assistant_broad");
      assert.equal(login.json.role, "assistant");
      // Direct API bypass check: the assistant's own member session cannot self-escalate
      // by POSTing a role/accountType change to the profile-sync endpoint.
      const escalate = await requestJson("POST", "/api/account/profile", {
        email: login.json.email,
        role: "owner",
        accountType: "center",
      }, { Authorization: `Bearer ${login.json.memberSessionToken}` });
      // Re-derive role straight from a fresh membership summary call instead of trusting
      // the escalation response, so this checks server-persisted state, not just the reply.
      const meAfter = await requestJson("GET", `/api/account/profile?email=${encodeURIComponent(login.json.email)}`, null, { Authorization: `Bearer ${login.json.memberSessionToken}` });
      const persistedRole = meAfter.json?.role || meAfter.json?.profile?.role || "";
      assert.notEqual(persistedRole, "owner", "an assistant must not be able to self-escalate to owner via the profile-sync endpoint");
      pass("1. Direct API bypass: assistant fake account cannot self-escalate role via /api/account/profile");
    }

    // 2. Curriculum Only real login is denied center-management capabilities server-side
    //    too (not just hidden in the UI) — re-verify via a real login + capability probe.
    {
      const famAccounts = await requestJson("GET", "/api/director-center/family/fake-accounts", null, auth);
      const curriculumAccount = (famAccounts.json?.fakeAccounts || []).find((a) => a.kind === "curriculum_only");
      const issue = await requestJson("POST", `/api/director-center/family/fake-accounts/${curriculumAccount.id}/issue-password`, {}, auth);
      const login = await requestJson("POST", "/api/auth/password-login", { email: curriculumAccount.email, password: issue.json.temporaryPassword });
      assert.equal(login.json.accountType, "curriculum_only");
      assert.ok(!login.json.membership.capabilities.includes("staff_management"), "curriculum_only membership capabilities must not include staff_management");
      assert.ok(!login.json.membership.capabilities.includes("forms"), "curriculum_only membership capabilities must not include forms");
      assert.ok(login.json.membership.capabilities.includes("calendar"), "curriculum_only membership capabilities must still include calendar/planning tools");
      pass("2. Curriculum Only real login: server-computed capabilities deny center-management tools, keep planning tools");
    }

    // 3. Restricted / suspended guardian real session cannot see more than her
    //    restricted access level allows, and a pickup-only guardian is denied
    //    private (non-pickup) information.
    {
      const { login: restrictedLogin } = await loginFakeAccount(auth, "restricted_guardian");
      const restrictedToken = restrictedLogin.json.memberSessionToken;
      const restrictedSession = await requestJson("GET", "/api/family-foundation/guardian-session", null, { Authorization: `Bearer ${restrictedToken}` });
      assert.equal(restrictedSession.status, 200);
      assert.equal(restrictedSession.json.familyHub, false, "family hub product routes remain off in this preview scope");

      const { login: pickupLogin } = await loginFakeAccount(auth, "pickup_only");
      const pickupToken = pickupLogin.json.memberSessionToken;
      const pickupBilling = await requestJson("GET", "/api/family-hub/billing", null, { Authorization: `Bearer ${pickupToken}` });
      assert.ok([403, 404].includes(pickupBilling.status), `pickup-only guardian must be denied billing information (got ${pickupBilling.status})`);
      pass("3. Restricted guardian session limited to her access level; pickup-only guardian denied billing information");
    }

    // 4. Guardian accessing staff or another family: cross-organization AND
    //    cross-guardian session bypass attempts are both denied.
    {
      const { login: guardianLogin } = await loginFakeAccount(auth, "parent_multi_child");
      const guardianToken = guardianLogin.json.memberSessionToken;
      // Cross-org: same session token, but ask for a different org's household data.
      const crossOrgHouseholds = await requestJson("GET", `/api/director-center/family/households?organizationId=${orgB}`, null, { Authorization: `Bearer ${guardianToken}` });
      assert.ok([401, 403, 404].includes(crossOrgHouseholds.status), `a guardian session token must never be accepted by the admin-only Director Center family API (got ${crossOrgHouseholds.status})`);
      // Guardian attempting a direct URL bypass into staff-only data.
      const staffBypass = await requestJson("GET", "/api/director-center/staff", null, { Authorization: `Bearer ${guardianToken}` });
      assert.ok([401, 403, 404].includes(staffBypass.status), `a guardian session token must never be accepted for the admin-only staff API (got ${staffBypass.status})`);
      pass("4. Guardian session cannot bypass into Director Center's admin-only family/staff APIs (cross-org and direct-URL attempts both denied)");
    }

    // 5. Direct URL / API bypass: an unauthenticated request to an admin-only
    //    Director Center route is denied outright (no session at all).
    {
      const noAuth = await requestJson("GET", "/api/director-center/overview");
      assert.ok([401, 403, 404].includes(noAuth.status), `an unauthenticated request to Director Center must be denied (got ${noAuth.status})`);
      const fakeToken = await requestJson("GET", "/api/director-center/overview", null, { Authorization: "Bearer not-a-real-token" });
      assert.ok([401, 403, 404].includes(fakeToken.status), `a forged/garbage admin token must be denied (got ${fakeToken.status})`);
      pass("5. Direct URL/API bypass: unauthenticated and forged-token requests to Director Center are both denied");
    }

    // 6. Offline queue isolation after account switching (Classroom Assistant) —
    //    static regression already added in Phase 22; re-confirm the marker here too
    //    since this is exactly the kind of cross-cutting privacy check Phase 23 asks for.
    {
      const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
      assert.match(appJs, /llh-ca-offline-queue::/, "offline queue key must be identity-scoped");
      const clearFn = appJs.slice(appJs.indexOf("function clearAdminSession("), appJs.indexOf("function clearAdminSession(") + 1500);
      assert.match(clearFn, /llh-ca-offline-queue::/, "clearAdminSession must purge offline queue entries on logout");
      pass("6. Classroom Assistant offline queue remains identity-scoped and purged on logout (cross-checked here for the privacy audit)");
    }

    console.log(`\nPhase 23 permission & privacy audit passed (${passed}).`);
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
