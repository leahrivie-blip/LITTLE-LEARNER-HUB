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
    completeEmailCampaignDelivery: async ({ campaignId, email, status, error = "" }) => {
      const key = `${campaignId}:${String(email || "").trim().toLowerCase()}`;
      const delivery = deliveries.get(key);
      if (delivery) Object.assign(delivery, { status, error, completed_at: new Date().toISOString() });
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
  assert.match(moduleJs, /sentAt only on full success/);
  assert.match(serverJs, /preview-one-time/);
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

  await test("10/10 sent stamps sentAt and lock status sent", async () => {
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
    const lock = claims.deliveries.get(`${ONE_TIME_WELCOME_UPDATE_CAMPAIGN_ID}:__campaign_lock__`);
    assert.equal(lock.status, "sent");
  });

  await test("5/10 partial delivery retains claim and does not stamp sentAt", async () => {
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
    assert.equal(result.sentAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentAt || "", "");
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.sentCount, 5);
    assert.equal(store.emailEngagement.settings.oneTimeWelcomeUpdate.failedCount, 5);
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
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log("All teaching-kits one-time safety tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
