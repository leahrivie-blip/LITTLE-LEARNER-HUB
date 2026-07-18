#!/usr/bin/env node
/**
 * Email system regression (safer port):
 * - Resend API base URL override is available for tests
 * - SendGrid/Postmark remain present as non-auth fallbacks
 * - Auth-link email is fail-closed until Resend + verified domain are ready
 * - When Resend is ready: password reset + verification link flows work end-to-end
 * - Signup does NOT auto-send verification (deferred; engagement gating preserved)
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const RESEND_PORT = 4410 + Math.floor(Math.random() * 50);
const STORE = path.join(os.tmpdir(), `llh-email-audit-${crypto.randomBytes(4).toString("hex")}.json`);
const EMAIL = "email-audit@example.com";

let APP_PORT = 4310 + Math.floor(Math.random() * 50);
let BASE = `http://127.0.0.1:${APP_PORT}`;

function request(method, urlPath, { body = null } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {};
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
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("App server did not become healthy");
}

async function startFakeResend(captured) {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/emails") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      captured.push({
        headers: req.headers,
        body: JSON.parse(raw || "{}"),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: `re_${Date.now()}` }));
    });
  });
  await new Promise((resolve) => server.listen(RESEND_PORT, "127.0.0.1", resolve));
  return server;
}

function latestEmail(captured, subjectContains) {
  return [...captured].reverse().find((item) => String(item.body?.subject || "").includes(subjectContains));
}

async function waitForEmail(captured, subjectContains, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = latestEmail(captured, subjectContains);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

function extractResetToken(bodyHtml = "", textBody = "") {
  const source = `${bodyHtml}\n${textBody}`;
  const match = source.match(/resetToken=([A-Za-z0-9_\-]+)/);
  return match?.[1] || "";
}

function extractVerificationToken(bodyHtml = "", textBody = "") {
  const textMatch = String(textBody || "").match(/\/api\/auth\/verify-email\?token=([A-Za-z0-9_\-]+)/);
  if (textMatch?.[1]) return textMatch[1];
  const source = String(bodyHtml || "").replace(/&amp;/g, "&");
  const match = source.match(/\/api\/auth\/verify-email\?token=([A-Za-z0-9_\-]+)/);
  return match?.[1] || "";
}

function spawnApp(envExtra = {}) {
  APP_PORT = 4310 + Math.floor(Math.random() * 200);
  BASE = `http://127.0.0.1:${APP_PORT}`;
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(APP_PORT),
      LLH_STORE_PATH: STORE,
      SITE_URL: BASE,
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
      EMAIL_AUTOMATIONS_ENABLED: "false",
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
    await fn({ bootLog });
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /RESEND_API_BASE_URL/);
  assert.match(serverJs, /SENDGRID_API_KEY/);
  assert.match(serverJs, /POSTMARK_SERVER_TOKEN/);
  assert.match(serverJs, /transactionalAuthEmailReady/);
  assert.match(fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), /firebaseAuthEnabled/);
  assert.match(fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), /request-password-reset/);

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [EMAIL]: {
        email: EMAIL,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        passwordHash: crypto.createHash("sha256").update("OldPassword-1!", "utf8").digest("hex"),
        serverPasswordAuth: true,
        emailVerified: false,
      },
    },
    siteContent: {},
    adminSessions: {},
    memberSessions: {},
  }, null, 2));

  // --- Fail-closed without Resend ---
  await withServer({
    RESEND_API_KEY: "",
    SENDGRID_API_KEY: "",
    POSTMARK_SERVER_TOKEN: "",
    SUPPORT_EMAIL_FROM: "",
    SUPPORT_EMAIL_TO: "",
  }, async () => {
    const blocked = await request("POST", "/api/auth/request-password-reset", {
      body: { email: EMAIL },
    });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.json.delivery, "not_ready");
  });

  const captured = [];
  const fakeResend = await startFakeResend(captured);

  try {
    await withServer({
      RESEND_API_KEY: "re_test_key",
      RESEND_API_BASE_URL: `http://127.0.0.1:${RESEND_PORT}`,
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      SUPPORT_EMAIL_TO: "support@littlelearnershubbyleah.com",
    }, async ({ bootLog }) => {
      const missingUser = await request("POST", "/api/auth/request-password-reset", {
        body: { email: "missing@example.com" },
      });
      assert.equal(missingUser.status, 200);
      assert.equal(captured.length, 0, "missing users should not send emails");

      const firstReset = await request("POST", "/api/auth/request-password-reset", {
        body: { email: EMAIL },
      });
      assert.equal(firstReset.status, 200, JSON.stringify(firstReset.json));
      assert.equal(firstReset.json.delivery, "sent");
      const resetMail1 = latestEmail(captured, "Reset your Little Learner Hub password");
      assert.ok(resetMail1, "password reset email should be sent");
      assert.equal(resetMail1.body.from, "Little Learner Hub <support@littlelearnershubbyleah.com>");
      assert.deepEqual(resetMail1.body.to, [EMAIL]);
      const token1 = extractResetToken(resetMail1.body.html, resetMail1.body.text);
      assert.ok(token1, "first reset token should exist in email");

      const verify1 = await request("GET", `/api/auth/password-reset/verify?token=${encodeURIComponent(token1)}`);
      assert.equal(verify1.status, 200, JSON.stringify(verify1.json));
      assert.equal(verify1.json.email, EMAIL);

      const secondReset = await request("POST", "/api/auth/request-password-reset", {
        body: { email: EMAIL },
      });
      assert.equal(secondReset.status, 200, JSON.stringify(secondReset.json));
      const resetMail2 = latestEmail(captured, "Reset your Little Learner Hub password");
      const token2 = extractResetToken(resetMail2.body.html, resetMail2.body.text);
      assert.ok(token2 && token2 !== token1, "second reset should invalidate the first token");

      const staleVerify = await request("GET", `/api/auth/password-reset/verify?token=${encodeURIComponent(token1)}`);
      assert.equal(staleVerify.status, 400);

      const changed = await request("POST", "/api/auth/password-reset/complete", {
        body: { token: token2, newPassword: "BrandNewPassword-2!", confirmPassword: "BrandNewPassword-2!" },
      });
      assert.equal(changed.status, 200, JSON.stringify(changed.json));

      const reused = await request("POST", "/api/auth/password-reset/complete", {
        body: { token: token2, newPassword: "Another-Password-3!", confirmPassword: "Another-Password-3!" },
      });
      assert.equal(reused.status, 400, "used tokens must be invalid");

      const oldLogin = await request("POST", "/api/auth/password-login", {
        body: { email: EMAIL, password: "OldPassword-1!" },
      });
      assert.equal(oldLogin.status, 401);

      const newLogin = await request("POST", "/api/auth/password-login", {
        body: { email: EMAIL, password: "BrandNewPassword-2!" },
      });
      assert.equal(newLogin.status, 200, JSON.stringify(newLogin.json));

      // Explicit verification request (not auto on signup)
      const beforeSignupMailCount = captured.length;
      const signupSync = await request("POST", "/api/account/profile", {
        body: {
          email: "signup-verify@example.com",
          signup: true,
          firstName: "Signup",
          lastName: "Verify",
          lastLogin: true,
        },
      });
      assert.equal(signupSync.status, 200, JSON.stringify(signupSync.json));
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(
        captured.filter((m) => String(m.body?.subject || "").includes("Verify your Little Learner Hub email")).length,
        0,
        "signup must not auto-send verification while EMAIL_AUTOMATIONS_ENABLED is off / deferred",
      );
      assert.equal(captured.length, beforeSignupMailCount, "signup should not send auth verification mail");

      const verifyReq = await request("POST", "/api/auth/send-verification-email", {
        body: { email: "signup-verify@example.com" },
      });
      assert.equal(verifyReq.status, 200, JSON.stringify(verifyReq.json));
      assert.equal(verifyReq.json.delivery, "sent");
      const verifyMail = await waitForEmail(captured, "Verify your Little Learner Hub email");
      assert.ok(verifyMail, "verification email should be sent on explicit request");
      const verifyToken = extractVerificationToken(verifyMail.body.html, verifyMail.body.text);
      assert.ok(verifyToken, "verification token should exist in the email body");

      const verifyRes = await request("GET", `/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`);
      assert.equal(verifyRes.status, 302);
      assert.match(String(verifyRes.headers.location || ""), /emailVerification=success/);

      const store = JSON.parse(fs.readFileSync(STORE, "utf8"));
      assert.equal(store.users["signup-verify@example.com"]?.emailVerified, true);
      assert.equal(store.users[EMAIL]?.serverPasswordAuth, true);
      assert.ok(store.users[EMAIL]?.passwordHash);
      assert.match(bootLog, /Server running|Little Learner Hub/i);

      console.log("PASS  fail-closed when Resend is not configured");
      console.log("PASS  SendGrid/Postmark remain in codebase");
      console.log("PASS  password reset request sends a real reset-link email payload");
      console.log("PASS  first reset token becomes invalid after a newer request");
      console.log("PASS  reset completion updates the password and old links cannot be reused");
      console.log("PASS  signup does not auto-send verification; explicit verify works");
      console.log("\nAll email-system audit tests passed.");
    });
  } finally {
    fakeResend.close();
    try { fs.unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
