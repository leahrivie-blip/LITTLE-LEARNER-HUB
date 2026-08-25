#!/usr/bin/env node
/**
 * Staff Plan billing: founding waiver, non-founding entitlement, fail-closed price ID.
 * Run: NODE_ENV=test node scripts/test-staff-plan.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const membershipAccess = require("./membership-access.js");
const staffPlan = require("../server/staff-plan.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4188;
const PORT_PRICED = 4189;
const STORE = path.join(ROOT, "server", `.staff-plan-test-store-${process.pid}.json`);

const ASHLEY = "tclashley@icloud.com";
const LEARNNPLAY = "learnnplay123sc@gmail.com";
const ADMIN = "leahivie@icloud.com";

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

function request(method, urlPath, { email = "", body = null, port = PORT } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}${urlPath}`, { method, headers }, (res) => {
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

async function waitForHealth(port = PORT) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await request("GET", "/api/health", { port });
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

function paidUser(overrides = {}) {
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

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const staffPlanJs = fs.readFileSync(path.join(ROOT, "server", "staff-plan.js"), "utf8");
  assert.match(appJs, /Add Staff — \$29\.99\/month/);
  assert.match(appJs, /Get Pro for your account plus access for up to 5 staff members/);
  assert.match(appJs, /Upgrade to Staff Plan/);
  assert.match(appJs, /function startStaffPlanCheckout/);
  assert.match(serverJs, /staffPlan\.evaluateStaffPlanInviteAccess/);
  assert.match(staffPlanJs, /STRIPE_PRICE_STAFF_MONTHLY/);
  assert.match(staffPlanJs, /STAFF_PLAN_PRICE_ID/);
  assert.equal(staffPlanJs.includes("price_1"), false);
  assert.equal(serverJs.includes("price_1"), false);
  console.log("PASS  Staff Plan markers present; no hardcoded live Stripe price IDs");

  await test("price ID reads STRIPE_PRICE_STAFF_MONTHLY then STAFF_PLAN_PRICE_ID alias", () => {
    assert.equal(staffPlan.getStaffPlanPriceId({}), "");
    assert.equal(staffPlan.getStaffPlanPriceId({
      STRIPE_PRICE_PRO_MONTHLY: "price_should_not_be_used",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_founding_ignored",
    }), "");
    assert.equal(staffPlan.getStaffPlanPriceId({
      STAFF_PLAN_PRICE_ID: "price_alias_staff",
    }), "price_alias_staff");
    assert.equal(staffPlan.getStaffPlanPriceId({
      STRIPE_PRICE_STAFF_MONTHLY: "price_primary_staff",
      STAFF_PLAN_PRICE_ID: "price_alias_staff",
    }), "price_primary_staff");
  });

  await test("founding is foundingMemberActive only — not Early User / Monthly / Annual / historical number", () => {
    assert.equal(staffPlan.isAuthoritativeFoundingMember({
      foundingMemberActive: true,
      plan: "Founding",
    }), true);
    assert.equal(staffPlan.isAuthoritativeFoundingMember({
      foundingMemberActive: false,
      foundingMemberNumber: 17,
      plan: "Pro",
    }), false);
    assert.equal(staffPlan.isAuthoritativeFoundingMember({
      foundingMemberActive: false,
      billingOffer: "early_user",
      priceLock: "Early User",
      planDisplayName: "Pro — Early User",
    }), false);
    assert.equal(staffPlan.isAuthoritativeFoundingMember({
      foundingMemberActive: false,
      billingOffer: "pro_monthly",
      monthlyPrice: "$19.99/month",
    }), false);
    assert.equal(staffPlan.isAuthoritativeFoundingMember({
      foundingMemberActive: false,
      billingOffer: "pro_annual",
      subscriptionCadence: "annual",
    }), false);
    assert.equal(staffPlan.isAuthoritativeFoundingMember({
      plan: "Founding",
      planDisplayName: "Founding Member",
      foundingMemberHistorical: true,
    }), false);
  });

  await test("invite gate: founding waived, staff_plan entitled, others blocked", () => {
    const founding = paidUser({
      email: LEARNNPLAY,
      foundingMemberActive: true,
      plan: "Founding",
      billingOffer: "founding",
    });
    assert.equal(staffPlan.evaluateStaffPlanInviteAccess({ owner: founding }).ok, true);
    assert.equal(staffPlan.evaluateStaffPlanInviteAccess({ owner: founding }).reason, "founding");

    const staffEntitled = paidUser({
      email: ASHLEY,
      billingOffer: "staff_plan",
    });
    assert.equal(staffPlan.hasStaffPlanEntitlement(staffEntitled), true);
    assert.equal(staffPlan.evaluateStaffPlanInviteAccess({ owner: staffEntitled }).ok, true);

    const pastDueStaff = {
      email: ASHLEY,
      billingOffer: "staff_plan",
      plan: "Free",
      stripeSubscriptionStatus: "past_due",
      subscriptionStatus: "Billing Review Required — Access Locked",
      foundingMemberActive: false,
    };
    assert.equal(staffPlan.hasStaffPlanEntitlement(pastDueStaff), false);
    assert.equal(staffPlan.evaluateStaffPlanInviteAccess({ owner: pastDueStaff }).code, "staff_plan_required");

    const earlyUser = paidUser({ email: LEARNNPLAY, billingOffer: "early_user", priceLock: "Early User" });
    assert.equal(staffPlan.evaluateStaffPlanInviteAccess({ owner: earlyUser }).ok, false);

    const monthly = paidUser({ email: ASHLEY, billingOffer: "pro_monthly" });
    assert.equal(staffPlan.evaluateStaffPlanInviteAccess({ owner: monthly }).ok, false);

    const annual = paidUser({ email: ASHLEY, billingOffer: "pro_annual", subscriptionCadence: "annual" });
    assert.equal(staffPlan.evaluateStaffPlanInviteAccess({ owner: annual }).ok, false);

    const adminMonthly = paidUser({ email: ADMIN, billingOffer: "pro_monthly" });
    assert.equal(staffPlan.evaluateStaffPlanInviteAccess({
      owner: adminMonthly,
      isConfiguredAdminEmail: (email) => email === ADMIN,
    }).reason, "admin");
  });

  await test("webhook maps staff price / amount / offer to Staff Plan without founding", () => {
    const mapped = membershipAccess.stripeSubscriptionToMembershipUpdates({
      id: "sub_staff",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "staff" },
      items: { data: [{ price: { id: "price_from_env_only", unit_amount: 2999, nickname: "Staff Plan" } }] },
    }, { foundingMemberActive: false });
    assert.equal(mapped.plan, "Pro");
    assert.equal(mapped.billingOffer, "staff_plan");
    assert.equal(mapped.monthlyPrice, "$29.99/month");
    assert.equal(mapped.planDisplayName, "Staff Plan");
    assert.equal(mapped.foundingMemberActive, false);
    assert.equal(mapped.subscriptionStatus, "Staff Plan Subscription Active");
    assert.equal(membershipAccess.membershipPlanDisplay({
      ...mapped,
      stripeSubscriptionStatus: "active",
    }), "Staff Plan");
  });

  await test("amount 2999 hint maps to staff; 1999 / 1399 / 999 do not", () => {
    assert.equal(membershipAccess.planKeyFromStripeSubscription({
      items: { data: [{ price: { unit_amount: 2999 } }] },
    }), "staff");
    assert.equal(membershipAccess.planKeyFromStripeSubscription({
      items: { data: [{ price: { unit_amount: 1999 } }] },
    }), "monthly");
    assert.equal(membershipAccess.planKeyFromStripeSubscription({
      items: { data: [{ price: { unit_amount: 1399 } }] },
    }), "early_user");
    assert.equal(membershipAccess.planKeyFromStripeSubscription({
      items: { data: [{ price: { unit_amount: 999 } }] },
    }), "founding");
  });

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [ADMIN]: paidUser({ email: ADMIN }),
      [ASHLEY]: paidUser({
        email: ASHLEY,
        billingOffer: "pro_monthly",
        foundingMemberNumber: 17,
        foundingMemberHistorical: true,
        foundingMemberActive: false,
      }),
      [LEARNNPLAY]: paidUser({
        email: LEARNNPLAY,
        plan: "Founding",
        foundingMemberActive: true,
        billingOffer: "founding",
        monthlyPrice: "$9.99/month",
        subscriptionStatus: "Founding Member Subscription Active",
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
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_staff_plan",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_EARLY_USER_MONTHLY: "price_sim_early_user_monthly",
      // Staff price intentionally omitted on first boot — checkout must fail closed.
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });

  try {
    await waitForHealth();

    await test("API: historical founding number without foundingMemberActive requires Staff Plan", async () => {
      const listed = await request("GET", "/api/staff/invites", { email: ASHLEY });
      assert.equal(listed.status, 200, JSON.stringify(listed.json));
      assert.equal(listed.json.staffPlan.foundingMember, false);
      assert.equal(listed.json.staffPlan.upgradeRequired, true);
      assert.equal(listed.json.staffPlan.canInvite, false);
      assert.equal(listed.json.staffPlan.configured, false);

      const invite = await request("POST", "/api/staff/invites", {
        email: ASHLEY,
        body: { email: "teacher.blocked@example.com", role: "teacher", appOrigin: `http://127.0.0.1:${PORT}` },
      });
      assert.equal(invite.status, 403);
      assert.equal(invite.json.code, "staff_plan_required");
    });

    await test("API: founding member keeps founding pricing and may invite", async () => {
      const listed = await request("GET", "/api/staff/invites", { email: LEARNNPLAY });
      assert.equal(listed.status, 200, JSON.stringify(listed.json));
      assert.equal(listed.json.staffPlan.foundingMember, true);
      assert.equal(listed.json.staffPlan.upgradeRequired, false);
      assert.equal(listed.json.staffPlan.canInvite, true);

      const invite = await request("POST", "/api/staff/invites", {
        email: LEARNNPLAY,
        body: { email: "teacher.founding@example.com", role: "teacher", appOrigin: `http://127.0.0.1:${PORT}` },
      });
      assert.equal(invite.status, 200, JSON.stringify(invite.json));
    });

    await test("API: admin still invites without Staff Plan", async () => {
      const invite = await request("POST", "/api/staff/invites", {
        email: ADMIN,
        body: { email: "teacher.admin@example.com", role: "teacher", appOrigin: `http://127.0.0.1:${PORT}` },
      });
      assert.equal(invite.status, 200, JSON.stringify(invite.json));
    });

    await test("checkout: missing Staff Plan price ID fails closed (no monthly fallback)", async () => {
      const res = await request("POST", "/api/create-checkout-session", {
        body: { email: ASHLEY, plan: "staff" },
      });
      assert.equal(res.status, 400, JSON.stringify(res.json));
      assert.match(String(res.json.error || ""), /missing|not configured/i);
      assert.equal(String(res.json.error || "").includes("19.99"), false);
      assert.equal(String(JSON.stringify(res.json)).includes("price_sim_pro_monthly"), false);
    });

    await test("checkout: founding member is not forced onto Staff Plan", async () => {
      const res = await request("POST", "/api/create-checkout-session", {
        body: { email: LEARNNPLAY, plan: "staff" },
      });
      assert.equal(res.status, 400, JSON.stringify(res.json));
      assert.equal(res.json.code, "founding_keeps_pricing");
    });
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
  }

  const pricedStore = path.join(ROOT, "server", `.staff-plan-priced-store-${process.pid}.json`);
  fs.writeFileSync(pricedStore, JSON.stringify({
    users: {
      [ASHLEY]: paidUser({
        email: ASHLEY,
        billingOffer: "staff_plan",
        subscriptionStatus: "Staff Plan Subscription Active",
      }),
      "switcher@example.com": paidUser({
        email: "switcher@example.com",
        billingOffer: "pro_monthly",
      }),
    },
  }, null, 2));

  const priced = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(PORT_PRICED),
      SITE_URL: `http://127.0.0.1:${PORT_PRICED}`,
      LLH_STORE_PATH: pricedStore,
      DATABASE_PROVIDER: "local-json",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
      ADMIN_EMAIL: ADMIN,
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_staff_plan",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_STAFF_MONTHLY: "price_test_staff_monthly_only",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let pricedLog = "";
  priced.stdout.on("data", (d) => { pricedLog += d.toString(); });
  priced.stderr.on("data", (d) => { pricedLog += d.toString(); });

  try {
    await waitForHealth(PORT_PRICED);

    await test("API: Staff Plan entitlement unlocks invites and keeps the 5-seat cap", async () => {
      const listed = await request("GET", "/api/staff/invites", { email: ASHLEY, port: PORT_PRICED });
      assert.equal(listed.json.staffPlan.hasStaffPlanEntitlement, true);
      assert.equal(listed.json.staffPlan.upgradeRequired, false);
      assert.equal(listed.json.staffPlan.canInvite, true);
      assert.equal(listed.json.staffPlan.configured, true);
      assert.equal(listed.json.seats.max, 5);

      for (let i = 1; i <= 5; i += 1) {
        const res = await request("POST", "/api/staff/invites", {
          email: ASHLEY,
          port: PORT_PRICED,
          body: { email: `seat${i}@example.com`, role: "teacher", appOrigin: `http://127.0.0.1:${PORT_PRICED}` },
        });
        assert.equal(res.status, 200, JSON.stringify(res.json));
      }
      const sixth = await request("POST", "/api/staff/invites", {
        email: ASHLEY,
        port: PORT_PRICED,
        body: { email: "sixth@example.com", role: "teacher", appOrigin: `http://127.0.0.1:${PORT_PRICED}` },
      });
      assert.equal(sixth.status, 409);
      assert.match(String(sixth.json.error || ""), /5 staff limit/);
    });

    await test("checkout: already on Staff Plan is blocked; Pro monthly can start Staff Plan", async () => {
      const already = await request("POST", "/api/create-checkout-session", {
        port: PORT_PRICED,
        body: { email: ASHLEY, plan: "staff" },
      });
      assert.equal(already.status, 409, JSON.stringify(already.json));
      assert.equal(already.json.code, "already_subscribed");

      const upgrade = await request("POST", "/api/create-checkout-session", {
        port: PORT_PRICED,
        body: { email: "switcher@example.com", plan: "staff" },
      });
      assert.equal(upgrade.status, 200, JSON.stringify(upgrade.json));
      assert.match(String(upgrade.json.url || ""), /price_test_staff_monthly_only/);
      assert.equal(String(upgrade.json.url || "").includes("price_sim_pro_monthly"), false);
    });
  } finally {
    priced.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
    try { fs.unlinkSync(pricedStore); } catch {}
    if (process.exitCode) {
      console.error(bootLog.slice(-2000));
      console.error(pricedLog.slice(-2000));
    }
  }

  if (!process.exitCode) console.log("\nAll Staff Plan billing tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
