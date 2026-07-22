"use strict";

const foundation = require("./foundation-data-model.js");
const orgPermissions = require("./org-permissions.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function nowIso() {
  return new Date().toISOString();
}

function mondayIsoDate(input) {
  const raw = String(input || "").trim();
  const date = raw ? new Date(`${raw.slice(0, 10)}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) return mondayIsoDate("");
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function completeSnapshot(snapshot, fallback) {
  const next = snapshot && typeof snapshot === "object" ? snapshot : {};
  const weekly = next.weekly && typeof next.weekly === "object" ? next.weekly : {};
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  days.forEach((day, index) => {
    const label = fallback || `Preview day ${index + 1}`;
    const source = weekly[day] && typeof weekly[day] === "object" ? weekly[day] : {};
    weekly[day] = {
      dailyTheme: source.dailyTheme || label,
      circleTime: source.circleTime || `${label} circle time`,
      activity1: source.activity1 || `${label} small group`,
      activity2: source.activity2 || `${label} sensory play`,
      activity3: source.activity3 || `${label} creative work`,
      outdoorPlay: source.outdoorPlay || `${label} outdoor movement`,
      bookOfTheDay: source.bookOfTheDay || `${label} read-aloud`,
      materials: source.materials || "Preview classroom materials",
      teacherNotes: source.teacherNotes || "Adapt for your children and licensing needs.",
    };
  });
  next.weekly = weekly;
  next.lessonPlanTitle = next.lessonPlanTitle || fallback || "Preview Lesson Plan";
  next.capturedAt = next.capturedAt || nowIso();
  return next;
}

function previewLessonForRoom(room, index) {
  const themes = [
    "Community Helpers",
    "Garden Discoveries",
    "Ocean Friends",
    "Building Together",
    "Weather Watchers",
  ];
  const title = `${themes[index % themes.length]} - ${room.name || "Classroom"}`;
  const dailyPlans = {};
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day, dayIndex) => {
    const dayTitle = `${title} Day ${dayIndex + 1}`;
    dailyPlans[day] = {
      theme: dayTitle,
      circleTime: `${dayTitle} discussion`,
      activities: [
        { title: `${dayTitle} art invitation` },
        { title: `${dayTitle} table activity` },
        { title: `${dayTitle} music and movement` },
      ],
      outdoorPlay: `${dayTitle} gross motor game`,
      books: [`${themes[index % themes.length]} picture book`],
      materials: "Books, music, manipulatives, art supplies",
      teacherNotes: "Preview snapshot captured for classroom editing.",
    };
  });
  return {
    id: `phase3-preview-lesson-${index + 1}`,
    title,
    lessonPlanTitle: title,
    ageGroup: room.ageGroupDefault || "",
    theme: themes[index % themes.length],
    materials: "Books, music, manipulatives, art supplies",
    dailyPlans,
  };
}

function activeStatus(value) {
  return !value || value === foundation.ASSIGNMENT_STATUS.ACTIVE || value === foundation.STAFF_STATUS.ACTIVE;
}

function activeClassrooms(store, organizationId) {
  return listValues(store.classrooms).filter((room) => (
    room
    && room.organizationId === organizationId
    && room.status === foundation.ASSIGNMENT_STATUS.ACTIVE
  ));
}

function childClassroomId(store, organizationId, childId) {
  const assignment = listValues(store.classroomChildAssignments).find((row) => (
    row
    && row.organizationId === organizationId
    && row.childId === childId
    && activeStatus(row.status)
    && !row.endsAt
  ));
  return assignment ? assignment.classroomId : "";
}

function assignedClassroomIdsForMembership(store, organizationId, membershipId) {
  return listValues(store.classroomStaffAssignments)
    .filter((row) => (
      row
      && row.organizationId === organizationId
      && row.staffMembershipId === membershipId
      && activeStatus(row.status)
      && !row.endsAt
    ))
    .map((row) => row.classroomId);
}

function clearPhase3PreviewRows(store, organizationId) {
  const previousForeignOrgId = store.phase3Meta && store.phase3Meta.foreignOrgId ? store.phase3Meta.foreignOrgId : "";
  const keys = [
    "classroomWeekAssignments",
    "classroomCalendarEvents",
    "previewDailyLogs",
    "previewObservations",
    "previewGoals",
    "previewChildProfiles",
    "assistantPermissionOverrides",
  ];
  keys.forEach((key) => {
    Object.keys(store[key] || {}).forEach((id) => {
      const row = store[key][id];
      if (!row || row.preview !== true) return;
      if (row.organizationId === organizationId || row.organizationId === previousForeignOrgId) {
        delete store[key][id];
        return;
      }
      if (row.organizationId && !store.organizations[row.organizationId]) {
        delete store[key][id];
      }
    });
  });
  if (previousForeignOrgId && store.organizations && store.organizations[previousForeignOrgId]) {
    delete store.organizations[previousForeignOrgId];
  }
  ["classrooms", "childRecords", "classroomChildAssignments"].forEach((key) => {
    Object.keys(store[key] || {}).forEach((id) => {
      const row = store[key][id];
      if (row && row.preview === true && row.organizationId === previousForeignOrgId) {
        delete store[key][id];
      }
    });
  });
}

function ensureSingleClassroomLead(store, organizationId, owner) {
  const rooms = activeClassrooms(store, organizationId);
  if (!rooms.length) return null;
  const leads = listValues(store.staffMemberships).filter((member) => (
    member
    && member.organizationId === organizationId
    && member.role === orgPermissions.ORG_ROLES.LEAD_TEACHER
    && member.status === foundation.STAFF_STATUS.ACTIVE
  ));
  for (const lead of leads) {
    if (assignedClassroomIdsForMembership(store, organizationId, lead.id).length === 1) return lead;
  }
  const lead = foundation.createStaffMembershipRecord({
    organizationId,
    userId: "preview-single-classroom-lead",
    userEmail: "preview.single.lead@example.test",
    displayName: "Single Classroom Lead",
    role: orgPermissions.ORG_ROLES.LEAD_TEACHER,
    status: foundation.STAFF_STATUS.ACTIVE,
    invitedByUserId: owner && owner.userId ? owner.userId : "",
    lastActiveAt: nowIso(),
  });
  lead.preview = true;
  store.staffMemberships[lead.id] = lead;
  const assignment = foundation.createClassroomStaffAssignmentRecord({
    organizationId,
    classroomId: rooms[0].id,
    staffMembershipId: lead.id,
    userId: lead.userId,
  });
  assignment.preview = true;
  store.classroomStaffAssignments[assignment.id] = assignment;
  return lead;
}

function expandPhase3Fixtures(store, { organizationId = "", owner = null } = {}) {
  foundation.ensurePhase3Store(store);
  const org = store.organizations && store.organizations[organizationId] ? store.organizations[organizationId] : null;
  if (!org) {
    return {
      ok: false,
      expanded: false,
      error: "Preview organization was not found.",
      organizationId,
      foreignOrgId: "",
      counts: {},
    };
  }

  clearPhase3PreviewRows(store, organizationId);

  const rooms = activeClassrooms(store, organizationId);
  const children = listValues(store.childRecords).filter((child) => child && child.organizationId === organizationId);
  const ownerMembership = owner || listValues(store.staffMemberships).find((member) => (
    member
    && member.organizationId === organizationId
    && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
  )) || null;
  const actorUserId = ownerMembership && ownerMembership.userId ? ownerMembership.userId : `admin:${org.ownerEmail || "preview"}`;
  const actorMembershipId = ownerMembership && ownerMembership.id ? ownerMembership.id : "";
  const weekStart = mondayIsoDate();

  ensureSingleClassroomLead(store, organizationId, ownerMembership);

  children.forEach((child, index) => {
    const profile = foundation.createPreviewChildProfileRecord({
      organizationId,
      childId: child.id,
      displayName: child.displayName,
      ageGroup: child.ageGroup || ["Infant", "Toddler", "Preschool"][index % 3],
      overview: `${child.displayName} is part of the Phase 3 preview data set.`,
      familyEmergencyContacts: [
        { name: `Guardian ${index + 1}`, phone: `(555) 010-${String(3000 + index).slice(-4)}`, relationship: "Parent/Guardian" },
      ],
      medicalInformation: {
        notes: index % 3 === 0 ? "Food allergy care plan on file." : "No medical notes in preview.",
        requiresCareAccess: true,
      },
      allergies: {
        list: index % 3 === 0 ? ["Preview allergy note"] : [],
        requiresCareAccess: true,
      },
      authorizedPickup: {
        people: [
          { name: `Authorized Pickup ${index + 1}`, relationship: "Family Friend", phone: `(555) 010-${String(4000 + index).slice(-4)}` },
        ],
        requiresCareAccess: true,
      },
      documentsAndForms: [
        { id: `preview-form-${index + 1}`, label: "Enrollment form", status: "complete" },
      ],
    });
    store.previewChildProfiles[profile.id] = profile;
  });

  rooms.forEach((room, index) => {
    const lesson = previewLessonForRoom(room, index);
    const snapshot = completeSnapshot(
      foundation.buildWeekSnapshotFromLesson(lesson, room.ageGroupDefault || ""),
      lesson.title
    );
    const assignment = foundation.createClassroomWeekAssignmentRecord({
      organizationId,
      classroomId: room.id,
      lessonPlanId: lesson.id,
      weekStartDate: weekStart,
      ageGroup: room.ageGroupDefault || "",
      classroomLabel: room.name || "",
      assignedByUserId: actorUserId,
      snapshot,
    });
    store.classroomWeekAssignments[assignment.id] = assignment;

    [
      { offset: 0, title: "Welcome circle and curriculum kickoff", type: "lesson_focus" },
      { offset: 2, title: "Classroom music and movement", type: "classroom_event" },
      { offset: 4, title: "Family note prep - preview only", type: "family_connection_prep" },
    ].forEach((eventSpec) => {
      const event = foundation.createClassroomCalendarEventRecord({
        organizationId,
        classroomId: room.id,
        date: addDays(weekStart, eventSpec.offset),
        title: eventSpec.title,
        type: eventSpec.type,
        notes: `${room.name || "Classroom"} Phase 3 preview event.`,
        createdByUserId: actorUserId,
      });
      store.classroomCalendarEvents[event.id] = event;
    });
  });

  const assignedChildren = children.filter((child) => childClassroomId(store, organizationId, child.id));
  const groupBatchId = foundation.newId("group");
  assignedChildren.slice(0, 2).forEach((child) => {
    const classroomId = childClassroomId(store, organizationId, child.id);
    const log = foundation.createPreviewDailyLogRecord({
      organizationId,
      classroomId,
      childId: child.id,
      staffMembershipId: actorMembershipId,
      staffUserId: actorUserId,
      date: weekStart,
      attendance: "present",
      meals: "Lunch and snack served",
      activities: "Participated in group preview activity",
      mood: "Engaged",
      teacherNotes: "Created from a Phase 3 group daily log.",
      groupBatchId,
    });
    store.previewDailyLogs[log.id] = log;
  });

  assignedChildren.slice(2, 5).forEach((child, index) => {
    const classroomId = childClassroomId(store, organizationId, child.id);
    const log = foundation.createPreviewDailyLogRecord({
      organizationId,
      classroomId,
      childId: child.id,
      staffMembershipId: actorMembershipId,
      staffUserId: actorUserId,
      date: addDays(weekStart, index + 1),
      attendance: "present",
      activities: "Completed individual preview activity",
      mood: ["Curious", "Calm", "Busy"][index % 3],
      teacherNotes: "Individual Phase 3 preview daily log.",
    });
    store.previewDailyLogs[log.id] = log;
  });

  assignedChildren.slice(0, 4).forEach((child, index) => {
    const classroomId = childClassroomId(store, organizationId, child.id);
    const observation = foundation.createPreviewObservationRecord({
      organizationId,
      classroomId,
      childId: child.id,
      staffMembershipId: actorMembershipId,
      staffUserId: actorUserId,
      date: addDays(weekStart, index),
      text: `${child.displayName} demonstrated engagement during a Phase 3 preview learning moment.`,
      learningDomains: [
        foundation.LEARNING_DOMAINS[index % foundation.LEARNING_DOMAINS.length],
        foundation.LEARNING_DOMAINS[(index + 1) % foundation.LEARNING_DOMAINS.length],
      ],
      activityOrLessonPlanId: `phase3-preview-lesson-${(index % Math.max(1, rooms.length)) + 1}`,
      sharingStatus: index === 0
        ? foundation.SHARING_STATUS.WAITING_DIRECTOR_REVIEW
        : foundation.SHARING_STATUS.PRIVATE_STAFF,
    });
    store.previewObservations[observation.id] = observation;
  });

  assignedChildren.slice(0, 3).forEach((child, index) => {
    const classroomId = childClassroomId(store, organizationId, child.id);
    const goal = foundation.createPreviewGoalRecord({
      organizationId,
      classroomId,
      childId: child.id,
      createdByUserId: actorUserId,
      createdByMembershipId: actorMembershipId,
      learningDomain: foundation.LEARNING_DOMAINS[(index + 2) % foundation.LEARNING_DOMAINS.length],
      description: `${child.displayName} will build confidence with preview classroom routines.`,
      targetOrNextStep: "Offer one scaffolded practice opportunity during centers.",
      progressNotes: [
        {
          id: foundation.newId("gprog"),
          date: addDays(weekStart, index + 1),
          text: "Preview progress note: responded well to teacher support.",
          createdByUserId: actorUserId,
          createdByMembershipId: actorMembershipId,
          createdAt: nowIso(),
        },
      ],
    });
    store.previewGoals[goal.id] = goal;
  });

  const assistants = listValues(store.staffMemberships).filter((member) => (
    member
    && member.organizationId === organizationId
    && member.role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF
    && member.status === foundation.STAFF_STATUS.ACTIVE
  ));
  if (assistants[0]) {
    const permissive = foundation.createAssistantPermissionOverrideRecord({
      organizationId,
      staffMembershipId: assistants[0].id,
      updatedByUserId: actorUserId,
      permissions: {
        viewChildProfiles: true,
        viewEmergencyInformation: true,
        viewMedicalAndAllergyInformation: true,
        createDailyLogs: true,
        createObservations: true,
        addPhotos: true,
        viewGoals: true,
        addGoalProgress: true,
        viewClassroomCalendars: true,
        addCalendarEvents: true,
        editClassroomLessonPlanCopies: true,
      },
    });
    store.assistantPermissionOverrides[permissive.id] = permissive;
  }
  if (assistants[1]) {
    const denied = foundation.createAssistantPermissionOverrideRecord({
      organizationId,
      staffMembershipId: assistants[1].id,
      updatedByUserId: actorUserId,
      permissions: foundation.defaultAssistantPermissions(false),
    });
    store.assistantPermissionOverrides[denied.id] = denied;
  }

  const foreignOrg = foundation.createOrganizationRecord({
    accountType: foundation.ACCOUNT_TYPES.CENTER,
    ownerEmail: "foreign.preview.owner@example.test",
    name: "Foreign Preview Center",
  });
  foreignOrg.preview = true;
  foreignOrg.phase3ForeignOrg = true;
  store.organizations[foreignOrg.id] = foreignOrg;
  const foreignRoom = foundation.createClassroomRecord({
    organizationId: foreignOrg.id,
    name: "Foreign Room",
    ageGroupDefault: "Preschool",
    createdByUserId: "foreign-preview-owner",
  });
  foreignRoom.preview = true;
  store.classrooms[foreignRoom.id] = foreignRoom;
  const foreignChild = foundation.createChildRecord({
    organizationId: foreignOrg.id,
    displayName: "Foreign Preview Child",
    legacyChildId: "foreign-preview-child",
  });
  foreignChild.preview = true;
  store.childRecords[foreignChild.id] = foreignChild;
  const foreignAssignment = foundation.createClassroomChildAssignmentRecord({
    organizationId: foreignOrg.id,
    classroomId: foreignRoom.id,
    childId: foreignChild.id,
    assignedByUserId: "foreign-preview-owner",
  });
  foreignAssignment.preview = true;
  store.classroomChildAssignments[foreignAssignment.id] = foreignAssignment;

  const report = {
    ok: true,
    expanded: true,
    organizationId,
    ownerMembershipId: actorMembershipId,
    weekStartDate: weekStart,
    foreignOrgId: foreignOrg.id,
    foreignClassroomId: foreignRoom.id,
    foreignChildId: foreignChild.id,
    groupBatchId,
    counts: {
      childProfiles: listValues(store.previewChildProfiles).filter((row) => row.organizationId === organizationId).length,
      weekAssignments: listValues(store.classroomWeekAssignments).filter((row) => row.organizationId === organizationId).length,
      calendarEvents: listValues(store.classroomCalendarEvents).filter((row) => row.organizationId === organizationId).length,
      dailyLogs: listValues(store.previewDailyLogs).filter((row) => row.organizationId === organizationId).length,
      observations: listValues(store.previewObservations).filter((row) => row.organizationId === organizationId).length,
      goals: listValues(store.previewGoals).filter((row) => row.organizationId === organizationId).length,
      assistantPermissionOverrides: listValues(store.assistantPermissionOverrides).filter((row) => row.organizationId === organizationId).length,
    },
    notes: [
      "Preview-only Phase 3 data expanded after Director Center fixtures.",
      "Foreign org/classroom/child are included for cross-organization denial tests.",
      "Family sharing remains disabled for observations.",
    ],
  };

  store.phase3Meta.schemaVersion = 3;
  store.phase3Meta.updatedAt = nowIso();
  store.phase3Meta.previewOrganizationId = organizationId;
  store.phase3Meta.foreignOrgId = foreignOrg.id;
  store.phase3Meta.lastSeedReport = report;
  return report;
}

module.exports = {
  expandPhase3Fixtures,
  mondayIsoDate,
};
