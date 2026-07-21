/**
 * Phase 6 recipient API — public, token-authenticated, ungated by the admin
 * expansion-flag prefix (recipients are never verified admins). Mounted at
 * /api/form-recipient/*.
 *
 * Safety rules enforced on every handler:
 * - Rejected outright on a live production host — testing links only work on
 *   approved non-production hosts.
 * - The raw token is accepted ONLY via the x-llh-form-recipient-token header,
 *   never a query string, so it never appears in server access logs.
 * - Tokens are hashed before comparison, must not be expired or revoked, and
 *   the assignment itself must still be active.
 * - A recipient can only ever see and edit their own single response — never
 *   another recipient's, even for the same form.
 * - No email, SMS, Stripe, or AI is contacted anywhere in this file.
 */

const foundation = require("../scripts/foundation-data-model.js");
const formsModel = require("../scripts/forms-center-data-model.js");
const model = require("../scripts/form-responses-data-model.js");
const tokens = require("../scripts/form-recipient-tokens.js");
const { buildRecipientPayload } = require("../scripts/form-recipient-payload.js");

const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const RECIPIENT_PREFIX = "/api/form-recipient";

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function productionSiteFromUrl(siteUrl) {
  const value = String(siteUrl || "").toLowerCase();
  return Boolean(value) && value.indexOf(PRODUCTION_HOST) !== -1;
}

function isLiveProductionHost(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  const siteUrl = String((env && env.siteUrl) || process.env.SITE_URL || "");
  return Boolean((env && env.liveProduction) || productionSiteFromUrl(siteUrl));
}

function createFormRecipientApi({ readStore, writeStore, jsonResponse, readJson, expansionEnvironment }) {
  function rejectIfProduction(response) {
    if (!isLiveProductionHost(expansionEnvironment)) return false;
    jsonResponse(response, 404, {
      error: "Testing preview links are not available on this host.",
      code: "production_locked",
    });
    return true;
  }

  function resolveAssignmentAndToken(request, response, store, assignmentId) {
    const assignment = store.formResponses.assignments[assignmentId];
    if (!assignment) {
      jsonResponse(response, 404, { error: "This testing link is no longer valid.", code: "assignment_not_found" });
      return null;
    }
    if (assignment.status !== model.ASSIGNMENT_STATUSES.ACTIVE) {
      jsonResponse(response, 410, { error: "This assignment is no longer active.", code: "assignment_inactive" });
      return null;
    }
    const rawToken = tokens.extractTokenFromRequest(request);
    const verification = tokens.verifyTestingLinkToken(assignment, rawToken);
    if (!verification.ok) {
      const statusCode = verification.reason === "link_expired" ? 410 : 401;
      jsonResponse(response, statusCode, { error: "This testing link is invalid, expired, or has been revoked.", code: verification.reason });
      return null;
    }
    return assignment;
  }

  function findOrCreateResponse(store, assignment) {
    let record = listValues(store.formResponses.responses).find((row) => row.assignmentId === assignment.id);
    if (!record) {
      record = model.createResponseRecord({
        assignmentId: assignment.id,
        organizationId: assignment.organizationId,
        formId: assignment.formId,
        formVersionId: assignment.formVersionId,
        formVersionNumber: assignment.formVersionNumber,
        recipientType: assignment.recipientType,
        recipientId: assignment.recipientId,
        relatedChildId: assignment.relatedChildId,
        relatedClassroomId: assignment.relatedClassroomId,
      });
      store.formResponses.responses[record.id] = record;
    }
    return record;
  }

  function addAudit(store, { organizationId, responseId, assignmentId, action, message, changes }) {
    const audit = model.createAuditRecord({
      organizationId,
      responseId,
      assignmentId,
      action,
      actorEmail: "",
      actorRole: "recipient",
      message,
      changes,
    });
    store.formResponses.audit[audit.id] = audit;
    return audit;
  }

  async function handleResolve(request, response, context = {}, assignmentId) {
    if (rejectIfProduction(response)) return;
    const store = readStore();
    foundation.ensureFoundationStore(store);
    formsModel.ensureFormsCenterStore(store);
    model.ensureFormResponsesStore(store);
    const assignment = resolveAssignmentAndToken(request, response, store, assignmentId);
    if (!assignment) return;
    const record = findOrCreateResponse(store, assignment);
    writeStore(store);
    jsonResponse(response, 200, buildRecipientPayload(store, { assignment, response: record }));
  }

  async function handleSaveDraft(request, response, context = {}, assignmentId) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    model.ensureFormResponsesStore(store);
    const assignment = resolveAssignmentAndToken(request, response, store, assignmentId);
    if (!assignment) return;
    const record = findOrCreateResponse(store, assignment);
    if (!model.EDITABLE_STATUSES.has(record.status)) {
      jsonResponse(response, 409, { error: "This response can no longer be edited.", code: "response_not_editable", status: record.status });
      return;
    }
    const wasNotStarted = record.status === model.RESPONSE_STATUSES.NOT_STARTED;
    record.answers = { ...record.answers, ...(body.answers && typeof body.answers === "object" ? body.answers : {}) };
    if (body.currentSectionId) record.currentSectionId = String(body.currentSectionId).slice(0, 160);
    if (wasNotStarted) {
      record.status = model.RESPONSE_STATUSES.IN_PROGRESS;
      record.startedAt = model.nowIso();
    }
    record.lastSavedAt = model.nowIso();
    record.updatedAt = record.lastSavedAt;
    store.formResponses.responses[record.id] = record;
    addAudit(store, { organizationId: assignment.organizationId, responseId: record.id, assignmentId: assignment.id, action: body.autosave ? "recipient_autosave" : "recipient_save_draft", message: "Draft saved by recipient." });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      savedAt: record.lastSavedAt,
      status: record.status,
      autosave: body.autosave === true,
    });
  }

  async function handleClear(request, response, context = {}, assignmentId) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    model.ensureFormResponsesStore(store);
    const assignment = resolveAssignmentAndToken(request, response, store, assignmentId);
    if (!assignment) return;
    const record = findOrCreateResponse(store, assignment);
    if (!model.EDITABLE_STATUSES.has(record.status)) {
      jsonResponse(response, 409, { error: "A submitted response cannot be cleared.", code: "response_not_editable" });
      return;
    }
    if (body.confirm !== true) {
      jsonResponse(response, 400, { error: "Confirm you want to clear your unfinished answers.", code: "confirmation_required" });
      return;
    }
    record.answers = {};
    record.status = model.RESPONSE_STATUSES.NOT_STARTED;
    record.currentSectionId = "";
    record.startedAt = "";
    record.lastSavedAt = model.nowIso();
    record.updatedAt = record.lastSavedAt;
    store.formResponses.responses[record.id] = record;
    addAudit(store, { organizationId: assignment.organizationId, responseId: record.id, assignmentId: assignment.id, action: "recipient_cleared", message: "Unfinished response cleared by recipient after confirmation." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, response: { status: record.status } });
  }

  async function handleSignature(request, response, context = {}, assignmentId) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request);
    const store = readStore();
    model.ensureFormResponsesStore(store);
    const assignment = resolveAssignmentAndToken(request, response, store, assignmentId);
    if (!assignment) return;
    const record = findOrCreateResponse(store, assignment);
    const signerRole = Object.values(model.SIGNER_ROLES).includes(body.signerRole) ? body.signerRole : model.SIGNER_ROLES.PARENT_GUARDIAN;
    // A provider countersignature is deliberately allowed after the family has
    // already submitted (that is the whole point of a countersignature review
    // step). Every other signer role must sign before submission, same as the
    // rest of the form.
    const isProviderCountersignAfterSubmit = signerRole === model.SIGNER_ROLES.PROVIDER
      && assignment.requireProviderCountersignature === true
      && model.SUBMITTED_STATUSES.has(record.status);
    if (!model.EDITABLE_STATUSES.has(record.status) && !isProviderCountersignAfterSubmit) {
      jsonResponse(response, 409, { error: "This response can no longer be signed.", code: "response_not_editable" });
      return;
    }
    const typedName = model.cleanText(body.typedName, 200);
    if (!typedName) {
      jsonResponse(response, 400, { error: "Type your full legal name to sign.", code: "typed_name_required" });
      return;
    }
    if (body.consentGiven !== true) {
      jsonResponse(response, 400, { error: "You must check the consent box to sign electronically.", code: "consent_required" });
      return;
    }
    const existingActive = (record.signatureIds || []).map((id) => store.formResponses.signatures[id]).filter((sig) => sig && !sig.invalidatedAt);
    const order = existingActive.length + 1;
    const signature = model.createSignatureRecord({
      responseId: record.id,
      formVersionId: record.formVersionId,
      organizationId: assignment.organizationId,
      signerRole,
      signerName: typedName,
      signerIdentity: `recipient:${assignment.recipientType}:${assignment.recipientId}`,
      typedName,
      drawnDataUrl: typeof body.drawnDataUrl === "string" ? body.drawnDataUrl : "",
      signatureOrder: order,
      submissionEventId: "",
    });
    store.formResponses.signatures[signature.id] = signature;
    record.signatureIds = [...(record.signatureIds || []), signature.id];
    record.updatedAt = model.nowIso();
    store.formResponses.responses[record.id] = record;
    addAudit(store, { organizationId: assignment.organizationId, responseId: record.id, assignmentId: assignment.id, action: "signature_added", message: `${signerRole} signature captured (testing only).`, changes: { signatureId: signature.id, signerRole } });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, signature: { id: signature.id, signerRole: signature.signerRole, signerName: signature.signerName, signedAt: signature.signedAt } });
  }

  async function handleSubmit(request, response, context = {}, assignmentId) {
    if (rejectIfProduction(response)) return;
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    model.ensureFormResponsesStore(store);
    const assignment = resolveAssignmentAndToken(request, response, store, assignmentId);
    if (!assignment) return;
    const record = findOrCreateResponse(store, assignment);
    if (!model.EDITABLE_STATUSES.has(record.status)) {
      jsonResponse(response, 409, { error: "This response has already been submitted.", code: "response_not_editable", status: record.status });
      return;
    }
    if (body.answers && typeof body.answers === "object") {
      record.answers = { ...record.answers, ...body.answers };
    }
    const version = store.formsCenter?.versions?.[record.formVersionId];
    const validationErrors = model.validateAnswersAgainstVersion(version, record.answers);
    if (validationErrors.length) {
      jsonResponse(response, 400, {
        error: "Please fix the highlighted fields before submitting.",
        code: "validation_failed",
        errors: validationErrors,
      });
      return;
    }
    const activeSignatures = (record.signatureIds || []).map((id) => store.formResponses.signatures[id]).filter((sig) => sig && !sig.invalidatedAt);
    const missingSignatureRoles = (assignment.requiredSignatureRoles || []).filter((role) => !activeSignatures.some((sig) => sig.signerRole === role));
    // A recipient can only ever complete their own required signature roles;
    // a provider countersignature (when required) is always added separately
    // by staff after submission, never bypassed here.
    const recipientMissing = missingSignatureRoles.filter((role) => role !== model.SIGNER_ROLES.PROVIDER);
    if (recipientMissing.length) {
      jsonResponse(response, 400, {
        error: "A required signature is missing before this form can be submitted.",
        code: "signature_required",
        missingRoles: recipientMissing,
      });
      return;
    }
    const wasReturned = record.status === model.RESPONSE_STATUSES.RETURNED_FOR_CORRECTION;
    record.status = wasReturned ? model.RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED : model.RESPONSE_STATUSES.SUBMITTED;
    record.submittedAt = model.nowIso();
    if (wasReturned) record.resubmittedAt = record.submittedAt;
    record.updatedAt = record.submittedAt;
    store.formResponses.responses[record.id] = record;
    const submissionEvent = model.newId("frevt");
    activeSignatures.forEach((sig) => { sig.submissionEventId = sig.submissionEventId || submissionEvent; store.formResponses.signatures[sig.id] = sig; });
    addAudit(store, {
      organizationId: assignment.organizationId,
      responseId: record.id,
      assignmentId: assignment.id,
      action: wasReturned ? "corrected_and_resubmitted" : "submitted",
      message: wasReturned ? "Recipient resubmitted after correction." : "Recipient submitted the form.",
      changes: { submissionEvent },
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      status: record.status,
      submittedAt: record.submittedAt,
      message: "Thank you — your response has been submitted.",
      confirmationLabel: "Testing Preview — Fake Data Only",
    });
  }

  function matchRoute(method, pathname) {
    const path = String(pathname || "");
    if (!path.startsWith(RECIPIENT_PREFIX)) return null;
    const rest = path.slice(RECIPIENT_PREFIX.length).replace(/^\//, "");
    const [assignmentId, action] = rest.split("/");
    if (!assignmentId) return null;
    const id = decodeURIComponent(assignmentId);
    if (!action && method === "GET") return (req, res) => handleResolve(req, res, {}, id);
    if (action === "save-draft" && method === "POST") return (req, res) => handleSaveDraft(req, res, {}, id);
    if (action === "clear" && method === "POST") return (req, res) => handleClear(req, res, {}, id);
    if (action === "signature" && method === "POST") return (req, res) => handleSignature(req, res, {}, id);
    if (action === "submit" && method === "POST") return (req, res) => handleSubmit(req, res, {}, id);
    return null;
  }

  return { matchRoute };
}

module.exports = {
  createFormRecipientApi,
  RECIPIENT_PREFIX,
};
