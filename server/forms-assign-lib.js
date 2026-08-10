/**
 * Wave 4 — Confirm & Send / bulk routing helpers.
 * Extends Phase 7 resolveFormAssignmentTargets + Wave 1 validateAndResolveAssignment.
 * Does NOT create a second assignment store or roster.
 */
"use strict";

const crypto = require("node:crypto");
const formsLib = require("./forms-lib.js");
const formFieldsLib = require("./form-fields-lib.js");

const FAMILY_MODES = new Set([
  "children",
  "classroom",
  "classrooms",
  "household",
  "families",
  "family",
  "program",
]);
const STAFF_MODES = new Set([
  "staff",
  "all_teachers",
  "all_staff",
  "classroom_staff",
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

function newId(prefix = "assign") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeAudience(raw = "") {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "staff") return "staff";
  return "family";
}

function normalizeAssignmentScope(raw = "", audience = "family") {
  if (audience === "staff") return "staff";
  const key = String(raw || "child").trim().toLowerCase();
  if (key === "household" || key === "family" || key === "household_specific") return "household";
  return "child";
}

function normalizeMode(raw = "", audience = "family") {
  const key = String(raw || "").trim().toLowerCase();
  if (audience === "staff") {
    if (STAFF_MODES.has(key)) return key;
    return "staff";
  }
  if (FAMILY_MODES.has(key)) return key === "classrooms" ? "classrooms" : key;
  return "children";
}

function isOpenAssignment(doc = {}) {
  if (!doc || doc.archived) return false;
  if (doc.signedAt || doc.providerReviewed) return false;
  const lifecycle = formsLib.normalizeFormStatus(doc.status);
  return ![formsLib.FORM_STATUSES.SUBMITTED, formsLib.FORM_STATUSES.COMPLETED, formsLib.FORM_STATUSES.DECLINED, formsLib.FORM_STATUSES.EXPIRED].includes(lifecycle);
}

function matchesTemplate(doc = {}, formSpec = {}) {
  const templateId = cleanText(formSpec.templateId || "", 80);
  const packFormId = cleanText(formSpec.packFormId || "", 80);
  const title = cleanText(formSpec.title || "", 160).toLowerCase();
  if (templateId && String(doc.templateId || "") === templateId) return true;
  if (packFormId && String(doc.packFormId || "") === packFormId) return true;
  if (title && cleanText(doc.title || "", 160).toLowerCase() === title) return true;
  return false;
}

function householdChildIds(hh = {}) {
  if (Array.isArray(hh.childIds) && hh.childIds.length) {
    return hh.childIds.map(String).filter(Boolean);
  }
  return (Array.isArray(hh.children) ? hh.children : [])
    .map((c) => String(c?.id || ""))
    .filter(Boolean);
}

/**
 * Build a preview of recipients from already-validated resolved IDs + canonical maps.
 * assignmentScope household → one assignment per household (anchor child = first profile child).
 */
function buildRecipientPlan({
  audience = "family",
  mode = "children",
  assignmentScope = "child",
  resolvedChildIds = [],
  resolvedStaffEmails = [],
  profiles = [],
  households = [],
  classroomIds = [],
} = {}) {
  const profileById = new Map(
    (Array.isArray(profiles) ? profiles : [])
      .filter((p) => p && !p.archived)
      .map((p) => [String(p.id), p]),
  );
  const childIds = (Array.isArray(resolvedChildIds) ? resolvedChildIds : [])
    .map(String)
    .filter((id) => profileById.has(id));
  const staffEmails = [...new Set((Array.isArray(resolvedStaffEmails) ? resolvedStaffEmails : []).map(normalizeEmail).filter((e) => e.includes("@")))];

  if (audience === "staff") {
    return {
      audience: "staff",
      mode: normalizeMode(mode, "staff"),
      assignmentScope: "staff",
      childIds: [],
      householdIds: [],
      staffEmails,
      classroomIds: (Array.isArray(classroomIds) ? classroomIds : []).map(String).filter(Boolean),
      assignments: staffEmails.map((email) => ({
        kind: "staff",
        assigneeEmail: email,
      })),
      counts: {
        childCount: 0,
        householdCount: 0,
        staffCount: staffEmails.length,
        assignmentCount: staffEmails.length,
      },
    };
  }

  const scope = normalizeAssignmentScope(assignmentScope, "family");
  const hhList = Array.isArray(households) ? households : [];
  const childToHousehold = new Map();
  hhList.forEach((hh) => {
    householdChildIds(hh).forEach((cid) => {
      if (!childToHousehold.has(cid)) childToHousehold.set(cid, String(hh.id || ""));
    });
  });

  if (scope === "household") {
    const selected = new Set(childIds);
    const householdIds = [];
    const assignments = [];
    const seenHh = new Set();
    hhList.forEach((hh) => {
      const hhId = String(hh.id || "");
      if (!hhId) return;
      const kids = householdChildIds(hh).filter((id) => selected.has(id) || selected.size === 0);
      // Only include households that intersect selected children when children were resolved.
      const overlap = householdChildIds(hh).filter((id) => selected.has(id));
      if (!overlap.length) return;
      if (seenHh.has(hhId)) return;
      seenHh.add(hhId);
      const anchor = overlap.find((id) => profileById.has(id)) || overlap[0];
      if (!anchor) return;
      householdIds.push(hhId);
      assignments.push({
        kind: "household",
        householdId: hhId,
        childId: String(anchor),
        siblingChildIds: overlap,
      });
    });
    // Children selected with no household: treat each as child-specific fallback (fail-safe visibility).
    childIds.forEach((cid) => {
      if (childToHousehold.has(cid)) return;
      assignments.push({
        kind: "child",
        childId: cid,
        householdId: "",
        siblingChildIds: [cid],
      });
    });
    const householdCount = assignments.filter((a) => a.kind === "household").length;
    const orphanChildCount = assignments.filter((a) => a.kind === "child").length;
    return {
      audience: "family",
      mode: normalizeMode(mode, "family"),
      assignmentScope: "household",
      childIds,
      householdIds,
      staffEmails: [],
      classroomIds: (Array.isArray(classroomIds) ? classroomIds : []).map(String).filter(Boolean),
      assignments,
      counts: {
        childCount: childIds.length,
        householdCount: householdCount + orphanChildCount,
        staffCount: 0,
        assignmentCount: assignments.length,
      },
    };
  }

  // Child-specific: one assignment per child.
  const householdIdSet = new Set();
  const assignments = childIds.map((childId) => {
    const hhId = childToHousehold.get(childId) || "";
    if (hhId) householdIdSet.add(hhId);
    return {
      kind: "child",
      childId,
      householdId: hhId,
      siblingChildIds: hhId
        ? householdChildIds(hhList.find((h) => String(h.id) === hhId) || {}).filter((id) => childIds.includes(id))
        : [childId],
    };
  });
  return {
    audience: "family",
    mode: normalizeMode(mode, "family"),
    assignmentScope: "child",
    childIds,
    householdIds: [...householdIdSet],
    staffEmails: [],
    classroomIds: (Array.isArray(classroomIds) ? classroomIds : []).map(String).filter(Boolean),
    assignments,
    counts: {
      childCount: childIds.length,
      householdCount: householdIdSet.size,
      staffCount: 0,
      assignmentCount: assignments.length,
    },
  };
}

function countsMatch(expected = {}, actual = {}) {
  const keys = ["childCount", "householdCount", "staffCount", "assignmentCount"];
  const mismatches = [];
  keys.forEach((key) => {
    if (expected[key] == null || expected[key] === "") return;
    if (Number(expected[key]) !== Number(actual[key])) {
      mismatches.push({
        key,
        expected: Number(expected[key]),
        actual: Number(actual[key]),
      });
    }
  });
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Resolve multi-classroom + staff role modes into the Wave 1 resolve shape.
 */
function expandAssignmentRequest(request = {}, {
  profiles = [],
  staffDirectory = [],
} = {}) {
  const audience = normalizeAudience(request.audience || (String(request.mode || "").includes("staff") || request.mode === "all_teachers" || request.mode === "all_staff" ? "staff" : "family"));
  let mode = normalizeMode(request.mode, audience);
  const assignmentScope = normalizeAssignmentScope(request.assignmentScope, audience);
  const classroomIds = [
    ...(Array.isArray(request.classroomIds) ? request.classroomIds : []),
    request.classroomId ? String(request.classroomId) : "",
  ].map(String).map((s) => s.trim()).filter(Boolean);
  const uniqueRooms = [...new Set(classroomIds)];

  let childIds = Array.isArray(request.childIds) ? request.childIds.map(String) : [];
  let householdIds = Array.isArray(request.householdIds) ? request.householdIds.map(String) : [];
  let staffEmails = Array.isArray(request.staffEmails) ? request.staffEmails.map(normalizeEmail) : [];

  if (audience === "family" && (mode === "classrooms" || (mode === "classroom" && uniqueRooms.length > 1))) {
    const roomSet = new Set(uniqueRooms);
    const active = (Array.isArray(profiles) ? profiles : []).filter((p) => p && !p.archived);
    childIds = active
      .filter((p) => roomSet.has(String(p.classroomId || p.classroom || "")))
      .map((p) => String(p.id));
    mode = "children";
  } else if (audience === "family" && mode === "classroom" && uniqueRooms.length === 1) {
    mode = "classroom";
  }

  if (audience === "staff") {
    const directory = Array.isArray(staffDirectory) ? staffDirectory : [];
    const roleOf = (row) => String(row.role || "").trim().toLowerCase();
    if (mode === "all_teachers") {
      staffEmails = directory
        .filter((row) => /teacher|lead|director|owner/.test(roleOf(row)))
        .map((row) => normalizeEmail(row.email));
      mode = "staff";
    } else if (mode === "all_staff") {
      staffEmails = directory.map((row) => normalizeEmail(row.email));
      mode = "staff";
    } else if (mode === "classroom_staff") {
      const roomSet = new Set(uniqueRooms);
      staffEmails = directory
        .filter((row) => {
          const rooms = Array.isArray(row.classroomIds) ? row.classroomIds.map(String) : [];
          if (!roomSet.size) return false;
          return rooms.some((id) => roomSet.has(id));
        })
        .map((row) => normalizeEmail(row.email));
      mode = "staff";
    } else {
      mode = "staff";
    }
  }

  return {
    audience,
    mode,
    assignmentScope,
    childIds: [...new Set(childIds.filter(Boolean))],
    householdIds: [...new Set(householdIds.filter(Boolean))],
    staffEmails: [...new Set(staffEmails.filter((e) => e.includes("@")))],
    classroomId: uniqueRooms[0] || "",
    classroomIds: uniqueRooms,
    programId: request.programId,
  };
}

function snapshotFormSpec(raw = {}, template = null) {
  const body = cleanText(
    raw.draftText || raw.body || raw.bodyText
    || template?.body || template?.bodyText || "",
    20000,
  );
  const fields = formFieldsLib.normalizeFormFields(
    Array.isArray(raw.fields) ? raw.fields : (template?.fields || []),
    { strict: false },
  );
  const title = cleanText(raw.title || template?.title || "Form", 160) || "Form";
  const category = cleanText(raw.category || template?.category || "Other", 80) || "Other";
  const templateId = cleanText(raw.templateId || template?.id || "", 80);
  const contentVersion = Math.max(
    1,
    Number(raw.templateVersion || raw.contentVersion || template?.contentVersion) || 1,
  );
  return {
    title,
    category,
    draftText: body,
    bodyText: body,
    fields,
    fieldSchemaVersion: fields.length ? 1 : undefined,
    templateId,
    packFormId: cleanText(raw.packFormId || template?.packFormId || "", 80),
    resourceId: cleanText(raw.resourceId || template?.resourceId || "", 80),
    templateVersion: contentVersion,
    contentVersion: 1,
    bodyHash: formsLib.hashFormBody(body),
    requiresSignature: raw.requiresSignature != null
      ? raw.requiresSignature !== false
      : (template ? template.requiresSignature !== false : true),
    notes: cleanText(raw.notes || "Assigned via Confirm & Send.", 500),
  };
}

function findOpenChildDoc(docs, { childId, householdId, assignmentScope, formSpec }) {
  return (Array.isArray(docs) ? docs : []).find((doc) => {
    if (!isOpenAssignment(doc) || !matchesTemplate(doc, formSpec)) return false;
    if (assignmentScope === "household" && householdId) {
      return String(doc.householdId || "") === String(householdId)
        && String(doc.assignmentScope || "") === "household";
    }
    return String(doc.childId || "") === String(childId)
      && String(doc.assignmentScope || "child") !== "household";
  }) || null;
}

function buildChildAssignmentRow(planItem, formSpec, {
  dueDate = "",
  shareWithFamily = false,
  existing = null,
  sendBatchId = "",
} = {}) {
  const now = nowIso();
  const share = shareWithFamily === true || shareWithFamily === "true";
  const status = share ? "notified" : "assigned";
  const scope = planItem.kind === "household" ? "household" : "child";
  if (existing) {
    return {
      ...existing,
      dueDate: cleanText(dueDate || existing.dueDate || "", 20),
      draftText: formSpec.draftText || existing.draftText || "",
      bodyText: formSpec.bodyText || existing.bodyText || "",
      fields: formSpec.fields,
      fieldSchemaVersion: formSpec.fieldSchemaVersion,
      bodyHash: formSpec.bodyHash || existing.bodyHash,
      shareWithFamily: share,
      status,
      statusLabel: formsLib.formStatusLabel(status),
      requiresSignature: formSpec.requiresSignature !== false,
      updatedAt: now,
      lastNotifiedAt: share ? now : (existing.lastNotifiedAt || ""),
      duplicateAssignSkipped: true,
      assigneeType: "child",
      assignmentScope: scope,
      householdId: planItem.householdId || existing.householdId || "",
      templateId: formSpec.templateId || existing.templateId || "",
      templateVersion: formSpec.templateVersion,
      sendBatchId: sendBatchId || existing.sendBatchId || "",
    };
  }
  return {
    id: newId("doc"),
    childId: String(planItem.childId || ""),
    householdId: planItem.householdId || "",
    assignmentScope: scope,
    assigneeType: "child",
    title: formSpec.title,
    category: formSpec.category,
    packFormId: formSpec.packFormId,
    resourceId: formSpec.resourceId,
    templateId: formSpec.templateId,
    templateVersion: formSpec.templateVersion,
    status,
    statusLabel: formsLib.formStatusLabel(status),
    notes: formSpec.notes,
    draftText: formSpec.draftText,
    bodyText: formSpec.bodyText,
    fields: formSpec.fields,
    fieldSchemaVersion: formSpec.fieldSchemaVersion,
    bodyHash: formSpec.bodyHash,
    contentVersion: 1,
    dueDate: cleanText(dueDate || "", 20),
    shareWithFamily: share,
    date: now.slice(0, 10),
    assignedAt: now,
    updatedAt: now,
    lastNotifiedAt: share ? now : "",
    providerReviewed: false,
    requiresSignature: formSpec.requiresSignature !== false,
    sendBatchId: sendBatchId || "",
    archived: false,
  };
}

function rememberIdempotency(formsBucket, key, result) {
  if (!formsBucket || typeof formsBucket !== "object") return;
  if (!formsBucket.assignIdempotency || typeof formsBucket.assignIdempotency !== "object") {
    formsBucket.assignIdempotency = {};
  }
  formsBucket.assignIdempotency[String(key)] = {
    at: nowIso(),
    result,
  };
  const keys = Object.keys(formsBucket.assignIdempotency);
  if (keys.length > 80) {
    keys
      .sort((a, b) => String(formsBucket.assignIdempotency[a].at).localeCompare(String(formsBucket.assignIdempotency[b].at)))
      .slice(0, keys.length - 80)
      .forEach((k) => { delete formsBucket.assignIdempotency[k]; });
  }
}

function readIdempotency(formsBucket, key) {
  const row = formsBucket?.assignIdempotency?.[String(key)];
  if (!row || !row.result) return null;
  return row.result;
}

module.exports = {
  FAMILY_MODES,
  STAFF_MODES,
  normalizeAudience,
  normalizeAssignmentScope,
  normalizeMode,
  expandAssignmentRequest,
  buildRecipientPlan,
  countsMatch,
  snapshotFormSpec,
  findOpenChildDoc,
  buildChildAssignmentRow,
  isOpenAssignment,
  matchesTemplate,
  rememberIdempotency,
  readIdempotency,
  householdChildIds,
  newId,
  nowIso,
};
