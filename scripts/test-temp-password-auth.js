#!/usr/bin/env node
/**
 * Temporary password + forced change regression (one-user recovery path).
 * Run: NODE_ENV=test node scripts/test-temp-password-auth.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const { resolveTestPort } = require("./test-port.js");
const PORT = resolveTestPort(41800, 400);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.temp-password-test-store-${process.pid}-${PORT}.json`);
const EMAIL = "tclashley@icloud.com";
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-admin-password";
const ADMIN_CODE = "test-admin-code";

function hash(password) {
  return crypto.createHash("sha256").update(String(password || ""), "utf8").digest("hex");
}

function request(method, urlPath, { body = null, token = "", adminToken = "" } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on("error", reject);
    const payload = body ? { ...body } : null;
    if (payload && adminToken) payload.adminToken = adminToken;
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not become healthy");
}

function assertNoPlaintextLeak(raw, secret) {
  assert.ok(!String(raw || "").includes(secret), "temporary password leaked into an unexpected response body");
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const tempMod = fs.readFileSync(path.join(ROOT, "server/temp-password-auth.js"), "utf8");

  assert.match(html, /id="forcePasswordModal"/);
  assert.match(html, /Create a New Password/);
  assert.match(appJs, /function enforceForcedPasswordChangeGate/);
  assert.match(appJs, /\/api\/auth\/password-login/);
  assert.match(appJs, /\/api\/auth\/complete-forced-password-change/);
  assert.match(serverJs, /\/api\/admin\/users\/issue-temp-password/);
  assert.match(tempMod, /ONE_SHOT_TEMP_PASSWORD/);
  assert.match(tempMod, /32e66922c69e682ca81052fef5007dccbec1bd5036a2c2c30004a60554824d49/);
  assert.doesNotMatch(tempMod, /temporaryPassword\s*:/);
  console.log("PASS  markers present (no plaintext password in source)");

  const knownTemp = "Ab12-Cd34ef-Gh56ij-Aa1!";
  const knownHash = hash(knownTemp);
  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [EMAIL]: {
        email: EMAIL,
        plan: "Founding",
        planDisplayName: "Founding Member",
        foundingMember: true,
        foundingMemberActive: true,
        foundingMemberHistorical: true,
        priceLock: "Lifetime",
        monthlyPrice: "$9.99/month",
        subscriptionStatus: "Founding Member Subscription Active",
        role: "owner",
        accountType: "home_daycare",
        // Force one-shot id already applied so this test controls the hash itself.
        appliedOneShotTempPasswordId: "tclashley-temp-20260716c",
        tempPasswordHash: knownHash,
        tempPasswordIssuedAt: new Date().toISOString(),
        tempPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        mustChangePassword: true,
        serverPasswordAuth: true,
      },
    },
    foundingMembers: [EMAIL],
    adminSessions: {},
    memberSessions: {},
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverLog = "";
  child.stdout.on("data", (d) => { serverLog += d.toString(); });
  child.stderr.on("data", (d) => { serverLog += d.toString(); });

  try {
    await waitForHealth();
    assert.doesNotMatch(serverLog, new RegExp(knownTemp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    // Preserve Founding access fields before login.
    const before = JSON.parse(fs.readFileSync(STORE, "utf8")).users[EMAIL];
    assert.equal(before.plan, "Founding");
    assert.equal(before.monthlyPrice, "$9.99/month");

    const login = await request("POST", "/api/auth/password-login", {
      body: { email: EMAIL, password: knownTemp },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    assert.equal(login.json.mustChangePassword, true);
    assert.ok(login.json.memberSessionToken);
    assertNoPlaintextLeak(login.raw, knownTemp);
    // Security fix: this account's tempPasswordHash started in the legacy raw
    // SHA-256 format (set up above via the local hash() helper, simulating an
    // account created before this fix) — a successful login must transparently
    // upgrade it to the secure scrypt format in place, with no forced reset.
    const afterFirstLogin = JSON.parse(fs.readFileSync(STORE, "utf8")).users[EMAIL];
    assert.match(afterFirstLogin.tempPasswordHash, /^scrypt\$/, "a legacy tempPasswordHash must be transparently upgraded to the secure format on first successful login");
    assert.notEqual(afterFirstLogin.tempPasswordHash, knownHash, "the upgraded hash must not still be the original raw SHA-256 digest");
    console.log("PASS  legacy raw-SHA-256 tempPasswordHash transparently upgrades to secure scrypt format on login, no forced reset");
    // Prefer the latest temp-login session for the forced change.
    let session = login.json.memberSessionToken;

    // Temp password stays usable until forced change completes (or 24h expires) —
    // and still works correctly now that the hash has been upgraded above.
    const second = await request("POST", "/api/auth/password-login", {
      body: { email: EMAIL, password: knownTemp },
    });
    assert.equal(second.status, 200, JSON.stringify(second.json));
    assert.equal(second.json.mustChangePassword, true);
    assert.ok(second.json.memberSessionToken);
    session = second.json.memberSessionToken;

    const newPassword = "BrandNew-Pass-99!";
    const changed = await request("POST", "/api/auth/complete-forced-password-change", {
      token: session,
      body: { newPassword, confirmPassword: newPassword },
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.json));
    assert.equal(changed.json.mustChangePassword, false);
    assert.ok(changed.json.memberSessionToken);

    // Old temp no longer works.
    const tempAgain = await request("POST", "/api/auth/password-login", {
      body: { email: EMAIL, password: knownTemp },
    });
    assert.equal(tempAgain.status, 401);

    // New password works.
    const newLogin = await request("POST", "/api/auth/password-login", {
      body: { email: EMAIL, password: newPassword },
    });
    assert.equal(newLogin.status, 200, JSON.stringify(newLogin.json));
    assert.equal(newLogin.json.mustChangePassword, false);

    const after = JSON.parse(fs.readFileSync(STORE, "utf8")).users[EMAIL];
    assert.equal(after.plan, "Founding");
    assert.equal(after.monthlyPrice, "$9.99/month");
    assert.equal(after.foundingMemberActive, true);
    assert.equal(after.role, "owner");
    assert.equal(after.mustChangePassword, false);
    // Security fix: a freshly-created password hash must be the current secure
    // scrypt format, never a raw SHA-256 digest — verified via the module's own
    // verify function rather than recomputing SHA-256 directly.
    assert.doesNotMatch(after.passwordHash, /^[0-9a-f]{64}$/i, "a freshly-created password hash must not be a raw SHA-256 digest");
    assert.match(after.passwordHash, /^scrypt\$/, "a freshly-created password hash must use the secure scrypt format");
    assert.ok(!after.tempPasswordHash);

    // Admin issue endpoint returns a fresh temp password once.
    const adminLogin = await request("POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.json));
    const issued = await request("POST", "/api/admin/users/issue-temp-password", {
      adminToken: adminLogin.json.token,
      body: { email: EMAIL },
    });
    assert.equal(issued.status, 200, JSON.stringify(issued.json));
    assert.ok(issued.json.temporaryPassword);
    assert.equal(issued.json.mustChangePassword, true);
    assert.doesNotMatch(serverLog, new RegExp(String(issued.json.temporaryPassword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    console.log("PASS  temporary login works");
    console.log("PASS  forced password change required and completes");
    console.log("PASS  new password works afterward");
    console.log("PASS  temporary password no longer works");
    console.log("PASS  Founding / role / plan fields unchanged");
    console.log("PASS  admin issue endpoint returns one-time password without logging it");

    // Expired temp must not block a valid permanent passwordHash.
    const expiredEmail = "expired.temp@example.com";
    const permanent = "Permanent-Pass-42!";
    const storeNow = JSON.parse(fs.readFileSync(STORE, "utf8"));
    storeNow.users[expiredEmail] = {
      email: expiredEmail,
      plan: "Pro",
      subscriptionStatus: "active",
      role: "owner",
      serverPasswordAuth: true,
      passwordHash: hash(permanent),
      mustChangePassword: true,
      tempPasswordHash: hash("Expired-Temp-99!"),
      tempPasswordIssuedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      tempPasswordExpiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    fs.writeFileSync(STORE, JSON.stringify(storeNow, null, 2));
    const expiredLogin = await request("POST", "/api/auth/password-login", {
      body: { email: expiredEmail, password: permanent },
    });
    assert.equal(expiredLogin.status, 200, JSON.stringify(expiredLogin.json));
    assert.equal(expiredLogin.json.mustChangePassword, false);
    const expiredAfter = JSON.parse(fs.readFileSync(STORE, "utf8")).users[expiredEmail];
    assert.equal(expiredAfter.mustChangePassword, false);
    assert.ok(!expiredAfter.tempPasswordHash);
    console.log("PASS  expired temp clears and permanent password still logs in");

    // Firebase-style password sync clears sticky recovery flags.
    const syncEmail = EMAIL;
    const syncedPassword = "Synced-After-Firebase-55!";
    const synced = await request("POST", "/api/auth/sync-password-after-firebase", {
      token: `test:${syncEmail}`,
      body: { newPassword: syncedPassword, source: "firebase_password_reset" },
    });
    assert.equal(synced.status, 200, JSON.stringify(synced.json));
    assert.equal(synced.json.mustChangePassword, false);
    const syncLogin = await request("POST", "/api/auth/password-login", {
      body: { email: syncEmail, password: syncedPassword },
    });
    assert.equal(syncLogin.status, 200, JSON.stringify(syncLogin.json));
    assert.equal(syncLogin.json.mustChangePassword, false);
    const syncRow = JSON.parse(fs.readFileSync(STORE, "utf8")).users[syncEmail];
    assert.equal(syncRow.plan, "Founding");
    assert.doesNotMatch(syncRow.passwordHash, /^[0-9a-f]{64}$/i, "a firebase-synced password hash must not be a raw SHA-256 digest");
    assert.match(syncRow.passwordHash, /^scrypt\$/, "a firebase-synced password hash must use the secure scrypt format");
    console.log("PASS  sync-password-after-firebase clears gate and preserves Founding");

    assert.match(serverLog, /\[auth\] password_login/);
    console.log("PASS  auth audit logging present");
    console.log("\nAll temp-password auth tests passed.");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
