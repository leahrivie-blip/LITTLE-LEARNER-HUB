/**
 * Phase 7 AI-Assisted Form Builder API — private preview.
 * Mounted under /api/forms-center/ai-builder/*.
 *
 * Shares the existing Forms Center private-preview gate
 * (formsCenter flag + ALLOW_FORMS_CENTER_ADMIN_PREVIEW + verified admin).
 *
 * AI never automatically publishes, sends, signs, approves, or overwrites
 * a form. Accepting a suggestion always creates a brand-new program-owned
 * draft with a new permanent form ID.
 */

const foundation = require("../scripts/foundation-data-model.js");
const entitlements = require("../scripts/entitlement-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const formsModel = require("../scripts/forms-center-data-model.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const model = require("../scripts/ai-form-builder-data-model.js");
const provider = require("../scripts/ai-form-builder-provider.js");
const analyzer = require("../scripts/ai-form-builder-analyzer.js");

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
    allowFormsCenterAdminPreview: env.allowFormsCenterAdminPreview === true && !production,
    siteUrl,
  };
}

function previewHeaderAllowed(expansionEnvironment) {
  const environment = resolveExpansionEnvironment(expansionEnvironment);
  return {
    allowed: environment.allowFormsCenterAdminPreview === true && !environment.liveProduction,
    environment,
  };
}

function ensureOwnerMembership(store, organization, adminEmail) {
  const email = safeLower(adminEmail || organization?.ownerEmail || "");
  const existing = listValues(store.staffMemberships).find((member) => (
    member
    && member.organizationId === organization.id
    && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
    && (!email || safeLower(member.userEmail) === email)
    && member.status === foundation.STAFF_STATUS.ACTIVE
  )) || listValues(store.staffMemberships).find((member) => (
    member
    && member.organizationId === organization.id
    && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
    && member.status === foundation.STAFF_STATUS.ACTIVE
  ));
  if (existing) return existing;
  const member = foundation.createStaffMembershipRecord({
    organizationId: organization.id,
    userEmail: email || organization.ownerEmail || "",
    displayName: "Preview Owner",
    role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
    status: foundation.STAFF_STATUS.ACTIVE,
  });
  store.staffMemberships = store.staffMemberships && typeof store.staffMemberships === "object" ? store.staffMemberships : {};
  store.staffMemberships[member.id] = member;
  return member;
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
  if (!entitlement) return false;
  if (entitlement.planKey === entitlements.PLAN_KEYS.CURRICULUM_ONLY) return false;
  return entitlement.features?.formsCenter !== false;
}

function aiCallsAreDisabled() {
  const disabled = truthy(process.env.DISABLE_AI_CALLS);
  const previewSafe = truthy(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW)
    || truthy(process.env.ALLOW_FORMS_CENTER_ADMIN_PREVIEW);
  // Mirror server/index.js: preview-safe mode also keeps live AI off.
  return disabled || previewSafe;
}

function createAiFormBuilderApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function prepare(request, context = {}) {
    const store = readStore();
    foundation.ensureFoundationStore(store);
    formsModel.ensureFormsCenterStore(store);
    model.ensureAiFormBuilderStore(store);
    const organization = formsFixtures.ensurePreviewOrganization(store, { adminEmail: context.adminEmail });
    ensureOwnerMembership(store, organization, context.adminEmail);
    const entitlement = resolveEntitlement(store, organization.id);
    const { actor, membership } = resolveActor(store, request, organization.id, context.adminEmail, expansionEnvironment);
    return {
      store,
      organization,
      entitlement,
      actor,
      membership,
      environment: resolveExpansionEnvironment(expansionEnvironment),
    };
  }

  function rejectEntitlement(response, entitlement) {
    if (entitlementAllowsForms(entitlement)) return false;
    jsonResponse(response, 403, {
      error: "Forms Center is not included with this preview plan. Upgrade from Curriculum Only to use the AI Form Builder.",
      code: "entitlement_denied",
    });
    return true;
  }

  function rejectAccess(response, decision) {
    if (decision && decision.allowed) return false;
    const code = decision?.reason || "permission_denied";
    const messages = {
      permission_denied: "You do not have permission to use the AI Form Builder.",
      role_denied: "Your role cannot use the AI Form Builder.",
      not_organization_member: "You are not a member of this organization.",
      organization_required: "An organization is required.",
      organization_not_found: "That organization was not found.",
      feature_disabled: "Forms Center is not available.",
    };
    jsonResponse(response, 403, {
      error: messages[code] || "You do not have permission to use the AI Form Builder.",
      code,
    });
    return true;
  }

  function requireCreatePermission(response, ctx) {
    const decision = orgPermissions.evaluateAccess({
      store: ctx.store,
      actor: ctx.actor,
      organizationId: ctx.organization.id,
      action: orgPermissions.ACTIONS.FORM_CREATE,
    });
    return rejectAccess(response, decision);
  }

  function findSessionOr404(response, store, organizationId, sessionId) {
    const session = store.aiFormBuilder.sessions[sessionId];
    if (!session || session.organizationId !== organizationId) {
      jsonResponse(response, 404, { error: "That AI Form Builder session was not found.", code: "session_not_found" });
      return null;
    }
    return session;
  }

  function addAudit(store, session, action, actor, message, changes) {
    const audit = model.createAuditRecord({
      organizationId: session.organizationId,
      sessionId: session.id,
      action,
      actorEmail: actor?.email || "",
      actorRole: actor?.role || "",
      message,
      changes,
    });
    store.aiFormBuilder.audit[audit.id] = audit;
    return audit;
  }

  function suggestionToDraftPayload(suggestion) {
    const sections = (suggestion.sections || []).map((section) => formsModel.createFormSection({
      title: section.title || "Section",
      description: section.description || "",
    }));
    const sectionByIndex = sections;
    const fields = [];
    (suggestion.sections || []).forEach((section, sectionIndex) => {
      const sectionId = sectionByIndex[sectionIndex]?.id || "";
      (section.fields || []).forEach((field, fieldIndex) => {
        const created = formsModel.createFormFieldRecord({
          type: field.type,
          label: field.label,
          helpText: field.helpText || "",
          required: field.required === true,
          sectionId,
          order: fields.length,
          options: (field.options || []).map((opt, optIndex) => (
            typeof opt === "string"
              ? { id: `opt_${optIndex + 1}`, label: opt }
              : { id: opt.id || `opt_${optIndex + 1}`, label: opt.label || `Option ${optIndex + 1}` }
          )),
          settings: field.conditionalOn ? { conditionalOn: field.conditionalOn } : {},
          preview: true,
        });
        fields.push(created);
      });
    });
    return { sections, fields };
  }

  async function handleStatus(request, response, context = {}) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (requireCreatePermission(response, ctx)) return;
    const modeDecision = provider.resolveGeneratorMode({
      expansionEnvironment: ctx.environment,
      aiCallsDisabled: aiCallsAreDisabled(),
      allowMockInPreview: true,
    });
    jsonResponse(response, 200, {
      ok: true,
      available: modeDecision.ok,
      mode: modeDecision.mode,
      code: modeDecision.code,
      message: modeDecision.message,
      aiCallsDisabled: aiCallsAreDisabled(),
      liveProduction: ctx.environment.liveProduction === true,
      maxPromptChars: provider.MAX_PROMPT_CHARS,
      maxPasteChars: provider.MAX_PASTE_CHARS,
      importFoundation: {
        supportedNow: ["plain_language", "pasted_text"],
        preparedForLater: ["pdf", "word", "image", "scanned_form"],
      },
      legalReminder: "An AI-generated form is never a guarantee of legal or licensing compliance. You are responsible for reviewing and customizing every draft.",
    });
  }

  async function handleGenerate(request, response, context = {}) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (requireCreatePermission(response, ctx)) return;

    let generated;
    try {
      generated = await provider.generateFormSuggestion(body, {
        expansionEnvironment: ctx.environment,
        aiCallsDisabled: aiCallsAreDisabled(),
        allowMockInPreview: true,
        requestedMode: body.mode || body.generatorMode || "",
      });
    } catch (error) {
      jsonResponse(response, error.status || 500, {
        error: error.message || "Could not generate a form suggestion.",
        code: error.code || "generate_failed",
        errors: error.errors || undefined,
      });
      return;
    }

    const review = analyzer.buildReview(generated.suggestion, generated.input);
    const session = model.createSessionRecord({
      organizationId: ctx.organization.id,
      createdByEmail: ctx.actor.email || normalizeEmail(context.adminEmail || ""),
      createdByRole: ctx.actor.role || "",
      generatorMode: generated.mode,
      input: generated.input,
      suggestion: generated.suggestion,
      review,
      suggestionId: generated.suggestionId,
      label: generated.label,
    });
    ctx.store.aiFormBuilder.sessions[session.id] = session;
    addAudit(ctx.store, session, "generate", ctx.actor, "Generated a structured form suggestion.", {
      mode: generated.mode,
      scenario: generated.suggestion?.scenario || "",
      sectionCount: (generated.suggestion?.sections || []).length,
    });
    writeStore(ctx.store);
    jsonResponse(response, 201, {
      ok: true,
      session: model.summarizeSession(session),
      detail: session,
      label: generated.label,
      aiCalled: false,
      neverAutoPublishes: true,
    });
  }

  async function handleGetSession(request, response, context = {}, sessionId) {
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (requireCreatePermission(response, ctx)) return;
    const session = findSessionOr404(response, ctx.store, ctx.organization.id, sessionId);
    if (!session) return;
    jsonResponse(response, 200, { ok: true, session: model.summarizeSession(session), detail: session });
  }

  async function handleRegenerate(request, response, context = {}, sessionId) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (requireCreatePermission(response, ctx)) return;
    const session = findSessionOr404(response, ctx.store, ctx.organization.id, sessionId);
    if (!session) return;
    if (session.status === model.SESSION_STATUSES.ACCEPTED && session.acceptedFormId) {
      // Regenerating must never overwrite an already-accepted draft form.
      // Create a brand-new session instead, leaving the accepted form alone.
    }

    const sourceInput = {
      ...(session.input || {}),
      prompt: body.prompt !== undefined ? body.prompt : session.originalPrompt,
      pastedText: body.pastedText !== undefined ? body.pastedText : session.originalPastedText,
      category: body.category || session.input?.category,
      intendedRecipient: body.intendedRecipient || session.input?.intendedRecipient,
      involves: body.involves || session.input?.involves,
      requestSignatures: body.requestSignatures,
      requestInitials: body.requestInitials,
      requestAcknowledgments: body.requestAcknowledgments,
      requestDates: body.requestDates,
      requestAttachments: body.requestAttachments,
      requestConditionalQuestions: body.requestConditionalQuestions,
      filingDestination: body.filingDestination || session.input?.filingDestination,
      mode: body.mode,
    };

    let generated;
    try {
      generated = await provider.generateFormSuggestion(sourceInput, {
        expansionEnvironment: ctx.environment,
        aiCallsDisabled: aiCallsAreDisabled(),
        allowMockInPreview: true,
        requestedMode: body.mode || "",
      });
    } catch (error) {
      jsonResponse(response, error.status || 500, {
        error: error.message || "Could not regenerate a form suggestion.",
        code: error.code || "generate_failed",
        errors: error.errors || undefined,
      });
      return;
    }

    const review = analyzer.buildReview(generated.suggestion, generated.input);

    // If the prior session was already accepted, spawn a new session so the
    // accepted draft form is never overwritten.
    if (session.status === model.SESSION_STATUSES.ACCEPTED && session.acceptedFormId) {
      const fresh = model.createSessionRecord({
        organizationId: ctx.organization.id,
        createdByEmail: ctx.actor.email || normalizeEmail(context.adminEmail || ""),
        createdByRole: ctx.actor.role || "",
        generatorMode: generated.mode,
        input: generated.input,
        suggestion: generated.suggestion,
        review,
        suggestionId: generated.suggestionId,
        label: generated.label,
      });
      ctx.store.aiFormBuilder.sessions[fresh.id] = fresh;
      addAudit(ctx.store, fresh, "regenerate_new_session", ctx.actor, "Regenerated suggestions into a new session without overwriting the accepted draft.", {
        previousSessionId: session.id,
        previousAcceptedFormId: session.acceptedFormId,
      });
      writeStore(ctx.store);
      jsonResponse(response, 201, {
        ok: true,
        session: model.summarizeSession(fresh),
        detail: fresh,
        preservedAcceptedFormId: session.acceptedFormId,
        label: generated.label,
        aiCalled: false,
      });
      return;
    }

    session.generatedSuggestion = generated.suggestion;
    session.input = generated.input;
    session.originalPrompt = generated.input.prompt || "";
    session.originalPastedText = generated.input.pastedText || "";
    session.review = review;
    session.suggestionId = generated.suggestionId;
    session.generatorMode = generated.mode;
    session.label = generated.label;
    session.regenerateCount = (session.regenerateCount || 0) + 1;
    session.updatedAt = model.nowIso();
    session.providerEdits = null;
    ctx.store.aiFormBuilder.sessions[session.id] = session;
    addAudit(ctx.store, session, "regenerate", ctx.actor, "Regenerated form suggestions for this session.", {
      regenerateCount: session.regenerateCount,
    });
    writeStore(ctx.store);
    jsonResponse(response, 200, {
      ok: true,
      session: model.summarizeSession(session),
      detail: session,
      label: generated.label,
      aiCalled: false,
    });
  }

  /**
   * Accept the current suggestion (optionally with provider edits) and create
   * a brand-new program-owned draft form. Never publishes. Never overwrites
   * an existing form ID.
   */
  async function handleAccept(request, response, context = {}, sessionId) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = prepare(request, context);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (requireCreatePermission(response, ctx)) return;
    const session = findSessionOr404(response, ctx.store, ctx.organization.id, sessionId);
    if (!session) return;

    if (session.status === model.SESSION_STATUSES.ACCEPTED && session.acceptedFormId) {
      jsonResponse(response, 409, {
        error: "This suggestion was already saved as a draft. Open that draft in the Form Builder, or regenerate into a new session.",
        code: "already_accepted",
        acceptedFormId: session.acceptedFormId,
      });
      return;
    }

    const suggestion = body.editedSuggestion && typeof body.editedSuggestion === "object"
      ? body.editedSuggestion
      : session.generatedSuggestion;
    if (!suggestion || !Array.isArray(suggestion.sections) || !suggestion.sections.length) {
      jsonResponse(response, 400, { error: "There is no suggestion to accept.", code: "empty_suggestion" });
      return;
    }

    if (body.editedSuggestion) {
      session.providerEdits = JSON.parse(JSON.stringify(body.editedSuggestion));
    }

    const form = formsModel.createFormRecord({
      organizationId: ctx.organization.id,
      title: suggestion.title || "AI Draft Form",
      description: suggestion.description || "",
      category: suggestion.category || formsModel.FORM_CATEGORIES.CUSTOM,
      createdByEmail: ctx.actor.email || normalizeEmail(context.adminEmail || ""),
      preview: true,
    });
    form.aiTouched = true;
    form.providerInstructions = formsModel.cleanLongText(suggestion.providerInstructions || "", 2000);
    form.familyInstructions = formsModel.cleanLongText(suggestion.familyInstructions || "", 2000);
    form.filingDestination = formsModel.cleanText(suggestion.filingDestination || "", 40);
    form.aiBuilderSessionId = session.id;

    const draft = suggestionToDraftPayload(suggestion);
    form.currentDraft = {
      sections: draft.sections,
      fieldIds: draft.fields.map((field) => field.id),
    };
    draft.fields.forEach((field) => {
      field.formId = form.id;
      field.organizationId = form.organizationId;
      ctx.store.formsCenter.fields[field.id] = field;
    });
    ctx.store.formsCenter.forms[form.id] = form;

    session.status = model.SESSION_STATUSES.ACCEPTED;
    session.acceptedSuggestion = JSON.parse(JSON.stringify(suggestion));
    session.acceptedFormId = form.id;
    session.acceptedAt = model.nowIso();
    session.updatedAt = session.acceptedAt;
    ctx.store.aiFormBuilder.sessions[session.id] = session;

    addAudit(ctx.store, session, "accept", ctx.actor, "Saved AI suggestion as a new program-owned draft form. Not published.", {
      formId: form.id,
      sectionCount: draft.sections.length,
      fieldCount: draft.fields.length,
    });

    // Also leave a Forms Center audit breadcrumb on the new form.
    const formAudit = formsModel.createAuditRecord({
      formId: form.id,
      organizationId: form.organizationId,
      action: "ai_builder_accept",
      actorEmail: ctx.actor.email || normalizeEmail(context.adminEmail || ""),
      message: "Draft created from AI Form Builder suggestion. Not published.",
      changes: { sessionId: session.id, generatorMode: session.generatorMode },
      preview: true,
    });
    ctx.store.formsCenter.audit[formAudit.id] = formAudit;

    writeStore(ctx.store);
    jsonResponse(response, 201, {
      ok: true,
      message: "Your editable program draft is ready. It was not published.",
      session: model.summarizeSession(session),
      form: {
        id: form.id,
        title: form.title,
        status: form.status,
        category: form.category,
        aiTouched: true,
        draftVersionNumber: form.draftVersionNumber,
      },
      snapshot: {
        source: "draft",
        sections: draft.sections,
        fields: draft.fields,
      },
      neverAutoPublishes: true,
      neverAutoSends: true,
    });
  }

  function matchRoute(method, pathname) {
    const path = String(pathname || "");
    if (!path.startsWith("/api/forms-center/ai-builder")) return null;
    const rest = path.slice("/api/forms-center/ai-builder".length).replace(/^\//, "");
    const parts = rest ? rest.split("/").filter(Boolean) : [];

    if (parts.length === 0 && method === "GET") return (req, res, ctx) => handleStatus(req, res, ctx);
    if (parts.length === 1 && parts[0] === "status" && method === "GET") return (req, res, ctx) => handleStatus(req, res, ctx);
    if (parts.length === 1 && parts[0] === "generate" && method === "POST") return (req, res, ctx) => handleGenerate(req, res, ctx);
    if (parts.length === 2 && parts[0] === "sessions" && method === "GET") {
      return (req, res, ctx) => handleGetSession(req, res, ctx, parts[1]);
    }
    if (parts.length === 3 && parts[0] === "sessions" && parts[2] === "regenerate" && method === "POST") {
      return (req, res, ctx) => handleRegenerate(req, res, ctx, parts[1]);
    }
    if (parts.length === 3 && parts[0] === "sessions" && parts[2] === "accept" && method === "POST") {
      return (req, res, ctx) => handleAccept(req, res, ctx, parts[1]);
    }
    return null;
  }

  return { matchRoute };
}

module.exports = { createAiFormBuilderApi };
