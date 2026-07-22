#!/usr/bin/env node
"use strict";

/**
 * Phase 18 Testing and Preview Lab focused suite.
 * Fake data only. No passwords logged. No Stripe/email/SMS/push/live AI.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./testing-lab-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase18-admin@example.com";
const ADMIN_PASSWORD = "Phase18TestingLab!99";
const ADMIN_CODE = "phase18-lab-code";
const BASE = "/api/testing-lab";

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) return reject(new Error("Server health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function baseStore() {
  return {
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: true,
        [EXPANSION_FEATURE_KEYS.TESTING_LAB]: true,
      },
    },
  };
}

async function startServer({ env = {} } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-tl-phase18-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9800 + Math.floor(Math.random() * 400);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: env.SITE_URL || "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: env.ALLOW_TESTING_LAB_ADMIN_PREVIEW ?? "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitForHealth(port);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr}`);
  }
  return { port, child, storePath, stderr: () => stderr };
}

async function stopServer(ctx) {
  if (!ctx?.child) return;
  ctx.child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    ctx.child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function adminLogin(port) {
  const res = await request(port, "POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(res.status, 200);
  return res.body.token;
}

function auth(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

async function run() {
  {
    assert.match(model.TESTING_BANNER, /Private Testing Environment/i);
    assert.ok(model.scenarioCatalog().length >= 6);
    assert.ok(model.FEATURE_STATES.includes("past_due_fake_invoice"));
    assert.ok(model.DEVICE_PRESETS.large_phone);
    assert.equal(model.isExampleInvalidEmail("a@example.invalid"), true);
    assert.equal(model.isExampleInvalidEmail("a@gmail.com"), false);
    pass("unit_catalog_banner");
  }

  {
    const ctx = await startServer({
      env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true" },
    });
    try {
      const token = await adminLogin(ctx.port);
      const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
      assert.equal(status.status, 403);
      pass("production_rejection");
    } finally {
      await stopServer(ctx);
    }
  }

  {
    const ctx = await startServer({ env: { ALLOW_TESTING_LAB_ADMIN_PREVIEW: "false" } });
    try {
      const token = await adminLogin(ctx.port);
      const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
      assert.equal(status.status, 403);
      pass("missing_env_enablement");
    } finally {
      await stopServer(ctx);
    }
  }

  const ctx = await startServer();
  try {
    const token = await adminLogin(ctx.port);

    const noAuth = await request(ctx.port, "GET", `${BASE}/status`);
    assert.equal(noAuth.status, 403);
    pass("non_admin_denial");

    const queryTok = await request(ctx.port, "GET", `${BASE}/status?adminToken=${encodeURIComponent(token)}`);
    assert.equal(queryTok.status, 403);
    assert.equal(queryTok.body.code, "query_admin_token_rejected");
    pass("query_token_rejection");

    const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.phase, 18);
    assert.equal(status.body.featureMarker, "phase18-testing-lab");
    assert.match(status.body.testingBanner || "", /Fake Data Only/i);
    assert.equal(status.body.noPasswordsInResponses, true);
    pass("lab_status");

    const seed = await request(ctx.port, "POST", `${BASE}/seed`, {
      headers: auth(token),
      body: { scenario: "small_center", reset: true },
    });
    assert.equal(seed.status, 200, JSON.stringify(seed.body));
    assert.ok(seed.body.organizationId);
    assert.ok(seed.body.fakeAccountCount >= 5);
    assert.equal(seed.body.noPasswordsIncluded, true);
    pass("scenario_seed");

    const dash = await request(ctx.port, "GET", `${BASE}/dashboard`, { headers: auth(token) });
    assert.equal(dash.status, 200);
    assert.equal(dash.body.featureMarker, "phase18-testing-lab");
    assert.ok((dash.body.accounts || []).length >= 5);
    assert.ok((dash.body.scenarios || []).length >= 6);
    assert.ok(dash.body.devices.desktop);
    pass("dashboard_accounts_scenarios");

    const account = (dash.body.accounts || []).find((a) => a.kind === "owner") || dash.body.accounts[0];
    assert.ok(account);
    assert.match(account.email, /@example\.invalid$/);
    const issued = await request(ctx.port, "POST", `${BASE}/accounts/issue-password`, {
      headers: auth(token),
      body: { accountId: account.id, forceChange: true },
    });
    assert.equal(issued.status, 200);
    assert.ok(issued.body.temporaryPassword);
    assert.equal(issued.body.displayedOnce, true);
    // Password must not appear in audit or store plaintext
    const storeAfter = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const auditBlob = JSON.stringify(storeAfter.testingLab.audit);
    assert.ok(!auditBlob.includes(issued.body.temporaryPassword));
    assert.ok(!JSON.stringify(storeAfter.familyFoundation.fakeAccounts).includes(issued.body.temporaryPassword));
    pass("fake_password_issued_not_logged");

    const preview = await request(ctx.port, "POST", `${BASE}/role-preview/start`, {
      headers: auth(token),
      body: { targetKind: "director" },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.preview.doesNotChangeStoredAdminRole, true);
    assert.ok(preview.body.preview.expiresAt);
    const exit = await request(ctx.port, "POST", `${BASE}/role-preview/exit`, {
      headers: auth(token),
      body: { previewId: preview.body.preview.id },
    });
    assert.equal(exit.status, 200);
    pass("role_preview_start_exit");

    const device = await request(ctx.port, "POST", `${BASE}/device`, {
      headers: auth(token),
      body: { device: "large_phone" },
    });
    assert.equal(device.status, 200);
    assert.equal(device.body.deviceSession.preset.width, 430);
    pass("device_preview");

    const flags = await request(ctx.port, "POST", `${BASE}/flags`, {
      headers: auth(token),
      body: { directorCenter: true, formsCenter: true, familyHub: true, testingLab: true },
    });
    assert.equal(flags.status, 200);
    assert.equal(flags.body.storedFlags.testingLab, true);
    assert.ok(flags.body.policy.productionLocked === false);
    pass("feature_flag_controls");

    const note = await request(ctx.port, "POST", `${BASE}/checklist/note`, {
      headers: auth(token),
      body: { checklistItem: "billing", status: "pass", body: "Manual pass note" },
    });
    assert.equal(note.status, 200);
    pass("checklist_note");

    const resetPreview = await request(ctx.port, "POST", `${BASE}/reset`, {
      headers: auth(token),
      body: { confirm: false },
    });
    assert.equal(resetPreview.status, 400);
    assert.equal(resetPreview.body.code, "confirmation_required");
    const reset = await request(ctx.port, "POST", `${BASE}/reset`, {
      headers: auth(token),
      body: { confirm: true, organizationId: seed.body.organizationId },
    });
    assert.equal(reset.status, 200);
    pass("reset_requires_confirm");

    const badReset = await request(ctx.port, "POST", `${BASE}/reset`, {
      headers: auth(token),
      body: { confirm: true, organizationId: "prod_live_customer_org" },
    });
    assert.equal(badReset.status, 403);
    pass("real_target_rejected");

    {
      const ui = fs.readFileSync(path.join(ROOT, "testing-lab-ui.js"), "utf8");
      const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
      assert.match(ui, /phase18-testing-lab/);
      assert.match(ui, /phase18-device-preview/);
      assert.match(css, /\.tl-panel/);
      assert.match(css, /@media \(max-width: 480px\)/);
      assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1024px\)/);
      assert.match(css, /@media \(min-width: 1280px\)/);
      pass("responsive_markers");
    }

    const billing = await request(ctx.port, "GET", "/api/director-center/billing/status", { headers: auth(token) });
    assert.equal(billing.status, 200);
    const staff = await request(ctx.port, "GET", "/api/director-center/staff-experience/status", { headers: auth(token) });
    assert.equal(staff.status, 200);
    pass("phase1_17_regression_smoke");
  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 18 focused suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
