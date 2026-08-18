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
    assert.equal(report.recipients[0].email, "active.hot@providermail.com");
    assert.ok(report.recipients.every((row) => row.noActivePaidSubscription));
    assert.ok(report.recipients.every((row) => row.currentPlan === "Free"));

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
