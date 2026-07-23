#!/usr/bin/env node
/**
 * Full authentication + account recovery audit.
 * Covers Free / Trial / Pro / Founding / Promo / Admin login,
 * password reset sync, case-insensitive email, disabled accounts,
 * sessions, and sticky mustChangePassword recovery after Firebase-style reset.
 *
 * Run: NODE_ENV=test node scripts/test-auth-recovery-audit.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.auth-recovery-audit-store-${process.pid}.json`);
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
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not become healthy");
}

function makeUser(email, overrides = {}) {
  const password = overrides.password || "Initial-Pass-99!";
  const { password: _pw, ...rest } = overrides;
  return {
    email,
    plan: "Free",
    subscriptionStatus: "Free",
    role: "owner",
    accountType: "home_daycare",
    serverPasswordAuth: true,
    passwordHash: hash(password),
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    ...rest,
  };
}

const ACCOUNT_TYPES = [
  {
    key: "free",
    email: "free.user@example.com",
    password: "Free-Pass-99!",
    user: (email, password) => makeUser(email, { password, plan: "Free", subscriptionStatus: "Free" }),
  },
  {
    key: "trial",
    email: "trial.user@example.com",
    password: "Trial-Pass-99!",
    user: (email, password) => makeUser(email, {
      password,
      plan: "Pro",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  },
  {
    key: "pro",
    email: "pro.user@example.com",
    password: "Pro-Pass-99!",
    user: (email, password) => makeUser(email, {
      password,
      plan: "Pro",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_test_pro",
    }),
  },
  {
    key: "founding",
    email: "founding.user@example.com",
    password: "Founding-Pass-99!",
    user: (email, password) => makeUser(email, {
      password,
      plan: "Founding",
      planDisplayName: "Founding Member",
      foundingMember: true,
      foundingMemberActive: true,
      foundingMemberHistorical: true,
      priceLock: "Lifetime",
      monthlyPrice: "$9.99/month",
      subscriptionStatus: "Founding Member Subscription Active",
    }),
  },
  {
    key: "promo",
    email: "promo.user@example.com",
    password: "Promo-Pass-99!",
    user: (email, password) => makeUser(email, {
      password,
      plan: "Pro",
      subscriptionStatus: "manual_access",
      promoAccess: true,
      manualAccess: true,
      accessSource: "promo",
    }),
  },
];

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const tempMod = fs.readFileSync(path.join(ROOT, "server/temp-password-auth.js"), "utf8");

  assert.match(serverJs, /function authAuditLog\(/);
  assert.match(serverJs, /\/api\/auth\/sync-password-after-firebase/);
  assert.match(serverJs, /password_login_attempt/);
  assert.match(serverJs, /firebase_password_sync_success/);
  assert.match(appJs, /syncPasswordAfterFirebaseAuth/);
  assert.match(appJs, /password_reset_email_sent/);
  assert.match(appJs, /password_reset_confirm_success/);
  assert.match(tempMod, /Expired temp must NOT permanently block/);
  console.log("PASS  auth recovery markers present");

  const users = {};
  for (const account of ACCOUNT_TYPES) {
    users[account.email] = account.user(account.email, account.password);
  }
  users["Disabled.User@Example.com".toLowerCase()] = makeUser("disabled.user@example.com", {
    password: "Disabled-Pass-99!",
    accountStatus: "disabled",
    disabled: true,
  });
  // Sticky recovery flags that previously blocked login after Firebase reset.
  users["stuck.reset@example.com"] = makeUser("stuck.reset@example.com", {
    password: "Old-Server-Pass-99!",
    mustChangePassword: true,
    tempPasswordHash: hash("Expired-Temp-99!"),
    tempPasswordIssuedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    tempPasswordExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    plan: "Pro",
    subscriptionStatus: "active",
  });

  fs.writeFileSync(STORE, JSON.stringify({
    users,
    foundingMembers: ["founding.user@example.com"],
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

    // --- Login works for every membership type ---
    for (const account of ACCOUNT_TYPES) {
      const login = await request("POST", "/api/auth/password-login", {
        body: { email: account.email, password: account.password },
      });
      assert.equal(login.status, 200, `${account.key} login: ${JSON.stringify(login.json)}`);
      assert.equal(login.json.mustChangePassword, false);
      assert.ok(login.json.memberSessionToken, `${account.key} missing session`);
      assert.match(serverLog, /password_login_success/);
      console.log(`PASS  ${account.key} login + session`);
    }

    // --- Case-insensitive email matching ---
    const caseLogin = await request("POST", "/api/auth/password-login", {
      body: { email: "Free.User@Example.COM", password: "Free-Pass-99!" },
    });
    assert.equal(caseLogin.status, 200, JSON.stringify(caseLogin.json));
    console.log("PASS  case-insensitive email login");

    // --- Helpful errors: bad password / missing account / disabled ---
    const badPw = await request("POST", "/api/auth/password-login", {
      body: { email: "free.user@example.com", password: "wrong-password" },
    });
    assert.equal(badPw.status, 401);
    assert.match(String(badPw.json.error || ""), /did not match/i);

    const missing = await request("POST", "/api/auth/password-login", {
      body: { email: "nobody@example.com", password: "whatever-99!" },
    });
    assert.equal(missing.status, 401);
    assert.match(String(missing.json.error || ""), /did not match/i);

    const disabled = await request("POST", "/api/auth/password-login", {
      body: { email: "disabled.user@example.com", password: "Disabled-Pass-99!" },
    });
    assert.equal(disabled.status, 403);
    assert.match(String(disabled.json.error || ""), /disabled/i);
    assert.match(serverLog, /account_disabled/);
    console.log("PASS  helpful auth errors (bad password / not found / disabled)");

    // --- Admin login ---
    const adminLogin = await request("POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.json));
    assert.ok(adminLogin.json.token);
    console.log("PASS  admin login");

    // --- Full recovery flow per account type:
    // login → forced/temp change OR firebase-style sync → new password works → old fails ---
    for (const account of ACCOUNT_TYPES) {
      const newPassword = `New-${account.key}-Pass-88!`;
      const sync = await request("POST", "/api/auth/sync-password-after-firebase", {
        body: {
          email: account.email,
          newPassword,
          source: "demo_password_reset",
        },
      });
      assert.equal(sync.status, 200, `${account.key} sync: ${JSON.stringify(sync.json)}`);
      assert.equal(sync.json.mustChangePassword, false);

      const storeAfter = JSON.parse(fs.readFileSync(STORE, "utf8"));
      const row = storeAfter.users[account.email];
      // Security fix: a freshly-written password hash must be the current secure
      // scrypt format, never a raw SHA-256 digest.
      assert.doesNotMatch(row.passwordHash, /^[0-9a-f]{64}$/i, `${account.key} password hash must not be a raw SHA-256 digest`);
      assert.match(row.passwordHash, /^scrypt\$/, `${account.key} password hash must use the secure scrypt format`);
      assert.equal(row.mustChangePassword, false);
      assert.ok(!row.tempPasswordHash);

      const oldLogin = await request("POST", "/api/auth/password-login", {
        body: { email: account.email, password: account.password },
      });
      assert.equal(oldLogin.status, 401, `${account.key} old password still worked`);

      const newLogin = await request("POST", "/api/auth/password-login", {
        body: { email: account.email, password: newPassword },
      });
      assert.equal(newLogin.status, 200, `${account.key} new login: ${JSON.stringify(newLogin.json)}`);
      assert.equal(newLogin.json.mustChangePassword, false);
      assert.ok(newLogin.json.memberSessionToken);

      // Plan / membership fields must survive password reset sync.
      if (account.key === "founding") {
        assert.equal(storeAfter.users[account.email].plan, "Founding");
        assert.equal(storeAfter.users[account.email].foundingMemberActive, true);
      }
      if (account.key === "pro") {
        assert.equal(storeAfter.users[account.email].plan, "Pro");
      }
      if (account.key === "promo") {
        assert.equal(storeAfter.users[account.email].manualAccess, true);
      }
      console.log(`PASS  ${account.key} reset → DB save → new login → old rejected`);
    }

    // --- Expired temp + sticky mustChangePassword must not block permanent hash ---
    const stuckEmail = "stuck.reset@example.com";
    const stuckOld = await request("POST", "/api/auth/password-login", {
      body: { email: stuckEmail, password: "Old-Server-Pass-99!" },
    });
    assert.equal(stuckOld.status, 200, JSON.stringify(stuckOld.json));
    assert.equal(stuckOld.json.mustChangePassword, false);
    const stuckStore = JSON.parse(fs.readFileSync(STORE, "utf8")).users[stuckEmail];
    assert.equal(stuckStore.mustChangePassword, false);
    assert.ok(!stuckStore.tempPasswordHash);
    assert.match(serverLog, /password_login_cleared_expired_temp|password_login_success/);
    console.log("PASS  expired temp no longer blocks permanent password login");

    // --- Firebase-style sync clears sticky recovery gate (Bearer test:) ---
    const stickyEmail = "free.user@example.com";
    const stickyStore = JSON.parse(fs.readFileSync(STORE, "utf8"));
    stickyStore.users[stickyEmail] = {
      ...stickyStore.users[stickyEmail],
      mustChangePassword: true,
      tempPasswordHash: hash("Temp-Sticky-99!"),
      tempPasswordExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    fs.writeFileSync(STORE, JSON.stringify(stickyStore, null, 2));

    const firebaseSync = await request("POST", "/api/auth/sync-password-after-firebase", {
      token: `test:${stickyEmail}`,
      body: { newPassword: "After-Firebase-Reset-77!", source: "firebase_password_reset" },
    });
    assert.equal(firebaseSync.status, 200, JSON.stringify(firebaseSync.json));
    assert.equal(firebaseSync.json.mustChangePassword, false);
    const afterSync = JSON.parse(fs.readFileSync(STORE, "utf8")).users[stickyEmail];
    assert.doesNotMatch(afterSync.passwordHash, /^[0-9a-f]{64}$/i, "password hash must not be a raw SHA-256 digest");
    assert.match(afterSync.passwordHash, /^scrypt\$/, "password hash must use the secure scrypt format");
    assert.equal(afterSync.mustChangePassword, false);
    assert.ok(!afterSync.tempPasswordHash);

    const afterLogin = await request("POST", "/api/auth/password-login", {
      body: { email: stickyEmail, password: "After-Firebase-Reset-77!" },
    });
    assert.equal(afterLogin.status, 200);
    assert.equal(afterLogin.json.mustChangePassword, false);
    console.log("PASS  firebase-style sync clears sticky mustChangePassword gate");

    // --- Duplicate email keys cannot exist under normalized store keys ---
    const dupStore = JSON.parse(fs.readFileSync(STORE, "utf8"));
    const emails = Object.keys(dupStore.users || {});
    const normalized = emails.map((e) => e.trim().toLowerCase());
    assert.equal(new Set(normalized).size, normalized.length, "duplicate normalized emails in store");
    console.log("PASS  no duplicate normalized email records");

    // --- Auth audit events logged (never plaintext passwords) ---
    assert.match(serverLog, /\[auth\] password_login_attempt/);
    assert.match(serverLog, /\[auth\] password_login_failed/);
    assert.match(serverLog, /\[auth\] firebase_password_sync_success/);
    assert.doesNotMatch(serverLog, /Free-Pass-99!/);
    assert.doesNotMatch(serverLog, /After-Firebase-Reset-77!/);
    console.log("PASS  detailed auth audit logs without password plaintext");

    console.log("\nAll auth recovery audit tests passed.");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
