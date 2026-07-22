/**
 * Phase 13 — Records Center: authoritative records, unfiled inbox, archive,
 * communication references, missing/expiring tracking.
 * Fake files only. No production storage, public URLs, OCR/AI, email/SMS/push/Stripe.
 */

const crypto = require("node:crypto");
const foundation = require("./foundation-data-model.js");
const hub = require("./family-hub-data-model.js");
const enrollmentModel = require("./enrollment-data-model.js");
const messagingModel = require("./family-messaging-data-model.js");

const RECORD_STATUSES = Object.freeze({
  UNFILED: "unfiled",
  DRAFT: "draft",
  SUBMITTED: "submitted",
  NEEDS_REVIEW: "needs_review",
  MISSING_INFORMATION: "missing_information",
  RETURNED_FOR_CORRECTION: "returned_for_correction",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRING_SOON: "expiring_soon",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
  ARCHIVED: "archived",
  VOIDED: "voided",
});

const CONFIDENTIALITY = Object.freeze({
  GENERAL_PROGRAM: "general_program",
  CLASSROOM_STAFF: "classroom_staff",
  DIRECTOR_ONLY: "director_only",
  MEDICAL_RESTRICTED: "medical_restricted",
  CUSTODY_RESTRICTED: "custody_restricted",
  BILLING_RESTRICTED: "billing_restricted",
  PERSONNEL_RESTRICTED: "personnel_restricted",
  FAMILY_VISIBLE: "family_visible",
});

const STARTER_CATEGORIES = Object.freeze([
  "Enrollment",
  "Emergency Information",
  "Medical and Allergies",
  "Immunization and Health",
  "Medication",
  "Permissions and Authorizations",
  "Custody and Authorized Pickup",
  "Incident and Injury",
  "Development and Observations",
  "Infant and Toddler Care",
  "Policies and Agreements",
  "Tuition and Billing",
  "Attendance",
  "Family Communication",
  "Staff Records",
  "Staff Training and Certifications",
  "Licensing and Program Records",
  "Facility and Safety",
  "Transportation",
  "Meals and Food Program",
  "Other",
]);

const ALLOWED_FILE_MIME = Object.freeze({
  "application/pdf": { maxBytes: 4 * 1024 * 1024 },
  "image/jpeg": { maxBytes: 3 * 1024 * 1024 },
  "image/png": { maxBytes: 3 * 1024 * 1024 },
  "text/plain": { maxBytes: 200 * 1024 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { maxBytes: 3 * 1024 * 1024 },
});

const BLOCKED_FILE_MIME = new Set([
  "application/javascript",
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "text/html",
  "application/x-msdos-program",
]);

const TESTING_BANNER = "Testing Account — Fake Records Only. Not production file storage.";

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanLongText(value, max = 8000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureRecordsStore(store) {
  if (!store || typeof store !== "object") throw new Error("store is required");
  hub.ensureFamilyHubStore(store);
  enrollmentModel.ensureEnrollmentStore(store);
  messagingModel.ensureFamilyMessagingStore(store);
  foundation.ensureFoundationStore(store);
  store.recordsCenter = store.recordsCenter && typeof store.recordsCenter === "object" ? store.recordsCenter : {};
  const rc = store.recordsCenter;
  rc.records = rc.records && typeof rc.records === "object" && !Array.isArray(rc.records) ? rc.records : {};
  rc.files = rc.files && typeof rc.files === "object" && !Array.isArray(rc.files) ? rc.files : {};
  rc.categories = rc.categories && typeof rc.categories === "object" && !Array.isArray(rc.categories) ? rc.categories : {};
  rc.expectedTypes = rc.expectedTypes && typeof rc.expectedTypes === "object" && !Array.isArray(rc.expectedTypes) ? rc.expectedTypes : {};
  rc.reminderEvents = rc.reminderEvents && typeof rc.reminderEvents === "object" && !Array.isArray(rc.reminderEvents) ? rc.reminderEvents : {};
  rc.retentionPolicies = rc.retentionPolicies && typeof rc.retentionPolicies === "object" && !Array.isArray(rc.retentionPolicies) ? rc.retentionPolicies : {};
  rc.audit = rc.audit && typeof rc.audit === "object" && !Array.isArray(rc.audit) ? rc.audit : {};
  rc.meta = {
    ...(rc.meta && typeof rc.meta === "object" ? rc.meta : {}),
    createdAt: rc.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    phase: 13,
    testingOnly: true,
    noProductionStorage: true,
    noPublicUrls: true,
    noOcr: true,
    noLiveAi: true,
    noOutboundEmail: true,
    noOutboundSms: true,
    noPush: true,
    noStripe: true,
    noAutomaticPermanentDelete: true,
    note: "Phase 13 Records Center. Authoritative records; profiles hold secure references. Fake files only.",
  };
  return store;
}

function createAudit(store, input = {}) {
  ensureRecordsStore(store);
  const row = {
    id: newId("rcaudit"),
    organizationId: cleanText(input.organizationId, 80),
    recordId: cleanText(input.recordId, 80),
    action: cleanText(input.action, 80),
    actorEmail: cleanText(input.actorEmail, 160).toLowerCase(),
    actorRole: cleanText(input.actorRole, 40),
    detail: cleanText(input.detail, 500),
    previous: input.previous == null ? null : input.previous,
    next: input.next == null ? null : input.next,
    createdAt: nowIso(),
  };
  store.recordsCenter.audit[row.id] = row;
  return row;
}

function checksumFoundation(contentBase64) {
  const buf = Buffer.from(String(contentBase64 || ""), "base64");
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function validateFileUpload({ mimeType, fileName, byteSize, contentBase64 }) {
  const mime = cleanText(mimeType, 120).toLowerCase();
  const name = cleanText(fileName, 200);
  if (BLOCKED_FILE_MIME.has(mime) || /\.(exe|js|sh|bat|cmd|dll|msi)$/i.test(name)) {
    return { ok: false, error: "executable_or_disguised_file_rejected" };
  }
  const rule = ALLOWED_FILE_MIME[mime];
  if (!rule) return { ok: false, error: "unsupported_file_type" };
  const size = Number(byteSize) || Buffer.from(String(contentBase64 || ""), "base64").length;
  if (size > rule.maxBytes) return { ok: false, error: "file_too_large" };
  if (!contentBase64) return { ok: false, error: "missing_content" };
  return { ok: true, mime, name, size, checksum: checksumFoundation(contentBase64) };
}

function createFileRecord(input = {}) {
  const validation = validateFileUpload(input);
  if (!validation.ok) throw new Error(validation.error);
  return {
    id: input.id || newId("rcfile"),
    organizationId: cleanText(input.organizationId, 80),
    fileName: validation.name,
    mimeType: validation.mime,
    byteSize: validation.size,
    contentBase64: String(input.contentBase64),
    checksum: validation.checksum,
    publicUrl: null,
    privateRef: true,
    version: Number(input.version) || 1,
    replacesFileId: cleanText(input.replacesFileId, 80),
    metadataStripped: input.metadataStripped === true || /^image\//.test(validation.mime),
    uploadedByEmail: cleanText(input.uploadedByEmail, 160).toLowerCase(),
    createdAt: input.createdAt || nowIso(),
  };
}

function createRecord(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("rcrec"),
    organizationId: cleanText(input.organizationId, 80),
    programLocationId: cleanText(input.programLocationId, 80),
    title: cleanText(input.title || "Untitled record", 200),
    recordType: cleanText(input.recordType || "document", 80),
    category: cleanText(input.category || "Other", 80),
    relatedChildId: cleanText(input.relatedChildId, 80),
    relatedGuardianId: cleanText(input.relatedGuardianId, 80),
    relatedHouseholdId: cleanText(input.relatedHouseholdId, 80),
    relatedStaffId: cleanText(input.relatedStaffId, 80),
    relatedClassroomId: cleanText(input.relatedClassroomId, 80),
    relatedEnrollmentCaseId: cleanText(input.relatedEnrollmentCaseId, 80),
    relatedConversationId: cleanText(input.relatedConversationId, 80),
    source: cleanText(input.source || "upload", 80),
    createdByEmail: cleanText(input.createdByEmail, 160).toLowerCase(),
    createdAt: input.createdAt || now,
    receivedDate: cleanText(input.receivedDate || now.slice(0, 10), 40),
    effectiveDate: cleanText(input.effectiveDate, 40),
    reviewDate: cleanText(input.reviewDate, 40),
    expirationDate: cleanText(input.expirationDate, 40),
    status: Object.values(RECORD_STATUSES).includes(input.status) ? input.status : RECORD_STATUSES.UNFILED,
    statusHistory: Array.isArray(input.statusHistory) ? input.statusHistory : [{ status: input.status || RECORD_STATUSES.UNFILED, at: now }],
    signatureStatus: cleanText(input.signatureStatus || "none", 40),
    approvalStatus: cleanText(input.approvalStatus || "none", 40),
    familyVisibility: input.familyVisibility === true || input.confidentiality === CONFIDENTIALITY.FAMILY_VISIBLE,
    confidentiality: Object.values(CONFIDENTIALITY).includes(input.confidentiality) ? input.confidentiality : CONFIDENTIALITY.GENERAL_PROGRAM,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => cleanText(t, 40)).slice(0, 20) : [],
    internalNotes: cleanLongText(input.internalNotes, 4000),
    description: cleanLongText(input.description, 2000),
    version: Number(input.version) || 1,
    previousVersionId: cleanText(input.previousVersionId, 80),
    supersededById: cleanText(input.supersededById, 80),
    archiveStatus: input.archiveStatus === true || input.status === RECORD_STATUSES.ARCHIVED,
    retentionClassification: cleanText(input.retentionClassification || "program_configurable", 80),
    fileIds: Array.isArray(input.fileIds) ? input.fileIds.slice(0, 20) : [],
    formSnapshotRef: cleanText(input.formSnapshotRef, 80),
    voidReason: cleanText(input.voidReason, 400),
    rejectReason: cleanText(input.rejectReason, 400),
    testingOnly: true,
    fakeLabel: cleanText(input.fakeLabel || "FAKE testing record", 120),
    updatedAt: input.updatedAt || now,
  };
}

function setRecordStatus(store, record, status, actorEmail, detail) {
  if (!Object.values(RECORD_STATUSES).includes(status)) throw new Error("invalid_status");
  const previous = record.status;
  record.status = status;
  record.updatedAt = nowIso();
  record.statusHistory = Array.isArray(record.statusHistory) ? record.statusHistory : [];
  record.statusHistory.push({ status, at: record.updatedAt, by: cleanText(actorEmail, 160).toLowerCase(), detail: cleanText(detail, 200) });
  if (status === RECORD_STATUSES.ARCHIVED) record.archiveStatus = true;
  createAudit(store, {
    organizationId: record.organizationId,
    recordId: record.id,
    action: "status_change",
    actorEmail,
    detail,
    previous,
    next: status,
  });
  return record;
}

function defaultCategories(organizationId) {
  return {
    id: newId("rccat"),
    organizationId,
    systemDefaults: STARTER_CATEGORIES.slice(),
    custom: [],
    updatedAt: nowIso(),
  };
}

function defaultExpectedTypes(organizationId) {
  return {
    id: newId("rcexp"),
    organizationId,
    children: [
      { key: "immunization", category: "Immunization and Health", title: "Immunization record" },
      { key: "emergency_contacts", category: "Emergency Information", title: "Emergency contacts" },
      { key: "permissions", category: "Permissions and Authorizations", title: "Photo/permissions" },
    ],
    staff: [
      { key: "cpr", category: "Staff Training and Certifications", title: "CPR certification" },
      { key: "background", category: "Staff Records", title: "Background clearance" },
    ],
    families: [
      { key: "enrollment_packet", category: "Enrollment", title: "Signed enrollment agreement" },
    ],
    classrooms: [
      { key: "emergency_drill", category: "Facility and Safety", title: "Emergency drill log" },
    ],
    programs: [
      { key: "policy", category: "Policies and Agreements", title: "Program policy" },
    ],
    enrollment: [
      { key: "application", category: "Enrollment", title: "Enrollment application" },
    ],
    updatedAt: nowIso(),
  };
}

function defaultRetention(organizationId) {
  return {
    id: newId("rcret"),
    organizationId,
    note: "Configurable retention placeholder. No universal legal retention period promised.",
    noAutomaticPermanentDelete: true,
    archiveInsteadOfCasualDelete: true,
    updatedAt: nowIso(),
  };
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

function refreshExpirationStatus(record) {
  const days = daysUntil(record.expirationDate);
  if (days == null) return record;
  if (days < 0 && record.status !== RECORD_STATUSES.SUPERSEDED && record.status !== RECORD_STATUSES.VOIDED && record.status !== RECORD_STATUSES.ARCHIVED) {
    record.status = RECORD_STATUSES.EXPIRED;
  } else if (days <= 30 && days >= 0 && [RECORD_STATUSES.APPROVED, RECORD_STATUSES.NEEDS_REVIEW].includes(record.status)) {
    record.status = RECORD_STATUSES.EXPIRING_SOON;
  }
  return record;
}

function overviewCounts(store, organizationId) {
  ensureRecordsStore(store);
  const rows = listValues(store.recordsCenter.records).filter((r) => r.organizationId === organizationId);
  rows.forEach(refreshExpirationStatus);
  const count = (pred) => rows.filter(pred).length;
  return {
    newUploads: count((r) => r.source === "upload" && r.status === RECORD_STATUSES.UNFILED),
    unfiled: count((r) => r.status === RECORD_STATUSES.UNFILED),
    needsReview: count((r) => r.status === RECORD_STATUSES.NEEDS_REVIEW),
    missing: count((r) => r.status === RECORD_STATUSES.MISSING_INFORMATION),
    awaitingSignature: count((r) => r.signatureStatus === "awaiting"),
    returnedForCorrection: count((r) => r.status === RECORD_STATUSES.RETURNED_FOR_CORRECTION),
    expiringSoon: count((r) => r.status === RECORD_STATUSES.EXPIRING_SOON),
    expired: count((r) => r.status === RECORD_STATUSES.EXPIRED),
    approved: count((r) => r.status === RECORD_STATUSES.APPROVED),
    archived: count((r) => r.archiveStatus === true || r.status === RECORD_STATUSES.ARCHIVED),
  };
}

function missingAndExpiring(store, organizationId) {
  ensureRecordsStore(store);
  const expected = store.recordsCenter.expectedTypes[organizationId] || defaultExpectedTypes(organizationId);
  const records = listValues(store.recordsCenter.records).filter((r) => r.organizationId === organizationId && !r.archiveStatus);
  records.forEach(refreshExpirationStatus);
  const missing = [];
  for (const item of expected.children || []) {
    const found = records.some((r) => r.category === item.category && r.relatedChildId && r.status !== RECORD_STATUSES.REJECTED && r.status !== RECORD_STATUSES.VOIDED);
    if (!found) missing.push({ scope: "children", ...item, state: "missing" });
  }
  for (const item of expected.staff || []) {
    const found = records.some((r) => r.category === item.category && r.relatedStaffId && r.status !== RECORD_STATUSES.REJECTED);
    if (!found) missing.push({ scope: "staff", ...item, state: "missing" });
  }
  const expiring = records.filter((r) => r.status === RECORD_STATUSES.EXPIRING_SOON || r.status === RECORD_STATUSES.EXPIRED)
    .map((r) => ({ recordId: r.id, title: r.title, status: r.status, expirationDate: r.expirationDate }));
  return { missing, expiring, awaitingUpload: missing.filter((m) => m.state === "missing"), awaitingSignature: records.filter((r) => r.signatureStatus === "awaiting"), awaitingProviderReview: records.filter((r) => r.status === RECORD_STATUSES.NEEDS_REVIEW), returnedForCorrection: records.filter((r) => r.status === RECORD_STATUSES.RETURNED_FOR_CORRECTION) };
}

function familySafeRecord(record) {
  if (!record || !record.familyVisibility) return null;
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    status: record.status,
    approvalStatus: record.approvalStatus,
    signatureStatus: record.signatureStatus,
    relatedChildId: record.relatedChildId,
    effectiveDate: record.effectiveDate,
    expirationDate: record.expirationDate,
    familyVisibility: true,
    testingOnly: true,
    fakeLabel: record.fakeLabel,
    // internalNotes, confidentiality details beyond family_visible, personnel — omitted
  };
}

function buildTimeline(store, { organizationId, childId = "", staffId = "", householdId = "" }) {
  ensureRecordsStore(store);
  const items = [];
  for (const record of listValues(store.recordsCenter.records)) {
    if (record.organizationId !== organizationId) continue;
    if (childId && record.relatedChildId !== childId) continue;
    if (staffId && record.relatedStaffId !== staffId) continue;
    if (householdId && record.relatedHouseholdId !== householdId) continue;
    items.push({
      at: record.updatedAt || record.createdAt,
      type: "record",
      recordId: record.id,
      title: record.title,
      status: record.status,
      category: record.category,
    });
  }
  for (const caseRow of listValues(store.enrollment?.cases || {})) {
    if (caseRow.organizationId !== organizationId) continue;
    if (childId && caseRow.childId && caseRow.childId !== childId) continue;
    items.push({
      at: caseRow.updatedAt || caseRow.createdAt,
      type: "enrollment",
      enrollmentCaseId: caseRow.id,
      title: `Enrollment: ${caseRow.childName}`,
      status: caseRow.stage,
    });
  }
  for (const conv of listValues(store.familyMessaging?.conversations || {})) {
    if (conv.organizationId !== organizationId) continue;
    if (childId && !(conv.childIds || []).includes(childId)) continue;
    if (conv.internalStaffOnly) continue;
    items.push({
      at: conv.lastActivityAt || conv.createdAt,
      type: "communication_ref",
      conversationId: conv.id,
      title: conv.subject,
      status: conv.archived ? "archived" : "active",
    });
  }
  items.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return items;
}

function actorMayViewRecord(actor, record) {
  if (!actor || !record) return false;
  if (record.organizationId !== actor.organizationId) return false;
  const role = actor.role || "";
  const conf = record.confidentiality;
  if (conf === CONFIDENTIALITY.PERSONNEL_RESTRICTED || conf === CONFIDENTIALITY.DIRECTOR_ONLY || conf === CONFIDENTIALITY.CUSTODY_RESTRICTED || conf === CONFIDENTIALITY.BILLING_RESTRICTED || conf === CONFIDENTIALITY.MEDICAL_RESTRICTED) {
    if (!/director|owner/i.test(role) && !actor.recordsManagerGrant) return false;
  }
  if (/teacher|lead/i.test(role) && !/director|owner/i.test(role)) {
    if (record.relatedClassroomId && actor.assignedClassroomIds && !actor.assignedClassroomIds.includes(record.relatedClassroomId)) return false;
    if (conf === CONFIDENTIALITY.PERSONNEL_RESTRICTED) return false;
  }
  if (/assistant/i.test(role) && !actor.recordsOverride) return false;
  if (/curriculum/i.test(role)) return false;
  return true;
}

module.exports = {
  RECORD_STATUSES,
  CONFIDENTIALITY,
  STARTER_CATEGORIES,
  ALLOWED_FILE_MIME,
  BLOCKED_FILE_MIME,
  TESTING_BANNER,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  listValues,
  ensureRecordsStore,
  createAudit,
  checksumFoundation,
  validateFileUpload,
  createFileRecord,
  createRecord,
  setRecordStatus,
  defaultCategories,
  defaultExpectedTypes,
  defaultRetention,
  daysUntil,
  refreshExpirationStatus,
  overviewCounts,
  missingAndExpiring,
  familySafeRecord,
  buildTimeline,
  actorMayViewRecord,
};
