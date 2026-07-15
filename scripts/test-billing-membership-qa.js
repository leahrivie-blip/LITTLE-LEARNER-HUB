#!/usr/bin/env node
/**
 * Membership & billing regression tests — cancellation access, founding policy, admin fields.
 * Run: node scripts/test-billing-membership-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const membershipAccess = require("./membership-access.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19500 + Math.floor(Math.random() * 30);
const STORE_PATH = path.join(os.tmpdir(), `llh-billing-qa-${crypto.randomBytes(4).toString("hex")}.json`);
const FOUNDING_LIMIT = 50;
const PUBLIC_CLAIMED_BASE = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function startServer() {
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
      NODE_ENV: "test",
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
    }));
    if (expectations.planLabel) assert(labels.planLabel === expectations.planLabel, `${email}: expected label ${expectations.planLabel}, got ${labels.planLabel}`);
    if (expectations.price) assert(labels.price === expectations.price, `${email}: expected price ${expectations.price}, got ${labels.price}`);
    if (expectations.effective) assert(labels.effective === expectations.effective, `${email}: expected effective ${expectations.effective}, got ${labels.effective}`);
  }

  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  await checkPersona("free@billing.test", { email: "free@billing.test", plan: "Free", subscriptionStatus: "Free Plan" }, {
    proAccess: false, planLabel: "Free", price: "$0/month", effective: "Free",
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
  assert(serverJs.includes("markProcessedStripeEvent"), "Webhook idempotency marker missing");
  assert(serverJs.includes("invoice.paid"), "invoice.paid webhook handling missing");

  console.log("2) Shared membership-access policy unit checks");
  const periodEndFuture = Math.floor((Date.now() + 20 * 86400000) / 1000);
  const periodEndPast = Math.floor((Date.now() - 86400000) / 1000);

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
    assert(foundingPayload.remaining === FOUNDING_LIMIT, `Fresh store should have ${FOUNDING_LIMIT} founding spots when base is 0`);

    seedSoldOutFounding();
    founding = await requestJson("GET", "/api/founding-status");
    const soldOutPayload = founding.json.founding || founding.json;
    assert(soldOutPayload.remaining === 0, "All 50 founding spots should be claimed");
    assert(soldOutPayload.soldOut === true, "soldOut flag should be true");

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
    const cancelRes = await requestJson("POST", "/api/cancel-subscription", { email: "pro@billing.test" });
    assert(cancelRes.status === 200, "Cancel subscription should succeed");
    assert(cancelRes.json?.subscription?.cancelAtPeriodEnd === true, "cancelAtPeriodEnd set");
    assert(String(cancelRes.json?.subscription?.subscriptionStatus || "").includes("Access Ends"), "Access end label in status");
    assert(cancelRes.json?.subscription?.hasProAccess === true, "Pro access remains until period end");

    const trialCancelRes = await requestJson("POST", "/api/cancel-subscription", { email: "trial@billing.test" });
    assert(trialCancelRes.status === 200, "Trial cancel should succeed");
    assert(String(trialCancelRes.json?.subscription?.subscriptionStatus || "").includes("Trial — no future charge"), "Trial cancel policy label");

    console.log("6) Admin analytics membership fields");
    const adminLogin = await requestJson("POST", "/api/admin/login", {
      email: "billing-qa@test.local", password: "billing-qa-pass", code: "billing-qa-code",
    });
    assert(adminLogin.status === 200 && adminLogin.json?.token, "Admin login for analytics test");
    const analytics = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(adminLogin.json.token)}`);
    assert(analytics.status === 200, "Admin analytics fetch");
    const trialUser = (analytics.json.analytics?.users || []).find((u) => u.email === "trial@billing.test");
    assert(trialUser?.membershipPlan === "Trial", "Trial user in admin analytics");
    assert(trialUser?.trialEnd, "Admin shows trial end date");
    assert(trialUser?.hasProAccess === true, "Trial user has Pro access in admin");

    const cancelingUser = (analytics.json.analytics?.users || []).find((u) => u.email === "canceling@billing.test");
    assert(cancelingUser?.membershipStatus === "Canceling at Period End", "Admin shows canceling status");
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
    assert(overrideRes.json?.user?.membershipStatus === "Internal Access Override", "Internal override status label");
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
      email: "failed-pay@billing.test", plan: "Free", subscriptionStatus: "Payment Failed - Action Needed",
      stripeSubscriptionStatus: "unpaid", monthlyPrice: "$0/month", updatedAt: new Date().toISOString(),
    };
    writeStore(store);
    const failedSub = await requestJson("GET", "/api/subscription-status?email=failed-pay@billing.test");
    assert(failedSub.json.subscription?.hasProAccess === false, "Payment failed user has no Pro access");
    assert(failedSub.json.subscription?.membershipStatus === "Payment Failed", "Payment failed visible in status");

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
