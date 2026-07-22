/**
 * Phase 17 — Platform pricing + family tuition billing simulator.
 * Integer cents only. Append-only ledger. No Stripe, no real money, no card/bank storage.
 */

const crypto = require("node:crypto");
const entitlements = require("./entitlement-model.js");

const TESTING_BANNER = "Testing Only — No Real Payment Will Be Processed.";
const PLATFORM_BANNER = "Testing Account — Fake Data Only. Platform subscription simulator (no Stripe).";

const SUBSCRIPTION_STATUSES = Object.freeze({
  TRIALING: "trialing",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  GRACE: "grace_period",
  CANCELED_PENDING_END: "canceled_pending_end",
  ENDED: "ended",
  PAYMENT_FAILED: "payment_failed",
});

const FOUNDING_STATUSES = Object.freeze({
  ACTIVE: "founding_active",
  FORMER: "former_founding",
  NONE: "none",
});

const INVOICE_STATUSES = Object.freeze({
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  OPEN: "open",
  PARTIALLY_PAID: "partially_paid",
  PAID_SIM: "paid_in_simulation",
  PAST_DUE: "past_due",
  PAYMENT_FAILED_SIM: "payment_failed_in_simulation",
  WAIVED: "waived",
  VOIDED: "voided",
  REFUNDED_SIM: "refunded_in_simulation",
  UNCOLLECTIBLE: "uncollectible",
  ARCHIVED: "archived",
});

const CHARGE_TYPES = Object.freeze({
  WEEKLY_TUITION: "weekly_tuition",
  BIWEEKLY_TUITION: "biweekly_tuition",
  MONTHLY_TUITION: "monthly_tuition",
  DAILY_CARE: "daily_care",
  DROP_IN: "drop_in_care",
  REGISTRATION: "registration",
  ENROLLMENT_DEPOSIT: "enrollment_deposit",
  SUPPLY_FEE: "supply_fee",
  ACTIVITY_FEE: "activity_fee",
  TRANSPORTATION: "transportation",
  MEALS: "meals",
  LATE_PICKUP: "late_pickup",
  RETURNED_PAYMENT_FEE: "returned_payment_fee",
  CUSTOM: "custom_charge",
  DISCOUNT: "discount",
  SIBLING_DISCOUNT: "sibling_discount",
  CREDIT: "credit",
  SUBSIDY: "subsidy_payment",
  COPAY: "copay",
  REFUND_ADJUSTMENT: "refund_adjustment",
});

const LEDGER_TYPES = Object.freeze({
  CHARGE: "charge",
  PAYMENT: "payment",
  PARTIAL_PAYMENT: "partial_payment",
  SUBSIDY_PAYMENT: "subsidy_payment",
  FAILED_PAYMENT: "failed_payment",
  REVERSAL: "reversed_payment",
  REFUND: "refund",
  CREDIT: "credit",
  WAIVER: "waiver",
  ADJUSTMENT: "adjustment",
});

const RECURRING_STATUSES = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  ENDED: "ended",
});

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return nowIso().slice(0, 10);
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

/** Exact money helpers — integer cents only. */
function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function addCents(...parts) {
  return parts.reduce((sum, part) => sum + toCents(part), 0);
}

function formatCents(cents) {
  const n = toCents(cents);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function ensureBillingStore(store) {
  if (!store.billingSimulator || typeof store.billingSimulator !== "object") store.billingSimulator = {};
  const b = store.billingSimulator;
  const collections = [
    "platformSubscriptions",
    "platformAudit",
    "billingProfiles",
    "recurringPlans",
    "invoices",
    "ledger",
    "chargeSuggestions",
    "statements",
    "idempotencyKeys",
  ];
  for (const key of collections) {
    if (!b[key] || typeof b[key] !== "object") b[key] = {};
  }
  if (!b.meta || typeof b.meta !== "object") {
    b.meta = {
      createdAt: nowIso(),
      noStripe: true,
      noRealCheckout: true,
      noCardStorage: true,
      noBankStorage: true,
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noLiveAi: true,
      noProductionStorage: true,
      moneyUnit: "integer_cents",
      testingOnly: true,
    };
  }
  b.meta.updatedAt = nowIso();
  return b;
}

function catalogPlans() {
  const addOn = entitlements.CLASSROOM_ADD_ON;
  const plans = Object.values(entitlements.PLANNED_PLAN_CATALOG).map((plan) => {
    const features = entitlements.resolvePlanFeatures(plan.key);
    return {
      key: plan.key,
      label: plan.label,
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
      monthlyDisplay: plan.monthlyPriceCents == null ? null : formatCents(plan.monthlyPriceCents),
      annualDisplay: plan.annualPriceCents == null ? null : formatCents(plan.annualPriceCents),
      annualSavingsCents: plan.monthlyPriceCents && plan.annualPriceCents
        ? (plan.monthlyPriceCents * 12) - plan.annualPriceCents
        : 0,
      classroomLimit: plan.classroomLimit,
      staffAccountLimit: plan.staffAccountLimit,
      allowsClassroomAddOns: plan.allowsClassroomAddOns === true,
      features,
      excludes: plan.excludes || [],
      founding: plan.key === entitlements.PLAN_KEYS.FOUNDING_MEMBER,
      live: false,
      testingOnly: true,
    };
  });
  return {
    plans,
    classroomAddOn: {
      key: "classroom_add_on",
      label: addOn.label || "Classroom add-on",
      monthlyPriceCents: addOn.monthlyPriceCents,
      annualPriceCents: addOn.annualPriceCents,
      classroomsGranted: addOn.classroomsGranted,
      staffAccountsGranted: addOn.staffAccountsGranted,
      live: false,
    },
    foundingNotes: [
      "Active founding base membership remains $9.99 monthly while continuously active.",
      "Founding protection applies to the base membership only; add-ons are separately priced.",
      "If founding membership ends, reclaim is not automatically promised.",
      "Original founding status and history are preserved.",
    ],
    noManipulativeCountdowns: true,
    stripeUntouched: true,
  };
}

function createPlatformSubscription(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("platsob"),
    organizationId: cleanText(input.organizationId, 80),
    planKey: cleanText(input.planKey || entitlements.PLAN_KEYS.SMALL_CENTER, 80),
    billingInterval: cleanText(input.billingInterval || "monthly", 20),
    status: Object.values(SUBSCRIPTION_STATUSES).includes(input.status) ? input.status : SUBSCRIPTION_STATUSES.ACTIVE,
    classroomAddOnQuantity: Math.max(0, toCents(input.classroomAddOnQuantity || 0)),
    foundingStatus: Object.values(FOUNDING_STATUSES).includes(input.foundingStatus)
      ? input.foundingStatus
      : FOUNDING_STATUSES.NONE,
    foundingHistoryPreserved: true,
    periodStart: cleanText(input.periodStart || todayDate(), 40),
    periodEnd: cleanText(input.periodEnd || "", 40),
    cancelAtPeriodEnd: input.cancelAtPeriodEnd === true,
    scheduledDowngradePlanKey: cleanText(input.scheduledDowngradePlanKey, 80),
    trialEndsAt: cleanText(input.trialEndsAt, 40),
    simulatedOnly: true,
    noStripe: true,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function appendPlatformAudit(store, entry = {}) {
  ensureBillingStore(store);
  const row = {
    id: newId("plataud"),
    organizationId: cleanText(entry.organizationId, 80),
    action: cleanText(entry.action, 80),
    actorEmail: cleanText(entry.actorEmail, 160).toLowerCase(),
    detail: cleanText(entry.detail, 2000),
    before: entry.before || null,
    after: entry.after || null,
    at: nowIso(),
    testingOnly: true,
  };
  store.billingSimulator.platformAudit[row.id] = row;
  return row;
}

function previewDowngrade(store, organizationId, currentPlanKey, targetPlanKey, addOnQty = 0) {
  const classrooms = listValues(store.classrooms).filter((c) => c.organizationId === organizationId && c.status !== "archived");
  const staff = listValues(store.staffMemberships).filter((s) => (
    s.organizationId === organizationId
    && s.isBillingOwner !== true
    && s.status !== "deactivated"
    && s.status !== "inactive"
  ));
  const limits = entitlements.evaluatePlanLimits({
    basePlanKey: targetPlanKey,
    classroomAddOnQuantity: addOnQty,
    activeClassroomCount: classrooms.length,
    invitedStaffCountExcludingOwner: staff.length,
  });
  const overClassrooms = classrooms.length > limits.classroomLimit
    ? classrooms.slice(limits.classroomLimit).map((c) => ({ id: c.id, name: c.name || c.displayName }))
    : [];
  const overStaff = staff.length > limits.staffAccountLimit
    ? staff.slice(limits.staffAccountLimit).map((s) => ({ id: s.id, email: s.userEmail, name: s.displayName }))
    : [];
  return {
    currentPlanKey,
    targetPlanKey,
    currentUsage: { classrooms: classrooms.length, staff: staff.length },
    newLimits: { classroomLimit: limits.classroomLimit, staffAccountLimit: limits.staffAccountLimit },
    overLimit: { classrooms: overClassrooms, staff: overStaff },
    wouldBecomeReadOnly: overClassrooms.length || overStaff.length
      ? ["Excess classrooms/staff would become read-only until archived or seats freed."]
      : [],
    actionsRequired: [
      ...(overClassrooms.length ? [`Archive or upgrade before dropping below ${overClassrooms.length} excess classroom(s).`] : []),
      ...(overStaff.length ? [`Deactivate or upgrade before dropping below ${overStaff.length} excess staff seat(s).`] : []),
    ],
    neverSilentlyDeletes: true,
    effectiveDate: todayDate(),
    testingOnly: true,
  };
}

function applySimulatedEntitlement(store, organizationId, subscription) {
  store.organizationEntitlements = store.organizationEntitlements || {};
  let ent = listValues(store.organizationEntitlements).find((e) => e.organizationId === organizationId);
  if (!ent) {
    ent = entitlements.createOrganizationEntitlementRecord({
      organizationId,
      basePlanKey: subscription.planKey,
      classroomAddOnQuantity: subscription.classroomAddOnQuantity,
      foundingMemberEligible: subscription.foundingStatus === FOUNDING_STATUSES.ACTIVE,
    });
  }
  ent.basePlanKey = subscription.planKey === entitlements.PLAN_KEYS.FOUNDING_MEMBER
    ? entitlements.PLAN_KEYS.HOME_DAYCARE
    : subscription.planKey;
  ent.classroomAddOnQuantity = subscription.classroomAddOnQuantity || 0;
  ent.status = subscription.status === SUBSCRIPTION_STATUSES.ENDED
    ? entitlements.ENTITLEMENT_STATUSES.ENDED
    : subscription.status === SUBSCRIPTION_STATUSES.PAST_DUE || subscription.status === SUBSCRIPTION_STATUSES.PAYMENT_FAILED
      ? entitlements.ENTITLEMENT_STATUSES.PAST_DUE
      : entitlements.ENTITLEMENT_STATUSES.ACTIVE;
  ent.foundingMemberEligible = subscription.foundingStatus === FOUNDING_STATUSES.ACTIVE;
  if (subscription.foundingStatus === FOUNDING_STATUSES.ACTIVE) {
    ent.grandfatheredPriceCents = 999;
  }
  ent.billingInterval = subscription.billingInterval;
  ent.updatedAt = nowIso();
  ent.simulatedPhase17 = true;
  store.organizationEntitlements[ent.id] = ent;
  return ent;
}

function createBillingProfile(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("billprof"),
    organizationId: cleanText(input.organizationId, 80),
    householdId: cleanText(input.householdId, 80),
    childIds: Array.isArray(input.childIds) ? input.childIds.map((id) => cleanText(id, 80)) : [],
    responsibleContactIds: Array.isArray(input.responsibleContactIds)
      ? input.responsibleContactIds.map((id) => cleanText(id, 80))
      : [],
    payerSplits: Array.isArray(input.payerSplits) ? input.payerSplits : [],
    subsidySource: cleanText(input.subsidySource, 160),
    copayCents: toCents(input.copayCents || 0),
    billingAddress: cleanText(input.billingAddress, 500),
    statementPreference: cleanText(input.statementPreference || "portal", 40),
    autopayPreference: cleanText(input.autopayPreference || "off_placeholder", 40),
    status: cleanText(input.status || "active", 40),
    startDate: cleanText(input.startDate || todayDate(), 40),
    endDate: cleanText(input.endDate, 40),
    privateProviderNotes: cleanText(input.privateProviderNotes, 2000),
    noPaymentCredentialsStored: true,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createRecurringPlan(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("recur"),
    organizationId: cleanText(input.organizationId, 80),
    billingProfileId: cleanText(input.billingProfileId, 80),
    childId: cleanText(input.childId, 80),
    householdId: cleanText(input.householdId, 80),
    chargeType: Object.values(CHARGE_TYPES).includes(input.chargeType) ? input.chargeType : CHARGE_TYPES.MONTHLY_TUITION,
    amountCents: toCents(input.amountCents),
    frequency: cleanText(input.frequency || "monthly", 40),
    startDate: cleanText(input.startDate || todayDate(), 40),
    endDate: cleanText(input.endDate, 40),
    dueDateRule: cleanText(input.dueDateRule || "first_of_month", 80),
    prorationPreference: cleanText(input.prorationPreference || "none", 40),
    discountCents: toCents(input.discountCents || 0),
    payerSplits: Array.isArray(input.payerSplits) ? input.payerSplits : [],
    classroomId: cleanText(input.classroomId, 80),
    status: Object.values(RECURRING_STATUSES).includes(input.status) ? input.status : RECURRING_STATUSES.ACTIVE,
    changeHistory: Array.isArray(input.changeHistory) ? input.changeHistory : [],
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function appendRecurringHistory(plan, { action, actorEmail, detail } = {}) {
  plan.changeHistory = [...(plan.changeHistory || []), {
    id: newId("rechist"),
    action: cleanText(action, 80),
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    detail: cleanText(detail, 1000),
    at: nowIso(),
  }];
  plan.updatedAt = nowIso();
}

function createInvoice(input = {}) {
  const now = nowIso();
  const lineItems = Array.isArray(input.lineItems) ? input.lineItems.map((line) => ({
    id: line.id || newId("line"),
    chargeType: cleanText(line.chargeType || CHARGE_TYPES.CUSTOM, 80),
    description: cleanText(line.description, 300),
    childId: cleanText(line.childId, 80),
    amountCents: toCents(line.amountCents),
  })) : [];
  const subtotal = lineItems.reduce((sum, line) => addCents(sum, line.amountCents), 0);
  const discounts = toCents(input.discountCents || 0);
  const credits = toCents(input.creditCents || 0);
  const subsidy = toCents(input.subsidyCents || 0);
  const total = addCents(subtotal, -discounts, -credits, -subsidy);
  return {
    id: input.id || newId("inv"),
    organizationId: cleanText(input.organizationId, 80),
    billingProfileId: cleanText(input.billingProfileId, 80),
    householdId: cleanText(input.householdId, 80),
    childIds: Array.isArray(input.childIds) ? input.childIds : [],
    payerContactIds: Array.isArray(input.payerContactIds) ? input.payerContactIds : [],
    lineItems,
    discountCents: discounts,
    creditCents: credits,
    subsidyCents: subsidy,
    copayCents: toCents(input.copayCents || 0),
    subtotalCents: subtotal,
    totalCents: total,
    balanceCents: toCents(input.balanceCents != null ? input.balanceCents : total),
    dueDate: cleanText(input.dueDate || todayDate(), 40),
    status: Object.values(INVOICE_STATUSES).includes(input.status) ? input.status : INVOICE_STATUSES.OPEN,
    notes: cleanText(input.notes, 2000),
    privateCollectionNotes: cleanText(input.privateCollectionNotes, 2000),
    recurringPlanId: cleanText(input.recurringPlanId, 80),
    billingCycleKey: cleanText(input.billingCycleKey, 120),
    history: Array.isArray(input.history) ? input.history : [],
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function appendInvoiceHistory(invoice, { action, actorEmail, detail } = {}) {
  invoice.history = [...(invoice.history || []), {
    id: newId("invhist"),
    action: cleanText(action, 80),
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    detail: cleanText(detail, 1000),
    at: nowIso(),
  }];
  invoice.updatedAt = nowIso();
}

function createLedgerEntry(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("led"),
    organizationId: cleanText(input.organizationId, 80),
    invoiceId: cleanText(input.invoiceId, 80),
    billingProfileId: cleanText(input.billingProfileId, 80),
    type: Object.values(LEDGER_TYPES).includes(input.type) ? input.type : LEDGER_TYPES.PAYMENT,
    amountCents: toCents(input.amountCents),
    payerContactId: cleanText(input.payerContactId, 80),
    note: cleanText(input.note, 1000),
    idempotencyKey: cleanText(input.idempotencyKey, 160),
    simulated: true,
    appendOnly: true,
    testingOnly: true,
    createdAt: input.createdAt || now,
  };
}

function claimIdempotency(store, key, scope) {
  ensureBillingStore(store);
  const full = `${scope}|${key}`;
  if (!key) return { ok: true, first: true };
  const existing = store.billingSimulator.idempotencyKeys[full];
  if (existing) return { ok: true, first: false, existing };
  const row = { id: full, scope, key, at: nowIso(), resultId: "" };
  store.billingSimulator.idempotencyKeys[full] = row;
  return { ok: true, first: true, row };
}

function applyLedgerToInvoice(invoice, entry) {
  const amount = toCents(entry.amountCents);
  if ([LEDGER_TYPES.PAYMENT, LEDGER_TYPES.PARTIAL_PAYMENT, LEDGER_TYPES.SUBSIDY_PAYMENT, LEDGER_TYPES.CREDIT, LEDGER_TYPES.WAIVER].includes(entry.type)) {
    invoice.balanceCents = Math.max(0, addCents(invoice.balanceCents, -Math.abs(amount)));
  } else if ([LEDGER_TYPES.REFUND, LEDGER_TYPES.REVERSAL, LEDGER_TYPES.CHARGE, LEDGER_TYPES.ADJUSTMENT].includes(entry.type) && amount > 0 && entry.type !== LEDGER_TYPES.REFUND) {
    if (entry.type === LEDGER_TYPES.CHARGE || entry.type === LEDGER_TYPES.ADJUSTMENT) {
      invoice.balanceCents = addCents(invoice.balanceCents, Math.abs(amount));
    }
  } else if (entry.type === LEDGER_TYPES.REFUND || entry.type === LEDGER_TYPES.REVERSAL) {
    invoice.balanceCents = addCents(invoice.balanceCents, Math.abs(amount));
  }
  if (entry.type === LEDGER_TYPES.FAILED_PAYMENT) {
    invoice.status = INVOICE_STATUSES.PAYMENT_FAILED_SIM;
  } else if (invoice.balanceCents === 0 && entry.type !== LEDGER_TYPES.FAILED_PAYMENT) {
    invoice.status = entry.type === LEDGER_TYPES.WAIVER ? INVOICE_STATUSES.WAIVED : INVOICE_STATUSES.PAID_SIM;
  } else if (invoice.balanceCents > 0 && invoice.balanceCents < invoice.totalCents) {
    invoice.status = INVOICE_STATUSES.PARTIALLY_PAID;
  }
  invoice.updatedAt = nowIso();
  return invoice;
}

function generateInvoiceForCycle(store, plan, cycleKey, actorEmail) {
  ensureBillingStore(store);
  const existing = listValues(store.billingSimulator.invoices).find((inv) => (
    inv.organizationId === plan.organizationId
    && inv.recurringPlanId === plan.id
    && inv.billingCycleKey === cycleKey
  ));
  if (existing) return { invoice: existing, duplicatePrevented: true };

  const idem = claimIdempotency(store, cycleKey, `cycle:${plan.id}`);
  if (!idem.first && idem.existing?.resultId) {
    const prior = store.billingSimulator.invoices[idem.existing.resultId];
    if (prior) return { invoice: prior, duplicatePrevented: true };
  }

  const amount = Math.max(0, addCents(plan.amountCents, -plan.discountCents));
  const invoice = createInvoice({
    organizationId: plan.organizationId,
    billingProfileId: plan.billingProfileId,
    householdId: plan.householdId,
    childIds: plan.childId ? [plan.childId] : [],
    lineItems: [{
      chargeType: plan.chargeType,
      description: `${plan.chargeType} (FAKE cycle ${cycleKey})`,
      childId: plan.childId,
      amountCents: plan.amountCents,
    }],
    discountCents: plan.discountCents,
    totalCents: amount,
    balanceCents: amount,
    recurringPlanId: plan.id,
    billingCycleKey: cycleKey,
    status: INVOICE_STATUSES.OPEN,
  });
  appendInvoiceHistory(invoice, { action: "generated", actorEmail, detail: `Idempotent cycle ${cycleKey}` });
  store.billingSimulator.invoices[invoice.id] = invoice;
  if (idem.row) {
    idem.row.resultId = invoice.id;
    store.billingSimulator.idempotencyKeys[idem.row.id] = idem.row;
  }
  return { invoice, duplicatePrevented: false };
}

function createChargeSuggestion(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("chgsug"),
    organizationId: cleanText(input.organizationId, 80),
    childId: cleanText(input.childId, 80),
    attendanceId: cleanText(input.attendanceId, 80),
    chargeType: cleanText(input.chargeType || CHARGE_TYPES.LATE_PICKUP, 80),
    amountCents: toCents(input.amountCents || 2500),
    reason: cleanText(input.reason || "Attendance-linked suggestion (FAKE)", 500),
    status: cleanText(input.status || "pending_provider_review", 40),
    autoBilled: false,
    requiresProviderConfirmation: true,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

module.exports = {
  TESTING_BANNER,
  PLATFORM_BANNER,
  SUBSCRIPTION_STATUSES,
  FOUNDING_STATUSES,
  INVOICE_STATUSES,
  CHARGE_TYPES,
  LEDGER_TYPES,
  RECURRING_STATUSES,
  newId,
  nowIso,
  todayDate,
  cleanText,
  listValues,
  toCents,
  addCents,
  formatCents,
  ensureBillingStore,
  catalogPlans,
  createPlatformSubscription,
  appendPlatformAudit,
  previewDowngrade,
  applySimulatedEntitlement,
  createBillingProfile,
  createRecurringPlan,
  appendRecurringHistory,
  createInvoice,
  appendInvoiceHistory,
  createLedgerEntry,
  claimIdempotency,
  applyLedgerToInvoice,
  generateInvoiceForCycle,
  createChargeSuggestion,
};
