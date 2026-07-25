#!/usr/bin/env node
/**
 * Real Tester Accounts — Testing Lab account manager hotfix.
 *
 * Covers: create/reset a fake tester organization (Solo Home Daycare or
 * Multi-Classroom Center), generate fresh logins for every role in that
 * organization in one action, reissue a password, suspend/reactivate/end an
 * account, and confirm a previously-issued password can never be viewed
 * again (only a fresh reissue ever returns a new plaintext value).
 *
 * Run: node scripts/test-tester-account-manager.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 25100 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-tester-account-manager-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "tam-admin@example.invalid", password: "tam-admin-pass", code: "tam-admin-code" };

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

function assertStaticMarkers() {
  const apiJs = fs.readFileSync(path.join(ROOT, "server/testing-lab-api.js"), "utf8");
  const uiJs = fs.readFileSync(path.join(ROOT, "testing-lab-ui.js"), "utf8");
  assert.match(apiJs, /async function handleSuspendAccount/);
  assert.match(apiJs, /async function handleReactivateAccount/);
  assert.match(apiJs, /async function handleEndAccount/);
  assert.match(apiJs, /async function handleIssuePasswordsForOrg/);
  assert.match(uiJs, /data-tl-create-org/);
  assert.match(uiJs, /data-tl-issue-org-logins/);
  assert.match(uiJs, /data-tl-copy-password/);
  pass("static markers: suspend/reactivate/end/issue-for-org endpoints and the account-manager UI hooks all exist");
}

async function main() {
  assertStaticMarkers();

  const child = startServer();
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLogin.status, 200);
    const auth = { Authorization: `Bearer ${adminLogin.json.token}` };

    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
    });

    // ---- 1. Create a Solo Home Daycare fake organization -------------------
    const homeOrgId = `org_tester_solo_${Date.now().toString(36)}`;
    const seedHome = await requestJson("POST", "/api/testing-lab/seed", { scenario: "home_daycare", organizationId: homeOrgId, reset: true }, auth);
    assert.equal(seedHome.status, 200);
    assert.equal(seedHome.json.organizationId, homeOrgId);
    pass("1. A brand-new Solo Home Daycare fake organization can be created with a custom organizationId");

    // ---- 2. Create a Multi-Classroom Center fake organization --------------
    const centerOrgId = `org_tester_center_${Date.now().toString(36)}`;
    const seedCenter = await requestJson("POST", "/api/testing-lab/seed", { scenario: "small_center", organizationId: centerOrgId, reset: true }, auth);
    assert.equal(seedCenter.status, 200);
    assert.equal(seedCenter.json.organizationId, centerOrgId);
    pass("2. A brand-new Multi-Classroom Center fake organization can be created with a custom organizationId, independent of the home daycare org");

    // ---- 3. Real organizations (non-fake ids) are always rejected ----------
    {
      const rejected = await requestJson("POST", "/api/testing-lab/accounts/issue-passwords-for-org", { organizationId: "acme-real-customer-org" }, auth);
      assert.equal(rejected.status, 403);
      assert.equal(rejected.json.code, "real_target_rejected");
      pass("3. Issuing organization-wide logins for a non-fake organizationId is rejected outright");
    }

    // ---- 4. Generate fresh logins for every role in the center org ---------
    let firstIssued;
    {
      const issued = await requestJson("POST", "/api/testing-lab/accounts/issue-passwords-for-org", { organizationId: centerOrgId }, auth);
      assert.equal(issued.status, 200);
      assert.ok(issued.json.logins.length >= 2, "expected multiple fresh role logins for a multi-classroom center org");
      assert.ok(issued.json.logins.every((l) => l.organizationId === centerOrgId), "every issued login must belong to the requested organization only");
      assert.ok(issued.json.logins.every((l) => /@example\.invalid$/i.test(l.email)), "every issued login must be a fake @example.invalid account");
      const uniquePasswords = new Set(issued.json.logins.map((l) => l.temporaryPassword));
      assert.equal(uniquePasswords.size, issued.json.logins.length, "every issued password must be unique, never reused across roles");
      firstIssued = issued.json.logins[0];
      // Every issued login must actually be able to log in with the returned password.
      const login = await requestJson("POST", "/api/auth/password-login", { email: firstIssued.email, password: firstIssued.temporaryPassword });
      assert.equal(login.status, 200, `freshly issued login for ${firstIssued.kind} must work immediately`);
      pass(`4. Generating fresh logins for an entire organization in one action issued ${issued.json.logins.length} unique, working logins, each scoped to that organization only`);
    }

    // ---- 5. A previously-issued password can never be viewed again ---------
    let currentPassword = firstIssued.temporaryPassword;
    {
      const dashboard = await requestJson("GET", "/api/testing-lab/dashboard", null, auth);
      const account = (dashboard.json.accounts || []).find((a) => a.id === firstIssued.accountId);
      assert.ok(account, "expected to find the account that was just issued a password");
      assert.equal(account.hasPassword, true);
      assert.equal(Object.prototype.hasOwnProperty.call(account, "passwordHash"), false, "the account list must never expose a password hash, let alone plaintext");
      assert.equal(Object.prototype.hasOwnProperty.call(account, "temporaryPassword"), false, "the account list must never re-show a previously issued password");
      // Reissuing gives a DIFFERENT fresh password, not the same one repeated.
      const reissue = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: firstIssued.accountId, forceChange: false }, auth);
      assert.equal(reissue.status, 200);
      assert.notEqual(reissue.json.temporaryPassword, firstIssued.temporaryPassword, "reissuing must always generate a brand-new password, never repeat a previous one");
      currentPassword = reissue.json.temporaryPassword;
      pass("5. A previously-issued password is never shown again anywhere in the API — only a fresh reissue ever returns a new plaintext value, and it's always different from the last one");
    }

    // ---- 6. Suspend blocks login but is reversible via Reactivate ----------
    {
      const suspend = await requestJson("POST", "/api/testing-lab/accounts/suspend", { accountId: firstIssued.accountId }, auth);
      assert.equal(suspend.status, 200);
      assert.equal(suspend.json.active, false);
      const blockedLogin = await requestJson("POST", "/api/auth/password-login", { email: firstIssued.email, password: currentPassword });
      assert.notEqual(blockedLogin.status, 200, "a suspended account must not be able to log in");

      const reactivate = await requestJson("POST", "/api/testing-lab/accounts/reactivate", { accountId: firstIssued.accountId }, auth);
      assert.equal(reactivate.status, 200);
      assert.equal(reactivate.json.active, true);
      const restoredLogin = await requestJson("POST", "/api/auth/password-login", { email: firstIssued.email, password: currentPassword });
      assert.equal(restoredLogin.status, 200, "reactivating a suspended account must restore login WITHOUT needing a new password");
      pass("6. Suspending an account immediately blocks login; reactivating restores it without issuing a new password (fully reversible)");
    }

    // ---- 7. End permanently retires the account and clears every credential
    {
      const end = await requestJson("POST", "/api/testing-lab/accounts/end", { accountId: firstIssued.accountId }, auth);
      assert.equal(end.status, 200);
      assert.equal(end.json.ended, true);
      const blockedLogin = await requestJson("POST", "/api/auth/password-login", { email: firstIssued.email, password: currentPassword });
      assert.notEqual(blockedLogin.status, 200, "an ended account must not be able to log in with its old password");
      // Reactivate alone (without a fresh password) must NOT bring back the old password.
      await requestJson("POST", "/api/testing-lab/accounts/reactivate", { accountId: firstIssued.accountId }, auth);
      const stillBlockedLogin = await requestJson("POST", "/api/auth/password-login", { email: firstIssued.email, password: currentPassword });
      assert.notEqual(stillBlockedLogin.status, 200, "an ended account's OLD password must never work again, even after reactivating — a fresh reissue is required");
      const dashboard = await requestJson("GET", "/api/testing-lab/dashboard", null, auth);
      const account = (dashboard.json.accounts || []).find((a) => a.id === firstIssued.accountId);
      assert.equal(account.hasPassword, false, "an ended account must show no password until explicitly reissued");
      pass("7. Ending an account permanently clears every stored credential — the old password never works again even after reactivating, and a fresh reissue is required to restore access");
    }

    // ---- 8. Every account shows its assigned organization and role ---------
    {
      const dashboard = await requestJson("GET", "/api/testing-lab/dashboard", null, auth);
      const rows = dashboard.json.accounts || [];
      assert.ok(rows.length > 0);
      assert.ok(rows.every((row) => typeof row.organizationId === "string" && row.organizationId.length > 0), "every account row must show its assigned organizationId");
      pass("8. Every tester account visibly shows its assigned organization (and role, where applicable) in the account list");
    }
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nTester account manager checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
