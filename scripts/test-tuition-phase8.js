#!/usr/bin/env node
/**
 * Phase 8 — Provider → family tuition billing (TESTING ONLY).
 * Simulated payments; no real Stripe charges; SaaS billing stays separate.
 *
 * Run: npm run test:tuition-phase8
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const tuition = require("../server/tuition-billing-lib.js");
const canonicalData = require("../server/canonical-data.js");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function request(port, method, pathname, { email, body, familyToken } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (email) {
      headers["X-LLH-User-Email"] = email;
      headers.Authorization = `Bearer test:${email}`;
    }
    if (familyToken) {
      headers.Authorization = `Bearer ${familyToken}`;
      headers["X-LLH-Family-Session"] = familyToken;
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers,
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "1",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return res.json;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server on ${port} did not become healthy`);
}

function sourceMarkers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const libJs = fs.readFileSync(path.join(ROOT, "server", "tuition-billing-lib.js"), "utf8");
  const canon = canonicalData.describeCanonicalHomes();

  assert.match(libJs, /tuitionPaymentIdempotency/);
  assert.match(libJs, /processorReady/);
  assert.match(libJs, /SEPARATE from Little Learner Hub SaaS/);
  assert.match(serverJs, /require\("\.\/tuition-billing-lib"\)/);
  assert.match(serverJs, /\/api\/tuition\/dashboard/);
  assert.match(serverJs, /\/api\/family-hub\/tuition/);
  assert.match(serverJs, /pay-simulated/);
  assert.match(serverJs, /realChargesEnabled: false/);
  assert.match(serverJs, /saasSubscriptionBillingSeparate: true/);
  assert.match(appJs, /renderTuitionBillingPanel/);
  assert.match(appJs, /renderFamilyHubBillingPanel/);
  assert.match(appJs, /data-fh-billing-live/);
  assert.match(appJs, /data-tuition-billing-panel/);
  assert.match(appJs, /data-tuition-mobile-ready/);
  assert.match(appJs, /data-fh-pay-simulated/);
  assert.match(stylesCss, /data-tuition-mobile-ready/);
  assert.match(stylesCss, /font-size: 16px/);
  assert.equal(canon.BillingSaaS.includes("Stripe"), true);
  assert.equal(canon.TuitionBilling.includes("tuitionInvoices"), true);
  assert.doesNotMatch(appJs, /llhTuitionChildRoster|parallelTuitionRoster/);
  assert.doesNotMatch(serverJs, /tuitionChildRoster|duplicateTuitionFamilyStore/);
  // Must not mix SaaS checkout into tuition paths
  assert.doesNotMatch(libJs, /stripe\.checkout|createCheckoutSession/);
  pass("source_markers_phase8");
}

function unitLedger() {
  const store = tuition.ensureTuitionCollections({});
  const weekly = tuition.normalizeLineItem({
    type: tuition.LINE_TYPES.TUITION_WEEKLY,
    description: "Weekly",
    amountCents: 25000,
    childId: "c1",
  });
  const monthly = tuition.normalizeLineItem({
    type: tuition.LINE_TYPES.TUITION_MONTHLY,
    description: "Monthly",
    amountCents: 90000,
  });
  const discount = tuition.normalizeLineItem({
    type: tuition.LINE_TYPES.DISCOUNT,
    description: "Sibling discount",
    amountCents: 5000,
  });
  const credit = tuition.normalizeLineItem({
    type: tuition.LINE_TYPES.CREDIT,
    description: "Credit",
    amountCents: 1000,
  });
  assert.equal(weekly.totalCents, 25000);
  assert.equal(monthly.totalCents, 90000);
  assert.equal(discount.totalCents, -5000);
  assert.equal(credit.totalCents, -1000);
  assert.equal(tuition.sumLineItems([weekly, discount, credit]), 19000);

  const inv = tuition.createInvoice(store, {
    programId: "prog-1",
    householdId: "hh-1",
    childIds: ["c1", "c2"],
    lineItems: [weekly, discount],
    dueDate: "2020-01-01",
  });
  const pub = tuition.publicTuitionInvoice(store, inv, { today: "2026-08-08" });
  assert.equal(pub.status, "overdue");
  assert.equal(pub.balanceCents, 20000);

  const pay1 = tuition.recordPayment(store, {
    invoiceId: inv.id,
    amountCents: 5000,
    idempotencyKey: "key-partial-1",
  });
  assert.equal(pay1.duplicate, false);
  const afterPartial = tuition.publicTuitionInvoice(store, store.tuitionInvoices[inv.id], { today: "2026-08-08" });
  assert.equal(afterPartial.status, "partially_paid");
  assert.equal(afterPartial.balanceCents, 15000);

  const retry = tuition.recordPayment(store, {
    invoiceId: inv.id,
    amountCents: 5000,
    idempotencyKey: "key-partial-1",
  });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.payment.id, pay1.payment.id);
  const afterRetry = tuition.publicTuitionInvoice(store, store.tuitionInvoices[inv.id], { today: "2026-08-08" });
  assert.equal(afterRetry.amountPaidCents, 5000);

  const payFull = tuition.recordPayment(store, {
    invoiceId: inv.id,
    amountCents: 15000,
    idempotencyKey: "key-full",
  });
  assert.equal(payFull.duplicate, false);
  const paid = tuition.publicTuitionInvoice(store, store.tuitionInvoices[inv.id]);
  assert.equal(paid.status, "paid");
  assert.equal(paid.balanceCents, 0);

  const rate = tuition.upsertTuitionRate(store, {
    programId: "prog-1",
    childId: "c1",
    schedule: "custom",
    amountCents: 12000,
    label: "3-day custom",
    customCadenceNote: "Mon/Wed/Fri",
  });
  assert.equal(rate.schedule, "custom");
  const built = tuition.buildInvoiceFromRate(rate, { householdId: "hh-1", dueDate: "2099-01-01" });
  assert.equal(built.lineItems[0].type, tuition.LINE_TYPES.TUITION_CUSTOM);

  pass("unit_ledger_statuses_idempotency");
}

async function runtimePhase8() {
  const port = 4700 + Math.floor(Math.random() * 400);
  const storePath = path.join(os.tmpdir(), `llh-phase8-${crypto.randomBytes(4).toString("hex")}.json`);
  const hdOwner = "hd.phase8@example.invalid";
  const centerOwner = "center.phase8@example.invalid";

  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [hdOwner]: { email: hdOwner, role: "owner", accountType: "home_daycare", plan: "Pro" },
      [centerOwner]: { email: centerOwner, role: "owner", accountType: "center", plan: "Pro" },
    },
  }, null, 2));

  const childProc = spawnServer({ port, storePath });
  let killed = false;
  const kill = () => {
    if (killed) return;
    killed = true;
    try { childProc.kill("SIGTERM"); } catch (_e) { /* ignore */ }
  };
  process.on("exit", kill);

  try {
    await waitForHealth(port, childProc);
    const today = new Date().toISOString().slice(0, 10);
    const pastDue = "2020-06-01";
    const futureDue = "2099-06-01";

    // ——— Home Daycare: one child ———
    const hdSeed = await request(port, "POST", "/api/child-data", {
      email: hdOwner,
      body: {
        data: {
          Profiles: [{ id: "hd-ava", name: "Ava HD", classroomId: "classroom-main" }],
        },
      },
    });
    assert.equal(hdSeed.status, 200, hdSeed.text);

    const hdInvite = await request(port, "POST", "/api/family-hub/households", {
      email: hdOwner,
      body: {
        label: "Ava Family",
        email: "ava.p8@example.invalid",
        children: [{ id: "hd-ava" }],
        appOrigin: `http://127.0.0.1:${port}`,
        programName: "Phase8 HD",
      },
    });
    assert.equal(hdInvite.status, 200, hdInvite.text);
    const hdHouseholdId = hdInvite.json.household.id;
    const hdToken = (await request(port, "POST", "/api/family-hub/login", {
      body: { email: "ava.p8@example.invalid", code: hdInvite.json.loginCode },
    })).json.sessionToken;

    const weeklyRate = await request(port, "POST", "/api/tuition/rates", {
      email: hdOwner,
      body: { childId: "hd-ava", schedule: "weekly", amount: 250, label: "Full-time weekly" },
    });
    assert.equal(weeklyRate.status, 200, weeklyRate.text);
    assert.equal(weeklyRate.json.rate.schedule, "weekly");
    assert.equal(weeklyRate.json.rate.amountCents, 25000);
    pass("home_daycare_weekly_rate");

    const weeklyInv = await request(port, "POST", "/api/tuition/invoices", {
      email: hdOwner,
      body: {
        householdId: hdHouseholdId,
        rateId: weeklyRate.json.rate.id,
        dueDate: futureDue,
        notes: "Week of care",
      },
    });
    assert.equal(weeklyInv.status, 200, weeklyInv.text);
    assert.equal(weeklyInv.json.invoice.totalCents, 25000);
    assert.equal(weeklyInv.json.realChargesEnabled, false);
    assert.ok(weeklyInv.json.invoice.lineItems.some((l) => l.type === "tuition_weekly"));
    pass("home_daycare_weekly_invoice");

    const regFee = await request(port, "POST", "/api/tuition/invoices", {
      email: hdOwner,
      body: {
        householdId: hdHouseholdId,
        lineType: "registration_fee",
        amount: 75,
        description: "Enrollment fee",
        dueDate: futureDue,
      },
    });
    assert.equal(regFee.status, 200, regFee.text);
    assert.equal(regFee.json.invoice.totalCents, 7500);
    pass("registration_enrollment_fee");

    const oneTimeDisc = await request(port, "POST", "/api/tuition/invoices", {
      email: hdOwner,
      body: {
        householdId: hdHouseholdId,
        lineType: "one_time",
        amount: 100,
        description: "Field trip",
        dueDate: futureDue,
        discountCents: 2000,
        creditCents: 500,
      },
    });
    assert.equal(oneTimeDisc.status, 200, oneTimeDisc.text);
    assert.equal(oneTimeDisc.json.invoice.totalCents, 7500); // 100 - 20 - 5
    pass("one_time_discount_credit");

    const overdueInv = await request(port, "POST", "/api/tuition/invoices", {
      email: hdOwner,
      body: {
        householdId: hdHouseholdId,
        lineType: "tuition_weekly",
        amount: 50,
        description: "Past due week",
        dueDate: pastDue,
      },
    });
    assert.equal(overdueInv.status, 200, overdueInv.text);
    assert.equal(overdueInv.json.invoice.status, "overdue");
    pass("overdue_balance");

    const dash = await request(port, "GET", "/api/tuition/dashboard", { email: hdOwner });
    assert.equal(dash.status, 200, dash.text);
    assert.equal(dash.json.testingOnly, true);
    assert.equal(dash.json.saasSubscriptionBillingSeparate, true);
    assert.ok(dash.json.dashboard.totals.overdueCount >= 1);
    assert.ok(dash.json.dashboard.householdsOwing.some((h) => h.householdId === hdHouseholdId));
    pass("owner_director_billing_dashboard");

    // Family Hub visibility — only this household
    const fhBill = await request(port, "GET", "/api/family-hub/tuition", { familyToken: hdToken });
    assert.equal(fhBill.status, 200, fhBill.text);
    assert.equal(fhBill.json.householdId, hdHouseholdId);
    assert.ok(fhBill.json.invoices.every((inv) => inv.householdId === hdHouseholdId));
    assert.ok(fhBill.json.balance.amountDueCents > 0);
    pass("family_hub_billing_visibility");

    // Partial + full simulated payment with idempotency
    const target = fhBill.json.invoices.find((inv) => inv.id === weeklyInv.json.invoice.id);
    assert.ok(target);
    const partialKey = `fh-partial-${target.id}`;
    const partial = await request(port, "POST", `/api/family-hub/tuition/invoices/${target.id}/pay-simulated`, {
      familyToken: hdToken,
      body: { amountCents: 10000, idempotencyKey: partialKey },
    });
    assert.equal(partial.status, 200, partial.text);
    assert.equal(partial.json.duplicate, false);
    assert.equal(partial.json.invoice.status, "partially_paid");
    assert.ok(partial.json.receipt.receiptNumber);
    const partialRetry = await request(port, "POST", `/api/family-hub/tuition/invoices/${target.id}/pay-simulated`, {
      familyToken: hdToken,
      body: { amountCents: 10000, idempotencyKey: partialKey },
    });
    assert.equal(partialRetry.status, 200, partialRetry.text);
    assert.equal(partialRetry.json.duplicate, true);
    assert.equal(partialRetry.json.payment.id, partial.json.payment.id);
    assert.equal(partialRetry.json.invoice.amountPaidCents, 10000);
    pass("partial_payment_idempotent_retry");

    const fullKey = `fh-full-${target.id}`;
    const fullPay = await request(port, "POST", `/api/family-hub/tuition/invoices/${target.id}/pay-simulated`, {
      familyToken: hdToken,
      body: { amountCents: 15000, idempotencyKey: fullKey },
    });
    assert.equal(fullPay.status, 200, fullPay.text);
    assert.equal(fullPay.json.invoice.status, "paid");
    pass("full_payment_simulated");

    // Provider manual record remaining registration fee
    const regId = regFee.json.invoice.id;
    const recordKey = `prov-rec-${regId}`;
    const recorded = await request(port, "POST", "/api/tuition/payments/record", {
      email: hdOwner,
      body: { invoiceId: regId, amountCents: 7500, idempotencyKey: recordKey, method: "manual_recorded" },
    });
    assert.equal(recorded.status, 200, recorded.text);
    assert.equal(recorded.json.invoice.status, "paid");
    const recordRetry = await request(port, "POST", "/api/tuition/payments/record", {
      email: hdOwner,
      body: { invoiceId: regId, amountCents: 7500, idempotencyKey: recordKey },
    });
    assert.equal(recordRetry.json.duplicate, true);
    pass("provider_record_payment_idempotent");

    // ——— Center: siblings + multi-guardian + monthly + isolation ———
    const centerSeed = await request(port, "POST", "/api/child-data", {
      email: centerOwner,
      body: {
        data: {
          Profiles: [
            { id: "c-maya", name: "Maya", classroomId: "room-a" },
            { id: "c-noah", name: "Noah", classroomId: "room-a" },
            { id: "c-other", name: "Other", classroomId: "room-b" },
          ],
        },
      },
    });
    assert.equal(centerSeed.status, 200, centerSeed.text);

    const sibInvite = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Sibling Family",
        email: "sib.p8@example.invalid",
        guardianEmail: "sib.g2@example.invalid",
        children: [{ id: "c-maya" }, { id: "c-noah" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    const otherInvite = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Other Family",
        email: "other.p8@example.invalid",
        children: [{ id: "c-other" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(sibInvite.status, 200, sibInvite.text);
    assert.equal(otherInvite.status, 200, otherInvite.text);
    const sibHh = sibInvite.json.household.id;
    const otherHh = otherInvite.json.household.id;

    const monthlyRate = await request(port, "POST", "/api/tuition/rates", {
      email: centerOwner,
      body: { childId: "c-maya", schedule: "monthly", amount: 900, label: "Maya monthly" },
    });
    assert.equal(monthlyRate.status, 200, monthlyRate.text);

    const sibInvoice = await request(port, "POST", "/api/tuition/invoices", {
      email: centerOwner,
      body: {
        householdId: sibHh,
        childIds: ["c-maya", "c-noah"],
        dueDate: futureDue,
        lineItems: [
          { type: "tuition_monthly", description: "Maya monthly", amountCents: 90000, childId: "c-maya" },
          { type: "tuition_monthly", description: "Noah monthly", amountCents: 85000, childId: "c-noah" },
          { type: "discount", description: "Sibling discount", amountCents: 5000 },
        ],
      },
    });
    assert.equal(sibInvoice.status, 200, sibInvoice.text);
    assert.equal(sibInvoice.json.invoice.totalCents, 170000); // 900+850-50
    assert.deepEqual([...sibInvoice.json.invoice.childIds].sort(), ["c-maya", "c-noah"]);
    pass("center_siblings_monthly_family_billing");

    const otherInvoice = await request(port, "POST", "/api/tuition/invoices", {
      email: centerOwner,
      body: {
        householdId: otherHh,
        lineType: "one_time",
        amount: 40,
        description: "Other secret fee",
        dueDate: futureDue,
      },
    });
    assert.equal(otherInvoice.status, 200, otherInvoice.text);

    const tokenSib = (await request(port, "POST", "/api/family-hub/login", {
      body: { email: "sib.p8@example.invalid", code: sibInvite.json.loginCode },
    })).json.sessionToken;
    const tokenG2 = (await request(port, "POST", "/api/family-hub/login", {
      body: { email: "sib.g2@example.invalid", code: sibInvite.json.loginCode },
    })).json.sessionToken;
    const tokenOther = (await request(port, "POST", "/api/family-hub/login", {
      body: { email: "other.p8@example.invalid", code: otherInvite.json.loginCode },
    })).json.sessionToken;

    const sibView = await request(port, "GET", "/api/family-hub/tuition", { familyToken: tokenSib });
    assert.equal(sibView.status, 200);
    assert.ok(sibView.json.invoices.every((inv) => inv.householdId === sibHh));
    assert.ok(!sibView.json.invoices.some((inv) => inv.id === otherInvoice.json.invoice.id));
    assert.ok(!JSON.stringify(sibView.json).includes("Other secret fee"));

    const g2View = await request(port, "GET", "/api/family-hub/tuition", { familyToken: tokenG2 });
    assert.equal(g2View.status, 200);
    assert.equal(g2View.json.householdId, sibHh);
    assert.ok(g2View.json.invoices.some((inv) => inv.id === sibInvoice.json.invoice.id));
    pass("multiple_guardians_same_household_billing");

    // Cross-household pay attempt
    const crossPay = await request(port, "POST", `/api/family-hub/tuition/invoices/${sibInvoice.json.invoice.id}/pay-simulated`, {
      familyToken: tokenOther,
      body: { amountCents: 100, idempotencyKey: "cross-attack" },
    });
    assert.equal(crossPay.status, 404);
    pass("household_isolation_server_authorization");

    // Void unpaid invoice
    const voidable = await request(port, "POST", "/api/tuition/invoices", {
      email: centerOwner,
      body: {
        householdId: otherHh,
        lineType: "adjustment",
        amount: 10,
        description: "To void",
        dueDate: futureDue,
      },
    });
    const voided = await request(port, "POST", `/api/tuition/invoices/${voidable.json.invoice.id}/void`, {
      email: centerOwner,
      body: { reason: "Issued in error" },
    });
    assert.equal(voided.status, 200, voided.text);
    assert.equal(voided.json.invoice.status, "void");
    pass("void_unpaid_invoice");

    // Custom rate
    const customRate = await request(port, "POST", "/api/tuition/rates", {
      email: centerOwner,
      body: {
        childId: "c-noah",
        schedule: "custom",
        amount: 120,
        label: "3-day custom",
        customCadenceNote: "MWF",
      },
    });
    assert.equal(customRate.status, 200, customRate.text);
    assert.equal(customRate.json.rate.schedule, "custom");
    pass("custom_tuition_schedule");

    // Confirm SaaS fields untouched in tuition responses
    assert.equal(dash.json.realChargesEnabled, false);
    assert.ok(!("stripeCustomerId" in (sibView.json.balance || {})));
    pass("saas_tuition_separation_confirmed");

    // Mobile markers already asserted in sourceMarkers
    pass("mobile_billing_screens_markers");

    console.log(`\nPhase 8 tuition suite complete on port ${port}`);
  } finally {
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  try { sourceMarkers(); } catch (error) { fail("source_markers_phase8", error); }
  try { unitLedger(); } catch (error) { fail("unit_ledger_statuses_idempotency", error); }
  try {
    await runtimePhase8();
  } catch (error) {
    fail("runtime_phase8", error);
  }
  if (process.exitCode) {
    console.error("\nPhase 8 tuition tests FAILED");
    process.exit(process.exitCode);
  }
  console.log("\nAll Phase 8 tuition tests PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
