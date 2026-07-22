/**
 * Phase 17 Billing Simulator API — /api/director-center/billing/*
 * Platform subscription simulator + provider family tuition. No Stripe / real money.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const entitlements = require("../scripts/entitlement-model.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const model = require("../scripts/billing-simulator-data-model.js");
const fixtures = require("../scripts/billing-simulator-fixtures.js");
const familyModel = require("../scripts/family-foundation-data-model.js");

const BASE = "/api/director-center/billing";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function getHeader(request, name) {
  const key = String(name || "").toLowerCase();
  const headers = request && request.headers ? request.headers : {};
  if (headers && typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(key) || "").trim();
  }
  if (headers && Object.prototype.hasOwnProperty.call(headers, key)) {
    return String(headers[key] || "").trim();
  }
  const found = Object.keys(headers || {}).find((headerName) => headerName.toLowerCase() === key);
  return found ? String(headers[found] || "").trim() : "";
}

function productionSiteFromUrl(siteUrl) {
  return Boolean(String(siteUrl || "").toLowerCase().includes(PRODUCTION_HOST));
}

function resolveEnv(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") {
    const siteUrl = String(process.env.SITE_URL || "");
    env = {
      liveProduction: productionSiteFromUrl(siteUrl),
      allowDirectorCenterAdminPreview: !productionSiteFromUrl(siteUrl) && truthy(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW),
      siteUrl,
    };
  }
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const liveProduction = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    ...env,
    liveProduction,
    allowDirectorCenterAdminPreview: env.allowDirectorCenterAdminPreview === true && !liveProduction,
    siteUrl,
    stripeCheckoutDisabled: truthy(process.env.DISABLE_STRIPE_CHECKOUT) || true,
  };
}

function createBillingSimulatorApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, {
      ok: false,
      error: error || "Access denied.",
      code,
      billingSimulator: true,
      testingBanner: model.TESTING_BANNER,
      noStripe: true,
    });
  }

  function ensureOrg(store, adminEmail) {
    model.ensureBillingStore(store);
    const seeded = fixtures.ensurePhase17Preview(store, { adminEmail: normalizeEmail?.(adminEmail) || adminEmail });
    const organization = store.organizations?.[seeded.organizationId]
      || formsFixtures.ensurePreviewOrganization(store, { adminEmail });
    return { organization, seeded };
  }

  function resolveActor(store, request, organizationId, adminEmail) {
    const members = listValues(store.staffMemberships).filter((row) => row.organizationId === organizationId && row.status === foundation.STAFF_STATUS.ACTIVE);
    const owner = members.find((row) => safeLower(row.userEmail) === safeLower(adminEmail))
      || members.find((row) => row.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER)
      || members[0];
    const policyOk = env().allowDirectorCenterAdminPreview === true && !env().liveProduction;
    const requested = getHeader(request, "x-llh-role-preview-membership-id");
    if (requested && policyOk) {
      const member = store.staffMemberships?.[requested];
      if (member && member.organizationId === organizationId) {
        return { actor: member, membership: member, rolePreview: true };
      }
    }
    return {
      actor: owner || {
        userEmail: adminEmail,
        role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
        organizationId,
        status: foundation.STAFF_STATUS.ACTIVE,
        isBillingOwner: true,
      },
      membership: owner || null,
      rolePreview: false,
    };
  }

  function isOwner(role) {
    return orgPermissions.normalizeOrgRole(role) === orgPermissions.ORG_ROLES.DIRECTOR_OWNER;
  }

  function isDirectorOrOwner(role) {
    const r = orgPermissions.normalizeOrgRole(role);
    return r === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || r === orgPermissions.ORG_ROLES.DIRECTOR;
  }

  function isCurriculumOnly(role) {
    return String(role || "").toLowerCase() === "curriculum_only"
      || orgPermissions.normalizeOrgRole(role) === "";
  }

  function assertAccess(store, request, response, adminEmail, { platform = false, familyBilling = false } = {}) {
    if (env().liveProduction || !env().allowDirectorCenterAdminPreview) {
      deny(response, 403, "production_preview_rejected", "Billing simulator unavailable in production.");
      return null;
    }
    const { organization, seeded } = ensureOrg(store, adminEmail);
    const { actor, membership, rolePreview } = resolveActor(store, request, organization.id, adminEmail);

    if (platform) {
      // Platform subscription: owner/billing owner, or curriculum_only for own catalog view
      if (!isOwner(actor.role) && !actor.isBillingOwner && String(actor.role).toLowerCase() !== "curriculum_only") {
        deny(response, 403, "billing_owner_required", "Only the primary billing owner manages platform subscriptions.");
        return null;
      }
    }
    if (familyBilling) {
      if (String(actor.role).toLowerCase() === "curriculum_only") {
        deny(response, 403, "curriculum_only_denied", "Curriculum Only cannot access center family billing.");
        return null;
      }
      if (!isDirectorOrOwner(actor.role) && !actor.billingManager) {
        deny(response, 403, "family_billing_denied", "Teachers and assistants do not have financial access by default.");
        return null;
      }
    }
    return { organization, seeded, actor, membership, rolePreview };
  }

  function activeSubscription(store, organizationId) {
    return listValues(store.billingSimulator.platformSubscriptions)
      .filter((s) => s.organizationId === organizationId && s.status !== model.SUBSCRIPTION_STATUSES.ENDED)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]
      || listValues(store.billingSimulator.platformSubscriptions).find((s) => s.organizationId === organizationId)
      || null;
  }

  async function handleStatus(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 17,
      billingSimulator: true,
      testingBanner: model.TESTING_BANNER,
      platformBanner: model.PLATFORM_BANNER,
      noStripe: true,
      noRealCheckout: true,
      stripeCheckoutDisabled: env().stripeCheckoutDisabled,
      disableStripeCheckoutEnv: truthy(process.env.DISABLE_STRIPE_CHECKOUT),
      noCardStorage: true,
      noBankStorage: true,
      moneyUnit: "integer_cents",
      role: gate.actor.role,
    });
  }

  async function handleSeed(request, response, ctx) {
    if (env().liveProduction || !env().allowDirectorCenterAdminPreview) {
      return deny(response, 403, "production_preview_rejected");
    }
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const seeded = body.reset
      ? fixtures.resetPhase17Preview(store, { adminEmail: ctx.adminEmail })
      : fixtures.ensurePhase17Preview(store, { adminEmail: ctx.adminEmail });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, seeded: true, ...seeded, testingBanner: model.TESTING_BANNER, noStripe: true });
  }

  async function handleCatalog(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const catalog = model.catalogPlans();
    const sub = activeSubscription(store, gate.organization.id);
    const classroomsUsed = listValues(store.classrooms).filter((c) => c.organizationId === gate.organization.id && c.status !== "archived").length;
    const staffUsed = listValues(store.staffMemberships).filter((s) => (
      s.organizationId === gate.organization.id && s.isBillingOwner !== true && s.status !== "deactivated" && s.status !== "inactive"
    )).length;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      featureMarker: "phase17-platform-pricing",
      testingBanner: model.PLATFORM_BANNER,
      catalog,
      currentSubscription: sub,
      usage: { classrooms: classroomsUsed, staff: staffUsed },
      recommendedPlan: entitlements.PLAN_KEYS.SMALL_CENTER,
      noManipulativeCountdowns: true,
      stripeUntouched: true,
      productionCatalogUnchanged: true,
    });
  }

  async function handleSimulatePlatform(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { platform: true });
    if (!gate) return;
    const body = await readJson(request).catch(() => ({}));
    let sub = activeSubscription(store, gate.organization.id) || model.createPlatformSubscription({
      organizationId: gate.organization.id,
      planKey: entitlements.PLAN_KEYS.HOME_DAYCARE,
    });
    const before = { ...sub };
    const action = body.action || "update";

    if (action === "new" || action === "select_plan") {
      sub.planKey = body.planKey || sub.planKey;
      sub.billingInterval = body.billingInterval || sub.billingInterval;
      sub.status = model.SUBSCRIPTION_STATUSES.ACTIVE;
    } else if (action === "upgrade") {
      sub.planKey = body.planKey || entitlements.PLAN_KEYS.GROWING_CENTER;
      sub.status = model.SUBSCRIPTION_STATUSES.ACTIVE;
    } else if (action === "downgrade_preview") {
      const preview = model.previewDowngrade(store, gate.organization.id, sub.planKey, body.planKey || entitlements.PLAN_KEYS.HOME_DAYCARE, sub.classroomAddOnQuantity);
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, preview, neverSilentlyDeletes: true, testingBanner: model.PLATFORM_BANNER });
    } else if (action === "downgrade" || action === "scheduled_downgrade") {
      const preview = model.previewDowngrade(store, gate.organization.id, sub.planKey, body.planKey, sub.classroomAddOnQuantity);
      if ((preview.overLimit.classrooms.length || preview.overLimit.staff.length) && !body.force) {
        return jsonResponse(response, 409, {
          ok: false,
          code: "downgrade_blocked",
          error: "Resolve over-limit classrooms/staff before downgrade. Nothing was deleted.",
          preview,
          neverSilentlyDeletes: true,
        });
      }
      if (action === "scheduled_downgrade") {
        sub.scheduledDowngradePlanKey = body.planKey;
        sub.cancelAtPeriodEnd = false;
      } else {
        sub.planKey = body.planKey;
        sub.scheduledDowngradePlanKey = "";
      }
    } else if (action === "add_classroom") {
      if (sub.planKey === entitlements.PLAN_KEYS.CURRICULUM_ONLY) {
        return deny(response, 400, "add_on_denied", "Curriculum Only cannot purchase classroom add-ons.");
      }
      sub.classroomAddOnQuantity = (sub.classroomAddOnQuantity || 0) + 1;
    } else if (action === "remove_addon") {
      sub.classroomAddOnQuantity = Math.max(0, (sub.classroomAddOnQuantity || 0) - 1);
    } else if (action === "cancel_at_period_end") {
      sub.cancelAtPeriodEnd = true;
      sub.status = model.SUBSCRIPTION_STATUSES.CANCELED_PENDING_END;
    } else if (action === "reactivate") {
      sub.cancelAtPeriodEnd = false;
      sub.status = model.SUBSCRIPTION_STATUSES.ACTIVE;
    } else if (action === "trial") {
      sub.status = model.SUBSCRIPTION_STATUSES.TRIALING;
      sub.trialEndsAt = body.trialEndsAt || model.todayDate();
    } else if (action === "payment_failure") {
      sub.status = model.SUBSCRIPTION_STATUSES.PAYMENT_FAILED;
    } else if (action === "past_due") {
      sub.status = model.SUBSCRIPTION_STATUSES.PAST_DUE;
    } else if (action === "grace_period") {
      sub.status = model.SUBSCRIPTION_STATUSES.GRACE;
    } else if (action === "access_ended") {
      if (sub.foundingStatus === model.FOUNDING_STATUSES.ACTIVE) {
        sub.foundingStatus = model.FOUNDING_STATUSES.FORMER;
      }
      sub.status = model.SUBSCRIPTION_STATUSES.ENDED;
    } else if (action === "founding_active") {
      sub.planKey = entitlements.PLAN_KEYS.FOUNDING_MEMBER;
      sub.foundingStatus = model.FOUNDING_STATUSES.ACTIVE;
      sub.status = model.SUBSCRIPTION_STATUSES.ACTIVE;
    } else if (action === "former_founding") {
      sub.foundingStatus = model.FOUNDING_STATUSES.FORMER;
      sub.foundingHistoryPreserved = true;
    }

    sub.updatedAt = model.nowIso();
    store.billingSimulator.platformSubscriptions[sub.id] = sub;
    model.applySimulatedEntitlement(store, gate.organization.id, sub);
    model.appendPlatformAudit(store, {
      organizationId: gate.organization.id,
      action,
      actorEmail: gate.actor.userEmail,
      detail: body.detail || action,
      before,
      after: sub,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      subscription: sub,
      entitlementApplied: true,
      noStripe: true,
      testingBanner: model.PLATFORM_BANNER,
    });
  }

  async function handleFamilyOverview(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { familyBilling: true });
    if (!gate) return;
    const orgId = gate.organization.id;
    const invoices = listValues(store.billingSimulator.invoices).filter((i) => i.organizationId === orgId);
    const ledger = listValues(store.billingSimulator.ledger).filter((l) => l.organizationId === orgId);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      featureMarker: "phase17-family-billing",
      testingBanner: model.TESTING_BANNER,
      computerRecommended: true,
      overview: {
        outstandingBalanceCents: invoices.filter((i) => ![model.INVOICE_STATUSES.PAID_SIM, model.INVOICE_STATUSES.VOIDED, model.INVOICE_STATUSES.WAIVED, model.INVOICE_STATUSES.ARCHIVED].includes(i.status))
          .reduce((sum, i) => model.addCents(sum, i.balanceCents), 0),
        openInvoices: invoices.filter((i) => i.status === model.INVOICE_STATUSES.OPEN || i.status === model.INVOICE_STATUSES.PARTIALLY_PAID).length,
        pastDue: invoices.filter((i) => i.status === model.INVOICE_STATUSES.PAST_DUE).length,
        failedSimulations: invoices.filter((i) => i.status === model.INVOICE_STATUSES.PAYMENT_FAILED_SIM).length,
        recentPayments: ledger.filter((l) => [model.LEDGER_TYPES.PAYMENT, model.LEDGER_TYPES.PARTIAL_PAYMENT].includes(l.type)).slice(-10),
        creditsRefunds: ledger.filter((l) => [model.LEDGER_TYPES.CREDIT, model.LEDGER_TYPES.REFUND].includes(l.type)).length,
        profiles: listValues(store.billingSimulator.billingProfiles).filter((p) => p.organizationId === orgId).length,
        recurringPlans: listValues(store.billingSimulator.recurringPlans).filter((p) => p.organizationId === orgId).length,
        pendingSuggestions: listValues(store.billingSimulator.chargeSuggestions).filter((s) => s.organizationId === orgId && s.status === "pending_provider_review").length,
      },
      invoices: invoices.map((i) => ({
        ...i,
        privateCollectionNotes: undefined,
        totalDisplay: model.formatCents(i.totalCents),
        balanceDisplay: model.formatCents(i.balanceCents),
      })),
      noStripe: true,
    });
  }

  async function handleGenerateCycle(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { familyBilling: true });
    if (!gate) return;
    const body = await readJson(request).catch(() => ({}));
    const plan = store.billingSimulator.recurringPlans[body.recurringPlanId];
    if (!plan || plan.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
    const cycleKey = body.cycleKey || model.todayDate().slice(0, 7);
    const result = model.generateInvoiceForCycle(store, plan, cycleKey, gate.actor.userEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      ...result,
      idempotent: true,
      testingBanner: model.TESTING_BANNER,
    });
  }

  async function handlePaymentSim(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { familyBilling: true });
    if (!gate) return;
    const body = await readJson(request).catch(() => ({}));
    const invoice = store.billingSimulator.invoices[body.invoiceId];
    if (!invoice || invoice.organizationId !== gate.organization.id) return deny(response, 404, "not_found");

    const typeMap = {
      full: model.LEDGER_TYPES.PAYMENT,
      partial: model.LEDGER_TYPES.PARTIAL_PAYMENT,
      subsidy: model.LEDGER_TYPES.SUBSIDY_PAYMENT,
      failed: model.LEDGER_TYPES.FAILED_PAYMENT,
      reverse: model.LEDGER_TYPES.REVERSAL,
      refund: model.LEDGER_TYPES.REFUND,
      credit: model.LEDGER_TYPES.CREDIT,
      waive: model.LEDGER_TYPES.WAIVER,
    };
    const type = typeMap[body.action] || model.LEDGER_TYPES.PAYMENT;
    const amount = model.toCents(body.amountCents != null ? body.amountCents : (type === model.LEDGER_TYPES.PAYMENT ? invoice.balanceCents : 0));
    const idemKey = body.idempotencyKey || `${type}-${invoice.id}-${amount}-${body.nonce || ""}`;
    const idem = model.claimIdempotency(store, idemKey, "payment");
    if (!idem.first && idem.existing?.resultId) {
      const existing = store.billingSimulator.ledger[idem.existing.resultId];
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, ledger: existing, duplicatePrevented: true, invoice, testingBanner: model.TESTING_BANNER });
    }

    const entry = model.createLedgerEntry({
      organizationId: gate.organization.id,
      invoiceId: invoice.id,
      billingProfileId: invoice.billingProfileId,
      type,
      amountCents: amount,
      payerContactId: body.payerContactId || "",
      note: body.note || `${body.action} simulation`,
      idempotencyKey: idemKey,
    });
    store.billingSimulator.ledger[entry.id] = entry;
    if (idem.row) {
      idem.row.resultId = entry.id;
      store.billingSimulator.idempotencyKeys[idem.row.id] = idem.row;
    }
    // Never mutate prior ledger rows — only adjust invoice via new entry
    model.applyLedgerToInvoice(invoice, entry);
    model.appendInvoiceHistory(invoice, { action: body.action || type, actorEmail: gate.actor.userEmail, detail: entry.note });
    store.billingSimulator.invoices[invoice.id] = invoice;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      ledger: entry,
      invoice,
      appendOnly: true,
      testingBanner: model.TESTING_BANNER,
    });
  }

  async function handleApproveSuggestion(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { familyBilling: true });
    if (!gate) return;
    const body = await readJson(request).catch(() => ({}));
    const suggestion = store.billingSimulator.chargeSuggestions[body.suggestionId];
    if (!suggestion || suggestion.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
    if (body.confirm !== true) {
      return jsonResponse(response, 400, {
        ok: false,
        code: "confirmation_required",
        error: "Attendance-linked charges never auto-bill without provider confirmation.",
        suggestion,
      });
    }
    suggestion.status = "approved";
    suggestion.autoBilled = false;
    suggestion.updatedAt = model.nowIso();
    const profile = listValues(store.billingSimulator.billingProfiles).find((p) => p.organizationId === gate.organization.id);
    const invoice = model.createInvoice({
      organizationId: gate.organization.id,
      billingProfileId: profile?.id || "",
      householdId: profile?.householdId || "",
      childIds: [suggestion.childId],
      lineItems: [{
        chargeType: suggestion.chargeType,
        description: suggestion.reason,
        childId: suggestion.childId,
        amountCents: suggestion.amountCents,
      }],
      status: model.INVOICE_STATUSES.OPEN,
    });
    model.appendInvoiceHistory(invoice, { action: "from_attendance_suggestion", actorEmail: gate.actor.userEmail, detail: "Provider-confirmed" });
    store.billingSimulator.invoices[invoice.id] = invoice;
    store.billingSimulator.chargeSuggestions[suggestion.id] = suggestion;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, suggestion, invoice, autoBilled: false, testingBanner: model.TESTING_BANNER });
  }

  async function handleReports(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { familyBilling: true });
    if (!gate) return;
    const orgId = gate.organization.id;
    const invoices = listValues(store.billingSimulator.invoices).filter((i) => i.organizationId === orgId);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: model.TESTING_BANNER,
      aging: {
        current: invoices.filter((i) => i.status === model.INVOICE_STATUSES.OPEN).length,
        pastDue: invoices.filter((i) => i.status === model.INVOICE_STATUSES.PAST_DUE).length,
        uncollectible: invoices.filter((i) => i.status === model.INVOICE_STATUSES.UNCOLLECTIBLE).length,
      },
      revenueSummaryCents: listValues(store.billingSimulator.ledger)
        .filter((l) => l.organizationId === orgId && [model.LEDGER_TYPES.PAYMENT, model.LEDGER_TYPES.PARTIAL_PAYMENT].includes(l.type))
        .reduce((sum, l) => model.addCents(sum, l.amountCents), 0),
      fakeDataOnly: true,
      noStripe: true,
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/catalog`) return (req, res, ctx) => handleCatalog(req, res, ctx);
    if (method === "POST" && path === `${BASE}/platform/simulate`) return (req, res, ctx) => handleSimulatePlatform(req, res, ctx);
    if (method === "GET" && path === `${BASE}/family/overview`) return (req, res, ctx) => handleFamilyOverview(req, res, ctx);
    if (method === "POST" && path === `${BASE}/family/generate-cycle`) return (req, res, ctx) => handleGenerateCycle(req, res, ctx);
    if (method === "POST" && path === `${BASE}/family/payment-sim`) return (req, res, ctx) => handlePaymentSim(req, res, ctx);
    if (method === "POST" && path === `${BASE}/family/approve-suggestion`) return (req, res, ctx) => handleApproveSuggestion(req, res, ctx);
    if (method === "GET" && path === `${BASE}/family/reports`) return (req, res, ctx) => handleReports(req, res, ctx);
    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createBillingSimulatorApi,
  BASE,
};
