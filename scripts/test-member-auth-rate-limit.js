#!/usr/bin/env node
/**
 * Phase 1 — member login + password-reset rate limits.
 * Run: NODE_ENV=test node scripts/test-member-auth-rate-limit.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createMemberAuthRateLimit } = require("../server/member-auth-rate-limit.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19920 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-auth-rate-${crypto.randomBytes(4).toString("hex")}.json`);
const KNOWN = "rate-known@example.com";
const OTHER = "rate-other@example.com";
const UNKNOWN = "rate-unknown@example.com";
const PASSWORD = "Correct-Password-1!";

function hash(password) {
  return crypto.createHash("sha256").update(String(password), "utf8").digest("hex");
}

function request(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
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
  throw new Error("server did not become healthy");
}

function unitTests() {
  const limiter = createMemberAuthRateLimit({
    loginMaxFailed: 3,
    loginWindowMs: 60_000,
    loginLockoutMs: 60_000,
    resetMax: 2,
    resetWindowMs: 60_000,
    resetIpMax: 8,
  });
  const ip = "203.0.113.10";
  assert.equal(limiter.loginLockoutStatus(ip, KNOWN).limited, false);
  limiter.recordLoginFailure(ip, KNOWN);
  limiter.recordLoginFailure(ip, KNOWN);
  assert.equal(limiter.loginLockoutStatus(ip, OTHER).limited, false, "other account must not inherit failures");
  const third = limiter.recordLoginFailure(ip, KNOWN);
  assert.equal(third.limited, true);
  assert.equal(limiter.loginLockoutStatus(ip, KNOWN).limited, true);
  limiter.recordLoginSuccess(ip, KNOWN);
  assert.equal(limiter.loginLockoutStatus(ip, KNOWN).limited, false);

  limiter.recordResetRequest(ip, KNOWN);
  assert.equal(limiter.resetStatus(ip, KNOWN).limited, false);
  limiter.recordResetRequest(ip, KNOWN);
  assert.equal(limiter.resetStatus(ip, KNOWN).limited, true);
  assert.equal(limiter.resetStatus(ip, OTHER).limited, false, "reset cooldown is per email+ip");
  console.log("PASS  member auth rate-limit unit");
}

async function httpTests() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [KNOWN]: {
        email: KNOWN,
        plan: "Free",
        passwordHash: hash(PASSWORD),
        serverPasswordAuth: true,
      },
      [OTHER]: {
        email: OTHER,
        plan: "Free",
        passwordHash: hash(PASSWORD),
        serverPasswordAuth: true,
      },
    },
    emailAuth: { tokens: [], consumedHashes: [] },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE_PATH,
      SITE_URL: "https://littlelearnershubbyleah.com",
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
      EMAIL_AUTOMATIONS_ENABLED: "false",
      MEMBER_LOGIN_RATE_MAX: "3",
      MEMBER_LOGIN_RATE_WINDOW_MS: "60000",
      MEMBER_LOGIN_LOCKOUT_MS: "60000",
      MEMBER_RESET_RATE_MAX: "2",
      MEMBER_RESET_RATE_WINDOW_MS: "60000",
      MEMBER_RESET_IP_RATE_MAX: "20",
      RESEND_API_KEY: "re_test_key",
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      SUPPORT_EMAIL_TO: "support@littlelearnershubbyleah.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForHealth();

    const okLogin = await request("POST", "/api/auth/password-login", {
      body: { email: KNOWN, password: PASSWORD },
    });
    assert.equal(okLogin.status, 200, okLogin.text);
    assert.equal(okLogin.json?.ok, true);
    assert.ok(okLogin.json?.memberSessionToken);

    const badBodies = [];
    for (let i = 0; i < 3; i += 1) {
      const bad = await request("POST", "/api/auth/password-login", {
        body: { email: KNOWN, password: "Wrong-Password-9!" },
      });
      badBodies.push(bad);
      assert.equal(bad.status, 401, `failure ${i + 1} should stay 401`);
      assert.equal(bad.json?.error, "The email or password did not match. Please try again.");
    }
    const limited = await request("POST", "/api/auth/password-login", {
      body: { email: KNOWN, password: "Wrong-Password-9!" },
    });
    assert.equal(limited.status, 429, limited.text);
    assert.match(String(limited.json?.error || ""), /try again later/i);

    const otherStillWorks = await request("POST", "/api/auth/password-login", {
      body: { email: OTHER, password: PASSWORD },
    });
    assert.equal(otherStillWorks.status, 200, otherStillWorks.text);

    const knownReset = await request("POST", "/api/auth/request-password-reset", {
      body: { email: KNOWN },
    });
    const unknownReset = await request("POST", "/api/auth/request-password-reset", {
      body: { email: UNKNOWN },
    });
    assert.equal(knownReset.status, 200);
    assert.equal(unknownReset.status, 200);
    assert.deepEqual(knownReset.json, unknownReset.json);
    assert.equal(knownReset.json.delivery, "accepted");
    assert.match(String(knownReset.json.message || ""), /If an account exists/);

    const knownReset2 = await request("POST", "/api/auth/request-password-reset", {
      body: { email: KNOWN },
    });
    assert.equal(knownReset2.status, 200);
    const knownReset3 = await request("POST", "/api/auth/request-password-reset", {
      body: { email: KNOWN },
    });
    assert.equal(knownReset3.status, 429, knownReset3.text);
    const unknownReset2 = await request("POST", "/api/auth/request-password-reset", {
      body: { email: UNKNOWN },
    });
    assert.equal(unknownReset2.status, 200, "different email should not inherit the other address cooldown");
    const unknownReset3 = await request("POST", "/api/auth/request-password-reset", {
      body: { email: UNKNOWN },
    });
    assert.equal(unknownReset3.status, 429);
    assert.equal(unknownReset3.json?.error, knownReset3.json?.error);

    console.log("PASS  member auth rate-limit HTTP");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  unitTests();
  await httpTests();
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
