/**
 * Turns a built-in system template into a brand-new organization-owned draft form
 * in the Phase 4 Forms Center store. The system template and its version snapshot
 * are never modified by this operation.
 */

const formsModel = require("./forms-center-data-model.js");
const libraryModel = require("./built-in-form-library-data-model.js");

const CATEGORY_MAP_BY_TEMPLATE_KEY = Object.freeze({
  "child-enrollment-form": formsModel.FORM_CATEGORIES.ENROLLMENT,
  "emergency-contact-form": formsModel.FORM_CATEGORIES.EMERGENCY_CONTACTS,
  "authorized-pickup-form": formsModel.FORM_CATEGORIES.EMERGENCY_CONTACTS,
  "field-trip-permission-form": formsModel.FORM_CATEGORIES.FIELD_TRIPS,
});

const CATEGORY_MAP_BY_BUILT_IN_CATEGORY = Object.freeze({
  [libraryModel.BUILT_IN_CATEGORIES.ENROLLMENT_CHILD_INFO]: formsModel.FORM_CATEGORIES.CHILD_INFORMATION,
  [libraryModel.BUILT_IN_CATEGORIES.HEALTH_MEDICAL]: formsModel.FORM_CATEGORIES.HEALTH_MEDICATION,
  [libraryModel.BUILT_IN_CATEGORIES.PERMISSIONS_RELEASES]: formsModel.FORM_CATEGORIES.PERMISSIONS,
  [libraryModel.BUILT_IN_CATEGORIES.INFANT_TODDLER_CARE]: formsModel.FORM_CATEGORIES.CHILD_INFORMATION,
  [libraryModel.BUILT_IN_CATEGORIES.AGREEMENTS_POLICIES]: formsModel.FORM_CATEGORIES.PARENT_AGREEMENTS,
  [libraryModel.BUILT_IN_CATEGORIES.INCIDENTS_BEHAVIOR_DEVELOPMENT]: formsModel.FORM_CATEGORIES.INCIDENT_SAFETY,
  [libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION]: formsModel.FORM_CATEGORIES.STAFF_ADMIN,
});

function mapBuiltInCategoryToFormCategory(template) {
  return CATEGORY_MAP_BY_TEMPLATE_KEY[template.templateKey]
    || CATEGORY_MAP_BY_BUILT_IN_CATEGORY[template.category]
    || formsModel.FORM_CATEGORIES.CUSTOM;
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function uniqueTitleForOrg(store, organizationId, baseTitle) {
  const existingTitles = new Set(
    listValues(store.formsCenter?.forms)
      .filter((form) => form.organizationId === organizationId)
      .map((form) => String(form.title || "").trim().toLowerCase()),
  );
  if (!existingTitles.has(baseTitle.trim().toLowerCase())) return baseTitle;
  let attempt = 2;
  let candidate = `${baseTitle} Copy`;
  while (existingTitles.has(candidate.trim().toLowerCase())) {
    candidate = `${baseTitle} Copy ${attempt}`;
    attempt += 1;
  }
  return candidate;
}

/**
 * Creates a new organization-owned draft form from a built-in template version.
 * Always generates fresh permanent form, section, and field IDs. The template and
 * its version snapshot are read-only inputs and are never written to.
 */
function createOrganizationCopyFromTemplate(store, {
  template,
  version,
  organizationId,
  actorEmail = "",
  actorMembershipId = "",
} = {}) {
  formsModel.ensureFormsCenterStore(store);
  const title = uniqueTitleForOrg(store, organizationId, template.title);

  const form = formsModel.createFormRecord({
    organizationId,
    title,
    description: template.shortDescription,
    category: mapBuiltInCategoryToFormCategory(template),
    createdByEmail: actorEmail,
    preview: true,
  });

  // Strip template-scoped IDs before handing sections/fields to the Forms Center
  // model so brand-new fcsec_*/fcfield_* IDs are generated for this org's copy.
  const sectionsInput = (version.sections || []).map((section) => ({
    title: section.title,
    description: section.description,
  }));
  const sections = formsModel.normalizeSections(sectionsInput);
  const sectionTitleToId = new Map(sections.map((section) => [section.title, section.id]));
  const originalSectionIdToTitle = new Map((version.sections || []).map((section) => [section.id, section.title]));

  const fields = (version.fields || []).map((field, index) => {
    const sectionTitle = originalSectionIdToTitle.get(field.sectionId) || sections[0]?.title;
    const sectionId = sectionTitleToId.get(sectionTitle) || sections[0]?.id || "";
    return formsModel.createFormFieldRecord({
      formId: form.id,
      organizationId,
      type: field.type,
      label: field.label,
      helpText: field.helpText,
      placeholder: field.placeholder,
      required: field.required === true,
      sectionId,
      order: index,
      options: field.options,
      preview: true,
    });
  });

  fields.forEach((field) => { store.formsCenter.fields[field.id] = field; });
  form.currentDraft = { sections, fieldIds: fields.map((field) => field.id) };
  form.sourceTemplateId = template.id;
  form.sourceTemplateKey = template.templateKey;
  form.sourceTemplateVersionId = version.id;
  form.sourceTemplateVersionNumber = version.versionNumber;
  form.builtInSource = true;
  store.formsCenter.forms[form.id] = form;

  const audit = formsModel.createAuditRecord({
    organizationId,
    formId: form.id,
    action: "create_from_built_in_template",
    actorEmail,
    message: `Created from built-in template "${template.title}" (version ${version.versionNumber}). The built-in original was not changed.`,
    changes: { sourceTemplateId: template.id, sourceTemplateVersionId: version.id, sourceTemplateVersionNumber: version.versionNumber },
    preview: true,
  });
  store.formsCenter.audit[audit.id] = audit;

  template.copyCount = (Number(template.copyCount) || 0) + 1;

  libraryModel.ensureBuiltInFormLibraryStore(store);
  const recentCopyId = libraryModel.newId("bftrecent");
  store.builtInFormLibrary.recentCopies[recentCopyId] = {
    id: recentCopyId,
    organizationId,
    actorEmail: String(actorEmail || "").trim().toLowerCase(),
    actorMembershipId: actorMembershipId || "",
    templateId: template.id,
    templateKey: template.templateKey,
    templateTitle: template.title,
    formId: form.id,
    versionNumber: version.versionNumber,
    createdAt: libraryModel.nowIso(),
  };

  return { form, sections, fields };
}

module.exports = {
  mapBuiltInCategoryToFormCategory,
  uniqueTitleForOrg,
  createOrganizationCopyFromTemplate,
};
