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
const tempPasswordAuth = require("./temp-password-auth.js");

const BASE = "/api/pilot";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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
      return { kind: "admin", organizationId, role: "provider", email: ctx.adminEmail, isOwner: true };
    }
    if (ctx.fakeAccountEmail) {
      const sandboxAccount = sandboxModel.listSandboxAccounts(store).find((row) => row.email === safeLower(ctx.fakeAccountEmail));
      if (sandboxAccount) {
        const isGuardianRole = sandboxAccount.activeRoleKey === "parent_guardian";
        return {
          kind: "tester",
          organizationId: sandboxAccount.organizationId,
          role: isGuardianRole ? "parent" : "provider",
          email: sandboxAccount.email,
          accountId: sandboxAccount.id,
          previewContactId: isGuardianRole ? (sandboxAccount.activePreviewContactId || "") : "",
          isOwner: true, // the External Tester Sandbox account IS the owner, previewing other roles — never a hired staff record.
        };
      }
      // Generalization: ANY other testing-only fake account (e.g. Testing
      // Lab's phase8.homedaycare@example.invalid, phase8.director@example.invalid,
      // priya.lin@example.invalid, ...) may also act as a provider/parent for
      // HER OWN organization here — this is what makes Families/Messages/
      // Forms/Billing genuinely connected (not a placeholder) for every
      // role's own test account, not only External Tester Sandbox testers.
      // organizationId/contactId always come from the STORED account record,
      // never from anything the client claims.
      const genericAccount = listValues(store.familyFoundation?.fakeAccounts || {})
        .find((row) => row.email === safeLower(ctx.fakeAccountEmail) && row.kind !== sandboxModel.SANDBOX_KIND);
      if (genericAccount) {
        const identity = familyModel.mainAppIdentityForFakeAccount(genericAccount);
        return {
          kind: "tester",
          organizationId: genericAccount.organizationId,
          role: identity.familyHubGuardian ? "parent" : "provider",
          email: genericAccount.email,
          accountId: genericAccount.id,
          previewContactId: identity.familyHubGuardian ? cleanText(genericAccount.contactId, 160) : "",
          // A hired Home Daycare staff member is a "provider" for Daily Care/
          // Messages/Calendar purposes, but must NEVER receive owner powers
          // (Families/guardians, Billing, adding more staff, program
          // settings) — see the isOwner checks throughout this file.
          isOwner: genericAccount.kind !== "home_daycare_staff",
        };
      }
      deny(response, 404, "not_found", "This account is not a recognized testing account.");
      return null;
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
    // Families/guardian management is an owner-only capability — a hired
    // staff member sees only Today/assigned children/Daily Care/Messages/
    // Calendar/Curriculum/her own profile, never the family roster.
    if (!actor.isOwner) return deny(response, 403, "owner_only", "Only the owner can view the guardian list.");
    jsonResponse(response, 200, { ok: true, guardians: model.listGuardians(store, actor.organizationId) });
  }

  async function handleAddGuardian(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (!actor.isOwner) return deny(response, 403, "owner_only", "Only the owner can add a guardian.");
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
    if (!actor.isOwner) return deny(response, 403, "owner_only", "Only the owner can change guardian permissions.");
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
    // Program billing configuration is an owner-only capability — a hired
    // staff member must never see family balances or invoices.
    if (actor.role === "provider" && !actor.isOwner) return deny(response, 403, "owner_only", "Billing is only visible to the owner.");
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
    if (!actor.isOwner) return deny(response, 403, "owner_only", "Only the owner can add a fake billing record.");
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

  // ---- Daily Care entry mirror (cross-login connected data) -----------------

  async function handleAddDailyCareEntry(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider (owner or staff) can log Daily Care entries.");
    if (!body.storeKey || !body.record) return deny(response, 400, "invalid_entry");
    const entry = model.addDailyCareEntry(store, { organizationId: actor.organizationId, childId: body.childId || body.record.childId, storeKey: body.storeKey, record: body.record });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, entry });
  }

  async function handleListDailyCareEntries(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only");
    jsonResponse(response, 200, { ok: true, entries: model.listDailyCareEntries(store, actor.organizationId) });
  }

  // ---- Staff (owner + at most one optional staff member) --------------------

  async function handleListStaff(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    let staff = listValues(store.familyFoundation?.fakeAccounts || {})
      .filter((row) => row.organizationId === actor.organizationId && row.kind === "home_daycare_staff")
      .map((row) => ({ id: row.id, email: row.email, displayName: row.displayName, active: row.active !== false, createdAt: row.createdAt, permissions: row.permissions || {} }));
    // "Other staff's private records" must never be visible to a staff
    // member — she may only see her own profile row (the owner sees all).
    if (!actor.isOwner) staff = staff.filter((row) => row.email === actor.email);
    jsonResponse(response, 200, { ok: true, staff });
  }

  /** The OWNER herself (no admin needed) may add exactly ONE staff member for her own organization — self-service, matching "the owner plus one optional staff member." */
  async function handleAddStaffSelfService(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (!actor.isOwner) return deny(response, 403, "owner_only", "Only the owner can add a staff member.");
    const existingStaffCount = listValues(store.familyFoundation?.fakeAccounts || {})
      .filter((row) => row.organizationId === actor.organizationId && row.kind === "home_daycare_staff" && row.active !== false).length;
    if (existingStaffCount >= 1) {
      return deny(response, 409, "staff_limit_reached", "A Home Daycare Pilot account may have at most one additional staff member.");
    }
    const email = safeLower(body.email || "");
    if (!labModel.isExampleInvalidEmail(email)) {
      return deny(response, 403, "non_fake_email_rejected", "Staff accounts must use @example.invalid.");
    }
    const staffName = String(body.displayName || "Home Daycare Staff").trim().slice(0, 120);
    const created = model.addStaffMember(store, {
      organizationId: actor.organizationId, displayName: staffName, email, createdByEmail: actor.email,
    });
    const password = tempPasswordAuth.generateTemporaryPassword();
    const hash = tempPasswordAuth.hashPassword(password);
    model.applyStaffMemberIdentity(store, { email, passwordHash: hash });
    labModel.appendAudit(store, {
      organizationId: actor.organizationId,
      action: "home_daycare_staff_added_self_service",
      actorEmail: actor.email,
      detail: `Owner added staff member ${staffName} <${email}> (plaintext not logged)`,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      staff: { id: created.id, email: created.email, displayName: created.displayName },
      temporaryPassword: password,
      note: "Copy the password now — it will not be shown again.",
    });
  }

  async function handleChildContacts(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    const childId = url?.searchParams?.get("childId") || "";
    if (actor.role === "parent" && (!childId || !guardianMayAccessChild(store, actor, childId, "digital"))) {
      return deny(response, 403, "not_linked", "You are not linked to that child.");
    }
    jsonResponse(response, 200, { ok: true, contacts: model.listChildContactsForParent(store, { organizationId: actor.organizationId, childId }) });
  }

  async function handleListChangeRequests(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    if (!actor.isOwner) return deny(response, 403, "owner_only", "Only the owner can view change requests.");
    jsonResponse(response, 200, { ok: true, changeRequests: model.listChangeRequests(store, actor.organizationId) });
  }

  async function handleAddChangeRequest(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    const childId = String(body.childId || "");
    if (actor.role === "parent" && !guardianMayAccessChild(store, actor, childId, "digital")) {
      return deny(response, 403, "not_linked", "You are not linked to that child.");
    }
    const record = model.addChangeRequest(store, { organizationId: actor.organizationId, childId, requestedByEmail: actor.email, message: body.message });
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_change_request", actorEmail: actor.email, detail: `Change request for child ${childId}` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, changeRequest: record });
  }

  // ---- Photos (Photo Safety bridge from fast Daily Logs) --------------------

  async function handleListPhotos(request, response, ctx, url) {
    const store = readStore();
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: url?.searchParams?.get("organizationId") || "" });
    if (!actor) return;
    const childId = url?.searchParams?.get("childId") || "";
    if (actor.role === "parent" && (!childId || !guardianMayAccessChild(store, actor, childId, "digital"))) {
      return deny(response, 403, "not_linked", "You are not linked to that child.");
    }
    const photos = model.listSharedPhotos(store, actor.organizationId, childId)
      .filter((p) => actor.role === "provider" || p.sharedWithFamily !== false);
    jsonResponse(response, 200, { ok: true, photos });
  }

  async function handleAddPhoto(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only", "Only the provider can add a photo.");
    const childExists = model.listChildren(store, actor.organizationId).some((c) => c.id === body.childId);
    if (!childExists) return deny(response, 400, "invalid_child");
    const record = model.addSharedPhoto(store, {
      organizationId: actor.organizationId, childId: body.childId, caption: body.caption, dataUrl: body.dataUrl, createdByEmail: actor.email,
    });
    labModel.appendAudit(store, { organizationId: actor.organizationId, action: "pilot_photo_added", actorEmail: actor.email, detail: `Added a fake testing photo for child ${body.childId}` });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, photo: { ...record, dataUrl: undefined } });
  }

  async function handleSetPhotoVisibility(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const actor = resolveActor(store, response, ctx, { organizationIdFromQuery: body.organizationId || "" });
    if (!actor) return;
    if (actor.role !== "provider") return deny(response, 403, "provider_only");
    const photo = store.homeDaycarePilot?.photos?.[body.photoId];
    // Cross-organization access is rejected here — a photo from a
    // DIFFERENT organization is treated exactly like "not found", never
    // revealing whether it exists.
    if (!photo || photo.organizationId !== actor.organizationId) return deny(response, 404, "not_found");
    // Unsharing NEVER deletes the provider's original record — only the
    // family-visible flag changes.
    const updated = model.setSharedPhotoVisibility(store, { photoId: body.photoId, sharedWithFamily: body.sharedWithFamily !== false });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, photo: { ...updated, dataUrl: undefined } });
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
    if (method === "GET" && path === `${BASE}/daily-care-entries`) return (req, res, ctx) => handleListDailyCareEntries(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/daily-care-entries`) return (req, res, ctx) => handleAddDailyCareEntry(req, res, ctx);
    if (method === "GET" && path === `${BASE}/staff`) return (req, res, ctx) => handleListStaff(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/staff`) return (req, res, ctx) => handleAddStaffSelfService(req, res, ctx);
    if (method === "GET" && path === `${BASE}/child-contacts`) return (req, res, ctx) => handleChildContacts(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/change-request`) return (req, res, ctx) => handleListChangeRequests(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/change-request`) return (req, res, ctx) => handleAddChangeRequest(req, res, ctx);
    if (method === "GET" && path === `${BASE}/photos`) return (req, res, ctx) => handleListPhotos(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/photos`) return (req, res, ctx) => handleAddPhoto(req, res, ctx);
    if (method === "POST" && path === `${BASE}/photos/visibility`) return (req, res, ctx) => handleSetPhotoVisibility(req, res, ctx);
    if (method === "GET" && path === `${BASE}/parent-home`) return (req, res, ctx) => handleParentHome(req, res, ctx, url);
    return null;
  }

  return { matchRoute };
}

module.exports = { createHomeDaycarePilotApi, BASE };
