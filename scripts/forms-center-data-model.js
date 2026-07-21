/**
 * Phase 4 Forms Center data model.
 *
 * Manual custom form builder only:
 * - permanent IDs for forms, immutable published versions, fields, and audit rows
 * - draft / published / archived lifecycle
 * - no response or submission collection
 */

const crypto = require("node:crypto");

const FORMS_CENTER_SCHEMA_VERSION = 1;

const FORM_STATUSES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

const FORM_CATEGORIES = Object.freeze({
  ENROLLMENT: "enrollment",
  EMERGENCY_CONTACTS: "emergency_contacts",
  PERMISSIONS: "permissions",
  FIELD_TRIPS: "field_trips",
  CHILD_INFORMATION: "child_information",
  HEALTH_MEDICATION: "health_medication",
  PARENT_AGREEMENTS: "parent_agreements",
  INCIDENT_SAFETY: "incident_safety",
  STAFF_ADMIN: "staff_admin",
  CUSTOM: "custom",
});

const FIELD_TYPE_GROUPS = Object.freeze({
  CONTENT: "content",
  TEXT: "text",
  SELECTION: "selection",
  CHILDCARE_SMART: "childcare_smart",
  ACKNOWLEDGMENT_SIGNATURE: "acknowledgment_signature",
});

const FIELD_TYPES = Object.freeze({
  CONTENT_HEADING: "content_heading",
  CONTENT_PARAGRAPH: "content_paragraph",
  CONTENT_DIVIDER: "content_divider",
  SHORT_TEXT: "short_text",
  LONG_TEXT: "long_text",
  EMAIL: "email",
  PHONE: "phone",
  DATE: "date",
  NUMBER: "number",
  SINGLE_SELECT: "single_select",
  MULTI_SELECT: "multi_select",
  CHECKBOXES: "checkboxes",
  YES_NO: "yes_no",
  SMART_CHILD_NAME: "smart_child_name",
  SMART_CHILD_DATE_OF_BIRTH: "smart_child_date_of_birth",
  SMART_PARENT_GUARDIAN_NAME: "smart_parent_guardian_name",
  SMART_PARENT_PHONE: "smart_parent_phone",
  SMART_EMERGENCY_CONTACT_NAME: "smart_emergency_contact_name",
  SMART_EMERGENCY_CONTACT_PHONE: "smart_emergency_contact_phone",
  SMART_AUTHORIZED_PICKUP: "smart_authorized_pickup",
  SMART_ALLERGIES: "smart_allergies",
  SMART_MEDICATIONS: "smart_medications",
  SMART_PHYSICIAN: "smart_physician",
  SMART_INSURANCE: "smart_insurance",
  ACKNOWLEDGMENT: "acknowledgment",
  SIGNATURE_PARENT: "signature_parent",
  SIGNATURE_PROVIDER: "signature_provider",
  INITIALS: "initials",
});

const FIELD_TYPE_CATALOG = Object.freeze([
  { type: FIELD_TYPES.CONTENT_HEADING, label: "Section heading", group: FIELD_TYPE_GROUPS.CONTENT, description: "Large text heading for organizing a form." },
  { type: FIELD_TYPES.CONTENT_PARAGRAPH, label: "Instructions / paragraph", group: FIELD_TYPE_GROUPS.CONTENT, description: "Read-only instructions, policies, or explanatory copy." },
  { type: FIELD_TYPES.CONTENT_DIVIDER, label: "Divider", group: FIELD_TYPE_GROUPS.CONTENT, description: "Visual divider between form areas." },
  { type: FIELD_TYPES.SHORT_TEXT, label: "Short answer", group: FIELD_TYPE_GROUPS.TEXT, description: "Single-line parent/provider entry." },
  { type: FIELD_TYPES.LONG_TEXT, label: "Long answer", group: FIELD_TYPE_GROUPS.TEXT, description: "Multi-line notes, explanations, or comments." },
  { type: FIELD_TYPES.EMAIL, label: "Email", group: FIELD_TYPE_GROUPS.TEXT, description: "Email-address entry placeholder." },
  { type: FIELD_TYPES.PHONE, label: "Phone", group: FIELD_TYPE_GROUPS.TEXT, description: "Phone-number entry placeholder." },
  { type: FIELD_TYPES.DATE, label: "Date", group: FIELD_TYPE_GROUPS.TEXT, description: "Date entry placeholder." },
  { type: FIELD_TYPES.NUMBER, label: "Number", group: FIELD_TYPE_GROUPS.TEXT, description: "Numeric entry placeholder." },
  { type: FIELD_TYPES.SINGLE_SELECT, label: "Single choice", group: FIELD_TYPE_GROUPS.SELECTION, description: "Radio-style choice list." },
  { type: FIELD_TYPES.MULTI_SELECT, label: "Multiple choice", group: FIELD_TYPE_GROUPS.SELECTION, description: "Select more than one option." },
  { type: FIELD_TYPES.CHECKBOXES, label: "Checkboxes", group: FIELD_TYPE_GROUPS.SELECTION, description: "Checklist or permission choices." },
  { type: FIELD_TYPES.YES_NO, label: "Yes / No", group: FIELD_TYPE_GROUPS.SELECTION, description: "Simple yes/no choice." },
  { type: FIELD_TYPES.SMART_CHILD_NAME, label: "Child name", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "child.name", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_CHILD_DATE_OF_BIRTH, label: "Child date of birth", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "child.dateOfBirth", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_PARENT_GUARDIAN_NAME, label: "Parent / guardian name", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "guardian.name", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_PARENT_PHONE, label: "Parent phone", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "guardian.phone", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_EMERGENCY_CONTACT_NAME, label: "Emergency contact name", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "emergencyContact.name", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_EMERGENCY_CONTACT_PHONE, label: "Emergency contact phone", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "emergencyContact.phone", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_AUTHORIZED_PICKUP, label: "Authorized pickup", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "child.authorizedPickup", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_ALLERGIES, label: "Allergies", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "child.allergies", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_MEDICATIONS, label: "Medications", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "child.medications", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_PHYSICIAN, label: "Physician", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "child.physician", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.SMART_INSURANCE, label: "Insurance", group: FIELD_TYPE_GROUPS.CHILDCARE_SMART, smartKey: "child.insurance", description: "Childcare smart field placeholder." },
  { type: FIELD_TYPES.ACKNOWLEDGMENT, label: "Acknowledgment", group: FIELD_TYPE_GROUPS.ACKNOWLEDGMENT_SIGNATURE, description: "Testing-only acknowledgment placeholder." },
  { type: FIELD_TYPES.SIGNATURE_PARENT, label: "Parent signature", group: FIELD_TYPE_GROUPS.ACKNOWLEDGMENT_SIGNATURE, description: "Testing-only parent signature placeholder." },
  { type: FIELD_TYPES.SIGNATURE_PROVIDER, label: "Provider signature", group: FIELD_TYPE_GROUPS.ACKNOWLEDGMENT_SIGNATURE, description: "Testing-only provider signature placeholder." },
  { type: FIELD_TYPES.INITIALS, label: "Initials", group: FIELD_TYPE_GROUPS.ACKNOWLEDGMENT_SIGNATURE, description: "Testing-only initials placeholder." },
]);

const SELECTION_FIELD_TYPES = new Set([
  FIELD_TYPES.SINGLE_SELECT,
  FIELD_TYPES.MULTI_SELECT,
  FIELD_TYPES.CHECKBOXES,
]);

const CONTENT_ONLY_FIELD_TYPES = new Set([
  FIELD_TYPES.CONTENT_HEADING,
  FIELD_TYPES.CONTENT_PARAGRAPH,
  FIELD_TYPES.CONTENT_DIVIDER,
]);

const SIGNATURE_FIELD_TYPES = new Set([
  FIELD_TYPES.SIGNATURE_PARENT,
  FIELD_TYPES.SIGNATURE_PROVIDER,
  FIELD_TYPES.INITIALS,
]);

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanLongText(value, max = 10000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function normalizeCategory(value) {
  const key = cleanText(value, 80).toLowerCase();
  return Object.values(FORM_CATEGORIES).includes(key) ? key : FORM_CATEGORIES.CUSTOM;
}

function normalizeStatus(value) {
  const key = cleanText(value, 40).toLowerCase();
  return Object.values(FORM_STATUSES).includes(key) ? key : FORM_STATUSES.DRAFT;
}

function normalizeFieldType(value) {
  const key = cleanText(value, 80).toLowerCase();
  return FIELD_TYPE_CATALOG.some((entry) => entry.type === key) ? key : FIELD_TYPES.SHORT_TEXT;
}

function fieldTypeMeta(type) {
  const normalized = normalizeFieldType(type);
  return FIELD_TYPE_CATALOG.find((entry) => entry.type === normalized) || FIELD_TYPE_CATALOG[0];
}

function fieldRequiresLabel(type) {
  return normalizeFieldType(type) !== FIELD_TYPES.CONTENT_DIVIDER;
}

function fieldCollectsInput(type) {
  const normalized = normalizeFieldType(type);
  return !CONTENT_ONLY_FIELD_TYPES.has(normalized);
}

function normalizeOptions(value) {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set();
  return input
    .map((option) => cleanText(typeof option === "object" ? option.label : option, 160))
    .filter(Boolean)
    .filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20)
    .map((label, index) => ({ id: `opt_${index + 1}`, label }));
}

function normalizeSections(value) {
  const input = Array.isArray(value) ? value : [];
  const sections = input.map((section, index) => {
    const entry = section && typeof section === "object" ? section : {};
    return {
      id: cleanText(entry.id, 120) || newId("fcsec"),
      title: cleanText(entry.title || entry.label || `Section ${index + 1}`, 160),
      description: cleanLongText(entry.description || "", 1000),
      order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : index,
    };
  });
  if (!sections.length) {
    sections.push({
      id: newId("fcsec"),
      title: "General",
      description: "",
      order: 0,
    });
  }
  return sections.sort((a, b) => a.order - b.order).map((section, index) => ({ ...section, order: index }));
}

function createFormSection(input = {}) {
  return normalizeSections([input])[0];
}

function ensureFormsCenterStore(store) {
  if (!store || typeof store !== "object") return store;
  if (!store.formsCenter || typeof store.formsCenter !== "object" || Array.isArray(store.formsCenter)) {
    store.formsCenter = {};
  }
  store.formsCenter.schemaVersion = FORMS_CENTER_SCHEMA_VERSION;
  store.formsCenter.forms = ensureMap(store.formsCenter.forms);
  store.formsCenter.versions = ensureMap(store.formsCenter.versions);
  store.formsCenter.fields = ensureMap(store.formsCenter.fields);
  store.formsCenter.audit = ensureMap(store.formsCenter.audit);
  store.formsCenter.meta = {
    createdAt: store.formsCenter.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    noResponseCollection: true,
    note: "Phase 4 Forms Center stores form builder metadata only. Responses are not collected.",
  };
  delete store.formsCenter.responses;
  delete store.formsCenter.submissions;
  return store;
}

function createFormRecord({
  id = "",
  organizationId = "",
  title = "",
  description = "",
  category = FORM_CATEGORIES.CUSTOM,
  status = FORM_STATUSES.DRAFT,
  sourceFormId = "",
  createdByEmail = "",
  preview = false,
} = {}) {
  const createdAt = nowIso();
  const section = createFormSection({ title: "General" });
  return {
    id: id || newId("fcform"),
    organizationId: cleanText(organizationId, 160),
    title: cleanText(title, 180) || "Untitled Form",
    description: cleanLongText(description, 2000),
    category: normalizeCategory(category),
    status: normalizeStatus(status),
    previousStatus: "",
    sourceFormId: cleanText(sourceFormId, 160),
    publishedVersionId: "",
    latestVersionNumber: 0,
    draftVersionNumber: 1,
    hasUnpublishedChanges: true,
    currentDraft: {
      sections: [section],
      fieldIds: [],
    },
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    updatedByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    preview: preview === true,
    emailSent: false,
    stripeTouched: false,
    aiTouched: false,
    createdAt,
    updatedAt: createdAt,
    publishedAt: "",
    archivedAt: "",
  };
}

function createFormFieldRecord({
  id = "",
  formId = "",
  organizationId = "",
  type = FIELD_TYPES.SHORT_TEXT,
  label = "",
  helpText = "",
  placeholder = "",
  required = false,
  sectionId = "",
  order = 0,
  options = [],
  settings = {},
  preview = false,
} = {}) {
  const fieldType = normalizeFieldType(type);
  const meta = fieldTypeMeta(fieldType);
  const createdAt = nowIso();
  const normalized = {
    id: id || newId("fcfield"),
    formId: cleanText(formId, 160),
    organizationId: cleanText(organizationId, 160),
    type: fieldType,
    group: meta.group,
    label: cleanText(label || meta.label, 220),
    helpText: cleanLongText(helpText, 1200),
    placeholder: cleanText(placeholder, 220),
    required: fieldCollectsInput(fieldType) && required === true,
    sectionId: cleanText(sectionId, 160),
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    options: normalizeOptions(options),
    smartKey: meta.smartKey || "",
    settings: settings && typeof settings === "object" && !Array.isArray(settings) ? { ...settings } : {},
    preview: preview === true,
    testingOnlySignature: SIGNATURE_FIELD_TYPES.has(fieldType),
    createdAt,
    updatedAt: createdAt,
  };
  if (fieldType === FIELD_TYPES.YES_NO && !normalized.options.length) {
    normalized.options = [{ id: "opt_1", label: "Yes" }, { id: "opt_2", label: "No" }];
  }
  return normalized;
}

function normalizeFieldRecord(input = {}, defaults = {}) {
  const field = createFormFieldRecord({
    ...defaults,
    ...(input && typeof input === "object" ? input : {}),
    id: cleanText(input?.id, 160) || defaults.id || "",
  });
  field.createdAt = cleanText(input?.createdAt, 80) || defaults.createdAt || field.createdAt;
  field.updatedAt = nowIso();
  return field;
}

function createFormVersionRecord({
  id = "",
  form = null,
  versionNumber = 1,
  fields = [],
  sections = [],
  createdByEmail = "",
  preview = false,
} = {}) {
  const createdAt = nowIso();
  const cleanFields = Array.isArray(fields) ? fields.map((field) => ({ ...field })) : [];
  const cleanSections = normalizeSections(sections);
  return {
    id: id || newId("fcver"),
    formId: form?.id || "",
    organizationId: form?.organizationId || "",
    versionNumber: Math.max(1, Number(versionNumber) || 1),
    status: FORM_STATUSES.PUBLISHED,
    title: cleanText(form?.title, 180) || "Untitled Form",
    description: cleanLongText(form?.description, 2000),
    category: normalizeCategory(form?.category),
    sourceFormId: cleanText(form?.sourceFormId, 160),
    sections: cleanSections,
    fieldIds: cleanFields.map((field) => field.id).filter(Boolean),
    fields: cleanFields,
    immutable: true,
    preview: preview === true || form?.preview === true,
    createdByEmail: cleanText(createdByEmail || form?.updatedByEmail || form?.createdByEmail, 180).toLowerCase(),
    createdAt,
  };
}

function createAuditRecord({
  id = "",
  organizationId = "",
  formId = "",
  versionId = "",
  action = "",
  actorEmail = "",
  message = "",
  changes = null,
  preview = false,
} = {}) {
  return {
    id: id || newId("fcaudit"),
    organizationId: cleanText(organizationId, 160),
    formId: cleanText(formId, 160),
    versionId: cleanText(versionId, 160),
    action: cleanText(action, 120),
    actorEmail: cleanText(actorEmail, 180).toLowerCase(),
    message: cleanLongText(message, 1000),
    changes: changes && typeof changes === "object" ? changes : null,
    preview: preview === true,
    createdAt: nowIso(),
  };
}

function validateField(field) {
  const errors = [];
  const type = normalizeFieldType(field?.type);
  if (fieldRequiresLabel(type) && !cleanText(field?.label, 220)) {
    errors.push("Every field needs a clear label families and staff can understand.");
  }
  if (SELECTION_FIELD_TYPES.has(type) && normalizeOptions(field?.options).length < 1) {
    errors.push(`${fieldTypeMeta(type).label} fields need at least one option.`);
  }
  if (!cleanText(field?.sectionId, 160)) {
    errors.push("Each field must belong to a section.");
  }
  return errors;
}

function validateFormForPublish(form, fields = []) {
  const errors = [];
  if (!cleanText(form?.title, 180)) {
    errors.push("Add a form title before publishing.");
  }
  const activeFields = Array.isArray(fields) ? fields.filter((field) => field && fieldCollectsInput(field.type)) : [];
  if (!activeFields.length) {
    errors.push("Add at least one field parents or staff can complete before publishing.");
  }
  (Array.isArray(fields) ? fields : []).forEach((field, index) => {
    validateField(field).forEach((error) => errors.push(`Field ${index + 1}: ${error}`));
  });
  return {
    ok: errors.length === 0,
    errors,
  };
}

function snapshotFromForm(store, form) {
  const formsCenter = ensureFormsCenterStore(store).formsCenter;
  const draft = form?.currentDraft && typeof form.currentDraft === "object" ? form.currentDraft : {};
  const sections = normalizeSections(draft.sections);
  const fields = (Array.isArray(draft.fieldIds) ? draft.fieldIds : [])
    .map((id) => formsCenter.fields[id])
    .filter((field) => field && field.formId === form.id && field.organizationId === form.organizationId)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((field, index) => ({ ...field, order: index }));
  return {
    sections,
    fieldIds: fields.map((field) => field.id),
    fields,
  };
}

function cloneSnapshotForForm(snapshot = {}, { formId, organizationId, preview = false, keepFieldIds = false } = {}) {
  const idMap = new Map();
  const sections = normalizeSections(snapshot.sections).map((section) => {
    const nextId = keepFieldIds ? section.id : newId("fcsec");
    idMap.set(section.id, nextId);
    return { ...section, id: nextId };
  });
  const fields = (Array.isArray(snapshot.fields) ? snapshot.fields : [])
    .map((field, index) => createFormFieldRecord({
      ...field,
      id: keepFieldIds ? field.id : "",
      formId,
      organizationId,
      sectionId: idMap.get(field.sectionId) || sections[0]?.id || "",
      order: index,
      preview,
    }));
  return {
    sections,
    fieldIds: fields.map((field) => field.id),
    fields,
  };
}

function categoryCatalog() {
  return [
    { id: FORM_CATEGORIES.ENROLLMENT, label: "Enrollment" },
    { id: FORM_CATEGORIES.EMERGENCY_CONTACTS, label: "Emergency Contacts" },
    { id: FORM_CATEGORIES.PERMISSIONS, label: "Permissions" },
    { id: FORM_CATEGORIES.FIELD_TRIPS, label: "Field Trips" },
    { id: FORM_CATEGORIES.CHILD_INFORMATION, label: "Child Information" },
    { id: FORM_CATEGORIES.HEALTH_MEDICATION, label: "Health and Medication" },
    { id: FORM_CATEGORIES.PARENT_AGREEMENTS, label: "Parent Agreements" },
    { id: FORM_CATEGORIES.INCIDENT_SAFETY, label: "Incident and Safety" },
    { id: FORM_CATEGORIES.STAFF_ADMIN, label: "Staff Admin" },
    { id: FORM_CATEGORIES.CUSTOM, label: "Custom" },
  ];
}

module.exports = {
  FORMS_CENTER_SCHEMA_VERSION,
  FORM_STATUSES,
  FORM_CATEGORIES,
  FIELD_TYPE_GROUPS,
  FIELD_TYPES,
  FIELD_TYPE_CATALOG,
  ensureFormsCenterStore,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
  normalizeCategory,
  normalizeStatus,
  normalizeFieldType,
  fieldTypeMeta,
  fieldCollectsInput,
  normalizeOptions,
  normalizeSections,
  createFormSection,
  createFormRecord,
  createFormFieldRecord,
  normalizeFieldRecord,
  createFormVersionRecord,
  createAuditRecord,
  validateField,
  validateFormForPublish,
  snapshotFromForm,
  cloneSnapshotForForm,
  categoryCatalog,
};
