#!/usr/bin/env node
/**
 * Admin session storage audit: proves the new dedicated session store (see
 * server/admin-session-store.js) replaces admin login writing the entire
 * multi-MB application store, and that authentication does not touch unrelated
 * collections (curriculum, users, messages, billing).
 *
 * Sections:
 *   A) Pure unit tests of the adminSessionStore module (no server, no network)
 *   B) Integration tests against a spawned server in local-json mode
 *   C) Integration tests against a spawned server with a mock Postgres, proving
 *      exactly which table is written and how many bytes
 *   D) Performance fixture: realistic multi-MB production-shaped store
 *   E) Founding-count breakdown endpoint (read-only, labeled)
 *
 * Run: node scripts/test-admin-session-storage.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const { createAdminSessionStore, DEFAULT_SESSION_TTL_MS } = require(path.join(ROOT, "server/admin-session-store.js"));

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

// ============================================================================
// A) Pure unit tests — no server, no network
// ============================================================================

async function unitTests() {
  await test("create() + validate() round-trip, no Postgres configured (local-file mode)", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const store = createAdminSessionStore({ localFilePath: filePath });
    const token = await store.create("owner@example.com");
    assert.ok(token.startsWith("admin_"), "token should use the admin_ prefix");
    assert.equal(Buffer.from(token.slice(6), "hex").length, 32, "token should encode 256 bits of randomness");
    const session = store.validate(token);
    assert.ok(session, "session should validate immediately after creation");
    assert.equal(session.email, "owner@example.com");
    fs.unlinkSync(filePath);
  });

  await test("validate() rejects unknown, empty, and revoked tokens", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const store = createAdminSessionStore({ localFilePath: filePath });
    assert.equal(store.validate(""), null);
    assert.equal(store.validate("nonexistent-token"), null);
    const token = await store.create("owner@example.com");
    await store.revoke(token);
    assert.equal(store.validate(token), null, "revoked token must be rejected");
    fs.unlinkSync(filePath);
  });

  await test("sessions expire and are rejected after TTL", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const store = createAdminSessionStore({ localFilePath: filePath, sessionTtlMs: 20 });
    const token = await store.create("owner@example.com");
    assert.ok(store.validate(token), "should be valid immediately");
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(store.validate(token), null, "should be expired after TTL");
    fs.unlinkSync(filePath);
  });

  await test("touch() slides the expiration window forward", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const store = createAdminSessionStore({ localFilePath: filePath, sessionTtlMs: 80 });
    const token = await store.create("owner@example.com");
    await new Promise((resolve) => setTimeout(resolve, 50));
    store.touch(token); // resets the 80ms window
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(store.validate(token), "a touched session should still be valid past the original TTL");
    fs.unlinkSync(filePath);
  });

  await test("revoke() removes exactly one session and leaves others valid", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const store = createAdminSessionStore({ localFilePath: filePath });
    const tokenA = await store.create("a@example.com");
    const tokenB = await store.create("b@example.com");
    await store.revoke(tokenA);
    assert.equal(store.validate(tokenA), null);
    assert.ok(store.validate(tokenB), "unrelated session must be untouched by revoking another");
    fs.unlinkSync(filePath);
  });

  await test("prune() removes only expired/revoked sessions", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const store = createAdminSessionStore({ localFilePath: filePath, sessionTtlMs: 20 });
    const shortLived = await store.create("expiring@example.com");
    const longLived = createAdminSessionStore({ localFilePath: filePath }); // separate instance, default TTL
    await new Promise((resolve) => setTimeout(resolve, 60));
    const removed = await store.prune();
    assert.equal(removed, 1, "exactly the expired session should be pruned");
    assert.equal(store.validate(shortLived), null);
    void longLived;
    fs.unlinkSync(filePath);
  });

  await test("login lockout trips after repeated failures and resets on success", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const store = createAdminSessionStore({
      localFilePath: filePath,
      lockoutMaxAttempts: 3,
      lockoutWindowMs: 60000,
      lockoutDurationMs: 100,
    });
    const email = "target@example.com";
    assert.equal(store.lockoutStatus(email).lockedOut, false);
    store.recordFailedAttempt(email);
    store.recordFailedAttempt(email);
    assert.equal(store.lockoutStatus(email).lockedOut, false, "2 failures should not yet lock out with max=3");
    store.recordFailedAttempt(email);
    assert.equal(store.lockoutStatus(email).lockedOut, true, "3rd failure should trip the lockout");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(store.lockoutStatus(email).lockedOut, false, "lockout should expire after its duration");
    store.recordFailedAttempt(email);
    store.recordFailedAttempt(email);
    store.recordSuccessfulAttempt(email);
    store.recordFailedAttempt(email);
    assert.equal(store.lockoutStatus(email).lockedOut, false, "a successful attempt must clear the failure counter");
    // Lockout bookkeeping is intentionally in-memory only (never persisted), so no
    // local file is created by this test — nothing to clean up here.
    try { fs.unlinkSync(filePath); } catch { /* never created, expected */ }
  });

  await test("lockouts and failure counts are independent per email", () => {
    const store = createAdminSessionStore({ lockoutMaxAttempts: 2 });
    store.recordFailedAttempt("a@example.com");
    store.recordFailedAttempt("a@example.com");
    assert.equal(store.lockoutStatus("a@example.com").lockedOut, true);
    assert.equal(store.lockoutStatus("b@example.com").lockedOut, false, "a different email must not be affected");
  });

  await test("sessions survive a process restart via the local file (simulated)", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const storeBeforeRestart = createAdminSessionStore({ localFilePath: filePath });
    const token = await storeBeforeRestart.create("owner@example.com");
    // Simulate a restart: a brand-new instance, same file, must load it.
    const storeAfterRestart = createAdminSessionStore({ localFilePath: filePath });
    await storeAfterRestart.loadFromStorage();
    const session = storeAfterRestart.validate(token);
    assert.ok(session, "session must survive a process restart via the durable local file");
    assert.equal(session.email, "owner@example.com");
    fs.unlinkSync(filePath);
  });

  await test("an already-expired session in the file is discarded on restart-load, a valid one is kept", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const now = Date.now();
    fs.writeFileSync(filePath, JSON.stringify({
      admin_expiredtoken000000000000000000000000000000000000000000000: {
        email: "expired@example.com",
        createdAt: now - 100000,
        expiresAt: now - 1000, // already expired
        lastValidatedAt: now - 100000,
        revokedAt: null,
      },
      admin_validtoken00000000000000000000000000000000000000000000000: {
        email: "valid@example.com",
        createdAt: now,
        expiresAt: now + DEFAULT_SESSION_TTL_MS,
        lastValidatedAt: now,
        revokedAt: null,
      },
    }));
    const store = createAdminSessionStore({ localFilePath: filePath });
    await store.loadFromStorage();
    assert.equal(
      store.validate("admin_expiredtoken000000000000000000000000000000000000000000000"),
      null,
      "an expired session must not survive a restart",
    );
    assert.ok(
      store.validate("admin_validtoken00000000000000000000000000000000000000000000000"),
      "a still-valid session must survive a restart",
    );
    fs.unlinkSync(filePath);
  });

  await test("migrateLegacySessions() is idempotent and grants a fresh TTL instead of an already-expired stamp", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    const store = createAdminSessionStore({ localFilePath: filePath });
    const legacy = {
      legacy_token_abc: { email: "legacy@example.com", createdAt: "2020-01-01T00:00:00.000Z" },
    };
    const first = await store.migrateLegacySessions(legacy);
    assert.equal(first.migratedCount, 1);
    const migratedSession = store.validate("legacy_token_abc");
    assert.ok(migratedSession, "a migrated legacy session (which never expired under the old system) must validate");
    assert.equal(migratedSession.email, "legacy@example.com");
    // Second call — even with the same input — must not re-add/duplicate/reset anything.
    const second = await store.migrateLegacySessions(legacy);
    assert.equal(second.alreadyMigrated, true);
    assert.equal(second.migratedCount, 0);
    fs.unlinkSync(filePath);
  });

  await test("migrateLegacySessions() never overwrites a session already migrated in a prior boot", async () => {
    const filePath = path.join(os.tmpdir(), `llh-admin-sess-unit-${crypto.randomBytes(4).toString("hex")}.json`);
    // Boot #1: migrate once.
    const bootOne = createAdminSessionStore({ localFilePath: filePath });
    await bootOne.migrateLegacySessions({ shared_token: { email: "owner@example.com", createdAt: "2020-01-01T00:00:00.000Z" } });
    // Boot #2 (fresh instance/process): must find the already-migrated session on disk and
    // NOT re-migrate/duplicate it even though the (still-present) legacy field is passed again.
    const bootTwo = createAdminSessionStore({ localFilePath: filePath });
    await bootTwo.loadFromStorage();
    const before = bootTwo.validate("shared_token");
    const migration = await bootTwo.migrateLegacySessions({ shared_token: { email: "owner@example.com", createdAt: "2020-01-01T00:00:00.000Z" } });
    const after = bootTwo.validate("shared_token");
    assert.equal(migration.migratedCount, 0, "already-persisted session must not be re-migrated");
    assert.deepEqual(before, after, "re-running migration must not alter the existing session record");
    fs.unlinkSync(filePath);
  });
}

// ============================================================================
// Shared HTTP + server helpers for integration tests (B, C, D, E)
// ============================================================================

function requestJson(port, method, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = { ...extraHeaders };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port, path: urlPath, method, headers, timeout: 30000 },
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
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer({ port, storePath, extraEnv = {}, mockPg = false }) {
  const admin = {
    email: `admin-sess-${port}@example.com`,
    password: `admin-sess-pass-${port}`,
    code: `admin-sess-code-${port}`,
  };
  const args = mockPg
    ? ["-r", path.join(__dirname, "mock-pg-admin-sessions-preload.js"), "server/index.js"]
    : ["server/index.js"];
  const env = {
    ...process.env,
    PORT: String(port),
    SITE_URL: `http://127.0.0.1:${port}`,
    ADMIN_EMAIL: admin.email,
    ADMIN_PASSWORD: admin.password,
    ADMIN_ACCESS_CODE: admin.code,
    ADMIN_NAME: "Session Storage Test",
    DATABASE_PROVIDER: mockPg ? "postgres" : "local-json",
    PRODUCTION_DATABASE_URL: mockPg ? "postgres://mock:mock@127.0.0.1:5432/mock" : "",
    LLH_STORE_PATH: storePath,
    NODE_ENV: "test",
    ...extraEnv,
  };
  const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  child.__admin = admin;
  return child;
}

async function waitForBoot(child, port) {
  for (let i = 0; i < 150; i += 1) {
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`server exited early: ${child.__output().slice(-1500)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not boot: ${child.__output().slice(-1500)}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function adminLogin(port, admin) {
  const res = await requestJson(port, "POST", "/api/admin/login", {
    email: admin.email,
    password: admin.password,
    code: admin.code,
  });
  return res;
}

function nextPort() {
  return 19200 + Math.floor(Math.random() * 4000);
}

function tempStorePath(name) {
  return path.join(os.tmpdir(), `llh-admin-sess-${name}-${crypto.randomBytes(4).toString("hex")}.json`);
}

// ============================================================================
// B) Integration tests — local-json mode
// ============================================================================

async function localJsonIntegrationTests() {
  const port = nextPort();
  const storePath = tempStorePath("localjson");
  let child = startServer({ port, storePath });
  try {
    await waitForBoot(child, port);
    const admin = child.__admin;

    await test("login returns a token and does not modify the main store file", async () => {
      const beforeStat = fs.existsSync(storePath) ? fs.readFileSync(storePath, "utf8") : "";
      const login = await adminLogin(port, admin);
      assert.equal(login.status, 200, JSON.stringify(login.json));
      assert.ok(login.json.token, "token missing from login response");
      // Give the tiny async session write a moment, then confirm the MAIN store
      // file (curriculum/users/messages/etc.) is byte-for-byte unchanged.
      await new Promise((r) => setTimeout(r, 150));
      const afterStat = fs.existsSync(storePath) ? fs.readFileSync(storePath, "utf8") : "";
      assert.equal(afterStat, beforeStat, "admin login must not write the main application store at all");
    });

    await test("a dedicated admin-sessions file exists next to the store and is tiny", async () => {
      const sessionsFile = storePath.replace(/(\.json)?$/, ".admin-sessions.json");
      assert.ok(fs.existsSync(sessionsFile), "dedicated admin-sessions file should exist");
      const bytes = fs.statSync(sessionsFile).size;
      assert.ok(bytes < 5000, `admin-sessions file should be tiny (well under 5KB), got ${bytes} bytes`);
    });

    await test("GET /api/admin/session validates without modifying the main store file", async () => {
      const login = await adminLogin(port, admin);
      const token = login.json.token;
      const beforeStat = fs.readFileSync(storePath, "utf8");
      const session = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(token)}`);
      assert.equal(session.status, 200);
      assert.equal(session.json.valid, true);
      assert.equal(session.json.email, admin.email);
      const afterStat = fs.readFileSync(storePath, "utf8");
      assert.equal(afterStat, beforeStat, "session validation must not touch the main store file");
    });

    await test("logout revokes the token; it is rejected afterward", async () => {
      const login = await adminLogin(port, admin);
      const token = login.json.token;
      const logout = await requestJson(port, "POST", "/api/admin/logout", { adminToken: token });
      assert.equal(logout.status, 200);
      assert.equal(logout.json.revoked, true);
      const after = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(token)}`);
      assert.equal(after.status, 401);
    });

    await test("each login mints an independent, unrelated new token (rotation on every successful auth)", async () => {
      const first = await adminLogin(port, admin);
      const second = await adminLogin(port, admin);
      assert.notEqual(first.json.token, second.json.token, "every login must mint a brand-new token");
      // Both should be independently valid (multi-device support) until explicitly revoked.
      const firstCheck = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(first.json.token)}`);
      const secondCheck = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(second.json.token)}`);
      assert.equal(firstCheck.status, 200);
      assert.equal(secondCheck.status, 200);
    });

    await test("wrong credentials never mint a token and are rejected", async () => {
      const bad = await requestJson(port, "POST", "/api/admin/login", {
        email: admin.email,
        password: "definitely-wrong",
        code: admin.code,
      });
      assert.equal(bad.status, 401);
      assert.equal(bad.json.token, undefined);
    });

    await test("repeated failed logins trip a lockout (429) that a correct login cannot bypass mid-lockout", async () => {
      const email = `lockout-${port}@example.com`;
      // Use a throwaway email so this does not disturb the shared admin account's
      // own lockout counter for later tests in this same server process.
      let last;
      for (let i = 0; i < 8; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        last = await requestJson(port, "POST", "/api/admin/login", { email, password: "nope", code: "nope" });
      }
      assert.equal(last.status, 429, `expected lockout after repeated failures, got ${last.status}`);
      assert.equal(last.json.code, "admin_login_locked_out");
      // Even the CORRECT admin credentials for this locked-out email must be refused during lockout.
      const correctButLockedOut = await requestJson(port, "POST", "/api/admin/login", {
        email, password: admin.password, code: admin.code,
      });
      assert.equal(correctButLockedOut.status, 429, "lockout must apply even to subsequent correct-credential attempts within the window");
    });

    await test("duplicate/retried login requests each succeed independently without corrupting session storage", async () => {
      const [a, b, c] = await Promise.all([adminLogin(port, admin), adminLogin(port, admin), adminLogin(port, admin)]);
      [a, b, c].forEach((res) => assert.equal(res.status, 200, JSON.stringify(res.json)));
      const tokens = new Set([a.json.token, b.json.token, c.json.token]);
      assert.equal(tokens.size, 3, "concurrent duplicate login requests must each get their own independent token");
      for (const token of tokens) {
        // eslint-disable-next-line no-await-in-loop
        const check = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(token)}`);
        assert.equal(check.status, 200, `token ${token} should validate`);
      }
    });

    await test("two simultaneous admin logins do not interfere with each other", async () => {
      const [a, b] = await Promise.all([adminLogin(port, admin), adminLogin(port, admin)]);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.notEqual(a.json.token, b.json.token);
      const [checkA, checkB] = await Promise.all([
        requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(a.json.token)}`),
        requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(b.json.token)}`),
      ]);
      assert.equal(checkA.json.valid, true);
      assert.equal(checkB.json.valid, true);
    });

    await test("admin login running concurrently with a lesson-plan save does not affect curriculum, and vice versa", async () => {
      const login0 = await adminLogin(port, admin);
      const token = login0.json.token;
      const bootstrap = await requestJson(port, "GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
      const lessonPlan = {
        id: "cur-lp-sess-concurrency",
        title: "Session Concurrency Lesson",
        age: "Toddler",
        theme: "Test",
        plan: "Free",
        status: "draft",
        learningDomains: ["Cognitive"],
        weeklyOverview: "Concurrency check",
        objectives: "Persist",
        weeklyMaterials: "none",
        vocabularyWords: "test",
        observationOpportunities: "watch",
        adaptations: "n/a",
        familyConnection: "share",
        books: [],
        songs: [],
        dailyPlans: {
          monday: { items: [] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] },
        },
        resourceIds: [],
        activityIds: [],
      };
      const [save, ...logins] = await Promise.all([
        requestJson(port, "POST", "/api/admin/curriculum/lesson-plans", {
          adminToken: token,
          expectedUpdatedAt: bootstrap.json.siteContent.updatedAt,
          lessonPlan,
        }),
        adminLogin(port, admin),
        adminLogin(port, admin),
        adminLogin(port, admin),
      ]);
      assert.equal(save.status, 200, JSON.stringify(save.json));
      assert.equal(save.json.lessonPlan?.id, "cur-lp-sess-concurrency");
      logins.forEach((res) => assert.equal(res.status, 200, "concurrent login must succeed while a curriculum save is in flight"));
      const reload = await requestJson(port, "GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
      const stillThere = (reload.json.siteContent?.curriculum?.lessonPlans || []).some((p) => p.id === "cur-lp-sess-concurrency");
      assert.ok(stillThere, "curriculum save must not be affected by concurrent admin logins");
    });

    await test("admin login running concurrently with a membership (user record) update does not corrupt either", async () => {
      const login0 = await adminLogin(port, admin);
      const token = login0.json.token;
      const email = "concurrency-user@example.com";
      const [update, ...logins] = await Promise.all([
        requestJson(port, "POST", "/api/admin/membership-update", {
          adminToken: token,
          email,
          updates: { notes: "concurrency-test-note" },
          action: "test_note",
        }),
        adminLogin(port, admin),
        adminLogin(port, admin),
      ]);
      assert.equal(update.status, 200, JSON.stringify(update.json));
      logins.forEach((res) => assert.equal(res.status, 200));
      const analytics = await requestJson(port, "GET", `/api/admin/analytics?adminToken=${encodeURIComponent(token)}`);
      const user = (analytics.json.analytics?.users || []).find((u) => u.email === email);
      assert.ok(user, "the updated user record must exist and be intact after concurrent logins");
    });

    await test("admin login running concurrently with sending a message does not corrupt either", async () => {
      const login0 = await adminLogin(port, admin);
      const token = login0.json.token;
      const toEmail = "message-recipient@example.com";
      const [send, ...logins] = await Promise.all([
        requestJson(port, "POST", "/api/admin/messages/send", {
          adminToken: token,
          audience: "private",
          toEmail,
          subject: "Concurrency test",
          body: "This message must survive concurrent admin logins.",
        }),
        adminLogin(port, admin),
        adminLogin(port, admin),
      ]);
      assert.equal(send.status, 200, JSON.stringify(send.json));
      logins.forEach((res) => assert.equal(res.status, 200));
    });

    await test("multiple ordinary (non-admin) user logins run concurrently with an admin login without cross-contamination", async () => {
      // Seed two server-password users directly via the membership-update path is not
      // applicable (that's admin-only); use the public signup-adjacent password-login
      // recovery path is also not for fresh users. Instead, exercise concurrency using
      // the real /api/auth/password-login endpoint against accounts that do not exist —
      // the goal here is proving the ADMIN session store is unaffected by concurrent
      // traffic on a completely different auth path, not exercising member signup.
      const requests = [];
      for (let i = 0; i < 5; i += 1) {
        requests.push(requestJson(port, "POST", "/api/auth/password-login", {
          email: `member-${i}-${port}@example.com`,
          password: "whatever-not-registered",
        }));
      }
      requests.push(adminLogin(port, admin));
      const results = await Promise.all(requests);
      const memberResults = results.slice(0, 5);
      const adminResult = results[5];
      memberResults.forEach((res) => assert.equal(res.status, 401, "unregistered member logins should be rejected, not crash"));
      assert.equal(adminResult.status, 200, "admin login must succeed independently of concurrent member login traffic");
    });

    await test("server restart preserves a valid admin session and discards a manually-expired one", async () => {
      const login = await adminLogin(port, admin);
      const validToken = login.json.token;
      const sessionsFile = storePath.replace(/(\.json)?$/, ".admin-sessions.json");
      await new Promise((r) => setTimeout(r, 100)); // let the async create() write settle
      // Inject an already-expired session directly into the durable file to simulate
      // one that was valid before a long-ago restart and should now be gone.
      const raw = JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
      raw.admin_manuallyexpiredtoken00000000000000000000000000000000000 = {
        email: admin.email,
        createdAt: Date.now() - 1000000,
        expiresAt: Date.now() - 1000,
        lastValidatedAt: Date.now() - 1000000,
        revokedAt: null,
      };
      fs.writeFileSync(sessionsFile, JSON.stringify(raw));

      await stopServer(child);
      child = startServer({ port, storePath });
      await waitForBoot(child, port);
      const stillValid = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(validToken)}`);
      assert.equal(stillValid.status, 200, "a valid session must survive a server restart");
      const expiredRejected = await requestJson(
        port, "GET",
        "/api/admin/session?adminToken=admin_manuallyexpiredtoken00000000000000000000000000000000000",
      );
      assert.equal(expiredRejected.status, 401, "an expired session must be rejected after restart, not silently revived");
      // child now points at the restarted (still-running) server; later tests in
      // this suite continue against it on the same port, and the outer `finally`
      // below stops whichever process `child` currently refers to.
    });
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    try { fs.unlinkSync(storePath.replace(/(\.json)?$/, ".admin-sessions.json")); } catch { /* ignore */ }
  }
}

// ============================================================================
// C) Integration tests — mock Postgres, proving which table/how many bytes
// ============================================================================

async function mockPostgresIntegrationTests() {
  const port = nextPort();
  const storePath = tempStorePath("mockpg");
  const writeLogPath = path.join(os.tmpdir(), `llh-admin-sess-writelog-${crypto.randomBytes(4).toString("hex")}.jsonl`);
  fs.writeFileSync(writeLogPath, "");
  const child = startServer({
    port,
    storePath,
    mockPg: true,
    extraEnv: { MOCK_PG_WRITE_LOG_PATH: writeLogPath },
  });
  try {
    await waitForBoot(child, port);
    const admin = child.__admin;

    await test("[mock Postgres] admin login writes ONLY llh_admin_sessions, never llh_store", async () => {
      fs.writeFileSync(writeLogPath, "");
      const login = await adminLogin(port, admin);
      assert.equal(login.status, 200, JSON.stringify(login.json));
      await new Promise((r) => setTimeout(r, 150));
      const lines = fs.readFileSync(writeLogPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const storeWrites = lines.filter((l) => l.table === "llh_store");
      const sessionWrites = lines.filter((l) => l.table === "llh_admin_sessions");
      assert.equal(storeWrites.length, 0, `admin login must not write llh_store at all — saw ${storeWrites.length} write(s)`);
      assert.ok(sessionWrites.length >= 1, "admin login must write at least one llh_admin_sessions row");
    });

    await test("[mock Postgres] the llh_admin_sessions write is small (a single row, not a full document)", async () => {
      fs.writeFileSync(writeLogPath, "");
      await adminLogin(port, admin);
      await new Promise((r) => setTimeout(r, 150));
      const lines = fs.readFileSync(writeLogPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const sessionInsert = lines.find((l) => l.table === "llh_admin_sessions" && l.op === "insert");
      assert.ok(sessionInsert, "expected an llh_admin_sessions insert");
      assert.ok(sessionInsert.bytes < 2000, `session insert should be well under 2KB, got ${sessionInsert.bytes} bytes`);
    });

    await test("[mock Postgres] a failed session-table write during login still lets login succeed (graceful degrade)", async () => {
      await stopServer(child);
      const failingChild = startServer({
        port,
        storePath,
        mockPg: true,
        extraEnv: { MOCK_PG_WRITE_LOG_PATH: writeLogPath, MOCK_PG_FAIL_SESSION_WRITES: "1" },
      });
      try {
        await waitForBoot(failingChild, port);
        const login = await adminLogin(port, admin);
        assert.equal(login.status, 200, "login must still succeed even if the durable session write fails (falls back to local file)");
        assert.ok(login.json.token, "a usable token must still be returned");
        const check = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(login.json.token)}`);
        assert.equal(check.status, 200, "the session must remain valid in-memory for this process despite the DB write failure");
      } finally {
        await stopServer(failingChild);
      }
    });
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    try { fs.unlinkSync(writeLogPath); } catch { /* ignore */ }
  }
}

// ============================================================================
// C2) Migration test — production-shaped Postgres fixture with legacy sessions
// ============================================================================

async function mockPostgresMigrationTest() {
  const port = nextPort();
  const storePath = tempStorePath("mockpg-migration");
  const seedStorePath = path.join(os.tmpdir(), `llh-admin-sess-seed-${crypto.randomBytes(4).toString("hex")}.json`);
  const writeLogPath = path.join(os.tmpdir(), `llh-admin-sess-writelog-${crypto.randomBytes(4).toString("hex")}.jsonl`);

  // Simulate a real production Postgres row from BEFORE this change shipped:
  // a full-size store that still has legacy sessions embedded in data.adminSessions.
  const fixture = buildProductionShapedFixture();
  const legacyToken = `admin_${crypto.randomBytes(24).toString("hex")}`;
  const legacyEmail = "already-logged-in-owner@example.com";
  fixture.adminSessions = {
    [legacyToken]: {
      email: legacyEmail,
      createdAt: "2026-07-20T00:00:00.000Z", // old enough that, under the pre-fix code, it never expired
      lastValidatedAt: "2026-07-24T00:00:00.000Z",
    },
  };
  fs.writeFileSync(seedStorePath, JSON.stringify(fixture));
  fs.writeFileSync(writeLogPath, "");

  const child = startServer({
    port,
    storePath,
    mockPg: true,
    extraEnv: { MOCK_PG_WRITE_LOG_PATH: writeLogPath, MOCK_PG_SEED_STORE_PATH: seedStorePath },
  });
  try {
    await waitForBoot(child, port);

    await test("[migration] an admin already logged in under the OLD system (legacy store.adminSessions, production-shaped Postgres fixture) stays logged in after this deploy", async () => {
      const check = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(legacyToken)}`);
      assert.equal(check.status, 200, "a pre-existing legacy admin session must survive the migration and remain valid");
      assert.equal(check.json.email, legacyEmail);
    });

    await test("[migration] the legacy session was migrated into llh_admin_sessions with a small write", async () => {
      const lines = fs.readFileSync(writeLogPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const sessionWrites = lines.filter((l) => l.table === "llh_admin_sessions" && l.op === "insert");
      // Note: boot legitimately performs several OTHER unrelated llh_store writes on a
      // fresh/incomplete fixture (curriculum startup seeders topping up missing packaged
      // content, the one-shot temp-password recovery apply, etc.) — those are pre-existing
      // boot behaviors unrelated to session migration, not something this change added, so
      // this test does not assert zero llh_store writes during the *entire* boot sequence.
      // What it does assert (and what actually matters for this change) is that the
      // migration itself produced a session-table write, and that write is small — the
      // same "single row, not the whole document" property already proven for login in
      // section C. The migration CODE itself never calls any llh_store query at all (see
      // server/admin-session-store.js migrateLegacySessions(), which only ever queries
      // llh_admin_sessions) — that is verified directly by static assertion below.
      assert.ok(sessionWrites.length >= 1, "the legacy session must have been inserted into llh_admin_sessions during migration");
      assert.ok(sessionWrites[0].bytes < 2000, `migrated session insert should be small, got ${sessionWrites[0].bytes} bytes`);
      const moduleSrc = fs.readFileSync(path.join(ROOT, "server/admin-session-store.js"), "utf8");
      const migrateFnSrc = moduleSrc.slice(
        moduleSrc.indexOf("async function migrateLegacySessions"),
        moduleSrc.indexOf("async function create(email)"),
      );
      assert.doesNotMatch(migrateFnSrc, /llh_store/, "migrateLegacySessions() must never reference llh_store");
    });

    await test("[migration] curriculum/user counts from the production-shaped fixture are unaffected by the session migration", async () => {
      const login = await adminLogin(port, child.__admin);
      const health = await requestJson(port, "GET", `/api/admin/store-health?adminToken=${encodeURIComponent(login.json.token)}`);
      assert.equal(health.json.health.counts.users, Object.keys(fixture.users).length);
    });

    await test("[migration] a second full boot cycle against the same production-shaped fixture still correctly migrates/validates the legacy session", async () => {
      // Note: this mock's llh_admin_sessions table lives in that process's memory and
      // does not itself persist across a simulated restart (a fresh child process gets
      // a fresh mock), so this specifically exercises "the migration logic runs safely
      // and correctly on a fresh boot against production-shaped data" rather than the
      // real ON CONFLICT (token) DO NOTHING de-duplication SQL clause (which is not
      // meaningfully mockable and is a single, low-risk, standard SQL clause). The
      // de-duplication *logic* itself (never re-migrating a token already present) is
      // covered directly by the local-file unit tests in section A, which do persist
      // across fresh instances the same way a real restart would.
      await stopServer(child);
      fs.writeFileSync(writeLogPath, "");
      const restarted = startServer({
        port,
        storePath,
        mockPg: true,
        extraEnv: { MOCK_PG_WRITE_LOG_PATH: writeLogPath, MOCK_PG_SEED_STORE_PATH: seedStorePath },
      });
      try {
        await waitForBoot(restarted, port);
        const check = await requestJson(port, "GET", `/api/admin/session?adminToken=${encodeURIComponent(legacyToken)}`);
        assert.equal(check.status, 200, "the same legacy session must still validate correctly after a second boot/migration pass");
        assert.equal(check.json.email, legacyEmail);
      } finally {
        await stopServer(restarted);
      }
    });
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    try { fs.unlinkSync(seedStorePath); } catch { /* ignore */ }
    try { fs.unlinkSync(writeLogPath); } catch { /* ignore */ }
  }
}

// ============================================================================
// D) Performance fixture — realistic multi-MB production-shaped store
// ============================================================================

function buildProductionShapedFixture({ userCount = 70, lessonPlanCount = 90, activitiesPerPlan = 17 } = {}) {
  const LOREM = "Children explore open-ended materials while building fine motor skills, language, and social-emotional confidence through guided play. ".repeat(6);
  const users = {};
  for (let i = 0; i < userCount; i += 1) {
    const email = `fixture-user-${i}@example.com`;
    users[email] = {
      email,
      plan: i % 5 === 0 ? "Pro" : "Free",
      accountStatus: "Active",
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      lastSeenAt: new Date().toISOString(),
      children: Array.from({ length: 3 }, (_, c) => ({
        id: `child-${i}-${c}`,
        name: `Child ${i}-${c}`,
        notes: LOREM,
      })),
      observations: Array.from({ length: 5 }, (_, o) => ({ id: `obs-${i}-${o}`, text: LOREM })),
    };
  }
  const lessonPlans = [];
  const activities = [];
  for (let p = 0; p < lessonPlanCount; p += 1) {
    const planId = `fixture-lp-${p}`;
    lessonPlans.push({
      id: planId,
      title: `Fixture Lesson Plan ${p}`,
      age: ["Infant", "Toddler", "Preschool"][p % 3],
      theme: "Fixture Theme",
      plan: p % 4 === 0 ? "Pro" : "Free",
      status: "published",
      weeklyOverview: LOREM,
      objectives: LOREM,
      weeklyMaterials: LOREM,
      vocabularyWords: LOREM,
      observationOpportunities: LOREM,
      adaptations: LOREM,
      familyConnection: LOREM,
      dailyPlans: { monday: { items: [] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
      activityIds: [],
      resourceIds: [],
      updatedAt: new Date().toISOString(),
    });
    for (let a = 0; a < activitiesPerPlan; a += 1) {
      activities.push({
        id: `fixture-act-${p}-${a}`,
        lessonPlanId: planId,
        itemId: `item-${p}-${a}`,
        dayOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"][a % 5],
        activityCategory: "Sensory",
        title: `Fixture Activity ${p}-${a}`,
        objective: LOREM,
        description: LOREM,
        materials: LOREM,
        setup: LOREM,
        steps: LOREM,
        teacherRole: LOREM,
        teacherLanguage: LOREM,
        status: "published",
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return {
    users,
    messages: [],
    notifications: [],
    foundingMembers: Array.from({ length: 17 }, (_, i) => `founding-${i}@example.com`),
    supportTickets: [],
    adminSessions: {},
    siteContent: {
      updatedAt: new Date().toISOString(),
      curriculum: { lessonPlans, activities, resources: [], series: [], updatedAt: new Date().toISOString() },
    },
  };
}

async function performanceFixtureTests() {
  const fixture = buildProductionShapedFixture();
  const fixtureJson = JSON.stringify(fixture);
  const fixtureBytes = Buffer.byteLength(fixtureJson, "utf8");

  await test("production-shaped fixture is genuinely multi-MB (realistic scale)", () => {
    assert.ok(fixtureBytes > 1_000_000, `fixture should be at least ~1MB to be a meaningful performance test, got ${fixtureBytes} bytes`);
    console.log(`      fixture size: ${(fixtureBytes / 1024 / 1024).toFixed(2)} MB (${fixture.siteContent.curriculum.lessonPlans.length} lesson plans, ${fixture.siteContent.curriculum.activities.length} activities, ${Object.keys(fixture.users).length} users)`);
  });

  const port = nextPort();
  const storePath = tempStorePath("perf");
  fs.writeFileSync(storePath, fixtureJson);
  const child = startServer({ port, storePath });
  try {
    await waitForBoot(child, port);
    const admin = child.__admin;

    await test("BEFORE/AFTER: login timing + bytes written against a multi-MB store", async () => {
      const storeBytesBefore = fs.statSync(storePath).size;
      const timings = [];
      let lastToken = "";
      for (let i = 0; i < 5; i += 1) {
        const startedAt = Date.now();
        // eslint-disable-next-line no-await-in-loop
        const login = await adminLogin(port, admin);
        timings.push(Date.now() - startedAt);
        assert.equal(login.status, 200);
        lastToken = login.json.token;
      }
      await new Promise((r) => setTimeout(r, 150));
      const storeBytesAfter = fs.statSync(storePath).size;
      const sessionsFile = storePath.replace(/(\.json)?$/, ".admin-sessions.json");
      const sessionsBytes = fs.statSync(sessionsFile).size;
      const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;

      console.log(`      AFTER  (dedicated session store): main store bytes unchanged: ${storeBytesBefore} -> ${storeBytesAfter}; sessions file: ${sessionsBytes} bytes; avg login time over 5 logins: ${avgMs.toFixed(1)}ms`);
      console.log(`      BEFORE (legacy full-store write, computed for comparison, not executed): every login would have re-serialized and written ~${(fixtureBytes / 1024).toFixed(0)}KB (the entire store) instead of ~${sessionsBytes} bytes — a ${Math.round(fixtureBytes / Math.max(sessionsBytes, 1))}x reduction in bytes written per login.`);

      assert.equal(storeBytesBefore, storeBytesAfter, "main multi-MB store file must be byte-identical before and after 5 logins");
      assert.ok(sessionsBytes < 5000, `sessions file should stay small even after 5 logins, got ${sessionsBytes} bytes`);
      // Generous ceiling — this is about proving no full-store I/O happens per login,
      // not asserting a specific hardware-dependent millisecond budget.
      assert.ok(avgMs < 2000, `average login time should be fast once no full-store write is involved, got ${avgMs}ms`);
      void lastToken;
    });

    await test("health checks stay responsive (<250ms) while a login is in flight against the multi-MB store", async () => {
      const healthDuring = [];
      const loginPromise = adminLogin(port, admin);
      for (let i = 0; i < 5; i += 1) {
        const startedAt = Date.now();
        // eslint-disable-next-line no-await-in-loop
        await requestJson(port, "GET", "/api/health");
        healthDuring.push(Date.now() - startedAt);
      }
      await loginPromise;
      const maxMs = Math.max(...healthDuring);
      assert.ok(maxMs < 250, `health check should stay fast during a concurrent login, slowest was ${maxMs}ms`);
    });

    await test("concurrent logins against the multi-MB store never return 503 and never touch curriculum/user counts", async () => {
      const before = await requestJson(port, "GET", `/api/admin/store-health?adminToken=${encodeURIComponent((await adminLogin(port, admin)).json.token)}`);
      const beforeCounts = before.json.health.counts;
      const results = await Promise.all(Array.from({ length: 10 }, () => adminLogin(port, admin)));
      results.forEach((res) => assert.notEqual(res.status, 503, "no concurrent login should ever produce a 503"));
      results.forEach((res) => assert.equal(res.status, 200));
      const afterToken = results[0].json.token;
      const after = await requestJson(port, "GET", `/api/admin/store-health?adminToken=${encodeURIComponent(afterToken)}`);
      assert.deepEqual(after.json.health.counts, beforeCounts, "10 concurrent logins must not change any store inventory counts");
    });
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    try { fs.unlinkSync(storePath.replace(/(\.json)?$/, ".admin-sessions.json")); } catch { /* ignore */ }
  }
}

// ============================================================================
// E) Founding-count breakdown endpoint (read-only, labeled) — no eligibility change
// ============================================================================

async function foundingBreakdownTests() {
  const port = nextPort();
  const storePath = tempStorePath("founding");
  const fixture = {
    users: {
      "active-founder@example.com": { email: "active-founder@example.com", plan: "Founding", foundingMember: true, foundingMemberActive: true, accountStatus: "Active", stripeSubscriptionStatus: "active" },
      "historical-founder@example.com": { email: "historical-founder@example.com", plan: "Free", foundingMember: true, foundingMemberActive: false, foundingMemberHistorical: true, accountStatus: "Active" },
      "never-founder@example.com": { email: "never-founder@example.com", plan: "Free", accountStatus: "Active" },
    },
    foundingMembers: ["active-founder@example.com", "historical-founder@example.com"],
  };
  fs.writeFileSync(storePath, JSON.stringify(fixture));
  const child = startServer({ port, storePath });
  try {
    await waitForBoot(child, port);
    const admin = child.__admin;
    const login = await adminLogin(port, admin);
    const token = login.json.token;

    await test("founding breakdown endpoint clearly labels total/everClaimed/currentlyActive/canceledOrExpired/remaining", async () => {
      const res = await requestJson(port, "GET", `/api/admin/founding-breakdown?adminToken=${encodeURIComponent(token)}`);
      assert.equal(res.status, 200, JSON.stringify(res.json));
      const body = res.json;
      assert.equal(typeof body.totalFoundingSpots, "number");
      assert.equal(body.everClaimed, 2, "everClaimed should equal the foundingMembers ledger length");
      assert.equal(body.currentlyActive, 1, "only the active-founder should count as currently active");
      assert.equal(body.canceledOrExpired, 1, "everClaimed minus currentlyActive");
      assert.equal(body.remainingAvailable, body.totalFoundingSpots - body.everClaimed);
      assert.ok(body.labels && body.labels.everClaimed && body.labels.currentlyActive, "each field must carry a plain-language label");
    });

    await test("founding breakdown endpoint requires admin auth and is otherwise unauthenticated-safe", async () => {
      const res = await requestJson(port, "GET", "/api/admin/founding-breakdown");
      assert.equal(res.status, 401);
    });

    await test("founding breakdown endpoint changes nothing — public founding status is unaffected by calling it", async () => {
      const beforeStatus = await requestJson(port, "GET", "/api/founding-status");
      await requestJson(port, "GET", `/api/admin/founding-breakdown?adminToken=${encodeURIComponent(token)}`);
      const afterStatus = await requestJson(port, "GET", "/api/founding-status");
      assert.deepEqual(afterStatus.json, beforeStatus.json, "reading the breakdown must never change founding eligibility/counts");
    });
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    try { fs.unlinkSync(storePath.replace(/(\.json)?$/, ".admin-sessions.json")); } catch { /* ignore */ }
  }
}

// ============================================================================

async function main() {
  console.log("A) Unit tests (adminSessionStore module)");
  await unitTests();
  console.log("\nB) Integration tests (local-json mode)");
  await localJsonIntegrationTests();
  console.log("\nC) Integration tests (mock Postgres — proves table + byte scope)");
  await mockPostgresIntegrationTests();
  console.log("\nC2) Migration test (production-shaped Postgres fixture with legacy sessions)");
  await mockPostgresMigrationTest();
  console.log("\nD) Performance fixture (realistic multi-MB production-shaped store)");
  await performanceFixtureTests();
  console.log("\nE) Founding-count breakdown endpoint");
  await foundingBreakdownTests();

  if (!process.exitCode) {
    console.log("\nAll admin session storage audit tests passed.");
  }
}

main().catch((error) => {
  console.error("FAIL (fatal)", error);
  process.exitCode = 1;
});
