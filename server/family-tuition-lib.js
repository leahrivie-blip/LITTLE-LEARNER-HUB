/**
 * Family Tuition Billing v1 helpers (testing fence only).
 * Separate from LLH SaaS membership billing.
 */

function moneyCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function dollarsToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return moneyCents(Math.round(n * 100));
}

function centsToDollars(cents) {
  return (moneyCents(cents) / 100).toFixed(2);
}

function defaultTuitionPolicy(ownerEmail = "") {
  return {
    ownerEmail: String(ownerEmail || "").trim().toLowerCase(),
    currency: "usd",
    billingCadence: "monthly",
    defaultRateCents: 80000, // $800 / child / period
    siblingDiscountPercent: 10,
    lateFeeCents: 2500, // $25
    lateFeeGraceDays: 5,
    dueDayOfMonth: 1,
    invoicePrefix: "TU",
    updatedAt: "",
    createdAt: "",
  };
}

function normalizeTuitionPolicy(input = {}, ownerEmail = "") {
  const base = defaultTuitionPolicy(ownerEmail || input.ownerEmail);
  const cadence = String(input.billingCadence || base.billingCadence).toLowerCase();
  return {
    ...base,
    ownerEmail: String(ownerEmail || input.ownerEmail || base.ownerEmail).trim().toLowerCase(),
    currency: "usd",
    billingCadence: ["weekly", "biweekly", "monthly"].includes(cadence) ? cadence : "monthly",
    defaultRateCents: moneyCents(
      input.defaultRateCents != null
        ? input.defaultRateCents
        : (input.defaultRateDollars != null ? dollarsToCents(input.defaultRateDollars) : base.defaultRateCents),
    ),
    siblingDiscountPercent: Math.max(0, Math.min(50, Number(input.siblingDiscountPercent ?? base.siblingDiscountPercent) || 0)),
    lateFeeCents: moneyCents(
      input.lateFeeCents != null
        ? input.lateFeeCents
        : (input.lateFeeDollars != null ? dollarsToCents(input.lateFeeDollars) : base.lateFeeCents),
    ),
    lateFeeGraceDays: Math.max(0, Math.min(60, Number(input.lateFeeGraceDays ?? base.lateFeeGraceDays) || 0)),
    dueDayOfMonth: Math.max(1, Math.min(28, Number(input.dueDayOfMonth ?? base.dueDayOfMonth) || 1)),
    invoicePrefix: String(input.invoicePrefix || base.invoicePrefix).trim().slice(0, 8) || "TU",
    updatedAt: String(input.updatedAt || "").trim(),
    createdAt: String(input.createdAt || "").trim(),
  };
}

function publicTuitionPolicy(policy = {}) {
  const p = normalizeTuitionPolicy(policy);
  return {
    ownerEmail: p.ownerEmail,
    currency: p.currency,
    billingCadence: p.billingCadence,
    defaultRateCents: p.defaultRateCents,
    defaultRateDollars: centsToDollars(p.defaultRateCents),
    siblingDiscountPercent: p.siblingDiscountPercent,
    lateFeeCents: p.lateFeeCents,
    lateFeeDollars: centsToDollars(p.lateFeeCents),
    lateFeeGraceDays: p.lateFeeGraceDays,
    dueDayOfMonth: p.dueDayOfMonth,
    invoicePrefix: p.invoicePrefix,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
  };
}

function periodBounds(cadence = "monthly", now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  const c = String(cadence || "monthly").toLowerCase();
  if (c === "weekly") {
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (c === "biweekly") {
    end.setDate(start.getDate() + 13);
  } else {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  const iso = (d) => d.toISOString().slice(0, 10);
  return { periodStart: iso(start), periodEnd: iso(end) };
}

function dueDateForPeriod(periodEnd, dueDayOfMonth = 1) {
  const end = String(periodEnd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return end;
  const [y, m] = end.split("-").map(Number);
  const day = Math.max(1, Math.min(28, Number(dueDayOfMonth) || 1));
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildLineItems({ children = [], rateCents, siblingDiscountPercent = 0 } = {}) {
  const rate = moneyCents(rateCents);
  const kids = (Array.isArray(children) ? children : [])
    .map((child) => ({
      childId: String(child?.id || "").trim(),
      childName: String(child?.name || "Child").trim() || "Child",
    }))
    .filter((child) => child.childId);
  const lineItems = kids.map((child, index) => {
    let amountCents = rate;
    let discountCents = 0;
    if (index > 0 && siblingDiscountPercent > 0) {
      discountCents = moneyCents(Math.round(rate * (siblingDiscountPercent / 100)));
      amountCents = Math.max(0, rate - discountCents);
    }
    return {
      childId: child.childId,
      childName: child.childName,
      description: index === 0
        ? `Tuition — ${child.childName}`
        : `Tuition — ${child.childName} (sibling discount ${siblingDiscountPercent}%)`,
      rateCents: rate,
      discountCents,
      amountCents,
    };
  });
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.rateCents, 0);
  const discountCents = lineItems.reduce((sum, item) => sum + item.discountCents, 0);
  const totalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  return { lineItems, subtotalCents, discountCents, totalCents };
}

function invoiceStatus(invoice = {}, { now = new Date(), policy = null } = {}) {
  const status = String(invoice.status || "draft").toLowerCase();
  if (["paid", "void", "draft"].includes(status)) return status;
  const dueAt = String(invoice.dueAt || "").slice(0, 10);
  if (!dueAt) return status === "open" ? "open" : status;
  const grace = Number(policy?.lateFeeGraceDays ?? invoice.lateFeeGraceDays ?? 0) || 0;
  const due = new Date(`${dueAt}T23:59:59.999Z`);
  const graceEnd = new Date(due.getTime() + grace * 86400000);
  if (now.getTime() > graceEnd.getTime() && moneyCents(invoice.balanceCents) > 0) return "overdue";
  return status === "open" || status === "overdue" ? (now.getTime() > due.getTime() && moneyCents(invoice.balanceCents) > 0 ? "overdue" : "open") : status;
}

function applyLateFeeIfNeeded(invoice, policy, now = new Date()) {
  const current = { ...invoice };
  const status = invoiceStatus(current, { now, policy });
  current.status = status;
  if (status !== "overdue") return current;
  if (current.lateFeeAppliedAt) return current;
  const fee = moneyCents(policy?.lateFeeCents ?? current.lateFeeCents ?? 0);
  if (!fee) return current;
  current.lateFeeCents = fee;
  current.totalCents = moneyCents(current.totalCents) + fee;
  current.balanceCents = moneyCents(current.balanceCents) + fee;
  current.lateFeeAppliedAt = now.toISOString();
  current.lineItems = Array.isArray(current.lineItems) ? [...current.lineItems] : [];
  current.lineItems.push({
    childId: "",
    childName: "",
    description: `Late fee (after ${policy?.lateFeeGraceDays ?? 0}-day grace)`,
    rateCents: fee,
    discountCents: 0,
    amountCents: fee,
  });
  current.updatedAt = now.toISOString();
  return current;
}

function publicTuitionInvoice(invoice = {}, { policy = null, now = new Date() } = {}) {
  const withLate = applyLateFeeIfNeeded(invoice, policy || defaultTuitionPolicy(), now);
  const status = invoiceStatus(withLate, { now, policy });
  return {
    id: String(withLate.id || ""),
    ownerEmail: String(withLate.ownerEmail || "").trim().toLowerCase(),
    householdId: String(withLate.householdId || ""),
    householdLabel: String(withLate.householdLabel || ""),
    parentEmail: String(withLate.parentEmail || "").trim().toLowerCase(),
    number: String(withLate.number || ""),
    periodStart: String(withLate.periodStart || ""),
    periodEnd: String(withLate.periodEnd || ""),
    dueAt: String(withLate.dueAt || ""),
    currency: "usd",
    lineItems: Array.isArray(withLate.lineItems) ? withLate.lineItems : [],
    subtotalCents: moneyCents(withLate.subtotalCents),
    discountCents: moneyCents(withLate.discountCents),
    lateFeeCents: moneyCents(withLate.lateFeeCents),
    totalCents: moneyCents(withLate.totalCents),
    amountPaidCents: moneyCents(withLate.amountPaidCents),
    balanceCents: moneyCents(withLate.balanceCents),
    subtotalDollars: centsToDollars(withLate.subtotalCents),
    discountDollars: centsToDollars(withLate.discountCents),
    lateFeeDollars: centsToDollars(withLate.lateFeeCents),
    totalDollars: centsToDollars(withLate.totalCents),
    amountPaidDollars: centsToDollars(withLate.amountPaidCents),
    balanceDollars: centsToDollars(withLate.balanceCents),
    status,
    paidAt: String(withLate.paidAt || ""),
    voidedAt: String(withLate.voidedAt || ""),
    lateFeeAppliedAt: String(withLate.lateFeeAppliedAt || ""),
    stripeCheckoutSessionId: String(withLate.stripeCheckoutSessionId || ""),
    notes: String(withLate.notes || "").slice(0, 1000),
    createdAt: String(withLate.createdAt || ""),
    updatedAt: String(withLate.updatedAt || ""),
  };
}

function publicTuitionPayment(payment = {}) {
  return {
    id: String(payment.id || ""),
    invoiceId: String(payment.invoiceId || ""),
    householdId: String(payment.householdId || ""),
    ownerEmail: String(payment.ownerEmail || "").trim().toLowerCase(),
    amountCents: moneyCents(payment.amountCents),
    amountDollars: centsToDollars(payment.amountCents),
    method: String(payment.method || "manual").trim() || "manual",
    status: String(payment.status || "succeeded").trim() || "succeeded",
    note: String(payment.note || "").slice(0, 500),
    stripeCheckoutSessionId: String(payment.stripeCheckoutSessionId || ""),
    stripePaymentIntentId: String(payment.stripePaymentIntentId || ""),
    createdAt: String(payment.createdAt || ""),
    recordedBy: String(payment.recordedBy || ""),
  };
}

function householdBalanceSummary(invoices = [], payments = [], { householdId = "", policy = null, now = new Date() } = {}) {
  const id = String(householdId || "");
  const inv = (Array.isArray(invoices) ? invoices : [])
    .filter((item) => String(item?.householdId || "") === id)
    .map((item) => publicTuitionInvoice(item, { policy, now }));
  const pays = (Array.isArray(payments) ? payments : [])
    .filter((item) => String(item?.householdId || "") === id)
    .map(publicTuitionPayment);
  const open = inv.filter((item) => ["open", "overdue"].includes(item.status));
  const balanceCents = open.reduce((sum, item) => sum + item.balanceCents, 0);
  const overdueCents = open.filter((item) => item.status === "overdue").reduce((sum, item) => sum + item.balanceCents, 0);
  return {
    householdId: id,
    balanceCents,
    balanceDollars: centsToDollars(balanceCents),
    overdueCents,
    overdueDollars: centsToDollars(overdueCents),
    openInvoiceCount: open.length,
    paidInvoiceCount: inv.filter((item) => item.status === "paid").length,
    invoices: inv,
    payments: pays,
  };
}

function draftBillingReminder({ householdLabel = "Family", balanceDollars = "0.00", dueAt = "", programName = "our program" } = {}) {
  const dueLine = dueAt ? ` The next due date on file is ${dueAt}.` : "";
  return {
    subject: `Tuition reminder for ${householdLabel}`,
    body: `Hi ${householdLabel},\n\nThis is a friendly reminder that your current balance with ${programName} is $${balanceDollars}.${dueLine}\n\nYou can pay online in Family Hub under Billing, or reply if you have questions.\n\nThank you for trusting us with your little learner.`,
  };
}

function ensureFamilyTuitionCollections(store) {
  if (!store || typeof store !== "object") return store;
  store.familyTuitionPolicies = store.familyTuitionPolicies && typeof store.familyTuitionPolicies === "object"
    ? store.familyTuitionPolicies
    : {};
  store.familyTuitionInvoices = Array.isArray(store.familyTuitionInvoices) ? store.familyTuitionInvoices : [];
  store.familyTuitionPayments = Array.isArray(store.familyTuitionPayments) ? store.familyTuitionPayments : [];
  return store;
}

module.exports = {
  moneyCents,
  dollarsToCents,
  centsToDollars,
  defaultTuitionPolicy,
  normalizeTuitionPolicy,
  publicTuitionPolicy,
  periodBounds,
  dueDateForPeriod,
  buildLineItems,
  invoiceStatus,
  applyLateFeeIfNeeded,
  publicTuitionInvoice,
  publicTuitionPayment,
  householdBalanceSummary,
  draftBillingReminder,
  ensureFamilyTuitionCollections,
};
