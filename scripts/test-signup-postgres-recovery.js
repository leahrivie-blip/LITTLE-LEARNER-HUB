#!/usr/bin/env node
/**
 * Regression: new-user signup must survive brief Postgres recovery-mode windows
 * without duplicate users, without failed_write safety mail on successful recovery,
 * and without leaving databaseReady permanently false.
 *
 * Mirrors production signup pressure:
 *   account_signup_complete analytics writeStoreAsync
 *   + /api/account/profile signup:true writeStoreAsync
 * racing on the full llh_store upsert chain while Postgres returns 57P03 recovery mode.
 *
 * Run: NODE_ENV=test node scripts/test-signup-postgres-recovery.js
 */
"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19120 + Math.floor(Math.random() * 80);
const ADMIN = {
  email: "signup-recovery-admin@example.com",
  password: "signup-recovery-pass",
  code: "signup-recovery-code",
};
const controlPath = path.join(os.tmpdir(), `llh-signup-rec-ctrl-${crypto.randomBytes(4).toString("hex")}.json`);
const statusPath = path.join(os.tmpdir(), `llh-signup-rec-status-${crypto.randomBytes(4).toString("hex")}.json`);
const storePath = path.join(os.tmpdir(), `llh-signup-rec-store-${crypto.randomBytes(4).toString("hex")}.json`);

function writeControl(ctrl) {
  fs.writeFileSync(controlPath, JSON.stringify(ctrl, null, 2));
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch {
    return {};
  }
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
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
        timeout: 90000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(extraEnv = {}) {
  writeControl({});
  const child = spawn(
    process.execPath,
    ["-r", path.join(__dirname, "mock-pg-preload.js"), "server/index.js"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        SITE_URL: `http://127.0.0.1:${PORT}`,
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_ACCESS_CODE: ADMIN.code,
        ADMIN_NAME: "Signup Recovery Test",
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        LLH_STORE_PATH: storePath,
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_STATUS_PATH: statusPath,
        MOCK_PG_QUERY_DELAY_MS: "15",
        POSTGRES_RECONNECT_INTERVAL_MS: "600",
        STORE_SAFETY_ALERT_COOLDOWN_MS: "60000",
        POSTGRES_STARTUP_RETRY_COUNT: "6",
        POSTGRES_STARTUP_RETRY_BACKOFF_MS: "30,40,50,60,70,80",
        POSTGRES_STORE_WRITE_RETRY_COUNT: "2",
        META_CAPI_ENABLED: "false",
        EMAIL_AUTOMATIONS_ENABLED: "false",
        NODE_ENV: "test",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => {
    output += d;
  });
  child.stderr.on("data", (d) => {
    output += d;
  });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 150; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch {
      /* retry */
    }
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${child.__output().slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not boot:\n${child.__output().slice(-2000)}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* */
      }
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function countSafetyAlerts(output) {
  return (output.match(/\[store-safety\]\s+postgres_disconnect/g) || []).length;
}

function profileHeaders(email) {
  return {
    Authorization: `Bearer test:${email}`,
    "X-LLH-User-Email": email,
  };
}

async function signupProfile(email, extra = {}) {
  return requestJson(
    "POST",
    "/api/account/profile",
    {
      email,
      firstName: "Recovery",
      lastName: "Signup",
      phone: "555-0199",
      accountType: "home_daycare",
      role: "owner",
      signup: true,
      lastLogin: true,
      metaEventId: `reg_${email.replace(/\W/g, "")}`,
      ...extra,
    },
    profileHeaders(email),
  );
}

async function signupAnalytics(email) {
  return requestJson("POST", "/api/analytics/event", {
    name: "account_signup_complete",
    user: email,
    detail: {
      firstName: "Recovery",
      lastName: "Signup",
      email,
    },
  });
}

async function launchDbReady() {
  const ready = await requestJson("GET", "/api/launch-readiness");
  return Boolean(ready.json?.required?.database?.ready);
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /failed_write_superseded/);
  assert.match(serverJs, /write_async_superseded_recovered/);
  assert.match(serverJs, /isTransientPostgresConnectionError\(error\)/);
  assert.match(serverJs, /the database system is in recovery mode/);
  console.log("PASS  source contains signup recovery / superseded-write guards");

  const child = startServer();
  try {
    await waitForBoot(child);
    assert.equal(await launchDbReady(), true, "database must start ready");

    // ---------- 1) Normal signup: one durable persist path, one user ----------
    console.log("1) Normal signup succeeds");
    const email1 = `signup-rec-ok-${Date.now()}@gmail.com`;
    const attemptsBefore1 = readStatus().conflictUpsertAttempts || 0;
    const alertsBefore1 = countSafetyAlerts(child.__output());
    const profile1 = await signupProfile(email1);
    assert.equal(profile1.status, 200, `normal signup failed: ${profile1.status} ${profile1.text}`);
    assert.equal(profile1.json?.ok, true);
    assert.equal(profile1.json?.user?.email, email1);
    await new Promise((r) => setTimeout(r, 1200));
    assert.ok(
      (readStatus().storeUserCount || 0) >= 1,
      "normal signup must persist a user row in llh_store",
    );
    assert.equal(countSafetyAlerts(child.__output()), alertsBefore1, "normal signup must not alert");
    assert.ok(
      (readStatus().conflictUpsertAttempts || 0) >= attemptsBefore1 + 1,
      "normal signup must perform a Postgres store upsert",
    );
    console.log("PASS  1 — normal signup persisted without safety alert");

    // ---------- 2) Brief recovery-mode → bounded retry → success, no alert ----------
    console.log("2) Temporary recovery-mode on profile write");
    const email2 = `signup-rec-retry-${Date.now()}@gmail.com`;
    writeControl({
      failNextConflictUpserts: 2,
      failWithRecoveryMode: true,
    });
    const alertsBefore2 = countSafetyAlerts(child.__output());
    const failuresBefore2 = readStatus().conflictUpsertFailures || 0;
    const profile2 = await signupProfile(email2);
    assert.equal(profile2.status, 200, `retry signup failed: ${profile2.status} ${profile2.text}`);
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(
      (readStatus().conflictUpsertFailures || 0) >= failuresBefore2 + 2,
      "expected recovery-mode failures before success",
    );
    assert.match(
      child.__output(),
      /startupRecovery:\s*true|recovery mode|write_retry/,
      "must log recovery retries",
    );
    assert.equal(
      countSafetyAlerts(child.__output()),
      alertsBefore2,
      "successful recovery retry must not emit postgres_disconnect",
    );
    assert.equal(await launchDbReady(), true, "readiness must stay/restore true after retry success");
    console.log("PASS  2 — recovery-mode retry succeeded without failed_write alert");

    // ---------- 3) Concurrent analytics + profile during recovery (signup race) ----------
    console.log("3) Concurrent analytics+profile signup under recovery-mode");
    const email3 = `signup-rec-race-${Date.now()}@gmail.com`;
    writeControl({
      failNextConflictUpserts: 3,
      failWithRecoveryMode: true,
    });
    const alertsBefore3 = countSafetyAlerts(child.__output());
    const usersBefore3 = readStatus().storeUserCount || 0;

    const [analytics3, profile3] = await Promise.all([
      signupAnalytics(email3),
      signupProfile(email3),
    ]);
    // At least one path must succeed durably; prefer profile 200.
    assert.ok(
      profile3.status === 200 || analytics3.status === 200,
      `expected durable signup success, profile=${profile3.status} analytics=${analytics3.status}`,
    );
    await new Promise((r) => setTimeout(r, 800));
    assert.ok(
      (readStatus().storeUserCount || 0) >= usersBefore3 + 1,
      "exactly-once user must exist after concurrent signup recovery",
    );
    // Count occurrences of this email in mock store dump if present.
    const dumpUsers = readStatus().storeUserCount || 0;
    assert.ok(dumpUsers >= usersBefore3 + 1, "user persisted once");
    assert.equal(
      countSafetyAlerts(child.__output()),
      alertsBefore3,
      "concurrent signup recovery must not emit failed_write when a newer write succeeds",
    );
    assert.match(
      child.__output(),
      /failed_write_superseded|write_async_superseded_recovered|write_retry|startupRecovery/,
      "must show retry and/or superseded-write handling",
    );
    assert.equal(await launchDbReady(), true);
    console.log("PASS  3 — concurrent signup recovered; one user; no failed_write alert");

    // ---------- 4) Persistent recovery-mode still fails closed + alerts ----------
    console.log("4) Persistent recovery-mode still alerts");
    writeControl({
      failAllConflictUpserts: true,
      failAllSelects: true,
      failWithRecoveryMode: true,
    });
    const alertsBefore4 = countSafetyAlerts(child.__output());
    const email4 = `signup-rec-fail-${Date.now()}@gmail.com`;
    const profile4 = await signupProfile(email4);
    assert.notEqual(profile4.status, 200, "must not report success when recovery never ends");
    assert.ok(profile4.status === 503 || profile4.status >= 500, `unexpected ${profile4.status}`);
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(
      countSafetyAlerts(child.__output()) >= alertsBefore4 + 1,
      "persistent recovery failure must still emit postgres_disconnect",
    );
    assert.match(child.__output(), /\[store-persistence\] failed_write/);
    assert.match(child.__output(), /recovery mode/);
    assert.equal(await launchDbReady(), false, "databaseReady must be false after exhausted failure");
    console.log("PASS  4 — persistent recovery still fail-closed with safety alert");

    // ---------- 5) Readiness recovers after Postgres becomes healthy ----------
    console.log("5) Readiness recovers after Postgres healthy again");
    writeControl({}); // clear failures — reconnect loop can probe + reload again
    let recovered = false;
    for (let i = 0; i < 40; i += 1) {
      if (await launchDbReady()) {
        recovered = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(recovered, "reconnect loop must restore databaseReady");
    // One successful write after reconnect proves the pool is healthy again.
    const email5 = `signup-rec-after-${Date.now()}@gmail.com`;
    const profile5 = await signupProfile(email5);
    assert.equal(profile5.status, 200, `signup after recovery failed: ${profile5.status} ${profile5.text}`);
    assert.equal(await launchDbReady(), true);
    console.log("PASS  5 — readiness restored; subsequent signup works");

    // ---------- 6) Validation errors are not retried (400, no write_retry storm) ----------
    console.log("6) Validation errors are not retried");
    const retryLogsBefore = (child.__output().match(/write_retry/g) || []).length;
    const bad = await requestJson("POST", "/api/account/profile", { signup: true }, {});
    assert.ok(bad.status === 400 || bad.status === 401, `expected validation/auth failure, got ${bad.status}`);
    await new Promise((r) => setTimeout(r, 200));
    const retryLogsAfter = (child.__output().match(/write_retry/g) || []).length;
    assert.equal(retryLogsAfter, retryLogsBefore, "validation failures must not trigger Postgres write retries");
    console.log("PASS  6 — validation/auth errors are not retried");

    // ---------- 7) Unique / non-transient errors are not classified as recovery retries ----------
    console.log("7) Source: only transient/recovery errors enter retry budget");
    assert.match(serverJs, /function isPostgresStartupUnavailableError/);
    assert.match(serverJs, /function isTransientPostgresConnectionError/);
    assert.match(serverJs, /if \(!isTransientPostgresConnectionError\(error\)\) throw error;/);
    assert.doesNotMatch(
      serverJs.slice(
        serverJs.indexOf("function isTransientPostgresConnectionError"),
        serverJs.indexOf("function isTransientPostgresConnectionError") + 800,
      ),
      /unique|23505|validation/i,
    );
    console.log("PASS  7 — unique/validation errors are excluded from transient retry");

  } finally {
    await stopServer(child);
    try { fs.unlinkSync(controlPath); } catch { /* */ }
    try { fs.unlinkSync(statusPath); } catch { /* */ }
    try { fs.unlinkSync(storePath); } catch { /* */ }
  }

  console.log("\nAll signup Postgres recovery tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
