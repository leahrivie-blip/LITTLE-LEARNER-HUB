#!/usr/bin/env node
/**
 * Proves updated_at CAS recovery retries exactly once, then fails cleanly
 * without a recursive write storm.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 18850 + Math.floor(Math.random() * 30);
const ADMIN = {
  email: "cas-retry@example.com",
  password: "cas-retry-pass",
  code: "cas-retry-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "llh-cas-retry-"));
  const controlPath = path.join(tmp, "control.json");
  const statusPath = path.join(tmp, "status.json");
  fs.writeFileSync(controlPath, "{}");

  const child = spawn(
    process.execPath,
    ["-r", path.join(ROOT, "scripts/mock-pg-preload.js"), "server/index.js"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        SITE_URL: `http://127.0.0.1:${PORT}`,
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_ACCESS_CODE: ADMIN.code,
        ADMIN_NAME: "CAS Retry",
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        NODE_ENV: "test",
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_STATUS_PATH: statusPath,
        MOCK_PG_QUERY_DELAY_MS: "10",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });

  try {
    for (let i = 0; i < 150; i += 1) {
      try {
        const health = await requestJson("GET", "/api/health");
        if (health.status === 200 && health.json?.ok) break;
      } catch { /* retry */ }
      if (child.exitCode !== null) throw new Error(`Server exited early: ${output.slice(-800)}`);
      await new Promise((r) => setTimeout(r, 100));
      if (i === 149) throw new Error(`Server did not boot: ${output.slice(-800)}`);
    }

    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200, "login failed");
    const token = login.json.token;
    const bootstrap = await requestJson(
      "GET",
      `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`,
    );
    assert(bootstrap.status === 200, "bootstrap failed");
    const stamp = bootstrap.json.siteContent?.updatedAt || "";

    // Arm perpetual updated_at bumps so first write conflicts and the single retry also conflicts.
    fs.writeFileSync(controlPath, JSON.stringify({ bumpRowUpdatedAtEverySelect: true }, null, 2));

    const writesBefore = (() => {
      try { return JSON.parse(fs.readFileSync(statusPath, "utf8")).conflictUpsertAttempts || 0; }
      catch { return 0; }
    })();

    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: "cur-lp-cas-retry-limit",
        title: "CAS Retry Limit",
        age: "Preschool",
        theme: "Test",
        plan: "Free",
        status: "draft",
        learningDomains: ["Cognitive"],
        weeklyOverview: "retry-limit",
        objectives: "Persist once",
        weeklyMaterials: "none",
        vocabularyWords: "test",
        observationOpportunities: "watch",
        adaptations: "n/a",
        familyConnection: "none",
        books: [],
        songs: [],
        dailyPlans: {
          monday: { items: [{ itemId: "a1", title: "One", activityCategory: "Cognitive" }] },
          tuesday: { items: [{ itemId: "a2", title: "Two", activityCategory: "Art" }] },
          wednesday: { items: [{ itemId: "a3", title: "Three", activityCategory: "Music" }] },
          thursday: { items: [{ itemId: "a4", title: "Four", activityCategory: "Gross Motor" }] },
          friday: { items: [{ itemId: "a5", title: "Five", activityCategory: "Literacy" }] },
        },
        resourceIds: [],
        activityIds: [],
      },
    });
    // Endpoint may return 500/503 after retry exhaustion; either is a clean failure.
    assert(save.status >= 400, `expected failure after retry exhaustion, got ${save.status}`);
    await new Promise((r) => setTimeout(r, 400));

    assert(output.includes("store_updated_at_conflict"), "first CAS conflict missing");
    assert(output.includes("store_updated_at_conflict_recovered"), "recovery missing");
    assert(output.includes("store_updated_at_conflict_retry_exhausted"), "retry exhaustion missing");

    const conflictLogs = output.split("store_updated_at_conflict").length - 1;
    // One initial conflict log + recovered + exhausted (+ maybe nested). Bound the storm.
    assert(conflictLogs <= 6, `too many conflict log events (${conflictLogs}) — possible loop`);

    const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    const attempts = Number(status.conflictUpsertAttempts || 0) - writesBefore;
    // At most one successful conflict-upsert path attempt after recovery should be tried;
    // with perpetual bumps, FOR UPDATE conflicts before upsert, so upsert attempts stay low.
    assert(attempts <= 2, `write storm detected: conflictUpsertAttempts delta=${attempts}`);
    assert(
      !output.includes("full_store_write_success_after_updated_at_conflict"),
      "retry must not report success when second conflict occurs",
    );

    // Health should remain available (retry exhaustion is not a disconnect).
    const health = await requestJson("GET", "/api/health");
    assert(health.status === 200 && health.json?.ok === true, "health degraded after retry exhaustion");

    console.log("Store updated_at CAS retry-limit checks passed.");
  } catch (error) {
    console.error("FAIL:", String(error.message || error).slice(0, 500));
    console.error(output.slice(-2000));
    process.exitCode = 1;
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
