/**
 * Phase 8 — Provider → family childcare tuition billing (TESTING ONLY).
 *
 * SEPARATE from Little Learner Hub SaaS subscription billing
 * (store.users Stripe fields, billingEvents, Stripe Checkout/webhooks).
 *
 * Canonical refs only — no second child/family roster:
 * - programId → store.programs
 * - householdId → store.familyHouseholds (membership = childIds)
 * - childIds → Profiles on program child blob
 *
 * Future Stripe Connect (or other processor) can attach processor refs
 * to tuitionPayments without redesigning invoices/ledger.
 */
"use strict";

const crypto = require("node:crypto");

const INVOICE_STATUSES = Object.freeze({
  DRAFT: "draft",
  OPEN: "open",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  OVERDUE: "overdue",
  VOID: "void",
  CREDITED: "credited",
});

const LINE_TYPES = Object.freeze({
  TUITION_WEEKLY: "tuition_weekly",
  TUITION_MONTHLY: "tuition_monthly",
  TUITION_CUSTOM: "tuition_custom",
  REGISTRATION: "registration_fee",
  ONE_TIME: "one_time",
  DISCOUNT: "discount",
  CREDIT: "credit",
  ADJUSTMENT: "adjustment",
});

const PAYMENT_STATUSES = Object.freeze({
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  PENDING: "pending",
});

function ensureTuitionCollections(store) {
  store.tuitionRates = store.tuitionRates && typeof store.tuitionRates === "object" ? store.tuitionRates : {};
  store.tuitionInvoices = store.tuitionInvoices && typeof store.tuitionInvoices === "object" ? store.tuitionInvoices : {};
  store.tuitionPayments = store.tuitionPayments && typeof store.tuitionPayments === "object" ? store.tuitionPayments : {};
  store.tuitionPaymentIdempotency = store.tuitionPaymentIdempotency && typeof store.tuitionPaymentIdempotency === "object"
    ? store.tuitionPaymentIdempotency
    : {};
  return store;
}

function moneyCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function formatMoney(cents, currency = "USD") {
  const amount = moneyCents(cents) / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch (_error) {
    return `$${(amount).toFixed(2)}`;
  }
}

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeLineItem(item = {}) {
  const type = String(item.type || LINE_TYPES.ONE_TIME).trim() || LINE_TYPES.ONE_TIME;
  let unit = moneyCents(item.unitAmountCents != null ? item.unitAmountCents : item.amountCents);
  const quantity = Math.max(1, Number(item.quantity) || 1);
  if (type === LINE_TYPES.DISCOUNT || type === LINE_TYPES.CREDIT) {
    unit = -Math.abs(unit);
  } else if (type !== LINE_TYPES.ADJUSTMENT) {
    unit = Math.abs(unit);
  }
  const totalCents = unit * quantity;
  return {
    id: String(item.id || newId("line")),
    type,
    description: String(item.description || type).trim().slice(0, 240) || type,
    unitAmountCents: unit,
    quantity,
    totalCents,
    amountCents: totalCents,
    childId: String(item.childId || "").trim(),
  };
}

function sumLineItems(lineItems = []) {
  return (Array.isArray(lineItems) ? lineItems : []).reduce((sum, item) => sum + moneyCents(item.totalCents ?? item.amountCents), 0);
}

function paymentsForInvoice(store, invoiceId) {
  const id = String(invoiceId || "");
  return Object.values(store.tuitionPayments || {})
    .filter((p) => p && String(p.invoiceId) === id && p.status === PAYMENT_STATUSES.SUCCEEDED && !p.voided)
    .sort((a, b) => String(a.paidAt || a.createdAt || "").localeCompare(String(b.paidAt || b.createdAt || "")));
}

function amountPaidCents(store, invoice) {
  return paymentsForInvoice(store, invoice.id).reduce((sum, p) => sum + moneyCents(p.amountCents), 0);
}

function deriveInvoiceStatus(invoice = {}, paidCents = 0, today = todayIso()) {
  if (String(invoice.status) === INVOICE_STATUSES.VOID) return INVOICE_STATUSES.VOID;
  if (String(invoice.status) === INVOICE_STATUSES.DRAFT) return INVOICE_STATUSES.DRAFT;
  const total = moneyCents(invoice.totalCents);
  if (total <= 0 && paidCents <= 0) return INVOICE_STATUSES.CREDITED;
  if (paidCents >= total && total > 0) return INVOICE_STATUSES.PAID;
  if (paidCents > 0 && paidCents < total) return INVOICE_STATUSES.PARTIALLY_PAID;
  const due = String(invoice.dueDate || "").slice(0, 10);
  if (due && due < today && paidCents < total) return INVOICE_STATUSES.OVERDUE;
  return INVOICE_STATUSES.OPEN;
}

function publicTuitionRate(rate = {}) {
  return {
    id: String(rate.id || ""),
    programId: String(rate.programId || ""),
    childId: String(rate.childId || ""),
    householdId: String(rate.householdId || ""),
    schedule: String(rate.schedule || "weekly"), // weekly | monthly | custom
    amountCents: moneyCents(rate.amountCents),
    currency: String(rate.currency || "USD"),
    label: String(rate.label || "").trim(),
    active: rate.active !== false,
    customCadenceNote: String(rate.customCadenceNote || "").trim(),
    updatedAt: String(rate.updatedAt || ""),
  };
}

function publicTuitionInvoice(store, invoice = {}, { today = todayIso() } = {}) {
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems.map(normalizeLineItem) : [];
  const totalCents = moneyCents(invoice.totalCents != null ? invoice.totalCents : sumLineItems(lineItems));
  const paidCents = amountPaidCents(store, invoice);
  const status = deriveInvoiceStatus({ ...invoice, totalCents }, paidCents, today);
  const balanceCents = Math.max(0, totalCents - paidCents);
  return {
    id: String(invoice.id || ""),
    programId: String(invoice.programId || ""),
    householdId: String(invoice.householdId || ""),
    childIds: Array.isArray(invoice.childIds) ? invoice.childIds.map(String) : [],
    status,
    statusLabel: statusLabel(status),
    currency: String(invoice.currency || "USD"),
    lineItems,
    totalCents,
    totalLabel: formatMoney(totalCents, invoice.currency || "USD"),
    amountPaidCents: paidCents,
    amountPaidLabel: formatMoney(paidCents, invoice.currency || "USD"),
    balanceCents,
    balanceLabel: formatMoney(balanceCents, invoice.currency || "USD"),
    amountDueCents: balanceCents,
    amountDueLabel: formatMoney(balanceCents, invoice.currency || "USD"),
    dueDate: String(invoice.dueDate || "").slice(0, 10),
    periodStart: String(invoice.periodStart || "").slice(0, 10),
    periodEnd: String(invoice.periodEnd || "").slice(0, 10),
    notes: String(invoice.notes || "").trim(),
    createdAt: String(invoice.createdAt || ""),
    updatedAt: String(invoice.updatedAt || ""),
    issuedAt: String(invoice.issuedAt || ""),
    simulated: invoice.simulated !== false,
    processorReady: false, // Stripe Connect later — architecture placeholder
  };
}

function statusLabel(status = "") {
  const map = {
    draft: "Draft",
    open: "Unpaid",
    partially_paid: "Partially paid",
    paid: "Paid",
    overdue: "Overdue",
    void: "Void",
    credited: "Credited",
  };
  return map[String(status || "").toLowerCase()] || String(status || "Open");
}

function publicTuitionPayment(payment = {}) {
  return {
    id: String(payment.id || ""),
    invoiceId: String(payment.invoiceId || ""),
    programId: String(payment.programId || ""),
    householdId: String(payment.householdId || ""),
    amountCents: moneyCents(payment.amountCents),
    amountLabel: formatMoney(payment.amountCents, payment.currency || "USD"),
    currency: String(payment.currency || "USD"),
    method: String(payment.method || "simulated"),
    status: String(payment.status || PAYMENT_STATUSES.SUCCEEDED),
    simulated: payment.simulated !== false,
    paidAt: String(payment.paidAt || payment.createdAt || ""),
    recordedBy: String(payment.recordedBy || ""),
    receiptNumber: String(payment.receiptNumber || payment.id || ""),
    idempotencyKey: String(payment.idempotencyKey || ""),
    processor: String(payment.processor || "simulated"), // future: stripe_connect
    processorPaymentId: String(payment.processorPaymentId || ""),
    notes: String(payment.notes || "").trim(),
  };
}

function listInvoicesForProgram(store, programId) {
  const key = String(programId || "");
  return Object.values(store.tuitionInvoices || {})
    .filter((inv) => inv && String(inv.programId) === key)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function listInvoicesForHousehold(store, householdId) {
  const key = String(householdId || "");
  return Object.values(store.tuitionInvoices || {})
    .filter((inv) => inv && String(inv.householdId) === key && String(inv.status) !== INVOICE_STATUSES.DRAFT)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function listRatesForProgram(store, programId) {
  const key = String(programId || "");
  return Object.values(store.tuitionRates || {})
    .filter((rate) => rate && String(rate.programId) === key && rate.active !== false)
    .sort((a, b) => String(a.childId || "").localeCompare(String(b.childId || "")));
}

function householdBalance(store, householdId, { today = todayIso() } = {}) {
  const invoices = listInvoicesForHousehold(store, householdId)
    .map((inv) => publicTuitionInvoice(store, inv, { today }))
    .filter((inv) => inv.status !== INVOICE_STATUSES.VOID);
  const amountDueCents = invoices
    .filter((inv) => ["open", "partially_paid", "overdue"].includes(inv.status))
    .reduce((sum, inv) => sum + inv.balanceCents, 0);
  const overdueCents = invoices
    .filter((inv) => inv.status === INVOICE_STATUSES.OVERDUE)
    .reduce((sum, inv) => sum + inv.balanceCents, 0);
  const paidCents = invoices.reduce((sum, inv) => sum + inv.amountPaidCents, 0);
  return {
    householdId: String(householdId || ""),
    amountDueCents,
    amountDueLabel: formatMoney(amountDueCents),
    overdueCents,
    overdueLabel: formatMoney(overdueCents),
    paidCents,
    paidLabel: formatMoney(paidCents),
    invoiceCount: invoices.length,
    openCount: invoices.filter((i) => ["open", "partially_paid", "overdue"].includes(i.status)).length,
    overdueCount: invoices.filter((i) => i.status === INVOICE_STATUSES.OVERDUE).length,
  };
}

function providerBillingDashboard(store, programId, { today = todayIso(), households = [] } = {}) {
  const invoices = listInvoicesForProgram(store, programId)
    .map((inv) => publicTuitionInvoice(store, inv, { today }));
  const live = invoices.filter((i) => i.status !== INVOICE_STATUSES.VOID && i.status !== INVOICE_STATUSES.DRAFT);
  const byHousehold = {};
  live.forEach((inv) => {
    const hid = inv.householdId || "unknown";
    if (!byHousehold[hid]) {
      const hh = (Array.isArray(households) ? households : []).find((h) => String(h.id) === hid);
      byHousehold[hid] = {
        householdId: hid,
        label: hh?.label || hh?.email || hid,
        amountDueCents: 0,
        overdueCents: 0,
        statuses: [],
      };
    }
    if (["open", "partially_paid", "overdue"].includes(inv.status)) {
      byHousehold[hid].amountDueCents += inv.balanceCents;
    }
    if (inv.status === INVOICE_STATUSES.OVERDUE) byHousehold[hid].overdueCents += inv.balanceCents;
    byHousehold[hid].statuses.push(inv.status);
  });
  const owing = Object.values(byHousehold).filter((row) => row.amountDueCents > 0);
  return {
    programId: String(programId || ""),
    totals: {
      amountDueCents: owing.reduce((s, r) => s + r.amountDueCents, 0),
      amountDueLabel: formatMoney(owing.reduce((s, r) => s + r.amountDueCents, 0)),
      overdueCents: owing.reduce((s, r) => s + r.overdueCents, 0),
      overdueLabel: formatMoney(owing.reduce((s, r) => s + r.overdueCents, 0)),
      unpaidCount: live.filter((i) => i.status === INVOICE_STATUSES.OPEN).length,
      partiallyPaidCount: live.filter((i) => i.status === INVOICE_STATUSES.PARTIALLY_PAID).length,
      paidCount: live.filter((i) => i.status === INVOICE_STATUSES.PAID).length,
      overdueCount: live.filter((i) => i.status === INVOICE_STATUSES.OVERDUE).length,
      invoiceCount: live.length,
    },
    householdsOwing: owing.sort((a, b) => b.amountDueCents - a.amountDueCents),
    recentInvoices: live.slice(0, 40),
    testingOnly: true,
    realChargesEnabled: false,
  };
}

function createInvoice(store, {
  programId,
  householdId,
  childIds = [],
  lineItems = [],
  dueDate = "",
  periodStart = "",
  periodEnd = "",
  notes = "",
  currency = "USD",
  createdByEmail = "",
  status = INVOICE_STATUSES.OPEN,
} = {}) {
  const lines = (Array.isArray(lineItems) ? lineItems : []).map(normalizeLineItem);
  if (!lines.length) throw new Error("Add at least one line item.");
  if (!programId) throw new Error("programId is required.");
  if (!householdId) throw new Error("householdId is required.");
  const now = new Date().toISOString();
  const totalCents = sumLineItems(lines);
  const invoice = {
    id: newId("inv"),
    programId: String(programId),
    householdId: String(householdId),
    childIds: [...new Set((Array.isArray(childIds) ? childIds : []).map(String).filter(Boolean))],
    lineItems: lines,
    totalCents,
    currency: String(currency || "USD"),
    dueDate: String(dueDate || todayIso()).slice(0, 10),
    periodStart: String(periodStart || "").slice(0, 10),
    periodEnd: String(periodEnd || "").slice(0, 10),
    notes: String(notes || "").trim().slice(0, 2000),
    status: String(status || INVOICE_STATUSES.OPEN),
    createdAt: now,
    updatedAt: now,
    issuedAt: status === INVOICE_STATUSES.DRAFT ? "" : now,
    createdByEmail: String(createdByEmail || "").toLowerCase(),
    simulated: true,
  };
  store.tuitionInvoices[invoice.id] = invoice;
  return invoice;
}

/**
 * Record a payment with idempotency — retries with the same key return the same payment.
 * Never creates duplicate succeeded charges for the same key.
 */
function recordPayment(store, {
  invoiceId,
  amountCents,
  method = "simulated",
  recordedBy = "",
  notes = "",
  idempotencyKey = "",
  paidAt = "",
} = {}) {
  const invoice = store.tuitionInvoices?.[invoiceId];
  if (!invoice) throw new Error("Invoice not found.");
  if (String(invoice.status) === INVOICE_STATUSES.VOID) throw new Error("Cannot pay a void invoice.");
  const key = String(idempotencyKey || "").trim();
  if (key && store.tuitionPaymentIdempotency[key]) {
    const existingId = store.tuitionPaymentIdempotency[key];
    const existing = store.tuitionPayments[existingId];
    if (existing) return { payment: existing, duplicate: true };
  }
  const pub = publicTuitionInvoice(store, invoice);
  const amount = moneyCents(amountCents);
  if (amount <= 0) throw new Error("Payment amount must be greater than zero.");
  if (amount > pub.balanceCents) throw new Error("Payment exceeds amount due.");
  const now = paidAt || new Date().toISOString();
  const payment = {
    id: newId("pay"),
    invoiceId: invoice.id,
    programId: invoice.programId,
    householdId: invoice.householdId,
    amountCents: amount,
    currency: invoice.currency || "USD",
    method: String(method || "simulated"),
    status: PAYMENT_STATUSES.SUCCEEDED,
    simulated: true,
    paidAt: now,
    createdAt: now,
    recordedBy: String(recordedBy || "").trim(),
    receiptNumber: `RCPT-${Date.now().toString(36).toUpperCase()}`,
    idempotencyKey: key,
    processor: method === "simulated" ? "simulated" : String(method),
    processorPaymentId: "",
    notes: String(notes || "").trim().slice(0, 1000),
  };
  store.tuitionPayments[payment.id] = payment;
  if (key) store.tuitionPaymentIdempotency[key] = payment.id;
  invoice.updatedAt = now;
  // Refresh derived status onto invoice for faster reads
  const paid = amountPaidCents(store, invoice);
  invoice.status = deriveInvoiceStatus(invoice, paid, todayIso());
  store.tuitionInvoices[invoice.id] = invoice;
  return { payment, duplicate: false };
}

function voidInvoice(store, invoiceId, { reason = "", by = "" } = {}) {
  const invoice = store.tuitionInvoices?.[invoiceId];
  if (!invoice) throw new Error("Invoice not found.");
  const paid = amountPaidCents(store, invoice);
  if (paid > 0) throw new Error("Cannot void an invoice with payments. Issue a credit instead.");
  invoice.status = INVOICE_STATUSES.VOID;
  invoice.voidedAt = new Date().toISOString();
  invoice.voidReason = String(reason || "").trim().slice(0, 400);
  invoice.voidedBy = String(by || "").trim();
  invoice.updatedAt = invoice.voidedAt;
  store.tuitionInvoices[invoice.id] = invoice;
  return invoice;
}

function upsertTuitionRate(store, input = {}) {
  const programId = String(input.programId || "").trim();
  const childId = String(input.childId || "").trim();
  if (!programId || !childId) throw new Error("programId and childId are required for a tuition rate.");
  const schedule = String(input.schedule || "weekly").toLowerCase();
  if (!["weekly", "monthly", "custom"].includes(schedule)) throw new Error("Schedule must be weekly, monthly, or custom.");
  const amountCents = moneyCents(input.amountCents);
  if (amountCents < 0) throw new Error("Rate cannot be negative.");
  const existing = Object.values(store.tuitionRates || {}).find((rate) => (
    rate
    && String(rate.programId) === programId
    && String(rate.childId) === childId
    && String(rate.schedule) === schedule
    && rate.active !== false
  ));
  const now = new Date().toISOString();
  if (existing) {
    existing.amountCents = amountCents;
    existing.householdId = String(input.householdId || existing.householdId || "");
    existing.label = String(input.label || existing.label || "").trim();
    existing.customCadenceNote = String(input.customCadenceNote || existing.customCadenceNote || "").trim();
    existing.updatedAt = now;
    store.tuitionRates[existing.id] = existing;
    return existing;
  }
  const rate = {
    id: newId("rate"),
    programId,
    childId,
    householdId: String(input.householdId || ""),
    schedule,
    amountCents,
    currency: String(input.currency || "USD"),
    label: String(input.label || "").trim(),
    customCadenceNote: String(input.customCadenceNote || "").trim(),
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  store.tuitionRates[rate.id] = rate;
  return rate;
}

function buildInvoiceFromRate(rate = {}, { householdId, dueDate, periodStart, periodEnd, notes } = {}) {
  const schedule = String(rate.schedule || "weekly");
  const type = schedule === "monthly"
    ? LINE_TYPES.TUITION_MONTHLY
    : (schedule === "custom" ? LINE_TYPES.TUITION_CUSTOM : LINE_TYPES.TUITION_WEEKLY);
  const desc = rate.label
    || (schedule === "monthly" ? "Monthly tuition" : (schedule === "custom" ? "Custom tuition" : "Weekly tuition"));
  return {
    programId: rate.programId,
    householdId: householdId || rate.householdId,
    childIds: rate.childId ? [rate.childId] : [],
    dueDate,
    periodStart,
    periodEnd,
    notes,
    lineItems: [{
      type,
      description: desc,
      amountCents: rate.amountCents,
      quantity: 1,
      childId: rate.childId,
    }],
  };
}

module.exports = {
  INVOICE_STATUSES,
  LINE_TYPES,
  PAYMENT_STATUSES,
  ensureTuitionCollections,
  moneyCents,
  formatMoney,
  todayIso,
  normalizeLineItem,
  sumLineItems,
  publicTuitionRate,
  publicTuitionInvoice,
  publicTuitionPayment,
  listInvoicesForProgram,
  listInvoicesForHousehold,
  listRatesForProgram,
  householdBalance,
  providerBillingDashboard,
  createInvoice,
  recordPayment,
  voidInvoice,
  upsertTuitionRate,
  buildInvoiceFromRate,
  amountPaidCents,
  deriveInvoiceStatus,
  statusLabel,
};
