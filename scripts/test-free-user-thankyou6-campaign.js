#!/usr/bin/env node
/**
 * THANKYOU6 campaign: eligibility, activity ranking, checkout price, send gates.
 * Run: NODE_ENV=test node scripts/test-free-user-thankyou6-campaign.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const {
  buildThankYou6RecipientDryRun,
  buildEmailContent,
  createFreeUserThankYou6Email,
  validateThankYou6Recipient,
  CONFIRM_PHRASE,
  CAMPAIGN_ID,
  EMAIL_SUBJECT,
  CHECKOUT_PLAN,
  CHECKOUT_PRICE_ENV,
} = require("../server/free-user-thankyou6-email.js");
const { scoreThankYou6Activity } = require("../server/thankyou6-activity-score.js");
const thankYou6Checkout = require("../server/thankyou6-checkout.js");
const thankYou6Eligibility = require("../server/thankyou6-eligibility.js");
const {
  createThankYou6InApp,
  buildInAppContent,
  IN_APP_CONFIRM_PHRASE,
} = require("../server/thankyou6-in-app.js");

const PORT = 19840 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-thankyou6-${crypto.randomBytes(4).toString("hex")}.json`);

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
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(env = {}) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, foundingMembers: [], promoCodes: [], promoRedemptions: [] }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "owner@providermail.com",
      ADMIN_PASSWORD: "thankyou6-admin-pass",
      ADMIN_ACCESS_CODE: "thankyou6-admin-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_sim",
      STRIPE_PUBLISHABLE_KEY: "pk_test_sim",
      STRIPE_WEBHOOK_SECRET: "whsec_sim",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_EARLY_USER_MONTHLY: "price_sim_early_user_monthly",
      EARLY_USER_PRICING_ENABLED: "false",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function waitForHealth(child) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not start: ${child.stderr?.read?.() || ""}`);
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.on("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 2000);
  });
}

function sampleUsers() {
  const users = {
    "active.hot@providermail.com": {
      email: "active.hot@providermail.com",
      firstName: "Hot",
      plan: "Free",
      subscriptionStatus: "Free Plan",
      createdAt: isoDaysAgo(40),
      lastSeenAt: isoDaysAgo(1),
      lastLoginAt: isoDaysAgo(1),
      featureUsage: {
        lesson_plan_view: 8,
        favorite_add: 2,
        calendar_lesson_assigned: 3,
        page_view: 12,
        account_login_complete: 4,
      },
    },
    "active.warm@providermail.com": {
      email: "active.warm@providermail.com",
      firstName: "Warm",
      plan: "Free",
      subscriptionStatus: "Free Plan",
      createdAt: isoDaysAgo(20),
      lastSeenAt: isoDaysAgo(10),
      lastLoginAt: isoDaysAgo(10),
      featureUsage: { lesson_plan_view: 3, page_view: 5, account_login_complete: 2 },
    },
    "stale.power@providermail.com": {
      email: "stale.power@providermail.com",
      firstName: "Stale",
      plan: "Free",
      subscriptionStatus: "Free Plan",
      createdAt: isoDaysAgo(200),
      lastSeenAt: isoDaysAgo(120),
      lastLoginAt: isoDaysAgo(120),
      featureUsage: { lesson_plan_view: 80, favorite_add: 20, page_view: 200 },
    },
    "newest.idle@providermail.com": {
      email: "newest.idle@providermail.com",
      firstName: "Idle",
      plan: "Free",
      subscriptionStatus: "Free Plan",
      createdAt: isoDaysAgo(1),
    },
    "pro.user@providermail.com": {
      email: "pro.user@providermail.com",
      firstName: "Pro",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      subscriptionStatus: "Pro Monthly Subscription Active",
      lastSeenAt: isoDaysAgo(1),
      lastLoginAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 50 },
    },
    "early.user@providermail.com": {
      email: "early.user@providermail.com",
      plan: "Pro",
      billingOffer: "early_user",
      priceLock: "Early User",
      stripeSubscriptionStatus: "active",
      lastSeenAt: isoDaysAgo(1),
      lastLoginAt: isoDaysAgo(1),
    },
    "founding.user@providermail.com": {
      email: "founding.user@providermail.com",
      plan: "Founding",
      foundingMemberActive: true,
      stripeSubscriptionStatus: "active",
      lastSeenAt: isoDaysAgo(1),
    },
    "annual.user@providermail.com": {
      email: "annual.user@providermail.com",
      plan: "Pro",
      subscriptionCadence: "annual",
      stripeSubscriptionStatus: "active",
      lastSeenAt: isoDaysAgo(1),
    },
    "stripe.active@providermail.com": {
      email: "stripe.active@providermail.com",
      plan: "Free",
      stripeSubscriptionStatus: "active",
      stripeSubscriptionId: "sub_paid",
      lastSeenAt: isoDaysAgo(1),
    },
    "paid.history@providermail.com": {
      email: "paid.history@providermail.com",
      plan: "Free",
      lastSuccessfulPaymentAt: isoDaysAgo(30),
      firstPaidInvoiceAt: isoDaysAgo(90),
      lastSeenAt: isoDaysAgo(2),
    },
    "admin.owner@providermail.com": {
      email: "admin.owner@providermail.com",
      plan: "Free",
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { page_view: 9 },
    },
    "test.user@example.com": {
      email: "test.user@example.com",
      plan: "Free",
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { page_view: 9 },
    },
    "unsub.user@providermail.com": {
      email: "unsub.user@providermail.com",
      plan: "Free",
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { page_view: 9 },
      emailPrefs: { marketing: false, unsubscribedAt: isoDaysAgo(3) },
    },
    "trial.user@providermail.com": {
      email: "trial.user@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "trialing",
      trialStatus: "In Trial",
      trialEnd: isoDaysAgo(-5),
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 9 },
    },
    "pastdue.user@providermail.com": {
      email: "pastdue.user@providermail.com",
      plan: "Free",
      stripeSubscriptionStatus: "past_due",
      subscriptionStatus: "Billing Review Required",
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 9 },
    },
    "unpaid.user@providermail.com": {
      email: "unpaid.user@providermail.com",
      plan: "Free",
      stripeSubscriptionStatus: "unpaid",
      subscriptionStatus: "Billing Review Required",
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 9 },
    },
    "canceling.paid@providermail.com": {
      email: "canceling.paid@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: isoDaysAgo(-20),
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 9 },
    },
    "center.paid@providermail.com": {
      email: "center.paid@providermail.com",
      plan: "Pro",
      billingOffer: "center",
      stripeSubscriptionStatus: "active",
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 9 },
    },
    "system.user@providermail.com": {
      email: "system.user@providermail.com",
      plan: "Free",
      systemAccount: true,
      lastSeenAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 9 },
    },
    "llh.prod.flag.free.1785770260@littlelearnershubbyleah.com": {
      email: "llh.prod.flag.free.1785770260@littlelearnershubbyleah.com",
      plan: "Free",
      lastSeenAt: isoDaysAgo(1),
      lastLoginAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 20, page_view: 40 },
    },
    "andvarvele22@gmil.com": {
      email: "andvarvele22@gmil.com",
      plan: "Free",
      lastSeenAt: isoDaysAgo(1),
      lastLoginAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 12, page_view: 18 },
    },
    "provider.real@littlelearnershubbyleah.com": {
      email: "provider.real@littlelearnershubbyleah.com",
      firstName: "Real",
      plan: "Free",
      lastSeenAt: isoDaysAgo(1),
      lastLoginAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 7, page_view: 11 },
    },
  };
  for (let i = 0; i < 30; i += 1) {
    const email = `batch${String(i).padStart(2, "0")}@providermail.com`;
    users[email] = {
      email,
      firstName: `Batch${i}`,
      plan: "Free",
      subscriptionStatus: "Free Plan",
      createdAt: isoDaysAgo(15 + i),
      lastSeenAt: isoDaysAgo(2 + (i % 5)),
      lastLoginAt: isoDaysAgo(2 + (i % 5)),
      featureUsage: {
        lesson_plan_view: 1 + (i % 4),
        page_view: 3 + i,
        account_login_complete: 1,
      },
    };
  }
  return users;
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const emailJs = fs.readFileSync(path.join(ROOT, "server/free-user-thankyou6-email.js"), "utf8");
  const checkoutJs = fs.readFileSync(path.join(ROOT, "server/thankyou6-checkout.js"), "utf8");

  await test("campaign markers and $13.99 checkout stay isolated", () => {
    assert.match(checkoutJs, /FREE_USER_THANKYOU6_AUG2026/);
    assert.match(emailJs, /SEND_THANKYOU6_CAMPAIGN/);
    assert.match(serverJs, /thankYou6Checkout\.resolveCheckoutPlanKey/);
    assert.match(serverJs, /allow_promotion_codes/);
    assert.match(appJs, /adminThankYou6Preview/);
    assert.match(appJs, /SEND_THANKYOU6_CAMPAIGN/);
    assert.match(appJs, /SEND_THANKYOU6_IN_APP/);
    assert.match(appJs, /adminThankYou6InAppPreview/);
    assert.match(serverJs, /thankyou6-in-app\/dry-run/);
    assert.match(serverJs, /SEND_THANKYOU6_IN_APP/);
    assert.equal(CHECKOUT_PLAN, "early_user");
    assert.equal(CHECKOUT_PRICE_ENV, "STRIPE_PRICE_EARLY_USER_MONTHLY");
    assert.equal(thankYou6Checkout.EXCLUDED_PRICE_ENV, "STRIPE_PRICE_PRO_MONTHLY");
    const content = buildEmailContent({ siteUrl: "https://littlelearnershubbyleah.com" });
    assert.equal(content.subject, EMAIL_SUBJECT);
    assert.match(content.text, /THANKYOU6/);
    assert.match(content.ctaUrl, /view=upgrade/);
    assert.match(content.ctaUrl, /plan=early_user/);
    assert.match(content.ctaUrl, /campaign=FREE_USER_THANKYOU6_AUG2026/);
    assert.doesNotMatch(content.ctaUrl, /sk_live|cs_live|price_/);
  });

  await test("stale lifetime usage cannot beat recent engagement", () => {
    const now = Date.now();
    const hot = scoreThankYou6Activity({
      lastSeenAt: isoDaysAgo(1),
      lastLoginAt: isoDaysAgo(1),
      featureUsage: { lesson_plan_view: 4, favorite_add: 1 },
    }, now);
    const stale = scoreThankYou6Activity({
      lastSeenAt: isoDaysAgo(120),
      lastLoginAt: isoDaysAgo(120),
      featureUsage: { lesson_plan_view: 80, favorite_add: 20, page_view: 200 },
    }, now);
    assert.ok(hot.recentEnough);
    assert.equal(stale.recentEnough, false);
    assert.equal(stale.engagementPoints, 0);
    assert.ok(hot.score > stale.score);
  });

  await test("ranking prefers activity, caps at 25, and stops without recency", () => {
    const store = { users: sampleUsers(), emailEngagement: { settings: {}, events: [] } };
    const report = buildThankYou6RecipientDryRun(store, {
      adminEmails: ["admin.owner@providermail.com"],
    });
    assert.equal(report.willSend, false);
    assert.ok(report.counts.selected <= 25);
    assert.ok(report.counts.totalEligible >= report.counts.selected);
    const emails = report.recipients.map((row) => row.email);
    assert.ok(emails.includes("active.hot@providermail.com"));
    assert.ok(!emails.includes("stale.power@providermail.com"));
    assert.ok(!emails.includes("newest.idle@providermail.com"));
    assert.ok(!emails.includes("pro.user@providermail.com"));
    assert.ok(!emails.includes("early.user@providermail.com"));
    assert.ok(!emails.includes("founding.user@providermail.com"));
    assert.ok(!emails.includes("annual.user@providermail.com"));
    assert.ok(!emails.includes("stripe.active@providermail.com"));
    assert.ok(!emails.includes("paid.history@providermail.com"));
    assert.ok(!emails.includes("admin.owner@providermail.com"));
    assert.ok(!emails.includes("test.user@example.com"));
    assert.ok(!emails.includes("unsub.user@providermail.com"));
    assert.ok(!emails.includes("trial.user@providermail.com"));
    assert.ok(!emails.includes("pastdue.user@providermail.com"));
    assert.ok(!emails.includes("unpaid.user@providermail.com"));
    assert.ok(!emails.includes("canceling.paid@providermail.com"));
    assert.ok(!emails.includes("center.paid@providermail.com"));
    assert.ok(!emails.includes("system.user@providermail.com"));
    assert.ok(!emails.includes("llh.prod.flag.free.1785770260@littlelearnershubbyleah.com"));
    assert.ok(!emails.includes("andvarvele22@gmil.com"));
    assert.ok(emails.includes("provider.real@littlelearnershubbyleah.com"));
    assert.ok(report.exclusionTotals.prodFlagAccounts >= 1);
    assert.ok(report.exclusionTotals.suspiciousEmailDomains >= 1);
    assert.ok(report.exclusionTotals.currentlyPaid >= 1);
    assert.ok(report.exclusionTotals.historicallyPaid >= 1);
    const flagTrack = (report.trackedExclusions || []).find((row) => row.email === "llh.prod.flag.free.1785770260@littlelearnershubbyleah.com");
    const gmilTrack = (report.trackedExclusions || []).find((row) => row.email === "andvarvele22@gmil.com");
    assert.ok(flagTrack?.excludeReasons.includes("internal_prod_flag_account"));
    assert.ok(gmilTrack?.excludeReasons.includes("suspicious_email_domain"));
    assert.equal(report.recipients[0].email, "active.hot@providermail.com");
    assert.ok(report.recipients.every((row) => row.noActivePaidSubscription));
    assert.ok(report.recipients.every((row) => row.currentPlan === "Free"));
    const again = buildThankYou6RecipientDryRun(store, {
      adminEmails: ["admin.owner@providermail.com"],
    });
    assert.deepEqual(again.recipients.map((row) => row.email), emails);

    const noRecency = buildThankYou6RecipientDryRun({
      users: {
        "idle.one@providermail.com": { email: "idle.one@providermail.com", plan: "Free", createdAt: isoDaysAgo(2) },
        "idle.two@providermail.com": { email: "idle.two@providermail.com", plan: "Free", createdAt: isoDaysAgo(1) },
      },
    }, { adminEmails: [] });
    assert.equal(noRecency.insufficientActivityData, true);
    assert.equal(noRecency.counts.selected, 0);
    assert.match(noRecency.stopReason, /not falling back/i);
  });

  await test("paid / stripe / early user / founding fail eligibility", () => {
    const paid = validateThankYou6Recipient({
      email: "pro.user@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
    });
    assert.equal(paid.qualifies, false);
    const early = validateThankYou6Recipient({
      email: "early@providermail.com",
      plan: "Pro",
      billingOffer: "early_user",
      priceLock: "Early User",
      stripeSubscriptionStatus: "active",
    });
    assert.equal(early.qualifies, false);
  });

  await test("trial, past_due, unpaid, canceling paid, and system fail eligibility", () => {
    const trial = validateThankYou6Recipient({
      email: "trial.user@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "trialing",
      trialStatus: "In Trial",
      trialEnd: isoDaysAgo(-5),
    });
    assert.equal(trial.qualifies, false);
    assert.ok(trial.excludeReasons.includes("in_trial") || trial.excludeReasons.includes("not_free_access"));

    const pastDue = validateThankYou6Recipient({
      email: "pastdue.user@providermail.com",
      plan: "Free",
      stripeSubscriptionStatus: "past_due",
      subscriptionStatus: "Billing Review Required",
    });
    assert.equal(pastDue.qualifies, false);
    assert.ok(pastDue.excludeReasons.includes("billing_review_or_past_due") || pastDue.excludeReasons.includes("active_paid_stripe"));
    assert.notEqual(pastDue.accessKey, "free");

    const unpaid = validateThankYou6Recipient({
      email: "unpaid.user@providermail.com",
      plan: "Free",
      stripeSubscriptionStatus: "unpaid",
      subscriptionStatus: "Billing Review Required",
    });
    assert.equal(unpaid.qualifies, false);

    const canceling = validateThankYou6Recipient({
      email: "canceling.paid@providermail.com",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: isoDaysAgo(-20),
    });
    assert.equal(canceling.qualifies, false);
    assert.ok(canceling.excludeReasons.includes("canceling_with_paid_access") || canceling.excludeReasons.includes("has_pro_access"));

    const system = validateThankYou6Recipient({
      email: "system.user@providermail.com",
      plan: "Free",
      systemAccount: true,
    });
    assert.equal(system.qualifies, false);
    assert.ok(system.excludeReasons.includes("system_account"));
  });

  await test("prod-flag, owner-test, and QA accounts are excluded; real LLH domain users stay eligible", () => {
    const flag = validateThankYou6Recipient({
      email: "llh.prod.flag.free.1785770260@littlelearnershubbyleah.com",
      plan: "Free",
    });
    assert.equal(flag.qualifies, false);
    assert.ok(flag.excludeReasons.includes("internal_prod_flag_account"));
    assert.equal(thankYou6Eligibility.looksLikeProdFlagEmail(flag.email), true);

    const override = validateThankYou6Recipient({
      email: "override.tester@providermail.com",
      plan: "Free",
      internalAccessOverride: true,
    });
    assert.equal(override.qualifies, false);
    assert.ok(override.excludeReasons.includes("system_account"));

    const qa = validateThankYou6Recipient({
      email: "qa.runner@providermail.com",
      plan: "Free",
      qaAccount: true,
    });
    assert.equal(qa.qualifies, false);

    const real = validateThankYou6Recipient({
      email: "provider.real@littlelearnershubbyleah.com",
      plan: "Free",
    });
    assert.equal(real.qualifies, true);
    assert.equal(real.excludeReasons.includes("internal_prod_flag_account"), false);
  });

  await test("gmil.com is excluded unless a delivered-status proof already exists", () => {
    const suspicious = validateThankYou6Recipient({
      email: "andvarvele22@gmil.com",
      plan: "Free",
    });
    assert.equal(suspicious.qualifies, false);
    assert.ok(suspicious.excludeReasons.includes("suspicious_email_domain"));

    const proven = validateThankYou6Recipient({
      email: "andvarvele22@gmil.com",
      plan: "Free",
      emailDeliveryStatus: "delivered",
      emailDeliveredAt: isoDaysAgo(2),
    });
    assert.equal(proven.qualifies, true);
    assert.equal(proven.excludeReasons.includes("suspicious_email_domain"), false);
  });

  let store = { users: sampleUsers(), emailEngagement: { settings: {}, events: [] } };
  const sent = [];
  const api = createFreeUserThankYou6Email({
    sendEmail: async ({ to, subject }) => {
      sent.push({ to, subject });
      return { sent: true, configured: true, provider: "resend", messageId: `re_${sent.length}` };
    },
    readStore: () => store,
    writeStore: (next) => { store = next; },
    getAdminEmail: () => "admin.owner@providermail.com",
    getSupportEmailStatus: () => ({ ready: true, provider: "resend" }),
    unsubscribeUrlForEmail: (email) => `https://littlelearnershubbyleah.com/unsubscribe?email=${encodeURIComponent(email)}`,
    siteUrl: "https://littlelearnershubbyleah.com",
  });

  await test("test mode blocks production send unless harness flag is set", async () => {
    const blocked = await api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      allowTestHarnessSend: false,
    });
    assert.equal(blocked.reason, "test_mode_blocked");
    assert.equal(blocked.productionCampaignSent, false);
  });

  await test("preview + confirmation + one-time send + no double send", async () => {
    const dry = api.dryRun({ persist: true });
    assert.ok(dry.counts.selected > 0);
    assert.ok(dry.counts.selected <= 25);
    const denied = await api.send({
      confirm: true,
      confirmPhrase: "WRONG",
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(denied.reason, "confirmation_required");
    const before = sent.length;
    const result = await api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(result.skipped, false);
    assert.equal(result.sent, dry.counts.selected);
    assert.equal(result.membershipRecordsModified, false);
    assert.ok(store.emailEngagement.settings.freeUserThankYou6.sentAt);
    const replay = await api.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: dry.dryRunToken,
      confirmationToken: dry.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(replay.reason, "already_sent");
    assert.equal(sent.length, before + dry.counts.selected);
  });

  await test("owner test does not mark production campaign sent", async () => {
    const localStore = { users: {}, emailEngagement: { settings: {}, events: [] } };
    const localSent = [];
    const localApi = createFreeUserThankYou6Email({
      sendEmail: async ({ to }) => {
        localSent.push(to);
        return { sent: true, configured: true, provider: "resend", messageId: "re_test" };
      },
      readStore: () => localStore,
      writeStore: (next) => { Object.assign(localStore, next); },
      getAdminEmail: () => "owner@providermail.com",
      getSupportEmailStatus: () => ({ ready: true, provider: "resend" }),
      unsubscribeUrlForEmail: () => "https://littlelearnershubbyleah.com/unsubscribe",
    });
    const testSend = await localApi.sendTestToOwner({ persist: true });
    assert.equal(testSend.sent, true);
    assert.equal(testSend.productionCampaignSent, false);
    assert.equal(localStore.emailEngagement.settings.freeUserThankYou6.sentAt, "");
    assert.deepEqual(localSent, ["owner@providermail.com"]);
  });

  await test("in-app dry-run writes zero notifications and no channel receipts", async () => {
    const localStore = {
      users: sampleUsers(),
      notifications: [],
      emailEngagement: { settings: {}, events: [] },
    };
    const inApp = createThankYou6InApp({
      readStore: () => localStore,
      writeStore: (next) => { Object.assign(localStore, next); },
      fanOutNotificationsAndPush: async () => {
        throw new Error("fanOut should not run during dry-run");
      },
      getAdminEmail: () => "admin.owner@providermail.com",
      siteUrl: "https://littlelearnershubbyleah.com",
    });
    const preview = inApp.dryRun({ persist: true, adminEmails: ["admin.owner@providermail.com"] });
    assert.equal(preview.willSend, false);
    assert.equal(preview.notificationsWritten, 0);
    assert.equal(localStore.notifications.length, 0);
    assert.equal(preview.channel, "in_app");
    assert.match(preview.inApp.ctaPath, /campaign=FREE_USER_THANKYOU6_AUG2026/);
    assert.match(preview.inApp.ctaPath, /plan=early_user/);
    assert.ok(!preview.recipients.some((row) => row.email === "llh.prod.flag.free.1785770260@littlelearnershubbyleah.com"));
    assert.ok(!preview.recipients.some((row) => row.email === "andvarvele22@gmil.com"));
    assert.ok(!preview.recipients.some((row) => row.email === "unsub.user@providermail.com"));
    assert.ok(preview.recipients.some((row) => row.email === "provider.real@littlelearnershubbyleah.com"));
    assert.ok(preview.recipients.every((row) => row.inAppReceipt === false));
    assert.equal(Boolean(localStore.emailEngagement.settings.freeUserThankYou6.inAppSentAt), false);
    const receipts = localStore.emailEngagement.settings.freeUserThankYou6.recipientReceipts || {};
    assert.equal(Object.keys(receipts).length, 0);
  });

  await test("email and in-app receipts are independent and sending one channel does not send the other", async () => {
    const localStore = {
      users: {
        "active.hot@providermail.com": sampleUsers()["active.hot@providermail.com"],
      },
      notifications: [],
      emailEngagement: { settings: {}, events: [] },
    };
    const sent = [];
    const emailApi = createFreeUserThankYou6Email({
      sendEmail: async ({ to, subject }) => {
        sent.push({ to, subject });
        return { sent: true, configured: true, provider: "resend", messageId: `re_${sent.length}` };
      },
      readStore: () => localStore,
      writeStore: (next) => { Object.assign(localStore, next); },
      getAdminEmail: () => "admin.owner@providermail.com",
      getSupportEmailStatus: () => ({ ready: true, provider: "resend" }),
      unsubscribeUrlForEmail: () => "https://littlelearnershubbyleah.com/unsubscribe",
      siteUrl: "https://littlelearnershubbyleah.com",
    });
    const inApp = createThankYou6InApp({
      readStore: () => localStore,
      writeStore: (next) => { Object.assign(localStore, next); },
      fanOutNotificationsAndPush: async (store, payload) => {
        const now = new Date().toISOString();
        store.notifications = Array.isArray(store.notifications) ? store.notifications : [];
        for (const email of payload.recipients) {
          store.notifications.unshift({
            id: `notif_${email}`,
            email,
            type: payload.type,
            refId: payload.refId,
            title: payload.title,
            preview: payload.preview,
            deepLink: payload.deepLink,
            createdAt: now,
            read: false,
          });
        }
        return { targeted: payload.recipients.length, sent: payload.recipients.length };
      },
      getAdminEmail: () => "admin.owner@providermail.com",
      siteUrl: "https://littlelearnershubbyleah.com",
    });

    const emailDry = emailApi.dryRun({ persist: true });
    const emailResult = await emailApi.send({
      confirm: true,
      confirmPhrase: CONFIRM_PHRASE,
      dryRunToken: emailDry.dryRunToken,
      confirmationToken: emailDry.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(emailResult.skipped, false);
    assert.equal(sent.length, 1);
    assert.equal(localStore.notifications.length, 0);
    assert.equal(Boolean(localStore.emailEngagement.settings.freeUserThankYou6.inAppSentAt), false);

    const inAppDry = inApp.dryRun({ persist: true });
    assert.equal(inAppDry.recipients[0].emailReceipt, true);
    assert.equal(inAppDry.recipients[0].inAppReceipt, false);
    assert.equal(inAppDry.notificationsWritten, 0);
    const denied = await inApp.send({
      confirm: true,
      confirmPhrase: "WRONG",
      dryRunToken: inAppDry.dryRunToken,
      confirmationToken: inAppDry.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(denied.reason, "confirmation_required");
    assert.equal(localStore.notifications.length, 0);

    const inAppResult = await inApp.send({
      confirm: true,
      confirmPhrase: IN_APP_CONFIRM_PHRASE,
      dryRunToken: inAppDry.dryRunToken,
      confirmationToken: inAppDry.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(inAppResult.skipped, false);
    assert.equal(inAppResult.emailSent, false);
    assert.equal(localStore.notifications.length, 1);
    assert.equal(localStore.notifications[0].deepLink, thankYou6Checkout.checkoutCtaPath());
    assert.equal(sent.length, 1);

    const replay = await inApp.send({
      confirm: true,
      confirmPhrase: IN_APP_CONFIRM_PHRASE,
      dryRunToken: inAppDry.dryRunToken,
      confirmationToken: inAppDry.confirmationToken,
      allowTestHarnessSend: true,
    });
    assert.equal(replay.reason, "already_sent");
    assert.equal(localStore.notifications.length, 1);
  });

  await test("in-app content uses only the isolated THANKYOU6 checkout path", () => {
    const content = buildInAppContent({ siteUrl: "https://littlelearnershubbyleah.com" });
    assert.match(content.title, /thank-you/i);
    assert.match(content.body, /THANKYOU6/);
    assert.match(content.ctaPath, /view=upgrade/);
    assert.match(content.ctaPath, /plan=early_user/);
    assert.match(content.ctaPath, /campaign=FREE_USER_THANKYOU6_AUG2026/);
    assert.doesNotMatch(content.ctaPath, /sk_live|cs_live|price_/);
  });

  const child = startServer();
  try {
    await test("test server becomes healthy for checkout checks", async () => {
      await waitForHealth(child);
    });
    await test("flag-off checkout remaps early_user to $19.99 unless THANKYOU6 campaign", async () => {
      const regular = await requestJson("POST", "/api/create-checkout-session", {
        email: "regular@providermail.com",
        plan: "early_user",
      });
      assert.equal(regular.status, 200);
      assert.equal(regular.json.plan, "monthly");
      assert.match(String(regular.json.url || ""), /price_sim_pro_monthly/);
      assert.match(String(regular.json.url || ""), /allow_promotion_codes=true/);

      const campaign = await requestJson("POST", "/api/create-checkout-session", {
        email: "campaign@providermail.com",
        plan: "early_user",
        campaign: CAMPAIGN_ID,
      });
      assert.equal(campaign.status, 200);
      assert.equal(campaign.json.plan, "early_user");
      assert.match(String(campaign.json.url || ""), /price_sim_early_user_monthly/);
      assert.doesNotMatch(String(campaign.json.url || ""), /price_sim_pro_monthly/);
      assert.match(String(campaign.json.url || ""), /allow_promotion_codes=true/);
      assert.match(String(campaign.json.url || ""), /campaign=FREE_USER_THANKYOU6_AUG2026/);
    });

    await test("monthly $19.99 checkout is unchanged", async () => {
      const monthly = await requestJson("POST", "/api/create-checkout-session", {
        email: "monthly@providermail.com",
        plan: "monthly",
      });
      assert.equal(monthly.status, 200);
      assert.equal(monthly.json.plan, "monthly");
      assert.match(String(monthly.json.url || ""), /price_sim_pro_monthly/);
    });

    await test("unauthorized users cannot preview or send THANKYOU6 channels", async () => {
      const emailDry = await requestJson("POST", "/api/admin/thankyou6-email/dry-run", {});
      const inAppDry = await requestJson("POST", "/api/admin/thankyou6-in-app/dry-run", {});
      const emailSend = await requestJson("POST", "/api/admin/thankyou6-email/send", {
        confirm: true,
        confirmPhrase: CONFIRM_PHRASE,
      });
      const inAppSend = await requestJson("POST", "/api/admin/thankyou6-in-app/send", {
        confirm: true,
        confirmPhrase: IN_APP_CONFIRM_PHRASE,
      });
      assert.equal(emailDry.status, 401);
      assert.equal(inAppDry.status, 401);
      assert.equal(emailSend.status, 401);
      assert.equal(inAppSend.status, 401);
    });

    await test("admin in-app dry-run writes zero notifications even when authorized", async () => {
      const login = await requestJson("POST", "/api/admin/login", {
        email: "owner@providermail.com",
        password: "thankyou6-admin-pass",
        code: "thankyou6-admin-code",
      });
      assert.equal(login.status, 200);
      const token = login.json?.token || "";
      const preview = await requestJson("POST", "/api/admin/thankyou6-in-app/dry-run", { adminToken: token }, {
        Authorization: `Bearer ${token}`,
      });
      assert.equal(preview.status, 200);
      assert.equal(preview.json.sent, false);
      assert.equal(preview.json.preview?.notificationsWritten, 0);
      const blocked = await requestJson("POST", "/api/admin/thankyou6-in-app/send", {
        adminToken: token,
        confirm: true,
        confirmPhrase: IN_APP_CONFIRM_PHRASE,
        dryRunToken: preview.json.preview?.dryRunToken,
        confirmationToken: preview.json.preview?.confirmationToken,
      }, {
        Authorization: `Bearer ${token}`,
      });
      assert.ok(blocked.status === 400 || blocked.status === 409);
      assert.equal(blocked.json?.result?.reason, "test_mode_blocked");
      assert.equal(blocked.json?.result?.notificationsWritten, 0);
    });
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
