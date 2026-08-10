/**
 * Wave 1 — HTTP handlers for durable program forms namespace.
 * Wired from server/index.js; keeps index.js diffs small.
 */
"use strict";

const programFormsLib = require("./program-forms-lib.js");
const formFieldsLib = require("./form-fields-lib.js");

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
    const rows = programFormsLib.listFormsAuditForProgram(store, context.programId, { limit });
    jsonResponse(response, 200, {
      ok: true,
      programId: context.programId,
      audit: rows,
      retention: "append_only_no_destructive_fifo",
      archiveCollection: "formsAuditArchive",
    });
  }

  async function handleForbiddenAuditMutations(request, response) {
    if (!requireHomeDaycareHubTesting(response)) return;
    jsonResponse(response, 405, {
      error: "Forms audit is append-only. Clients cannot create, edit, or delete audit events.",
    });
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
