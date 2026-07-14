/**
 * Account Type + User Role access rules for Little Learner Hub.
 *
 * ACCOUNT TYPE and USER ROLE are separate concepts:
 * - Account Type: home_daycare | center (what kind of program this is)
 * - User Role: owner | director | teacher | assistant (what this person can do)
 *
 * Existing users without these fields default to home_daycare + owner.
 * programSettings.programType is used only as a migration hint for accountType.
 */

const ACCOUNT_TYPES = Object.freeze({
  HOME_DAYCARE: "home_daycare",
  CENTER: "center",
});

const USER_ROLES = Object.freeze({
  OWNER: "owner",
  DIRECTOR: "director",
  TEACHER: "teacher",
  ASSISTANT: "assistant",
});

/** Future roles reserved in product docs — not active yet. */
const FUTURE_USER_ROLES = Object.freeze({
  FAMILY_MEMBER: "family_member",
  ADMIN: "admin",
});

/**
 * Platform capabilities used by navigation and feature gates.
 * Subscription/plan checks remain separate (membership-access / isProUser).
 */
const PLATFORM_CAPABILITIES = Object.freeze([
  "calendar",
  "lesson_plans",
  "daily_logs",
  "child_profiles",
  "activity_library",
  "documentation_helpers",
  "forms",
  "reports",
  "resources",
  "settings",
  "staff_management",
  "billing",
  "permissions",
  "classrooms",
  "families",
  "enrollment",
]);

const ACCOUNT_TYPE_ALIASES = Object.freeze({
  home_daycare: ACCOUNT_TYPES.HOME_DAYCARE,
  "home daycare": ACCOUNT_TYPES.HOME_DAYCARE,
  homedaycare: ACCOUNT_TYPES.HOME_DAYCARE,
  "family childcare": ACCOUNT_TYPES.HOME_DAYCARE,
  "family child care": ACCOUNT_TYPES.HOME_DAYCARE,
  family_childcare: ACCOUNT_TYPES.HOME_DAYCARE,
  center: ACCOUNT_TYPES.CENTER,
  "childcare center": ACCOUNT_TYPES.CENTER,
  "child care center": ACCOUNT_TYPES.CENTER,
  childcare_center: ACCOUNT_TYPES.CENTER,
  preschool: ACCOUNT_TYPES.CENTER,
  "preschool classroom": ACCOUNT_TYPES.CENTER,
  "after school program": ACCOUNT_TYPES.CENTER,
  after_school: ACCOUNT_TYPES.CENTER,
  other: ACCOUNT_TYPES.HOME_DAYCARE,
});

const USER_ROLE_ALIASES = Object.freeze({
  owner: USER_ROLES.OWNER,
  director: USER_ROLES.DIRECTOR,
  teacher: USER_ROLES.TEACHER,
  "lead teacher": USER_ROLES.TEACHER,
  lead_teacher: USER_ROLES.TEACHER,
  assistant: USER_ROLES.ASSISTANT,
  "co-teacher": USER_ROLES.TEACHER,
  coteacher: USER_ROLES.TEACHER,
  "family helper": USER_ROLES.ASSISTANT,
  substitute: USER_ROLES.ASSISTANT,
});

function normalizeAccountType(value, fallback = ACCOUNT_TYPES.HOME_DAYCARE) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return fallback;
  return ACCOUNT_TYPE_ALIASES[key] || fallback;
}

function normalizeUserRole(value, fallback = USER_ROLES.OWNER) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return fallback;
  return USER_ROLE_ALIASES[key] || fallback;
}

/**
 * Map Program Settings "programType" labels onto accountType.
 * Preschool / After School / Center → center; Home Daycare / Other / blank → home_daycare.
 */
function mapProgramTypeToAccountType(programType) {
  return normalizeAccountType(programType, ACCOUNT_TYPES.HOME_DAYCARE);
}

function resolveAccountType(account = {}) {
  if (account.accountType) {
    return normalizeAccountType(account.accountType);
  }
  const programType = account.programSettings?.programType;
  if (programType) {
    return mapProgramTypeToAccountType(programType);
  }
  return ACCOUNT_TYPES.HOME_DAYCARE;
}

function resolveUserRole(account = {}) {
  if (account.role) {
    return normalizeUserRole(account.role);
  }
  if (account.userRole) {
    return normalizeUserRole(account.userRole);
  }
  // Single-account providers today are effectively owners.
  return USER_ROLES.OWNER;
}

/**
 * Capability matrix.
 * Center-only tools require accountType === center AND an eligible role.
 */
function roleAllowsCapability(role, capability) {
  const r = normalizeUserRole(role);
  switch (capability) {
    case "calendar":
    case "lesson_plans":
    case "daily_logs":
    case "child_profiles":
    case "activity_library":
    case "documentation_helpers":
    case "forms":
    case "reports":
    case "resources":
    case "settings":
      return true;
    case "staff_management":
    case "permissions":
      return r === USER_ROLES.OWNER || r === USER_ROLES.DIRECTOR;
    case "billing":
      // Directors manage program ops but not subscription ownership.
      return r === USER_ROLES.OWNER;
    case "classrooms":
    case "families":
    case "enrollment":
      return r === USER_ROLES.OWNER || r === USER_ROLES.DIRECTOR;
    default:
      return false;
  }
}

function accountTypeAllowsCapability(accountType, capability) {
  const type = normalizeAccountType(accountType);
  if (capability === "classrooms" || capability === "families" || capability === "enrollment") {
    return type === ACCOUNT_TYPES.CENTER;
  }
  return true;
}

function canAccessCapability(account, capability, options = {}) {
  if (!capability || !PLATFORM_CAPABILITIES.includes(capability)) return false;
  if (options.adminOverride === true) return true;
  if (!account) return false;

  const accountType = resolveAccountType(account);
  const role = resolveUserRole(account);

  if (!accountTypeAllowsCapability(accountType, capability)) return false;
  if (!roleAllowsCapability(role, capability)) return false;
  return true;
}

/**
 * Returns normalized fields to persist on an account/user record.
 * Does not invent staff invites yet — only backfills missing identity fields.
 */
function migrateAccountAccessFields(account = {}) {
  const accountType = resolveAccountType(account);
  const role = resolveUserRole(account);
  const changed = account.accountType !== accountType || account.role !== role;
  return {
    accountType,
    role,
    changed,
    updates: changed ? { accountType, role } : {},
  };
}

function defaultAccountAccessFields() {
  return {
    accountType: ACCOUNT_TYPES.HOME_DAYCARE,
    role: USER_ROLES.OWNER,
  };
}

function summarizeAccountAccess(account = {}) {
  const accountType = resolveAccountType(account);
  const role = resolveUserRole(account);
  const capabilities = PLATFORM_CAPABILITIES.filter((capability) => (
    canAccessCapability({ ...account, accountType, role }, capability)
  ));
  return { accountType, role, capabilities };
}

module.exports = {
  ACCOUNT_TYPES,
  USER_ROLES,
  FUTURE_USER_ROLES,
  PLATFORM_CAPABILITIES,
  normalizeAccountType,
  normalizeUserRole,
  mapProgramTypeToAccountType,
  resolveAccountType,
  resolveUserRole,
  roleAllowsCapability,
  accountTypeAllowsCapability,
  canAccessCapability,
  migrateAccountAccessFields,
  defaultAccountAccessFields,
  summarizeAccountAccess,
};
