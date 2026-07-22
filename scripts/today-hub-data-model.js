/**
 * Phase 15 — Today Hub / Daily Operations data model.
 * Fake/testing only. Attendance history is append-only (never silent overwrite).
 * Ratio guidance is provider-configured — not a universal compliance claim.
 */

const crypto = require("node:crypto");

const TESTING_BANNER = "Testing Account — Fake Data Only. Not production operations.";
const RATIO_DISCLAIMER = "Ratio status is based on provider-configured rules for this program. It is not a universal state compliance certification.";

const ATTENDANCE_STATUSES = Object.freeze({
  EXPECTED: "expected",
  CHECKED_IN: "checked_in",
  ABSENT: "absent",
  LATE: "late",
  TEMPORARILY_OUT: "temporarily_out",
  MOVED: "moved_classroom",
  CHECKED_OUT: "checked_out",
  EARLY_PICKUP: "early_pickup",
});

const PICKUP_VERIFICATION = Object.freeze({
  VERIFIED: "verified",
  PENDING: "pending",
  UNAUTHORIZED_WARNING: "unauthorized_warning",
  NOT_APPLICABLE: "not_applicable",
});

const RATIO_STATUS = Object.freeze({
  IN_RATIO: "in_ratio",
  NEAR_LIMIT: "near_limit",
  OUT_OF_RATIO: "out_of_configured_ratio",
  COVERAGE_NEEDED: "coverage_needed",
  NOT_CONFIGURED: "not_configured",
});

const PRIORITIES = Object.freeze({
  URGENT: "urgent",
  TODAY: "today",
  DUE_SOON: "due_soon",
  INFORMATIONAL: "informational",
  COMPLETED: "completed",
});

const TASK_SOURCES = Object.freeze({
  FORMS: "forms",
  RECORDS: "records",
  LICENSING: "licensing",
  ENROLLMENT: "enrollment",
  MESSAGES: "messages",
  DAILY_LOGS: "daily_logs",
  INCIDENTS: "incidents",
  MEDICATION: "medication",
  CALENDAR: "calendar",
  FAMILY_UPDATES: "family_updates",
  STAFF: "staff",
  ATTENDANCE: "attendance",
  RATIO: "ratio",
});

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return nowIso().slice(0, 10);
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureTodayHubStore(store) {
  if (!store.todayHub || typeof store.todayHub !== "object") store.todayHub = {};
  const hub = store.todayHub;
  if (!hub.attendance || typeof hub.attendance !== "object") hub.attendance = {};
  if (!hub.attendanceHistory || typeof hub.attendanceHistory !== "object") hub.attendanceHistory = {};
  if (!hub.ratioConfigs || typeof hub.ratioConfigs !== "object") hub.ratioConfigs = {};
  if (!hub.ratioHistory || typeof hub.ratioHistory !== "object") hub.ratioHistory = {};
  if (!hub.staffDuty || typeof hub.staffDuty !== "object") hub.staffDuty = {};
  if (!hub.incidents || typeof hub.incidents !== "object") hub.incidents = {};
  if (!hub.medicationTasks || typeof hub.medicationTasks !== "object") hub.medicationTasks = {};
  if (!hub.notifications || typeof hub.notifications !== "object") hub.notifications = {};
  if (!hub.meta || typeof hub.meta !== "object") {
    hub.meta = {
      createdAt: nowIso(),
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noStripe: true,
      noLiveAi: true,
      noProductionStorage: true,
      ratioDisclaimer: RATIO_DISCLAIMER,
      testingOnly: true,
    };
  }
  hub.meta.updatedAt = nowIso();
  return hub;
}

function createAttendanceRecord(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("att"),
    organizationId: cleanText(input.organizationId, 80),
    childId: cleanText(input.childId, 80),
    classroomId: cleanText(input.classroomId, 80),
    date: cleanText(input.date || todayDate(), 40),
    status: Object.values(ATTENDANCE_STATUSES).includes(input.status) ? input.status : ATTENDANCE_STATUSES.EXPECTED,
    checkedInAt: cleanText(input.checkedInAt, 40),
    checkedOutAt: cleanText(input.checkedOutAt, 40),
    dropOffPerson: cleanText(input.dropOffPerson, 160),
    pickupPerson: cleanText(input.pickupPerson, 160),
    pickupVerification: Object.values(PICKUP_VERIFICATION).includes(input.pickupVerification)
      ? input.pickupVerification
      : PICKUP_VERIFICATION.NOT_APPLICABLE,
    lastActorEmail: cleanText(input.lastActorEmail, 160).toLowerCase(),
    lastActorRole: cleanText(input.lastActorRole, 80),
    notes: cleanText(input.notes, 1000),
    movedFromClassroomId: cleanText(input.movedFromClassroomId, 80),
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function appendAttendanceHistory(store, attendance, { action, actorEmail, actorRole, reason, previousStatus, detail } = {}) {
  ensureTodayHubStore(store);
  const entry = {
    id: newId("atthist"),
    organizationId: attendance.organizationId,
    attendanceId: attendance.id,
    childId: attendance.childId,
    classroomId: attendance.classroomId,
    action: cleanText(action || "update", 80),
    previousStatus: cleanText(previousStatus || "", 40),
    nextStatus: attendance.status,
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    actorRole: cleanText(actorRole, 80),
    reason: cleanText(reason, 1000),
    detail: cleanText(detail, 1000),
    at: nowIso(),
    testingOnly: true,
  };
  store.todayHub.attendanceHistory[entry.id] = entry;
  return entry;
}

function applyAttendanceAction(store, attendance, patch = {}, actor = {}) {
  ensureTodayHubStore(store);
  const previousStatus = attendance.status;
  const next = {
    ...attendance,
    ...patch,
    status: Object.values(ATTENDANCE_STATUSES).includes(patch.status) ? patch.status : attendance.status,
    updatedAt: nowIso(),
    lastActorEmail: cleanText(actor.email || patch.lastActorEmail || attendance.lastActorEmail, 160).toLowerCase(),
    lastActorRole: cleanText(actor.role || patch.lastActorRole || attendance.lastActorRole, 80),
  };
  // Never silently overwrite — always write a history row for status/classroom changes.
  appendAttendanceHistory(store, next, {
    action: patch.action || "status_change",
    actorEmail: next.lastActorEmail,
    actorRole: next.lastActorRole,
    reason: patch.correctionReason || patch.reason || "",
    previousStatus,
    detail: patch.detail || `${previousStatus} → ${next.status}`,
  });
  store.todayHub.attendance[next.id] = next;
  return next;
}

function createRatioConfig(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("ratiocfg"),
    organizationId: cleanText(input.organizationId, 80),
    classroomId: cleanText(input.classroomId, 80),
    ageGroupLabel: cleanText(input.ageGroupLabel || "Mixed ages", 80),
    maxChildrenPerStaff: Number.isFinite(Number(input.maxChildrenPerStaff)) ? Number(input.maxChildrenPerStaff) : 6,
    nearLimitThreshold: Number.isFinite(Number(input.nearLimitThreshold)) ? Number(input.nearLimitThreshold) : 1,
    providerConfigured: true,
    disclaimer: RATIO_DISCLAIMER,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function evaluateRatio({ childrenPresent = 0, qualifiedStaff = 0, config }) {
  if (!config) {
    return {
      status: RATIO_STATUS.NOT_CONFIGURED,
      childrenPresent,
      qualifiedStaff,
      configuredMaxPerStaff: null,
      capacityAtCurrentStaff: null,
      remaining: null,
      disclaimer: RATIO_DISCLAIMER,
      wording: "No provider-configured ratio for this classroom.",
    };
  }
  const maxPer = Math.max(1, Number(config.maxChildrenPerStaff) || 6);
  const near = Math.max(0, Number(config.nearLimitThreshold) || 1);
  const capacity = qualifiedStaff * maxPer;
  const remaining = capacity - childrenPresent;
  let status = RATIO_STATUS.IN_RATIO;
  if (qualifiedStaff <= 0 && childrenPresent > 0) status = RATIO_STATUS.COVERAGE_NEEDED;
  else if (childrenPresent > capacity) status = RATIO_STATUS.OUT_OF_RATIO;
  else if (remaining <= near) status = RATIO_STATUS.NEAR_LIMIT;
  return {
    status,
    childrenPresent,
    qualifiedStaff,
    configuredMaxPerStaff: maxPer,
    capacityAtCurrentStaff: capacity,
    remaining,
    disclaimer: RATIO_DISCLAIMER,
    wording: "Based on provider-configured checklist — not a universal compliance label",
    providerConfigured: true,
  };
}

function snapshotRatio(store, { organizationId, classroomId, evaluation, actorEmail }) {
  ensureTodayHubStore(store);
  const row = {
    id: newId("ratiohist"),
    organizationId,
    classroomId,
    ...evaluation,
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    at: nowIso(),
    testingOnly: true,
  };
  store.todayHub.ratioHistory[row.id] = row;
  return row;
}

function createIncident(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("inc"),
    organizationId: cleanText(input.organizationId, 80),
    classroomId: cleanText(input.classroomId, 80),
    childId: cleanText(input.childId, 80),
    title: cleanText(input.title || "Incident (FAKE)", 200),
    status: cleanText(input.status || "awaiting_review", 40),
    severity: cleanText(input.severity || "low", 40),
    reportedByEmail: cleanText(input.reportedByEmail, 160).toLowerCase(),
    notes: cleanText(input.notes, 2000),
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createMedicationTask(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("medtask"),
    organizationId: cleanText(input.organizationId, 80),
    classroomId: cleanText(input.classroomId, 80),
    childId: cleanText(input.childId, 80),
    title: cleanText(input.title || "Medication task (FAKE)", 200),
    status: cleanText(input.status || "due_today", 40),
    dueAt: cleanText(input.dueAt || now, 40),
    allergyAlert: cleanText(input.allergyAlert, 500),
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createNotification(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("thnote"),
    organizationId: cleanText(input.organizationId, 80),
    audience: cleanText(input.audience || "staff", 40), // staff | family | admin_only
    roleScope: cleanText(input.roleScope || "all", 40),
    recipientEmail: cleanText(input.recipientEmail, 160).toLowerCase(),
    title: cleanText(input.title, 200),
    body: cleanText(input.body, 1000),
    priority: Object.values(PRIORITIES).includes(input.priority) ? input.priority : PRIORITIES.TODAY,
    href: cleanText(input.href || "today", 200),
    source: cleanText(input.source || TASK_SOURCES.ATTENDANCE, 40),
    sourceRefId: cleanText(input.sourceRefId, 80),
    childId: cleanText(input.childId, 80),
    classroomId: cleanText(input.classroomId, 80),
    read: input.read === true,
    adminOnly: input.adminOnly === true,
    dedupeKey: cleanText(input.dedupeKey, 160),
    sentExternally: false,
    testingOnly: true,
    createdAt: input.createdAt || now,
  };
}

function upsertNotification(store, input) {
  ensureTodayHubStore(store);
  const existing = listValues(store.todayHub.notifications).find((row) => (
    row.organizationId === input.organizationId
    && row.dedupeKey
    && row.dedupeKey === input.dedupeKey
  ));
  if (existing) return existing;
  const note = createNotification(input);
  store.todayHub.notifications[note.id] = note;
  return note;
}

function createTaskCard({
  id,
  source,
  priority = PRIORITIES.TODAY,
  title,
  summary = "",
  href = "",
  childId = "",
  classroomId = "",
  sourceRefId = "",
  roleVisibility = ["director", "teacher", "assistant"],
} = {}) {
  return {
    id: id || newId("thtask"),
    source,
    priority,
    title: cleanText(title, 200),
    summary: cleanText(summary, 500),
    href: cleanText(href, 200),
    childId: cleanText(childId, 80),
    classroomId: cleanText(classroomId, 80),
    sourceRefId: cleanText(sourceRefId, 80),
    roleVisibility,
    testingOnly: true,
  };
}

function priorityRank(priority) {
  const order = {
    [PRIORITIES.URGENT]: 0,
    [PRIORITIES.TODAY]: 1,
    [PRIORITIES.DUE_SOON]: 2,
    [PRIORITIES.INFORMATIONAL]: 3,
    [PRIORITIES.COMPLETED]: 4,
  };
  return order[priority] ?? 9;
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || String(a.title).localeCompare(String(b.title)));
}

function dedupeTasks(tasks) {
  const seen = new Set();
  const out = [];
  for (const task of tasks) {
    const key = `${task.source}|${task.sourceRefId || task.id}|${task.href}|${task.childId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(task);
  }
  return out;
}

module.exports = {
  TESTING_BANNER,
  RATIO_DISCLAIMER,
  ATTENDANCE_STATUSES,
  PICKUP_VERIFICATION,
  RATIO_STATUS,
  PRIORITIES,
  TASK_SOURCES,
  newId,
  nowIso,
  todayDate,
  cleanText,
  listValues,
  ensureTodayHubStore,
  createAttendanceRecord,
  appendAttendanceHistory,
  applyAttendanceAction,
  createRatioConfig,
  evaluateRatio,
  snapshotRatio,
  createIncident,
  createMedicationTask,
  createNotification,
  upsertNotification,
  createTaskCard,
  priorityRank,
  sortTasks,
  dedupeTasks,
};
