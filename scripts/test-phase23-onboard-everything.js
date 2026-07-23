#!/usr/bin/env node
/**
 * Phase 23 final handoff — "Get the testing site ready" one-click tool.
 *
 * POST /api/testing-lab/onboard-everything enables every completed testing
 * feature flag, seeds a solo Home Daycare and a multi-classroom Center, and
 * issues a fresh one-time password for all 10 required fake-account roles
 * (Platform Admin uses the real admin login, not a fake account) in a single
 * admin action — so the owner does not need to click through Testing Lab
 * account-by-account before their first testing session.
 *
 * Run: node scripts/test-phase23-onboard-everything.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 22600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-phase23-onboard-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "phase23-onboard-admin@example.invalid",
  password: "phase23-onboard-pass",
  code: "phase23-onboard-code",
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

function startServer(env = {}) {
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
      ...env,
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

const EXPECTED_ROLES = [
  "Center Owner", "Director", "Solo Home Daycare Provider", "Lead Teacher", "Assistant",
  "Curriculum Only Provider", "Guardian (multiple children)", "Financially Responsible Guardian",
  "Pickup-Only Guardian", "Restricted Guardian",
];

function assertStaticMarkers() {
  const apiJs = fs.readFileSync(path.join(ROOT, "server/testing-lab-api.js"), "utf8");
  const uiJs = fs.readFileSync(path.join(ROOT, "testing-lab-ui.js"), "utf8");
  assert.match(apiJs, /onboard-everything/);
  assert.match(apiJs, /async function handleOnboardEverything/);
  assert.match(apiJs, /Copy every password now/);
  assert.match(uiJs, /data-tl-onboard-everything/);
  assert.match(uiJs, /onboard-everything/);
  pass("static markers: onboard-everything endpoint + Testing Lab UI button present");
}

async function main() {
  assertStaticMarkers();

  // Production must still reject this endpoint just like every other Testing Lab route.
  {
    const child = startServer({ SITE_URL: "https://littlelearnershubbyleah.com" });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const token = adminLogin.json.token;
      const onboard = await requestJson("POST", "/api/testing-lab/onboard-everything", {}, { Authorization: `Bearer ${token}` });
      assert.equal(onboard.status, 403, "onboard-everything must be rejected outright on a production SITE_URL");
      pass("production_rejection: onboard-everything is rejected outright on a production host");
    } finally {
      await stopServer(child);
    }
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLogin.status, 200);
    const token = adminLogin.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    // Owner's one required pre-step: enable Testing Lab (the same toggle they'd use
    // for any other expansion feature) — everything else is this one action.
    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
    });

    const onboard = await requestJson("POST", "/api/testing-lab/onboard-everything", {}, auth);
    assert.equal(onboard.status, 200, "onboard-everything should succeed once Testing Lab is enabled");
    assert.deepEqual(onboard.json.missingRoles, [], `every required role should be found, missing: ${JSON.stringify(onboard.json.missingRoles)}`);
    assert.equal(onboard.json.logins.length, EXPECTED_ROLES.length, "should issue exactly one login per required role");
    for (const role of EXPECTED_ROLES) {
      assert.ok(onboard.json.logins.some((l) => l.role === role), `missing expected role: ${role}`);
    }
    assert.deepEqual(
      onboard.json.featureFlagsEnabled.sort(),
      ["directorCenter", "familyHub", "formsCenter", "testingLab"].sort(),
      "should enable all four completed-feature flags",
    );
    pass("onboard-everything returns a login for all 10 required roles and enables all 4 feature flags");

    // Every issued login must actually work through the REAL shared login endpoint,
    // and land the right role on the right main-app identity.
    const byRole = Object.fromEntries(onboard.json.logins.map((l) => [l.role, l]));
    const expectations = {
      "Center Owner": { accountType: "center", role: "owner", familyHubGuardian: false },
      Director: { accountType: "center", role: "director", familyHubGuardian: false },
      "Solo Home Daycare Provider": { accountType: "home_daycare", role: "owner", familyHubGuardian: false },
      "Lead Teacher": { accountType: "center", role: "teacher", familyHubGuardian: false },
      Assistant: { accountType: "center", role: "assistant", familyHubGuardian: false },
      "Curriculum Only Provider": { accountType: "curriculum_only", role: "owner", familyHubGuardian: false },
      "Guardian (multiple children)": { familyHubGuardian: true },
      "Financially Responsible Guardian": { familyHubGuardian: true },
      "Pickup-Only Guardian": { familyHubGuardian: true },
      "Restricted Guardian": { familyHubGuardian: true },
    };
    for (const [role, expected] of Object.entries(expectations)) {
      const login = byRole[role];
      const attempt = await requestJson("POST", "/api/auth/password-login", { email: login.email, password: login.temporaryPassword });
      assert.equal(attempt.status, 200, `${role}'s onboard-issued password should log in successfully`);
      if (expected.accountType) assert.equal(attempt.json.accountType, expected.accountType, `${role} accountType mismatch`);
      if (expected.role) assert.equal(attempt.json.role, expected.role, `${role} role mismatch`);
      assert.equal(attempt.json.familyHubGuardian, expected.familyHubGuardian, `${role} familyHubGuardian mismatch`);
    }
    pass("all 10 onboard-issued passwords log in successfully with the correct main-app identity");

    // Calling it again (e.g. the owner clicks the button twice) must not error or duplicate orgs.
    const onboardAgain = await requestJson("POST", "/api/testing-lab/onboard-everything", {}, auth);
    assert.equal(onboardAgain.status, 200, "onboard-everything should be safely re-runnable");
    assert.equal(onboardAgain.json.logins.length, EXPECTED_ROLES.length);
    assert.notEqual(
      onboardAgain.json.logins[0].temporaryPassword,
      onboard.json.logins[0].temporaryPassword,
      "re-running should issue fresh passwords, not reuse the first response's",
    );
    pass("onboard-everything is safely re-runnable and issues fresh passwords each time");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nPhase 23 onboard-everything checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
