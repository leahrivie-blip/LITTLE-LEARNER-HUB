#!/usr/bin/env node
/**
 * Phase 23 — fake-account main-app identity mapping.
 *
 * Regression for a real bug found during the Phase 23 walkthrough: issuing a
 * one-time password for a Testing Lab / Director Center fake account and then
 * logging in through the MAIN app's shared /api/auth/password-login endpoint
 * either failed outright (missing serverPasswordAuth) or silently landed every
 * staff kind on the generic default Solo Provider experience (missing
 * accountType/role mapping), and guardian fake accounts had no way to land in
 * Family Hub instead of the provider app.
 *
 * Run: node scripts/test-phase23-fake-account-identity.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 21400 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-phase23-identity-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "phase23-identity-admin@example.invalid",
  password: "phase23-identity-pass",
  code: "phase23-identity-code",
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
  const modelJs = fs.readFileSync(path.join(ROOT, "scripts/family-foundation-data-model.js"), "utf8");
  const familyApiJs = fs.readFileSync(path.join(ROOT, "server/family-foundation-api.js"), "utf8");
  const labApiJs = fs.readFileSync(path.join(ROOT, "server/testing-lab-api.js"), "utf8");
  assert.match(modelJs, /function mainAppIdentityForFakeAccount/);
  assert.match(familyApiJs, /model\.mainAppIdentityForFakeAccount\(account\)/);
  assert.match(labApiJs, /familyModel\.mainAppIdentityForFakeAccount\(account\)/);
  assert.match(labApiJs, /serverPasswordAuth:\s*true/);
  pass("static markers present: shared identity mapping used by both fake-account APIs");
}

async function main() {
  assertStaticMarkers();
  const child = startServer();
  try {
    await waitForBoot(child);

    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLogin.status, 200);
    const token = adminLogin.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    // Enable the flags a real testing session would enable.
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        updatedAt: siteContentGet.json?.siteContent?.updatedAt || "",
        featureFlags: { directorCenter: true, formsCenter: true, familyHub: true, testingLab: true },
      },
    });

    const seed = await requestJson("POST", "/api/testing-lab/seed", { scenario: "home_daycare" }, auth);
    assert.equal(seed.status, 200, "seed should succeed");

    const dashboard = await requestJson("GET", "/api/testing-lab/dashboard", null, auth);
    assert.equal(dashboard.status, 200);
    const accounts = dashboard.json?.fakeAccounts || dashboard.json?.accounts || [];
    assert.ok(accounts.length > 0, "expected seeded fake accounts");

    async function issueAndLogin(kind) {
      const account = accounts.find((a) => a.kind === kind);
      assert.ok(account, `fake account kind "${kind}" should exist after seeding`);
      const issue = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: account.id }, auth);
      assert.equal(issue.status, 200, `issue-password should succeed for ${kind}`);
      const password = issue.json.temporaryPassword;
      assert.ok(password && password.length >= 8, "a real temporary password should be returned");
      const login = await requestJson("POST", "/api/auth/password-login", { email: account.email, password });
      return { account, login };
    }

    const staffExpectations = [
      { kind: "owner", role: "owner", accountType: "center" },
      { kind: "director", role: "director", accountType: "center" },
      { kind: "lead_teacher", role: "teacher", accountType: "center" },
      { kind: "assistant_broad", role: "assistant", accountType: "center" },
      { kind: "assistant_limited", role: "assistant", accountType: "center" },
    ];
    for (const expectation of staffExpectations) {
      const { login } = await issueAndLogin(expectation.kind);
      assert.equal(login.status, 200, `${expectation.kind} should be able to log in with the issued password (regression: previously 401 — missing serverPasswordAuth)`);
      assert.equal(login.json.role, expectation.role, `${expectation.kind} should map to main-app role "${expectation.role}"`);
      assert.equal(login.json.accountType, expectation.accountType, `${expectation.kind} should map to main-app accountType "${expectation.accountType}"`);
      assert.equal(login.json.familyHubGuardian, false, `${expectation.kind} must not be flagged as a Family Hub guardian`);
    }
    pass("staff fake accounts (owner/director/lead_teacher/assistant_broad/assistant_limited) log in and map to the correct main-app role + accountType");

    const guardianKinds = ["parent_one_child", "parent_multi_child", "restricted_guardian", "pickup_only"];
    for (const kind of guardianKinds) {
      const { login } = await issueAndLogin(kind);
      assert.equal(login.status, 200, `${kind} should be able to log in with the issued password`);
      assert.equal(login.json.familyHubGuardian, true, `${kind} must be flagged as a Family Hub guardian`);
      // Regression: guardians must never get provider-owner-level defaults if their
      // password is used against the shared login endpoint.
      assert.notEqual(login.json.role, "owner", `${kind} must not receive owner-level role from the shared login endpoint`);
    }
    pass("guardian fake accounts (parent_one_child/parent_multi_child/restricted_guardian/pickup_only) are flagged familyHubGuardian and never get owner-level role");

    pass("all fake-account identity mapping checks passed");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nPhase 23 fake-account identity checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
