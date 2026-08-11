/**
 * Wave 1 — HTTP handlers for durable program forms namespace.
 * Wired from server/index.js; keeps index.js diffs small.
 */
"use strict";

const programFormsLib = require("./program-forms-lib.js");
const formFieldsLib = require("./form-fields-lib.js");
const formsRecordLib = require("./forms-record-lib.js");
const formsUploadLib = require("./forms-upload-lib.js");

function createProgramFormsRoutes({
  requireHomeDaycareHubTesting,
  resolveScheduleIdentity,
  readStore,
  respondAfterPersist,
  jsonResponse,
  readJson,
  programOwnership,
  getStorePath = () => "",
  usePostgresStore = () => false,
  getPostgresPool = () => null,
  sendFamilyHubFormReminder = null,
  resolveFamilySession = null,
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
    const isMgr = context.canManageStaff || context.role === "owner" || context.role === "director";
    jsonResponse(response, 200, {
      ok: true,
      programId: context.programId,
      accountType: store.programs?.[context.programId]?.accountType || "",
      authoritative: "programData.forms",
      fallback: "client programSettings (read-only until removal gate)",
      removalGate: programFormsLib.describeFallbackRemovalGate(forms, {}),
      staffDocuments,
      programDocuments: isMgr ? (forms.programDocuments || []) : [],
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

  async function readUploadJson(request, response) {
    // Bound body size before parsing — Wave 7 memory safety.
    const cl = Number(request.headers["content-length"] || 0);
    if (cl > formsUploadLib.MAX_DATA_URL_CHARS + 8_000) {
      jsonResponse(response, 413, {
        error: `Upload payload too large. Max file size is ${formsUploadLib.MAX_UPLOAD_MB} MB.`,
        code: "payload_too_large",
      });
      return null;
    }
    try {
      return await readJson(request);
    } catch (_error) {
      jsonResponse(response, 400, { error: "Invalid upload payload." });
      return null;
    }
  }

  async function handleCreateUpload(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    const isManager = context.canManageStaff || context.role === "owner" || context.role === "director";
    if (!isManager) {
      jsonResponse(response, 403, { error: "Only owners and directors can upload paperwork." });
      return;
    }
    const body = await readUploadJson(request, response);
    if (!body) return;
    const actor = actorFromContext(context, identity);
    const assigneeType = String(body.assigneeType || body.linkedEntityType || "child").trim().toLowerCase();
    const shareWithFamily = body.shareWithFamily === true || body.shareWithFamily === "true";
    // Never trust forged visibility for staff/program.
    if (assigneeType === "staff" || assigneeType === "program") {
      if (shareWithFamily) {
        jsonResponse(response, 400, {
          error: "Staff and program uploads cannot be shared with Family Hub.",
          code: "family_visibility_denied",
        });
        return;
      }
    }
    const parsed = formsUploadLib.parseUploadDataUrl(body.fileData, {
      originalFileName: body.originalFileName || body.fileName || "",
    });
    if (!parsed.ok) {
      jsonResponse(response, 400, { error: parsed.error, code: parsed.code });
      return;
    }

    try {
      let collectionWrite = null;
      let existing = null;
      if (assigneeType === "staff") {
        const email = String(body.assigneeEmail || body.linkedEntityId || "").trim().toLowerCase();
        if (!email) {
          jsonResponse(response, 400, { error: "Choose a staff member for this upload." });
          return;
        }
        programFormsLib.validateAndResolveAssignment(store, {
          ...context,
          readChild: () => programOwnership.readProgramChildData(store, context)?.data || {},
        }, {
          audience: "staff",
          mode: "staff",
          staffEmails: [email],
        });
        const forms = programFormsLib.ensureProgramFormsNamespace(store, context.programId);
        existing = formsUploadLib.findIdempotentUpload(forms.staffDocuments, body.idempotencyKey);
        if (existing) {
          jsonResponse(response, 200, {
            ok: true,
            testingOnly: true,
            idempotentReplay: true,
            assigneeType: "staff",
            document: formsLibPublicStaff(existing),
            upload: formsUploadLib.publicUploadSummary(existing),
          });
          return;
        }
        collectionWrite = (row) => {
          forms.staffDocuments = [...forms.staffDocuments, programFormsLib.normalizeStaffDocument(row, {
            programId: context.programId,
          })];
          forms.updatedAt = new Date().toISOString();
          return forms.staffDocuments[forms.staffDocuments.length - 1];
        };
      } else if (assigneeType === "program") {
        const forms = programFormsLib.ensureProgramFormsNamespace(store, context.programId);
        existing = formsUploadLib.findIdempotentUpload(forms.programDocuments, body.idempotencyKey);
        if (existing) {
          jsonResponse(response, 200, {
            ok: true,
            testingOnly: true,
            idempotentReplay: true,
            assigneeType: "program",
            document: existing,
            upload: formsUploadLib.publicUploadSummary(existing),
          });
          return;
        }
        collectionWrite = (row) => {
          forms.programDocuments = [...forms.programDocuments, row];
          forms.updatedAt = new Date().toISOString();
          return row;
        };
      } else {
        const childId = String(body.childId || body.linkedEntityId || "").trim();
        if (!childId) {
          jsonResponse(response, 400, { error: "Choose a child for this upload." });
          return;
        }
        const saved = programOwnership.readProgramChildData(store, context);
        const childData = saved?.data && typeof saved.data === "object" ? { ...saved.data } : {};
        const profiles = Array.isArray(childData.Profiles) ? childData.Profiles : [];
        if (!profiles.some((p) => String(p?.id || "") === childId)) {
          jsonResponse(response, 403, {
            error: "That child is not in this program.",
            code: "child_not_in_program",
          });
          return;
        }
        const docs = Array.isArray(childData.Documents) ? childData.Documents : [];
        existing = formsUploadLib.findIdempotentUpload(docs, body.idempotencyKey);
        if (existing) {
          jsonResponse(response, 200, {
            ok: true,
            testingOnly: true,
            idempotentReplay: true,
            assigneeType: "child",
            document: existing,
            upload: formsUploadLib.publicUploadSummary(existing),
          });
          return;
        }
        collectionWrite = (row) => {
          const nextDocs = [...docs, row];
          childData.Documents = nextDocs;
          programOwnership.writeProgramChildData(store, context, childData);
          return row;
        };
      }

      const provisionalId = body.idempotencyKey && /^[a-zA-Z0-9_-]{8,80}$/.test(body.idempotencyKey)
        ? `upl_${body.idempotencyKey}`
        : `upl_${Date.now().toString(36)}`;
      let fileRef = null;
      try {
        fileRef = await formsUploadLib.persistFormsUpload({
          parsed,
          programId: context.programId,
          documentId: provisionalId,
          uploadedBy: actor.actorUserId,
          storePath: getStorePath(),
          postgresPool: getPostgresPool(),
          usePostgres: usePostgresStore(),
        });
        const row = formsUploadLib.buildUploadDocumentRow({
          assigneeType,
          title: body.title,
          category: body.category || "Upload",
          childId: body.childId || (assigneeType === "child" ? body.linkedEntityId : ""),
          householdId: body.householdId || "",
          assigneeEmail: body.assigneeEmail || (assigneeType === "staff" ? body.linkedEntityId : ""),
          programId: context.programId,
          shareWithFamily: assigneeType === "child" ? shareWithFamily : false,
          expiresAt: body.expiresAt || "",
          notes: body.notes || "",
          fileRef,
          actorUserId: actor.actorUserId,
          idempotencyKey: body.idempotencyKey || "",
        });
        // Keep media meta documentId aligned with final row id.
        row.mediaDocumentId = row.id;
        const savedDoc = collectionWrite(row);
        programFormsLib.appendFormsAudit(store, {
          programId: context.programId,
          action: "UPLOADED",
          actorUserId: actor.actorUserId,
          actorRole: actor.actorRole,
          documentId: savedDoc.id,
          childId: savedDoc.childId || "",
          assigneeEmail: savedDoc.assigneeEmail || "",
          detail: `${savedDoc.fileName || "file"} (${savedDoc.mimeType || "file"})`,
          meta: { source: "upload", mode: assigneeType },
        });
        programFormsLib.appendFormsAudit(store, {
          programId: context.programId,
          action: "CREATED",
          actorUserId: actor.actorUserId,
          actorRole: actor.actorRole,
          documentId: savedDoc.id,
          childId: savedDoc.childId || "",
          assigneeEmail: savedDoc.assigneeEmail || "",
          detail: "Uploaded paperwork record",
        });
        await respondAfterPersist(store, response, 200, {
          ok: true,
          testingOnly: true,
          idempotentReplay: false,
          assigneeType,
          document: assigneeType === "staff" ? formsLibPublicStaff(savedDoc) : savedDoc,
          upload: formsUploadLib.publicUploadSummary(savedDoc),
        }, "Could not save upload.");
      } catch (error) {
        // Metadata save failed after bytes landed — best-effort local orphan cleanup.
        if (fileRef?.mediaAssetId && !usePostgresStore()) {
          try {
            formsUploadLib.removeLocalFormsAsset(
              formsUploadLib.localMediaDirFromStorePath(getStorePath()),
              fileRef.mediaAssetId,
            );
          } catch (_cleanupErr) { /* ignore */ }
        }
        throw error;
      }
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not upload paperwork.",
        code: error.code || "upload_failed",
        invalidStaffEmails: error.invalidStaffEmails,
      });
    }
  }

  async function handleGetFormsMedia(request, response, mediaAssetId) {
    if (!requireHomeDaycareHubTesting(response)) return;
    const store = readStore();
    const asset = await formsUploadLib.loadFormsUploadBytes({
      mediaAssetId,
      storePath: getStorePath(),
      postgresPool: getPostgresPool(),
      usePostgres: usePostgresStore(),
    });
    if (!asset) {
      jsonResponse(response, 404, { error: "File not found.", code: "file_not_found" });
      return;
    }

    // Provider path: authenticated program identity.
    let identity = null;
    let context = null;
    try {
      identity = await resolveScheduleIdentity(request);
      context = programOwnership.resolveProgramContext(store, identity);
      if (!context?.ok) context = null;
    } catch (_e) {
      identity = null;
      context = null;
    }

    // Family path: explicit household session (revoked households already rejected).
    const family = typeof resolveFamilySession === "function" ? resolveFamilySession(request) : null;

    if (!context && !family) {
      jsonResponse(response, 401, { error: "Please log in.", code: "auth_required" });
      return;
    }

    // Resolve program for family via household owner (same as completed-record).
    let familyContext = null;
    if (family && !context) {
      const ownerEmail = String(family.household?.ownerEmail || "").trim().toLowerCase();
      const ownerUser = store.users?.[ownerEmail] || { email: ownerEmail };
      try {
        familyContext = programOwnership.resolveProgramContext(store, {
          email: ownerEmail,
          uid: ownerUser.firebaseUid || ownerUser.uid || "",
        });
        if (!familyContext?.ok) familyContext = null;
      } catch (_e) {
        familyContext = null;
      }
    }

    const programId = context?.programId || familyContext?.programId || "";
    if (!programId) {
      jsonResponse(response, 403, { error: "Not authorized to open this file.", code: "file_forbidden" });
      return;
    }

    // Authorize via owning document — knowing mediaAssetId alone is never enough.
    const forms = programFormsLib.ensureProgramFormsNamespace(store, programId);
    const staffHit = (forms.staffDocuments || []).find((d) => String(d.mediaAssetId) === String(mediaAssetId));
    const programHit = (forms.programDocuments || []).find((d) => String(d.mediaAssetId) === String(mediaAssetId));
    const programContext = context || familyContext || { programId, ok: true, role: "guardian" };
    const saved = programOwnership.readProgramChildData(store, programContext);
    const childHit = (Array.isArray(saved?.data?.Documents) ? saved.data.Documents : [])
      .find((d) => String(d.mediaAssetId) === String(mediaAssetId));
    const doc = staffHit || programHit || childHit;
    if (!doc) {
      jsonResponse(response, 404, { error: "File not found for this program.", code: "file_not_in_program" });
      return;
    }
    const located = {
      assigneeType: staffHit ? "staff" : (programHit ? "program" : "child"),
      document: doc,
    };

    try {
      if (family && !context) {
        // Family may open only explicitly shared child uploads in their household.
        const childIds = new Set([
          ...(Array.isArray(family.household?.childIds) ? family.household.childIds : []),
          ...(Array.isArray(family.household?.children)
            ? family.household.children.map((c) => c?.id || c)
            : []),
        ].map(String));
        formsRecordLib.authorizeDocumentAccess(
          { programId, role: "guardian", canManageStaff: false },
          { email: family.session?.email || "" },
          located,
          { audience: "family", householdChildIds: childIds, householdId: family.household?.id || "" },
        );
      } else if (located.assigneeType === "program") {
        const isManager = context.canManageStaff || context.role === "owner" || context.role === "director";
        if (!isManager) {
          jsonResponse(response, 403, { error: "Not authorized to open this file.", code: "file_forbidden" });
          return;
        }
      } else if (located.assigneeType === "staff") {
        formsRecordLib.authorizeDocumentAccess(context, identity, located, { audience: "staff_self" });
      } else {
        // Child paperwork file: managers always; other program staff in-program; family only if shared.
        const isManager = context.canManageStaff || context.role === "owner" || context.role === "director";
        const role = String(context.role || "").toLowerCase();
        const inProgramStaff = ["owner", "director", "teacher", "assistant", "admin"].includes(role);
        if (!isManager && !inProgramStaff) {
          jsonResponse(response, 403, { error: "Not authorized to open this file.", code: "file_forbidden" });
          return;
        }
        if (!isManager && family) {
          // Prefer explicit family ACL when a family token is also present.
          const childIds = new Set([
            ...(Array.isArray(family.household?.childIds) ? family.household.childIds : []),
          ].map(String));
          formsRecordLib.authorizeDocumentAccess(context, identity, located, {
            audience: "family",
            householdChildIds: childIds,
            householdId: family.household?.id || "",
          });
        }
      }
    } catch (error) {
      jsonResponse(response, error.status || 403, {
        error: error.message || "Not authorized to open this file.",
        code: error.code || "file_forbidden",
      });
      return;
    }
    response.writeHead(200, {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Content-Length": asset.buffer.length,
      "Content-Disposition": `inline; filename="${String(asset.fileName || doc.fileName || "document").replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(asset.buffer);
  }

  async function handleRemindDocument(request, response, documentId) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    const isManager = context.canManageStaff || context.role === "owner" || context.role === "director";
    if (!isManager) {
      jsonResponse(response, 403, { error: "Only owners and directors can send reminders." });
      return;
    }
    let body = {};
    try { body = await readJson(request); } catch (_e) { body = {}; }
    const actor = actorFromContext(context, identity);
    const assigneeType = String(body.assigneeType || "child").trim().toLowerCase();
    try {
      const located = formsRecordLib.locateDocument(store, context, { documentId, assigneeType });
      const doc = located.document;
      if (doc.archived) {
        jsonResponse(response, 400, { error: "Archived paperwork cannot be reminded.", code: "archived" });
        return;
      }
      if (located.assigneeType === "child") {
        if (doc.shareWithFamily !== true && doc.shareWithFamily !== "true") {
          jsonResponse(response, 400, {
            error: "Share this form with Family Hub before sending a reminder.",
            code: "not_shared",
          });
          return;
        }
        {
          const formsLib = require("./forms-lib.js");
          if (doc.signedAt || formsLib.isTerminalFormStatus(doc.status)) {
            jsonResponse(response, 400, {
              error: "This form is already complete; reminder not needed.",
              code: "already_complete",
            });
            return;
          }
        }
        // Live household relationship: child must still exist; skip revoked-only households.
        const saved = programOwnership.readProgramChildData(store, context);
        const profiles = Array.isArray(saved?.data?.Profiles) ? saved.data.Profiles : [];
        if (!profiles.some((p) => String(p?.id) === String(doc.childId || ""))) {
          jsonResponse(response, 403, { error: "Child is not in this program.", code: "child_not_in_program" });
          return;
        }
        const childId = String(doc.childId || "");
        const households = Object.values(store.familyHouseholds || {});
        const linked = households.filter((hh) => {
          const ids = new Set([
            ...(Array.isArray(hh?.childIds) ? hh.childIds : []),
            ...(Array.isArray(hh?.children) ? hh.children.map((c) => c?.id || c) : []),
          ].map(String));
          return ids.has(childId);
        });
        if (linked.length && linked.every((hh) => hh?.status === "revoked")) {
          jsonResponse(response, 403, {
            error: "Guardian access is revoked for this household.",
            code: "guardian_revoked",
          });
          return;
        }
      }
      if (located.assigneeType === "staff") {
        try {
          programFormsLib.validateAndResolveAssignment(store, {
            ...context,
            readChild: () => programOwnership.readProgramChildData(store, context)?.data || {},
          }, {
            audience: "staff",
            mode: "staff",
            staffEmails: [doc.assigneeEmail],
          });
        } catch (error) {
          jsonResponse(response, 403, {
            error: error.message || "Staff member is not active in this program.",
            code: "staff_inactive",
          });
          return;
        }
      }
      const result = formsUploadLib.applyManualReminder(doc, {
        actorUserId: actor.actorUserId,
      });
      located.collection[located.index] = result.document;
      if (located.assigneeType === "staff") {
        const forms = programFormsLib.ensureProgramFormsNamespace(store, context.programId);
        forms.staffDocuments = located.collection;
      } else if (located.assigneeType === "child") {
        const saved = programOwnership.readProgramChildData(store, context);
        const childData = saved?.data && typeof saved.data === "object" ? { ...saved.data } : {};
        childData.Documents = located.collection;
        programOwnership.writeProgramChildData(store, context, childData);
      }
      let delivery = { channel: "recorded", ok: true, detail: "Reminder recorded." };
      if (!result.idempotentReplay && typeof sendFamilyHubFormReminder === "function" && located.assigneeType === "child") {
        try {
          delivery = await sendFamilyHubFormReminder(store, context, result.document, actor) || delivery;
        } catch (error) {
          delivery = {
            channel: "family_hub_notification",
            ok: false,
            detail: error.message || "Notification channel unavailable in testing.",
          };
        }
      }
      if (!result.idempotentReplay) {
        programFormsLib.appendFormsAudit(store, {
          programId: context.programId,
          action: "REMINDER_SENT",
          actorUserId: actor.actorUserId,
          actorRole: actor.actorRole,
          documentId: result.document.id,
          childId: result.document.childId || "",
          assigneeEmail: result.document.assigneeEmail || "",
          detail: delivery.ok ? "Manual reminder sent" : `Reminder recorded (${delivery.detail || "channel unavailable"})`,
          meta: { mode: "manual", source: delivery.channel || "manual" },
        });
      }
      await respondAfterPersist(store, response, 200, {
        ok: true,
        testingOnly: true,
        idempotentReplay: Boolean(result.idempotentReplay),
        remindedAt: result.remindedAt,
        delivery,
        document: located.assigneeType === "staff"
          ? formsLibPublicStaff(result.document)
          : result.document,
      }, "Could not send reminder.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not send reminder.",
        code: error.code || "remind_failed",
      });
    }
  }

  async function handleArchiveDocument(request, response, documentId) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    const isManager = context.canManageStaff || context.role === "owner" || context.role === "director";
    if (!isManager) {
      jsonResponse(response, 403, { error: "Only owners and directors can archive paperwork." });
      return;
    }
    let body = {};
    try { body = await readJson(request); } catch (_e) { body = {}; }
    const actor = actorFromContext(context, identity);
    const assigneeType = String(body.assigneeType || "").trim().toLowerCase();
    try {
      const located = formsRecordLib.locateDocument(store, context, { documentId, assigneeType });
      const next = {
        ...located.document,
        archived: true,
        updatedAt: new Date().toISOString(),
      };
      located.collection[located.index] = next;
      if (located.assigneeType === "staff") {
        const forms = programFormsLib.ensureProgramFormsNamespace(store, context.programId);
        forms.staffDocuments = located.collection;
        forms.updatedAt = new Date().toISOString();
      } else if (located.assigneeType === "program") {
        const forms = programFormsLib.ensureProgramFormsNamespace(store, context.programId);
        forms.programDocuments = located.collection;
        forms.updatedAt = new Date().toISOString();
      } else {
        const saved = programOwnership.readProgramChildData(store, context);
        const childData = saved?.data && typeof saved.data === "object" ? { ...saved.data } : {};
        childData.Documents = located.collection;
        programOwnership.writeProgramChildData(store, context, childData);
      }
      programFormsLib.appendFormsAudit(store, {
        programId: context.programId,
        action: "ARCHIVED",
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        documentId: next.id,
        childId: next.childId || "",
        assigneeEmail: next.assigneeEmail || "",
        detail: "Archived (record and file preserved)",
      });
      await respondAfterPersist(store, response, 200, {
        ok: true,
        testingOnly: true,
        assigneeType: located.assigneeType,
        document: located.assigneeType === "staff" ? formsLibPublicStaff(next) : next,
      }, "Could not archive document.");
    } catch (error) {
      jsonResponse(response, error.status || 400, {
        error: error.message || "Could not archive document.",
        code: error.code || "archive_failed",
      });
    }
  }

  async function handleLinkPacketItem(request, response) {
    const ctx = await withProgramContext(request, response);
    if (!ctx) return;
    const { store, context, identity } = ctx;
    const isManager = context.canManageStaff || context.role === "owner" || context.role === "director";
    if (!isManager) {
      jsonResponse(response, 403, { error: "Only owners and directors can link packet items." });
      return;
    }
    let body;
    try { body = await readJson(request); } catch (_e) {
      jsonResponse(response, 400, { error: "Invalid packet link payload." });
      return;
    }
    const packetOwnerKey = String(identity.email || "").trim().toLowerCase();
    store.formPackets = store.formPackets && typeof store.formPackets === "object" ? store.formPackets : {};
    const list = Array.isArray(store.formPackets[packetOwnerKey]) ? store.formPackets[packetOwnerKey] : [];
    const packetId = String(body.packetId || "").trim();
    const itemId = String(body.itemId || "").trim();
    const documentId = String(body.documentId || "").trim();
    const packet = list.find((p) => String(p.id) === packetId);
    if (!packet) {
      jsonResponse(response, 404, { error: "Packet not found." });
      return;
    }
    const items = Array.isArray(packet.items) ? packet.items : [];
    const idx = items.findIndex((it) => String(it.id) === itemId);
    if (idx < 0) {
      jsonResponse(response, 404, { error: "Packet item not found." });
      return;
    }
    // Verify document belongs to this program (child Documents).
    let document = null;
    try {
      const located = formsRecordLib.locateDocument(store, context, {
        documentId,
        assigneeType: "child",
      });
      document = located.document;
    } catch (_e) {
      jsonResponse(response, 404, { error: "Document not found in this program.", code: "document_not_found" });
      return;
    }
    const nextItem = {
      ...items[idx],
      documentId,
    };
    const resolved = formsUploadLib.resolvePacketItemFromDocument(nextItem, document);
    const nextItems = items.slice();
    nextItems[idx] = { ...items[idx], documentId, status: resolved.status, statusLabel: resolved.statusLabel };
    const nextPacket = { ...packet, items: nextItems, updatedAt: new Date().toISOString() };
    store.formPackets[packetOwnerKey] = list.map((p) => (String(p.id) === packetId ? nextPacket : p));
    await respondAfterPersist(store, response, 200, {
      ok: true,
      testingOnly: true,
      packet: nextPacket,
      item: resolved,
    }, "Could not link packet item.");
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
    if (pathname === "/api/program-forms/uploads" && method === "POST") return handleCreateUpload;
    if (pathname === "/api/program-forms/packets/link" && method === "POST") return handleLinkPacketItem;
    const mediaMatch = pathname.match(/^\/api\/program-forms\/media\/([^/]+)$/);
    if (mediaMatch && method === "GET") {
      const mediaAssetId = decodeURIComponent(mediaMatch[1]);
      return (req, res) => handleGetFormsMedia(req, res, mediaAssetId);
    }
    const remindMatch = pathname.match(/^\/api\/program-forms\/documents\/([^/]+)\/remind$/);
    if (remindMatch && method === "POST") {
      const documentId = decodeURIComponent(remindMatch[1]);
      return (req, res) => handleRemindDocument(req, res, documentId);
    }
    const archiveMatch = pathname.match(/^\/api\/program-forms\/documents\/([^/]+)\/archive$/);
    if (archiveMatch && method === "POST") {
      const documentId = decodeURIComponent(archiveMatch[1]);
      return (req, res) => handleArchiveDocument(req, res, documentId);
    }
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
