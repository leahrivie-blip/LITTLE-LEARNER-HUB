/**
 * Organization-scoped permission model for Director Center / Family Hub.
 *
 * Account type and role remain separate concepts.
 * This module does not change existing account-access.js runtime gates.
 * It provides the future server-side checks Phase 2+ must use.
 *
 * Access checks verify:
 * - organization membership
 * - role
 * - classroom assignment
 * - child relationship (verified for parents/guardians)
 * - feature availability
 * - specific action permission
 */

const expansionFlags = require("./expansion-feature-flags.js");
const {
  STAFF_ROLES,
  GUARDIAN_ROLES,
  ASSIGNMENT_STATUS,
} = require("./foundation-data-model.js");

const ORG_ROLES = Object.freeze({
  DIRECTOR_OWNER: STAFF_ROLES.DIRECTOR_OWNER,
  DIRECTOR: STAFF_ROLES.DIRECTOR,
  LEAD_TEACHER: STAFF_ROLES.LEAD_TEACHER,
  ASSISTANT_STAFF: STAFF_ROLES.ASSISTANT_STAFF,
  PARENT_GUARDIAN: GUARDIAN_ROLES.PARENT_GUARDIAN,
});

/** Map current runtime roles onto the future org permission roles. */
const LEGACY_ROLE_MAP = Object.freeze({
  owner: ORG_ROLES.DIRECTOR_OWNER,
  director: ORG_ROLES.DIRECTOR,
  teacher: ORG_ROLES.LEAD_TEACHER,
  assistant: ORG_ROLES.ASSISTANT_STAFF,
  parent: ORG_ROLES.PARENT_GUARDIAN,
  guardian: ORG_ROLES.PARENT_GUARDIAN,
  family_member: ORG_ROLES.PARENT_GUARDIAN,
  parent_guardian: ORG_ROLES.PARENT_GUARDIAN,
  director_owner: ORG_ROLES.DIRECTOR_OWNER,
  lead_teacher: ORG_ROLES.LEAD_TEACHER,
  assistant_staff: ORG_ROLES.ASSISTANT_STAFF,
});

const ACTIONS = Object.freeze({
  ORG_VIEW: "org.view",
  ORG_MANAGE_SETTINGS: "org.manage_settings",
  ORG_MANAGE_BILLING: "org.manage_billing",
  ORG_MANAGE_STAFF: "org.manage_staff",
  ORG_MANAGE_CLASSROOMS: "org.manage_classrooms",
  ORG_VIEW_ALL_CLASSROOMS: "org.view_all_classrooms",
  ORG_VIEW_ALL_CHILDREN: "org.view_all_children",
  ORG_MANAGE_FAMILY_HUB: "org.manage_family_hub",
  ORG_MANAGE_FORMS: "org.manage_forms",
  CLASSROOM_VIEW: "classroom.view",
  CLASSROOM_MANAGE: "classroom.manage",
  CLASSROOM_ASSIGN_STAFF: "classroom.assign_staff",
  CLASSROOM_ASSIGN_CHILDREN: "classroom.assign_children",
  CLASSROOM_VIEW_CALENDAR: "classroom.view_calendar",
  CLASSROOM_ADD_EVENT: "classroom.add_event",
  CLASSROOM_EDIT_LESSON_COPY: "classroom.edit_lesson_copy",
  CLASSROOM_ASSIGN_LESSON: "classroom.assign_lesson",
  CHILD_VIEW: "child.view",
  CHILD_EDIT: "child.edit",
  CHILD_VIEW_DOCUMENTS: "child.view_documents",
  CHILD_VIEW_EMERGENCY: "child.view_emergency",
  CHILD_VIEW_MEDICAL: "child.view_medical",
  CHILD_CREATE_DAILY_LOG: "child.create_daily_log",
  CHILD_EDIT_DAILY_LOG: "child.edit_daily_log",
  CHILD_CREATE_OBSERVATION: "child.create_observation",
  CHILD_EDIT_OBSERVATION: "child.edit_observation",
  CHILD_ADD_PHOTO: "child.add_photo",
  CHILD_VIEW_GOALS: "child.view_goals",
  CHILD_ADD_GOAL_PROGRESS: "child.add_goal_progress",
  DOC_HELPERS_USE: "documentation_helpers.use",
  FORM_CREATE: "form.create",
  FORM_SEND: "form.send",
  FORM_REVIEW: "form.review",
  FAMILY_MESSAGE: "family.message",
  FAMILY_VIEW_REPORTS: "family.view_reports",
});

const ASSISTANT_PERMISSION_ACTION_MAP = Object.freeze({
  viewChildProfiles: ACTIONS.CHILD_VIEW,
  viewEmergencyInformation: ACTIONS.CHILD_VIEW_EMERGENCY,
  viewMedicalAndAllergyInformation: ACTIONS.CHILD_VIEW_MEDICAL,
  createDailyLogs: ACTIONS.CHILD_CREATE_DAILY_LOG,
  editDailyLogs: ACTIONS.CHILD_EDIT_DAILY_LOG,
  createObservations: ACTIONS.CHILD_CREATE_OBSERVATION,
  editObservations: ACTIONS.CHILD_EDIT_OBSERVATION,
  addPhotos: ACTIONS.CHILD_ADD_PHOTO,
  viewGoals: ACTIONS.CHILD_VIEW_GOALS,
  addGoalProgress: ACTIONS.CHILD_ADD_GOAL_PROGRESS,
  viewClassroomCalendars: ACTIONS.CLASSROOM_VIEW_CALENDAR,
  addCalendarEvents: ACTIONS.CLASSROOM_ADD_EVENT,
  editClassroomLessonPlanCopies: ACTIONS.CLASSROOM_EDIT_LESSON_COPY,
  useDocumentationHelpers: ACTIONS.DOC_HELPERS_USE,
});

const ROLE_PERMISSIONS = Object.freeze({
  [ORG_ROLES.DIRECTOR_OWNER]: Object.values(ACTIONS),
  [ORG_ROLES.DIRECTOR]: Object.values(ACTIONS).filter((action) => action !== ACTIONS.ORG_MANAGE_BILLING),
  [ORG_ROLES.LEAD_TEACHER]: [
    ACTIONS.ORG_VIEW,
    ACTIONS.CLASSROOM_VIEW,
    ACTIONS.CLASSROOM_MANAGE,
    ACTIONS.CLASSROOM_VIEW_CALENDAR,
    ACTIONS.CLASSROOM_ADD_EVENT,
    ACTIONS.CLASSROOM_EDIT_LESSON_COPY,
    ACTIONS.CHILD_VIEW,
    ACTIONS.CHILD_EDIT,
    ACTIONS.CHILD_VIEW_DOCUMENTS,
    ACTIONS.CHILD_VIEW_EMERGENCY,
    ACTIONS.CHILD_VIEW_MEDICAL,
    ACTIONS.CHILD_CREATE_DAILY_LOG,
    ACTIONS.CHILD_EDIT_DAILY_LOG,
    ACTIONS.CHILD_CREATE_OBSERVATION,
    ACTIONS.CHILD_EDIT_OBSERVATION,
    ACTIONS.CHILD_ADD_PHOTO,
    ACTIONS.CHILD_VIEW_GOALS,
    ACTIONS.CHILD_ADD_GOAL_PROGRESS,
    ACTIONS.DOC_HELPERS_USE,
    ACTIONS.FORM_CREATE,
    ACTIONS.FORM_SEND,
    ACTIONS.FORM_REVIEW,
    ACTIONS.FAMILY_MESSAGE,
    ACTIONS.FAMILY_VIEW_REPORTS,
  ],
  // Assistants start with minimal defaults; director overrides grant more via custom permissions.
  [ORG_ROLES.ASSISTANT_STAFF]: [
    ACTIONS.ORG_VIEW,
    ACTIONS.CLASSROOM_VIEW,
  ],
  [ORG_ROLES.PARENT_GUARDIAN]: [
    ACTIONS.CHILD_VIEW,
    ACTIONS.CHILD_VIEW_DOCUMENTS,
    ACTIONS.FAMILY_MESSAGE,
    ACTIONS.FAMILY_VIEW_REPORTS,
    ACTIONS.FORM_REVIEW,
  ],
});

function normalizeOrgRole(role) {
  const key = String(role || "").trim().toLowerCase();
  return LEGACY_ROLE_MAP[key] || "";
}

function roleHasAction(role, action) {
  const normalized = normalizeOrgRole(role);
  const allowed = ROLE_PERMISSIONS[normalized] || [];
  return allowed.includes(action);
}

function activeMemberships(store, organizationId, userId = "", userEmail = "") {
  const memberships = store?.staffMemberships && typeof store.staffMemberships === "object"
    ? Object.values(store.staffMemberships)
    : [];
  const email = String(userEmail || "").trim().toLowerCase();
  return memberships.filter((row) => {
    if (!row || row.organizationId !== organizationId) return false;
    if (row.status && row.status !== ASSIGNMENT_STATUS.ACTIVE) return false;
    if (userId && row.userId && row.userId === userId) return true;
    if (email && row.userEmail && row.userEmail === email) return true;
    return false;
  });
}

function activeClassroomIdsForStaff(store, organizationId, userId = "") {
  const rows = store?.classroomStaffAssignments && typeof store.classroomStaffAssignments === "object"
    ? Object.values(store.classroomStaffAssignments)
    : [];
  return rows
    .filter((row) => (
      row
      && row.organizationId === organizationId
      && row.userId === userId
      && (!row.status || row.status === ASSIGNMENT_STATUS.ACTIVE)
      && !row.endsAt
    ))
    .map((row) => row.classroomId);
}

function verifiedGuardianChildIds(store, organizationId, guardianId = "", userId = "", email = "") {
  const guardians = store?.guardians && typeof store.guardians === "object"
    ? Object.values(store.guardians)
    : [];
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const matchedGuardianIds = new Set(
    guardians
      .filter((guardian) => {
        if (!guardian || (guardian.status && guardian.status !== ASSIGNMENT_STATUS.ACTIVE)) return false;
        if (guardianId && guardian.id === guardianId) return true;
        if (userId && guardian.userId === userId) return true;
        if (normalizedEmail && guardian.email === normalizedEmail) return true;
        return false;
      })
      .map((guardian) => guardian.id)
  );
  const relationships = store?.childGuardianRelationships && typeof store.childGuardianRelationships === "object"
    ? Object.values(store.childGuardianRelationships)
    : [];
  return relationships
    .filter((row) => (
      row
      && row.organizationId === organizationId
      && matchedGuardianIds.has(row.guardianId)
      && row.verified === true
      && (!row.status || row.status === ASSIGNMENT_STATUS.ACTIVE)
    ))
    .map((row) => row.childId);
}

function classroomIdsForChild(store, organizationId, childId) {
  const rows = store?.classroomChildAssignments && typeof store.classroomChildAssignments === "object"
    ? Object.values(store.classroomChildAssignments)
    : [];
  return rows
    .filter((row) => (
      row
      && row.organizationId === organizationId
      && row.childId === childId
      && (!row.status || row.status === ASSIGNMENT_STATUS.ACTIVE)
      && !row.endsAt
    ))
    .map((row) => row.classroomId);
}

/**
 * Full access decision for a future expansion action.
 */
function evaluateAccess({
  store = {},
  actor = {},
  organizationId = "",
  action = "",
  classroomId = "",
  childId = "",
  featureFlags = null,
  requiredFeature = "",
} = {}) {
  const result = {
    allowed: false,
    reason: "",
    role: "",
    organizationId,
    classroomId: classroomId || "",
    childId: childId || "",
    feature: requiredFeature || "",
  };

  if (requiredFeature && !expansionFlags.isExpansionFeatureEnabled(featureFlags, requiredFeature)) {
    result.reason = "feature_disabled";
    return result;
  }

  if (!organizationId) {
    result.reason = "organization_required";
    return result;
  }

  const organization = store.organizations?.[organizationId];
  if (!organization || (organization.status && organization.status !== "active" && organization.status !== ASSIGNMENT_STATUS.ACTIVE)) {
    result.reason = "organization_not_found";
    return result;
  }

  // Cross-organization denial: actor membership must belong to this org.
  const memberships = activeMemberships(store, organizationId, actor.userId, actor.email);
  const guardianChildIds = verifiedGuardianChildIds(store, organizationId, actor.guardianId, actor.userId, actor.email);
  const isParent = guardianChildIds.length > 0 || normalizeOrgRole(actor.role) === ORG_ROLES.PARENT_GUARDIAN;

  if (!memberships.length && !isParent) {
    result.reason = "not_organization_member";
    return result;
  }

  const membership = memberships[0] || null;
  const role = memberships.length
    ? normalizeOrgRole(membership.role || actor.role)
    : ORG_ROLES.PARENT_GUARDIAN;
  result.role = role;

  let actionAllowed = roleHasAction(role, action);
  if (!actionAllowed && role === ORG_ROLES.ASSISTANT_STAFF && membership) {
    actionAllowed = assistantOverrideAllows(store, organizationId, membership.id, action);
  }
  if (!actionAllowed) {
    result.reason = "role_denied";
    return result;
  }

  const orgWide = role === ORG_ROLES.DIRECTOR_OWNER || role === ORG_ROLES.DIRECTOR;

  if (classroomId && !orgWide) {
    if (role === ORG_ROLES.PARENT_GUARDIAN) {
      result.reason = "parent_classroom_denied";
      return result;
    }
    const assigned = activeClassroomIdsForStaff(store, organizationId, actor.userId || membership?.userId || "");
    if (!assigned.includes(classroomId)) {
      result.reason = "classroom_not_assigned";
      return result;
    }
  }

  if (childId) {
    if (role === ORG_ROLES.PARENT_GUARDIAN) {
      if (!guardianChildIds.includes(childId)) {
        result.reason = "child_relationship_unverified";
        return result;
      }
    } else if (!orgWide) {
      const childClassrooms = classroomIdsForChild(store, organizationId, childId);
      const assigned = activeClassroomIdsForStaff(store, organizationId, actor.userId || membership?.userId || "");
      const overlap = childClassrooms.some((id) => assigned.includes(id));
      if (!overlap) {
        result.reason = "child_not_in_assigned_classroom";
        return result;
      }
    }
  }

  if (action === ACTIONS.ORG_VIEW_ALL_CLASSROOMS || action === ACTIONS.ORG_VIEW_ALL_CHILDREN) {
    if (!orgWide) {
      result.reason = "org_wide_role_required";
      return result;
    }
  }

  result.allowed = true;
  result.reason = "ok";
  return result;
}

function assistantOverrideAllows(store, organizationId, staffMembershipId, action) {
  const overrides = store?.assistantPermissionOverrides && typeof store.assistantPermissionOverrides === "object"
    ? Object.values(store.assistantPermissionOverrides)
    : [];
  const row = overrides.find((item) => (
    item
    && item.organizationId === organizationId
    && item.staffMembershipId === staffMembershipId
  ));
  if (!row || !row.permissions) return false;
  for (const [key, mappedAction] of Object.entries(ASSISTANT_PERMISSION_ACTION_MAP)) {
    if (mappedAction === action && row.permissions[key] === true) return true;
  }
  return false;
}

function permissionCatalog() {
  return {
    roles: { ...ORG_ROLES },
    actions: { ...ACTIONS },
    rolePermissions: { ...ROLE_PERMISSIONS },
    assistantPermissionActionMap: { ...ASSISTANT_PERMISSION_ACTION_MAP },
    rules: {
      directors: "Director/Owner and Director may view the entire organization when membership is active.",
      teachers: "Lead Teachers only access assigned classrooms and children in those classrooms.",
      assistants: "Assistants require director-granted custom permissions for child care, logs, calendars, and goals.",
      medical: "Medical, emergency, and authorized-pickup fields require explicit care-access permission.",
      parents: "Parents/Guardians require a verified childGuardianRelationships row for the requested child.",
      crossOrganization: "Membership or verified guardian relationship must match organizationId or access is denied.",
      features: "requiredFeature must be enabled via expansion feature flags.",
    },
  };
}

module.exports = {
  ORG_ROLES,
  LEGACY_ROLE_MAP,
  ACTIONS,
  ROLE_PERMISSIONS,
  ASSISTANT_PERMISSION_ACTION_MAP,
  normalizeOrgRole,
  roleHasAction,
  assistantOverrideAllows,
  activeMemberships,
  activeClassroomIdsForStaff,
  verifiedGuardianChildIds,
  classroomIdsForChild,
  evaluateAccess,
  permissionCatalog,
};
