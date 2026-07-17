#!/usr/bin/env node
/**
 * Founding Member thank-you email safety + eligibility tests.
 * Run: NODE_ENV=test node scripts/test-founding-member-email.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  createFoundingMemberEmail,
  buildFoundingMemberRecipientDryRun,
  CONFIRM_PHRASE,
  EMAIL_SUBJECT,
} = require("../server/founding-member-email.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.founding-email-test-store-${process.pid}.json`);
const ADMIN_EMAIL = "owner@example.com";
const ADMIN_PASSWORD = "test-admin-pass";
const ADMIN_ACCESS_CODE = "test-admin-code";

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function request(method, urlPath, { body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

function sampleStore() {
  // Use non-example.com domains — looksLikeTestEmail treats example.com/org as test addresses.
  return {
    foundingMembers: [
      "active.founding@providermail.com",
      "trial.founding@providermail.com",
      "pastdue.founding@providermail.com",
      "canceled.founding@providermail.com",
      "pro.only@providermail.com",
    ],
    users: {
      "active.founding@providermail.com": {
        email: "active.founding@providermail.com",
        plan: "Founding",
        foundingMemberActive: true,
        foundingMemberNumber: 1,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      },
      "trial.founding@providermail.com": {
        email: "trial.founding@providermail.com",
        plan: "Founding",
        foundingMemberActive: true,
        foundingMemberNumber: 2,
        stripeSubscriptionStatus: "trialing",
        subscriptionStatus: "Founding Member Subscription Trialing",
        trialStatus: "In Trial",
        trialEnd: new Date(Date.now() + 86400000).toISOString(),
      },
      "pastdue.founding@providermail.com": {
        email: "pastdue.founding@providermail.com",
        plan: "Founding",
        foundingMemberActive: false,
        foundingMemberNumber: 3,
        stripeSubscriptionStatus: "past_due",
        subscriptionStatus: "Founding Member Subscription Active",
      },
      "canceled.founding@providermail.com": {
        email: "canceled.founding@providermail.com",
        plan: "Free",
        foundingMemberActive: false,
        foundingMemberHistorical: true,
        foundingMemberNumber: 4,
        stripeSubscriptionStatus: "canceled",
        subscriptionStatus: "Subscription Ended",
      },
      "pro.only@providermail.com": {
        email: "pro.only@providermail.com",
        plan: "Pro",
        foundingMemberActive: false,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Pro Monthly Subscription Active",
      },
      "test.user@example.com": {
        email: "test.user@example.com",
        plan: "Founding",
        foundingMemberActive: true,
        foundingMemberNumber: 5,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      },
      "owner@example.com": {
        email: "owner@example.com",
        plan: "Founding",
        foundingMemberActive: true,
        foundingMemberNumber: 6,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      },
      "leah.admin@providermail.com": {
        email: "leah.admin@providermail.com",
        plan: "Founding",
        foundingMemberActive: true,
        foundingMemberNumber: 9,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      },
      "dup@providermail.com": {
        email: "dup@providermail.com",
        plan: "Founding",
        foundingMemberActive: true,
        foundingMemberNumber: 7,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      },
      // Second map key with same normalized email — exercises duplicate removal.
      "dup@providermail.com#alt": {
        email: "dup@providermail.com",
        plan: "Founding",
        foundingMemberActive: true,
        foundingMemberNumber: 8,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      },
    },
    emailEngagement: { settings: {}, events: [] },
  };
}

async function main() {
  const moduleJs = fs.readFileSync(path.join(ROOT, "server", "founding-member-email.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  await test("module exports confirm phrase and dry-run helpers", () => {
    assert.match(moduleJs, /SEND_FOUNDING_MEMBER_EMAIL/);
    assert.match(moduleJs, /membershipFoundingActive/);
    assert.match(moduleJs, /in_trial/);
    assert.match(moduleJs, /subscriptionNotCanceled/);
    assert.match(moduleJs, /notAlreadyReceived/);
    assert.match(moduleJs, /confirmationScreen/);
    assert.match(moduleJs, /buildPostSendReport/);
    assert.match(serverJs, /\/api\/admin\/founding-member-email\/dry-run/);
    assert.match(serverJs, /\/api\/admin\/founding-member-email\/send/);
    assert.match(serverJs, /\/api\/admin\/founding-member-email\/report/);
    assert.match(serverJs, /\/api\/webhooks\/resend/);
    assert.match(serverJs, /EMAIL_AUTOMATIONS_ENABLED/);
    assert.match(appJs, /adminFoundingEmailDryRun/);
    assert.match(appJs, /Final Confirmation Screen/);
    assert.match(appJs, /SEND_FOUNDING_MEMBER_EMAIL/);
  });

  await test("eligibility includes only active non-trial founding access", () => {
    const report = buildFoundingMemberRecipientDryRun(sampleStore(), {
      adminEmail: ADMIN_EMAIL,
      includeAdmin: false,
    });
    const emails = report.recipients.map((r) => r.email);
    // adminEmail is owner@example.com (test domain), so leah.admin@providermail.com is not treated as admin-excluded.
    assert.equal(report.counts.recipients, 3);
    assert.ok(emails.includes("active.founding@providermail.com"));
    assert.ok(emails.includes("dup@providermail.com"));
    assert.ok(emails.includes("leah.admin@providermail.com"));
    assert.ok(!emails.includes("trial.founding@providermail.com"));
    assert.ok(!emails.includes("pastdue.founding@providermail.com"));
    assert.ok(!emails.includes("canceled.founding@providermail.com"));
    assert.ok(!emails.includes("pro.only@providermail.com"));
    assert.ok(!emails.includes("test.user@example.com"));
    assert.ok(!emails.includes("owner@example.com"));
    assert.ok(report.duplicatesRemoved.includes("dup@providermail.com"));
    assert.equal(report.email.subject, EMAIL_SUBJECT);
    assert.equal(report.willSend, false);
    assert.equal(report.finalValidation.allRecipientsPassed, true);
    const active = report.recipients.find((r) => r.email === "active.founding@providermail.com");
    assert.equal(active.checks.emailValid, true);
    assert.equal(active.checks.accountActive, true);
    assert.equal(active.checks.foundingAccessActive, true);
    assert.equal(active.checks.subscriptionNotCanceled, true);
    assert.equal(active.checks.notTrial, true);
    assert.equal(active.checks.notTestAccount, true);
    assert.equal(active.checks.notAlreadyReceived, true);
    const canceled = report.excluded.find((r) => r.email === "canceled.founding@providermail.com");
    assert.ok(canceled.excludeReasons.includes("subscription_canceled"));
  });

  await test("includeAdmin only when admin genuinely qualifies", () => {
    const adminReal = "leah.admin@providermail.com";
    const without = buildFoundingMemberRecipientDryRun(sampleStore(), {
      adminEmail: adminReal,
      includeAdmin: false,
    });
    const withAdmin = buildFoundingMemberRecipientDryRun(sampleStore(), {
      adminEmail: adminReal,
      includeAdmin: true,
    });
    assert.ok(!without.recipients.some((r) => r.email === adminReal));
    assert.ok(withAdmin.recipients.some((r) => r.email === adminReal));
    // example.com admin is always excluded as test_email even with includeAdmin
    const testAdmin = buildFoundingMemberRecipientDryRun(sampleStore(), {
      adminEmail: ADMIN_EMAIL,
      includeAdmin: true,
    });
    assert.ok(!testAdmin.recipients.some((r) => r.email === ADMIN_EMAIL));
  });

  const sent = [];
  let store = sampleStore();
  const api = createFoundingMemberEmail({
    sendEmail: async ({ to, subject }) => {
      const id = `re_${sent.length + 1}`;
      sent.push({ to, subject, id });
      return { sent: true, configured: true, provider: "resend", messageId: id };
    },
    readStore: () => store,
    writeStore: (next) => { store = next; },
    getAdminEmail: () => ADMIN_EMAIL,
    getSupportEmailStatus: () => ({ ready: true, provider: "resend", from: "Little Learner Hub <support@littlelearnershubbyleah.com>" }),
  });

  await test("send blocked without confirm phrase / dry-run token", async () => {
    const blocked = await api.send({ confirm: true, confirmPhrase: "WRONG" });
    assert.equal(blocked.skipped, true);
    assert.equal(blocked.reason, "confirmation_required");
    assert.equal(sent.length, 0);

    const dry = api.dryRun({ adminEmail: ADMIN_EMAIL, includeAdmin: false });
    assert.equal(dry.willSend, false);
    assert.equal(dry.counts.recipients, 3);
    assert.ok(dry.confirmationScreen);
    assert.equal(dry.confirmationScreen.recipientCount, 3);
    assert.ok(dry.confirmationToken);

    const noConfirm = await api.send({
      confirm: false,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
    });
    assert.equal(noConfirm.reason, "confirmation_required");
    assert.equal(sent.length, 0);

    const noConfirmationToken = await api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: dry.dryRunToken,
    });
    assert.equal(noConfirmationToken.reason, "confirmation_screen_required");
    assert.equal(sent.length, 0);
  });

  await test("send once with phrase, records message ids, blocks duplicate", async () => {
    const dry = api.dryRun({ adminEmail: ADMIN_EMAIL, includeAdmin: false });
    const result = await api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
      adminEmail: ADMIN_EMAIL,
      includeAdmin: false,
    });
    assert.equal(result.skipped, false);
    assert.equal(result.sent, 3);
    assert.equal(result.attempted, 3);
    assert.equal(result.membershipRecordsModified, false);
    assert.equal(result.billingRecordsModified, false);
    assert.equal(result.foundingMemberStatusModified, false);
    assert.equal(sent.length, 3);
    assert.ok(result.deliveries.every((d) => d.messageId));
    assert.ok(result.report);
    assert.equal(result.report.totalAttempted, 3);
    assert.ok(result.report.resendMessageIds.length === 3);
    assert.ok(store.emailEngagement.settings.foundingMemberThankYou.sentAt);

    // Membership flags untouched
    assert.equal(store.users["active.founding@providermail.com"].foundingMemberActive, true);
    assert.equal(store.users["trial.founding@providermail.com"].foundingMemberActive, true);

    // Webhook delivery + bounce tracking
    const messageId = result.deliveries[0].messageId;
    api.handleResendWebhook({
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: messageId, to: [result.deliveries[0].email] },
    });
    assert.equal(
      store.emailEngagement.settings.foundingMemberThankYou.recipientReceipts[result.deliveries[0].email].deliveryStatus,
      "delivered",
    );
    api.handleResendWebhook({
      type: "email.bounced",
      created_at: new Date().toISOString(),
      data: { email_id: result.deliveries[1].messageId, to: [result.deliveries[1].email], bounce: { type: "Permanent" } },
    });
    const reportAfter = api.getReport().report;
    assert.ok(reportAfter.totalDelivered >= 1);
    assert.ok(reportAfter.totalBounced >= 1);

    const again = await api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
    });
    assert.equal(again.reason, "already_sent");
    assert.equal(sent.length, 3);
  });

  fs.writeFileSync(STORE, JSON.stringify({
    users: sampleStore().users,
    foundingMembers: sampleStore().foundingMembers,
    emailEngagement: { settings: {}, events: [] },
    siteContent: {},
  }));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      EMAIL_AUTOMATIONS_ENABLED: "false",
      RESEND_API_KEY: "",
      SUPPORT_EMAIL_FROM: "Little Learner Hub <support@littlelearnershubbyleah.com>",
      SUPPORT_EMAIL_TO: "owner@example.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth();
    const login = await request("POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_ACCESS_CODE },
    });
    assert.equal(login.status, 200);
    const adminToken = login.json.token || login.json.adminToken;
    assert.ok(adminToken);

    await test("HTTP dry-run never sends and keeps automations off", async () => {
      const res = await request("POST", "/api/admin/founding-member-email/dry-run", {
        body: { adminToken, includeAdmin: false },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.sent, false);
      assert.equal(res.json.willSend, false);
      assert.equal(res.json.automationsEnabled, false);
      assert.ok(res.json.preview?.dryRunToken);
      assert.ok(res.json.preview?.confirmationToken);
      assert.ok(res.json.preview?.confirmationScreen);
      assert.equal(res.json.preview.confirmationScreen.recipientCount, 3);
      assert.equal(res.json.preview.email.subject, EMAIL_SUBJECT);
      assert.equal(res.json.preview.counts.recipients, 3);
      assert.ok(res.json.preview.recipients.some((r) => r.email === "active.founding@providermail.com"));
    });

    await test("HTTP send without phrase is rejected", async () => {
      const dry = await request("POST", "/api/admin/founding-member-email/dry-run", {
        body: { adminToken },
      });
      const res = await request("POST", "/api/admin/founding-member-email/send", {
        body: {
          adminToken,
          confirm: true,
          confirmPhrase: "NOPE",
          dryRunToken: dry.json.preview?.dryRunToken,
          confirmationToken: dry.json.preview?.confirmationToken,
        },
      });
      assert.equal(res.status, 400);
      assert.equal(res.json.result?.reason, "confirmation_required");
    });

    await test("HTTP report endpoint available before send", async () => {
      const res = await request("GET", `/api/admin/founding-member-email/report?adminToken=${encodeURIComponent(adminToken)}`);
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, true);
      assert.ok(res.json.report);
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }

  if (process.exitCode) {
    console.error("Some founding-member email tests failed.");
    process.exit(process.exitCode);
  }
  console.log("All founding-member email tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
