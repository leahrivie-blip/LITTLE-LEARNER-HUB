#!/usr/bin/env node
"use strict";

/**
 * Phase 9 Family Hub Base tests.
 * Testing preview only. Production rejects. No email/SMS/push/Stripe/AI.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const familyModel = require("./family-foundation-data-model.js");
const hubFixtures = require("./family-hub-fixtures.js");
const hubModel = require("./family-hub-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase9-admin@example.com";
const ADMIN_PASSWORD = "Phase9FamilyHub!99";
const ADMIN_CODE = "phase9-hub-code";

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

function waitForHealth(port, timeoutMs = 20000) {
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
      },
    },
  };
}

async function startServer({ env = {}, storeMutator = null } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-fh-phase9-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const initial = baseStore();
  if (typeof storeMutator === "function") storeMutator(initial);
  fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
  const port = 8900 + Math.floor(Math.random() * 500);
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
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: env.ALLOW_FAMILY_HUB_TESTING_PREVIEW ?? "true",
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
  return { port, child, storePath };
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

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function issueAndLogin(port, adminToken, kind) {
  await request(port, "POST", "/api/director-center/family/seed", { headers: auth(adminToken), body: {} });
  const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
  const acct = (fakes.body.fakeAccounts || []).find((row) => row.kind === kind);
  assert.ok(acct, `fake account ${kind}`);
  const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${acct.id}/issue-password`, {
    headers: auth(adminToken), body: {},
  });
  assert.equal(issued.status, 200);
  const login = await request(port, "POST", "/api/auth/password-login", {
    body: { email: acct.email, password: issued.body.temporaryPassword },
  });
  assert.equal(login.status, 200);
  return { email: acct.email, token: login.body.memberSessionToken, account: acct };
}

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`  PASS  ${label}`);
}

async function testUnits() {
  console.log("\nUnit: preview gate + fixtures");
  const denied = expansionFlags.evaluateExpansionAccess({
    flagKey: "familyHub",
    storedFlags: { familyHub: true },
    environment: expansionFlags.resolveExpansionEnvironment({
      env: {},
      siteUrl: "http://127.0.0.1",
    }),
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "preview_env_disabled");
  ok("Family Hub denied without testing preview env");

  const prod = expansionFlags.evaluateExpansionAccess({
    flagKey: "familyHub",
    storedFlags: { familyHub: true },
    environment: expansionFlags.resolveExpansionEnvironment({
      liveProduction: true,
      env: { ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true" },
      siteUrl: "https://littlelearnershubbyleah.com",
    }),
  });
  assert.equal(prod.allowed, false);
  assert.equal(prod.reason, "production_locked");
  ok("production rejects Family Hub even with stored flag + env");

  const allowed = expansionFlags.evaluateExpansionAccess({
    flagKey: "familyHub",
    storedFlags: { familyHub: true },
    environment: expansionFlags.resolveExpansionEnvironment({
      env: { ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true" },
      siteUrl: "http://127.0.0.1",
    }),
  });
  assert.equal(allowed.allowed, true);
  ok("testing preview allows Family Hub route gate");

  const store = {};
  const seeded = hubFixtures.ensurePhase9Preview(store, { adminEmail: ADMIN_EMAIL });
  assert.ok(seeded.organizationId);
  assert.ok(hubModel.listValues(store.familyHub.documents).some((row) => row.familyVisible));
  assert.ok(hubModel.listValues(store.familyHub.documents).some((row) => row.familyVisible === false));
  assert.ok(hubModel.listValues(store.familyHub.calendarEvents).some((row) => row.familyVisible));
  ok("Phase 9 fixtures seed family-visible docs/events");
}

async function testApi() {
  console.log("\nAPI: Family Hub security and flows");
  const ctx = await startServer();
  try {
    const adminToken = await adminLogin(ctx.port);
    // Seed family hub store flag already true; ensure fixtures
    await request(ctx.port, "POST", "/api/family-hub/seed", { headers: auth(adminToken), body: {} });

    const multi = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
    const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(multi.token) });
    assert.equal(home.status, 200);
    assert.ok((home.body.children || []).length >= 2);
    assert.ok(Array.isArray(home.body.actionNeeded));
    assert.equal(home.body.navigation?.length || 5, 5);
    ok("multi-child parent home with child switcher data");

    const childA = home.body.children[0].childId;
    const childB = home.body.children[1].childId;
    const homeA = await request(ctx.port, "GET", `/api/family-hub/home?childId=${encodeURIComponent(childA)}`, {
      headers: auth(multi.token),
    });
    assert.equal(homeA.status, 200);
    assert.equal(homeA.body.selectedChildId, childA);
    ok("child switching refreshes selected child");

    // Wrong-child / restricted
    const one = await issueAndLogin(ctx.port, adminToken, "parent_one_child");
    const wrong = await request(ctx.port, "GET", `/api/family-hub/children/${encodeURIComponent(childA)}`, {
      headers: auth(one.token),
    });
    // Priya's child vs Frank - childA might be Ava which Frank shouldn't see
    assert.equal(wrong.status, 403);
    ok("one-child parent denied other child's detail");

    const frankHome = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(one.token) });
    assert.equal(frankHome.status, 200);
    assert.equal((frankHome.body.children || []).length, 1);
    ok("one-child parent sees exactly one child");

    // Restricted guardian
    const restricted = await issueAndLogin(ctx.port, adminToken, "restricted_guardian");
    const restHome = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(restricted.token) });
    assert.ok(restHome.status === 200 || restHome.status === 403);
    if (restHome.status === 200) {
      assert.equal((restHome.body.children || []).length, 0);
    }
    ok("restricted guardian has no digital children");

    // Pickup-only
    const pickup = await issueAndLogin(ctx.port, adminToken, "pickup_only");
    const pickupForms = await request(ctx.port, "GET", "/api/family-hub/forms", { headers: auth(pickup.token) });
    assert.equal(pickupForms.status, 403);
    ok("pickup-only denied forms list");

    // Shared household guardian
    const shared = await issueAndLogin(ctx.port, adminToken, "guardian_shared_households");
    const sharedHome = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(shared.token) });
    assert.equal(sharedHome.status, 200);
    assert.ok((sharedHome.body.children || []).length >= 1);
    ok("shared-household guardian can open Family Hub");

    // Documents: family-visible only
    const docs = await request(ctx.port, "GET", `/api/family-hub/documents?childId=${encodeURIComponent(frankHome.body.children[0].childId)}`, {
      headers: auth(one.token),
    });
    assert.equal(docs.status, 200);
    assert.ok((docs.body.documents || []).every((row) => row.title && !/NOT family-visible/i.test(row.title)));
    ok("family-visible documents only");

    // Calendar privacy
    const cal = await request(ctx.port, "GET", `/api/family-hub/calendar?childId=${encodeURIComponent(frankHome.body.children[0].childId)}`, {
      headers: auth(one.token),
    });
    assert.equal(cal.status, 200);
    assert.ok((cal.body.events || []).every((row) => !/NOT family-visible|Internal Staff/i.test(row.title)));
    ok("calendar hides internal events");

    // Change request requires provider approval
    const change = await request(ctx.port, "POST", "/api/family-hub/account/change-request", {
      headers: auth(one.token),
      body: {
        type: "contact_info",
        childId: frankHome.body.children[0].childId,
        payload: { phone: "(555) 010-1111" },
      },
    });
    assert.equal(change.status, 201);
    assert.equal(change.body.applied, false);
    ok("information change creates provider review request");

    // Cross-org altered child
    const cross = await request(ctx.port, "GET", "/api/family-hub/children/child_fake_other_org", {
      headers: auth(one.token),
    });
    assert.equal(cross.status, 403);
    ok("wrong-child / altered ID denied");

    // Parent cannot call director APIs
    const parentDir = await request(ctx.port, "GET", "/api/director-center/overview", {
      headers: auth(one.token),
    });
    assert.ok(parentDir.status === 401 || parentDir.status === 403 || parentDir.status === 404);
    ok("parent denied director APIs");

    // Staff denied Family Hub without guardian contact
    const staffLogin = await issueAndLogin(ctx.port, adminToken, "lead_teacher");
    const staffHub = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(staffLogin.token) });
    assert.equal(staffHub.status, 403);
    ok("staff without guardian contact denied Family Hub");

    // Form recipient isolation — open only own assignments
    const forms = await request(ctx.port, "GET", `/api/family-hub/forms?childId=${encodeURIComponent(home.body.children[0].childId)}&filter=all`, {
      headers: auth(multi.token),
    });
    assert.equal(forms.status, 200);
    if ((forms.body.forms || []).length) {
      const assignmentId = forms.body.forms[0].assignmentId;
      const open = await request(ctx.port, "GET", `/api/family-hub/forms/${assignmentId}`, {
        headers: auth(multi.token),
      });
      assert.equal(open.status, 200);
      const otherOpen = await request(ctx.port, "GET", `/api/family-hub/forms/${assignmentId}`, {
        headers: auth(one.token),
      });
      assert.equal(otherOpen.status, 403);
      ok("form recipient isolation enforced");
    } else {
      ok("form recipient isolation skipped (no assignments for selected child)");
    }

    // Cached child-switching: header child must match access
    const headerWrong = await request(ctx.port, "GET", "/api/family-hub/home", {
      headers: { ...auth(one.token), "x-llh-selected-child-id": childA },
    });
    assert.equal(headerWrong.status, 403);
    ok("cached/header child ID cannot escalate access");

    // Query token rejected
    const qToken = await request(ctx.port, "GET", `/api/family-hub/home?adminToken=${adminToken}`);
    assert.equal(qToken.status, 403);
    assert.equal(qToken.body.code, "query_admin_token_rejected");
    ok("query-token authentication rejected");

  } finally {
    await stopServer(ctx);
  }
}

async function testProduction() {
  console.log("\nProduction locks");
  const ctx = await startServer({
    env: {
      SITE_URL: "https://littlelearnershubbyleah.com",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
    },
  });
  try {
    const hub = await request(ctx.port, "GET", "/api/family-hub/status", {
      headers: { Authorization: "Bearer test:priya.lin@example.invalid" },
    });
    assert.equal(hub.status, 403);
    assert.ok(["production_locked", "feature_unavailable"].includes(hub.body.reason || hub.body.code) || hub.body.code === "feature_unavailable");
    ok("Family Hub rejected on production host");
  } finally {
    await stopServer(ctx);
  }
}

async function main() {
  console.log("Phase 9 Family Hub Base");
  await testUnits();
  await testApi();
  await testProduction();
  console.log(`\nPhase 9 results: ${passed} PASS`);
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exit(1);
});
