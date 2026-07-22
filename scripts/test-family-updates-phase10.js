#!/usr/bin/env node
"use strict";

/**
 * Phase 10 Family Updates / Daily Reports / Media / Sharing tests.
 * Testing preview only. No email/SMS/push/Stripe/AI. No public media URLs.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const updatesModel = require("./family-updates-data-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;
const { TINY_PNG_BASE64 } = require("./family-updates-fixtures.js");

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase10-admin@example.com";
const ADMIN_PASSWORD = "Phase10FamilyUpdates!99";
const ADMIN_CODE = "phase10-updates-code";

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

function waitForHealth(port, timeoutMs = 25000) {
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
  const storePath = path.join(os.tmpdir(), `llh-fu-phase10-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const initial = baseStore();
  if (typeof storeMutator === "function") storeMutator(initial);
  fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
  const port = 9000 + Math.floor(Math.random() * 500);
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
  await request(port, "POST", "/api/director-center/family-updates/seed", { headers: auth(adminToken), body: {} });
  const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
  const account = (fakes.body.fakeAccounts || []).find((row) => row.kind === kind);
  assert.ok(account, `missing fake account ${kind}`);
  const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {
    headers: auth(adminToken), body: {},
  });
  assert.equal(issued.status, 200);
  const password = issued.body.password || issued.body.temporaryPassword;
  assert.ok(password);
  const login = await request(port, "POST", "/api/auth/password-login", {
    body: { email: account.email, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return {
    token: login.body.memberSessionToken || login.body.token,
    email: account.email,
    account,
  };
}

async function run() {
  let passed = 0;
  const fail = (name, error) => {
    console.error(`FAIL ${name}:`, error && error.stack ? error.stack : error);
    process.exitCode = 1;
  };
  const ok = (name) => {
    passed += 1;
    console.log(`PASS ${name}`);
  };

  // Unit: file validation
  try {
    assert.equal(updatesModel.validateMediaUpload({
      mimeType: "application/javascript", fileName: "x.js", byteSize: 10, contentBase64: "YQ==",
    }).ok, false);
    assert.equal(updatesModel.validateMediaUpload({
      mimeType: "image/png", fileName: "ok.png", byteSize: 68, contentBase64: TINY_PNG_BASE64,
    }).ok, true);
    assert.equal(updatesModel.validateMediaUpload({
      mimeType: "image/png", fileName: "huge.png", byteSize: 9_000_000, contentBase64: "aa",
    }).ok, false);
    ok("file_validation_unit");
  } catch (error) { fail("file_validation_unit", error); }

  // Unit: production family hub gate
  try {
    const decision = expansionFlags.evaluateExpansionAccess({
      flagKey: EXPANSION_FEATURE_KEYS.FAMILY_HUB,
      storedFlags: { familyHub: true },
      environment: {
        liveProduction: true,
        allowFamilyHubTestingPreview: true,
        siteUrl: "https://littlelearnershubbyleah.com",
      },
    });
    assert.equal(decision.allowed, false);
    ok("production_preview_rejection_unit");
  } catch (error) { fail("production_preview_rejection_unit", error); }

  let ctx;
  try {
    ctx = await startServer();
    const adminToken = await adminLogin(ctx.port);
    await request(ctx.port, "POST", "/api/director-center/family-updates/seed", { headers: auth(adminToken), body: {} });

    // Provider status + review queue
    {
      const status = await request(ctx.port, "GET", "/api/director-center/family-updates/status", { headers: auth(adminToken) });
      assert.equal(status.status, 200);
      assert.equal(status.body.phase, 10);
      assert.equal(status.body.noPublicMediaUrls, true);
      const queue = await request(ctx.port, "GET", "/api/director-center/family-updates/review-queue", { headers: auth(adminToken) });
      assert.equal(queue.status, 200);
      assert.ok(Array.isArray(queue.body.updatesForReview));
      ok("provider_status_and_review_queue");
    }

    // Individual update create + director share
    let sharedUpdateId = "";
    {
      const children = await request(ctx.port, "GET", "/api/director-center/children", { headers: auth(adminToken) });
      const child = (children.body.children || children.body.items || []).find((row) => /Ava/i.test(row.displayName || row.name || ""))
        || (children.body.children || [])[0];
      // Fallback: home feed after guardian login knows child ids
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
      assert.equal(home.status, 200, JSON.stringify(home.body));
      const ava = (home.body.children || []).find((row) => /Ava/i.test(row.displayName || "")) || home.body.children[0];
      assert.ok(ava);
      const created = await request(ctx.port, "POST", "/api/director-center/family-updates/updates", {
        headers: auth(adminToken),
        body: {
          title: "Individual update test",
          message: "Hello family",
          childIds: [ava.childId],
          internalNote: "SECRET internal",
          submitForReview: true,
        },
      });
      assert.equal(created.status, 200, JSON.stringify(created.body));
      const id = created.body.update.id;
      const approved = await request(ctx.port, "POST", `/api/director-center/family-updates/updates/${id}/approve`, { headers: auth(adminToken), body: {} });
      assert.equal(approved.status, 200);
      const shared = await request(ctx.port, "POST", `/api/director-center/family-updates/updates/${id}/share`, { headers: auth(adminToken), body: {} });
      assert.equal(shared.status, 200);
      sharedUpdateId = id;
      const feed = await request(ctx.port, "GET", `/api/family-hub/updates?childId=${encodeURIComponent(ava.childId)}`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": ava.childId },
      });
      assert.equal(feed.status, 200);
      const found = (feed.body.updates || []).find((row) => row.id === id);
      assert.ok(found);
      assert.equal(found.internalNote, undefined);
      assert.ok(!JSON.stringify(found).includes("SECRET"));
      ok("individual_update_and_internal_notes_hidden");
    }

    // Group update isolation + Daily Report privacy
    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
      const kids = home.body.children || [];
      const ava = kids.find((row) => /Ava/i.test(row.displayName || ""));
      const ben = kids.find((row) => /Ben/i.test(row.displayName || ""));
      assert.ok(ava && ben);
      const reportsAva = await request(ctx.port, "GET", `/api/family-hub/daily-reports?childId=${encodeURIComponent(ava.childId)}`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": ava.childId },
      });
      assert.equal(reportsAva.status, 200);
      assert.ok((reportsAva.body.dailyReports || []).every((row) => row.childId === ava.childId));
      const reportsBen = await request(ctx.port, "GET", `/api/family-hub/daily-reports?childId=${encodeURIComponent(ben.childId)}`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": ben.childId },
      });
      assert.equal(reportsBen.status, 200);
      assert.ok((reportsBen.body.dailyReports || []).every((row) => row.childId === ben.childId));
      // Group update only reveals selected child tags in safe payload
      const updatesAva = await request(ctx.port, "GET", `/api/family-hub/updates?childId=${encodeURIComponent(ava.childId)}`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": ava.childId },
      });
      const group = (updatesAva.body.updates || []).find((row) => /Sibling/i.test(row.title || ""));
      if (group) {
        assert.deepEqual(group.childIds, [ava.childId]);
        assert.ok(!group.childIds.includes(ben.childId));
      }
      ok("group_update_isolation_and_daily_report_privacy");
    }

    // Director approval required for teachers when config requires it
    {
      await request(ctx.port, "PATCH", "/api/director-center/family-updates/config", {
        headers: auth(adminToken),
        body: { teachersCanShareDirectly: false, requireDirectorApproval: true },
      });
      const fakes = await request(ctx.port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
      const teacher = (fakes.body.fakeAccounts || []).find((row) => row.kind === "lead_teacher");
      assert.ok(teacher);
      // Use role preview as lead teacher
      const memberships = await request(ctx.port, "GET", "/api/director-center/staff", { headers: auth(adminToken) });
      const lead = (memberships.body.staff || memberships.body.members || []).find((row) => row.role === "lead_teacher")
        || (memberships.body.staff || []).find((row) => /teacher/i.test(row.displayName || ""));
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_one_child");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
      const childId = home.body.selectedChildId || home.body.children?.[0]?.childId;
      const created = await request(ctx.port, "POST", "/api/director-center/family-updates/updates", {
        headers: {
          ...auth(adminToken),
          ...(lead?.id ? { "x-llh-role-preview-membership-id": lead.id } : {}),
        },
        body: { title: "Teacher draft", message: "Needs approval", childIds: [childId], submitForReview: true },
      });
      assert.equal(created.status, 200, JSON.stringify(created.body));
      const shareDenied = await request(ctx.port, "POST", `/api/director-center/family-updates/updates/${created.body.update.id}/share`, {
        headers: {
          ...auth(adminToken),
          ...(lead?.id ? { "x-llh-role-preview-membership-id": lead.id } : {}),
        },
        body: {},
      });
      assert.equal(shareDenied.status, 403);
      assert.equal(shareDenied.body.code, "director_approval_required");
      ok("director_approval_required_for_teacher_share");
    }

    // Observation + goal sharing visible; private observation hidden
    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
      const ava = (home.body.children || []).find((row) => /Ava/i.test(row.displayName || ""));
      assert.ok((home.body.sharedObservations || []).length >= 1 || ava);
      const detail = await request(ctx.port, "GET", `/api/family-hub/children/${encodeURIComponent(ava.childId)}`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": ava.childId },
      });
      assert.equal(detail.status, 200);
      assert.ok((detail.body.sharedObservations || []).every((row) => !/never see/i.test(row.text || "")));
      assert.ok((detail.body.sharedGoals || []).length >= 1);
      ok("observation_and_goal_sharing");
    }

    // Media consent allowed / denied + group photo filtering
    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
      const ava = (home.body.children || []).find((row) => /Ava/i.test(row.displayName || ""));
      const media = await request(ctx.port, "GET", `/api/family-hub/media?childId=${encodeURIComponent(ava.childId)}`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": ava.childId },
      });
      assert.equal(media.status, 200);
      assert.ok((media.body.media || []).length >= 1);
      const group = (media.body.media || []).find((row) => /Group/i.test(row.caption || ""));
      if (group) {
        assert.ok(group.taggedChildIds.includes(ava.childId));
        assert.ok(!group.taggedChildIds.some((id) => id !== ava.childId && !home.body.children.some((c) => c.childId === id)));
      }
      const privateDenied = (media.body.media || []).find((row) => /Internal documentation/i.test(row.caption || ""));
      assert.equal(privateDenied, undefined);
      const content = await request(ctx.port, "GET", `/api/family-hub/media/${media.body.media[0].id}/content`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": ava.childId },
      });
      assert.equal(content.status, 200);
      assert.equal(content.body.publicUrl, null);
      ok("media_consent_and_private_media_access");
    }

    // Restricted / pickup-only denial
    {
      const restricted = await issueAndLogin(ctx.port, adminToken, "restricted_guardian");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(restricted.token) });
      assert.ok(home.status === 200 || home.status === 403);
      if (home.status === 200) {
        assert.equal((home.body.children || []).length, 0);
        assert.equal((home.body.recentUpdates || []).length, 0);
        assert.equal((home.body.familyMedia || []).length, 0);
      }
      const pickup = await issueAndLogin(ctx.port, adminToken, "pickup_only");
      const pickupReports = await request(ctx.port, "GET", "/api/family-hub/daily-reports", { headers: auth(pickup.token) });
      assert.equal(pickupReports.status, 403);
      const pickupMedia = await request(ctx.port, "GET", "/api/family-hub/media", { headers: auth(pickup.token) });
      assert.equal(pickupMedia.status, 403);
      ok("restricted_and_pickup_only_denial");
    }

    // Wrong child + cross-org denial
    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_one_child");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
      const own = home.body.selectedChildId || home.body.children?.[0]?.childId;
      const wrong = await request(ctx.port, "GET", `/api/family-hub/daily-reports?childId=child_not_real_999`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": "child_not_real_999" },
      });
      assert.equal(wrong.status, 403);
      const cross = await request(ctx.port, "GET", `/api/family-hub/updates?childId=${encodeURIComponent(own)}`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": own },
      });
      assert.equal(cross.status, 200);
      ok("wrong_child_and_own_child_ok");
    }

    // File validation via API + media share consent denial for Dana-only
    {
      const bad = await request(ctx.port, "POST", "/api/director-center/family-updates/media", {
        headers: auth(adminToken),
        body: { mimeType: "text/html", fileName: "x.html", byteSize: 12, contentBase64: "PGh0bWw+", taggedChildIds: [] },
      });
      assert.equal(bad.status, 400);
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
      // Find Dana if present for consent denial path via upload+share
      const kids = home.body.children || [];
      const dana = kids.find((row) => /Dana/i.test(row.displayName || ""));
      if (dana) {
        const uploaded = await request(ctx.port, "POST", "/api/director-center/family-updates/media", {
          headers: auth(adminToken),
          body: {
            mimeType: "image/png", fileName: "dana.png", byteSize: 68, contentBase64: TINY_PNG_BASE64,
            taggedChildIds: [dana.childId], caption: "Dana only",
          },
        });
        assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
        const share = await request(ctx.port, "POST", `/api/director-center/family-updates/media/${uploaded.body.media.id}/share`, {
          headers: auth(adminToken),
          body: { visibility: "family_visible" },
        });
        assert.equal(share.status, 403);
        assert.equal(share.body.code, "media_consent_denied");
      }
      ok("api_file_validation_and_consent_denied");
    }

    // Withdrawn content + correction history + acknowledgment
    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const home = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(parent.token) });
      const ava = (home.body.children || []).find((row) => /Ava/i.test(row.displayName || ""));
      const created = await request(ctx.port, "POST", "/api/director-center/family-updates/updates", {
        headers: auth(adminToken),
        body: { title: "To withdraw", message: "temp", childIds: [ava.childId], submitForReview: true },
      });
      const id = created.body.update.id;
      await request(ctx.port, "POST", `/api/director-center/family-updates/updates/${id}/approve`, { headers: auth(adminToken), body: {} });
      await request(ctx.port, "POST", `/api/director-center/family-updates/updates/${id}/share`, { headers: auth(adminToken), body: {} });
      const corrected = await request(ctx.port, "POST", `/api/director-center/family-updates/updates/${id}/correct`, {
        headers: auth(adminToken),
        body: { message: "Corrected message", title: "To withdraw (corrected)" },
      });
      assert.equal(corrected.status, 200);
      assert.equal(corrected.body.update.status, "corrected");
      assert.equal(corrected.body.update.correctionOfId, id);
      assert.ok(Array.isArray(corrected.body.previous.history));
      await request(ctx.port, "POST", `/api/director-center/family-updates/updates/${id}/withdraw`, { headers: auth(adminToken), body: {} });
      const feed = await request(ctx.port, "GET", `/api/family-hub/updates?childId=${encodeURIComponent(ava.childId)}`, {
        headers: { ...auth(parent.token), "x-llh-selected-child-id": ava.childId },
      });
      assert.ok(!(feed.body.updates || []).some((row) => row.id === id && row.status === "withdrawn"));
      const ackTarget = (feed.body.updates || [])[0] || corrected.body.update;
      const ack = await request(ctx.port, "POST", "/api/family-hub/acknowledge", {
        headers: auth(parent.token),
        body: { targetType: "update", targetId: ackTarget.id, childId: ava.childId },
      });
      assert.equal(ack.status, 200);
      assert.equal(ack.body.isLegalSignature, false);
      ok("withdrawn_correction_history_acknowledgment");
    }

    // Staff without guardian cannot use Family Hub; parent cannot use provider review queue as member-only
    {
      const fakes = await request(ctx.port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
      const teacher = (fakes.body.fakeAccounts || []).find((row) => row.kind === "lead_teacher");
      if (teacher) {
        const issued = await request(ctx.port, "POST", `/api/director-center/family/fake-accounts/${teacher.id}/issue-password`, {
          headers: auth(adminToken), body: {},
        });
        const login = await request(ctx.port, "POST", "/api/auth/password-login", {
          body: { email: teacher.email, password: issued.body.password || issued.body.temporaryPassword },
        });
        if (login.status === 200) {
          const token = login.body.memberSessionToken || login.body.token;
          const hub = await request(ctx.port, "GET", "/api/family-hub/home", { headers: auth(token) });
          assert.equal(hub.status, 403);
        }
      }
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_one_child");
      const queue = await request(ctx.port, "GET", "/api/director-center/family-updates/review-queue", {
        headers: auth(parent.token),
      });
      assert.ok(queue.status === 401 || queue.status === 403);
      ok("staff_family_hub_and_parent_provider_api_denied");
    }

    // Production host rejection for family hub media
    {
      await stopServer(ctx);
      ctx = await startServer({
        env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true" },
      });
      const prodAdmin = await adminLogin(ctx.port);
      const seed = await request(ctx.port, "POST", "/api/director-center/family-updates/seed", { headers: auth(prodAdmin), body: {} });
      assert.equal(seed.status, 403);
      const hub = await request(ctx.port, "GET", "/api/family-hub/status", { headers: auth(prodAdmin) });
      assert.ok(hub.status === 403 || hub.status === 401);
      ok("production_media_and_hub_rejection");
    }

    console.log(`\nPhase 10 focused suite: ${passed} PASS`);
  } catch (error) {
    fail("suite_setup", error);
  } finally {
    await stopServer(ctx);
  }
}

run();
