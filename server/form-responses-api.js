/**
 * Phase 6 Form Assignment / Response / Signature admin API — private preview.
 * Mounted under /api/forms-center/assignments/*, /api/forms-center/responses/*,
 * /api/forms-center/children/*, /api/forms-center/staff/*, /api/forms-center/classrooms/*,
 * /api/forms-center/program/*. Shares the existing Forms Center private-preview
 * gate (formsCenter flag + ALLOW_FORMS_CENTER_ADMIN_PREVIEW + verified admin).
 *
 * Recipients never use this API — see server/form-recipient-api.js for the
 * separate, ungated, token-authenticated recipient routes.
 */

const foundation = require("../scripts/foundation-data-model.js");
const entitlements = require("../scripts/entitlement-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const formsModel = require("../scripts/forms-center-data-model.js");
const libraryModel = require("../scripts/built-in-form-library-data-model.js");
const model = require("../scripts/form-responses-data-model.js");
const tokens = require("../scripts/form-recipient-tokens.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const fixtures = require("../scripts/form-responses-fixtures.js");
const { buildRecipientPayload } = require("../scripts/form-recipient-payload.js");

const PRODUCTION_HOST = "littlelearnershubbyleah.com";

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
    allowFormsCenterAdminPreview: !liveProduction && truthy(process.env.ALLOW_FORMS_CENTER_ADMIN_PREVIEW),
    siteUrl,
  };
}

function previewHeaderAllowed(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") env = fallbackExpansionEnvironment();
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const production = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    allowed: env.allowFormsCenterAdminPreview === true && !production,
    environment: { liveProduction: production, allowFormsCenterAdminPreview: env.allowFormsCenterAdminPreview === true, siteUrl },
  };
}

function findOwnerMembership(store, organizationId, adminEmail) {
  const email = safeLower(adminEmail);
  return listValues(store.staffMemberships).find((member) => (
    member
    && member.organizationId === organizationId
    && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
    && (!email || safeLower(member.userEmail) === email)
    && member.status === foundation.STAFF_STATUS.ACTIVE
  )) || listValues(store.staffMemberships).find((member) => (
    member && member.organizationId === organizationId && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
  )) || null;
}

function actorFromMembership(member) {
  if (!member) return { userId: "", email: "", role: "", membershipId: "" };
  return {
    userId: member.userId || "",
    email: member.userEmail || "",
    role: member.role || "",
    membershipId: member.id || "",
    displayName: member.displayName || "",
  };
}

function resolveActor(store, request, organizationId, adminEmail, expansionEnvironment) {
  const owner = findOwnerMembership(store, organizationId, adminEmail);
  const ownerActor = actorFromMembership(owner);
  const policy = previewHeaderAllowed(expansionEnvironment);
  const requested = getHeader(request, "x-llh-role-preview-membership-id");
  if (!requested) return { actor: ownerActor, membership: owner };
  if (!policy.allowed) return { actor: ownerActor, membership: owner };
  const member = store.staffMemberships && store.staffMemberships[requested] ? store.staffMemberships[requested] : null;
  if (!member || member.organizationId !== organizationId) return { actor: ownerActor, membership: owner };
  return { actor: actorFromMembership(member), membership: member };
}

function resolveEntitlement(store, organizationId) {
  return listValues(store.organizationEntitlements).find((row) => row.organizationId === organizationId) || null;
}

function entitlementAllowsForms(entitlement) {
  if (!entitlement) return true;
  if (Array.isArray(entitlement.featureEntitlements)) {
    return entitlement.featureEntitlements.includes(entitlements.FEATURE_ENTITLEMENTS.FORMS_CENTER);
  }
  return entitlements.resolvePlanFeatures(entitlement.basePlanKey).includes(entitlements.FEATURE_ENTITLEMENTS.FORMS_CENTER);
}

function activeStatus(value) {
  return !value || value === foundation.ASSIGNMENT_STATUS.ACTIVE || value === foundation.STAFF_STATUS.ACTIVE;
}

function activeClassroomIdsForStaff(store, organizationId, userId) {
  return orgPermissions.activeClassroomIdsForStaff(store, organizationId, userId);
}

function classroomIdsForChild(store, organizationId, childId) {
  return orgPermissions.classroomIdsForChild(store, organizationId, childId);
}

function accessDecision(store, actor, organizationId, action, options = {}) {
  return orgPermissions.evaluateAccess({
    store,
    actor,
    organizationId,
    action,
    classroomId: options.classroomId || "",
    childId: options.childId || "",
  });
}

function verifiedGuardianIdsForChild(store, organizationId, childId) {
  return listValues(store.childGuardianRelationships)
    .filter((row) => row.organizationId === organizationId && row.childId === childId && row.verified === true && activeStatus(row.status))
    .map((row) => row.guardianId);
}

function findFormAndVersion(store, organizationId, formId, requestedVersionId) {
  const form = store.formsCenter?.forms?.[formId];
  if (!form || form.organizationId !== organizationId) return { form: null, version: null };
  if (requestedVersionId) {
    const version = store.formsCenter.versions[requestedVersionId];
    if (version && version.formId === formId) return { form, version };
  }
  const publishedVersionId = form.publishedVersionId;
  const version = publishedVersionId ? store.formsCenter.versions[publishedVersionId] : null;
  return { form, version };
}

function findTemplateForForm(store, form) {
  if (!form || !form.sourceTemplateId) return null;
  return store.builtInFormLibrary?.templates?.[form.sourceTemplateId] || null;
}

// ── Response summary / view helpers ──────────────────────────────────────────

/**
 * "Overdue" is always a computed, non-destructive view (past due date and
 * still editable) — it never silently mutates status. "Expired" remains a
 * distinct, explicitly set status (see handleMarkExpired) so the two states
 * stay separately observable and testable, exactly as the dashboard requires.
 */
function isOverdue(response, assignment) {
  if (!response || !assignment || !assignment.dueDate) return false;
  if (!model.EDITABLE_STATUSES.has(response.status)) return false;
  const due = new Date(`${assignment.dueDate}T23:59:59.999Z`).getTime();
  return Number.isFinite(due) && Date.now() > due;
}

function recipientDisplayLabel(store, assignment) {
  if (assignment.recipientType === model.RECIPIENT_TYPES.CHILD) {
    return store.childRecords?.[assignment.recipientId]?.displayName || assignment.recipientLabel || "Child";
  }
  if (assignment.recipientType === model.RECIPIENT_TYPES.GUARDIAN) {
    const guardian = store.guardians?.[assignment.recipientId];
    return guardian?.displayName || guardian?.email || assignment.recipientLabel || "Guardian";
  }
  if (assignment.recipientType === model.RECIPIENT_TYPES.STAFF) {
    return store.staffMemberships?.[assignment.recipientId]?.displayName || assignment.recipientLabel || "Staff member";
  }
  if (assignment.recipientType === model.RECIPIENT_TYPES.CLASSROOM) {
    return store.classrooms?.[assignment.recipientId]?.name || assignment.recipientLabel || "Classroom";
  }
  return "Entire program";
}

function summarizeAssignment(store, assignment) {
  const form = store.formsCenter?.forms?.[assignment.formId];
  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    formId: assignment.formId,
    formTitle: form?.title || "",
    formCategory: form?.category || "",
    formVersionNumber: assignment.formVersionNumber,
    recipientType: assignment.recipientType,
    recipientId: assignment.recipientId,
    recipientLabel: recipientDisplayLabel(store, assignment),
    relatedChildId: assignment.relatedChildId,
    relatedChildName: assignment.relatedChildId ? (store.childRecords?.[assignment.relatedChildId]?.displayName || "") : "",
    relatedClassroomId: assignment.relatedClassroomId,
    relatedClassroomName: assignment.relatedClassroomId ? (store.classrooms?.[assignment.relatedClassroomId]?.name || "") : "",
    dueDate: assignment.dueDate,
    instructions: assignment.instructions,
    required: assignment.required,
    reusable: assignment.reusable,
    requiredSignatureRoles: assignment.requiredSignatureRoles,
    requireProviderCountersignature: assignment.requireProviderCountersignature,
    editableAfterSubmission: assignment.editableAfterSubmission,
    reminder: assignment.reminder,
    versionPolicy: assignment.versionPolicy,
    status: assignment.status,
    testingLinkIssued: Boolean(assignment.testingLinkTokenHash),
    testingLinkExpiresAt: assignment.testingLinkExpiresAt,
    testingLinkRevoked: assignment.testingLinkRevoked,
    testingLinkExpired: assignment.testingLinkTokenHash ? tokens.isExpired(assignment.testingLinkExpiresAt) : false,
    batchId: assignment.batchId,
    createdByEmail: assignment.createdByEmail,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

function newerVersionAvailable(store, assignment) {
  const form = store.formsCenter?.forms?.[assignment.formId];
  if (form && Number(form.latestVersionNumber || 0) > Number(assignment.formVersionNumber || 0)) return true;
  const template = findTemplateForForm(store, form);
  if (template && Number(template.currentVersionNumber || 0) > Number(form?.sourceTemplateVersionNumber || 0)) return true;
  return false;
}

function summarizeResponse(store, response, { includeAnswers = false } = {}) {
  const assignment = store.formResponses.assignments[response.assignmentId];
  const version = store.formsCenter?.versions?.[response.formVersionId];
  const progress = model.completionProgress(version, response.answers);
  const signatures = (response.signatureIds || [])
    .map((id) => store.formResponses.signatures[id])
    .filter(Boolean);
  const activeSignatures = signatures.filter((sig) => !sig.invalidatedAt);
  const summary = {
    id: response.id,
    assignmentId: response.assignmentId,
    organizationId: response.organizationId,
    formId: response.formId,
    formTitle: store.formsCenter?.forms?.[response.formId]?.title || "",
    formVersionId: response.formVersionId,
    formVersionNumber: response.formVersionNumber,
    recipientType: response.recipientType,
    recipientId: response.recipientId,
    recipientLabel: assignment ? recipientDisplayLabel(store, assignment) : "",
    relatedChildId: response.relatedChildId,
    relatedChildName: response.relatedChildId ? (store.childRecords?.[response.relatedChildId]?.displayName || "") : "",
    relatedClassroomId: response.relatedClassroomId,
    relatedClassroomName: response.relatedClassroomId ? (store.classrooms?.[response.relatedClassroomId]?.name || "") : "",
    status: response.status,
    statusLabel: model.RESPONSE_STATUS_LABELS[response.status] || response.status,
    dueDate: assignment?.dueDate || "",
    overdue: isOverdue(response, assignment),
    progress,
    signatureCount: activeSignatures.length,
    requiredSignatureRoles: assignment?.requiredSignatureRoles || [],
    signaturesSatisfied: assignment
      ? assignment.requiredSignatureRoles.every((role) => activeSignatures.some((sig) => sig.signerRole === role))
      : true,
    awaitingProviderCountersignature: Boolean(assignment?.requireProviderCountersignature)
      && !activeSignatures.some((sig) => sig.signerRole === model.SIGNER_ROLES.PROVIDER),
    internalNoteCount: (response.internalNotes || []).length,
    voidReason: response.voidReason,
    returnMessage: response.returnMessage,
    lastSavedAt: response.lastSavedAt,
    startedAt: response.startedAt,
    submittedAt: response.submittedAt,
    approvedAt: response.approvedAt,
    returnedAt: response.returnedAt,
    voidedAt: response.voidedAt,
    archivedAt: response.archivedAt,
    newerVersionAvailable: newerVersionAvailable(store, assignment || {}),
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
  if (includeAnswers) {
    summary.answers = response.answers;
    summary.signatures = signatures;
    summary.internalNotes = response.internalNotes;
    summary.version = version;
    summary.assignment = assignment ? summarizeAssignment(store, assignment) : null;
  }
  return summary;
}

function addAudit(store, { organizationId, responseId, assignmentId, action, actor, message, changes }) {
  const audit = model.createAuditRecord({
    organizationId,
    responseId,
    assignmentId,
    action,
    actorEmail: actor?.email || "",
    actorRole: actor?.role || "",
    message,
    changes,
  });
  store.formResponses.audit[audit.id] = audit;
  return audit;
}

function createFormResponsesApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function prepare(request, context) {
    const store = readStore();
    foundation.ensureFoundationStore(store);
    formsModel.ensureFormsCenterStore(store);
    libraryModel.ensureBuiltInFormLibraryStore(store);
    model.ensureFormResponsesStore(store);
    const adminEmail = context?.adminEmail || "";
    const organization = formsFixtures.ensurePreviewOrganization(store, { adminEmail });
    // Idempotent: ensures the owner/teacher/assistant memberships and baseline
    // fixture scenarios exist so every admin action (not just the dashboard)
    // can resolve a valid organization-member actor. Persisted immediately so
    // every handler sees the same fixture IDs, even read-only ones that don't
    // otherwise call writeStore.
    const seedResult = fixtures.ensurePhase6Preview(store, { adminEmail, organizationId: organization.id });
    if (seedResult.seeded) writeStore(store);
    const entitlement = resolveEntitlement(store, organization.id);
    const { actor, membership } = resolveActor(store, request, organization.id, adminEmail, expansionEnvironment);
    return { store, organization, entitlement, actor, membership };
  }

  function rejectEntitlement(response, entitlement) {
    if (entitlementAllowsForms(entitlement)) return false;
    jsonResponse(response, 403, {
      error: "Forms Center is not included with this preview plan. Upgrade from Curriculum Only to use assignments and responses.",
      code: "forms_center_entitlement_required",
      plan: entitlement?.basePlanKey || "",
    });
    return true;
  }

  function rejectAccess(response, decision) {
    if (decision.allowed) return false;
    jsonResponse(response, 403, { error: "Access denied.", code: decision.reason || "access_denied", decision });
    return true;
  }

  function findAssignmentOr404(response, store, organizationId, assignmentId) {
    const assignment = store.formResponses.assignments[assignmentId];
    if (!assignment) {
      jsonResponse(response, 404, { error: "Assignment was not found.", code: "assignment_not_found" });
      return null;
    }
    if (assignment.organizationId !== organizationId) {
      jsonResponse(response, 403, { error: "That assignment belongs to a different organization.", code: "organization_mismatch" });
      return null;
    }
    return assignment;
  }

  function findResponseOr404(response, store, organizationId, responseId) {
    const record = store.formResponses.responses[responseId];
    if (!record) {
      jsonResponse(response, 404, { error: "Response was not found.", code: "response_not_found" });
      return null;
    }
    if (record.organizationId !== organizationId) {
      jsonResponse(response, 403, { error: "That response belongs to a different organization.", code: "organization_mismatch" });
      return null;
    }
    return record;
  }

  function resolveResponseAccessDecision(store, actor, response) {
    if (response.recipientType === model.RECIPIENT_TYPES.CLASSROOM) {
      return accessDecision(store, actor, response.organizationId, orgPermissions.ACTIONS.FORM_RESPONSE_VIEW, { classroomId: response.recipientId });
    }
    if (response.relatedClassroomId) {
      return accessDecision(store, actor, response.organizationId, orgPermissions.ACTIONS.FORM_RESPONSE_VIEW, { classroomId: response.relatedClassroomId });
    }
    if (response.relatedChildId) {
      return accessDecision(store, actor, response.organizationId, orgPermissions.ACTIONS.FORM_RESPONSE_VIEW, { childId: response.relatedChildId });
    }
    return accessDecision(store, actor, response.organizationId, orgPermissions.ACTIONS.FORM_RESPONSE_VIEW, {});
  }

  // ── Assignment creation ────────────────────────────────────────────────────

  function resolveRecipientIds(store, organizationId, body) {
    const type = body.recipientType;
    if (type === model.RECIPIENT_TYPES.GUARDIAN && body.allVerifiedGuardiansForChild === true) {
      return verifiedGuardianIdsForChild(store, organizationId, body.relatedChildId);
    }
    if (type === model.RECIPIENT_TYPES.PROGRAM) {
      return [organizationId];
    }
    const ids = Array.isArray(body.recipientIds) ? body.recipientIds : (body.recipientId ? [body.recipientId] : []);
    return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  }

  function recipientExistsAndInOrg(store, organizationId, type, id) {
    if (type === model.RECIPIENT_TYPES.CHILD) return store.childRecords?.[id]?.organizationId === organizationId;
    if (type === model.RECIPIENT_TYPES.GUARDIAN) {
      return listValues(store.childGuardianRelationships).some((row) => row.organizationId === organizationId && row.guardianId === id);
    }
    if (type === model.RECIPIENT_TYPES.STAFF) return store.staffMemberships?.[id]?.organizationId === organizationId;
    if (type === model.RECIPIENT_TYPES.CLASSROOM) return store.classrooms?.[id]?.organizationId === organizationId;
    if (type === model.RECIPIENT_TYPES.PROGRAM) return id === organizationId;
    return false;
  }

  async function handleCreateAssignments(request, response, context = {}) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decision = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_ASSIGNMENT_CREATE, {
      classroomId: body.relatedClassroomId || (body.recipientType === model.RECIPIENT_TYPES.CLASSROOM ? "" : ""),
    });
    if (rejectAccess(response, decision)) return;

    const { form, version } = findFormAndVersion(ctx.store, ctx.organization.id, body.formId, body.formVersionId);
    if (!form) {
      jsonResponse(response, 404, { error: "Form was not found in this organization.", code: "form_not_found" });
      return;
    }
    if (form.status !== formsModel.FORM_STATUSES.PUBLISHED || !version) {
      jsonResponse(response, 409, { error: "Publish this form before assigning it.", code: "form_not_published" });
      return;
    }
    if (!Object.values(model.RECIPIENT_TYPES).includes(body.recipientType)) {
      jsonResponse(response, 400, { error: "A valid recipientType is required.", code: "recipient_type_required" });
      return;
    }
    const recipientIds = resolveRecipientIds(ctx.store, ctx.organization.id, body);
    if (!recipientIds.length) {
      jsonResponse(response, 400, { error: "At least one recipient is required.", code: "recipients_required" });
      return;
    }
    const invalidRecipient = recipientIds.find((id) => !recipientExistsAndInOrg(ctx.store, ctx.organization.id, body.recipientType, id));
    if (invalidRecipient) {
      jsonResponse(response, 403, { error: "One or more recipients could not be verified in this organization.", code: "organization_mismatch", recipientId: invalidRecipient });
      return;
    }

    const batchId = recipientIds.length > 1 ? model.newId("frbatch") : "";
    const created = [];
    recipientIds.forEach((recipientId) => {
      const assignment = model.createAssignmentRecord({
        organizationId: ctx.organization.id,
        formId: form.id,
        formVersionId: version.id,
        formVersionNumber: version.versionNumber,
        builtInSourceTemplateId: form.sourceTemplateId || "",
        recipientType: body.recipientType,
        recipientId,
        relatedChildId: body.recipientType === model.RECIPIENT_TYPES.GUARDIAN ? (body.relatedChildId || "") : (body.recipientType === model.RECIPIENT_TYPES.CHILD ? recipientId : (body.relatedChildId || "")),
        relatedClassroomId: body.recipientType === model.RECIPIENT_TYPES.CLASSROOM ? recipientId : (body.relatedClassroomId || ""),
        dueDate: body.dueDate || "",
        instructions: body.instructions || "",
        required: body.required !== false,
        reusable: body.reusable === true,
        requiredSignatureRoles: body.requiredSignatureRoles || [],
        requireProviderCountersignature: body.requireProviderCountersignature === true,
        editableAfterSubmission: body.editableAfterSubmission === true,
        reminderEnabled: body.reminderEnabled === true,
        reminderDaysBefore: body.reminderDaysBefore,
        versionPolicy: body.versionPolicy || model.VERSION_POLICIES.KEEP_ORIGINAL_VERSION,
        createdByEmail: ctx.actor.email || context.adminEmail,
        createdByMembershipId: ctx.actor.membershipId,
        batchId,
      });
      ctx.store.formResponses.assignments[assignment.id] = assignment;
      const resp = model.createResponseRecord({
        assignmentId: assignment.id,
        organizationId: ctx.organization.id,
        formId: form.id,
        formVersionId: version.id,
        formVersionNumber: version.versionNumber,
        recipientType: assignment.recipientType,
        recipientId: assignment.recipientId,
        relatedChildId: assignment.relatedChildId,
        relatedClassroomId: assignment.relatedClassroomId,
        createdByEmail: ctx.actor.email || context.adminEmail,
      });
      ctx.store.formResponses.responses[resp.id] = resp;
      addAudit(ctx.store, {
        organizationId: ctx.organization.id,
        responseId: resp.id,
        assignmentId: assignment.id,
        action: "assignment_created",
        actor: ctx.actor,
        message: `Assigned "${form.title}" to ${assignment.recipientType} ${recipientId}.`,
      });
      created.push({ assignment: summarizeAssignment(ctx.store, assignment), response: summarizeResponse(ctx.store, resp) });
    });
    writeStore(ctx.store);
    jsonResponse(response, 201, {
      ok: true,
      batchId,
      count: created.length,
      created,
      emailSent: false,
      smsSent: false,
    });
  }

  async function handleListAssignments(request, response, context = {}, url) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const formId = url.searchParams.get("formId") || "";
    let assignments = listValues(ctx.store.formResponses.assignments).filter((row) => row.organizationId === ctx.organization.id);
    if (formId) assignments = assignments.filter((row) => row.formId === formId);
    assignments = assignments.filter((row) => resolveResponseAccessDecision(ctx.store, ctx.actor, row).allowed);
    assignments.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    jsonResponse(response, 200, { ok: true, assignments: assignments.map((row) => summarizeAssignment(ctx.store, row)) });
  }

  // ── Testing link management ────────────────────────────────────────────────

  async function handleIssueTestingLink(request, response, context = {}, assignmentId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decisionCheck = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_ASSIGNMENT_MANAGE_LINKS, {});
    if (rejectAccess(response, decisionCheck)) return;
    const assignment = findAssignmentOr404(response, ctx.store, ctx.organization.id, assignmentId);
    if (!assignment) return;
    if (previewHeaderAllowed(expansionEnvironment).environment.liveProduction) {
      jsonResponse(response, 403, { error: "Testing links are never issued on a production host.", code: "production_locked" });
      return;
    }
    const issued = tokens.issueTestingLink({});
    assignment.testingLinkTokenHash = issued.tokenHash;
    assignment.testingLinkExpiresAt = issued.expiresAt;
    assignment.testingLinkRevoked = false;
    assignment.testingLinkCreatedAt = issued.createdAt;
    assignment.testingLinkRegeneratedCount = (Number(assignment.testingLinkRegeneratedCount) || 0) + 1;
    assignment.updatedAt = model.nowIso();
    ctx.store.formResponses.assignments[assignment.id] = assignment;
    addAudit(ctx.store, {
      organizationId: ctx.organization.id,
      assignmentId: assignment.id,
      action: "testing_link_issued",
      actor: ctx.actor,
      message: "Testing link issued or regenerated. Raw token is never stored.",
    });
    writeStore(ctx.store);
    jsonResponse(response, 200, {
      ok: true,
      assignment: summarizeAssignment(ctx.store, assignment),
      // Returned exactly once — never persisted or logged as plaintext.
      rawToken: issued.rawToken,
      expiresAt: issued.expiresAt,
      recipientPath: `/form-recipient.html#a=${encodeURIComponent(assignment.id)}&t=${encodeURIComponent(issued.rawToken)}`,
      label: "Testing Preview — Fake Data Only",
    });
  }

  async function handleRevokeTestingLink(request, response, context = {}, assignmentId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decisionCheck = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_ASSIGNMENT_MANAGE_LINKS, {});
    if (rejectAccess(response, decisionCheck)) return;
    const assignment = findAssignmentOr404(response, ctx.store, ctx.organization.id, assignmentId);
    if (!assignment) return;
    assignment.testingLinkRevoked = true;
    assignment.updatedAt = model.nowIso();
    ctx.store.formResponses.assignments[assignment.id] = assignment;
    addAudit(ctx.store, { organizationId: ctx.organization.id, assignmentId: assignment.id, action: "testing_link_revoked", actor: ctx.actor, message: "Testing link revoked." });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, assignment: summarizeAssignment(ctx.store, assignment) });
  }

  /**
   * Lets an administrator test a form exactly as a recipient would see it,
   * without needing a real family account or a testing link. Read-only: any
   * "save" the admin makes here still writes to the same response record, but
   * this endpoint itself never issues or requires a token.
   */
  async function handleRecipientPreview(request, response, context = {}, assignmentId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const assignment = findAssignmentOr404(response, ctx.store, ctx.organization.id, assignmentId);
    if (!assignment) return;
    const decisionCheck = resolveResponseAccessDecision(ctx.store, ctx.actor, assignment);
    if (rejectAccess(response, decisionCheck)) return;
    const record = listValues(ctx.store.formResponses.responses).find((row) => row.assignmentId === assignment.id);
    if (!record) {
      jsonResponse(response, 404, { error: "No response exists yet for this assignment.", code: "response_not_found" });
      return;
    }
    jsonResponse(response, 200, buildRecipientPayload(ctx.store, { assignment, response: record, previewOnly: true }));
  }

  async function handleRevokeAssignment(request, response, context = {}, assignmentId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decisionCheck = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_ASSIGNMENT_MANAGE_LINKS, {});
    if (rejectAccess(response, decisionCheck)) return;
    const assignment = findAssignmentOr404(response, ctx.store, ctx.organization.id, assignmentId);
    if (!assignment) return;
    assignment.status = model.ASSIGNMENT_STATUSES.REVOKED;
    assignment.testingLinkRevoked = true;
    assignment.revokedAt = model.nowIso();
    assignment.updatedAt = assignment.revokedAt;
    ctx.store.formResponses.assignments[assignment.id] = assignment;
    addAudit(ctx.store, { organizationId: ctx.organization.id, assignmentId: assignment.id, action: "assignment_revoked", actor: ctx.actor, message: "Assignment revoked." });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, assignment: summarizeAssignment(ctx.store, assignment) });
  }

  // ── Response dashboard ──────────────────────────────────────────────────────

  function matchesResponseFilters(store, row, filters) {
    if (filters.formId && row.formId !== filters.formId) return false;
    if (filters.category) {
      const form = store.formsCenter?.forms?.[row.formId];
      if (!form || form.category !== filters.category) return false;
    }
    if (filters.childId && row.relatedChildId !== filters.childId && !(row.recipientType === model.RECIPIENT_TYPES.CHILD && row.recipientId === filters.childId)) return false;
    if (filters.guardianId && !(row.recipientType === model.RECIPIENT_TYPES.GUARDIAN && row.recipientId === filters.guardianId)) return false;
    if (filters.staffId && !(row.recipientType === model.RECIPIENT_TYPES.STAFF && row.recipientId === filters.staffId)) return false;
    if (filters.classroomId && row.relatedClassroomId !== filters.classroomId && !(row.recipientType === model.RECIPIENT_TYPES.CLASSROOM && row.recipientId === filters.classroomId)) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.q) {
      const form = store.formsCenter?.forms?.[row.formId];
      const haystack = [form?.title, row.recipientId, row.relatedChildId].map((v) => String(v || "").toLowerCase());
      if (!haystack.some((v) => v.includes(filters.q))) return false;
    }
    return true;
  }

  async function handleResponsesDashboard(request, response, context = {}, url) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const filters = {
      formId: url.searchParams.get("formId") || "",
      category: url.searchParams.get("category") || "",
      childId: url.searchParams.get("childId") || "",
      guardianId: url.searchParams.get("guardianId") || "",
      staffId: url.searchParams.get("staffId") || "",
      classroomId: url.searchParams.get("classroomId") || "",
      status: url.searchParams.get("status") || "",
      q: safeLower(url.searchParams.get("q") || ""),
      view: url.searchParams.get("view") || "",
    };
    let rows = listValues(ctx.store.formResponses.responses).filter((row) => row.organizationId === ctx.organization.id);
    rows = rows.filter((row) => resolveResponseAccessDecision(ctx.store, ctx.actor, row).allowed);
    rows = rows.filter((row) => matchesResponseFilters(ctx.store, row, filters));

    const summaries = rows.map((row) => summarizeResponse(ctx.store, row));
    const now = Date.now();
    const dueSoonMs = 3 * 24 * 60 * 60 * 1000;
    let view = summaries;
    if (filters.view === "due_soon") {
      view = summaries.filter((row) => row.dueDate && model.EDITABLE_STATUSES.has(row.status) && new Date(`${row.dueDate}T23:59:59.999Z`).getTime() - now <= dueSoonMs && new Date(`${row.dueDate}T23:59:59.999Z`).getTime() >= now);
    } else if (filters.view === "overdue") {
      view = summaries.filter((row) => row.overdue || row.status === model.RESPONSE_STATUSES.EXPIRED);
    } else if (filters.view === "recently_submitted") {
      view = summaries.filter((row) => row.submittedAt).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    } else if (filters.view === "needs_review") {
      view = summaries.filter((row) => [model.RESPONSE_STATUSES.SUBMITTED, model.RESPONSE_STATUSES.UNDER_REVIEW, model.RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED].includes(row.status));
    } else if (filters.view === "returned") {
      view = summaries.filter((row) => row.status === model.RESPONSE_STATUSES.RETURNED_FOR_CORRECTION);
    } else if (filters.view === "completed") {
      view = summaries.filter((row) => row.status === model.RESPONSE_STATUSES.APPROVED);
    } else if (filters.view === "archived") {
      view = summaries.filter((row) => row.status === model.RESPONSE_STATUSES.ARCHIVED);
    }

    const counts = {};
    Object.values(model.RESPONSE_STATUSES).forEach((status) => { counts[status] = 0; });
    summaries.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });

    jsonResponse(response, 200, {
      ok: true,
      organizationId: ctx.organization.id,
      total: view.length,
      counts,
      dueSoonCount: summaries.filter((row) => row.dueDate && model.EDITABLE_STATUSES.has(row.status) && new Date(`${row.dueDate}T23:59:59.999Z`).getTime() - now <= dueSoonMs && new Date(`${row.dueDate}T23:59:59.999Z`).getTime() >= now).length,
      overdueCount: summaries.filter((row) => row.overdue || row.status === model.RESPONSE_STATUSES.EXPIRED).length,
      needsReviewCount: summaries.filter((row) => [model.RESPONSE_STATUSES.SUBMITTED, model.RESPONSE_STATUSES.UNDER_REVIEW, model.RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED].includes(row.status)).length,
      responses: view,
      emailSent: false,
      smsSent: false,
      aiTouched: false,
    });
  }

  async function handleGetResponse(request, response, context = {}, responseId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    const decisionCheck = resolveResponseAccessDecision(ctx.store, ctx.actor, record);
    if (rejectAccess(response, decisionCheck)) return;
    const audit = listValues(ctx.store.formResponses.audit)
      .filter((row) => row.responseId === responseId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    jsonResponse(response, 200, {
      ok: true,
      response: summarizeResponse(ctx.store, record, { includeAnswers: true }),
      audit,
      medicationLog: model.medicationLogHistory(ctx.store, record.id),
    });
  }

  function requireReviewAccess(response, ctx, record, action) {
    const decisionCheck = orgPermissions.evaluateAccess({
      store: ctx.store,
      actor: ctx.actor,
      organizationId: ctx.organization.id,
      action,
    });
    return rejectAccess(response, decisionCheck);
  }

  async function handleAddInternalNote(request, response, context = {}, responseId) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_REVIEW)) return;
    const note = { id: model.newId("frnote"), message: model.cleanLongText(body.message, 1000), authorEmail: ctx.actor.email || context.adminEmail, createdAt: model.nowIso() };
    record.internalNotes = [...(record.internalNotes || []), note];
    record.updatedAt = note.createdAt;
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "internal_note_added", actor: ctx.actor, message: note.message });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleMarkUnderReview(request, response, context = {}, responseId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_REVIEW)) return;
    if (![model.RESPONSE_STATUSES.SUBMITTED, model.RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED].includes(record.status)) {
      jsonResponse(response, 409, { error: "Only a submitted response can be marked under review.", code: "invalid_status_transition" });
      return;
    }
    record.status = model.RESPONSE_STATUSES.UNDER_REVIEW;
    record.reviewedAt = model.nowIso();
    record.updatedAt = record.reviewedAt;
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "marked_under_review", actor: ctx.actor, message: "Response marked under review." });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleApprove(request, response, context = {}, responseId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_APPROVE)) return;
    if (![model.RESPONSE_STATUSES.SUBMITTED, model.RESPONSE_STATUSES.UNDER_REVIEW, model.RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED].includes(record.status)) {
      jsonResponse(response, 409, { error: "Only a submitted response under review can be approved.", code: "invalid_status_transition" });
      return;
    }
    const assignment = ctx.store.formResponses.assignments[record.assignmentId];
    const activeSignatures = (record.signatureIds || []).map((id) => ctx.store.formResponses.signatures[id]).filter((sig) => sig && !sig.invalidatedAt);
    if (assignment?.requireProviderCountersignature && !activeSignatures.some((sig) => sig.signerRole === model.SIGNER_ROLES.PROVIDER)) {
      jsonResponse(response, 409, { error: "A provider countersignature is required before this response can be approved.", code: "provider_countersignature_required" });
      return;
    }
    record.status = model.RESPONSE_STATUSES.APPROVED;
    record.approvedAt = model.nowIso();
    record.updatedAt = record.approvedAt;
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "approved", actor: ctx.actor, message: "Response approved." });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleReturnForCorrection(request, response, context = {}, responseId) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_REVIEW)) return;
    if (![model.RESPONSE_STATUSES.SUBMITTED, model.RESPONSE_STATUSES.UNDER_REVIEW, model.RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED].includes(record.status)) {
      jsonResponse(response, 409, { error: "Only a submitted response can be returned for correction.", code: "invalid_status_transition" });
      return;
    }
    const message = model.cleanLongText(body.message, 1000);
    if (!message) {
      jsonResponse(response, 400, { error: "A correction message is required.", code: "correction_message_required" });
      return;
    }
    (record.signatureIds || []).forEach((sigId) => {
      const sig = ctx.store.formResponses.signatures[sigId];
      if (sig && !sig.invalidatedAt) model.invalidateSignature(sig, "Response was returned for correction; a new signature is required after resubmission.");
    });
    record.status = model.RESPONSE_STATUSES.RETURNED_FOR_CORRECTION;
    record.returnMessage = message;
    record.returnedAt = model.nowIso();
    record.updatedAt = record.returnedAt;
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "returned_for_correction", actor: ctx.actor, message, changes: { signaturesInvalidated: true } });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleReopen(request, response, context = {}, responseId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_REVIEW)) return;
    if ([model.RESPONSE_STATUSES.VOIDED, model.RESPONSE_STATUSES.ARCHIVED].includes(record.status)) {
      jsonResponse(response, 409, { error: "Restore this response before reopening it.", code: "invalid_status_transition" });
      return;
    }
    const assignment = ctx.store.formResponses.assignments[record.assignmentId];
    if (assignment && !assignment.editableAfterSubmission && model.SUBMITTED_STATUSES.has(record.status)) {
      jsonResponse(response, 409, { error: "This assignment does not allow edits after submission. Return it for correction instead.", code: "editing_not_allowed" });
      return;
    }
    (record.signatureIds || []).forEach((sigId) => {
      const sig = ctx.store.formResponses.signatures[sigId];
      if (sig && !sig.invalidatedAt) model.invalidateSignature(sig, "Response was reopened for editing; a new signature is required after resubmission.");
    });
    record.status = model.RESPONSE_STATUSES.IN_PROGRESS;
    record.updatedAt = model.nowIso();
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "reopened", actor: ctx.actor, message: "Response reopened for editing.", changes: { signaturesInvalidated: true } });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleVoid(request, response, context = {}, responseId) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_VOID)) return;
    const reason = model.cleanLongText(body.reason, 500);
    if (!reason) {
      jsonResponse(response, 400, { error: "A reason is required to void a response.", code: "void_reason_required" });
      return;
    }
    record.status = model.RESPONSE_STATUSES.VOIDED;
    record.voidReason = reason;
    record.voidedAt = model.nowIso();
    record.updatedAt = record.voidedAt;
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "voided", actor: ctx.actor, message: reason });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleDecline(request, response, context = {}, responseId) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_REVIEW)) return;
    if (![model.RESPONSE_STATUSES.NOT_STARTED, model.RESPONSE_STATUSES.IN_PROGRESS].includes(record.status)) {
      jsonResponse(response, 409, { error: "Only an incomplete response can be declined.", code: "invalid_status_transition" });
      return;
    }
    record.status = model.RESPONSE_STATUSES.DECLINED;
    record.updatedAt = model.nowIso();
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "declined", actor: ctx.actor, message: model.cleanLongText(body.reason || "Marked declined by staff on the recipient's behalf.", 500) });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleMarkExpired(request, response, context = {}, responseId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_REVIEW)) return;
    if (!model.EDITABLE_STATUSES.has(record.status)) {
      jsonResponse(response, 409, { error: "Only an incomplete response can be marked expired.", code: "invalid_status_transition" });
      return;
    }
    record.status = model.RESPONSE_STATUSES.EXPIRED;
    record.updatedAt = model.nowIso();
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "marked_expired", actor: ctx.actor, message: "Response marked expired (past due, never completed)." });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleArchive(request, response, context = {}, responseId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_ARCHIVE)) return;
    record.previousStatus = record.status;
    record.status = model.RESPONSE_STATUSES.ARCHIVED;
    record.archivedAt = model.nowIso();
    record.updatedAt = record.archivedAt;
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "archived", actor: ctx.actor, message: "Response archived." });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleRestore(request, response, context = {}, responseId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (requireReviewAccess(response, ctx, record, orgPermissions.ACTIONS.FORM_RESPONSE_ARCHIVE)) return;
    record.status = Object.values(model.RESPONSE_STATUSES).includes(record.previousStatus) ? record.previousStatus : model.RESPONSE_STATUSES.SUBMITTED;
    record.previousStatus = "";
    record.archivedAt = "";
    record.updatedAt = model.nowIso();
    ctx.store.formResponses.responses[record.id] = record;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: "restored", actor: ctx.actor, message: "Response restored from archive." });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, response: summarizeResponse(ctx.store, record, { includeAnswers: true }) });
  }

  async function handleBulkAction(request, response, context = {}) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const action = String(body.action || "");
    if (!["archive", "mark_under_review"].includes(action)) {
      jsonResponse(response, 400, { error: "Unsupported bulk action.", code: "unsupported_bulk_action" });
      return;
    }
    const results = [];
    ids.forEach((id) => {
      const record = ctx.store.formResponses.responses[id];
      if (!record || record.organizationId !== ctx.organization.id) { results.push({ id, ok: false, reason: "not_found" }); return; }
      const requiredAction = action === "archive" ? orgPermissions.ACTIONS.FORM_RESPONSE_ARCHIVE : orgPermissions.ACTIONS.FORM_RESPONSE_REVIEW;
      const decisionCheck = orgPermissions.evaluateAccess({ store: ctx.store, actor: ctx.actor, organizationId: ctx.organization.id, action: requiredAction });
      if (!decisionCheck.allowed) { results.push({ id, ok: false, reason: decisionCheck.reason }); return; }
      if (action === "archive") {
        record.previousStatus = record.status;
        record.status = model.RESPONSE_STATUSES.ARCHIVED;
        record.archivedAt = model.nowIso();
      } else if (action === "mark_under_review") {
        if (![model.RESPONSE_STATUSES.SUBMITTED, model.RESPONSE_STATUSES.CORRECTED_AND_RESUBMITTED].includes(record.status)) {
          results.push({ id, ok: false, reason: "invalid_status_transition" });
          return;
        }
        record.status = model.RESPONSE_STATUSES.UNDER_REVIEW;
        record.reviewedAt = model.nowIso();
      }
      record.updatedAt = model.nowIso();
      ctx.store.formResponses.responses[record.id] = record;
      addAudit(ctx.store, { organizationId: ctx.organization.id, responseId: record.id, assignmentId: record.assignmentId, action: `bulk_${action}`, actor: ctx.actor, message: `Bulk action: ${action}.` });
      results.push({ id, ok: true });
    });
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, results });
  }

  // ── Filing views (Child / Staff / Classroom / Program) ──────────────────────

  function filedResponsesFor(store, organizationId, predicate) {
    return listValues(store.formResponses.responses)
      .filter((row) => row.organizationId === organizationId && predicate(row))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function handleChildForms(request, response, context = {}, childId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decisionCheck = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_RESPONSE_VIEW, { childId });
    if (rejectAccess(response, decisionCheck)) return;
    const rows = filedResponsesFor(ctx.store, ctx.organization.id, (row) => (
      row.relatedChildId === childId || (row.recipientType === model.RECIPIENT_TYPES.CHILD && row.recipientId === childId)
    ));
    jsonResponse(response, 200, { ok: true, childId, responses: rows.map((row) => summarizeResponse(ctx.store, row)) });
  }

  async function handleStaffForms(request, response, context = {}, staffMembershipId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decisionCheck = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_RESPONSE_VIEW, {});
    if (rejectAccess(response, decisionCheck)) return;
    const rows = filedResponsesFor(ctx.store, ctx.organization.id, (row) => row.recipientType === model.RECIPIENT_TYPES.STAFF && row.recipientId === staffMembershipId);
    jsonResponse(response, 200, { ok: true, staffMembershipId, responses: rows.map((row) => summarizeResponse(ctx.store, row)) });
  }

  async function handleClassroomForms(request, response, context = {}, classroomId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decisionCheck = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_RESPONSE_VIEW, { classroomId });
    if (rejectAccess(response, decisionCheck)) return;
    const rows = filedResponsesFor(ctx.store, ctx.organization.id, (row) => (
      row.relatedClassroomId === classroomId || (row.recipientType === model.RECIPIENT_TYPES.CLASSROOM && row.recipientId === classroomId)
    ));
    jsonResponse(response, 200, { ok: true, classroomId, responses: rows.map((row) => summarizeResponse(ctx.store, row)) });
  }

  async function handleRecipientsDirectory(request, response, context = {}) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decisionCheck = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_ASSIGNMENT_CREATE, {});
    if (rejectAccess(response, decisionCheck)) return;
    const orgId = ctx.organization.id;
    const children = listValues(ctx.store.childRecords).filter((row) => row.organizationId === orgId).map((child) => ({
      id: child.id,
      displayName: child.displayName,
      guardians: listValues(ctx.store.childGuardianRelationships)
        .filter((row) => row.organizationId === orgId && row.childId === child.id)
        .map((row) => ({
          guardianId: row.guardianId,
          displayName: ctx.store.guardians?.[row.guardianId]?.displayName || ctx.store.guardians?.[row.guardianId]?.email || "Guardian",
          relationshipLabel: row.relationshipLabel,
          verified: row.verified === true,
        })),
    }));
    const staff = listValues(ctx.store.staffMemberships).filter((row) => row.organizationId === orgId).map((member) => ({
      id: member.id,
      displayName: member.displayName,
      role: member.role,
    }));
    const classrooms = listValues(ctx.store.classrooms).filter((row) => row.organizationId === orgId && row.status !== foundation.ASSIGNMENT_STATUS.ARCHIVED).map((room) => ({
      id: room.id,
      name: room.name,
    }));
    jsonResponse(response, 200, { ok: true, children, staff, classrooms, organizationId: orgId });
  }

  async function handleProgramForms(request, response, context = {}) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const decisionCheck = accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.FORM_RESPONSE_VIEW, {});
    if (rejectAccess(response, decisionCheck)) return;
    const rows = filedResponsesFor(ctx.store, ctx.organization.id, (row) => row.recipientType === model.RECIPIENT_TYPES.PROGRAM);
    jsonResponse(response, 200, { ok: true, organizationId: ctx.organization.id, responses: rows.map((row) => summarizeResponse(ctx.store, row)) });
  }

  // ── Medication administration log (admin view + corrections) ────────────────

  async function handleMedicationLogList(request, response, context = {}, responseId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (rejectAccess(response, resolveResponseAccessDecision(ctx.store, ctx.actor, record))) return;
    jsonResponse(response, 200, { ok: true, entries: model.medicationLogHistory(ctx.store, responseId) });
  }

  async function handleMedicationLogCreate(request, response, context = {}, responseId) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (rejectAccess(response, resolveResponseAccessDecision(ctx.store, ctx.actor, record))) return;
    const entry = model.createMedicationLogEntry({
      responseId,
      organizationId: ctx.organization.id,
      childId: record.relatedChildId,
      medicationName: body.medicationName,
      authorizationReference: body.authorizationReference,
      logDate: body.logDate,
      scheduledTime: body.scheduledTime,
      actualTime: body.actualTime,
      dosage: body.dosage,
      method: body.method,
      administeredByMembershipId: ctx.actor.membershipId,
      administeredByName: ctx.actor.displayName || ctx.actor.email,
      witnessMembershipId: body.witnessMembershipId,
      witnessName: body.witnessName,
      result: body.result,
      notes: body.notes,
      staffInitials: body.staffInitials,
      parentAcknowledged: body.parentAcknowledged === true,
    });
    ctx.store.formResponses.medicationLogEntries[entry.id] = entry;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId, assignmentId: record.assignmentId, action: "medication_log_entry_added", actor: ctx.actor, message: `Logged ${entry.result} for ${entry.medicationName || "medication"}.` });
    writeStore(ctx.store);
    jsonResponse(response, 201, { ok: true, entry });
  }

  async function handleMedicationLogCorrect(request, response, context = {}, responseId, entryId) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    const record = findResponseOr404(response, ctx.store, ctx.organization.id, responseId);
    if (!record) return;
    if (rejectAccess(response, resolveResponseAccessDecision(ctx.store, ctx.actor, record))) return;
    const original = ctx.store.formResponses.medicationLogEntries[entryId];
    if (!original || original.responseId !== responseId) {
      jsonResponse(response, 404, { error: "Medication log entry was not found.", code: "medication_entry_not_found" });
      return;
    }
    const correction = model.createMedicationLogEntry({
      responseId,
      organizationId: ctx.organization.id,
      childId: record.relatedChildId,
      medicationName: body.medicationName || original.medicationName,
      authorizationReference: original.authorizationReference,
      logDate: body.logDate || original.logDate,
      scheduledTime: body.scheduledTime || original.scheduledTime,
      actualTime: body.actualTime || original.actualTime,
      dosage: body.dosage || original.dosage,
      method: body.method || original.method,
      administeredByMembershipId: ctx.actor.membershipId,
      administeredByName: ctx.actor.displayName || ctx.actor.email,
      witnessMembershipId: body.witnessMembershipId || original.witnessMembershipId,
      witnessName: body.witnessName || original.witnessName,
      result: body.result || original.result,
      notes: model.cleanLongText(body.correctionNotes || body.notes || "", 1000),
      staffInitials: body.staffInitials || original.staffInitials,
      parentAcknowledged: body.parentAcknowledged === true,
      supersedesEntryId: original.id,
    });
    // The original entry is never rewritten — only marked as superseded, so the
    // full correction history remains permanently visible.
    original.supersededByEntryId = correction.id;
    ctx.store.formResponses.medicationLogEntries[original.id] = original;
    ctx.store.formResponses.medicationLogEntries[correction.id] = correction;
    addAudit(ctx.store, { organizationId: ctx.organization.id, responseId, assignmentId: record.assignmentId, action: "medication_log_entry_corrected", actor: ctx.actor, message: `Corrected entry ${original.id} without deleting it.`, changes: { supersedesEntryId: original.id } });
    writeStore(ctx.store);
    jsonResponse(response, 201, { ok: true, original, correction });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (method === "POST" && path === "/api/forms-center/assignments") return (req, res, ctx) => handleCreateAssignments(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/assignments") return (req, res, ctx) => handleListAssignments(req, res, ctx, url);
    const linkMatch = path.match(/^\/api\/forms-center\/assignments\/([^/]+)\/(testing-link\/issue|testing-link\/revoke|revoke)$/);
    if (linkMatch) {
      const id = decodeURIComponent(linkMatch[1]);
      if (method === "POST" && linkMatch[2] === "testing-link/issue") return (req, res, ctx) => handleIssueTestingLink(req, res, ctx, id);
      if (method === "POST" && linkMatch[2] === "testing-link/revoke") return (req, res, ctx) => handleRevokeTestingLink(req, res, ctx, id);
      if (method === "POST" && linkMatch[2] === "revoke") return (req, res, ctx) => handleRevokeAssignment(req, res, ctx, id);
    }
    const previewMatch = path.match(/^\/api\/forms-center\/assignments\/([^/]+)\/recipient-preview$/);
    if (previewMatch && method === "GET") {
      return (req, res, ctx) => handleRecipientPreview(req, res, ctx, decodeURIComponent(previewMatch[1]));
    }

    if (method === "GET" && path === "/api/forms-center/responses") return (req, res, ctx) => handleResponsesDashboard(req, res, ctx, url);
    if (method === "POST" && path === "/api/forms-center/responses/bulk") return (req, res, ctx) => handleBulkAction(req, res, ctx);
    if (method === "GET" && /^\/api\/forms-center\/responses\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split("/responses/")[1]);
      return (req, res, ctx) => handleGetResponse(req, res, ctx, id);
    }
    const respActionMatch = path.match(/^\/api\/forms-center\/responses\/([^/]+)\/([^/]+)$/);
    if (respActionMatch) {
      const id = decodeURIComponent(respActionMatch[1]);
      const action = respActionMatch[2];
      if (method === "POST" && action === "note") return (req, res, ctx) => handleAddInternalNote(req, res, ctx, id);
      if (method === "POST" && action === "mark-under-review") return (req, res, ctx) => handleMarkUnderReview(req, res, ctx, id);
      if (method === "POST" && action === "approve") return (req, res, ctx) => handleApprove(req, res, ctx, id);
      if (method === "POST" && action === "return-for-correction") return (req, res, ctx) => handleReturnForCorrection(req, res, ctx, id);
      if (method === "POST" && action === "reopen") return (req, res, ctx) => handleReopen(req, res, ctx, id);
      if (method === "POST" && action === "void") return (req, res, ctx) => handleVoid(req, res, ctx, id);
      if (method === "POST" && action === "decline") return (req, res, ctx) => handleDecline(req, res, ctx, id);
      if (method === "POST" && action === "mark-expired") return (req, res, ctx) => handleMarkExpired(req, res, ctx, id);
      if (method === "POST" && action === "archive") return (req, res, ctx) => handleArchive(req, res, ctx, id);
      if (method === "POST" && action === "restore") return (req, res, ctx) => handleRestore(req, res, ctx, id);
      if (method === "GET" && action === "medication-log") return (req, res, ctx) => handleMedicationLogList(req, res, ctx, id);
    }
    if (method === "POST" && /^\/api\/forms-center\/responses\/[^/]+\/medication-log$/.test(path)) {
      const id = decodeURIComponent(path.split("/responses/")[1].split("/medication-log")[0]);
      return (req, res, ctx) => handleMedicationLogCreate(req, res, ctx, id);
    }
    const medCorrectMatch = path.match(/^\/api\/forms-center\/responses\/([^/]+)\/medication-log\/([^/]+)\/correct$/);
    if (medCorrectMatch && method === "POST") {
      return (req, res, ctx) => handleMedicationLogCorrect(req, res, ctx, decodeURIComponent(medCorrectMatch[1]), decodeURIComponent(medCorrectMatch[2]));
    }

    if (method === "GET" && /^\/api\/forms-center\/children\/[^/]+\/forms$/.test(path)) {
      const id = decodeURIComponent(path.split("/children/")[1].split("/forms")[0]);
      return (req, res, ctx) => handleChildForms(req, res, ctx, id);
    }
    if (method === "GET" && /^\/api\/forms-center\/staff\/[^/]+\/forms$/.test(path)) {
      const id = decodeURIComponent(path.split("/staff/")[1].split("/forms")[0]);
      return (req, res, ctx) => handleStaffForms(req, res, ctx, id);
    }
    if (method === "GET" && /^\/api\/forms-center\/classrooms\/[^/]+\/forms$/.test(path)) {
      const id = decodeURIComponent(path.split("/classrooms/")[1].split("/forms")[0]);
      return (req, res, ctx) => handleClassroomForms(req, res, ctx, id);
    }
    if (method === "GET" && path === "/api/forms-center/program/forms") return (req, res, ctx) => handleProgramForms(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/recipients-directory") return (req, res, ctx) => handleRecipientsDirectory(req, res, ctx);

    return null;
  }

  return { matchRoute };
}

module.exports = {
  createFormResponsesApi,
  summarizeAssignment,
  summarizeResponse,
};
