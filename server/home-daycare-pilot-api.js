/**
 * Home Daycare Pilot — /api/pilot/*
 *
 * The connected provider <-> parent data surface for the External Tester
 * Sandbox's Home Daycare Pilot workflow. Every route resolves WHO is asking
 * server-side and never trusts a client-supplied organizationId/childId
 * without checking it:
 *
 *  - Solo Home Daycare Provider (the sandbox account's own "provider" role):
 *    full read/write within her OWN organization only (she IS the provider).
 *  - Parent/Guardian (the same sandbox account's own "parent" role): every
 *    read/write is scoped to whichever ONE guardian/child relationship she
 *    is CURRENTLY previewing (account.activePreviewContactId, set by
 *    external-tester-sandbox-data-model.js#switchActiveRole — never a
 *    client-supplied contactId), and only for capabilities that
 *    relationship's own access rule actually allows. She can never reach
 *    another child's data this way.
 *  - Admin (a verified admin token, with an explicit organizationId): used
 *    for "open the sandbox for support" — the same routes, the same
 *    isolation rules, just addressed by an admin who already knows which
 *    fake organization she's supporting.
 *
 * Production always rejects. No email/SMS/push/Stripe/live AI anywhere in
 * this file — every billing record here is explicitly marked
 * testingOnly/noRealPaymentProcessed.
 */

const model = require("../scripts/home-daycare-pilot-data-model.js");
const sandboxModel = require("../scripts/external-tester-sandbox-data-model.js");
const labModel = require("../scripts/testing-lab-data-model.js");
const familyModel = require("../scripts/family-foundation-data-model.js");
const expansionFlags = require("../scripts/expansion-feature-flags.js");

const BASE = "/api/pilot";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveEnv(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") {
    const siteUrl = String(process.env.SITE_URL || "");
    env = expansionFlags.resolveExpansionEnvironment({ siteUrl, env: process.env });
  }
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const liveProduction = env.liveProduction === true || String(siteUrl).toLowerCase().includes(PRODUCTION_HOST);
  return { ...env, liveProduction, siteUrl };
}

function createHomeDaycarePilotApi({ readStore, writeStore, jsonResponse, readJson, expansionEnvironment }) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, { ok: false, error: error || "Access denied.", code });
  }

  /**
   * Resolves WHO is asking and which organization/role/preview-contact she
   * may act as. Returns null (after denying) on any failure — every route
   * below must check for null and return immediately.
   */
  function resolveActor(store, response, ctx, { organizationIdFromQuery = "" } = {}) {
    if (env().liveProduction) {
      deny(response, 403, "production_preview_rejected", "Home Daycare Pilot is unavailable in production.");
      return null;
    }
    if (ctx.adminEmail) {
      const organizationId = String(organizationIdFromQuery || "");
      if (!labModel.isFakeOrganizationId(organizationId)) {
        deny(response, 403, "real_target_rejected", "Cannot target a non-fake organization.");
        return null;
      }
      return { kind: "admin", organizationId, role: "provider", email: ctx.adminEmail };
    }
    if (ctx.fakeAccountEmail) {
      const account = sandboxModel.listSandboxAccounts(store).find((row) => row.email === safeLower(ctx.fakeAccountEmail));
      if (!account) {
        deny(response, 404, "not_found", "This account is not an External Tester Sandbox account.");
        return null;
      }
      const isGuardianRole = account.activeRoleKey === "parent_guardian";
      return {
        kind: "tester",
        organizationId: account.organizationId,
        role: isGuardianRole ? "parent" : "provider",
        email: account.email,
        accountId: account.id,
        previewContactId: isGuardianRole ? (account.activePreviewContactId || "") : "",
      };
    }
    deny(response, 401, "auth_required", "Sign in to use the Home Daycare Pilot.");
    return null;
  }

  /** For a parent actor, verifies her current preview relationship actually grants `capability` for `childId` — never trusts the client's claim either way. */
  function guardianMayAccessChild(store, actor, childId, capability = "digital") {
    if (actor.role !== "parent") return true; // provider: full access within her own org, checked separately.
    if (!actor.previewContactId || !childId) return false;
    const evaluation = familyModel.evaluateContactChildAccess({
      store, organizationId: actor.organizationId, contactId: actor.previewContactId, childId, capability,
    });
    return Boolean(evaluation?.allowed);
  }

  // ---- Children --------------------------------------------------------

  async function handleListChildren(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    let children = model.listChildren(store, actor.organizationId);
    if (actor.role === "parent") {
      children = children.filter((c) => guardianMayAccessChild(store, actor, c.id, "digital"));
    }
    jsonResponse(response, 200, { ok: true, children });
  }

  async function handleAddChild(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider can add a child.");
    const child = model.addChild(store, { organizationId: actor.organizationId, displayName: body.displayName });
    if (actor.kind === "tester") sandboxModel.setChecklistItemComplete(store, { accountId: actor.accountId, itemKey: "add_child", complete: true });
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_child_added", actorEmail: actor.email, detail: `Added fake child ${child.displayName}` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, child });
  }

  // ---- Guardians ---------------------------------------------------------

  async function handleListGuardians(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider can view the guardian list.");
    jsonResponse(response, 200, { ok: true, guardians: model.listGuardians(store, actor.organizationId) });
  }

  async function handleAddGuardian(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider can add a guardian.");
    const orgChildIds = new Set(model.listChildren(store, actor.organizationId).map((c) => c.id));
    const requestedChildIds = Array.isArray(body.childIds) ? body.childIds : [body.childId].filter(Boolean);
    const childIds = requestedChildIds.filter((id) => orgChildIds.has(id));
    if (!childIds.length) return deny(response, 400, "no_valid_children", "Select at least one child (in this same organization) to link.");
    const { contact, rules } = model.addGuardian(store, {
      organizationId: actor.organizationId,
      displayName: body.displayName,
      email: body.email,
      relationshipLabel: body.relationshipLabel,
      childIds,
      accessLevel: body.accessLevel,
      isFinanciallyResponsible: body.isFinanciallyResponsible === true,
      isAuthorizedPickup: body.isAuthorizedPickup !== false,
      isEmergencyContact: body.isEmergencyContact === true,
      createdByEmail: actor.email,
    });
    if (actor.kind === "tester") sandboxModel.setChecklistItemComplete(store, { accountId: actor.accountId, itemKey: "add_guardian", complete: true });
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_guardian_added", actorEmail: actor.email, detail: `Added fake guardian ${contact.displayName}, linked to ${rules.length} child(ren)` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, contact, rules });
  }

  async function handleUpdateGuardianAccess(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider can change guardian permissions.");
    const contact = store.familyFoundation?.contacts?.[body.contactId];
    if (!contact || contact.organizationId !== actor.organizationId) return deny(response, 404, "not_found");
    const rule = model.updateGuardianAccess(store, {
      contactId: body.contactId, childId: body.childId, accessLevel: body.accessLevel,
      isFinanciallyResponsible: body.isFinanciallyResponsible, isAuthorizedPickup: body.isAuthorizedPickup, isEmergencyContact: body.isEmergencyContact,
    });
    if (!rule) return deny(response, 404, "not_found", "No matching guardian/child link found.");
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_guardian_access_updated", actorEmail: actor.email, detail: `Updated access for guardian ${body.contactId} on child ${body.childId}` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, rule });
  }

  // ---- Updates ------------------------------------------------------------

  async function handleListUpdates(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    const childId = url?.searchParams?.get("childId") || "";
    if (actor.role === "parent") {
      if (!childId || !guardianMayAccessChild(store, actor, childId, "digital")) return deny(response, 403, "not_linked", "You are not linked to that child.");
    }
    jsonResponse(response, 200, { ok: true, updates: model.listUpdates(store, actor.organizationId, childId) });
  }

  async function handleAddUpdate(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider can post a family update.");
    const childExists = model.listChildren(store, actor.organizationId).some((c) => c.id === body.childId);
    if (!childExists) return deny(response, 400, "invalid_child", "That child was not found in this organization.");
    const record = model.addUpdate(store, { organizationId: actor.organizationId, childId: body.childId, title: body.title, message: body.message, createdByEmail: actor.email });
    if (actor.kind === "tester") sandboxModel.setChecklistItemComplete(store, { accountId: actor.accountId, itemKey: "send_update", complete: true });
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_update_sent", actorEmail: actor.email, detail: `Sent family update for child ${body.childId}` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, update: record });
  }

  // ---- Messages -------------------------------------------------------------

  async function handleListMessages(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    const childId = url?.searchParams?.get("childId") || "";
    if (actor.role === "parent" && (!childId || !guardianMayAccessChild(store, actor, childId, "messages"))) {
      return deny(response, 403, "not_linked", "You are not linked to that child.");
    }
    if (actor.role === "provider" && childId && !model.listChildren(store, actor.organizationId).some((c) => c.id === childId)) {
      return deny(response, 400, "invalid_child");
    }
    jsonResponse(response, 200, { ok: true, messages: model.listMessages(store, actor.organizationId, childId) });
  }

  async function handleAddMessage(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    const childId = String(body.childId || "");
    if (actor.role === "parent" && !guardianMayAccessChild(store, actor, childId, "messages")) {
      return deny(response, 403, "not_linked", "You are not linked to that child.");
    }
    if (actor.role === "provider" && !model.listChildren(store, actor.organizationId).some((c) => c.id === childId)) {
      return deny(response, 400, "invalid_child");
    }
    const record = model.addMessage(store, { organizationId: actor.organizationId, childId, senderRole: actor.role, senderEmail: actor.email, body: body.body });
    if (actor.kind === "tester" && actor.role === "parent") sandboxModel.setChecklistItemComplete(store, { accountId: actor.accountId, itemKey: "reply_as_parent", complete: true });
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_message_sent", actorEmail: actor.email, detail: `${actor.role} sent a message about child ${childId}` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, message: record });
  }

  async function handleMarkMessagesRead(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    const childId = String(body.childId || "");
    if (actor.role === "parent" && !guardianMayAccessChild(store, actor, childId, "messages")) return deny(response, 403, "not_linked");
    const count = model.markMessagesRead(store, { organizationId: actor.organizationId, childId, readerRole: actor.role });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, markedRead: count });
  }

  // ---- Forms ----------------------------------------------------------------

  async function handleListForms(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    const childId = url?.searchParams?.get("childId") || "";
    if (actor.role === "parent" && (!childId || !guardianMayAccessChild(store, actor, childId, "forms"))) {
      return deny(response, 403, "not_linked", "You are not linked to that child.");
    }
    jsonResponse(response, 200, { ok: true, forms: model.listForms(store, actor.organizationId, childId) });
  }

  async function handleAddForm(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider can create/send a form.");
    const childExists = model.listChildren(store, actor.organizationId).some((c) => c.id === body.childId);
    if (!childExists) return deny(response, 400, "invalid_child");
    const record = model.addForm(store, { organizationId: actor.organizationId, childId: body.childId, title: body.title, createdByEmail: actor.email });
    if (actor.kind === "tester") sandboxModel.setChecklistItemComplete(store, { accountId: actor.accountId, itemKey: "send_form", complete: true });
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_form_sent", actorEmail: actor.email, detail: `Sent form "${record.title}" for child ${body.childId}` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, form: record });
  }

  async function handleUpdateFormStatus(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    const form = store.homeDaycarePilot?.forms?.[body.formId];
    if (!form || form.organizationId !== actor.organizationId) return deny(response, 404, "not_found");
    if (actor.role === "parent" && !guardianMayAccessChild(store, actor, form.childId, "forms")) return deny(response, 403, "not_linked");
    const updated = model.updateFormStatus(store, { formId: body.formId, status: body.status });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, form: updated });
  }

  // ---- Billing ----------------------------------------------------------------

  async function handleListBilling(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    const childId = url?.searchParams?.get("childId") || "";
    if (actor.role === "parent") {
      if (!childId || !guardianMayAccessChild(store, actor, childId, "billing")) {
        return deny(response, 403, "not_linked", "You are not linked to that child, or are not financially responsible for them.");
      }
    }
    jsonResponse(response, 200, { ok: true, billing: model.listBilling(store, actor.organizationId, childId) });
  }

  async function handleAddBilling(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider can add a fake billing record.");
    const childExists = model.listChildren(store, actor.organizationId).some((c) => c.id === body.childId);
    if (!childExists) return deny(response, 400, "invalid_child");
    const record = model.addBillingRecord(store, {
      organizationId: actor.organizationId, childId: body.childId, description: body.description,
      amountCents: body.amountCents, dueDate: body.dueDate, status: body.status, createdByEmail: actor.email,
    });
    if (actor.kind === "tester") sandboxModel.setChecklistItemComplete(store, { accountId: actor.accountId, itemKey: "test_billing", complete: true });
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_billing_added", actorEmail: actor.email, detail: `Added fake billing record "${record.description}" for child ${body.childId} (testing only, no real payment)` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, billing: record });
  }

  // ---- Parent Home (aggregated) ----------------------------------------------

  async function handleParentHome(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    if (actor.role !== "parent") return deny(response, 403, "parent_only", "Parent Home is only available while previewing as Parent/Guardian.");
    if (!actor.previewContactId) return deny(response, 400, "no_preview_selected", "Choose which family to preview first.");
    const snapshot = model.parentHomeSnapshot(store, { organizationId: actor.organizationId, contactId: actor.previewContactId });
    if (actor.kind === "tester") {
      sandboxModel.setChecklistItemComplete(store, { accountId: actor.accountId, itemKey: "verify_parent_info", complete: true });
      writeStore(store);
    }
    jsonResponse(response, 200, { ok: true, ...snapshot });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "GET" && path === `${BASE}/children`) return (req, res, ctx) => handleListChildren(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/children`) return (req, res, ctx) => handleAddChild(req, res, ctx);
    if (method === "GET" && path === `${BASE}/guardians`) return (req, res, ctx) => handleListGuardians(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/guardians`) return (req, res, ctx) => handleAddGuardian(req, res, ctx);
    if (method === "POST" && path === `${BASE}/guardians/access`) return (req, res, ctx) => handleUpdateGuardianAccess(req, res, ctx);
    if (method === "GET" && path === `${BASE}/updates`) return (req, res, ctx) => handleListUpdates(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/updates`) return (req, res, ctx) => handleAddUpdate(req, res, ctx);
    if (method === "GET" && path === `${BASE}/messages`) return (req, res, ctx) => handleListMessages(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/messages`) return (req, res, ctx) => handleAddMessage(req, res, ctx);
    if (method === "POST" && path === `${BASE}/messages/read`) return (req, res, ctx) => handleMarkMessagesRead(req, res, ctx);
    if (method === "GET" && path === `${BASE}/forms`) return (req, res, ctx) => handleListForms(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/forms`) return (req, res, ctx) => handleAddForm(req, res, ctx);
    if (method === "POST" && path === `${BASE}/forms/status`) return (req, res, ctx) => handleUpdateFormStatus(req, res, ctx);
    if (method === "GET" && path === `${BASE}/billing`) return (req, res, ctx) => handleListBilling(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/billing`) return (req, res, ctx) => handleAddBilling(req, res, ctx);
    if (method === "GET" && path === `${BASE}/parent-home`) return (req, res, ctx) => handleParentHome(req, res, ctx, url);
    return null;
  }

  return { matchRoute };
}

module.exports = { createHomeDaycarePilotApi, BASE };
