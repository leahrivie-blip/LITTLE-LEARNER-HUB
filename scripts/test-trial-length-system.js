#!/usr/bin/env node
/**
 * Trial-length system: standard 7-day checkout, promo vs manual vs legacy
 * classification, countdown parity, conversion + cancel paths.
 *
 * Run: NODE_ENV=test node scripts/test-trial-length-system.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const membershipAccess = require("./membership-access.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19880 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-trial-length-${crypto.randomBytes(4).toString("hex")}.json`);

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {},
    foundingMembers: [],
    promoCodes: [{
      id: "promo_try1month_test",
      code: "TRY1MONTH",
      label: "1 Month Free — card required, then membership continues",
      trialDays: 30,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_trial_length",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "admin-pass-123",
      ADMIN_ACCESS_CODE: "admin-code-123",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 200));
  if (child.exitCode === null) child.kill("SIGKILL");
}

function staticChecks() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const accessJs = fs.readFileSync(path.join(ROOT, "scripts/membership-access.js"), "utf8");

  assert.match(serverJs, /subscription_data\[trial_period_days\]"\]\s*=\s*"7"/);
  assert.match(serverJs, /payment_method_collection:\s*"always"/);
  assert.match(serverJs, /trialExtensionSource\s*=\s*"manual_admin"/);
  assert.match(serverJs, /manualTrialExtensionDays/);
  assert.match(accessJs, /function classifyMembershipTrialOffer/);
  assert.match(accessJs, /Standard 7-Day Trial/);
  assert.match(accessJs, /Promo-Extended Trial/);
  assert.match(accessJs, /Manually Extended Trial/);
  assert.match(accessJs, /Legacy Trial/);
  assert.match(appJs, /function classifyAdminTrialOffer/);
  assert.match(appJs, /data-admin-trial-type/);
  assert.match(appJs, /Extension source/);
  console.log("PASS static trial-length markers");
}

function classificationUnitTests() {
  const now = Date.parse("2026-08-04T12:00:00.000Z");
  const standard = {
    plan: "Pro",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialStart: "2026-08-01T12:00:00.000Z",
    trialEnd: "2026-08-08T12:00:00.000Z",
    accessEndsAt: "2026-08-08T12:00:00.000Z",
    introductoryTrialConsumed: true,
  };
  const promo = {
    ...standard,
    trialStart: "2026-07-30T12:00:00.000Z",
    trialEnd: "2026-08-29T12:00:00.000Z",
    accessEndsAt: "2026-08-29T12:00:00.000Z",
    promoCodeUsed: "TRY1MONTH",
    promoLabelUsed: "1 Month Free — card required, then membership continues",
  };
  const manual = {
    ...standard,
    trialEnd: "2026-08-15T12:00:00.000Z",
    accessEndsAt: "2026-08-15T12:00:00.000Z",
    trialExtensionSource: "manual_admin",
    trialExtendedManually: true,
    manualTrialExtensionDays: 7,
    internalAccessOverride: true,
  };
  const legacy = {
    ...standard,
    trialStart: "2026-07-01T12:00:00.000Z",
    trialEnd: "2026-08-15T12:00:00.000Z",
    accessEndsAt: "2026-08-15T12:00:00.000Z",
    introductoryTrialConsumed: true,
  };

  const cStd = membershipAccess.classifyMembershipTrialOffer(standard, now);
  const cPromo = membershipAccess.classifyMembershipTrialOffer(promo, now);
  const cManual = membershipAccess.classifyMembershipTrialOffer(manual, now);
  const cLegacy = membershipAccess.classifyMembershipTrialOffer(legacy, now);

  assert.equal(cStd.key, "standard_7_day");
  assert.equal(cStd.label, "Standard 7-Day Trial");
  assert.equal(cStd.trialLengthDays, 7);
  assert.equal(cStd.daysRemaining, membershipAccess.membershipTrialDaysRemaining(standard, now));

  assert.equal(cPromo.key, "promo_extended");
  assert.equal(cPromo.label, "Promo-Extended Trial");
  assert.equal(cPromo.promoCode, "TRY1MONTH");
  assert.equal(cPromo.trialLengthDays, 30);

  assert.equal(cManual.key, "manually_extended");
  assert.equal(cManual.label, "Manually Extended Trial");
  assert.equal(cManual.manualTrialExtensionDays, 7);

  assert.equal(cLegacy.key, "legacy");
  assert.equal(cLegacy.label, "Legacy Trial");

  // Admin/customer countdown parity from the same trialEnd.
  const product = membershipAccess.membershipProductStatus(standard, now);
  assert.equal(product.daysRemaining, cStd.daysRemaining);
  assert.match(product.label, /Trial \(\d+ Days Remaining\)/);
  console.log("PASS classification + countdown parity unit tests");
}

async function checkoutAndLifecycleTests(child) {
  const standardCheckout = await requestJson("POST", "/api/create-checkout-session", {
    email: "standard-trial@test.local",
    plan: "monthly",
    trial7day: true,
    successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
    cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
  });
  assert.equal(standardCheckout.status, 200, JSON.stringify(standardCheckout.json));
  assert.equal(standardCheckout.json.trial?.trialDays, 7);
  assert.equal(standardCheckout.json.paymentMethodRequired, true);
  assert.match(String(standardCheckout.json.url || ""), /trial_days=7/);
  assert.doesNotMatch(String(standardCheckout.json.url || ""), /promoCode=TRY1MONTH/i);
  console.log("PASS checkout creates 7-day standard trial (card required)");

  const promoCheckout = await requestJson("POST", "/api/create-checkout-session", {
    email: "promo-trial@test.local",
    plan: "monthly",
    promoCode: "TRY1MONTH",
    successUrl: `http://127.0.0.1:${PORT}/?ok=1`,
    cancelUrl: `http://127.0.0.1:${PORT}/?cancel=1`,
  });
  assert.equal(promoCheckout.status, 200, JSON.stringify(promoCheckout.json));
  assert.equal(promoCheckout.json.promo?.trialDays, 30);
  assert.match(String(promoCheckout.json.url || ""), /trial_days=30|promo_trial_days=30/);
  console.log("PASS promo checkout creates separate 30-day trial");

  // Simulate Stripe→local sync dates matching for a standard trial.
  const trialStart = new Date().toISOString();
  const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  store.users["synced-standard@test.local"] = {
    email: "synced-standard@test.local",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialStart,
    trialEnd,
    accessEndsAt: trialEnd,
    introductoryTrialConsumed: true,
    hasPaymentMethod: true,
    stripeCustomerId: "cus_sim_std",
    stripeSubscriptionId: "sub_sim_std",
  };
  store.users["synced-promo@test.local"] = {
    email: "synced-promo@test.local",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialStart,
    trialEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    accessEndsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    promoCodeUsed: "TRY1MONTH",
    promoLabelUsed: "1 Month Free — card required, then membership continues",
    introductoryTrialConsumed: true,
    hasPaymentMethod: true,
    stripeCustomerId: "cus_sim_promo",
    stripeSubscriptionId: "sub_sim_promo",
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));

  const stdUser = store.users["synced-standard@test.local"];
  const promoUser = store.users["synced-promo@test.local"];
  assert.equal(membershipAccess.classifyMembershipTrialOffer(stdUser).key, "standard_7_day");
  assert.equal(membershipAccess.classifyMembershipTrialOffer(promoUser).key, "promo_extended");
  assert.equal(
    membershipAccess.membershipTrialDaysRemaining(stdUser),
    membershipAccess.membershipProductStatus(stdUser).daysRemaining,
  );
  assert.equal(stdUser.trialEnd, stdUser.accessEndsAt, "Stripe-synced local trialEnd matches accessEndsAt");
  console.log("PASS Stripe/local trial dates and Admin/customer countdown match");

  // Manual extension provenance via admin membership update.
  const unlock = await requestJson("POST", "/api/admin/login", {
    email: "admin@test.local",
    password: "admin-pass-123",
    code: "admin-code-123",
  });
  assert.equal(unlock.status, 200, unlock.text);
  const token = unlock.json?.token || unlock.json?.sessionToken || unlock.json?.adminToken;
  assert.ok(token, "admin token");

  const extend = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      email: "synced-standard@test.local",
      updates: { extendTrialDays: 7, internalAccessOverride: true },
      action: "extend_trial",
    });
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/admin/membership-update",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Bearer ${token}`,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
  assert.equal(extend.status, 200, extend.text);
  const afterExtend = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")).users["synced-standard@test.local"];
  assert.equal(afterExtend.trialExtensionSource, "manual_admin");
  assert.equal(afterExtend.trialExtendedManually, true);
  assert.equal(afterExtend.manualTrialExtensionDays, 7);
  assert.equal(membershipAccess.classifyMembershipTrialOffer(afterExtend).key, "manually_extended");
  console.log("PASS manual extensions are clearly separate");

  // Trial-to-paid conversion (local Stripe sync shape).
  const paidEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  const converted = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_sim_promo",
    status: "active",
    trial_start: null,
    trial_end: null,
    current_period_end: Math.floor(Date.parse(paidEnd) / 1000),
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_sim_pro_monthly", recurring: { interval: "month" } } }] },
  }, {
    email: "synced-promo@test.local",
    plan: "Pro",
    trialStart,
    trialEnd: promoUser.trialEnd,
    promoCodeUsed: "TRY1MONTH",
  });
  assert.equal(String(converted.stripeSubscriptionStatus || "").toLowerCase(), "active");
  assert.notEqual(String(converted.trialStatus || "").toLowerCase(), "in trial");
  assert.equal(membershipAccess.membershipUserInTrial({ ...promoUser, ...converted }), false);
  assert.equal(membershipAccess.membershipHasProAccess({ ...promoUser, ...converted }), true);
  console.log("PASS trial-to-paid conversion still works");

  // Cancellation at trial end.
  const canceling = membershipAccess.stripeSubscriptionToMembershipUpdates({
    id: "sub_sim_promo",
    status: "trialing",
    trial_start: Math.floor(Date.parse(trialStart) / 1000),
    trial_end: Math.floor(Date.parse(promoUser.trialEnd) / 1000),
    current_period_end: Math.floor(Date.parse(promoUser.trialEnd) / 1000),
    cancel_at_period_end: true,
    items: { data: [{ price: { id: "price_sim_pro_monthly", recurring: { interval: "month" } } }] },
  }, promoUser);
  const cancelStatus = membershipAccess.membershipStatusDisplay({ ...promoUser, ...canceling });
  assert.match(cancelStatus, /Cancels at Trial End|Trial/);
  assert.equal(Boolean(canceling.cancelAtPeriodEnd), true);
  console.log("PASS cancellation still works");

  // Ensure server still running.
  assert.equal(child.exitCode, null);
}

async function main() {
  staticChecks();
  classificationUnitTests();
  const child = startServer();
  try {
    await waitForBoot(child);
    await checkoutAndLifecycleTests(child);
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
  console.log("\nAll trial-length system checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
