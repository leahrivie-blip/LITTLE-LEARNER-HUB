/**
 * Director Center Phase 2 API — admin-only private preview.
 * Fake preview data only. No production migration. No emails. No Stripe.
 */
const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const entitlements = require("../scripts/entitlement-model.js");
const fixtures = require("../scripts/director-center-preview-fixtures.js");

function ensureCollections(store) {
  return foundation.ensureFoundationStore(store);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function activeStatus(value) {
  return !value || value === foundation.ASSIGNMENT_STATUS.ACTIVE || value === foundation.STAFF_STATUS.ACTIVE;
}

function isActiveClassroom(room) {
  return room && room.status === foundation.ASSIGNMENT_STATUS.ACTIVE;
}

function isArchivedClassroom(room) {
  return room && room.status === foundation.ASSIGNMENT_STATUS.ARCHIVED;
}

function findPreviewOrg(store, adminEmail) {
  const email = String(adminEmail || "").trim().toLowerCase();
  return listValues(store.organizations).find((org) => (
    org && org.preview === true && String(org.ownerEmail || "").toLowerCase() === email
  )) || null;
}

function ensurePreview(store, adminEmail, scenario = "") {
  ensureCollections(store);
  let org = findPreviewOrg(store, adminEmail);
  if (!org || scenario) {
    fixtures.seedPreviewSuite(store, {
      adminEmail,
      scenario: scenario || store.directorCenterPreview?.scenario || "small_center",
    });
    org = findPreviewOrg(store, adminEmail);
  }
  const programProfile = listValues(store.programProfiles).find((row) => row.organizationId === org.id);
  const entitlement = listValues(store.organizationEntitlements).find((row) => row.organizationId === org.id)
    || entitlements.createOrganizationEntitlementRecord({
      organizationId: org.id,
      basePlanKey: entitlements.PLAN_KEYS.SMALL_CENTER,
    });
  if (!store.organizationEntitlements[entitlement.id]) {
    entitlement.preview = true;
    store.organizationEntitlements[entitlement.id] = entitlement;
  }
  return { organization: org, programProfile, entitlement };
}

function staffExcludingOwner(store, organizationId) {
  return listValues(store.staffMemberships).filter((row) => (
    row.organizationId === organizationId
    && row.isBillingOwner !== true
    && row.status !== foundation.STAFF_STATUS.DEACTIVATED
    && row.status !== foundation.STAFF_STATUS.INACTIVE
  ));
}

function activeClassrooms(store, organizationId) {
  return listValues(store.classrooms).filter((row) => row.organizationId === organizationId && isActiveClassroom(row));
}

function computeLimits(store, organizationId, entitlement) {
  const classroomsUsed = activeClassrooms(store, organizationId).length;
  const staffUsed = staffExcludingOwner(store, organizationId).length;
  return entitlements.evaluatePlanLimits({
    basePlanKey: entitlement.basePlanKey || entitlements.PLAN_KEYS.SMALL_CENTER,
    classroomAddOnQuantity: entitlement.classroomAddOnQuantity || 0,
    activeClassroomCount: classroomsUsed,
    invitedStaffCountExcludingOwner: staffUsed,
    billingInterval: entitlement.billingInterval || entitlements.BILLING_INTERVALS.MONTHLY,
  });
}

function activeChildAssignment(store, organizationId, childId) {
  return listValues(store.classroomChildAssignments).find((row) => (
    row.organizationId === organizationId
    && row.childId === childId
    && activeStatus(row.status)
    && !row.endsAt
  )) || null;
}

function classroomChildCount(store, organizationId, classroomId) {
  return listValues(store.classroomChildAssignments).filter((row) => (
    row.organizationId === organizationId
    && row.classroomId === classroomId
    && activeStatus(row.status)
    && !row.endsAt
  )).length;
}

function classroomStaff(store, organizationId, classroomId) {
  const assignments = listValues(store.classroomStaffAssignments).filter((row) => (
    row.organizationId === organizationId
    && row.classroomId === classroomId
    && activeStatus(row.status)
    && !row.endsAt
  ));
  return assignments.map((assignment) => {
    const member = store.staffMemberships[assignment.staffMembershipId] || null;
    return { assignment, member };
  }).filter((row) => row.member);
}

function attentionItems(store, organizationId) {
  const items = [];
  const unassignedChildren = listValues(store.childRecords).filter((child) => (
    child.organizationId === organizationId
    && !activeChildAssignment(store, organizationId, child.id)
  )).length;
  if (unassignedChildren) {
    items.push({
      type: "unassigned_children",
      severity: "warning",
      label: `${unassignedChildren} child${unassignedChildren === 1 ? "" : "ren"} unassigned`,
    });
  }
  const staffWithoutRooms = listValues(store.staffMemberships).filter((member) => {
    if (member.organizationId !== organizationId) return false;
    if (member.isBillingOwner) return false;
    if (member.status !== foundation.STAFF_STATUS.ACTIVE) return false;
    const assigned = listValues(store.classroomStaffAssignments).some((row) => (
      row.staffMembershipId === member.id && activeStatus(row.status) && !row.endsAt
    ));
    return !assigned;
  }).length;
  if (staffWithoutRooms) {
    items.push({
      type: "unassigned_staff",
      severity: "warning",
      label: `${staffWithoutRooms} staff without classroom assignments`,
    });
  }
  const pending = listValues(store.staffMemberships).filter((member) => (
    member.organizationId === organizationId
    && member.status === foundation.STAFF_STATUS.INVITATION_PENDING
  )).length;
  if (pending) {
    items.push({
      type: "pending_invites",
      severity: "info",
      label: `${pending} staff invitation${pending === 1 ? "" : "s"} pending`,
    });
  }
  return items;
}

function overviewPayload(store, ctx) {
  const { organization, programProfile, entitlement } = ctx;
  const limits = computeLimits(store, organization.id, entitlement);
  const classrooms = listValues(store.classrooms).filter((row) => row.organizationId === organization.id);
  const active = classrooms.filter(isActiveClassroom);
  const children = listValues(store.childRecords).filter((row) => row.organizationId === organization.id);
  const unassignedChildren = children.filter((child) => !activeChildAssignment(store, organization.id, child.id));
  const staff = listValues(store.staffMemberships).filter((row) => row.organizationId === organization.id);
  const staffWithoutAssignments = staff.filter((member) => {
    if (member.isBillingOwner || member.status !== foundation.STAFF_STATUS.ACTIVE) return false;
    return !listValues(store.classroomStaffAssignments).some((row) => (
      row.staffMembershipId === member.id && activeStatus(row.status) && !row.endsAt
    ));
  });

  return {
    ok: true,
    phase: 2,
    preview: true,
    adminOnly: true,
    label: fixtures.PREVIEW_MARKER,
    fakeDataOnly: true,
    emailSent: false,
    stripeTouched: false,
    organization,
    programProfile,
    entitlement: { ...entitlement, live: false },
    limits,
    metrics: {
      activeClassrooms: active.length,
      classroomLimit: limits.classroomLimit,
      staffAccounts: staffExcludingOwner(store, organization.id).length,
      staffAccountLimit: limits.staffAccountLimit,
      activeChildren: children.length,
      unassignedChildren: unassignedChildren.length,
      staffWithoutAssignments: staffWithoutAssignments.length,
    },
    classrooms: active.map((room) => ({
      id: room.id,
      name: room.name,
      ageGroupDefault: room.ageGroupDefault,
      currentCurriculum: room.currentCurriculum || null,
      enrollmentCount: classroomChildCount(store, organization.id, room.id),
    })),
    recentActivity: active.flatMap((room) => (
      (room.recentActivity || []).map((item) => ({ ...item, classroomId: room.id, classroomName: room.name }))
    )).slice(0, 8),
    attention: attentionItems(store, organization.id),
    quickActions: [
      "add_classroom",
      "invite_staff",
      "assign_staff",
      "assign_children",
      "view_classroom_calendars",
      "edit_program_profile",
    ],
    navigation: [
      "overview",
      "classrooms",
      "staff",
      "children",
      "program_profile",
      "roles_permissions",
    ],
  };
}

function createDirectorCenterApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
}) {
  function withPreview(adminEmail, scenario = "") {
    const store = readStore();
    const ctx = ensurePreview(store, adminEmail, scenario);
    return { store, ...ctx };
  }

  async function handleSeed(request, response, context = {}) {
    const body = await readJson(request);
    const scenario = String(body.scenario || "small_center").trim();
    const store = readStore();
    fixtures.seedPreviewSuite(store, { adminEmail: context.adminEmail, scenario });
    writeStore(store);
    const ctx = ensurePreview(store, context.adminEmail);
    jsonResponse(response, 200, {
      ok: true,
      seeded: true,
      scenario,
      label: fixtures.PREVIEW_MARKER,
      emailSent: false,
      stripeTouched: false,
      overview: overviewPayload(store, ctx),
    });
  }

  async function handleStatus(request, response, context = {}) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    writeStore(store);
    const limits = computeLimits(store, ctx.organization.id, ctx.entitlement);
    jsonResponse(response, 200, {
      ok: true,
      phase: 2,
      preview: true,
      adminOnly: true,
      label: fixtures.PREVIEW_MARKER,
      organizationId: ctx.organization.id,
      limits,
      counts: {
        classrooms: activeClassrooms(store, ctx.organization.id).length,
        staffMemberships: staffExcludingOwner(store, ctx.organization.id).length,
        children: listValues(store.childRecords).filter((row) => row.organizationId === ctx.organization.id).length,
      },
    });
  }

  async function handleOverview(request, response, context = {}) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, overviewPayload(store, ctx));
  }

  async function handleListClassrooms(request, response, context = {}, url) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    writeStore(store);
    const status = String(url?.searchParams?.get("status") || "all").toLowerCase();
    const q = String(url?.searchParams?.get("q") || "").trim().toLowerCase();
    let rooms = listValues(store.classrooms).filter((row) => row.organizationId === ctx.organization.id);
    if (status === "active") rooms = rooms.filter(isActiveClassroom);
    if (status === "archived") rooms = rooms.filter(isArchivedClassroom);
    if (q) {
      rooms = rooms.filter((row) => (
        row.name.toLowerCase().includes(q)
        || String(row.ageGroupDefault || "").toLowerCase().includes(q)
        || String(row.description || "").toLowerCase().includes(q)
      ));
    }
    jsonResponse(response, 200, {
      ok: true,
      organizationId: ctx.organization.id,
      limits: computeLimits(store, ctx.organization.id, ctx.entitlement),
      classrooms: rooms.map((room) => ({
        ...room,
        enrollmentCount: classroomChildCount(store, ctx.organization.id, room.id),
        staff: classroomStaff(store, ctx.organization.id, room.id).map(({ member }) => ({
          id: member.id,
          displayName: member.displayName,
          role: member.role,
          email: member.userEmail,
        })),
      })),
    });
  }

  async function handleGetClassroom(request, response, context = {}, classroomId) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    const room = store.classrooms[classroomId];
    if (!room || room.organizationId !== ctx.organization.id) {
      jsonResponse(response, 404, { error: "Classroom was not found." });
      return;
    }
    const staff = classroomStaff(store, ctx.organization.id, room.id);
    const childAssignments = listValues(store.classroomChildAssignments).filter((row) => (
      row.organizationId === ctx.organization.id
      && row.classroomId === room.id
      && activeStatus(row.status)
      && !row.endsAt
    ));
    const children = childAssignments.map((row) => store.childRecords[row.childId]).filter(Boolean);
    jsonResponse(response, 200, {
      ok: true,
      classroom: {
        ...room,
        enrollmentCount: children.length,
      },
      leadTeachers: staff.filter(({ member }) => (
        member.role === orgPermissions.ORG_ROLES.LEAD_TEACHER
        || member.role === orgPermissions.ORG_ROLES.DIRECTOR
        || member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
      )).map(({ member }) => member),
      assistants: staff.filter(({ member }) => member.role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF).map(({ member }) => member),
      children,
      weeklyCurriculum: room.currentCurriculum || null,
      calendar: {
        classroomId: room.id,
        note: "Uses permanent classroom ID. Existing Calendar system remains the source of truth.",
        items: [],
      },
      assignedLessonPlans: room.currentCurriculum ? [room.currentCurriculum] : [],
      recentDailyReports: (room.recentActivity || []).filter((item) => item.type === "daily_report"),
      recentObservations: (room.recentActivity || []).filter((item) => item.type === "observation"),
      childProfileLinks: children.map((child) => ({
        childId: child.id,
        displayName: child.displayName,
        legacyChildId: child.legacyChildId || "",
      })),
    });
  }

  async function handleCreateClassroom(request, response, context = {}) {
    const body = await readJson(request);
    const { store, ...ctx } = withPreview(context.adminEmail);
    const limits = computeLimits(store, ctx.organization.id, ctx.entitlement);
    const gate = entitlements.canCreateClassroom(limits);
    if (!gate.allowed) {
      jsonResponse(response, 409, {
        error: gate.error,
        code: gate.code,
        limits,
        upgradeRecommendation: limits.upgradeRecommendation,
        homeDaycareHint: limits.messages.homeDaycareUpgrade || "",
      });
      return;
    }
    if (ctx.entitlement.basePlanKey === entitlements.PLAN_KEYS.HOME_DAYCARE && limits.classroomsUsed >= 1) {
      jsonResponse(response, 409, {
        error: limits.messages.homeDaycareUpgrade || "Upgrade to a center plan for more classrooms.",
        code: "home_daycare_upgrade_recommended",
        limits,
      });
      return;
    }
    const classroom = foundation.createClassroomRecord({
      organizationId: ctx.organization.id,
      name: String(body.name || "").trim() || "Untitled Classroom",
      ageGroupDefault: String(body.ageGroupDefault || body.ageGroup || "").trim(),
      description: String(body.description || "").trim(),
      color: String(body.color || "#8b6be8").trim(),
      capacity: body.capacity,
      notes: String(body.notes || "").trim(),
      createdByUserId: `admin:${normalizeEmail(context.adminEmail || "")}`,
    });
    classroom.preview = true;
    classroom.currentCurriculum = {
      weekLabel: "Week of Preview",
      lessonPlanTitle: "Getting Started",
      lessonPlanId: "preview-lesson-new",
    };
    store.classrooms[classroom.id] = classroom;
    if (ctx.programProfile) {
      ctx.programProfile.classroomCount = activeClassrooms(store, ctx.organization.id).length;
      ctx.programProfile.updatedAt = new Date().toISOString();
      store.programProfiles[ctx.programProfile.id] = ctx.programProfile;
    }
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      classroom,
      limits: computeLimits(store, ctx.organization.id, ctx.entitlement),
    });
  }

  async function handleUpdateClassroom(request, response, context = {}, classroomId) {
    const body = await readJson(request);
    const { store, ...ctx } = withPreview(context.adminEmail);
    const room = store.classrooms[classroomId];
    if (!room || room.organizationId !== ctx.organization.id) {
      jsonResponse(response, 404, { error: "Classroom was not found." });
      return;
    }
    const next = {
      ...room,
      name: body.name !== undefined ? String(body.name || "").trim() : room.name,
      ageGroupDefault: body.ageGroupDefault !== undefined || body.ageGroup !== undefined
        ? String(body.ageGroupDefault || body.ageGroup || "").trim()
        : room.ageGroupDefault,
      description: body.description !== undefined ? String(body.description || "").trim() : room.description,
      color: body.color !== undefined ? String(body.color || "").trim() : room.color,
      capacity: body.capacity !== undefined ? (body.capacity === null || body.capacity === "" ? null : Math.max(0, Number(body.capacity) || 0)) : room.capacity,
      notes: body.notes !== undefined ? String(body.notes || "").trim() : room.notes,
      updatedAt: new Date().toISOString(),
    };
    store.classrooms[classroomId] = next;
    writeStore(store);
    jsonResponse(response, 200, { ok: true, classroom: next });
  }

  async function handleArchiveClassroom(request, response, context = {}, classroomId) {
    const body = await readJson(request);
    const { store, ...ctx } = withPreview(context.adminEmail);
    const room = store.classrooms[classroomId];
    if (!room || room.organizationId !== ctx.organization.id) {
      jsonResponse(response, 404, { error: "Classroom was not found." });
      return;
    }
    if (!body.confirm) {
      const assignedChildren = classroomChildCount(store, ctx.organization.id, room.id);
      const assignedStaff = classroomStaff(store, ctx.organization.id, room.id).length;
      jsonResponse(response, 200, {
        ok: true,
        requiresConfirmation: true,
        classroomId: room.id,
        assignedChildren,
        assignedStaff,
        warning: "Archiving makes this classroom inactive. Children, staff, calendars, lesson plans, reports, and history are preserved.",
        options: {
          moveChildren: true,
          moveStaff: true,
        },
      });
      return;
    }
    const now = new Date().toISOString();
    if (Array.isArray(body.moveChildrenToClassroomId) || body.moveChildrenToClassroomId) {
      const targetId = String(body.moveChildrenToClassroomId || "");
      const target = store.classrooms[targetId];
      if (target && target.organizationId === ctx.organization.id && isActiveClassroom(target)) {
        listValues(store.classroomChildAssignments)
          .filter((row) => row.classroomId === room.id && activeStatus(row.status) && !row.endsAt)
          .forEach((row) => {
            row.status = foundation.ASSIGNMENT_STATUS.HISTORICAL;
            row.endsAt = now;
            row.updatedAt = now;
            store.classroomChildAssignments[row.id] = row;
            const next = foundation.createClassroomChildAssignmentRecord({
              organizationId: ctx.organization.id,
              classroomId: targetId,
              childId: row.childId,
              assignedByUserId: `admin:${normalizeEmail(context.adminEmail || "")}`,
            });
            next.preview = true;
            store.classroomChildAssignments[next.id] = next;
          });
      }
    }
    if (body.moveStaffToClassroomId) {
      const targetId = String(body.moveStaffToClassroomId || "");
      const target = store.classrooms[targetId];
      if (target && target.organizationId === ctx.organization.id && isActiveClassroom(target)) {
        listValues(store.classroomStaffAssignments)
          .filter((row) => row.classroomId === room.id && activeStatus(row.status) && !row.endsAt)
          .forEach((row) => {
            row.status = foundation.ASSIGNMENT_STATUS.HISTORICAL;
            row.endsAt = now;
            row.updatedAt = now;
            store.classroomStaffAssignments[row.id] = row;
            const next = foundation.createClassroomStaffAssignmentRecord({
              organizationId: ctx.organization.id,
              classroomId: targetId,
              staffMembershipId: row.staffMembershipId,
              userId: row.userId,
            });
            next.preview = true;
            store.classroomStaffAssignments[next.id] = next;
          });
      }
    }
    room.status = foundation.ASSIGNMENT_STATUS.ARCHIVED;
    room.archivedAt = now;
    room.updatedAt = now;
    store.classrooms[room.id] = room;
    if (ctx.programProfile) {
      ctx.programProfile.classroomCount = activeClassrooms(store, ctx.organization.id).length;
      ctx.programProfile.updatedAt = now;
      store.programProfiles[ctx.programProfile.id] = ctx.programProfile;
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, classroom: room, preserved: true });
  }

  async function handleRestoreClassroom(request, response, context = {}, classroomId) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    const room = store.classrooms[classroomId];
    if (!room || room.organizationId !== ctx.organization.id) {
      jsonResponse(response, 404, { error: "Classroom was not found." });
      return;
    }
    const limits = computeLimits(store, ctx.organization.id, ctx.entitlement);
    const gate = entitlements.canCreateClassroom(limits);
    if (!gate.allowed) {
      jsonResponse(response, 409, { error: gate.error, code: gate.code, limits });
      return;
    }
    room.status = foundation.ASSIGNMENT_STATUS.ACTIVE;
    room.archivedAt = "";
    room.updatedAt = new Date().toISOString();
    store.classrooms[room.id] = room;
    if (ctx.programProfile) {
      ctx.programProfile.classroomCount = activeClassrooms(store, ctx.organization.id).length;
      ctx.programProfile.updatedAt = room.updatedAt;
      store.programProfiles[ctx.programProfile.id] = ctx.programProfile;
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, classroom: room });
  }

  async function handleListStaff(request, response, context = {}, url) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    writeStore(store);
    const role = String(url?.searchParams?.get("role") || "").trim().toLowerCase();
    const status = String(url?.searchParams?.get("status") || "").trim().toLowerCase();
    const classroomId = String(url?.searchParams?.get("classroomId") || "").trim();
    const q = String(url?.searchParams?.get("q") || "").trim().toLowerCase();
    let staff = listValues(store.staffMemberships).filter((row) => row.organizationId === ctx.organization.id);
    if (role) staff = staff.filter((row) => String(row.role || "").toLowerCase().includes(role));
    if (status) staff = staff.filter((row) => String(row.status || "").toLowerCase() === status);
    if (q) {
      staff = staff.filter((row) => (
        String(row.displayName || "").toLowerCase().includes(q)
        || String(row.userEmail || "").toLowerCase().includes(q)
      ));
    }
    const enriched = staff.map((member) => {
      const assignments = listValues(store.classroomStaffAssignments).filter((row) => (
        row.staffMembershipId === member.id && activeStatus(row.status) && !row.endsAt
      ));
      const classrooms = assignments.map((row) => store.classrooms[row.classroomId]).filter(Boolean);
      if (classroomId && !assignments.some((row) => row.classroomId === classroomId)) return null;
      return {
        ...member,
        assignedClassrooms: classrooms.map((room) => ({ id: room.id, name: room.name })),
        permissions: orgPermissions.ROLE_PERMISSIONS[orgPermissions.normalizeOrgRole(member.role)] || [],
      };
    }).filter(Boolean);
    jsonResponse(response, 200, {
      ok: true,
      limits: computeLimits(store, ctx.organization.id, ctx.entitlement),
      staff: enriched,
      note: "Preview invitations do not send email. Connected conceptually to existing /api/staff/invites.",
    });
  }

  async function handleInviteStaff(request, response, context = {}) {
    const body = await readJson(request);
    const { store, ...ctx } = withPreview(context.adminEmail);
    const limits = computeLimits(store, ctx.organization.id, ctx.entitlement);
    const gate = entitlements.canInviteStaff(limits);
    if (!gate.allowed) {
      jsonResponse(response, 409, { error: gate.error, code: gate.code, limits });
      return;
    }
    const email = normalizeEmail(body.email || body.userEmail || "");
    if (!email) {
      jsonResponse(response, 400, { error: "Staff email is required." });
      return;
    }
    const existing = listValues(store.staffMemberships).find((row) => (
      row.organizationId === ctx.organization.id && row.userEmail === email
    ));
    if (existing && existing.status !== foundation.STAFF_STATUS.DEACTIVATED) {
      jsonResponse(response, 409, { error: "A staff membership already exists for this email.", membership: existing });
      return;
    }
    const member = foundation.createStaffMembershipRecord({
      organizationId: ctx.organization.id,
      userEmail: email,
      displayName: String(body.displayName || body.name || email.split("@")[0]).trim(),
      role: orgPermissions.normalizeOrgRole(body.role || "lead_teacher") || orgPermissions.ORG_ROLES.LEAD_TEACHER,
      status: foundation.STAFF_STATUS.INVITATION_PENDING,
      invitedByUserId: `admin:${normalizeEmail(context.adminEmail || "")}`,
      invitationExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    member.preview = true;
    member.emailSent = false;
    member.previewInviteOnly = true;
    store.staffMemberships[member.id] = member;

    const classroomIds = Array.isArray(body.classroomIds) ? body.classroomIds : (body.classroomId ? [body.classroomId] : []);
    classroomIds.forEach((classroomId) => {
      const room = store.classrooms[String(classroomId)];
      if (!room || room.organizationId !== ctx.organization.id || !isActiveClassroom(room)) return;
      const assignment = foundation.createClassroomStaffAssignmentRecord({
        organizationId: ctx.organization.id,
        classroomId: room.id,
        staffMembershipId: member.id,
        userId: member.userId || "",
      });
      assignment.preview = true;
      store.classroomStaffAssignments[assignment.id] = assignment;
    });

    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      membership: member,
      emailSent: false,
      limits: computeLimits(store, ctx.organization.id, ctx.entitlement),
    });
  }

  async function handleUpdateStaff(request, response, context = {}, staffId) {
    const body = await readJson(request);
    const { store, ...ctx } = withPreview(context.adminEmail);
    const member = store.staffMemberships[staffId];
    if (!member || member.organizationId !== ctx.organization.id) {
      jsonResponse(response, 404, { error: "Staff membership was not found." });
      return;
    }
    if (body.role !== undefined) {
      member.role = orgPermissions.normalizeOrgRole(body.role) || member.role;
    }
    if (body.displayName !== undefined) member.displayName = String(body.displayName || "").trim();
    if (body.status === "resend_invite" && member.status === foundation.STAFF_STATUS.INVITATION_PENDING) {
      member.invitationExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      member.emailSent = false;
    }
    if (body.status === "cancel_invite" && member.status === foundation.STAFF_STATUS.INVITATION_PENDING) {
      member.status = foundation.STAFF_STATUS.INACTIVE;
      member.endedAt = new Date().toISOString();
    }
    if (body.status === "deactivate") {
      member.status = foundation.STAFF_STATUS.DEACTIVATED;
      member.deactivatedAt = new Date().toISOString();
      member.deactivationReason = String(body.reason || "Deactivated in preview").trim();
    }
    if (body.status === "restore") {
      member.status = foundation.STAFF_STATUS.ACTIVE;
      member.deactivatedAt = "";
      member.deactivationReason = "";
      member.endedAt = "";
    }
    if (body.status === "activate" && member.status === foundation.STAFF_STATUS.INVITATION_PENDING) {
      member.status = foundation.STAFF_STATUS.ACTIVE;
      member.userId = member.userId || `preview:${member.userEmail}`;
      member.lastActiveAt = new Date().toISOString();
    }
    member.updatedAt = new Date().toISOString();
    store.staffMemberships[member.id] = member;

    if (Array.isArray(body.classroomIds)) {
      const now = new Date().toISOString();
      listValues(store.classroomStaffAssignments)
        .filter((row) => row.staffMembershipId === member.id && activeStatus(row.status) && !row.endsAt)
        .forEach((row) => {
          row.status = foundation.ASSIGNMENT_STATUS.HISTORICAL;
          row.endsAt = now;
          row.updatedAt = now;
          store.classroomStaffAssignments[row.id] = row;
        });
      body.classroomIds.forEach((classroomId) => {
        const room = store.classrooms[String(classroomId)];
        if (!room || room.organizationId !== ctx.organization.id || !isActiveClassroom(room)) return;
        const assignment = foundation.createClassroomStaffAssignmentRecord({
          organizationId: ctx.organization.id,
          classroomId: room.id,
          staffMembershipId: member.id,
          userId: member.userId || "",
        });
        assignment.preview = true;
        store.classroomStaffAssignments[assignment.id] = assignment;
      });
    }

    writeStore(store);
    jsonResponse(response, 200, { ok: true, membership: member, emailSent: false });
  }

  async function handleListChildren(request, response, context = {}, url) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    writeStore(store);
    const classroomId = String(url?.searchParams?.get("classroomId") || "").trim();
    const unassigned = String(url?.searchParams?.get("unassigned") || "") === "1";
    const q = String(url?.searchParams?.get("q") || "").trim().toLowerCase();
    let children = listValues(store.childRecords).filter((row) => row.organizationId === ctx.organization.id);
    if (q) children = children.filter((row) => String(row.displayName || "").toLowerCase().includes(q));
    const enriched = children.map((child) => {
      const active = activeChildAssignment(store, ctx.organization.id, child.id);
      const history = listValues(store.classroomChildAssignments)
        .filter((row) => row.childId === child.id)
        .sort((a, b) => String(b.startsAt || "").localeCompare(String(a.startsAt || "")));
      return {
        ...child,
        activeAssignment: active,
        classroomId: active?.classroomId || "",
        classroomName: active ? (store.classrooms[active.classroomId]?.name || "") : "",
        history,
      };
    }).filter((child) => {
      if (unassigned) return !child.activeAssignment;
      if (classroomId) return child.classroomId === classroomId;
      return true;
    });
    jsonResponse(response, 200, { ok: true, children: enriched });
  }

  async function handleAssignChildren(request, response, context = {}) {
    const body = await readJson(request);
    const { store, ...ctx } = withPreview(context.adminEmail);
    const classroomId = String(body.classroomId || "").trim();
    const room = store.classrooms[classroomId];
    if (!room || room.organizationId !== ctx.organization.id || !isActiveClassroom(room)) {
      jsonResponse(response, 404, { error: "Active classroom was not found." });
      return;
    }
    const childIds = Array.isArray(body.childIds)
      ? body.childIds.map(String)
      : (body.childId ? [String(body.childId)] : []);
    const created = [];
    const now = new Date().toISOString();
    const actor = `admin:${normalizeEmail(context.adminEmail || "")}`;

    if (!childIds.length && body.displayName) {
      const child = foundation.createChildRecord({
        organizationId: ctx.organization.id,
        displayName: String(body.displayName || "").trim() || "Child",
        legacyChildId: String(body.legacyChildId || "").trim(),
      });
      child.preview = true;
      store.childRecords[child.id] = child;
      childIds.push(child.id);
    }

    childIds.forEach((childId) => {
      let child = store.childRecords[childId];
      if (!child) return;
      if (child.organizationId !== ctx.organization.id) return;
      const previous = activeChildAssignment(store, ctx.organization.id, childId);
      if (previous) {
        previous.status = foundation.ASSIGNMENT_STATUS.HISTORICAL;
        previous.endsAt = now;
        previous.updatedAt = now;
        store.classroomChildAssignments[previous.id] = previous;
      }
      const assignment = foundation.createClassroomChildAssignmentRecord({
        organizationId: ctx.organization.id,
        classroomId,
        childId,
        assignedByUserId: actor,
      });
      assignment.preview = true;
      store.classroomChildAssignments[assignment.id] = assignment;
      created.push({ child, assignment, previousAssignmentId: previous?.id || "" });
    });

    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      assignments: created,
      // Compatibility for single-child callers (Phase 1 foundation tests).
      child: created[0]?.child || null,
      assignment: created[0]?.assignment || null,
    });
  }

  async function handleGetProgramProfile(request, response, context = {}) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      organization: ctx.organization,
      programProfile: ctx.programProfile,
      limits: computeLimits(store, ctx.organization.id, ctx.entitlement),
    });
  }

  async function handleUpdateProgramProfile(request, response, context = {}) {
    const body = await readJson(request);
    const { store, ...ctx } = withPreview(context.adminEmail);
    const profile = store.programProfiles[ctx.programProfile.id];
    const next = {
      ...profile,
      programName: body.programName !== undefined ? String(body.programName || "").trim() : profile.programName,
      logoUrl: body.logoUrl !== undefined ? String(body.logoUrl || "").trim() : profile.logoUrl,
      logoAssetId: body.logoAssetId !== undefined ? String(body.logoAssetId || "").trim() : profile.logoAssetId,
      directorOwnerName: body.directorOwnerName !== undefined ? String(body.directorOwnerName || "").trim() : profile.directorOwnerName,
      address: body.address !== undefined ? String(body.address || "").trim() : profile.address,
      phone: body.phone !== undefined ? String(body.phone || "").trim() : profile.phone,
      email: body.email !== undefined ? normalizeEmail(body.email) : profile.email,
      licenseNumber: body.licenseNumber !== undefined ? String(body.licenseNumber || "").trim() : profile.licenseNumber,
      website: body.website !== undefined ? String(body.website || "").trim() : profile.website,
      programType: body.programType !== undefined ? String(body.programType || "").trim() : profile.programType,
      physicalLocationId: body.physicalLocationId !== undefined ? String(body.physicalLocationId || "").trim() : profile.physicalLocationId,
      classroomCount: activeClassrooms(store, ctx.organization.id).length,
      updatedAt: new Date().toISOString(),
    };
    store.programProfiles[profile.id] = next;
    store.organizations[ctx.organization.id] = {
      ...ctx.organization,
      name: next.programName,
      updatedAt: next.updatedAt,
    };
    if (body.accountType && foundation.ACCOUNT_TYPES[String(body.accountType).toUpperCase()]) {
      // keep account type separate from role; allow preview org accountType updates only
    }
    if (body.accountType) {
      const type = String(body.accountType || "").trim().toLowerCase();
      if (Object.values(foundation.ACCOUNT_TYPES).includes(type)) {
        store.organizations[ctx.organization.id].accountType = type;
      }
    }
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      programProfile: next,
      organization: store.organizations[ctx.organization.id],
    });
  }

  async function handleRolesPermissions(request, response) {
    jsonResponse(response, 200, {
      ok: true,
      preview: true,
      catalog: orgPermissions.permissionCatalog(),
      notes: [
        "Phase 2 is admin-preview only.",
        "Future Lead Teachers access assigned classrooms only.",
        "Assistants cannot manage billing, staff, classrooms, or Program Profile.",
        "Server-side evaluateAccess enforces these rules for future member traffic.",
      ],
    });
  }

  async function handleLimits(request, response, context = {}, url = null) {
    const { store, ...ctx } = withPreview(context.adminEmail);
    writeStore(store);
    const limits = computeLimits(store, ctx.organization.id, ctx.entitlement);
    const queryQty = Number(url?.searchParams?.get("additionalClassrooms") || 0);
    let bodyQty = 0;
    if (String(request.method || "").toUpperCase() === "POST") {
      try {
        const body = await readJson(request);
        bodyQty = Number(body?.additionalClassrooms || 0);
      } catch {
        bodyQty = 0;
      }
    }
    const simulatedAddOns = Math.max(0, bodyQty || queryQty || 0);
    const upgrade = entitlements.recommendUpgradeInsteadOfAddOns({
      currentPlanKey: ctx.entitlement.basePlanKey,
      billingInterval: ctx.entitlement.billingInterval,
      additionalClassroomsNeeded: simulatedAddOns || 1,
    });
    jsonResponse(response, 200, {
      ok: true,
      live: false,
      limits,
      simulatedAdditionalClassrooms: simulatedAddOns,
      classroomAddOn: entitlements.CLASSROOM_ADD_ON,
      upgradeRecommendation: upgrade,
      foundingMemberNote: "Existing Founding Members keep $9.99 while continuously active. Preview does not alter Stripe.",
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (method === "POST" && path === "/api/director-center/seed") return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === "/api/director-center/status") return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "GET" && path === "/api/director-center/overview") return (req, res, ctx) => handleOverview(req, res, ctx);
    if ((method === "GET" || method === "POST") && path === "/api/director-center/limits") {
      return (req, res, ctx) => handleLimits(req, res, ctx, url);
    }
    if (method === "GET" && path === "/api/director-center/roles-permissions") return (req, res, ctx) => handleRolesPermissions(req, res, ctx);
    if (method === "GET" && path === "/api/director-center/classrooms") return (req, res, ctx) => handleListClassrooms(req, res, ctx, url);
    if (method === "POST" && path === "/api/director-center/classrooms") return (req, res, ctx) => handleCreateClassroom(req, res, ctx);
    if (method === "GET" && path.startsWith("/api/director-center/classrooms/")) {
      const id = decodeURIComponent(path.slice("/api/director-center/classrooms/".length).split("/")[0]);
      return (req, res, ctx) => handleGetClassroom(req, res, ctx, id);
    }
    if (method === "PATCH" && path.startsWith("/api/director-center/classrooms/") && !path.endsWith("/archive") && !path.endsWith("/restore")) {
      const id = decodeURIComponent(path.slice("/api/director-center/classrooms/".length));
      return (req, res, ctx) => handleUpdateClassroom(req, res, ctx, id);
    }
    if (method === "POST" && /\/api\/director-center\/classrooms\/[^/]+\/archive$/.test(path)) {
      const id = decodeURIComponent(path.split("/classrooms/")[1].split("/archive")[0]);
      return (req, res, ctx) => handleArchiveClassroom(req, res, ctx, id);
    }
    if (method === "POST" && /\/api\/director-center\/classrooms\/[^/]+\/restore$/.test(path)) {
      const id = decodeURIComponent(path.split("/classrooms/")[1].split("/restore")[0]);
      return (req, res, ctx) => handleRestoreClassroom(req, res, ctx, id);
    }
    if (method === "GET" && path === "/api/director-center/staff") return (req, res, ctx) => handleListStaff(req, res, ctx, url);
    if (method === "POST" && path === "/api/director-center/staff/invite") return (req, res, ctx) => handleInviteStaff(req, res, ctx);
    if (method === "POST" && path === "/api/director-center/staff/assign") {
      return async (req, res, ctx) => {
        const body = await readJson(req);
        const { store, ...preview } = withPreview(ctx.adminEmail);
        const email = normalizeEmail(body.userEmail || body.email || "");
        const classroomId = String(body.classroomId || "").trim();
        const room = store.classrooms[classroomId];
        if (!room || room.organizationId !== preview.organization.id) {
          jsonResponse(res, 404, { error: "Classroom was not found in this organization." });
          return;
        }
        let membership = listValues(store.staffMemberships).find((row) => (
          row.organizationId === preview.organization.id && row.userEmail === email
        ));
        if (!membership) {
          const limits = computeLimits(store, preview.organization.id, preview.entitlement);
          const gate = entitlements.canInviteStaff(limits);
          if (!gate.allowed) {
            jsonResponse(res, 409, { error: gate.error, code: gate.code, limits });
            return;
          }
          membership = foundation.createStaffMembershipRecord({
            organizationId: preview.organization.id,
            userEmail: email,
            userId: String(body.userId || "").trim() || `preview:${email}`,
            displayName: String(body.displayName || email.split("@")[0]).trim(),
            role: orgPermissions.normalizeOrgRole(body.role || "lead_teacher") || orgPermissions.ORG_ROLES.LEAD_TEACHER,
            status: foundation.STAFF_STATUS.ACTIVE,
            invitedByUserId: `admin:${normalizeEmail(ctx.adminEmail || "")}`,
            lastActiveAt: new Date().toISOString(),
          });
          membership.preview = true;
          store.staffMemberships[membership.id] = membership;
        }
        const assignment = foundation.createClassroomStaffAssignmentRecord({
          organizationId: preview.organization.id,
          classroomId,
          staffMembershipId: membership.id,
          userId: membership.userId || `staff:${email}`,
        });
        assignment.preview = true;
        store.classroomStaffAssignments[assignment.id] = assignment;
        writeStore(store);
        jsonResponse(res, 201, { ok: true, membership, assignment, emailSent: false });
      };
    }
    if (method === "PATCH" && path.startsWith("/api/director-center/staff/")) {
      const id = decodeURIComponent(path.slice("/api/director-center/staff/".length));
      return (req, res, ctx) => handleUpdateStaff(req, res, ctx, id);
    }
    if (method === "GET" && path === "/api/director-center/children") return (req, res, ctx) => handleListChildren(req, res, ctx, url);
    if (method === "POST" && path === "/api/director-center/children/assign") return (req, res, ctx) => handleAssignChildren(req, res, ctx);
    if (method === "GET" && path === "/api/director-center/program-profile") return (req, res, ctx) => handleGetProgramProfile(req, res, ctx);
    if (method === "PATCH" && path === "/api/director-center/program-profile") return (req, res, ctx) => handleUpdateProgramProfile(req, res, ctx);
    return null;
  }

  return {
    matchRoute,
    ensurePreview,
    overviewPayload,
  };
}

module.exports = {
  createDirectorCenterApi,
};
