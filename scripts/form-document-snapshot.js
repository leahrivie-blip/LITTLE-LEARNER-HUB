/**
 * Builds the structured "document" content used for:
 * - the clean read-only document view (any non-editable response status)
 * - the permanent, immutable PDF-style snapshot generated when a response is
 *   approved (the "locked approved record" step)
 *
 * The response's structured `answers` remain the single authoritative record.
 * This module only ever *reads* store data and returns a plain content object
 * for rendering — it never persists anything itself (callers decide whether to
 * freeze the result into a documentSnapshots row).
 */

const model = require("./form-responses-data-model.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function nonInputTypes() {
  return new Set(["content_heading", "content_paragraph", "content_divider"]);
}

function formatAnswerForDisplay(field, value) {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return "Not answered";
  }
  if (Array.isArray(value)) return value.join(", ");
  if (["signature_parent", "signature_provider", "initials"].includes(field.type)) return String(value);
  return String(value);
}

function correctionHistoryFromAudit(auditRows) {
  const relevantActions = new Set(["returned_for_correction", "corrected_and_resubmitted", "reopened", "voided", "declined"]);
  return auditRows
    .filter((row) => relevantActions.has(row.action))
    .map((row) => ({
      action: row.action,
      message: row.message,
      actorEmail: row.actorEmail || "",
      actorRole: row.actorRole || "",
      at: row.createdAt,
    }));
}

/**
 * Builds the full structured document content for a response.
 */
function buildDocumentContent(store, { assignment, response, includeInvalidatedSignatures = true } = {}) {
  const form = store.formsCenter?.forms?.[assignment.formId];
  const version = store.formsCenter?.versions?.[response.formVersionId] || store.formsCenter?.versions?.[assignment.formVersionId];
  const organization = store.organizations?.[assignment.organizationId];
  const programProfile = listValues(store.programProfiles).find((row) => row.organizationId === assignment.organizationId);

  const signatures = (response.signatureIds || [])
    .map((id) => store.formResponses.signatures[id])
    .filter(Boolean)
    .filter((sig) => includeInvalidatedSignatures || !sig.invalidatedAt)
    .sort((a, b) => (a.signatureOrder || 0) - (b.signatureOrder || 0));

  const auditRows = listValues(store.formResponses.audit)
    .filter((row) => row.responseId === response.id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const sections = (version?.sections || []).map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description || "",
    fields: (version.fields || [])
      .filter((field) => field.sectionId === section.id)
      .map((field) => ({
        id: field.id,
        type: field.type,
        label: field.label,
        helpText: field.helpText || "",
        isContentOnly: nonInputTypes().has(field.type),
        required: Boolean(field.required),
        answerDisplay: nonInputTypes().has(field.type) ? "" : formatAnswerForDisplay(field, response.answers?.[field.id]),
      })),
  }));

  const recipientLabel = (() => {
    if (assignment.recipientType === model.RECIPIENT_TYPES.CHILD) return store.childRecords?.[assignment.recipientId]?.displayName || "Child";
    if (assignment.recipientType === model.RECIPIENT_TYPES.GUARDIAN) {
      const guardian = store.guardians?.[assignment.recipientId];
      return guardian?.displayName || guardian?.email || "Guardian";
    }
    if (assignment.recipientType === model.RECIPIENT_TYPES.STAFF) return store.staffMemberships?.[assignment.recipientId]?.displayName || "Staff member";
    if (assignment.recipientType === model.RECIPIENT_TYPES.CLASSROOM) return store.classrooms?.[assignment.recipientId]?.name || "Classroom";
    return "Entire program";
  })();

  return {
    generatedAt: model.nowIso(),
    label: "Testing Preview — Fake Data Only",
    program: {
      name: programProfile?.programName || organization?.name || "Little Learner Hub Preview Program",
      logoUrl: programProfile?.logoUrl || "",
      address: programProfile?.address || "",
    },
    form: {
      id: form?.id || "",
      title: form?.title || "",
      category: form?.category || "",
    },
    version: {
      id: version?.id || "",
      versionNumber: version?.versionNumber || response.formVersionNumber || 1,
    },
    recipient: {
      type: assignment.recipientType,
      label: recipientLabel,
    },
    relatedChildName: response.relatedChildId ? (store.childRecords?.[response.relatedChildId]?.displayName || "") : "",
    relatedClassroomName: response.relatedClassroomId ? (store.classrooms?.[response.relatedClassroomId]?.name || "") : "",
    status: response.status,
    statusLabel: model.RESPONSE_STATUS_LABELS[response.status] || response.status,
    dueDate: assignment.dueDate || "",
    startedAt: response.startedAt || "",
    submittedAt: response.submittedAt || "",
    approvedAt: response.approvedAt || "",
    voidedAt: response.voidedAt || "",
    voidReason: response.voidReason || "",
    sections: jsonClone(sections),
    signatures: signatures.map((sig) => ({
      signerRole: sig.signerRole,
      signerName: sig.signerName,
      signedAt: sig.signedAt,
      hasDrawnSignature: Boolean(sig.hasDrawnSignature),
      drawnDataUrl: sig.hasDrawnSignature ? sig.drawnDataUrl : "",
      invalidatedAt: sig.invalidatedAt || "",
      invalidatedReason: sig.invalidatedReason || "",
    })),
    correctionHistory: correctionHistoryFromAudit(auditRows),
    internalNotes: (response.internalNotes || []).map((note) => ({ message: note.message, authorEmail: note.authorEmail, createdAt: note.createdAt })),
  };
}

/**
 * Returns { content, frozen, snapshot }. If an immutable snapshot already
 * exists for this response, it is returned as-is (frozen: true) — the
 * document view for an approved record never silently changes. Otherwise the
 * content is built live from current data (frozen: false), which is what a
 * clean read-only view shows for any submitted-but-not-yet-approved status.
 */
function resolveDocumentView(store, { assignment, response } = {}) {
  const existingSnapshot = response.documentSnapshotId ? store.formResponses.documentSnapshots[response.documentSnapshotId] : null;
  if (existingSnapshot) {
    return { content: existingSnapshot.content, frozen: true, snapshot: existingSnapshot };
  }
  if (model.EDITABLE_STATUSES.has(response.status)) {
    return { content: null, frozen: false, snapshot: null };
  }
  return { content: buildDocumentContent(store, { assignment, response }), frozen: false, snapshot: null };
}

/**
 * Creates (or returns the existing) immutable document snapshot for a
 * response. Idempotent unless `force` is passed — approving a response
 * always locks in exactly one permanent snapshot.
 */
function generateDocumentSnapshot(store, { assignment, response, actorEmail = "", reason = "approved", force = false } = {}) {
  model.ensureFormResponsesStore(store);
  if (!force && response.documentSnapshotId && store.formResponses.documentSnapshots[response.documentSnapshotId]) {
    return store.formResponses.documentSnapshots[response.documentSnapshotId];
  }
  const content = buildDocumentContent(store, { assignment, response });
  const snapshot = model.createDocumentSnapshotRecord({
    responseId: response.id,
    assignmentId: assignment.id,
    organizationId: response.organizationId,
    formId: response.formId,
    formVersionId: response.formVersionId,
    formVersionNumber: response.formVersionNumber,
    content,
    generatedByEmail: actorEmail,
    reason,
  });
  store.formResponses.documentSnapshots[snapshot.id] = snapshot;
  response.documentSnapshotId = snapshot.id;
  return snapshot;
}

module.exports = {
  buildDocumentContent,
  resolveDocumentView,
  generateDocumentSnapshot,
};
