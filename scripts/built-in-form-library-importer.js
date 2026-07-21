/**
 * Phase 5 structured template importer.
 *
 * Turns a structured JSON payload (metadata + sections + fields) into permanent
 * built-in template + immutable version records. System-admin only at the API layer.
 *
 * Rules enforced here:
 * - Validate required metadata, sections, and fields before saving anything
 * - Reject unsupported field types
 * - Detect duplicate template keys within one import batch
 * - Detect duplicate field keys within one template
 * - Never overwrite a published template silently — updates require a new version
 *   number and a change summary
 * - No AI is used anywhere in this importer
 */

const model = require("./built-in-form-library-data-model.js");
const formsModel = require("./forms-center-data-model.js");

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validateTemplatePayload(payload, { seenKeys } = { seenKeys: new Set() }) {
  const errors = [];
  if (!isPlainObject(payload)) {
    return { ok: false, errors: ["Each template entry must be an object."] };
  }
  const templateKey = model.cleanText(payload.templateKey, 160);
  if (!templateKey) errors.push("templateKey is required.");
  if (templateKey && seenKeys.has(templateKey)) {
    errors.push(`Duplicate template ID detected in this import batch: ${templateKey}`);
  }
  if (!model.cleanText(payload.title, 180)) errors.push("title is required.");
  if (!model.cleanText(payload.shortDescription, 400)) errors.push("shortDescription is required.");
  if (!Object.values(model.BUILT_IN_CATEGORIES).includes(payload.category)) {
    errors.push(`category must be one of: ${Object.values(model.BUILT_IN_CATEGORIES).join(", ")}`);
  }
  const version = Number(payload.version);
  if (!Number.isFinite(version) || version < 1) errors.push("version must be a positive number.");
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  if (!sections.length) errors.push("At least one section is required.");

  const sectionKeys = new Set();
  const fieldKeys = new Set();
  const normalizedSections = [];
  const normalizedFields = [];
  let fillableCount = 0;

  sections.forEach((section, sectionIndex) => {
    if (!isPlainObject(section)) {
      errors.push(`Section ${sectionIndex + 1} must be an object.`);
      return;
    }
    const sectionKey = model.cleanText(section.id, 120) || `section_${sectionIndex + 1}`;
    if (sectionKeys.has(sectionKey)) errors.push(`Duplicate section ID detected: ${sectionKey}`);
    sectionKeys.add(sectionKey);
    if (!model.cleanText(section.title, 160)) errors.push(`Section ${sectionIndex + 1} needs a title.`);
    normalizedSections.push({ id: sectionKey, title: section.title, description: section.description || "" });

    const fields = Array.isArray(section.fields) ? section.fields : [];
    fields.forEach((field, fieldIndex) => {
      if (!isPlainObject(field)) {
        errors.push(`Section "${section.title || sectionKey}" field ${fieldIndex + 1} must be an object.`);
        return;
      }
      const fieldKey = model.cleanText(field.id, 160) || `${sectionKey}_field_${fieldIndex + 1}`;
      if (fieldKeys.has(fieldKey)) errors.push(`Duplicate field ID detected: ${fieldKey}`);
      fieldKeys.add(fieldKey);
      const normalizedType = formsModel.normalizeFieldType(field.type);
      const rawType = model.cleanText(field.type, 80).toLowerCase();
      if (rawType && normalizedType !== rawType) {
        errors.push(`Field "${fieldKey}" uses an unsupported field type: ${field.type}`);
      }
      if (normalizedType !== "content_divider" && !model.cleanText(field.label, 220)) {
        errors.push(`Field "${fieldKey}" needs a label.`);
      }
      if (model.SELECTION_FIELD_TYPES.has(normalizedType)) {
        const options = Array.isArray(field.options) ? field.options : [];
        if (!options.filter(Boolean).length) {
          errors.push(`Field "${fieldKey}" is a selection field and needs at least one option.`);
        }
      }
      if (formsModel.fieldCollectsInput(normalizedType)) fillableCount += 1;
      normalizedFields.push({
        id: fieldKey,
        sectionId: sectionKey,
        type: normalizedType,
        label: field.label,
        helpText: field.helpText,
        placeholder: field.placeholder,
        required: field.required === true,
        options: field.options || [],
      });
    });
  });

  if (!fillableCount) {
    errors.push("Add at least one field a provider or family can complete before importing.");
  }

  return {
    ok: errors.length === 0,
    errors,
    templateKey,
    normalized: {
      templateKey,
      title: payload.title,
      shortDescription: payload.shortDescription,
      purpose: payload.purpose || "",
      category: payload.category,
      intendedUsers: payload.intendedUsers || [],
      ageGroups: payload.ageGroups || [],
      tags: payload.tags || [],
      providerInstructions: payload.providerInstructions || "",
      familyInstructions: payload.familyInstructions || "",
      reviewReminder: payload.reviewReminder || model.DEFAULT_REVIEW_REMINDER,
      additionalReviewReminder: payload.additionalReviewReminder || "",
      estimatedMinutes: payload.estimatedMinutes || 10,
      featured: payload.featured === true,
      sortWeight: payload.sortWeight || 0,
      stateMetadata: payload.stateMetadata || null,
      version,
      changeSummary: payload.changeSummary || "",
      sections: normalizedSections,
      fields: normalizedFields,
    },
  };
}

/**
 * Validate a full import batch (array of template payloads) without writing anything.
 */
function validateImportBatch(templates) {
  const list = Array.isArray(templates) ? templates : [];
  if (!list.length) {
    return { ok: false, errors: ["Provide at least one template to import."], results: [] };
  }
  const seenKeys = new Set();
  const results = list.map((payload) => {
    const result = validateTemplatePayload(payload, { seenKeys });
    if (result.templateKey) seenKeys.add(result.templateKey);
    return result;
  });
  const errors = results.flatMap((result, index) => result.errors.map((error) => `Template ${index + 1}: ${error}`));
  return { ok: errors.length === 0, errors, results };
}

/**
 * Apply a validated import batch to the store.
 * - New templateKey → creates a new template + version 1
 * - Existing templateKey with a higher version number + changeSummary → new version
 * - Existing templateKey with same/lower version number, or no changeSummary on an
 *   update → rejected (never silently overwrite a published system template)
 */
function applyImportBatch(store, templates, { actorEmail = "system", dryRun = false, allowNewVersion = true } = {}) {
  model.ensureBuiltInFormLibraryStore(store);
  const validation = validateImportBatch(templates);
  const outcomes = [];
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, outcomes, dryRun: dryRun === true };
  }

  const lib = store.builtInFormLibrary;
  const applyErrors = [];

  validation.results.forEach((result, index) => {
    const norm = result.normalized;
    const existingTemplateId = lib.templateKeyIndex[norm.templateKey];
    const existingTemplate = existingTemplateId ? lib.templates[existingTemplateId] : null;

    if (existingTemplate) {
      if (existingTemplate.currentVersionNumber >= norm.version) {
        applyErrors.push(`Template ${index + 1} (${norm.templateKey}): version ${norm.version} is not newer than the current published version ${existingTemplate.currentVersionNumber}. Increase the version number to update.`);
        return;
      }
      if (!allowNewVersion) {
        applyErrors.push(`Template ${index + 1} (${norm.templateKey}): updating an existing template requires allowNewVersion.`);
        return;
      }
      if (!model.cleanText(norm.changeSummary, 20)) {
        applyErrors.push(`Template ${index + 1} (${norm.templateKey}): a change summary is required when publishing a new version of an existing template.`);
        return;
      }
    }

    outcomes.push({ action: existingTemplate ? "new_version" : "create", templateKey: norm.templateKey, norm, existingTemplate });
  });

  if (applyErrors.length) {
    return { ok: false, errors: applyErrors, outcomes: [], dryRun: dryRun === true };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      errors: [],
      preview: outcomes.map((outcome) => ({
        action: outcome.action,
        templateKey: outcome.templateKey,
        title: outcome.norm.title,
        version: outcome.norm.version,
        sectionCount: outcome.norm.sections.length,
        fieldCount: outcome.norm.fields.length,
      })),
    };
  }

  const applied = outcomes.map((outcome) => {
    const { norm, existingTemplate } = outcome;
    let template = existingTemplate;
    if (!template) {
      template = model.createTemplateRecord({
        templateKey: norm.templateKey,
        title: norm.title,
        shortDescription: norm.shortDescription,
        purpose: norm.purpose,
        category: norm.category,
        intendedUsers: norm.intendedUsers,
        ageGroups: norm.ageGroups,
        tags: norm.tags,
        providerInstructions: norm.providerInstructions,
        familyInstructions: norm.familyInstructions,
        reviewReminder: norm.reviewReminder,
        additionalReviewReminder: norm.additionalReviewReminder,
        estimatedMinutes: norm.estimatedMinutes,
        featured: norm.featured,
        sortWeight: norm.sortWeight,
        stateMetadata: norm.stateMetadata,
      });
      lib.templates[template.id] = template;
      lib.templateKeyIndex[norm.templateKey] = template.id;
    } else {
      template.title = model.cleanText(norm.title, 180) || template.title;
      template.shortDescription = model.cleanText(norm.shortDescription, 400) || template.shortDescription;
      template.purpose = model.cleanLongText(norm.purpose, 2000) || template.purpose;
      template.providerInstructions = model.cleanLongText(norm.providerInstructions, 3000) || template.providerInstructions;
      template.familyInstructions = model.cleanLongText(norm.familyInstructions, 3000) || template.familyInstructions;
      template.estimatedMinutes = Math.max(1, Number(norm.estimatedMinutes) || template.estimatedMinutes);
      template.updatedAt = model.nowIso();
    }

    const version = model.createTemplateVersionRecord({
      templateId: template.id,
      versionNumber: norm.version,
      title: norm.title,
      shortDescription: norm.shortDescription,
      category: norm.category,
      sections: norm.sections,
      fields: norm.fields,
      changeSummary: norm.changeSummary,
      createdByEmail: actorEmail,
    });

    const contentErrors = model.validateTemplateVersionContent(version.sections, version.fields);
    if (contentErrors.length) {
      throw Object.assign(new Error("Template failed structural validation."), { code: "template_validation_failed", errors: contentErrors, templateKey: norm.templateKey });
    }

    lib.versions[version.id] = version;

    // Mark the previous active version superseded — org copies already made from it
    // are never touched or merged automatically.
    (template.versionIds || []).forEach((previousVersionId) => {
      const previousVersion = lib.versions[previousVersionId];
      if (previousVersion && previousVersion.status === model.VERSION_STATUSES.ACTIVE) {
        previousVersion.status = model.VERSION_STATUSES.SUPERSEDED;
      }
    });

    template.versionIds = [...(template.versionIds || []), version.id];
    template.currentVersionId = version.id;
    template.currentVersionNumber = version.versionNumber;
    template.category = version.category;
    template.publishedAt = version.publishedAt;
    template.status = model.TEMPLATE_STATUSES.ACTIVE;
    lib.templates[template.id] = template;

    lib.importAudit[model.newId("bftaudit")] = model.createImportAuditRecord({
      actorEmail,
      action: outcome.action === "create" ? "import_create" : "import_new_version",
      templateKey: norm.templateKey,
      templateId: template.id,
      versionId: version.id,
      message: outcome.action === "create"
        ? `Created built-in template "${template.title}" (version ${version.versionNumber}).`
        : `Published version ${version.versionNumber} of "${template.title}": ${norm.changeSummary}`,
    });

    return { template, version, action: outcome.action };
  });

  return { ok: true, dryRun: false, errors: [], applied };
}

module.exports = {
  validateTemplatePayload,
  validateImportBatch,
  applyImportBatch,
};
