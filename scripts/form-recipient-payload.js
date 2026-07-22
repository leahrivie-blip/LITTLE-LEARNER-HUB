/**
 * Shared payload builder for the recipient form-completion experience.
 * Used by both the public token-authenticated recipient API and the
 * admin-side "preview as recipient" endpoint inside Forms Center, so the
 * two surfaces always render identically.
 */

const formsModel = require("./forms-center-data-model.js");
const model = require("./form-responses-data-model.js");

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function activeSignaturesFor(store, response) {
  return (response.signatureIds || [])
    .map((id) => store.formResponses.signatures[id])
    .filter((sig) => sig && !sig.invalidatedAt);
}

/**
 * Builds the exact payload the recipient (or an admin previewing as one)
 * needs to render and complete a form: program branding placeholder, form
 * title/instructions, sections/fields, progress, current answers, active
 * signatures, and safety labels. Never includes other recipients' data.
 */
function buildRecipientPayload(store, { assignment, response, previewOnly = false } = {}) {
  const form = store.formsCenter?.forms?.[assignment.formId];
  const version = store.formsCenter?.versions?.[response.formVersionId] || store.formsCenter?.versions?.[assignment.formVersionId];
  const organization = store.organizations?.[assignment.organizationId];
  const programProfile = Object.values(store.programProfiles || {}).find((row) => row.organizationId === assignment.organizationId);
  const activeSignatures = activeSignaturesFor(store, response);
  const progress = model.completionProgress(version, response.answers);

  return {
    ok: true,
    label: "Testing Preview — Fake Data Only",
    previewOnly: previewOnly === true,
    emailSent: false,
    smsSent: false,
    responseCollection: true,
    program: {
      name: programProfile?.programName || organization?.name || "Little Learner Hub Preview Program",
      logoUrl: programProfile?.logoUrl || "",
    },
    assignment: {
      id: assignment.id,
      recipientType: assignment.recipientType,
      dueDate: assignment.dueDate,
      instructions: assignment.instructions,
      required: assignment.required,
      requiredSignatureRoles: assignment.requiredSignatureRoles,
      requireProviderCountersignature: assignment.requireProviderCountersignature,
      editableAfterSubmission: assignment.editableAfterSubmission,
    },
    form: {
      id: form?.id || "",
      title: form?.title || "",
      description: form?.description || "",
      category: form?.category || "",
    },
    relatedChildName: assignment.relatedChildId ? (store.childRecords?.[assignment.relatedChildId]?.displayName || "") : "",
    version: version ? { id: version.id, versionNumber: version.versionNumber, sections: jsonClone(version.sections || []), fields: jsonClone(version.fields || []) } : null,
    response: {
      id: response.id,
      status: response.status,
      statusLabel: model.RESPONSE_STATUS_LABELS[response.status] || response.status,
      answers: jsonClone(response.answers || {}),
      currentSectionId: response.currentSectionId || (version?.sections?.[0]?.id || ""),
      lastSavedAt: response.lastSavedAt,
      submittedAt: response.submittedAt,
      returnMessage: response.returnMessage,
      editable: model.EDITABLE_STATUSES.has(response.status),
      progress,
    },
    signatures: activeSignatures.map((sig) => ({
      id: sig.id,
      signerRole: sig.signerRole,
      signerName: sig.signerName,
      signatureOrder: sig.signatureOrder,
      signedAt: sig.signedAt,
      hasDrawnSignature: sig.hasDrawnSignature,
    })),
    signaturesSatisfied: (assignment.requiredSignatureRoles || []).every((role) => activeSignatures.some((sig) => sig.signerRole === role)),
    consent: {
      text: model.DEFAULT_CONSENT_TEXT,
      version: model.CONSENT_TEXT_VERSION,
    },
  };
}

module.exports = {
  buildRecipientPayload,
  activeSignaturesFor,
};
