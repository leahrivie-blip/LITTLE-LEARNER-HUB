/**
 * Phase 7 — Forms architecture helpers (testing spine).
 *
 * Source of truth map (do not invent parallel stores):
 * - Template (system): client formGroups / HOME_DAYCARE_FORMS_PACK / siteContent.forms
 * - Template (provider): programSettings.formTemplates
 * - Assigned form (child/family): program child blob Documents[] (canonical childId)
 * - Assigned form (staff): programSettings.staffFormDocuments[] (assigneeEmail → store.users)
 * - Completed response / signature: fields on the same Document row
 *   (status, signedAt, signedBy, signedRole, signedSnapshot, bodyHash, contentVersion)
 * - Family Hub visibility: Documents with shareWithFamily === true ∩ household.childIds
 *
 * Authoritative lifecycle (normalize aliases → these):
 * draft → assigned → in_progress → submitted → completed
 * Plus workflow flags: overdue (derived), needs_correction, declined, expired
 */
"use strict";

const crypto = require("node:crypto");

const FORM_STATUSES = Object.freeze({
  DRAFT: "draft",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  COMPLETED: "completed",
  NEEDS_CORRECTION: "needs_correction",
  DECLINED: "declined",
  EXPIRED: "expired",
});

/** Map legacy / UI labels onto the authoritative lifecycle. */
const STATUS_ALIASES = Object.freeze({
  draft: FORM_STATUSES.DRAFT,
  needed: FORM_STATUSES.ASSIGNED,
  assigned: FORM_STATUSES.ASSIGNED,
  requested: FORM_STATUSES.ASSIGNED,
  notified: FORM_STATUSES.ASSIGNED,
  "action needed": FORM_STATUSES.ASSIGNED,
  viewed: FORM_STATUSES.IN_PROGRESS,
  in_progress: FORM_STATUSES.IN_PROGRESS,
  "in progress": FORM_STATUSES.IN_PROGRESS,
  received: FORM_STATUSES.SUBMITTED,
  submitted: FORM_STATUSES.SUBMITTED,
  signed: FORM_STATUSES.SUBMITTED,
  completed: FORM_STATUSES.COMPLETED,
  on_file: FORM_STATUSES.COMPLETED,
  reviewed: FORM_STATUSES.COMPLETED,
  needs_correction: FORM_STATUSES.NEEDS_CORRECTION,
  "needs correction": FORM_STATUSES.NEEDS_CORRECTION,
  declined: FORM_STATUSES.DECLINED,
  expired: FORM_STATUSES.EXPIRED,
});

const STATUS_LABELS = Object.freeze({
  draft: "Draft",
  assigned: "Assigned — awaiting completion",
  in_progress: "In progress",
  submitted: "Submitted — provider review",
  completed: "Completed / on file",
  needs_correction: "Needs correction",
  declined: "Declined",
  expired: "Expired",
  // Legacy display (still accepted on read)
  needed: "Needed",
  requested: "Requested from family",
  notified: "Shared — awaiting parent",
  received: "Received",
  signed: "Signed — provider review",
  on_file: "On file",
  reviewed: "Reviewed & on file",
});

function normalizeFormStatus(status = "") {
  const key = String(status || "").trim().toLowerCase();
  if (!key) return FORM_STATUSES.ASSIGNED;
  return STATUS_ALIASES[key] || key.replace(/\s+/g, "_");
}

function formStatusLabel(status = "") {
  const raw = String(status || "").trim().toLowerCase();
  const normalized = normalizeFormStatus(raw);
  return STATUS_LABELS[raw] || STATUS_LABELS[normalized] || String(status || "Assigned");
}

function hashFormBody(text = "") {
  return crypto.createHash("sha256").update(String(text || "").trim()).digest("hex");
}

function isTerminalFormStatus(status = "") {
  const n = normalizeFormStatus(status);
  return n === FORM_STATUSES.COMPLETED || n === FORM_STATUSES.DECLINED || n === FORM_STATUSES.EXPIRED;
}

function isParentActionableStatus(status = "", { signedAt = "" } = {}) {
  if (signedAt) return false;
  const n = normalizeFormStatus(status);
  return [
    FORM_STATUSES.DRAFT,
    FORM_STATUSES.ASSIGNED,
    FORM_STATUSES.IN_PROGRESS,
    FORM_STATUSES.NEEDS_CORRECTION,
  ].includes(n) || ["needed", "requested", "notified", "assigned", "action needed"].includes(String(status || "").toLowerCase());
}

function isFormOverdue(doc = {}, todayIso = "") {
  const due = String(doc?.dueDate || "").slice(0, 10);
  if (!due) return false;
  const today = String(todayIso || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (due >= today) return false;
  if (doc.signedAt || doc.providerReviewed) return false;
  const n = normalizeFormStatus(doc.status);
  return n !== FORM_STATUSES.COMPLETED && n !== FORM_STATUSES.DECLINED && n !== FORM_STATUSES.EXPIRED;
}

/**
 * When body changes after a signature, invalidate signature fields.
 * Returns next document fields (does not mutate input).
 */
function applyFormBodyEdit(doc = {}, nextBody = "") {
  const body = String(nextBody || "").trim();
  const nextHash = hashFormBody(body);
  const prevHash = String(doc.bodyHash || "").trim();
  const hadSignature = Boolean(doc.signedAt) || Boolean(doc.signedSnapshot);
  const materialChange = hadSignature && prevHash && prevHash !== nextHash;
  const base = {
    ...doc,
    draftText: body,
    bodyHash: nextHash,
    contentVersion: Number(doc.contentVersion || 1) + (materialChange || !doc.contentVersion ? 1 : 0),
    updatedAt: new Date().toISOString(),
  };
  if (!materialChange) return base;
  return {
    ...base,
    signedAt: "",
    signedBy: "",
    signedRole: "",
    signedSnapshot: "",
    signedBodyHash: "",
    providerReviewed: false,
    status: FORM_STATUSES.NEEDS_CORRECTION,
    statusLabel: formStatusLabel(FORM_STATUSES.NEEDS_CORRECTION),
    signatureInvalidatedAt: new Date().toISOString(),
    signatureInvalidatedReason: "Form content changed after signature — re-sign required.",
  };
}

function buildSignatureRecord(doc = {}, {
  signerName = "",
  signedRole = "guardian",
  signedAt = "",
} = {}) {
  const body = String(doc.draftText || doc.bodyText || doc.signedSnapshot || "").trim();
  const bodyHash = String(doc.bodyHash || hashFormBody(body));
  const at = signedAt || new Date().toISOString();
  return {
    status: FORM_STATUSES.SUBMITTED,
    statusLabel: formStatusLabel(FORM_STATUSES.SUBMITTED),
    signedAt: at,
    signedBy: String(signerName || "Parent").trim().slice(0, 120),
    signedRole: String(signedRole || "guardian").trim().slice(0, 80),
    signedSnapshot: body,
    signedBodyHash: bodyHash,
    bodyHash,
    contentVersion: Number(doc.contentVersion || 1),
    contentVersionSigned: Number(doc.contentVersion || 1),
    providerReviewed: false,
    updatedAt: at,
  };
}

/**
 * Resolve assignment targets to canonical childIds (and optional staff emails).
 * Never copies child/family/staff name rosters — IDs only.
 */
function resolveFormAssignmentTargets({
  mode = "children",
  childIds = [],
  classroomId = "",
  householdIds = [],
  profiles = [],
  households = [],
  staffEmails = [],
  programAll = false,
} = {}) {
  const profileList = Array.isArray(profiles) ? profiles : [];
  const activeProfiles = profileList.filter((p) => p && !p.archived);
  const idSet = new Set();
  const staffSet = new Set();

  const pushChild = (id) => {
    const key = String(id || "").trim();
    if (key) idSet.add(key);
  };
  const pushStaff = (email) => {
    const key = String(email || "").trim().toLowerCase();
    if (key && key.includes("@")) staffSet.add(key);
  };

  const modeKey = String(mode || "children").toLowerCase();
  if (modeKey === "staff") {
    (Array.isArray(staffEmails) ? staffEmails : []).forEach(pushStaff);
    return { childIds: [], staffEmails: [...staffSet] };
  }

  if (modeKey === "program" || programAll) {
    activeProfiles.forEach((p) => pushChild(p.id));
    return { childIds: [...idSet], staffEmails: [] };
  }

  if (modeKey === "classroom") {
    const room = String(classroomId || "").trim();
    activeProfiles
      .filter((p) => String(p.classroomId || "") === room)
      .forEach((p) => pushChild(p.id));
    return { childIds: [...idSet], staffEmails: [] };
  }

  if (modeKey === "household" || modeKey === "families" || modeKey === "family") {
    const wanted = new Set((Array.isArray(householdIds) ? householdIds : []).map(String));
    (Array.isArray(households) ? households : []).forEach((hh) => {
      if (wanted.size && !wanted.has(String(hh.id || ""))) return;
      const ids = Array.isArray(hh.childIds) && hh.childIds.length
        ? hh.childIds
        : (Array.isArray(hh.children) ? hh.children.map((c) => c?.id) : []);
      ids.forEach(pushChild);
    });
    return { childIds: [...idSet], staffEmails: [] };
  }

  // children / multi-child (default)
  (Array.isArray(childIds) ? childIds : []).forEach(pushChild);
  return { childIds: [...idSet], staffEmails: [] };
}

function publicStaffFormDocument(doc = {}) {
  return {
    id: String(doc.id || ""),
    assigneeEmail: String(doc.assigneeEmail || "").toLowerCase(),
    title: String(doc.title || "Form").trim() || "Form",
    category: String(doc.category || "Staff").trim() || "Staff",
    status: normalizeFormStatus(doc.status),
    statusLabel: formStatusLabel(doc.status),
    dueDate: String(doc.dueDate || "").trim(),
    assignedAt: String(doc.assignedAt || doc.createdAt || "").trim(),
    completedAt: String(doc.completedAt || doc.signedAt || "").trim(),
    signedAt: String(doc.signedAt || "").trim(),
    signedBy: String(doc.signedBy || "").trim(),
    signedRole: String(doc.signedRole || "staff").trim(),
    templateId: String(doc.templateId || "").trim(),
    bodyHash: String(doc.bodyHash || "").trim(),
    contentVersion: Number(doc.contentVersion || 1),
    updatedAt: String(doc.updatedAt || "").trim(),
  };
}

function formsAttentionKind(doc = {}, todayIso = "") {
  const status = normalizeFormStatus(doc.status);
  const signedNeedsReview = (status === FORM_STATUSES.SUBMITTED || Boolean(doc.signedAt)) && !doc.providerReviewed;
  const overdue = isFormOverdue(doc, todayIso);
  const awaiting = isParentActionableStatus(doc.status, { signedAt: doc.signedAt })
    && (doc.shareWithFamily === true || doc.assigneeType === "staff");
  if (signedNeedsReview) return "signed_review";
  if (overdue) return "overdue";
  if (status === FORM_STATUSES.NEEDS_CORRECTION) return "needs_correction";
  if (awaiting) return "awaiting_parent";
  return "";
}

function formsDashboardSummary(documents = [], { todayIso = "" } = {}) {
  const live = (Array.isArray(documents) ? documents : []).filter((d) => d && !d.archived);
  const attention = live
    .map((doc) => {
      const kind = formsAttentionKind(doc, todayIso);
      return kind ? { ...doc, attention: kind } : null;
    })
    .filter(Boolean);
  return {
    assigned: live.filter((d) => normalizeFormStatus(d.status) === FORM_STATUSES.ASSIGNED).length,
    awaitingCompletion: attention.filter((i) => i.attention === "awaiting_parent" || i.attention === "needs_correction").length,
    completed: live.filter((d) => {
      const n = normalizeFormStatus(d.status);
      return d.providerReviewed || n === FORM_STATUSES.COMPLETED;
    }).length,
    overdue: attention.filter((i) => i.attention === "overdue").length,
    needsAttention: attention.length,
    submitted: live.filter((d) => normalizeFormStatus(d.status) === FORM_STATUSES.SUBMITTED || (d.signedAt && !d.providerReviewed)).length,
    total: live.length,
    attention,
  };
}

/** Reminder foundation — data only; no unreliable auto-send. */
function buildFormReminderStub(doc = {}, { now = new Date() } = {}) {
  return {
    documentId: String(doc.id || ""),
    childId: String(doc.childId || ""),
    assigneeEmail: String(doc.assigneeEmail || ""),
    dueDate: String(doc.dueDate || "").trim(),
    lastNotifiedAt: String(doc.lastNotifiedAt || "").trim(),
    overdue: isFormOverdue(doc, now.toISOString().slice(0, 10)),
    suggestedChannel: doc.shareWithFamily ? "family_hub_notification" : "in_app",
    ready: Boolean(doc.id) && isParentActionableStatus(doc.status, { signedAt: doc.signedAt }),
  };
}

/** Wave 1 re-export — full validation lives in program-forms-lib (canonical membership). */
function validateAssignmentTargetsShape(request = {}) {
  const mode = String(request.mode || "children").trim().toLowerCase();
  const allowed = new Set([
    "children",
    "classroom",
    "classrooms",
    "household",
    "families",
    "family",
    "program",
    "staff",
    "all_teachers",
    "all_staff",
    "classroom_staff",
  ]);
  if (!allowed.has(mode)) {
    const err = new Error("Unsupported assignment mode.");
    err.status = 400;
    throw err;
  }
  return { ok: true, mode };
}

module.exports = {
  FORM_STATUSES,
  STATUS_ALIASES,
  STATUS_LABELS,
  normalizeFormStatus,
  formStatusLabel,
  hashFormBody,
  isTerminalFormStatus,
  isParentActionableStatus,
  isFormOverdue,
  applyFormBodyEdit,
  buildSignatureRecord,
  resolveFormAssignmentTargets,
  publicStaffFormDocument,
  formsAttentionKind,
  formsDashboardSummary,
  buildFormReminderStub,
  validateAssignmentTargetsShape,
};
