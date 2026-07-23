/**
 * Phase 8 Family / Guardian / Household foundation API.
 *
 * Management routes mount under /api/director-center/family/* (admin preview).
 * Guardian session routes mount under /api/family-foundation/* (member session).
 * Family Hub product routes remain unavailable (/api/family-hub/*).
 *
 * Fake data only. No email/SMS/Stripe/live AI. Production rejects fake accounts
 * and testing invitation accept modes.
 */

const foundation = require("../scripts/foundation-data-model.js");
const entitlements = require("../scripts/entitlement-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const model = require("../scripts/family-foundation-data-model.js");
const fixtures = require("../scripts/family-foundation-fixtures.js");
const invitationTokens = require("../scripts/family-invitation-tokens.js");
const tempPasswordAuth = require("./temp-password-auth.js");

const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const FAKE_EMAIL_SUFFIX = "@example.invalid";
const TESTING_BANNER = "Testing Account — Fake Data Only.";

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
  const value = String(siteUrl || "").toLowerCase();
  return Boolean(value) && value.indexOf(PRODUCTION_HOST) !== -1;
}

function fallbackExpansionEnvironment() {
  const siteUrl = String(process.env.SITE_URL || "");
  const liveProduction = productionSiteFromUrl(siteUrl);
  return {
    liveProduction,
    allowDirectorCenterAdminPreview: !liveProduction && truthy(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW),
    siteUrl,
  };
}

function resolveExpansionEnvironment(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") env = fallbackExpansionEnvironment();
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const production = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    liveProduction: production,
    allowDirectorCenterAdminPreview: env.allowDirectorCenterAdminPreview === true && !production,
    siteUrl,
  };
}

function isFakeEmail(email) {
  return safeLower(email).endsWith(FAKE_EMAIL_SUFFIX);
}

function addAudit(store, organizationId, action, message, entityType, entityId, actorEmail, actorRole = "director", changes = null) {
  const audit = model.createFamilyAuditRecord({
    organizationId,
    action,
    actorEmail,
    actorRole,
    message,
    entityType,
    entityId,
    changes,
  });
  store.familyFoundation.audit[audit.id] = audit;
  return audit;
}

function publicContact(contact, { includeRestrictedNotes = false } = {}) {
  if (!contact) return null;
  return {
    id: contact.id,
    organizationId: contact.organizationId,
    foundationGuardianId: contact.foundationGuardianId || "",
    displayName: contact.displayName,
    email: contact.email,
    phone: contact.phone || "",
    relationshipDefault: contact.relationshipDefault || "",
    userAccountId: contact.userAccountId || "",
    status: contact.status,
    invitationStatus: contact.invitationStatus || "",
    internalNotes: contact.internalNotes || "",
    restrictedNotes: includeRestrictedNotes ? (contact.restrictedNotes || "") : undefined,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

function publicInvitation(invitation) {
  if (!invitation) return null;
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    contactId: invitation.contactId,
    childIds: invitation.childIds || [],
    accessRuleIds: invitation.accessRuleIds || [],
    status: invitation.status,
    expiresAt: invitation.expiresAt || "",
    acceptedAt: invitation.acceptedAt || "",
    acceptedUserAccountId: invitation.acceptedUserAccountId || "",
    revokedAt: invitation.revokedAt || "",
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    // Never expose tokenHash
  };
}

function publicFakeAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    organizationId: account.organizationId,
    kind: account.kind,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    planKey: account.planKey || "",
    contactId: account.contactId || "",
    staffMembershipId: account.staffMembershipId || "",
    label: account.label || TESTING_BANNER,
    testingOnly: true,
    active: account.active !== false,
    hasPassword: Boolean(account.passwordHash),
    lastPasswordIssuedAt: account.lastPasswordIssuedAt || "",
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function detectDuplicateContacts(store, organizationId) {
  const contacts = listValues(store.familyFoundation.contacts).filter((row) => row.organizationId === organizationId && row.status === "active");
  const byEmail = new Map();
  const byNamePhone = new Map();
  const duplicates = [];
  contacts.forEach((contact) => {
    if (contact.email) {
      const key = contact.email;
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key).push(contact.id);
    }
    const np = `${safeLower(contact.displayName)}|${String(contact.phone || "").replace(/\D/g, "")}`;
    if (contact.displayName) {
      if (!byNamePhone.has(np)) byNamePhone.set(np, []);
      byNamePhone.get(np).push(contact.id);
    }
  });
  byEmail.forEach((ids, email) => {
    if (ids.length > 1) duplicates.push({ type: "email", key: email, contactIds: ids });
  });
  byNamePhone.forEach((ids, key) => {
    if (ids.length > 1) duplicates.push({ type: "name_phone", key, contactIds: ids });
  });
  return duplicates;
}

function detectDuplicateHouseholds(store, organizationId) {
  const households = listValues(store.familyFoundation.households).filter((row) => row.organizationId === organizationId && row.status === "active");
  const byName = new Map();
  const duplicates = [];
  households.forEach((hh) => {
    const key = safeLower(hh.displayName);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(hh.id);
  });
  byName.forEach((ids, name) => {
    if (ids.length > 1) duplicates.push({ type: "household_name", key: name, householdIds: ids });
  });
  return duplicates;
}

function previewGuardianVisibility(store, organizationId, contactId) {
  const contact = store.familyFoundation.contacts[contactId];
  if (!contact || contact.organizationId !== organizationId) return null;
  const rules = listValues(store.familyFoundation.accessRules).filter((row) => row.organizationId === organizationId && row.contactId === contactId);
  return {
    contactId,
    displayName: contact.displayName,
    familyHubOff: true,
    placeholderMessage: "Your account is connected. The Family Hub experience will be added in the next phase.",
    children: rules.map((rule) => {
      const child = store.childRecords?.[rule.childId];
      const forms = model.evaluateContactChildAccess({
        store, organizationId, contactId, childId: rule.childId, capability: "forms",
      });
      const digital = model.evaluateContactChildAccess({
        store, organizationId, contactId, childId: rule.childId, capability: "digital",
      });
      return {
        childId: rule.childId,
        childDisplayName: child?.displayName || "",
        accessLevel: rule.accessLevel,
        accessLevelLabel: model.ACCESS_LEVEL_LABELS[rule.accessLevel] || rule.accessLevel,
        status: rule.status,
        isEmergencyContact: rule.isEmergencyContact === true,
        isAuthorizedPickup: rule.isAuthorizedPickup === true,
        isFinanciallyResponsible: rule.isFinanciallyResponsible === true,
        isLegalGuardianAsEntered: rule.isLegalGuardianAsEntered === true,
        wouldSeeForms: forms.allowed === true,
        wouldSeeDigitalHub: false, // Family Hub OFF
        wouldSeeMessages: model.evaluateContactChildAccess({
          store, organizationId, contactId, childId: rule.childId, capability: "messages",
        }).allowed === true,
        digitalAllowed: digital.allowed === true,
        note: "Preview only — Family Hub product surfaces remain OFF in Phase 8.",
      };
    }),
  };
}

function createFamilyFoundationApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function env() {
    return resolveExpansionEnvironment(expansionEnvironment);
  }

  function rejectIfProduction(response, code = "production_locked") {
    if (!env().liveProduction) return false;
    jsonResponse(response, 403, {
      error: "Fake-account and family testing modes are not available on production.",
      code,
      familyHub: false,
    });
    return true;
  }

  function ensureDirectorContext(store, adminEmail) {
    model.ensureFamilyFoundationStore(store);
    const seeded = fixtures.ensurePhase8Preview(store, { adminEmail });
    const organization = store.organizations[seeded.organizationId]
      || formsFixtures.ensurePreviewOrganization(store, { adminEmail });
    const entitlement = listValues(store.organizationEntitlements).find((row) => row.organizationId === organization.id)
      || entitlements.createOrganizationEntitlementRecord({
        organizationId: organization.id,
        basePlanKey: entitlements.PLAN_KEYS.SMALL_CENTER,
      });
    if (!store.organizationEntitlements[entitlement.id]) {
      store.organizationEntitlements[entitlement.id] = entitlement;
    }
    return { organization, entitlement, seeded };
  }

  function requireFamilyManage(store, organizationId, adminEmail, action) {
    const decision = orgPermissions.evaluateAccess({
      store,
      actor: { email: adminEmail, role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER },
      organizationId,
      action,
    });
    // Admin preview actors are treated as owner when membership exists; also allow director.
    if (decision.allowed) return decision;
    const directorDecision = orgPermissions.evaluateAccess({
      store,
      actor: { email: adminEmail, role: orgPermissions.ORG_ROLES.DIRECTOR },
      organizationId,
      action,
    });
    return directorDecision.allowed ? directorDecision : decision;
  }

  function actorMayManage(store, organizationId, adminEmail) {
    const membership = listValues(store.staffMemberships).find((row) => (
      row.organizationId === organizationId
      && safeLower(row.userEmail) === safeLower(adminEmail)
      && row.status === foundation.STAFF_STATUS.ACTIVE
    ));
    const role = membership?.role || orgPermissions.ORG_ROLES.DIRECTOR_OWNER;
    if (role !== orgPermissions.ORG_ROLES.DIRECTOR_OWNER && role !== orgPermissions.ORG_ROLES.DIRECTOR) {
      return { allowed: false, reason: "director_required", role };
    }
    return { allowed: true, role };
  }

  // ─── Admin management handlers ───────────────────────────────────────────

  async function handleStatus(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization, seeded } = ensureDirectorContext(store, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 8,
      preview: true,
      familyHub: false,
      familyHubForcedOff: true,
      label: TESTING_BANNER,
      organizationId: organization.id,
      seeded: !seeded.alreadySeeded || true,
      counts: {
        households: listValues(store.familyFoundation.households).filter((row) => row.organizationId === organization.id).length,
        contacts: listValues(store.familyFoundation.contacts).filter((row) => row.organizationId === organization.id).length,
        accessRules: listValues(store.familyFoundation.accessRules).filter((row) => row.organizationId === organization.id).length,
        invitations: listValues(store.familyFoundation.invitations).filter((row) => row.organizationId === organization.id).length,
        fakeAccounts: listValues(store.familyFoundation.fakeAccounts).length,
      },
      accessLevels: model.ACCESS_LEVELS,
      accessLevelLabels: model.ACCESS_LEVEL_LABELS,
      noOutboundEmail: true,
      noOutboundSms: true,
    });
  }

  async function handleSeed(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    model.ensureFamilyFoundationStore(store);
    if (body.reset === true) {
      fixtures.resetPhase8Preview(store, { organizationId: body.organizationId || "" });
    }
    const seeded = fixtures.ensurePhase8Preview(store, { adminEmail: context.adminEmail, organizationId: body.organizationId || "" });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      seeded: true,
      reset: body.reset === true,
      familyHub: false,
      label: TESTING_BANNER,
      ...seeded,
      emailSent: false,
      smsSent: false,
    });
  }

  async function handleListHouseholds(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    writeStore(store);
    const households = listValues(store.familyFoundation.households)
      .filter((row) => row.organizationId === organization.id)
      .map((hh) => {
        const childLinks = listValues(store.familyFoundation.childHouseholdLinks).filter((row) => row.householdId === hh.id && row.status === "active");
        const members = listValues(store.familyFoundation.householdMemberships).filter((row) => row.householdId === hh.id && row.status === "active");
        return {
          ...hh,
          childIds: childLinks.map((row) => row.childId),
          children: childLinks.map((row) => ({
            childId: row.childId,
            displayName: store.childRecords?.[row.childId]?.displayName || "",
            sharedCustodyNote: row.sharedCustodyNote || "",
          })),
          contactIds: members.map((row) => row.contactId),
          contacts: members.map((row) => {
            const contact = store.familyFoundation.contacts[row.contactId];
            return contact ? { id: contact.id, displayName: contact.displayName, email: contact.email } : null;
          }).filter(Boolean),
        };
      });
    jsonResponse(response, 200, {
      ok: true,
      organizationId: organization.id,
      familyHub: false,
      label: TESTING_BANNER,
      households,
      duplicates: {
        contacts: detectDuplicateContacts(store, organization.id),
        households: detectDuplicateHouseholds(store, organization.id),
      },
    });
  }

  async function handleCreateHousehold(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const gate = actorMayManage(store, organization.id, context.adminEmail);
    if (!gate.allowed) {
      jsonResponse(response, 403, { error: "Only owners/directors may manage households.", code: gate.reason });
      return;
    }
    const household = model.createHouseholdRecord({
      organizationId: organization.id,
      displayName: body.displayName || "Household",
      notes: body.notes || "",
      createdByEmail: context.adminEmail,
    });
    store.familyFoundation.households[household.id] = household;
    const childIds = Array.isArray(body.childIds) ? body.childIds : [];
    childIds.forEach((childId) => {
      const child = store.childRecords?.[childId];
      if (!child || child.organizationId !== organization.id) return;
      const link = model.createChildHouseholdLinkRecord({
        organizationId: organization.id,
        householdId: household.id,
        childId,
        sharedCustodyNote: body.sharedCustodyNote || "",
      });
      store.familyFoundation.childHouseholdLinks[link.id] = link;
    });
    addAudit(store, organization.id, "household_created", `Household created: ${household.displayName}`, "household", household.id, context.adminEmail, gate.role);
    writeStore(store);
    jsonResponse(response, 201, { ok: true, household, familyHub: false });
  }

  async function handleGetHousehold(request, response, context = {}, householdId) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    writeStore(store);
    const household = store.familyFoundation.households[householdId];
    if (!household || household.organizationId !== organization.id) {
      jsonResponse(response, 404, { error: "Household was not found.", code: "household_not_found" });
      return;
    }
    const childLinks = listValues(store.familyFoundation.childHouseholdLinks).filter((row) => row.householdId === household.id);
    const members = listValues(store.familyFoundation.householdMemberships).filter((row) => row.householdId === household.id);
    const rules = listValues(store.familyFoundation.accessRules).filter((row) => row.householdId === household.id);
    const canRestricted = actorMayManage(store, organization.id, context.adminEmail).allowed;
    jsonResponse(response, 200, {
      ok: true,
      household,
      children: childLinks.map((row) => ({
        ...row,
        displayName: store.childRecords?.[row.childId]?.displayName || "",
      })),
      members: members.map((row) => ({
        ...row,
        contact: publicContact(store.familyFoundation.contacts[row.contactId], { includeRestrictedNotes: canRestricted }),
      })),
      accessRules: rules.map((rule) => ({
        ...rule,
        accessLevelLabel: model.ACCESS_LEVEL_LABELS[rule.accessLevel] || rule.accessLevel,
        contactName: store.familyFoundation.contacts[rule.contactId]?.displayName || "",
        childName: store.childRecords?.[rule.childId]?.displayName || "",
      })),
      familyHub: false,
      label: TESTING_BANNER,
    });
  }

  async function handleAddContact(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const gate = actorMayManage(store, organization.id, context.adminEmail);
    if (!gate.allowed) {
      jsonResponse(response, 403, { error: "Only owners/directors may manage contacts.", code: gate.reason });
      return;
    }
    const householdId = String(body.householdId || "").trim();
    const household = store.familyFoundation.households[householdId];
    if (!household || household.organizationId !== organization.id) {
      jsonResponse(response, 404, { error: "Household was not found.", code: "household_not_found" });
      return;
    }
    const email = safeLower(body.email || "");
    if (email && !isFakeEmail(email) && !env().liveProduction) {
      // Phase 8 testing: prefer @example.invalid; allow other emails only in non-production but flag them
    }
    if (env().liveProduction && email && isFakeEmail(email)) {
      jsonResponse(response, 403, { error: "Fake testing emails cannot be created in production.", code: "fake_email_forbidden" });
      return;
    }
    const contact = model.createContactRecord({
      organizationId: organization.id,
      displayName: body.displayName || "Contact",
      email,
      phone: body.phone || "",
      relationshipDefault: body.relationshipDefault || body.relationshipLabel || "parent",
      internalNotes: body.internalNotes || "",
      restrictedNotes: body.restrictedNotes || "",
      createdByEmail: context.adminEmail,
    });
    store.familyFoundation.contacts[contact.id] = contact;
    const membership = model.createHouseholdMembershipRecord({
      organizationId: organization.id,
      householdId,
      contactId: contact.id,
      roleInHousehold: body.roleInHousehold || "guardian",
    });
    store.familyFoundation.householdMemberships[membership.id] = membership;

    const childId = String(body.childId || "").trim();
    let rule = null;
    if (childId) {
      const child = store.childRecords?.[childId];
      if (!child || child.organizationId !== organization.id) {
        jsonResponse(response, 404, { error: "Child was not found in this organization.", code: "child_not_found" });
        return;
      }
      rule = model.createAccessRuleRecord({
        organizationId: organization.id,
        contactId: contact.id,
        childId,
        householdId,
        accessLevel: body.accessLevel || model.ACCESS_LEVELS.NO_DIGITAL_ACCESS,
        relationshipLabel: body.relationshipLabel || contact.relationshipDefault,
        isEmergencyContact: body.isEmergencyContact === true,
        isAuthorizedPickup: body.isAuthorizedPickup === true,
        isFinanciallyResponsible: body.isFinanciallyResponsible === true,
        isLegalGuardianAsEntered: body.isLegalGuardianAsEntered === true,
        verificationStatus: body.verificationStatus || "unverified",
        startsAt: body.startsAt || "",
        endsAt: body.endsAt || "",
        createdByEmail: context.adminEmail,
      });
      store.familyFoundation.accessRules[rule.id] = rule;
      model.syncFoundationGuardian(store, contact, rule);
      store.familyFoundation.contacts[contact.id] = contact;
    }
    addAudit(store, organization.id, "contact_added", `Contact added: ${contact.displayName}`, "contact", contact.id, context.adminEmail, gate.role);
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      contact: publicContact(contact, { includeRestrictedNotes: true }),
      membership,
      accessRule: rule,
      familyHub: false,
    });
  }

  async function handleSetAccess(request, response, context = {}, ruleId = "") {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const gate = actorMayManage(store, organization.id, context.adminEmail);
    if (!gate.allowed) {
      jsonResponse(response, 403, { error: "Only owners/directors may manage access.", code: gate.reason });
      return;
    }

    let rule = ruleId ? store.familyFoundation.accessRules[ruleId] : null;
    if (!rule && body.contactId && body.childId) {
      rule = listValues(store.familyFoundation.accessRules).find((row) => (
        row.organizationId === organization.id
        && row.contactId === body.contactId
        && row.childId === body.childId
        && row.status === "active"
      )) || null;
    }
    if (!rule || rule.organizationId !== organization.id) {
      // Create new child-specific rule
      const contact = store.familyFoundation.contacts[body.contactId];
      const child = store.childRecords?.[body.childId];
      if (!contact || contact.organizationId !== organization.id || !child || child.organizationId !== organization.id) {
        jsonResponse(response, 404, { error: "Contact or child was not found.", code: "not_found" });
        return;
      }
      rule = model.createAccessRuleRecord({
        organizationId: organization.id,
        contactId: contact.id,
        childId: child.id,
        householdId: body.householdId || "",
        accessLevel: body.accessLevel || model.ACCESS_LEVELS.LIMITED_GUARDIAN,
        relationshipLabel: body.relationshipLabel || contact.relationshipDefault,
        isEmergencyContact: body.isEmergencyContact === true,
        isAuthorizedPickup: body.isAuthorizedPickup === true,
        isFinanciallyResponsible: body.isFinanciallyResponsible === true,
        isLegalGuardianAsEntered: body.isLegalGuardianAsEntered === true,
        verificationStatus: body.verificationStatus || "verified",
        startsAt: body.startsAt || "",
        endsAt: body.endsAt || "",
        createdByEmail: context.adminEmail,
      });
      store.familyFoundation.accessRules[rule.id] = rule;
      model.syncFoundationGuardian(store, contact, rule);
    } else {
      if (body.accessLevel) rule.accessLevel = model.normalizeAccessLevel(body.accessLevel);
      if (body.relationshipLabel != null) rule.relationshipLabel = model.cleanText(body.relationshipLabel, 80);
      if (typeof body.isEmergencyContact === "boolean") rule.isEmergencyContact = body.isEmergencyContact;
      if (typeof body.isAuthorizedPickup === "boolean") rule.isAuthorizedPickup = body.isAuthorizedPickup;
      if (typeof body.isFinanciallyResponsible === "boolean") rule.isFinanciallyResponsible = body.isFinanciallyResponsible;
      if (typeof body.isLegalGuardianAsEntered === "boolean") rule.isLegalGuardianAsEntered = body.isLegalGuardianAsEntered;
      if (body.verificationStatus) rule.verificationStatus = model.cleanText(body.verificationStatus, 40);
      if (body.startsAt != null) rule.startsAt = body.startsAt || rule.startsAt;
      if (body.endsAt != null) rule.endsAt = body.endsAt || "";
      if (body.action === "suspend") model.suspendAccessRule(rule, { reason: body.reason || "", actorEmail: context.adminEmail });
      if (body.action === "restore") model.restoreAccessRule(rule, { actorEmail: context.adminEmail });
      if (body.action === "end") model.endAccessRule(rule, { reason: body.reason || "", actorEmail: context.adminEmail });
      rule.updatedAt = model.nowIso();
      store.familyFoundation.accessRules[rule.id] = rule;
      const contact = store.familyFoundation.contacts[rule.contactId];
      if (contact) model.syncFoundationGuardian(store, contact, rule);
    }
    addAudit(store, organization.id, "access_updated", `Access updated for rule ${rule.id}`, "access_rule", rule.id, context.adminEmail, gate.role, {
      accessLevel: rule.accessLevel,
      action: body.action || "set",
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      accessRule: {
        ...rule,
        accessLevelLabel: model.ACCESS_LEVEL_LABELS[rule.accessLevel] || rule.accessLevel,
      },
      historyPreserved: true,
      familyHub: false,
    });
  }

  async function handleLinkChild(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const gate = actorMayManage(store, organization.id, context.adminEmail);
    if (!gate.allowed) {
      jsonResponse(response, 403, { error: "Only owners/directors may link children.", code: gate.reason });
      return;
    }
    const household = store.familyFoundation.households[body.householdId];
    const child = store.childRecords?.[body.childId];
    if (!household || household.organizationId !== organization.id || !child || child.organizationId !== organization.id) {
      jsonResponse(response, 404, { error: "Household or child was not found.", code: "not_found" });
      return;
    }
    const existing = listValues(store.familyFoundation.childHouseholdLinks).find((row) => (
      row.householdId === household.id && row.childId === child.id && row.status === "active"
    ));
    if (existing) {
      jsonResponse(response, 200, { ok: true, link: existing, alreadyLinked: true });
      return;
    }
    const link = model.createChildHouseholdLinkRecord({
      organizationId: organization.id,
      householdId: household.id,
      childId: child.id,
      sharedCustodyNote: body.sharedCustodyNote || "",
    });
    store.familyFoundation.childHouseholdLinks[link.id] = link;
    addAudit(store, organization.id, "child_linked", `Child linked to household`, "child_household_link", link.id, context.adminEmail, gate.role);
    writeStore(store);
    jsonResponse(response, 201, { ok: true, link, familyHub: false });
  }

  async function handleCreateInvitation(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const gate = actorMayManage(store, organization.id, context.adminEmail);
    if (!gate.allowed) {
      jsonResponse(response, 403, { error: "Only owners/directors may issue invitations.", code: gate.reason });
      return;
    }
    const contact = store.familyFoundation.contacts[body.contactId];
    if (!contact || contact.organizationId !== organization.id) {
      jsonResponse(response, 404, { error: "Contact was not found.", code: "contact_not_found" });
      return;
    }
    const childIds = Array.isArray(body.childIds) && body.childIds.length
      ? body.childIds
      : listValues(store.familyFoundation.accessRules)
        .filter((row) => row.contactId === contact.id && row.status === "active")
        .map((row) => row.childId);
    const accessRuleIds = listValues(store.familyFoundation.accessRules)
      .filter((row) => row.contactId === contact.id && childIds.includes(row.childId))
      .map((row) => row.id);
    const issued = invitationTokens.issueInvitationToken({ ttlMs: body.ttlMs });
    const invitation = model.createInvitationRecord({
      organizationId: organization.id,
      contactId: contact.id,
      childIds,
      accessRuleIds,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      createdByEmail: context.adminEmail,
    });
    store.familyFoundation.invitations[invitation.id] = invitation;
    contact.invitationStatus = model.INVITATION_STATUSES.PENDING;
    contact.updatedAt = model.nowIso();
    store.familyFoundation.contacts[contact.id] = contact;
    addAudit(store, organization.id, "invitation_created", `Invitation created for ${contact.displayName}`, "invitation", invitation.id, context.adminEmail, gate.role);
    writeStore(store);
    // Raw token returned once — never stored, logged, or documented elsewhere.
    jsonResponse(response, 201, {
      ok: true,
      invitation: publicInvitation(invitation),
      accessPreview: previewGuardianVisibility(store, organization.id, contact.id),
      testingToken: issued.rawToken,
      emailSent: false,
      smsSent: false,
      note: "Invitation token shown once. Deliver manually in testing — no email/SMS sent.",
      familyHub: false,
    });
  }

  async function handleRevokeInvitation(request, response, context = {}, invitationId) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const invitation = store.familyFoundation.invitations[invitationId];
    if (!invitation || invitation.organizationId !== organization.id) {
      jsonResponse(response, 404, { error: "Invitation was not found.", code: "invitation_not_found" });
      return;
    }
    invitation.status = model.INVITATION_STATUSES.REVOKED;
    invitation.revokedAt = model.nowIso();
    invitation.updatedAt = invitation.revokedAt;
    invitation.tokenHash = ""; // invalidate
    store.familyFoundation.invitations[invitation.id] = invitation;
    const contact = store.familyFoundation.contacts[invitation.contactId];
    if (contact) {
      contact.invitationStatus = model.INVITATION_STATUSES.REVOKED;
      contact.updatedAt = model.nowIso();
      store.familyFoundation.contacts[contact.id] = contact;
    }
    addAudit(store, organization.id, "invitation_revoked", "Invitation revoked", "invitation", invitation.id, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, invitation: publicInvitation(invitation), familyHub: false });
  }

  async function handleRegenerateInvitation(request, response, context = {}, invitationId) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const previous = store.familyFoundation.invitations[invitationId];
    if (!previous || previous.organizationId !== organization.id) {
      jsonResponse(response, 404, { error: "Invitation was not found.", code: "invitation_not_found" });
      return;
    }
    previous.status = model.INVITATION_STATUSES.REVOKED;
    previous.revokedAt = model.nowIso();
    previous.tokenHash = "";
    previous.updatedAt = previous.revokedAt;
    store.familyFoundation.invitations[previous.id] = previous;
    const issued = invitationTokens.issueInvitationToken();
    const invitation = model.createInvitationRecord({
      organizationId: organization.id,
      contactId: previous.contactId,
      childIds: previous.childIds,
      accessRuleIds: previous.accessRuleIds,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      createdByEmail: context.adminEmail,
    });
    store.familyFoundation.invitations[invitation.id] = invitation;
    addAudit(store, organization.id, "invitation_regenerated", "Invitation regenerated; previous token invalidated", "invitation", invitation.id, context.adminEmail, "", {
      previousInvitationId: previous.id,
    });
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      invitation: publicInvitation(invitation),
      previousInvitationId: previous.id,
      testingToken: issued.rawToken,
      emailSent: false,
      familyHub: false,
    });
  }

  async function handleAcceptInvitation(request, response) {
    if (rejectIfProduction(response, "invitation_accept_forbidden_in_production")) return;
    const body = await readJson(request);
    const store = readStore();
    model.ensureFamilyFoundationStore(store);
    const invitationId = String(body.invitationId || "").trim();
    const invitation = store.familyFoundation.invitations[invitationId];
    if (!invitation) {
      jsonResponse(response, 404, { error: "Invitation was not found.", code: "invitation_not_found" });
      return;
    }
    const rawToken = invitationTokens.extractTokenFromRequest(request) || String(body.token || "").trim();
    // Reject query-string style: tokens must come from header or POST body, never URL query.
    const verification = invitationTokens.verifyInvitationToken(invitation, rawToken);
    if (!verification.ok) {
      const status = verification.code === "invitation_expired" ? 410 : 401;
      jsonResponse(response, status, { error: "Invitation is invalid, expired, or revoked.", code: verification.code });
      return;
    }
    if (body.testingMode !== true && process.env.NODE_ENV !== "test") {
      jsonResponse(response, 403, {
        error: "Invitation accept is limited to approved testing mode in Phase 8.",
        code: "testing_mode_required",
      });
      return;
    }
    const contact = store.familyFoundation.contacts[invitation.contactId];
    if (!contact) {
      jsonResponse(response, 404, { error: "Guardian contact was not found.", code: "contact_not_found" });
      return;
    }
    const userAccountId = `user_${contact.id}`;
    contact.userAccountId = userAccountId;
    contact.invitationStatus = model.INVITATION_STATUSES.ACCEPTED;
    contact.updatedAt = model.nowIso();
    store.familyFoundation.contacts[contact.id] = contact;
    invitation.status = model.INVITATION_STATUSES.ACCEPTED;
    invitation.acceptedAt = model.nowIso();
    invitation.acceptedUserAccountId = userAccountId;
    invitation.updatedAt = invitation.acceptedAt;
    // Invalidate token after accept
    invitation.tokenHash = "";
    store.familyFoundation.invitations[invitation.id] = invitation;
    addAudit(store, invitation.organizationId, "invitation_accepted", "Invitation accepted in testing mode", "invitation", invitation.id, contact.email, "guardian");
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      invitation: publicInvitation(invitation),
      contactId: contact.id,
      userAccountId,
      familyHub: false,
      placeholderMessage: "Your account is connected. The Family Hub experience will be added in the next phase.",
    });
  }

  async function handleListFakeAccounts(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    writeStore(store);
    const accounts = listValues(store.familyFoundation.fakeAccounts).map(publicFakeAccount);
    jsonResponse(response, 200, {
      ok: true,
      organizationId: organization.id,
      label: TESTING_BANNER,
      familyHub: false,
      fakeAccounts: accounts,
      note: "Passwords are never listed. Issue or reset a temporary password through the secure admin action.",
    });
  }

  async function handleIssueFakePassword(request, response, context = {}, accountId) {
    if (rejectIfProduction(response, "fake_account_forbidden_in_production")) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const gate = actorMayManage(store, organization.id, context.adminEmail);
    if (!gate.allowed) {
      jsonResponse(response, 403, { error: "Only owners/directors may issue fake-account passwords.", code: gate.reason });
      return;
    }
    const account = store.familyFoundation.fakeAccounts[accountId]
      || listValues(store.familyFoundation.fakeAccounts).find((row) => row.id === accountId || row.email === safeLower(accountId));
    if (!account) {
      jsonResponse(response, 404, { error: "Fake account was not found.", code: "fake_account_not_found" });
      return;
    }
    if (!isFakeEmail(account.email)) {
      jsonResponse(response, 400, { error: "Only @example.invalid fake accounts may receive issued passwords.", code: "not_fake_email" });
      return;
    }
    const plaintext = tempPasswordAuth.generateTemporaryPassword();
    const passwordHash = tempPasswordAuth.hashPassword(plaintext);
    account.passwordHash = passwordHash;
    account.lastPasswordIssuedAt = model.nowIso();
    account.updatedAt = account.lastPasswordIssuedAt;
    store.familyFoundation.fakeAccounts[account.id] = account;

    store.users = store.users || {};
    const email = safeLower(account.email);
    const existing = store.users[email] || { email, plan: "Free", preview: true };
    const mainAppIdentity = model.mainAppIdentityForFakeAccount(account);
    // Do not alter administrator role — create a separate user row for the fake account.
    // Phase 23: mainAppIdentity maps this fake account onto the SAME accountType/role
    // vocabulary the main provider app (scripts/account-access.js) understands, so a real
    // password login here produces the correct Director/Solo/Teacher/Assistant/Curriculum
    // Only experience there too — not just inside the Director Center admin-preview APIs.
    store.users[email] = {
      ...existing,
      email,
      displayName: account.displayName,
      preview: true,
      testingAccount: true,
      testingLabel: TESTING_BANNER,
      fakeAccountId: account.id,
      fakeAccountKind: account.kind,
      organizationId: account.organizationId,
      role: mainAppIdentity.role,
      accountType: mainAppIdentity.accountType,
      // Guardian-kind fake accounts must land in Family Hub, never the provider app —
      // the client checks this flag right after login (see app.js loginWithServerPassword).
      familyHubGuardian: mainAppIdentity.familyHubGuardian,
      serverPasswordAuth: true,
      passwordHash,
      mustChangePassword: false,
      updatedAt: model.nowIso(),
    };
    addAudit(store, account.organizationId, "fake_password_issued", `Temporary password issued for ${account.kind}`, "fake_account", account.id, context.adminEmail, gate.role);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      fakeAccount: publicFakeAccount(account),
      temporaryPassword: plaintext,
      shownOnce: true,
      emailSent: false,
      note: "Copy this password now. It will not be shown again. Use normal password login — admin role is unchanged.",
      familyHub: false,
      label: TESTING_BANNER,
    });
  }

  async function handleResetFakeOrg(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const targetOrgId = String(body.organizationId || organization.id).trim();
    fixtures.resetPhase8Preview(store, { organizationId: targetOrgId });
    const seeded = fixtures.ensurePhase8Preview(store, { adminEmail: context.adminEmail, organizationId: targetOrgId === organization.id ? "" : targetOrgId });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      reset: true,
      organizationId: targetOrgId,
      seeded,
      otherOrganizationsPreserved: true,
      familyHub: false,
    });
  }

  async function handlePreviewAccess(request, response, context = {}, contactId) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    writeStore(store);
    const preview = previewGuardianVisibility(store, organization.id, contactId);
    if (!preview) {
      jsonResponse(response, 404, { error: "Contact was not found.", code: "contact_not_found" });
      return;
    }
    jsonResponse(response, 200, { ok: true, preview, familyHub: false });
  }

  async function handleMergeReview(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    const gate = actorMayManage(store, organization.id, context.adminEmail);
    if (!gate.allowed) {
      jsonResponse(response, 403, { error: "Only owners/directors may start merge reviews.", code: gate.reason });
      return;
    }
    const review = {
      id: model.newId("fmerge"),
      organizationId: organization.id,
      entityType: body.entityType === "household" ? "household" : "contact",
      sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds : [],
      targetId: String(body.targetId || "").trim(),
      status: "pending_review",
      notes: model.cleanLongText(body.notes || "", 2000),
      createdByEmail: safeLower(context.adminEmail),
      createdAt: model.nowIso(),
      mergedAt: "",
      // Never auto-merge — Phase 8 only queues a reviewed process.
    };
    store.familyFoundation.mergeReviews[review.id] = review;
    addAudit(store, organization.id, "merge_review_created", "Merge review queued — not applied", "merge_review", review.id, context.adminEmail, gate.role);
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      mergeReview: review,
      applied: false,
      note: "Merge requires a reviewed process. Nothing was deleted or silently merged.",
      familyHub: false,
    });
  }

  async function handleRelationshipHistory(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    writeStore(store);
    const url = request._llhUrl || null;
    const contactId = url?.searchParams?.get("contactId") || "";
    const childId = url?.searchParams?.get("childId") || "";
    let rules = listValues(store.familyFoundation.accessRules).filter((row) => row.organizationId === organization.id);
    if (contactId) rules = rules.filter((row) => row.contactId === contactId);
    if (childId) rules = rules.filter((row) => row.childId === childId);
    const audits = listValues(store.familyFoundation.audit)
      .filter((row) => row.organizationId === organization.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100);
    jsonResponse(response, 200, {
      ok: true,
      accessRules: rules,
      audit: audits,
      familyHub: false,
      note: "Ended and suspended relationships are retained — never silently deleted.",
    });
  }

  async function handleOverview(request, response, context = {}) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    const { organization } = ensureDirectorContext(store, context.adminEmail);
    writeStore(store);
    const households = listValues(store.familyFoundation.households).filter((row) => row.organizationId === organization.id);
    const contacts = listValues(store.familyFoundation.contacts).filter((row) => row.organizationId === organization.id);
    const rules = listValues(store.familyFoundation.accessRules).filter((row) => row.organizationId === organization.id);
    const children = listValues(store.childRecords).filter((row) => row.organizationId === organization.id);
    jsonResponse(response, 200, {
      ok: true,
      organizationId: organization.id,
      familyHub: false,
      familyHubForcedOff: true,
      label: TESTING_BANNER,
      accessLevels: model.ACCESS_LEVEL_LABELS,
      households: households.map((hh) => ({
        id: hh.id,
        displayName: hh.displayName,
        status: hh.status,
        childCount: listValues(store.familyFoundation.childHouseholdLinks).filter((row) => row.householdId === hh.id && row.status === "active").length,
        contactCount: listValues(store.familyFoundation.householdMemberships).filter((row) => row.householdId === hh.id && row.status === "active").length,
      })),
      contacts: contacts.map((c) => publicContact(c)),
      accessRules: rules.map((rule) => ({
        ...rule,
        accessLevelLabel: model.ACCESS_LEVEL_LABELS[rule.accessLevel] || rule.accessLevel,
        contactName: store.familyFoundation.contacts[rule.contactId]?.displayName || "",
        childName: store.childRecords?.[rule.childId]?.displayName || "",
      })),
      children: children.map((child) => ({ id: child.id, displayName: child.displayName })),
      invitations: listValues(store.familyFoundation.invitations)
        .filter((row) => row.organizationId === organization.id)
        .map(publicInvitation),
      fakeAccounts: listValues(store.familyFoundation.fakeAccounts).map(publicFakeAccount),
      duplicates: {
        contacts: detectDuplicateContacts(store, organization.id),
        households: detectDuplicateHouseholds(store, organization.id),
      },
    });
  }

  // ─── Guardian session (Family Hub OFF placeholder) ───────────────────────

  async function handleGuardianSession(request, response) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    model.ensureFamilyFoundationStore(store);
    const authHeader = getHeader(request, "authorization");
    const memberSession = tempPasswordAuth.resolveMemberSession(store, authHeader);
    const email = memberSession?.email
      || (process.env.NODE_ENV === "test" && authHeader.startsWith("Bearer test:")
        ? safeLower(authHeader.slice("Bearer test:".length))
        : "");
    if (!email) {
      jsonResponse(response, 401, { error: "Login required.", code: "login_required" });
      return;
    }
    const fakeAccount = listValues(store.familyFoundation.fakeAccounts).find((row) => safeLower(row.email) === email);
    const contact = listValues(store.familyFoundation.contacts).find((row) => safeLower(row.email) === email && row.status === "active");
    if (!contact && !fakeAccount) {
      jsonResponse(response, 404, {
        error: "No guardian contact is linked to this account.",
        code: "not_a_guardian_account",
        familyHub: false,
      });
      return;
    }
    const organizationId = contact?.organizationId || fakeAccount?.organizationId || "";
    const preview = contact ? previewGuardianVisibility(store, organizationId, contact.id) : null;
    const formCapableChildren = (preview?.children || []).filter((row) => row.wouldSeeForms);
    jsonResponse(response, 200, {
      ok: true,
      familyHub: false,
      familyHubForcedOff: true,
      label: TESTING_BANNER,
      testingAccount: Boolean(fakeAccount),
      email,
      contactId: contact?.id || fakeAccount?.contactId || "",
      permanentContactId: contact?.id || "",
      placeholderMessage: "Your account is connected. The Family Hub experience will be added in the next phase.",
      navigationHidden: true,
      unfinishedFamilyHubHidden: true,
      allowedFormChildren: formCapableChildren.map((row) => ({
        childId: row.childId,
        childDisplayName: row.childDisplayName,
        accessLevel: row.accessLevel,
      })),
      formsNote: formCapableChildren.length
        ? "Phase 6 form assignments remain available only when your access level permits forms."
        : "No form access is granted for this contact.",
      childrenPreview: preview?.children || [],
    });
  }

  async function handleGuardianChildAccessCheck(request, response) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    model.ensureFamilyFoundationStore(store);
    const authHeader = getHeader(request, "authorization");
    const memberSession = tempPasswordAuth.resolveMemberSession(store, authHeader);
    const email = memberSession?.email
      || (process.env.NODE_ENV === "test" && authHeader.startsWith("Bearer test:")
        ? safeLower(authHeader.slice("Bearer test:".length))
        : "");
    if (!email) {
      jsonResponse(response, 401, { error: "Login required.", code: "login_required" });
      return;
    }
    const contact = listValues(store.familyFoundation.contacts).find((row) => safeLower(row.email) === email);
    if (!contact) {
      jsonResponse(response, 403, { error: "Guardian contact required.", code: "not_a_guardian" });
      return;
    }
    const childId = String(body.childId || "").trim();
    const capability = String(body.capability || "forms").trim();
    // Cross-org denial: altered organizationId ignored — use contact's org.
    const result = model.evaluateContactChildAccess({
      store,
      organizationId: contact.organizationId,
      contactId: contact.id,
      childId,
      capability,
    });
    // Also deny if client tried to pass a different org
    if (body.organizationId && body.organizationId !== contact.organizationId) {
      jsonResponse(response, 403, {
        allowed: false,
        reason: "cross_organization_denied",
        familyHub: false,
      });
      return;
    }
    jsonResponse(response, result.allowed ? 200 : 403, {
      ...result,
      contactId: contact.id,
      childId,
      capability,
      familyHub: false,
    });
  }

  function matchDirectorRoute(method, pathname, url) {
    const path = String(pathname || "");
    const base = "/api/director-center/family";
    if (!path.startsWith(base)) return null;

    if (method === "GET" && path === `${base}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${base}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${base}/overview`) return (req, res, ctx) => handleOverview(req, res, ctx);
    if (method === "GET" && path === `${base}/households`) return (req, res, ctx) => handleListHouseholds(req, res, ctx);
    if (method === "POST" && path === `${base}/households`) return (req, res, ctx) => handleCreateHousehold(req, res, ctx);
    if (method === "GET" && path.startsWith(`${base}/households/`)) {
      const id = decodeURIComponent(path.slice(`${base}/households/`.length).split("/")[0]);
      return (req, res, ctx) => handleGetHousehold(req, res, ctx, id);
    }
    if (method === "POST" && path === `${base}/contacts`) return (req, res, ctx) => handleAddContact(req, res, ctx);
    if (method === "POST" && path === `${base}/access`) return (req, res, ctx) => handleSetAccess(req, res, ctx);
    if (method === "PATCH" && path.startsWith(`${base}/access/`)) {
      const id = decodeURIComponent(path.slice(`${base}/access/`.length));
      return (req, res, ctx) => handleSetAccess(req, res, ctx, id);
    }
    if (method === "POST" && path === `${base}/link-child`) return (req, res, ctx) => handleLinkChild(req, res, ctx);
    if (method === "POST" && path === `${base}/invitations`) return (req, res, ctx) => handleCreateInvitation(req, res, ctx);
    if (method === "POST" && /\/invitations\/[^/]+\/revoke$/.test(path)) {
      const id = decodeURIComponent(path.split("/invitations/")[1].split("/revoke")[0]);
      return (req, res, ctx) => handleRevokeInvitation(req, res, ctx, id);
    }
    if (method === "POST" && /\/invitations\/[^/]+\/regenerate$/.test(path)) {
      const id = decodeURIComponent(path.split("/invitations/")[1].split("/regenerate")[0]);
      return (req, res, ctx) => handleRegenerateInvitation(req, res, ctx, id);
    }
    if (method === "GET" && path === `${base}/fake-accounts`) return (req, res, ctx) => handleListFakeAccounts(req, res, ctx);
    if (method === "POST" && /\/fake-accounts\/[^/]+\/issue-password$/.test(path)) {
      const id = decodeURIComponent(path.split("/fake-accounts/")[1].split("/issue-password")[0]);
      return (req, res, ctx) => handleIssueFakePassword(req, res, ctx, id);
    }
    if (method === "POST" && path === `${base}/reset`) return (req, res, ctx) => handleResetFakeOrg(req, res, ctx);
    if (method === "GET" && path.startsWith(`${base}/preview/`)) {
      const id = decodeURIComponent(path.slice(`${base}/preview/`.length));
      return (req, res, ctx) => handlePreviewAccess(req, res, ctx, id);
    }
    if (method === "POST" && path === `${base}/merge-review`) return (req, res, ctx) => handleMergeReview(req, res, ctx);
    if (method === "GET" && path === `${base}/history`) {
      return (req, res, ctx) => {
        req._llhUrl = url;
        return handleRelationshipHistory(req, res, ctx);
      };
    }
    return null;
  }

  function matchPublicRoute(method, pathname) {
    const path = String(pathname || "");
    if (method === "POST" && path === "/api/family-foundation/invitations/accept") {
      return (req, res) => handleAcceptInvitation(req, res);
    }
    if (method === "GET" && path === "/api/family-foundation/guardian-session") {
      return (req, res) => handleGuardianSession(req, res);
    }
    if (method === "POST" && path === "/api/family-foundation/guardian-access-check") {
      return (req, res) => handleGuardianChildAccessCheck(req, res);
    }
    return null;
  }

  return {
    matchDirectorRoute,
    matchPublicRoute,
    isFakeEmail,
    rejectFakeAccountLogin(store, email, response) {
      if (!env().liveProduction) return false;
      const normalized = safeLower(email);
      if (isFakeEmail(normalized)) {
        jsonResponse(response, 403, {
          error: "Fake testing accounts cannot sign in on production.",
          code: "fake_account_forbidden_in_production",
        });
        return true;
      }
      model.ensureFamilyFoundationStore(store);
      const fake = listValues(store.familyFoundation.fakeAccounts).find((row) => safeLower(row.email) === normalized);
      if (fake) {
        jsonResponse(response, 403, {
          error: "Fake testing accounts cannot sign in on production.",
          code: "fake_account_forbidden_in_production",
        });
        return true;
      }
      return false;
    },
  };
}

module.exports = {
  createFamilyFoundationApi,
  TESTING_BANNER,
  FAKE_EMAIL_SUFFIX,
};
