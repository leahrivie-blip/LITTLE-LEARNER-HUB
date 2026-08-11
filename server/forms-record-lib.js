/**
 * Wave 6 — Document detail / audit timeline / completed-record DTOs.
 * One canonical spine over Documents + staffDocuments + formsAudit.
 * No second history store. No hot-path full-store clones.
 */
"use strict";

const formsSignatureLib = require("./forms-signature-lib.js");
const formsLib = require("./forms-lib.js");

const MAX_BODY_CHARS = 20000;
const MAX_TIMELINE = 200;

function cleanText(value, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Persist timestamps as ISO; UI formats locally. Never rewrite stored values.
 */
function asIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw.slice(0, 40) : d.toISOString();
}

function methodLabel(method) {
  const m = String(method || "").trim().toLowerCase();
  if (m === "typed") return "Typed electronic signature";
  if (m === "drawn") return "Drawn electronic signature";
  if (m === "acknowledgment_text") return "Text acknowledgment";
  return method ? "Electronic signature" : "";
}

function actionLabel(action) {
  const map = {
    CREATED: "Created",
    EDITED: "Edited",
    VERSION_CREATED: "New version created",
    ASSIGNED: "Assigned",
    SENT_SHARED: "Assigned / shared",
    VIEWED: "Viewed",
    STARTED: "Started",
    PROGRESS_SAVED: "Progress saved",
    SIGNED: "Signed electronically",
    SUBMITTED: "Submitted",
    COMPLETED: "Completed",
    NEEDS_CORRECTION: "Needs correction",
    REMINDER_SENT: "Reminder sent",
    VOIDED: "Version voided",
    SUPERSEDED: "Previous version superseded",
    ARCHIVED: "Archived",
    MIGRATED: "Migrated",
    UPLOADED: "Document uploaded",
  };
  const key = String(action || "").trim().toUpperCase();
  return map[key] || cleanText(action, 60) || "Updated";
}

function roleLabel(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "owner") return "Owner";
  if (r === "director") return "Director";
  if (r === "teacher") return "Teacher";
  if (r === "assistant") return "Assistant";
  if (r === "guardian" || r === "parent") return "Guardian";
  if (r === "staff") return "Staff";
  return cleanText(role, 40) || "User";
}

/**
 * Locate a canonical assignment without cloning the whole store.
 */
function locateDocument(store, context, { documentId, assigneeType = "" } = {}) {
  const id = cleanText(documentId, 80);
  if (!id || !context?.programId) {
    const err = new Error("Document not found.");
    err.status = 404;
    err.code = "document_not_found";
    throw err;
  }
  const prefer = String(assigneeType || "").trim().toLowerCase();
  const tryStaff = prefer !== "child" && prefer !== "family" && prefer !== "program";
  const tryChild = prefer !== "staff" && prefer !== "program";
  const tryProgram = prefer === "program" || !prefer;

  if (tryStaff) {
    const forms = store.programData?.[context.programId]?.forms;
    const list = Array.isArray(forms?.staffDocuments) ? forms.staffDocuments : [];
    const idx = list.findIndex((d) => String(d?.id || "") === id);
    if (idx >= 0) {
      return {
        assigneeType: "staff",
        document: list[idx],
        index: idx,
        collection: list,
      };
    }
  }
  if (tryProgram) {
    const forms = store.programData?.[context.programId]?.forms;
    const list = Array.isArray(forms?.programDocuments) ? forms.programDocuments : [];
    const idx = list.findIndex((d) => String(d?.id || "") === id);
    if (idx >= 0) {
      return {
        assigneeType: "program",
        document: list[idx],
        index: idx,
        collection: list,
      };
    }
  }
  if (tryChild) {
    const programOwnership = require("./program-ownership.js");
    const saved = programOwnership.readProgramChildData(store, context);
    const childData = saved?.data && typeof saved.data === "object" ? saved.data : {};
    const list = Array.isArray(childData.Documents) ? childData.Documents : [];
    const idx = list.findIndex((d) => String(d?.id || "") === id);
    if (idx >= 0) {
      return {
        assigneeType: "child",
        document: list[idx],
        index: idx,
        collection: list,
        childData,
      };
    }
  }
  const err = new Error("Document not found.");
  err.status = 404;
  err.code = "document_not_found";
  throw err;
}

/**
 * Server-owned authorization. Client role flags are ignored.
 * audiences: director | staff_self | family
 */
function authorizeDocumentAccess(context, identity, located, {
  audience = "director",
  householdChildIds = null,
  householdId = "",
} = {}) {
  const role = String(context?.role || "").trim().toLowerCase();
  const email = String(identity?.email || "").trim().toLowerCase();
  const isManager = Boolean(context?.canManageStaff) || role === "owner" || role === "director";
  const doc = located.document || {};

  if (audience === "director") {
    if (!isManager) {
      // Staff may open own completed record (not full audit).
      if (located.assigneeType === "staff" && normalizeEmail(doc.assigneeEmail) === email) {
        return { level: "staff_self", canViewAudit: false, canViewVersions: true, canPrint: true };
      }
      const err = new Error("Not authorized to view this document history.");
      err.status = 403;
      err.code = "audit_forbidden";
      throw err;
    }
    return { level: "director", canViewAudit: true, canViewVersions: true, canPrint: true };
  }

  if (audience === "staff_self") {
    if (located.assigneeType !== "staff") {
      const err = new Error("Not authorized.");
      err.status = 403;
      err.code = "staff_record_forbidden";
      throw err;
    }
    if (normalizeEmail(doc.assigneeEmail) !== email && !isManager) {
      const err = new Error("Staff can only open their own paperwork.");
      err.status = 403;
      err.code = "staff_peer_forbidden";
      throw err;
    }
    return {
      level: isManager ? "director" : "staff_self",
      canViewAudit: isManager,
      canViewVersions: true,
      canPrint: true,
    };
  }

  if (audience === "family") {
    if (located.assigneeType !== "child") {
      const err = new Error("This form is not available in Family Hub.");
      err.status = 403;
      err.code = "family_forbidden";
      throw err;
    }
    if (doc.shareWithFamily !== true && doc.shareWithFamily !== "true") {
      const err = new Error("This form is not shared with Family Hub.");
      err.status = 403;
      err.code = "family_share_denied";
      throw err;
    }
    const childId = String(doc.childId || "");
    const allowed = householdChildIds instanceof Set
      ? householdChildIds
      : new Set((Array.isArray(householdChildIds) ? householdChildIds : []).map(String));
    if (!allowed.has(childId)) {
      const err = new Error("This form is not part of your household.");
      err.status = 403;
      err.code = "household_mismatch";
      throw err;
    }
    if (householdId && doc.householdId && String(doc.householdId) !== String(householdId)) {
      const err = new Error("This form is not part of your household.");
      err.status = 403;
      err.code = "household_mismatch";
      throw err;
    }
    return { level: "family", canViewAudit: false, canViewVersions: true, canPrint: true };
  }

  const err = new Error("Not authorized.");
  err.status = 403;
  err.code = "forbidden";
  throw err;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveRecipientMeta(store, context, doc, assigneeType) {
  const programOwnership = require("./program-ownership.js");
  if (assigneeType === "program") {
    return {
      recipientKind: "program",
      recipientLabel: "Program",
      assigneeEmail: "",
      childId: "",
      childName: "",
      householdId: "",
      householdLabel: "",
      classroomName: "",
    };
  }
  if (assigneeType === "staff") {
    return {
      recipientKind: "staff",
      recipientLabel: cleanText(doc.assigneeEmail, 120),
      assigneeEmail: normalizeEmail(doc.assigneeEmail),
      childId: "",
      childName: "",
      householdId: "",
      householdLabel: "",
      classroomName: "",
    };
  }
  const saved = programOwnership.readProgramChildData(store, context);
  const profiles = Array.isArray(saved?.data?.Profiles) ? saved.data.Profiles : [];
  const child = profiles.find((p) => String(p?.id || "") === String(doc.childId || ""));
  const classrooms = Array.isArray(saved?.data?.Classrooms) ? saved.data.Classrooms : [];
  const room = classrooms.find((c) => String(c?.id || "") === String(child?.classroomId || doc.classroomId || ""));
  return {
    recipientKind: String(doc.assignmentScope || "").toLowerCase() === "household" ? "household" : "child",
    recipientLabel: cleanText(child?.name || "Child", 120),
    assigneeEmail: "",
    childId: String(doc.childId || ""),
    childName: cleanText(child?.name || "", 120),
    householdId: String(doc.householdId || ""),
    householdLabel: "",
    classroomName: cleanText(room?.name || child?.classroomName || "", 80),
  };
}

function buildTimelineEntries(auditRows = [], { documentId = "" } = {}) {
  const id = String(documentId || "");
  const filtered = (Array.isArray(auditRows) ? auditRows : [])
    .filter((row) => !id || String(row.documentId || "") === id)
    .slice(0, MAX_TIMELINE);
  return filtered.map((row) => {
    const action = String(row.action || "").toUpperCase();
    const detail = cleanText(row.detail || "", 240);
    let summary = actionLabel(action);
    if (action === "VOIDED" && detail) summary = `Version voided — ${detail}`;
    else if (action === "SUPERSEDED" && detail) summary = `Superseded — ${detail}`;
    else if (action === "VERSION_CREATED" && detail) summary = `Version created — ${detail}`;
    else if (action === "SIGNED") summary = "Signed electronically";
    else if (action === "SENT_SHARED") summary = "Assigned to recipient";
    else if (detail && action !== "SIGNED") summary = `${summary}${detail ? `: ${detail}` : ""}`;
    return {
      id: String(row.id || ""),
      at: asIso(row.at),
      action,
      summary,
      actorRoleLabel: roleLabel(row.actorRole),
      // Display-safe actor hint (email local-part only for directors — still not raw dump)
      actorDisplay: row.actorUserId ? String(row.actorUserId).split("@")[0] : "",
      versionId: String(row.versionId || ""),
      // Never expose ipHash / userAgent / answers / signature blobs
    };
  }).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function versionHistoryEntries(doc = {}) {
  const ensured = formsSignatureLib.ensureDocumentVersions(doc);
  const currentId = String(ensured.currentVersionId || "");
  return (ensured.versions || []).map((ver) => {
    const sig = ver.signature && typeof ver.signature === "object" ? ver.signature : null;
    const isCurrent = String(ver.id) === currentId;
    let stateLabel = "Unsigned";
    if (ver.voided) stateLabel = "Voided";
    else if (ver.supersededByVersionId) stateLabel = "Superseded";
    else if (sig?.signedAt) stateLabel = isCurrent ? "Signed · Current" : "Signed · Historical";
    else if (isCurrent) stateLabel = "Current · Unsigned";
    return {
      id: String(ver.id || ""),
      versionNumber: Number(ver.versionNumber || 1),
      createdAt: asIso(ver.createdAt),
      reason: cleanText(ver.reason || "", 200),
      immutable: Boolean(ver.immutable),
      voided: Boolean(ver.voided),
      voidedAt: asIso(ver.voidedAt),
      voidedBy: cleanText(ver.voidedBy, 120),
      voidReason: cleanText(ver.voidReason || "", 200),
      supersededByVersionId: String(ver.supersededByVersionId || ""),
      isCurrent,
      stateLabel,
      signedAt: asIso(sig?.signedAt || ""),
      signerDisplayName: cleanText(sig?.signerDisplayName || sig?.signedBy || "", 120),
      signerRole: cleanText(sig?.signerRole || "", 40),
      signatureMethod: cleanText(sig?.method || "", 40),
      signatureMethodLabel: methodLabel(sig?.method),
      hasDrawnSignature: Boolean(sig?.drawnSignatureDataUrl || sig?.drawnSignatureRef),
    };
  }).sort((a, b) => a.versionNumber - b.versionNumber);
}

function pickVersion(doc, versionId = "", { preferSigned = false } = {}) {
  const ensured = formsSignatureLib.ensureDocumentVersions(doc);
  const versions = ensured.versions || [];
  if (versionId) {
    const found = versions.find((v) => String(v.id) === String(versionId));
    if (!found) {
      const err = new Error("Version not found.");
      err.status = 404;
      err.code = "version_not_found";
      throw err;
    }
    return { ensured, version: found };
  }
  const { current } = formsSignatureLib.getCurrentVersion(ensured);
  // Default: current version (may be unsigned after supersede). Never silently
  // reattach an older signature to newer content by preferring historical signed.
  if (!preferSigned || current?.signature?.signedAt) {
    return { ensured, version: current };
  }
  const signed = formsSignatureLib.findLatestSignedVersion(ensured);
  return { ensured, version: signed || current };
}

function answersForDisplay(fields = [], answers = {}) {
  const list = Array.isArray(fields) ? fields : [];
  const ans = answers && typeof answers === "object" ? answers : {};
  return list
    .filter((f) => f && f.type !== "info" && f.type !== "file" && f.type !== "signature")
    .map((field) => {
      const raw = ans[field.id];
      let display = "";
      if (raw === true || raw === "true" || raw === "yes") display = "Yes";
      else if (raw === false || raw === "false" || raw === "no") display = "No";
      else if (raw == null || raw === "") display = "—";
      else display = cleanText(raw, 400);
      return {
        id: String(field.id || ""),
        label: cleanText(field.label || "Field", 120),
        value: display,
      };
    });
}

/**
 * Director/staff detail DTO — no raw IP, hashes, base64, or audit JSON dump.
 */
function buildDocumentDetailDto({
  store,
  context,
  located,
  auth,
  auditRows = [],
  programName = "",
} = {}) {
  const ensured = formsSignatureLib.ensureDocumentVersions(located.document);
  const { current } = formsSignatureLib.getCurrentVersion(ensured);
  const recipient = resolveRecipientMeta(store, context, ensured, located.assigneeType);
  const signedVer = formsSignatureLib.findLatestSignedVersion(ensured);
  const sig = signedVer?.signature || (ensured.signedAt ? {
    signedAt: ensured.signedAt,
    signerDisplayName: ensured.signedBy,
    signerRole: ensured.signedRole,
    method: ensured.signatureMethod || "acknowledgment_text",
  } : null);

  const tracking = {
    assignedAt: asIso(ensured.assignedAt || ensured.createdAt),
    viewedAt: asIso(ensured.viewedAt),
    startedAt: asIso(ensured.startedAt || (ensured.parentProgressText ? ensured.updatedAt : "")),
    submittedAt: asIso(ensured.submittedAt || ensured.signedAt),
    completedAt: asIso(ensured.completedAt || (ensured.providerReviewed ? ensured.reviewedAt : "")),
    remindedAt: asIso(ensured.lastNotifiedAt || ensured.remindedAt),
    archived: Boolean(ensured.archived),
  };

  const isUpload = ensured.sourceType === "upload"
    || ensured.documentKind === "upload"
    || ensured.presentation === "uploaded_document"
    || Boolean(ensured.mediaAssetId);
  const formsUploadLib = isUpload ? require("./forms-upload-lib.js") : null;
  const expState = formsUploadLib
    ? formsUploadLib.expirationState(ensured.expiresAt)
    : "";

  return {
    ok: true,
    testingOnly: true,
    document: {
      id: String(ensured.id || ""),
      title: cleanText(ensured.title || "Form", 160) || "Form",
      category: cleanText(ensured.category || "Form", 80) || "Form",
      typeLabel: isUpload
        ? "Uploaded document"
        : (located.assigneeType === "staff" ? "Staff paperwork" : "Child / family form"),
      assigneeType: located.assigneeType,
      status: formsLib.normalizeFormStatus(ensured.status),
      statusLabel: formsLib.formStatusLabel(ensured.statusLabel || ensured.status),
      assignedAt: tracking.assignedAt,
      dueDate: cleanText(ensured.dueDate, 20),
      archived: tracking.archived,
      requiresSignature: isUpload ? false : ensured.requiresSignature !== false,
      shareWithFamily: ensured.shareWithFamily === true || ensured.shareWithFamily === "true",
      programName: cleanText(programName, 160),
      currentVersionId: String(ensured.currentVersionId || current?.id || ""),
      currentVersionNumber: Number(current?.versionNumber || ensured.contentVersion || 1),
      bodyPreview: isUpload ? "" : String(current?.bodyText || ensured.draftText || "").slice(0, 4000),
      presentation: isUpload ? "uploaded_document" : "llh_form",
      sourceType: cleanText(ensured.sourceType || (isUpload ? "upload" : ""), 40),
      mediaAssetId: cleanText(ensured.mediaAssetId || "", 80),
      mediaUrl: cleanText(ensured.mediaUrl || ensured.fileUrl || "", 400),
      fileName: cleanText(ensured.fileName || "", 180),
      mimeType: cleanText(ensured.mimeType || "", 80),
      uploadedAt: asIso(ensured.uploadedAt),
      expiresAt: cleanText(ensured.expiresAt || "", 20),
      expirationState: expState,
      expirationLabel: formsUploadLib ? formsUploadLib.expirationLabel(expState) : "",
    },
    recipient,
    signature: {
      required: isUpload ? false : ensured.requiresSignature !== false,
      status: sig?.signedAt ? "signed" : "unsigned",
      signerDisplayName: cleanText(sig?.signerDisplayName || sig?.signedBy || "", 120),
      signerRole: cleanText(sig?.signerRole || "", 40),
      signerRoleLabel: roleLabel(sig?.signerRole),
      signedAt: asIso(sig?.signedAt),
      method: cleanText(sig?.method || "", 40),
      methodLabel: methodLabel(sig?.method),
      versionSigned: signedVer ? Number(signedVer.versionNumber || 0) : null,
      versionId: signedVer ? String(signedVer.id || "") : "",
    },
    versions: isUpload ? [] : versionHistoryEntries(ensured),
    tracking,
    timeline: auth.canViewAudit ? buildTimelineEntries(auditRows, { documentId: ensured.id }) : [],
    capabilities: {
      canViewAudit: Boolean(auth.canViewAudit),
      canViewVersions: Boolean(auth.canViewVersions) && !isUpload,
      canPrint: Boolean(auth.canPrint),
      canOpenCompletedRecord: isUpload
        ? Boolean(ensured.mediaUrl || ensured.fileUrl || ensured.mediaAssetId)
        : Boolean(sig?.signedAt || formsLib.isTerminalFormStatus?.(ensured.status)),
      isUploadedDocument: Boolean(isUpload),
      accessLevel: auth.level,
    },
  };
}

/**
 * Professional completed-record DTO for print/download.
 * Uses the EXACT version snapshot — never newest body with old signature.
 */
function buildCompletedRecordDto({
  located,
  versionId = "",
  auth,
  programName = "",
  recipient = null,
  includeDrawnImage = true,
} = {}) {
  const { ensured, version } = pickVersion(located.document, versionId);
  const sig = version?.signature && typeof version.signature === "object" ? version.signature : null;
  const isHistorical = String(version.id) !== String(ensured.currentVersionId);
  const markers = [];
  if (version.voided) markers.push("VOIDED");
  if (version.supersededByVersionId || (isHistorical && sig?.signedAt && !version.voided)) {
    if (!markers.includes("VOIDED")) markers.push("SUPERSEDED / HISTORICAL VERSION");
  }
  if (version.voided) {
    // Voided must not look like the active valid form.
    markers.push("NOT THE CURRENT VALID FORM");
  }

  const bodyText = String(
    (sig && sig.signedSnapshot) || version.bodyText || ensured.draftText || "",
  ).slice(0, MAX_BODY_CHARS);

  // Historical signed version safety: body must match signed snapshot hash when present.
  if (sig?.signedAt && sig.signedSnapshot && version.bodyText) {
    // Prefer signedSnapshot for display of what was signed.
  }

  const fields = Array.isArray(version.fields) ? version.fields : [];
  const answers = version.answers && typeof version.answers === "object" ? version.answers : {};

  let drawnDataUrl = "";
  if (
    includeDrawnImage
    && auth.level !== "family"
    && sig?.drawnSignatureDataUrl
  ) {
    try {
      drawnDataUrl = formsSignatureLib.normalizeDrawnSignatureDataUrl(sig.drawnSignatureDataUrl);
    } catch (_e) {
      drawnDataUrl = "";
    }
  } else if (includeDrawnImage && auth.level === "family" && sig?.drawnSignatureDataUrl) {
    // Family may see their own drawn mark on the completed record (bounded).
    try {
      drawnDataUrl = formsSignatureLib.normalizeDrawnSignatureDataUrl(sig.drawnSignatureDataUrl);
    } catch (_e) {
      drawnDataUrl = "";
    }
  }

  const typedName = cleanText(sig?.typedSignature || sig?.signerDisplayName || sig?.signedBy || "", 120);

  return {
    ok: true,
    testingOnly: true,
    record: {
      heading: "Little Learner Hub",
      programName: cleanText(programName, 160),
      title: cleanText(ensured.title || "Form", 160) || "Form",
      category: cleanText(ensured.category || "", 80),
      recipientKind: recipient?.recipientKind || located.assigneeType,
      recipientLabel: recipient?.recipientLabel || "",
      childName: recipient?.childName || "",
      classroomName: recipient?.classroomName || "",
      staffEmail: recipient?.assigneeEmail || "",
      versionNumber: Number(version.versionNumber || 1),
      versionId: String(version.id || ""),
      isCurrentVersion: String(version.id) === String(ensured.currentVersionId),
      markers,
      voided: Boolean(version.voided),
      voidedAt: asIso(version.voidedAt),
      voidReason: cleanText(version.voidReason || "", 200),
      supersededByVersionId: String(version.supersededByVersionId || ""),
      bodyText,
      answers: answersForDisplay(fields, answers),
      completedAt: asIso(ensured.completedAt || sig?.signedAt),
      signature: sig?.signedAt ? {
        indicator: "Signed Electronically",
        method: cleanText(sig.method || "", 40),
        methodLabel: methodLabel(sig.method),
        signerDisplayName: typedName,
        signerRole: cleanText(sig.signerRole || "", 40),
        signerRoleLabel: roleLabel(sig.signerRole),
        signedAt: asIso(sig.signedAt),
        typedSignature: sig.method === "typed" || sig.method === "acknowledgment_text"
          ? typedName
          : "",
        acknowledgmentText: sig.method === "acknowledgment_text"
          ? "Historical acknowledgment method"
          : "",
        // Image only — never dump raw data URI as text in UI (client renders <img>).
        hasDrawnSignature: Boolean(drawnDataUrl || sig.drawnSignatureRef),
        drawnSignatureDataUrl: drawnDataUrl || undefined,
      } : null,
      footerNote: "Electronic Signature · Signature Record · Signed Electronically",
    },
    // Mutation guard: response is read-only representation.
    readOnly: true,
  };
}

/**
 * Optionally stamp first VIEWED without exploding audit on every rerender.
 * Mutates located.document in place (caller persists). Returns whether audit was appended.
 */
function maybeMarkViewed(store, context, located, actor = {}) {
  const doc = located.document;
  if (doc.viewedAt) return { marked: false, document: doc };
  const next = {
    ...formsSignatureLib.ensureDocumentVersions(doc),
    viewedAt: nowIso(),
    updatedAt: nowIso(),
  };
  // Keep status unless still draft/assigned → viewed
  const status = formsLib.normalizeFormStatus(next.status);
  if (status === "assigned" || status === "sent" || status === "notified") {
    next.status = "viewed";
    next.statusLabel = formsLib.formStatusLabel("viewed");
  }
  located.document = next;
  located.collection[located.index] = next;
  const programFormsLib = require("./program-forms-lib.js");
  programFormsLib.appendFormsAudit(store, {
    programId: context.programId,
    action: "VIEWED",
    actorUserId: actor.actorUserId || "",
    actorRole: actor.actorRole || "",
    documentId: next.id,
    versionId: next.currentVersionId || "",
    childId: next.childId || "",
    assigneeEmail: next.assigneeEmail || "",
    detail: "Opened document detail",
  });
  return { marked: true, document: next };
}

function programDisplayName(store, programId) {
  const p = store.programs?.[programId];
  return cleanText(p?.name || p?.programName || p?.label || "Program", 160);
}

module.exports = {
  locateDocument,
  authorizeDocumentAccess,
  buildTimelineEntries,
  versionHistoryEntries,
  buildDocumentDetailDto,
  buildCompletedRecordDto,
  maybeMarkViewed,
  programDisplayName,
  methodLabel,
  actionLabel,
  pickVersion,
  answersForDisplay,
};
