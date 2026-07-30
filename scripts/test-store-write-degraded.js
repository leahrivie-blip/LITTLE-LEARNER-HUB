#!/usr/bin/env node
/**
 * Regression: critical admin/user saves must return 503 (not false 200) when Postgres cannot persist.
 *
 * Run: NODE_ENV=test node scripts/test-store-write-degraded.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 18860 + Math.floor(Math.random() * 30);
const ADMIN = {
  email: "degraded@example.com",
  password: "degraded-pass",
  code: "degraded-code",
};
const controlPath = path.join(os.tmpdir(), `llh-degraded-ctrl-${crypto.randomBytes(4).toString("hex")}.json`);
const statusPath = path.join(os.tmpdir(), `llh-degraded-status-${crypto.randomBytes(4).toString("hex")}.json`);
const storePath = path.join(os.tmpdir(), `llh-degraded-store-${crypto.randomBytes(4).toString("hex")}.json`);

function writeControl(ctrl) {
  fs.writeFileSync(controlPath, JSON.stringify(ctrl, null, 2));
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
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        LLH_STORE_PATH: storePath,
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_STATUS_PATH: statusPath,
        POSTGRES_STORE_WRITE_RETRY_COUNT: "1",
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
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* */ }
    if (child.exitCode !== null) throw new Error(child.__output().slice(-1500));
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(child.__output().slice(-1500));
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function assertPersistFailure(label, res, child) {
  assert.ok(res.status === 503 || res.status >= 500, `${label}: expected failure status, got ${res.status}`);
  assert.match(res.text, /database|save|persist|Could not/i, `${label}: expected persist error message`);
  assert.match(child.__output(), /writeStoreAsync_rejected|failed_write|store_not_persisted|Could not save/i, `${label}: expected server persist log`);
}

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert.equal(login.status, 200);
    const token = login.json.token;

    writeControl({ failAllConflictUpserts: true });

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const siteSave = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...bootstrap.json.siteContent,
        heroTitle: `Degraded test ${Date.now()}`,
        updatedAt: bootstrap.json.siteContent?.updatedAt || "",
      },
    });
    assertPersistFailure("admin site-content save", siteSave, child);
    console.log("PASS  admin site-content save returns 503 when Postgres write fails");

    const membershipSave = await requestJson("POST", "/api/admin/membership-update", {
      adminToken: token,
      email: "member@example.com",
      updates: { subscriptionStatus: "Test hold" },
    });
    assertPersistFailure("admin membership-update", membershipSave, child);
    console.log("PASS  admin membership-update returns 503 when Postgres write fails");

    const announcementSave = await requestJson("POST", "/api/admin/announcements", {
      adminToken: token,
      title: "Degraded announcement",
      body: "Should not persist",
      audience: "all",
    });
    assertPersistFailure("admin announcement create", announcementSave, child);
    console.log("PASS  admin announcement create returns 503 when Postgres write fails");

    const settingsSave = await requestJson("POST", "/api/admin/messaging-settings", {
      adminToken: token,
      emailOnMemberMessage: false,
    });
    assertPersistFailure("admin messaging settings", settingsSave, child);
    console.log("PASS  admin messaging-settings returns 503 when Postgres write fails");

    const emailSettingsSave = await requestJson("POST", "/api/admin/email-engagement/settings", {
      adminToken: token,
      onboardingEnabled: false,
      weeklyWhatsNewEnabled: false,
    });
    assertPersistFailure("admin email-engagement settings", emailSettingsSave, child);
    console.log("PASS  admin email-engagement settings returns 503 when Postgres write fails");

    const readiness = await requestJson("GET", "/api/launch-readiness");
    assert.equal(readiness.json?.required?.database?.ready, false);
    console.log("PASS  launch-readiness reflects database not ready after write failure");

    console.log("\nAll degraded-mode tests passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    console.error(child.__output().slice(-2500));
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    for (const file of [controlPath, statusPath, storePath]) {
      try { fs.unlinkSync(file); } catch { /* */ }
    }
  }
}

main();
