/**
 * Home Daycare Pilot — one connected, isolated fake organization where an
 * External Tester Sandbox account (see scripts/external-tester-sandbox-data-model.js)
 * can, as Solo Home Daycare Provider, add fake children and guardians, link
 * them with real access-rule permissions, and post updates/messages/forms/
 * billing — then switch to Parent/Guardian and see the SAME linked records,
 * never disconnected per-view fake data.
 *
 * Reuses the existing Phase 8 foundation primitives (children, contacts,
 * households, access rules — the same structures family-hub-api.js already
 * understands for guardian permission checks) so the External Tester
 * Sandbox's Parent/Guardian shadow-contact mechanism keeps working
 * unmodified. Adds four NEW, deliberately simple, self-contained record
 * types (updates, messages, forms, billing) rather than wiring into the
 * much larger admin-only Director Center subsystems
 * (family-updates/family-messaging/forms-center/billing-simulator) — those
 * remain completely untouched, curated/hidden for this pilot, ready to be
 * used for real later, exactly as requested.
 *
 * Every function here is a pure data-model function (no auth, no HTTP) —
 * server/home-daycare-pilot-api.js is the only caller and is solely
 * responsible for resolving WHO is asking and which organizationId they
 * may touch.
 */

const crypto = require("node:crypto");
const foundation = require("./foundation-data-model.js");
const familyModel = require("./family-foundation-data-model.js");

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensurePilotStore(store) {
  foundation.ensureFoundationStore(store);
  familyModel.ensureFamilyFoundationStore(store);
  store.homeDaycarePilot = store.homeDaycarePilot && typeof store.homeDaycarePilot === "object"
    ? store.homeDaycarePilot
    : {};
  const p = store.homeDaycarePilot;
  p.updates = p.updates && typeof p.updates === "object" ? p.updates : {};
  p.messages = p.messages && typeof p.messages === "object" ? p.messages : {};
  p.forms = p.forms && typeof p.forms === "object" ? p.forms : {};
  p.billing = p.billing && typeof p.billing === "object" ? p.billing : {};
  p.photos = p.photos && typeof p.photos === "object" ? p.photos : {};
  return p;
}

// ---- Children -------------------------------------------------------------

function addChild(store, { organizationId, displayName }) {
  ensurePilotStore(store);
  const child = foundation.createChildRecord({ organizationId, displayName: cleanText(displayName, 120) || "Fake Child" });
  store.childRecords[child.id] = child;
  return child;
}

function listChildren(store, organizationId) {
  ensurePilotStore(store);
  return listValues(store.childRecords)
    .filter((c) => c && c.organizationId === organizationId && c.status !== "removed")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// ---- Guardians + links + permissions --------------------------------------

/** One guardian, linked to one or more children in the SAME org, each with its own access level. */
function addGuardian(store, {
  organizationId, displayName, email = "", relationshipLabel = "parent",
  childIds = [], accessLevel = familyModel.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
  isFinanciallyResponsible = false, isAuthorizedPickup = true, isEmergencyContact = false,
  createdByEmail = "",
}) {
  ensurePilotStore(store);
  const household = familyModel.createHouseholdRecord({ organizationId, displayName: `${cleanText(displayName, 80) || "Guardian"} household`, createdByEmail });
  store.familyFoundation.households[household.id] = household;
  const contact = familyModel.createContactRecord({
    organizationId, displayName: cleanText(displayName, 120) || "Fake Guardian", email: cleanText(email, 160), relationshipDefault: relationshipLabel, createdByEmail,
  });
  store.familyFoundation.contacts[contact.id] = contact;
  const membership = familyModel.createHouseholdMembershipRecord({ organizationId, householdId: household.id, contactId: contact.id, roleInHousehold: "guardian" });
  store.familyFoundation.householdMemberships[membership.id] = membership;

  const cleanChildIds = (Array.isArray(childIds) ? childIds : [childIds]).map((c) => cleanText(c, 160)).filter(Boolean);
  const rules = cleanChildIds.map((childId) => {
    const rule = familyModel.createAccessRuleRecord({
      organizationId, contactId: contact.id, childId, householdId: household.id,
      accessLevel, relationshipLabel, isFinanciallyResponsible, isAuthorizedPickup, isEmergencyContact,
      verificationStatus: "verified", createdByEmail,
    });
    store.familyFoundation.accessRules[rule.id] = rule;
    return rule;
  });
  return { contact, household, membership, rules };
}

function listGuardians(store, organizationId) {
  ensurePilotStore(store);
  const contacts = listValues(store.familyFoundation.contacts).filter((c) => c && c.organizationId === organizationId);
  return contacts.map((contact) => {
    const rules = familyModel.activeAccessRulesForContact(store, organizationId, contact.id);
    const links = rules.map((rule) => ({
      ruleId: rule.id,
      childId: rule.childId,
      childName: store.childRecords?.[rule.childId]?.displayName || "(removed child)",
      accessLevel: rule.accessLevel,
      accessLevelLabel: familyModel.ACCESS_LEVEL_LABELS[rule.accessLevel] || rule.accessLevel,
      relationshipLabel: rule.relationshipLabel,
      isFinanciallyResponsible: rule.isFinanciallyResponsible,
      isAuthorizedPickup: rule.isAuthorizedPickup,
      isEmergencyContact: rule.isEmergencyContact,
    }));
    return { id: contact.id, displayName: contact.displayName, email: contact.email, links };
  });
}

function updateGuardianAccess(store, { contactId, childId, accessLevel, isFinanciallyResponsible, isAuthorizedPickup, isEmergencyContact }) {
  ensurePilotStore(store);
  const rule = listValues(store.familyFoundation.accessRules).find((r) => r.contactId === contactId && r.childId === childId && r.status === "active");
  if (!rule) return null;
  if (accessLevel) rule.accessLevel = familyModel.normalizeAccessLevel(accessLevel);
  if (typeof isFinanciallyResponsible === "boolean") rule.isFinanciallyResponsible = isFinanciallyResponsible;
  if (typeof isAuthorizedPickup === "boolean") rule.isAuthorizedPickup = isAuthorizedPickup;
  if (typeof isEmergencyContact === "boolean") rule.isEmergencyContact = isEmergencyContact;
  rule.updatedAt = nowIso();
  store.familyFoundation.accessRules[rule.id] = rule;
  return rule;
}

/** Every contact in the org with at least one active, digital-access rule — the "which family would you like to preview" candidate list. */
function listGuardianPreviewOptions(store, organizationId) {
  ensurePilotStore(store);
  const contacts = listValues(store.familyFoundation.contacts).filter((c) => c && c.organizationId === organizationId);
  const options = [];
  for (const contact of contacts) {
    const rules = familyModel.activeAccessRulesForContact(store, organizationId, contact.id).filter(familyModel.accessRuleAllowsDigital);
    if (!rules.length) continue;
    options.push({
      contactId: contact.id,
      displayName: contact.displayName,
      children: rules.map((r) => ({ childId: r.childId, childName: store.childRecords?.[r.childId]?.displayName || "Child", accessLevel: r.accessLevel })),
    });
  }
  return options;
}

// ---- Family updates (provider -> family) -----------------------------------

function addUpdate(store, { organizationId, childId, title, message, createdByEmail = "" }) {
  const p = ensurePilotStore(store);
  const record = {
    id: newId("pilotupdate"),
    organizationId: cleanText(organizationId, 160),
    childId: cleanText(childId, 160),
    title: cleanText(title, 160) || "Update",
    message: cleanText(message, 4000),
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt: nowIso(),
  };
  p.updates[record.id] = record;
  return record;
}

function listUpdates(store, organizationId, childId = "") {
  ensurePilotStore(store);
  return listValues(store.homeDaycarePilot.updates)
    .filter((u) => u.organizationId === organizationId && (!childId || u.childId === childId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ---- Messages (provider <-> parent, one thread per child) ------------------

function addMessage(store, { organizationId, childId, senderRole, senderEmail = "", body }) {
  const p = ensurePilotStore(store);
  const record = {
    id: newId("pilotmsg"),
    organizationId: cleanText(organizationId, 160),
    childId: cleanText(childId, 160),
    senderRole: senderRole === "parent" ? "parent" : "provider",
    senderEmail: cleanText(senderEmail, 180).toLowerCase(),
    body: cleanText(body, 4000),
    createdAt: nowIso(),
    readByProvider: senderRole !== "parent",
    readByParent: senderRole === "parent",
  };
  p.messages[record.id] = record;
  return record;
}

function listMessages(store, organizationId, childId = "") {
  ensurePilotStore(store);
  return listValues(store.homeDaycarePilot.messages)
    .filter((m) => m.organizationId === organizationId && (!childId || m.childId === childId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function markMessagesRead(store, { organizationId, childId, readerRole }) {
  ensurePilotStore(store);
  const rows = listMessages(store, organizationId, childId);
  rows.forEach((m) => {
    if (readerRole === "parent") m.readByParent = true;
    else m.readByProvider = true;
    store.homeDaycarePilot.messages[m.id] = m;
  });
  return rows.length;
}

// ---- Forms (simple assignment + status, no template machinery) ------------

const FORM_STATUSES = Object.freeze({ NEEDS_ACTION: "needs_action", COMPLETE: "complete" });

function addForm(store, { organizationId, childId, title, status = FORM_STATUSES.NEEDS_ACTION, createdByEmail = "" }) {
  const p = ensurePilotStore(store);
  const record = {
    id: newId("pilotform"),
    organizationId: cleanText(organizationId, 160),
    childId: cleanText(childId, 160),
    title: cleanText(title, 160) || "Form",
    status: status === FORM_STATUSES.COMPLETE ? FORM_STATUSES.COMPLETE : FORM_STATUSES.NEEDS_ACTION,
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  p.forms[record.id] = record;
  return record;
}

function listForms(store, organizationId, childId = "") {
  ensurePilotStore(store);
  return listValues(store.homeDaycarePilot.forms)
    .filter((f) => f.organizationId === organizationId && (!childId || f.childId === childId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateFormStatus(store, { formId, status }) {
  ensurePilotStore(store);
  const form = store.homeDaycarePilot.forms[formId];
  if (!form) return null;
  form.status = status === FORM_STATUSES.COMPLETE ? FORM_STATUSES.COMPLETE : FORM_STATUSES.NEEDS_ACTION;
  form.updatedAt = nowIso();
  store.homeDaycarePilot.forms[formId] = form;
  return form;
}

// ---- Billing (simple fake tuition records) ---------------------------------

const BILLING_STATUSES = Object.freeze({ DUE: "due", PAID: "paid", OVERDUE: "overdue" });

function addBillingRecord(store, { organizationId, childId, description, amountCents, dueDate, status = BILLING_STATUSES.DUE, createdByEmail = "" }) {
  const p = ensurePilotStore(store);
  const record = {
    id: newId("pilotbill"),
    organizationId: cleanText(organizationId, 160),
    childId: cleanText(childId, 160),
    description: cleanText(description, 200) || "Tuition",
    amountCents: Number.isFinite(Number(amountCents)) ? Math.max(0, Math.round(Number(amountCents))) : 0,
    dueDate: cleanText(dueDate, 40),
    status: Object.values(BILLING_STATUSES).includes(status) ? status : BILLING_STATUSES.DUE,
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt: nowIso(),
    testingOnly: true,
    noRealPaymentProcessed: true,
  };
  p.billing[record.id] = record;
  return record;
}

function listBilling(store, organizationId, childId = "") {
  ensurePilotStore(store);
  return listValues(store.homeDaycarePilot.billing)
    .filter((b) => b.organizationId === organizationId && (!childId || b.childId === childId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ---- Shared photos (Photo Safety bridge from the fast Daily Logs UI) ------
//
// Organization- and child-scoped, exactly like every other pilot record.
// `sharedWithFamily` defaults true on creation but can be toggled off
// ("Unshare") WITHOUT deleting the provider's original record — the photo
// stays in the provider's own list either way; only the Parent Home
// visibility changes.

function addSharedPhoto(store, { organizationId, childId, caption = "", dataUrl = "", createdByEmail = "" }) {
  const p = ensurePilotStore(store);
  p.photos = p.photos && typeof p.photos === "object" ? p.photos : {};
  const record = {
    id: newId("pilotphoto"),
    organizationId: cleanText(organizationId, 160),
    childId: cleanText(childId, 160),
    caption: cleanText(caption, 300),
    // A data: URL only — never a public URL; nothing here is ever served
    // from a publicly reachable path.
    dataUrl: String(dataUrl || "").startsWith("data:") ? dataUrl.slice(0, 2_000_000) : "",
    sharedWithFamily: true,
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt: nowIso(),
    testingOnly: true,
  };
  p.photos[record.id] = record;
  return record;
}

function listSharedPhotos(store, organizationId, childId = "") {
  ensurePilotStore(store);
  return listValues(store.homeDaycarePilot.photos || {})
    .filter((p) => p.organizationId === organizationId && (!childId || p.childId === childId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function setSharedPhotoVisibility(store, { photoId, sharedWithFamily }) {
  ensurePilotStore(store);
  const photo = store.homeDaycarePilot.photos?.[photoId];
  if (!photo) return null;
  photo.sharedWithFamily = sharedWithFamily === true;
  store.homeDaycarePilot.photos[photoId] = photo;
  return photo;
}

// ---- Aggregated Parent Home ------------------------------------------------

/** Everything Parent Home should surface, scoped to ONE guardian contact's permitted child(ren). Never returns another child's data. */
function parentHomeSnapshot(store, { organizationId, contactId }) {
  ensurePilotStore(store);
  const rules = familyModel.activeAccessRulesForContact(store, organizationId, contactId).filter(familyModel.accessRuleAllowsDigital);
  const children = rules.map((rule) => {
    const childId = rule.childId;
    const child = store.childRecords?.[childId];
    const updates = listUpdates(store, organizationId, childId);
    const forms = listForms(store, organizationId, childId).filter((f) => f.status === FORM_STATUSES.NEEDS_ACTION);
    const messages = listMessages(store, organizationId, childId);
    const unreadMessages = messages.filter((m) => !m.readByParent).length;
    const billing = rule.isFinanciallyResponsible ? listBilling(store, organizationId, childId).filter((b) => b.status !== BILLING_STATUSES.PAID) : [];
    const sharedPhotos = listSharedPhotos(store, organizationId, childId).filter((p) => p.sharedWithFamily !== false);
    return {
      childId,
      childName: child?.displayName || "Child",
      accessLevel: rule.accessLevel,
      isFinanciallyResponsible: rule.isFinanciallyResponsible,
      todaysUpdate: updates[0] || null,
      formsNeedingAction: forms,
      unreadMessageCount: unreadMessages,
      billingReminders: billing,
      sharedPhotos,
    };
  });
  return { children };
}

// ---- Reset (org-scoped, preserves feedback/audit) --------------------------

/** Clears ONLY this org's pilot data (children, contacts, households, access rules, updates, messages, forms, billing) — never touches testing feedback threads or the audit trail, which are explicitly preserved. */
function resetPilotData(store, organizationId) {
  ensurePilotStore(store);
  let cleared = 0;
  const clearMap = (map, orgField = "organizationId") => {
    Object.keys(map).forEach((key) => {
      if (map[key]?.[orgField] === organizationId) { delete map[key]; cleared += 1; }
    });
  };
  clearMap(store.childRecords);
  clearMap(store.familyFoundation.contacts);
  clearMap(store.familyFoundation.households);
  clearMap(store.familyFoundation.householdMemberships);
  clearMap(store.familyFoundation.accessRules);
  clearMap(store.homeDaycarePilot.updates);
  clearMap(store.homeDaycarePilot.messages);
  clearMap(store.homeDaycarePilot.forms);
  clearMap(store.homeDaycarePilot.billing);
  clearMap(store.homeDaycarePilot.photos);
  return { cleared };
}

// ---- Fake data generation (for the "Add External Tester" wizard) ----------

const FAKE_CHILD_NAMES = ["Ava Lin", "Ben Rivera", "Carlos Diaz", "Dana Cole", "Elena Cho", "Finn Walsh", "Grace Kim", "Hana Patel"];
const FAKE_GUARDIAN_NAMES = ["Priya Lin", "Frank Cole", "Sam Rivera", "Jordan Diaz", "Maya Cho", "Owen Walsh"];

function generateFakeChildrenAndGuardians(store, { organizationId, childCount = 2, createdByEmail = "" }) {
  const count = Math.max(1, Math.min(6, Number(childCount) || 2));
  const children = [];
  const guardians = [];
  for (let i = 0; i < count; i += 1) {
    const child = addChild(store, { organizationId, displayName: `${FAKE_CHILD_NAMES[i % FAKE_CHILD_NAMES.length]} (Fixture)` });
    children.push(child);
    const guardianName = `${FAKE_GUARDIAN_NAMES[i % FAKE_GUARDIAN_NAMES.length]} (Fixture)`;
    const { contact } = addGuardian(store, {
      organizationId,
      displayName: guardianName,
      email: `pilot.guardian${i + 1}.${organizationId.slice(-6)}@example.invalid`,
      relationshipLabel: "parent",
      childIds: [child.id],
      accessLevel: familyModel.ACCESS_LEVELS.FULL_VERIFIED_GUARDIAN,
      isFinanciallyResponsible: true,
      createdByEmail,
    });
    guardians.push(contact);
  }
  return { children, guardians };
}

module.exports = {
  FORM_STATUSES,
  BILLING_STATUSES,
  ensurePilotStore,
  addChild,
  listChildren,
  addGuardian,
  listGuardians,
  updateGuardianAccess,
  listGuardianPreviewOptions,
  addUpdate,
  listUpdates,
  addMessage,
  listMessages,
  markMessagesRead,
  addForm,
  listForms,
  updateFormStatus,
  addBillingRecord,
  listBilling,
  addSharedPhoto,
  listSharedPhotos,
  setSharedPhotoVisibility,
  parentHomeSnapshot,
  resetPilotData,
  generateFakeChildrenAndGuardians,
};
