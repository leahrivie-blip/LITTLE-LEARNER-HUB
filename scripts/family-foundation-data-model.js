/**
 * Phase 8 Family / Guardian / Household foundation.
 *
 * Permanent-ID relationships for households, guardians/contacts, child-specific
 * access rules, invitations, and testing-only fake accounts. Organizes
 * provider-entered access information — does not make legal custody decisions.
 *
 * Reuses existing foundation guardians + childGuardianRelationships for
 * Phase 6 form-assignment compatibility (mirrored on write).
 */

const crypto = require("node:crypto");
const foundation = require("./foundation-data-model.js");

const ACCESS_LEVELS = Object.freeze({
  FULL_VERIFIED_GUARDIAN: "full_verified_guardian",
  LIMITED_GUARDIAN: "limited_guardian",
  FORMS_ONLY: "forms_only",
  MESSAGES_ONLY: "messages_only",
  BILLING_ONLY: "billing_only",
  PICKUP_ONLY: "pickup_only",
  EMERGENCY_CONTACT_ONLY: "emergency_contact_only",
  NO_DIGITAL_ACCESS: "no_digital_access",
  TEMPORARILY_SUSPENDED: "temporarily_suspended",
  ENDED_RELATIONSHIP: "ended_relationship",
});

const ACCESS_LEVEL_LABELS = Object.freeze({
  [ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN]: "Full verified guardian",
  [ACCESS_LEVELS.LIMITED_GUARDIAN]: "Limited guardian",
  [ACCESS_LEVELS.FORMS_ONLY]: "Forms only",
  [ACCESS_LEVELS.MESSAGES_ONLY]: "Messages only",
  [ACCESS_LEVELS.BILLING_ONLY]: "Billing only (foundation)",
  [ACCESS_LEVELS.PICKUP_ONLY]: "Pickup only",
  [ACCESS_LEVELS.EMERGENCY_CONTACT_ONLY]: "Emergency contact only",
  [ACCESS_LEVELS.NO_DIGITAL_ACCESS]: "No digital access",
  [ACCESS_LEVELS.TEMPORARILY_SUSPENDED]: "Temporarily suspended",
  [ACCESS_LEVELS.ENDED_RELATIONSHIP]: "Ended relationship",
});

const DIGITAL_ACCESS_LEVELS = new Set([
  ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
  ACCESS_LEVELS.LIMITED_GUARDIAN,
  ACCESS_LEVELS.FORMS_ONLY,
  ACCESS_LEVELS.MESSAGES_ONLY,
  ACCESS_LEVELS.BILLING_ONLY,
]);

const FORMS_ACCESS_LEVELS = new Set([
  ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
  ACCESS_LEVELS.LIMITED_GUARDIAN,
  ACCESS_LEVELS.FORMS_ONLY,
]);

const INVITATION_STATUSES = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  REVOKED: "revoked",
  EXPIRED: "expired",
});

const FAKE_ACCOUNT_KINDS = Object.freeze({
  OWNER: "owner",
  DIRECTOR: "director",
  LEAD_TEACHER: "lead_teacher",
  ASSISTANT_BROAD: "assistant_broad",
  ASSISTANT_LIMITED: "assistant_limited",
  PARENT_ONE_CHILD: "parent_one_child",
  PARENT_MULTI_CHILD: "parent_multi_child",
  GUARDIAN_SHARED_HOUSEHOLDS: "guardian_shared_households",
  RESTRICTED_GUARDIAN: "restricted_guardian",
  PICKUP_ONLY: "pickup_only",
  CURRICULUM_ONLY: "curriculum_only",
  HOME_DAYCARE: "home_daycare",
  SMALL_CENTER: "small_center",
  GROWING_CENTER: "growing_center",
  LARGE_CENTER: "large_center",
  FOUNDING_MEMBER: "founding_member",
});

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanLongText(value, max = 5000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function normalizeAccessLevel(value) {
  const key = cleanText(value, 80).toLowerCase();
  return Object.values(ACCESS_LEVELS).includes(key) ? key : ACCESS_LEVELS.NO_DIGITAL_ACCESS;
}

function ensureFamilyFoundationStore(store) {
  if (!store || typeof store !== "object") throw new Error("store is required");
  foundation.ensureFoundationStore(store);
  store.familyFoundation = store.familyFoundation && typeof store.familyFoundation === "object" ? store.familyFoundation : {};
  const ff = store.familyFoundation;
  ff.households = ff.households && typeof ff.households === "object" && !Array.isArray(ff.households) ? ff.households : {};
  ff.contacts = ff.contacts && typeof ff.contacts === "object" && !Array.isArray(ff.contacts) ? ff.contacts : {};
  ff.householdMemberships = ff.householdMemberships && typeof ff.householdMemberships === "object" && !Array.isArray(ff.householdMemberships) ? ff.householdMemberships : {};
  ff.childHouseholdLinks = ff.childHouseholdLinks && typeof ff.childHouseholdLinks === "object" && !Array.isArray(ff.childHouseholdLinks) ? ff.childHouseholdLinks : {};
  ff.accessRules = ff.accessRules && typeof ff.accessRules === "object" && !Array.isArray(ff.accessRules) ? ff.accessRules : {};
  ff.invitations = ff.invitations && typeof ff.invitations === "object" && !Array.isArray(ff.invitations) ? ff.invitations : {};
  ff.fakeAccounts = ff.fakeAccounts && typeof ff.fakeAccounts === "object" && !Array.isArray(ff.fakeAccounts) ? ff.fakeAccounts : {};
  ff.audit = ff.audit && typeof ff.audit === "object" && !Array.isArray(ff.audit) ? ff.audit : {};
  ff.mergeReviews = ff.mergeReviews && typeof ff.mergeReviews === "object" && !Array.isArray(ff.mergeReviews) ? ff.mergeReviews : {};
  ff.meta = {
    ...(ff.meta && typeof ff.meta === "object" ? ff.meta : {}),
    createdAt: ff.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    familyHubOff: true,
    noOutboundEmail: true,
    noOutboundSms: true,
    noStripe: true,
    noLiveAi: true,
    note: "Phase 8 family/guardian/household foundation. Family Hub remains OFF. Fake accounts are testing-only.",
  };
  return store;
}

function createHouseholdRecord({
  id = "",
  organizationId = "",
  displayName = "",
  notes = "",
  status = "active",
  createdByEmail = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("hh"),
    organizationId: cleanText(organizationId, 160),
    displayName: cleanText(displayName, 180) || "Household",
    notes: cleanLongText(notes, 2000),
    status: cleanText(status, 40) || "active",
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt,
    updatedAt: createdAt,
    endedAt: "",
  };
}

/**
 * Enhanced guardian/contact record. Links to foundation guardian via
 * foundationGuardianId for Phase 6 form-assignment compatibility.
 */
function createContactRecord({
  id = "",
  organizationId = "",
  foundationGuardianId = "",
  displayName = "",
  email = "",
  phone = "",
  relationshipDefault = "parent",
  userAccountId = "",
  status = "active",
  invitationStatus = "",
  internalNotes = "",
  restrictedNotes = "",
  createdByEmail = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("fcontact"),
    organizationId: cleanText(organizationId, 160),
    foundationGuardianId: cleanText(foundationGuardianId, 160),
    displayName: cleanText(displayName, 180) || "Contact",
    email: cleanText(email, 180).toLowerCase(),
    phone: cleanText(phone, 60),
    relationshipDefault: cleanText(relationshipDefault, 80) || "parent",
    userAccountId: cleanText(userAccountId, 160),
    status: cleanText(status, 40) || "active",
    invitationStatus: cleanText(invitationStatus, 40),
    internalNotes: cleanLongText(internalNotes, 2000),
    restrictedNotes: cleanLongText(restrictedNotes, 2000),
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt,
    updatedAt: createdAt,
  };
}

function createHouseholdMembershipRecord({
  id = "",
  organizationId = "",
  householdId = "",
  contactId = "",
  roleInHousehold = "guardian",
  status = "active",
  startsAt = "",
  endsAt = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("hhm"),
    organizationId: cleanText(organizationId, 160),
    householdId: cleanText(householdId, 160),
    contactId: cleanText(contactId, 160),
    roleInHousehold: cleanText(roleInHousehold, 80) || "guardian",
    status: cleanText(status, 40) || "active",
    startsAt: startsAt || createdAt,
    endsAt: endsAt || "",
    createdAt,
    updatedAt: createdAt,
  };
}

function createChildHouseholdLinkRecord({
  id = "",
  organizationId = "",
  householdId = "",
  childId = "",
  status = "active",
  startsAt = "",
  endsAt = "",
  sharedCustodyNote = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("chl"),
    organizationId: cleanText(organizationId, 160),
    householdId: cleanText(householdId, 160),
    childId: cleanText(childId, 160),
    status: cleanText(status, 40) || "active",
    startsAt: startsAt || createdAt,
    endsAt: endsAt || "",
    sharedCustodyNote: cleanLongText(sharedCustodyNote, 1000),
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Child-specific access rule for one contact. One contact may have different
 * permissions for different children.
 */
function createAccessRuleRecord({
  id = "",
  organizationId = "",
  contactId = "",
  childId = "",
  householdId = "",
  accessLevel = ACCESS_LEVELS.NO_DIGITAL_ACCESS,
  relationshipLabel = "parent",
  isEmergencyContact = false,
  isAuthorizedPickup = false,
  isFinanciallyResponsible = false,
  isLegalGuardianAsEntered = false,
  verificationStatus = "unverified",
  startsAt = "",
  endsAt = "",
  status = "active",
  createdByEmail = "",
} = {}) {
  const createdAt = nowIso();
  const level = normalizeAccessLevel(accessLevel);
  return {
    id: id || newId("far"),
    organizationId: cleanText(organizationId, 160),
    contactId: cleanText(contactId, 160),
    childId: cleanText(childId, 160),
    householdId: cleanText(householdId, 160),
    accessLevel: level,
    relationshipLabel: cleanText(relationshipLabel, 80) || "parent",
    isEmergencyContact: isEmergencyContact === true,
    isAuthorizedPickup: isAuthorizedPickup === true,
    isFinanciallyResponsible: isFinanciallyResponsible === true,
    isLegalGuardianAsEntered: isLegalGuardianAsEntered === true,
    verificationStatus: cleanText(verificationStatus, 40) || "unverified",
    startsAt: startsAt || createdAt,
    endsAt: endsAt || "",
    status: cleanText(status, 40) || "active",
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt,
    updatedAt: createdAt,
    // History is preserved — ending access sets endsAt/status, never deletes.
    previousAccessLevel: "",
    endedReason: "",
  };
}

function createInvitationRecord({
  id = "",
  organizationId = "",
  contactId = "",
  childIds = [],
  accessRuleIds = [],
  tokenHash = "",
  expiresAt = "",
  status = INVITATION_STATUSES.PENDING,
  createdByEmail = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("finv"),
    organizationId: cleanText(organizationId, 160),
    contactId: cleanText(contactId, 160),
    childIds: Array.isArray(childIds) ? childIds.map((idValue) => cleanText(idValue, 160)).filter(Boolean) : [],
    accessRuleIds: Array.isArray(accessRuleIds) ? accessRuleIds.map((idValue) => cleanText(idValue, 160)).filter(Boolean) : [],
    tokenHash: cleanText(tokenHash, 128),
    expiresAt: expiresAt || "",
    status: cleanText(status, 40) || INVITATION_STATUSES.PENDING,
    acceptedAt: "",
    acceptedUserAccountId: "",
    revokedAt: "",
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Testing-only fake account. Password hashes only — never store plaintext
 * reusable passwords. Production must reject create/login for these.
 */
function createFakeAccountRecord({
  id = "",
  organizationId = "",
  kind = "",
  email = "",
  displayName = "",
  role = "",
  planKey = "",
  contactId = "",
  staffMembershipId = "",
  passwordHash = "",
  label = "Testing Account — Fake Data Only.",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("fakeacct"),
    organizationId: cleanText(organizationId, 160),
    kind: cleanText(kind, 80),
    email: cleanText(email, 180).toLowerCase(),
    displayName: cleanText(displayName, 180),
    role: cleanText(role, 80),
    planKey: cleanText(planKey, 80),
    contactId: cleanText(contactId, 160),
    staffMembershipId: cleanText(staffMembershipId, 160),
    passwordHash: cleanText(passwordHash, 128),
    mustChangePassword: false,
    label: cleanText(label, 120) || "Testing Account — Fake Data Only.",
    testingOnly: true,
    active: true,
    lastPasswordIssuedAt: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function createFamilyAuditRecord({
  id = "",
  organizationId = "",
  action = "",
  actorEmail = "",
  actorRole = "",
  message = "",
  entityType = "",
  entityId = "",
  changes = null,
} = {}) {
  return {
    id: id || newId("ffaudit"),
    organizationId: cleanText(organizationId, 160),
    action: cleanText(action, 80),
    actorEmail: cleanText(actorEmail, 180).toLowerCase(),
    actorRole: cleanText(actorRole, 80),
    message: cleanLongText(message, 1000),
    entityType: cleanText(entityType, 60),
    entityId: cleanText(entityId, 160),
    changes: changes && typeof changes === "object" ? changes : {},
    createdAt: nowIso(),
  };
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function activeAccessRulesForContact(store, organizationId, contactId) {
  ensureFamilyFoundationStore(store);
  const now = Date.now();
  return listValues(store.familyFoundation.accessRules).filter((rule) => {
    if (!rule || rule.organizationId !== organizationId || rule.contactId !== contactId) return false;
    if (rule.status !== "active") return false;
    if (rule.accessLevel === ACCESS_LEVELS.ENDED_RELATIONSHIP || rule.accessLevel === ACCESS_LEVELS.TEMPORARILY_SUSPENDED) return false;
    if (rule.endsAt) {
      const ends = new Date(rule.endsAt).getTime();
      if (Number.isFinite(ends) && ends <= now) return false;
    }
    return true;
  });
}

function accessRuleAllowsForms(rule) {
  if (!rule) return false;
  return FORMS_ACCESS_LEVELS.has(rule.accessLevel);
}

function accessRuleAllowsDigital(rule) {
  if (!rule) return false;
  return DIGITAL_ACCESS_LEVELS.has(rule.accessLevel);
}

/**
 * Evaluate whether a contact may perform a family action for a specific child.
 * Server-side authority for guardian/child scope.
 */
function evaluateContactChildAccess({
  store,
  organizationId,
  contactId,
  childId,
  capability = "forms", // forms | messages | billing | digital | pickup | emergency
} = {}) {
  ensureFamilyFoundationStore(store);
  const result = { allowed: false, reason: "no_access_rule", accessLevel: "", ruleId: "" };
  const rules = activeAccessRulesForContact(store, organizationId, contactId)
    .filter((rule) => !childId || rule.childId === childId);
  if (!rules.length) {
    result.reason = "no_active_access_rule";
    return result;
  }
  const rule = rules[0];
  result.accessLevel = rule.accessLevel;
  result.ruleId = rule.id;

  if (rule.accessLevel === ACCESS_LEVELS.TEMPORARILY_SUSPENDED) {
    result.reason = "access_suspended";
    return result;
  }
  if (rule.accessLevel === ACCESS_LEVELS.ENDED_RELATIONSHIP || rule.accessLevel === ACCESS_LEVELS.NO_DIGITAL_ACCESS) {
    result.reason = "no_digital_access";
    return result;
  }

  if (capability === "forms" && !accessRuleAllowsForms(rule)) {
    result.reason = "forms_access_denied";
    return result;
  }
  if (capability === "messages" && !(rule.accessLevel === ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN || rule.accessLevel === ACCESS_LEVELS.LIMITED_GUARDIAN || rule.accessLevel === ACCESS_LEVELS.MESSAGES_ONLY)) {
    result.reason = "messages_access_denied";
    return result;
  }
  if (capability === "billing" && !(rule.accessLevel === ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN || rule.accessLevel === ACCESS_LEVELS.BILLING_ONLY)) {
    result.reason = "billing_access_denied";
    return result;
  }
  if (capability === "pickup" && !rule.isAuthorizedPickup && rule.accessLevel !== ACCESS_LEVELS.PICKUP_ONLY && rule.accessLevel !== ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN) {
    result.reason = "pickup_access_denied";
    return result;
  }
  if (capability === "emergency" && !rule.isEmergencyContact && rule.accessLevel !== ACCESS_LEVELS.EMERGENCY_CONTACT_ONLY && rule.accessLevel !== ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN) {
    result.reason = "emergency_access_denied";
    return result;
  }
  if (capability === "digital" && !accessRuleAllowsDigital(rule)) {
    result.reason = "no_digital_access";
    return result;
  }

  result.allowed = true;
  result.reason = "ok";
  return result;
}

/**
 * Mirror a contact + access rule into foundation guardians / relationships so
 * Phase 6 form assignment (verified guardians) keeps working.
 */
function syncFoundationGuardian(store, contact, accessRule) {
  foundation.ensureFoundationStore(store);
  let guardian = contact.foundationGuardianId ? store.guardians[contact.foundationGuardianId] : null;
  if (!guardian && contact.email) {
    guardian = listValues(store.guardians).find((row) => String(row.email || "").toLowerCase() === contact.email) || null;
  }
  if (!guardian) {
    guardian = foundation.createGuardianRecord({
      email: contact.email,
      displayName: contact.displayName,
      status: foundation.ASSIGNMENT_STATUS.ACTIVE,
    });
    store.guardians[guardian.id] = guardian;
  } else {
    guardian.displayName = contact.displayName || guardian.displayName;
    guardian.email = contact.email || guardian.email;
    guardian.updatedAt = nowIso();
    store.guardians[guardian.id] = guardian;
  }
  contact.foundationGuardianId = guardian.id;

  if (accessRule && accessRule.childId) {
    const existing = listValues(store.childGuardianRelationships).find((row) => (
      row.organizationId === contact.organizationId
      && row.childId === accessRule.childId
      && row.guardianId === guardian.id
      && row.status === foundation.ASSIGNMENT_STATUS.ACTIVE
    ));
    const verified = accessRule.verificationStatus === "verified"
      || accessRule.accessLevel === ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN;
    if (existing) {
      existing.verified = verified;
      existing.verifiedAt = verified ? (existing.verifiedAt || nowIso()) : "";
      existing.relationshipLabel = accessRule.relationshipLabel || existing.relationshipLabel;
      existing.updatedAt = nowIso();
      if (accessRule.accessLevel === ACCESS_LEVELS.ENDED_RELATIONSHIP) {
        existing.status = foundation.ASSIGNMENT_STATUS.HISTORICAL;
      }
      store.childGuardianRelationships[existing.id] = existing;
    } else if (accessRule.accessLevel !== ACCESS_LEVELS.ENDED_RELATIONSHIP) {
      const relationship = foundation.createChildGuardianRelationshipRecord({
        organizationId: contact.organizationId,
        childId: accessRule.childId,
        guardianId: guardian.id,
        relationshipLabel: accessRule.relationshipLabel || "parent",
        verified,
        status: foundation.ASSIGNMENT_STATUS.ACTIVE,
      });
      store.childGuardianRelationships[relationship.id] = relationship;
    }
  }
  return guardian;
}

function endAccessRule(rule, { reason = "", actorEmail = "" } = {}) {
  const previous = rule.accessLevel;
  rule.previousAccessLevel = previous;
  rule.accessLevel = ACCESS_LEVELS.ENDED_RELATIONSHIP;
  rule.status = "ended";
  rule.endsAt = nowIso();
  rule.endedReason = cleanText(reason, 400);
  rule.updatedAt = rule.endsAt;
  rule.updatedByEmail = cleanText(actorEmail, 180).toLowerCase();
  return rule;
}

function suspendAccessRule(rule, { reason = "", actorEmail = "" } = {}) {
  if (!rule.previousAccessLevel) rule.previousAccessLevel = rule.accessLevel;
  rule.accessLevel = ACCESS_LEVELS.TEMPORARILY_SUSPENDED;
  rule.updatedAt = nowIso();
  rule.endedReason = cleanText(reason, 400);
  rule.updatedByEmail = cleanText(actorEmail, 180).toLowerCase();
  return rule;
}

function restoreAccessRule(rule, { actorEmail = "" } = {}) {
  if (rule.accessLevel === ACCESS_LEVELS.TEMPORARILY_SUSPENDED && rule.previousAccessLevel) {
    rule.accessLevel = normalizeAccessLevel(rule.previousAccessLevel);
  }
  rule.status = "active";
  rule.endsAt = "";
  rule.endedReason = "";
  rule.updatedAt = nowIso();
  rule.updatedByEmail = cleanText(actorEmail, 180).toLowerCase();
  return rule;
}

module.exports = {
  ACCESS_LEVELS,
  ACCESS_LEVEL_LABELS,
  DIGITAL_ACCESS_LEVELS,
  FORMS_ACCESS_LEVELS,
  INVITATION_STATUSES,
  FAKE_ACCOUNT_KINDS,
  ensureFamilyFoundationStore,
  createHouseholdRecord,
  createContactRecord,
  createHouseholdMembershipRecord,
  createChildHouseholdLinkRecord,
  createAccessRuleRecord,
  createInvitationRecord,
  createFakeAccountRecord,
  createFamilyAuditRecord,
  activeAccessRulesForContact,
  accessRuleAllowsForms,
  accessRuleAllowsDigital,
  evaluateContactChildAccess,
  syncFoundationGuardian,
  endAccessRule,
  suspendAccessRule,
  restoreAccessRule,
  normalizeAccessLevel,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  listValues,
};
