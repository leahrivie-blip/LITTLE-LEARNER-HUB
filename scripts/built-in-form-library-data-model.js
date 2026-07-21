/**
 * Phase 5 Built-In Little Learner Hub Form Library data model.
 *
 * System-owned master templates only:
 * - permanent system-template IDs (bftpl_*), separate from organization forms (fcform_*)
 * - immutable published template versions (bftver_*)
 * - templates are never modified by providers; "Use This Template" always creates a
 *   brand-new organization-owned draft form in the Phase 4 Forms Center store
 * - active / retired lifecycle with replaced-by references
 * - no response/submission collection
 */

const crypto = require("node:crypto");
const formsModel = require("./forms-center-data-model.js");

const BUILT_IN_LIBRARY_SCHEMA_VERSION = 1;

const TEMPLATE_STATUSES = Object.freeze({
  ACTIVE: "active",
  RETIRED: "retired",
});

const VERSION_STATUSES = Object.freeze({
  ACTIVE: "active",
  SUPERSEDED: "superseded",
});

const BUILT_IN_CATEGORIES = Object.freeze({
  ENROLLMENT_CHILD_INFO: "enrollment_child_info",
  HEALTH_MEDICAL: "health_medical",
  PERMISSIONS_RELEASES: "permissions_releases",
  INFANT_TODDLER_CARE: "infant_toddler_care",
  AGREEMENTS_POLICIES: "agreements_policies",
  INCIDENTS_BEHAVIOR_DEVELOPMENT: "incidents_behavior_development",
  PROGRAM_EVENTS_COMMUNICATION: "program_events_communication",
});

const BUILT_IN_CATEGORY_CATALOG = Object.freeze([
  { id: BUILT_IN_CATEGORIES.ENROLLMENT_CHILD_INFO, label: "Enrollment and Child Information" },
  { id: BUILT_IN_CATEGORIES.HEALTH_MEDICAL, label: "Health and Medical" },
  { id: BUILT_IN_CATEGORIES.PERMISSIONS_RELEASES, label: "Permissions and Releases" },
  { id: BUILT_IN_CATEGORIES.INFANT_TODDLER_CARE, label: "Infant and Toddler Care" },
  { id: BUILT_IN_CATEGORIES.AGREEMENTS_POLICIES, label: "Agreements and Policies" },
  { id: BUILT_IN_CATEGORIES.INCIDENTS_BEHAVIOR_DEVELOPMENT, label: "Incidents, Behavior, and Development" },
  { id: BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION, label: "Program Events and Communication" },
]);

const INTENDED_USERS = Object.freeze({
  FAMILY: "family",
  STAFF: "staff",
  DIRECTOR: "director",
});

const INTENDED_USER_CATALOG = Object.freeze([
  { id: INTENDED_USERS.FAMILY, label: "Family form" },
  { id: INTENDED_USERS.STAFF, label: "Staff form" },
  { id: INTENDED_USERS.DIRECTOR, label: "Director form" },
]);

const AGE_GROUPS = Object.freeze({
  INFANT: "infant",
  TODDLER: "toddler",
  PRESCHOOL: "preschool",
  SCHOOL_AGE: "school_age",
  ALL_AGES: "all_ages",
});

const AGE_GROUP_CATALOG = Object.freeze([
  { id: AGE_GROUPS.INFANT, label: "Infant" },
  { id: AGE_GROUPS.TODDLER, label: "Toddler" },
  { id: AGE_GROUPS.PRESCHOOL, label: "Preschool" },
  { id: AGE_GROUPS.SCHOOL_AGE, label: "School Age" },
  { id: AGE_GROUPS.ALL_AGES, label: "All Ages" },
]);

const DEFAULT_REVIEW_REMINDER = "Review and customize this template for your program, policies, families, and state licensing requirements before use.";

const SORT_OPTIONS = Object.freeze({
  RECOMMENDED: "recommended",
  ALPHABETICAL: "alphabetical",
  RECENTLY_ADDED: "recently_added",
  MOST_USED: "most_used",
  COMPLETION_TIME: "completion_time",
});

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 500) {
  return formsModel.cleanText(value, max);
}

function cleanLongText(value, max = 4000) {
  return formsModel.cleanLongText(value, max);
}

function normalizeBuiltInCategory(value) {
  const key = cleanText(value, 80).toLowerCase();
  return Object.values(BUILT_IN_CATEGORIES).includes(key) ? key : BUILT_IN_CATEGORIES.ENROLLMENT_CHILD_INFO;
}

function normalizeTemplateStatus(value) {
  const key = cleanText(value, 40).toLowerCase();
  return Object.values(TEMPLATE_STATUSES).includes(key) ? key : TEMPLATE_STATUSES.ACTIVE;
}

function normalizeIntendedUsers(value) {
  const input = Array.isArray(value) ? value : [value];
  const cleaned = input
    .map((entry) => cleanText(entry, 40).toLowerCase())
    .filter((entry) => Object.values(INTENDED_USERS).includes(entry));
  const unique = [...new Set(cleaned)];
  return unique.length ? unique : [INTENDED_USERS.FAMILY];
}

function normalizeAgeGroups(value) {
  const input = Array.isArray(value) ? value : [value];
  const cleaned = input
    .map((entry) => cleanText(entry, 40).toLowerCase())
    .filter((entry) => Object.values(AGE_GROUPS).includes(entry));
  const unique = [...new Set(cleaned)];
  return unique.length ? unique : [AGE_GROUPS.ALL_AGES];
}

function normalizeTags(value) {
  const input = Array.isArray(value) ? value : [];
  const cleaned = input.map((entry) => cleanText(entry, 60).toLowerCase()).filter(Boolean);
  return [...new Set(cleaned)].slice(0, 20);
}

function templateSection({ id = "", title = "", description = "" } = {}, order = 0) {
  return {
    id: cleanText(id, 120) || newId("bftsec"),
    title: cleanText(title || `Section ${order + 1}`, 160),
    description: cleanLongText(description || "", 1000),
    order,
  };
}

function templateField(input = {}, order = 0) {
  const type = formsModel.normalizeFieldType(input.type);
  const meta = formsModel.fieldTypeMeta(type);
  return {
    id: cleanText(input.id, 160) || newId("bftfield"),
    type,
    group: meta.group,
    label: cleanText(input.label || meta.label, 220),
    helpText: cleanLongText(input.helpText || "", 1200),
    placeholder: cleanText(input.placeholder || "", 220),
    required: formsModel.fieldCollectsInput(type) && input.required === true,
    sectionId: cleanText(input.sectionId, 160),
    order,
    options: formsModel.normalizeOptions(input.options || []),
    smartKey: meta.smartKey || "",
    testingOnlySignature: ["signature_parent", "signature_provider", "initials"].includes(type),
  };
}

/**
 * A built-in template record — system-owned, immutable to providers.
 * Content lives in the linked version snapshot (see createTemplateVersionRecord).
 */
function createTemplateRecord({
  id = "",
  templateKey = "",
  title = "",
  shortDescription = "",
  purpose = "",
  category = BUILT_IN_CATEGORIES.ENROLLMENT_CHILD_INFO,
  intendedUsers = [INTENDED_USERS.FAMILY],
  ageGroups = [AGE_GROUPS.ALL_AGES],
  tags = [],
  providerInstructions = "",
  familyInstructions = "",
  reviewReminder = DEFAULT_REVIEW_REMINDER,
  additionalReviewReminder = "",
  estimatedMinutes = 10,
  featured = false,
  sortWeight = 0,
  stateMetadata = null,
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("bftpl"),
    templateKey: cleanText(templateKey, 160),
    title: cleanText(title, 180) || "Untitled Template",
    shortDescription: cleanText(shortDescription, 400),
    purpose: cleanLongText(purpose, 2000),
    category: normalizeBuiltInCategory(category),
    intendedUsers: normalizeIntendedUsers(intendedUsers),
    ageGroups: normalizeAgeGroups(ageGroups),
    tags: normalizeTags(tags),
    providerInstructions: cleanLongText(providerInstructions, 3000),
    familyInstructions: cleanLongText(familyInstructions, 3000),
    reviewReminder: cleanLongText(reviewReminder || DEFAULT_REVIEW_REMINDER, 600),
    additionalReviewReminder: cleanLongText(additionalReviewReminder || "", 600),
    estimatedMinutes: Math.max(1, Number(estimatedMinutes) || 10),
    featured: featured === true,
    sortWeight: Number(sortWeight) || 0,
    status: TEMPLATE_STATUSES.ACTIVE,
    replacedByTemplateId: "",
    stateMetadata: normalizeStateMetadata(stateMetadata),
    currentVersionId: "",
    currentVersionNumber: 0,
    versionIds: [],
    previewCount: 0,
    copyCount: 0,
    favoriteCount: 0,
    system: true,
    organizationId: "",
    createdAt,
    updatedAt: createdAt,
    publishedAt: "",
    retiredAt: "",
  };
}

function normalizeStateMetadata(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    state: cleanText(input.state, 40),
    stateSpecific: input.stateSpecific === true,
    licensingSource: cleanText(input.licensingSource, 200),
    sourceUrl: cleanText(input.sourceUrl, 400),
    lastVerifiedDate: cleanText(input.lastVerifiedDate, 40),
    reviewStatus: cleanText(input.reviewStatus, 80) || "general_us_template",
  };
}

/**
 * Immutable published snapshot of a template's sections and fields.
 */
function createTemplateVersionRecord({
  id = "",
  templateId = "",
  versionNumber = 1,
  status = VERSION_STATUSES.ACTIVE,
  title = "",
  shortDescription = "",
  category = BUILT_IN_CATEGORIES.ENROLLMENT_CHILD_INFO,
  sections = [],
  fields = [],
  changeSummary = "",
  createdByEmail = "system@littlelearnershubbyleah.com",
} = {}) {
  const createdAt = nowIso();
  const cleanSections = sections.map((section, index) => templateSection(section, index));
  const sectionIds = new Set(cleanSections.map((section) => section.id));
  const fallbackSectionId = cleanSections[0]?.id || "";
  const cleanFields = fields.map((field, index) => templateField({
    ...field,
    sectionId: sectionIds.has(field.sectionId) ? field.sectionId : fallbackSectionId,
  }, index));
  return {
    id: id || newId("bftver"),
    templateId,
    versionNumber: Math.max(1, Number(versionNumber) || 1),
    status: Object.values(VERSION_STATUSES).includes(status) ? status : VERSION_STATUSES.ACTIVE,
    title: cleanText(title, 180) || "Untitled Template",
    shortDescription: cleanText(shortDescription, 400),
    category: normalizeBuiltInCategory(category),
    sections: cleanSections,
    fieldIds: cleanFields.map((field) => field.id),
    fields: cleanFields,
    changeSummary: cleanLongText(changeSummary || "Initial published version.", 1000),
    immutable: true,
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdAt,
    publishedAt: createdAt,
  };
}

function createImportAuditRecord({
  id = "",
  actorEmail = "",
  action = "",
  templateKey = "",
  templateId = "",
  versionId = "",
  message = "",
  ok = true,
  errors = [],
} = {}) {
  return {
    id: id || newId("bftaudit"),
    actorEmail: cleanText(actorEmail, 180).toLowerCase(),
    action: cleanText(action, 120),
    templateKey: cleanText(templateKey, 160),
    templateId: cleanText(templateId, 160),
    versionId: cleanText(versionId, 160),
    message: cleanLongText(message, 1000),
    ok: ok !== false,
    errors: Array.isArray(errors) ? errors.slice(0, 40) : [],
    createdAt: nowIso(),
  };
}

function ensureBuiltInFormLibraryStore(store) {
  if (!store || typeof store !== "object") return store;
  if (!store.builtInFormLibrary || typeof store.builtInFormLibrary !== "object" || Array.isArray(store.builtInFormLibrary)) {
    store.builtInFormLibrary = {};
  }
  const lib = store.builtInFormLibrary;
  lib.schemaVersion = BUILT_IN_LIBRARY_SCHEMA_VERSION;
  lib.templates = lib.templates && typeof lib.templates === "object" && !Array.isArray(lib.templates) ? lib.templates : {};
  lib.versions = lib.versions && typeof lib.versions === "object" && !Array.isArray(lib.versions) ? lib.versions : {};
  lib.importAudit = lib.importAudit && typeof lib.importAudit === "object" && !Array.isArray(lib.importAudit) ? lib.importAudit : {};
  lib.templateKeyIndex = lib.templateKeyIndex && typeof lib.templateKeyIndex === "object" && !Array.isArray(lib.templateKeyIndex) ? lib.templateKeyIndex : {};
  // organization/user-scoped preference collections (never affect the global template)
  lib.favorites = lib.favorites && typeof lib.favorites === "object" && !Array.isArray(lib.favorites) ? lib.favorites : {};
  lib.recentPreviews = lib.recentPreviews && typeof lib.recentPreviews === "object" && !Array.isArray(lib.recentPreviews) ? lib.recentPreviews : {};
  lib.recentCopies = lib.recentCopies && typeof lib.recentCopies === "object" && !Array.isArray(lib.recentCopies) ? lib.recentCopies : {};
  lib.copyRequests = lib.copyRequests && typeof lib.copyRequests === "object" && !Array.isArray(lib.copyRequests) ? lib.copyRequests : {};
  lib.meta = {
    ...(lib.meta && typeof lib.meta === "object" ? lib.meta : {}),
    createdAt: lib.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    noResponseCollection: true,
    note: "Phase 5 built-in template library. Templates are system-owned and immutable to providers.",
  };
  delete lib.responses;
  delete lib.submissions;
  return store;
}

const SELECTION_FIELD_TYPES = new Set(["single_select", "multi_select", "checkboxes"]);
const SIGNATURE_FIELD_TYPES = new Set(["signature_parent", "signature_provider", "initials"]);
const ACKNOWLEDGMENT_FIELD_TYPES = new Set(["acknowledgment"]);

function validateTemplateVersionContent(sections, fields) {
  const errors = [];
  const cleanSections = Array.isArray(sections) ? sections : [];
  const cleanFields = Array.isArray(fields) ? fields : [];
  if (!cleanSections.length) errors.push("A template needs at least one section.");
  const sectionIds = new Set(cleanSections.map((section) => section.id));
  const fieldIds = new Set();
  let fillableCount = 0;
  cleanFields.forEach((field, index) => {
    if (fieldIds.has(field.id)) errors.push(`Duplicate field ID detected: ${field.id}`);
    fieldIds.add(field.id);
    if (field.sectionId && !sectionIds.has(field.sectionId)) {
      errors.push(`Field ${index + 1} references a section that does not exist.`);
    }
    formsModel.validateField(field).forEach((error) => errors.push(`Field ${index + 1}: ${error}`));
    if (formsModel.fieldCollectsInput(field.type)) fillableCount += 1;
  });
  if (!fillableCount) {
    errors.push("A template must include at least one field a provider or family can complete — titles and empty placeholders are not enough.");
  }
  return errors;
}

function hasAcknowledgment(fields) {
  return (Array.isArray(fields) ? fields : []).some((field) => ACKNOWLEDGMENT_FIELD_TYPES.has(field.type));
}

function hasSignaturePlaceholder(fields) {
  return (Array.isArray(fields) ? fields : []).some((field) => SIGNATURE_FIELD_TYPES.has(field.type));
}

function sectionCount(version) {
  return Array.isArray(version?.sections) ? version.sections.length : 0;
}

module.exports = {
  BUILT_IN_LIBRARY_SCHEMA_VERSION,
  TEMPLATE_STATUSES,
  VERSION_STATUSES,
  BUILT_IN_CATEGORIES,
  BUILT_IN_CATEGORY_CATALOG,
  INTENDED_USERS,
  INTENDED_USER_CATALOG,
  AGE_GROUPS,
  AGE_GROUP_CATALOG,
  DEFAULT_REVIEW_REMINDER,
  SORT_OPTIONS,
  SELECTION_FIELD_TYPES,
  SIGNATURE_FIELD_TYPES,
  listValues,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  normalizeBuiltInCategory,
  normalizeTemplateStatus,
  normalizeIntendedUsers,
  normalizeAgeGroups,
  normalizeTags,
  normalizeStateMetadata,
  templateSection,
  templateField,
  createTemplateRecord,
  createTemplateVersionRecord,
  createImportAuditRecord,
  ensureBuiltInFormLibraryStore,
  validateTemplateVersionContent,
  hasAcknowledgment,
  hasSignaturePlaceholder,
  sectionCount,
};
