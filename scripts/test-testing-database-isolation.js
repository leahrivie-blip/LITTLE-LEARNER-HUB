#!/usr/bin/env node
/**
 * Confirms the testing service can never connect to the real production
 * database, even by misconfiguration: on a non-production SITE_URL, the
 * server must always use TESTING_DATABASE_URL for its Postgres connection —
 * PRODUCTION_DATABASE_URL must never be read at all in that case, even when
 * it is ALSO set (e.g. by a copy-paste mistake). On a live production
 * SITE_URL, the reverse must hold: PRODUCTION_DATABASE_URL is used and
 * TESTING_DATABASE_URL is never read.
 *
 * Run: node scripts/test-testing-database-isolation.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 24600 + Math.floor(Math.random() * 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-db-isolation-${crypto.randomBytes(4).toString("hex")}.json`);
const CAPTURE_PATH = path.join(os.tmpdir(), `llh-db-isolation-capture-${crypto.randomBytes(4).toString("hex")}.txt`);
const ADMIN = { email: "db-iso-admin@example.invalid", password: "db-iso-pass", code: "db-iso-code" };

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
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

function startServer(envOverrides = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  try { fs.unlinkSync(CAPTURE_PATH); } catch { /* ignore */ }
  return spawn(
    process.execPath,
    ["-r", path.join(__dirname, "mock-pg-preload-capture-url.js"), "server/index.js"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_ACCESS_CODE: ADMIN.code,
        DATABASE_PROVIDER: "postgres",
        LLH_STORE_PATH: STORE_PATH,
        MOCK_PG_CAPTURE_PATH: CAPTURE_PATH,
        NODE_ENV: "test",
        ...envOverrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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

function readCapturedUrl() {
  try {
    return fs.readFileSync(CAPTURE_PATH, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  // ---- 1. Non-production host: TESTING_DATABASE_URL is used, PRODUCTION_DATABASE_URL is ignored ----
  {
    const PROD_URL = "postgres://mock:mock@127.0.0.1:5432/would_be_production_db";
    const TEST_URL = "postgres://mock:mock@127.0.0.1:5432/testing_only_db";
    const child = startServer({
      SITE_URL: `http://127.0.0.1:${PORT}`,
      PRODUCTION_DATABASE_URL: PROD_URL,
      TESTING_DATABASE_URL: TEST_URL,
    });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      assert.equal(adminLogin.status, 200);
      const captured = readCapturedUrl();
      assert.equal(captured, TEST_URL, "on a non-production host, the server must connect using TESTING_DATABASE_URL");
      assert.notEqual(captured, PROD_URL, "on a non-production host, PRODUCTION_DATABASE_URL must never be used, even when it is also set");
      pass("1. Non-production host uses TESTING_DATABASE_URL and never PRODUCTION_DATABASE_URL, even when both are set");
    } finally {
      await stopServer(child);
    }
  }

  // ---- 2. Live production host: PRODUCTION_DATABASE_URL is used, TESTING_DATABASE_URL is ignored ----
  {
    const PROD_URL = "postgres://mock:mock@127.0.0.1:5432/the_real_production_db";
    const TEST_URL = "postgres://mock:mock@127.0.0.1:5432/would_be_testing_db";
    const child = startServer({
      SITE_URL: "https://littlelearnershubbyleah.com",
      PRODUCTION_DATABASE_URL: PROD_URL,
      TESTING_DATABASE_URL: TEST_URL,
    });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      assert.equal(adminLogin.status, 200);
      const captured = readCapturedUrl();
      assert.equal(captured, PROD_URL, "on a live production host, the server must connect using PRODUCTION_DATABASE_URL");
      assert.notEqual(captured, TEST_URL, "on a live production host, TESTING_DATABASE_URL must never be used, even when it is also set");
      pass("2. Live production host uses PRODUCTION_DATABASE_URL and never TESTING_DATABASE_URL, even when both are set");
    } finally {
      await stopServer(child);
    }
  }

  // ---- 3. Non-production host with ONLY TESTING_DATABASE_URL set (the recommended setup) ----
  {
    const TEST_URL = "postgres://mock:mock@127.0.0.1:5432/testing_only_db_2";
    const child = startServer({
      SITE_URL: `http://127.0.0.1:${PORT}`,
      TESTING_DATABASE_URL: TEST_URL,
      // PRODUCTION_DATABASE_URL deliberately left unset.
    });
    try {
      await waitForBoot(child);
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      assert.equal(adminLogin.status, 200);
      const captured = readCapturedUrl();
      assert.equal(captured, TEST_URL, "a testing deployment with only TESTING_DATABASE_URL set (the recommended, safest setup) must still connect to it");
      pass("3. A testing deployment with only TESTING_DATABASE_URL set (no PRODUCTION_DATABASE_URL at all) connects correctly");
    } finally {
      await stopServer(child);
    }
  }

  try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  try { fs.unlinkSync(CAPTURE_PATH); } catch { /* ignore */ }

  console.log(`\nTesting-database isolation checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
