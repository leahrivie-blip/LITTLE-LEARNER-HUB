#!/usr/bin/env node
/**
 * Regression: Postgres startup/recovery unavailability ("not yet accepting connections"
 * / 57P03) must use bounded longer backoff so brief crash-recovery windows do not
 * immediately fail writes. Exhausted failures still return a clear error (no silent drop).
 *
 * Mirrors 2026-08-30 production: backend SIGKILL → recovery mode → ready ~2.5s later,
 * while short write backoff exhausted ~200ms early.
 *
 * Run: NODE_ENV=test node scripts/test-postgres-startup-readiness.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 18980 + Math.floor(Math.random() * 80);
const ADMIN = {
  email: "startup-ready@example.com",
  password: "startup-ready-pass",
  code: "startup-ready-code",
};
const controlPath = path.join(os.tmpdir(), `llh-startup-ctrl-${crypto.randomBytes(4).toString("hex")}.json`);
const statusPath = path.join(os.tmpdir(), `llh-startup-status-${crypto.randomBytes(4).toString("hex")}.json`);
const storePath = path.join(os.tmpdir(), `llh-startup-store-${crypto.randomBytes(4).toString("hex")}.json`);

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
        timeout: 60000,
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
        ADMIN_NAME: "Startup Readiness Test",
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        LLH_STORE_PATH: storePath,
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_STATUS_PATH: statusPath,
        MOCK_PG_QUERY_DELAY_MS: "15",
        POSTGRES_RECONNECT_INTERVAL_MS: "800",
        STORE_SAFETY_ALERT_COOLDOWN_MS: "60000",
        // Fast but multi-step startup schedule for the recovery window test.
        POSTGRES_STARTUP_RETRY_COUNT: "6",
        POSTGRES_STARTUP_RETRY_BACKOFF_MS: "40,60,80,100,120,140",
        POSTGRES_STORE_WRITE_RETRY_COUNT: "2",
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
  const lessonId = `cur-lp-startup-${idSuffix}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: {
      id: lessonId,
      title: `Startup ${idSuffix}`,
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
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /function isPostgresStartupUnavailableError/);
  assert.match(serverJs, /POSTGRES_STARTUP_RETRY_COUNT/);
  assert.match(serverJs, /RESOLVED_POSTGRES_STARTUP_RETRY_BACKOFF_MS|POSTGRES_STARTUP_RETRY_BACKOFF_MS/);
  assert.match(serverJs, /startupRecovery/);
  assert.match(serverJs, /not yet accepting connections/);
  console.log("PASS  source contains startup/recovery readiness helpers");

  const child = startServer();
  try {
    await waitForBoot(child);
    const token = await adminLogin();

    // ---------- A) Brief not-accepting window recovers via startup backoff ----------
    console.log("A) Temporary not-accepting → bounded startup retry → write succeeds");
    writeControl({
      failNextConflictUpserts: 3,
      failWithNotAccepting: true,
    });
    const alertsBefore = countSafetyAlerts(child.__output());
    const attemptsBefore = readStatus().conflictUpsertAttempts || 0;
    const failuresBefore = readStatus().conflictUpsertFailures || 0;
    const successesBefore = readStatus().conflictUpsertSuccesses || 0;

    const { save, lessonId } = await saveTinyLesson(token, "recover-ok");
    assert.equal(save.status, 200, `expected save success after startup retries: ${save.status} ${save.text}`);
    assert.equal(save.json.lessonPlan?.id, lessonId);

    await new Promise((r) => setTimeout(r, 500));
    const status = readStatus();
    assert.ok(
      status.conflictUpsertFailures >= failuresBefore + 3,
      `expected ≥3 not-accepting failures, got ${status.conflictUpsertFailures - failuresBefore}`,
    );
    assert.ok(
      status.conflictUpsertAttempts >= attemptsBefore + 4,
      `expected retries beyond the 3 failures, attempts=${status.conflictUpsertAttempts - attemptsBefore}`,
    );
    assert.ok(
      status.conflictUpsertSuccesses >= successesBefore + 1,
      "store upsert must eventually succeed after recovery",
    );
    assert.match(
      child.__output(),
      /startupRecovery:\s*true|startup\/recovery/,
      "logs must mark startup/recovery retries",
    );
    assert.equal(
      countSafetyAlerts(child.__output()),
      alertsBefore,
      "successful startup recovery must not emit postgres_disconnect",
    );
    const ready = await requestJson("GET", "/api/launch-readiness");
    assert.equal(ready.json?.required?.database?.ready, true);
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert.ok(
      (reload.json.siteContent?.curriculum?.lessonPlans || []).some((p) => p.id === lessonId),
      "lesson must remain after startup-recovery retry",
    );
    console.log("PASS  A — not-accepting window recovered; write durable; no disconnect alert");

    // ---------- B) Exhausted not-accepting still fails closed with clear error ----------
    console.log("B) Exhausted not-accepting → clear failed write, databaseReady false");
    writeControl({
      failAllConflictUpserts: true,
      failAllSelects: true,
      failWithNotAccepting: true,
    });
    const alertsBeforeFail = countSafetyAlerts(child.__output());
    const { save: failSave } = await saveTinyLesson(token, "exhausted");
    assert.notEqual(failSave.status, 200, "must not report success when Postgres never recovers");
    assert.ok(failSave.status === 503 || failSave.status >= 500, `unexpected status ${failSave.status}`);
    assert.match(
      failSave.text,
      /database|save|persist|Could not|not ready|try again/i,
      "client must receive a clear persistence error",
    );
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(
      countSafetyAlerts(child.__output()) >= alertsBeforeFail + 1,
      "exhausted startup failure must alert once",
    );
    assert.match(child.__output(), /\[store-persistence\] failed_write/);
    assert.match(child.__output(), /not yet accepting connections/);

    const down = await requestJson("GET", "/api/launch-readiness");
    assert.equal(down.json?.required?.database?.ready, false);

    const blocked = await saveTinyLesson(token, "blocked-down");
    assert.notEqual(blocked.save.status, 200, "writes must stay fail-closed while not ready");
    assert.match(
      blocked.save.text,
      /database|save|persist|Could not|not ready|try again/i,
      "blocked write must return a clear error (no silent drop)",
    );
    assert.match(child.__output(), /writeStoreAsync_rejected|database_unavailable|store_not_persisted/);

    // Restore and confirm reconnect + write recovery.
    writeControl({});
    let restored = false;
    for (let i = 0; i < 25; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      const check = await requestJson("GET", "/api/launch-readiness");
      if (check.json?.required?.database?.ready === true) {
        restored = true;
        break;
      }
    }
    assert.ok(restored, "reconnect loop must restore readiness after Postgres recovers");
    const after = await saveTinyLesson(token, "after-restore");
    assert.equal(after.save.status, 200, `post-restore write failed: ${after.save.status} ${after.save.text}`);
    console.log("PASS  B — exhausted failure is explicit; reconnect restores writes");

    console.log("\nAll Postgres startup-readiness tests passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    console.error(child.__output().slice(-3000));
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
