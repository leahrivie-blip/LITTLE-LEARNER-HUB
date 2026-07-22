/**
 * Phase 9 Family Hub base — additive store for family-visible documents,
 * information-change requests, and notification preference structure.
 * Does not send email/SMS/push. Does not auto-approve family uploads.
 */

const crypto = require("node:crypto");
const familyModel = require("./family-foundation-data-model.js");
const foundation = require("./foundation-data-model.js");

const CHANGE_REQUEST_TYPES = Object.freeze({
  CONTACT_INFO: "contact_info",
  EMERGENCY_CONTACT: "emergency_contact",
  AUTHORIZED_PICKUP_ADD: "authorized_pickup_add",
  AUTHORIZED_PICKUP_REMOVE: "authorized_pickup_remove",
});

const CHANGE_REQUEST_STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

const DOCUMENT_STATUSES = Object.freeze({
  FAMILY_VISIBLE: "family_visible",
  UPLOAD_REQUESTED: "upload_requested",
  PENDING_REVIEW: "pending_review",
  REJECTED: "rejected",
  CORRECTION_REQUESTED: "correction_requested",
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

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureFamilyHubStore(store) {
  if (!store || typeof store !== "object") throw new Error("store is required");
  familyModel.ensureFamilyFoundationStore(store);
  foundation.ensureFoundationStore(store);
  store.familyHub = store.familyHub && typeof store.familyHub === "object" ? store.familyHub : {};
  const hub = store.familyHub;
  hub.documents = hub.documents && typeof hub.documents === "object" && !Array.isArray(hub.documents) ? hub.documents : {};
  hub.changeRequests = hub.changeRequests && typeof hub.changeRequests === "object" && !Array.isArray(hub.changeRequests) ? hub.changeRequests : {};
  hub.notificationPreferences = hub.notificationPreferences && typeof hub.notificationPreferences === "object" && !Array.isArray(hub.notificationPreferences) ? hub.notificationPreferences : {};
  hub.calendarEvents = hub.calendarEvents && typeof hub.calendarEvents === "object" && !Array.isArray(hub.calendarEvents) ? hub.calendarEvents : {};
  hub.meta = {
    ...(hub.meta && typeof hub.meta === "object" ? hub.meta : {}),
    createdAt: hub.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    noOutboundEmail: true,
    noOutboundSms: true,
    noPush: true,
    noStripe: true,
    noLiveAi: true,
    phase: 9,
    note: "Phase 9 Family Hub base. Photos/media/messaging deferred. Fake data only.",
  };
  return store;
}

function createFamilyDocumentRecord({
  id = "",
  organizationId = "",
  childId = "",
  title = "",
  category = "general",
  status = DOCUMENT_STATUSES.FAMILY_VISIBLE,
  familyVisible = true,
  receivedAt = "",
  approvedAt = "",
  expiresAt = "",
  reviewAt = "",
  uploadedByContactId = "",
  providerExplanation = "",
  downloadAuthorized = true,
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("fhdoc"),
    organizationId: cleanText(organizationId, 160),
    childId: cleanText(childId, 160),
    title: cleanText(title, 200) || "Document",
    category: cleanText(category, 80) || "general",
    status: cleanText(status, 40) || DOCUMENT_STATUSES.FAMILY_VISIBLE,
    familyVisible: familyVisible === true,
    receivedAt: receivedAt || createdAt,
    approvedAt: approvedAt || "",
    expiresAt: expiresAt || "",
    reviewAt: reviewAt || "",
    uploadedByContactId: cleanText(uploadedByContactId, 160),
    providerExplanation: cleanLongText(providerExplanation, 2000),
    downloadAuthorized: downloadAuthorized !== false,
    // Uploads never auto-approve into official records.
    officialRecord: status === DOCUMENT_STATUSES.FAMILY_VISIBLE && !uploadedByContactId,
    createdAt,
    updatedAt: createdAt,
  };
}

function createChangeRequestRecord({
  id = "",
  organizationId = "",
  contactId = "",
  childId = "",
  type = CHANGE_REQUEST_TYPES.CONTACT_INFO,
  payload = null,
  status = CHANGE_REQUEST_STATUSES.PENDING,
  createdByEmail = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("fhchg"),
    organizationId: cleanText(organizationId, 160),
    contactId: cleanText(contactId, 160),
    childId: cleanText(childId, 160),
    type: cleanText(type, 80),
    payload: payload && typeof payload === "object" ? payload : {},
    status: cleanText(status, 40) || CHANGE_REQUEST_STATUSES.PENDING,
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    reviewedAt: "",
    reviewNote: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function defaultNotificationPreferences({ contactId = "", organizationId = "" } = {}) {
  return {
    id: `fhpref_${cleanText(contactId, 80) || newId("pref")}`,
    organizationId: cleanText(organizationId, 160),
    contactId: cleanText(contactId, 160),
    // Structure only — Phase 9 never sends notifications.
    channels: {
      email: false,
      sms: false,
      push: false,
    },
    cadence: {
      immediate: false,
      dailyDigest: false,
      weeklyDigest: false,
    },
    updatedAt: nowIso(),
    note: "Notification preferences are stored for a later phase. Nothing is sent in Phase 9.",
  };
}

function createFamilyCalendarEventRecord({
  id = "",
  organizationId = "",
  classroomId = "",
  childId = "",
  title = "",
  eventType = "classroom_event",
  startsAt = "",
  endsAt = "",
  allDay = false,
  familyVisible = true,
  sharedThemeTitle = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("fhevt"),
    organizationId: cleanText(organizationId, 160),
    classroomId: cleanText(classroomId, 160),
    childId: cleanText(childId, 160),
    title: cleanText(title, 200) || "Event",
    eventType: cleanText(eventType, 60) || "classroom_event",
    startsAt: startsAt || createdAt,
    endsAt: endsAt || "",
    allDay: allDay === true,
    familyVisible: familyVisible === true,
    sharedThemeTitle: cleanText(sharedThemeTitle, 200),
    // Never expose internal staff notes.
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Resolve the Phase 8 contact for an authenticated email within an org.
 */
function findActiveContactByEmail(store, organizationId, email) {
  ensureFamilyHubStore(store);
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return listValues(store.familyFoundation.contacts).find((row) => (
    row
    && row.organizationId === organizationId
    && String(row.email || "").toLowerCase() === normalized
    && row.status === "active"
  )) || null;
}

function findContactByEmailAnyOrg(store, email) {
  ensureFamilyHubStore(store);
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return listValues(store.familyFoundation.contacts).find((row) => (
    row
    && String(row.email || "").toLowerCase() === normalized
    && row.status === "active"
  )) || null;
}

/**
 * Children this contact may digitally access (forms/limited/full levels).
 */
function permittedChildrenForContact(store, contactId) {
  ensureFamilyHubStore(store);
  const contact = store.familyFoundation.contacts[contactId];
  if (!contact) return [];
  const rules = familyModel.activeAccessRulesForContact(store, contact.organizationId, contactId);
  const out = [];
  const seen = new Set();
  rules.forEach((rule) => {
    if (!familyModel.accessRuleAllowsDigital(rule) && !familyModel.accessRuleAllowsForms(rule)) return;
    if (seen.has(rule.childId)) return;
    seen.add(rule.childId);
    const child = store.childRecords?.[rule.childId];
    out.push({
      childId: rule.childId,
      displayName: child?.displayName || "",
      accessLevel: rule.accessLevel,
      accessLevelLabel: familyModel.ACCESS_LEVEL_LABELS[rule.accessLevel] || rule.accessLevel,
      ruleId: rule.id,
      formsAllowed: familyModel.accessRuleAllowsForms(rule),
      digitalAllowed: familyModel.accessRuleAllowsDigital(rule),
    });
  });
  return out;
}

function requireChildAccess(store, contact, childId, capability = "digital") {
  if (!contact || !childId) {
    return { allowed: false, reason: "missing_context", accessLevel: "", ruleId: "" };
  }
  return familyModel.evaluateContactChildAccess({
    store,
    organizationId: contact.organizationId,
    contactId: contact.id,
    childId,
    capability,
  });
}

const RESTRICTED_UNAVAILABLE_MESSAGE = "This information is not available for your account.";

module.exports = {
  CHANGE_REQUEST_TYPES,
  CHANGE_REQUEST_STATUSES,
  DOCUMENT_STATUSES,
  RESTRICTED_UNAVAILABLE_MESSAGE,
  ensureFamilyHubStore,
  createFamilyDocumentRecord,
  createChangeRequestRecord,
  defaultNotificationPreferences,
  createFamilyCalendarEventRecord,
  findActiveContactByEmail,
  findContactByEmailAnyOrg,
  permittedChildrenForContact,
  requireChildAccess,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  listValues,
};
