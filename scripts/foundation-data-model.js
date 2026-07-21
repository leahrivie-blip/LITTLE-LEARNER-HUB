/**
 * Future-safe organization / classroom / family data model for Phase 1.
 *
 * Additive only. Collections are empty by default.
 * Existing users, childData, programData, and schedule stores are not rewritten.
 *
 * Relationships use permanent record IDs — never name/email alone.
 */

const crypto = require("node:crypto");

const FOUNDATION_SCHEMA_VERSION = 1;

const ACCOUNT_TYPES = Object.freeze({
  HOME_DAYCARE: "home_daycare",
  CENTER: "center",
  SINGLE_PROVIDER: "single_provider",
  CURRICULUM_ONLY: "curriculum_only",
});

const PROGRAM_TYPES = Object.freeze({
  HOME_DAYCARE: "home_daycare",
  CHILDCARE_CENTER: "childcare_center",
  SINGLE_PROVIDER: "single_provider",
  PRESCHOOL: "preschool",
  AFTER_SCHOOL: "after_school",
  OTHER: "other",
});

const STAFF_ROLES = Object.freeze({
  DIRECTOR_OWNER: "director_owner",
  DIRECTOR: "director",
  LEAD_TEACHER: "lead_teacher",
  ASSISTANT_STAFF: "assistant_staff",
});

const GUARDIAN_ROLES = Object.freeze({
  PARENT_GUARDIAN: "parent_guardian",
});

const ASSIGNMENT_STATUS = Object.freeze({
  ACTIVE: "active",
  HISTORICAL: "historical",
  ARCHIVED: "archived",
  RESTRICTED: "restricted",
});

const STAFF_STATUS = Object.freeze({
  INVITATION_PENDING: "invitation_pending",
  INVITATION_EXPIRED: "invitation_expired",
  ACTIVE: "active",
  INACTIVE: "inactive",
  DEACTIVATED: "deactivated",
});

const FOUNDATION_COLLECTIONS = Object.freeze([
  "organizations",
  "programProfiles",
  "classrooms",
  "staffMemberships",
  "classroomStaffAssignments",
  "childRecords",
  "classroomChildAssignments",
  "guardians",
  "childGuardianRelationships",
  "roleDefinitions",
  "permissionDefinitions",
  "featureFlagRecords",
  "organizationEntitlements",
  "classroomAddOns",
  "foundationMigrationPlans",
]);

function newId(prefix) {
  const suffix = crypto.randomBytes(8).toString("hex");
  return `${prefix}_${suffix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyFoundationCollections() {
  return {
    organizations: {},
    programProfiles: {},
    classrooms: {},
    staffMemberships: {},
    classroomStaffAssignments: {},
    childRecords: {},
    classroomChildAssignments: {},
    guardians: {},
    childGuardianRelationships: {},
    roleDefinitions: {},
    permissionDefinitions: {},
    featureFlagRecords: {},
    organizationEntitlements: {},
    classroomAddOns: {},
    foundationMigrationPlans: {},
  };
}

/**
 * Additive, idempotent store upgrade. Safe to call on every boot.
 * Does not rewrite existing user, program, or child payload data.
 */
function ensureFoundationStore(store) {
  if (!store || typeof store !== "object") return store;
  const defaults = emptyFoundationCollections();
  for (const key of FOUNDATION_COLLECTIONS) {
    if (!store[key] || typeof store[key] !== "object" || Array.isArray(store[key])) {
      store[key] = defaults[key];
    }
  }
  if (!store.foundationMeta || typeof store.foundationMeta !== "object") {
    store.foundationMeta = {
      schemaVersion: FOUNDATION_SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      migratedExistingUsers: false,
      note: "Phase 1 foundation collections only. No production user migration has run.",
    };
  } else {
    store.foundationMeta.schemaVersion = FOUNDATION_SCHEMA_VERSION;
  }
  return store;
}

function createOrganizationRecord({
  id = "",
  accountType = ACCOUNT_TYPES.HOME_DAYCARE,
  ownerUserId = "",
  ownerEmail = "",
  name = "",
  physicalLocationCount = 1,
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("org"),
    accountType,
    ownerUserId: ownerUserId || "",
    ownerEmail: String(ownerEmail || "").trim().toLowerCase(),
    name: String(name || "").trim(),
    physicalLocationCount: Number(physicalLocationCount) || 1,
    status: "active",
    legacyProgramId: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function createProgramProfileRecord({
  id = "",
  organizationId = "",
  programName = "",
  logoAssetId = "",
  logoUrl = "",
  directorOwnerName = "",
  address = "",
  phone = "",
  email = "",
  licenseNumber = "",
  website = "",
  programType = PROGRAM_TYPES.HOME_DAYCARE,
  classroomCount = 0,
  physicalLocationId = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("progprof"),
    organizationId,
    programName: String(programName || "").trim(),
    logoAssetId: logoAssetId || "",
    logoUrl: String(logoUrl || "").trim(),
    directorOwnerName: String(directorOwnerName || "").trim(),
    address: String(address || "").trim(),
    phone: String(phone || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    licenseNumber: String(licenseNumber || "").trim(),
    website: String(website || "").trim(),
    programType,
    classroomCount: Number(classroomCount) || 0,
    physicalLocationId: physicalLocationId || newId("loc"),
    createdAt,
    updatedAt: createdAt,
  };
}

function createClassroomRecord({
  id = "",
  organizationId = "",
  name = "",
  ageGroupDefault = "",
  description = "",
  color = "",
  capacity = null,
  status = ASSIGNMENT_STATUS.ACTIVE,
  notes = "",
  legacyClassroomId = "",
  createdByUserId = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("classroom"),
    organizationId,
    name: String(name || "").trim(),
    ageGroupDefault: String(ageGroupDefault || "").trim(),
    description: String(description || notes || "").trim(),
    color: String(color || "").trim(),
    capacity: capacity === null || capacity === undefined || capacity === ""
      ? null
      : Math.max(0, Number(capacity) || 0),
    status,
    notes: String(notes || "").trim(),
    legacyClassroomId: legacyClassroomId || "",
    createdByUserId: createdByUserId || "",
    archivedAt: "",
    restrictedAt: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function createStaffMembershipRecord({
  id = "",
  organizationId = "",
  userId = "",
  userEmail = "",
  displayName = "",
  role = STAFF_ROLES.LEAD_TEACHER,
  status = STAFF_STATUS.ACTIVE,
  invitedByUserId = "",
  invitationExpiresAt = "",
  lastActiveAt = "",
  deactivatedAt = "",
  deactivationReason = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("staff"),
    organizationId,
    userId: userId || "",
    userEmail: String(userEmail || "").trim().toLowerCase(),
    displayName: String(displayName || "").trim(),
    role,
    status,
    invitedByUserId: invitedByUserId || "",
    invitationExpiresAt: invitationExpiresAt || "",
    lastActiveAt: lastActiveAt || "",
    deactivatedAt: deactivatedAt || "",
    deactivationReason: String(deactivationReason || "").trim(),
    createdAt,
    updatedAt: createdAt,
    endedAt: "",
  };
}

function createClassroomStaffAssignmentRecord({
  id = "",
  organizationId = "",
  classroomId = "",
  staffMembershipId = "",
  userId = "",
  status = ASSIGNMENT_STATUS.ACTIVE,
  startsAt = "",
  endsAt = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("csa"),
    organizationId,
    classroomId,
    staffMembershipId,
    userId: userId || "",
    status,
    startsAt: startsAt || createdAt,
    endsAt: endsAt || "",
    createdAt,
    updatedAt: createdAt,
  };
}

function createChildRecord({
  id = "",
  organizationId = "",
  displayName = "",
  legacyChildId = "",
  status = ASSIGNMENT_STATUS.ACTIVE,
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("child"),
    organizationId,
    displayName: String(displayName || "").trim(),
    legacyChildId: legacyChildId || "",
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

function createClassroomChildAssignmentRecord({
  id = "",
  organizationId = "",
  classroomId = "",
  childId = "",
  status = ASSIGNMENT_STATUS.ACTIVE,
  startsAt = "",
  endsAt = "",
  assignedByUserId = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("cca"),
    organizationId,
    classroomId,
    childId,
    status,
    startsAt: startsAt || createdAt,
    endsAt: endsAt || "",
    assignedByUserId: assignedByUserId || "",
    createdAt,
    updatedAt: createdAt,
  };
}

function createGuardianRecord({
  id = "",
  userId = "",
  email = "",
  displayName = "",
  status = ASSIGNMENT_STATUS.ACTIVE,
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("guardian"),
    userId: userId || "",
    email: String(email || "").trim().toLowerCase(),
    displayName: String(displayName || "").trim(),
    role: GUARDIAN_ROLES.PARENT_GUARDIAN,
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

function createChildGuardianRelationshipRecord({
  id = "",
  organizationId = "",
  childId = "",
  guardianId = "",
  relationshipLabel = "parent",
  verified = false,
  status = ASSIGNMENT_STATUS.ACTIVE,
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("cgr"),
    organizationId,
    childId,
    guardianId,
    relationshipLabel: String(relationshipLabel || "parent").trim(),
    verified: verified === true,
    verifiedAt: verified === true ? createdAt : "",
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

function createFeatureFlagRecord({
  id = "",
  key = "",
  enabled = false,
  scope = "global",
  organizationId = "",
  note = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("ff"),
    key,
    enabled: enabled === true,
    scope,
    organizationId: organizationId || "",
    note: String(note || "").trim(),
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Dry-run migration plan only. Does not mutate store.users or program data.
 */
function buildExistingUserMigrationPlan(store = {}) {
  const users = store.users && typeof store.users === "object" ? store.users : {};
  const programs = store.programs && typeof store.programs === "object" ? store.programs : {};
  const emails = Object.keys(users);
  const ownerEmails = emails.filter((email) => {
    const user = users[email] || {};
    const role = String(user.role || "owner").toLowerCase();
    const linked = String(user.linkedProgramOwnerEmail || "").trim().toLowerCase();
    return !linked || linked === email || role === "owner";
  });

  return {
    dryRun: true,
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    executed: false,
    matching: {
      strategy: "Match store.users by email; owners get organization + program profile; staff link via linkedProgramOwnerEmail + programId.",
      ownerCandidateCount: ownerEmails.length,
      totalUserCount: emails.length,
      existingProgramCount: Object.keys(programs).length,
    },
    creates: {
      organizations: "One organization per owner/program (linked to legacy programId when present).",
      programProfiles: "One profile per organization from businessName/daycareName/programSettings when available.",
      classrooms: "Default classroom-main from schedule when present; otherwise one Main Classroom for home daycare.",
      staffMemberships: "Staff/director rows from users with linkedProgramOwnerEmail.",
      classroomStaffAssignments: "From user.classroomIds when present.",
      childRecords: "Optional later pass from programData[programId].child.data.Profiles — not auto-run in Phase 1.",
      childGuardianRelationships: "Deferred until Family Hub Phase — no parent accounts yet.",
    },
    missingInformation: {
      noOwnerEmail: "Skip organization create; log for manual review.",
      noProgramName: "Use email local-part or 'Untitled Program'.",
      noClassroomIds: "Staff membership exists without classroom assignment until director assigns.",
      duplicateEmails: "Normalize to lowercase; first canonical row wins; duplicates flagged.",
    },
    duplicateDetection: {
      organizations: "Key by ownerEmail + legacyProgramId.",
      staff: "Key by organizationId + userEmail.",
      children: "Key by organizationId + legacyChildId when migrating later.",
      guardians: "Key by normalized email.",
    },
    rollback: {
      approach: "Delete only foundation collections written by a future apply job; never delete users, programData, scheduleByUser, or Stripe fields.",
      backup: "Write foundationMigrationPlans[planId].backup before apply; restore collections from backup.",
      safety: "Phase 1 does not run apply. Production migration requires explicit owner approval.",
    },
  };
}

function foundationStatusSummary(store = {}) {
  ensureFoundationStore(store);
  const count = (key) => Object.keys(store[key] || {}).length;
  return {
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    collections: FOUNDATION_COLLECTIONS.reduce((acc, key) => {
      acc[key] = count(key);
      return acc;
    }, {}),
    migratedExistingUsers: store.foundationMeta?.migratedExistingUsers === true,
    readyForPhase2: true,
  };
}

module.exports = {
  FOUNDATION_SCHEMA_VERSION,
  ACCOUNT_TYPES,
  PROGRAM_TYPES,
  STAFF_ROLES,
  GUARDIAN_ROLES,
  ASSIGNMENT_STATUS,
  STAFF_STATUS,
  FOUNDATION_COLLECTIONS,
  newId,
  emptyFoundationCollections,
  ensureFoundationStore,
  createOrganizationRecord,
  createProgramProfileRecord,
  createClassroomRecord,
  createStaffMembershipRecord,
  createClassroomStaffAssignmentRecord,
  createChildRecord,
  createClassroomChildAssignmentRecord,
  createGuardianRecord,
  createChildGuardianRelationshipRecord,
  createFeatureFlagRecord,
  buildExistingUserMigrationPlan,
  foundationStatusSummary,
};
