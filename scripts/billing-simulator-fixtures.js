/**
 * Phase 17 billing simulator fixtures — platform plans + family tuition scenarios.
 */

const phase16 = require("./staff-experience-fixtures.js");
const model = require("./billing-simulator-data-model.js");
const entitlements = require("./entitlement-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensurePhase17Preview(store, { adminEmail = "phase17.owner@example.invalid", organizationId = "" } = {}) {
  model.ensureBillingStore(store);
  const seeded16 = phase16.ensurePhase16Preview(store, { adminEmail, organizationId });
  const orgId = seeded16.organizationId || organizationId;

  if (store.billingSimulator.meta?.phase17SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      ids: store.billingSimulator.meta.phase17Ids || {},
    };
  }

  const ids = {};
  const childIds = store.todayHub?.meta?.phase15ChildIds
    || store.recordsCenter?.meta?.phase13ChildIds
    || {};
  const households = listValues(store.familyFoundation?.households || {}).filter((h) => h.organizationId === orgId);
  const household = households[0] || { id: "" };
  const contacts = listValues(store.familyFoundation?.contacts || {}).filter((c) => c.organizationId === orgId);
  const responsible = contacts.find((c) => /priya|parent|guardian/i.test(`${c.displayName} ${c.email}`)) || contacts[0] || {};
  const secondPayer = contacts.find((c) => c.id !== responsible.id) || null;

  // Platform subscription — Small Center with one add-on + founding history sample orgs via status fields
  const sub = model.createPlatformSubscription({
    organizationId: orgId,
    planKey: entitlements.PLAN_KEYS.SMALL_CENTER,
    billingInterval: "monthly",
    status: model.SUBSCRIPTION_STATUSES.ACTIVE,
    classroomAddOnQuantity: 1,
    foundingStatus: model.FOUNDING_STATUSES.NONE,
    periodStart: model.todayDate(),
    periodEnd: "2026-08-22",
  });
  store.billingSimulator.platformSubscriptions[sub.id] = sub;
  model.applySimulatedEntitlement(store, orgId, sub);
  model.appendPlatformAudit(store, {
    organizationId: orgId,
    action: "seed_subscription",
    actorEmail: adminEmail,
    detail: "Seeded Small Center + 1 classroom add-on (simulated)",
    after: sub,
  });
  ids.platformSubscriptionId = sub.id;

  // Founding sample subscription record (history preserved) — not the active org plan
  const foundingSample = model.createPlatformSubscription({
    organizationId: orgId,
    planKey: entitlements.PLAN_KEYS.FOUNDING_MEMBER,
    billingInterval: "monthly",
    status: model.SUBSCRIPTION_STATUSES.ENDED,
    foundingStatus: model.FOUNDING_STATUSES.FORMER,
    periodStart: "2024-01-01",
    periodEnd: "2025-01-01",
  });
  store.billingSimulator.platformSubscriptions[foundingSample.id] = foundingSample;
  ids.formerFoundingSubscriptionId = foundingSample.id;
  model.appendPlatformAudit(store, {
    organizationId: orgId,
    action: "founding_ended_history",
    actorEmail: adminEmail,
    detail: "Former founding preserved — reclaim not automatically promised",
    after: foundingSample,
  });

  // Family billing profile — siblings + split payers + subsidy/copay
  const profile = model.createBillingProfile({
    organizationId: orgId,
    householdId: household.id,
    childIds: [childIds.ava, childIds.ben].filter(Boolean),
    responsibleContactIds: [responsible.id, secondPayer?.id].filter(Boolean),
    payerSplits: [
      { contactId: responsible.id, percent: 60, fixedCents: 0 },
      ...(secondPayer ? [{ contactId: secondPayer.id, percent: 40, fixedCents: 0 }] : []),
    ],
    subsidySource: "Fake County Subsidy (FAKE)",
    copayCents: 15000,
    billingAddress: "100 Testing Lane, Example City",
    privateProviderNotes: "Internal collection note — never show to family.",
  });
  store.billingSimulator.billingProfiles[profile.id] = profile;
  ids.billingProfileId = profile.id;
  ids.responsibleContactId = responsible.id || "";

  const recurring = model.createRecurringPlan({
    organizationId: orgId,
    billingProfileId: profile.id,
    householdId: household.id,
    childId: childIds.ava || "",
    chargeType: model.CHARGE_TYPES.MONTHLY_TUITION,
    amountCents: 120000,
    frequency: "monthly",
    discountCents: 5000,
    payerSplits: profile.payerSplits,
    status: model.RECURRING_STATUSES.ACTIVE,
  });
  model.appendRecurringHistory(recurring, { action: "created", actorEmail: adminEmail, detail: "Seeded recurring tuition" });
  store.billingSimulator.recurringPlans[recurring.id] = recurring;
  ids.recurringPlanId = recurring.id;

  const cycleKey = `${model.todayDate().slice(0, 7)}`;
  const { invoice } = model.generateInvoiceForCycle(store, recurring, cycleKey, adminEmail);
  invoice.subsidyCents = 40000;
  invoice.copayCents = 15000;
  invoice.totalCents = model.addCents(invoice.subtotalCents, -invoice.discountCents, -invoice.subsidyCents);
  invoice.balanceCents = invoice.totalCents;
  invoice.payerContactIds = profile.responsibleContactIds;
  invoice.privateCollectionNotes = "Do not expose to Family Hub.";
  store.billingSimulator.invoices[invoice.id] = invoice;
  ids.openInvoiceId = invoice.id;

  // Partial payment
  const partial = model.createLedgerEntry({
    organizationId: orgId,
    invoiceId: invoice.id,
    billingProfileId: profile.id,
    type: model.LEDGER_TYPES.PARTIAL_PAYMENT,
    amountCents: 20000,
    payerContactId: responsible.id,
    note: "Partial payment simulation",
    idempotencyKey: `partial-${invoice.id}-1`,
  });
  store.billingSimulator.ledger[partial.id] = partial;
  model.applyLedgerToInvoice(invoice, partial);
  model.appendInvoiceHistory(invoice, { action: "partial_payment", actorEmail: adminEmail, detail: "Simulated partial payment" });
  store.billingSimulator.invoices[invoice.id] = invoice;
  ids.partialLedgerId = partial.id;

  // Past-due invoice
  const pastDue = model.createInvoice({
    organizationId: orgId,
    billingProfileId: profile.id,
    householdId: household.id,
    childIds: [childIds.ben].filter(Boolean),
    payerContactIds: [responsible.id].filter(Boolean),
    lineItems: [{ chargeType: model.CHARGE_TYPES.MONTHLY_TUITION, description: "Past due tuition (FAKE)", childId: childIds.ben || "", amountCents: 110000 }],
    status: model.INVOICE_STATUSES.PAST_DUE,
    dueDate: "2026-06-01",
    privateCollectionNotes: "Internal only",
  });
  store.billingSimulator.invoices[pastDue.id] = pastDue;
  ids.pastDueInvoiceId = pastDue.id;

  // Failed payment simulation on past due
  const failed = model.createLedgerEntry({
    organizationId: orgId,
    invoiceId: pastDue.id,
    billingProfileId: profile.id,
    type: model.LEDGER_TYPES.FAILED_PAYMENT,
    amountCents: 110000,
    payerContactId: responsible.id,
    note: "Failed payment simulation",
    idempotencyKey: `fail-${pastDue.id}-1`,
  });
  store.billingSimulator.ledger[failed.id] = failed;
  model.applyLedgerToInvoice(pastDue, failed);
  store.billingSimulator.invoices[pastDue.id] = pastDue;
  ids.failedLedgerId = failed.id;

  // Credit/refund sample on a paid invoice
  const paid = model.createInvoice({
    organizationId: orgId,
    billingProfileId: profile.id,
    householdId: household.id,
    childIds: [childIds.ava].filter(Boolean),
    payerContactIds: [responsible.id].filter(Boolean),
    lineItems: [{ chargeType: model.CHARGE_TYPES.REGISTRATION, description: "Registration (FAKE)", amountCents: 10000 }],
    status: model.INVOICE_STATUSES.PAID_SIM,
    balanceCents: 0,
  });
  store.billingSimulator.invoices[paid.id] = paid;
  const pay = model.createLedgerEntry({
    organizationId: orgId,
    invoiceId: paid.id,
    billingProfileId: profile.id,
    type: model.LEDGER_TYPES.PAYMENT,
    amountCents: 10000,
    payerContactId: responsible.id,
    idempotencyKey: `pay-${paid.id}`,
  });
  store.billingSimulator.ledger[pay.id] = pay;
  const refund = model.createLedgerEntry({
    organizationId: orgId,
    invoiceId: paid.id,
    billingProfileId: profile.id,
    type: model.LEDGER_TYPES.REFUND,
    amountCents: 2500,
    payerContactId: responsible.id,
    note: "Refund simulation — adjustment entry",
    idempotencyKey: `refund-${paid.id}`,
  });
  store.billingSimulator.ledger[refund.id] = refund;
  model.applyLedgerToInvoice(paid, refund);
  store.billingSimulator.invoices[paid.id] = paid;
  ids.refundLedgerId = refund.id;

  // Late pickup suggestion (requires provider approval)
  const suggestion = model.createChargeSuggestion({
    organizationId: orgId,
    childId: childIds.ava || "",
    chargeType: model.CHARGE_TYPES.LATE_PICKUP,
    amountCents: 2500,
    reason: "Late pickup from attendance (FAKE) — requires provider review",
  });
  store.billingSimulator.chargeSuggestions[suggestion.id] = suggestion;
  ids.latePickupSuggestionId = suggestion.id;

  // Enrollment deposit connection fixture
  const deposit = model.createInvoice({
    organizationId: orgId,
    billingProfileId: profile.id,
    householdId: household.id,
    childIds: [childIds.carlos].filter(Boolean),
    payerContactIds: [responsible.id].filter(Boolean),
    lineItems: [{ chargeType: model.CHARGE_TYPES.ENROLLMENT_DEPOSIT, description: "Enrollment deposit (FAKE — no payment processed)", amountCents: 20000 }],
    status: model.INVOICE_STATUSES.SCHEDULED,
    notes: "Linked to Phase 12 enrollment offer simulation",
  });
  store.billingSimulator.invoices[deposit.id] = deposit;
  ids.enrollmentDepositInvoiceId = deposit.id;

  store.billingSimulator.meta.phase17SeededFor = orgId;
  store.billingSimulator.meta.phase17Ids = ids;
  store.billingSimulator.meta.scenarioLabels = [
    "curriculum_only_catalog",
    "home_daycare_catalog",
    "small_center",
    "growing_center",
    "large_center",
    "founding_member",
    "classroom_add_on",
    "plan_limit_scenario",
    "upgrade_downgrade_preview",
    "one_child_and_siblings",
    "split_payers",
    "subsidy_plus_copay",
    "partial_payment",
    "past_due_invoice",
    "failed_payment_simulation",
    "credit_refund",
    "late_pickup_suggestion",
    "enrollment_deposit",
  ];
  store.billingSimulator.meta.updatedAt = model.nowIso();

  return { organizationId: orgId, alreadySeeded: false, ids };
}

function resetPhase17Preview(store, opts = {}) {
  model.ensureBillingStore(store);
  for (const key of Object.keys(store.billingSimulator)) {
    if (key === "meta") continue;
    store.billingSimulator[key] = {};
  }
  if (store.billingSimulator.meta) {
    delete store.billingSimulator.meta.phase17SeededFor;
    delete store.billingSimulator.meta.phase17Ids;
  }
  return ensurePhase17Preview(store, opts);
}

module.exports = {
  ensurePhase17Preview,
  resetPhase17Preview,
};
