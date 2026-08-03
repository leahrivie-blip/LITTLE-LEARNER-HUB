#!/usr/bin/env node
/**
 * Unit + integration: ephemeral test accounts persist on local-json, never on Postgres.
 * Run: npm run test:test-account-guard
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const guard = require("../server/test-account-guard.js");

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        : {},
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer({ storePath, port, env = {} }) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      ADMIN_EMAIL: "guard-admin@test.local",
      ADMIN_PASSWORD: "guard-pass",
      ADMIN_ACCESS_CODE: "12345",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  child.stdout.on("data", (buf) => {
    if (String(buf).includes("listening") || String(buf).includes(String(port))) ready = true;
  });
  return { child, isReady: () => ready };
}

async function waitForHealth(port, child, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server health timeout");
}

function unitTests() {
  assert.equal(guard.isEphemeralTestAccountEmail("matrix-free@test.local"), true);
  assert.equal(guard.isEphemeralTestAccountEmail("qa.provider@example.com"), true);
  assert.equal(guard.isEphemeralTestAccountEmail("smoke-user@llh-qa.example"), true);
  assert.equal(guard.isEphemeralTestAccountEmail("demo.user@gmail.com"), true);
  assert.equal(guard.isEphemeralTestAccountEmail("verify-no-side-effect@example.com"), true);
  assert.equal(guard.isEphemeralTestAccountEmail("audit-no-pay@example.com"), true);
  assert.equal(guard.isEphemeralTestAccountEmail("typoole04@gmail.com"), false);
  assert.equal(guard.isEphemeralTestAccountEmail("leahivie@icloud.com"), false);
  assert.equal(guard.isEphemeralTestAccountEmail("testimony@gmail.com"), false);

  assert.equal(guard.shouldExcludeFromCustomerAnalytics("audit-no-pay@example.com"), true);
  assert.equal(guard.shouldExcludeFromCustomerAnalytics("demo.user@gmail.com"), true);
  assert.equal(guard.shouldExcludeFromCustomerAnalytics("typoole04@gmail.com"), false);
  assert.equal(
    guard.shouldExcludeFromCustomerAnalytics("audit-no-pay@example.com", {
      ANALYTICS_INCLUDE_TEST_ACCOUNTS: "true",
    }),
    false,
  );
  const filtered = guard.filterUsersForCustomerAnalytics([
    { email: "real@provider.com" },
    { email: "qa.probe@example.com" },
  ]);
  assert.equal(filtered.users.length, 1);
  assert.equal(filtered.excludedCount, 1);
  assert.equal(filtered.users[0].email, "real@provider.com");
  console.log("PASS analytics exclusion helpers");

  assert.equal(guard.shouldRejectTestAccountPersistence("matrix-free@test.local", {
    DATABASE_PROVIDER: "postgres",
  }), true);
  assert.equal(guard.shouldRejectTestAccountPersistence("matrix-free@test.local", {
    DATABASE_PROVIDER: "local-json",
  }), false);
  assert.equal(guard.shouldRejectTestAccountPersistence("matrix-free@test.local", {
    DATABASE_PROVIDER: "postgres",
    ALLOW_TEST_ACCOUNT_EMAILS: "true",
  }), false);
  assert.equal(guard.shouldRejectTestAccountPersistence("typoole04@gmail.com", {
    DATABASE_PROVIDER: "postgres",
  }), false);

  const store = {
    users: {
      "matrix-free@test.local": { email: "matrix-free@test.local" },
      "real@gmail.com": { email: "real@gmail.com" },
    },
    featureRequests: [
      { email: "guest-idea@example.com", title: "x" },
      { email: "real@gmail.com", title: "y" },
    ],
  };
  const pruned = guard.pruneEphemeralTestAccountsFromStore(store, { DATABASE_PROVIDER: "postgres" });
  assert.equal(pruned.removedUsers, 1);
  assert.equal(pruned.removedFeatureRequests, 1);
  assert.ok(store.users["real@gmail.com"]);
  assert.equal(store.users["matrix-free@test.local"], undefined);
  console.log("PASS unit guard rules");
}

async function integrationLocalJsonAllowsTestAccounts() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-guard-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, featureRequests: [] }));
  const port = 21000 + Math.floor(Math.random() * 400);
  const { child } = startServer({ storePath, port });
  try {
    await waitForHealth(port, child);
    const email = "guard-suite@test.local";
    const profile = await requestJson(port, "POST", "/api/account/profile", {
      email,
      firstName: "Guard",
      lastName: "Suite",
      signup: true,
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.json?.skipped, undefined);
    assert.equal(profile.json?.user?.email, email);

    const analytics = await requestJson(port, "POST", "/api/analytics/event", {
      name: "page_view",
      user: email,
      plan: "Free",
      path: "/",
    });
    assert.equal(analytics.status, 200);

    const disk = JSON.parse(fs.readFileSync(storePath, "utf8"));
    assert.ok(disk.users?.[email], "local-json should still save test personas for suites");
    console.log("PASS local-json still persists test accounts for suites");
  } finally {
    child.kill("SIGTERM");
  }
}

async function main() {
  unitTests();
  await integrationLocalJsonAllowsTestAccounts();
  console.log("All test-account-guard checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
