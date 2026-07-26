#!/usr/bin/env node
/**
 * Password-hashing security fix — regression suite.
 *
 * Plain SHA-256 (no salt, fast to brute-force offline) was previously used
 * for every password hash this app stores, including generated testing
 * passwords. This suite proves the fix end-to-end:
 *   1. Unit coverage of the new hashPassword()/verifyStoredPassword()
 *      functions in server/temp-password-auth.js (secure format, legacy
 *      backward-compat + transparent upgrade, tamper/malformed handling).
 *   2. Plaintext passwords are never written to the store file or to
 *      server logs, for both real accounts and testing-only fake accounts.
 *   3. Every password hash actually written by a real HTTP flow is the
 *      secure scrypt format, never a raw SHA-256 digest.
 *   4. Boot-time invalidation of any legacy-format fake-account hash, and
 *      that reissuing a password afterward works.
 *   5. Password reset and reissue continue to work.
 *   6. All 10 generated testing roles can still authenticate.
 *
 * Run: NODE_ENV=test node scripts/test-password-hash-security.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const tempPasswordAuth = require(path.join(ROOT, "server/temp-password-auth.js"));

const { resolveTestPort } = require("./test-port.js");
const PORT = resolveTestPort(25100, 300);
const STORE_PATH = path.join(os.tmpdir(), `llh-password-hash-security-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "pwhash-admin@example.invalid", password: "pwhash-admin-pass", code: "pwhash-admin-code" };

const RAW_SHA256_RE = /^[0-9a-f]{64}$/i;

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, raw: text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(storeContents, envOverrides = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(storeContents, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d.toString(); });
  child.stderr.on("data", (d) => { log += d.toString(); });
  child.__log = () => log;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`server exited before boot:\n${child.__log()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function readStoreFile() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

async function main() {
  // ---- 1. Unit coverage of hashPassword()/verifyStoredPassword() ---------
  {
    const secure = tempPasswordAuth.hashPassword("Correct-Horse-Battery-99!");
    assert.match(secure, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/, "hashPassword() must produce the self-describing secure format");
    assert.doesNotMatch(secure, RAW_SHA256_RE, "a secure hash must not also happen to look like a raw SHA-256 digest");
    assert.ok(tempPasswordAuth.isSecureHashFormat(secure));
    assert.ok(!tempPasswordAuth.isLegacySha256Format(secure));

    // Two hashes of the SAME password must differ (random salt per hash).
    const secure2 = tempPasswordAuth.hashPassword("Correct-Horse-Battery-99!");
    assert.notEqual(secure, secure2, "hashing the same password twice must produce different output (unique salt per hash)");

    const okRight = tempPasswordAuth.verifyStoredPassword("Correct-Horse-Battery-99!", secure);
    assert.equal(okRight.ok, true);
    assert.equal(okRight.upgradeHash, null, "verifying an already-secure hash must never propose an upgrade");

    const okWrong = tempPasswordAuth.verifyStoredPassword("wrong-password", secure);
    assert.equal(okWrong.ok, false);

    // Legacy format: verifies correctly AND proposes a secure upgrade.
    const legacy = tempPasswordAuth.hashPasswordSha256("Legacy-Password-42!");
    assert.match(legacy, RAW_SHA256_RE);
    const legacyVerify = tempPasswordAuth.verifyStoredPassword("Legacy-Password-42!", legacy);
    assert.equal(legacyVerify.ok, true, "a legacy raw-SHA-256 hash must still verify correctly (backward compatibility)");
    assert.match(legacyVerify.upgradeHash, /^scrypt\$/, "a successful legacy-format verification must propose a secure-format upgrade hash");
    const legacyWrongPw = tempPasswordAuth.verifyStoredPassword("not-it", legacy);
    assert.equal(legacyWrongPw.ok, false);
    assert.equal(legacyWrongPw.upgradeHash, null);

    // Tampering with a secure hash must not verify.
    const tampered = secure.slice(0, -4) + "0000";
    const tamperedVerify = tempPasswordAuth.verifyStoredPassword("Correct-Horse-Battery-99!", tampered);
    assert.equal(tamperedVerify.ok, false, "a tampered secure hash must never verify");

    // Malformed / empty / garbage values must fail closed, never throw.
    for (const bad of ["", null, undefined, "not-a-hash-at-all", "scrypt$not$numbers$here$zz$zz", "scrypt$16384$8$1$$"]) {
      const result = tempPasswordAuth.verifyStoredPassword("anything", bad);
      assert.equal(result.ok, false, `malformed stored hash ${JSON.stringify(bad)} must fail closed, not throw or verify`);
    }
    pass("1. hashPassword()/verifyStoredPassword() unit coverage: secure format, unique salts, legacy backward-compat + upgrade proposal, tamper rejection, malformed-input fail-closed");
  }

  // ---- 2. Boot-time invalidation of a legacy-format fake-account hash ----
  {
    const legacyHash = tempPasswordAuth.hashPasswordSha256("Old-Fake-Account-Pass-1!");
    const preSeeded = {
      users: {
        "legacy.fake@example.invalid": {
          email: "legacy.fake@example.invalid",
          testingAccount: true,
          fakeAccountId: "fakeacct_legacy_test",
          passwordHash: legacyHash,
          serverPasswordAuth: true,
          mustChangePassword: false,
        },
      },
      familyFoundation: {
        fakeAccounts: {
          fakeacct_legacy_test: {
            id: "fakeacct_legacy_test",
            organizationId: "org_legacy_fake_test",
            kind: "owner",
            email: "legacy.fake@example.invalid",
            passwordHash: legacyHash,
            testingOnly: true,
            active: true,
          },
        },
      },
      siteContent: { featureFlags: { testingLab: true, directorCenter: true } },
      adminSessions: {},
    };
    const child = startServer(preSeeded);
    try {
      await waitForBoot(child);
      // Give the boot-time migration (which runs during initializeStorage,
      // before the health check can even respond) a moment to have persisted.
      const afterBoot = readStoreFile();
      const fakeAccount = afterBoot.familyFoundation.fakeAccounts.fakeacct_legacy_test;
      const mirroredUser = afterBoot.users["legacy.fake@example.invalid"];
      assert.equal(fakeAccount.passwordHash, "", "a legacy-format fake-account password hash must be invalidated (cleared) at boot, not left reachable");
      assert.equal(mirroredUser.passwordHash, "", "the mirrored store.users row's legacy password hash must also be cleared at boot");
      assert.ok(fakeAccount.legacyPasswordHashInvalidatedAt, "the invalidation must be recorded, not silent");

      // The OLD password must no longer work.
      const oldLoginAttempt = await requestJson("POST", "/api/auth/password-login", { email: "legacy.fake@example.invalid", password: "Old-Fake-Account-Pass-1!" });
      assert.equal(oldLoginAttempt.status, 401, "the invalidated legacy password must no longer work");

      // Reissuing a fresh password must work (the safe migration path for fake accounts).
      const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
      const auth = { Authorization: `Bearer ${adminLogin.json.token}` };
      const reissue = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: "fakeacct_legacy_test" }, auth);
      assert.equal(reissue.status, 200, "reissuing a password for a previously-invalidated fake account must succeed");
      const newPassword = reissue.json.temporaryPassword;
      assert.ok(newPassword && newPassword.length >= 8);
      const newLogin = await requestJson("POST", "/api/auth/password-login", { email: "legacy.fake@example.invalid", password: newPassword });
      assert.equal(newLogin.status, 200, "logging in with the reissued password must succeed");
      const afterReissue = readStoreFile();
      assert.match(afterReissue.familyFoundation.fakeAccounts.fakeacct_legacy_test.passwordHash, /^scrypt\$/, "the reissued password hash must be the secure format");
      pass("2. A legacy-format fake-account password hash is invalidated at boot (never left reachable), and reissuing a fresh password afterward works end-to-end");
    } finally {
      await stopServer(child);
    }
  }

  // ---- 3-6: full onboard-everything flow, checked against the raw store --
  const child = startServer({ users: {}, siteContent: {}, adminSessions: {} });
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(adminLogin.status, 200);
    const auth = { Authorization: `Bearer ${adminLogin.json.token}` };

    const siteContentGet = await requestJson("GET", `/api/admin/site-content?adminToken=${adminLogin.json.token}`);
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: adminLogin.json.token,
      siteContent: { updatedAt: siteContentGet.json?.siteContent?.updatedAt || "", featureFlags: { testingLab: true } },
    });

    const onboard = await requestJson("POST", "/api/testing-lab/onboard-everything", {}, auth);
    assert.equal(onboard.status, 200, JSON.stringify(onboard.json));
    const logins = onboard.json.logins || onboard.json.accounts || [];
    assert.ok(logins.length >= 10, "onboard-everything must return logins for all 10+ required testing roles");

    // ---- 3. Every issued password hash is secure, never a raw SHA-256 digest, in the actual store file
    const store = readStoreFile();
    const fakeAccountRows = Object.values(store.familyFoundation?.fakeAccounts || {});
    let checkedHashes = 0;
    fakeAccountRows.forEach((row) => {
      if (!row.passwordHash) return;
      checkedHashes += 1;
      assert.doesNotMatch(row.passwordHash, RAW_SHA256_RE, `fake account ${row.email} (${row.kind}) password hash must not be a raw SHA-256 digest`);
      assert.match(row.passwordHash, /^scrypt\$/, `fake account ${row.email} (${row.kind}) password hash must use the secure scrypt format`);
    });
    assert.ok(checkedHashes >= 10, "expected at least 10 issued fake-account password hashes to check");
    pass(`3. Every one of ${checkedHashes} issued fake-account password hashes in the store file is the secure scrypt format, never a raw SHA-256 digest`);

    // ---- 4. No plaintext password anywhere in the store file or server logs
    const storeRaw = fs.readFileSync(STORE_PATH, "utf8");
    const serverLog = child.__log();
    for (const login of logins) {
      const plaintext = login.temporaryPassword || login.password;
      if (!plaintext) continue;
      assert.ok(!storeRaw.includes(plaintext), `plaintext password for ${login.email} must never appear anywhere in the store file`);
      assert.ok(!serverLog.includes(plaintext), `plaintext password for ${login.email} must never appear in server logs`);
    }
    pass("4. No plaintext password for any of the 10 issued testing accounts appears anywhere in the store file or in server stdout/stderr logs");

    // ---- 5. All 10 generated testing roles can authenticate ---------------
    let successfulLogins = 0;
    for (const login of logins) {
      const attempt = await requestJson("POST", "/api/auth/password-login", { email: login.email, password: login.temporaryPassword || login.password });
      assert.equal(attempt.status, 200, `${login.role || login.email} must be able to log in with her issued password (got ${attempt.status}: ${JSON.stringify(attempt.json)})`);
      successfulLogins += 1;
    }
    assert.ok(successfulLogins >= 10, "all 10 generated testing roles must be able to authenticate");
    pass(`5. All ${successfulLogins} generated testing roles authenticate successfully with the new secure password hashing`);

    // ---- 6. Password reset / reissue still works ---------------------------
    const dashboard = await requestJson("GET", "/api/testing-lab/dashboard", null, auth);
    const accounts = dashboard.json?.fakeAccounts || dashboard.json?.accounts || [];
    const anyAccount = accounts.find((a) => a.kind === "owner") || accounts[0];
    assert.ok(anyAccount, "expected at least one fake account for the reissue check");
    const firstIssue = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: anyAccount.id }, auth);
    assert.equal(firstIssue.status, 200);
    const firstPassword = firstIssue.json.temporaryPassword;
    const secondIssue = await requestJson("POST", "/api/testing-lab/accounts/issue-password", { accountId: anyAccount.id }, auth);
    assert.equal(secondIssue.status, 200);
    const secondPassword = secondIssue.json.temporaryPassword;
    assert.notEqual(firstPassword, secondPassword, "reissuing must generate a genuinely new password, not repeat the previous one");
    const oldStillWorks = await requestJson("POST", "/api/auth/password-login", { email: anyAccount.email, password: firstPassword });
    assert.equal(oldStillWorks.status, 401, "the PREVIOUS issued password must stop working once a new one has been issued");
    const newWorks = await requestJson("POST", "/api/auth/password-login", { email: anyAccount.email, password: secondPassword });
    assert.equal(newWorks.status, 200, "the NEWLY reissued password must work");
    pass("6. Reissuing a fake account's password generates a genuinely new password, invalidates the previous one, and the new one works — the safe migration path for testing accounts remains functional");

    pass("all password-hashing security checks passed");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\nPassword-hashing security checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
