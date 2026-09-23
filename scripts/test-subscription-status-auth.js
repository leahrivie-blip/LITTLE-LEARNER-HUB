#!/usr/bin/env node
/**
 * Auth gate for GET /api/subscription-status?email=
 * Run: NODE_ENV=test node scripts/test-subscription-status-auth.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(5200, 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-sub-status-auth-${crypto.randomBytes(4).toString("hex")}.json`);
const SELF = "self.user@example.com";
const OTHER = "other.user@example.com";
const ADMIN = {
  email: "substatus-admin@test.local",
  password: "substatus-admin-pass",
  code: "substatus-admin-code",
};

function request(method, urlPath, { headers = {}, body = null } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [SELF]: {
        email: SELF,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        name: "Self User",
        featureUsage: { secret_signal: 1 },
        attribution: { source: "test" },
      },
      [OTHER]: {
        email: OTHER,
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
        monthlyPrice: "$19.99/month",
        name: "Other User",
        featureUsage: { should_not_leak: 99 },
      },
    },
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitHealth(child) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for health");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 250));
  if (child.exitCode === null) child.kill("SIGKILL");
}

function assertNoSensitivePayload(json) {
  assert.equal(json?.subscription, undefined);
  assert.equal(json?.aiUsage, undefined);
  assert.equal(json?.founding, undefined);
  assert.ok(!json?.featureUsage);
  assert.ok(!String(JSON.stringify(json || {})).includes("should_not_leak"));
  assert.ok(!String(JSON.stringify(json || {})).includes("secret_signal"));
}

async function main() {
  const child = startServer();
  try {
    await waitHealth(child);

    const unauth = await request("GET", `/api/subscription-status?email=${encodeURIComponent(SELF)}`);
    assert.equal(unauth.status, 401, `unauth expected 401 got ${unauth.status} ${unauth.text}`);
    assertNoSensitivePayload(unauth.json);
    assert.match(String(unauth.json?.error || ""), /sign in/i);

    const unauthOther = await request("GET", `/api/subscription-status?email=${encodeURIComponent(OTHER)}`);
    assert.equal(unauthOther.status, 401);
    assertNoSensitivePayload(unauthOther.json);

    const selfOk = await request("GET", `/api/subscription-status?email=${encodeURIComponent(SELF)}`, {
      headers: {
        Authorization: `Bearer test:${SELF}`,
        "x-llh-user-email": SELF,
      },
    });
    assert.equal(selfOk.status, 200, JSON.stringify(selfOk.json));
    assert.equal(selfOk.json.email, SELF);
    assert.equal(selfOk.json.subscription?.email || SELF, SELF);
    assert.equal(selfOk.json.subscription?.hasProAccess, false);

    // Spoof: header alone must never authorize (even in NODE_ENV=test).
    const spoofHeaderOnly = await request("GET", `/api/subscription-status?email=${encodeURIComponent(OTHER)}`, {
      headers: { "x-llh-user-email": OTHER },
    });
    assert.ok([401, 403].includes(spoofHeaderOnly.status), `header-only spoof expected 401/403 got ${spoofHeaderOnly.status}`);
    assertNoSensitivePayload(spoofHeaderOnly.json);

    // Spoof: forged/missing Bearer with only a spoofed email header.
    const spoofForgedBearer = await request("GET", `/api/subscription-status?email=${encodeURIComponent(OTHER)}`, {
      headers: {
        Authorization: "Bearer forged-not-a-real-token",
        "x-llh-user-email": OTHER,
      },
    });
    assert.ok([401, 403].includes(spoofForgedBearer.status), `forged bearer spoof expected 401/403 got ${spoofForgedBearer.status}`);
    assertNoSensitivePayload(spoofForgedBearer.json);

    // Conflicting verified token vs x-llh-user-email header.
    const conflict = await request("GET", `/api/subscription-status?email=${encodeURIComponent(SELF)}`, {
      headers: {
        Authorization: `Bearer test:${SELF}`,
        "x-llh-user-email": OTHER,
      },
    });
    assert.equal(conflict.status, 403, JSON.stringify(conflict.json));
    assertNoSensitivePayload(conflict.json);

    const cross = await request("GET", `/api/subscription-status?email=${encodeURIComponent(OTHER)}`, {
      headers: {
        Authorization: `Bearer test:${SELF}`,
        "x-llh-user-email": SELF,
      },
    });
    assert.equal(cross.status, 403, JSON.stringify(cross.json));
    assertNoSensitivePayload(cross.json);
    assert.ok(!String(JSON.stringify(cross.json || {})).includes("Other User"));

    const adminLogin = await request("POST", "/api/admin/login", {
      body: { email: ADMIN.email, password: ADMIN.password, code: ADMIN.code },
    });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.json));
    const token = adminLogin.json.token;
    assert.ok(token);

    const adminLookup = await request("GET", `/api/subscription-status?email=${encodeURIComponent(OTHER)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(adminLookup.status, 200, JSON.stringify(adminLookup.json));
    assert.equal(adminLookup.json.email, OTHER);
    assert.equal(adminLookup.json.subscription?.hasProAccess, true);

    console.log("PASS  subscription-status auth gate");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
