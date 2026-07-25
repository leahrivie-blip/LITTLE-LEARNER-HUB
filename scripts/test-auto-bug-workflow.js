#!/usr/bin/env node
/**
 * Automated testing-only bug workflow — unit + HTTP integration checks.
 *
 * Covers: sanitize/dedupe bug records, eligibility stop conditions, owner
 * report, ingest API, admin list, verification reopen, production lock.
 * Never touches production hosts or real childcare data.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 25100 + Math.floor(Math.random() * 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-auto-bug-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = { email: "abug-admin@example.invalid", password: "abug-admin-pass", code: "abug-admin-code" };

const model = require("./auto-bug-data-model.js");
const { classifyEligibility, evaluateInvestigationStop, investigationPlaybook, ELIGIBILITY } = require("./auto-bug-eligibility.js");
const { buildOwnerReportMarkdown } = require("./auto-bug-owner-report.js");

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...headers,
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function spawnServer(envOverrides = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: { featureFlags: { testingLab: true } }, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
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
      LLH_GIT_SHA: "deadbeefauto01",
      NODE_ENV: "test",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited early");
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

async function adminToken() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  const token = res.json?.token || res.json?.adminToken || "";
  assert.ok(token, `admin login token (status ${res.status})`);
  return token;
}

function unitChecks() {
  const store = { autoBugs: { records: {} } };
  const first = model.ingestFailure(store, {
    errorType: "browser_exception",
    message: "TypeError: x is null Bearer secret-token for admin@x.com",
    page: "/daily-care?token=abc",
    role: "staff",
    device: "phone",
    deployedCommit: "abc123",
    sanitizedStack: "Error\n    at /Users/leah/app.js:10\n    at https://x.test/app.js?token=1:20",
    fakeOrganizationId: "org_fake_a",
    source: "browser",
  });
  assert.equal(first.created, true);
  assert.doesNotMatch(first.record.message, /secret-token/);
  assert.doesNotMatch(first.record.message, /admin@x\.com/);
  assert.doesNotMatch(first.record.sanitizedStack, /Users\/leah/);
  assert.doesNotMatch(first.record.sanitizedStack, /token=1/);
  assert.equal(first.record.frequency, 1);
  pass("unit: sanitize + create bug record");

  const second = model.ingestFailure(store, {
    errorType: "browser_exception",
    message: "TypeError: x is null Bearer other for other@x.com",
    page: "/daily-care?token=zzz",
    role: "staff",
    device: "tablet",
    deployedCommit: "abc123",
    fakeOrganizationId: "org_fake_b",
    source: "browser",
  });
  assert.equal(second.created, false);
  assert.equal(second.record.id, first.record.id);
  assert.equal(second.record.frequency, 2);
  assert.equal(second.record.affectsMultipleUsers, true);
  pass("unit: dedupe + multi-user frequency");

  const eligible = classifyEligibility({
    errorType: "failed_api",
    message: "API 500 for /api/health",
    page: "health",
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.code, ELIGIBILITY.ELIGIBLE_TECHNICAL);
  const stopStripe = classifyEligibility({
    errorType: "failed_api",
    message: "Stripe checkout session failed",
    page: "billing",
  });
  assert.equal(stopStripe.eligible, false);
  assert.equal(stopStripe.code, ELIGIBILITY.STOP_EXTERNAL_SERVICES);
  const stopRuntime = evaluateInvestigationStop({ requiresPermissionChange: true });
  assert.equal(stopRuntime.stop, true);
  pass("unit: eligibility + stop conditions");

  const md = buildOwnerReportMarkdown(first.record, {
    rootCause: "Null child grid row",
    whatChanged: "Guard null row before render",
    draftPrUrl: "https://github.com/example/pr/1",
    riskLevel: "low",
  });
  assert.match(md, /Approve merge to testing\?/);
  assert.match(md, /What broke/i);
  assert.match(md, /Null child grid row/);
  pass("unit: owner report markdown");

  const playbook = investigationPlaybook();
  assert.equal(playbook.neverMerge, true);
  assert.equal(playbook.neverDeploy, true);
  assert.equal(playbook.targetPrBase, "testing/full-platform-integration-2026-07");
  assert.ok(playbook.hardLimits.some((line) => /Never merge automatically/i.test(line)));
  pass("unit: investigation playbook limits");

  model.attachVerification(store, first.record.id, {
    ok: false,
    originalErrorGone: false,
    smokeOk: false,
    newCriticalErrors: false,
    deployedCommit: "abc123",
    expectedCommit: "abc123",
  });
  assert.equal(model.getRecord(store, first.record.id).status, model.STATUSES.REOPENED);
  pass("unit: failed verification reopens bug");
}

async function httpChecks() {
  const child = spawnServer();
  try {
    await waitForBoot(child);
    pass("http: server boot");

    const cfg = await requestJson("GET", "/api/auto-bugs/client-config");
    assert.equal(cfg.status, 200);
    assert.equal(cfg.json?.enabled, true);
    assert.equal(cfg.json?.intake, "/api/auto-bugs/ingest");
    pass("http: client-config enabled on testing host");

    const ingest1 = await requestJson("POST", "/api/auto-bugs/ingest", {
      errorType: "console_error",
      message: "Boom Bearer tok_abc for parent@example.com",
      page: "messages",
      role: "parent",
      deviceBrowser: "computer",
      sanitizedStack: "Error: Boom\n at app.js:1",
      fakeOrganizationId: "org_fake_http_1",
    });
    assert.ok([200, 201].includes(ingest1.status), `ingest status ${ingest1.status}`);
    assert.equal(ingest1.json?.ok, true);
    assert.doesNotMatch(ingest1.json?.record?.message || "", /tok_abc/);
    assert.doesNotMatch(ingest1.json?.record?.message || "", /parent@example\.com/);
    const bugId = ingest1.json.record.id;
    pass("http: ingest sanitizes and creates record");

    const ingest2 = await requestJson("POST", "/api/auto-bugs/ingest", {
      errorType: "console_error",
      message: "Boom Bearer tok_abc for parent@example.com",
      page: "messages",
      role: "parent",
      deviceBrowser: "phone",
      fakeOrganizationId: "org_fake_http_2",
    });
    assert.equal(ingest2.json?.created, false);
    assert.equal(ingest2.json?.record?.id, bugId);
    assert.ok(ingest2.json.record.frequency >= 2);
    pass("http: ingest dedupes");

    const denied = await requestJson("GET", "/api/auto-bugs");
    assert.equal(denied.status, 401);
    pass("http: list requires admin");

    const token = await adminToken();
    const listed = await requestJson("GET", "/api/auto-bugs", null, { Authorization: `Bearer ${token}` });
    assert.equal(listed.status, 200);
    assert.ok(listed.json.records.some((row) => row.id === bugId));
    pass("http: admin list");

    const got = await requestJson("GET", `/api/auto-bugs/${bugId}`, null, { Authorization: `Bearer ${token}` });
    assert.equal(got.status, 200);
    assert.match(got.json.issueBody || "", /Automated testing bug/);
    assert.match(got.json.ownerReportMarkdown || "", /Approve merge to testing/);
    pass("http: get issue body + owner report");

    const inv = await requestJson("POST", `/api/auto-bugs/${bugId}/investigation`, {
      branchName: "cursor/auto-bug-demo-1ab6",
      rootCause: "Null guard missing",
      whatChanged: "Added null check",
      testResults: "npm run test:auto-bug-workflow PASS",
      draftPrUrl: "https://github.com/example/pull/999",
      riskLevel: "low",
      beforeScreenshot: "docs/screenshots/auto-bug/before.png",
      afterScreenshot: "docs/screenshots/auto-bug/after.png",
    }, { Authorization: `Bearer ${token}` });
    assert.equal(inv.status, 200);
    assert.equal(inv.json.record.status, "fix_ready");
    pass("http: investigation → fix_ready");

    const report = await requestJson("POST", `/api/auto-bugs/${bugId}/owner-report`, {
      whatBroke: "Messages page threw a console error",
      whoItAffects: "Parent testers on messages",
      rootCause: "Null guard missing",
      whatChanged: "Added null check",
      testResults: "focused + release tests passed",
      draftPrUrl: "https://github.com/example/pull/999",
      riskLevel: "low",
    }, { Authorization: `Bearer ${token}` });
    assert.equal(report.status, 200);
    assert.equal(report.json.approveQuestion, "Approve merge to testing?");
    pass("http: owner report");

    const badVerify = await requestJson("POST", `/api/auto-bugs/${bugId}/verification`, {
      ok: false,
      originalErrorGone: false,
      newCriticalErrors: true,
      smokeOk: false,
      deployedCommit: "deadbeefauto01",
      expectedCommit: "deadbeefauto01",
    }, { Authorization: `Bearer ${token}` });
    assert.equal(badVerify.status, 200);
    assert.equal(badVerify.json.reopened, true);
    assert.equal(badVerify.json.record.status, "reopened");
    pass("http: failed verification reopens");

    const stopInv = await requestJson("POST", `/api/auto-bugs/${bugId}/investigation`, {
      stopContext: { requiresProductOrLayoutDecision: true },
      rootCause: "Unclear layout preference",
    }, { Authorization: `Bearer ${token}` });
    assert.equal(stopInv.json.record.status, "needs_owner");
    assert.equal(stopInv.json.stop.stop, true);
    pass("http: investigation stop → needs_owner");

    // Production lock: restart with production SITE_URL
  } finally {
    await stopServer(child);
  }

  const prodChild = spawnServer({
    SITE_URL: "https://littlelearnershubbyleah.com",
  });
  try {
    // Production SITE_URL may still boot; intake must refuse.
    await waitForBoot(prodChild);
    const prodCfg = await requestJson("GET", "/api/auto-bugs/client-config");
    assert.equal(prodCfg.status, 403);
    const prodIngest = await requestJson("POST", "/api/auto-bugs/ingest", {
      errorType: "browser_exception",
      message: "should not store",
      page: "home",
    });
    assert.equal(prodIngest.status, 403);
    pass("http: production lock rejects auto-bug intake");
  } finally {
    await stopServer(prodChild);
  }
}

async function main() {
  unitChecks();
  await httpChecks();
  console.log(`\nAutomated bug workflow checks passed (${passed}).`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
