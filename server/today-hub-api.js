/**
 * Phase 15 Today Hub API — /api/director-center/today/*
 * Role-specific "what do I need to do right now?" aggregation + attendance + ratios.
 * Fake/testing only. No email/SMS/push/Stripe/live AI/production storage.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const model = require("../scripts/today-hub-data-model.js");
const fixtures = require("../scripts/today-hub-fixtures.js");
const messagingModel = require("../scripts/family-messaging-data-model.js");
const licensingFixtures = require("../scripts/licensing-center-fixtures.js");
const enrollmentFixtures = require("../scripts/enrollment-fixtures.js");
const recordsFixtures = require("../scripts/records-center-fixtures.js");

const BASE = "/api/director-center/today";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const TESTING_BANNER = model.TESTING_BANNER;

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
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
  return Boolean(String(siteUrl || "").toLowerCase().includes(PRODUCTION_HOST));
}

function resolveEnv(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") {
    const siteUrl = String(process.env.SITE_URL || "");
    env = {
      liveProduction: productionSiteFromUrl(siteUrl),
      allowDirectorCenterAdminPreview: !productionSiteFromUrl(siteUrl) && truthy(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW),
      siteUrl,
    };
  }
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const liveProduction = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    ...env,
    liveProduction,
    allowDirectorCenterAdminPreview: env.allowDirectorCenterAdminPreview === true && !liveProduction,
    siteUrl,
  };
}

function createTodayHubApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, {
      ok: false,
      error: error || "Access denied.",
      code,
      todayHub: true,
      preview: true,
      testingBanner: TESTING_BANNER,
      ratioDisclaimer: model.RATIO_DISCLAIMER,
    });
  }

  function ensureOrg(store, adminEmail) {
    model.ensureTodayHubStore(store);
    const seeded = fixtures.ensurePhase15Preview(store, { adminEmail: normalizeEmail?.(adminEmail) || adminEmail });
    const organization = store.organizations?.[seeded.organizationId]
      || formsFixtures.ensurePreviewOrganization(store, { adminEmail });
    return { organization, seeded };
  }

  function resolveActor(store, request, organizationId, adminEmail) {
    const members = listValues(store.staffMemberships).filter((row) => row.organizationId === organizationId && row.status === foundation.STAFF_STATUS.ACTIVE);
    const owner = members.find((row) => safeLower(row.userEmail) === safeLower(adminEmail))
      || members.find((row) => row.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER)
      || members[0];
    const policyOk = env().allowDirectorCenterAdminPreview === true && !env().liveProduction;
    const requested = getHeader(request, "x-llh-role-preview-membership-id");
    if (requested && policyOk) {
      const member = store.staffMemberships?.[requested];
      if (member && member.organizationId === organizationId) {
        return { actor: member, membership: member, rolePreview: true };
      }
    }
    return {
      actor: owner || {
        userEmail: adminEmail,
        role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
        organizationId,
        status: foundation.STAFF_STATUS.ACTIVE,
      },
      membership: owner || null,
      rolePreview: false,
    };
  }

  function isDirectorRole(role) {
    const r = orgPermissions.normalizeOrgRole(role);
    return r === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || r === orgPermissions.ORG_ROLES.DIRECTOR;
  }

  function isCurriculumOnly(role) {
    return orgPermissions.normalizeOrgRole(role) === orgPermissions.ORG_ROLES.CURRICULUM_ONLY
      || String(role || "").toLowerCase() === "curriculum_only";
  }

  function isTeacherRole(role) {
    return orgPermissions.normalizeOrgRole(role) === orgPermissions.ORG_ROLES.LEAD_TEACHER;
  }

  function isAssistantRole(role) {
    return orgPermissions.normalizeOrgRole(role) === orgPermissions.ORG_ROLES.ASSISTANT_STAFF;
  }

  function assertTodayAccess(store, request, response, adminEmail, { action = "view" } = {}) {
    if (env().liveProduction || !env().allowDirectorCenterAdminPreview) {
      deny(response, 403, "production_preview_rejected", "Today Hub preview is unavailable in production.");
      return null;
    }
    const { organization, seeded } = ensureOrg(store, adminEmail);
    const { actor, membership, rolePreview } = resolveActor(store, request, organization.id, adminEmail);
    // Curriculum Only may load the curriculum Today view; operational endpoints stay denied.
    const curriculumSafe = action === "view" || action === "curriculum" || action === "status";
    if (isCurriculumOnly(actor.role) && !curriculumSafe) {
      deny(response, 403, "curriculum_only_denied", "Curriculum Only accounts cannot access center operations.");
      return null;
    }
    return { organization, seeded, actor, membership, rolePreview };
  }

  function classroomScopeIds(store, organizationId, actor) {
    if (isDirectorRole(actor.role)) {
      return listValues(store.classrooms).filter((c) => c.organizationId === organizationId).map((c) => c.id);
    }
    const byUser = orgPermissions.activeClassroomIdsForStaff(store, organizationId, actor.userId || "");
    if (byUser.length) return byUser;
    return listValues(store.classroomStaffAssignments || {})
      .filter((row) => (
        row
        && row.organizationId === organizationId
        && row.staffMembershipId === actor.id
        && (!row.status || row.status === foundation.ASSIGNMENT_STATUS.ACTIVE || row.status === "active")
        && !row.endsAt
      ))
      .map((row) => row.classroomId);
  }

  function assistantCanSeeMedical(store, organizationId, actor) {
    if (!isAssistantRole(actor.role)) return true;
    return orgPermissions.assistantOverrideAllows(
      store,
      organizationId,
      actor.id,
      orgPermissions.ACTIONS.CHILD_VIEW_MEDICAL,
    );
  }

  function attendanceForOrg(store, organizationId, { classroomIds = null, date = model.todayDate() } = {}) {
    return listValues(store.todayHub.attendance).filter((row) => (
      row.organizationId === organizationId
      && row.date === date
      && (!classroomIds || classroomIds.includes(row.classroomId))
    ));
  }

  function buildClassroomSummaries(store, organizationId, classroomIds) {
    model.ensureTodayHubStore(store);
    const today = model.todayDate();
    return classroomIds.map((classroomId) => {
      const room = store.classrooms?.[classroomId] || { id: classroomId, name: "Classroom" };
      const rows = attendanceForOrg(store, organizationId, { classroomIds: [classroomId], date: today });
      const counts = {
        expected: rows.filter((r) => r.status === model.ATTENDANCE_STATUSES.EXPECTED).length,
        present: rows.filter((r) => [model.ATTENDANCE_STATUSES.CHECKED_IN, model.ATTENDANCE_STATUSES.LATE, model.ATTENDANCE_STATUSES.TEMPORARILY_OUT].includes(r.status)).length,
        absent: rows.filter((r) => r.status === model.ATTENDANCE_STATUSES.ABSENT).length,
        checkedOut: rows.filter((r) => [model.ATTENDANCE_STATUSES.CHECKED_OUT, model.ATTENDANCE_STATUSES.EARLY_PICKUP].includes(r.status)).length,
        late: rows.filter((r) => r.status === model.ATTENDANCE_STATUSES.LATE).length,
        moved: rows.filter((r) => r.status === model.ATTENDANCE_STATUSES.MOVED).length,
      };
      const staffOnDuty = listValues(store.todayHub.staffDuty).filter((d) => d.organizationId === organizationId && d.classroomId === classroomId && d.onDuty).length;
      const config = listValues(store.todayHub.ratioConfigs).find((c) => c.organizationId === organizationId && c.classroomId === classroomId) || null;
      const ratio = model.evaluateRatio({ childrenPresent: counts.present, qualifiedStaff: staffOnDuty, config });
      return {
        classroomId,
        name: room.name || room.displayName || "Classroom",
        counts,
        staffOnDuty,
        ratio,
        roster: rows.map((r) => ({
          attendanceId: r.id,
          childId: r.childId,
          childName: store.childRecords?.[r.childId]?.displayName || "Child",
          status: r.status,
          checkedInAt: r.checkedInAt,
          checkedOutAt: r.checkedOutAt,
        })),
      };
    });
  }

  function aggregateTasks(store, organizationId, actor, classroomIds) {
    const tasks = [];
    const today = model.todayDate();
    const director = isDirectorRole(actor.role);
    const teacher = isTeacherRole(actor.role);
    const assistant = isAssistantRole(actor.role);

    // Ratio warnings
    for (const summary of buildClassroomSummaries(store, organizationId, classroomIds)) {
      if ([model.RATIO_STATUS.OUT_OF_RATIO, model.RATIO_STATUS.COVERAGE_NEEDED].includes(summary.ratio.status)) {
        tasks.push(model.createTaskCard({
          source: model.TASK_SOURCES.RATIO,
          priority: model.PRIORITIES.URGENT,
          title: `Ratio attention: ${summary.name}`,
          summary: summary.ratio.wording,
          href: `today?section=ratios&classroomId=${encodeURIComponent(summary.classroomId)}`,
          classroomId: summary.classroomId,
          sourceRefId: summary.classroomId,
          roleVisibility: ["director", "teacher"],
        }));
      } else if (summary.ratio.status === model.RATIO_STATUS.NEAR_LIMIT) {
        tasks.push(model.createTaskCard({
          source: model.TASK_SOURCES.RATIO,
          priority: model.PRIORITIES.TODAY,
          title: `Near ratio limit: ${summary.name}`,
          summary: model.RATIO_DISCLAIMER,
          href: `today?section=ratios&classroomId=${encodeURIComponent(summary.classroomId)}`,
          classroomId: summary.classroomId,
          sourceRefId: `near-${summary.classroomId}`,
          roleVisibility: ["director", "teacher"],
        }));
      }
    }

    // Incidents
    for (const row of listValues(store.todayHub.incidents).filter((r) => r.organizationId === organizationId && r.status === "awaiting_review")) {
      if (!director && classroomIds.length && !classroomIds.includes(row.classroomId)) continue;
      tasks.push(model.createTaskCard({
        source: model.TASK_SOURCES.INCIDENTS,
        priority: model.PRIORITIES.URGENT,
        title: row.title,
        summary: "Incident awaiting review",
        href: `today?section=incidents&id=${encodeURIComponent(row.id)}`,
        childId: row.childId,
        classroomId: row.classroomId,
        sourceRefId: row.id,
        roleVisibility: ["director", "teacher", "assistant"],
      }));
    }

    // Medication (assistants only when medical override is granted)
    const assistantMedical = assistantCanSeeMedical(store, organizationId, actor);
    for (const row of listValues(store.todayHub.medicationTasks).filter((r) => r.organizationId === organizationId && r.status !== "completed")) {
      if (!director && classroomIds.length && !classroomIds.includes(row.classroomId)) continue;
      if (assistant && !assistantMedical) continue;
      tasks.push(model.createTaskCard({
        source: model.TASK_SOURCES.MEDICATION,
        priority: model.PRIORITIES.URGENT,
        title: row.title,
        summary: (assistant && !assistantMedical) ? "Medication task due" : (row.allergyAlert || "Medication task due"),
        href: `today?section=medication&id=${encodeURIComponent(row.id)}`,
        childId: row.childId,
        classroomId: row.classroomId,
        sourceRefId: row.id,
        roleVisibility: ["director", "teacher", "assistant"],
      }));
    }

    // Incomplete daily reports
    for (const row of store.todayHub.meta?.incompleteDailyReports || []) {
      if (!director && classroomIds.length && row.classroomId && !classroomIds.includes(row.classroomId)) continue;
      tasks.push(model.createTaskCard({
        source: model.TASK_SOURCES.DAILY_LOGS,
        priority: model.PRIORITIES.TODAY,
        title: row.title || "Incomplete Daily Report",
        summary: `Daily Report incomplete for ${row.date || today}`,
        href: `today?section=daily-reports&childId=${encodeURIComponent(row.childId || "")}`,
        childId: row.childId,
        classroomId: row.classroomId,
        sourceRefId: row.id,
        roleVisibility: ["director", "teacher", "assistant"],
      }));
    }

    // Records missing/expiring (refs only)
    try {
      recordsFixtures.ensurePhase13Preview(store, { organizationId });
      const records = listValues(store.recordsCenter?.records || {}).filter((r) => r.organizationId === organizationId);
      for (const row of records.filter((r) => /missing|expir/i.test(r.status || "")).slice(0, 8)) {
        if (!director) continue;
        tasks.push(model.createTaskCard({
          source: model.TASK_SOURCES.RECORDS,
          priority: /expir/i.test(row.status) ? model.PRIORITIES.DUE_SOON : model.PRIORITIES.TODAY,
          title: row.title || "Record needs attention",
          summary: row.status,
          href: `records_center?status=${encodeURIComponent(row.status)}`,
          childId: row.relatedChildId || "",
          sourceRefId: row.id,
          roleVisibility: ["director"],
        }));
      }
    } catch { /* ignore */ }

    // Licensing tasks (refs)
    try {
      licensingFixtures.ensurePhase14Preview(store, { organizationId });
      const reqs = listValues(store.licensingCenter?.requirements || {}).filter((r) => (
        r.organizationId === organizationId && !r.archived && /missing|expir|waiting/i.test(r.status || "")
      )).slice(0, 8);
      for (const row of reqs) {
        if (!director) continue;
        tasks.push(model.createTaskCard({
          source: model.TASK_SOURCES.LICENSING,
          priority: model.PRIORITIES.DUE_SOON,
          title: row.title,
          summary: row.status,
          href: `licensing_center?status=${encodeURIComponent(row.status)}`,
          childId: row.relatedChildId || "",
          sourceRefId: row.id,
          roleVisibility: ["director"],
        }));
      }
    } catch { /* ignore */ }

    // Enrollment tours / tasks
    try {
      enrollmentFixtures.ensurePhase12Preview(store, { organizationId });
      const cases = listValues(store.enrollmentCenter?.cases || store.enrollment?.cases || {}).filter((r) => r.organizationId === organizationId);
      for (const row of cases.filter((r) => /tour|inquiry|offer_sent/i.test(r.stage || r.status || "")).slice(0, 6)) {
        if (!director) continue;
        tasks.push(model.createTaskCard({
          source: model.TASK_SOURCES.ENROLLMENT,
          priority: model.PRIORITIES.TODAY,
          title: `Enrollment: ${row.childName || "Case"}`,
          summary: row.stage || row.status || "",
          href: `enrollment?caseId=${encodeURIComponent(row.id)}`,
          sourceRefId: row.id,
          roleVisibility: ["director"],
        }));
      }
    } catch { /* ignore */ }

    // Unread messages count card
    try {
      const unread = messagingModel.unreadCountForEmail?.(store, organizationId, actor.userEmail) || 0;
      if (unread > 0 && (director || teacher)) {
        tasks.push(model.createTaskCard({
          source: model.TASK_SOURCES.MESSAGES,
          priority: model.PRIORITIES.TODAY,
          title: `${unread} unread message${unread === 1 ? "" : "s"}`,
          summary: "Open Family Messaging",
          href: "family_messaging",
          sourceRefId: `unread-${actor.userEmail}`,
          roleVisibility: ["director", "teacher"],
        }));
      }
    } catch { /* ignore */ }

    // Forms awaiting review — lightweight scan
    try {
      const responses = listValues(store.formResponses?.responses || {}).filter((r) => (
        r.organizationId === organizationId && /submitted|pending|needs_review|awaiting/i.test(r.status || "")
      )).slice(0, 6);
      for (const row of responses) {
        if (!director) continue;
        tasks.push(model.createTaskCard({
          source: model.TASK_SOURCES.FORMS,
          priority: model.PRIORITIES.TODAY,
          title: row.formTitle || "Form awaiting review",
          summary: row.status,
          href: `forms-center?responseId=${encodeURIComponent(row.id)}`,
          childId: row.childId || "",
          sourceRefId: row.id,
          roleVisibility: ["director"],
        }));
      }
    } catch { /* ignore */ }

    // Filter by role visibility
    const roleKey = director ? "director" : teacher ? "teacher" : assistant ? "assistant" : "director";
    const filtered = tasks.filter((t) => (t.roleVisibility || []).includes(roleKey));
    return model.sortTasks(model.dedupeTasks(filtered));
  }

  function quickActionsForRole(actor) {
    if (isCurriculumOnly(actor.role)) {
      return [
        { id: "open_lessons", label: "Open lesson plans", href: "lessons" },
        { id: "open_calendar", label: "Curriculum calendar", href: "calendar" },
      ];
    }
    if (isDirectorRole(actor.role)) {
      return [
        { id: "check_in", label: "Check child in", href: "today?action=check_in" },
        { id: "check_out", label: "Check child out", href: "today?action=check_out" },
        { id: "mark_absent", label: "Mark absent", href: "today?action=absent" },
        { id: "move_classroom", label: "Move classroom", href: "today?action=move" },
        { id: "review_form", label: "Review forms", href: "forms-center" },
        { id: "file_document", label: "File document", href: "records_center" },
        { id: "licensing_task", label: "Licensing tasks", href: "licensing_center" },
        { id: "enrollment_tour", label: "Enrollment / tours", href: "enrollment" },
        { id: "send_message", label: "Send message", href: "family_messaging" },
      ];
    }
    if (isTeacherRole(actor.role)) {
      return [
        { id: "check_in", label: "Check child in", href: "today?action=check_in" },
        { id: "check_out", label: "Check child out", href: "today?action=check_out" },
        { id: "mark_absent", label: "Mark absent", href: "today?action=absent" },
        { id: "start_daily_report", label: "Start Daily Report", href: "today?action=daily_report" },
        { id: "group_log", label: "Group log", href: "today?action=group_log" },
        { id: "add_observation", label: "Add observation", href: "today?action=observation" },
        { id: "record_incident", label: "Record incident", href: "today?action=incident" },
        { id: "medication", label: "Medication action", href: "today?action=medication" },
        { id: "send_message", label: "Classroom message", href: "family_messaging" },
      ];
    }
    // Assistant — limited
    return [
      { id: "check_in", label: "Check child in", href: "today?action=check_in" },
      { id: "group_log", label: "Group log", href: "today?action=group_log" },
      { id: "start_daily_report", label: "Start Daily Report", href: "today?action=daily_report" },
    ];
  }

  async function handleStatus(request, response, ctx) {
    const store = readStore();
    const gate = assertTodayAccess(store, request, response, ctx.adminEmail, { action: "view" });
    if (!gate) return;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phase: 15,
      todayHub: true,
      testingBanner: TESTING_BANNER,
      ratioDisclaimer: model.RATIO_DISCLAIMER,
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noStripe: true,
      noLiveAi: true,
      noLegalComplianceClaim: true,
      rolePreview: gate.rolePreview,
      role: gate.actor.role,
    });
  }

  async function handleSeed(request, response, ctx) {
    const store = readStore();
    if (env().liveProduction || !env().allowDirectorCenterAdminPreview) {
      return deny(response, 403, "production_preview_rejected");
    }
    const body = await readJson(request).catch(() => ({}));
    const seeded = body.reset
      ? fixtures.resetPhase15Preview(store, { adminEmail: ctx.adminEmail })
      : fixtures.ensurePhase15Preview(store, { adminEmail: ctx.adminEmail });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, seeded: true, ...seeded, testingBanner: TESTING_BANNER });
  }

  async function handleDashboard(request, response, ctx) {
    const store = readStore();
    const gate = assertTodayAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const { organization, actor } = gate;

    if (isCurriculumOnly(actor.role)) {
      writeStore(store);
      return jsonResponse(response, 200, {
        ok: true,
        testingBanner: TESTING_BANNER,
        role: "curriculum_only",
        view: "curriculum",
        tasks: quickActionsForRole(actor).map((a) => model.createTaskCard({
          source: model.TASK_SOURCES.CALENDAR,
          priority: model.PRIORITIES.INFORMATIONAL,
          title: a.label,
          href: a.href,
          sourceRefId: a.id,
          roleVisibility: ["curriculum"],
        })),
        quickActions: quickActionsForRole(actor),
        classrooms: [],
        attendanceSummary: null,
        ratioDisclaimer: model.RATIO_DISCLAIMER,
        note: "Curriculum Only — center operations hidden.",
      });
    }

    const classroomIds = classroomScopeIds(store, organization.id, actor);
    if ((isTeacherRole(actor.role) || isAssistantRole(actor.role)) && !classroomIds.length) {
      deny(response, 403, "no_classroom_assignment", "No assigned classrooms for this staff member.");
      return;
    }

    const classrooms = buildClassroomSummaries(store, organization.id, classroomIds);
    const tasks = aggregateTasks(store, organization.id, actor, classroomIds);
    const byPriority = {
      urgent: tasks.filter((t) => t.priority === model.PRIORITIES.URGENT),
      today: tasks.filter((t) => t.priority === model.PRIORITIES.TODAY),
      dueSoon: tasks.filter((t) => t.priority === model.PRIORITIES.DUE_SOON),
      informational: tasks.filter((t) => t.priority === model.PRIORITIES.INFORMATIONAL),
      completed: tasks.filter((t) => t.priority === model.PRIORITIES.COMPLETED),
    };
    const allAttendance = attendanceForOrg(store, organization.id, { classroomIds });
    const attendanceSummary = {
      expected: allAttendance.filter((r) => r.status === model.ATTENDANCE_STATUSES.EXPECTED).length,
      present: allAttendance.filter((r) => [model.ATTENDANCE_STATUSES.CHECKED_IN, model.ATTENDANCE_STATUSES.LATE, model.ATTENDANCE_STATUSES.TEMPORARILY_OUT].includes(r.status)).length,
      absent: allAttendance.filter((r) => r.status === model.ATTENDANCE_STATUSES.ABSENT).length,
      checkedOut: allAttendance.filter((r) => [model.ATTENDANCE_STATUSES.CHECKED_OUT, model.ATTENDANCE_STATUSES.EARLY_PICKUP].includes(r.status)).length,
    };
    const staffOnDuty = listValues(store.todayHub.staffDuty).filter((d) => d.organizationId === organization.id && d.onDuty);
    const notifications = listValues(store.todayHub.notifications).filter((n) => {
      if (n.organizationId !== organization.id) return false;
      if (n.audience === "family") return false;
      if (n.adminOnly && !isDirectorRole(actor.role)) return false;
      return true;
    });

    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: TESTING_BANNER,
      ratioDisclaimer: model.RATIO_DISCLAIMER,
      role: actor.role,
      rolePreview: gate.rolePreview,
      view: isDirectorRole(actor.role) ? "director" : isTeacherRole(actor.role) ? "teacher" : "assistant",
      date: model.todayDate(),
      attendanceSummary,
      classrooms,
      tasks,
      tasksByPriority: byPriority,
      quickActions: quickActionsForRole(actor),
      staffOnDuty: staffOnDuty.map((d) => ({
        id: d.id,
        email: d.email,
        classroomId: d.classroomId,
        startedAt: d.startedAt,
      })),
      incidents: listValues(store.todayHub.incidents).filter((r) => r.organizationId === organization.id && (!classroomIds.length || classroomIds.includes(r.classroomId))),
      medicationTasks: listValues(store.todayHub.medicationTasks).filter((r) => r.organizationId === organization.id && (!classroomIds.length || classroomIds.includes(r.classroomId))),
      notifications,
      noTaskDuplication: true,
      featureMarker: "phase15-today-hub",
    });
  }

  async function handleAttendanceList(request, response, ctx, url) {
    const store = readStore();
    const gate = assertTodayAccess(store, request, response, ctx.adminEmail, { action: "attendance" });
    if (!gate) return;
    const classroomIds = classroomScopeIds(store, gate.organization.id, gate.actor);
    const date = url?.searchParams?.get("date") || model.todayDate();
    const rows = attendanceForOrg(store, gate.organization.id, { classroomIds, date });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, date, attendance: rows, testingBanner: TESTING_BANNER });
  }

  async function handleAttendanceAction(request, response, ctx, attendanceId) {
    const store = readStore();
    const gate = assertTodayAccess(store, request, response, ctx.adminEmail, { action: "attendance" });
    if (!gate) return;
    const body = await readJson(request).catch(() => ({}));
    const row = store.todayHub.attendance[attendanceId];
    if (!row || row.organizationId !== gate.organization.id) {
      return deny(response, 404, "not_found");
    }
    const classroomIds = classroomScopeIds(store, gate.organization.id, gate.actor);
    if (!isDirectorRole(gate.actor.role) && !classroomIds.includes(row.classroomId)) {
      return deny(response, 403, "classroom_denied");
    }
    if (isAssistantRole(gate.actor.role)) {
      const allowed = new Set(["check_in", "mark_absent", "group_log_note"]);
      if (!allowed.has(body.action)) {
        return deny(response, 403, "assistant_action_denied", "Assistant permissions do not allow this attendance action.");
      }
    }

    const patch = { action: body.action || "update", reason: body.reason || "", correctionReason: body.correctionReason || "" };
    if (body.action === "check_in") {
      patch.status = model.ATTENDANCE_STATUSES.CHECKED_IN;
      patch.checkedInAt = model.nowIso();
      patch.dropOffPerson = body.dropOffPerson || row.dropOffPerson;
      patch.pickupVerification = model.PICKUP_VERIFICATION.NOT_APPLICABLE;
    } else if (body.action === "check_out" || body.action === "early_pickup") {
      patch.status = body.action === "early_pickup" ? model.ATTENDANCE_STATUSES.EARLY_PICKUP : model.ATTENDANCE_STATUSES.CHECKED_OUT;
      patch.checkedOutAt = model.nowIso();
      patch.pickupPerson = body.pickupPerson || "";
      patch.pickupVerification = body.pickupVerification || model.PICKUP_VERIFICATION.VERIFIED;
      if (body.pickupVerification === model.PICKUP_VERIFICATION.UNAUTHORIZED_WARNING) {
        patch.detail = "Unauthorized pickup warning recorded";
      }
    } else if (body.action === "mark_absent") {
      patch.status = model.ATTENDANCE_STATUSES.ABSENT;
    } else if (body.action === "mark_late") {
      patch.status = model.ATTENDANCE_STATUSES.LATE;
      patch.checkedInAt = model.nowIso();
    } else if (body.action === "temporarily_out") {
      patch.status = model.ATTENDANCE_STATUSES.TEMPORARILY_OUT;
    } else if (body.action === "move_classroom") {
      if (!body.classroomId) return deny(response, 400, "classroom_required");
      if (!isDirectorRole(gate.actor.role) && !classroomIds.includes(body.classroomId)) {
        return deny(response, 403, "classroom_denied");
      }
      patch.status = model.ATTENDANCE_STATUSES.MOVED;
      patch.movedFromClassroomId = row.classroomId;
      patch.classroomId = body.classroomId;
    } else if (body.status) {
      patch.status = body.status;
    }

    const updated = model.applyAttendanceAction(store, row, patch, {
      email: gate.actor.userEmail,
      role: gate.actor.role,
    });
    const config = listValues(store.todayHub.ratioConfigs).find((c) => c.classroomId === updated.classroomId);
    const present = attendanceForOrg(store, gate.organization.id, { classroomIds: [updated.classroomId] })
      .filter((r) => [model.ATTENDANCE_STATUSES.CHECKED_IN, model.ATTENDANCE_STATUSES.LATE, model.ATTENDANCE_STATUSES.TEMPORARILY_OUT].includes(r.status)).length;
    const staffOnDuty = listValues(store.todayHub.staffDuty).filter((d) => d.classroomId === updated.classroomId && d.onDuty).length;
    const evaluation = model.evaluateRatio({ childrenPresent: present, qualifiedStaff: staffOnDuty, config });
    model.snapshotRatio(store, {
      organizationId: gate.organization.id,
      classroomId: updated.classroomId,
      evaluation,
      actorEmail: gate.actor.userEmail,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      attendance: updated,
      ratio: evaluation,
      ratioDisclaimer: model.RATIO_DISCLAIMER,
      historyPreserved: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleAttendanceHistory(request, response, ctx, attendanceId) {
    const store = readStore();
    const gate = assertTodayAccess(store, request, response, ctx.adminEmail, { action: "attendance" });
    if (!gate) return;
    const row = store.todayHub.attendance[attendanceId];
    if (!row || row.organizationId !== gate.organization.id) return deny(response, 404, "not_found");
    const history = listValues(store.todayHub.attendanceHistory)
      .filter((h) => h.attendanceId === attendanceId)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    jsonResponse(response, 200, { ok: true, attendanceId, history, testingBanner: TESTING_BANNER });
  }

  async function handleRatios(request, response, ctx) {
    const store = readStore();
    const gate = assertTodayAccess(store, request, response, ctx.adminEmail, { action: "ratios" });
    if (!gate) return;
    const classroomIds = classroomScopeIds(store, gate.organization.id, gate.actor);
    const classrooms = buildClassroomSummaries(store, gate.organization.id, classroomIds);
    const history = listValues(store.todayHub.ratioHistory)
      .filter((h) => h.organizationId === gate.organization.id && classroomIds.includes(h.classroomId))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 50);
    jsonResponse(response, 200, {
      ok: true,
      disclaimer: model.RATIO_DISCLAIMER,
      wording: "Based on provider-configured checklist — not a universal compliance label",
      classrooms: classrooms.map((c) => ({ classroomId: c.classroomId, name: c.name, ratio: c.ratio, counts: c.counts })),
      history,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleNotifications(request, response, ctx) {
    const store = readStore();
    const gate = assertTodayAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const notes = listValues(store.todayHub.notifications).filter((n) => {
      if (n.organizationId !== gate.organization.id) return false;
      if (n.audience === "family") return false;
      if (n.adminOnly && !isDirectorRole(gate.actor.role)) return false;
      return true;
    });
    jsonResponse(response, 200, { ok: true, notifications: notes, testingBanner: TESTING_BANNER, noExternalDelivery: true });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/dashboard`) return (req, res, ctx) => handleDashboard(req, res, ctx);
    if (method === "GET" && path === `${BASE}/attendance`) return (req, res, ctx) => handleAttendanceList(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/ratios`) return (req, res, ctx) => handleRatios(req, res, ctx);
    if (method === "GET" && path === `${BASE}/notifications`) return (req, res, ctx) => handleNotifications(req, res, ctx);
    const att = path.match(/^\/api\/director-center\/today\/attendance\/([^/]+)(.*)$/);
    if (att) {
      const id = decodeURIComponent(att[1]);
      const rest = att[2] || "";
      if (method === "POST" && rest === "/action") return (req, res, ctx) => handleAttendanceAction(req, res, ctx, id);
      if (method === "GET" && rest === "/history") return (req, res, ctx) => handleAttendanceHistory(req, res, ctx, id);
    }
    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createTodayHubApi,
  BASE,
};
