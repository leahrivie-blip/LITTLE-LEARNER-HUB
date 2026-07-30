#!/usr/bin/env node
/**
 * Regression: analytics page_view must not rewrite llh_store; debounced writes coalesce.
 *
 * Run: NODE_ENV=test node scripts/test-store-write-debounce.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 18840 + Math.floor(Math.random() * 40);
const statusPath = path.join(os.tmpdir(), `llh-debounce-status-${crypto.randomBytes(4).toString("hex")}.json`);
const storePath = path.join(os.tmpdir(), `llh-debounce-store-${crypto.randomBytes(4).toString("hex")}.json`);

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

function startServer() {
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
        MOCK_PG_QUERY_DELAY_MS: "15",
        STORE_WRITE_DEBOUNCE_MS: "400",
        NODE_ENV: "test",
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
      if (res.status === 200 && res.json?.ok) break;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(child.__output().slice(-1500));
    await new Promise((r) => setTimeout(r, 100));
  }
  // Curriculum seed writes may still be chaining after /api/health returns 200.
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 40; i += 1) {
    const count = readStatus().conflictUpsertSuccesses || 0;
    if (count === last) stable += 1;
    else stable = 0;
    last = count;
    if (stable >= 3) return;
    await new Promise((r) => setTimeout(r, 150));
  }
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
    const beforeWrites = readStatus().conflictUpsertSuccesses || 0;
    const beforeAnalytics = readStatus().analyticsInserts || 0;

    console.log("1) Burst page_view analytics — table inserts only, no full-store upserts");
    for (let i = 0; i < 12; i += 1) {
      const res = await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/lesson-${i}`,
        sessionId: `debounce-session-${i}`,
        visitorId: `debounce-visitor-${i}`,
      });
      assert.equal(res.status, 200, `analytics ${i}: ${res.text}`);
      assert.equal(res.json?.persisted, "analytics_table", res.text);
    }

    await new Promise((r) => setTimeout(r, 100));
    const mid = readStatus();
    assert.ok(mid.analyticsInserts >= beforeAnalytics + 12, "analytics table inserts expected");
    assert.equal(
      mid.conflictUpsertSuccesses || 0,
      beforeWrites,
      `page_view must not trigger llh_store upsert (got ${mid.conflictUpsertSuccesses} vs ${beforeWrites})`,
    );
    console.log("PASS  analytics isolated from full-store writes");

    console.log("2) Login analytics — table row + durable user patch, no blob analytics array");
    const login = await requestJson("POST", "/api/analytics/event", {
      name: "account_login_complete",
      user: "debounce-user@example.com",
      sessionId: "login-session",
    });
    assert.equal(login.status, 200, login.text);
    assert.equal(login.json?.persisted, "store", login.text);
    assert.equal(login.json?.analyticsTable, true, "analytics event should land in llh_analytics_events");
    await new Promise((r) => setTimeout(r, 600));
    const afterLogin = readStatus();
    assert.ok(afterLogin.conflictUpsertSuccesses >= beforeWrites + 1, "login user patch should persist store once");
    assert.ok(afterLogin.analyticsInserts >= beforeAnalytics + 13, "login should also insert analytics table row");
    console.log("PASS  critical analytics persists user fields without blob analytics rewrite");

    console.log("3) Logged-in page_view debounces optional lastSeenAt only");
    const beforeDebounced = readStatus().conflictUpsertSuccesses || 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/debounce-lastseen-${i}`,
        user: "debounce-user@example.com",
        sessionId: `debounce-lastseen-session-${i}`,
      });
      assert.equal(res.status, 200, res.text);
      assert.equal(res.json?.persisted, "analytics_table", res.text);
    }
    await new Promise((r) => setTimeout(r, 700));
    const afterDebounced = readStatus();
    assert.ok(
      afterDebounced.conflictUpsertSuccesses <= beforeDebounced + 1,
      `lastSeenAt debounce should coalesce (got ${afterDebounced.conflictUpsertSuccesses} vs ${beforeDebounced})`,
    );
    console.log("PASS  lastSeenAt debounce coalesces logged-in page views");

    console.log("\nAll store write debounce tests passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    console.error(child.__output().slice(-2500));
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    for (const file of [statusPath, storePath]) {
      try { fs.unlinkSync(file); } catch { /* */ }
    }
  }
}

main();
