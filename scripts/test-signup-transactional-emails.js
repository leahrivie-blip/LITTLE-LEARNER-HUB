#!/usr/bin/env node
/**
 * Signup transactional email race + idempotency coverage.
 *
 * Proves:
 * - 10 consecutive signups → 10 admin signup alerts + 10 user welcome emails
 * - Racing analytics account_signup_complete cannot suppress emails
 * - Duplicate signup:true retries do not create duplicate emails
 * - Analytics still records one account_signup_complete per signup
 *
 * Run: NODE_ENV=test node scripts/test-signup-transactional-emails.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const RESEND_PORT = 4500 + Math.floor(Math.random() * 80);
const STORE = path.join(os.tmpdir(), `llh-signup-tx-${crypto.randomBytes(4).toString("hex")}.json`);
const SUPPORT_TO = "leahrivie@gmail.com";
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-password";
const ADMIN_ACCESS_CODE = "test-code";

let APP_PORT = 4600 + Math.floor(Math.random() * 200);
let BASE = `http://127.0.0.1:${APP_PORT}`;
let failures = 0;

function pass(name) {
  console.log(`PASS  ${name}`);
}

function fail(name, error) {
  failures += 1;
  console.error(`FAIL  ${name}`);
  console.error(error);
}

function request(method, urlPath, { body = null } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = payload
    ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    : {};
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("App server did not become healthy");
}

async function startFakeResend(captured) {
  const idempotency = new Map();
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/emails") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      const key = String(req.headers["idempotency-key"] || "").trim();
      if (key && idempotency.has(key)) {
        const prior = idempotency.get(key);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: prior.id }));
        return;
      }
      const id = `re_${crypto.randomBytes(6).toString("hex")}`;
      const row = { id, headers: req.headers, body, at: Date.now() };
      captured.push(row);
      if (key) idempotency.set(key, row);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id }));
    });
  });
  await new Promise((resolve) => server.listen(RESEND_PORT, "127.0.0.1", resolve));
  return server;
}

function spawnApp() {
  APP_PORT = 4600 + Math.floor(Math.random() * 200);
  BASE = `http://127.0.0.1:${APP_PORT}`;
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(APP_PORT),
      LLH_STORE_PATH: STORE,
      SITE_URL: BASE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      SUPPORT_EMAIL_TO: SUPPORT_TO,
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      RESEND_API_KEY: "re_test_signup_tx",
      RESEND_API_BASE_URL: `http://127.0.0.1:${RESEND_PORT}`,
      EMAIL_AUTOMATIONS_ENABLED: "false",
      DATABASE_PROVIDER: "local-json",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function countEmails(captured, predicate) {
  return captured.filter(predicate).length;
}

function isAdminSignupEmail(item) {
  const to = item.body?.to || [];
  const subject = String(item.body?.subject || "");
  return to.includes(SUPPORT_TO)
    && (/new free member/i.test(subject) || /new signup/i.test(subject) || /new account created/i.test(subject));
}

function isWelcomeEmail(item, userEmail) {
  const to = item.body?.to || [];
  const subject = String(item.body?.subject || "");
  return to.includes(userEmail) && /welcome to little learner hub/i.test(subject);
}

async function waitUntil(predicate, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

async function signupWithRace(email, { raceAnalyticsFirst = true } = {}) {
  const profileBody = {
    email,
    firstName: "Test",
    lastName: "Provider",
    signup: true,
    lastLogin: true,
    metaEventId: `reg_${email.replace(/\W/g, "")}`,
  };
  const analyticsBody = {
    name: "account_signup_complete",
    user: email,
    detail: { email, firstName: "Test", lastName: "Provider", plan: "Free" },
    sessionId: `sess_${email}`,
  };

  if (raceAnalyticsFirst) {
    // Historical race: analytics completes before profile sync. Emails must still send.
    // Await analytics first so the event is durably recorded, then profile signup.
    const analytics = await request("POST", "/api/analytics/event", { body: analyticsBody });
    assert.equal(analytics.status, 200, JSON.stringify(analytics.json));
    const profile = await request("POST", "/api/account/profile", { body: profileBody });
    assert.equal(profile.status, 200, JSON.stringify(profile.json));
  } else {
    const profile = await request("POST", "/api/account/profile", { body: profileBody });
    assert.equal(profile.status, 200, JSON.stringify(profile.json));
    const analytics = await request("POST", "/api/analytics/event", { body: analyticsBody });
    assert.equal(analytics.status, 200, JSON.stringify(analytics.json));
  }
}

async function main() {
  const captured = [];
  const fakeResend = await startFakeResend(captured);
  const child = spawnApp();
  let childExited = false;
  child.on("exit", () => { childExited = true; });

  try {
    await waitForHealth();

    const users = Array.from({ length: 10 }, (_, i) => `signup-race-${Date.now()}-${i}@example.com`);

    try {
      for (const email of users) {
        await signupWithRace(email, { raceAnalyticsFirst: true });
      }

      const ready = await waitUntil(() => (
        countEmails(captured, isAdminSignupEmail) >= 10
        && users.every((email) => countEmails(captured, (item) => isWelcomeEmail(item, email)) >= 1)
      ), 12000);
      assert.ok(ready, `timeout waiting for 10+10 emails; admin=${countEmails(captured, isAdminSignupEmail)} captured=${captured.length}`);

      const adminCount = countEmails(captured, isAdminSignupEmail);
      assert.equal(adminCount, 10, `expected 10 admin signup emails, got ${adminCount}`);

      for (const email of users) {
        const welcomeCount = countEmails(captured, (item) => isWelcomeEmail(item, email));
        assert.equal(welcomeCount, 1, `${email} welcome count=${welcomeCount}`);
      }

      // Duplicate signup retries must not create more admin/welcome emails.
      const adminBeforeDupes = countEmails(captured, isAdminSignupEmail);
      assert.equal(adminBeforeDupes, 10);
      for (const email of users.slice(0, 3)) {
        await request("POST", "/api/account/profile", {
          body: { email, firstName: "Test", signup: true },
        });
      }
      await new Promise((r) => setTimeout(r, 1200));
      assert.equal(
        countEmails(captured, isAdminSignupEmail),
        10,
        "duplicate signup created extra admin emails",
      );
      for (const email of users) {
        assert.equal(
          countEmails(captured, (item) => isWelcomeEmail(item, email)),
          1,
          `duplicate signup created extra welcome for ${email}`,
        );
      }

      // Analytics still recorded one signup event per user (may live in store for local-json).
      const analyticsReady = await waitUntil(() => {
        const store = JSON.parse(fs.readFileSync(STORE, "utf8"));
        const signupEvents = (store.analyticsEvents || []).filter((e) => e.name === "account_signup_complete");
        return users.every((email) => signupEvents.some((e) => {
          const who = String(e.user || e.detail?.email || "").toLowerCase();
          return who === email;
        }));
      }, 8000);
      assert.ok(analyticsReady, "missing analytics signup events for one or more users");

      // Admin alerts stay addressed only to SUPPORT_EMAIL_TO (gmail), never iCloud admin login.
      for (const item of captured.filter(isAdminSignupEmail)) {
        assert.deepEqual(item.body.to, [SUPPORT_TO]);
        assert.ok(!JSON.stringify(item.body.to).includes("icloud.com"));
      }

      pass("10 raced signups → 10 admin alerts + 10 welcomes, no duplicates");
    } catch (error) {
      fail("10 raced signups → 10 admin alerts + 10 welcomes, no duplicates", error);
    }

    try {
      const email = `signup-order-${Date.now()}@example.com`;
      const adminBefore = countEmails(captured, isAdminSignupEmail);
      await signupWithRace(email, { raceAnalyticsFirst: false });
      const ready = await waitUntil(() => (
        countEmails(captured, (item) => isWelcomeEmail(item, email)) === 1
        && countEmails(captured, isAdminSignupEmail) >= adminBefore + 1
      ), 8000);
      assert.ok(ready, "profile-first signup emails did not arrive");
      assert.equal(countEmails(captured, (item) => isWelcomeEmail(item, email)), 1);
      assert.equal(countEmails(captured, isAdminSignupEmail), adminBefore + 1);
      // Retry must not duplicate.
      await request("POST", "/api/account/profile", { body: { email, firstName: "Test", signup: true } });
      await new Promise((r) => setTimeout(r, 800));
      assert.equal(countEmails(captured, isAdminSignupEmail), adminBefore + 1);
      assert.equal(countEmails(captured, (item) => isWelcomeEmail(item, email)), 1);
      pass("profile-first signup still sends exactly one welcome + one admin alert");
    } catch (error) {
      fail("profile-first signup still sends exactly one welcome + one admin alert", error);
    }

    try {
      const moduleSource = fs.readFileSync(path.join(ROOT, "server/signup-transactional.js"), "utf8");
      const indexSource = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
      const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
      assert.match(moduleSource, /claimAdminSignupAlert/);
      assert.match(indexSource, /deliverSignupTransactionalSideEffects/);
      assert.match(indexSource, /tag: "email-send"/);
      assert.match(indexSource, /loadInsightsAnalyticsEvents/);
      assert.match(appSource, /Profile sync first/);
      assert.doesNotMatch(
        indexSource.slice(indexSource.indexOf("if (event.name === \"account_signup_complete\""), indexSource.indexOf("if (event.name === \"account_signup_complete\"") + 400),
        /updates\.signupAt = event\.createdAt/,
      );
      pass("source guards for race fix + email logging + live advisor events");
    } catch (error) {
      fail("source guards for race fix + email logging + live advisor events", error);
    }
  } finally {
    if (!childExited) {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }
    await new Promise((resolve) => fakeResend.close(resolve));
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }

  if (failures) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll signup transactional email tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
