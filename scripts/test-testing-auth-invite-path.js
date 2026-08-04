#!/usr/bin/env node
/**
 * Testing-site auth + invite honesty checks.
 * Verifies local-primary auth mode, outbound-email disabled messaging,
 * manual password-reset links, and tester invite copyable links (no fake email).
 *
 * Run: npm run test:testing-auth-invite-path
 */
"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PORT = 4217 + (process.pid % 200);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.testing-auth-invite-store-${process.pid}.json`);
const SITE_URL = "https://little-learner-hub-testing.onrender.com";
const ADMIN_EMAIL = "leahivie@icloud.com";
const ADMIN_PASSWORD = "TestingAuthInvite!234";
const ADMIN_CODE = "testing-auth-99";
const TESTER_EMAIL = "invite.tester@example.com";
const USER_EMAIL = "local.user@example.com";
const USER_PASSWORD = "Local-Pass-99!";

function hash(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function request(method, urlPath, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      `${BASE}${urlPath}`,
      {
        method,
        headers: {
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": payload.length }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let json = {};
          try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
          resolve({ status: res.statusCode, json, raw, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

async function main() {
  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [USER_EMAIL]: {
        email: USER_EMAIL,
        plan: "Pro",
        subscriptionStatus: "active",
        role: "teacher",
        accountType: "home_daycare",
        serverPasswordAuth: true,
        passwordHash: hash(USER_PASSWORD),
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      },
    },
    foundingMembers: [],
    adminSessions: {},
    memberSessions: {},
    hdhTesterInvites: {},
  }, null, 2));

  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      FIREBASE_API_KEY: "",
      FIREBASE_AUTH_DOMAIN: "",
      FIREBASE_PROJECT_ID: "",
      FIREBASE_APP_ID: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      EMAIL_AUTOMATIONS_ENABLED: "false",
      HOME_DAYCARE_HUB_TESTING: "true",
      SITE_URL,
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
      DATABASE_PROVIDER: "local-json",
      RESEND_API_KEY: "",
      SENDGRID_API_KEY: "",
      POSTMARK_SERVER_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let failed = 0;
  const pass = (id, detail = "") => console.log(`PASS ${id}${detail ? ` — ${detail}` : ""}`);
  const fail = (id, detail = "") => {
    failed += 1;
    console.error(`FAIL ${id}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    await waitForHealth(child);

    const cfg = await request("GET", "/api/client-config.js");
    assert.equal(cfg.status, 200);
    assert.match(cfg.raw, /authMode["']?\s*:\s*["']local["']/);
    assert.match(cfg.raw, /outboundEmail/);
    assert.match(cfg.raw, /disabled["']?\s*:\s*true/);
    pass("client-config-local-auth");

    const reset = await request("POST", "/api/auth/request-password-reset", {
      body: { email: USER_EMAIL },
    });
    assert.equal(reset.status, 200, reset.raw);
    assert.equal(reset.json.delivery, "manual_link");
    assert.ok(reset.json.resetUrl, "expected resetUrl");
    assert.ok(String(reset.json.resetUrl).startsWith(SITE_URL), `resetUrl must use SITE_URL: ${reset.json.resetUrl}`);
    assert.ok(!/firebase|resend|not configured/i.test(String(reset.json.message || "")));
    assert.equal(reset.json.outboundEmailDisabled, true);
    pass("password-reset-manual-link", reset.json.delivery);

    const unknownReset = await request("POST", "/api/auth/request-password-reset", {
      body: { email: "nobody-on-testing@example.com" },
    });
    assert.equal(unknownReset.status, 200);
    assert.notEqual(unknownReset.json.delivery, "sent");
    pass("password-reset-unknown-no-fake-sent", unknownReset.json.delivery || "none");

    const invite = await request("POST", "/api/home-daycare-hub/tester-invites", {
      headers: {
        Authorization: `Bearer test:${ADMIN_EMAIL}`,
        "X-LLH-User-Email": ADMIN_EMAIL,
      },
      body: {
        email: TESTER_EMAIL,
        childName: "Invite Demo Child",
        appOrigin: "https://evil-production.example.com",
      },
    });
    assert.equal(invite.status, 200, invite.raw);
    assert.equal(invite.json.email?.sent, false);
    assert.equal(invite.json.outboundEmailDisabled, true);
    assert.ok(invite.json.acceptUrl);
    assert.ok(String(invite.json.acceptUrl).startsWith(SITE_URL), `invite must use SITE_URL: ${invite.json.acceptUrl}`);
    assert.ok(!String(invite.json.acceptUrl).includes("evil-production"));
    assert.match(String(invite.json.message || ""), /email delivery is off|copy the invite link/i);
    assert.ok(invite.json.instructions);
    pass("tester-invite-manual-link");

    // Browser: load client-config in isolation (full homepage can hang on SW/third-party).
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (url.includes("/api/client-config.js") || url.startsWith(BASE)) {
          return route.continue();
        }
        return route.abort();
      });
      await page.setContent(
        `<!doctype html><html><body><script src="${BASE}/api/client-config.js"></script></body></html>`,
        { waitUntil: "domcontentloaded", timeout: 20000 },
      );
      await page.waitForFunction(() => typeof window.LLH_CONFIG === "object", null, { timeout: 15000 });
      const authMode = await page.evaluate(() => window.LLH_CONFIG?.authMode);
      assert.equal(authMode, "local");
      pass("browser-authMode-local");

      const outboundDisabled = await page.evaluate(() => window.LLH_CONFIG?.outboundEmail?.disabled === true);
      assert.equal(outboundDisabled, true);
      pass("browser-outbound-email-disabled");

      const appJs = await request("GET", `/app.js?v=test-${Date.now()}`);
      assert.equal(appJs.status, 200);
      assert.match(appJs.raw, /isLocalAuthPrimary/);
      assert.match(appJs.raw, /Local-primary testing path/);
      pass("app-js-local-primary-path");

      const loginStart = Date.now();
      const login = await request("POST", "/api/auth/password-login", {
        body: { email: USER_EMAIL, password: USER_PASSWORD },
      });
      const loginMs = Date.now() - loginStart;
      assert.equal(login.status, 200, login.raw);
      if (loginMs > 2000) fail("server-password-login-fast", `${loginMs}ms`);
      else pass("server-password-login-fast", `${loginMs}ms`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    fail("suite", error.stack || error.message);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll testing auth/invite path checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
