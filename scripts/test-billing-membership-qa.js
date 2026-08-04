#!/usr/bin/env node
/**
 * Membership & billing regression tests — cancellation access, founding policy, admin fields.
 * Run: node scripts/test-billing-membership-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const membershipAccess = require("./membership-access.js");
const stripeBillingReconciliation = require("./stripe-billing-reconciliation.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19500 + Math.floor(Math.random() * 30);
const STORE_PATH = path.join(os.tmpdir(), `llh-billing-qa-${crypto.randomBytes(4).toString("hex")}.json`);
const FOUNDING_LIMIT = 48;
const PUBLIC_CLAIMED_BASE = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: options.port || PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(options.headers || {}),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
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

function startServer(envOverrides = {}) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "billing-qa@test.local",
      ADMIN_PASSWORD: "billing-qa-pass",
      ADMIN_ACCESS_CODE: "billing-qa-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: String(FOUNDING_LIMIT),
      PUBLIC_FOUNDING_CLAIMED_BASE: String(PUBLIC_CLAIMED_BASE),
      // Suite personas use @billing.test — include them in admin analytics assertions.
      ANALYTICS_INCLUDE_TEST_ACCOUNTS: "true",
      NODE_ENV: "test",
      // Enabled by default for this suite so the reconciliation apply endpoint's other
      // safeguards (auth, confirm, preview flow, hostname) can be exercised; the
      // "disabled by default" behavior itself is verified separately with its own
      // short-lived server that omits this override (see 9k).
      ALLOW_BILLING_RECONCILIATION: "true",
      ...envOverrides,
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
      const res = await requestJson("GET", "/api/founding-status");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function simulateStripeSubscriptionUpdated(user, subscription, eventType = "updated") {
  return membershipAccess.stripeSubscriptionToMembershipUpdates(subscription, user, eventType);
}

async function runBrowserChecks(baseUrl) {
  let playwright;
  try { playwright = require("playwright"); } catch { return { skipped: true }; }

  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();

  async function checkPersona(email, account, expectations) {
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(({ email, account }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({ [email]: account }));
      localStorage.setItem("llhPlan", account.plan);
    }, { email, account });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof isProUser === "function" && typeof effectiveAccessPlan === "function", null, { timeout: 60000 });
    await page.waitForResponse((r) => r.url().includes("/api/subscription-status") && r.status() === 200, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(
      (needsPro) => typeof isProUser === "function" && isProUser() === needsPro,
      expectations.proAccess,
      { timeout: 60000 },
    ).catch(async () => {
      const debug = await page.evaluate(() => ({
        isPro: typeof isProUser === "function" ? isProUser() : null,
        effective: typeof effectiveAccessPlan === "function" ? effectiveAccessPlan() : null,
        status: currentAccount?.()?.subscriptionStatus,
      }));
      throw new Error(`${email}: isProUser mismatch — expected ${expectations.proAccess}, got ${JSON.stringify(debug)}`);
    });
    const labels = await page.evaluate(() => ({
      planLabel: typeof billingPlanLabel === "function" ? billingPlanLabel() : null,
      effective: typeof effectiveAccessPlan === "function" ? effectiveAccessPlan() : null,
      price: typeof billingPriceLabel === "function" ? billingPriceLabel() : null,
      adminBillingStatus: typeof adminMembershipStatusLabel === "function" ? adminMembershipStatusLabel(currentAccount()) : null,
    }));
    if (expectations.planLabel) assert(labels.planLabel === expectations.planLabel, `${email}: expected label ${expectations.planLabel}, got ${labels.planLabel}`);
    if (expectations.price) assert(labels.price === expectations.price, `${email}: expected price ${expectations.price}, got ${labels.price}`);
    if (expectations.effective) assert(labels.effective === expectations.effective, `${email}: expected effective ${expectations.effective}, got ${labels.effective}`);
    if (expectations.adminBillingStatus) assert(labels.adminBillingStatus === expectations.adminBillingStatus, `${email}: expected admin billing status ${expectations.adminBillingStatus}, got ${labels.adminBillingStatus}`);
  }

  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  await checkPersona("free@billing.test", { email: "free@billing.test", plan: "Free", subscriptionStatus: "Free Plan" }, {
    proAccess: false, planLabel: "Free", price: "$0/month", effective: "Free", adminBillingStatus: "No paid subscription",
  });
  await checkPersona("trial@billing.test", {
    email: "trial@billing.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription trialing",
    trialStatus: "In Trial", trialStart: now, trialEnd: future, stripeSubscriptionStatus: "trialing",
    subscriptionStartedAt: now,
  }, { proAccess: true, planLabel: "Trial", price: "$19.99/month", effective: "Pro" });
  await checkPersona("pro@billing.test", {
    email: "pro@billing.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active", currentPeriodEnd: future, accessEndsAt: future,
    subscriptionStartedAt: now, monthlyPrice: "$19.99/month",
  }, { proAccess: true, planLabel: "Pro", price: "$19.99/month", effective: "Pro" });
  await checkPersona("founding@billing.test", {
    email: "founding@billing.test", plan: "Founding", subscriptionStatus: "Founding Member Subscription Active",
    foundingMemberActive: true, foundingMemberHistorical: true, foundingMember: true,
    foundingMemberNumber: 5, stripeSubscriptionStatus: "active", currentPeriodEnd: future,
    subscriptionStartedAt: now, monthlyPrice: "$9.99/month", priceLock: "Lifetime",
  }, { proAccess: true, planLabel: "Founding Member", price: "$9.99/month", effective: "Founding" });
  // Regression: checkout completion used to omit stripeSubscriptionStatus/period end, and the UI showed Free.
  {
    const store = readStore();
    store.users = store.users || {};
    store.users["founding-nosync@billing.test"] = {
      email: "founding-nosync@billing.test",
      plan: "Founding",
      subscriptionStatus: "Founding Member Subscription Active",
      foundingMemberActive: true,
      foundingMemberHistorical: true,
      foundingMember: true,
      foundingMemberNumber: 12,
      monthlyPrice: "$9.99/month",
      priceLock: "Lifetime",
      subscriptionStartedAt: now,
      updatedAt: now,
    };
    writeStore(store);
  }
  await checkPersona("founding-nosync@billing.test", {
    email: "founding-nosync@billing.test",
    plan: "Founding",
    subscriptionStatus: "Founding Member Subscription Active",
    foundingMemberActive: true,
    foundingMemberHistorical: true,
    foundingMember: true,
    foundingMemberNumber: 12,
    monthlyPrice: "$9.99/month",
    priceLock: "Lifetime",
    subscriptionStartedAt: now,
  }, { proAccess: true, planLabel: "Founding Member", price: "$9.99/month", effective: "Founding" });
  await checkPersona("canceling@billing.test", {
    email: "canceling@billing.test", plan: "Pro", subscriptionStatus: `Canceled — Access Ends ${new Date(future).toLocaleDateString()}`,
    stripeSubscriptionStatus: "active", cancelAtPeriodEnd: true, accessEndsAt: future, currentPeriodEnd: future,
    monthlyPrice: "$19.99/month",
  }, { proAccess: true, planLabel: "Pro", price: "$19.99/month", effective: "Pro" });

  await browser.close();
  return { ok: true };
}

function seedPersonas() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const store = readStore();
  store.users = store.users || {};
  store.users["free@billing.test"] = { email: "free@billing.test", plan: "Free", subscriptionStatus: "Free Plan", updatedAt: now };
  store.users["trial@billing.test"] = {
    email: "trial@billing.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription trialing",
    trialStatus: "In Trial", trialStart: now, trialEnd: future, stripeSubscriptionStatus: "trialing",
    subscriptionStartedAt: now, monthlyPrice: "$19.99/month", updatedAt: now,
  };
  store.users["pro@billing.test"] = {
    email: "pro@billing.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active", currentPeriodEnd: future, accessEndsAt: future,
    subscriptionStartedAt: now, monthlyPrice: "$19.99/month", updatedAt: now,
  };
  store.users["founding@billing.test"] = {
    email: "founding@billing.test", plan: "Founding", subscriptionStatus: "Founding Member Subscription Active",
    foundingMemberActive: true, foundingMemberHistorical: true, foundingMember: true,
    foundingMemberNumber: 5, stripeSubscriptionStatus: "active", currentPeriodEnd: future,
    subscriptionStartedAt: now, monthlyPrice: "$9.99/month", priceLock: "Lifetime", updatedAt: now,
  };
  store.users["canceling@billing.test"] = {
    email: "canceling@billing.test", plan: "Pro",
    subscriptionStatus: `Canceled — Access Ends ${new Date(future).toLocaleDateString()}`,
    stripeSubscriptionStatus: "active", cancelAtPeriodEnd: true, accessEndsAt: future, currentPeriodEnd: future,
    monthlyPrice: "$19.99/month", updatedAt: now,
  };
  writeStore(store);
}

function seedSoldOutFounding() {
  const store = readStore();
  const slots = FOUNDING_LIMIT - PUBLIC_CLAIMED_BASE;
  store.foundingMembers = Array.from({ length: slots }, (_, i) => `founding-slot-${i}@test.local`);
  writeStore(store);
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  console.log("1) Static billing logic checks");
  assert(!/monthlyPrice[^)]*includes\(["']9\.99["']\)/.test(appJs), "app.js still uses monthlyPrice.includes('9.99') for founding detection");
  assert(appJs.includes("function isFoundingSubscription"), "isFoundingSubscription helper missing");
  assert(appJs.includes("foundingMemberActive"), "foundingMemberActive field missing from app.js");
  assert(appJs.includes("cancelSubscriptionEndpoint"), "cancel subscription endpoint config missing");
  assert(!/foundingSpotsRemaining\(\) <= 0 \? "monthly"/.test(appJs), "startCheckout still silently falls back to monthly when founding sold out");
  assert(appJs.includes("Refresh from Stripe"), "Admin Refresh from Stripe control missing");
  assert(appJs.includes("adminRefreshSubscriptionFromStripe"), "Admin Stripe refresh helper missing");
  assert(appJs.includes("forceRefresh"), "Client forceRefresh subscription sync missing");
  assert(appJs.includes("suppressBootLanding"), "Boot navigation race guard missing");
  assert(appJs.includes("pendingAuthReturnView"), "Post-login return view restore missing");

  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert(serverJs.includes("applyCheckoutMembershipUpgrade"), "Shared checkout membership upgrade helper missing");
  assert(serverJs.includes("stripeSubscriptionStatus"), "Checkout statusForPlan must set stripeSubscriptionStatus");
  assert(serverJs.includes("/api/admin/subscription-refresh"), "Admin subscription refresh endpoint missing");
  assert(serverJs.includes("/api/admin/billing-reconciliation"), "Admin read-only billing reconciliation endpoint missing");
  assert(serverJs.includes("markProcessedStripeEvent"), "Webhook idempotency marker missing");
  assert(serverJs.includes("invoice.paid"), "invoice.paid webhook handling missing");

  console.log("2) Shared membership-access policy unit checks");
  const periodEndFuture = Math.floor((Date.now() + 20 * 86400000) / 1000);
  const periodEndPast = Math.floor((Date.now() - 86400000) / 1000);
  const futureIso = new Date(periodEndFuture * 1000).toISOString();
  const pastIso = new Date(periodEndPast * 1000).toISOString();

  const scenarios = [
    {
      name: "brand-new Free",
      user: { plan: "Free", subscriptionStatus: "Free Plan", trialStatus: "No Trial" },
      access: "free", billing: "never_subscribed", label: "No paid subscription", pro: false,
    },
    {
      name: "abandoned checkout",
      user: { plan: "Free", subscriptionStatus: "Checkout Started", pendingPlan: "monthly" },
      access: "free", billing: "never_subscribed", label: "No paid subscription", pro: false,
    },
    {
      name: "Stripe customer without subscription",
      user: { plan: "Free", subscriptionStatus: "Free Plan", stripeCustomerId: "cus_only" },
      access: "free", billing: "never_subscribed", label: "No paid subscription", pro: false,
    },
    {
      name: "active trial",
      user: { plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Trialing", stripeSubscriptionStatus: "trialing", trialStatus: "In Trial", trialStart: new Date().toISOString(), trialEnd: futureIso },
      access: "trial", billing: "active", label: "Trial Active", pro: true,
    },
    {
      name: "trial canceled with remaining access",
      user: { plan: "Pro", subscriptionStatus: "Canceled — Access Ends soon (Trial — no future charge)", stripeSubscriptionStatus: "trialing", trialStatus: "In Trial", trialEnd: futureIso, cancelAtPeriodEnd: true },
      access: "trial", billing: "canceling", label: "Cancels at Trial End", pro: true,
    },
    {
      name: "expired trial",
      user: { plan: "Pro", subscriptionStatus: "Trial Ended", stripeSubscriptionStatus: "trialing", trialStatus: "Trial Ended", trialStart: pastIso, trialEnd: pastIso },
      access: "free", billing: "ended", label: "Trial Ended", pro: false,
    },
    {
      name: "canceled expired trial",
      user: { plan: "Free", subscriptionStatus: "Trial Ended", stripeSubscriptionStatus: "canceled", trialStatus: "Trial Canceled", trialStart: pastIso, trialEnd: pastIso },
      access: "free", billing: "canceled", label: "Trial Canceled", pro: false,
    },
    {
      name: "active Pro",
      user: { plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", stripeSubscriptionStatus: "active", currentPeriodEnd: futureIso },
      access: "pro", billing: "active", label: "Active", pro: true,
    },
    {
      name: "Pro scheduled to cancel",
      user: { plan: "Pro", subscriptionStatus: "Canceled — Access Ends soon", stripeSubscriptionStatus: "active", currentPeriodEnd: futureIso, cancelAtPeriodEnd: true },
      access: "pro", billing: "canceling", label: "Cancels at Period End", pro: true,
    },
    {
      name: "ended Pro",
      user: { plan: "Free", previousPlan: "Pro", subscriptionStatus: "Subscription Ended", stripeSubscriptionStatus: "canceled", stripeSubscriptionId: "sub_ended", subscriptionEndedAt: pastIso },
      access: "free", billing: "ended", label: "Subscription Ended", pro: false,
    },
    {
      name: "active Founding",
      user: { plan: "Founding", foundingMemberActive: true, foundingMemberHistorical: true, subscriptionStatus: "Founding Member Subscription Active", stripeSubscriptionStatus: "active" },
      access: "founding", billing: "active", label: "Active", pro: true,
    },
    {
      name: "Founding scheduled to cancel",
      user: { plan: "Founding", foundingMemberActive: true, foundingMemberHistorical: true, subscriptionStatus: "Canceled — Access Ends soon", stripeSubscriptionStatus: "active", currentPeriodEnd: futureIso, cancelAtPeriodEnd: true },
      access: "founding", billing: "canceling", label: "Cancels at Period End", pro: true,
    },
    {
      // Confirmed mapping: past_due/unpaid are never canceled/ended — they always display
      // as the single neutral "Billing Review Required" label (never "Past Due"/"Payment
      // Failed"/"Ended").
      name: "past due",
      user: { plan: "Pro", subscriptionStatus: "Billing Review Required", stripeSubscriptionStatus: "past_due" },
      access: "past_due", billing: "payment_failed", label: "Billing Review Required", pro: false,
    },
    {
      name: "unpaid (never canceled/ended)",
      user: { plan: "Pro", subscriptionStatus: "Billing Review Required", stripeSubscriptionStatus: "unpaid" },
      access: "past_due", billing: "payment_failed", label: "Billing Review Required", pro: false,
    },
    {
      name: "promo only",
      user: { plan: "Free", subscriptionStatus: "Free Plan", promoRedeemedAt: new Date().toISOString() },
      access: "free", billing: "never_subscribed", label: "No paid subscription", pro: false,
    },
    {
      name: "manual upgrade",
      user: { plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", internalAccessOverride: true },
      access: "pro", billing: "never_subscribed", label: "No paid subscription", pro: true,
    },
    {
      name: "admin account without billing override",
      user: { plan: "Free", subscriptionStatus: "Free Plan", role: "admin" },
      access: "free", billing: "never_subscribed", label: "No paid subscription", pro: false,
    },
    {
      name: "disabled account cannot retain manual Pro access",
      user: { plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", internalAccessOverride: true, accountStatus: "Disabled" },
      access: "free", billing: "never_subscribed", label: "No paid subscription", pro: false,
    },
    {
      name: "disabled legacy manual grant retains non-billing source marker",
      user: { plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", manualAccessGranted: true, accountStatus: "Disabled" },
      access: "free", billing: "never_subscribed", label: "No paid subscription", pro: false,
    },
    {
      name: "manual account converted to Stripe",
      user: { plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", internalAccessOverride: true, manualAccessGranted: true, stripeSubscriptionStatus: "active", stripeSubscriptionId: "sub_converted_manual" },
      access: "pro", billing: "active", label: "Active", pro: true,
    },
  ];
  for (const scenario of scenarios) {
    assert(membershipAccess.membershipCurrentAccessKey(scenario.user) === scenario.access, `${scenario.name}: current access`);
    assert(membershipAccess.membershipBillingStatusKey(scenario.user) === scenario.billing, `${scenario.name}: billing bucket`);
    assert(membershipAccess.membershipStatusDisplay(scenario.user) === scenario.label, `${scenario.name}: billing label`);
    assert(membershipAccess.membershipHasProAccess(scenario.user) === scenario.pro, `${scenario.name}: permission`);
  }

  const paidAfterTrialEnds = simulateStripeSubscriptionUpdated(
    {
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      subscriptionStatus: "Pro Monthly Subscription Active",
      trialStatus: "Trial Ended",
      trialStart: pastIso,
      trialEnd: pastIso,
    },
    { status: "canceled", current_period_end: periodEndPast, trial_end: periodEndPast },
    "deleted",
  );
  assert(paidAfterTrialEnds.subscriptionStatus === "Subscription Ended", "Former trial converted to paid must end as a paid subscription");
  assert(paidAfterTrialEnds.previousPlan === "Pro", "Former trial converted to paid retains paid previous plan");

  const stripeConversion = simulateStripeSubscriptionUpdated(
    { plan: "Pro", internalAccessOverride: true, manualAccessGranted: true },
    { status: "active", current_period_end: periodEndFuture },
  );
  assert(stripeConversion.internalAccessOverride === false, "Confirmed Stripe subscription clears manual override");
  assert(stripeConversion.manualAccessGranted === false, "Confirmed Stripe subscription clears manual grant marker");

  const pastDueLock = simulateStripeSubscriptionUpdated(
    {
      plan: "Founding",
      foundingMemberActive: true,
      foundingMemberHistorical: true,
      subscriptionStatus: "Founding Member Subscription Active",
      stripeSubscriptionStatus: "active",
    },
    { status: "past_due", current_period_end: periodEndFuture },
  );
  assert(pastDueLock.plan === "Free", "past_due webhook must store Free plan (not stale Founding/Pro label)");
  assert(pastDueLock.foundingMemberActive === false, "past_due must clear foundingMemberActive");
  assert(pastDueLock.foundingMemberHistorical === true, "past_due preserves founding history");
  assert(String(pastDueLock.subscriptionStatus || "").toLowerCase().includes("billing review required"), "past_due status label reads Billing Review Required, never Past Due/Ended");
  assert(membershipAccess.membershipHasProAccess({ ...pastDueLock, stripeSubscriptionStatus: "past_due" }) === false, "past_due locks Pro access");

  console.log("2b) Repair script protects converted paid accounts and writes a backup");
  {
    const repairStorePath = path.join(os.tmpdir(), `llh-repair-test-${crypto.randomBytes(4).toString("hex")}.json`);
    const repairOutputDir = path.join(os.tmpdir(), `llh-repair-reports-${crypto.randomBytes(4).toString("hex")}`);
    const repairStore = {
      users: {
        "converted@test": {
          email: "converted@test",
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
          stripeSubscriptionStatus: "active",
          stripeSubscriptionId: "sub_converted",
          trialStatus: "Trial Ended",
          trialStart: pastIso,
          trialEnd: pastIso,
        },
        "expired-trial@test": {
          email: "expired-trial@test",
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Trialing",
          stripeSubscriptionStatus: "trialing",
          trialStatus: "In Trial",
          trialStart: pastIso,
          trialEnd: pastIso,
        },
      },
    };
    fs.writeFileSync(repairStorePath, JSON.stringify(repairStore, null, 2));
    const refusedOnlineRun = spawnSync(process.execPath, [
      "scripts/audit-repair-subscription-statuses.js",
      `--input=${repairStorePath}`,
      "--apply",
    ], {
      cwd: ROOT,
      env: { ...process.env, SUBSCRIPTION_AUDIT_DIR: repairOutputDir },
      encoding: "utf8",
    });
    assert(refusedOnlineRun.status === 2, "Repair apply requires explicit offline confirmation");
    const repairRun = spawnSync(process.execPath, [
      "scripts/audit-repair-subscription-statuses.js",
      `--input=${repairStorePath}`,
      "--apply",
      "--offline-confirmed",
    ], {
      cwd: ROOT,
      env: { ...process.env, SUBSCRIPTION_AUDIT_DIR: repairOutputDir },
      encoding: "utf8",
    });
    assert(repairRun.status === 0, `Repair script failed: ${repairRun.stderr || repairRun.stdout}`);
    const repaired = JSON.parse(fs.readFileSync(repairStorePath, "utf8"));
    assert(repaired.users["converted@test"].plan === "Pro", "Repair must not downgrade paid user with historical trial dates");
    assert(repaired.users["expired-trial@test"].plan === "Free", "Repair downgrades a verifiably expired current trial");
    assert(fs.readdirSync(repairOutputDir).some((file) => file.startsWith("subscription-backup-")), "Repair writes backup before apply");
    fs.rmSync(repairStorePath, { force: true });
    fs.rmSync(repairOutputDir, { recursive: true, force: true });
  }

  const cancelScheduled = simulateStripeSubscriptionUpdated(
    { plan: "Pro", foundingMemberActive: false },
    { status: "active", cancel_at_period_end: true, current_period_end: periodEndFuture },
  );
  assert(cancelScheduled.plan === "Pro", "Cancel scheduled should keep Pro plan until period end");
  assert(cancelScheduled.subscriptionStatus.includes("Canceled — Access Ends"), "Cancel status label required");
  assert(membershipAccess.membershipHasProAccess(cancelScheduled), "Paid user canceling keeps access through current_period_end");

  const ended = simulateStripeSubscriptionUpdated(
    { plan: "Pro" },
    { status: "canceled", current_period_end: periodEndPast },
    "deleted",
  );
  assert(ended.plan === "Free", "Access changes to Free after current_period_end");
  assert(!membershipAccess.membershipHasProAccess(ended), "Ended subscription has no Pro access");

  const trialCancel = simulateStripeSubscriptionUpdated(
    { plan: "Pro", trialStatus: "In Trial" },
    { status: "trialing", cancel_at_period_end: true, trial_end: periodEndFuture, current_period_end: periodEndFuture },
  );
  assert(trialCancel.subscriptionStatus.includes("Trial — no future charge"), "Trial cancel prevents future charge label");
  assert(membershipAccess.membershipHasProAccess(trialCancel), "Trial canceled before charge keeps access through trial end");

  const formerFounding = {
    plan: "Free",
    subscriptionStatus: "Canceled and Ended",
    foundingMember: true,
    foundingMemberHistorical: true,
    foundingMemberActive: false,
    foundingMemberNumber: 3,
  };
  assert(!membershipAccess.membershipHasProAccess(formerFounding), "Historical foundingMember alone does not provide Pro access");
  assert(membershipAccess.membershipFoundingHistorical(formerFounding), "Historical founding flag preserved");
  assert(!membershipAccess.membershipFoundingActive(formerFounding), "Former founding member is not active founding");

  const foundingPreserved = simulateStripeSubscriptionUpdated(
    {
      plan: "Founding",
      foundingMemberActive: true,
      foundingMemberHistorical: true,
      foundingMemberNumber: 7,
      monthlyPrice: "$9.99/month",
    },
    { status: "active", cancel_at_period_end: false, current_period_end: periodEndFuture },
  );
  assert(foundingPreserved.plan === "Founding", "Ambiguous Stripe sync must not demote active founding to Pro");
  assert(foundingPreserved.foundingMemberActive === true, "Ambiguous Stripe sync must keep foundingMemberActive");
  assert(foundingPreserved.monthlyPrice === "$9.99/month", "Ambiguous Stripe sync must keep founding price at $9.99/month");

  const foundingFromAmount = simulateStripeSubscriptionUpdated(
    { plan: "Pro", foundingMemberActive: false },
    {
      status: "active",
      current_period_end: periodEndFuture,
      items: { data: [{ price: { id: "price_unknown", unit_amount: 999, nickname: "Founding Monthly" } }] },
    },
  );
  assert(foundingFromAmount.plan === "Founding", "Stripe $9.99 unit_amount should resolve to Founding");
  assert(foundingFromAmount.monthlyPrice === "$9.99/month", "Stripe $9.99 unit_amount should set $9.99/month");

  const explicitMonthlyUpgrade = simulateStripeSubscriptionUpdated(
    {
      plan: "Founding",
      foundingMemberActive: true,
      foundingMemberHistorical: true,
      monthlyPrice: "$9.99/month",
    },
    {
      status: "active",
      metadata: { plan: "monthly" },
      current_period_end: periodEndFuture,
    },
  );
  assert(explicitMonthlyUpgrade.plan === "Pro", "Explicit monthly metadata may upgrade founding off $9.99");
  assert(explicitMonthlyUpgrade.monthlyPrice === "$19.99/month", "Explicit monthly metadata should charge $19.99/month");
  assert(explicitMonthlyUpgrade.foundingMemberActive === false, "Explicit monthly upgrade clears active founding pricing");

  const child = startServer();
  try {
    await waitForBoot(child);

    console.log("3) Founding limit & sold-out API");
    let founding = await requestJson("GET", "/api/founding-status");
    const foundingPayload = founding.json.founding || founding.json;
    // Founding acquisition is permanently closed — remaining is always 0 even on a fresh store.
    assert(foundingPayload.limit === FOUNDING_LIMIT, `Founding limit should be ${FOUNDING_LIMIT}`);
    assert(foundingPayload.remaining === 0, "Closed founding acquisition should report 0 remaining spots");
    assert(foundingPayload.acquisitionClosed === true || foundingPayload.soldOut === true, "Founding should be closed/sold out");

    seedSoldOutFounding();
    founding = await requestJson("GET", "/api/founding-status");
    const soldOutPayload = founding.json.founding || founding.json;
    assert(soldOutPayload.remaining === 0, "All founding spots should remain closed");
    assert(soldOutPayload.soldOut === true, "soldOut flag should be true");
    assert(soldOutPayload.limit === FOUNDING_LIMIT, `Sold-out payload limit should stay ${FOUNDING_LIMIT}`);

    console.log("4) Former founding member cannot auto-restart at $9.99 checkout");
    {
      const store = readStore();
      store.users = store.users || {};
      store.users["former-founding@billing.test"] = {
        email: "former-founding@billing.test",
        plan: "Free",
        subscriptionStatus: "Canceled and Ended",
        foundingMember: true,
        foundingMemberHistorical: true,
        foundingMemberActive: false,
        foundingMemberNumber: 3,
        updatedAt: new Date().toISOString(),
      };
      store.foundingMembers = store.foundingMembers || [];
      if (!store.foundingMembers.includes("former-founding@billing.test")) {
        store.foundingMembers.push("former-founding@billing.test");
      }
      writeStore(store);
    }
    const formerCheckout = await requestJson("POST", "/api/create-checkout-session", {
      email: "former-founding@billing.test",
      plan: "founding",
      successUrl: `http://127.0.0.1:${PORT}/?checkout=success`,
      cancelUrl: `http://127.0.0.1:${PORT}/?checkout=cancel`,
    });
    if (formerCheckout.status !== 503) {
      assert(formerCheckout.status === 400, `Former founding checkout must return 400, got ${formerCheckout.status}`);
      assert(formerCheckout.json?.formerFounding === true, "formerFounding flag required");
    }

    console.log("5) Cancel subscription API schedules period-end access");
    seedPersonas();
    const cancelUnauth = await requestJson("POST", "/api/cancel-subscription", { email: "pro@billing.test" });
    assert(cancelUnauth.status === 401, "Cancel without session must be rejected");
    const cancelWrongUser = await requestJson(
      "POST",
      "/api/cancel-subscription",
      { email: "pro@billing.test" },
      { headers: { Authorization: "Bearer test:trial@billing.test", "X-LLH-User-Email": "trial@billing.test" } },
    );
    assert(cancelWrongUser.status === 403, "Cancel for a different account must be rejected");
    const cancelRes = await requestJson(
      "POST",
      "/api/cancel-subscription",
      { email: "pro@billing.test" },
      { headers: { Authorization: "Bearer test:pro@billing.test", "X-LLH-User-Email": "pro@billing.test" } },
    );
    assert(cancelRes.status === 200, "Cancel subscription should succeed");
    assert(cancelRes.json?.subscription?.cancelAtPeriodEnd === true, "cancelAtPeriodEnd set");
    assert(String(cancelRes.json?.subscription?.subscriptionStatus || "").includes("Access Ends"), "Access end label in status");
    assert(cancelRes.json?.subscription?.hasProAccess === true, "Pro access remains until period end");

    const trialCancelRes = await requestJson(
      "POST",
      "/api/cancel-subscription",
      { email: "trial@billing.test" },
      { headers: { Authorization: "Bearer test:trial@billing.test", "X-LLH-User-Email": "trial@billing.test" } },
    );
    assert(trialCancelRes.status === 200, "Trial cancel should succeed");
    assert(String(trialCancelRes.json?.subscription?.subscriptionStatus || "").includes("Trial — no future charge"), "Trial cancel policy label");

    console.log("6) Admin analytics membership fields");
    const adminLogin = await requestJson("POST", "/api/admin/login", {
      email: "billing-qa@test.local", password: "billing-qa-pass", code: "billing-qa-code",
    });
    assert(adminLogin.status === 200 && adminLogin.json?.token, "Admin login for analytics test");
    const analytics = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(adminLogin.json.token)}`);
    assert(analytics.status === 200, "Admin analytics fetch");
    const currentCounts = analytics.json.analytics?.totals?.currentAccessCounts || {};
    const billingCounts = analytics.json.analytics?.totals?.billingStatusCounts || {};
    const totalUsers = analytics.json.analytics?.totals?.totalRegisteredUsers || 0;
    assert(Object.values(currentCounts).reduce((sum, value) => sum + Number(value || 0), 0) === totalUsers, "Current-access buckets must be mutually exclusive");
    assert(Object.values(billingCounts).reduce((sum, value) => sum + Number(value || 0), 0) === totalUsers, "Billing-status buckets must be mutually exclusive");
    const freeUser = (analytics.json.analytics?.users || []).find((u) => u.email === "free@billing.test");
    assert(freeUser?.membershipPlan === "Free", "Brand-new Free user current plan");
    assert(freeUser?.membershipStatus === "No paid subscription", "Brand-new Free user must not appear canceled");
    assert(freeUser?.previousPlan === "None", "Brand-new Free user has no previous plan");
    assert(freeUser?.billingStatus === "never_subscribed", "Brand-new Free user billing history bucket");
    const trialUser = (analytics.json.analytics?.users || []).find((u) => u.email === "trial@billing.test");
    assert(trialUser?.membershipPlan === "Trial", "Trial user in admin analytics");
    assert(trialUser?.trialEnd, "Admin shows trial end date");
    assert(trialUser?.hasProAccess === true, "Trial user has Pro access in admin");
    assert(trialUser?.membershipStatus === "Cancels at Trial End", "Canceled trial remains active until trial end");
    assert(trialUser?.currentAccess === "trial", "Canceled active trial remains in Trial current-access count");

    const cancelingUser = (analytics.json.analytics?.users || []).find((u) => u.email === "canceling@billing.test");
    assert(cancelingUser?.membershipStatus === "Cancels at Period End", "Admin shows canceling status");
    assert(cancelingUser?.accessEndsAt, "Admin shows access-end date");
    assert(cancelingUser?.scheduledCancellation === true, "Admin shows scheduled cancellation");

    const foundingUser = (analytics.json.analytics?.users || []).find((u) => u.email === "founding@billing.test");
    assert(foundingUser?.membershipPlan === "Founding Member", "Founding user plan label");
    assert(foundingUser?.foundingEligibilityLabel === "Active Founding Member", "Founding eligibility active label");

    console.log("7) Admin override does not require Stripe subscription");
    const overrideRes = await requestJson("POST", "/api/admin/membership-update", {
      adminToken: adminLogin.json.token,
      email: "free@billing.test",
      action: "upgrade",
      updates: { plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", monthlyPrice: "$19.99/month", internalAccessOverride: true },
    });
    assert(overrideRes.status === 200, "Admin override update succeeds");
    assert(overrideRes.json?.user?.internalAccessOverride === true, "Internal override flag set");
    assert(overrideRes.json?.user?.membershipStatus === "No paid subscription", "Internal override does not imply paid billing");
    assert(overrideRes.json?.user?.accessSource === "Manual admin grant", "Internal override access source label");
    assert(!overrideRes.json?.user?.stripeSubscriptionId, "Override should not create Stripe subscription");

    console.log("8) Admin totals from backend data");
    const totals = analytics.json.analytics?.totals || {};
    assert(typeof totals.paidUsers === "number", "paidUsers total from backend");
    assert(typeof totals.cancelingSubscriptions === "number", "cancelingSubscriptions total from backend");
    const analyticsAfter = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(adminLogin.json.token)}`);
    const paidAfterCancel = analyticsAfter.json.analytics?.totals?.paidUsers;
    assert(paidAfterCancel >= totals.paidUsers, "Totals update after membership changes");

    console.log("9) Payment failure removes access");
    const store = readStore();
    store.users["failed-pay@billing.test"] = {
      email: "failed-pay@billing.test", plan: "Free", subscriptionStatus: "Billing Review Required - Access Locked",
      stripeSubscriptionStatus: "unpaid", monthlyPrice: "$0/month", updatedAt: new Date().toISOString(),
    };
    writeStore(store);
    const failedSub = await requestJson("GET", "/api/subscription-status?email=failed-pay@billing.test");
    assert(failedSub.json.subscription?.hasProAccess === false, "Payment failed user has no Pro access");
    // Confirmed mapping: unpaid is never canceled/ended — it always shows the neutral
    // "Billing Review Required" label, never "Payment Failed"/"Ended".
    assert(failedSub.json.subscription?.membershipStatus === "Billing Review Required", "unpaid status shows Billing Review Required, not Payment Failed/Ended");

    console.log("9b) Checkout webhook assigns Founding with Stripe status + permissions");
    {
      const webhookRes = await requestJson("POST", "/api/webhooks/stripe", {
        id: `evt_test_founding_${Date.now()}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_test_${Date.now()}`,
            customer: "cus_test_founding_pay",
            subscription: "sub_test_founding_pay",
            payment_status: "paid",
            status: "complete",
            metadata: { email: "paid-founding@billing.test", plan: "founding" },
            customer_details: { email: "paid-founding@billing.test" },
          },
        },
      });
      assert(webhookRes.status === 200, `Founding checkout webhook should succeed, got ${webhookRes.status}`);
      const paidUser = readStore().users["paid-founding@billing.test"];
      assert(paidUser?.plan === "Founding", "Webhook must assign Founding plan");
      assert(paidUser?.foundingMemberActive === true, "Webhook must set foundingMemberActive");
      assert(paidUser?.stripeSubscriptionStatus === "active" || paidUser?.stripeSubscriptionStatus === "trialing", "Webhook must set stripeSubscriptionStatus");
      assert(membershipAccess.membershipHasProAccess(paidUser), "Webhook Founding member must have Pro access");
      const statusRes = await requestJson("GET", "/api/subscription-status?email=paid-founding@billing.test");
      assert(statusRes.json?.subscription?.hasProAccess === true, "subscription-status must report Pro access after Founding checkout");
      assert(statusRes.json?.subscription?.membershipPlan === "Founding Member", "subscription-status must show Founding Member");
    }

    console.log("9c) Admin subscription refresh endpoint auth + response shape");
    {
      const noAuth = await requestJson("POST", "/api/admin/subscription-refresh", { email: "paid-founding@billing.test" });
      assert(noAuth.status === 401, "Admin refresh requires auth");
      const refreshRes = await requestJson("POST", "/api/admin/subscription-refresh", {
        adminToken: adminLogin.json.token,
        email: "paid-founding@billing.test",
        adminEmail: "billing-qa@test.local",
      });
      // Without Stripe keys this returns 503; with keys it returns 200. Either proves the route exists.
      assert([200, 503].includes(refreshRes.status), `Admin refresh route should respond, got ${refreshRes.status}`);
      if (refreshRes.status === 200) {
        assert(refreshRes.json?.ok === true, "Admin refresh ok flag");
        assert(refreshRes.json?.email === "paid-founding@billing.test", "Admin refresh returns email");
      }
    }

    console.log("9d) Old and duplicate Stripe events cannot overwrite newer membership state");
    {
      const orderedStore = readStore();
      orderedStore.users["ordered-webhook@billing.test"] = {
        email: "ordered-webhook@billing.test",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
        stripeCustomerId: "cus_ordered",
        stripeSubscriptionId: "sub_ordered",
        currentPeriodEnd: futureIso,
        lastStripeEventCreatedAt: 200,
      };
      writeStore(orderedStore);
      const staleEvent = {
        id: "evt_stale_membership",
        created: 100,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_ordered",
            customer: "cus_ordered",
            status: "canceled",
            current_period_end: periodEndPast,
          },
        },
      };
      const staleRes = await requestJson("POST", "/api/webhooks/stripe", staleEvent);
      assert(staleRes.status === 200 && staleRes.json?.stale === true, "Older Stripe event is acknowledged but ignored");
      assert(readStore().users["ordered-webhook@billing.test"].plan === "Pro", "Older event did not downgrade current access");
      const duplicateRes = await requestJson("POST", "/api/webhooks/stripe", staleEvent);
      assert(duplicateRes.status === 200 && duplicateRes.json?.duplicate === true, "Duplicate Stripe event is idempotent");
    }

    console.log("9e) Admin billing reconciliation endpoint is read-only and requires auth");
    {
      const storeBefore = fs.readFileSync(STORE_PATH, "utf8");
      const noAuth = await requestJson("GET", "/api/admin/billing-reconciliation?email=paid-founding@billing.test");
      assert(noAuth.status === 401, "Billing reconciliation requires admin auth");
      const withAuth = await requestJson(
        "GET",
        `/api/admin/billing-reconciliation?adminToken=${encodeURIComponent(adminLogin.json.token)}&email=paid-founding@billing.test`,
      );
      // No Stripe keys in this test environment → 503 (route exists and correctly refuses
      // to guess at Stripe state). If Stripe were configured this would be 200.
      assert([200, 503].includes(withAuth.status), `Billing reconciliation route should respond, got ${withAuth.status}`);
      if (withAuth.status === 200) {
        assert(withAuth.json?.readOnly === true, "Billing reconciliation reports readOnly:true");
        assert(Array.isArray(withAuth.json?.results), "Billing reconciliation returns a results array");
      }
      const storeAfter = fs.readFileSync(STORE_PATH, "utf8");
      assert(storeAfter === storeBefore, "Billing reconciliation check must never write to the store");
    }

    console.log("9f) Failed payment followed by a successful recovery restores access");
    {
      const seqStore = readStore();
      seqStore.users["sequence-recover@billing.test"] = {
        email: "sequence-recover@billing.test",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
        stripeCustomerId: "cus_seq_recover",
        stripeSubscriptionId: "sub_seq_recover",
        currentPeriodEnd: futureIso,
      };
      writeStore(seqStore);

      const failedEvent = {
        id: "evt_seq_failed",
        created: 100,
        type: "invoice.payment_failed",
        data: { object: { id: "in_seq_failed", customer: "cus_seq_recover", customer_email: "sequence-recover@billing.test", amount_paid: 0 } },
      };
      const failedRes = await requestJson("POST", "/api/webhooks/stripe", failedEvent);
      assert(failedRes.status === 200, "invoice.payment_failed webhook accepted");
      const afterFailed = readStore().users["sequence-recover@billing.test"];
      assert(afterFailed.plan === "Free", "Payment failure downgrades to Free");
      // A first invoice.payment_failed reflects Stripe's "past_due" state (not yet
      // "unpaid" — that only happens once Smart Retries exhaust).
      assert(afterFailed.stripeSubscriptionStatus === "past_due", "Payment failure sets stripeSubscriptionStatus=past_due (not unpaid, not canceled/ended)");
      assert(!membershipAccess.membershipHasProAccess(afterFailed), "No Pro access immediately after failure");

      // Customer fixes their card; Stripe reports the subscription active again via a
      // newer (higher event.created) customer.subscription.updated event.
      const recoveredEvent = {
        id: "evt_seq_recovered",
        created: 200,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_seq_recover",
            customer: "cus_seq_recover",
            status: "active",
            current_period_end: Math.floor((Date.now() + 25 * 86400000) / 1000),
            cancel_at_period_end: false,
          },
        },
      };
      const recoveredRes = await requestJson("POST", "/api/webhooks/stripe", recoveredEvent);
      assert(recoveredRes.status === 200, "recovery webhook accepted");
      const afterRecovered = readStore().users["sequence-recover@billing.test"];
      assert(membershipAccess.membershipHasProAccess(afterRecovered), "Pro access is restored after the newer recovery event");
      assert(membershipAccess.membershipStatusDisplay(afterRecovered) !== "Payment Failed", "Status no longer reads Payment Failed after recovery");
    }

    console.log("9g) An older, delayed failed event cannot overwrite a newer paid/active event");
    {
      const orderStore = readStore();
      orderStore.users["ooo-protect@billing.test"] = {
        email: "ooo-protect@billing.test",
        plan: "Free",
        subscriptionStatus: "No paid subscription",
        stripeCustomerId: "cus_ooo",
        stripeSubscriptionId: "sub_ooo",
      };
      writeStore(orderStore);

      const newerActiveEvent = {
        id: "evt_ooo_active",
        created: 300,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_ooo",
            customer: "cus_ooo",
            status: "active",
            current_period_end: Math.floor((Date.now() + 20 * 86400000) / 1000),
            cancel_at_period_end: false,
          },
        },
      };
      const activeRes = await requestJson("POST", "/api/webhooks/stripe", newerActiveEvent);
      assert(activeRes.status === 200, "newer active webhook accepted");
      const afterActive = readStore().users["ooo-protect@billing.test"];
      assert(membershipAccess.membershipHasProAccess(afterActive), "Pro access granted by the newer active event");

      // A stale, delayed invoice.payment_failed with an OLDER event.created arrives after.
      const olderFailedEvent = {
        id: "evt_ooo_failed_delayed",
        created: 150,
        type: "invoice.payment_failed",
        data: { object: { id: "in_ooo_delayed", customer: "cus_ooo", customer_email: "ooo-protect@billing.test", amount_paid: 0 } },
      };
      const delayedRes = await requestJson("POST", "/api/webhooks/stripe", olderFailedEvent);
      assert(delayedRes.status === 200 && delayedRes.json?.stale === true, "Older delayed failed event is acknowledged but ignored as stale");
      const afterDelayed = readStore().users["ooo-protect@billing.test"];
      assert(membershipAccess.membershipHasProAccess(afterDelayed), "Pro access is NOT reverted by the stale, older failed event");
      assert(afterDelayed.plan === "Pro" || afterDelayed.plan === "Founding", "Plan remains paid after the stale event is ignored");
    }

    console.log("9h) Duplicate webhook delivery has no double effect");
    {
      const dupStore = readStore();
      dupStore.users["dup-delivery@billing.test"] = {
        email: "dup-delivery@billing.test",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
        stripeCustomerId: "cus_dup",
        stripeSubscriptionId: "sub_dup",
        currentPeriodEnd: futureIso,
      };
      writeStore(dupStore);
      const dupEvent = {
        id: "evt_dup_delivery_fixed_id",
        created: 100,
        type: "invoice.payment_failed",
        data: { object: { id: "in_dup", customer: "cus_dup", customer_email: "dup-delivery@billing.test", amount_paid: 0 } },
      };
      const firstRes = await requestJson("POST", "/api/webhooks/stripe", dupEvent);
      assert(firstRes.status === 200 && !firstRes.json?.duplicate, "First delivery is processed normally");
      const afterFirst = readStore().users["dup-delivery@billing.test"];
      assert(afterFirst.plan === "Free", "First delivery applies the payment-failed downgrade");
      const firstFailedAt = afterFirst.lastFailedPaymentAt;

      const secondRes = await requestJson("POST", "/api/webhooks/stripe", dupEvent);
      assert(secondRes.status === 200 && secondRes.json?.duplicate === true, "Second delivery of the identical event id is recognized as a duplicate");
      const afterSecond = readStore().users["dup-delivery@billing.test"];
      assert(afterSecond.lastFailedPaymentAt === firstFailedAt, "Duplicate delivery does not reapply or change any field a second time");
    }

    console.log("9i) A paid invoice that cannot be matched to any account raises a critical alert, never crashes");
    {
      const unmatchedEmail = "totally-unmatched-payer@billing.test";
      const preStore = readStore();
      assert(!preStore.users[unmatchedEmail], "Sanity: no local account exists for this email yet");

      const unmatchedEvent = {
        id: "evt_unmatched_invoice",
        created: 100,
        type: "invoice.paid",
        data: {
          object: {
            id: "in_unmatched",
            customer: "cus_totally_unknown_zzz",
            customer_email: unmatchedEmail,
            subscription: "sub_unknown_zzz",
            amount_paid: 999,
          },
        },
      };
      const unmatchedRes = await requestJson("POST", "/api/webhooks/stripe", unmatchedEvent);
      assert(unmatchedRes.status === 200, "Unmatched paid invoice does not crash the webhook handler");
      const postStore = readStore();
      assert(!postStore.users[unmatchedEmail], "No new local account is silently created for an unmatched paid invoice");

      const notifRes = await requestJson(
        "GET",
        `/api/admin/notifications?adminToken=${encodeURIComponent(adminLogin.json.token)}&category=billing&limit=50`,
      );
      assert(notifRes.status === 200, "Admin notifications endpoint responds");
      const criticalAlert = (notifRes.json?.notifications || []).find((n) => n.type === "admin_paid_access_not_restored");
      assert(criticalAlert, "A 'Paid in Stripe but access not restored' critical alert was raised for the unmatched invoice");
    }

    console.log("9j) Reconciliation apply: auth, confirm, host, bulk-rejection, and preview-token requirements");
    {
      assert(serverJs.includes("/api/admin/billing-reconciliation/apply"), "Reconciliation apply endpoint missing");
      assert(serverJs.includes("ALLOW_BILLING_RECONCILIATION"), "Reconciliation apply kill-switch missing");
      // scope=all/batch sweeps must never be apply-able: a previewToken (the only thing
      // that lets /apply do anything) is only ever issued for a single explicit email
      // lookup, never for a scope=all or comma-separated batch sweep.
      assert(/if \(singleEmail && !comparison\.error\)/.test(serverJs), "Preview-token issuance must be gated to a single explicit email — scope=all/batch must never become apply-able");
      const storeBeforeApply = fs.readFileSync(STORE_PATH, "utf8");

      const noAuthApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        email: "paid-founding@billing.test",
        confirm: true,
      });
      assert(noAuthApply.status === 401, "Reconciliation apply requires admin auth");

      const badHostApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "paid-founding@billing.test",
        confirm: true,
        previewToken: "brp_does_not_matter",
      }, { headers: { Host: "totally-unexpected-host.example.com" } });
      assert(badHostApply.status === 403, "Reconciliation apply refuses an unrecognized Host header");

      const noConfirmApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "paid-founding@billing.test",
      });
      assert(noConfirmApply.status === 400, "Reconciliation apply refuses to run without explicit confirm:true");

      const bulkApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "paid-founding@billing.test",
        confirm: true,
        emails: ["a@billing.test", "b@billing.test"],
      });
      assert(bulkApply.status === 400 && bulkApply.json?.code === "bulk_apply_rejected", "Reconciliation apply rejects bulk/list payloads — one account per confirmation only");

      const noPreviewApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "paid-founding@billing.test",
        confirm: true,
      });
      assert(noPreviewApply.status === 400 && noPreviewApply.json?.code === "preview_required", "Reconciliation apply requires a previewToken from the GET preview — auth+confirm alone are not enough");

      const bogusPreviewApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "paid-founding@billing.test",
        confirm: true,
        previewToken: "brp_this_token_was_never_issued",
      });
      assert(bogusPreviewApply.status === 410 && bogusPreviewApply.json?.code === "preview_expired", "An unknown/never-issued preview token is treated the same as an expired one");

      const storeAfterApply = fs.readFileSync(STORE_PATH, "utf8");
      assert(storeAfterApply === storeBeforeApply, "None of the above refusals ever wrote to the store");
    }

    console.log("9k) Reconciliation apply is disabled by default (ALLOW_BILLING_RECONCILIATION unset)");
    {
      const disabledPort = PORT + 1;
      const disabledStorePath = path.join(os.tmpdir(), `llh-billing-qa-disabled-${crypto.randomBytes(4).toString("hex")}.json`);
      const disabledChild = spawn(process.execPath, ["server/index.js"], {
        cwd: ROOT,
        env: {
          ...process.env,
          PORT: String(disabledPort),
          SITE_URL: `http://127.0.0.1:${disabledPort}`,
          ADMIN_EMAIL: "billing-qa@test.local",
          ADMIN_PASSWORD: "billing-qa-pass",
          ADMIN_ACCESS_CODE: "billing-qa-code",
          DATABASE_PROVIDER: "local-json",
          LLH_STORE_PATH: disabledStorePath,
          NODE_ENV: "test",
          ALLOW_BILLING_RECONCILIATION: undefined,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      try {
        for (let i = 0; i < 100; i += 1) {
          try {
            const res = await requestJson("GET", "/api/founding-status", null, { port: disabledPort });
            if (res.status === 200) break;
          } catch { /* retry */ }
          if (disabledChild.exitCode !== null) throw new Error("Disabled-flag test server exited early");
          await new Promise((r) => setTimeout(r, 100));
        }
        const disabledLogin = await requestJson("POST", "/api/admin/login", {
          email: "billing-qa@test.local", password: "billing-qa-pass", code: "billing-qa-code",
        }, { port: disabledPort });
        const disabledApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
          adminToken: disabledLogin.json.token,
          email: "anyone@billing.test",
          confirm: true,
          previewToken: "brp_irrelevant",
        }, { port: disabledPort });
        assert(disabledApply.status === 403 && disabledApply.json?.code === "reconciliation_disabled", "Reconciliation apply is disabled by default without ALLOW_BILLING_RECONCILIATION=true");
      } finally {
        await stopServer(disabledChild);
        if (fs.existsSync(disabledStorePath)) fs.unlinkSync(disabledStorePath);
      }
    }

    console.log("9l) Reconciliation preview tokens expire and cannot be reused for a changed/wrong record");
    {
      // Directly seed a preview token exactly as GET /api/admin/billing-reconciliation
      // would (using the same shared fingerprint function), so this can be tested without
      // needing live Stripe access in this environment — the apply-side validation logic
      // under test here is identical either way.
      const previewUser = {
        email: "preview-flow@billing.test",
        plan: "Free",
        subscriptionStatus: "Billing Review Required — Access Locked",
        stripeSubscriptionStatus: "unpaid",
        stripeCustomerId: "cus_previewflow",
        stripeSubscriptionId: "sub_previewflow",
        updatedAt: new Date().toISOString(),
      };
      const seedStore = readStore();
      seedStore.users["preview-flow@billing.test"] = previewUser;
      seedStore.billingReconciliationPreviews = seedStore.billingReconciliationPreviews || {};
      const token = `brp_test_${crypto.randomBytes(8).toString("hex")}`;
      seedStore.billingReconciliationPreviews[token] = {
        email: "preview-flow@billing.test",
        customerId: "cus_previewflow",
        subscriptionId: "sub_previewflow",
        invoiceId: "",
        storedFingerprint: stripeBillingReconciliation.billingReconciliationFingerprint(previewUser),
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
      writeStore(seedStore);

      // A different account's real email may never redeem someone else's preview token.
      const wrongAccountApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "paid-founding@billing.test",
        confirm: true,
        previewToken: token,
      });
      assert(wrongAccountApply.status === 400 && wrongAccountApply.json?.code === "preview_account_mismatch", "Apply refuses a preview token issued for a different account");

      // Mutate the account after the preview was issued — the fingerprint must no
      // longer match, so apply must refuse even with a syntactically valid, unexpired,
      // correctly-addressed token.
      const mutatedStore = readStore();
      mutatedStore.users["preview-flow@billing.test"].subscriptionStatus = "Something else entirely";
      mutatedStore.users["preview-flow@billing.test"].updatedAt = new Date(Date.now() + 1000).toISOString();
      writeStore(mutatedStore);

      const changedApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "preview-flow@billing.test",
        confirm: true,
        previewToken: token,
      });
      assert(changedApply.status === 409 && changedApply.json?.code === "record_changed_since_preview", "Apply refuses a preview token whose account record changed since the preview was generated");

      // The "changed record" check above already consumed/deleted that token. Restore the
      // record and seed a fresh token, force-expired directly (bypassing the 5-minute
      // TTL), to verify expiry is actually enforced, not just checked at issuance time.
      const expiredToken = `brp_test_${crypto.randomBytes(8).toString("hex")}`;
      const expireStore = readStore();
      expireStore.users["preview-flow@billing.test"] = previewUser;
      expireStore.billingReconciliationPreviews = expireStore.billingReconciliationPreviews || {};
      expireStore.billingReconciliationPreviews[expiredToken] = {
        email: "preview-flow@billing.test",
        customerId: "cus_previewflow",
        subscriptionId: "sub_previewflow",
        invoiceId: "",
        storedFingerprint: stripeBillingReconciliation.billingReconciliationFingerprint(previewUser),
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() - 1000,
      };
      writeStore(expireStore);
      const expiredApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "preview-flow@billing.test",
        confirm: true,
        previewToken: expiredToken,
      });
      assert(expiredApply.status === 410 && expiredApply.json?.code === "preview_expired", "Apply refuses a preview token past its expiry, even if otherwise well-formed");

      // An unknown/never-issued token id behaves identically to an expired one.
      const bogusApply = await requestJson("POST", "/api/admin/billing-reconciliation/apply", {
        adminToken: adminLogin.json.token,
        email: "preview-flow@billing.test",
        confirm: true,
        previewToken: "brp_never_issued_at_all",
      });
      assert(bogusApply.status === 410 && bogusApply.json?.code === "preview_expired", "An unknown preview token id is treated the same as an expired one");
    }

    console.log("10) Browser persona labels & access");
    seedPersonas();
    const browser = await runBrowserChecks(`http://127.0.0.1:${PORT}`);
    if (browser.skipped) console.log("   (browser checks skipped — playwright not installed)");

    console.log("\nBilling membership audit checks passed.");
  } catch (error) {
    console.error("\nBILLING AUDIT FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
  }
}

main();
