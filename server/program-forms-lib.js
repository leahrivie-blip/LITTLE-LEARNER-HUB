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
const formFieldsLib = require("./form-fields-lib.js");
const formsAssignLib = require("./forms-assign-lib.js");

const READ_ONLY_TEMPLATE_SOURCES = new Set(["system", "starter", "cms", "pack"]);

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
  // Wave 7 — paperwork file upload onto the canonical Documents / staffDocuments spine.
  "UPLOADED",
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
    // Wave 7 — program-level paperwork (policies/licensing refs); not a Dropbox.
    programDocuments: [],
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
  if (!Array.isArray(bucket.forms.programDocuments)) bucket.forms.programDocuments = [];
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
  const formsSignatureLib = require("./forms-signature-lib.js");
  const email = normalizeEmail(raw.assigneeEmail || raw.email || "");
  const id = cleanText(raw.id || "", 80) || newId("staff-form");
  const draftText = String(raw.draftText || raw.body || raw.bodyText || "").slice(0, 20000);
  const status = formsLib.normalizeFormStatus(raw.status || "assigned");
  const fields = formFieldsLib.normalizeFormFields(raw.fields || [], { strict: false });
  const answers = raw.answers && typeof raw.answers === "object" ? raw.answers : {};
  const base = {
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
    fields,
    answers,
    fieldSchemaVersion: fields.length ? 1 : undefined,
    bodyHash: cleanText(raw.bodyHash || "", 80) || (draftText ? formsLib.hashFormBody(draftText) : ""),
    contentVersion: Math.max(1, Number(raw.contentVersion) || 1),
    templateVersion: Math.max(1, Number(raw.templateVersion) || Number(raw.contentVersion) || 1),
    currentVersionId: cleanText(raw.currentVersionId || "", 80),
    versions: Array.isArray(raw.versions) ? raw.versions : undefined,
    dueDate: cleanText(raw.dueDate || "", 20),
    expiresAt: cleanText(raw.expiresAt || "", 20),
    lastNotifiedAt: cleanText(raw.lastNotifiedAt || raw.remindedAt || "", 40),
    sourceType: cleanText(raw.sourceType || "", 40),
    documentKind: cleanText(raw.documentKind || "", 40),
    mediaAssetId: cleanText(raw.mediaAssetId || "", 80),
    mediaUrl: cleanText(raw.mediaUrl || raw.fileUrl || "", 400),
    fileUrl: cleanText(raw.fileUrl || raw.mediaUrl || "", 400),
    fileName: cleanText(raw.fileName || "", 180),
    mimeType: cleanText(raw.mimeType || "", 80),
    byteLen: Number.isFinite(Number(raw.byteLen)) ? Number(raw.byteLen) : 0,
    sha256: cleanText(raw.sha256 || "", 80),
    uploadedAt: cleanText(raw.uploadedAt || "", 40),
    uploadedBy: normalizeEmail(raw.uploadedBy || ""),
    presentation: cleanText(raw.presentation || "", 40),
    assignedAt: cleanText(raw.assignedAt || raw.createdAt || nowIso(), 40),
    updatedAt: cleanText(raw.updatedAt || nowIso(), 40),
    completedAt: cleanText(raw.completedAt || "", 40),
    signedAt: cleanText(raw.signedAt || "", 40),
    signedBy: cleanText(raw.signedBy || "", 120),
    signedRole: cleanText(raw.signedRole || "staff", 40),
    signedSnapshot: String(raw.signedSnapshot || "").slice(0, 20000),
    signedBodyHash: cleanText(raw.signedBodyHash || "", 80),
    signatureMethod: cleanText(raw.signatureMethod || "", 40),
    signerUserId: normalizeEmail(raw.signerUserId || ""),
    providerReviewed: Boolean(raw.providerReviewed),
    requiresSignature: raw.requiresSignature !== false,
    notes: cleanText(raw.notes || "", 500),
    archived: Boolean(raw.archived),
    sendBatchId: cleanText(raw.sendBatchId || "", 80),
    shareWithFamily: false, // staff paperwork never family-visible
    voidedAt: cleanText(raw.voidedAt || "", 40),
    voidReason: cleanText(raw.voidReason || "", 240),
  };
  return formsSignatureLib.ensureDocumentVersions(base);
}

function normalizeEnrollmentTemplateExtras(raw = {}) {
  let enrollmentBaseline = null;
  try {
    enrollmentBaseline = require("./enrollment-form-baseline.js");
  } catch (_error) {
    enrollmentBaseline = null;
  }
  let brandingLib = null;
  try {
    brandingLib = require("./forms-branding-lib.js");
  } catch (_error) {
    brandingLib = null;
  }
  const formKind = cleanText(raw.formKind || "", 40);
  const looksEnrollment = formKind === "enrollment_baseline"
    || (enrollmentBaseline && enrollmentBaseline.isEnrollmentBaselineTemplate(raw));
  const branding = brandingLib
    ? brandingLib.normalizeFormBrandingOverride(raw.branding || raw.formsBrandingOverride || {})
    : (raw.branding && typeof raw.branding === "object" ? raw.branding : undefined);
  const intendedAudience = cleanText(raw.intendedAudience || raw.audience || "", 40);
  const starterKey = cleanText(raw.starterKey || raw.sourceStarterKey || "", 80);
  if (!looksEnrollment) {
    return {
      formKind: formKind || undefined,
      sections: Array.isArray(raw.sections) ? raw.sections.slice(0, 80).map((section, index) => ({
        id: cleanText(section?.id || `section_${index + 1}`, 80) || `section_${index + 1}`,
        title: cleanText(section?.title || `Section ${index + 1}`, 160) || `Section ${index + 1}`,
        description: cleanText(section?.description || "", 500),
        visible: section?.visible !== false,
        order: Number.isFinite(Number(section?.order)) ? Number(section.order) : index,
        fieldIds: Array.isArray(section?.fieldIds)
          ? section.fieldIds.map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 240)
          : undefined,
      })) : undefined,
      enrollmentConfig: raw.enrollmentConfig && typeof raw.enrollmentConfig === "object"
        ? raw.enrollmentConfig
        : undefined,
      branding,
      intendedAudience: intendedAudience || undefined,
      starterKey: starterKey || undefined,
      sourceStarterKey: cleanText(raw.sourceStarterKey || starterKey || "", 80) || undefined,
    };
  }
  const sections = enrollmentBaseline
    ? enrollmentBaseline.normalizeEnrollmentSections(raw.sections)
    : (Array.isArray(raw.sections) ? raw.sections : []);
  const enrollmentConfig = enrollmentBaseline
    ? enrollmentBaseline.buildEnrollmentConfig(raw.enrollmentConfig || {})
    : (raw.enrollmentConfig || {});
  return {
    formKind: "enrollment_baseline",
    sections,
    enrollmentConfig,
    branding,
    intendedAudience: intendedAudience || "family",
    starterKey: starterKey || "enrollment",
    sourceStarterKey: cleanText(raw.sourceStarterKey || "enrollment", 80) || "enrollment",
  };
}

function normalizeTemplate(raw = {}, { programId = "", strictFields = true } = {}) {
  const id = cleanText(raw.id || "", 80) || newId("form-template");
  const body = formFieldsLib.cleanText(raw.body || raw.bodyText || raw.draftText || "", 20000);
  const fields = formFieldsLib.normalizeFormFields(raw.fields || [], { strict: strictFields });
  if (!body && !fields.length && strictFields) {
    // Allow empty during non-strict dual-read normalize of legacy rows only when caller opts out.
  }
  const fp = formFieldsLib.templateContentFingerprint({ body, fields });
  const sourceType = cleanText(raw.sourceType || "provider", 40) || "provider";
  const enrollmentExtras = normalizeEnrollmentTemplateExtras(raw);
  return {
    id,
    programId: cleanText(programId || raw.programId || "", 80),
    sourceType,
    originTemplateId: cleanText(raw.originTemplateId || "", 80),
    title: cleanText(raw.title || "Custom form", 160) || "Custom form",
    category: cleanText(raw.category || "Other", 80) || "Other",
    libraryCategory: cleanText(raw.libraryCategory || "", 80),
    description: cleanText(raw.description || "", 500),
    body,
    bodyText: body,
    fields,
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
    formKind: enrollmentExtras.formKind,
    sections: enrollmentExtras.sections,
    enrollmentConfig: enrollmentExtras.enrollmentConfig,
    branding: enrollmentExtras.branding,
    intendedAudience: enrollmentExtras.intendedAudience,
    starterKey: enrollmentExtras.starterKey,
    sourceStarterKey: enrollmentExtras.sourceStarterKey,
    bodyHash: cleanText(raw.bodyHash || "", 80) || fp.bodyHash,
    fieldsHash: cleanText(raw.fieldsHash || "", 80) || fp.fieldsHash,
    contentVersion: Math.max(1, Number(raw.contentVersion) || 1),
    createdAt: cleanText(raw.createdAt || nowIso(), 40),
    updatedAt: cleanText(raw.updatedAt || nowIso(), 40),
    createdByEmail: normalizeEmail(raw.createdByEmail || ""),
    archived: Boolean(raw.archived),
    aiGenerated: Boolean(raw.aiGenerated),
    aiReviewedBeforeSave: Boolean(raw.aiReviewedBeforeSave),
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
  const incomingId = cleanText(raw?.id || "", 80);
  const existing = incomingId
    ? forms.templates.find((t) => String(t.id) === String(incomingId))
    : null;

  // System / starter / CMS originals are never mutated in-place.
  if (existing && READ_ONLY_TEMPLATE_SOURCES.has(String(existing.sourceType || "").toLowerCase())) {
    throw Object.assign(new Error("System and starter templates are read-only. Duplicate to customize."), {
      status: 403,
      code: "template_readonly",
    });
  }
  if (READ_ONLY_TEMPLATE_SOURCES.has(String(raw?.sourceType || "").toLowerCase()) && !existing) {
    // Clients cannot insert forged system rows into the provider store.
    raw = { ...raw, sourceType: "provider" };
  }

  // AI-sourced saves must carry explicit review acknowledgment (Phase 9 / Wave 3 gate).
  if (raw?.aiGenerated === true || raw?.source === "ai_structured_draft" || raw?.requireAiReview === true) {
    const reviewed = raw?.aiReviewedBeforeSave === true
      || raw?.reviewAcknowledged === true
      || Boolean(raw?.reviewAcknowledgedAt);
    if (!reviewed) {
      throw Object.assign(new Error("Review this AI draft before saving it as a template."), {
        status: 400,
        code: "ai_review_required",
      });
    }
  }

  let template;
  try {
    template = normalizeTemplate({
      ...raw,
      sourceType: existing?.sourceType || raw?.sourceType || "provider",
      programId,
      createdByEmail: existing?.createdByEmail || raw?.createdByEmail || actorUserId,
    }, { programId, strictFields: true });
  } catch (error) {
    throw Object.assign(error, { status: error.status || 400 });
  }

  if (!String(template.body || "").trim() && !(Array.isArray(template.fields) && template.fields.length)) {
    throw Object.assign(new Error("Template body or fields are required."), { status: 400 });
  }

  // Cross-program id swap fails closed: template.programId must match.
  if (template.programId && String(template.programId) !== String(programId)) {
    throw Object.assign(new Error("Template belongs to another program."), { status: 403 });
  }
  template.programId = String(programId);

  const idx = forms.templates.findIndex((t) => String(t.id) === String(template.id));
  if (idx >= 0) {
    const prev = forms.templates[idx];
    const materialChange = String(prev.bodyHash || "") !== String(template.bodyHash || "")
      || String(prev.fieldsHash || "") !== String(template.fieldsHash || "")
      || String(prev.title || "") !== String(template.title || "");
    const nextVersion = materialChange
      ? Math.max(1, Number(prev.contentVersion || 1) + 1)
      : Math.max(1, Number(prev.contentVersion || 1));
    forms.templates[idx] = {
      ...prev,
      ...template,
      id: prev.id,
      createdAt: prev.createdAt || template.createdAt,
      originTemplateId: prev.originTemplateId || template.originTemplateId,
      contentVersion: nextVersion,
      updatedAt: nowIso(),
    };
  } else {
    forms.templates.unshift({ ...template, updatedAt: nowIso() });
  }
  forms.updatedAt = nowIso();
  const saved = forms.templates.find((t) => String(t.id) === String(template.id));
  appendFormsAudit(store, {
    programId,
    action: idx >= 0 ? "EDITED" : "CREATED",
    actorUserId,
    actorRole,
    templateId: saved.id,
    meta: {
      contentVersion: saved.contentVersion,
      source: "server",
      originTemplateId: saved.originTemplateId || "",
      aiGenerated: Boolean(saved.aiGenerated),
    },
    detail: idx >= 0 ? "Provider template updated" : "Provider template created",
  });
  return saved;
}

/** Duplicate any template into a provider-owned copy (new id + originTemplateId). */
function duplicateTemplateAsProvider(store, programId, source, { actorUserId, actorRole } = {}) {
  let sourcePayload = source || {};
  try {
    const enrollmentBaseline = require("./enrollment-form-baseline.js");
    const isEnrollmentStarter = enrollmentBaseline.isEnrollmentBaselineTemplate(sourcePayload)
      || String(sourcePayload.packFormId || "") === enrollmentBaseline.ENROLLMENT_PACK_FORM_ID
      || String(sourcePayload.id || "") === enrollmentBaseline.ENROLLMENT_PACK_FORM_ID;
    const hasStructuredFields = Array.isArray(sourcePayload.fields) && sourcePayload.fields.length > 0;
    if (isEnrollmentStarter && !hasStructuredFields) {
      sourcePayload = {
        ...enrollmentBaseline.buildEnrollmentBaselineTemplate({
          title: sourcePayload.title || enrollmentBaseline.ENROLLMENT_TEMPLATE_TITLE,
          sourceType: "starter",
        }),
        id: sourcePayload.id || enrollmentBaseline.ENROLLMENT_PACK_FORM_ID,
      };
    }
  } catch (_error) {
    // Baseline helper unavailable — fall through to plain duplicate.
  }
  const origin = normalizeTemplate(sourcePayload, { programId, strictFields: false });
  const copy = {
    ...origin,
    id: newId("form-template"),
    programId,
    sourceType: "provider",
    originTemplateId: origin.id || origin.originTemplateId || "",
    title: origin.formKind === "enrollment_baseline"
      ? (origin.title || "Enrollment Form")
      : `${origin.title || "Custom form"} (copy)`.slice(0, 160),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdByEmail: normalizeEmail(actorUserId || ""),
    archived: false,
    contentVersion: 1,
    aiGenerated: false,
    aiReviewedBeforeSave: false,
  };
  return upsertTemplate(store, programId, copy, { actorUserId, actorRole });
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
    // Legacy client templates may be body-only; do not fail migration on empty/invalid fields.
    let normalized;
    try {
      normalized = normalizeTemplate(raw, { programId, strictFields: false });
    } catch (_error) {
      return;
    }
    if (!String(normalized.body || "").trim() && !(normalized.fields || []).length) return;
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

function listProgramStaffDirectory(store, context) {
  const programId = context.programId;
  const ownerEmail = normalizeEmail(context.ownerEmail);
  return Object.values(store.users || {})
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
    .map((u) => ({
      email: normalizeEmail(u.email),
      role: String(u.role || u.programRole || "staff").toLowerCase(),
      classroomIds: Array.isArray(u.classroomIds) ? u.classroomIds.map(String) : [],
      name: String(u.name || u.displayName || "").trim(),
    }));
}

/**
 * Server-side assignment validation foundation (Wave 1 + Wave 4 expand).
 * Resolves targets against canonical Profiles / households / staff; never trusts client lists alone.
 */
function validateAndResolveAssignment(store, context, request = {}) {
  if (!context?.ok || !context.programId) {
    const err = new Error(context?.error || "Could not resolve program.");
    err.status = 403;
    throw err;
  }
  const programId = context.programId;
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
  const staffDirectory = listProgramStaffDirectory(store, context);
  const programStaffEmails = new Set(staffDirectory.map((row) => row.email));

  // Reject forged programId if client sends one that doesn't match context.
  if (request.programId && String(request.programId).trim() !== programId) {
    const err = new Error("programId does not match the authenticated program.");
    err.status = 403;
    throw err;
  }

  // Assistants cannot assign Documents / staff forms.
  if (context.writeScope === "assistant" || context.role === "assistant") {
    const err = new Error("Assistants cannot assign paperwork.");
    err.status = 403;
    throw err;
  }

  formsLib.validateAssignmentTargetsShape(request);

  const expanded = formsAssignLib.expandAssignmentRequest(request, {
    profiles,
    staffDirectory,
  });
  const mode = expanded.mode;

  const requestedStaff = expanded.staffEmails;
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
  const requestedHouseholdIds = expanded.householdIds;
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
  const requestedChildIds = expanded.childIds;
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
    const room = String(expanded.classroomId || "").trim();
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

  if (expanded.classroomIds.length > 1
    && context.writeScope === "teacher"
    && Array.isArray(context.classroomIds)
    && context.classroomIds.length) {
    const allowedRooms = new Set(context.classroomIds.map(String));
    const badRoom = expanded.classroomIds.find((id) => !allowedRooms.has(String(id)));
    if (badRoom) {
      const err = new Error("You cannot assign forms for that classroom.");
      err.status = 403;
      throw err;
    }
  }

  const resolved = formsLib.resolveFormAssignmentTargets({
    mode,
    childIds: requestedChildIds,
    classroomId: expanded.classroomId || "",
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
  resolved.audience = expanded.audience;
  resolved.assignmentScope = expanded.assignmentScope;
  resolved.classroomIds = expanded.classroomIds;
  resolved.ok = true;

  const plan = formsAssignLib.buildRecipientPlan({
    audience: expanded.audience,
    mode,
    assignmentScope: expanded.assignmentScope,
    resolvedChildIds: resolved.childIds,
    resolvedStaffEmails: resolved.staffEmails,
    profiles,
    households,
    classroomIds: expanded.classroomIds,
  });
  resolved.plan = plan;
  resolved.counts = plan.counts;
  return resolved;
}

/**
 * Wave 4 preview — resolve recipients + counts without writing.
 */
function previewAssignment(store, context, request = {}) {
  const resolved = validateAndResolveAssignment(store, context, request);
  return {
    ok: true,
    programId: resolved.programId,
    audience: resolved.audience,
    mode: resolved.mode,
    assignmentScope: resolved.assignmentScope,
    childIds: resolved.childIds,
    staffEmails: resolved.staffEmails,
    classroomIds: resolved.classroomIds || [],
    counts: resolved.counts,
    plan: {
      audience: resolved.plan.audience,
      mode: resolved.plan.mode,
      assignmentScope: resolved.plan.assignmentScope,
      counts: resolved.plan.counts,
      householdIds: resolved.plan.householdIds,
      // Do not leak full assignment draft rows with sibling lists beyond ids needed for UI.
      assignmentSummaries: (resolved.plan.assignments || []).slice(0, 200).map((row) => ({
        kind: row.kind,
        childId: row.childId || "",
        householdId: row.householdId || "",
        assigneeEmail: row.assigneeEmail || "",
      })),
    },
  };
}

/**
 * Wave 4 Confirm & Send — server resolves recipients, enforces expected counts,
 * idempotency key, snapshots form body/fields, writes child Documents atomically
 * and staffDocuments via existing upsert. Never mixes family + staff in one call.
 */
function confirmSendAssignments(store, context, request = {}, {
  actorUserId = "",
  actorRole = "",
  writeChildData = null,
  readChildData = null,
} = {}) {
  if (!context?.ok || !context.programId) {
    throw Object.assign(new Error(context?.error || "Could not resolve program."), { status: 403 });
  }
  if (!(context.canManageStaff || context.role === "owner" || context.role === "director"
    || context.writeScope === "teacher")) {
    // Teachers may assign within classroom scope (validated below); assistants blocked in validate.
    if (context.role === "assistant" || context.writeScope === "assistant") {
      throw Object.assign(new Error("Assistants cannot assign paperwork."), { status: 403 });
    }
  }

  const idempotencyKey = cleanText(request.idempotencyKey || "", 120);
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw Object.assign(new Error("idempotencyKey is required for Confirm & Send."), {
      status: 400,
      code: "idempotency_required",
    });
  }

  const forms = ensureProgramFormsNamespace(store, context.programId);
  const cached = formsAssignLib.readIdempotency(forms, idempotencyKey);
  if (cached) {
    return { ...cached, idempotentReplay: true };
  }

  const childData = typeof readChildData === "function"
    ? (readChildData() || {})
    : (context.readChild ? context.readChild() : {});
  const profiles = Array.isArray(childData?.Profiles) ? childData.Profiles : [];
  const docs = Array.isArray(childData?.Documents) ? [...childData.Documents] : [];

  const templateId = cleanText(request.templateId || request.formSpec?.templateId || "", 80);
  let template = null;
  if (templateId) {
    template = listTemplates(store, context.programId, { includeArchived: true })
      .find((t) => String(t.id) === templateId) || null;
    // Provider may assign provider templates in-program; system/starter templates are
    // allowed as read-only sources (snapshot only — never mutate origin).
    if (!template && !(request.formSpec?.title || request.formSpec?.body || request.formSpec?.bodyText)) {
      throw Object.assign(new Error("Template not found in this program."), {
        status: 404,
        code: "template_not_found",
      });
    }
  }

  const formSpecInput = { ...(request.formSpec || request) };
  // Resolve assign-time branding from Program Settings (client-supplied) + template override.
  // Snapshot is frozen onto each document so later logo/name edits do not rewrite history.
  if (!formSpecInput.formsBranding && !formSpecInput.brandingSnapshot) {
    try {
      const brandingLib = require("./forms-branding-lib.js");
      const resolved = brandingLib.resolveFormsBranding({
        programSettings: request.programSettings || request.programBranding || {},
        formOverride: template?.branding || formSpecInput.branding || null,
        programDisplayName: request.programDisplayName || "",
      });
      formSpecInput.formsBranding = brandingLib.snapshotFormsBranding(resolved);
    } catch (_error) {
      // Branding is additive — assignment still succeeds without it.
    }
  }
  const formSpec = formsAssignLib.snapshotFormSpec(formSpecInput, template);
  if (!formSpec.title) {
    throw Object.assign(new Error("Form title is required."), { status: 400 });
  }
  if (!formSpec.draftText && !(formSpec.fields || []).length) {
    throw Object.assign(new Error("Form body or fields are required."), { status: 400 });
  }

  const resolved = validateAndResolveAssignment(store, {
    ...context,
    readChild: () => childData,
  }, {
    ...(request.target || request),
    profiles,
    programId: request.programId,
  });

  const expected = request.expected || request.expectedCounts || {};
  const match = formsAssignLib.countsMatch(expected, resolved.counts);
  if (!match.ok) {
    throw Object.assign(new Error("Recipient list changed since your review. Please review again."), {
      status: 409,
      code: "recipient_count_mismatch",
      mismatches: match.mismatches,
      counts: resolved.counts,
      plan: resolved.plan,
    });
  }

  if (!resolved.counts.assignmentCount) {
    throw Object.assign(new Error("Select at least one recipient."), { status: 400 });
  }

  const audience = resolved.audience;
  const dueDate = cleanText(request.dueDate || "", 20);
  // Family send: shareWithFamily only when Director explicitly sends to family (default true for family audience).
  // Internal child paperwork can set shareWithFamily:false. Staff always false.
  let shareWithFamily = false;
  if (audience === "family") {
    if (request.shareWithFamily === false || request.shareWithFamily === "false") {
      shareWithFamily = false;
    } else if (request.shareWithFamily === true || request.shareWithFamily === "true") {
      shareWithFamily = true;
    } else {
      // Confirm & Send to families defaults to Family Hub visibility.
      shareWithFamily = true;
    }
  }

  const sendBatchId = formsAssignLib.newId("send");
  const created = [];
  const refreshed = [];
  const plan = resolved.plan;

  if (audience === "staff") {
    // Staff path: upsert each; open-assignment refresh is idempotent by email+template.
    for (const email of plan.staffEmails) {
      const existing = listStaffDocuments(store, context.programId)
        .find((doc) => (
          normalizeEmail(doc.assigneeEmail) === email
          && formsAssignLib.isOpenAssignment(doc)
          && formsAssignLib.matchesTemplate(doc, formSpec)
        ));
      const payload = existing
        ? {
          ...existing,
          dueDate: dueDate || existing.dueDate || "",
          draftText: formSpec.draftText || existing.draftText,
          bodyHash: formSpec.bodyHash,
          fields: formSpec.fields,
          status: "assigned",
          statusLabel: formsLib.formStatusLabel("assigned"),
          requiresSignature: formSpec.requiresSignature !== false,
          templateId: formSpec.templateId || existing.templateId,
          templateVersion: formSpec.templateVersion,
          sendBatchId,
          updatedAt: nowIso(),
          lastNotifiedAt: nowIso(),
          shareWithFamily: false,
          formsBranding: existing.formsBranding || formSpec.formsBranding || null,
        }
        : {
          id: formsAssignLib.newId("staff-form"),
          assigneeEmail: email,
          title: formSpec.title,
          category: formSpec.category || "Staff",
          templateId: formSpec.templateId,
          packFormId: formSpec.packFormId,
          resourceId: formSpec.resourceId,
          draftText: formSpec.draftText,
          fields: formSpec.fields,
          bodyHash: formSpec.bodyHash,
          contentVersion: 1,
          templateVersion: formSpec.templateVersion,
          dueDate,
          status: "assigned",
          requiresSignature: formSpec.requiresSignature !== false,
          notes: formSpec.notes,
          assignedAt: nowIso(),
          sendBatchId,
          shareWithFamily: false,
          formsBranding: formSpec.formsBranding || null,
        };
      const saved = upsertStaffDocument(store, context.programId, payload, {
        actorUserId,
        actorRole,
      });
      if (existing) refreshed.push(saved.id);
      else created.push(saved.id);
      appendFormsAudit(store, {
        programId: context.programId,
        action: "SENT_SHARED",
        actorUserId,
        actorRole,
        documentId: saved.id,
        templateId: formSpec.templateId,
        assigneeEmail: email,
        meta: {
          toStatus: saved.status,
          recipientCount: 1,
          mode: resolved.mode,
          contentVersion: formSpec.templateVersion,
          source: "confirm_send",
        },
        detail: existing ? "Staff assignment refreshed (idempotent)" : "Staff assignment sent",
      });
    }
  } else {
    // Family/child path: mutate Documents[] in one write for atomicity.
    const nextDocs = [...docs];
    for (const item of plan.assignments) {
      const existing = formsAssignLib.findOpenChildDoc(nextDocs, {
        childId: item.childId,
        householdId: item.householdId,
        assignmentScope: plan.assignmentScope,
        formSpec,
      });
      const row = formsAssignLib.buildChildAssignmentRow(item, formSpec, {
        dueDate,
        shareWithFamily,
        existing,
        sendBatchId,
      });
      if (existing) {
        const idx = nextDocs.findIndex((d) => String(d.id) === String(existing.id));
        if (idx >= 0) nextDocs[idx] = row;
        refreshed.push(row.id);
      } else {
        nextDocs.unshift(row);
        created.push(row.id);
      }
      appendFormsAudit(store, {
        programId: context.programId,
        action: existing ? "EDITED" : "ASSIGNED",
        actorUserId,
        actorRole,
        documentId: row.id,
        templateId: formSpec.templateId,
        childId: row.childId,
        householdId: row.householdId || "",
        meta: {
          toStatus: row.status,
          recipientCount: 1,
          mode: resolved.mode,
          contentVersion: formSpec.templateVersion,
          source: "confirm_send",
        },
        detail: existing
          ? "Child assignment refreshed (idempotent)"
          : (row.assignmentScope === "household" ? "Household assignment created" : "Child assignment created"),
      });
      if (shareWithFamily) {
        appendFormsAudit(store, {
          programId: context.programId,
          action: "SENT_SHARED",
          actorUserId,
          actorRole,
          documentId: row.id,
          templateId: formSpec.templateId,
          childId: row.childId,
          householdId: row.householdId || "",
          meta: {
            toStatus: row.status,
            recipientCount: 1,
            mode: resolved.mode,
            source: "confirm_send",
          },
          detail: "Shared with Family Hub",
        });
      }
    }
    const nextChildData = { ...childData, Documents: nextDocs };
    if (typeof writeChildData !== "function") {
      throw Object.assign(new Error("Child data writer unavailable."), { status: 500 });
    }
    writeChildData(nextChildData);
  }

  const result = {
    ok: true,
    programId: context.programId,
    sendBatchId,
    audience,
    mode: resolved.mode,
    assignmentScope: resolved.assignmentScope,
    counts: resolved.counts,
    createdCount: created.length,
    refreshedCount: refreshed.length,
    createdIds: created,
    refreshedIds: refreshed,
    shareWithFamily,
    requiresSignature: formSpec.requiresSignature !== false,
    dueDate,
    title: formSpec.title,
    templateId: formSpec.templateId,
    notification: {
      attempted: audience === "family" && shareWithFamily,
      // Email/push delivery is separate from assignment persistence.
      deliveryRequiredForSuccess: false,
      channel: audience === "family" && shareWithFamily ? "family_hub" : (audience === "staff" ? "my_paperwork" : "none"),
    },
    idempotentReplay: false,
  };
  formsAssignLib.rememberIdempotency(forms, idempotencyKey, result);
  forms.updatedAt = nowIso();
  return result;
}

function hashRequestIp(request) {
  const formsSignatureLib = require("./forms-signature-lib.js");
  return formsSignatureLib.hashRequestIp(request);
}

/**
 * Wave 5 — staff signs their own assigned paperwork (session-bound).
 */
function signStaffDocument(store, context, documentId, requestBody = {}, {
  actorUserId = "",
  actorRole = "staff",
  ipHash = "",
} = {}) {
  const formsSignatureLib = require("./forms-signature-lib.js");
  const forms = ensureProgramFormsNamespace(store, context.programId);
  const id = String(documentId || "").trim();
  const idx = forms.staffDocuments.findIndex((d) => String(d.id) === id);
  if (idx < 0) {
    throw Object.assign(new Error("Staff paperwork not found."), { status: 404, code: "not_found" });
  }
  const current = formsSignatureLib.ensureDocumentVersions(forms.staffDocuments[idx]);
  const assignee = normalizeEmail(current.assigneeEmail);
  const actor = normalizeEmail(actorUserId);
  if (!actor || assignee !== actor) {
    throw Object.assign(new Error("Staff can only sign their own assigned paperwork."), {
      status: 403,
      code: "assignee_mismatch",
    });
  }
  // Disabled / archived staff cannot submit as active staff.
  const user = store.users?.[actor] || {};
  const status = String(user.accountStatus || "Active").toLowerCase();
  if (status === "disabled" || status === "deleted" || user.archived === true) {
    throw Object.assign(new Error("This staff account cannot sign paperwork."), {
      status: 403,
      code: "staff_inactive",
    });
  }
  if (String(current.programId || context.programId) !== String(context.programId)) {
    throw Object.assign(new Error("Cross-program signing is not allowed."), {
      status: 403,
      code: "cross_program",
    });
  }

  const answers = formsSignatureLib.sanitizeAnswers(requestBody.answers || current.answers || {});
  formsSignatureLib.validateRequiredAnswers(current.fields || [], answers);
  const bodyText = String(current.draftText || current.bodyText || "").trim();
  const currentHash = String(current.bodyHash || formsLib.hashFormBody(bodyText));
  const expectedVersionId = cleanText(requestBody.expectedVersionId || requestBody.versionId || "", 80);
  const expectedBodyHash = cleanText(requestBody.expectedBodyHash || requestBody.bodyHash || "", 80);

  if (formsSignatureLib.isIdempotentResign(current, {
    signerUserId: actor,
    expectedBodyHash: expectedBodyHash || currentHash,
  })) {
    return { staffDocument: current, idempotentReplay: true };
  }

  const displayName = cleanText(
    requestBody.typedSignature || requestBody.signerName || user.name || actor,
    120,
  ) || actor;
  const working = {
    ...current,
    draftText: bodyText,
    bodyHash: currentHash,
    answers,
  };
  const signature = formsLib.buildSignatureRecord(working, {
    signerName: displayName,
    typedSignature: requestBody.typedSignature || displayName,
    signedRole: cleanText(actorRole || "staff", 40) || "staff",
    signatureMethod: requestBody.signatureMethod || requestBody.method || "acknowledgment_text",
    signerUserId: actor,
    drawnSignatureDataUrl: requestBody.drawnSignatureDataUrl || "",
    versionId: expectedVersionId || working.currentVersionId || "",
    ipHash,
    programId: context.programId,
    assignmentId: working.id,
    answers,
  });
  const frozen = formsSignatureLib.attachSignatureToVersion(working, signature, {
    expectedVersionId,
    expectedBodyHash,
  });
  forms.staffDocuments[idx] = frozen;
  forms.updatedAt = nowIso();
  appendFormsAudit(store, {
    programId: context.programId,
    action: "SIGNED",
    actorUserId: actor,
    actorRole: cleanText(actorRole || "staff", 40) || "staff",
    documentId: id,
    versionId: frozen.currentVersionId || "",
    assigneeEmail: actor,
    meta: { mode: signature.signatureMethod, contentVersion: frozen.contentVersion, ipHash },
    detail: "Staff electronic signature",
  });
  appendFormsAudit(store, {
    programId: context.programId,
    action: "SUBMITTED",
    actorUserId: actor,
    actorRole: cleanText(actorRole || "staff", 40) || "staff",
    documentId: id,
    versionId: frozen.currentVersionId || "",
    assigneeEmail: actor,
    detail: "Staff paperwork submitted after signature",
  });
  return { staffDocument: frozen, idempotentReplay: false };
}

function voidSignedDocumentVersion(store, context, {
  documentId = "",
  assigneeType = "staff",
  voidReason = "",
  actorUserId = "",
  actorRole = "director",
  childDataWrite = null,
} = {}) {
  const formsSignatureLib = require("./forms-signature-lib.js");
  const id = String(documentId || "").trim();
  if (!id) throw Object.assign(new Error("Missing document id."), { status: 400 });
  if (!(context.canManageStaff || context.role === "owner" || context.role === "director")) {
    throw Object.assign(new Error("Only Owner/Director can void signed versions."), { status: 403 });
  }

  if (assigneeType === "staff") {
    const forms = ensureProgramFormsNamespace(store, context.programId);
    const idx = forms.staffDocuments.findIndex((d) => String(d.id) === id);
    if (idx < 0) throw Object.assign(new Error("Document not found."), { status: 404 });
    const next = formsSignatureLib.voidCurrentSignedVersion(forms.staffDocuments[idx], {
      voidedBy: actorUserId,
      voidReason,
    });
    forms.staffDocuments[idx] = next;
    forms.updatedAt = nowIso();
    appendFormsAudit(store, {
      programId: context.programId,
      action: "VOIDED",
      actorUserId,
      actorRole,
      documentId: id,
      versionId: next.currentVersionId || "",
      detail: cleanText(voidReason, 240),
    });
    return { document: next, assigneeType: "staff" };
  }

  if (typeof childDataWrite !== "function") {
    throw Object.assign(new Error("Child document void requires child data writer."), { status: 500 });
  }
  const result = childDataWrite((docs) => {
    const idx = docs.findIndex((d) => String(d.id) === id);
    if (idx < 0) throw Object.assign(new Error("Document not found."), { status: 404 });
    const next = formsSignatureLib.voidCurrentSignedVersion(docs[idx], {
      voidedBy: actorUserId,
      voidReason,
    });
    const copy = docs.slice();
    copy[idx] = next;
    return { docs: copy, document: next };
  });
  appendFormsAudit(store, {
    programId: context.programId,
    action: "VOIDED",
    actorUserId,
    actorRole,
    documentId: id,
    versionId: result.document.currentVersionId || "",
    childId: result.document.childId || "",
    detail: cleanText(voidReason, 240),
  });
  return { document: result.document, assigneeType: "child" };
}

function supersedeSignedDocument(store, context, {
  documentId = "",
  assigneeType = "staff",
  nextBody = "",
  nextFields = null,
  reason = "",
  voidPrior = false,
  actorUserId = "",
  actorRole = "director",
  childDataWrite = null,
} = {}) {
  const formsSignatureLib = require("./forms-signature-lib.js");
  const id = String(documentId || "").trim();
  if (!id) throw Object.assign(new Error("Missing document id."), { status: 400 });
  if (!(context.canManageStaff || context.role === "owner" || context.role === "director")) {
    throw Object.assign(new Error("Only Owner/Director can supersede signed versions."), { status: 403 });
  }
  if (!cleanText(reason, 240)) {
    throw Object.assign(new Error("A reason is required to supersede a signed version."), {
      status: 400,
      code: "supersede_reason_required",
    });
  }

  const apply = (doc) => formsSignatureLib.createSupersedingVersion(doc, {
    nextBody: nextBody != null ? nextBody : doc.draftText,
    nextFields: nextFields != null ? nextFields : doc.fields,
    createdBy: actorUserId,
    reason,
    voidPrior,
    voidReason: reason,
  });

  if (assigneeType === "staff") {
    const forms = ensureProgramFormsNamespace(store, context.programId);
    const idx = forms.staffDocuments.findIndex((d) => String(d.id) === id);
    if (idx < 0) throw Object.assign(new Error("Document not found."), { status: 404 });
    const next = apply(forms.staffDocuments[idx]);
    forms.staffDocuments[idx] = next;
    forms.updatedAt = nowIso();
    appendFormsAudit(store, {
      programId: context.programId,
      action: "VERSION_CREATED",
      actorUserId,
      actorRole,
      documentId: id,
      versionId: next.currentVersionId || "",
      detail: cleanText(reason, 240),
    });
    appendFormsAudit(store, {
      programId: context.programId,
      action: voidPrior ? "SUPERSEDED" : "NEEDS_CORRECTION",
      actorUserId,
      actorRole,
      documentId: id,
      versionId: next.currentVersionId || "",
      detail: cleanText(reason, 240),
    });
    return { document: next, assigneeType: "staff" };
  }

  if (typeof childDataWrite !== "function") {
    throw Object.assign(new Error("Child document supersede requires child data writer."), { status: 500 });
  }
  const result = childDataWrite((docs) => {
    const idx = docs.findIndex((d) => String(d.id) === id);
    if (idx < 0) throw Object.assign(new Error("Document not found."), { status: 404 });
    const next = apply(docs[idx]);
    const copy = docs.slice();
    copy[idx] = next;
    return { docs: copy, document: next };
  });
  appendFormsAudit(store, {
    programId: context.programId,
    action: "VERSION_CREATED",
    actorUserId,
    actorRole,
    documentId: id,
    versionId: result.document.currentVersionId || "",
    childId: result.document.childId || "",
    detail: cleanText(reason, 240),
  });
  appendFormsAudit(store, {
    programId: context.programId,
    action: voidPrior ? "SUPERSEDED" : "NEEDS_CORRECTION",
    actorUserId,
    actorRole,
    documentId: id,
    versionId: result.document.currentVersionId || "",
    childId: result.document.childId || "",
    detail: cleanText(reason, 240),
  });
  return { document: result.document, assigneeType: "child" };
}

module.exports = {
  CRITICAL_AUDIT_ACTIONS,
  READ_ONLY_TEMPLATE_SOURCES,
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
  duplicateTemplateAsProvider,
  migrateClientFormsPayload,
  dualReadMerge,
  isStrictlySharedWithFamily,
  validateAndResolveAssignment,
  previewAssignment,
  confirmSendAssignments,
  listProgramStaffDirectory,
  hashRequestIp,
  signStaffDocument,
  voidSignedDocumentVersion,
  supersedeSignedDocument,
  describeFallbackRemovalGate,
};
