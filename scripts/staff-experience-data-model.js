/**
 * Phase 16 — Complete Staff Experience data model.
 * Fake/testing only. No payroll, banking, Stripe, email/SMS/push, live AI, or production storage.
 * Time entries and private notes are append-only / director-restricted.
 */

const crypto = require("node:crypto");

const TESTING_BANNER = "Testing Account — Fake Data Only. Not production staff operations.";
const RATIO_DISCLAIMER = "Coverage and ratio guidance is based on provider-configured rules and clock/schedule status. It is not a universal state compliance certification.";

const DIRECTORY_STATUSES = Object.freeze({
  ACTIVE: "active",
  INVITED: "invited",
  ONBOARDING: "onboarding",
  ON_LEAVE: "on_leave",
  SUBSTITUTE: "substitute",
  INACTIVE: "inactive",
  ENDED: "ended",
  ARCHIVED: "archived",
});

const SCHEDULE_STATUSES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED_TESTING: "published_in_testing",
  CHANGED: "changed",
  ARCHIVED: "archived",
});

const TIME_ENTRY_TYPES = Object.freeze({
  CLOCK_IN: "clock_in",
  CLOCK_OUT: "clock_out",
  BREAK_START: "break_start",
  BREAK_END: "break_end",
  LOCATION_CHANGE: "location_change",
  MISSED_PUNCH: "missed_punch",
  CORRECTION: "correction",
});

const TIME_OFF_STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  DECLINED: "declined",
  MORE_INFO: "more_info_requested",
  WITHDRAWN: "withdrawn",
});

const TRAINING_CATEGORIES = Object.freeze([
  "Orientation",
  "CPR",
  "First aid",
  "Mandated reporting",
  "Health and safety",
  "Safe sleep",
  "Medication administration",
  "Transportation",
  "Emergency preparedness",
  "Child development",
  "Behavior guidance",
  "Annual professional development",
  "Program-defined training",
]);

const TRAINING_STATUSES = Object.freeze({
  REQUIRED: "required",
  IN_PROGRESS: "in_progress",
  COMPLETE: "complete",
  EXPIRING_SOON: "expiring_soon",
  EXPIRED: "expired",
  MISSING: "missing",
  VERIFIED: "verified",
});

const ONBOARDING_STEPS = Object.freeze([
  "staff_information",
  "emergency_contact",
  "employment_forms",
  "background_check",
  "fingerprint_status",
  "orientation",
  "handbook_acknowledgment",
  "cpr_first_aid",
  "required_training",
  "qualifications",
  "health_documents",
  "classroom_assignment",
  "system_permissions",
  "start_date",
  "director_approval",
]);

const PRIVATE_NOTE_TYPES = Object.freeze({
  COACHING: "coaching",
  CHECK_IN: "check_in",
  GOAL: "goal",
  RECOGNITION: "recognition",
  PERFORMANCE_REVIEW: "performance_review",
  CORRECTIVE: "corrective",
  FOLLOW_UP: "follow_up",
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

function ensureStaffExperienceStore(store) {
  if (!store.staffExperience || typeof store.staffExperience !== "object") store.staffExperience = {};
  const sx = store.staffExperience;
  const collections = [
    "profiles",
    "onboardingChecklists",
    "schedules",
    "scheduleHistory",
    "shifts",
    "availability",
    "timeOffRequests",
    "timeEntries",
    "timeEntryHistory",
    "correctionRequests",
    "qualifications",
    "trainings",
    "certifications",
    "privateNotes",
    "offboardingRecords",
    "permissionSummaries",
    "invitations",
    "coverageSuggestions",
  ];
  for (const key of collections) {
    if (!sx[key] || typeof sx[key] !== "object") sx[key] = {};
  }
  if (!sx.meta || typeof sx.meta !== "object") {
    sx.meta = {
      createdAt: nowIso(),
      noPayroll: true,
      noBanking: true,
      noStripe: true,
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noLiveAi: true,
      noProductionStorage: true,
      ratioDisclaimer: RATIO_DISCLAIMER,
      testingOnly: true,
    };
  }
  sx.meta.updatedAt = nowIso();
  return sx;
}

function createStaffProfile(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxprof"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    displayName: cleanText(input.displayName, 160),
    email: cleanText(input.email, 160).toLowerCase(),
    role: cleanText(input.role, 80),
    directoryStatus: Object.values(DIRECTORY_STATUSES).includes(input.directoryStatus)
      ? input.directoryStatus
      : DIRECTORY_STATUSES.ACTIVE,
    phone: cleanText(input.phone, 40),
    emergencyContactName: cleanText(input.emergencyContactName, 160),
    emergencyContactPhone: cleanText(input.emergencyContactPhone, 40),
    hireDate: cleanText(input.hireDate, 40),
    startDate: cleanText(input.startDate, 40),
    endDate: cleanText(input.endDate, 40),
    locationLabel: cleanText(input.locationLabel || "Primary location", 120),
    isSubstitute: input.isSubstitute === true,
    onDuty: input.onDuty === true,
    permissionGroup: cleanText(input.permissionGroup || "default", 80),
    sensitivePersonnelRestricted: true,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createOnboardingChecklist(input = {}) {
  const now = nowIso();
  const steps = {};
  for (const key of ONBOARDING_STEPS) {
    steps[key] = {
      key,
      complete: Boolean(input.steps?.[key]?.complete),
      completedAt: input.steps?.[key]?.completedAt || "",
      note: cleanText(input.steps?.[key]?.note, 500),
    };
  }
  return {
    id: input.id || newId("sxonb"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    profileId: cleanText(input.profileId, 80),
    status: cleanText(input.status || "in_progress", 40),
    steps,
    directorApproved: input.directorApproved === true,
    invitationTemplateStored: true,
    externalSendDisabled: true,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createShift(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxshift"),
    organizationId: cleanText(input.organizationId, 80),
    scheduleId: cleanText(input.scheduleId, 80),
    membershipId: cleanText(input.membershipId, 80),
    classroomId: cleanText(input.classroomId, 80),
    locationLabel: cleanText(input.locationLabel || "Primary location", 120),
    date: cleanText(input.date || todayDate(), 40),
    startTime: cleanText(input.startTime || "08:00", 20),
    endTime: cleanText(input.endTime || "16:00", 20),
    breakMinutes: Number.isFinite(Number(input.breakMinutes)) ? Number(input.breakMinutes) : 30,
    openingShift: input.openingShift === true,
    closingShift: input.closingShift === true,
    splitShift: input.splitShift === true,
    recurring: input.recurring === true,
    requiredQualifications: Array.isArray(input.requiredQualifications)
      ? input.requiredQualifications.map((q) => cleanText(q, 80))
      : [],
    substituteMembershipId: cleanText(input.substituteMembershipId, 80),
    coverageGap: input.coverageGap === true,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createSchedule(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxsched"),
    organizationId: cleanText(input.organizationId, 80),
    weekStart: cleanText(input.weekStart || todayDate(), 40),
    locationLabel: cleanText(input.locationLabel || "Primary location", 120),
    status: Object.values(SCHEDULE_STATUSES).includes(input.status) ? input.status : SCHEDULE_STATUSES.DRAFT,
    title: cleanText(input.title || "Weekly staff schedule (FAKE)", 200),
    publishedAt: cleanText(input.publishedAt, 40),
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function appendScheduleHistory(store, schedule, { action, actorEmail, reason, detail } = {}) {
  ensureStaffExperienceStore(store);
  const entry = {
    id: newId("sxschhist"),
    organizationId: schedule.organizationId,
    scheduleId: schedule.id,
    action: cleanText(action || "update", 80),
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    reason: cleanText(reason, 1000),
    detail: cleanText(detail, 1000),
    status: schedule.status,
    at: nowIso(),
    testingOnly: true,
  };
  store.staffExperience.scheduleHistory[entry.id] = entry;
  return entry;
}

function createAvailability(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxavail"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    recurring: input.recurring !== false,
    weekday: cleanText(input.weekday || "monday", 20),
    startTime: cleanText(input.startTime || "07:00", 20),
    endTime: cleanText(input.endTime || "18:00", 20),
    unavailableDate: cleanText(input.unavailableDate, 40),
    note: cleanText(input.note, 500),
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createTimeOffRequest(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxtimeoff"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    startDate: cleanText(input.startDate || todayDate(), 40),
    endDate: cleanText(input.endDate || todayDate(), 40),
    status: Object.values(TIME_OFF_STATUSES).includes(input.status) ? input.status : TIME_OFF_STATUSES.PENDING,
    staffNote: cleanText(input.staffNote, 1000),
    directorNote: cleanText(input.directorNote, 1000),
    coverageAssignedMembershipId: cleanText(input.coverageAssignedMembershipId, 80),
    decisionHistory: Array.isArray(input.decisionHistory) ? input.decisionHistory : [],
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function appendTimeOffDecision(request, { action, actorEmail, note } = {}) {
  const entry = {
    id: newId("sxtodec"),
    action: cleanText(action, 80),
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    note: cleanText(note, 1000),
    at: nowIso(),
  };
  request.decisionHistory = [...(request.decisionHistory || []), entry];
  request.updatedAt = nowIso();
  return entry;
}

function createTimeEntry(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxtime"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    type: Object.values(TIME_ENTRY_TYPES).includes(input.type) ? input.type : TIME_ENTRY_TYPES.CLOCK_IN,
    at: cleanText(input.at || now, 40),
    classroomId: cleanText(input.classroomId, 80),
    locationLabel: cleanText(input.locationLabel || "Primary location", 120),
    note: cleanText(input.note, 1000),
    missedPunch: input.missedPunch === true,
    correctionPending: input.correctionPending === true,
    approved: input.approved === true,
    payrollExportReady: true,
    payrollProcessed: false,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function appendTimeHistory(store, entry, { action, actorEmail, reason, previous } = {}) {
  ensureStaffExperienceStore(store);
  const row = {
    id: newId("sxtimehist"),
    organizationId: entry.organizationId,
    timeEntryId: entry.id,
    membershipId: entry.membershipId,
    action: cleanText(action || "update", 80),
    actorEmail: cleanText(actorEmail, 160).toLowerCase(),
    reason: cleanText(reason, 1000),
    previous: previous || null,
    nextType: entry.type,
    nextAt: entry.at,
    at: nowIso(),
    testingOnly: true,
  };
  store.staffExperience.timeEntryHistory[row.id] = row;
  return row;
}

function applyTimeAction(store, entry, patch = {}, actor = {}) {
  ensureStaffExperienceStore(store);
  const previous = { type: entry.type, at: entry.at, classroomId: entry.classroomId, note: entry.note };
  const next = {
    ...entry,
    ...patch,
    type: Object.values(TIME_ENTRY_TYPES).includes(patch.type) ? patch.type : entry.type,
    updatedAt: nowIso(),
  };
  appendTimeHistory(store, next, {
    action: patch.action || "status_change",
    actorEmail: actor.email || "",
    reason: patch.reason || patch.correctionReason || "",
    previous,
  });
  store.staffExperience.timeEntries[next.id] = next;
  return next;
}

function createCorrectionRequest(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxcorr"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    timeEntryId: cleanText(input.timeEntryId, 80),
    reason: cleanText(input.reason, 1000),
    requestedAt: cleanText(input.requestedAt || now, 40),
    requestedType: cleanText(input.requestedType, 40),
    status: cleanText(input.status || "pending", 40),
    directorReason: cleanText(input.directorReason, 1000),
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createQualification(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxqual"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    title: cleanText(input.title || "Qualification (FAKE)", 200),
    category: cleanText(input.category || "general", 80),
    verified: input.verified === true,
    notes: cleanText(input.notes, 1000),
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createTraining(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxtrain"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    title: cleanText(input.title || "Training (FAKE)", 200),
    category: TRAINING_CATEGORIES.includes(input.category) ? input.category : "Program-defined training",
    provider: cleanText(input.provider || "Program training (FAKE)", 160),
    completionDate: cleanText(input.completionDate, 40),
    hours: Number.isFinite(Number(input.hours)) ? Number(input.hours) : 0,
    certificateRecordId: cleanText(input.certificateRecordId, 80),
    expirationDate: cleanText(input.expirationDate, 40),
    requiredByRole: cleanText(input.requiredByRole, 80),
    directorVerified: input.directorVerified === true,
    status: Object.values(TRAINING_STATUSES).includes(input.status) ? input.status : TRAINING_STATUSES.REQUIRED,
    notes: cleanText(input.notes, 1000),
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createCertification(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxcert"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    title: cleanText(input.title || "Certification (FAKE)", 200),
    category: cleanText(input.category || "CPR", 80),
    issuedAt: cleanText(input.issuedAt, 40),
    expiresAt: cleanText(input.expiresAt, 40),
    recordId: cleanText(input.recordId, 80),
    licensingRequirementKey: cleanText(input.licensingRequirementKey, 80),
    status: Object.values(TRAINING_STATUSES).includes(input.status) ? input.status : TRAINING_STATUSES.VERIFIED,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createPrivateNote(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxnote"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    type: Object.values(PRIVATE_NOTE_TYPES).includes(input.type) ? input.type : PRIVATE_NOTE_TYPES.COACHING,
    title: cleanText(input.title || "Private note (FAKE)", 200),
    body: cleanText(input.body, 4000),
    followUpDate: cleanText(input.followUpDate, 40),
    createdByEmail: cleanText(input.createdByEmail, 160).toLowerCase(),
    directorOwnerOnly: true,
    excludedFromGeneralSearch: true,
    excludedFromDirectory: true,
    excludedFromFamilyHub: true,
    excludedFromClassroomViews: true,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function createOffboardingRecord(input = {}) {
  const now = nowIso();
  return {
    id: input.id || newId("sxoff"),
    organizationId: cleanText(input.organizationId, 80),
    membershipId: cleanText(input.membershipId, 80),
    endDate: cleanText(input.endDate || todayDate(), 40),
    reasonCategory: cleanText(input.reasonCategory || "resignation", 80),
    finalShiftDate: cleanText(input.finalShiftDate, 40),
    returnPropertyChecklist: Array.isArray(input.returnPropertyChecklist) ? input.returnPropertyChecklist : [],
    openTasksCleared: input.openTasksCleared === true,
    classroomReassigned: input.classroomReassigned === true,
    conversationReassigned: input.conversationReassigned === true,
    accessEndedAt: cleanText(input.accessEndedAt || now, 40),
    recordRetentionNote: cleanText(
      input.recordRetentionNote || "Prior messages, forms, time entries, observations, and approvals preserved.",
      500,
    ),
    archiveStatus: cleanText(input.archiveStatus || "archived", 40),
    historyPreserved: true,
    childRecordsPreserved: true,
    removedFromRatioAfterClockOut: true,
    testingOnly: true,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

function buildPermissionSummary({ role, overrides = {}, isDirector = false } = {}) {
  const lines = [];
  if (isDirector) {
    lines.push("Full organization staff, schedule, permissions, and private notes access (testing).");
    lines.push("Can manage onboarding, offboarding, and reports foundation.");
  } else if (String(role).includes("lead_teacher") || String(role).includes("teacher")) {
    lines.push("Assigned classrooms, attendance, daily logs, and family messaging for those rooms.");
    lines.push("Cannot view other staff private personnel notes or pay information.");
  } else {
    lines.push("Assigned classrooms only, with limited defaults.");
    if (overrides.createDailyLogs) lines.push("Daily Logs: allowed by director override.");
    if (overrides.viewMedicalAndAllergyInformation) lines.push("Medical/allergy: allowed by director override.");
    else lines.push("Medical/allergy: not allowed.");
    lines.push("Cannot view other staff private personnel notes, pay, or disciplinary records.");
  }
  lines.push("No payroll, banking, or external notification access in this phase.");
  return {
    role: cleanText(role, 80),
    plainLanguage: lines,
    overrides,
    sensitivePersonnelHidden: !isDirector,
    payHidden: true,
    disciplinaryHidden: !isDirector,
  };
}

function clockedInMembershipIds(store, organizationId) {
  ensureStaffExperienceStore(store);
  const byMember = new Map();
  for (const entry of listValues(store.staffExperience.timeEntries).filter((e) => e.organizationId === organizationId)) {
    const prev = byMember.get(entry.membershipId);
    if (!prev || String(entry.at) > String(prev.at)) byMember.set(entry.membershipId, entry);
  }
  const ids = [];
  for (const [membershipId, entry] of byMember) {
    if ([TIME_ENTRY_TYPES.CLOCK_IN, TIME_ENTRY_TYPES.BREAK_END, TIME_ENTRY_TYPES.LOCATION_CHANGE, TIME_ENTRY_TYPES.BREAK_START].includes(entry.type)) {
      ids.push(membershipId);
    }
  }
  return [...new Set(ids)];
}

function syncDutyFromClock(store, organizationId) {
  const todayHub = require("./today-hub-data-model.js");
  todayHub.ensureTodayHubStore(store);
  ensureStaffExperienceStore(store);
  const clocked = new Set(clockedInMembershipIds(store, organizationId));
  const duties = listValues(store.todayHub.staffDuty).filter((d) => d.organizationId === organizationId);
  for (const duty of duties) {
    duty.onDuty = clocked.has(duty.membershipId);
    duty.updatedAt = nowIso();
    store.todayHub.staffDuty[duty.id] = duty;
  }
  for (const membershipId of clocked) {
    const existing = duties.find((d) => d.membershipId === membershipId);
    if (existing) continue;
    const assignment = listValues(store.classroomStaffAssignments || {}).find((a) => (
      a.organizationId === organizationId && a.staffMembershipId === membershipId && !a.endsAt
    ));
    const member = store.staffMemberships?.[membershipId] || {};
    const duty = {
      id: todayHub.newId("duty"),
      organizationId,
      membershipId,
      classroomId: assignment?.classroomId || "",
      email: member.userEmail || "",
      onDuty: true,
      startedAt: nowIso(),
      testingOnly: true,
      phase16: true,
    };
    store.todayHub.staffDuty[duty.id] = duty;
  }
  return clockedInMembershipIds(store, organizationId);
}

module.exports = {
  TESTING_BANNER,
  RATIO_DISCLAIMER,
  DIRECTORY_STATUSES,
  SCHEDULE_STATUSES,
  TIME_ENTRY_TYPES,
  TIME_OFF_STATUSES,
  TRAINING_CATEGORIES,
  TRAINING_STATUSES,
  ONBOARDING_STEPS,
  PRIVATE_NOTE_TYPES,
  newId,
  nowIso,
  todayDate,
  cleanText,
  listValues,
  ensureStaffExperienceStore,
  createStaffProfile,
  createOnboardingChecklist,
  createShift,
  createSchedule,
  appendScheduleHistory,
  createAvailability,
  createTimeOffRequest,
  appendTimeOffDecision,
  createTimeEntry,
  appendTimeHistory,
  applyTimeAction,
  createCorrectionRequest,
  createQualification,
  createTraining,
  createCertification,
  createPrivateNote,
  createOffboardingRecord,
  buildPermissionSummary,
  clockedInMembershipIds,
  syncDutyFromClock,
};
