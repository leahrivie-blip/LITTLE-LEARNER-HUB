/**
 * Wave 1 — HTTP handlers for durable program forms namespace.
 * Wired from server/index.js; keeps index.js diffs small.
 */
"use strict";

const programFormsLib = require("./program-forms-lib.js");
const formFieldsLib = require("./form-fields-lib.js");
const formsRecordLib = require("./forms-record-lib.js");

function createProgramFormsRoutes({
  requireHomeDaycareHubTesting,
  resolveScheduleIdentity,
  readStore,
  respondAfterPersist,
  jsonResponse,
  readJson,
  programOwnership,
}) {
  async function withProgramContext(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return null;
    let identity;
    try {
      identity = await resolveScheduleIdentity(request);
    } catch (error) {
      jsonResponse(response, 401, { error: error.message || "Please log in." });
      return null;
    }
    const store = readStore();
    const context = programOwnership.resolveProgramContext(store, identity);
    if (!context?.ok) {
      jsonResponse(response, 403, { error: context?.error || "Could not resolve program." });
      return null;
    }
    return { identity, store, context };
  }

  function actorFromContext(context, identity) {
    return {
      actorUserId: String(identity.email || "").trim().toLowerCase(),
      actorRole: String(context.role || "owner").trim().toLowerCase(),
    };
  }

  async function handleGetProgramForms(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    const forms = programFormsLib.ensureProgramFormsNamespace(store, context.programId);
    const actor = actorFromContext(context, identity);
    const isManager = context.canManageStaff || context.role === "owner" || context.role === "director";
    const staffDocuments = isManager
      ? programFormsLib.listStaffDocuments(store, context.programId)
      : programFormsLib.listStaffDocuments(store, context.programId, { assigneeEmail: actor.actorUserId });
    jsonResponse(response, 200, {
      ok: true,
      programId: context.programId,
      accountType: store.programs?.[context.programId]?.accountType || "",
      authoritative: "programData.forms",
      fallback: "client programSettings (read-only until removal gate)",
      removalGate: programFormsLib.describeFallbackRemovalGate(forms, {}),
      staffDocuments,
      templates: programFormsLib.listTemplates(store, context.programId),
    });
  }

  async function handleMigrateProgramForms(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    if (!(context.canManageStaff || context.role === "owner" || context.role === "director")) {
      jsonResponse(response, 403, { error: "Only owners and directors can migrate paperwork." });
      return;
    }
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid migration payload." });
      return;
    }
    // Ignore any client-supplied actor identity.
    const actor = actorFromContext(context, identity);
    const result = programFormsLib.migrateClientFormsPayload(store, context.programId, {
      staffDocuments: body?.staffDocuments || body?.staffFormDocuments || [],
      templates: body?.templates || body?.formTemplates || [],
    }, actor);
    await respondAfterPersist(store, response, 200, { ok: true, migration: result }, "Could not migrate forms.");
  }

  async function handleUpsertStaffDocument(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid staff document payload." });
      return;
    }
    const actor = actorFromContext(context, identity);
    const isManager = context.canManageStaff || context.role === "owner" || context.role === "director";
    const assignee = String(body?.assigneeEmail || "").trim().toLowerCase();
    if (!isManager && assignee !== actor.actorUserId) {
      jsonResponse(response, 403, { error: "Staff can only update their own paperwork." });
      return;
    }
    if (context.role === "assistant" && !isManager) {
      // Assistants may complete own assigned docs later; Wave 1 create/assign is manager-only.
      if (!body?.id) {
        jsonResponse(response, 403, { error: "Assistants cannot assign paperwork." });
        return;
      }
    }
    try {
      // Validate staff membership when assigning.
      if (assignee) {
        programFormsLib.validateAndResolveAssignment(store, {
          ...context,
          readChild: () => programOwnership.readProgramChildData(store, context)?.data || {},
        }, {
          mode: "staff",
          staffEmails: [assignee],
          programId: context.programId,
        });
      }
      const saved = programFormsLib.upsertStaffDocument(store, context.programId, body || {}, actor);
      await respondAfterPersist(store, response, 200, {
        ok: true,
        authoritative: "programData.forms.staffDocuments",
        staffDocument: saved,
      }, "Could not save staff document.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not save staff document.",
        invalidStaffEmails: error.invalidStaffEmails || undefined,
      });
    }
  }

  async function handleUpsertTemplate(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    if (!(context.canManageStaff || context.role === "owner" || context.role === "director" || context.role === "teacher")) {
      jsonResponse(response, 403, { error: "Not allowed to save templates." });
      return;
    }
    // Assistants cannot manage the template library/builder.
    if (context.role === "assistant") {
      jsonResponse(response, 403, { error: "Assistants cannot manage form templates." });
      return;
    }
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid template payload." });
      return;
    }
    const actor = actorFromContext(context, identity);
    try {
      const saved = programFormsLib.upsertTemplate(store, context.programId, {
        ...(body || {}),
        createdByEmail: actor.actorUserId,
        // Ignore client-forged programId — always bind to resolved context.
        programId: context.programId,
      }, actor);
      await respondAfterPersist(store, response, 200, {
        ok: true,
        authoritative: "programData.forms.templates",
        template: saved,
      }, "Could not save template.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not save template.",
        code: error.code || undefined,
      });
    }
  }

  async function handleDuplicateTemplate(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    if (!(context.canManageStaff || context.role === "owner" || context.role === "director" || context.role === "teacher")) {
      jsonResponse(response, 403, { error: "Not allowed to duplicate templates." });
      return;
    }
    if (context.role === "assistant") {
      jsonResponse(response, 403, { error: "Assistants cannot manage form templates." });
      return;
    }
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid duplicate payload." });
      return;
    }
    const actor = actorFromContext(context, identity);
    try {
      // Prefer server template; allow starter/system payload for first-time customize.
      const serverTemplates = programFormsLib.listTemplates(store, context.programId, { includeArchived: true });
      const fromServer = serverTemplates.find((t) => String(t.id) === String(body?.templateId || body?.id || ""));
      const source = fromServer || body?.template || body || {};
      if (!source || (!source.body && !source.bodyText && !(source.fields || []).length && !source.title)) {
        jsonResponse(response, 404, { error: "Template not found." });
        return;
      }
      const saved = programFormsLib.duplicateTemplateAsProvider(store, context.programId, source, actor);
      await respondAfterPersist(store, response, 200, {
        ok: true,
        authoritative: "programData.forms.templates",
        template: saved,
        originTemplateId: saved.originTemplateId,
      }, "Could not duplicate template.");
    } catch (error) {
      jsonResponse(response, error.status || 400, { error: error.message || "Could not duplicate template." });
    }
  }

  async function handleValidateStructuredFields(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid field payload." });
      return;
    }
    try {
      if (body?.aiDraft || body?.source === "ai_structured_draft") {
        const draft = formFieldsLib.validateAiStructuredDraft(body.aiDraft || body, { strict: true });
        jsonResponse(response, 200, { ok: true, draft });
        return;
      }
      const fields = formFieldsLib.normalizeFormFields(body?.fields || [], { strict: true });
      jsonResponse(response, 200, { ok: true, fields });
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Invalid structured fields.",
        code: error.code || undefined,
      });
    }
  }

  async function handleValidateAssignment(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid assignment payload." });
      return;
    }
    try {
      const childData = programOwnership.readProgramChildData(store, context)?.data || {};
      const resolved = programFormsLib.validateAndResolveAssignment(store, {
        ...context,
        readChild: () => childData,
      }, {
        ...(body || {}),
        programId: body?.programId,
        profiles: childData.Profiles || [],
      });
      jsonResponse(response, 200, {
        ok: true,
        resolved,
        actorUserId: String(identity.email || "").toLowerCase(),
        // Echo that client-supplied actor is ignored
        ignoredClientActor: Boolean(body?.actorUserId || body?.performedBy || body?.actorEmail),
      });
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Assignment validation failed.",
        invalidChildIds: error.invalidChildIds,
        invalidHouseholdIds: error.invalidHouseholdIds,
        invalidStaffEmails: error.invalidStaffEmails,
      });
    }
  }

  async function handlePreviewAssignment(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid preview payload." });
      return;
    }
    try {
      const childData = programOwnership.readProgramChildData(store, context)?.data || {};
      const preview = programFormsLib.previewAssignment(store, {
        ...context,
        readChild: () => childData,
      }, {
        ...(body || {}),
        programId: body?.programId,
        profiles: childData.Profiles || [],
      });
      jsonResponse(response, 200, {
        ...preview,
        actorUserId: String(identity.email || "").toLowerCase(),
        ignoredClientActor: Boolean(body?.actorUserId || body?.performedBy || body?.actorEmail),
      });
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Assignment preview failed.",
        code: error.code,
        invalidChildIds: error.invalidChildIds,
        invalidHouseholdIds: error.invalidHouseholdIds,
        invalidStaffEmails: error.invalidStaffEmails,
      });
    }
  }

  async function handleConfirmSendAssignment(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid Confirm & Send payload." });
      return;
    }
    const actor = actorFromContext(context, identity);
    try {
      const result = programFormsLib.confirmSendAssignments(store, context, body || {}, {
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        readChildData: () => programOwnership.readProgramChildData(store, context)?.data || {},
        writeChildData: (nextData) => {
          programOwnership.writeProgramChildData(store, context, nextData);
        },
      });
      await respondAfterPersist(store, response, 200, { ok: true, ...result }, "Could not confirm send.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Confirm & Send failed.",
        code: error.code,
        mismatches: error.mismatches,
        counts: error.counts,
        invalidChildIds: error.invalidChildIds,
        invalidHouseholdIds: error.invalidHouseholdIds,
        invalidStaffEmails: error.invalidStaffEmails,
      });
    }
  }

  async function handleGetFormsAudit(request, response, url) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context } = ctx;
    if (!(context.canManageStaff || context.role === "owner" || context.role === "director")) {
      jsonResponse(response, 403, { error: "Only owners and directors can view forms audit." });
      return;
    }
    const limit = Number(url?.searchParams?.get("limit") || 200);
    const documentId = String(url?.searchParams?.get("documentId") || "").trim();
    let rows = programFormsLib.listFormsAuditForProgram(store, context.programId, { limit: documentId ? 1000 : limit });
    if (documentId) {
      rows = rows.filter((row) => String(row.documentId || "") === documentId).slice(0, Math.max(1, Math.min(500, Number(limit) || 200)));
    }
    jsonResponse(response, 200, {
      ok: true,
      programId: context.programId,
      documentId: documentId || undefined,
      audit: rows,
      timeline: documentId
        ? formsRecordLib.buildTimelineEntries(rows, { documentId })
        : undefined,
      retention: "append_only_no_destructive_fifo",
      archiveCollection: "formsAuditArchive",
    });
  }

  async function handleGetDocumentDetail(request, response, url, documentId) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    const assigneeType = String(url?.searchParams?.get("assigneeType") || "").trim();
    const markViewed = String(url?.searchParams?.get("markViewed") || "") === "1";
    try {
      const located = formsRecordLib.locateDocument(store, context, { documentId, assigneeType });
      const auth = formsRecordLib.authorizeDocumentAccess(context, identity, located, {
        audience: "director",
      });
      let auditRows = [];
      if (auth.canViewAudit) {
        auditRows = programFormsLib.listFormsAuditForProgram(store, context.programId, { limit: 500 })
          .filter((row) => String(row.documentId || "") === String(documentId));
      }
      if (markViewed && auth.level === "director") {
        // Directors opening detail do not stamp guardian VIEWED; skip.
      }
      const dto = formsRecordLib.buildDocumentDetailDto({
        store,
        context,
        located,
        auth,
        auditRows,
        programName: formsRecordLib.programDisplayName(store, context.programId),
      });
      // Read path — no persist unless markViewed for staff_self first open.
      if (markViewed && auth.level === "staff_self") {
        const actor = actorFromContext(context, identity);
        const marked = formsRecordLib.maybeMarkViewed(store, context, located, actor);
        if (marked.marked) {
          if (located.assigneeType === "staff") {
            const forms = programFormsLib.ensureProgramFormsNamespace(store, context.programId);
            forms.staffDocuments = located.collection;
          }
          await respondAfterPersist(store, response, 200, dto, "Could not open document detail.");
          return;
        }
      }
      jsonResponse(response, 200, dto);
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not open document detail.",
        code: error.code || "detail_failed",
      });
    }
  }

  async function handleGetCompletedRecord(request, response, url, documentId) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    const assigneeType = String(url?.searchParams?.get("assigneeType") || "").trim();
    const versionId = String(url?.searchParams?.get("versionId") || "").trim();
    try {
      const located = formsRecordLib.locateDocument(store, context, { documentId, assigneeType });
      const auth = formsRecordLib.authorizeDocumentAccess(context, identity, located, {
        audience: located.assigneeType === "staff" ? "staff_self" : "director",
      });
      // Cross-check: client cannot swap to another program's document (locate already scoped).
      if (versionId) {
        formsRecordLib.pickVersion(located.document, versionId);
      }
      const recipient = (() => {
        try {
          return formsRecordLib.buildDocumentDetailDto({
            store,
            context,
            located,
            auth: { ...auth, canViewAudit: false },
            auditRows: [],
            programName: "",
          }).recipient;
        } catch (_e) {
          return null;
        }
      })();
      const dto = formsRecordLib.buildCompletedRecordDto({
        located,
        versionId,
        auth,
        programName: formsRecordLib.programDisplayName(store, context.programId),
        recipient,
        includeDrawnImage: true,
      });
      // Print/download must not mutate status/signature/version.
      jsonResponse(response, 200, dto);
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not open completed record.",
        code: error.code || "completed_record_failed",
      });
    }
  }

  async function handleForbiddenAuditMutations(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    jsonResponse(response, 405, {
      error: "Forms audit is append-only. Clients cannot create, edit, or delete audit events.",
    });
  }

  async function handleSignStaffDocument(request, response, documentId) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid sign payload." });
      return;
    }
    const actor = actorFromContext(context, identity);
    // Ignore forged assignee identity from the client.
    if (body && Object.prototype.hasOwnProperty.call(body, "assigneeEmail")) {
      delete body.assigneeEmail;
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "signerUserId")) {
      delete body.signerUserId;
    }
    try {
      const result = programFormsLib.signStaffDocument(store, context, documentId, body || {}, {
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        ipHash: programFormsLib.hashRequestIp(request),
      });
      await respondAfterPersist(store, response, 200, {
        ok: true,
        testingOnly: true,
        idempotentReplay: Boolean(result.idempotentReplay),
        staffDocument: formsLibPublicStaff(result.staffDocument),
      }, "Could not save staff signature.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not sign staff paperwork.",
        code: error.code || "sign_failed",
        missingFields: error.missingFields || undefined,
        currentVersionId: error.currentVersionId || undefined,
        currentBodyHash: error.currentBodyHash || undefined,
      });
    }
  }

  function formsLibPublicStaff(doc) {
    const formsLib = require("./forms-lib.js");
    return formsLib.publicStaffFormDocument(doc);
  }

  function childDataWriter(store, context) {
    return (mutator) => {
      const saved = programOwnership.readProgramChildData(store, context);
      const childData = saved?.data && typeof saved.data === "object" ? { ...saved.data } : {};
      const docs = Array.isArray(childData.Documents) ? childData.Documents.slice() : [];
      const result = mutator(docs);
      childData.Documents = result.docs;
      programOwnership.writeProgramChildData(store, context, childData);
      return result;
    };
  }

  async function handleVoidVersion(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid void payload." });
      return;
    }
    const actor = actorFromContext(context, identity);
    try {
      const result = programFormsLib.voidSignedDocumentVersion(store, context, {
        documentId: body?.documentId || body?.id,
        assigneeType: body?.assigneeType === "child" || body?.assigneeType === "family" ? "child" : "staff",
        voidReason: body?.voidReason || body?.reason || "",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        childDataWrite: childDataWriter(store, context),
      });
      await respondAfterPersist(store, response, 200, {
        ok: true,
        testingOnly: true,
        assigneeType: result.assigneeType,
        document: result.assigneeType === "staff"
          ? formsLibPublicStaff(result.document)
          : result.document,
      }, "Could not void signed version.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not void signed version.",
        code: error.code || "void_failed",
      });
    }
  }

  async function handleSupersedeVersion(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    let body;
    try {
      body = await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid supersede payload." });
      return;
    }
    const actor = actorFromContext(context, identity);
    try {
      const result = programFormsLib.supersedeSignedDocument(store, context, {
        documentId: body?.documentId || body?.id,
        assigneeType: body?.assigneeType === "child" || body?.assigneeType === "family" ? "child" : "staff",
        nextBody: body?.nextBody != null ? body.nextBody : body?.draftText,
        nextFields: body?.nextFields || body?.fields || null,
        reason: body?.reason || body?.voidReason || "",
        voidPrior: body?.voidPrior === true,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        childDataWrite: childDataWriter(store, context),
      });
      await respondAfterPersist(store, response, 200, {
        ok: true,
        testingOnly: true,
        assigneeType: result.assigneeType,
        document: result.assigneeType === "staff"
          ? formsLibPublicStaff(result.document)
          : result.document,
      }, "Could not supersede signed version.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not supersede signed version.",
        code: error.code || "supersede_failed",
      });
    }
  }

  function match(method, pathname) {
    if (pathname === "/api/program-forms" && method === "GET") return handleGetProgramForms;
    if (pathname === "/api/program-forms/migrate" && method === "POST") return handleMigrateProgramForms;
    if (pathname === "/api/program-forms/staff-documents" && method === "POST") return handleUpsertStaffDocument;
    if (pathname === "/api/program-forms/templates" && method === "POST") return handleUpsertTemplate;
    if (pathname === "/api/program-forms/templates/duplicate" && method === "POST") return handleDuplicateTemplate;
    if (pathname === "/api/program-forms/fields/validate" && method === "POST") return handleValidateStructuredFields;
    if (pathname === "/api/program-forms/assign/validate" && method === "POST") return handleValidateAssignment;
    if (pathname === "/api/program-forms/assign/preview" && method === "POST") return handlePreviewAssignment;
    if (pathname === "/api/program-forms/assign/confirm-send" && method === "POST") return handleConfirmSendAssignment;
    if (pathname === "/api/program-forms/versions/void" && method === "POST") return handleVoidVersion;
    if (pathname === "/api/program-forms/versions/supersede" && method === "POST") return handleSupersedeVersion;
    const staffSignMatch = pathname.match(/^\/api\/program-forms\/staff-documents\/([^/]+)\/sign$/);
    if (staffSignMatch && method === "POST") {
      const documentId = decodeURIComponent(staffSignMatch[1]);
      return (req, res) => handleSignStaffDocument(req, res, documentId);
    }
    const detailMatch = pathname.match(/^\/api\/program-forms\/documents\/([^/]+)\/detail$/);
    if (detailMatch && method === "GET") {
      const documentId = decodeURIComponent(detailMatch[1]);
      return (req, res, url) => handleGetDocumentDetail(req, res, url, documentId);
    }
    const completedMatch = pathname.match(/^\/api\/program-forms\/documents\/([^/]+)\/completed-record$/);
    if (completedMatch && method === "GET") {
      const documentId = decodeURIComponent(completedMatch[1]);
      return (req, res, url) => handleGetCompletedRecord(req, res, url, documentId);
    }
    if (pathname === "/api/program-forms/audit" && method === "GET") {
      return (req, res, url) => handleGetFormsAudit(req, res, url);
    }
    if (pathname === "/api/program-forms/audit" && (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")) {
      return handleForbiddenAuditMutations;
    }
    if (pathname.startsWith("/api/program-forms/audit/") && (method === "PUT" || method === "PATCH" || method === "DELETE")) {
      return handleForbiddenAuditMutations;
    }
    return null;
  }

  return { match };
}

module.exports = { createProgramFormsRoutes };
