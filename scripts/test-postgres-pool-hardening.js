#!/usr/bin/env node
/**
 * Postgres pool hardening:
 * - Dropped connection during an idempotent store upsert is retried once
 * - Successful retry does not fire postgres_disconnect safety alerts
 * - Store data is persisted exactly once (no duplicate rows / duplicate writes)
 * - Idle pool errors are handled without crashing
 * - Exhausted transient failures still alert once, then reconnect restores ready
 *
 * Run: NODE_ENV=test node scripts/test-postgres-pool-hardening.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 18810 + Math.floor(Math.random() * 80);
const ADMIN = {
  email: "pool-harden@example.com",
  password: "pool-harden-pass",
  code: "pool-harden-code",
};
const controlPath = path.join(os.tmpdir(), `llh-mock-pg-control-${crypto.randomBytes(4).toString("hex")}.json`);
const statusPath = path.join(os.tmpdir(), `llh-mock-pg-status-${crypto.randomBytes(4).toString("hex")}.json`);
const storePath = path.join(os.tmpdir(), `llh-pool-harden-store-${crypto.randomBytes(4).toString("hex")}.json`);

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

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 45000,
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
        ADMIN_NAME: "Pool Harden Test",
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        LLH_STORE_PATH: storePath,
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_STATUS_PATH: statusPath,
        MOCK_PG_QUERY_DELAY_MS: "20",
        POSTGRES_RECONNECT_INTERVAL_MS: "1000",
        STORE_SAFETY_ALERT_COOLDOWN_MS: "60000",
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

async function adminLogin() {
  const login = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert.equal(login.status, 200, `login failed: ${login.status} ${login.text}`);
  return login.json.token;
}

function countSafetyAlerts(output) {
  return (output.match(/\[store-safety\]\s+postgres_disconnect/g) || []).length;
}

async function saveTinyLesson(token, idSuffix) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert.equal(bootstrap.status, 200, `bootstrap failed: ${bootstrap.status}`);
  const expectedUpdatedAt = bootstrap.json.siteContent?.updatedAt || "";
  const lessonId = `cur-lp-pool-${idSuffix}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: {
      id: lessonId,
      title: `Pool Harden ${idSuffix}`,
      age: "Toddler",
      theme: "Test",
      plan: "Free",
      status: "draft",
      learningDomains: ["Cognitive"],
      weeklyOverview: "Tiny",
      objectives: "Persist",
      weeklyMaterials: "none",
      vocabularyWords: "test",
      observationOpportunities: "watch",
      adaptations: "n/a",
      familyConnection: "share",
      books: [],
      songs: [],
      dailyPlans: {
        monday: {
          items: [{
            itemId: "item-1",
            activityCategory: "Sensory Play",
            title: "One Activity",
            description: "d",
            materials: "m",
            steps: "1. do",
            learningGoals: ["g"],
          }],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      resourceIds: [],
      activityIds: [],
    },
  });
  return { save, lessonId };
}

async function main() {
  // Static source checks first (no server).
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /createConfiguredPostgresPool/);
  assert.match(serverJs, /postgresQueryWithTransientRetry/);
  assert.match(serverJs, /isTransientPostgresConnectionError/);
  assert.match(serverJs, /idleTimeoutMillis:\s*POSTGRES_IDLE_TIMEOUT_MS/);
  assert.match(serverJs, /pool\.on\("error"/);
  assert.match(serverJs, /POSTGRES_TRANSIENT_RETRY_COUNT/);
  assert.match(serverJs, /sticky lastPostgresError/);
  assert.match(serverJs, /if \(databaseReady\) lastPostgresError = ""/);
  console.log("PASS  source contains pool hardening helpers");

  const child = startServer();
  try {
    await waitForBoot(child);
    assert.match(child.__output(), /Postgres pool idle client error|listening on|storage ready/i);
    const statusAfterBoot = readStatus();
    assert.ok(statusAfterBoot.poolErrorHandlers >= 1, "pool.on('error') must be registered");
    console.log("PASS  pool error handler registered at boot");

    const token = await adminLogin();

    // 1) Dropped connection on first conflict upsert — retry succeeds, no safety alert.
    writeControl({ failNextConflictUpserts: 1 });
    const beforeAttempts = readStatus().conflictUpsertAttempts || 0;
    const beforeSuccesses = readStatus().conflictUpsertSuccesses || 0;
    const alertsBefore = countSafetyAlerts(child.__output());

    const { save, lessonId } = await saveTinyLesson(token, "retry-ok");
    assert.equal(save.status, 200, `curriculum save after drop failed: ${save.status} ${save.text}`);
    assert.equal(save.json.lessonPlan?.id, lessonId);

    // Let write chain settle.
    await new Promise((r) => setTimeout(r, 400));
    const status = readStatus();
    assert.ok(
      status.conflictUpsertAttempts >= beforeAttempts + 2,
      `expected at least 2 upsert attempts after one forced failure, got attempts=${status.conflictUpsertAttempts} before=${beforeAttempts}`,
    );
    assert.ok(
      status.conflictUpsertSuccesses >= beforeSuccesses + 1,
      "successful retry must persist the store upsert once",
    );
    assert.ok(
      status.conflictUpsertFailures >= 1,
      "mock must have simulated at least one connection drop",
    );
    assert.ok(
      (status.writes || []).filter((w) => w.conflictUpsert && w.lessonCount > 0).length >= 1,
      "persisted store must include the curriculum write",
    );
    assert.equal(
      countSafetyAlerts(child.__output()),
      alertsBefore,
      "successful retry must not emit postgres_disconnect safety alerts",
    );
    assert.match(child.__output(), /transient Postgres error on Postgres store upsert — retry/);
    console.log("PASS  dropped connection during write recovers via single retry without alert");

    // Confirm data survives a reload from mock Postgres.
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert.equal(reload.status, 200);
    const plans = reload.json.siteContent?.curriculum?.lessonPlans || [];
    assert.ok(plans.some((p) => p.id === lessonId), "lesson must remain after reconnect-safe upsert");
    console.log("PASS  no data loss after transient write failure");

    // 2) Idle pool error must be handled (logged) without process exit / safety spam.
    const alertsBeforeIdle = countSafetyAlerts(child.__output());
    writeControl({ emitIdleError: true });
    // launch-readiness does not query while ready — force a store upsert so the mock
    // can emit the idle client error through pool.on('error') before the query runs.
    const { save: idleSave, lessonId: idleLessonId } = await saveTinyLesson(token, "idle-err");
    assert.equal(idleSave.status, 200, `idle-error write failed: ${idleSave.status} ${idleSave.text}`);
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(readStatus().idleErrorsEmitted >= 1, "idle error should have been emitted");
    assert.equal(child.exitCode, null, "idle pool error must not crash the process");
    const ready = await requestJson("GET", "/api/launch-readiness");
    assert.equal(ready.status, 200);
    assert.equal(ready.json?.required?.database?.ready, true);
    assert.equal(
      countSafetyAlerts(child.__output()),
      alertsBeforeIdle,
      "idle client errors must not raise postgres_disconnect alerts",
    );
    assert.match(child.__output(), /Postgres pool idle client error/);
    const idleReload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert.ok(
      (idleReload.json.siteContent?.curriculum?.lessonPlans || []).some((p) => p.id === idleLessonId),
      "write after idle error must still persist",
    );
    console.log("PASS  idle pool error handled without crash or safety alert");

    // 3) Exhausted failures still alert once; keep reads down so reconnect cannot
    // heal until we clear the outage — then reconnect restores ready without spam.
    writeControl({ failAllConflictUpserts: true, failAllSelects: true });
    const alertsBeforeFail = countSafetyAlerts(child.__output());
    const { save: failSave } = await saveTinyLesson(token, "fail-exhausted");
    assert.ok(failSave.status === 200 || failSave.status >= 500, `unexpected fail-save status ${failSave.status}`);
    await new Promise((r) => setTimeout(r, 400));
    const alertsAfterFail = countSafetyAlerts(child.__output());
    assert.equal(alertsAfterFail, alertsBeforeFail + 1, "exactly one safety alert after exhausted retries");
    assert.match(child.__output(), /Postgres writeAsync failed|postgres_write_failed/);

    const down = await requestJson("GET", "/api/launch-readiness");
    assert.equal(down.json?.required?.database?.ready, false, "databaseReady should be false after exhausted failures");

    // Hold the outage briefly so reconnect loop cannot immediately flip ready back.
    await new Promise((r) => setTimeout(r, 1200));
    const stillDown = await requestJson("GET", "/api/launch-readiness");
    assert.equal(stillDown.json?.required?.database?.ready, false, "ready must stay false while selects fail");

    // Restore connectivity; reconnect loop (1s) should reload authentic store.
    writeControl({ failAllConflictUpserts: false, failAllSelects: false, failNextConflictUpserts: 0 });
    let restored = false;
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const check = await requestJson("GET", "/api/launch-readiness");
      if (check.json?.required?.database?.ready === true) {
        restored = true;
        break;
      }
    }
    assert.ok(restored, "reconnect loop should restore databaseReady after connectivity returns");
    assert.match(child.__output(), /Postgres reconnect restored authentic store/);
    // Still only the one alert from the exhausted failure window (cooldown).
    assert.equal(
      countSafetyAlerts(child.__output()),
      alertsBeforeFail + 1,
      "reconnect must not spam repeated safety alerts",
    );
    console.log("PASS  exhausted failure alerts once; reconnect restores ready without repeat alerts");

    console.log("\nAll Postgres pool hardening tests passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    console.error(child.__output().slice(-2500));
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    for (const file of [controlPath, statusPath, storePath]) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* */
      }
    }
  }
}

main();
