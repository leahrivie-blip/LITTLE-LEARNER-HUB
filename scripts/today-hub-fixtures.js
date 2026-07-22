/**
 * Phase 15 Today Hub fixtures — resettable fake operations scenarios.
 */

const phase14 = require("./licensing-center-fixtures.js");
const model = require("./today-hub-data-model.js");
const orgPermissions = require("./org-permissions.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function resolveChildIds(store, orgId, seeded14 = {}) {
  const from = seeded14.childIds || store.recordsCenter?.meta?.phase13ChildIds || store.licensingCenter?.meta?.phase14ChildIds || {};
  if (from.ava || from.ben) return from;
  const by = { ...from };
  for (const child of listValues(store.childRecords).filter((row) => row.organizationId === orgId)) {
    const name = String(child.displayName || "").toLowerCase();
    if (name.includes("ava")) by.ava = child.id;
    else if (name.includes("ben")) by.ben = child.id;
    else if (name.includes("carlos")) by.carlos = child.id;
    else if (name.includes("elena")) by.elena = child.id;
    else if (name.includes("dana")) by.dana = child.id;
  }
  return by;
}

function ensurePhase15Preview(store, { adminEmail = "phase15.owner@example.invalid", organizationId = "" } = {}) {
  model.ensureTodayHubStore(store);
  const seeded14 = phase14.ensurePhase14Preview(store, { adminEmail, organizationId });
  const orgId = seeded14.organizationId || organizationId;

  if (store.todayHub.meta?.phase15SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      ids: store.todayHub.meta.phase15Ids || {},
      childIds: store.todayHub.meta.phase15ChildIds || {},
    };
  }

  const childIds = resolveChildIds(store, orgId, seeded14);
  const classrooms = listValues(store.classrooms).filter((row) => row.organizationId === orgId);
  const primary = classrooms[0] || { id: "", name: "Primary Classroom" };
  const secondary = classrooms[1] || primary;
  const staff = listValues(store.staffMemberships).filter((row) => row.organizationId === orgId);
  const teacher = staff.find((row) => row.role === orgPermissions.ORG_ROLES.LEAD_TEACHER) || staff[0] || {};
  const assistant = staff.find((row) => row.role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF) || {};
  const today = model.todayDate();
  const ids = {};

  // Ratio configs: normal + near + out-of-ratio classrooms
  const ratioNormal = model.createRatioConfig({
    organizationId: orgId,
    classroomId: primary.id,
    ageGroupLabel: "Toddlers (provider-configured)",
    maxChildrenPerStaff: 6,
    nearLimitThreshold: 1,
  });
  store.todayHub.ratioConfigs[ratioNormal.id] = ratioNormal;
  ids.ratioNormalId = ratioNormal.id;

  if (secondary.id && secondary.id !== primary.id) {
    const ratioTight = model.createRatioConfig({
      organizationId: orgId,
      classroomId: secondary.id,
      ageGroupLabel: "Infants (provider-configured)",
      maxChildrenPerStaff: 3,
      nearLimitThreshold: 1,
    });
    store.todayHub.ratioConfigs[ratioTight.id] = ratioTight;
    ids.ratioTightId = ratioTight.id;
  }

  function addAttendance(key, childKey, status, extra = {}) {
    const childId = childIds[childKey] || "";
    const row = model.createAttendanceRecord({
      organizationId: orgId,
      childId,
      classroomId: extra.classroomId || primary.id,
      date: today,
      status,
      checkedInAt: extra.checkedInAt || (status === model.ATTENDANCE_STATUSES.CHECKED_IN || status === model.ATTENDANCE_STATUSES.LATE ? `${today}T08:05:00.000Z` : ""),
      checkedOutAt: extra.checkedOutAt || "",
      dropOffPerson: extra.dropOffPerson || "Priya Lin (Fixture)",
      pickupPerson: extra.pickupPerson || "",
      pickupVerification: extra.pickupVerification || model.PICKUP_VERIFICATION.NOT_APPLICABLE,
      lastActorEmail: adminEmail,
      lastActorRole: "director_owner",
      notes: extra.notes || "",
      movedFromClassroomId: extra.movedFromClassroomId || "",
    });
    store.todayHub.attendance[row.id] = row;
    model.appendAttendanceHistory(store, row, {
      action: "seed",
      actorEmail: adminEmail,
      actorRole: "director_owner",
      previousStatus: "",
      detail: `Seeded ${status}`,
    });
    ids[key] = row.id;
    return row;
  }

  addAttendance("attAvaPresent", "ava", model.ATTENDANCE_STATUSES.CHECKED_IN);
  addAttendance("attBenAbsent", "ben", model.ATTENDANCE_STATUSES.ABSENT, { notes: "Absent fixture" });
  addAttendance("attCarlosLate", "carlos", model.ATTENDANCE_STATUSES.LATE, { checkedInAt: `${today}T09:20:00.000Z` });
  addAttendance("attElenaMoved", "elena", model.ATTENDANCE_STATUSES.MOVED, {
    classroomId: secondary.id || primary.id,
    movedFromClassroomId: primary.id,
    notes: "Classroom transfer fixture",
  });
  addAttendance("attDanaExpected", "dana", model.ATTENDANCE_STATUSES.EXPECTED);

  // Authorized pickup + unauthorized warning history on Ava's single attendance row (no duplicate roster row)
  const avaRow = store.todayHub.attendance[ids.attAvaPresent];
  model.appendAttendanceHistory(store, avaRow, {
    action: "pickup_authorized_demo",
    actorEmail: adminEmail,
    actorRole: "director_owner",
    detail: "Authorized pickup verified (fixture history)",
  });
  ids.unauthorizedPickupHistoryId = model.appendAttendanceHistory(store, avaRow, {
    action: "pickup_unauthorized_warning",
    actorEmail: teacher.userEmail || adminEmail,
    actorRole: "lead_teacher",
    reason: "Name not on authorized list (FAKE warning)",
    detail: "Unauthorized pickup warning fixture — not a real incident",
  }).id;

  // Staff on duty
  if (teacher.id) {
    const duty = {
      id: model.newId("duty"),
      organizationId: orgId,
      membershipId: teacher.id,
      classroomId: primary.id,
      email: teacher.userEmail || "",
      onDuty: true,
      startedAt: `${today}T07:45:00.000Z`,
      testingOnly: true,
    };
    store.todayHub.staffDuty[duty.id] = duty;
    ids.teacherDutyId = duty.id;

    // Ensure classroom assignment so teacher Today Hub is scoped (not org-wide)
    store.classroomStaffAssignments = store.classroomStaffAssignments || {};
    const hasTeacherAssign = listValues(store.classroomStaffAssignments).some((row) => (
      row.organizationId === orgId && row.staffMembershipId === teacher.id && row.classroomId === primary.id
    ));
    if (!hasTeacherAssign) {
      const foundation = require("./foundation-data-model.js");
      const assignment = foundation.createClassroomStaffAssignmentRecord({
        organizationId: orgId,
        classroomId: primary.id,
        staffMembershipId: teacher.id,
        userId: teacher.userId || "",
      });
      assignment.preview = true;
      assignment.phase15 = true;
      store.classroomStaffAssignments[assignment.id] = assignment;
      ids.teacherAssignmentId = assignment.id;
    }
  }
  if (assistant.id) {
    const duty = {
      id: model.newId("duty"),
      organizationId: orgId,
      membershipId: assistant.id,
      classroomId: primary.id,
      email: assistant.userEmail || "",
      onDuty: true,
      startedAt: `${today}T07:50:00.000Z`,
      testingOnly: true,
    };
    store.todayHub.staffDuty[duty.id] = duty;
    ids.assistantDutyId = duty.id;

    store.classroomStaffAssignments = store.classroomStaffAssignments || {};
    const hasAsstAssign = listValues(store.classroomStaffAssignments).some((row) => (
      row.organizationId === orgId && row.staffMembershipId === assistant.id && row.classroomId === primary.id
    ));
    if (!hasAsstAssign) {
      const foundation = require("./foundation-data-model.js");
      const assignment = foundation.createClassroomStaffAssignmentRecord({
        organizationId: orgId,
        classroomId: primary.id,
        staffMembershipId: assistant.id,
        userId: assistant.userId || "",
      });
      assignment.preview = true;
      assignment.phase15 = true;
      store.classroomStaffAssignments[assignment.id] = assignment;
      ids.assistantAssignmentId = assignment.id;
    }

    // Assistant permission override: daily logs yes, medical/allergy no (default boundary fixture)
    store.assistantPermissionOverrides = store.assistantPermissionOverrides || {};
    const existingOverride = listValues(store.assistantPermissionOverrides).find((row) => (
      row.organizationId === orgId && row.staffMembershipId === assistant.id
    ));
    if (!existingOverride) {
      const overrideId = model.newId("assto");
      store.assistantPermissionOverrides[overrideId] = {
        id: overrideId,
        organizationId: orgId,
        staffMembershipId: assistant.id,
        permissions: {
          createDailyLogs: true,
          editDailyLogs: true,
          viewChildProfiles: true,
          viewMedicalAndAllergyInformation: false,
          viewEmergencyInformation: false,
        },
        testingOnly: true,
        phase15: true,
      };
      ids.assistantOverrideId = overrideId;
    }
  }

  // Incident awaiting review
  const incident = model.createIncident({
    organizationId: orgId,
    classroomId: primary.id,
    childId: childIds.ben || "",
    title: "Minor scrape on playground (FAKE)",
    status: "awaiting_review",
    reportedByEmail: teacher.userEmail || adminEmail,
    notes: "Needs director review fixture.",
  });
  store.todayHub.incidents[incident.id] = incident;
  ids.incidentId = incident.id;

  // Medication task
  const med = model.createMedicationTask({
    organizationId: orgId,
    classroomId: primary.id,
    childId: childIds.ben || "",
    title: "Afternoon allergy medication (FAKE)",
    status: "due_today",
    allergyAlert: "Peanut allergy — epi-pen on file (fixture).",
  });
  store.todayHub.medicationTasks[med.id] = med;
  ids.medicationTaskId = med.id;

  // Incomplete daily report marker (references phase3 preview daily logs if present)
  store.todayHub.meta.incompleteDailyReports = [
    {
      id: "daily_incomplete_fixture",
      classroomId: primary.id,
      childId: childIds.ava || "",
      date: today,
      status: "incomplete",
      title: "Daily Report incomplete (FAKE)",
    },
  ];

  // Ratio snapshots: normal + out-of-ratio warning demo
  const presentCount = listValues(store.todayHub.attendance).filter((row) => (
    row.organizationId === orgId
    && row.date === today
    && row.classroomId === primary.id
    && [model.ATTENDANCE_STATUSES.CHECKED_IN, model.ATTENDANCE_STATUSES.LATE, model.ATTENDANCE_STATUSES.TEMPORARILY_OUT].includes(row.status)
  )).length;
  const evalNormal = model.evaluateRatio({ childrenPresent: presentCount, qualifiedStaff: 1, config: ratioNormal });
  model.snapshotRatio(store, { organizationId: orgId, classroomId: primary.id, evaluation: evalNormal, actorEmail: adminEmail });
  const evalOut = model.evaluateRatio({ childrenPresent: 8, qualifiedStaff: 1, config: ratioNormal });
  const outSnap = model.snapshotRatio(store, { organizationId: orgId, classroomId: primary.id, evaluation: evalOut, actorEmail: adminEmail });
  ids.outOfRatioSnapshotId = outSnap.id;

  // In-app notifications (no external send); include admin-only that must not reach guardians
  model.upsertNotification(store, {
    organizationId: orgId,
    audience: "staff",
    roleScope: "director",
    title: "Out-of-ratio warning (provider-configured)",
    body: "Classroom near/out of configured ratio — review coverage.",
    priority: model.PRIORITIES.URGENT,
    href: "today?section=ratios",
    source: model.TASK_SOURCES.RATIO,
    sourceRefId: outSnap.id,
    classroomId: primary.id,
    dedupeKey: `ratio-out-${primary.id}-${today}`,
  });
  model.upsertNotification(store, {
    organizationId: orgId,
    audience: "family",
    recipientEmail: "priya.lin@example.invalid",
    title: "Document requested",
    body: "A licensing/health document is needed (testing).",
    priority: model.PRIORITIES.TODAY,
    href: "licensing",
    source: model.TASK_SOURCES.LICENSING,
    childId: childIds.ben || "",
    dedupeKey: `family-lic-${childIds.ben || "x"}-${today}`,
  });
  model.upsertNotification(store, {
    organizationId: orgId,
    audience: "admin_only",
    adminOnly: true,
    title: "Admin-only staffing note",
    body: "Internal only — must not reach teachers/guardians.",
    priority: model.PRIORITIES.INFORMATIONAL,
    href: "today",
    source: model.TASK_SOURCES.STAFF,
    dedupeKey: `admin-only-${today}`,
  });

  store.todayHub.meta.phase15SeededFor = orgId;
  store.todayHub.meta.phase15Ids = ids;
  store.todayHub.meta.phase15ChildIds = childIds;
  store.todayHub.meta.primaryClassroomId = primary.id;
  store.todayHub.meta.secondaryClassroomId = secondary.id || "";
  store.todayHub.meta.scenarioLabels = [
    "home_daycare_compatible",
    "small_center",
    "multiple_classrooms",
    "normal_ratio",
    "near_ratio_limit",
    "out_of_ratio_warning",
    "absent_child",
    "late_child",
    "classroom_transfer",
    "authorized_pickup",
    "unauthorized_pickup_warning",
    "incomplete_daily_reports",
    "medication_task",
    "incident_awaiting_review",
    "expiring_documents_via_phase13_14",
    "enrollment_tour_via_phase12",
    "unread_message_via_phase11",
    "guardian_multi_child",
  ];
  store.todayHub.meta.updatedAt = model.nowIso();

  return { organizationId: orgId, alreadySeeded: false, ids, childIds, primaryClassroomId: primary.id };
}

function resetPhase15Preview(store, opts = {}) {
  model.ensureTodayHubStore(store);
  store.todayHub.attendance = {};
  store.todayHub.attendanceHistory = {};
  store.todayHub.ratioConfigs = {};
  store.todayHub.ratioHistory = {};
  store.todayHub.staffDuty = {};
  store.todayHub.incidents = {};
  store.todayHub.medicationTasks = {};
  store.todayHub.notifications = {};
  if (store.todayHub.meta) {
    delete store.todayHub.meta.phase15SeededFor;
    delete store.todayHub.meta.phase15Ids;
    delete store.todayHub.meta.phase15ChildIds;
    delete store.todayHub.meta.incompleteDailyReports;
  }
  return ensurePhase15Preview(store, opts);
}

module.exports = {
  ensurePhase15Preview,
  resetPhase15Preview,
};
