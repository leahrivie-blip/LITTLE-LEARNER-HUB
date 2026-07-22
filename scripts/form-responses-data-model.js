/**
 * Phase 6 Form Assignment, Response, and Signature data model.
 *
 * Builds on Phase 4 Forms Center (fcform_*) and Phase 5 Built-In Library (bftpl_*)
 * without modifying either. Introduces:
 * - form assignments (frasg_*) — who a published form was sent to
 * - form responses (frresp_*) — the recipient's in-progress or completed answers
 * - signatures (frsig_*) — immutable-once-submitted signature records
 * - audit rows (fraudit_*) — permanent history for every response
 * - medication administration log entries (frmed_*) — repeatable dose records
 *
 * All recipients are referenced by permanent foundation IDs (child_*, staff_*,
 * classroom_*, or "program"), never by name strings. No response or submission
 * ever contacts email, SMS, Stripe, or AI. Family Hub and real parent accounts
 * remain out of scope — see docs/PHASE_6_FORM_RESPONSES_SIGNATURES_COMPLETION_REPORT.md.
 */

const crypto = require("node:crypto");

const FORM_RESPONSES_SCHEMA_VERSION = 1;

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanLongText(value, max = 4000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

// ── Recipient types ──────────────────────────────────────────────────────────

const RECIPIENT_TYPES = Object.freeze({
  CHILD: "child",
  GUARDIAN: "guardian",
  STAFF: "staff",
  CLASSROOM: "classroom",
  PROGRAM: "program",
});

const RECIPIENT_TYPE_LABELS = Object.freeze({
  child: "Child",
  guardian: "Guardian",
  staff: "Staff member",
  classroom: "Classroom",
  program: "Entire program",
});

// ── Assignment status ────────────────────────────────────────────────────────

const ASSIGNMENT_STATUSES = Object.freeze({
  ACTIVE: "active",
  REVOKED: "revoked",
  EXPIRED: "expired",
  ARCHIVED: "archived",
});

// ── Version policy for in-progress assignments when a form is republished ──

const VERSION_POLICIES = Object.freeze({
  KEEP_ORIGINAL_VERSION: "keep_original_version",
  UPGRADE_TO_LATEST: "upgrade_to_latest",
});

// ── Response status workflow ─────────────────────────────────────────────────

const RESPONSE_STATUSES = Object.freeze({
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
  RETURNED_FOR_CORRECTION: "returned_for_correction",
  CORRECTED_AND_RESUBMITTED: "corrected_and_resubmitted",
  DECLINED: "declined",
  EXPIRED: "expired",
  ARCHIVED: "archived",
  VOIDED: "voided",
});

const RESPONSE_STATUS_LABELS = Object.freeze({
  not_started: "Not Started",
  in_progress: "In Progress",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  returned_for_correction: "Returned for Correction",
  corrected_and_resubmitted: "Corrected and Resubmitted",
  declined: "Declined",
  expired: "Expired",
  archived: "Archived",
  voided: "Voided",
});

// Statuses in which a response may still be edited/completed by the recipient.
const EDITABLE_STATUSES = new Set([
  RESPONSE_STATUSES.NOT_STARTED,
  RESPONSE_STATUSES.IN_PROGRESS,
  RESPONSE_STATUSES.RETURNED_FOR_CORRECTION,
]);

// Statuses that count as a completed submission requiring signature integrity.
const SUBMITTED_STATUSES = new Set([
  RESPONSE_STATUSES.SUBMITTED,
  RESPONSE_STATUSES.UNDER_REVIEW,
  RESPONSE_STATUSES.APPROVED,
  RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED,
]);

function normalizeResponseStatus(value) {
  const key = cleanText(value, 60).toLowerCase();
  return Object.values(RESPONSE_STATUSES).includes(key) ? key : RESPONSE_STATUSES.NOT_STARTED;
}

// ── Signature roles ──────────────────────────────────────────────────────────

const SIGNER_ROLES = Object.freeze({
  PARENT_GUARDIAN: "parent_guardian",
  STAFF: "staff",
  PROVIDER: "provider",
  WITNESS: "witness",
});

const DEFAULT_CONSENT_TEXT = "By typing my name (or drawing my signature) below and checking this box, I agree this counts as my electronic signature on this form. This is a testing preview and does not replace your program's own legal or licensing review.";
const CONSENT_TEXT_VERSION = "v1-2026-07-21";

function ensureFormResponsesStore(store) {
  if (!store || typeof store !== "object") return store;
  if (!store.formResponses || typeof store.formResponses !== "object" || Array.isArray(store.formResponses)) {
    store.formResponses = {};
  }
  const fr = store.formResponses;
  fr.schemaVersion = FORM_RESPONSES_SCHEMA_VERSION;
  fr.assignments = fr.assignments && typeof fr.assignments === "object" && !Array.isArray(fr.assignments) ? fr.assignments : {};
  fr.responses = fr.responses && typeof fr.responses === "object" && !Array.isArray(fr.responses) ? fr.responses : {};
  fr.signatures = fr.signatures && typeof fr.signatures === "object" && !Array.isArray(fr.signatures) ? fr.signatures : {};
  fr.audit = fr.audit && typeof fr.audit === "object" && !Array.isArray(fr.audit) ? fr.audit : {};
  fr.medicationLogEntries = fr.medicationLogEntries && typeof fr.medicationLogEntries === "object" && !Array.isArray(fr.medicationLogEntries) ? fr.medicationLogEntries : {};
  // Permanent, immutable document snapshots — generated once a response is
  // approved (the "locked approved record" step). The response's structured
  // answers/signatures remain the single source of truth; a snapshot is a
  // preserved, print/PDF-ready document view, never a second editable record.
  fr.documentSnapshots = fr.documentSnapshots && typeof fr.documentSnapshots === "object" && !Array.isArray(fr.documentSnapshots) ? fr.documentSnapshots : {};
  fr.meta = {
    ...(fr.meta && typeof fr.meta === "object" ? fr.meta : {}),
    createdAt: fr.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    noOutboundEmail: true,
    noOutboundSms: true,
    noStripe: true,
    noAi: true,
    note: "Phase 6 form assignments/responses/signatures. No real email, SMS, Stripe, or AI is used.",
  };
  return store;
}

// ── Assignment record ────────────────────────────────────────────────────────

function createAssignmentRecord({
  id = "",
  organizationId = "",
  formId = "",
  formVersionId = "",
  formVersionNumber = 1,
  builtInSourceTemplateId = "",
  recipientType = RECIPIENT_TYPES.CHILD,
  recipientId = "",
  recipientLabel = "",
  relatedChildId = "",
  relatedClassroomId = "",
  dueDate = "",
  instructions = "",
  required = true,
  reusable = false,
  requiredSignatureRoles = [],
  requireProviderCountersignature = false,
  editableAfterSubmission = false,
  reminderEnabled = false,
  reminderDaysBefore = 3,
  versionPolicy = VERSION_POLICIES.KEEP_ORIGINAL_VERSION,
  createdByEmail = "",
  createdByMembershipId = "",
  batchId = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("frasg"),
    organizationId,
    formId,
    formVersionId,
    formVersionNumber: Math.max(1, Number(formVersionNumber) || 1),
    builtInSourceTemplateId: cleanText(builtInSourceTemplateId, 160),
    recipientType: Object.values(RECIPIENT_TYPES).includes(recipientType) ? recipientType : RECIPIENT_TYPES.CHILD,
    recipientId: cleanText(recipientId, 160),
    recipientLabel: cleanText(recipientLabel, 200),
    relatedChildId: cleanText(relatedChildId, 160),
    relatedClassroomId: cleanText(relatedClassroomId, 160),
    dueDate: cleanText(dueDate, 40),
    instructions: cleanLongText(instructions, 2000),
    required: required !== false,
    reusable: reusable === true,
    requiredSignatureRoles: Array.isArray(requiredSignatureRoles)
      ? requiredSignatureRoles.filter((role) => Object.values(SIGNER_ROLES).includes(role))
      : [],
    requireProviderCountersignature: requireProviderCountersignature === true,
    editableAfterSubmission: editableAfterSubmission === true,
    reminder: {
      enabled: reminderEnabled === true,
      daysBefore: Math.max(0, Number(reminderDaysBefore) || 0),
      // Stored for future use only — Phase 6 never sends a real reminder.
      sent: false,
      live: false,
    },
    versionPolicy: Object.values(VERSION_POLICIES).includes(versionPolicy) ? versionPolicy : VERSION_POLICIES.KEEP_ORIGINAL_VERSION,
    status: ASSIGNMENT_STATUSES.ACTIVE,
    testingLinkTokenHash: "",
    testingLinkExpiresAt: "",
    testingLinkRevoked: false,
    testingLinkCreatedAt: "",
    testingLinkRegeneratedCount: 0,
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdByMembershipId: cleanText(createdByMembershipId, 160),
    batchId: cleanText(batchId, 160),
    createdAt,
    updatedAt: createdAt,
    revokedAt: "",
    archivedAt: "",
  };
}

// ── Response record ──────────────────────────────────────────────────────────

function createResponseRecord({
  id = "",
  assignmentId = "",
  organizationId = "",
  formId = "",
  formVersionId = "",
  formVersionNumber = 1,
  recipientType = RECIPIENT_TYPES.CHILD,
  recipientId = "",
  relatedChildId = "",
  relatedClassroomId = "",
  createdByEmail = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("frresp"),
    assignmentId,
    organizationId,
    formId,
    formVersionId,
    formVersionNumber: Math.max(1, Number(formVersionNumber) || 1),
    recipientType,
    recipientId: cleanText(recipientId, 160),
    relatedChildId: cleanText(relatedChildId, 160),
    relatedClassroomId: cleanText(relatedClassroomId, 160),
    status: RESPONSE_STATUSES.NOT_STARTED,
    answers: {},
    currentSectionId: "",
    signatureIds: [],
    documentSnapshotId: "",
    internalNotes: [],
    voidReason: "",
    returnMessage: "",
    lastSavedAt: "",
    startedAt: "",
    submittedAt: "",
    reviewedAt: "",
    approvedAt: "",
    returnedAt: "",
    resubmittedAt: "",
    voidedAt: "",
    archivedAt: "",
    expiresAt: "",
    preview: false,
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt,
    updatedAt: createdAt,
  };
}

// ── Signature record ─────────────────────────────────────────────────────────

function createSignatureRecord({
  id = "",
  responseId = "",
  formVersionId = "",
  organizationId = "",
  signerRole = SIGNER_ROLES.PARENT_GUARDIAN,
  signerName = "",
  signerIdentity = "",
  typedName = "",
  drawnDataUrl = "",
  consentText = DEFAULT_CONSENT_TEXT,
  consentVersion = CONSENT_TEXT_VERSION,
  signatureOrder = 1,
  submissionEventId = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("frsig"),
    responseId,
    formVersionId,
    organizationId,
    signerRole: Object.values(SIGNER_ROLES).includes(signerRole) ? signerRole : SIGNER_ROLES.PARENT_GUARDIAN,
    signerName: cleanText(signerName, 200),
    signerIdentity: cleanText(signerIdentity, 200),
    typedName: cleanText(typedName, 200),
    drawnDataUrl: typeof drawnDataUrl === "string" ? drawnDataUrl.slice(0, 200000) : "",
    hasDrawnSignature: Boolean(drawnDataUrl),
    consentGiven: true,
    consentText: cleanLongText(consentText, 2000),
    consentVersion: cleanText(consentVersion, 60),
    signatureOrder: Math.max(1, Number(signatureOrder) || 1),
    signedAt: createdAt,
    submissionEventId: cleanText(submissionEventId, 160),
    invalidatedAt: "",
    invalidatedReason: "",
    testingOnly: true,
    createdAt,
  };
}

function invalidateSignature(signature, reason) {
  signature.invalidatedAt = nowIso();
  signature.invalidatedReason = cleanText(reason || "Response was reopened or materially edited after submission.", 400);
  return signature;
}

// ── Audit record ─────────────────────────────────────────────────────────────

function createAuditRecord({
  id = "",
  organizationId = "",
  responseId = "",
  assignmentId = "",
  action = "",
  actorEmail = "",
  actorRole = "",
  message = "",
  changes = null,
} = {}) {
  return {
    id: id || newId("fraudit"),
    organizationId,
    responseId,
    assignmentId,
    action: cleanText(action, 120),
    actorEmail: cleanText(actorEmail, 180).toLowerCase(),
    actorRole: cleanText(actorRole, 60),
    message: cleanLongText(message, 1000),
    changes: changes && typeof changes === "object" ? changes : null,
    createdAt: nowIso(),
  };
}

// ── Document snapshots ("locked approved record" → PDF-style artifact) ──────

/**
 * A document snapshot is an immutable, print/PDF-ready freeze of an approved
 * response: program branding, form title/version, status, every question and
 * answer, every signature with its date, and a correction-history summary.
 * It is generated once (at approval) and never edited — the response's
 * structured `answers` remain the single authoritative record.
 */
function createDocumentSnapshotRecord({
  id = "",
  responseId = "",
  assignmentId = "",
  organizationId = "",
  formId = "",
  formVersionId = "",
  formVersionNumber = 1,
  content = null,
  generatedByEmail = "",
  reason = "approved",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("frdoc"),
    responseId,
    assignmentId,
    organizationId,
    formId,
    formVersionId,
    formVersionNumber: Math.max(1, Number(formVersionNumber) || 1),
    content: content && typeof content === "object" ? content : {},
    generatedByEmail: cleanText(generatedByEmail, 180).toLowerCase(),
    reason: cleanText(reason, 60) || "approved",
    immutable: true,
    generatedAt: createdAt,
  };
}

// ── Medication administration log entries ────────────────────────────────────

const MEDICATION_RESULTS = Object.freeze({
  GIVEN: "given",
  REFUSED: "refused",
  MISSED: "missed",
  SPILLED: "spilled",
  UNAVAILABLE: "unavailable",
});

function createMedicationLogEntry({
  id = "",
  responseId = "",
  organizationId = "",
  childId = "",
  medicationName = "",
  authorizationReference = "",
  logDate = "",
  scheduledTime = "",
  actualTime = "",
  dosage = "",
  method = "",
  administeredByMembershipId = "",
  administeredByName = "",
  witnessMembershipId = "",
  witnessName = "",
  result = MEDICATION_RESULTS.GIVEN,
  notes = "",
  staffInitials = "",
  parentAcknowledged = false,
  supersedesEntryId = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("frmed"),
    responseId,
    organizationId,
    childId: cleanText(childId, 160),
    medicationName: cleanText(medicationName, 200),
    authorizationReference: cleanText(authorizationReference, 160),
    logDate: cleanText(logDate, 40),
    scheduledTime: cleanText(scheduledTime, 40),
    actualTime: cleanText(actualTime, 40),
    dosage: cleanText(dosage, 120),
    method: cleanText(method, 120),
    administeredByMembershipId: cleanText(administeredByMembershipId, 160),
    administeredByName: cleanText(administeredByName, 200),
    witnessMembershipId: cleanText(witnessMembershipId, 160),
    witnessName: cleanText(witnessName, 200),
    result: Object.values(MEDICATION_RESULTS).includes(result) ? result : MEDICATION_RESULTS.GIVEN,
    notes: cleanLongText(notes, 1000),
    staffInitials: cleanText(staffInitials, 20),
    parentAcknowledged: parentAcknowledged === true,
    supersedesEntryId: cleanText(supersedesEntryId, 160),
    supersededByEntryId: "",
    isCorrection: Boolean(supersedesEntryId),
    createdAt,
  };
}

function medicationLogHistory(store, responseId) {
  return listValues(store.formResponses.medicationLogEntries)
    .filter((entry) => entry.responseId === responseId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate recipient answers against a form version's field definitions.
 * Server-side validation must never be replaced by client-side checks.
 */
function validateAnswersAgainstVersion(version, answers) {
  const errors = [];
  const fields = Array.isArray(version?.fields) ? version.fields : [];
  const nonInputTypes = new Set(["content_heading", "content_paragraph", "content_divider"]);
  fields.forEach((field) => {
    if (nonInputTypes.has(field.type)) return;
    const value = answers ? answers[field.id] : undefined;
    const isEmpty = value === undefined || value === null || value === ""
      || (Array.isArray(value) && value.length === 0);
    if (field.required && isEmpty) {
      errors.push({ fieldId: field.id, label: field.label, message: `"${field.label}" is required.` });
      return;
    }
    if (isEmpty) return;
    if (["single_select", "yes_no"].includes(field.type)) {
      const optionLabels = (field.options || []).map((option) => option.label);
      if (typeof value !== "string" || (optionLabels.length && !optionLabels.includes(value))) {
        errors.push({ fieldId: field.id, label: field.label, message: `"${field.label}" has an invalid selection.` });
      }
    }
    if (["multi_select", "checkboxes"].includes(field.type)) {
      const optionLabels = (field.options || []).map((option) => option.label);
      if (!Array.isArray(value) || (optionLabels.length && !value.every((entry) => optionLabels.includes(entry)))) {
        errors.push({ fieldId: field.id, label: field.label, message: `"${field.label}" has an invalid selection.` });
      }
    }
    if (field.type === "email" && typeof value === "string" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push({ fieldId: field.id, label: field.label, message: `"${field.label}" needs a valid email address.` });
    }
    if (["signature_parent", "signature_provider", "initials"].includes(field.type)) {
      if (typeof value !== "string" || !value.trim()) {
        errors.push({ fieldId: field.id, label: field.label, message: `"${field.label}" needs a name or initials.` });
      }
    }
  });
  return errors;
}

function requiredFillableFieldIds(version) {
  const nonInputTypes = new Set(["content_heading", "content_paragraph", "content_divider"]);
  return (version?.fields || [])
    .filter((field) => field.required && !nonInputTypes.has(field.type))
    .map((field) => field.id);
}

function completionProgress(version, answers) {
  const fillable = requiredFillableFieldIds(version);
  if (!fillable.length) return { completed: 0, total: 0, percent: 100 };
  const completed = fillable.filter((id) => {
    const value = answers ? answers[id] : undefined;
    return !(value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0));
  }).length;
  return { completed, total: fillable.length, percent: Math.round((completed / fillable.length) * 100) };
}

module.exports = {
  FORM_RESPONSES_SCHEMA_VERSION,
  RECIPIENT_TYPES,
  RECIPIENT_TYPE_LABELS,
  ASSIGNMENT_STATUSES,
  VERSION_POLICIES,
  RESPONSE_STATUSES,
  RESPONSE_STATUS_LABELS,
  EDITABLE_STATUSES,
  SUBMITTED_STATUSES,
  SIGNER_ROLES,
  DEFAULT_CONSENT_TEXT,
  CONSENT_TEXT_VERSION,
  MEDICATION_RESULTS,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  listValues,
  normalizeResponseStatus,
  ensureFormResponsesStore,
  createAssignmentRecord,
  createResponseRecord,
  createSignatureRecord,
  invalidateSignature,
  createAuditRecord,
  createDocumentSnapshotRecord,
  createMedicationLogEntry,
  medicationLogHistory,
  validateAnswersAgainstVersion,
  requiredFillableFieldIds,
  completionProgress,
};
