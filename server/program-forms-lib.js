/**
 * Wave 1 — Durable program paperwork namespace (testing spine).
 *
 * Authoritative:
 *   store.programData[programId].forms.staffDocuments[]
 *   store.programData[programId].forms.templates[]
 *   store.formsAudit[]  (append-only; no destructive FIFO)
 *
 * Temporary fallback (read-only until migration gate):
 *   client programSettings.staffFormDocuments / formTemplates (migrated via API)
 *
 * Does NOT replace child Documents[] or create a second roster.
 */
"use strict";

const crypto = require("node:crypto");
const formsLib = require("./forms-lib.js");

const CRITICAL_AUDIT_ACTIONS = Object.freeze([
  "CREATED",
  "EDITED",
  "VERSION_CREATED",
  "ASSIGNED",
  "SENT_SHARED",
  "VIEWED",
  "STARTED",
  "PROGRESS_SAVED",
  "SIGNED",
  "SUBMITTED",
  "COMPLETED",
  "NEEDS_CORRECTION",
  "REMINDER_SENT",
  "VOIDED",
  "SUPERSEDED",
  "ARCHIVED",
  "MIGRATED",
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value = "", max = 500) {
  return String(value || "").trim().slice(0, max);
}

function newId(prefix = "pf") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function emptyProgramForms() {
  return {
    staffDocuments: [],
    templates: [],
    updatedAt: "",
  };
}

/** Ensure programData[programId].forms exists without wiping child/schedule. */
function ensureProgramFormsNamespace(store, programId) {
  const id = String(programId || "").trim();
  if (!id) throw Object.assign(new Error("Missing programId."), { status: 400 });
  store.programData = store.programData && typeof store.programData === "object" ? store.programData : {};
  store.programData[id] = store.programData[id] && typeof store.programData[id] === "object"
    ? store.programData[id]
    : { programId: id, child: null, schedule: null };
  const bucket = store.programData[id];
  if (!bucket.forms || typeof bucket.forms !== "object") {
    bucket.forms = emptyProgramForms();
  }
  if (!Array.isArray(bucket.forms.staffDocuments)) bucket.forms.staffDocuments = [];
  if (!Array.isArray(bucket.forms.templates)) bucket.forms.templates = [];
  return bucket.forms;
}

function ensureFormsAuditStore(store) {
  store.formsAudit = Array.isArray(store.formsAudit) ? store.formsAudit : [];
  // Preservation archive — never used for deletion of required evidence.
  store.formsAuditArchive = Array.isArray(store.formsAuditArchive) ? store.formsAuditArchive : [];
  return store;
}

/**
 * Append-only audit. Actor identity is ALWAYS derived server-side by the caller.
 * Client-supplied actor fields are ignored.
 * No FIFO truncation of critical evidence.
 */
function appendFormsAudit(store, entry = {}) {
  ensureFormsAuditStore(store);
  const action = String(entry.action || "").trim().toUpperCase();
  if (!CRITICAL_AUDIT_ACTIONS.includes(action) && action !== "MIGRATED") {
    throw Object.assign(new Error("Unsupported forms audit action."), { status: 400 });
  }
  const row = {
    id: newId("fa"),
    at: nowIso(),
    programId: cleanText(entry.programId || "", 80),
    action,
    actorUserId: normalizeEmail(entry.actorUserId || ""),
    actorRole: cleanText(entry.actorRole || "", 40),
    documentId: cleanText(entry.documentId || "", 80),
    versionId: cleanText(entry.versionId || "", 80),
    templateId: cleanText(entry.templateId || "", 80),
    childId: cleanText(entry.childId || "", 80),
    householdId: cleanText(entry.householdId || "", 80),
    assigneeEmail: normalizeEmail(entry.assigneeEmail || ""),
    // Non-sensitive meta only — never form answers/body.
    meta: entry.meta && typeof entry.meta === "object"
      ? {
        fromStatus: cleanText(entry.meta.fromStatus || "", 40) || undefined,
        toStatus: cleanText(entry.meta.toStatus || "", 40) || undefined,
        recipientCount: Number.isFinite(Number(entry.meta.recipientCount))
          ? Number(entry.meta.recipientCount)
          : undefined,
        mode: cleanText(entry.meta.mode || "", 40) || undefined,
        contentVersion: Number.isFinite(Number(entry.meta.contentVersion))
          ? Number(entry.meta.contentVersion)
          : undefined,
        ipHash: cleanText(entry.meta.ipHash || "", 64) || undefined,
        migratedCount: Number.isFinite(Number(entry.meta.migratedCount))
          ? Number(entry.meta.migratedCount)
          : undefined,
        source: cleanText(entry.meta.source || "", 40) || undefined,
      }
      : null,
    detail: cleanText(entry.detail || "", 240),
  };
  // Prepend; do NOT slice/drop. If a future soft archive is needed, MOVE rows
  // to formsAuditArchive without deleting critical evidence.
  store.formsAudit.unshift(row);
  return row;
}

function listFormsAuditForProgram(store, programId, { limit = 200 } = {}) {
  ensureFormsAuditStore(store);
  const id = String(programId || "").trim();
  const active = (store.formsAudit || []).filter((row) => String(row.programId || "") === id);
  const archived = (store.formsAuditArchive || []).filter((row) => String(row.programId || "") === id);
  // Read path may combine; never lose archive rows.
  return [...active, ...archived].slice(0, Math.max(1, Math.min(1000, Number(limit) || 200)));
}

function normalizeStaffDocument(raw = {}, { programId = "" } = {}) {
  const email = normalizeEmail(raw.assigneeEmail || raw.email || "");
  const id = cleanText(raw.id || "", 80) || newId("staff-form");
  const draftText = String(raw.draftText || raw.body || raw.bodyText || "").slice(0, 20000);
  const status = formsLib.normalizeFormStatus(raw.status || "assigned");
  return {
    id,
    programId: cleanText(programId || raw.programId || "", 80),
    assigneeType: "staff",
    assigneeEmail: email,
    title: cleanText(raw.title || "Staff form", 160) || "Staff form",
    category: cleanText(raw.category || "Staff", 80) || "Staff",
    templateId: cleanText(raw.templateId || "", 80),
    packFormId: cleanText(raw.packFormId || "", 80),
    resourceId: cleanText(raw.resourceId || "", 80),
    status,
    statusLabel: formsLib.formStatusLabel(raw.statusLabel || status),
    draftText,
    bodyHash: cleanText(raw.bodyHash || "", 80) || (draftText ? formsLib.hashFormBody(draftText) : ""),
    contentVersion: Math.max(1, Number(raw.contentVersion) || 1),
    dueDate: cleanText(raw.dueDate || "", 20),
    assignedAt: cleanText(raw.assignedAt || raw.createdAt || nowIso(), 40),
    updatedAt: cleanText(raw.updatedAt || nowIso(), 40),
    completedAt: cleanText(raw.completedAt || "", 40),
    signedAt: cleanText(raw.signedAt || "", 40),
    signedBy: cleanText(raw.signedBy || "", 120),
    signedRole: cleanText(raw.signedRole || "staff", 40),
    signedSnapshot: String(raw.signedSnapshot || "").slice(0, 20000),
    signedBodyHash: cleanText(raw.signedBodyHash || "", 80),
    providerReviewed: Boolean(raw.providerReviewed),
    requiresSignature: raw.requiresSignature !== false,
    notes: cleanText(raw.notes || "", 500),
    archived: Boolean(raw.archived),
    shareWithFamily: false, // staff paperwork never family-visible
  };
}

function normalizeTemplate(raw = {}, { programId = "" } = {}) {
  const id = cleanText(raw.id || "", 80) || newId("form-template");
  const body = String(raw.body || raw.bodyText || raw.draftText || "").slice(0, 20000);
  return {
    id,
    programId: cleanText(programId || raw.programId || "", 80),
    sourceType: cleanText(raw.sourceType || "provider", 40) || "provider",
    originTemplateId: cleanText(raw.originTemplateId || "", 80),
    title: cleanText(raw.title || "Custom form", 160) || "Custom form",
    category: cleanText(raw.category || "Other", 80) || "Other",
    description: cleanText(raw.description || "", 500),
    body,
    bodyText: body,
    fields: Array.isArray(raw.fields) ? raw.fields : [],
    fieldSchemaVersion: Number(raw.fieldSchemaVersion) || 1,
    requiresSignature: raw.requiresSignature !== false,
    defaultDueInDays: raw.defaultDueInDays == null ? null : Number(raw.defaultDueInDays),
    stateCode: raw.stateCode ? cleanText(raw.stateCode, 8).toUpperCase() : null,
    regulatoryBody: raw.regulatoryBody ? cleanText(raw.regulatoryBody, 120) : null,
    sourceVersion: raw.sourceVersion ? cleanText(raw.sourceVersion, 80) : null,
    complianceDisclaimer: cleanText(
      raw.complianceDisclaimer
      || "Universal / General Template — Review against your specific state licensing rules before publishing.",
      400,
    ),
    packFormId: cleanText(raw.packFormId || "", 80),
    resourceId: cleanText(raw.resourceId || "", 80),
    bodyHash: cleanText(raw.bodyHash || "", 80) || (body ? formsLib.hashFormBody(body) : ""),
    contentVersion: Math.max(1, Number(raw.contentVersion) || 1),
    createdAt: cleanText(raw.createdAt || nowIso(), 40),
    updatedAt: cleanText(raw.updatedAt || nowIso(), 40),
    createdByEmail: normalizeEmail(raw.createdByEmail || ""),
    archived: Boolean(raw.archived),
  };
}

function listStaffDocuments(store, programId, { assigneeEmail = "", includeArchived = false } = {}) {
  const forms = ensureProgramFormsNamespace(store, programId);
  let rows = forms.staffDocuments.slice();
  if (!includeArchived) rows = rows.filter((d) => !d.archived);
  const email = normalizeEmail(assigneeEmail);
  if (email) rows = rows.filter((d) => normalizeEmail(d.assigneeEmail) === email);
  return rows;
}

function listTemplates(store, programId, { includeArchived = false } = {}) {
  const forms = ensureProgramFormsNamespace(store, programId);
  let rows = forms.templates.slice();
  if (!includeArchived) rows = rows.filter((t) => !t.archived);
  return rows;
}

function upsertStaffDocument(store, programId, raw, { actorUserId, actorRole } = {}) {
  const forms = ensureProgramFormsNamespace(store, programId);
  const doc = normalizeStaffDocument(raw, { programId });
  if (!doc.assigneeEmail || !doc.assigneeEmail.includes("@")) {
    throw Object.assign(new Error("Staff assignee email is required."), { status: 400 });
  }
  const idx = forms.staffDocuments.findIndex((d) => String(d.id) === String(doc.id));
  const existing = idx >= 0 ? forms.staffDocuments[idx] : null;
  if (idx >= 0) {
    forms.staffDocuments[idx] = { ...existing, ...doc, updatedAt: nowIso() };
  } else {
    forms.staffDocuments.unshift(doc);
  }
  forms.updatedAt = nowIso();
  appendFormsAudit(store, {
    programId,
    action: existing ? "EDITED" : "ASSIGNED",
    actorUserId,
    actorRole,
    documentId: doc.id,
    assigneeEmail: doc.assigneeEmail,
    templateId: doc.templateId,
    meta: { toStatus: doc.status, contentVersion: doc.contentVersion, source: "server" },
    detail: existing ? "Staff document updated" : "Staff document assigned",
  });
  return forms.staffDocuments.find((d) => String(d.id) === String(doc.id));
}

function upsertTemplate(store, programId, raw, { actorUserId, actorRole } = {}) {
  const forms = ensureProgramFormsNamespace(store, programId);
  const template = normalizeTemplate(raw, { programId });
  if (!String(template.body || "").trim() && !(Array.isArray(template.fields) && template.fields.length)) {
    throw Object.assign(new Error("Template body or fields are required."), { status: 400 });
  }
  const idx = forms.templates.findIndex((t) => String(t.id) === String(template.id));
  const existing = idx >= 0 ? forms.templates[idx] : null;
  if (idx >= 0) {
    forms.templates[idx] = { ...existing, ...template, updatedAt: nowIso() };
  } else {
    forms.templates.unshift(template);
  }
  forms.updatedAt = nowIso();
  appendFormsAudit(store, {
    programId,
    action: existing ? "EDITED" : "CREATED",
    actorUserId,
    actorRole,
    templateId: template.id,
    meta: { contentVersion: template.contentVersion, source: "server" },
    detail: existing ? "Provider template updated" : "Provider template created",
  });
  return forms.templates.find((t) => String(t.id) === String(template.id));
}

/**
 * Idempotent migration from client-held arrays into server authoritative store.
 * Server wins on ID collision. Never deletes client or server rows.
 */
function migrateClientFormsPayload(store, programId, payload = {}, { actorUserId, actorRole } = {}) {
  const forms = ensureProgramFormsNamespace(store, programId);
  const clientStaff = Array.isArray(payload.staffDocuments) ? payload.staffDocuments : [];
  const clientTemplates = Array.isArray(payload.templates) ? payload.templates : [];

  let staffInserted = 0;
  let staffSkippedExisting = 0;
  let templatesInserted = 0;
  let templatesSkippedExisting = 0;

  const staffIds = new Set(forms.staffDocuments.map((d) => String(d.id)));
  clientStaff.forEach((raw) => {
    const normalized = normalizeStaffDocument(raw, { programId });
    if (!normalized.assigneeEmail) return;
    if (staffIds.has(String(normalized.id))) {
      staffSkippedExisting += 1;
      return;
    }
    forms.staffDocuments.push(normalized);
    staffIds.add(String(normalized.id));
    staffInserted += 1;
  });

  const templateIds = new Set(forms.templates.map((t) => String(t.id)));
  clientTemplates.forEach((raw) => {
    const normalized = normalizeTemplate(raw, { programId });
    if (templateIds.has(String(normalized.id))) {
      templatesSkippedExisting += 1;
      return;
    }
    forms.templates.push(normalized);
    templateIds.add(String(normalized.id));
    templatesInserted += 1;
  });

  forms.updatedAt = nowIso();

  if (staffInserted || templatesInserted) {
    appendFormsAudit(store, {
      programId,
      action: "MIGRATED",
      actorUserId,
      actorRole,
      meta: {
        migratedCount: staffInserted + templatesInserted,
        source: "client_fallback",
      },
      detail: `Migrated ${staffInserted} staff docs, ${templatesInserted} templates (server wins on id)`,
    });
  }

  return {
    programId,
    authoritative: "programData.forms",
    fallback: "client programSettings (read-only until removal gate)",
    staff: {
      serverCount: forms.staffDocuments.length,
      clientSubmitted: clientStaff.length,
      inserted: staffInserted,
      skippedExistingServerWins: staffSkippedExisting,
    },
    templates: {
      serverCount: forms.templates.length,
      clientSubmitted: clientTemplates.length,
      inserted: templatesInserted,
      skippedExistingServerWins: templatesSkippedExisting,
    },
    removalGate: describeFallbackRemovalGate(forms, {
      clientStaffCount: clientStaff.length,
      clientTemplateCount: clientTemplates.length,
      staffInserted,
      templatesInserted,
    }),
  };
}

function describeFallbackRemovalGate(forms, stats = {}) {
  const serverStaff = Array.isArray(forms?.staffDocuments) ? forms.staffDocuments.length : 0;
  const serverTemplates = Array.isArray(forms?.templates) ? forms.templates.length : 0;
  const clientStaff = Number(stats.clientStaffCount) || 0;
  const clientTemplates = Number(stats.clientTemplateCount) || 0;
  // Gate: server has at least as many rows as this migration batch claimed,
  // and a migration has been attempted (or both sides empty).
  const staffOk = serverStaff >= clientStaff;
  const templatesOk = serverTemplates >= clientTemplates;
  const bothEmpty = serverStaff === 0 && clientStaff === 0 && serverTemplates === 0 && clientTemplates === 0;
  const ready = (staffOk && templatesOk) || bothEmpty;
  return {
    readyToRemoveFallback: false, // Wave 1 never removes fallback — gate documented only
    countsOk: ready,
    requirements: [
      "server staffDocuments count >= migrated client batch",
      "server templates count >= migrated client batch",
      "dual-read telemetry shows 0 fallback hits (future)",
      "client write paths to programSettings.* removed",
      "explicit owner approval to remove fallback",
    ],
    status: "fallback_read_only_active",
  };
}

/**
 * Dual-read helper for tests/clients: server first, then fallback rows whose ids
 * are missing on the server. Server wins on collision.
 */
function dualReadMerge(serverRows = [], fallbackRows = []) {
  const server = Array.isArray(serverRows) ? serverRows : [];
  const fallback = Array.isArray(fallbackRows) ? fallbackRows : [];
  const ids = new Set(server.map((r) => String(r?.id || "")));
  const extras = fallback.filter((r) => r && r.id && !ids.has(String(r.id)));
  return {
    rows: [...server, ...extras],
    serverCount: server.length,
    fallbackOnlyCount: extras.length,
    authoritative: "server",
  };
}

function isStrictlySharedWithFamily(doc = {}) {
  return doc?.shareWithFamily === true || doc?.shareWithFamily === "true";
}

/**
 * Server-side assignment validation foundation (Wave 1).
 * Resolves targets against canonical Profiles / households / staff; never trusts client lists alone.
 */
function validateAndResolveAssignment(store, context, request = {}) {
  if (!context?.ok || !context.programId) {
    const err = new Error(context?.error || "Could not resolve program.");
    err.status = 403;
    throw err;
  }
  const programId = context.programId;
  const mode = String(request.mode || "children").trim().toLowerCase();
  const childData = context.readChild
    ? context.readChild()
    : null;
  const profiles = Array.isArray(request.profiles)
    ? request.profiles
    : (Array.isArray(childData?.Profiles) ? childData.Profiles : []);

  const households = Array.isArray(request.households)
    ? request.households
    : Object.values(store.familyHouseholds || {}).filter((hh) => {
      const hhProgram = String(hh.programId || "").trim();
      if (hhProgram) return hhProgram === programId;
      // Legacy households without programId: only allow if owner matches program owner
      return normalizeEmail(hh.ownerEmail) === normalizeEmail(context.ownerEmail);
    });

  const ownerEmail = normalizeEmail(context.ownerEmail);
  const programStaffEmails = new Set(
    Object.values(store.users || {})
      .filter((u) => {
        const email = normalizeEmail(u.email);
        if (!email) return false;
        if (u.accountStatus === "Disabled" || u.disabled === true) return false;
        const userProgram = String(u.programId || "").trim();
        const linked = normalizeEmail(u.linkedProgramOwnerEmail || "");
        return userProgram === programId
          || (linked && linked === ownerEmail)
          || email === ownerEmail;
      })
      .map((u) => normalizeEmail(u.email)),
  );

  // Reject forged programId if client sends one that doesn't match context.
  if (request.programId && String(request.programId).trim() !== programId) {
    const err = new Error("programId does not match the authenticated program.");
    err.status = 403;
    throw err;
  }

  const requestedStaff = (Array.isArray(request.staffEmails) ? request.staffEmails : [])
    .map(normalizeEmail)
    .filter(Boolean);
  if (mode === "staff") {
    const invalid = requestedStaff.filter((email) => !programStaffEmails.has(email));
    if (invalid.length) {
      const err = new Error("One or more staff emails are not members of this program.");
      err.status = 403;
      err.invalidStaffEmails = invalid;
      throw err;
    }
  }

  // Household membership: every requested household must belong to this program.
  const requestedHouseholdIds = (Array.isArray(request.householdIds) ? request.householdIds : []).map(String);
  if ((mode === "household" || mode === "families" || mode === "family") && requestedHouseholdIds.length) {
    const allowed = new Set(households.map((h) => String(h.id)));
    const bad = requestedHouseholdIds.filter((id) => !allowed.has(id));
    if (bad.length) {
      const err = new Error("One or more households are not in this program.");
      err.status = 403;
      err.invalidHouseholdIds = bad;
      throw err;
    }
  }

  // Child IDs must exist in program Profiles when explicitly supplied.
  const profileIds = new Set(
    profiles.filter((p) => p && !p.archived).map((p) => String(p.id)),
  );
  const requestedChildIds = (Array.isArray(request.childIds) ? request.childIds : []).map(String).filter(Boolean);
  if (mode === "children" && requestedChildIds.length) {
    const bad = requestedChildIds.filter((id) => !profileIds.has(id));
    if (bad.length) {
      const err = new Error("One or more childIds are not in this program.");
      err.status = 403;
      err.invalidChildIds = bad;
      throw err;
    }
  }

  if (mode === "classroom") {
    const room = String(request.classroomId || "").trim();
    if (!room) {
      const err = new Error("classroomId is required for classroom assignment.");
      err.status = 400;
      throw err;
    }
    // Teachers with classroom scope may only assign within their rooms.
    if (context.writeScope === "teacher" && Array.isArray(context.classroomIds) && context.classroomIds.length) {
      if (!context.classroomIds.map(String).includes(room)) {
        const err = new Error("You cannot assign forms for that classroom.");
        err.status = 403;
        throw err;
      }
    }
  }

  // Assistants cannot assign Documents / staff forms.
  if (context.writeScope === "assistant" || context.role === "assistant") {
    const err = new Error("Assistants cannot assign paperwork.");
    err.status = 403;
    throw err;
  }

  const resolved = formsLib.resolveFormAssignmentTargets({
    mode,
    childIds: requestedChildIds,
    classroomId: request.classroomId || "",
    householdIds: requestedHouseholdIds,
    profiles,
    households,
    staffEmails: requestedStaff,
    programAll: mode === "program",
  });

  // Post-filter resolved children to program Profiles only.
  resolved.childIds = resolved.childIds.filter((id) => profileIds.has(String(id)));
  resolved.staffEmails = resolved.staffEmails.filter((email) => programStaffEmails.has(normalizeEmail(email)));
  resolved.programId = programId;
  resolved.mode = mode;
  resolved.ok = true;
  return resolved;
}

function hashRequestIp(request) {
  try {
    const raw = String(
      request?.headers?.["x-forwarded-for"]
      || request?.socket?.remoteAddress
      || "",
    ).split(",")[0].trim();
    if (!raw) return "";
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 20);
  } catch (_error) {
    return "";
  }
}

module.exports = {
  CRITICAL_AUDIT_ACTIONS,
  emptyProgramForms,
  ensureProgramFormsNamespace,
  ensureFormsAuditStore,
  appendFormsAudit,
  listFormsAuditForProgram,
  normalizeStaffDocument,
  normalizeTemplate,
  listStaffDocuments,
  listTemplates,
  upsertStaffDocument,
  upsertTemplate,
  migrateClientFormsPayload,
  dualReadMerge,
  isStrictlySharedWithFamily,
  validateAndResolveAssignment,
  hashRequestIp,
  describeFallbackRemovalGate,
};
