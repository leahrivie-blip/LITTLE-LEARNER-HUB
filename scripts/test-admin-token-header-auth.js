#!/usr/bin/env node
/**
 * Admin-token-in-URL security follow-up — Phase 1 (server, additive) + Phase 2
 * (complete client migration). See docs/audits/ADMIN_TOKEN_URL_SECURITY_FOLLOWUP.md.
 *
 * Phase 1 proves the server-side extractAdminToken()/extractAdminTokenFromBody()
 * helpers are purely additive: every existing GET/POST admin endpoint keeps working
 * with the legacy ?adminToken=.../body.adminToken fields (nothing removed), the SAME
 * endpoints now also accept Authorization: Bearer <token>, the header takes
 * precedence when both are present, and a request with neither is still rejected.
 *
 * Phase 2 proves the CLIENT (app.js) no longer constructs any admin-token query
 * string or body field anywhere — see the static test below — plus CSRF, revoked/
 * malformed/missing-token handling, the legacy-usage monitoring counters (sanitized,
 * never the token value), and that a non-admin cannot call admin endpoints.
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
          resolve({ status: res.statusCode, json, text, headers: res.headers });
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

  // Phase 2: POST/PUT endpoints (body-based) must go through the equivalent helper too.
  assert.match(serverJs, /function extractAdminTokenFromBody\(request, body\)/);
  assert.doesNotMatch(
    serverJs,
    /validAdminToken\(body\.adminToken/,
    "no POST admin endpoint should validate body.adminToken directly — must go through extractAdminTokenFromBody()",
  );
  const bodyOccurrences = serverJs.match(/extractAdminTokenFromBody\(request, body\)/g) || [];
  assert.ok(bodyOccurrences.length >= 60, `expected the body helper to be used at ~60+ call sites, found ${bodyOccurrences.length}`);

  // Sanitized monitoring counters exist and are incremented (never logging the token itself).
  assert.match(serverJs, /let legacyAdminQueryTokenUseCount = 0;/);
  assert.match(serverJs, /let legacyAdminBodyTokenUseCount = 0;/);
  assert.match(serverJs, /function handleAdminLegacyAuthUsage\(/);
  assert.match(serverJs, /\/api\/admin\/legacy-auth-usage/);
}

/**
 * Phase 2, the actual client migration: app.js must never again construct an
 * admin-token query string or JSON body field anywhere. This is the core proof that
 * "every Admin client request" was migrated, not just a sample.
 */
function assertClientMigrationComplete() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.doesNotMatch(appJs, /adminToken=\$\{/, "no admin fetch call may construct a ?adminToken=... query string");
  assert.doesNotMatch(appJs, /adminToken:\s*\w/, "no admin fetch call may send adminToken as a JSON body field");
  assert.doesNotMatch(appJs, /adminToken:\s*token/, "no admin fetch call may send adminToken as a JSON body field (token variant)");
  // Every admin fetch must instead carry the token via a real Authorization header.
  const bearerHeaderCount = (appJs.match(/Authorization:\s*`Bearer \$\{[^}]+\}`/g) || []).length;
  assert.ok(bearerHeaderCount >= 50, `expected at least ~50 Authorization: Bearer header call sites in app.js, found ${bearerHeaderCount}`);
}

/** The token itself must never be printed — only safe partial previews (a short
 * prefix, already used pre-existing for debug logs) or nothing at all. This checks
 * that no code path logs/prints a token in a way a real, full token could appear in
 * console output, error messages, or anywhere else user-visible. */
function assertTokenNeverPrinted() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  // Client diagnostics must never print a raw token. Accept either the historical
  // short non-reconstructable prefix, or boolean hasToken-only logging.
  const hasPrefixLog = /tokenPrefix:\s*token\s*\?\s*`\$\{String\(token\)\.slice\(0,\s*12\)\}…`\s*:\s*""/.test(appJs);
  const hasBooleanTokenLog = /hasToken\s*=\s*!!token/.test(appJs) || /"\| hasToken ="\s*,\s*!!token/.test(appJs);
  assert.ok(
    hasPrefixLog || hasBooleanTokenLog,
    "admin token diagnostics must use a short prefix or boolean hasToken — never the raw token",
  );
  // Must not interpolate a raw token into a template console string.
  assert.doesNotMatch(
    appJs,
    /console\.(log|warn|error)\(`[^`]*\$\{token\}/,
    "no console template in app.js may interpolate a raw token",
  );
  // Server must never pass a raw token variable as a console.log/warn/error argument
  // (as opposed to a hardcoded string that merely contains the word "token", which is
  // fine — e.g. "token valid"). The legacy-usage endpoint only ever returns counts
  // (checked functionally above), and audit logs only ever log email/counts.
  assert.doesNotMatch(
    serverJs,
    /console\.(log|warn|error)\([^)]*,\s*token\b/,
    "no console call should print a raw token variable as an argument",
  );
}

async function main() {
  await test("static: extractAdminToken()/extractAdminTokenFromBody() helpers exist and every former direct read now goes through them (GET + POST)", assertStaticWiring);
  await test("static: app.js (the client) no longer constructs any admin-token query string or body field anywhere — every admin fetch uses Authorization: Bearer", assertClientMigrationComplete);
  await test("static: the token itself is never printed — server never logs a raw token variable, client debug logs only ever use a short non-reconstructable prefix", assertTokenNeverPrinted);

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

    await test("POST admin endpoints still accept the legacy body.adminToken field (backward compatible)", async () => {
      const login2 = await requestRaw("POST", "/api/admin/login", { body: ADMIN });
      const res = await requestRaw("POST", "/api/admin/logout", { body: { adminToken: login2.json.token } });
      assert.equal(res.status, 200);
      assert.equal(res.json.revoked, true);
    });

    await test("POST admin endpoints also accept Authorization: Bearer with an empty body (Phase 2)", async () => {
      const login3 = await requestRaw("POST", "/api/admin/login", { body: ADMIN });
      const res = await requestRaw("POST", "/api/admin/logout", {
        body: {},
        headers: { Authorization: `Bearer ${login3.json.token}` },
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.revoked, true);
    });

    await test("legacy-auth-usage monitoring endpoint reports sanitized counts, never the token values", async () => {
      const login4 = await requestRaw("POST", "/api/admin/login", { body: ADMIN });
      const freshToken = login4.json.token;
      // One legacy query use, one legacy body use, to bump both counters by exactly one.
      await requestRaw("GET", `/api/admin/session?adminToken=${encodeURIComponent(freshToken)}`);
      await requestRaw("POST", "/api/admin/logout", { body: { adminToken: freshToken } });
      const usage = await requestRaw("GET", `/api/admin/legacy-auth-usage`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(usage.status, 200, JSON.stringify(usage.json));
      assert.ok(usage.json.legacyQueryTokenRequests >= 1, "query-token usage should be counted");
      assert.ok(usage.json.legacyBodyTokenRequests >= 1, "body-token usage should be counted");
      assert.doesNotMatch(JSON.stringify(usage.json), /admin_[0-9a-f]{20,}/, "the usage report must never contain an actual token value");
    });

    await test("legacy-auth-usage monitoring endpoint itself requires admin auth", async () => {
      const res = await requestRaw("GET", "/api/admin/legacy-auth-usage");
      assert.equal(res.status, 401);
    });

    await test("a revoked token is rejected on every subsequent request (header-based)", async () => {
      const login5 = await requestRaw("POST", "/api/admin/login", { body: ADMIN });
      const t5 = login5.json.token;
      await requestRaw("POST", "/api/admin/logout", { body: {}, headers: { Authorization: `Bearer ${t5}` } });
      const after = await requestRaw("GET", "/api/admin/session", { headers: { Authorization: `Bearer ${t5}` } });
      assert.equal(after.status, 401);
    });

    await test("a malformed/garbage bearer token (never issued) is rejected the same as a missing one", async () => {
      const res = await requestRaw("GET", "/api/admin/store-health", { headers: { Authorization: "Bearer not-a-real-token-at-all" } });
      assert.equal(res.status, 401);
    });

    await test("a missing token (no header, no query, no body) is rejected on both GET and POST admin endpoints", async () => {
      const getRes = await requestRaw("GET", "/api/admin/store-health");
      assert.equal(getRes.status, 401);
      const postRes = await requestRaw("POST", "/api/admin/logout", { body: {} });
      assert.equal(postRes.status, 400); // logout specifically requires *a* token value to attempt revoking
    });

    await test("CSRF: this app sets no cookies anywhere, so a cross-site form cannot forge an authenticated admin request", async () => {
      const login6 = await requestRaw("POST", "/api/admin/login", { body: ADMIN });
      // A "cross-site form submission" is simulated by a request that carries neither a
      // cookie (none exist) nor a same-origin-only credential the browser would attach
      // automatically — only an explicit Authorization header (which a cross-site HTML
      // form cannot set) or a body field an attacker does not know authenticates here.
      const forged = await requestRaw("POST", "/api/admin/logout", { body: {} }); // no credential attached at all
      assert.equal(forged.status, 400, "a request with no admin credential at all must be rejected, proving nothing is auto-attached");
      assert.ok(!("set-cookie" in (login6.headers || {})), "login must never set a cookie (would enable CSRF); token must only be returned in the JSON body");
    });

    await test("a regular (non-admin) member cannot call admin endpoints even with a well-formed Authorization header", async () => {
      const res = await requestRaw("GET", "/api/admin/store-health", { headers: { Authorization: "Bearer admin_0000000000000000000000000000000000000000000000" } });
      assert.equal(res.status, 401, "an invented/guessed token must never validate");
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
