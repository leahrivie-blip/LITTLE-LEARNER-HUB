#!/usr/bin/env node
/**
 * User activity touch store — isolated lastSeenAt / featureUsage without llh_store upserts.
 *
 * Run: NODE_ENV=test node scripts/test-user-activity-touch.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19120 + Math.floor(Math.random() * 40);
const statusPath = path.join(os.tmpdir(), `llh-touch-status-${crypto.randomBytes(4).toString("hex")}.json`);
const storePath = path.join(os.tmpdir(), `llh-touch-store-${crypto.randomBytes(4).toString("hex")}.json`);
const controlPath = path.join(os.tmpdir(), `llh-touch-ctrl-${crypto.randomBytes(4).toString("hex")}.json`);

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
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(extraEnv = {}) {
  const child = spawn(
    process.execPath,
    ["-r", path.join(__dirname, "mock-pg-preload.js"), "server/index.js"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        SITE_URL: `http://127.0.0.1:${PORT}`,
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        LLH_STORE_PATH: storePath,
        MOCK_PG_STATUS_PATH: statusPath,
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_QUERY_DELAY_MS: "10",
        STORE_WRITE_DEBOUNCE_MS: "300",
        LAST_SEEN_STORE_PERSIST_MIN_INTERVAL_MS: "0",
        USER_ACTIVITY_TOUCH_PERSIST: "true",
        LLH_SKIP_STARTUP_CURRICULUM_SEED: "true",
        NODE_ENV: "test",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(child.__output().slice(-2000));
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    // Let async boot store/touch writes finish so baselines are stable.
    await new Promise((r) => setTimeout(r, 400));
    const beforeStore = readStatus().conflictUpsertSuccesses || 0;
    const beforeTouch = readStatus().activityTouchUpserts || 0;

    console.log("1) Guest page_view — analytics only");
    for (let i = 0; i < 5; i += 1) {
      const res = await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/guest-${i}`,
        sessionId: `guest-s-${i}`,
        visitorId: `guest-v-${i}`,
      });
      assert.equal(res.status, 200);
      assert.equal(res.json?.persisted, "analytics_table");
    }
    await new Promise((r) => setTimeout(r, 80));
    let st = readStatus();
    assert.equal(st.conflictUpsertSuccesses || 0, beforeStore);
    assert.equal(st.activityTouchUpserts || 0, beforeTouch);

    console.log("2) Logged-in burst — touch upserts, no llh_store upsert");
    const user = "touch-user@llh-test.org";
    for (let i = 0; i < 8; i += 1) {
      const res = await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/touch-${i}`,
        user,
        sessionId: `touch-s-${i}`,
        visitorId: `touch-v-${i}`,
      });
      assert.equal(res.status, 200);
      assert.equal(res.json?.persisted, "analytics_table");
    }
    await new Promise((r) => setTimeout(r, 500));
    st = readStatus();
    assert.equal(st.conflictUpsertSuccesses || 0, beforeStore, "telemetry must not upsert llh_store");
    assert.ok((st.activityTouchUpserts || 0) >= beforeTouch + 1, "activity touch rows should persist");

    console.log("3) Timestamp ordering — older touch must not regress mock row");
    let row = readStatus().activityTouchRows?.[user];
    assert.ok(row, "touch row exists");
    const newer = row.last_seen_at;
    await requestJson("POST", "/api/analytics/event", {
      name: "page_view",
      path: "/older",
      user,
      sessionId: "older-session",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    await new Promise((r) => setTimeout(r, 500));
    const rowAfter = readStatus().activityTouchRows?.[user];
    assert.ok(new Date(rowAfter.last_seen_at).getTime() >= new Date(newer).getTime());

    console.log("4) Feature usage counters accumulate without double-counting");
    assert.equal(Number(rowAfter.feature_usage?.page_view || 0), 9, "8 burst + 1 older-ts event = 9");

    console.log("4b) First logged-in event alone counts exactly 1");
    const soloUser = "solo-count@llh-test.org";
    await requestJson("POST", "/api/analytics/event", {
      name: "page_view",
      path: "/solo",
      user: soloUser,
      sessionId: "solo-session",
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(readStatus().activityTouchRows?.[soloUser]?.feature_usage?.page_view, 1);

    console.log("4c) Two users in the same minute both persist");
    const u1 = "multi-a@llh-test.org";
    const u2 = "multi-b@llh-test.org";
    await requestJson("POST", "/api/analytics/event", {
      name: "page_view", path: "/a", user: u1, sessionId: "ma",
    });
    await requestJson("POST", "/api/analytics/event", {
      name: "page_view", path: "/b", user: u2, sessionId: "mb",
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(readStatus().activityTouchRows?.[u1]?.feature_usage?.page_view, 1);
    assert.equal(readStatus().activityTouchRows?.[u2]?.feature_usage?.page_view, 1);

    console.log("5) Login still uses durable llh_store write");
    const beforeLoginStore = readStatus().conflictUpsertSuccesses || 0;
    const login = await requestJson("POST", "/api/analytics/event", {
      name: "account_login_complete",
      user,
      sessionId: "login-touch",
    });
    assert.equal(login.status, 200);
    assert.equal(login.json?.persisted, "store");
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(readStatus().conflictUpsertSuccesses >= beforeLoginStore + 1);

    console.log("6) Concurrent slow llh_store upsert — touch writes still proceed");
    fs.writeFileSync(controlPath, JSON.stringify({ delayConflictUpsertMs: 900 }));
    const touchBefore = readStatus().activityTouchUpserts || 0;
    const slowLogin = requestJson("POST", "/api/analytics/event", {
      name: "account_login_complete",
      user: "concurrent-touch@llh-test.org",
      sessionId: "concurrent-login",
    });
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 4; i += 1) {
      const res = await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/concurrent-${i}`,
        user: "concurrent-touch@llh-test.org",
        sessionId: `concurrent-pv-${i}`,
      });
      assert.equal(res.status, 200);
    }
    const loginRes = await slowLogin;
    assert.equal(loginRes.status, 200);
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(
      readStatus().activityTouchUpserts > touchBefore,
      "activity touch should persist during slow llh_store upsert",
    );
    fs.writeFileSync(controlPath, JSON.stringify({}));

    console.log("7) Failed touch write retries without duplicate increments");
    const retryUser = "retry-touch@llh-test.org";
    fs.writeFileSync(controlPath, JSON.stringify({ failNextActivityTouchUpserts: 1 }));
    await requestJson("POST", "/api/analytics/event", {
      name: "page_view",
      path: "/retry",
      user: retryUser,
      sessionId: "retry-pv",
    });
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(readStatus().activityTouchRows?.[retryUser]?.feature_usage?.page_view, 1);
    fs.writeFileSync(controlPath, JSON.stringify({}));

    console.log("\nAll user-activity-touch tests passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    console.error(child.__output().slice(-3000));
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    for (const file of [statusPath, storePath, controlPath]) {
      try { fs.unlinkSync(file); } catch { /* */ }
    }
  }
}

main();
