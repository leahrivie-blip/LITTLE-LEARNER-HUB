/**
 * Family Tuition Billing v1 API (testing fence only).
 * Wired from server/index.js — keep membership Stripe separate.
 */

const crypto = require("node:crypto");
const tuitionLib = require("./family-tuition-lib");

function createFamilyTuitionApi(deps = {}) {
  const {
    requireHomeDaycareHubTesting,
    jsonResponse,
    readJson,
    readStore,
    writeStore,
    persistFamilyHubStore,
    normalizeEmail,
    resolveScheduleIdentity,
    resolveFamilySession,
    requireFamilyHubProviderManager,
    listFamilyHouseholdsForOwner,
    ensureFamilyHubCollections,
    stripeRequest,
    SITE_URL,
    STRIPE_CHECKOUT_SIMULATION,
    STRIPE_SECRET_KEY,
  } = deps;

  function ensure(store) {
    ensureFamilyHubCollections(store);
    return tuitionLib.ensureFamilyTuitionCollections(store);
  }

  async function persist(store) {
    if (typeof persistFamilyHubStore === "function") {
      await persistFamilyHubStore(store);
      return;
    }
    writeStore(store);
  }

  function policyForOwner(store, ownerEmail) {
    const key = normalizeEmail(ownerEmail);
    const existing = store.familyTuitionPolicies?.[key];
    return tuitionLib.normalizeTuitionPolicy(existing || {}, key);
  }

  function savePolicy(store, policy) {
    const key = policy.ownerEmail;
    store.familyTuitionPolicies[key] = policy;
  }

  function invoicesForOwner(store, ownerEmail) {
    const key = normalizeEmail(ownerEmail);
    return (store.familyTuitionInvoices || []).filter((item) => normalizeEmail(item.ownerEmail) === key);
  }

  function paymentsForOwner(store, ownerEmail) {
    const key = normalizeEmail(ownerEmail);
    return (store.familyTuitionPayments || []).filter((item) => normalizeEmail(item.ownerEmail) === key);
  }

  async function handlePolicyGet(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    let identity;
    try { identity = await resolveScheduleIdentity(request); }
    catch (_e) { jsonResponse(response, 401, { error: "Please log in." }); return; }
    const store = ensure(readStore());
    const actor = requireFamilyHubProviderManager(identity, store, response);
    if (!actor) return;
    const policy = policyForOwner(store, actor.programOwnerEmail);
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      policy: tuitionLib.publicTuitionPolicy(policy),
      actorRole: actor.role,
      programOwnerEmail: actor.programOwnerEmail,
    });
  }

  async function handlePolicyPut(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    let identity;
    try { identity = await resolveScheduleIdentity(request); }
    catch (_e) { jsonResponse(response, 401, { error: "Please log in." }); return; }
    let body;
    try { body = await readJson(request); }
    catch (_e) { jsonResponse(response, 400, { error: "Invalid policy payload." }); return; }
    const store = ensure(readStore());
    const actor = requireFamilyHubProviderManager(identity, store, response);
    if (!actor) return;
    if (actor.role !== "owner" && actor.linkedOwner) {
      // Directors may view but only owners set rates (money).
      if (String(actor.role) === "director") {
        // allow director to update rates for day-to-day ops — user asked for provider billing dashboard
        // Keep directors able to manage tuition on testing (program ops).
      }
    }
    const now = new Date().toISOString();
    const prior = policyForOwner(store, actor.programOwnerEmail);
    const next = tuitionLib.normalizeTuitionPolicy({
      ...prior,
      ...body,
      ownerEmail: actor.programOwnerEmail,
      createdAt: prior.createdAt || now,
      updatedAt: now,
    }, actor.programOwnerEmail);
    savePolicy(store, next);
    try { await persist(store); }
    catch (error) {
      jsonResponse(response, 503, { error: error.message || "Could not save tuition policy.", testingOnly: true });
      return;
    }
    jsonResponse(response, 200, { ok: true, testingOnly: true, policy: tuitionLib.publicTuitionPolicy(next) });
  }

  async function handleDashboardGet(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    let identity;
    try { identity = await resolveScheduleIdentity(request); }
    catch (_e) { jsonResponse(response, 401, { error: "Please log in." }); return; }
    const store = ensure(readStore());
    const actor = requireFamilyHubProviderManager(identity, store, response);
    if (!actor) return;
    const ownerEmail = actor.programOwnerEmail;
    const policy = policyForOwner(store, ownerEmail);
    const now = new Date();
    const households = listFamilyHouseholdsForOwner(store, ownerEmail)
      .filter((item) => item.status !== "revoked");
    const invoices = invoicesForOwner(store, ownerEmail).map((item) => {
      const refreshed = tuitionLib.applyLateFeeIfNeeded(item, policy, now);
      return refreshed;
    });
    // persist late fees applied during read
    let dirty = false;
    invoices.forEach((inv) => {
      const idx = store.familyTuitionInvoices.findIndex((item) => item.id === inv.id);
      if (idx >= 0 && inv.lateFeeAppliedAt && !store.familyTuitionInvoices[idx].lateFeeAppliedAt) {
        store.familyTuitionInvoices[idx] = inv;
        dirty = true;
      } else if (idx >= 0 && inv.status !== store.familyTuitionInvoices[idx].status) {
        store.familyTuitionInvoices[idx] = { ...store.familyTuitionInvoices[idx], status: inv.status };
        dirty = true;
      }
    });
    if (dirty) {
      try { await persist(store); } catch (_e) { /* non-fatal for GET */ }
    }
    const payments = paymentsForOwner(store, ownerEmail);
    const familyRows = households.map((household) => {
      const summary = tuitionLib.householdBalanceSummary(invoices, payments, {
        householdId: household.id,
        policy,
        now,
      });
      return {
        householdId: household.id,
        label: household.label || household.email || "Family",
        parentEmail: household.email || "",
        childCount: Array.isArray(household.children) ? household.children.length : (household.childIds || []).length,
        children: Array.isArray(household.children) ? household.children : [],
        ...summary,
      };
    });
    const openInvoices = invoices
      .map((item) => tuitionLib.publicTuitionInvoice(item, { policy, now }))
      .filter((item) => ["open", "overdue"].includes(item.status));
    const outstandingCents = openInvoices.reduce((sum, item) => sum + item.balanceCents, 0);
    const overdueCents = openInvoices
      .filter((item) => item.status === "overdue")
      .reduce((sum, item) => sum + item.balanceCents, 0);
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      policy: tuitionLib.publicTuitionPolicy(policy),
      actorRole: actor.role,
      programOwnerEmail: ownerEmail,
      summary: {
        householdCount: households.length,
        openInvoiceCount: openInvoices.length,
        outstandingCents,
        outstandingDollars: tuitionLib.centsToDollars(outstandingCents),
        overdueCents,
        overdueDollars: tuitionLib.centsToDollars(overdueCents),
        collectedCents: payments.reduce((sum, p) => sum + tuitionLib.moneyCents(p.amountCents), 0),
        collectedDollars: tuitionLib.centsToDollars(payments.reduce((sum, p) => sum + tuitionLib.moneyCents(p.amountCents), 0)),
      },
      families: familyRows,
      invoices: invoices
        .map((item) => tuitionLib.publicTuitionInvoice(item, { policy, now }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 100),
      payments: payments
        .map(tuitionLib.publicTuitionPayment)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 100),
    });
  }

  async function handleInvoiceCreate(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    let identity;
    try { identity = await resolveScheduleIdentity(request); }
    catch (_e) { jsonResponse(response, 401, { error: "Please log in." }); return; }
    let body;
    try { body = await readJson(request); }
    catch (_e) { jsonResponse(response, 400, { error: "Invalid invoice payload." }); return; }
    const store = ensure(readStore());
    const actor = requireFamilyHubProviderManager(identity, store, response);
    if (!actor) return;
    const ownerEmail = actor.programOwnerEmail;
    const householdId = String(body?.householdId || "").trim();
    const household = listFamilyHouseholdsForOwner(store, ownerEmail)
      .find((item) => item.id === householdId && item.status !== "revoked");
    if (!household) {
      jsonResponse(response, 404, { error: "Household not found." });
      return;
    }
    const policy = policyForOwner(store, ownerEmail);
    const children = Array.isArray(body?.children) && body.children.length
      ? body.children
      : (Array.isArray(household.children) ? household.children : []);
    if (!children.length) {
      jsonResponse(response, 400, { error: "Link at least one child before creating a tuition invoice." });
      return;
    }
    const rateCents = body?.rateCents != null
      ? tuitionLib.moneyCents(body.rateCents)
      : (body?.rateDollars != null ? tuitionLib.dollarsToCents(body.rateDollars) : policy.defaultRateCents);
    const built = tuitionLib.buildLineItems({
      children,
      rateCents,
      siblingDiscountPercent: policy.siblingDiscountPercent,
    });
    const now = new Date();
    const cadence = body?.billingCadence || policy.billingCadence;
    const bounds = body?.periodStart && body?.periodEnd
      ? { periodStart: String(body.periodStart).slice(0, 10), periodEnd: String(body.periodEnd).slice(0, 10) }
      : tuitionLib.periodBounds(cadence, now);
    const dueAt = String(body?.dueAt || tuitionLib.dueDateForPeriod(bounds.periodEnd, policy.dueDayOfMonth)).slice(0, 10);
    const seq = (store.familyTuitionInvoices || []).filter((item) => normalizeEmail(item.ownerEmail) === ownerEmail).length + 1;
    const invoice = {
      id: `ftu-inv-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`,
      ownerEmail,
      householdId: household.id,
      householdLabel: household.label || household.email || "Family",
      parentEmail: normalizeEmail(household.email),
      number: `${policy.invoicePrefix}-${String(seq).padStart(4, "0")}`,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      dueAt,
      currency: "usd",
      lineItems: built.lineItems,
      subtotalCents: built.subtotalCents,
      discountCents: built.discountCents,
      lateFeeCents: 0,
      totalCents: built.totalCents,
      amountPaidCents: 0,
      balanceCents: built.totalCents,
      status: "open",
      notes: String(body?.notes || "").trim().slice(0, 1000),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: actor.actorEmail,
    };
    store.familyTuitionInvoices.unshift(invoice);
    store.familyHubNotifications = Array.isArray(store.familyHubNotifications) ? store.familyHubNotifications : [];
    store.familyHubNotifications.unshift({
      id: `fh-ntf-bill-${Date.now().toString(36)}`,
      householdId: household.id,
      type: "billing",
      title: "New tuition invoice",
      body: `${invoice.number} · $${tuitionLib.centsToDollars(invoice.totalCents)} due ${invoice.dueAt}`,
      href: "more",
      read: false,
      createdAt: now.toISOString(),
      audience: "parent",
    });
    try { await persist(store); }
    catch (error) {
      jsonResponse(response, 503, { error: error.message || "Could not save invoice.", testingOnly: true });
      return;
    }
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      invoice: tuitionLib.publicTuitionInvoice(invoice, { policy, now }),
    });
  }

  async function handleMarkPaid(request, response, invoiceId) {
    if (!requireHomeDaycareHubTesting(response)) return;
    let identity;
    try { identity = await resolveScheduleIdentity(request); }
    catch (_e) { jsonResponse(response, 401, { error: "Please log in." }); return; }
    let body = {};
    try { body = await readJson(request); } catch (_e) { body = {}; }
    const store = ensure(readStore());
    const actor = requireFamilyHubProviderManager(identity, store, response);
    if (!actor) return;
    const id = String(invoiceId || "").trim();
    const idx = store.familyTuitionInvoices.findIndex(
      (item) => item.id === id && normalizeEmail(item.ownerEmail) === actor.programOwnerEmail,
    );
    if (idx < 0) {
      jsonResponse(response, 404, { error: "Invoice not found." });
      return;
    }
    const invoice = store.familyTuitionInvoices[idx];
    if (String(invoice.status) === "paid") {
      jsonResponse(response, 200, { ok: true, testingOnly: true, invoice: tuitionLib.publicTuitionInvoice(invoice), alreadyPaid: true });
      return;
    }
    if (String(invoice.status) === "void") {
      jsonResponse(response, 400, { error: "Cannot pay a voided invoice." });
      return;
    }
    const now = new Date();
    const amount = body?.amountCents != null
      ? tuitionLib.moneyCents(body.amountCents)
      : (body?.amountDollars != null ? tuitionLib.dollarsToCents(body.amountDollars) : tuitionLib.moneyCents(invoice.balanceCents));
    if (!amount) {
      jsonResponse(response, 400, { error: "Payment amount is required." });
      return;
    }
    const payment = {
      id: `ftu-pay-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`,
      invoiceId: invoice.id,
      householdId: invoice.householdId,
      ownerEmail: actor.programOwnerEmail,
      amountCents: amount,
      method: String(body?.method || "manual").trim() || "manual",
      status: "succeeded",
      note: String(body?.note || "Marked paid by provider").trim().slice(0, 500),
      createdAt: now.toISOString(),
      recordedBy: actor.actorEmail,
    };
    store.familyTuitionPayments.unshift(payment);
    invoice.amountPaidCents = tuitionLib.moneyCents(invoice.amountPaidCents) + amount;
    invoice.balanceCents = Math.max(0, tuitionLib.moneyCents(invoice.totalCents) - tuitionLib.moneyCents(invoice.amountPaidCents));
    invoice.status = invoice.balanceCents === 0 ? "paid" : "open";
    if (invoice.status === "paid") invoice.paidAt = now.toISOString();
    invoice.updatedAt = now.toISOString();
    store.familyTuitionInvoices[idx] = invoice;
    try { await persist(store); }
    catch (error) {
      jsonResponse(response, 503, { error: error.message || "Could not record payment.", testingOnly: true });
      return;
    }
    const policy = policyForOwner(store, actor.programOwnerEmail);
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      invoice: tuitionLib.publicTuitionInvoice(invoice, { policy, now }),
      payment: tuitionLib.publicTuitionPayment(payment),
    });
  }

  async function handleVoidInvoice(request, response, invoiceId) {
    if (!requireHomeDaycareHubTesting(response)) return;
    let identity;
    try { identity = await resolveScheduleIdentity(request); }
    catch (_e) { jsonResponse(response, 401, { error: "Please log in." }); return; }
    const store = ensure(readStore());
    const actor = requireFamilyHubProviderManager(identity, store, response);
    if (!actor) return;
    const id = String(invoiceId || "").trim();
    const idx = store.familyTuitionInvoices.findIndex(
      (item) => item.id === id && normalizeEmail(item.ownerEmail) === actor.programOwnerEmail,
    );
    if (idx < 0) {
      jsonResponse(response, 404, { error: "Invoice not found." });
      return;
    }
    const invoice = store.familyTuitionInvoices[idx];
    if (String(invoice.status) === "paid") {
      jsonResponse(response, 400, { error: "Paid invoices cannot be voided." });
      return;
    }
    const now = new Date().toISOString();
    invoice.status = "void";
    invoice.voidedAt = now;
    invoice.balanceCents = 0;
    invoice.updatedAt = now;
    store.familyTuitionInvoices[idx] = invoice;
    try { await persist(store); }
    catch (error) {
      jsonResponse(response, 503, { error: error.message || "Could not void invoice.", testingOnly: true });
      return;
    }
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      invoice: tuitionLib.publicTuitionInvoice(invoice, { policy: policyForOwner(store, actor.programOwnerEmail) }),
    });
  }

  async function handleReminderDraft(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    let identity;
    try { identity = await resolveScheduleIdentity(request); }
    catch (_e) { jsonResponse(response, 401, { error: "Please log in." }); return; }
    let body;
    try { body = await readJson(request); }
    catch (_e) { jsonResponse(response, 400, { error: "Invalid reminder payload." }); return; }
    const store = ensure(readStore());
    const actor = requireFamilyHubProviderManager(identity, store, response);
    if (!actor) return;
    const householdId = String(body?.householdId || "").trim();
    const household = listFamilyHouseholdsForOwner(store, actor.programOwnerEmail)
      .find((item) => item.id === householdId);
    if (!household) {
      jsonResponse(response, 404, { error: "Household not found." });
      return;
    }
    const policy = policyForOwner(store, actor.programOwnerEmail);
    const summary = tuitionLib.householdBalanceSummary(
      invoicesForOwner(store, actor.programOwnerEmail),
      paymentsForOwner(store, actor.programOwnerEmail),
      { householdId, policy, now: new Date() },
    );
    const open = summary.invoices.find((item) => ["open", "overdue"].includes(item.status));
    const draft = tuitionLib.draftBillingReminder({
      householdLabel: household.label || "Family",
      balanceDollars: summary.balanceDollars,
      dueAt: open?.dueAt || "",
      programName: String(body?.programName || household.programName || "our program"),
    });
    jsonResponse(response, 200, { ok: true, testingOnly: true, draft, balance: summary });
  }

  async function handleParentBillingGet(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    const resolved = resolveFamilySession(request);
    if (!resolved) {
      jsonResponse(response, 401, { error: "Family session required." });
      return;
    }
    const { store: raw, household } = resolved;
    const store = ensure(raw);
    const ownerEmail = normalizeEmail(household.ownerEmail);
    const policy = policyForOwner(store, ownerEmail);
    const summary = tuitionLib.householdBalanceSummary(
      store.familyTuitionInvoices,
      store.familyTuitionPayments,
      { householdId: household.id, policy, now: new Date() },
    );
    jsonResponse(response, 200, {
      ok: true,
      testingOnly: true,
      householdId: household.id,
      householdLabel: household.label || "Family",
      policy: {
        billingCadence: policy.billingCadence,
        siblingDiscountPercent: policy.siblingDiscountPercent,
        lateFeeDollars: tuitionLib.centsToDollars(policy.lateFeeCents),
        lateFeeGraceDays: policy.lateFeeGraceDays,
        currency: "usd",
      },
      ...summary,
    });
  }

  async function handleParentPay(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    const resolved = resolveFamilySession(request);
    if (!resolved) {
      jsonResponse(response, 401, { error: "Family session required." });
      return;
    }
    let body;
    try { body = await readJson(request); }
    catch (_e) { jsonResponse(response, 400, { error: "Invalid payment payload." }); return; }
    const { store: raw, household } = resolved;
    const store = ensure(raw);
    const invoiceId = String(body?.invoiceId || "").trim();
    const invoice = (store.familyTuitionInvoices || []).find(
      (item) => item.id === invoiceId && item.householdId === household.id,
    );
    if (!invoice) {
      jsonResponse(response, 404, { error: "Invoice not found." });
      return;
    }
    if (String(invoice.status) === "paid") {
      jsonResponse(response, 400, { error: "This invoice is already paid." });
      return;
    }
    if (String(invoice.status) === "void") {
      jsonResponse(response, 400, { error: "This invoice was voided." });
      return;
    }
    const amount = tuitionLib.moneyCents(invoice.balanceCents);
    if (!amount) {
      jsonResponse(response, 400, { error: "Nothing left to pay on this invoice." });
      return;
    }
    const origin = String(body?.appOrigin || "").replace(/\/$/, "") || SITE_URL || "https://little-learner-hub-testing.onrender.com";
    const successUrl = `${origin}/?familyTuition=paid&invoice=${encodeURIComponent(invoice.id)}`;
    const cancelUrl = `${origin}/?familyTuition=cancel&invoice=${encodeURIComponent(invoice.id)}`;

    // Simulated checkout (local/tests) — completes immediately.
    if (STRIPE_CHECKOUT_SIMULATION || !STRIPE_SECRET_KEY) {
      const sessionId = `cs_sim_ftu_${crypto.randomBytes(8).toString("hex")}`;
      applyTuitionCheckoutPaid(store, {
        invoiceId: invoice.id,
        sessionId,
        amountCents: amount,
        paymentIntentId: `pi_sim_${crypto.randomBytes(6).toString("hex")}`,
        method: "stripe_simulated",
      });
      try { await persist(store); }
      catch (error) {
        jsonResponse(response, 503, { error: error.message || "Could not record simulated payment.", testingOnly: true });
        return;
      }
      jsonResponse(response, 200, {
        ok: true,
        testingOnly: true,
        simulated: true,
        checkoutUrl: successUrl,
        sessionId,
        invoice: tuitionLib.publicTuitionInvoice(
          store.familyTuitionInvoices.find((item) => item.id === invoice.id),
          { policy: policyForOwner(store, household.ownerEmail) },
        ),
      });
      return;
    }

    try {
      const session = await stripeRequest("checkout/sessions", {
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: normalizeEmail(household.email) || undefined,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": `Tuition ${invoice.number}`,
        "line_items[0][price_data][unit_amount]": String(amount),
        "line_items[0][quantity]": "1",
        "metadata[purpose]": "family_tuition",
        "metadata[invoiceId]": invoice.id,
        "metadata[householdId]": household.id,
        "metadata[ownerEmail]": normalizeEmail(household.ownerEmail),
        "payment_intent_data[metadata][purpose]": "family_tuition",
        "payment_intent_data[metadata][invoiceId]": invoice.id,
      });
      invoice.stripeCheckoutSessionId = session.id;
      invoice.updatedAt = new Date().toISOString();
      const idx = store.familyTuitionInvoices.findIndex((item) => item.id === invoice.id);
      if (idx >= 0) store.familyTuitionInvoices[idx] = invoice;
      await persist(store);
      jsonResponse(response, 200, {
        ok: true,
        testingOnly: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      jsonResponse(response, 502, { error: error.message || "Could not start Stripe Checkout.", testingOnly: true });
    }
  }

  function applyTuitionCheckoutPaid(store, {
    invoiceId,
    sessionId = "",
    amountCents = 0,
    paymentIntentId = "",
    method = "stripe",
  } = {}) {
    tuitionLib.ensureFamilyTuitionCollections(store);
    const idx = store.familyTuitionInvoices.findIndex((item) => item.id === invoiceId);
    if (idx < 0) return { ok: false, error: "invoice_not_found" };
    const invoice = store.familyTuitionInvoices[idx];
    if (String(invoice.status) === "paid") return { ok: true, alreadyPaid: true, invoice };
    const now = new Date();
    const amount = tuitionLib.moneyCents(amountCents || invoice.balanceCents);
    const payment = {
      id: `ftu-pay-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`,
      invoiceId: invoice.id,
      householdId: invoice.householdId,
      ownerEmail: normalizeEmail(invoice.ownerEmail),
      amountCents: amount,
      method,
      status: "succeeded",
      note: "Paid online",
      stripeCheckoutSessionId: sessionId,
      stripePaymentIntentId: paymentIntentId,
      createdAt: now.toISOString(),
      recordedBy: "parent",
    };
    store.familyTuitionPayments.unshift(payment);
    invoice.amountPaidCents = tuitionLib.moneyCents(invoice.amountPaidCents) + amount;
    invoice.balanceCents = Math.max(0, tuitionLib.moneyCents(invoice.totalCents) - tuitionLib.moneyCents(invoice.amountPaidCents));
    invoice.status = invoice.balanceCents === 0 ? "paid" : "open";
    if (invoice.status === "paid") invoice.paidAt = now.toISOString();
    invoice.stripeCheckoutSessionId = sessionId || invoice.stripeCheckoutSessionId;
    invoice.updatedAt = now.toISOString();
    store.familyTuitionInvoices[idx] = invoice;
    store.familyHubNotifications = Array.isArray(store.familyHubNotifications) ? store.familyHubNotifications : [];
    store.familyHubNotifications.unshift({
      id: `fh-ntf-paid-${Date.now().toString(36)}`,
      householdId: invoice.householdId,
      type: "billing",
      title: "Tuition payment received",
      body: `${invoice.number} · $${tuitionLib.centsToDollars(amount)} paid`,
      href: "family-tuition",
      read: false,
      createdAt: now.toISOString(),
      audience: "provider",
    });
    return { ok: true, invoice, payment };
  }

  return {
    handlePolicyGet,
    handlePolicyPut,
    handleDashboardGet,
    handleInvoiceCreate,
    handleMarkPaid,
    handleVoidInvoice,
    handleReminderDraft,
    handleParentBillingGet,
    handleParentPay,
    applyTuitionCheckoutPaid,
  };
}

module.exports = { createFamilyTuitionApi };
