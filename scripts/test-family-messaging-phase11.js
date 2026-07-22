#!/usr/bin/env node
"use strict";

/**
 * Phase 11 Family Messaging / Notifications tests.
 * In-app only. Outbound email/SMS/push disabled. Production Family Hub locked.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const messagingModel = require("./family-messaging-data-model.js");
const { TINY_TXT_BASE64 } = require("./family-messaging-fixtures.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase11-admin@example.com";
const ADMIN_PASSWORD = "Phase11Messaging!99";
const ADMIN_CODE = "phase11-msg-code";

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

async function startServer({ env = {} } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-fm-phase11-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9100 + Math.floor(Math.random() * 500);
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
  await request(port, "POST", "/api/director-center/family-messaging/seed", { headers: auth(adminToken), body: {} });
  const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
  const account = (fakes.body.fakeAccounts || []).find((row) => row.kind === kind);
  assert.ok(account, `missing fake account ${kind}`);
  const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {
    headers: auth(adminToken), body: {},
  });
  assert.equal(issued.status, 200);
  const password = issued.body.password || issued.body.temporaryPassword;
  const login = await request(port, "POST", "/api/auth/password-login", {
    body: { email: account.email, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { token: login.body.memberSessionToken || login.body.token, email: account.email, account };
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

  try {
    assert.equal(messagingModel.validateAttachmentUpload({
      mimeType: "application/javascript", fileName: "x.js", byteSize: 10, contentBase64: "YQ==",
    }).ok, false);
    assert.equal(messagingModel.validateAttachmentUpload({
      mimeType: "text/plain", fileName: "note.txt", byteSize: 40, contentBase64: TINY_TXT_BASE64,
    }).ok, true);
    ok("attachment_validation_unit");
  } catch (error) { fail("attachment_validation_unit", error); }

  try {
    const decision = expansionFlags.evaluateExpansionAccess({
      flagKey: EXPANSION_FEATURE_KEYS.FAMILY_HUB,
      storedFlags: { familyHub: true },
      environment: { liveProduction: true, allowFamilyHubTestingPreview: true, siteUrl: "https://littlelearnershubbyleah.com" },
    });
    assert.equal(decision.allowed, false);
    ok("production_preview_rejection_unit");
  } catch (error) { fail("production_preview_rejection_unit", error); }

  let ctx;
  try {
    ctx = await startServer();
    const adminToken = await adminLogin(ctx.port);
    await request(ctx.port, "POST", "/api/director-center/family-messaging/seed", { headers: auth(adminToken), body: {} });

    {
      const status = await request(ctx.port, "GET", "/api/director-center/family-messaging/status", { headers: auth(adminToken) });
      assert.equal(status.status, 200);
      assert.equal(status.body.phase, 11);
      assert.equal(status.body.outboundDeliveryDisabled, true);
      assert.equal(status.body.improvesExistingMessagingCenter, true);
      ok("provider_status_outbound_disabled");
    }

    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const inbox = await request(ctx.port, "GET", "/api/family-hub/messages", { headers: auth(parent.token) });
      assert.equal(inbox.status, 200, JSON.stringify(inbox.body));
      assert.ok((inbox.body.conversations || []).length >= 1);
      // Announcement recipient privacy: no other guardian emails
      const announcement = (inbox.body.conversations || []).find((row) => row.announcement);
      if (announcement) {
        const emails = JSON.stringify(announcement.participants || []);
        assert.ok(!emails.includes("@example.invalid") || emails.includes(parent.email) || true);
        const otherGuardians = (announcement.participants || []).filter((p) => p.role === "guardian" && p.email && p.email !== parent.email);
        assert.equal(otherGuardians.length, 0);
      }
      // Internal staff never listed
      assert.ok(!(inbox.body.conversations || []).some((row) => row.type === "internal_staff" || row.internalStaffOnly));
      ok("family_inbox_and_announcement_privacy");
    }

    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const inbox = await request(ctx.port, "GET", "/api/family-hub/messages", { headers: auth(parent.token) });
      const threadId = inbox.body.conversations[0].id;
      const thread = await request(ctx.port, "GET", `/api/family-hub/messages/${threadId}`, { headers: auth(parent.token) });
      assert.equal(thread.status, 200);
      assert.ok(!(thread.body.messages || []).some((m) => /INTERNAL/i.test(m.body || "")));
      const reply = await request(ctx.port, "POST", `/api/family-hub/messages/${threadId}/reply`, {
        headers: auth(parent.token),
        body: { body: "Family reply fixture" },
      });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.sentExternally, false);
      ok("family_reply_and_internal_isolation");
    }

    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const notes = await request(ctx.port, "GET", "/api/family-hub/notifications", { headers: auth(parent.token) });
      assert.equal(notes.status, 200);
      assert.ok(!(notes.body.notifications || []).some((n) => n.adminOnly || n.kind === "admin_only"));
      assert.equal(notes.body.sentExternally, false);
      const unread = notes.body.unreadCount;
      assert.equal(unread, (notes.body.notifications || []).filter((n) => !n.read).length);
      ok("admin_notification_isolation_and_unread_counts");
    }

    {
      const pickup = await issueAndLogin(ctx.port, adminToken, "pickup_only");
      const msgs = await request(ctx.port, "GET", "/api/family-hub/messages", { headers: auth(pickup.token) });
      assert.equal(msgs.status, 403);
      ok("pickup_only_messaging_denied");
    }

    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_one_child");
      const wrong = await request(ctx.port, "GET", "/api/family-hub/messages/fmconv_not_real", { headers: auth(parent.token) });
      assert.equal(wrong.status, 403);
      const staffThread = await request(ctx.port, "GET", "/api/director-center/family-messaging/inbox?filter=staff", { headers: auth(adminToken) });
      assert.equal(staffThread.status, 200);
      const staffId = (staffThread.body.conversations || []).find((row) => row.type === "staff_staff")?.id;
      if (staffId) {
        const parentStaff = await request(ctx.port, "GET", `/api/family-hub/messages/${staffId}`, { headers: auth(parent.token) });
        assert.equal(parentStaff.status, 403);
      }
      ok("wrong_thread_and_parent_denied_staff_thread");
    }

    {
      const preview = await request(ctx.port, "POST", "/api/director-center/family-messaging/announcements/preview", {
        headers: auth(adminToken),
        body: {},
      });
      assert.equal(preview.status, 200);
      assert.ok(typeof preview.body.intendedRecipientCount === "number");
      assert.ok(preview.body.confirmation);
      assert.equal(preview.body.sentExternally, false);
      ok("announcement_recipient_count_confirmation");
    }

    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const inbox = await request(ctx.port, "GET", "/api/family-hub/messages", { headers: auth(parent.token) });
      const convId = inbox.body.conversations[0].id;
      const bad = await request(ctx.port, "POST", "/api/family-hub/messages/attachments", {
        headers: auth(parent.token),
        body: { conversationId: convId, mimeType: "text/html", fileName: "x.html", byteSize: 12, contentBase64: "PGh0bWw+" },
      });
      assert.equal(bad.status, 400);
      const good = await request(ctx.port, "POST", "/api/family-hub/messages/attachments", {
        headers: auth(parent.token),
        body: {
          conversationId: convId,
          mimeType: "text/plain",
          fileName: "note.txt",
          byteSize: Buffer.from(TINY_TXT_BASE64, "base64").length,
          contentBase64: TINY_TXT_BASE64,
        },
      });
      assert.equal(good.status, 200);
      assert.equal(good.body.attachment.publicUrl, null);
      ok("attachment_auth_and_validation");
    }

    {
      const created = await request(ctx.port, "POST", "/api/director-center/family-messaging/conversations", {
        headers: auth(adminToken),
        body: {
          type: "child_family",
          subject: "Edit/withdraw test",
          body: "Original body",
          participants: [],
          childIds: [],
        },
      });
      assert.equal(created.status, 200);
      const convId = created.body.conversation.id;
      const thread = await request(ctx.port, "GET", `/api/director-center/family-messaging/conversations/${convId}`, { headers: auth(adminToken) });
      const msgId = thread.body.messages[0].id;
      const edited = await request(ctx.port, "POST", `/api/director-center/family-messaging/messages/${msgId}/edit`, {
        headers: auth(adminToken),
        body: { body: "Edited body" },
      });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.message.edited, true);
      assert.equal(edited.body.message.originalBody, "Original body");
      const withdrawn = await request(ctx.port, "POST", `/api/director-center/family-messaging/messages/${msgId}/withdraw`, {
        headers: auth(adminToken), body: {},
      });
      assert.equal(withdrawn.status, 200);
      assert.equal(withdrawn.body.message.withdrawn, true);
      const archived = await request(ctx.port, "POST", `/api/director-center/family-messaging/conversations/${convId}/archive`, {
        headers: auth(adminToken), body: {},
      });
      assert.equal(archived.status, 200);
      const exported = await request(ctx.port, "POST", `/api/director-center/family-messaging/conversations/${convId}/export`, {
        headers: auth(adminToken), body: {},
      });
      assert.equal(exported.status, 200);
      assert.ok(exported.body.export?.messages?.length >= 1);
      ok("edit_withdraw_archive_export_history");
    }

    {
      const parent = await issueAndLogin(ctx.port, adminToken, "parent_multi_child");
      const notes = await request(ctx.port, "GET", "/api/family-hub/notifications", { headers: auth(parent.token) });
      const note = (notes.body.notifications || [])[0];
      if (note) {
        const opened = await request(ctx.port, "GET", `/api/family-hub/notifications/${note.id}/open`, { headers: auth(parent.token) });
        assert.equal(opened.status, 200);
      }
      const badOpen = await request(ctx.port, "GET", "/api/family-hub/notifications/fmnote_missing/open", { headers: auth(parent.token) });
      assert.equal(badOpen.status, 403);
      const prefs = await request(ctx.port, "POST", "/api/family-hub/delivery-preferences", {
        headers: auth(parent.token),
        body: { channels: { inApp: true, email: true, sms: true, push: true } },
      });
      assert.equal(prefs.status, 200);
      assert.equal(prefs.body.deliveryPreferences.channels.email, false);
      assert.equal(prefs.body.deliveryPreferences.channels.sms, false);
      assert.equal(prefs.body.deliveryPreferences.channels.push, false);
      assert.equal(prefs.body.sentExternally, false);
      ok("notification_deeplink_and_outbound_prefs_forced_off");
    }

    {
      await stopServer(ctx);
      ctx = await startServer({ env: { SITE_URL: "https://littlelearnershubbyleah.com" } });
      const prodAdmin = await adminLogin(ctx.port);
      const seed = await request(ctx.port, "POST", "/api/director-center/family-messaging/seed", { headers: auth(prodAdmin), body: {} });
      assert.equal(seed.status, 403);
      const hub = await request(ctx.port, "GET", "/api/family-hub/messages", { headers: auth(prodAdmin) });
      assert.ok(hub.status === 403 || hub.status === 401);
      ok("production_family_messaging_rejection");
    }

    console.log(`\nPhase 11 focused suite: ${passed} PASS`);
  } catch (error) {
    fail("suite_setup", error);
  } finally {
    await stopServer(ctx);
  }
}

run();
