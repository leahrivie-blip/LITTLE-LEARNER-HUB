/**
 * Phase 5 Built-In Form Library API — private admin preview, mounted under
 * /api/forms-center/library/*. Reuses the existing Forms Center private-preview
 * gate (formsCenter flag + ALLOW_FORMS_CENTER_ADMIN_PREVIEW + verified admin)
 * enforced by server/index.js before any handler here runs.
 *
 * System templates are read-only to every role. "Use This Template" always
 * creates a brand-new organization-owned draft form; it never edits the
 * built-in master. Structured import / retire / restore are system-admin only
 * and are rejected whenever a role-preview header is present, so a simulated
 * director/teacher/assistant can never manage global templates.
 */

const foundation = require("../scripts/foundation-data-model.js");
const entitlements = require("../scripts/entitlement-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const model = require("../scripts/built-in-form-library-data-model.js");
const importer = require("../scripts/built-in-form-library-importer.js");
const fixtures = require("../scripts/built-in-form-library-fixtures.js");
const formsFixtures = require("../scripts/forms-center-preview-fixtures.js");
const { createOrganizationCopyFromTemplate } = require("../scripts/built-in-form-library-copy.js");

const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const COPY_REQUEST_TTL_MS = 60 * 1000;

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function getHeader(request, name) {
  const key = String(name || "").toLowerCase();
  const headers = request && request.headers ? request.headers : {};
  if (headers && typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(key) || "").trim();
  }
  if (headers && Object.prototype.hasOwnProperty.call(headers, key)) {
    return String(headers[key] || "").trim();
  }
  const found = Object.keys(headers || {}).find((headerName) => headerName.toLowerCase() === key);
  return found ? String(headers[found] || "").trim() : "";
}

function productionSiteFromUrl(siteUrl) {
  const value = String(siteUrl || "").toLowerCase();
  return Boolean(value) && value.indexOf(PRODUCTION_HOST) !== -1;
}

function fallbackExpansionEnvironment() {
  const siteUrl = String(process.env.SITE_URL || "");
  const liveProduction = productionSiteFromUrl(siteUrl);
  return {
    liveProduction,
    allowFormsCenterAdminPreview: !liveProduction && truthy(process.env.ALLOW_FORMS_CENTER_ADMIN_PREVIEW),
    siteUrl,
  };
}

function previewHeaderAllowed(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") env = fallbackExpansionEnvironment();
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const production = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    allowed: env.allowFormsCenterAdminPreview === true && !production,
    environment: { liveProduction: production, allowFormsCenterAdminPreview: env.allowFormsCenterAdminPreview === true, siteUrl },
  };
}

function findOwnerMembership(store, organizationId, adminEmail) {
  const email = safeLower(adminEmail);
  return listValues(store.staffMemberships).find((member) => (
    member
    && member.organizationId === organizationId
    && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
    && (!email || safeLower(member.userEmail) === email)
    && member.status === foundation.STAFF_STATUS.ACTIVE
  )) || listValues(store.staffMemberships).find((member) => (
    member && member.organizationId === organizationId && member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER
  )) || null;
}

function actorFromMembership(member) {
  if (!member) return { userId: "", email: "", role: "", membershipId: "" };
  return {
    userId: member.userId || "",
    email: member.userEmail || "",
    role: member.role || "",
    membershipId: member.id || "",
    displayName: member.displayName || "",
  };
}

function resolveActor(store, request, organizationId, adminEmail, expansionEnvironment) {
  const owner = findOwnerMembership(store, organizationId, adminEmail);
  const ownerActor = actorFromMembership(owner);
  const policy = previewHeaderAllowed(expansionEnvironment);
  const requested = getHeader(request, "x-llh-role-preview-membership-id");
  const meta = {
    enabled: policy.allowed,
    requestedMembershipId: requested,
    active: false,
    reason: requested ? "not_applied" : "not_requested",
    membershipId: "",
  };
  if (!requested) return { actor: ownerActor, membership: owner, rolePreview: meta, isRawAdmin: true };
  if (!policy.allowed) {
    meta.reason = "preview_header_disabled";
    return { actor: ownerActor, membership: owner, rolePreview: meta, isRawAdmin: true };
  }
  const member = store.staffMemberships && store.staffMemberships[requested] ? store.staffMemberships[requested] : null;
  if (!member || member.organizationId !== organizationId) {
    meta.reason = "membership_not_found";
    return { actor: ownerActor, membership: owner, rolePreview: meta, isRawAdmin: true };
  }
  meta.active = true;
  meta.reason = "ok";
  meta.membershipId = member.id;
  meta.role = member.role;
  meta.displayName = member.displayName || "";
  return { actor: actorFromMembership(member), membership: member, rolePreview: meta, isRawAdmin: false };
}

/**
 * Director/Owner always have full library access. Lead Teacher and Assistant need
 * an explicit director-granted override recorded in staffLibraryPermissions.
 * Parents are not part of this admin-preview surface in Phase 5.
 */
function resolveLibraryPermission(store, organizationId, actor, membership) {
  const role = orgPermissions.normalizeOrgRole(actor.role);
  if (role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || role === orgPermissions.ORG_ROLES.DIRECTOR) {
    return { canBrowse: true, canCreateDraftCopy: true, role, reason: "director_or_owner" };
  }
  const overrides = store.builtInFormLibrary?.staffLibraryPermissions || {};
  const override = membership ? overrides[membership.id] : null;
  if (role === orgPermissions.ORG_ROLES.LEAD_TEACHER) {
    return {
      canBrowse: override?.canBrowse === true,
      canCreateDraftCopy: override?.canBrowse === true && override?.canCreateDraftCopy === true,
      role,
      reason: override?.canBrowse ? "teacher_override_granted" : "teacher_requires_director_permission",
    };
  }
  if (role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF) {
    return {
      canBrowse: override?.canBrowse === true,
      canCreateDraftCopy: false,
      role,
      reason: override?.canBrowse ? "assistant_view_only_granted" : "assistant_requires_director_permission",
    };
  }
  return { canBrowse: false, canCreateDraftCopy: false, role, reason: "role_not_permitted" };
}

function resolveEntitlement(store, organizationId) {
  return listValues(store.organizationEntitlements).find((row) => row.organizationId === organizationId) || null;
}

function entitlementAllowsLibrary(entitlement) {
  if (!entitlement) return true;
  if (Array.isArray(entitlement.featureEntitlements)) {
    return entitlement.featureEntitlements.includes(entitlements.FEATURE_ENTITLEMENTS.FORMS_CENTER);
  }
  return entitlements.resolvePlanFeatures(entitlement.basePlanKey).includes(entitlements.FEATURE_ENTITLEMENTS.FORMS_CENTER);
}

function templateSummary(store, template, { actor, organizationId } = {}) {
  const version = template.currentVersionId ? store.builtInFormLibrary.versions[template.currentVersionId] : null;
  const favoriteKey = actor ? `${organizationId}:${safeLower(actor.email)}:${template.id}` : "";
  return {
    id: template.id,
    templateKey: template.templateKey,
    title: template.title,
    shortDescription: template.shortDescription,
    category: template.category,
    intendedUsers: template.intendedUsers,
    ageGroups: template.ageGroups,
    tags: template.tags,
    status: template.status,
    estimatedMinutes: template.estimatedMinutes,
    sectionCount: model.sectionCount(version),
    fieldCount: version ? version.fields.length : 0,
    hasAcknowledgment: version ? model.hasAcknowledgment(version.fields) : false,
    hasSignaturePlaceholder: version ? model.hasSignaturePlaceholder(version.fields) : false,
    currentVersionNumber: template.currentVersionNumber,
    featured: template.featured === true,
    previewCount: template.previewCount || 0,
    copyCount: template.copyCount || 0,
    favoriteCount: template.favoriteCount || 0,
    favorited: favoriteKey ? Boolean(store.builtInFormLibrary.favorites[favoriteKey]) : false,
    replacedByTemplateId: template.replacedByTemplateId || "",
    stateMetadata: template.stateMetadata,
    reviewReminder: template.reviewReminder,
    additionalReviewReminder: template.additionalReviewReminder,
    builtIn: true,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    publishedAt: template.publishedAt,
    retiredAt: template.retiredAt || "",
  };
}

function activeTemplates(store) {
  return listValues(store.builtInFormLibrary.templates).filter((template) => template.status === model.TEMPLATE_STATUSES.ACTIVE);
}

function sortTemplates(list, sort) {
  const key = String(sort || model.SORT_OPTIONS.RECOMMENDED);
  const copy = [...list];
  if (key === model.SORT_OPTIONS.ALPHABETICAL) return copy.sort((a, b) => a.title.localeCompare(b.title));
  if (key === model.SORT_OPTIONS.RECENTLY_ADDED) return copy.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (key === model.SORT_OPTIONS.MOST_USED) return copy.sort((a, b) => (b.copyCount || 0) - (a.copyCount || 0));
  if (key === model.SORT_OPTIONS.COMPLETION_TIME) return copy.sort((a, b) => (a.estimatedMinutes || 0) - (b.estimatedMinutes || 0));
  return copy.sort((a, b) => (b.sortWeight || 0) - (a.sortWeight || 0) || (b.featured === true) - (a.featured === true));
}

function createBuiltInFormLibraryApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function prepare(request, context, { seedOrgScenario = false } = {}) {
    const store = readStore();
    foundation.ensureFoundationStore(store);
    model.ensureBuiltInFormLibraryStore(store);
    fixtures.ensureCatalogSeeded(store);
    const adminEmail = context?.adminEmail || "";
    const organization = formsFixtures.ensurePreviewOrganization(store, { adminEmail });
    if (seedOrgScenario) fixtures.seedLibraryPreview(store, { adminEmail, organizationId: organization.id });
    const entitlement = resolveEntitlement(store, organization.id);
    const resolved = resolveActor(store, request, organization.id, adminEmail, expansionEnvironment);
    const permission = resolveLibraryPermission(store, organization.id, resolved.actor, resolved.membership);
    return { store, organization, entitlement, ...resolved, permission };
  }

  function rejectEntitlement(response, entitlement) {
    if (entitlementAllowsLibrary(entitlement)) return false;
    jsonResponse(response, 403, {
      error: "The built-in form library is not included with this preview plan. Upgrade from Curriculum Only to use Forms Center and the built-in library.",
      code: "forms_library_entitlement_required",
      plan: entitlement?.basePlanKey || "",
    });
    return true;
  }

  function rejectBrowseDenied(response, permission) {
    if (permission.canBrowse) return false;
    jsonResponse(response, 403, {
      error: "This role does not have permission to browse the built-in form library. Ask a director to grant access.",
      code: "form_library_role_denied",
      reason: permission.reason,
    });
    return true;
  }

  function rejectCopyDenied(response, permission) {
    if (permission.canCreateDraftCopy) return false;
    jsonResponse(response, 403, {
      error: "This role does not have permission to create a program copy of a built-in template. Ask a director to grant access.",
      code: "form_library_copy_role_denied",
      reason: permission.reason,
    });
    return true;
  }

  /**
   * System-template administration (import / retire / restore) is available only to
   * the raw verified admin — never while a director/teacher/assistant role preview
   * is active, even though that preview also carries a valid admin bearer token.
   */
  function rejectNonSystemAdmin(response, ctx) {
    if (ctx.isRawAdmin) return false;
    jsonResponse(response, 403, {
      error: "Built-in template administration is available only to a verified system admin, not a previewed director, teacher, or assistant role.",
      code: "system_admin_required",
    });
    return true;
  }

  function findTemplateOr404(response, store, templateId) {
    const template = store.builtInFormLibrary.templates[templateId];
    if (!template) {
      jsonResponse(response, 404, { error: "Built-in template was not found.", code: "template_not_found" });
      return null;
    }
    return template;
  }

  function homePayload(ctx) {
    const { store, organization, actor, permission } = ctx;
    const active = activeTemplates(store);
    const featured = sortTemplates(active.filter((t) => t.featured), model.SORT_OPTIONS.RECOMMENDED).slice(0, 6);
    const mostUsed = sortTemplates(active, model.SORT_OPTIONS.MOST_USED).slice(0, 6);
    const recentlyAdded = sortTemplates(active, model.SORT_OPTIONS.RECENTLY_ADDED).slice(0, 6);
    const byCategory = {};
    active.forEach((template) => {
      byCategory[template.category] = (byCategory[template.category] || 0) + 1;
    });
    const favorites = listValues(store.builtInFormLibrary.favorites)
      .filter((row) => row.organizationId === organization.id && row.actorEmail === safeLower(actor.email))
      .map((row) => store.builtInFormLibrary.templates[row.templateId])
      .filter(Boolean);
    const recentPreviews = listValues(store.builtInFormLibrary.recentPreviews)
      .filter((row) => row.organizationId === organization.id && row.actorEmail === safeLower(actor.email))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 8);
    const recentCopies = listValues(store.builtInFormLibrary.recentCopies)
      .filter((row) => row.organizationId === organization.id && row.actorEmail === safeLower(actor.email))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 8);
    return {
      ok: true,
      phase: 5,
      preview: true,
      adminOnly: true,
      label: formsFixtures.PREVIEW_MARKER,
      fakeDataOnly: true,
      emailSent: false,
      stripeTouched: false,
      aiTouched: false,
      responseCollection: false,
      organizationId: organization.id,
      permission,
      counts: { total: active.length, retired: listValues(store.builtInFormLibrary.templates).length - active.length, byCategory },
      featured: featured.map((t) => templateSummary(store, t, { actor, organizationId: organization.id })),
      mostUsed: mostUsed.map((t) => templateSummary(store, t, { actor, organizationId: organization.id })),
      recentlyAdded: recentlyAdded.map((t) => templateSummary(store, t, { actor, organizationId: organization.id })),
      favorites: favorites.map((t) => templateSummary(store, t, { actor, organizationId: organization.id })),
      recentPreviews,
      recentCopies,
      categories: model.BUILT_IN_CATEGORY_CATALOG,
    };
  }

  async function handleHome(request, response, context = {}) {
    const ctx = prepare(request, context, { seedOrgScenario: true });
    writeStore(ctx.store);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (rejectBrowseDenied(response, ctx.permission)) return;
    jsonResponse(response, 200, homePayload(ctx));
  }

  async function handleCatalog(request, response) {
    jsonResponse(response, 200, {
      ok: true,
      categories: model.BUILT_IN_CATEGORY_CATALOG,
      ageGroups: model.AGE_GROUP_CATALOG,
      intendedUsers: model.INTENDED_USER_CATALOG,
      sortOptions: Object.values(model.SORT_OPTIONS),
      fieldTypes: require("../scripts/forms-center-data-model.js").FIELD_TYPE_CATALOG,
    });
  }

  async function handleListTemplates(request, response, context = {}, url) {
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (rejectBrowseDenied(response, ctx.permission)) return;
    const q = safeLower(url.searchParams.get("q") || "");
    const category = url.searchParams.get("category") || "";
    const ageGroup = url.searchParams.get("ageGroup") || "";
    const intendedUser = url.searchParams.get("intendedUser") || "";
    const hasAcknowledgment = url.searchParams.get("hasAcknowledgment") === "1";
    const hasSignature = url.searchParams.get("hasSignature") === "1";
    const favoritesOnly = url.searchParams.get("favoritesOnly") === "1";
    const status = safeLower(url.searchParams.get("status") || "active");
    const sort = url.searchParams.get("sort") || model.SORT_OPTIONS.RECOMMENDED;

    let list = status === "retired"
      ? listValues(ctx.store.builtInFormLibrary.templates).filter((t) => t.status === model.TEMPLATE_STATUSES.RETIRED)
      : activeTemplates(ctx.store);

    if (category) list = list.filter((t) => t.category === category);
    if (ageGroup) list = list.filter((t) => t.ageGroups.includes(ageGroup));
    if (intendedUser) list = list.filter((t) => t.intendedUsers.includes(intendedUser));
    if (hasAcknowledgment) list = list.filter((t) => model.hasAcknowledgment(ctx.store.builtInFormLibrary.versions[t.currentVersionId]?.fields));
    if (hasSignature) list = list.filter((t) => model.hasSignaturePlaceholder(ctx.store.builtInFormLibrary.versions[t.currentVersionId]?.fields));
    if (favoritesOnly) {
      const favoriteIds = new Set(
        listValues(ctx.store.builtInFormLibrary.favorites)
          .filter((row) => row.organizationId === ctx.organization.id && row.actorEmail === safeLower(ctx.actor.email))
          .map((row) => row.templateId),
      );
      list = list.filter((t) => favoriteIds.has(t.id));
    }
    if (q) {
      list = list.filter((t) => [t.title, t.shortDescription, t.category, ...(t.tags || []), ...(t.intendedUsers || [])]
        .some((value) => safeLower(value).includes(q)));
    }
    list = sortTemplates(list, sort);
    jsonResponse(response, 200, {
      ok: true,
      total: list.length,
      templates: list.map((t) => templateSummary(ctx.store, t, { actor: ctx.actor, organizationId: ctx.organization.id })),
    });
  }

  async function handleGetTemplate(request, response, context = {}, templateId) {
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (rejectBrowseDenied(response, ctx.permission)) return;
    const template = findTemplateOr404(response, ctx.store, templateId);
    if (!template) return;
    const version = template.currentVersionId ? ctx.store.builtInFormLibrary.versions[template.currentVersionId] : null;
    const replacedBy = template.replacedByTemplateId ? ctx.store.builtInFormLibrary.templates[template.replacedByTemplateId] : null;
    jsonResponse(response, 200, {
      ok: true,
      template: templateSummary(ctx.store, template, { actor: ctx.actor, organizationId: ctx.organization.id }),
      version,
      replacedBy: replacedBy ? { id: replacedBy.id, title: replacedBy.title } : null,
      olderVersions: (template.versionIds || [])
        .map((id) => ctx.store.builtInFormLibrary.versions[id])
        .filter((v) => v && v.id !== template.currentVersionId)
        .map((v) => ({ id: v.id, versionNumber: v.versionNumber, status: v.status, publishedAt: v.publishedAt, changeSummary: v.changeSummary })),
    });
  }

  async function handlePreview(request, response, context = {}, templateId) {
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (rejectBrowseDenied(response, ctx.permission)) return;
    const template = findTemplateOr404(response, ctx.store, templateId);
    if (!template) return;
    const version = template.currentVersionId ? ctx.store.builtInFormLibrary.versions[template.currentVersionId] : null;
    fixtures.recordPreview(ctx.store, ctx.organization.id, ctx.actor.email, template);
    writeStore(ctx.store);
    jsonResponse(response, 200, {
      ok: true,
      previewOnly: true,
      responseCollection: false,
      message: "Preview of the Little Learner Hub template. Create a program copy to customize it.",
      testingOnlySignaturePlaceholders: true,
      template: templateSummary(ctx.store, template, { actor: ctx.actor, organizationId: ctx.organization.id }),
      version,
    });
  }

  async function handleFavorite(request, response, context = {}, templateId) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (rejectBrowseDenied(response, ctx.permission)) return;
    const template = findTemplateOr404(response, ctx.store, templateId);
    if (!template) return;
    fixtures.toggleFavoriteInternal(ctx.store, ctx.organization.id, ctx.actor.email, template, body.favorited !== false);
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, favorited: body.favorited !== false, template: templateSummary(ctx.store, template, { actor: ctx.actor, organizationId: ctx.organization.id }) });
  }

  async function handleFavoritesList(request, response, context = {}) {
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (rejectBrowseDenied(response, ctx.permission)) return;
    const favorites = listValues(ctx.store.builtInFormLibrary.favorites)
      .filter((row) => row.organizationId === ctx.organization.id && row.actorEmail === safeLower(ctx.actor.email))
      .map((row) => ctx.store.builtInFormLibrary.templates[row.templateId])
      .filter(Boolean)
      .map((t) => templateSummary(ctx.store, t, { actor: ctx.actor, organizationId: ctx.organization.id }));
    jsonResponse(response, 200, { ok: true, favorites });
  }

  async function handleRecent(request, response, context = {}) {
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (rejectBrowseDenied(response, ctx.permission)) return;
    const recentPreviews = listValues(ctx.store.builtInFormLibrary.recentPreviews)
      .filter((row) => row.organizationId === ctx.organization.id && row.actorEmail === safeLower(ctx.actor.email))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 20);
    const recentCopies = listValues(ctx.store.builtInFormLibrary.recentCopies)
      .filter((row) => row.organizationId === ctx.organization.id && row.actorEmail === safeLower(ctx.actor.email))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 20);
    jsonResponse(response, 200, { ok: true, recentPreviews, recentCopies });
  }

  /**
   * "Use This Template" — always creates a brand-new organization-owned draft form
   * with fresh permanent IDs. The built-in original is never modified. Duplicate
   * clicks/slow retries with the same requestId return the original result instead
   * of creating a second copy.
   */
  async function handleUseTemplate(request, response, context = {}, templateId) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectEntitlement(response, ctx.entitlement)) return;
    if (rejectCopyDenied(response, ctx.permission)) return;
    const template = findTemplateOr404(response, ctx.store, templateId);
    if (!template) return;
    if (template.status === model.TEMPLATE_STATUSES.RETIRED) {
      jsonResponse(response, 409, {
        error: "This built-in template has been retired and can no longer be used to create a new copy.",
        code: "template_retired",
        replacedByTemplateId: template.replacedByTemplateId || "",
      });
      return;
    }
    if (body.confirm !== true) {
      jsonResponse(response, 400, { error: "Confirm you want to create an editable program copy before continuing.", code: "confirmation_required" });
      return;
    }
    const requestId = String(body.requestId || "").trim().slice(0, 160);
    const lib = ctx.store.builtInFormLibrary;
    if (requestId) {
      const existing = lib.copyRequests[requestId];
      if (existing && (Date.now() - new Date(existing.createdAt).getTime()) < COPY_REQUEST_TTL_MS) {
        const existingForm = ctx.store.formsCenter.forms[existing.formId];
        if (existingForm) {
          jsonResponse(response, 200, {
            ok: true,
            deduped: true,
            message: "Your editable program copy is ready.",
            form: existingForm,
            template: templateSummary(ctx.store, template, { actor: ctx.actor, organizationId: ctx.organization.id }),
          });
          return;
        }
      }
    }
    const version = template.currentVersionId ? ctx.store.builtInFormLibrary.versions[template.currentVersionId] : null;
    if (!version) {
      jsonResponse(response, 409, { error: "This template does not have a published version yet.", code: "template_version_missing" });
      return;
    }
    const created = createOrganizationCopyFromTemplate(ctx.store, {
      template,
      version,
      organizationId: ctx.organization.id,
      actorEmail: ctx.actor.email || context.adminEmail,
      actorMembershipId: ctx.membership?.id || "",
    });
    if (requestId) {
      lib.copyRequests[requestId] = { formId: created.form.id, createdAt: model.nowIso() };
    }
    writeStore(ctx.store);
    jsonResponse(response, 201, {
      ok: true,
      message: "Your editable program copy is ready.",
      form: created.form,
      snapshot: { source: "draft", sections: created.sections, fields: created.fields },
      template: templateSummary(ctx.store, template, { actor: ctx.actor, organizationId: ctx.organization.id }),
      sourceUnchanged: true,
    });
  }

  async function handleRolePreviewOptions(request, response, context = {}) {
    const ctx = prepare(request, context, { seedOrgScenario: true });
    writeStore(ctx.store);
    const options = listValues(ctx.store.staffMemberships)
      .filter((member) => member && member.organizationId === ctx.organization.id)
      .map((member) => ({
        membershipId: member.id,
        displayName: member.displayName,
        email: member.userEmail,
        role: member.role,
        status: member.status,
      }));
    jsonResponse(response, 200, {
      ok: true,
      enabled: previewHeaderAllowed(expansionEnvironment).allowed,
      header: "x-llh-role-preview-membership-id",
      memberships: options,
    });
  }

  // ── System-admin only: structured import / retire / restore ────────────

  async function handleAdminListTemplates(request, response, context = {}) {
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectNonSystemAdmin(response, ctx)) return;
    const templates = listValues(ctx.store.builtInFormLibrary.templates)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map((t) => templateSummary(ctx.store, t, { actor: ctx.actor, organizationId: ctx.organization.id }));
    jsonResponse(response, 200, { ok: true, templates });
  }

  async function handleAdminImport(request, response, context = {}) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = prepare(request, context);
    if (rejectNonSystemAdmin(response, ctx)) return;
    const templatesPayload = Array.isArray(body.templates) ? body.templates : [];
    if (body.dryRun === true) {
      const validation = importer.validateImportBatch(templatesPayload);
      if (!validation.ok) {
        jsonResponse(response, 400, { ok: false, error: validation.errors[0] || "Import failed validation.", errors: validation.errors });
        return;
      }
      const preview = importer.applyImportBatch(ctx.store, templatesPayload, { actorEmail: context.adminEmail, dryRun: true });
      jsonResponse(response, 200, preview);
      return;
    }
    let result;
    try {
      result = importer.applyImportBatch(ctx.store, templatesPayload, { actorEmail: normalizeEmail(context.adminEmail || "") });
    } catch (error) {
      jsonResponse(response, 400, {
        ok: false,
        error: "Import failed structural validation.",
        code: error.code || "template_validation_failed",
        errors: error.errors || [String(error.message || "Unknown error")],
      });
      return;
    }
    if (!result.ok) {
      jsonResponse(response, 400, { ok: false, error: result.errors[0] || "Import failed.", errors: result.errors });
      return;
    }
    writeStore(ctx.store);
    jsonResponse(response, 200, {
      ok: true,
      applied: result.applied.map((row) => ({ action: row.action, templateId: row.template.id, templateKey: row.template.templateKey, versionId: row.version.id, versionNumber: row.version.versionNumber })),
    });
  }

  async function handleAdminImportAudit(request, response, context = {}) {
    const ctx = prepare(request, context);
    writeStore(ctx.store);
    if (rejectNonSystemAdmin(response, ctx)) return;
    const audit = listValues(ctx.store.builtInFormLibrary.importAudit)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 200);
    jsonResponse(response, 200, { ok: true, audit });
  }

  async function handleAdminRetire(request, response, context = {}, templateId) {
    const body = await readJson(request).catch(() => ({}));
    const ctx = prepare(request, context);
    if (rejectNonSystemAdmin(response, ctx)) return;
    const template = findTemplateOr404(response, ctx.store, templateId);
    if (!template) return;
    const replacedByTemplateId = String(body.replacedByTemplateId || "").trim();
    if (replacedByTemplateId && !ctx.store.builtInFormLibrary.templates[replacedByTemplateId]) {
      jsonResponse(response, 400, { error: "replacedByTemplateId does not reference a known template.", code: "invalid_source_template_reference" });
      return;
    }
    template.status = model.TEMPLATE_STATUSES.RETIRED;
    template.retiredAt = model.nowIso();
    template.replacedByTemplateId = replacedByTemplateId;
    ctx.store.builtInFormLibrary.templates[template.id] = template;
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, template: templateSummary(ctx.store, template, { actor: ctx.actor, organizationId: ctx.organization.id }) });
  }

  async function handleAdminRestore(request, response, context = {}, templateId) {
    const ctx = prepare(request, context);
    if (rejectNonSystemAdmin(response, ctx)) return;
    const template = findTemplateOr404(response, ctx.store, templateId);
    if (!template) return;
    template.status = model.TEMPLATE_STATUSES.ACTIVE;
    template.retiredAt = "";
    template.replacedByTemplateId = "";
    ctx.store.builtInFormLibrary.templates[template.id] = template;
    writeStore(ctx.store);
    jsonResponse(response, 200, { ok: true, template: templateSummary(ctx.store, template, { actor: ctx.actor, organizationId: ctx.organization.id }) });
  }

  async function handleNoResponses(request, response) {
    jsonResponse(response, 404, {
      error: "The built-in form library does not collect responses.",
      code: "responses_not_implemented",
      responseCollection: false,
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith("/api/forms-center/library")) return null;
    if (path.includes("/responses") || path.endsWith("/submit") || path.includes("/submissions")) {
      return (req, res) => handleNoResponses(req, res);
    }
    if (method === "GET" && path === "/api/forms-center/library/home") return (req, res, ctx) => handleHome(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/library/catalog") return (req, res, ctx) => handleCatalog(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/library/templates") return (req, res, ctx) => handleListTemplates(req, res, ctx, url);
    if (method === "GET" && path === "/api/forms-center/library/favorites") return (req, res, ctx) => handleFavoritesList(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/library/recent") return (req, res, ctx) => handleRecent(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/library/role-preview-options") return (req, res, ctx) => handleRolePreviewOptions(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/library/admin/templates") return (req, res, ctx) => handleAdminListTemplates(req, res, ctx);
    if (method === "POST" && path === "/api/forms-center/library/admin/import") return (req, res, ctx) => handleAdminImport(req, res, ctx);
    if (method === "GET" && path === "/api/forms-center/library/admin/import/audit") return (req, res, ctx) => handleAdminImportAudit(req, res, ctx);

    if (method === "GET" && /^\/api\/forms-center\/library\/templates\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split("/templates/")[1]);
      return (req, res, ctx) => handleGetTemplate(req, res, ctx, id);
    }
    const actionMatch = path.match(/^\/api\/forms-center\/library\/templates\/([^/]+)\/([^/]+)$/);
    if (actionMatch) {
      const id = decodeURIComponent(actionMatch[1]);
      const action = actionMatch[2];
      if (method === "GET" && action === "preview") return (req, res, ctx) => handlePreview(req, res, ctx, id);
      if (method === "POST" && action === "favorite") return (req, res, ctx) => handleFavorite(req, res, ctx, id);
      if (method === "POST" && action === "use") return (req, res, ctx) => handleUseTemplate(req, res, ctx, id);
    }
    const adminActionMatch = path.match(/^\/api\/forms-center\/library\/admin\/templates\/([^/]+)\/([^/]+)$/);
    if (adminActionMatch) {
      const id = decodeURIComponent(adminActionMatch[1]);
      const action = adminActionMatch[2];
      if (method === "POST" && action === "retire") return (req, res, ctx) => handleAdminRetire(req, res, ctx, id);
      if (method === "POST" && action === "restore") return (req, res, ctx) => handleAdminRestore(req, res, ctx, id);
    }
    return null;
  }

  return { matchRoute };
}

module.exports = {
  createBuiltInFormLibraryApi,
};
