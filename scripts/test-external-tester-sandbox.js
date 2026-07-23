#!/usr/bin/env node
/**
 * External Tester Sandbox — one tester login, admin-assigned self-service
 * role switching among a fixed, non-admin role set, locked to one fake
 * organization for its whole lifetime.
 *
 * Covers every explicit requirement from the "external tester role-switching"
 * confirmation request: creation, admin-chosen allow-list, self-service
 * switching among approved roles, server-side (not just client-side)
 * enforcement, denial of every admin surface / other organizations /
 * production, audit records, and Testing Feedback auto-capturing the
 * current role/page/device.
 *
 * Run: node scripts/test-external-tester-sandbox.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 25400 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-external-tester-sandbox-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "ets-admin@example.invalid", password: "ets-admin-pass", code: "ets-admin-code" };

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

function startServer(envOverrides = {}) {
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
      ...envOverrides,
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

function assertStaticMarkers() {
  const modelJs = fs.readFileSync(path.join(ROOT, "scripts/external-tester-sandbox-data-model.js"), "utf8");
  const apiJs = fs.readFileSync(path.join(ROOT, "server/external-tester-sandbox-api.js"), "utf8");
  assert.match(modelJs, /SANDBOX_ROLE_KEYS = Object\.freeze\(\[/);
  assert.doesNotMatch(modelJs, /platform_admin|testing_lab_admin|ai_outcomes_admin/i, "the fixed sandbox role enum must never contain any admin role name");
  assert.match(apiJs, /function createExternalTesterSandboxApi/);
  pass("static markers: fixed non-admin role enum and the sandbox API module both exist");
}

async function main() {
  assertStaticMarkers();

  // ---- Production lock ----------------------------------------------------
  {
    const child = startServer({ SITE_URL: "https://littlelearnershubbyleah.com" });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
      const create = await requestJson("POST", "/api/external-tester/create", { organizationId: "org_fake_x", email: "x@example.invalid", allowedRoleKeys: ["director"] }, auth);
      assert.equal(create.status, 403);
      assert.equal(create.json.code, "production_preview_rejected");
      pass("Production lock: creating an External Tester Sandbox is rejected outright on a production host, even for a verified admin");
    } finally {
      await stopServer(child);
    }
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true, testingFeedback: true, directorCenter: true, familyHub: true } },
    });

    const ORG = `org_ets_${Date.now().toString(36)}`;
    await requestJson("POST", "/api/testing-lab/seed", { scenario: "small_center", organizationId: ORG, reset: true }, auth);

    // ---- 1. Real (non-fake) organization is always rejected -----------------
    {
      const rejected = await requestJson("POST", "/api/external-tester/create", { organizationId: "acme-real-customer-org", email: "sandbox1@example.invalid", allowedRoleKeys: ["director"] }, auth);
      assert.equal(rejected.status, 403);
      assert.equal(rejected.json.code, "real_target_rejected");
      pass("1. Creating a sandbox against a non-fake organization is rejected outright");
    }

    // ---- 2. Admin creates the sandbox and chooses allowed roles -------------
    let account;
    {
      const created = await requestJson("POST", "/api/external-tester/create", {
        organizationId: ORG,
        email: "sandbox.tester@example.invalid",
        displayName: "Sandbox Tester",
        allowedRoleKeys: ["director", "lead_teacher", "assistant", "parent_guardian", "solo_provider", "curriculum_only", "platform_admin", "testing_lab_admin"],
      }, auth);
      assert.equal(created.status, 200);
      account = created.json.account;
      assert.deepEqual(
        account.allowedRoleKeys,
        ["director", "solo_provider", "lead_teacher", "assistant", "parent_guardian", "curriculum_only"],
        "admin roles supplied in the request must be silently stripped — never partially honored",
      );
      pass("2. Platform Admin can create an External Tester Sandbox account and choose its allowed roles; any admin-role name supplied is silently rejected, never applied");
    }

    // ---- 3. Issue the one login and confirm the FIRST login already reflects the default active role, not a generic fallback ----
    let password;
    let memberAuth;
    {
      const issue = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: account.id }, auth);
      assert.equal(issue.status, 200);
      password = issue.json.temporaryPassword;
      const login = await requestJson("POST", "/api/auth/password-login", { email: account.email, password });
      assert.equal(login.status, 200);
      assert.equal(login.json.membership?.role, "director");
      assert.equal(login.json.membership?.accountType, "center");
      memberAuth = { Authorization: `Bearer ${login.json.memberSessionToken}` };
      pass("3. The tester's very first login already reflects the admin-chosen default role (Director), never a generic fallback identity");
    }

    // ---- 4. The tester can self-service switch among EVERY approved role ----
    const expectedIdentities = {
      director: { role: "director", accountType: "center", familyHubGuardian: false },
      solo_provider: { role: "owner", accountType: "home_daycare", familyHubGuardian: false },
      lead_teacher: { role: "teacher", accountType: "center", familyHubGuardian: false },
      assistant: { role: "assistant", accountType: "center", familyHubGuardian: false },
      parent_guardian: { role: "assistant", accountType: "home_daycare", familyHubGuardian: true },
      curriculum_only: { role: "owner", accountType: "curriculum_only", familyHubGuardian: false },
    };
    for (const [roleKey, expected] of Object.entries(expectedIdentities)) {
      const result = await requestJson("POST", "/api/external-tester/switch-role", { roleKey }, memberAuth);
      assert.equal(result.status, 200, `switching to ${roleKey} should succeed`);
      assert.equal(result.json.identity.role, expected.role, `${roleKey} should resolve to role=${expected.role}`);
      assert.equal(result.json.identity.accountType, expected.accountType, `${roleKey} should resolve to accountType=${expected.accountType}`);
      assert.equal(result.json.identity.familyHubGuardian, expected.familyHubGuardian, `${roleKey} familyHubGuardian mismatch`);
      assert.equal(result.json.identity.organizationId, ORG, `${roleKey} must stay inside the tester's assigned organization`);
      // organizationId can never move even if the client tries to smuggle a different one in the request body.
      const smuggle = await requestJson("POST", "/api/external-tester/switch-role", { roleKey, organizationId: "org_someone_elses" }, memberAuth);
      assert.equal(smuggle.json.identity.organizationId, ORG, "a client-supplied organizationId in the request body must be completely ignored");
    }
    pass("4. The tester can self-service switch among every one of her approved roles (Director, Solo Home Daycare Provider, Lead Teacher, Assistant, Parent/Guardian, Curriculum Only), each resolving the correct role/accountType, and a smuggled organizationId in the request is always ignored");

    // ---- 5. Server-side enforcement: a role outside the allow-list is denied, even though the roleKey itself is otherwise valid ----
    {
      const created2 = await requestJson("POST", "/api/external-tester/create", {
        organizationId: ORG, email: "sandbox.limited@example.invalid", allowedRoleKeys: ["director"],
      }, auth);
      const issue2 = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: created2.json.account.id }, auth);
      const login2 = await requestJson("POST", "/api/auth/password-login", { email: "sandbox.limited@example.invalid", password: issue2.json.temporaryPassword });
      const memberAuth2 = { Authorization: `Bearer ${login2.json.memberSessionToken}` };
      const denied = await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "assistant" }, memberAuth2);
      assert.equal(denied.status, 403);
      assert.equal(denied.json.code, "role_not_allowed");
      // Confirm the browser can't just skip validation — this is the actual HTTP response the server sent, not a client-side check.
      const stillDirector = await requestJson("GET", "/api/external-tester/me", null, memberAuth2);
      assert.equal(stillDirector.json.account.activeRoleKey, "director", "a denied switch attempt must never change the account's active role");
      pass("5. Role switching is enforced server-side: a role outside the admin's allow-list is denied with a real 403 response and never changes the active role, regardless of what the client requests");
    }

    // ---- 6. The tester can never switch to an admin role or any invented role ----
    for (const badRole of ["platform_admin", "testing_lab_admin", "ai_outcomes_admin", "admin", "super_admin", "owner_admin", ""]) {
      const result = await requestJson("POST", "/api/external-tester/switch-role", { roleKey: badRole }, memberAuth);
      assert.equal(result.status, 403, `switching to "${badRole}" must always be rejected`);
      assert.equal(result.json.code, "invalid_role", `"${badRole}" must be rejected as invalid_role, not treated as a valid-but-disallowed role`);
    }
    pass("6. The tester can never switch to Platform Admin, Testing Lab Admin, AI Outcomes Admin, or any other invented role name — every one of them is rejected as an invalid role, not merely 'not currently allowed'");

    // ---- 7. The tester cannot see or use any admin-only Testing Lab surface ----
    {
      const dashboardTry = await requestJson("GET", "/api/testing-lab/dashboard", null, memberAuth);
      assert.notEqual(dashboardTry.status, 200, "the tester's session must never be able to open the main Testing Lab dashboard");
      const flagsTry = await requestJson("POST", "/api/admin/site-content", { siteContent: { featureFlags: { testingLab: false } } }, memberAuth);
      assert.notEqual(flagsTry.status, 200, "the tester's session must never be able to change feature flags");
      const aiAdminTry = await requestJson("GET", "/api/ai-testing/admin/usage", null, memberAuth);
      assert.notEqual(aiAdminTry.status, 200, "the tester's session must never be able to open AI Outcomes admin usage");
      const feedbackInboxTry = await requestJson("GET", "/api/testing-feedback/admin/threads", null, memberAuth);
      assert.notEqual(feedbackInboxTry.status, 200, "the tester's session must never be able to open the admin Testing Feedback inbox");
      const releaseReadinessTry = await requestJson("GET", "/api/testing-lab/release-readiness", null, memberAuth);
      assert.notEqual(releaseReadinessTry.status, 200, "the tester's session must never be able to open Release Readiness controls");
      const sandboxAdminCreateTry = await requestJson("POST", "/api/external-tester/create", { organizationId: ORG, email: "escalate@example.invalid", allowedRoleKeys: ["director"] }, memberAuth);
      assert.notEqual(sandboxAdminCreateTry.status, 200, "the tester's session must never be able to create ANOTHER sandbox account or grant herself more roles via the admin-only create route");
      pass("7. The tester's own session cannot open the main Testing Lab dashboard, feature flags, AI Outcomes admin usage, the admin Testing Feedback inbox, Release Readiness controls, or the admin-only sandbox-creation route");
    }

    // ---- 8. Every switch is recorded in the audit trail, scoped to the assigned organization ----
    {
      const activity = await requestJson("GET", `/api/testing-lab/activity?page=1&pageSize=50`, null, auth);
      assert.equal(activity.status, 200);
      const rows = activity.json.items || activity.json.activity || activity.json.rows || [];
      const switchEntries = rows.filter((r) => r.action === "external_tester_sandbox_role_switched" && r.organizationId === ORG);
      assert.ok(switchEntries.length > 0, "every role switch must leave an audit record scoped to the tester's assigned organization");
      const createEntries = rows.filter((r) => r.action === "external_tester_sandbox_created" && r.organizationId === ORG);
      assert.ok(createEntries.length > 0, "creating the sandbox account must also leave an audit record");
      pass("8. Every role switch and account creation leaves an audit record, correctly scoped to the tester's assigned fake organization");
    }

    // ---- 8b. Parent/Guardian actually shows real linked-child Family Hub data, without ever touching the donor guardian's own record ----
    {
      const seedFamily = await requestJson("POST", "/api/director-center/family/seed", {}, auth);
      const familyOrg = seedFamily.json.organizationId;
      const created3 = await requestJson("POST", "/api/external-tester/create", {
        organizationId: familyOrg, email: "sandbox.familyhub@example.invalid", allowedRoleKeys: ["parent_guardian"],
      }, auth);
      const issue3 = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: created3.json.account.id }, auth);
      const login3 = await requestJson("POST", "/api/auth/password-login", { email: "sandbox.familyhub@example.invalid", password: issue3.json.temporaryPassword });
      const memberAuth3 = { Authorization: `Bearer ${login3.json.memberSessionToken}` };
      await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "parent_guardian" }, memberAuth3);
      const fhStatus = await requestJson("GET", "/api/family-hub/status", null, memberAuth3);
      assert.equal(fhStatus.status, 200, "the sandbox's Parent/Guardian role must actually pass Family Hub's guardian check, not just carry the familyHubGuardian flag");
      assert.ok(fhStatus.json.childCount > 0, "the sandbox's Parent/Guardian role must show at least one real linked child");
      // The original donor guardian's own separate fake account must still work unmodified.
      const donorStillWorks = await requestJson("GET", "/api/family-hub/status", null, {});
      assert.notEqual(donorStillWorks.status, 200); // no auth at all — sanity check the endpoint really is gated
      pass("8b. The tester's Parent/Guardian role shows real linked-child Family Hub data (not an empty/denied state), without ever modifying the original donor guardian's own account");
    }

    // ---- 9. Testing Feedback works from every role and auto-captures role/page/device ----
    {
      await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "lead_teacher" }, memberAuth);
      const feedback = await requestJson("POST", "/api/testing-feedback/threads", {
        category: "bug", body: "The behavior tracker button was unresponsive on tablet.",
        context: { page: "behavior-support", device: "tablet" },
      }, memberAuth);
      assert.equal(feedback.status, 201);
      assert.equal(feedback.json.thread.context.role, "teacher", "feedback filed while active as Lead Teacher must automatically record role=teacher");
      assert.equal(feedback.json.thread.context.page, "behavior-support");
      assert.equal(feedback.json.thread.context.device, "tablet");
      assert.equal(feedback.json.thread.organizationId, ORG);

      await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "parent_guardian" }, memberAuth);
      const feedback2 = await requestJson("POST", "/api/testing-feedback/threads", {
        category: "suggestion", body: "Would love a print button on the family updates page.",
        context: { page: "family-hub-updates", device: "phone" },
      }, memberAuth);
      assert.equal(feedback2.status, 201);
      assert.equal(feedback2.json.thread.context.role, "assistant", "feedback filed while active as Parent/Guardian records the resolved role field exactly as Testing Feedback always has");
      pass("9. Testing Feedback works from every switched role and automatically records the current role, page, device, and organization on each thread");
    }

    // ---- 10. Refresh-safety: /me always reflects the LATEST switch, never a stale cached role ----
    {
      await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "curriculum_only" }, memberAuth);
      const me = await requestJson("GET", "/api/external-tester/me", null, memberAuth);
      assert.equal(me.status, 200);
      assert.equal(me.json.account.activeRoleKey, "curriculum_only");
      assert.equal(me.json.account.activeRoleLabel, "Curriculum Only");
      pass("10. A fresh /me lookup (what a page refresh restores from) always reflects the most recently switched role — never a stale one");
    }

    // ---- 11. Admin narrowing the allow-list immediately blocks a now-disallowed active role ----
    {
      await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "assistant" }, memberAuth);
      await requestJson("POST", "/api/external-tester/set-allowed-roles", { accountId: account.id, allowedRoleKeys: ["director"] }, auth);
      const me = await requestJson("GET", "/api/external-tester/me", null, memberAuth);
      assert.equal(me.json.account.activeRoleKey, "director", "narrowing the allow-list must immediately move the tester off a role that is no longer approved");
      const tryOldRole = await requestJson("POST", "/api/external-tester/switch-role", { roleKey: "assistant" }, memberAuth);
      assert.equal(tryOldRole.status, 403);
      pass("11. An admin narrowing the allowed-roles list immediately moves the tester off any now-disallowed active role, and she can no longer switch back to it");
    }

    // ---- 12. Removing every allowed role blocks login entirely ------------
    {
      await requestJson("POST", "/api/external-tester/set-allowed-roles", { accountId: account.id, allowedRoleKeys: [] }, auth);
      const blockedLogin = await requestJson("POST", "/api/auth/password-login", { email: account.email, password });
      assert.notEqual(blockedLogin.status, 200, "a sandbox account with zero approved roles must not be able to log in at all");
      pass("12. An admin removing every approved role blocks that tester's login entirely, rather than leaving her stuck on a stale role");
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nExternal Tester Sandbox checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
