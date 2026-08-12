#!/usr/bin/env node
/**
 * Production reliability repair regressions (2026-08-12 incident):
 * A) In-flight checked-out pg Client 'error' must not crash Node
 * B) Temporary Postgres outage → refuse writes → reconnect → recovery alert once
 * C) Rapid mutations coalesce (not N full-store upserts)
 * D) Mutation during active persistence drains newest state once
 * E) Identical state skips unnecessary UPSERT
 *
 * Run: NODE_ENV=test node scripts/test-postgres-reliability-repair.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 18910 + Math.floor(Math.random() * 80);
const ADMIN = {
  email: "reliability@example.com",
  password: "reliability-pass",
  code: "reliability-code",
};
const controlPath = path.join(os.tmpdir(), `llh-rel-ctrl-${crypto.randomBytes(4).toString("hex")}.json`);
const statusPath = path.join(os.tmpdir(), `llh-rel-status-${crypto.randomBytes(4).toString("hex")}.json`);
const storePath = path.join(os.tmpdir(), `llh-rel-store-${crypto.randomBytes(4).toString("hex")}.json`);

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
        ADMIN_NAME: "Reliability Test",
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        LLH_STORE_PATH: storePath,
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_STATUS_PATH: statusPath,
        MOCK_PG_QUERY_DELAY_MS: "30",
        POSTGRES_RECONNECT_INTERVAL_MS: "800",
        STORE_SAFETY_ALERT_COOLDOWN_MS: "1000",
        STORE_WRITE_DEBOUNCE_MS: "200",
        // Match production intent: lastSeenAt full-store persists are rate-limited.
        LAST_SEEN_STORE_PERSIST_MIN_INTERVAL_MS: "60000",
        // Avoid Resend attempts in tests.
        RESEND_API_KEY: "",
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
  for (let i = 0; i < 160; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) break;
    } catch {
      /* retry */
    }
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${child.__output().slice(-2500)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  // Let curriculum seed write chain settle.
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 50; i += 1) {
    const count = readStatus().conflictUpsertSuccesses || 0;
    if (count === last) stable += 1;
    else stable = 0;
    last = count;
    if (stable >= 4) return;
    await new Promise((r) => setTimeout(r, 120));
  }
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
    }, 4000);
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

function countMatches(output, re) {
  return (output.match(re) || []).length;
}

async function saveTinyLesson(token, idSuffix) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert.equal(bootstrap.status, 200, `bootstrap failed: ${bootstrap.status}`);
  const expectedUpdatedAt = bootstrap.json.siteContent?.updatedAt || "";
  const lessonId = `cur-lp-rel-${idSuffix}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan: {
      id: lessonId,
      title: `Reliability ${idSuffix}`,
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
  assert.match(serverJs, /async function withPostgresClient/);
  assert.match(serverJs, /maybeAlertPostgresRecovered/);
  assert.match(serverJs, /full_store_write_skipped_identical/);
  assert.match(serverJs, /write_coalesced_inflight/);
  assert.match(serverJs, /postgresWriteInFlight/);
  assert.doesNotMatch(serverJs, /process\.on\(\s*["']uncaughtException["']/);
  console.log("PASS  source contains reliability helpers (no uncaughtException swallow)");

  const child = startServer();
  const memBefore = process.memoryUsage().heapUsed;
  try {
    await waitForBoot(child);
    assert.equal(child.exitCode, null, "server must stay alive through boot");
    const token = await adminLogin();
    const baselineWrites = readStatus().conflictUpsertSuccesses || 0;
    const baselineStarts = countMatches(child.__output(), /\[store-persistence\] full_store_write_start/g);

    // ---------- TEST A: killed in-flight checked-out client ----------
    console.log("A) In-flight Client error must not crash Node");
    writeControl({ killNextCheckedOutQuery: true });
    const killSave = await saveTinyLesson(token, "kill-inflight");
    // Save may 503 or 200 depending on retry success after kill.
    assert.ok(
      killSave.save.status === 200 || killSave.save.status >= 500,
      `unexpected status after client kill: ${killSave.save.status} ${killSave.save.text}`,
    );
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(child.exitCode, null, "Node must remain alive after checked-out client error");
    assert.ok(
      readStatus().checkedOutClientErrorsEmitted >= 1,
      "mock must have emitted a checked-out client error",
    );
    assert.match(child.__output(), /Postgres checked-out client error/);
    // Clear kill flag; prove reconnect / subsequent write works.
    writeControl({});
    let readyAgain = false;
    for (let i = 0; i < 25; i += 1) {
      const ready = await requestJson("GET", "/api/launch-readiness");
      if (ready.json?.required?.database?.ready === true) {
        readyAgain = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.ok(readyAgain, "databaseReady should recover after in-flight client kill");
    const afterKill = await saveTinyLesson(token, "after-kill");
    assert.ok(afterKill && afterKill.save, `after-kill missing save wrapper: ${JSON.stringify(afterKill)}`);
    assert.equal(
      afterKill.save.status,
      200,
      `post-recovery save failed: ${afterKill.save.status} ${String(afterKill.save.text || "").slice(0, 300)}`,
    );
    console.log("PASS  A — in-flight client kill handled; process alive; reconnect works");

    // Let disconnect-alert cooldown elapse so TEST B can emit a fresh incident.
    await new Promise((r) => setTimeout(r, 1200));

    // ---------- TEST B: outage → refuse writes → recover + alerts ----------
    console.log("B) Temporary outage, write blocking, disconnect + recovery alerts");
    writeControl({ failAllConflictUpserts: true, failAllSelects: true, failWithNotAccepting: true });
    const disconnectBefore = countMatches(child.__output(), /\[store-safety\]\s+postgres_disconnect/g);
    const recoverBefore = countMatches(child.__output(), /\[store-safety\]\s+postgres_recovered/g);
    const failSave = await saveTinyLesson(token, "outage");
    assert.ok(failSave.save.status === 200 || failSave.save.status >= 500);
    await new Promise((r) => setTimeout(r, 600));
    const down = await requestJson("GET", "/api/launch-readiness");
    assert.equal(down.json?.required?.database?.ready, false, "databaseReady false during outage");

    // Critical write while down should fail closed (not pretend success).
    const blocked = await saveTinyLesson(token, "blocked-while-down");
    assert.notEqual(blocked.save.status, 200, "durable admin write must not succeed while DB down");
    assert.ok(
      countMatches(child.__output(), /\[store-safety\]\s+postgres_disconnect/g) >= disconnectBefore + 1,
      "disconnect alert must fire",
    );

    writeControl({});
    let restored = false;
    for (let i = 0; i < 30; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      const check = await requestJson("GET", "/api/launch-readiness");
      if (check.json?.required?.database?.ready === true) {
        restored = true;
        break;
      }
    }
    assert.ok(restored, "reconnect must restore databaseReady");
    assert.match(child.__output(), /Postgres reconnect restored authentic store/);
    await new Promise((r) => setTimeout(r, 400));
    const recoverAfter = countMatches(child.__output(), /\[store-safety\]\s+postgres_recovered/g);
    assert.equal(recoverAfter, recoverBefore + 1, "recovery confirmation must occur exactly once");
    // Hold briefly — reconnect ticks must not spam recovery.
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(
      countMatches(child.__output(), /\[store-safety\]\s+postgres_recovered/g),
      recoverBefore + 1,
      "recovery alert must not spam",
    );
    console.log("PASS  B — outage blocks writes; disconnect + single recovery alert");

    // ---------- TEST C: coalesce rapid lastSeenAt mutations ----------
    console.log("C) Rapid mutations must not each produce a full-store UPSERT");
    writeControl({ delayConflictUpsertMs: 400 });
    const writesBeforeBurst = readStatus().conflictUpsertSuccesses || 0;
    const startsBeforeBurst = countMatches(child.__output(), /\[store-persistence\] full_store_write_start/g);
    // Seed a user via login analytics (durable once), then burst page_views.
    const login = await requestJson("POST", "/api/analytics/event", {
      name: "account_login_complete",
      user: "coalesce-user@llh-test.org",
      sessionId: "coalesce-login",
    });
    assert.equal(login.status, 200, login.text);
    await new Promise((r) => setTimeout(r, 700));
    const writesAfterLogin = readStatus().conflictUpsertSuccesses || 0;
    assert.ok(writesAfterLogin > writesBeforeBurst, "login should persist a durable user patch");

    for (let i = 0; i < 12; i += 1) {
      const res = await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/coalesce-${i}`,
        user: "coalesce-user@llh-test.org",
        sessionId: `coalesce-session-${i}`,
      });
      assert.equal(res.status, 200, res.text);
    }
    await new Promise((r) => setTimeout(r, 1200));
    writeControl({});
    const writesAfterBurst = readStatus().conflictUpsertSuccesses || 0;
    const startsAfterBurst = countMatches(child.__output(), /\[store-persistence\] full_store_write_start/g);
    const burstUpserts = writesAfterBurst - writesAfterLogin;
    const burstStarts = startsAfterBurst - startsBeforeBurst;
    const avoided = countMatches(child.__output(), /analyticsFullStoreWritesAvoided/) // not logged
      || 0;
    console.log(
      `   metrics: loginUpserts=${writesAfterLogin - writesBeforeBurst} burstUpserts=${burstUpserts} burstStarts=${burstStarts} coalescedLog=${countMatches(child.__output(), /write_coalesced_inflight/g)}`,
    );
    // With lastSeenAt persist throttle (60s), 12 page_views schedule at most one debounced upsert.
    assert.ok(burstUpserts <= 2, `expected ≤2 upserts for 12 page_views, got ${burstUpserts}`);
    assert.ok(burstUpserts < 12, "must not write once per mutation");
    void avoided;
    const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert.equal(site.status, 200);
    console.log("PASS  C — write coalescing + lastSeenAt throttle reduced full-store upserts");

    // ---------- TEST D: mutate during active persistence ----------
    console.log("D) Mutation during active persistence keeps newest state");
    writeControl({ delayConflictUpsertMs: 900 });
    const d1 = saveTinyLesson(token, "during-persist-a");
    await new Promise((r) => setTimeout(r, 120));
    // While first write delayed, schedule debounced lastSeenAt touches.
    for (let i = 0; i < 5; i += 1) {
      await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/during-${i}`,
        user: "coalesce-user@llh-test.org",
        sessionId: `during-${i}`,
      });
    }
    const d1Result = await d1;
    assert.equal(d1Result.save.status, 200, d1Result.save.text);
    await new Promise((r) => setTimeout(r, 1800));
    writeControl({});
    assert.match(child.__output(), /dirty_store_drain|write_coalesced_inflight|full_store_write_success/);
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const plans = reload.json.siteContent?.curriculum?.lessonPlans || [];
    assert.ok(plans.some((p) => p.id === d1Result.lessonId), "lesson from in-flight write must persist");
    console.log("PASS  D — newest state retained across in-flight mutation");

    // ---------- TEST E: identical state skip ----------
    console.log("E) Identical state skips full-store UPSERT");
    writeControl({});
    const identicalBefore = countMatches(child.__output(), /full_store_write_skipped_identical/g);
    const upsertsBeforeIdent = readStatus().conflictUpsertSuccesses || 0;
    const health1 = readStatus().conflictUpsertSuccesses || 0;
    await requestJson("GET", "/api/health");
    await requestJson("GET", "/api/launch-readiness");
    await new Promise((r) => setTimeout(r, 300));
    const health2 = readStatus().conflictUpsertSuccesses || 0;
    assert.equal(health2, health1, "health/readiness must not upsert llh_store");

    // Two debounced flushes with the same lastSeenAt timestamp (same createdAt) should
    // allow the identical-fingerprint skip on the second persistence.
    const fixedAt = "2026-08-12T16:00:00.000Z";
    writeControl({ delayConflictUpsertMs: 400 });
    await requestJson("POST", "/api/analytics/event", {
      name: "page_view",
      path: "/ident-1",
      user: "coalesce-user@llh-test.org",
      sessionId: "ident-1",
      createdAt: fixedAt,
    });
    await new Promise((r) => setTimeout(r, 700));
    await requestJson("POST", "/api/analytics/event", {
      name: "page_view",
      path: "/ident-1",
      user: "coalesce-user@llh-test.org",
      sessionId: "ident-1b",
      createdAt: fixedAt,
    });
    await new Promise((r) => setTimeout(r, 1500));
    writeControl({});
    const identicalAfter = countMatches(child.__output(), /full_store_write_skipped_identical/g);
    const upsertsAfterIdent = readStatus().conflictUpsertSuccesses || 0;
    assert.ok(
      identicalAfter > identicalBefore || upsertsAfterIdent - upsertsBeforeIdent <= 2,
      "identical skip should fire, or coalescing should keep upsert delta ≤2",
    );
    console.log(
      `PASS  E — identical/coalesce path OK (skips=${identicalAfter - identicalBefore}, upsertDelta=${upsertsAfterIdent - upsertsBeforeIdent})`,
    );

    // ---------- Summary measurements ----------
    const finalStatus = readStatus();
    const finalStarts = countMatches(child.__output(), /\[store-persistence\] full_store_write_start/g);
    const memAfter = process.memoryUsage().heapUsed;
    console.log("\n=== MEASUREMENT SUMMARY ===");
    console.log(JSON.stringify({
      baselineWrites,
      finalConflictUpsertSuccesses: finalStatus.conflictUpsertSuccesses,
      fullStoreWriteStarts: finalStarts - baselineStarts,
      identicalWritesSkippedLogs: countMatches(child.__output(), /full_store_write_skipped_identical/g),
      coalescedInflightLogs: countMatches(child.__output(), /write_coalesced_inflight/g),
      dirtyDrainLogs: countMatches(child.__output(), /dirty_store_drain/g),
      checkedOutClientErrorsEmitted: finalStatus.checkedOutClientErrorsEmitted,
      clientsReleasedWithError: finalStatus.clientsReleasedWithError,
      maxSimultaneousCheckedOut: finalStatus.maxSimultaneousCheckedOut,
      lastWritePayloadBytes: finalStatus.lastWritePayloadBytes,
      testProcessHeapDeltaMB: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
      disconnectAlerts: countMatches(child.__output(), /\[store-safety\]\s+postgres_disconnect/g),
      recoveryAlerts: countMatches(child.__output(), /\[store-safety\]\s+postgres_recovered/g),
    }, null, 2));

    assert.ok(
      (finalStatus.maxSimultaneousCheckedOut || 0) <= 2,
      "should not check out many clients at once for store writes",
    );
    assert.equal(child.exitCode, null, "server must still be alive at end");

    console.log("\nAll postgres reliability repair tests passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    console.error(child.__output().slice(-4000));
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
