#!/usr/bin/env node
/**
 * Paid-user in-app check-in: eligibility, preview safety, send isolation.
 * Run: NODE_ENV=test node scripts/test-paid-user-checkin.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const {
  CAMPAIGN_ID,
  CONFIRM_PHRASE,
  TITLE,
  CTA_PATH,
  buildContent,
  buildBody,
  validatePaidCheckinRecipient,
  createPaidUserCheckin,
} = require("../server/paid-user-checkin.js");

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

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function sampleStore() {
  return {
    users: {
      "paid.pro@providermail.com": {
        email: "paid.pro@providermail.com",
        firstName: "Pat",
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(10),
      },
      "paid.early@providermail.com": {
        email: "paid.early@providermail.com",
        firstName: "Early",
        plan: "Pro",
        billingOffer: "early_user",
        priceLock: "Early User",
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(8),
      },
      "paid.founding@providermail.com": {
        email: "paid.founding@providermail.com",
        firstName: "Founder",
        plan: "Founding",
        foundingMemberActive: true,
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(20),
      },
      "paid.annual@providermail.com": {
        email: "paid.annual@providermail.com",
        firstName: "Ann",
        plan: "Pro",
        subscriptionCadence: "annual",
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(40),
      },
      "paid.noname@providermail.com": {
        email: "paid.noname@providermail.com",
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(3),
      },
      "free.user@providermail.com": {
        email: "free.user@providermail.com",
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
      "former.paid@providermail.com": {
        email: "former.paid@providermail.com",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        lastSuccessfulPaymentAt: isoDaysAgo(90),
        firstPaidInvoiceAt: isoDaysAgo(200),
      },
      "trial.only@providermail.com": {
        email: "trial.only@providermail.com",
        plan: "Pro",
        stripeSubscriptionStatus: "trialing",
        trialStatus: "In Trial",
        trialEnd: new Date(Date.now() + 5 * 86400000).toISOString(),
      },
      "admin.owner@providermail.com": {
        email: "admin.owner@providermail.com",
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(2),
      },
      "system.paid@providermail.com": {
        email: "system.paid@providermail.com",
        plan: "Pro",
        systemAccount: true,
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(2),
      },
      "llh.prod.flag.pro.1@littlelearnershubbyleah.com": {
        email: "llh.prod.flag.pro.1@littlelearnershubbyleah.com",
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(2),
      },
      "test.paid@example.com": {
        email: "test.paid@example.com",
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        lastSuccessfulPaymentAt: isoDaysAgo(2),
      },
    },
    notifications: [],
    emailEngagement: {
      settings: {
        freeUserThankYou6: {
          campaignId: "FREE_USER_THANKYOU6_AUG2026",
          sentAt: "already-sent-marker",
          recipientReceipts: { "someone@providermail.com": { email: { sentAt: "x" } } },
        },
      },
      events: [],
    },
  };
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const moduleJs = fs.readFileSync(path.join(ROOT, "server/paid-user-checkin.js"), "utf8");

  await test("campaign is isolated from THANKYOU6", () => {
    assert.equal(CAMPAIGN_ID, "PAID_USER_CHECKIN_AUG2026");
    assert.equal(CONFIRM_PHRASE, "SEND_PAID_USER_CHECKIN_IN_APP");
    assert.match(serverJs, /paid-user-checkin\/dry-run/);
    assert.match(serverJs, /SEND_PAID_USER_CHECKIN_IN_APP/);
    assert.match(appJs, /adminPaidCheckinPreview/);
    assert.doesNotMatch(moduleJs, /FREE_USER_THANKYOU6_AUG2026/);
    assert.doesNotMatch(moduleJs, /THANKYOU6/);
    assert.doesNotMatch(moduleJs, /fanOutNotificationsAndPush/);
    assert.doesNotMatch(moduleJs, /sendEmail/);
    assert.doesNotMatch(buildContent().body, /THANKYOU6|\$7\.99|Upgrade|discount/i);
    assert.equal(CTA_PATH, "/?view=messages");
    assert.equal(TITLE, "How are you liking Little Learner Hub? 💛");
  });

  await test("active paid user qualifies; Free / former-paid / trial-only do not", () => {
    const paid = validatePaidCheckinRecipient({
      email: "paid.pro@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      lastSuccessfulPaymentAt: isoDaysAgo(4),
    });
    assert.equal(paid.qualifies, true);

    const free = validatePaidCheckinRecipient({
      email: "free.user@providermail.com",
      plan: "Free",
    });
    assert.equal(free.qualifies, false);
    assert.ok(free.excludeReasons.includes("not_current_paid"));

    const former = validatePaidCheckinRecipient({
      email: "former.paid@providermail.com",
      plan: "Free",
      lastSuccessfulPaymentAt: isoDaysAgo(90),
      firstPaidInvoiceAt: isoDaysAgo(200),
    });
    assert.equal(former.qualifies, false);
    assert.ok(former.excludeReasons.includes("former_paid_now_free"));

    const trial = validatePaidCheckinRecipient({
      email: "trial.only@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "trialing",
      trialStatus: "In Trial",
      trialEnd: new Date(Date.now() + 5 * 86400000).toISOString(),
    });
    assert.equal(trial.qualifies, false);
    assert.ok(trial.excludeReasons.includes("trial_only_never_paid"));

    const cancelingPaid = validatePaidCheckinRecipient({
      email: "canceling.paid@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() + 12 * 86400000).toISOString(),
      lastSuccessfulPaymentAt: isoDaysAgo(18),
    });
    assert.equal(cancelingPaid.qualifies, true);
  });

  await test("internal / test / admin / prod-flag users do not qualify", () => {
    assert.equal(validatePaidCheckinRecipient({
      email: "system.paid@providermail.com",
      plan: "Pro",
      systemAccount: true,
      stripeSubscriptionStatus: "active",
      lastSuccessfulPaymentAt: isoDaysAgo(2),
    }).qualifies, false);
    assert.equal(validatePaidCheckinRecipient({
      email: "llh.prod.flag.pro.1@littlelearnershubbyleah.com",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      lastSuccessfulPaymentAt: isoDaysAgo(2),
    }).excludeReasons.includes("internal_prod_flag_account"), true);
    assert.equal(validatePaidCheckinRecipient({
      email: "test.paid@example.com",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      lastSuccessfulPaymentAt: isoDaysAgo(2),
    }).qualifies, false);
    assert.equal(validatePaidCheckinRecipient({
      email: "admin.owner@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      lastSuccessfulPaymentAt: isoDaysAgo(2),
    }, { adminEmails: ["admin.owner@providermail.com"] }).qualifies, false);
  });

  await test("no-name user gets a safe greeting", () => {
    assert.equal(buildBody(""), "Hi! I wanted to check in and see how things are going for you with Little Learner Hub. Are you liking it so far? Is there anything you wish was easier, better, or something you would love for me to add? I’m always working on improving it based on what real childcare providers actually need. 💛");
    assert.equal(buildBody("undefined").startsWith("Hi!"), true);
    assert.equal(buildBody("null").startsWith("Hi!"), true);
    assert.doesNotMatch(buildBody(""), /Hi undefined|Hi null|Hi ,/);
    assert.match(buildBody("Pat"), /^Hi Pat!/);
  });

  let store = sampleStore();
  const thankYou6Before = JSON.stringify(store.emailEngagement.settings.freeUserThankYou6);
  const api = createPaidUserCheckin({
    readStore: () => store,
    writeStore: (next) => { store = next; },
    getAdminEmail: () => "admin.owner@providermail.com",
    siteUrl: "https://littlelearnershubbyleah.com",
  });

  await test("preview writes zero notifications and zero receipts", () => {
    const preview = api.dryRun({ persist: true });
    assert.equal(preview.willSend, false);
    assert.equal(preview.emailWillSend, false);
    assert.equal(preview.pushWillSend, false);
    assert.equal(preview.notificationsWritten, 0);
    assert.equal(preview.receiptsWritten, 0);
    assert.equal(store.notifications.length, 0);
    assert.equal(Object.keys(store.inAppCampaigns[CAMPAIGN_ID].recipientReceipts).length, 0);
    assert.ok(preview.recipients.some((row) => row.email === "paid.pro@providermail.com"));
    assert.ok(!preview.recipients.some((row) => row.email === "free.user@providermail.com"));
    assert.ok(!preview.recipients.some((row) => row.email === "former.paid@providermail.com"));
    assert.ok(!preview.recipients.some((row) => row.email === "trial.only@providermail.com"));
    assert.ok(!preview.recipients.some((row) => row.email === "admin.owner@providermail.com"));
    assert.equal(JSON.stringify(store.emailEngagement.settings.freeUserThankYou6), thankYou6Before);
  });

  await test("test mode blocks send unless harness flag is set", async () => {
    const blocked = api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      allowTestHarnessSend: false,
    });
    assert.equal(blocked.reason, "test_mode_blocked");
    assert.equal(store.notifications.length, 0);
  });

  await test("send creates one in-app message per eligible user and zero email/push", () => {
    const usersBefore = JSON.stringify(store.users);
    const preview = api.dryRun({ persist: true });
    const denied = api.send({
      confirm: true,
      confirmPhrase: "WRONG",
      dryRunToken: preview.dryRunToken,
      confirmationToken: preview.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(denied.reason, "confirmation_required");
    const result = api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: preview.dryRunToken,
      confirmationToken: preview.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(result.skipped, false);
    assert.equal(result.sent, preview.counts.selected);
    assert.equal(result.emailsSent, 0);
    assert.equal(result.webPushSent, 0);
    assert.equal(result.emailSent, false);
    assert.equal(store.notifications.length, preview.counts.selected);
    assert.ok(store.notifications.every((row) => row.refId === CAMPAIGN_ID));
    assert.ok(store.notifications.every((row) => row.pushAttempted === false));
    assert.ok(store.notifications.every((row) => row.pushSent === false));
    assert.equal(Object.keys(store.inAppCampaigns[CAMPAIGN_ID].recipientReceipts).length, preview.counts.selected);
    const noName = store.notifications.find((row) => row.email === "paid.noname@providermail.com");
    assert.ok(noName.preview.startsWith("Hi!"));
    assert.doesNotMatch(noName.preview, /Hi undefined|Hi null|Hi ,/);
    assert.equal(JSON.stringify(store.emailEngagement.settings.freeUserThankYou6), thankYou6Before);
    assert.equal(result.membershipRecordsModified, false);
    assert.equal(result.billingRecordsModified, false);
    assert.equal(result.stripeUntouched, true);
    assert.equal(JSON.stringify(store.users), usersBefore);
    assert.equal(preview.suspicious.length, 0);
  });

  await test("duplicate send is blocked and THANKYOU6 receipts stay untouched", () => {
    const before = store.notifications.length;
    const replay = api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      allowTestHarnessSend: true,
    });
    assert.equal(replay.reason, "already_sent");
    assert.equal(store.notifications.length, before);
    assert.equal(JSON.stringify(store.emailEngagement.settings.freeUserThankYou6), thankYou6Before);
  });

  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
