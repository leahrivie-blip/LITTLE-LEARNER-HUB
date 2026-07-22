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

/* ─── Phase 3 additive collections (preview records only) ─── */

const PHASE3_COLLECTIONS = Object.freeze([
  "classroomWeekAssignments",
  "classroomCalendarEvents",
  "previewDailyLogs",
  "previewObservations",
  "previewGoals",
  "previewChildProfiles",
  "assistantPermissionOverrides",
  "phase3Meta",
]);

const WEEK_ASSIGNMENT_STATUS = Object.freeze({
  ACTIVE: "active",
  REPLACED: "replaced",
  HISTORICAL: "historical",
});

const SHARING_STATUS = Object.freeze({
  PRIVATE_STAFF: "private_staff",
  WAITING_DIRECTOR_REVIEW: "waiting_director_review",
  READY_TO_SHARE: "ready_to_share",
  SHARED_WITH_FAMILY: "shared_with_family_disabled",
});

const GOAL_STATUS = Object.freeze({
  ACTIVE: "active",
  ACHIEVED: "achieved",
  PAUSED: "paused",
  ARCHIVED: "archived",
});

const LEARNING_DOMAINS = Object.freeze([
  "Social-Emotional Development",
  "Language and Literacy",
  "Cognitive Development",
  "Early Math",
  "Science and Discovery",
  "Fine Motor Development",
  "Gross Motor Development",
  "Creative Arts",
  "Physical Development",
  "Approaches to Learning",
]);

function ensurePhase3Store(store) {
  ensureFoundationStore(store);
  for (const key of PHASE3_COLLECTIONS) {
    if (key === "phase3Meta") {
      if (!store.phase3Meta || typeof store.phase3Meta !== "object") {
        store.phase3Meta = {
          schemaVersion: 3,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          note: "Phase 3 preview collections. Fake data only.",
        };
      }
      continue;
    }
    if (!store[key] || typeof store[key] !== "object" || Array.isArray(store[key])) {
      store[key] = {};
    }
  }
  return store;
}

function emptyWeekDayPlan(fallback = "Teacher choice") {
  return {
    dailyTheme: fallback,
    circleTime: fallback,
    activity1: fallback,
    activity2: fallback,
    activity3: fallback,
    outdoorPlay: fallback,
    bookOfTheDay: fallback,
    materials: fallback,
    teacherNotes: "",
  };
}

function buildWeekSnapshotFromLesson(lessonPlan = {}, ageGroup = "") {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const weekly = {};
  const sourceDays = lessonPlan.dailyPlans || lessonPlan.days || {};
  days.forEach((day, index) => {
    const src = sourceDays[day] || sourceDays[day[0].toUpperCase() + day.slice(1)] || {};
    const activities = Array.isArray(src.activities) ? src.activities : [];
    weekly[day] = {
      dailyTheme: src.theme || src.dailyTheme || lessonPlan.theme || `Day ${index + 1} focus`,
      circleTime: src.circleTime || (Array.isArray(src.circleTime) ? src.circleTime[0] : "") || "Add classroom activity",
      activity1: activities[0]?.title || activities[0] || src.activity1 || "Teacher choice",
      activity2: activities[1]?.title || activities[1] || src.activity2 || "Teacher choice",
      activity3: activities[2]?.title || activities[2] || src.activity3 || "Teacher choice",
      outdoorPlay: src.outdoorPlay || "Outdoor play — Teacher choice",
      bookOfTheDay: (Array.isArray(src.books) ? src.books[0] : src.bookOfTheDay) || "Book of the day — Teacher choice",
      materials: src.materials || lessonPlan.materials || "Gather classroom materials",
      teacherNotes: src.teacherNotes || "",
    };
  });
  return {
    lessonPlanId: lessonPlan.id || lessonPlan.lessonPlanId || "",
    lessonPlanTitle: lessonPlan.title || lessonPlan.lessonPlanTitle || "Preview Lesson Plan",
    ageGroup: ageGroup || lessonPlan.ageGroup || "",
    theme: lessonPlan.theme || "",
    weekly,
    capturedAt: nowIso(),
  };
}

function createClassroomWeekAssignmentRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("cwa"),
    organizationId: input.organizationId || "",
    classroomId: input.classroomId || "",
    lessonPlanId: input.lessonPlanId || "",
    weekStartDate: input.weekStartDate || "",
    ageGroup: input.ageGroup || "",
    classroomLabel: input.classroomLabel || "",
    assignedByUserId: input.assignedByUserId || "",
    assignedAt: input.assignedAt || createdAt,
    updatedAt: createdAt,
    status: input.status || WEEK_ASSIGNMENT_STATUS.ACTIVE,
    replacedByAssignmentId: input.replacedByAssignmentId || "",
    replacedAt: input.replacedAt || "",
    replacedByUserId: input.replacedByUserId || "",
    snapshot: input.snapshot || buildWeekSnapshotFromLesson({}, input.ageGroup),
    preview: true,
  };
}

function createClassroomCalendarEventRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("cce"),
    organizationId: input.organizationId || "",
    classroomId: input.classroomId || "",
    date: input.date || "",
    title: String(input.title || "").trim(),
    type: input.type || "classroom_event",
    notes: String(input.notes || "").trim(),
    createdByUserId: input.createdByUserId || "",
    visibility: input.visibility || "classroom_staff",
    familyVisible: false,
    familyVisibilityPrepared: true,
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function createPreviewDailyLogRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("dlog"),
    organizationId: input.organizationId || "",
    classroomId: input.classroomId || "",
    childId: input.childId || "",
    staffMembershipId: input.staffMembershipId || "",
    staffUserId: input.staffUserId || "",
    date: input.date || createdAt.slice(0, 10),
    time: input.time || createdAt.slice(11, 16),
    attendance: input.attendance || "",
    arrival: input.arrival || "",
    departure: input.departure || "",
    meals: input.meals || "",
    snacks: input.snacks || "",
    bottles: input.bottles || "",
    naps: input.naps || "",
    diapers: input.diapers || "",
    potty: input.potty || "",
    activities: input.activities || "",
    mood: input.mood || "",
    healthNotes: input.healthNotes || "",
    photos: Array.isArray(input.photos) ? input.photos : [],
    teacherNotes: input.teacherNotes || "",
    suppliesNeeded: input.suppliesNeeded || "",
    groupBatchId: input.groupBatchId || "",
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function createPreviewObservationRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("obs"),
    organizationId: input.organizationId || "",
    classroomId: input.classroomId || "",
    childId: input.childId || "",
    staffMembershipId: input.staffMembershipId || "",
    staffUserId: input.staffUserId || "",
    date: input.date || createdAt.slice(0, 10),
    time: input.time || createdAt.slice(11, 16),
    text: String(input.text || "").trim(),
    learningDomains: Array.isArray(input.learningDomains) ? input.learningDomains : [],
    activityOrLessonPlanId: input.activityOrLessonPlanId || "",
    photoReference: input.photoReference || "",
    sharingStatus: input.sharingStatus || SHARING_STATUS.PRIVATE_STAFF,
    familyShareEnabled: false,
    familyShareNote: "Family sharing will become available when Family Hub is approved.",
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function createPreviewGoalRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("goal"),
    organizationId: input.organizationId || "",
    classroomId: input.classroomId || "",
    childId: input.childId || "",
    createdByUserId: input.createdByUserId || "",
    createdByMembershipId: input.createdByMembershipId || "",
    learningDomain: input.learningDomain || LEARNING_DOMAINS[0],
    description: String(input.description || "").trim(),
    targetOrNextStep: String(input.targetOrNextStep || "").trim(),
    progressNotes: Array.isArray(input.progressNotes) ? input.progressNotes : [],
    status: input.status || GOAL_STATUS.ACTIVE,
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function createPreviewChildProfileRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("pchild"),
    childId: input.childId || "",
    organizationId: input.organizationId || "",
    displayName: String(input.displayName || "").trim(),
    ageGroup: input.ageGroup || "",
    overview: input.overview || "",
    familyEmergencyContacts: input.familyEmergencyContacts || [],
    medicalInformation: input.medicalInformation || { notes: "", requiresCareAccess: true },
    allergies: input.allergies || { list: [], requiresCareAccess: true },
    authorizedPickup: input.authorizedPickup || { people: [], requiresCareAccess: true },
    photos: Array.isArray(input.photos) ? input.photos : [],
    documentsAndForms: Array.isArray(input.documentsAndForms) ? input.documentsAndForms : [],
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

function defaultAssistantPermissions(enabled = false) {
  return {
    viewChildProfiles: enabled,
    viewEmergencyInformation: false,
    viewMedicalAndAllergyInformation: false,
    createDailyLogs: enabled,
    editDailyLogs: false,
    createObservations: enabled,
    editObservations: false,
    addPhotos: enabled,
    viewGoals: enabled,
    addGoalProgress: false,
    viewClassroomCalendars: enabled,
    addCalendarEvents: false,
    editClassroomLessonPlanCopies: false,
    useDocumentationHelpers: false,
  };
}

function createAssistantPermissionOverrideRecord(input = {}) {
  const createdAt = nowIso();
  return {
    id: input.id || newId("aperm"),
    organizationId: input.organizationId || "",
    staffMembershipId: input.staffMembershipId || "",
    permissions: { ...defaultAssistantPermissions(false), ...(input.permissions || {}) },
    updatedByUserId: input.updatedByUserId || "",
    createdAt,
    updatedAt: createdAt,
    preview: true,
  };
}

module.exports.PHASE3_COLLECTIONS = PHASE3_COLLECTIONS;
module.exports.WEEK_ASSIGNMENT_STATUS = WEEK_ASSIGNMENT_STATUS;
module.exports.SHARING_STATUS = SHARING_STATUS;
module.exports.GOAL_STATUS = GOAL_STATUS;
module.exports.LEARNING_DOMAINS = LEARNING_DOMAINS;
module.exports.ensurePhase3Store = ensurePhase3Store;
module.exports.emptyWeekDayPlan = emptyWeekDayPlan;
module.exports.buildWeekSnapshotFromLesson = buildWeekSnapshotFromLesson;
module.exports.createClassroomWeekAssignmentRecord = createClassroomWeekAssignmentRecord;
module.exports.createClassroomCalendarEventRecord = createClassroomCalendarEventRecord;
module.exports.createPreviewDailyLogRecord = createPreviewDailyLogRecord;
module.exports.createPreviewObservationRecord = createPreviewObservationRecord;
module.exports.createPreviewGoalRecord = createPreviewGoalRecord;
module.exports.createPreviewChildProfileRecord = createPreviewChildProfileRecord;
module.exports.defaultAssistantPermissions = defaultAssistantPermissions;
module.exports.createAssistantPermissionOverrideRecord = createAssistantPermissionOverrideRecord;
