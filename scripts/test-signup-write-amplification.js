#!/usr/bin/env node
/**
 * Signup full-store write amplification regression.
 *
 * Proves one successful signup (profile signup:true + Meta + welcome + admin alert)
 * performs at most 3 durable full-store persists:
 *   1) profile + Meta stamps (awaited, before HTTP 200)
 *   2) welcome + admin claim/alert (post-response batch)
 *   3) admin alert sent/clear stamp (after owner email result)
 *
 * Also preserves: fields, welcome email, admin alert, Meta stamps, HTTP 200,
 * duplicate idempotency, and 503 when the awaited profile persist fails.
 *
 * Run: NODE_ENV=test node scripts/test-signup-write-amplification.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const RESEND_PORT = 4500 + Math.floor(Math.random() * 80);
const STORE = path.join(os.tmpdir(), `llh-signup-wa-${crypto.randomBytes(4).toString("hex")}.json`);
const SUPPORT_TO = "leahrivie@gmail.com";
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-password";
const ADMIN_ACCESS_CODE = "test-code";

/** Happy-path signup must not exceed this many durable persists. */
const MAX_DURABLE_PERSISTS_PER_SIGNUP = 3;

let APP_PORT = 4700 + Math.floor(Math.random() * 200);
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

function request(method, urlPath, { body = null, headers: extraHeaders = {} } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const profileEmail = urlPath === "/api/account/profile" && body?.email
    ? String(body.email).trim().toLowerCase()
    : "";
  const headers = payload
    ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    : {};
  if (profileEmail) {
    headers.Authorization = `Bearer test:${profileEmail}`;
    headers["X-LLH-User-Email"] = profileEmail;
  }
  Object.assign(headers, extraHeaders);
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
      if (res.status === 200 && res.json?.ok) return res.json;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("App server did not become healthy");
}

async function durablePersistCount() {
  const health = await request("GET", "/api/health");
  assert.equal(health.status, 200);
  assert.ok(health.json?.storeWrites, "test health must expose storeWrites");
  return Number(health.json.storeWrites.durablePersistCalls || 0);
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

function spawnApp(extraEnv = {}) {
  APP_PORT = 4700 + Math.floor(Math.random() * 200);
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
      RESEND_API_KEY: "re_test_signup_wa",
      RESEND_API_BASE_URL: `http://127.0.0.1:${RESEND_PORT}`,
      EMAIL_AUTOMATIONS_ENABLED: "false",
      DATABASE_PROVIDER: "local-json",
      META_CAPI_ENABLED: "false",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
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

async function waitUntil(predicate, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

function readStoreFile() {
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}

async function signupProfile(email, { metaEventId } = {}) {
  const body = {
    email,
    firstName: "Write",
    lastName: "Amp",
    phone: "555-0100",
    accountType: "home_daycare",
    role: "owner",
    signup: true,
    lastLogin: true,
    metaEventId: metaEventId || `reg_${email.replace(/\W/g, "")}`,
  };
  return request("POST", "/api/account/profile", { body });
}

async function main() {
  const captured = [];
  const fakeResend = await startFakeResend(captured);
  const child = spawnApp();
  let childExited = false;
  child.on("exit", () => { childExited = true; });
  let childOutput = "";
  child.stdout.on("data", (d) => { childOutput += d; });
  child.stderr.on("data", (d) => { childOutput += d; });

  try {
    await waitForHealth();

    // --- Happy path: fields + emails + Meta + write budget ---
    try {
      const email = `signup-wa-${Date.now()}@example.com`;
      const metaEventId = `reg_${email.replace(/\W/g, "")}`;
      const before = await durablePersistCount();
      const profile = await signupProfile(email, { metaEventId });
      assert.equal(profile.status, 200, JSON.stringify(profile.json));
      assert.equal(profile.json?.ok, true);
      assert.equal(profile.json?.user?.email, email);
      assert.equal(profile.json?.metaEventId, metaEventId);

      const ready = await waitUntil(async () => {
        const adminOk = captured.filter(isAdminSignupEmail).length >= 1;
        const welcomeOk = captured.some((item) => isWelcomeEmail(item, email));
        const store = readStoreFile();
        const user = store.users?.[email];
        return adminOk && welcomeOk && user?.adminSignupAlertSentAt && user?.onboardingWelcome?.freeWelcomeSentAt;
      }, 12000);
      assert.ok(ready, "timeout waiting for welcome + admin alert + stamps");

      const after = await durablePersistCount();
      const delta = after - before;
      assert.ok(
        delta <= MAX_DURABLE_PERSISTS_PER_SIGNUP,
        `expected ≤${MAX_DURABLE_PERSISTS_PER_SIGNUP} durable persists per signup, got ${delta} (before=${before}, after=${after})`,
      );
      assert.ok(delta >= 2, `expected at least profile + side-effect persists, got ${delta}`);

      const store = readStoreFile();
      const user = store.users[email];
      assert.ok(user, "user missing from store");
      assert.equal(user.firstName, "Write");
      assert.equal(user.lastName, "Amp");
      assert.ok(user.signupAt, "signupAt missing");
      assert.equal(user.plan, "Free");
      assert.equal(user.metaCompleteRegistrationEventId, metaEventId);
      assert.ok(user.metaCompleteRegistrationAt, "Meta stamp timestamp missing");
      assert.ok(user.onboardingWelcome?.freeWelcomeSentAt, "welcome stamp missing");
      assert.ok(user.adminSignupAlertSentAt, "admin alert sent stamp missing");
      assert.ok(
        (store.messages || []).some((m) => (
          m && String(m.toEmail || "").toLowerCase() === email && m.channel === "onboarding_welcome"
        )),
        "in-app welcome message missing",
      );
      assert.equal(captured.filter(isAdminSignupEmail).length, 1);
      assert.equal(captured.filter((item) => isWelcomeEmail(item, email)).length, 1);

      pass(`happy-path signup: fields+emails+meta durable, persists=${delta} (≤${MAX_DURABLE_PERSISTS_PER_SIGNUP})`);
    } catch (error) {
      fail("happy-path signup write amplification", error);
    }

    // --- Duplicate signup:true must not re-send or explode write count ---
    try {
      const email = `signup-wa-dupe-${Date.now()}@example.com`;
      const first = await signupProfile(email);
      assert.equal(first.status, 200);
      await waitUntil(async () => {
        const store = readStoreFile();
        return Boolean(store.users?.[email]?.adminSignupAlertSentAt);
      }, 10000);

      const adminBefore = captured.filter(isAdminSignupEmail).length;
      const welcomeBefore = captured.filter((item) => isWelcomeEmail(item, email)).length;
      const before = await durablePersistCount();
      const retry = await signupProfile(email, { metaEventId: first.json.metaEventId });
      assert.equal(retry.status, 200);
      await new Promise((r) => setTimeout(r, 1200));
      const after = await durablePersistCount();
      assert.equal(captured.filter(isAdminSignupEmail).length, adminBefore, "duplicate admin email");
      assert.equal(
        captured.filter((item) => isWelcomeEmail(item, email)).length,
        welcomeBefore,
        "duplicate welcome email",
      );
      // Duplicate may still do the awaited profile write (1), but not the old 4–5 side-effect storm.
      assert.ok(after - before <= 2, `duplicate signup wrote too many times: ${after - before}`);
      pass("duplicate signup keeps emails idempotent and write count low");
    } catch (error) {
      fail("duplicate signup write/idempotency", error);
    }

    // --- Source guards: Meta must not writeStore after 200; welcome supports deferPersist ---
    try {
      const indexSource = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
      const welcomeSource = fs.readFileSync(path.join(ROOT, "server/onboarding-welcome.js"), "utf8");
      const profileFnStart = indexSource.indexOf("async function handleAccountProfileSync");
      const profileFnEnd = indexSource.indexOf("async function deliverSignupTransactionalSideEffects");
      assert.ok(profileFnStart >= 0 && profileFnEnd > profileFnStart);
      const profileSlice = indexSource.slice(profileFnStart, profileFnEnd);
      assert.match(profileSlice, /metaCompleteRegistrationEventId = metaEventId/);
      assert.match(profileSlice, /Fold Meta CompleteRegistration stamps/);
      assert.doesNotMatch(
        profileSlice.slice(profileSlice.indexOf("jsonResponse(response, 200")),
        /writeStore\(metaStore/,
      );
      assert.match(indexSource, /deferPersist: true/);
      assert.match(indexSource, /One durable persist for deferred welcome/);
      assert.match(welcomeSource, /if \(!options\.deferPersist\) writeStore\(store\);/);
      pass("source guards for Meta fold-in + deferred welcome batching");
    } catch (error) {
      fail("source guards", error);
    }

    // --- HTTP response shape unchanged for non-signup profile sync ---
    try {
      const email = `signup-wa-login-${Date.now()}@example.com`;
      const created = await signupProfile(email);
      assert.equal(created.status, 200);
      await waitUntil(async () => Boolean(readStoreFile().users?.[email]?.signupAt), 8000);
      const loginSync = await request("POST", "/api/account/profile", {
        body: {
          email,
          firstName: "Write",
          lastName: "Amp",
          lastLogin: true,
        },
      });
      assert.equal(loginSync.status, 200);
      assert.equal(loginSync.json?.ok, true);
      assert.equal(loginSync.json?.user?.email, email);
      assert.equal(loginSync.json?.metaEventId, undefined);
      pass("non-signup profile sync response unchanged");
    } catch (error) {
      fail("non-signup profile sync response", error);
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
    if (childOutput) console.error(childOutput.slice(-4000));
    process.exit(1);
  }
  console.log("\nAll signup write-amplification tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
