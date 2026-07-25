#!/usr/bin/env node
/**
 * Phase 1 of the admin-token-in-URL security follow-up (see
 * docs/audits/ADMIN_TOKEN_URL_SECURITY_FOLLOWUP.md).
 *
 * Proves the new extractAdminToken() helper is purely additive:
 *   - every existing GET admin endpoint keeps working with the legacy
 *     ?adminToken=... query parameter (nothing removed, nothing broken)
 *   - the SAME endpoints now also accept Authorization: Bearer <token>
 *     with no query parameter at all
 *   - the header takes precedence when both are present
 *   - a request with neither is still rejected (401), same as before
 *
 * Run: node scripts/test-admin-token-header-auth.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19700 + Math.floor(Math.random() * 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-token-header-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "admin-token-header-test@example.com",
  password: "admin-token-header-pass",
  code: "admin-token-header-code",
};

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function requestRaw(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: reqHeaders, timeout: 20000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
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

function startServer() {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Header Auth Test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestRaw("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited early");
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

function assertStaticWiring() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /function extractAdminToken\(request, url\)/);
  assert.match(serverJs, /authHeader\.toLowerCase\(\)\.startsWith\("bearer "\)/);
  // No GET admin endpoint should still read the query param directly — every one of them
  // must go through the header-aware helper so this migration actually covers all of them.
  assert.doesNotMatch(
    serverJs,
    /url\.searchParams\.get\("adminToken"\)/,
    "every GET admin endpoint must use extractAdminToken(), not read the query param directly",
  );
  const occurrences = serverJs.match(/extractAdminToken\(request, url\)/g) || [];
  assert.ok(occurrences.length >= 40, `expected the helper to be used at ~40+ call sites, found ${occurrences.length}`);
}

async function main() {
  await test("static: extractAdminToken() helper exists and every former direct query-param read now goes through it", assertStaticWiring);

  const child = startServer();
  try {
    await waitForBoot(child);

    const login = await requestRaw("POST", "/api/admin/login", { body: ADMIN });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token;

    await test("legacy query-param auth still works on a representative GET admin endpoint (backward compatible)", async () => {
      const res = await requestRaw("GET", `/api/admin/session?adminToken=${encodeURIComponent(token)}`);
      assert.equal(res.status, 200);
      assert.equal(res.json.valid, true);
    });

    await test("the SAME endpoint now also accepts Authorization: Bearer <token> with no query param at all", async () => {
      const res = await requestRaw("GET", "/api/admin/session", { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.valid, true);
    });

    await test("header auth also works on other representative GET admin endpoints (store-health, analytics, curriculum resources)", async () => {
      const endpoints = ["/api/admin/store-health", "/api/admin/analytics", "/api/admin/curriculum/resources"];
      for (const endpoint of endpoints) {
        // eslint-disable-next-line no-await-in-loop
        const res = await requestRaw("GET", endpoint, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200, `${endpoint} failed via header auth: ${res.status} ${res.text?.slice(0, 200)}`);
      }
    });

    await test("a valid header takes precedence over an invalid/garbage query param", async () => {
      const res = await requestRaw("GET", "/api/admin/session?adminToken=totally-bogus-token", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200, "the valid header must win even when the query string carries garbage");
      assert.equal(res.json.valid, true);
    });

    await test("an invalid header is not silently overridden by a valid query param (header takes precedence both ways)", async () => {
      const res = await requestRaw("GET", `/api/admin/session?adminToken=${encodeURIComponent(token)}`, {
        headers: { Authorization: "Bearer totally-bogus-token" },
      });
      assert.equal(res.status, 401, "an explicitly-provided (but wrong) header must not fall back to the query param");
    });

    await test("no token anywhere (neither header nor query param) is still rejected exactly as before", async () => {
      const res = await requestRaw("GET", "/api/admin/session");
      assert.equal(res.status, 401);
      assert.equal(res.json.code, "admin_session_invalid");
    });

    await test("a malformed Authorization header (not 'Bearer ...') falls back to the query param instead of erroring", async () => {
      const res = await requestRaw("GET", `/api/admin/session?adminToken=${encodeURIComponent(token)}`, {
        headers: { Authorization: "NotBearer garbage" },
      });
      assert.equal(res.status, 200, "a header that isn't a Bearer token should be ignored, not crash the request");
    });

    await test("POST admin endpoints (body.adminToken) are unaffected by this GET-focused change", async () => {
      const res = await requestRaw("POST", "/api/admin/logout", { body: { adminToken: token } });
      assert.equal(res.status, 200);
      assert.equal(res.json.revoked, true);
    });
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll admin-token header-auth tests passed.");
  }
}

main().catch((error) => {
  console.error("FAIL (fatal)", error);
  process.exitCode = 1;
});
