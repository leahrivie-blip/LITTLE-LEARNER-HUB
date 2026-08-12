#!/usr/bin/env node
/**
 * Focused Teaching Kits one-time broadcast safety regressions.
 * No real email. Does not touch production / Render.
 *
 * Run: NODE_ENV=test node scripts/test-teaching-kits-one-time-safety.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const {
  createEmailEngagement,
  defaultEmailEngagementStore,
  ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID,
} = require("../server/email-engagement.js");

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

function makeClaimHelpers() {
  const deliveries = new Map();
  return {
    deliveries,
    claimEmailCampaignDelivery: async ({ campaignId, email, contentHash }) => {
      const key = `${campaignId}:${String(email || "").trim().toLowerCase()}`;
      if (deliveries.has(key)) return { claimed: false, delivery: deliveries.get(key) };
      const delivery = {
        campaign_id: campaignId,
        email: String(email || "").trim().toLowerCase(),
        content_hash: contentHash,
        status: "pending",
        claimed_at: new Date().toISOString(),
      };
      deliveries.set(key, delivery);
      return { claimed: true, delivery };
    },
    completeEmailCampaignDelivery: async ({ campaignId, email, status, error = "", messageId = "", provider = "" }) => {
      const key = `${campaignId}:${String(email || "").trim().toLowerCase()}`;
      const delivery = deliveries.get(key);
      if (delivery) {
        Object.assign(delivery, {
          status,
          error,
          message_id: messageId,
          provider,
          completed_at: new Date().toISOString(),
        });
      }
    },
    reclaimFailedEmailCampaignDelivery: async ({ campaignId, email, contentHash }) => {
      const key = `${campaignId}:${String(email || "").trim().toLowerCase()}`;
      const existing = deliveries.get(key);
      if (!existing) return { claimed: false, delivery: null };
      if (["sent", "pending"].includes(existing.status)) return { claimed: false, delivery: existing };
      if (!["failed", "skipped", "soft_skipped"].includes(existing.status)) {
        return { claimed: false, delivery: existing };
      }
      Object.assign(existing, {
        content_hash: contentHash,
        status: "pending",
        error: "",
        claimed_at: new Date().toISOString(),
        completed_at: null,
      });
      return { claimed: true, reclaimed: true, delivery: existing };
    },
    releaseEmailCampaignDelivery: async ({ campaignId, email }) => {
      const key = `${campaignId}:${String(email || "").trim().toLowerCase()}`;
      deliveries.delete(key);
    },
  };
}

function baseUsers() {
  const now = new Date().toISOString();
  return {
    "free@llhprovider.com": {
      email: "free@llhprovider.com",
      firstName: "Free",
      accountStatus: "Active",
      plan: "Free",
      signupAt: now,
      createdAt: now,
    },
    "paid@llhprovider.com": {
      email: "paid@llhprovider.com",
      firstName: "Paid",
      accountStatus: "Active",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      signupAt: now,
      createdAt: now,
    },
    "owner@llhprovider.com": {
      email: "owner@llhprovider.com",
      firstName: "Owner",
      accountStatus: "Active",
      signupAt: now,
      createdAt: now,
    },
    "staff@llhprovider.com": {
      email: "staff@llhprovider.com",
      accountStatus: "Active",
      role: "admin",
      signupAt: now,
      createdAt: now,
    },
    "internal@llhprovider.com": {
      email: "internal@llhprovider.com",
      accountStatus: "Active",
      internalAccessOverride: true,
      signupAt: now,
      createdAt: now,
    },
    "orphan@llhprovider.com": {
      email: "orphan@llhprovider.com",
      accountStatus: "Active",
      // no signup/created/login activity
    },
    "disabled@llhprovider.com": {
      email: "disabled@llhprovider.com",
      accountStatus: "Disabled",
      signupAt: now,
      createdAt: now,
    },
    "deleted@llhprovider.com": {
      email: "deleted@llhprovider.com",
      accountStatus: "Deleted",
      signupAt: now,
      createdAt: now,
    },
    "archived@llhprovider.com": {
      email: "archived@llhprovider.com",
      accountStatus: "Archived",
      signupAt: now,
      createdAt: now,
    },
    "unsub@llhprovider.com": {
      email: "unsub@llhprovider.com",
      accountStatus: "Active",
      emailPrefs: { unsubscribedAt: now },
      signupAt: now,
      createdAt: now,
    },
    "nomarket@llhprovider.com": {
      email: "nomarket@llhprovider.com",
      accountStatus: "Active",
      emailPrefs: { marketing: false },
      signupAt: now,
      createdAt: now,
    },
    "test@example.com": {
      email: "test@example.com",
      accountStatus: "Active",
      signupAt: now,
      createdAt: now,
    },
    "bounced@llhprovider.com": {
      email: "bounced@llhprovider.com",
      accountStatus: "Active",
      emailBounced: true,
      signupAt: now,
      createdAt: now,
    },
    "dup-key": {
      email: "Free@LLHProvider.com",
      accountStatus: "Active",
      signupAt: now,
      createdAt: now,
    },
    "invalid-user": {
      email: "not-an-email",
      accountStatus: "Active",
      signupAt: now,
      createdAt: now,
    },
  };
}

function makeNUsers(n) {
  const now = new Date().toISOString();
  const users = {};
  for (let i = 0; i < n; i += 1) {
    const email = `user${i}@llhprovider.com`;
    users[email] = {
      email,
      accountStatus: "Active",
      plan: i % 2 === 0 ? "Free" : "Pro",
      stripeSubscriptionStatus: i % 2 === 0 ? "" : "active",
      signupAt: now,
      createdAt: now,
    };
  }
  return users;
}

function makeEng({ store, sendEmail, claims, automations = false }) {
  return createEmailEngagement({
    sendEmail,
    SITE_URL: "https://littlelearnershubbyleah.com",
    htmlEscape: (v) => String(v ?? ""),
    readStore: () => store,
    writeStore: (s) => Object.assign(store, s),
    writeStoreAsync: async (s) => Object.assign(store, s),
    supportEmailTo: () => "leahrivie@gmail.com",
    unsubscribeUrlForEmail: (email) => `https://littlelearnershubbyleah.com/unsubscribe?e=${encodeURIComponent(email)}`,
    getAdminEmail: () => "owner@llhprovider.com",
    getSupportEmailStatus: () => ({ ready: true, provider: "test", fromConfigured: true }),
    areAutomationsEnabled: () => automations,
    ...claims,
  });
}

async function auditAndSend(eng, store, adminEmail = "owner@llhprovider.com") {
  const audit = await eng.runPreflightAudit({
    store,
    adminEmail,
    nodeEnv: "test",
    allowLocalForTests: true,
  });
  assert.equal(audit.auditPassed, true, JSON.stringify(audit.checks, null, 2));
  return eng.sendOneTimeWelcomeUpdate({
    auditToken: audit.auditToken,
    confirm: true,
    adminEmail,
  });
}

async function main() {
  const moduleJs = fs.readFileSync(path.join(ROOT, "server", "email-engagement.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const welcomeJs = fs.readFileSync(path.join(ROOT, "server", "onboarding-welcome.js"), "utf8");

  assert.match(moduleJs, /previewOneTimeWelcomeUpdate/);
  assert.match(moduleJs, /campaign_already_claimed/);
  assert.match(moduleJs, /ONE_TIME_CAMPAIGN_LOCK_EMAIL/);
  assert.match(moduleJs, /Does NOT require EMAIL_AUTOMATIONS_ENABLED/);
  assert.match(moduleJs, /provider_unconfigured/);
  assert.match(moduleJs, /partial_delivery/);
  assert.match(moduleJs, /sentAt only after full success/);
  assert.match(moduleJs, /recoverOneTimeWelcomeUpdate/);
  assert.match(moduleJs, /recipientReceipts/);
  assert.match(moduleJs, /ONE_TIME_RECOVERY_LOCK_EMAIL/);
  assert.match(serverJs, /preview-one-time/);
  assert.match(serverJs, /recover-one-time/);
  assert.match(serverJs, /reclaimFailedEmailCampaignDelivery/);
  assert.match(serverJs, /supportEmailTo:\s*\(\)\s*=>\s*SUPPORT_EMAIL_TO/);
  assert.match(serverJs, /EMAIL_AUTOMATIONS_ENABLED is intentionally NOT required here/);
  // Welcome paths remain separate / untouched markers.
  assert.match(welcomeJs, /maybeDeliverOnSignup/);
  assert.match(welcomeJs, /freeWelcomeSentAt/);
  assert.match(welcomeJs, /proWelcomeSentAt/);
  console.log("PASS  teaching kits safety markers present");

  await test("eligibility excludes inactive/admin/staff/orphan/unsub/marketing/test/bounce and dedupes", async () => {
    const store = {
      users: baseUsers(),
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => ({ sent: true, configured: true, provider: "test" }),
      claims,
    });
    const recipients = eng.eligibleOneTimeRecipients(store, { adminEmail: "owner@llhprovider.com" });
    assert.deepEqual(recipients.sort(), ["free@llhprovider.com", "paid@llhprovider.com"].sort());
    const preview = eng.previewOneTimeWelcomeUpdate({ adminEmail: "owner@llhprovider.com" });
    assert.equal(preview.readOnly, true);
    assert.equal(preview.automationsEnabled, false);
    assert.equal(preview.preview.eligibleUniqueRecipients, 2);
    assert.ok(preview.preview.excluded.inactive >= 3);
    assert.ok(preview.preview.excluded.admin >= 3, "admin email + role=admin + internalAccessOverride");
    assert.ok(preview.preview.excluded.no_customer_activity >= 1);
    assert.equal(preview.preview.excluded.unsubscribed, 1);
    assert.equal(preview.preview.excluded.marketing_false, 1);
    assert.ok(preview.preview.excluded.test_probe >= 1);
    assert.equal(preview.preview.excluded.bounced_suppressed, 1);
    assert.ok(preview.preview.excluded.invalid >= 1);
    assert.equal(preview.preview.excluded.duplicate, 1);
    assert.equal(JSON.stringify(preview).includes("free@llhprovider.com"), false);
    // Read-only: no claim / audit / sent mutation.
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.claimedAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.lastAuditToken || "", "");
    assert.equal(claims.deliveries.size, 0);
  });

  await test("Teaching Kits send works while EMAIL_AUTOMATIONS_ENABLED=false; drip/weekly stay blocked", async () => {
    const sends = [];
    const store = {
      users: {
        "free@llhprovider.com": baseUsers()["free@llhprovider.com"],
        "paid@llhprovider.com": baseUsers()["paid@llhprovider.com"],
      },
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    store.emailEngagement.settings.onboardingEnabled = true;
    store.emailEngagement.settings.weeklyWhatsNewEnabled = true;
    const claims = makeClaimHelpers();
    const eng = createEmailEngagement({
      sendEmail: async (opts) => {
        sends.push(opts);
        return { sent: true, configured: true, provider: "test", messageId: `m${sends.length}` };
      },
      SITE_URL: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
      readStore: () => store,
      writeStore: (s) => Object.assign(store, s),
      writeStoreAsync: async (s) => Object.assign(store, s),
      supportEmailTo: () => "leahrivie@gmail.com",
      unsubscribeUrlForEmail: (email) => `https://littlelearnershubbyleah.com/unsubscribe?e=${encodeURIComponent(email)}`,
      getAdminEmail: () => "owner@llhprovider.com",
      getSupportEmailStatus: () => ({ ready: true, provider: "test", fromConfigured: true }),
      areAutomationsEnabled: () => false,
      ...claims,
    });

    const drip = await eng.processOnboardingDrip({ force: true });
    assert.equal(drip.reason, "automations_disabled");
    const weekly = await eng.runWeeklyWhatsNew({ force: true });
    assert.equal(weekly.reason, "automations_disabled");
    const welcomeDrip = await eng.maybeSendWelcomeOnSignup("free@llhprovider.com");
    assert.equal(welcomeDrip.reason, "automations_disabled");
    assert.equal(sends.length, 0);

    const audit = await eng.runPreflightAudit({
      store,
      adminEmail: "owner@llhprovider.com",
      nodeEnv: "test",
      allowLocalForTests: true,
    });
    assert.equal(audit.auditPassed, true, JSON.stringify(audit.checks, null, 2));

    const sent = await eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(sent.skipped, false, JSON.stringify(sent));
    assert.equal(sent.reason, "sent");
    assert.equal(sent.deliveryOutcome, "sent");
    assert.equal(sent.sent, 2);
    assert.equal(sends.length, 2);
    for (const payload of sends) {
      assert.equal(payload.replyTo, "leahrivie@gmail.com");
      assert.match(String(payload.listUnsubscribeUrl || ""), /unsubscribe/);
    }
    assert.ok(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentAt);
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.deliveryOutcome, "sent");
    assert.ok(store.emailEngagement.settings.oneTimeWelcomeUpdate.claimedAt);
  });

  await test("10/10 sent stamps sentAt and lock status sent; recovery blocked", async () => {
    const store = {
      users: makeNUsers(10),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => ({ sent: true, configured: true, provider: "test" }),
      claims,
    });
    const result = await auditAndSend(eng, store);
    assert.equal(result.reason, "sent");
    assert.equal(result.sent, 10);
    assert.ok(result.sentAt);
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentAt, result.sentAt);
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.deliveryOutcome, "sent");
    assert.equal(result.recoveryAvailable, false);
    const lock = claims.deliveries.get(`${ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID}:__campaign_lock__`);
    assert.equal(lock.status, "sent");
    const blocked = await eng.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(blocked.reason, "already_sent");
  });

  await test("5/10 partial delivery retains claim/ledger and does not stamp sentAt", async () => {
    let i = 0;
    const store = {
      users: makeNUsers(10),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => {
        i += 1;
        if (i <= 5) return { sent: true, configured: true, provider: "test" };
        return { sent: false, configured: true, provider: "test", error: "provider_reject" };
      },
      claims,
    });
    const result = await auditAndSend(eng, store);
    assert.equal(result.reason, "partial_delivery");
    assert.equal(result.deliveryOutcome, "partial_delivery");
    assert.equal(result.sent, 5);
    assert.equal(result.failed, 5);
    assert.equal(result.remaining, 5);
    assert.equal(result.sentAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentCount, 5);
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.failedCount, 5);
    const receipts = store.emailEngagement.settings.oneTimeWelcomeUpdate.recipientReceipts || {};
    assert.equal(Object.values(receipts).filter((r) => r.status === "sent").length, 5);
    assert.ok(store.emailEngagement.settings.oneTimeWelcomeUpdate.claimedAt);
    assert.ok(store.emailEngagement.settings.oneTimeWelcomeUpdate.sendFailedAt);
    const lock = claims.deliveries.get(`${ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID}:__campaign_lock__`);
    assert.equal(lock.status, "failed");

    const again = await eng.sendOneTimeWelcomeUpdate({
      auditToken: "anything",
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(again.reason, "campaign_already_claimed");
  });

  await test("0/10 provider unconfigured does not stamp sentAt", async () => {
    const store = {
      users: makeNUsers(10),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => ({ sent: false, configured: false, provider: "not configured" }),
      claims,
    });
    const result = await auditAndSend(eng, store);
    assert.equal(result.reason, "provider_unconfigured");
    assert.equal(result.deliveryOutcome, "provider_unconfigured");
    assert.equal(result.sent, 0);
    assert.equal(result.softSkipped, 10);
    assert.equal(result.sentAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.deliveryOutcome, "provider_unconfigured");
    const lock = claims.deliveries.get(`${ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID}:__campaign_lock__`);
    assert.equal(lock.status, "failed");
  });

  await test("0/10 all provider failures does not stamp sentAt", async () => {
    const store = {
      users: makeNUsers(10),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => ({ sent: false, configured: true, provider: "test", error: "boom" }),
      claims,
    });
    const result = await auditAndSend(eng, store);
    assert.equal(result.reason, "delivery_failed");
    assert.equal(result.deliveryOutcome, "delivery_failed");
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 10);
    assert.equal(result.sentAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentAt || "", "");
    const lock = claims.deliveries.get(`${ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID}:__campaign_lock__`);
    assert.equal(lock.status, "failed");
  });

  await test("concurrent confirmed sends allow only one campaign claim", async () => {
    const sends = [];
    const store = {
      users: {
        "a@llhprovider.com": {
          email: "a@llhprovider.com",
          accountStatus: "Active",
          signupAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      },
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    let releaseSend;
    const sendGate = new Promise((resolve) => { releaseSend = resolve; });
    const eng = createEmailEngagement({
      sendEmail: async (opts) => {
        sends.push(opts);
        await sendGate;
        return { sent: true, configured: true, provider: "test" };
      },
      SITE_URL: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
      readStore: () => store,
      writeStore: (s) => Object.assign(store, s),
      writeStoreAsync: async (s) => Object.assign(store, s),
      supportEmailTo: () => "leahrivie@gmail.com",
      unsubscribeUrlForEmail: () => "https://littlelearnershubbyleah.com/unsubscribe",
      getAdminEmail: () => "owner@llhprovider.com",
      getSupportEmailStatus: () => ({ ready: true, provider: "test", fromConfigured: true }),
      areAutomationsEnabled: () => false,
      ...claims,
    });

    const audit = await eng.runPreflightAudit({
      store,
      adminEmail: "owner@llhprovider.com",
      nodeEnv: "test",
      allowLocalForTests: true,
    });
    assert.equal(audit.auditPassed, true);

    const p1 = eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    // Let claim land before second attempt.
    await new Promise((r) => setTimeout(r, 20));
    const second = await eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(second.reason, "campaign_already_claimed");
    releaseSend();
    const first = await p1;
    assert.equal(first.skipped, false);
    assert.equal(first.reason, "sent");
    assert.equal(first.sent, 1);
    assert.equal(sends.length, 1);
    const lock = claims.deliveries.get(`${ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID}:__campaign_lock__`);
    assert.ok(lock);
    assert.equal(lock.status, "sent");
  });

  await test("failed/non-owner claim cannot initiate a second send", async () => {
    const store = {
      users: {
        "a@llhprovider.com": {
          email: "a@llhprovider.com",
          accountStatus: "Active",
          signupAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      },
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    // Pre-claim as another process.
    await claims.claimEmailCampaignDelivery({
      campaignId: ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID,
      email: "__campaign_lock__",
      contentHash: "foreign",
    });
    const eng = createEmailEngagement({
      sendEmail: async () => ({ sent: true, configured: true, provider: "test" }),
      SITE_URL: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
      readStore: () => store,
      writeStore: (s) => Object.assign(store, s),
      writeStoreAsync: async (s) => Object.assign(store, s),
      supportEmailTo: () => "leahrivie@gmail.com",
      unsubscribeUrlForEmail: () => "https://littlelearnershubbyleah.com/unsubscribe",
      getAdminEmail: () => "owner@llhprovider.com",
      getSupportEmailStatus: () => ({ ready: true, provider: "test", fromConfigured: true }),
      areAutomationsEnabled: () => false,
      ...claims,
    });
    const audit = await eng.runPreflightAudit({
      store,
      adminEmail: "owner@llhprovider.com",
      nodeEnv: "test",
      allowLocalForTests: true,
    });
    const blocked = await eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(blocked.reason, "campaign_already_claimed");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentAt || "", "");
  });

  await test("forceResend unavailable; welcome stamps untouched by one-time path", async () => {
    const store = {
      users: {
        "a@llhprovider.com": {
          email: "a@llhprovider.com",
          accountStatus: "Active",
          signupAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          onboardingWelcome: {
            freeWelcomeSentAt: "2026-01-01T00:00:00.000Z",
            proWelcomeSentAt: "",
          },
        },
      },
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = createEmailEngagement({
      sendEmail: async () => ({ sent: true, configured: true, provider: "test" }),
      SITE_URL: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
      readStore: () => store,
      writeStore: (s) => Object.assign(store, s),
      writeStoreAsync: async (s) => Object.assign(store, s),
      supportEmailTo: () => "leahrivie@gmail.com",
      unsubscribeUrlForEmail: () => "https://littlelearnershubbyleah.com/unsubscribe",
      getAdminEmail: () => "owner@llhprovider.com",
      getSupportEmailStatus: () => ({ ready: true, provider: "test", fromConfigured: true }),
      areAutomationsEnabled: () => false,
      ...claims,
    });
    const audit = await eng.runPreflightAudit({
      store,
      adminEmail: "owner@llhprovider.com",
      nodeEnv: "test",
      allowLocalForTests: true,
    });
    const forced = await eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: true,
      forceResend: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(forced.reason, "force_resend_unavailable");
    const sent = await eng.sendOneTimeWelcomeUpdate({
      auditToken: audit.auditToken,
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(sent.skipped, false);
    assert.equal(
      store.users["a@llhprovider.com"].onboardingWelcome.freeWelcomeSentAt,
      "2026-01-01T00:00:00.000Z",
    );
    assert.equal(store.users["a@llhprovider.com"].onboardingWelcome.proWelcomeSentAt || "", "");
    const recoverForced = await eng.recoverOneTimeWelcomeUpdate({
      confirm: true,
      forceResend: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(recoverForced.reason, "force_resend_unavailable");
  });

  await test("recovery after 5/10 targets only remaining and never re-sends successes", async () => {
    const sentTo = [];
    let phase = "initial";
    let initialAttempts = 0;
    const store = {
      users: makeNUsers(10),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async (opts) => {
        sentTo.push(opts.to);
        if (phase === "initial") {
          initialAttempts += 1;
          if (initialAttempts <= 5) return { sent: true, configured: true, provider: "test" };
          return { sent: false, configured: true, provider: "test", error: "reject" };
        }
        return { sent: true, configured: true, provider: "test" };
      },
      claims,
    });
    const first = await auditAndSend(eng, store);
    assert.equal(first.sent, 5);
    assert.equal(first.remaining, 5);
    assert.equal(sentTo.length, 10);
    const successful = Object.entries(store.emailEngagement.settings.oneTimeWelcomeUpdate.recipientReceipts)
      .filter(([, r]) => r.status === "sent")
      .map(([email]) => email);
    assert.equal(successful.length, 5);

    phase = "recovery";
    const beforeRecoveryCount = sentTo.length;
    const recovery = await eng.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(recovery.targeted, 5);
    assert.equal(recovery.sent, 10);
    assert.equal(recovery.remaining, 0);
    assert.equal(recovery.reason, "sent");
    assert.ok(recovery.sentAt);
    const recoveryTargets = sentTo.slice(beforeRecoveryCount);
    assert.equal(recoveryTargets.length, 5);
    for (const email of successful) {
      assert.equal(recoveryTargets.includes(email), false, `must not re-send ${email}`);
    }
    const lock = claims.deliveries.get(`${ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID}:__campaign_lock__`);
    assert.equal(lock.status, "sent");
  });

  await test("partial recovery then final recovery", async () => {
    let mode = "fail-second-half";
    let calls = 0;
    const store = {
      users: makeNUsers(10),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => {
        calls += 1;
        if (mode === "fail-second-half") {
          return calls <= 5
            ? { sent: true, configured: true, provider: "test" }
            : { sent: false, configured: true, provider: "test", error: "reject" };
        }
        if (mode === "recover-three") {
          return calls <= 3
            ? { sent: true, configured: true, provider: "test" }
            : { sent: false, configured: true, provider: "test", error: "reject" };
        }
        return { sent: true, configured: true, provider: "test" };
      },
      claims,
    });
    await auditAndSend(eng, store);
    mode = "recover-three";
    calls = 0;
    const mid = await eng.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(mid.sent, 8);
    assert.equal(mid.remaining, 2);
    assert.equal(mid.reason, "partial_delivery");
    assert.equal(mid.sentAt || "", "");

    mode = "recover-rest";
    calls = 0;
    const fin = await eng.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(fin.sent, 10);
    assert.equal(fin.remaining, 0);
    assert.equal(fin.reason, "sent");
    assert.ok(fin.sentAt);
  });

  await test("provider unconfigured then recovery after configure", async () => {
    let configured = false;
    const store = {
      users: makeNUsers(5),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => (configured
        ? { sent: true, configured: true, provider: "test" }
        : { sent: false, configured: false, provider: "not configured" }),
      claims,
    });
    const first = await auditAndSend(eng, store);
    assert.equal(first.reason, "provider_unconfigured");
    assert.equal(first.sent, 0);
    assert.equal(first.sentAt || "", "");
    configured = true;
    const recovery = await eng.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(recovery.reason, "sent");
    assert.equal(recovery.sent, 5);
    assert.ok(recovery.sentAt);
  });

  await test("all failed then recovery succeeds", async () => {
    let ok = false;
    const store = {
      users: makeNUsers(4),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => (ok
        ? { sent: true, configured: true, provider: "test" }
        : { sent: false, configured: true, provider: "test", error: "boom" }),
      claims,
    });
    const first = await auditAndSend(eng, store);
    assert.equal(first.reason, "delivery_failed");
    assert.equal(first.sent, 0);
    ok = true;
    const recovery = await eng.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(recovery.reason, "sent");
    assert.equal(recovery.sent, 4);
  });

  await test("thrown error keeps successes; recovery excludes them", async () => {
    const sentTo = [];
    let recovering = false;
    const store = {
      users: makeNUsers(6),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = createEmailEngagement({
      sendEmail: async (opts) => {
        sentTo.push(opts.to);
        return { sent: true, configured: true, provider: "test" };
      },
      SITE_URL: "https://littlelearnershubbyleah.com",
      htmlEscape: (v) => String(v ?? ""),
      readStore: () => store,
      writeStore: (s) => Object.assign(store, s),
      writeStoreAsync: async (s) => {
        Object.assign(store, s);
        if (recovering) return;
        const sentCount = Object.values(
          s.emailEngagement?.settings?.oneTimeWelcomeUpdate?.recipientReceipts || {},
        ).filter((r) => r.status === "sent").length;
        if (sentCount >= 3 && !s.emailEngagement.settings.oneTimeWelcomeUpdate.deliveryOutcome) {
          throw new Error("boom mid-loop");
        }
      },
      supportEmailTo: () => "leahrivie@gmail.com",
      unsubscribeUrlForEmail: (email) => `https://littlelearnershubbyleah.com/unsubscribe?e=${encodeURIComponent(email)}`,
      getAdminEmail: () => "owner@llhprovider.com",
      getSupportEmailStatus: () => ({ ready: true, provider: "test", fromConfigured: true }),
      areAutomationsEnabled: () => false,
      ...claims,
    });
    const first = await auditAndSend(eng, store);
    assert.equal(first.sentAt || "", "");
    assert.ok(first.sent >= 3);
    const successes = Object.entries(store.emailEngagement.settings.oneTimeWelcomeUpdate.recipientReceipts)
      .filter(([, r]) => r.status === "sent")
      .map(([email]) => email);
    assert.ok(successes.length >= 3);

    recovering = true;
    const before = sentTo.length;
    const recovery = await eng.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    const recoveryTargets = sentTo.slice(before);
    for (const email of successes) {
      assert.equal(recoveryTargets.includes(email), false);
    }
    assert.equal(recovery.reason, "sent");
  });

  await test("unsubscribe and bounce between attempts excluded from recovery", async () => {
    let calls = 0;
    const store = {
      users: makeNUsers(6),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => {
        calls += 1;
        return calls <= 3
          ? { sent: true, configured: true, provider: "test" }
          : { sent: false, configured: true, provider: "test", error: "reject" };
      },
      claims,
    });
    await auditAndSend(eng, store);
    const remaining = eng.listOneTimeRemainingRecipients(
      store,
      store.emailEngagement.settings.oneTimeWelcomeUpdate,
      "owner@llhprovider.com",
    );
    assert.equal(remaining.length, 3);
    store.users[remaining[0]].emailPrefs = { unsubscribedAt: new Date().toISOString() };
    store.users[remaining[1]].emailBounced = true;
    const targeted = [];
    const eng2 = makeEng({
      store,
      sendEmail: async (opts) => {
        targeted.push(opts.to);
        return { sent: true, configured: true, provider: "test" };
      },
      claims,
    });
    const recovery = await eng2.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.equal(targeted.includes(remaining[0]), false);
    assert.equal(targeted.includes(remaining[1]), false);
    assert.equal(targeted.length, 1);
    assert.equal(recovery.sent, 4);
    assert.equal(recovery.remaining, 0);
    assert.equal(recovery.reason, "sent");
  });

  await test("concurrent recovery allows only one attempt", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let calls = 0;
    const store = {
      users: makeNUsers(4),
      messages: [],
      supportTickets: [],
      featureRequests: [],
      bugReports: [],
      feedbackItems: [],
      notifications: [],
      emailEngagement: defaultEmailEngagementStore(),
    };
    const claims = makeClaimHelpers();
    const eng = makeEng({
      store,
      sendEmail: async () => {
        calls += 1;
        if (calls <= 2) return { sent: true, configured: true, provider: "test" };
        return { sent: false, configured: true, provider: "test", error: "reject" };
      },
      claims,
    });
    await auditAndSend(eng, store);
    const engRecover = makeEng({
      store,
      sendEmail: async () => {
        await gate;
        return { sent: true, configured: true, provider: "test" };
      },
      claims,
    });
    const p1 = engRecover.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    await new Promise((r) => setTimeout(r, 20));
    const p2 = await engRecover.recoverOneTimeWelcomeUpdate({
      confirm: true,
      adminEmail: "owner@llhprovider.com",
    });
    assert.ok(
      p2.reason === "recovery_already_in_progress" || p2.reason === "campaign_already_in_progress",
      p2.reason,
    );
    release();
    const first = await p1;
    assert.equal(first.reason, "sent");
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log("All teaching-kits one-time safety tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
