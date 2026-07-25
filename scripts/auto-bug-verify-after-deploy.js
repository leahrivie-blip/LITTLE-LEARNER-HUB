#!/usr/bin/env node
/**
 * Post-deploy verification for an automated bug fix (testing host only).
 *
 * After the owner approves and deploys to testing:
 *   1. Confirm the exact deployed commit
 *   2. Run deployed-site smoke (or readiness if skip)
 *   3. Confirm the original sanitized error fingerprint no longer occurs
 *   4. Confirm no new critical auto-bug records appeared
 *   5. Mark the bug verified — or automatically reopen on failure
 *
 * Never merges, never deploys, never touches production/main.
 *
 * Env:
 *   LLH_AUTO_BUG_ID                 required — bug record id
 *   LLH_TESTING_SMOKE_URL           testing host
 *   LLH_TESTING_SMOKE_EXPECTED_SHA  required — must match live /api/build-version
 *   LLH_TESTING_SMOKE_ADMIN_*       admin credentials for verification API + smoke
 *   LLH_AUTO_BUG_FINGERPRINT        optional override of expected fingerprint
 *   LLH_AUTO_BUG_SKIP_SMOKE=1       skip live smoke (still checks commit + API)
 */
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BASE = String(process.env.LLH_TESTING_SMOKE_URL || "https://little-learner-hub-testing.onrender.com").replace(/\/$/, "");
const BUG_ID = String(process.env.LLH_AUTO_BUG_ID || "").trim();
const EXPECTED_SHA = String(process.env.LLH_TESTING_SMOKE_EXPECTED_SHA || "").trim();
const ADMIN = {
  email: process.env.LLH_TESTING_SMOKE_ADMIN_EMAIL || "",
  password: process.env.LLH_TESTING_SMOKE_ADMIN_PASSWORD || "",
  code: process.env.LLH_TESTING_SMOKE_ADMIN_CODE || "",
};
const SKIP_SMOKE = String(process.env.LLH_AUTO_BUG_SKIP_SMOKE || "") === "1";

const PRODUCTION_HOST_BLOCKLIST = [
  "littlelearnershubbyleah.com",
  "www.littlelearnershubbyleah.com",
  "little-learner-hub.onrender.com",
];

function assertTestingHost(urlString) {
  const host = new URL(urlString).hostname.toLowerCase();
  if (PRODUCTION_HOST_BLOCKLIST.includes(host)) {
    throw new Error(`Refusing production host "${host}".`);
  }
  if (/^littlelearnershub/i.test(host) && !/testing/i.test(host)) {
    throw new Error(`Refusing non-testing brand host "${host}".`);
  }
  return host;
}

async function fetchJson(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text };
}

async function adminLogin() {
  const res = await fetchJson("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    }),
  });
  const token = res.json?.token || res.json?.adminToken || "";
  if (!token) throw new Error("Admin login failed for verification.");
  return token;
}

function runSmoke() {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "test:deployed-testing-smoke"], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function main() {
  if (!BUG_ID) throw new Error("LLH_AUTO_BUG_ID is required.");
  if (!EXPECTED_SHA) throw new Error("LLH_TESTING_SMOKE_EXPECTED_SHA is required.");
  if (!ADMIN.email || !ADMIN.password || !ADMIN.code) {
    throw new Error("LLH_TESTING_SMOKE_ADMIN_EMAIL/PASSWORD/CODE are required.");
  }
  assertTestingHost(BASE);

  const version = await fetchJson("/api/build-version");
  const deployedSha = String(version.json?.gitSha || version.json?.sha || "").trim();
  assert.ok(deployedSha, "deployed commit missing from /api/build-version");
  assert.equal(deployedSha, EXPECTED_SHA, `deployed commit ${deployedSha} !== expected ${EXPECTED_SHA}`);
  console.log(`PASS  Deployed commit matches ${deployedSha.slice(0, 12)}`);

  let smokeOk = true;
  if (SKIP_SMOKE) {
    console.log("SKIP  Live smoke (LLH_AUTO_BUG_SKIP_SMOKE=1)");
  } else {
    smokeOk = await runSmoke();
    console.log(smokeOk ? "PASS  Deployed smoke" : "FAIL  Deployed smoke");
  }

  const token = await adminLogin();
  const bugRes = await fetchJson(`/api/auto-bugs/${encodeURIComponent(BUG_ID)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(bugRes.status, 200, "bug record fetch failed");
  const record = bugRes.json?.record;
  assert.ok(record, "bug record missing");
  const fingerprint = String(process.env.LLH_AUTO_BUG_FINGERPRINT || record.fingerprint || "").trim();

  const listRes = await fetchJson("/api/auto-bugs?limit=50", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const recent = listRes.json?.records || [];
  const sameFingerprintRecent = recent.filter((row) => row.fingerprint === fingerprint
    && row.id !== BUG_ID
    && Date.parse(row.lastSeenAt || 0) > Date.now() - 15 * 60 * 1000);
  const newCritical = recent.filter((row) => row.id !== BUG_ID
    && ["browser_exception", "server_exception", "app_boot_timeout", "database_failure", "deployed_smoke_failure"].includes(row.errorType)
    && Date.parse(row.firstSeenAt || 0) > Date.now() - 15 * 60 * 1000);

  const originalErrorGone = sameFingerprintRecent.length === 0;
  const newCriticalErrors = newCritical.length > 0;
  const ok = smokeOk && originalErrorGone && !newCriticalErrors && deployedSha === EXPECTED_SHA;

  const verifyRes = await fetchJson(`/api/auto-bugs/${encodeURIComponent(BUG_ID)}/verification`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ok,
      deployedCommit: deployedSha,
      expectedCommit: EXPECTED_SHA,
      originalErrorGone,
      newCriticalErrors,
      smokeOk,
      notes: ok
        ? "Post-deploy verification passed."
        : `Verification failed. smokeOk=${smokeOk} originalErrorGone=${originalErrorGone} newCriticalErrors=${newCriticalErrors}`,
      reopenReason: ok ? "" : "Post-deploy verification failed — issue automatically reopened.",
    }),
  });

  assert.equal(verifyRes.status, 200, "verification update failed");
  const status = verifyRes.json?.record?.status;
  if (!ok) {
    console.error("FAIL  Verification — bug reopened:", verifyRes.json?.message || status);
    process.exitCode = 1;
    return;
  }
  console.log("PASS  Verification — bug marked verified");
  console.log("Reminder: this script never merges or deploys.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
