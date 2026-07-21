/**
 * Forms Center Phase 4 API — admin-only private preview.
 * Manual custom form builder only. No responses, email, Stripe, or AI endpoints.
 */

const foundation = require("../scripts/foundation-data-model.js");
const entitlements = require("../scripts/entitlement-model.js");
const model = require("../scripts/forms-center-data-model.js");
const fixtures = require("../scripts/forms-center-preview-fixtures.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function byUpdatedDesc(a, b) {
  return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
}

function byVersionAsc(a, b) {
  return (Number(a.versionNumber) || 0) - (Number(b.versionNumber) || 0);
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function formVersions(store, formId) {
  return listValues(store.formsCenter?.versions)
    .filter((version) => version.formId === formId)
    .sort(byVersionAsc);
}

function publishedVersion(store, form) {
  if (!form?.publishedVersionId) return null;
  return store.formsCenter?.versions?.[form.publishedVersionId] || null;
}

function activeSnapshot(store, form, { preferPublished = false, versionId = "" } = {}) {
  if (versionId) {
    const version = store.formsCenter.versions[versionId];
    if (version && version.formId === form.id && version.organizationId === form.organizationId) {
      return {
        source: "version",
        version,
        sections: jsonClone(version.sections || []),
        fields: jsonClone(version.fields || []),
      };
    }
  }
  const published = publishedVersion(store, form);
  if (preferPublished && published) {
    return {
      source: "published",
      version: published,
      sections: jsonClone(published.sections || []),
      fields: jsonClone(published.fields || []),
    };
  }
  const draft = model.snapshotFromForm(store, form);
  if (draft.fields.length || form.status !== model.FORM_STATUSES.PUBLISHED || !published) {
    return {
      source: "draft",
      version: null,
      sections: jsonClone(draft.sections),
      fields: jsonClone(draft.fields),
    };
  }
  return {
    source: "published",
    version: published,
    sections: jsonClone(published.sections || []),
    fields: jsonClone(published.fields || []),
  };
}

function summarizeForm(store, form) {
  const draft = model.snapshotFromForm(store, form);
  const versions = formVersions(store, form.id);
  return {
    id: form.id,
    organizationId: form.organizationId,
    title: form.title,
    description: form.description,
    category: form.category,
    status: form.status,
    sourceFormId: form.sourceFormId || "",
    publishedVersionId: form.publishedVersionId || "",
    latestVersionNumber: form.latestVersionNumber || 0,
    draftVersionNumber: form.draftVersionNumber || 1,
    hasUnpublishedChanges: form.hasUnpublishedChanges === true,
    fieldCount: draft.fields.length || (publishedVersion(store, form)?.fields || []).length,
    versionCount: versions.length,
    preview: form.preview === true,
    emailSent: false,
    stripeTouched: false,
    aiTouched: false,
    createdAt: form.createdAt || "",
    updatedAt: form.updatedAt || "",
    publishedAt: form.publishedAt || "",
    archivedAt: form.archivedAt || "",
  };
}

function countsForOrg(store, organizationId) {
  const forms = listValues(store.formsCenter.forms).filter((form) => form.organizationId === organizationId);
  const byStatus = {
    draft: forms.filter((form) => form.status === model.FORM_STATUSES.DRAFT).length,
    published: forms.filter((form) => form.status === model.FORM_STATUSES.PUBLISHED).length,
    archived: forms.filter((form) => form.status === model.FORM_STATUSES.ARCHIVED).length,
  };
  const byCategory = {};
  forms.forEach((form) => {
    byCategory[form.category] = (byCategory[form.category] || 0) + 1;
  });
  return {
    total: forms.length,
    ...byStatus,
    byCategory,
    versions: listValues(store.formsCenter.versions).filter((version) => version.organizationId === organizationId).length,
    fields: listValues(store.formsCenter.fields).filter((field) => field.organizationId === organizationId).length,
    audit: listValues(store.formsCenter.audit).filter((row) => row.organizationId === organizationId).length,
    responses: 0,
  };
}

function addAudit(store, form, action, actorEmail, message, versionId = "", changes = null) {
  const audit = model.createAuditRecord({
    organizationId: form.organizationId,
    formId: form.id,
    versionId,
    action,
    actorEmail,
    message,
    changes,
    preview: form.preview === true,
  });
  store.formsCenter.audit[audit.id] = audit;
  return audit;
}

function resolveEntitlement(store, organizationId) {
  return listValues(store.organizationEntitlements).find((row) => row.organizationId === organizationId) || null;
}

function entitlementAllowsForms(entitlement) {
  if (!entitlement) return true;
  if (Array.isArray(entitlement.featureEntitlements)) {
    return entitlement.featureEntitlements.includes(entitlements.FEATURE_ENTITLEMENTS.FORMS_CENTER);
  }
  const plan = entitlements.PLANNED_PLAN_CATALOG[entitlement.basePlanKey];
  if (!plan) return true;
  if (Array.isArray(plan.excludes) && plan.excludes.includes(entitlements.FEATURE_ENTITLEMENTS.FORMS_CENTER)) return false;
  return entitlements.resolvePlanFeatures(entitlement.basePlanKey).includes(entitlements.FEATURE_ENTITLEMENTS.FORMS_CENTER);
}

function normalizeMetadataPatch(input, form) {
  const next = { ...form };
  if (input.title !== undefined) next.title = model.cleanText(input.title, 180);
  if (input.description !== undefined) next.description = model.cleanLongText(input.description, 2000);
  if (input.category !== undefined) next.category = model.normalizeCategory(input.category);
  next.updatedAt = model.nowIso();
  return next;
}

function saveDraftSnapshot(store, form, body, actorEmail, { auditAction = "save_draft", auditMessage = "Draft saved." } = {}) {
  const sections = model.normalizeSections(body.sections || form.currentDraft?.sections || []);
  const sectionIds = new Set(sections.map((section) => section.id));
  const fallbackSectionId = sections[0]?.id || "";
  const inputFields = Array.isArray(body.fields) ? body.fields : [];
  const nextFields = inputFields.map((field, index) => {
    const fieldId = model.cleanText(field?.id, 160);
    const existing = fieldId ? store.formsCenter.fields[fieldId] : null;
    const sectionId = sectionIds.has(field?.sectionId) ? field.sectionId : fallbackSectionId;
    return model.normalizeFieldRecord(field, {
      id: existing && existing.formId === form.id && existing.organizationId === form.organizationId ? existing.id : "",
      formId: form.id,
      organizationId: form.organizationId,
      sectionId,
      order: index,
      preview: form.preview === true,
      createdAt: existing?.createdAt || "",
    });
  });

  const nextIds = new Set(nextFields.map((field) => field.id));
  listValues(store.formsCenter.fields).forEach((field) => {
    if (field.formId === form.id && field.organizationId === form.organizationId && !nextIds.has(field.id)) {
      delete store.formsCenter.fields[field.id];
    }
  });
  nextFields.forEach((field, index) => {
    field.order = index;
    store.formsCenter.fields[field.id] = field;
  });
  form.currentDraft = {
    sections,
    fieldIds: nextFields.map((field) => field.id),
  };
  form.draftVersionNumber = form.status === model.FORM_STATUSES.PUBLISHED
    ? Math.max((form.latestVersionNumber || 0) + 1, form.draftVersionNumber || 1)
    : (form.draftVersionNumber || 1);
  form.hasUnpublishedChanges = true;
  form.updatedByEmail = actorEmail;
  form.updatedAt = model.nowIso();
  store.formsCenter.forms[form.id] = form;
  addAudit(store, form, auditAction, actorEmail, auditMessage, "", {
    fieldCount: nextFields.length,
    sectionCount: sections.length,
  });
  return {
    form,
    sections,
    fields: nextFields,
  };
}

function createFormsCenterApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function contextForAdmin(adminEmail = "") {
    const store = readStore();
    foundation.ensureFoundationStore(store);
    model.ensureFormsCenterStore(store);
    const organization = fixtures.ensurePreviewOrganization(store, { adminEmail });
    const entitlement = resolveEntitlement(store, organization.id);
    return { store, organization, entitlement };
  }

  function rejectOrgMismatch(response, organization, source = {}) {
    const requested = model.cleanText(source.organizationId, 160);
    if (requested && requested !== organization.id) {
      jsonResponse(response, 403, {
        error: "That form belongs to a different organization.",
        code: "organization_mismatch",
        organizationId: organization.id,
      });
      return true;
    }
    return false;
  }

  function rejectEntitlement(response, entitlement) {
    if (entitlementAllowsForms(entitlement)) return false;
    jsonResponse(response, 403, {
      error: "Forms Center is not included with this preview plan. Upgrade from Curriculum Only to use custom forms.",
      code: "forms_center_entitlement_required",
      plan: entitlement?.basePlanKey || "",
      feature: entitlements.FEATURE_ENTITLEMENTS.FORMS_CENTER,
    });
    return true;
  }

  function findFormOr404(response, store, organizationId, formId) {
    const form = store.formsCenter.forms[formId];
    if (!form) {
      jsonResponse(response, 404, { error: "Form was not found.", code: "form_not_found" });
      return null;
    }
    if (form.organizationId !== organizationId) {
      jsonResponse(response, 403, {
        error: "That form belongs to a different organization.",
        code: "organization_mismatch",
      });
      return null;
    }
    return form;
  }

  function homePayload(store, organization, entitlement) {
    const forms = listValues(store.formsCenter.forms)
      .filter((form) => form.organizationId === organization.id)
      .sort(byUpdatedDesc);
    return {
      ok: true,
      phase: 4,
      preview: true,
      adminOnly: true,
      label: fixtures.PREVIEW_MARKER,
      fakeDataOnly: true,
      emailSent: false,
      stripeTouched: false,
      aiTouched: false,
      responseCollection: false,
      organization,
      entitlement: entitlement ? { ...entitlement, live: false } : null,
      counts: countsForOrg(store, organization.id),
      recentForms: forms.slice(0, 6).map((form) => summarizeForm(store, form)),
      publishedForms: forms.filter((form) => form.status === model.FORM_STATUSES.PUBLISHED).slice(0, 6).map((form) => summarizeForm(store, form)),
      drafts: forms.filter((form) => form.status === model.FORM_STATUSES.DRAFT).slice(0, 6).map((form) => summarizeForm(store, form)),
      categories: model.categoryCatalog(),
      audit: listValues(store.formsCenter.audit)
        .filter((row) => row.organizationId === organization.id)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 8),
    };
  }

  async function handleSeed(request, response, context = {}) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    foundation.ensureFoundationStore(store);
    model.ensureFormsCenterStore(store);
    const requestedOrgId = model.cleanText(body.organizationId, 160);
    if (requestedOrgId) {
      const requestedOrg = store.organizations?.[requestedOrgId];
      const email = normalizeEmail(context.adminEmail || "");
      if (requestedOrg && requestedOrg.preview !== true && safeLower(requestedOrg.ownerEmail) !== email) {
        jsonResponse(response, 403, {
          error: "That organization cannot be seeded from this admin preview.",
          code: "organization_mismatch",
        });
        return;
      }
    }
    const seeded = fixtures.seedFormsCenterPreview(store, {
      adminEmail: context.adminEmail,
      organizationId: requestedOrgId,
    });
    writeStore(store);
    const organization = store.organizations[seeded.organizationId];
    jsonResponse(response, 200, {
      ...seeded,
      home: homePayload(store, organization, resolveEntitlement(store, organization.id)),
    });
  }

  async function handleHome(request, response, context = {}) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    writeStore(store);
    if (rejectEntitlement(response, entitlement)) return;
    jsonResponse(response, 200, homePayload(store, organization, entitlement));
  }

  async function handleListForms(request, response, context = {}, url) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    writeStore(store);
    if (rejectEntitlement(response, entitlement)) return;
    if (rejectOrgMismatch(response, organization, { organizationId: url.searchParams.get("organizationId") || "" })) return;
    const q = safeLower(url.searchParams.get("q") || "");
    const status = safeLower(url.searchParams.get("status") || "active");
    const category = model.normalizeCategory(url.searchParams.get("category") || "");
    const hasCategoryFilter = Boolean(url.searchParams.get("category"));
    let forms = listValues(store.formsCenter.forms).filter((form) => form.organizationId === organization.id);
    if (status === "active") forms = forms.filter((form) => form.status !== model.FORM_STATUSES.ARCHIVED);
    else if (Object.values(model.FORM_STATUSES).includes(status)) forms = forms.filter((form) => form.status === status);
    if (hasCategoryFilter) forms = forms.filter((form) => form.category === category);
    if (q) {
      forms = forms.filter((form) => [
        form.title,
        form.description,
        form.category,
        form.status,
      ].some((value) => safeLower(value).includes(q)));
    }
    jsonResponse(response, 200, {
      ok: true,
      organizationId: organization.id,
      counts: countsForOrg(store, organization.id),
      forms: forms.sort(byUpdatedDesc).map((form) => summarizeForm(store, form)),
    });
  }

  async function handleCreateForm(request, response, context = {}) {
    const body = await readJson(request);
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    if (rejectOrgMismatch(response, organization, body)) return;
    const form = model.createFormRecord({
      organizationId: organization.id,
      title: body.title || "Untitled Form",
      description: body.description || "",
      category: body.category || model.FORM_CATEGORIES.CUSTOM,
      createdByEmail: normalizeEmail(context.adminEmail || ""),
      preview: true,
    });
    store.formsCenter.forms[form.id] = form;
    addAudit(store, form, "create", context.adminEmail, "Blank form created.");
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      form,
      snapshot: activeSnapshot(store, form),
    });
  }

  async function handleGetForm(request, response, context = {}, formId) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    writeStore(store);
    if (rejectEntitlement(response, entitlement)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    jsonResponse(response, 200, {
      ok: true,
      form,
      summary: summarizeForm(store, form),
      snapshot: activeSnapshot(store, form),
      publishedVersion: publishedVersion(store, form),
      versions: formVersions(store, form.id),
    });
  }

  async function handlePatchForm(request, response, context = {}, formId) {
    const body = await readJson(request);
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    if (rejectOrgMismatch(response, organization, body)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    if (form.status === model.FORM_STATUSES.ARCHIVED) {
      jsonResponse(response, 409, { error: "Restore this form before editing it.", code: "form_archived" });
      return;
    }
    const next = normalizeMetadataPatch(body, form);
    next.hasUnpublishedChanges = true;
    next.updatedByEmail = normalizeEmail(context.adminEmail || "");
    store.formsCenter.forms[next.id] = next;
    addAudit(store, next, "update_metadata", context.adminEmail, "Form details updated.", "", {
      title: next.title,
      category: next.category,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      form: next,
      snapshot: activeSnapshot(store, next),
    });
  }

  async function handleSaveDraft(request, response, context = {}, formId) {
    const body = await readJson(request);
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    if (rejectOrgMismatch(response, organization, body)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    if (form.status === model.FORM_STATUSES.ARCHIVED) {
      jsonResponse(response, 409, { error: "Restore this form before saving a draft.", code: "form_archived" });
      return;
    }
    if (body.title !== undefined || body.description !== undefined || body.category !== undefined) {
      Object.assign(form, normalizeMetadataPatch(body, form));
    }
    const saved = saveDraftSnapshot(store, form, body, normalizeEmail(context.adminEmail || ""), {
      auditAction: body.autosave ? "autosave" : "save_draft",
      auditMessage: body.autosave ? "Autosaved draft snapshot." : "Draft snapshot saved.",
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      autosave: body.autosave === true,
      savedAt: form.updatedAt,
      form: saved.form,
      snapshot: {
        source: "draft",
        sections: saved.sections,
        fields: saved.fields,
      },
    });
  }

  async function handlePublish(request, response, context = {}, formId) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    if (form.status === model.FORM_STATUSES.ARCHIVED) {
      jsonResponse(response, 409, { error: "Restore this form before publishing it.", code: "form_archived" });
      return;
    }
    const snapshot = model.snapshotFromForm(store, form);
    const validation = model.validateFormForPublish(form, snapshot.fields);
    if (!validation.ok) {
      jsonResponse(response, 400, {
        error: validation.errors[0] || "Please fix the form before publishing.",
        code: "form_validation_failed",
        errors: validation.errors,
      });
      return;
    }
    const version = model.createFormVersionRecord({
      form,
      versionNumber: (form.latestVersionNumber || 0) + 1,
      fields: snapshot.fields,
      sections: snapshot.sections,
      createdByEmail: normalizeEmail(context.adminEmail || ""),
      preview: true,
    });
    store.formsCenter.versions[version.id] = version;
    form.status = model.FORM_STATUSES.PUBLISHED;
    form.previousStatus = "";
    form.latestVersionNumber = version.versionNumber;
    form.publishedVersionId = version.id;
    form.publishedAt = version.createdAt;
    form.hasUnpublishedChanges = false;
    form.updatedAt = version.createdAt;
    form.updatedByEmail = normalizeEmail(context.adminEmail || "");
    store.formsCenter.forms[form.id] = form;
    addAudit(store, form, "publish", context.adminEmail, `Published immutable version ${version.versionNumber}.`, version.id);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      form,
      version,
      immutable: true,
    });
  }

  async function handleEditPublished(request, response, context = {}, formId) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    const version = publishedVersion(store, form);
    if (!version) {
      jsonResponse(response, 409, { error: "Publish this form before starting a new version.", code: "published_version_required" });
      return;
    }
    const cloned = model.cloneSnapshotForForm(version, {
      formId: form.id,
      organizationId: form.organizationId,
      preview: form.preview === true,
      keepFieldIds: false,
    });
    listValues(store.formsCenter.fields).forEach((field) => {
      if (field.formId === form.id && field.organizationId === form.organizationId) delete store.formsCenter.fields[field.id];
    });
    cloned.fields.forEach((field) => { store.formsCenter.fields[field.id] = field; });
    form.currentDraft = { sections: cloned.sections, fieldIds: cloned.fieldIds };
    form.draftVersionNumber = (form.latestVersionNumber || version.versionNumber || 1) + 1;
    form.hasUnpublishedChanges = true;
    form.updatedAt = model.nowIso();
    form.updatedByEmail = normalizeEmail(context.adminEmail || "");
    store.formsCenter.forms[form.id] = form;
    addAudit(store, form, "edit_published", context.adminEmail, `Started draft version ${form.draftVersionNumber} from published version ${version.versionNumber}.`, version.id);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      form,
      sourceVersion: version,
      snapshot: {
        source: "draft",
        sections: cloned.sections,
        fields: cloned.fields,
      },
    });
  }

  async function handleDuplicate(request, response, context = {}, formId) {
    const body = await readJson(request).catch(() => ({}));
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    if (rejectOrgMismatch(response, organization, body)) return;
    const source = findFormOr404(response, store, organization.id, formId);
    if (!source) return;
    const sourceSnapshot = activeSnapshot(store, source, { preferPublished: true });
    const form = model.createFormRecord({
      organizationId: organization.id,
      title: body.title || `${source.title} Copy`,
      description: body.description !== undefined ? body.description : source.description,
      category: body.category || source.category,
      sourceFormId: source.id,
      createdByEmail: normalizeEmail(context.adminEmail || ""),
      preview: true,
    });
    const cloned = model.cloneSnapshotForForm(sourceSnapshot, {
      formId: form.id,
      organizationId: organization.id,
      preview: true,
    });
    cloned.fields.forEach((field) => { store.formsCenter.fields[field.id] = field; });
    form.currentDraft = { sections: cloned.sections, fieldIds: cloned.fieldIds };
    store.formsCenter.forms[form.id] = form;
    addAudit(store, form, "duplicate", context.adminEmail, "Form duplicated with new permanent IDs.", "", { sourceFormId: source.id });
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      form,
      sourceFormId: source.id,
      newFieldIds: cloned.fieldIds,
      snapshot: {
        source: "draft",
        sections: cloned.sections,
        fields: cloned.fields,
      },
    });
  }

  async function handleArchive(request, response, context = {}, formId) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    form.previousStatus = form.status === model.FORM_STATUSES.ARCHIVED
      ? (form.previousStatus || model.FORM_STATUSES.DRAFT)
      : form.status;
    form.status = model.FORM_STATUSES.ARCHIVED;
    form.archivedAt = model.nowIso();
    form.updatedAt = form.archivedAt;
    form.updatedByEmail = normalizeEmail(context.adminEmail || "");
    store.formsCenter.forms[form.id] = form;
    addAudit(store, form, "archive", context.adminEmail, "Form archived. Versions and fields preserved.");
    writeStore(store);
    jsonResponse(response, 200, { ok: true, form, preserved: true });
  }

  async function handleRestore(request, response, context = {}, formId) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    form.status = [model.FORM_STATUSES.DRAFT, model.FORM_STATUSES.PUBLISHED].includes(form.previousStatus)
      ? form.previousStatus
      : (form.publishedVersionId ? model.FORM_STATUSES.PUBLISHED : model.FORM_STATUSES.DRAFT);
    form.previousStatus = "";
    form.archivedAt = "";
    form.updatedAt = model.nowIso();
    form.updatedByEmail = normalizeEmail(context.adminEmail || "");
    store.formsCenter.forms[form.id] = form;
    addAudit(store, form, "restore", context.adminEmail, "Form restored from archive.");
    writeStore(store);
    jsonResponse(response, 200, { ok: true, form });
  }

  async function handleVersions(request, response, context = {}, formId) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    writeStore(store);
    if (rejectEntitlement(response, entitlement)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    jsonResponse(response, 200, {
      ok: true,
      formId: form.id,
      versions: formVersions(store, form.id),
    });
  }

  async function handlePreview(request, response, context = {}, formId, url) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    writeStore(store);
    if (rejectEntitlement(response, entitlement)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    const snapshot = activeSnapshot(store, form, {
      preferPublished: url.searchParams.get("published") === "1",
      versionId: url.searchParams.get("versionId") || "",
    });
    jsonResponse(response, 200, {
      ok: true,
      previewOnly: true,
      responseCollection: false,
      message: "Preview only — responses are not being collected.",
      testingOnlySignaturePlaceholders: true,
      form: summarizeForm(store, form),
      snapshot,
    });
  }

  async function handlePatchFields(request, response, context = {}, formId) {
    const body = await readJson(request);
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    if (rejectEntitlement(response, entitlement)) return;
    if (rejectOrgMismatch(response, organization, body)) return;
    const form = findFormOr404(response, store, organization.id, formId);
    if (!form) return;
    if (form.status === model.FORM_STATUSES.ARCHIVED) {
      jsonResponse(response, 409, { error: "Restore this form before editing fields.", code: "form_archived" });
      return;
    }
    if (Array.isArray(body.fields) || Array.isArray(body.sections)) {
      const saved = saveDraftSnapshot(store, form, body, normalizeEmail(context.adminEmail || ""), {
        auditAction: "fields_snapshot",
        auditMessage: "Field snapshot saved.",
      });
      writeStore(store);
      jsonResponse(response, 200, { ok: true, form: saved.form, snapshot: { source: "draft", sections: saved.sections, fields: saved.fields } });
      return;
    }
    const current = model.snapshotFromForm(store, form);
    let fields = current.fields.map((field) => ({ ...field }));
    let sections = current.sections;
    const operations = Array.isArray(body.operations) ? body.operations : [];
    operations.forEach((operation) => {
      const op = safeLower(operation.op || operation.type || "");
      const id = model.cleanText(operation.id || operation.fieldId, 160);
      if (op === "add") {
        fields.push({
          ...(operation.field || {}),
          id: "",
          sectionId: operation.field?.sectionId || sections[0]?.id || "",
        });
      } else if (op === "update") {
        fields = fields.map((field) => field.id === id ? { ...field, ...(operation.patch || {}) } : field);
      } else if (op === "delete") {
        fields = fields.filter((field) => field.id !== id);
      } else if (op === "duplicate") {
        const source = fields.find((field) => field.id === id);
        if (source) fields.push({ ...source, id: "", label: `${source.label || "Field"} Copy` });
      } else if (op === "move_up" || op === "move_down") {
        const index = fields.findIndex((field) => field.id === id);
        const target = op === "move_up" ? index - 1 : index + 1;
        if (index >= 0 && target >= 0 && target < fields.length) {
          const [field] = fields.splice(index, 1);
          fields.splice(target, 0, field);
        }
      } else if (op === "reorder" && Array.isArray(operation.fieldIds)) {
        const order = new Map(operation.fieldIds.map((fieldId, index) => [fieldId, index]));
        fields.sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
      } else if (op === "sections" && Array.isArray(operation.sections)) {
        sections = model.normalizeSections(operation.sections);
      }
    });
    const saved = saveDraftSnapshot(store, form, { sections, fields }, normalizeEmail(context.adminEmail || ""), {
      auditAction: "fields_patch",
      auditMessage: "Field operations applied.",
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      form: saved.form,
      snapshot: { source: "draft", sections: saved.sections, fields: saved.fields },
    });
  }

  async function handleFieldTypes(request, response) {
    jsonResponse(response, 200, {
      ok: true,
      preview: true,
      responseCollection: false,
      categories: model.categoryCatalog(),
      fieldTypes: model.FIELD_TYPE_CATALOG,
      groups: model.FIELD_TYPE_GROUPS,
      environment: typeof expansionEnvironment === "function" ? expansionEnvironment() : null,
    });
  }

  async function handleAudit(request, response, context = {}, url) {
    const { store, organization, entitlement } = contextForAdmin(context.adminEmail);
    writeStore(store);
    if (rejectEntitlement(response, entitlement)) return;
    const formId = model.cleanText(url.searchParams.get("formId") || "", 160);
    const rows = listValues(store.formsCenter.audit)
      .filter((row) => row.organizationId === organization.id)
      .filter((row) => !formId || row.formId === formId)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 200);
    jsonResponse(response, 200, { ok: true, audit: rows });
  }

  async function handleNoResponses(request, response) {
    jsonResponse(response, 404, {
      error: "Forms Center private preview does not collect responses.",
      code: "responses_not_implemented",
      responseCollection: false,
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (path.includes("/responses") || path.endsWith("/submit") || path.includes("/submissions")) {
      return (req, res) => handleNoResponses(req, res);
    }
    if (method === "POST" && path === "/api/forms-center/seed") return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/home") return (req, res, ctx) => handleHome(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/forms") return (req, res, ctx) => handleListForms(req, res, ctx, url);
    if (method === "POST" && path === "/api/forms-center/forms") return (req, res, ctx) => handleCreateForm(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/field-types") return (req, res, ctx) => handleFieldTypes(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/audit") return (req, res, ctx) => handleAudit(req, res, ctx, url);
    if (method === "GET" && /^\/api\/forms-center\/forms\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split("/forms/")[1]);
      return (req, res, ctx) => handleGetForm(req, res, ctx, id);
    }
    if (method === "PATCH" && /^\/api\/forms-center\/forms\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split("/forms/")[1]);
      return (req, res, ctx) => handlePatchForm(req, res, ctx, id);
    }
    const actionMatch = path.match(/^\/api\/forms-center\/forms\/([^/]+)\/([^/]+)$/);
    if (actionMatch) {
      const id = decodeURIComponent(actionMatch[1]);
      const action = actionMatch[2];
      if (method === "POST" && action === "save-draft") return (req, res, ctx) => handleSaveDraft(req, res, ctx, id);
      if (method === "POST" && action === "publish") return (req, res, ctx) => handlePublish(req, res, ctx, id);
      if (method === "POST" && action === "edit-published") return (req, res, ctx) => handleEditPublished(req, res, ctx, id);
      if (method === "POST" && action === "duplicate") return (req, res, ctx) => handleDuplicate(req, res, ctx, id);
      if (method === "POST" && action === "archive") return (req, res, ctx) => handleArchive(req, res, ctx, id);
      if (method === "POST" && action === "restore") return (req, res, ctx) => handleRestore(req, res, ctx, id);
      if (method === "GET" && action === "versions") return (req, res, ctx) => handleVersions(req, res, ctx, id);
      if (method === "GET" && action === "preview") return (req, res, ctx) => handlePreview(req, res, ctx, id, url);
      if (method === "PATCH" && action === "fields") return (req, res, ctx) => handlePatchFields(req, res, ctx, id);
    }
    return null;
  }

  return {
    matchRoute,
  };
}

module.exports = {
  createFormsCenterApi,
};
