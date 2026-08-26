#!/usr/bin/env node
/**
 * Staff Plan replacement, blocks, webhook scoping, and visibility.
 * Isolated fixtures only. Never touches live Stripe customers.
 * Run: NODE_ENV=test node scripts/test-staff-plan-upgrade.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const staffPlan = require("../server/staff-plan.js");
const staffPlanUpgrade = require("../server/staff-plan-upgrade.js");
const membershipAccess = require("./membership-access.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4193;
const STORE = path.join(ROOT, "server", `.staff-plan-upgrade-store-${process.pid}.json`);
const ASHLEY = "tclashley@icloud.com";
const LEARNNPLAY = "learnnplay123sc@gmail.com";
const ADMIN = "leahivie@icloud.com";
const FREE_BETA = "free.staff@example.test";
const MONTHLY_BETA = "monthly.staff@example.test";

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

function request(method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${PORT}${urlPath}`, { method, headers }, (res) => {
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

function paid(overrides) {
  return {
    role: "owner",
    accountType: "home_daycare",
    plan: "Pro",
    subscriptionStatus: "Pro Subscription Active",
    stripeSubscriptionStatus: "active",
    foundingMemberActive: false,
    ...overrides,
  };
}

function monthlySub(id = "sub_monthly") {
  return {
    id,
    customer: "cus_monthly",
    status: "active",
    metadata: { plan: "monthly" },
    items: { data: [{ id: "si_monthly", quantity: 1, price: { id: "price_monthly", unit_amount: 1999 } }] },
  };
}

async function main() {
  await test("A classify: new beta user creates Staff checkout", () => {
    const decision = staffPlanUpgrade.classifyStaffPlanStart({
      user: { email: LEARNNPLAY, plan: "Free", foundingMemberActive: false },
      email: LEARNNPLAY,
      env: { STRIPE_PRICE_STAFF_MONTHLY: "price_staff" },
    });
    assert.equal(decision.action, "create_checkout");
    assert.equal(decision.mutateStripe, false);
  });

  await test("B classify: Monthly Pro replaces existing item", () => {
    const decision = staffPlanUpgrade.classifyStaffPlanStart({
      user: paid({
        email: LEARNNPLAY,
        billingOffer: "pro_monthly",
        stripeCustomerId: "cus_monthly",
        stripeSubscriptionId: "sub_monthly",
      }),
      email: LEARNNPLAY,
      env: { STRIPE_PRICE_STAFF_MONTHLY: "price_staff" },
      inventory: { replaceableSubscription: monthlySub(), customerId: "cus_monthly" },
    });
    assert.equal(decision.action, "replace");
    assert.equal(decision.subscription.id, "sub_monthly");
    assert.equal(decision.staffPriceId, "price_staff");
  });

  await test("C classify: Early User replaces and does not keep $13.99", () => {
    const early = {
      id: "sub_early",
      customer: "cus_early",
      status: "active",
      metadata: { plan: "early_user" },
      items: { data: [{ id: "si_early", price: { id: "price_early", unit_amount: 1399 } }] },
    };
    const decision = staffPlanUpgrade.classifyStaffPlanStart({
      user: paid({
        email: LEARNNPLAY,
        billingOffer: "early_user",
        priceLock: "Early User",
        stripeSubscriptionId: "sub_early",
        stripeCustomerId: "cus_early",
      }),
      email: LEARNNPLAY,
      env: { STRIPE_PRICE_STAFF_MONTHLY: "price_staff" },
      inventory: { replaceableSubscription: early, customerId: "cus_early" },
    });
    assert.equal(decision.action, "replace");
    const replaced = staffPlanUpgrade.simulateReplacedSubscription(early, "price_staff");
    assert.equal(replaced.id, "sub_early");
    assert.equal(replaced.items.data[0].price.unit_amount, 2999);
    assert.equal(replaced.items.data[0].price.id, "price_staff");
    assert.notEqual(replaced.items.data[0].price.unit_amount, 1399);
  });

  await test("D classify: Annual is blocked with zero mutation", () => {
    const decision = staffPlanUpgrade.classifyStaffPlanStart({
      user: paid({
        email: ADMIN,
        billingOffer: "pro_annual",
        subscriptionCadence: "annual",
        stripeSubscriptionId: "sub_annual",
      }),
      email: ADMIN,
      env: { STRIPE_PRICE_STAFF_MONTHLY: "price_staff" },
      isConfiguredAdminEmail: (value) => value === ADMIN,
      inventory: {
        annualSubscription: {
          id: "sub_annual",
          status: "active",
          items: { data: [{ price: { unit_amount: 19900 } }] },
        },
      },
    });
    assert.equal(decision.action, "block");
    assert.equal(decision.code, "annual_staff_plan_blocked");
    assert.equal(decision.mutateStripe, false);
  });

  await test("E classify: founding is blocked", () => {
    const decision = staffPlanUpgrade.classifyStaffPlanStart({
      user: {
        email: ASHLEY,
        foundingMemberNumber: 17,
        foundingMemberActive: false,
        stripeSubscriptionStatus: "past_due",
      },
      email: ASHLEY,
      env: { STRIPE_PRICE_STAFF_MONTHLY: "price_staff" },
    });
    assert.equal(decision.code, "founding_keeps_pricing");
    assert.equal(decision.mutateStripe, false);
  });

  await test("F/G classify: active and past_due Staff cannot start another Staff sub", () => {
    const active = staffPlanUpgrade.classifyStaffPlanStart({
      user: paid({ email: LEARNNPLAY, billingOffer: "staff_plan" }),
      email: LEARNNPLAY,
      env: { STRIPE_PRICE_STAFF_MONTHLY: "price_staff" },
    });
    assert.equal(active.code, "already_subscribed");
    const pastDue = staffPlanUpgrade.classifyStaffPlanStart({
      user: {
        email: LEARNNPLAY,
        billingOffer: "staff_plan",
        plan: "Free",
        stripeSubscriptionStatus: "past_due",
        subscriptionStatus: "Billing Review Required — Access Locked",
      },
      email: LEARNNPLAY,
      env: { STRIPE_PRICE_STAFF_MONTHLY: "price_staff" },
    });
    assert.equal(pastDue.code, "staff_plan_billing_recovery");
    assert.equal(pastDue.payload.recoverViaPortal, true);
    assert.equal(pastDue.mutateStripe, false);
  });

  await test("H classify: in-progress lock blocks a second attempt", () => {
    const decision = staffPlanUpgrade.classifyStaffPlanStart({
      user: {
        email: LEARNNPLAY,
        plan: "Free",
        staffPlanUpgradeLockAt: new Date().toISOString(),
      },
      email: LEARNNPLAY,
      env: { STRIPE_PRICE_STAFF_MONTHLY: "price_staff" },
    });
    assert.equal(decision.code, "staff_plan_upgrade_in_progress");
  });

  await test("J old Monthly webhook cannot overwrite Staff state", () => {
    const apply = staffPlanUpgrade.shouldApplyStripeSubscriptionEvent({
      user: {
        billingOffer: "staff_plan",
        stripeSubscriptionId: "sub_staff",
      },
      subscription: monthlySub("sub_old_monthly"),
      eventType: "updated",
    });
    assert.equal(apply.apply, false);
    assert.equal(apply.reason, "ignore_unrelated_subscription");
    const self = staffPlanUpgrade.shouldApplyStripeSubscriptionEvent({
      user: { billingOffer: "staff_plan", stripeSubscriptionId: "sub_staff" },
      subscription: { id: "sub_staff", status: "past_due", metadata: { plan: "staff" } },
    });
    assert.equal(self.apply, true);
    const leftoverDuringUpgrade = staffPlanUpgrade.shouldApplyStripeSubscriptionEvent({
      user: {
        pendingPlan: "staff",
        billingOffer: "pro_monthly",
        stripeSubscriptionId: "sub_monthly",
      },
      subscription: monthlySub("sub_other_old"),
      eventType: "updated",
    });
    assert.equal(leftoverDuringUpgrade.apply, false);
    const ordinaryNewMonthlyAfterCancel = staffPlanUpgrade.shouldApplyStripeSubscriptionEvent({
      user: {
        billingOffer: "pro_monthly",
        stripeSubscriptionId: "sub_old_canceled",
      },
      subscription: monthlySub("sub_new_monthly"),
      eventType: "updated",
    });
    assert.equal(ordinaryNewMonthlyAfterCancel.apply, true);
    assert.equal(ordinaryNewMonthlyAfterCancel.reason, "non_staff_customer_scope");
    const oldMonthlyInvoice = staffPlanUpgrade.shouldApplyStripeInvoiceEvent({
      user: { billingOffer: "staff_plan", stripeSubscriptionId: "sub_staff" },
      invoice: { subscription: "sub_old_monthly" },
    });
    assert.equal(oldMonthlyInvoice.apply, false);
    const staffInvoice = staffPlanUpgrade.shouldApplyStripeInvoiceEvent({
      user: { billingOffer: "staff_plan", stripeSubscriptionId: "sub_staff" },
      invoice: { subscription: "sub_staff" },
    });
    assert.equal(staffInvoice.apply, true);
    const monthlyInvoiceWithoutSub = staffPlanUpgrade.shouldApplyStripeInvoiceEvent({
      user: { billingOffer: "pro_monthly", stripeSubscriptionId: "sub_monthly" },
      invoice: { customer: "cus_monthly" },
    });
    assert.equal(monthlyInvoiceWithoutSub.apply, true);
  });

  await test("K past_due is not a cancellation event", () => {
    assert.equal(staffPlanUpgrade.isFalseCancellationAccessLoss({
      stripeSubscriptionStatus: "past_due",
      subscriptionStatus: "Billing Review Required — Access Locked",
    }), true);
    assert.equal(staffPlanUpgrade.isFalseCancellationAccessLoss({
      stripeSubscriptionStatus: "canceled",
      subscriptionStatus: "Subscription Ended",
    }), false);
  });

  await test("S/T admin access key and past_due Staff identity", () => {
    const active = {
      billingOffer: "staff_plan",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      subscriptionStatus: "Staff Plan Subscription Active",
    };
    assert.equal(membershipAccess.membershipPlanDisplay(active), "Staff Plan");
    assert.equal(membershipAccess.membershipCurrentAccessKey(active), "staff_plan");
    assert.equal(membershipAccess.membershipProductStatus(active).key, "active_staff");
    const pastDue = membershipAccess.stripeSubscriptionToMembershipUpdates({
      id: "sub_staff",
      status: "past_due",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "staff" },
      items: { data: [{ price: { unit_amount: 2999 } }] },
    }, { billingOffer: "staff_plan" });
    assert.equal(pastDue.billingOffer, "staff_plan");
    assert.equal(pastDue.previousPlan, "Staff Plan");
    assert.equal(membershipAccess.membershipIsBillingReviewRequired(pastDue), true);
    assert.equal(membershipAccess.membershipHasProAccess(pastDue), false);
    assert.equal(membershipAccess.membershipCurrentAccessKey(pastDue), "past_due");
  });

  await test("ambiguous billed customers block without merge", () => {
    const resolved = staffPlanUpgrade.resolveAuthoritativeCustomer({
      user: { stripeCustomerId: "" },
      customers: [{ id: "cus_a" }, { id: "cus_b" }],
      subscriptionsByCustomer: {
        cus_a: [monthlySub("sub_a")],
        cus_b: [{ id: "sub_b", status: "past_due", items: { data: [{ price: { unit_amount: 1399 } }] } }],
      },
      staffPriceId: "price_staff",
    });
    assert.equal(resolved.ambiguousCustomer, true);
  });

  await test("empty secondary customer is ignored when stored customer is billed", () => {
    const resolved = staffPlanUpgrade.resolveAuthoritativeCustomer({
      user: { stripeCustomerId: "cus_a", stripeSubscriptionId: "sub_monthly" },
      customers: [{ id: "cus_a" }, { id: "cus_empty" }],
      subscriptionsByCustomer: {
        cus_a: [monthlySub()],
        cus_empty: [],
      },
      staffPriceId: "price_staff",
    });
    assert.equal(resolved.ambiguousCustomer, false);
    assert.equal(resolved.customerId, "cus_a");
    assert.equal(resolved.replaceableSubscription.id, "sub_monthly");
  });

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [ASHLEY]: {
        email: ASHLEY,
        role: "owner",
        plan: "Free",
        foundingMemberNumber: 17,
        foundingMemberHistorical: true,
        foundingMemberActive: false,
        stripeSubscriptionStatus: "past_due",
        subscriptionStatus: "Billing Review Required — Access Locked",
      },
      [LEARNNPLAY]: paid({
        email: LEARNNPLAY,
        billingOffer: "early_user",
        priceLock: "Early User",
        monthlyPrice: "$13.99/month",
        stripeCustomerId: "cus_early_live",
        stripeSubscriptionId: "sub_early_live",
        stripeSubscriptionItemId: "si_early_live",
      }),
      [ADMIN]: paid({
        email: ADMIN,
        billingOffer: "pro_annual",
        subscriptionCadence: "annual",
        monthlyPrice: "$199/year",
        stripeCustomerId: "cus_annual",
        stripeSubscriptionId: "sub_annual",
      }),
      [FREE_BETA]: {
        email: FREE_BETA,
        role: "owner",
        plan: "Free",
        foundingMemberActive: false,
      },
      [MONTHLY_BETA]: paid({
        email: MONTHLY_BETA,
        billingOffer: "pro_monthly",
        monthlyPrice: "$19.99/month",
        stripeCustomerId: "cus_monthly_live",
        stripeSubscriptionId: "sub_monthly_live",
        stripeSubscriptionItemId: "si_monthly_live",
      }),
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE,
      DATABASE_PROVIDER: "local-json",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
      ADMIN_EMAIL: ADMIN,
      ADMIN_EMAILS: `${ADMIN},${FREE_BETA},${MONTHLY_BETA}`,
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_staff_upgrade",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_STAFF_MONTHLY: "price_test_staff_monthly_only",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();

    await test("HTTP D annual is blocked with zero Stripe mutation", async () => {
      const before = JSON.parse(fs.readFileSync(STORE, "utf8")).users[ADMIN];
      const res = await request("POST", "/api/staff-plan/upgrade", { body: { email: ADMIN } });
      assert.equal(res.status, 409, JSON.stringify(res.json));
      assert.equal(res.json.code, "annual_staff_plan_blocked");
      const after = JSON.parse(fs.readFileSync(STORE, "utf8")).users[ADMIN];
      assert.equal(after.stripeSubscriptionId, before.stripeSubscriptionId);
      assert.equal(after.billingOffer, "pro_annual");
    });

    await test("HTTP E founding stays off Staff Plan", async () => {
      const res = await request("POST", "/api/staff-plan/upgrade", { body: { email: ASHLEY } });
      assert.equal(res.status, 400);
      assert.equal(res.json.code, "founding_keeps_pricing");
    });

    await test("HTTP A new user Staff checkout is one $29.99 session", async () => {
      const res = await request("POST", "/api/staff-plan/upgrade", { body: { email: FREE_BETA, plan: "staff" } });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(Boolean(res.json.upgraded), false);
      assert.match(String(res.json.url || ""), /price_test_staff_monthly_only/);
      assert.equal(String(res.json.url || "").includes("price_sim_pro_monthly"), false);
      const user = JSON.parse(fs.readFileSync(STORE, "utf8")).users[FREE_BETA];
      assert.equal(user.pendingPlan, "staff");
      assert.equal(user.subscriptionStatus, "Checkout Started");
      assert.equal(user.billingOffer || "", "");
      assert.equal(membershipAccess.membershipHasProAccess(user), false);
    });

    await test("HTTP H second new-user checkout is locked", async () => {
      const res = await request("POST", "/api/staff-plan/upgrade", { body: { email: FREE_BETA, plan: "staff" } });
      assert.equal(res.status, 409, JSON.stringify(res.json));
      assert.equal(res.json.code, "staff_plan_upgrade_in_progress");
    });

    await test("HTTP B Monthly Pro replacement keeps one subscription id", async () => {
      const res = await request("POST", "/api/staff-plan/upgrade", { body: { email: MONTHLY_BETA } });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.upgraded, true);
      assert.equal(res.json.subscriptionId, "sub_monthly_live");
      assert.equal(res.json.prorationBehavior, "none");
      assert.equal(res.json.subscriptionIdRetained, true);
      const user = JSON.parse(fs.readFileSync(STORE, "utf8")).users[MONTHLY_BETA];
      assert.equal(user.billingOffer, "staff_plan");
      assert.equal(user.stripeSubscriptionId, "sub_monthly_live");
      assert.equal(user.monthlyPrice, "$29.99/month");
    });

    await test("HTTP C Early User replacement keeps one subscription id", async () => {
      const res = await request("POST", "/api/staff-plan/upgrade", { body: { email: LEARNNPLAY } });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.upgraded, true);
      assert.equal(res.json.subscriptionId, "sub_early_live");
      assert.equal(res.json.prorationBehavior, "none");
      const user = JSON.parse(fs.readFileSync(STORE, "utf8")).users[LEARNNPLAY];
      assert.equal(user.billingOffer, "staff_plan");
      assert.equal(user.stripeSubscriptionId, "sub_early_live");
      assert.equal(user.monthlyPrice, "$29.99/month");
      assert.equal(user.priceLock, "");
    });

    await test("HTTP F Staff active cannot start another Staff plan", async () => {
      const res = await request("POST", "/api/staff-plan/upgrade", { body: { email: LEARNNPLAY } });
      assert.equal(res.status, 409);
      assert.equal(res.json.code, "already_subscribed");
    });

    await test("HTTP G past_due Staff is sent to billing recovery", async () => {
      const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
      raw.users[LEARNNPLAY] = {
        ...raw.users[LEARNNPLAY],
        plan: "Free",
        stripeSubscriptionStatus: "past_due",
        subscriptionStatus: "Billing Review Required — Access Locked",
        staffPlanUpgradeLockAt: "",
      };
      fs.writeFileSync(STORE, JSON.stringify(raw, null, 2));
      const res = await request("POST", "/api/staff-plan/upgrade", { body: { email: LEARNNPLAY } });
      assert.equal(res.status, 409, JSON.stringify(res.json));
      assert.equal(res.json.code, "staff_plan_billing_recovery");
      assert.equal(res.json.recoverViaPortal, true);
      const after = JSON.parse(fs.readFileSync(STORE, "utf8")).users[LEARNNPLAY];
      assert.equal(after.stripeSubscriptionId, "sub_early_live");
    });
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
    if (process.exitCode) console.error(bootLog.slice(-3000));
  }

  if (!process.exitCode) console.log("\nAll Staff Plan upgrade tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
