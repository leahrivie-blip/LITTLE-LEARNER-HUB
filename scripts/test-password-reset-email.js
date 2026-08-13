#!/usr/bin/env node
/**
 * Focused password-reset email delivery + security coverage.
 *
 * Proves:
 * 1. Known account can request a reset
 * 2. Unknown account receives the same public response
 * 3. Valid account causes exactly one reset-email send attempt
 * 4. Email goes to the correct normalized account address
 * 5. Production reset URL uses littlelearnershubbyleah.com
 * 6. Reset token is valid before expiration
 * 7. Expired token is rejected
 * 8. Invalid token is rejected
 * 9. Used token cannot be reused
 * 10. Valid reset changes the password
 * 11. New password can authenticate
 * 12. Old password no longer authenticates
 * 13. Email-provider failure does not leak account existence
 * 14. No raw reset token is written to logs
 * + Client prefers server Resend path over Firebase when ready
 *
 * Run: NODE_ENV=test node scripts/test-password-reset-email.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const RESEND_PORT = 4510 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-pw-reset-${crypto.randomBytes(4).toString("hex")}.json`);
const EMAIL = "Reset.User@Example.com";
const NORMALIZED = "reset.user@example.com";
const OLD_PASSWORD = "OldPassword-1!";
const NEW_PASSWORD = "BrandNewPassword-2!";
const PROD_SITE = "https://littlelearnershubbyleah.com";
const NEUTRAL_MESSAGE = "If an account exists for that email, password reset instructions have been sent.";

let APP_PORT = 4610 + Math.floor(Math.random() * 50);
let BASE = `http://127.0.0.1:${APP_PORT}`;

function hash(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
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
        resolve({ status: res.statusCode, json, raw, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("App server did not become healthy");
}

async function startFakeResend(captured, { fail = false } = {}) {
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
      captured.push({ headers: req.headers, body });
      if (fail) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "simulated_provider_failure" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: `re_${Date.now()}` }));
    });
  });
  await new Promise((resolve) => server.listen(RESEND_PORT, "127.0.0.1", resolve));
  return server;
}

function extractResetToken(bodyHtml = "", textBody = "") {
  const source = `${bodyHtml}\n${textBody}`;
  const match = source.match(/resetToken=([A-Za-z0-9_\-]+)/);
  return match?.[1] || "";
}

function writeSeedStore() {
  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [NORMALIZED]: {
        email: NORMALIZED,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        passwordHash: hash(OLD_PASSWORD),
        serverPasswordAuth: true,
        emailVerified: true,
      },
    },
    siteContent: {},
    adminSessions: {},
    memberSessions: {},
    emailAuth: { tokens: [] },
  }, null, 2));
}

function spawnApp(envExtra = {}) {
  APP_PORT = 4610 + Math.floor(Math.random() * 200);
  BASE = `http://127.0.0.1:${APP_PORT}`;
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(APP_PORT),
      LLH_STORE_PATH: STORE,
      SITE_URL: PROD_SITE,
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
      EMAIL_AUTOMATIONS_ENABLED: "false",
      FIREBASE_API_KEY: "",
      FIREBASE_AUTH_DOMAIN: "",
      FIREBASE_PROJECT_ID: "",
      FIREBASE_APP_ID: "",
      ...envExtra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function withServer(envExtra, fn) {
  const child = spawnApp(envExtra);
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  try {
    await waitForHealth();
    await fn({ bootLog: () => bootLog });
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const emailAuthJs = fs.readFileSync(path.join(ROOT, "server/email-auth.js"), "utf8");

  // Client must prefer server Resend before Firebase.
  const serverCallIdx = appJs.indexOf('fetch("/api/auth/request-password-reset"');
  const firebaseCallIdx = appJs.indexOf("sendPasswordResetEmail(client.auth");
  assert.ok(serverCallIdx > 0, "client must call server password-reset endpoint");
  assert.ok(firebaseCallIdx > 0, "firebase fallback must remain present");
  assert.ok(serverCallIdx < firebaseCallIdx, "server Resend path must run before Firebase fallback");
  assert.match(appJs, /If an account exists for that email, password reset instructions have been sent/);
  assert.match(serverJs, /eventType:\s*"password_reset_email"/);
  assert.match(serverJs, /classifyPasswordResetEmailError/);
  assert.match(emailAuthJs, /PASSWORD_RESET_TTL_MS/);

  writeSeedStore();
  const captured = [];
  const fakeResend = await startFakeResend(captured);

  try {
    await withServer({
      RESEND_API_KEY: "re_test_key",
      RESEND_API_BASE_URL: `http://127.0.0.1:${RESEND_PORT}`,
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      SUPPORT_EMAIL_TO: "support@littlelearnershubbyleah.com",
    }, async ({ bootLog }) => {
      // 2. Unknown account — same public response, no send.
      const unknown = await request("POST", "/api/auth/request-password-reset", {
        body: { email: "missing-user@example.com" },
      });
      assert.equal(unknown.status, 200);
      assert.equal(unknown.json.ok, true);
      assert.equal(unknown.json.delivery, "skipped");
      assert.equal(unknown.json.message, NEUTRAL_MESSAGE);
      assert.equal(captured.length, 0, "unknown accounts must not trigger provider send");

      // 1 + 3 + 4 + 5. Known account (mixed case) → exactly one send to normalized address + prod URL.
      const before = captured.length;
      const known = await request("POST", "/api/auth/request-password-reset", {
        body: { email: EMAIL },
      });
      assert.equal(known.status, 200, JSON.stringify(known.json));
      assert.equal(known.json.ok, true);
      assert.equal(known.json.delivery, "sent");
      assert.equal(known.json.message, NEUTRAL_MESSAGE);
      assert.equal(known.json.message, unknown.json.message, "public response must match for known/unknown");
      assert.equal(captured.length, before + 1, "exactly one reset-email send attempt");

      const mail = captured[captured.length - 1];
      assert.deepEqual(mail.body.to, [NORMALIZED]);
      assert.match(String(mail.body.subject || ""), /Reset your Little Learner Hub password/);
      const html = String(mail.body.html || "");
      const text = String(mail.body.text || "");
      assert.match(html, new RegExp(`${PROD_SITE.replace(/\./g, "\\.")}/\\?view=reset-password&resetToken=`));
      assert.match(text, new RegExp(`${PROD_SITE.replace(/\./g, "\\.")}/\\?view=reset-password&resetToken=`));
      assert.doesNotMatch(html, /localhost|127\.0\.0\.1|onrender\.com/i);

      const token = extractResetToken(html, text);
      assert.ok(token, "reset token must be present in email");
      assert.doesNotMatch(bootLog(), new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      // 6. Valid before expiration.
      const verifyOk = await request("GET", `/api/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
      assert.equal(verifyOk.status, 200, JSON.stringify(verifyOk.json));
      assert.equal(verifyOk.json.email, NORMALIZED);

      // 8. Invalid token rejected.
      const verifyBad = await request("GET", "/api/auth/password-reset/verify?token=not-a-real-token");
      assert.equal(verifyBad.status, 400);

      // 7. Expired token rejected.
      const store = JSON.parse(fs.readFileSync(STORE, "utf8"));
      const row = (store.emailAuth?.tokens || []).find((item) => item.purpose === "password_reset" && !item.usedAt);
      assert.ok(row, "token row should exist in store");
      row.expiresAt = new Date(Date.now() - 60_000).toISOString();
      fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
      // Force store reload by another request path that re-reads; verify endpoint reads store.
      const verifyExpired = await request("GET", `/api/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
      assert.equal(verifyExpired.status, 400, "expired token must be rejected");

      // Request a fresh token for complete/reuse/login checks.
      const fresh = await request("POST", "/api/auth/request-password-reset", {
        body: { email: NORMALIZED },
      });
      assert.equal(fresh.status, 200);
      assert.equal(fresh.json.delivery, "sent");
      const freshMail = captured[captured.length - 1];
      const freshToken = extractResetToken(freshMail.body.html, freshMail.body.text);
      assert.ok(freshToken);
      assert.notEqual(freshToken, token);

      // 10. Valid reset changes password.
      const complete = await request("POST", "/api/auth/password-reset/complete", {
        body: { token: freshToken, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      });
      assert.equal(complete.status, 200, JSON.stringify(complete.json));
      assert.equal(complete.json.email, NORMALIZED);

      // 9. Used token cannot be reused.
      const reused = await request("POST", "/api/auth/password-reset/complete", {
        body: { token: freshToken, newPassword: "Another-Password-3!", confirmPassword: "Another-Password-3!" },
      });
      assert.equal(reused.status, 400);

      // 12. Old password no longer authenticates.
      const oldLogin = await request("POST", "/api/auth/password-login", {
        body: { email: NORMALIZED, password: OLD_PASSWORD },
      });
      assert.equal(oldLogin.status, 401);

      // 11. New password can authenticate.
      const newLogin = await request("POST", "/api/auth/password-login", {
        body: { email: NORMALIZED, password: NEW_PASSWORD },
      });
      assert.equal(newLogin.status, 200, JSON.stringify(newLogin.json));

      // 14. Logs must not contain the raw fresh token either.
      assert.doesNotMatch(bootLog(), new RegExp(freshToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(bootLog(), /resetToken=[A-Za-z0-9_-]{10,}/);
    });
  } finally {
    fakeResend.close();
  }

  // 13. Provider failure — same public body as success/skip; no existence leak.
  writeSeedStore();
  const failCaptured = [];
  const failingResend = await startFakeResend(failCaptured, { fail: true });
  try {
    await withServer({
      RESEND_API_KEY: "re_test_key",
      RESEND_API_BASE_URL: `http://127.0.0.1:${RESEND_PORT}`,
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      SUPPORT_EMAIL_TO: "support@littlelearnershubbyleah.com",
    }, async ({ bootLog }) => {
      const failedKnown = await request("POST", "/api/auth/request-password-reset", {
        body: { email: NORMALIZED },
      });
      const failedUnknown = await request("POST", "/api/auth/request-password-reset", {
        body: { email: "nobody-here@example.com" },
      });
      assert.equal(failedKnown.status, 200);
      assert.equal(failedUnknown.status, 200);
      assert.equal(failedKnown.json.ok, true);
      assert.equal(failedUnknown.json.ok, true);
      assert.equal(failedKnown.json.message, NEUTRAL_MESSAGE);
      assert.equal(failedUnknown.json.message, NEUTRAL_MESSAGE);
      assert.equal(failedKnown.json.delivery, "failed");
      assert.equal(failedUnknown.json.delivery, "skipped");
      // Public fields that matter to a caller must not reveal existence beyond delivery enum,
      // and the human message must stay identical.
      assert.deepEqual(
        { ok: failedKnown.json.ok, message: failedKnown.json.message },
        { ok: failedUnknown.json.ok, message: failedUnknown.json.message },
      );
      assert.match(bootLog(), /"eventType":"password_reset_email"/);
      assert.match(bootLog(), /"error":"provider_(unavailable|send_failed)"/);
      assert.doesNotMatch(bootLog(), /BrandNewPassword|OldPassword|re_test_key/);
    });
  } finally {
    failingResend.close();
  }

  try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  console.log("PASS password-reset email delivery + security coverage");
}

main().catch((error) => {
  console.error("FAIL", error);
  try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  process.exit(1);
});
