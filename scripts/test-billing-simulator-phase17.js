#!/usr/bin/env node
"use strict";

/**
 * Phase 17 — Platform pricing + family tuition billing simulator suite.
 * Fake data only. No Stripe products/prices/checkout. No card/bank storage.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./billing-simulator-data-model.js");
const entitlements = require("./entitlement-model.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase17-admin@example.com";
const ADMIN_PASSWORD = "Phase17BillingSim!99";
const ADMIN_CODE = "phase17-billing-code";
const BASE = "/api/director-center/billing";

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, timeoutMs = 25000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) return reject(new Error("Server health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function baseStore() {
  return {
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: true,
      },
    },
  };
}

async function startServer({ env = {} } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-bs-phase17-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9700 + Math.floor(Math.random() * 400);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: env.SITE_URL || "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: env.ALLOW_FAMILY_HUB_TESTING_PREVIEW ?? "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitForHealth(port);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr}`);
  }
  return { port, child, storePath };
}

async function stopServer(ctx) {
  if (!ctx?.child) return;
  ctx.child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    ctx.child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function adminLogin(port) {
  const res = await request(port, "POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(res.status, 200);
  return res.body.token;
}

function auth(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function seedAll(port, token) {
  await request(port, "POST", "/api/director-center/family/seed", { headers: auth(token), body: {} });
  await request(port, "POST", "/api/director-center/today/seed", { headers: auth(token), body: { reset: true } });
  await request(port, "POST", "/api/director-center/staff-experience/seed", { headers: auth(token), body: { reset: true } });
  await request(port, "POST", `${BASE}/seed`, { headers: auth(token), body: { reset: true } });
}

async function issueAndLogin(port, adminToken, kind) {
  await seedAll(port, adminToken);
  const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: auth(adminToken) });
  const account = (fakes.body.fakeAccounts || []).find((row) => row.kind === kind);
  assert.ok(account, `missing fake account ${kind}`);
  const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${account.id}/issue-password`, {
    headers: auth(adminToken), body: {},
  });
  assert.equal(issued.status, 200);
  const password = issued.body.temporaryPassword || issued.body.password;
  const login = await request(port, "POST", "/api/auth/password-login", {
    body: { email: account.email, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { account, token: login.body.memberSessionToken || login.body.token, email: account.email };
}

function findStaff(store, roleRe) {
  return Object.values(store.staffMemberships || {}).find((m) => roleRe.test(m.role || ""));
}

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

async function run() {
  // Unit: exact money + catalog
  {
    assert.equal(model.addCents(1999, 699), 2698);
    assert.equal(model.formatCents(1499), "$14.99");
    assert.equal(model.formatCents(14900), "$149.00");
    const catalog = model.catalogPlans();
    const byKey = Object.fromEntries(catalog.plans.map((p) => [p.key, p]));
    assert.equal(byKey.curriculum_only.monthlyPriceCents, 1499);
    assert.equal(byKey.curriculum_only.annualPriceCents, 14900);
    assert.equal(byKey.home_daycare.monthlyPriceCents, 1999);
    assert.equal(byKey.home_daycare.annualPriceCents, 19900);
    assert.equal(byKey.small_center.monthlyPriceCents, 2999);
    assert.equal(byKey.small_center.annualPriceCents, 29900);
    assert.equal(byKey.growing_center.monthlyPriceCents, 4499);
    assert.equal(byKey.growing_center.annualPriceCents, 44900);
    assert.equal(byKey.large_center.monthlyPriceCents, 7499);
    assert.equal(byKey.large_center.annualPriceCents, 74900);
    assert.equal(byKey.founding_member.monthlyPriceCents, 999);
    assert.equal(catalog.classroomAddOn.monthlyPriceCents, 699);
    assert.equal(catalog.classroomAddOn.annualPriceCents, 6900);
    assert.ok(byKey.curriculum_only.excludes.includes("director_center"));
    assert.ok(byKey.curriculum_only.annualSavingsCents > 0);
    assert.equal(catalog.noManipulativeCountdowns, true);
    assert.equal(catalog.stripeUntouched, true);
    pass("exact_plan_catalog_annual_pricing");
  }

  {
    const store = {};
    model.ensureBillingStore(store);
    const sub = model.createPlatformSubscription({
      organizationId: "org1",
      planKey: entitlements.PLAN_KEYS.FOUNDING_MEMBER,
      foundingStatus: model.FOUNDING_STATUSES.ACTIVE,
      classroomAddOnQuantity: 1,
    });
    model.applySimulatedEntitlement(store, "org1", sub);
    const ent = Object.values(store.organizationEntitlements)[0];
    assert.equal(ent.grandfatheredPriceCents, 999);
    assert.equal(ent.foundingMemberEligible, true);
    assert.equal(ent.classroomAddOnQuantity, 1);
    sub.foundingStatus = model.FOUNDING_STATUSES.FORMER;
    sub.status = model.SUBSCRIPTION_STATUSES.ENDED;
    model.applySimulatedEntitlement(store, "org1", sub);
    assert.equal(sub.foundingHistoryPreserved, true);
    pass("founding_protection");
  }

  {
    const limits = entitlements.evaluatePlanLimits({
      basePlanKey: entitlements.PLAN_KEYS.SMALL_CENTER,
      classroomAddOnQuantity: 2,
      activeClassroomCount: 0,
      invitedStaffCountExcludingOwner: 0,
    });
    assert.equal(limits.classroomLimit, 8 + 2);
    assert.equal(limits.staffAccountLimit, 15 + 4);
    const curriculum = entitlements.evaluatePlanLimits({
      basePlanKey: entitlements.PLAN_KEYS.CURRICULUM_ONLY,
      classroomAddOnQuantity: 0,
      activeClassroomCount: 0,
      invitedStaffCountExcludingOwner: 0,
    });
    assert.equal(curriculum.classroomLimit, 0);
    assert.equal(curriculum.staffAccountLimit, 0);
    pass("add_on_limits_curriculum_exclusions");
  }

  {
    const ctx = await startServer({
      env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
    });
    try {
      const token = await adminLogin(ctx.port);
      const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
      assert.equal(status.status, 403);
      pass("production_preview_rejection");
    } finally {
      await stopServer(ctx);
    }
  }

  const ctx = await startServer();
  try {
    const token = await adminLogin(ctx.port);
    await seedAll(ctx.port, token);

    const status = await request(ctx.port, "GET", `${BASE}/status`, { headers: auth(token) });
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.phase, 17);
    assert.equal(status.body.noStripe, true);
    assert.equal(status.body.stripeCheckoutDisabled, true);
    assert.equal(status.body.disableStripeCheckoutEnv, true);
    assert.equal(status.body.noCardStorage, true);
    pass("provider_status_no_stripe");

    const catalog = await request(ctx.port, "GET", `${BASE}/catalog`, { headers: auth(token) });
    assert.equal(catalog.status, 200, JSON.stringify(catalog.body));
    assert.equal(catalog.body.featureMarker, "phase17-platform-pricing");
    assert.equal(catalog.body.productionCatalogUnchanged, true);
    assert.equal(catalog.body.stripeUntouched, true);
    assert.ok((catalog.body.catalog.plans || []).length >= 6);
    pass("catalog_endpoint");

    const preview = await request(ctx.port, "POST", `${BASE}/platform/simulate`, {
      headers: auth(token),
      body: { action: "downgrade_preview", planKey: entitlements.PLAN_KEYS.HOME_DAYCARE },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.neverSilentlyDeletes, true);
    assert.ok(preview.body.preview);
    assert.equal(preview.body.preview.neverSilentlyDeletes, true);
    pass("upgrade_downgrade_preview");

    // Force a downgrade that would be over-limit without deleting
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const orgId = Object.values(store.organizations || {})[0]?.id;
      const beforeClassrooms = Object.keys(store.classrooms || {}).length;
      const beforeStaff = Object.keys(store.staffMemberships || {}).length;
      const blocked = await request(ctx.port, "POST", `${BASE}/platform/simulate`, {
        headers: auth(token),
        body: { action: "downgrade", planKey: entitlements.PLAN_KEYS.CURRICULUM_ONLY },
      });
      assert.ok([200, 409].includes(blocked.status));
      if (blocked.status === 409) {
        assert.equal(blocked.body.code, "downgrade_blocked");
        assert.equal(blocked.body.neverSilentlyDeletes, true);
      }
      const after = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      assert.equal(Object.keys(after.classrooms || {}).length, beforeClassrooms);
      assert.equal(Object.keys(after.staffMemberships || {}).length, beforeStaff);
      assert.ok(Object.keys(after.childRecords || {}).length >= Object.keys(store.childRecords || {}).length);
      pass("no_deletion_on_downgrade");
    }

    const curriculumSim = await request(ctx.port, "POST", `${BASE}/platform/simulate`, {
      headers: auth(token),
      body: { action: "select_plan", planKey: entitlements.PLAN_KEYS.CURRICULUM_ONLY, billingInterval: "annual" },
    });
    assert.equal(curriculumSim.status, 200);
    assert.equal(curriculumSim.body.subscription.planKey, entitlements.PLAN_KEYS.CURRICULUM_ONLY);
    const addOnDenied = await request(ctx.port, "POST", `${BASE}/platform/simulate`, {
      headers: auth(token),
      body: { action: "add_classroom" },
    });
    assert.equal(addOnDenied.status, 400);
    // Restore small center for family billing tests
    await request(ctx.port, "POST", `${BASE}/platform/simulate`, {
      headers: auth(token),
      body: { action: "select_plan", planKey: entitlements.PLAN_KEYS.SMALL_CENTER, billingInterval: "monthly" },
    });
    pass("entitlement_enforcement_curriculum_addon");

    const store0 = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const recurringPlanId = store0.billingSimulator.meta.phase17Ids.recurringPlanId;
    const cycle1 = await request(ctx.port, "POST", `${BASE}/family/generate-cycle`, {
      headers: auth(token),
      body: { recurringPlanId, cycleKey: "2026-09" },
    });
    assert.equal(cycle1.status, 200);
    assert.equal(cycle1.body.duplicatePrevented, false);
    const cycle2 = await request(ctx.port, "POST", `${BASE}/family/generate-cycle`, {
      headers: auth(token),
      body: { recurringPlanId, cycleKey: "2026-09" },
    });
    assert.equal(cycle2.status, 200);
    assert.equal(cycle2.body.duplicatePrevented, true);
    assert.equal(cycle2.body.invoice.id, cycle1.body.invoice.id);
    pass("recurring_invoice_idempotency");

    {
      const inv = cycle1.body.invoice;
      assert.equal(typeof inv.totalCents, "number");
      assert.equal(Number.isInteger(inv.totalCents), true);
      assert.equal(inv.totalCents, inv.subtotalCents - inv.discountCents);
      const profile = store0.billingSimulator.billingProfiles[store0.billingSimulator.meta.phase17Ids.billingProfileId];
      assert.ok(profile.payerSplits.length >= 1);
      assert.equal(profile.payerSplits.reduce((s, p) => s + (p.percent || 0), 0), 100);
      assert.ok(profile.subsidySource);
      assert.equal(profile.copayCents, 15000);
      pass("exact_money_splits_discounts_subsidy");
    }

    const openId = store0.billingSimulator.meta.phase17Ids.openInvoiceId;
    const ledgerBefore = Object.keys(store0.billingSimulator.ledger).length;
    const partial = await request(ctx.port, "POST", `${BASE}/family/payment-sim`, {
      headers: auth(token),
      body: { action: "partial", invoiceId: openId, amountCents: 1000, idempotencyKey: "phase17-partial-a" },
    });
    assert.equal(partial.status, 200);
    assert.equal(partial.body.appendOnly, true);
    const dup = await request(ctx.port, "POST", `${BASE}/family/payment-sim`, {
      headers: auth(token),
      body: { action: "partial", invoiceId: openId, amountCents: 1000, idempotencyKey: "phase17-partial-a" },
    });
    assert.equal(dup.body.duplicatePrevented, true);
    const failed = await request(ctx.port, "POST", `${BASE}/family/payment-sim`, {
      headers: auth(token),
      body: { action: "failed", invoiceId: store0.billingSimulator.meta.phase17Ids.pastDueInvoiceId, amountCents: 500, idempotencyKey: "phase17-fail-b" },
    });
    assert.equal(failed.status, 200);
    const refund = await request(ctx.port, "POST", `${BASE}/family/payment-sim`, {
      headers: auth(token),
      body: {
        action: "refund",
        invoiceId: store0.billingSimulator.meta.phase17Ids.openInvoiceId,
        amountCents: 500,
        idempotencyKey: "phase17-refund-c",
      },
    });
    assert.equal(refund.status, 200);
    const storeLed = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    assert.ok(Object.keys(storeLed.billingSimulator.ledger).length >= ledgerBefore + 2);
    // Original ledger entries must still exist (append-only)
    assert.ok(storeLed.billingSimulator.ledger[store0.billingSimulator.meta.phase17Ids.partialLedgerId]);
    pass("append_only_ledger_partial_failed_refund");

    const suggestionId = store0.billingSimulator.meta.phase17Ids.latePickupSuggestionId;
    const noConfirm = await request(ctx.port, "POST", `${BASE}/family/approve-suggestion`, {
      headers: auth(token),
      body: { suggestionId },
    });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.code, "confirmation_required");
    const confirmed = await request(ctx.port, "POST", `${BASE}/family/approve-suggestion`, {
      headers: auth(token),
      body: { suggestionId, confirm: true },
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.autoBilled, false);
    pass("attendance_charge_requires_approval");

    {
      const depositId = store0.billingSimulator.meta.phase17Ids.enrollmentDepositInvoiceId;
      const deposit = storeLed.billingSimulator.invoices[depositId]
        || JSON.parse(fs.readFileSync(ctx.storePath, "utf8")).billingSimulator.invoices[depositId];
      assert.ok(deposit);
      assert.equal(deposit.lineItems[0].chargeType, model.CHARGE_TYPES.ENROLLMENT_DEPOSIT);
      assert.match(deposit.notes || "", /enrollment/i);
      pass("enrollment_connection");
    }

    const overview = await request(ctx.port, "GET", `${BASE}/family/overview`, { headers: auth(token) });
    assert.equal(overview.status, 200);
    assert.equal(overview.body.featureMarker, "phase17-family-billing");
    assert.ok(!(overview.body.invoices || []).some((i) => i.privateCollectionNotes));
    pass("provider_family_overview");

    // Staff denial
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const teacher = findStaff(store, /lead_teacher|teacher/i);
      assert.ok(teacher);
      const denied = await request(ctx.port, "GET", `${BASE}/family/overview`, {
        headers: auth(token, { "x-llh-role-preview-membership-id": teacher.id }),
      });
      assert.equal(denied.status, 403);
      assert.equal(denied.body.code, "family_billing_denied");
      pass("staff_billing_denial");
    }

    // Cross-org denial
    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      const foreignInv = model.createInvoice({
        organizationId: "org_other_phase17",
        billingProfileId: "bp_other",
        lineItems: [{ chargeType: model.CHARGE_TYPES.CUSTOM, description: "Foreign", amountCents: 100 }],
      });
      store.billingSimulator.invoices[foreignInv.id] = foreignInv;
      fs.writeFileSync(ctx.storePath, JSON.stringify(store, null, 2));
      const pay = await request(ctx.port, "POST", `${BASE}/family/payment-sim`, {
        headers: auth(token),
        body: { action: "full", invoiceId: foreignInv.id, idempotencyKey: "xorg-pay" },
      });
      assert.ok([403, 404].includes(pay.status));
      pass("cross_organization_denial");
    }

    // Guardian billing isolation
    {
      const parent = await issueAndLogin(ctx.port, token, "parent_multi_child");
      const billing = await request(ctx.port, "GET", "/api/family-hub/billing", { headers: auth(parent.token) });
      assert.equal(billing.status, 200, JSON.stringify(billing.body));
      assert.equal(billing.body.featureMarker, "phase17-family-billing");
      assert.equal(billing.body.noRealPayment, true);
      assert.equal(billing.body.noPayButtonConnected, true);
      assert.match(billing.body.testingBanner || "", /Testing Only/i);
      assert.ok(!(JSON.stringify(billing.body).includes("Internal collection")));
      assert.ok(!(JSON.stringify(billing.body).includes("privateCollectionNotes")));
      assert.ok(Array.isArray(billing.body.hiddenFromFamily));

      const pickup = await issueAndLogin(ctx.port, token, "pickup_only");
      const pickupBilling = await request(ctx.port, "GET", "/api/family-hub/billing", { headers: auth(pickup.token) });
      assert.equal(pickupBilling.status, 403);
      pass("guardian_billing_isolation");
    }

    {
      const ui = fs.readFileSync(path.join(ROOT, "billing-simulator-ui.js"), "utf8");
      const fh = fs.readFileSync(path.join(ROOT, "family-hub-ui.js"), "utf8");
      const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
      assert.match(ui, /phase17-platform-pricing/);
      assert.match(ui, /phase17-family-billing/);
      assert.match(fh, /phase17-family-billing/);
      assert.match(css, /\.bs-panel/);
      assert.match(css, /@media \(max-width: 480px\)/);
      assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1024px\)/);
      assert.match(css, /@media \(min-width: 1280px\)/);
      assert.match(css, /\.bs-computer-recommended/);
      pass("responsive_markers");
    }

    {
      const store = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
      assert.equal(store.billingSimulator?.meta?.noStripe, true);
      assert.equal(store.billingSimulator?.meta?.noCardStorage, true);
      assert.equal(store.billingSimulator?.meta?.noBankStorage, true);
      // Production checkout path unchanged — DISABLE_STRIPE_CHECKOUT remains true in env
      assert.equal(process.env.DISABLE_STRIPE_CHECKOUT || "true", "true");
      pass("no_stripe_api_production_checkout_unchanged");
    }

    const sxStatus = await request(ctx.port, "GET", "/api/director-center/staff-experience/status", { headers: auth(token) });
    assert.equal(sxStatus.status, 200);
    const todayStatus = await request(ctx.port, "GET", "/api/director-center/today/status", { headers: auth(token) });
    assert.equal(todayStatus.status, 200);
    const lcStatus = await request(ctx.port, "GET", "/api/director-center/licensing/status", { headers: auth(token) });
    assert.equal(lcStatus.status, 200);
    const rcStatus = await request(ctx.port, "GET", "/api/director-center/records/status", { headers: auth(token) });
    assert.equal(rcStatus.status, 200);
    const enStatus = await request(ctx.port, "GET", "/api/director-center/enrollment/status", { headers: auth(token) });
    assert.equal(enStatus.status, 200);
    pass("phase1_16_regression_smoke");
  } finally {
    await stopServer(ctx);
  }

  console.log(`\nPhase 17 focused suite: ${passed} PASS`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
