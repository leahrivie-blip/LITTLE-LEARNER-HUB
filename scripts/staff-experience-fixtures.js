/**
 * Phase 16 Staff Experience fixtures — resettable fake staff scenarios.
 */

const phase15 = require("./today-hub-fixtures.js");
const model = require("./staff-experience-data-model.js");
const foundation = require("./foundation-data-model.js");
const orgPermissions = require("./org-permissions.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensurePhase16Preview(store, { adminEmail = "phase16.owner@example.invalid", organizationId = "" } = {}) {
  model.ensureStaffExperienceStore(store);
  const seeded15 = phase15.ensurePhase15Preview(store, { adminEmail, organizationId });
  const orgId = seeded15.organizationId || organizationId;

  if (store.staffExperience.meta?.phase16SeededFor === orgId) {
    return {
      organizationId: orgId,
      alreadySeeded: true,
      ids: store.staffExperience.meta.phase16Ids || {},
    };
  }

  const staff = listValues(store.staffMemberships).filter((row) => row.organizationId === orgId);
  const owner = staff.find((row) => row.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER) || staff[0];
  const director = staff.find((row) => row.role === orgPermissions.ORG_ROLES.DIRECTOR) || owner;
  const teacher = staff.find((row) => row.role === orgPermissions.ORG_ROLES.LEAD_TEACHER);
  const assistants = staff.filter((row) => row.role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF);
  const assistantLimited = assistants[0];
  const classrooms = listValues(store.classrooms).filter((row) => row.organizationId === orgId);
  const primary = classrooms[0] || { id: "", name: "Primary Classroom" };
  const today = model.todayDate();
  const ids = {};

  // Broad-permission assistant (second or create)
  let assistantBroad = assistants[1];
  if (!assistantBroad) {
    assistantBroad = foundation.createStaffMembershipRecord({
      organizationId: orgId,
      userId: "phase16-assistant-broad",
      userEmail: "phase16.assistant.broad@example.invalid",
      displayName: "Phase 16 Broad Assistant",
      role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
      status: foundation.STAFF_STATUS.ACTIVE,
    });
    assistantBroad.preview = true;
    store.staffMemberships[assistantBroad.id] = assistantBroad;
    const assignment = foundation.createClassroomStaffAssignmentRecord({
      organizationId: orgId,
      classroomId: primary.id,
      staffMembershipId: assistantBroad.id,
      userId: assistantBroad.userId,
    });
    store.classroomStaffAssignments = store.classroomStaffAssignments || {};
    store.classroomStaffAssignments[assignment.id] = assignment;
    store.assistantPermissionOverrides = store.assistantPermissionOverrides || {};
    const overrideId = model.newId("assto");
    store.assistantPermissionOverrides[overrideId] = {
      id: overrideId,
      organizationId: orgId,
      staffMembershipId: assistantBroad.id,
      permissions: {
        createDailyLogs: true,
        editDailyLogs: true,
        viewChildProfiles: true,
        viewMedicalAndAllergyInformation: true,
        viewEmergencyInformation: true,
        createObservations: true,
      },
      testingOnly: true,
      phase16: true,
    };
    ids.assistantBroadOverrideId = overrideId;
  }
  ids.assistantBroadId = assistantBroad.id;
  if (assistantLimited) ids.assistantLimitedId = assistantLimited.id;

  // Substitute membership
  const substitute = foundation.createStaffMembershipRecord({
    organizationId: orgId,
    userId: "phase16-substitute",
    userEmail: "phase16.substitute@example.invalid",
    displayName: "Phase 16 Substitute",
    role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
    status: foundation.STAFF_STATUS.ACTIVE,
  });
  substitute.preview = true;
  store.staffMemberships[substitute.id] = substitute;
  ids.substituteMembershipId = substitute.id;

  // Onboarding new staff
  const onboardingMember = foundation.createStaffMembershipRecord({
    organizationId: orgId,
    userId: "phase16-onboarding",
    userEmail: "phase16.onboarding@example.invalid",
    displayName: "Phase 16 New Hire",
    role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
    status: foundation.STAFF_STATUS.INVITATION_PENDING,
  });
  onboardingMember.preview = true;
  store.staffMemberships[onboardingMember.id] = onboardingMember;
  ids.onboardingMembershipId = onboardingMember.id;

  // On leave
  const onLeave = foundation.createStaffMembershipRecord({
    organizationId: orgId,
    userId: "phase16-onleave",
    userEmail: "phase16.onleave@example.invalid",
    displayName: "Phase 16 On Leave",
    role: orgPermissions.ORG_ROLES.LEAD_TEACHER,
    status: foundation.STAFF_STATUS.INACTIVE,
  });
  onLeave.preview = true;
  store.staffMemberships[onLeave.id] = onLeave;
  ids.onLeaveMembershipId = onLeave.id;

  // Offboarded
  const offboarded = foundation.createStaffMembershipRecord({
    organizationId: orgId,
    userId: "phase16-offboarded",
    userEmail: "phase16.offboarded@example.invalid",
    displayName: "Phase 16 Offboarded",
    role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
    status: foundation.STAFF_STATUS.DEACTIVATED,
    deactivatedAt: `${today}T12:00:00.000Z`,
    deactivationReason: "Ended employment (FAKE)",
  });
  offboarded.preview = true;
  store.staffMemberships[offboarded.id] = offboarded;
  ids.offboardedMembershipId = offboarded.id;

  function addProfile(member, directoryStatus, extra = {}) {
    const profile = model.createStaffProfile({
      organizationId: orgId,
      membershipId: member.id,
      displayName: member.displayName || member.userEmail,
      email: member.userEmail,
      role: member.role,
      directoryStatus,
      hireDate: extra.hireDate || "2024-01-15",
      startDate: extra.startDate || "2024-02-01",
      endDate: extra.endDate || "",
      isSubstitute: extra.isSubstitute === true,
      onDuty: extra.onDuty === true,
      permissionGroup: extra.permissionGroup || "default",
      emergencyContactName: "Emergency Contact (FAKE)",
      emergencyContactPhone: "555-0100",
    });
    store.staffExperience.profiles[profile.id] = profile;
    return profile;
  }

  const ownerProfile = addProfile(owner, model.DIRECTORY_STATUSES.ACTIVE, { permissionGroup: "owner", onDuty: true });
  ids.ownerProfileId = ownerProfile.id;
  if (director && director.id !== owner.id) {
    ids.directorProfileId = addProfile(director, model.DIRECTORY_STATUSES.ACTIVE, { permissionGroup: "director" }).id;
  }
  if (teacher) {
    ids.teacherProfileId = addProfile(teacher, model.DIRECTORY_STATUSES.ACTIVE, { permissionGroup: "lead_teacher", onDuty: true }).id;
  }
  if (assistantLimited) {
    ids.assistantLimitedProfileId = addProfile(assistantLimited, model.DIRECTORY_STATUSES.ACTIVE, { permissionGroup: "assistant_limited" }).id;
  }
  ids.assistantBroadProfileId = addProfile(assistantBroad, model.DIRECTORY_STATUSES.ACTIVE, { permissionGroup: "assistant_broad" }).id;
  ids.substituteProfileId = addProfile(substitute, model.DIRECTORY_STATUSES.SUBSTITUTE, { isSubstitute: true, permissionGroup: "substitute" }).id;
  const onboardingProfile = addProfile(onboardingMember, model.DIRECTORY_STATUSES.ONBOARDING, { hireDate: today, startDate: "" });
  ids.onboardingProfileId = onboardingProfile.id;
  ids.onLeaveProfileId = addProfile(onLeave, model.DIRECTORY_STATUSES.ON_LEAVE).id;
  ids.offboardedProfileId = addProfile(offboarded, model.DIRECTORY_STATUSES.ENDED, { endDate: today }).id;

  // Invited invitation template (stored, not sent)
  const invite = {
    id: model.newId("sxinv"),
    organizationId: orgId,
    membershipId: onboardingMember.id,
    email: onboardingMember.userEmail,
    templateStored: true,
    externalSendDisabled: true,
    body: "Welcome to the program (FAKE invitation template — not sent).",
    testingOnly: true,
  };
  store.staffExperience.invitations[invite.id] = invite;
  ids.invitationId = invite.id;

  const checklist = model.createOnboardingChecklist({
    organizationId: orgId,
    membershipId: onboardingMember.id,
    profileId: onboardingProfile.id,
    status: "in_progress",
    steps: {
      staff_information: { complete: true, completedAt: nowIsoSafe() },
      emergency_contact: { complete: true, completedAt: nowIsoSafe() },
      employment_forms: { complete: false },
      background_check: { complete: false, note: "Pending (FAKE)" },
      orientation: { complete: false },
    },
  });
  store.staffExperience.onboardingChecklists[checklist.id] = checklist;
  ids.onboardingChecklistId = checklist.id;

  // Schedule + shifts
  const schedule = model.createSchedule({
    organizationId: orgId,
    weekStart: today,
    status: model.SCHEDULE_STATUSES.PUBLISHED_TESTING,
    title: "Week schedule (FAKE testing)",
    publishedAt: `${today}T06:00:00.000Z`,
  });
  store.staffExperience.schedules[schedule.id] = schedule;
  model.appendScheduleHistory(store, schedule, {
    action: "publish_testing",
    actorEmail: adminEmail,
    detail: "Published in testing — no external notifications",
  });
  ids.scheduleId = schedule.id;

  if (teacher) {
    const shift = model.createShift({
      organizationId: orgId,
      scheduleId: schedule.id,
      membershipId: teacher.id,
      classroomId: primary.id,
      date: today,
      startTime: "07:45",
      endTime: "16:00",
      openingShift: true,
      recurring: true,
      requiredQualifications: ["CPR"],
    });
    store.staffExperience.shifts[shift.id] = shift;
    ids.teacherShiftId = shift.id;
  }

  // Coverage gap shift (unfilled)
  const gapShift = model.createShift({
    organizationId: orgId,
    scheduleId: schedule.id,
    membershipId: "",
    classroomId: primary.id,
    date: today,
    startTime: "15:00",
    endTime: "18:00",
    closingShift: true,
    coverageGap: true,
    requiredQualifications: ["CPR", "First aid"],
  });
  store.staffExperience.shifts[gapShift.id] = gapShift;
  ids.coverageGapShiftId = gapShift.id;

  // Coverage suggestion — available qualified substitute (director action required)
  const suggestion = {
    id: model.newId("sxcov"),
    organizationId: orgId,
    shiftId: gapShift.id,
    suggestedMembershipId: substitute.id,
    reason: "Qualified available substitute (FAKE) — requires director action; never auto-moved",
    autoApplied: false,
    testingOnly: true,
  };
  store.staffExperience.coverageSuggestions[suggestion.id] = suggestion;
  ids.coverageSuggestionId = suggestion.id;

  // Availability
  if (teacher) {
    const avail = model.createAvailability({
      organizationId: orgId,
      membershipId: teacher.id,
      weekday: "monday",
      startTime: "07:00",
      endTime: "18:00",
    });
    store.staffExperience.availability[avail.id] = avail;
    ids.teacherAvailabilityId = avail.id;
  }
  const subAvail = model.createAvailability({
    organizationId: orgId,
    membershipId: substitute.id,
    weekday: "monday",
    startTime: "12:00",
    endTime: "19:00",
  });
  store.staffExperience.availability[subAvail.id] = subAvail;

  // Time-off request
  if (teacher) {
    const timeOff = model.createTimeOffRequest({
      organizationId: orgId,
      membershipId: teacher.id,
      startDate: today,
      endDate: today,
      status: model.TIME_OFF_STATUSES.PENDING,
      staffNote: "Personal appointment (FAKE)",
    });
    model.appendTimeOffDecision(timeOff, { action: "submitted", actorEmail: teacher.userEmail, note: "Submitted" });
    store.staffExperience.timeOffRequests[timeOff.id] = timeOff;
    ids.timeOffRequestId = timeOff.id;
  }

  // Time clock: teacher clocked in; missed punch + correction for assistant
  if (teacher) {
    const clockIn = model.createTimeEntry({
      organizationId: orgId,
      membershipId: teacher.id,
      type: model.TIME_ENTRY_TYPES.CLOCK_IN,
      at: `${today}T07:50:00.000Z`,
      classroomId: primary.id,
    });
    store.staffExperience.timeEntries[clockIn.id] = clockIn;
    model.appendTimeHistory(store, clockIn, { action: "clock_in", actorEmail: teacher.userEmail });
    ids.teacherClockInId = clockIn.id;
  }
  if (assistantLimited) {
    const missed = model.createTimeEntry({
      organizationId: orgId,
      membershipId: assistantLimited.id,
      type: model.TIME_ENTRY_TYPES.MISSED_PUNCH,
      at: `${today}T08:00:00.000Z`,
      classroomId: primary.id,
      missedPunch: true,
      correctionPending: true,
      note: "Forgot to clock in (FAKE)",
    });
    store.staffExperience.timeEntries[missed.id] = missed;
    model.appendTimeHistory(store, missed, { action: "missed_punch", actorEmail: assistantLimited.userEmail });
    ids.missedPunchId = missed.id;
    const correction = model.createCorrectionRequest({
      organizationId: orgId,
      membershipId: assistantLimited.id,
      timeEntryId: missed.id,
      reason: "Missed morning clock-in (FAKE)",
      requestedType: model.TIME_ENTRY_TYPES.CLOCK_IN,
      status: "pending",
    });
    store.staffExperience.correctionRequests[correction.id] = correction;
    ids.correctionRequestId = correction.id;
  }

  // Qualifications / training / certifications
  if (teacher) {
    const qual = model.createQualification({
      organizationId: orgId,
      membershipId: teacher.id,
      title: "Lead Teacher credential (FAKE)",
      category: "credential",
      verified: true,
    });
    store.staffExperience.qualifications[qual.id] = qual;
    ids.teacherQualificationId = qual.id;

    const cpr = model.createCertification({
      organizationId: orgId,
      membershipId: teacher.id,
      title: "CPR Certification (FAKE)",
      category: "CPR",
      issuedAt: "2025-01-01",
      expiresAt: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
      licensingRequirementKey: "staff_cpr",
      status: model.TRAINING_STATUSES.EXPIRING_SOON,
    });
    store.staffExperience.certifications[cpr.id] = cpr;
    ids.expiringCprId = cpr.id;

    const training = model.createTraining({
      organizationId: orgId,
      membershipId: teacher.id,
      title: "Mandated reporting (FAKE)",
      category: "Mandated reporting",
      completionDate: "2025-06-01",
      hours: 2,
      status: model.TRAINING_STATUSES.VERIFIED,
      directorVerified: true,
    });
    store.staffExperience.trainings[training.id] = training;
    ids.teacherTrainingId = training.id;
  }

  if (assistantLimited) {
    const missing = model.createTraining({
      organizationId: orgId,
      membershipId: assistantLimited.id,
      title: "Safe sleep (FAKE)",
      category: "Safe sleep",
      status: model.TRAINING_STATUSES.MISSING,
      requiredByRole: "assistant_staff",
    });
    store.staffExperience.trainings[missing.id] = missing;
    ids.missingTrainingId = missing.id;
  }

  // Private director notes (must not leak)
  if (teacher) {
    const note = model.createPrivateNote({
      organizationId: orgId,
      membershipId: teacher.id,
      type: model.PRIVATE_NOTE_TYPES.COACHING,
      title: "Coaching check-in (FAKE PRIVATE)",
      body: "Director-only coaching note — must not appear in directory or Family Hub.",
      createdByEmail: adminEmail,
      followUpDate: today,
    });
    store.staffExperience.privateNotes[note.id] = note;
    ids.privateNoteId = note.id;
  }

  // Offboarding record
  const offRec = model.createOffboardingRecord({
    organizationId: orgId,
    membershipId: offboarded.id,
    endDate: today,
    reasonCategory: "resignation",
    finalShiftDate: today,
    returnPropertyChecklist: ["keys", "badge"],
    openTasksCleared: true,
    classroomReassigned: true,
    conversationReassigned: true,
    accessEndedAt: `${today}T12:00:00.000Z`,
  });
  store.staffExperience.offboardingRecords[offRec.id] = offRec;
  ids.offboardingRecordId = offRec.id;

  // Sync duty from clock into Today Hub ratios
  model.syncDutyFromClock(store, orgId);

  store.staffExperience.meta.phase16SeededFor = orgId;
  store.staffExperience.meta.phase16Ids = ids;
  store.staffExperience.meta.scenarioLabels = [
    "owner",
    "director",
    "lead_teacher",
    "teacher",
    "broad_permission_assistant",
    "limited_assistant",
    "substitute",
    "new_staff_onboarding",
    "staff_on_leave",
    "expiring_cpr",
    "missing_training",
    "missed_punch",
    "time_correction",
    "time_off_request",
    "coverage_gap",
    "qualified_available_substitute",
    "offboarded_staff",
  ];
  store.staffExperience.meta.updatedAt = model.nowIso();

  return { organizationId: orgId, alreadySeeded: false, ids };
}

function nowIsoSafe() {
  return new Date().toISOString();
}

function resetPhase16Preview(store, opts = {}) {
  model.ensureStaffExperienceStore(store);
  for (const key of Object.keys(store.staffExperience)) {
    if (key === "meta") continue;
    store.staffExperience[key] = {};
  }
  if (store.staffExperience.meta) {
    delete store.staffExperience.meta.phase16SeededFor;
    delete store.staffExperience.meta.phase16Ids;
  }
  return ensurePhase16Preview(store, opts);
}

module.exports = {
  ensurePhase16Preview,
  resetPhase16Preview,
};
