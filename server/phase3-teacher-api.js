"use strict";

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const fixtures = require("../scripts/director-center-preview-fixtures.js");
const phase3Seed = require("../scripts/phase3-seed-expand.js");

const PHASE3_PREFIX = "/api/director-center/phase3";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function nowIso() {
  return new Date().toISOString();
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function activeStatus(value) {
  return !value || value === foundation.ASSIGNMENT_STATUS.ACTIVE || value === foundation.STAFF_STATUS.ACTIVE;
}

function isActiveClassroom(room) {
  return room && room.status === foundation.ASSIGNMENT_STATUS.ACTIVE;
}

function mondayIsoDate(input) {
  return phase3Seed.mondayIsoDate(input);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function getHeader(request, name) {
  const key = String(name || "").toLowerCase();
  const headers = request && request.headers ? request.headers : {};
  if (headers && typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(key) || "").trim();
  }
  if (headers && Object.prototype.hasOwnProperty.call(headers, key)) {
    return String(headers[key] || "").trim();
  }
  const found = Object.keys(headers || {}).find((headerName) => headerName.toLowerCase() === key);
  return found ? String(headers[found] || "").trim() : "";
}

function productionSiteFromUrl(siteUrl) {
  const value = String(siteUrl || "").toLowerCase();
  if (!value) return false;
  return value.indexOf(PRODUCTION_HOST) !== -1;
}

function fallbackExpansionEnvironment() {
  const siteUrl = String(process.env.SITE_URL || "");
  const liveProduction = productionSiteFromUrl(siteUrl);
  return {
    liveProduction,
    allowDirectorCenterAdminPreview: !liveProduction && truthy(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW),
    siteUrl,
  };
}

function previewHeaderAllowed(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try {
      env = expansionEnvironment();
    } catch (error) {
      env = null;
    }
  }
  if (!env || typeof env !== "object") env = fallbackExpansionEnvironment();
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const production = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    allowed: env.allowDirectorCenterAdminPreview === true && !production,
    environment: {
      liveProduction: production,
      allowDirectorCenterAdminPreview: env.allowDirectorCenterAdminPreview === true,
      siteUrl,
    },
  };
}

function findPreviewOrg(store, adminEmail) {
  const email = String(adminEmail || "").trim().toLowerCase();
  return listValues(store.organizations).find((org) => (
    org && org.preview === true && String(org.ownerEmail || "").trim().toLowerCase() === email
  )) || null;
}

function findProgramProfile(store, organizationId) {
  return listValues(store.programProfiles).find((row) => row && row.organizationId === organizationId) || null;
}

function findOwnerMembership(store, organizationId, adminEmail) {
  const email = String(adminEmail || "").trim().toLowerCase();
  return listValues(store.staffMemberships).find((member) => (
    member
    && member.organizationId === organizationId
    && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
    && (!email || String(member.userEmail || "").trim().toLowerCase() === email)
    && member.status === foundation.STAFF_STATUS.ACTIVE
  )) || listValues(store.staffMemberships).find((member) => (
    member
    && member.organizationId === organizationId
    && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
    && member.status === foundation.STAFF_STATUS.ACTIVE
  )) || null;
}

function actorFromMembership(member) {
  if (!member) {
    return { userId: "", email: "", role: "", membershipId: "", staffMembershipId: "" };
  }
  return {
    userId: member.userId || "",
    email: member.userEmail || "",
    role: member.role || "",
    membershipId: member.id || "",
    staffMembershipId: member.id || "",
    displayName: member.displayName || "",
  };
}

function ensurePreview(store, adminEmail, scenario) {
  foundation.ensurePhase3Store(store);
  let org = findPreviewOrg(store, adminEmail);
  let seeded = false;
  let seedResult = null;
  if (!org || scenario) {
    seedResult = fixtures.seedPreviewSuite(store, {
      adminEmail,
      scenario: scenario || (store.directorCenterPreview && store.directorCenterPreview.scenario) || "small_center",
    });
    foundation.ensurePhase3Store(store);
    org = findPreviewOrg(store, adminEmail);
    seeded = true;
  }
  const owner = org ? findOwnerMembership(store, org.id, adminEmail) : null;
  return {
    organization: org,
    programProfile: org ? findProgramProfile(store, org.id) : null,
    owner: owner || (seedResult && seedResult.owner) || null,
    seeded,
    seedResult,
  };
}

function resolveActor(store, request, organizationId, adminEmail, ownerMembership, expansionEnvironment) {
  const owner = ownerMembership || findOwnerMembership(store, organizationId, adminEmail);
  const ownerActor = actorFromMembership(owner);
  const policy = previewHeaderAllowed(expansionEnvironment);
  const requested = getHeader(request, "x-llh-role-preview-membership-id");
  const meta = {
    enabled: policy.allowed,
    requestedMembershipId: requested,
    active: false,
    reason: requested ? "not_applied" : "not_requested",
    membershipId: "",
    displayName: "",
    role: "",
    environment: policy.environment,
  };

  if (!requested) {
    return { actor: ownerActor, membership: owner, rolePreview: meta };
  }
  if (!policy.allowed) {
    meta.reason = "preview_header_disabled";
    return { actor: ownerActor, membership: owner, rolePreview: meta };
  }
  const member = store.staffMemberships && store.staffMemberships[requested] ? store.staffMemberships[requested] : null;
  if (!member || member.organizationId !== organizationId) {
    meta.reason = "membership_not_found";
    return { actor: ownerActor, membership: owner, rolePreview: meta };
  }
  meta.active = true;
  meta.reason = "ok";
  meta.membershipId = member.id;
  meta.displayName = member.displayName || "";
  meta.role = member.role || "";
  return { actor: actorFromMembership(member), membership: member, rolePreview: meta };
}

function accessDecision(store, actor, organizationId, action, options) {
  const opts = options && typeof options === "object" ? options : {};
  return orgPermissions.evaluateAccess({
    store,
    actor,
    organizationId,
    action,
    classroomId: opts.classroomId || "",
    childId: opts.childId || "",
    featureFlags: opts.featureFlags || null,
    requiredFeature: opts.requiredFeature || "",
  });
}

function deny(response, decision, statusCode) {
  response.__llhResponded = true;
  return {
    statusCode: statusCode || 403,
    payload: {
      error: "Access denied.",
      code: decision && decision.reason ? decision.reason : "access_denied",
      decision,
    },
  };
}

function classroomChildCount(store, organizationId, classroomId) {
  return listValues(store.classroomChildAssignments).filter((row) => (
    row
    && row.organizationId === organizationId
    && row.classroomId === classroomId
    && activeStatus(row.status)
    && !row.endsAt
  )).length;
}

function activeChildAssignment(store, organizationId, childId) {
  return listValues(store.classroomChildAssignments).find((row) => (
    row
    && row.organizationId === organizationId
    && row.childId === childId
    && activeStatus(row.status)
    && !row.endsAt
  )) || null;
}

function childClassroomIds(store, organizationId, childId) {
  return listValues(store.classroomChildAssignments)
    .filter((row) => (
      row
      && row.organizationId === organizationId
      && row.childId === childId
      && activeStatus(row.status)
      && !row.endsAt
    ))
    .map((row) => row.classroomId);
}

function classroomStaff(store, organizationId, classroomId) {
  return listValues(store.classroomStaffAssignments).filter((row) => (
    row
    && row.organizationId === organizationId
    && row.classroomId === classroomId
    && activeStatus(row.status)
    && !row.endsAt
  )).map((assignment) => ({
    assignment,
    member: store.staffMemberships && store.staffMemberships[assignment.staffMembershipId]
      ? store.staffMemberships[assignment.staffMembershipId]
      : null,
  })).filter((row) => row.member);
}

function visibleClassrooms(store, organizationId, actor) {
  return listValues(store.classrooms).filter((room) => {
    if (!room || room.organizationId !== organizationId || !isActiveClassroom(room)) return false;
    const decision = accessDecision(store, actor, organizationId, orgPermissions.ACTIONS.CLASSROOM_VIEW, {
      classroomId: room.id,
    });
    return decision.allowed === true;
  });
}

function visibleChildren(store, organizationId, actor) {
  return listValues(store.childRecords).filter((child) => {
    if (!child || child.organizationId !== organizationId) return false;
    const decision = accessDecision(store, actor, organizationId, orgPermissions.ACTIONS.CHILD_VIEW, {
      childId: child.id,
    });
    return decision.allowed === true;
  });
}

function profileForChild(store, organizationId, childId) {
  return listValues(store.previewChildProfiles).find((profile) => (
    profile && profile.organizationId === organizationId && profile.childId === childId
  )) || null;
}

function enrichClassroom(store, organizationId, room) {
  return {
    id: room.id,
    organizationId: room.organizationId,
    name: room.name,
    ageGroupDefault: room.ageGroupDefault || "",
    description: room.description || "",
    color: room.color || "",
    capacity: room.capacity,
    status: room.status,
    currentCurriculum: room.currentCurriculum || null,
    enrollmentCount: classroomChildCount(store, organizationId, room.id),
    staff: classroomStaff(store, organizationId, room.id).map((row) => ({
      id: row.member.id,
      displayName: row.member.displayName,
      role: row.member.role,
      email: row.member.userEmail,
    })),
  };
}

function summarizePermissions(store, organizationId, actor, rooms, children) {
  const classroomId = rooms.length ? rooms[0].id : "";
  const childId = children.length ? children[0].id : "";
  const check = (action, opts) => accessDecision(store, actor, organizationId, action, opts).allowed === true;
  return {
    role: orgPermissions.normalizeOrgRole(actor.role),
    actions: {
      orgView: check(orgPermissions.ACTIONS.ORG_VIEW),
      viewAllClassrooms: check(orgPermissions.ACTIONS.ORG_VIEW_ALL_CLASSROOMS),
      viewAllChildren: check(orgPermissions.ACTIONS.ORG_VIEW_ALL_CHILDREN),
      assignLesson: classroomId ? check(orgPermissions.ACTIONS.CLASSROOM_ASSIGN_LESSON, { classroomId }) : false,
      editLessonCopy: classroomId ? check(orgPermissions.ACTIONS.CLASSROOM_EDIT_LESSON_COPY, { classroomId }) : false,
      addCalendarEvent: classroomId ? check(orgPermissions.ACTIONS.CLASSROOM_ADD_EVENT, { classroomId }) : false,
      viewMedical: childId ? check(orgPermissions.ACTIONS.CHILD_VIEW_MEDICAL, { childId }) : false,
      viewEmergency: childId ? check(orgPermissions.ACTIONS.CHILD_VIEW_EMERGENCY, { childId }) : false,
      createDailyLog: childId ? check(orgPermissions.ACTIONS.CHILD_CREATE_DAILY_LOG, { childId }) : false,
      createObservation: childId ? check(orgPermissions.ACTIONS.CHILD_CREATE_OBSERVATION, { childId }) : false,
      viewGoals: childId ? check(orgPermissions.ACTIONS.CHILD_VIEW_GOALS, { childId }) : false,
      addGoalProgress: childId ? check(orgPermissions.ACTIONS.CHILD_ADD_GOAL_PROGRESS, { childId }) : false,
      manageAssistantPermissions: check(orgPermissions.ACTIONS.ORG_MANAGE_STAFF),
    },
  };
}

function completeSnapshot(snapshot, fallback) {
  const next = snapshot && typeof snapshot === "object" ? snapshot : {};
  const weekly = next.weekly && typeof next.weekly === "object" ? next.weekly : {};
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day, index) => {
    const label = fallback || `Classroom day ${index + 1}`;
    const source = weekly[day] && typeof weekly[day] === "object" ? weekly[day] : {};
    weekly[day] = {
      dailyTheme: source.dailyTheme || label,
      circleTime: source.circleTime || `${label} circle time`,
      activity1: source.activity1 || `${label} activity 1`,
      activity2: source.activity2 || `${label} activity 2`,
      activity3: source.activity3 || `${label} activity 3`,
      outdoorPlay: source.outdoorPlay || `${label} outdoor play`,
      bookOfTheDay: source.bookOfTheDay || `${label} read-aloud`,
      materials: source.materials || "Classroom materials",
      teacherNotes: source.teacherNotes || "Edit this classroom copy as needed.",
    };
  });
  next.weekly = weekly;
  next.lessonPlanTitle = next.lessonPlanTitle || fallback || "Classroom Lesson Plan";
  next.capturedAt = next.capturedAt || nowIso();
  return next;
}

function lessonSnapshotFromBody(body, room) {
  const lesson = body.lessonPlan && typeof body.lessonPlan === "object" ? body.lessonPlan : {
    id: body.lessonPlanId || "",
    lessonPlanId: body.lessonPlanId || "",
    title: body.lessonPlanTitle || body.title || "Classroom Lesson Plan",
    lessonPlanTitle: body.lessonPlanTitle || body.title || "Classroom Lesson Plan",
    ageGroup: body.ageGroup || (room ? room.ageGroupDefault : ""),
    theme: body.theme || "",
    dailyPlans: body.dailyPlans || body.days || {},
    materials: body.materials || "",
  };
  const snapshot = body.snapshot && typeof body.snapshot === "object"
    ? body.snapshot
    : foundation.buildWeekSnapshotFromLesson(lesson, room ? room.ageGroupDefault || "" : "");
  if (!snapshot.lessonPlanId) snapshot.lessonPlanId = lesson.id || lesson.lessonPlanId || body.lessonPlanId || "";
  if (!snapshot.lessonPlanTitle) snapshot.lessonPlanTitle = lesson.title || lesson.lessonPlanTitle || body.lessonPlanTitle || "Classroom Lesson Plan";
  return completeSnapshot(snapshot, snapshot.lessonPlanTitle || "Classroom Lesson Plan");
}

function activeWeekAssignment(store, organizationId, classroomId, weekStartDate) {
  return listValues(store.classroomWeekAssignments).find((assignment) => (
    assignment
    && assignment.organizationId === organizationId
    && assignment.classroomId === classroomId
    && assignment.weekStartDate === weekStartDate
    && assignment.status === foundation.WEEK_ASSIGNMENT_STATUS.ACTIVE
  )) || null;
}

function calendarEventsForWeek(store, organizationId, classroomId, weekStartDate) {
  const endDate = addDays(weekStartDate, 6);
  return listValues(store.classroomCalendarEvents)
    .filter((event) => (
      event
      && event.organizationId === organizationId
      && event.classroomId === classroomId
      && event.date >= weekStartDate
      && event.date <= endDate
    ))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

function redactProfile(profile, canViewMedical, canViewEmergency) {
  if (!profile) return null;
  const redacted = {};
  Object.keys(profile).forEach((key) => {
    redacted[key] = profile[key];
  });
  const redactions = {
    medical: !canViewMedical,
    emergency: !canViewEmergency,
    pickup: !canViewEmergency,
  };
  if (!canViewMedical) {
    redacted.medicalInformation = { redacted: true, reason: "CHILD_VIEW_MEDICAL required" };
    redacted.allergies = { redacted: true, reason: "CHILD_VIEW_MEDICAL required" };
  }
  if (!canViewEmergency) {
    redacted.familyEmergencyContacts = { redacted: true, reason: "CHILD_VIEW_EMERGENCY required" };
    redacted.authorizedPickup = { redacted: true, reason: "CHILD_VIEW_EMERGENCY required" };
  }
  redacted.redactions = redactions;
  return redacted;
}

function childPayload(store, organizationId, child, actor, includeProfile) {
  const assignment = activeChildAssignment(store, organizationId, child.id);
  const room = assignment && store.classrooms ? store.classrooms[assignment.classroomId] : null;
  const payload = {
    id: child.id,
    organizationId: child.organizationId,
    displayName: child.displayName,
    status: child.status,
    ageGroup: child.ageGroup || "",
    legacyChildId: child.legacyChildId || "",
    activeAssignment: assignment,
    classroomId: assignment ? assignment.classroomId : "",
    classroomName: room ? room.name : "",
  };
  if (includeProfile) {
    const canViewMedical = accessDecision(store, actor, organizationId, orgPermissions.ACTIONS.CHILD_VIEW_MEDICAL, {
      childId: child.id,
    }).allowed === true;
    const canViewEmergency = accessDecision(store, actor, organizationId, orgPermissions.ACTIONS.CHILD_VIEW_EMERGENCY, {
      childId: child.id,
    }).allowed === true;
    payload.profile = redactProfile(profileForChild(store, organizationId, child.id), canViewMedical, canViewEmergency);
  }
  return payload;
}

function inferClassroomForChild(store, organizationId, childId, fallbackClassroomId) {
  const fallback = String(fallbackClassroomId || "").trim();
  if (fallback) return fallback;
  const assignment = activeChildAssignment(store, organizationId, childId);
  return assignment ? assignment.classroomId : "";
}

function arrayFromBody(value, fallback) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (fallback) return [String(fallback || "").trim()].filter(Boolean);
  return [];
}

function actionForListCreate(method, viewAction, createAction) {
  return method === "POST" ? createAction : viewAction;
}

function createMigrationDryRunReport(store) {
  const report = {
    ok: true,
    applied: false,
    fakeDataOnly: true,
    matched: [],
    missingPermanentIds: [],
    duplicates: [],
    ambiguousClassroomLabels: [],
    orphaned: [],
    proposedNewIds: [],
    manualReview: [],
    notes: [],
  };
  const users = store.users && typeof store.users === "object" ? store.users : {};
  const childData = store.childData && typeof store.childData === "object" ? store.childData : {};
  const scheduleByUser = store.scheduleByUser && typeof store.scheduleByUser === "object" ? store.scheduleByUser : {};
  const seenEmails = {};
  Object.keys(users).forEach((email) => {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return;
    if (seenEmails[normalized]) {
      report.duplicates.push({ type: "user_email", value: normalized });
    }
    seenEmails[normalized] = true;
    const user = users[email] || {};
    if (!user.permanentId && !user.id && !user.userId) {
      report.missingPermanentIds.push({ type: "user", email: normalized });
    } else {
      report.matched.push({ type: "user", email: normalized });
    }
  });
  Object.keys(childData).forEach((key) => {
    const child = childData[key] || {};
    if (!child.permanentId && !child.id && !child.childId) {
      report.missingPermanentIds.push({ type: "childData", key });
    } else {
      report.matched.push({ type: "childData", key });
    }
  });
  Object.keys(scheduleByUser).forEach((key) => {
    const value = scheduleByUser[key];
    if (!value || typeof value !== "object") {
      report.orphaned.push({ type: "scheduleByUser", key, reason: "invalid_schedule_payload" });
      return;
    }
    const labels = {};
    Object.keys(value).forEach((scheduleKey) => {
      const entry = value[scheduleKey] || {};
      const label = String(entry.classroomLabel || entry.classroomName || entry.roomName || "").trim().toLowerCase();
      if (!label) return;
      labels[label] = (labels[label] || 0) + 1;
    });
    Object.keys(labels).forEach((label) => {
      if (labels[label] > 1) {
        report.ambiguousClassroomLabels.push({ userKey: key, label, count: labels[label] });
      }
    });
  });
  report.notes.push(`Scanned users:${Object.keys(users).length}`);
  report.notes.push(`Scanned childData:${Object.keys(childData).length}`);
  report.notes.push(`Scanned scheduleByUser:${Object.keys(scheduleByUser).length}`);
  report.notes.push("Dry run only; no production records were written.");
  return report;
}

function createPhase3TeacherApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  const normalize = typeof normalizeEmail === "function"
    ? normalizeEmail
    : (value) => String(value || "").trim().toLowerCase();

  function send(response, status, payload) {
    jsonResponse(response, status, payload);
  }

  function sendDenied(response, decision, statusCode) {
    const result = deny(response, decision, statusCode);
    send(response, result.statusCode, result.payload);
  }

  function prepare(request, context, options) {
    const opts = options && typeof options === "object" ? options : {};
    const adminEmail = normalize(context && context.adminEmail ? context.adminEmail : "");
    const store = readStore();
    foundation.ensurePhase3Store(store);
    const preview = ensurePreview(store, adminEmail, opts.scenario || "");
    const resolved = resolveActor(store, request, preview.organization ? preview.organization.id : "", adminEmail, preview.owner, expansionEnvironment);
    return {
      store,
      adminEmail,
      organization: preview.organization,
      programProfile: preview.programProfile,
      owner: preview.owner,
      actor: resolved.actor,
      actorMembership: resolved.membership,
      rolePreview: resolved.rolePreview,
      seeded: preview.seeded,
    };
  }

  function requireAccess(response, ctx, action, options) {
    const opts = options && typeof options === "object" ? options : {};
    const organizationId = opts.organizationId || (ctx.organization ? ctx.organization.id : "");
    const decision = accessDecision(ctx.store, ctx.actor, organizationId, action, opts);
    if (decision.allowed) return decision;
    sendDenied(response, decision, opts.statusCode || 403);
    return null;
  }

  async function handleSeed(request, response, context) {
    const body = await readJson(request);
    const scenario = String(body.scenario || "small_center").trim() || "small_center";
    const adminEmail = normalize(context && context.adminEmail ? context.adminEmail : "");
    const store = readStore();
    foundation.ensurePhase3Store(store);
    const seeded = fixtures.seedPreviewSuite(store, { adminEmail, scenario });
    foundation.ensurePhase3Store(store);
    const org = seeded.organization;
    const owner = seeded.owner || findOwnerMembership(store, org.id, adminEmail);
    const actor = actorFromMembership(owner);
    const decision = accessDecision(store, actor, org.id, orgPermissions.ACTIONS.ORG_MANAGE_SETTINGS);
    if (!decision.allowed) {
      sendDenied(response, decision, 403);
      return;
    }
    const report = phase3Seed.expandPhase3Fixtures(store, { organizationId: org.id, owner });
    writeStore(store);
    send(response, 200, {
      ok: true,
      seeded: true,
      phase: 3,
      scenario,
      label: fixtures.PREVIEW_MARKER,
      emailSent: false,
      stripeTouched: false,
      fakeDataOnly: true,
      organizationId: org.id,
      ownerMembershipId: owner ? owner.id : "",
      report,
    });
  }

  async function handleContext(request, response, context) {
    const ctx = prepare(request, context);
    if (ctx.seeded) writeStore(ctx.store);
    const rooms = visibleClassrooms(ctx.store, ctx.organization.id, ctx.actor);
    const children = visibleChildren(ctx.store, ctx.organization.id, ctx.actor);
    send(response, 200, {
      ok: true,
      phase: 3,
      preview: true,
      fakeDataOnly: true,
      organization: ctx.organization,
      programProfile: ctx.programProfile,
      actor: {
        membershipId: ctx.actor.membershipId,
        displayName: ctx.actor.displayName,
        email: ctx.actor.email,
        role: orgPermissions.normalizeOrgRole(ctx.actor.role),
      },
      classroomsVisible: rooms.map((room) => enrichClassroom(ctx.store, ctx.organization.id, room)),
      permissions: summarizePermissions(ctx.store, ctx.organization.id, ctx.actor, rooms, children),
      rolePreview: ctx.rolePreview,
    });
  }

  async function handleListClassrooms(request, response, context) {
    const ctx = prepare(request, context);
    if (ctx.seeded) writeStore(ctx.store);
    const rooms = visibleClassrooms(ctx.store, ctx.organization.id, ctx.actor);
    send(response, 200, {
      ok: true,
      organizationId: ctx.organization.id,
      classrooms: rooms.map((room) => enrichClassroom(ctx.store, ctx.organization.id, room)),
      rolePreview: ctx.rolePreview,
    });
  }

  async function handleCalendar(request, response, context, url) {
    const ctx = prepare(request, context);
    if (ctx.seeded) writeStore(ctx.store);
    const weekStart = mondayIsoDate(url && url.searchParams ? url.searchParams.get("weekStart") : "");
    const requestedClassroomId = String(url && url.searchParams ? url.searchParams.get("classroomId") || "" : "").trim();
    const rooms = visibleClassrooms(ctx.store, ctx.organization.id, ctx.actor);
    const room = requestedClassroomId
      ? (ctx.store.classrooms && ctx.store.classrooms[requestedClassroomId] ? ctx.store.classrooms[requestedClassroomId] : null)
      : (rooms.length ? rooms[0] : null);
    if (!room || room.organizationId !== ctx.organization.id) {
      send(response, 404, { error: "Classroom was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CLASSROOM_VIEW_CALENDAR, { classroomId: room.id });
    if (!access) return;
    const assignment = activeWeekAssignment(ctx.store, ctx.organization.id, room.id, weekStart);
    send(response, 200, {
      ok: true,
      organizationId: ctx.organization.id,
      classroom: enrichClassroom(ctx.store, ctx.organization.id, room),
      weekStartDate: weekStart,
      assignment,
      events: calendarEventsForWeek(ctx.store, ctx.organization.id, room.id, weekStart),
      needsPlan: !assignment,
      rolePreview: ctx.rolePreview,
    });
  }

  async function handleAssignLesson(request, response, context) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    const classroomId = String(body.classroomId || "").trim();
    const room = ctx.store.classrooms && ctx.store.classrooms[classroomId] ? ctx.store.classrooms[classroomId] : null;
    if (!room || room.organizationId !== ctx.organization.id || !isActiveClassroom(room)) {
      send(response, 404, { error: "Active classroom was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CLASSROOM_ASSIGN_LESSON, { classroomId });
    if (!access) return;
    const weekStart = mondayIsoDate(body.weekStart || body.weekStartDate || "");
    const existing = activeWeekAssignment(ctx.store, ctx.organization.id, classroomId, weekStart);
    if (existing) {
      send(response, 409, {
        error: "This classroom already has an active lesson plan for the week. Use replace with confirm to preserve history.",
        code: "assignment_exists",
        requiresReplace: true,
        assignment: existing,
      });
      return;
    }
    const snapshot = lessonSnapshotFromBody(body, room);
    const assignment = foundation.createClassroomWeekAssignmentRecord({
      organizationId: ctx.organization.id,
      classroomId,
      lessonPlanId: snapshot.lessonPlanId || body.lessonPlanId || "",
      weekStartDate: weekStart,
      ageGroup: body.ageGroup || room.ageGroupDefault || "",
      classroomLabel: room.name || "",
      assignedByUserId: ctx.actor.userId,
      snapshot,
    });
    ctx.store.classroomWeekAssignments[assignment.id] = assignment;
    writeStore(ctx.store);
    send(response, 201, { ok: true, assignment });
  }

  async function handleReplaceLesson(request, response, context) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    const assignmentId = String(body.assignmentId || "").trim();
    const previous = ctx.store.classroomWeekAssignments && ctx.store.classroomWeekAssignments[assignmentId]
      ? ctx.store.classroomWeekAssignments[assignmentId]
      : null;
    if (!previous) {
      send(response, 404, { error: "Assignment was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CLASSROOM_ASSIGN_LESSON, {
      organizationId: previous.organizationId,
      classroomId: previous.classroomId,
    });
    if (!access) return;
    if (previous.organizationId !== ctx.organization.id) {
      return;
    }
    if (body.confirm !== true) {
      send(response, 409, {
        error: "Confirm is required to replace an assigned lesson plan while preserving history.",
        code: "confirmation_required",
        requiresConfirmation: true,
        assignment: previous,
      });
      return;
    }
    const room = ctx.store.classrooms && ctx.store.classrooms[previous.classroomId] ? ctx.store.classrooms[previous.classroomId] : null;
    const snapshot = lessonSnapshotFromBody(body, room);
    const next = foundation.createClassroomWeekAssignmentRecord({
      organizationId: previous.organizationId,
      classroomId: previous.classroomId,
      lessonPlanId: snapshot.lessonPlanId || body.lessonPlanId || "",
      weekStartDate: previous.weekStartDate,
      ageGroup: body.ageGroup || previous.ageGroup || (room ? room.ageGroupDefault : ""),
      classroomLabel: previous.classroomLabel || (room ? room.name : ""),
      assignedByUserId: ctx.actor.userId,
      snapshot,
    });
    const replacedAt = nowIso();
    previous.status = foundation.WEEK_ASSIGNMENT_STATUS.REPLACED;
    previous.replacedAt = replacedAt;
    previous.replacedByUserId = ctx.actor.userId;
    previous.replacedByAssignmentId = next.id;
    previous.updatedAt = replacedAt;
    ctx.store.classroomWeekAssignments[previous.id] = previous;
    ctx.store.classroomWeekAssignments[next.id] = next;
    writeStore(ctx.store);
    send(response, 200, { ok: true, assignment: next, previousAssignment: previous, preservedHistorical: true });
  }

  async function handlePatchAssignment(request, response, context, assignmentId) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    const assignment = ctx.store.classroomWeekAssignments && ctx.store.classroomWeekAssignments[assignmentId]
      ? ctx.store.classroomWeekAssignments[assignmentId]
      : null;
    if (!assignment) {
      send(response, 404, { error: "Assignment was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CLASSROOM_EDIT_LESSON_COPY, {
      organizationId: assignment.organizationId,
      classroomId: assignment.classroomId,
    });
    if (!access) return;
    if (assignment.organizationId !== ctx.organization.id) {
      return;
    }
    if (assignment.status !== foundation.WEEK_ASSIGNMENT_STATUS.ACTIVE) {
      send(response, 409, { error: "Historical assignments cannot be edited.", code: "historical_assignment" });
      return;
    }
    const snapshot = assignment.snapshot && typeof assignment.snapshot === "object" ? assignment.snapshot : {};
    if (body.snapshot && typeof body.snapshot === "object") {
      assignment.snapshot = completeSnapshot(body.snapshot, snapshot.lessonPlanTitle || assignment.lessonPlanId || "Classroom Lesson Plan");
    } else {
      const nextSnapshot = {};
      Object.keys(snapshot).forEach((key) => {
        nextSnapshot[key] = snapshot[key];
      });
      if (body.lessonPlanTitle !== undefined) nextSnapshot.lessonPlanTitle = String(body.lessonPlanTitle || "").trim();
      if (body.theme !== undefined) nextSnapshot.theme = String(body.theme || "").trim();
      if (body.weekly && typeof body.weekly === "object") nextSnapshot.weekly = body.weekly;
      assignment.snapshot = completeSnapshot(nextSnapshot, nextSnapshot.lessonPlanTitle || "Classroom Lesson Plan");
    }
    assignment.updatedAt = nowIso();
    ctx.store.classroomWeekAssignments[assignment.id] = assignment;
    writeStore(ctx.store);
    send(response, 200, { ok: true, assignment });
  }

  async function handleCreateEvent(request, response, context) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    const classroomId = String(body.classroomId || "").trim();
    const room = ctx.store.classrooms && ctx.store.classrooms[classroomId] ? ctx.store.classrooms[classroomId] : null;
    if (!room || room.organizationId !== ctx.organization.id || !isActiveClassroom(room)) {
      send(response, 404, { error: "Active classroom was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CLASSROOM_ADD_EVENT, { classroomId });
    if (!access) return;
    const event = foundation.createClassroomCalendarEventRecord({
      organizationId: ctx.organization.id,
      classroomId,
      date: String(body.date || "").trim() || mondayIsoDate(),
      title: String(body.title || "").trim() || "Classroom event",
      type: String(body.type || "classroom_event").trim(),
      notes: String(body.notes || "").trim(),
      visibility: String(body.visibility || "classroom_staff").trim(),
      createdByUserId: ctx.actor.userId,
    });
    ctx.store.classroomCalendarEvents[event.id] = event;
    writeStore(ctx.store);
    send(response, 201, { ok: true, event });
  }

  async function handleChildren(request, response, context, url) {
    const ctx = prepare(request, context);
    if (ctx.seeded) writeStore(ctx.store);
    const classroomId = String(url && url.searchParams ? url.searchParams.get("classroomId") || "" : "").trim();
    const q = String(url && url.searchParams ? url.searchParams.get("q") || "" : "").trim().toLowerCase();
    let children = visibleChildren(ctx.store, ctx.organization.id, ctx.actor);
    if (classroomId) children = children.filter((child) => childClassroomIds(ctx.store, ctx.organization.id, child.id).includes(classroomId));
    if (q) children = children.filter((child) => String(child.displayName || "").toLowerCase().includes(q));
    send(response, 200, {
      ok: true,
      organizationId: ctx.organization.id,
      children: children.map((child) => childPayload(ctx.store, ctx.organization.id, child, ctx.actor, false)),
      rolePreview: ctx.rolePreview,
    });
  }

  async function handleChildProfile(request, response, context, childId) {
    const ctx = prepare(request, context);
    const child = ctx.store.childRecords && ctx.store.childRecords[childId] ? ctx.store.childRecords[childId] : null;
    if (!child) {
      send(response, 404, { error: "Child was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CHILD_VIEW, {
      organizationId: child.organizationId,
      childId: child.id,
    });
    if (!access) return;
    if (child.organizationId !== ctx.organization.id) {
      return;
    }
    send(response, 200, {
      ok: true,
      child: childPayload(ctx.store, ctx.organization.id, child, ctx.actor, true),
      rolePreview: ctx.rolePreview,
    });
  }

  async function handleChildTimeline(request, response, context, childId) {
    const ctx = prepare(request, context);
    const child = ctx.store.childRecords && ctx.store.childRecords[childId] ? ctx.store.childRecords[childId] : null;
    if (!child) {
      send(response, 404, { error: "Child was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CHILD_VIEW, {
      organizationId: child.organizationId,
      childId: child.id,
    });
    if (!access) return;
    if (child.organizationId !== ctx.organization.id) {
      return;
    }
    const items = [];
    listValues(ctx.store.classroomChildAssignments).forEach((row) => {
      if (row && row.childId === childId && row.organizationId === ctx.organization.id) {
        items.push({ type: "classroom_assignment", at: row.startsAt || row.createdAt || "", item: row });
      }
    });
    listValues(ctx.store.previewDailyLogs).forEach((row) => {
      if (row && row.childId === childId && row.organizationId === ctx.organization.id) {
        items.push({ type: "daily_log", at: `${row.date || ""}T${row.time || "00:00"}:00.000Z`, item: row });
      }
    });
    listValues(ctx.store.previewObservations).forEach((row) => {
      if (row && row.childId === childId && row.organizationId === ctx.organization.id) {
        items.push({ type: "observation", at: `${row.date || ""}T${row.time || "00:00"}:00.000Z`, item: row });
      }
    });
    listValues(ctx.store.previewGoals).forEach((row) => {
      if (row && row.childId === childId && row.organizationId === ctx.organization.id) {
        items.push({ type: "goal", at: row.createdAt || "", item: row });
        (Array.isArray(row.progressNotes) ? row.progressNotes : []).forEach((note) => {
          items.push({ type: "goal_progress", at: note.createdAt || note.date || "", item: { goalId: row.id, progress: note } });
        });
      }
    });
    items.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    send(response, 200, { ok: true, childId, timeline: items });
  }

  async function handleDailyLogs(request, response, context, url) {
    const ctx = prepare(request, context);
    if (request.method === "GET") {
      const childId = String(url && url.searchParams ? url.searchParams.get("childId") || "" : "").trim();
      const classroomId = String(url && url.searchParams ? url.searchParams.get("classroomId") || "" : "").trim();
      const date = String(url && url.searchParams ? url.searchParams.get("date") || "" : "").trim();
      const visibleIds = new Set(visibleChildren(ctx.store, ctx.organization.id, ctx.actor).map((child) => child.id));
      let logs = listValues(ctx.store.previewDailyLogs).filter((log) => log && log.organizationId === ctx.organization.id && visibleIds.has(log.childId));
      if (childId) logs = logs.filter((log) => log.childId === childId);
      if (classroomId) logs = logs.filter((log) => log.classroomId === classroomId);
      if (date) logs = logs.filter((log) => log.date === date);
      logs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      send(response, 200, { ok: true, dailyLogs: logs });
      return;
    }
    const body = await readJson(request);
    const childIds = arrayFromBody(body.childIds, body.childId);
    if (!childIds.length) {
      send(response, 400, { error: "childId or childIds[] is required." });
      return;
    }
    const groupBatchId = childIds.length > 1 ? (String(body.groupBatchId || "").trim() || foundation.newId("group")) : "";
    const created = [];
    for (const childId of childIds) {
      const child = ctx.store.childRecords && ctx.store.childRecords[childId] ? ctx.store.childRecords[childId] : null;
      if (!child) continue;
      const classroomId = inferClassroomForChild(ctx.store, child.organizationId, child.id, body.classroomId);
      const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CHILD_CREATE_DAILY_LOG, {
        organizationId: child.organizationId,
        classroomId,
        childId: child.id,
      });
      if (!access) return;
      if (child.organizationId !== ctx.organization.id) return;
      const log = foundation.createPreviewDailyLogRecord({
        organizationId: ctx.organization.id,
        classroomId,
        childId: child.id,
        staffMembershipId: ctx.actor.membershipId,
        staffUserId: ctx.actor.userId,
        date: String(body.date || "").trim(),
        time: String(body.time || "").trim(),
        attendance: String(body.attendance || "").trim(),
        arrival: String(body.arrival || "").trim(),
        departure: String(body.departure || "").trim(),
        meals: String(body.meals || "").trim(),
        snacks: String(body.snacks || "").trim(),
        bottles: String(body.bottles || "").trim(),
        naps: String(body.naps || "").trim(),
        diapers: String(body.diapers || "").trim(),
        potty: String(body.potty || "").trim(),
        activities: String(body.activities || "").trim(),
        mood: String(body.mood || "").trim(),
        healthNotes: String(body.healthNotes || "").trim(),
        photos: Array.isArray(body.photos) ? body.photos : [],
        teacherNotes: String(body.teacherNotes || body.notes || "").trim(),
        suppliesNeeded: String(body.suppliesNeeded || "").trim(),
        groupBatchId,
      });
      ctx.store.previewDailyLogs[log.id] = log;
      created.push(log);
    }
    writeStore(ctx.store);
    send(response, 201, { ok: true, dailyLogs: created, groupBatchId });
  }

  async function handleObservations(request, response, context, url) {
    const ctx = prepare(request, context);
    if (request.method === "GET") {
      const childId = String(url && url.searchParams ? url.searchParams.get("childId") || "" : "").trim();
      const visibleIds = new Set(visibleChildren(ctx.store, ctx.organization.id, ctx.actor).map((child) => child.id));
      let observations = listValues(ctx.store.previewObservations).filter((row) => row && row.organizationId === ctx.organization.id && visibleIds.has(row.childId));
      if (childId) observations = observations.filter((row) => row.childId === childId);
      observations.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      send(response, 200, { ok: true, observations });
      return;
    }
    const body = await readJson(request);
    const childId = String(body.childId || "").trim();
    const child = ctx.store.childRecords && ctx.store.childRecords[childId] ? ctx.store.childRecords[childId] : null;
    if (!child) {
      send(response, 404, { error: "Child was not found." });
      return;
    }
    const classroomId = inferClassroomForChild(ctx.store, child.organizationId, child.id, body.classroomId);
    const action = actionForListCreate(request.method, orgPermissions.ACTIONS.CHILD_VIEW, orgPermissions.ACTIONS.CHILD_CREATE_OBSERVATION);
    const access = requireAccess(response, ctx, action, { organizationId: child.organizationId, classroomId, childId: child.id });
    if (!access) return;
    if (child.organizationId !== ctx.organization.id) return;
    const observation = foundation.createPreviewObservationRecord({
      organizationId: ctx.organization.id,
      classroomId,
      childId: child.id,
      staffMembershipId: ctx.actor.membershipId,
      staffUserId: ctx.actor.userId,
      date: String(body.date || "").trim(),
      time: String(body.time || "").trim(),
      text: String(body.text || body.note || "").trim(),
      learningDomains: Array.isArray(body.learningDomains) ? body.learningDomains : [],
      activityOrLessonPlanId: String(body.activityOrLessonPlanId || "").trim(),
      photoReference: String(body.photoReference || "").trim(),
      sharingStatus: String(body.sharingStatus || foundation.SHARING_STATUS.PRIVATE_STAFF).trim(),
    });
    observation.familyShareEnabled = false;
    ctx.store.previewObservations[observation.id] = observation;
    writeStore(ctx.store);
    send(response, 201, { ok: true, observation });
  }

  async function handlePatchObservation(request, response, context, observationId) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    const observation = ctx.store.previewObservations && ctx.store.previewObservations[observationId]
      ? ctx.store.previewObservations[observationId]
      : null;
    if (!observation) {
      send(response, 404, { error: "Observation was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CHILD_EDIT_OBSERVATION, {
      organizationId: observation.organizationId,
      classroomId: observation.classroomId,
      childId: observation.childId,
    });
    if (!access) return;
    if (observation.organizationId !== ctx.organization.id) return;
    if (body.text !== undefined || body.note !== undefined) observation.text = String(body.text || body.note || "").trim();
    if (Array.isArray(body.learningDomains)) observation.learningDomains = body.learningDomains;
    if (body.activityOrLessonPlanId !== undefined) observation.activityOrLessonPlanId = String(body.activityOrLessonPlanId || "").trim();
    if (body.photoReference !== undefined) observation.photoReference = String(body.photoReference || "").trim();
    if (body.sharingStatus !== undefined) {
      observation.sharingStatus = String(body.sharingStatus || foundation.SHARING_STATUS.PRIVATE_STAFF).trim();
    }
    observation.familyShareEnabled = false;
    observation.updatedAt = nowIso();
    ctx.store.previewObservations[observation.id] = observation;
    writeStore(ctx.store);
    send(response, 200, { ok: true, observation });
  }

  async function handleGoals(request, response, context, url) {
    const ctx = prepare(request, context);
    if (request.method === "GET") {
      const childId = String(url && url.searchParams ? url.searchParams.get("childId") || "" : "").trim();
      const visibleIds = new Set(visibleChildren(ctx.store, ctx.organization.id, ctx.actor).filter((child) => (
        accessDecision(ctx.store, ctx.actor, ctx.organization.id, orgPermissions.ACTIONS.CHILD_VIEW_GOALS, { childId: child.id }).allowed === true
      )).map((child) => child.id));
      let goals = listValues(ctx.store.previewGoals).filter((goal) => goal && goal.organizationId === ctx.organization.id && visibleIds.has(goal.childId));
      if (childId) goals = goals.filter((goal) => goal.childId === childId);
      goals.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      send(response, 200, { ok: true, goals });
      return;
    }
    const body = await readJson(request);
    const childId = String(body.childId || "").trim();
    const child = ctx.store.childRecords && ctx.store.childRecords[childId] ? ctx.store.childRecords[childId] : null;
    if (!child) {
      send(response, 404, { error: "Child was not found." });
      return;
    }
    const classroomId = inferClassroomForChild(ctx.store, child.organizationId, child.id, body.classroomId);
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CHILD_ADD_GOAL_PROGRESS, {
      organizationId: child.organizationId,
      classroomId,
      childId: child.id,
    });
    if (!access) return;
    if (child.organizationId !== ctx.organization.id) return;
    const goal = foundation.createPreviewGoalRecord({
      organizationId: ctx.organization.id,
      classroomId,
      childId: child.id,
      createdByUserId: ctx.actor.userId,
      createdByMembershipId: ctx.actor.membershipId,
      learningDomain: String(body.learningDomain || foundation.LEARNING_DOMAINS[0]).trim(),
      description: String(body.description || "").trim(),
      targetOrNextStep: String(body.targetOrNextStep || body.nextStep || "").trim(),
      status: String(body.status || foundation.GOAL_STATUS.ACTIVE).trim(),
      progressNotes: Array.isArray(body.progressNotes) ? body.progressNotes : [],
    });
    ctx.store.previewGoals[goal.id] = goal;
    writeStore(ctx.store);
    send(response, 201, { ok: true, goal });
  }

  async function handleGoalProgress(request, response, context, goalId) {
    const body = await readJson(request);
    const ctx = prepare(request, context);
    const goal = ctx.store.previewGoals && ctx.store.previewGoals[goalId] ? ctx.store.previewGoals[goalId] : null;
    if (!goal) {
      send(response, 404, { error: "Goal was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.CHILD_ADD_GOAL_PROGRESS, {
      organizationId: goal.organizationId,
      classroomId: goal.classroomId,
      childId: goal.childId,
    });
    if (!access) return;
    if (goal.organizationId !== ctx.organization.id) return;
    const note = {
      id: foundation.newId("gprog"),
      date: String(body.date || "").trim() || nowIso().slice(0, 10),
      text: String(body.text || body.note || "").trim(),
      createdByUserId: ctx.actor.userId,
      createdByMembershipId: ctx.actor.membershipId,
      createdAt: nowIso(),
    };
    goal.progressNotes = Array.isArray(goal.progressNotes) ? goal.progressNotes : [];
    goal.progressNotes.push(note);
    goal.updatedAt = nowIso();
    ctx.store.previewGoals[goal.id] = goal;
    writeStore(ctx.store);
    send(response, 201, { ok: true, goal, progress: note });
  }

  async function handleAssistantPermissions(request, response, context, membershipId) {
    const ctx = prepare(request, context);
    const member = ctx.store.staffMemberships && ctx.store.staffMemberships[membershipId] ? ctx.store.staffMemberships[membershipId] : null;
    if (!member) {
      send(response, 404, { error: "Staff membership was not found." });
      return;
    }
    const access = requireAccess(response, ctx, orgPermissions.ACTIONS.ORG_MANAGE_STAFF, {
      organizationId: member.organizationId,
    });
    if (!access) return;
    if (member.organizationId !== ctx.organization.id) return;
    let override = listValues(ctx.store.assistantPermissionOverrides).find((row) => (
      row && row.organizationId === ctx.organization.id && row.staffMembershipId === member.id
    )) || null;
    if (request.method === "GET") {
      send(response, 200, {
        ok: true,
        membership: member,
        permissions: override ? override.permissions : foundation.defaultAssistantPermissions(false),
        override,
      });
      return;
    }
    const body = await readJson(request);
    const permissions = {};
    const allowedKeys = Object.keys(foundation.defaultAssistantPermissions(false));
    allowedKeys.forEach((key) => {
      if (body.permissions && Object.prototype.hasOwnProperty.call(body.permissions, key)) {
        permissions[key] = body.permissions[key] === true;
      }
    });
    if (!override) {
      override = foundation.createAssistantPermissionOverrideRecord({
        organizationId: ctx.organization.id,
        staffMembershipId: member.id,
        updatedByUserId: ctx.actor.userId,
        permissions,
      });
    } else {
      override.permissions = Object.assign({}, foundation.defaultAssistantPermissions(false), override.permissions || {}, permissions);
      override.updatedByUserId = ctx.actor.userId;
      override.updatedAt = nowIso();
    }
    ctx.store.assistantPermissionOverrides[override.id] = override;
    writeStore(ctx.store);
    send(response, 200, { ok: true, membership: member, permissions: override.permissions, override });
  }

  async function handleMigrationDryRun(request, response) {
    const store = readStore();
    foundation.ensurePhase3Store(store);
    send(response, 200, createMigrationDryRunReport(store));
  }

  async function handleRolePreviewOptions(request, response, context) {
    const ctx = prepare(request, context);
    if (ctx.seeded) writeStore(ctx.store);
    const options = listValues(ctx.store.staffMemberships)
      .filter((member) => member && member.organizationId === ctx.organization.id)
      .map((member) => {
        const assignments = listValues(ctx.store.classroomStaffAssignments).filter((row) => (
          row && row.staffMembershipId === member.id && activeStatus(row.status) && !row.endsAt
        ));
        return {
          membershipId: member.id,
          displayName: member.displayName,
          email: member.userEmail,
          role: member.role,
          status: member.status,
          assignedClassrooms: assignments.map((row) => {
            const room = ctx.store.classrooms && ctx.store.classrooms[row.classroomId] ? ctx.store.classrooms[row.classroomId] : null;
            return { id: row.classroomId, name: room ? room.name : "" };
          }),
        };
      });
    send(response, 200, {
      ok: true,
      enabled: previewHeaderAllowed(expansionEnvironment).allowed,
      header: "x-llh-role-preview-membership-id",
      memberships: options,
    });
  }

  function matchRoute(method, pathname, url) {
    const verb = String(method || "").toUpperCase();
    const path = String(pathname || "");
    if (path.indexOf(PHASE3_PREFIX) !== 0) return null;

    if (verb === "POST" && path === `${PHASE3_PREFIX}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx || {});
    if (verb === "GET" && path === `${PHASE3_PREFIX}/context`) return (req, res, ctx) => handleContext(req, res, ctx || {});
    if (verb === "GET" && path === `${PHASE3_PREFIX}/classrooms`) return (req, res, ctx) => handleListClassrooms(req, res, ctx || {});
    if (verb === "GET" && path === `${PHASE3_PREFIX}/calendar`) return (req, res, ctx) => handleCalendar(req, res, ctx || {}, url);
    if (verb === "POST" && path === `${PHASE3_PREFIX}/calendar/assign`) return (req, res, ctx) => handleAssignLesson(req, res, ctx || {});
    if (verb === "POST" && path === `${PHASE3_PREFIX}/calendar/replace`) return (req, res, ctx) => handleReplaceLesson(req, res, ctx || {});
    if (verb === "PATCH" && path.indexOf(`${PHASE3_PREFIX}/calendar/assignments/`) === 0) {
      const id = decodeURIComponent(path.slice(`${PHASE3_PREFIX}/calendar/assignments/`.length));
      return (req, res, ctx) => handlePatchAssignment(req, res, ctx || {}, id);
    }
    if (verb === "POST" && path === `${PHASE3_PREFIX}/calendar/events`) return (req, res, ctx) => handleCreateEvent(req, res, ctx || {});
    if (verb === "GET" && path === `${PHASE3_PREFIX}/children`) return (req, res, ctx) => handleChildren(req, res, ctx || {}, url);
    if (verb === "GET" && /^\/api\/director-center\/phase3\/children\/[^/]+\/timeline$/.test(path)) {
      const id = decodeURIComponent(path.split("/children/")[1].split("/timeline")[0]);
      return (req, res, ctx) => handleChildTimeline(req, res, ctx || {}, id);
    }
    if (verb === "GET" && /^\/api\/director-center\/phase3\/children\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.slice(`${PHASE3_PREFIX}/children/`.length));
      return (req, res, ctx) => handleChildProfile(req, res, ctx || {}, id);
    }
    if ((verb === "GET" || verb === "POST") && path === `${PHASE3_PREFIX}/daily-logs`) {
      return (req, res, ctx) => handleDailyLogs(req, res, ctx || {}, url);
    }
    if ((verb === "GET" || verb === "POST") && path === `${PHASE3_PREFIX}/observations`) {
      return (req, res, ctx) => handleObservations(req, res, ctx || {}, url);
    }
    if (verb === "PATCH" && path.indexOf(`${PHASE3_PREFIX}/observations/`) === 0) {
      const id = decodeURIComponent(path.slice(`${PHASE3_PREFIX}/observations/`.length));
      return (req, res, ctx) => handlePatchObservation(req, res, ctx || {}, id);
    }
    if ((verb === "GET" || verb === "POST") && path === `${PHASE3_PREFIX}/goals`) {
      return (req, res, ctx) => handleGoals(req, res, ctx || {}, url);
    }
    if (verb === "POST" && /^\/api\/director-center\/phase3\/goals\/[^/]+\/progress$/.test(path)) {
      const id = decodeURIComponent(path.split("/goals/")[1].split("/progress")[0]);
      return (req, res, ctx) => handleGoalProgress(req, res, ctx || {}, id);
    }
    if ((verb === "GET" || verb === "PATCH") && path.indexOf(`${PHASE3_PREFIX}/assistant-permissions/`) === 0) {
      const id = decodeURIComponent(path.slice(`${PHASE3_PREFIX}/assistant-permissions/`.length));
      return (req, res, ctx) => handleAssistantPermissions(req, res, ctx || {}, id);
    }
    if (verb === "GET" && path === `${PHASE3_PREFIX}/migration-dry-run`) return (req, res) => handleMigrationDryRun(req, res);
    if (verb === "GET" && path === `${PHASE3_PREFIX}/role-preview-options`) return (req, res, ctx) => handleRolePreviewOptions(req, res, ctx || {});
    return null;
  }

  return { matchRoute };
}

module.exports = {
  createPhase3TeacherApi,
};
