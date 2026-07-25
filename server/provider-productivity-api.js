/**
 * Phase 21 Provider Productivity API — /api/director-center/productivity/*
 * Fake/testing only. No OpenAI, email/SMS/push, Stripe, uploads, or production writes.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const model = require("../scripts/provider-productivity-data-model.js");
const fixtures = require("../scripts/provider-productivity-fixtures.js");

const BASE = "/api/director-center/productivity";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const TESTING_BANNER = model.TESTING_BANNER;

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
  return Boolean(String(siteUrl || "").toLowerCase().includes(PRODUCTION_HOST));
}

function resolveEnv(expansionEnvironment) {
  let env = null;
  if (typeof expansionEnvironment === "function") {
    try { env = expansionEnvironment(); } catch { env = null; }
  }
  if (!env || typeof env !== "object") {
    const siteUrl = String(process.env.SITE_URL || "");
    env = {
      liveProduction: productionSiteFromUrl(siteUrl),
      allowDirectorCenterAdminPreview: !productionSiteFromUrl(siteUrl) && truthy(process.env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW),
      siteUrl,
    };
  }
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const liveProduction = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    ...env,
    liveProduction,
    allowDirectorCenterAdminPreview: env.allowDirectorCenterAdminPreview === true && !liveProduction,
    siteUrl,
  };
}

function createProviderProductivityApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
  expansionEnvironment,
}) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function deny(response, status, code, error) {
    jsonResponse(response, status, {
      ok: false,
      error: error || "Access denied.",
      code,
      providerProductivity: true,
      preview: true,
      testingBanner: TESTING_BANNER,
    });
  }

  function ensureOrg(store, adminEmail, options = {}) {
    model.ensureProductivityStore(store);
    const seeded = fixtures.ensurePhase21Preview(store, {
      adminEmail: normalizeEmail?.(adminEmail) || adminEmail,
      organizationId: options.organizationId || "",
      programStyle: options.programStyle || "",
    });
    const organization = store.organizations?.[seeded.organizationId] || null;
    return { organization, seeded };
  }

  function resolveActor(store, request, organizationId, adminEmail) {
    const members = listValues(store.staffMemberships).filter((row) => (
      row.organizationId === organizationId && row.status === foundation.STAFF_STATUS.ACTIVE
    ));
    const owner = members.find((row) => safeLower(row.userEmail) === safeLower(adminEmail))
      || members.find((row) => row.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER)
      || members[0];
    const policyOk = env().allowDirectorCenterAdminPreview === true && !env().liveProduction;
    const requested = getHeader(request, "x-llh-role-preview-membership-id");
    if (requested && policyOk) {
      const member = store.staffMemberships?.[requested];
      if (member && member.organizationId === organizationId) {
        return { actor: member, membership: member, rolePreview: true };
      }
    }
    return {
      actor: owner || {
        userEmail: adminEmail,
        role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
        organizationId,
        status: foundation.STAFF_STATUS.ACTIVE,
      },
      membership: owner || null,
      rolePreview: false,
    };
  }

  function isDirectorRole(role) {
    const normalized = orgPermissions.normalizeOrgRole(role);
    return normalized === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || normalized === orgPermissions.ORG_ROLES.DIRECTOR;
  }

  function classroomScopeIds(store, organizationId, actor) {
    if (isDirectorRole(actor.role)) {
      return listValues(store.classrooms).filter((row) => row.organizationId === organizationId && !row.archivedAt).map((row) => row.id);
    }
    const assigned = listValues(store.classroomStaffAssignments || {})
      .filter((row) => (
        row.organizationId === organizationId
        && row.staffMembershipId === actor.id
        && (!row.status || row.status === foundation.ASSIGNMENT_STATUS.ACTIVE || row.status === "active")
        && !row.endsAt
      ))
      .map((row) => row.classroomId);
    return assigned;
  }

  function assertAccess(store, request, response, adminEmail, options = {}) {
    if (env().liveProduction || !env().allowDirectorCenterAdminPreview) {
      deny(response, 403, "production_preview_rejected", "Provider Productivity preview is unavailable in production.");
      return null;
    }
    if (!adminEmail) {
      deny(response, 401, "verified_admin_required", "Verified admin unlock is required.");
      return null;
    }
    const { organization, seeded } = ensureOrg(store, adminEmail, options);
    if (!organization || organization.preview !== true) {
      deny(response, 403, "fake_org_required", "Provider Productivity preview requires a fake organization.");
      return null;
    }
    const requestedOrg = options.organizationId || "";
    if (requestedOrg && requestedOrg !== organization.id) {
      deny(response, 403, "cross_org_denied", "This request is outside the current fake organization.");
      return null;
    }
    const { actor, membership, rolePreview } = resolveActor(store, request, organization.id, adminEmail);
    if (options.directorOnly && !isDirectorRole(actor.role)) {
      deny(response, 403, "director_required", "Only owners/directors can use this preview action.");
      return null;
    }
    return { organization, seeded, actor, membership, rolePreview };
  }

  function orgQuery(url) {
    return url?.searchParams?.get("organizationId") || "";
  }

  function userKey(gate) {
    return safeLower(gate.actor?.userEmail || gate.seeded?.actorEmail || "phase21.provider@example.invalid");
  }

  function withChildAliases(store) {
    return {
      ...store,
      children: {
        ...(store.children || {}),
        ...(store.childRecords || {}),
      },
    };
  }

  function activityWithMeta(store, organizationId, actorKey, activity) {
    const favorites = model.getFavorites(store, organizationId, actorKey);
    return {
      ...activity,
      favorited: favorites.some((row) => row.itemType === "activity" && row.itemId === activity.id),
    };
  }

  function productivityLists(store, organizationId, actorKey) {
    const pp = model.ensureProductivityStore(store);
    const favorites = model.getFavorites(store, organizationId, actorKey);
    const recent = model.getRecent(store, organizationId, actorKey);
    return {
      interests: listValues(pp.interests).filter((row) => row.organizationId === organizationId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      suggestions: listValues(pp.suggestions).filter((row) => row.organizationId === organizationId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      savedIdeas: listValues(pp.savedIdeas).filter((row) => row.organizationId === organizationId)
        .sort((a, b) => String(b.savedAt || b.createdAt).localeCompare(String(a.savedAt || a.createdAt))),
      planEntries: listValues(pp.planEntries).filter((row) => row.organizationId === organizationId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      whatHappened: listValues(pp.whatHappened).filter((row) => row.organizationId === organizationId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      activities: model.activityCatalogSeed().map((activity) => activityWithMeta(store, organizationId, actorKey, activity)),
      favorites,
      recent,
    };
  }

  function dashboardPayload(store, gate) {
    const organizationId = gate.organization.id;
    const actorKey = userKey(gate);
    const preference = model.getOrgPreference(store, organizationId);
    const setup = model.updateSetupProgress(store, organizationId, {});
    const phone = model.phoneSummary(store, organizationId);
    const lists = productivityLists(store, organizationId, actorKey);
    const notificationPrefs = model.getNotificationPrefs(store, organizationId, actorKey);
    return {
      ok: true,
      phase: 21,
      preview: true,
      fakeDataOnly: true,
      noExternalServices: true,
      noLiveAi: true,
      noOutboundEmail: true,
      noOutboundSms: true,
      noStripe: true,
      featureMarker: model.FEATURE_MARKER,
      testingBanner: TESTING_BANNER,
      organization: {
        id: gate.organization.id,
        name: gate.organization.name,
        ownerEmail: gate.organization.ownerEmail,
        preview: gate.organization.preview === true,
      },
      actor: {
        email: gate.actor.userEmail || gate.seeded.actorEmail,
        role: gate.actor.role || "director_owner",
        rolePreview: gate.rolePreview === true,
      },
      preference,
      planningLabels: model.PLANNING_PREFERENCE_LABELS,
      shortcuts: model.shortcutsForPreference(preference.planningPreference),
      setup,
      phone,
      quickActions: model.quickActionsForRole(gate.actor.role, preference.planningPreference),
      notificationPrefs,
      lessonPlansOptional: true,
      plainLanguageNote: "Lesson plans are optional. You can plan by interests, activities, or a simple next step.",
      ...lists,
    };
  }

  function getByOrg(store, collection, id, organizationId) {
    const row = model.ensureProductivityStore(store)[collection]?.[id];
    if (!row || row.organizationId !== organizationId) return null;
    return row;
  }

  async function handleSeed(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const requestedOrg = String(body.organizationId || "").trim();
    if (body.reset === true) {
      const pp = model.ensureProductivityStore(store);
      const orgId = requestedOrg || pp.meta?.phase21SeededFor || "";
      for (const key of ["preferences", "interests", "suggestions", "savedIdeas", "planEntries", "whatHappened", "activityMeta", "favorites", "recent", "setupProgress", "quickActions", "filterMemory", "notificationPrefs", "scanJobs", "undoStack"]) {
        Object.keys(pp[key] || {}).forEach((id) => {
          const row = pp[key][id];
          if (!orgId || row?.organizationId === orgId || String(id).startsWith(`${orgId}::`) || id === orgId) delete pp[key][id];
        });
      }
      pp.history = (pp.history || []).filter((row) => orgId && row.organizationId !== orgId);
      pp.meta = {};
    }
    const gate = assertAccess(store, request, response, ctx.adminEmail, {
      organizationId: requestedOrg,
      programStyle: body.programStyle || "",
    });
    if (!gate) return;
    writeStore(store);
    jsonResponse(response, 200, dashboardPayload(store, gate));
  }

  async function handleDashboard(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    writeStore(store);
    jsonResponse(response, 200, dashboardPayload(store, gate));
  }

  async function handlePreferences(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    if (request.method === "PATCH") {
      const body = await readJson(request).catch(() => ({}));
      if (body.organizationId && body.organizationId !== gate.organization.id) return deny(response, 403, "cross_org_denied");
      const preference = model.setOrgPreference(store, gate.organization.id, body);
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, preference, testingBanner: TESTING_BANNER });
    }
    writeStore(store);
    return jsonResponse(response, 200, {
      ok: true,
      preference: model.getOrgPreference(store, gate.organization.id),
      labels: model.PLANNING_PREFERENCE_LABELS,
      lessonPlansOptional: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleSetup(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    if (request.method === "POST") {
      const body = await readJson(request).catch(() => ({}));
      if (body.organizationId && body.organizationId !== gate.organization.id) return deny(response, 403, "cross_org_denied");
      const setup = model.updateSetupProgress(store, gate.organization.id, {
        completeStepId: body.completeStepId,
        skipStepId: body.skipStepId,
        finishLater: body.finishLater === true,
        programStyle: body.programStyle,
      });
      writeStore(store);
      return jsonResponse(response, 200, { ok: true, setup, testingBanner: TESTING_BANNER });
    }
    const setup = model.updateSetupProgress(store, gate.organization.id, {});
    writeStore(store);
    return jsonResponse(response, 200, { ok: true, setup, testingBanner: TESTING_BANNER });
  }

  async function handleCreateInterest(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "" });
    if (!gate) return;
    const interest = model.createInterestRecord({
      organizationId: gate.organization.id,
      childIds: body.childIds || [],
      classroomId: body.classroomId || "",
      note: body.note || "",
      theme: body.theme || "",
      nextStep: body.nextStep || "",
      createdBy: gate.actor.userEmail || ctx.adminEmail,
    });
    interest.preview = true;
    interest.phase21 = true;
    const pp = model.ensureProductivityStore(store);
    pp.interests[interest.id] = interest;
    model.pushRecent(store, { organizationId: gate.organization.id, userKey: userKey(gate), itemType: "interest", itemId: interest.id });
    model.pushUndo(store, gate.organization.id, { type: "delete_interest", collection: "interests", id: interest.id });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, interest, testingBanner: TESTING_BANNER });
  }

  async function handleGenerateSuggestions(request, response, ctx, interestId) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const interest = getByOrg(store, "interests", interestId, gate.organization.id);
    if (!interest) return deny(response, 404, "not_found", "Interest not found for this fake organization.");
    const suggestions = model.generatePlaySuggestions(interest).map((suggestion) => ({
      ...suggestion,
      preview: true,
      phase21: true,
      liveAiUsed: false,
      reviewed: false,
      saved: false,
    }));
    const pp = model.ensureProductivityStore(store);
    suggestions.forEach((suggestion) => { pp.suggestions[suggestion.id] = suggestion; });
    model.pushRecent(store, { organizationId: gate.organization.id, userKey: userKey(gate), itemType: "interest", itemId: interest.id });
    writeStore(store);
    jsonResponse(response, 201, {
      ok: true,
      suggestions,
      localCatalog: true,
      liveAiUsed: false,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleReviewSuggestion(request, response, ctx, suggestionId) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "" });
    if (!gate) return;
    const suggestion = getByOrg(store, "suggestions", suggestionId, gate.organization.id);
    if (!suggestion) return deny(response, 404, "not_found", "Suggestion not found for this fake organization.");
    if (body.confirm !== true || body.reviewed !== true) {
      return deny(response, 400, "review_confirmation_required", "Check review and confirm before saving an idea.");
    }
    suggestion.reviewed = true;
    suggestion.reviewedAt = model.nowIso();
    suggestion.reviewedBy = gate.actor.userEmail || ctx.adminEmail;
    suggestion.providerNote = model.cleanText(body.providerNote || suggestion.providerNote || "", 400);
    writeStore(store);
    return jsonResponse(response, 200, { ok: true, suggestion, testingBanner: TESTING_BANNER });
  }

  async function handleSaveSuggestion(request, response, ctx, suggestionId) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "" });
    if (!gate) return;
    const suggestion = getByOrg(store, "suggestions", suggestionId, gate.organization.id);
    if (!suggestion) return deny(response, 404, "not_found", "Suggestion not found for this fake organization.");
    if (suggestion.reviewed !== true) {
      return deny(response, 400, "review_required", "Review and confirm this idea before saving it.");
    }
    suggestion.saved = true;
    suggestion.savedAt = model.nowIso();
    suggestion.savedBy = gate.actor.userEmail || ctx.adminEmail;
    const pp = model.ensureProductivityStore(store);
    const savedIdea = {
      id: model.newId("ppsave"),
      organizationId: gate.organization.id,
      suggestionId: suggestion.id,
      interestId: suggestion.interestId,
      title: suggestion.title,
      prompt: suggestion.prompt,
      theme: suggestion.theme,
      formalLessonPlanRequired: false,
      savedAt: suggestion.savedAt,
      savedBy: suggestion.savedBy,
      preview: true,
      phase21: true,
    };
    pp.savedIdeas[savedIdea.id] = savedIdea;
    model.pushRecent(store, { organizationId: gate.organization.id, userKey: userKey(gate), itemType: "suggestion", itemId: suggestion.id });
    model.pushUndo(store, gate.organization.id, { type: "unsave_suggestion", suggestionId: suggestion.id, savedIdeaId: savedIdea.id });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, suggestion, savedIdea, testingBanner: TESTING_BANNER });
  }

  async function handlePlanEntry(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "" });
    if (!gate) return;
    if (body.suggestionId) {
      const suggestion = getByOrg(store, "suggestions", body.suggestionId, gate.organization.id);
      if (!suggestion) return deny(response, 404, "not_found", "Suggestion not found for this fake organization.");
    }
    const activity = body.activityId ? model.activityCatalogSeed().find((row) => row.id === body.activityId) : null;
    const suggestion = body.suggestionId ? getByOrg(store, "suggestions", body.suggestionId, gate.organization.id) : null;
    const entry = model.createPlanEntry({
      organizationId: gate.organization.id,
      activityId: body.activityId || "",
      suggestionId: body.suggestionId || "",
      interestId: body.interestId || suggestion?.interestId || "",
      title: body.title || suggestion?.title || activity?.title || "Provider idea",
      target: body.target || "today",
      childIds: body.childIds || [],
      classroomId: body.classroomId || "",
      initiationMode: body.initiationMode || model.INITIATION_MODES.CHILD_INITIATED,
      createdBy: gate.actor.userEmail || ctx.adminEmail,
    });
    const pp = model.ensureProductivityStore(store);
    pp.planEntries[entry.id] = entry;
    model.pushRecent(store, { organizationId: gate.organization.id, userKey: userKey(gate), itemType: "plan_entry", itemId: entry.id });
    model.pushUndo(store, gate.organization.id, { type: "delete_plan_entry", collection: "planEntries", id: entry.id });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, planEntry: entry, testingBanner: TESTING_BANNER });
  }

  async function handleWhatHappened(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "" });
    if (!gate) return;
    if (body.planEntryId && !getByOrg(store, "planEntries", body.planEntryId, gate.organization.id)) {
      return deny(response, 404, "not_found", "Plan entry not found for this fake organization.");
    }
    const row = model.createWhatHappened({
      organizationId: gate.organization.id,
      planEntryId: body.planEntryId || "",
      interestId: body.interestId || "",
      note: body.note || "",
      childIds: body.childIds || [],
      createdBy: gate.actor.userEmail || ctx.adminEmail,
    });
    const pp = model.ensureProductivityStore(store);
    pp.whatHappened[row.id] = row;
    model.pushUndo(store, gate.organization.id, { type: "delete_what_happened", collection: "whatHappened", id: row.id });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, whatHappened: row, testingBanner: TESTING_BANNER });
  }

  async function handleActivities(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    const filters = {
      q: url?.searchParams?.get("q") || "",
      age: url?.searchParams?.get("age") || "",
      interest: url?.searchParams?.get("interest") || "",
      skill: url?.searchParams?.get("skill") || "",
      setting: url?.searchParams?.get("setting") || "",
      indoorOutdoor: url?.searchParams?.get("indoorOutdoor") || "",
      timeMinutes: url?.searchParams?.get("timeMinutes") || "",
      adultInvolvement: url?.searchParams?.get("adultInvolvement") || "",
      prep: url?.searchParams?.get("prep") || "",
      developmentalResult: url?.searchParams?.get("developmentalResult") || "",
      everydayMaterials: truthy(url?.searchParams?.get("everydayMaterials") || ""),
    };
    const actorKey = userKey(gate);
    model.rememberFilter(store, gate.organization.id, actorKey, "activities", filters);
    const activities = model.filterActivities(model.activityCatalogSeed(), filters)
      .map((activity) => activityWithMeta(store, gate.organization.id, actorKey, activity));
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      activities,
      filters,
      rememberedFilter: model.getRememberedFilter(store, gate.organization.id, actorKey, "activities"),
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleFavoriteActivity(request, response, ctx, activityId) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const activity = model.activityCatalogSeed().find((row) => row.id === activityId);
    if (!activity) return deny(response, 404, "not_found", "Activity not found.");
    const result = model.toggleFavorite(store, {
      organizationId: gate.organization.id,
      userKey: userKey(gate),
      itemType: "activity",
      itemId: activityId,
    });
    model.pushUndo(store, gate.organization.id, { type: "toggle_favorite", itemType: "activity", itemId: activityId, userKey: userKey(gate) });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, activityId, ...result, testingBanner: TESTING_BANNER });
  }

  async function handleDuplicateActivity(request, response, ctx, activityId) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const activity = model.activityCatalogSeed().find((row) => row.id === activityId);
    if (!activity) return deny(response, 404, "not_found", "Activity not found.");
    const pp = model.ensureProductivityStore(store);
    const duplicate = {
      id: model.newId("ppact"),
      organizationId: gate.organization.id,
      sourceActivityId: activity.id,
      title: `${activity.title} (copy)`,
      prompt: `Provider copy of ${activity.title}. Lesson plan remains optional.`,
      formalLessonPlanRequired: false,
      createdAt: model.nowIso(),
      createdBy: gate.actor.userEmail || ctx.adminEmail,
      preview: true,
      phase21: true,
    };
    pp.savedIdeas[duplicate.id] = duplicate;
    model.pushRecent(store, { organizationId: gate.organization.id, userKey: userKey(gate), itemType: "saved_idea", itemId: duplicate.id });
    model.pushUndo(store, gate.organization.id, { type: "delete_saved_idea", collection: "savedIdeas", id: duplicate.id });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, duplicate, testingBanner: TESTING_BANNER });
  }

  async function handleFavorites(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    const favorites = model.getFavorites(store, gate.organization.id, userKey(gate));
    const activities = model.activityCatalogSeed();
    jsonResponse(response, 200, {
      ok: true,
      favorites,
      resolved: favorites.map((fav) => ({
        ...fav,
        activity: fav.itemType === "activity" ? activities.find((row) => row.id === fav.itemId) || null : null,
      })),
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleRecent(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    jsonResponse(response, 200, {
      ok: true,
      recent: model.getRecent(store, gate.organization.id, userKey(gate)),
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleSearch(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    const role = url?.searchParams?.get("role") || gate.actor.role || "director";
    const scopedClassroomIds = classroomScopeIds(store, gate.organization.id, gate.actor);
    const output = model.universalSearch(withChildAliases(store), {
      organizationId: gate.organization.id,
      role,
      query: url?.searchParams?.get("q") || "",
      membershipClassroomIds: scopedClassroomIds,
    });
    jsonResponse(response, 200, {
      ...output,
      role,
      permissionAware: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleNotificationPrefs(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    if (request.method === "PATCH") {
      const body = await readJson(request).catch(() => ({}));
      if (body.organizationId && body.organizationId !== gate.organization.id) return deny(response, 403, "cross_org_denied");
      const prefs = model.setNotificationPrefs(store, gate.organization.id, userKey(gate), body);
      writeStore(store);
      return jsonResponse(response, 200, {
        ok: true,
        notificationPrefs: prefs,
        outboundDisabled: true,
        testingBanner: TESTING_BANNER,
      });
    }
    writeStore(store);
    return jsonResponse(response, 200, {
      ok: true,
      notificationPrefs: model.getNotificationPrefs(store, gate.organization.id, userKey(gate)),
      outboundDisabled: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleBulkAssign(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "", directorOnly: true });
    if (!gate) return;
    if (body.confirm !== true) {
      return deny(response, 400, "confirm_required", "Bulk assign is fake but still requires confirm:true.");
    }
    const targets = Array.isArray(body.activityIds) ? body.activityIds : [];
    const assigned = targets.slice(0, 25).map((activityId) => {
      const activity = model.activityCatalogSeed().find((row) => row.id === activityId);
      const entry = model.createPlanEntry({
        organizationId: gate.organization.id,
        activityId,
        title: activity?.title || "Bulk assigned activity",
        target: body.target || "weekly",
        classroomId: body.classroomId || "",
        initiationMode: body.initiationMode || model.INITIATION_MODES.INVITATION_OFFERED,
        createdBy: gate.actor.userEmail || ctx.adminEmail,
      });
      model.ensureProductivityStore(store).planEntries[entry.id] = entry;
      return entry;
    });
    model.pushUndo(store, gate.organization.id, { type: "bulk_delete_plan_entries", ids: assigned.map((row) => row.id) });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      assigned,
      computerRecommended: true,
      fakeOnly: true,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleScan(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "" });
    if (!gate) return;
    if (body.realFile || body.fileData || body.base64) {
      return deny(response, 400, "fake_file_only", "Phase 21 scan accepts fake file names only.");
    }
    const scan = model.createScanJob({
      organizationId: gate.organization.id,
      fileName: body.fileName || "fake-scan.jpg",
      createdBy: gate.actor.userEmail || ctx.adminEmail,
    });
    model.ensureProductivityStore(store).scanJobs[scan.id] = scan;
    model.pushUndo(store, gate.organization.id, { type: "delete_scan", collection: "scanJobs", id: scan.id });
    writeStore(store);
    jsonResponse(response, 201, { ok: true, scan, fakeOnly: true, testingBanner: TESTING_BANNER });
  }

  async function handleUndo(request, response, ctx) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail);
    if (!gate) return;
    const pp = model.ensureProductivityStore(store);
    const action = model.popUndo(store, gate.organization.id);
    let undone = false;
    if (action) {
      if (action.collection && action.id && pp[action.collection]?.[action.id]) {
        delete pp[action.collection][action.id];
        undone = true;
      } else if (action.type === "unsave_suggestion") {
        if (pp.savedIdeas[action.savedIdeaId]) delete pp.savedIdeas[action.savedIdeaId];
        if (pp.suggestions[action.suggestionId]) pp.suggestions[action.suggestionId].saved = false;
        undone = true;
      } else if (action.type === "bulk_delete_plan_entries" && Array.isArray(action.ids)) {
        action.ids.forEach((id) => { delete pp.planEntries[id]; });
        undone = true;
      } else if (action.type === "toggle_favorite") {
        model.toggleFavorite(store, {
          organizationId: gate.organization.id,
          userKey: action.userKey || userKey(gate),
          itemType: action.itemType,
          itemId: action.itemId,
        });
        undone = true;
      }
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, undone, action, testingBanner: TESTING_BANNER });
  }

  async function handlePhoneSummary(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phone: model.phoneSummary(store, gate.organization.id),
      testingBanner: TESTING_BANNER,
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/dashboard`) return (req, res, ctx) => handleDashboard(req, res, ctx, url);
    if ((method === "GET" || method === "PATCH") && path === `${BASE}/preferences`) return (req, res, ctx) => handlePreferences(req, res, ctx, url);
    if ((method === "GET" || method === "POST") && path === `${BASE}/setup`) return (req, res, ctx) => handleSetup(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/interests`) return (req, res, ctx) => handleCreateInterest(req, res, ctx);
    if (method === "POST" && path === `${BASE}/plan-entries`) return (req, res, ctx) => handlePlanEntry(req, res, ctx);
    if (method === "POST" && path === `${BASE}/what-happened`) return (req, res, ctx) => handleWhatHappened(req, res, ctx);
    if (method === "GET" && path === `${BASE}/activities`) return (req, res, ctx) => handleActivities(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/favorites`) return (req, res, ctx) => handleFavorites(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/recent`) return (req, res, ctx) => handleRecent(req, res, ctx, url);
    if (method === "GET" && path === `${BASE}/search`) return (req, res, ctx) => handleSearch(req, res, ctx, url);
    if ((method === "GET" || method === "PATCH") && path === `${BASE}/notification-prefs`) return (req, res, ctx) => handleNotificationPrefs(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/bulk-assign`) return (req, res, ctx) => handleBulkAssign(req, res, ctx);
    if (method === "POST" && path === `${BASE}/scan`) return (req, res, ctx) => handleScan(req, res, ctx);
    if (method === "POST" && path === `${BASE}/undo`) return (req, res, ctx) => handleUndo(req, res, ctx);
    if (method === "GET" && path === `${BASE}/phone-summary`) return (req, res, ctx) => handlePhoneSummary(req, res, ctx, url);

    const interestMatch = path.match(/^\/api\/director-center\/productivity\/interests\/([^/]+)\/suggestions$/);
    if (interestMatch && method === "POST") {
      const id = decodeURIComponent(interestMatch[1]);
      return (req, res, ctx) => handleGenerateSuggestions(req, res, ctx, id);
    }

    const suggestionMatch = path.match(/^\/api\/director-center\/productivity\/suggestions\/([^/]+)\/(review|save)$/);
    if (suggestionMatch && method === "POST") {
      const id = decodeURIComponent(suggestionMatch[1]);
      return suggestionMatch[2] === "review"
        ? (req, res, ctx) => handleReviewSuggestion(req, res, ctx, id)
        : (req, res, ctx) => handleSaveSuggestion(req, res, ctx, id);
    }

    const activityMatch = path.match(/^\/api\/director-center\/productivity\/activities\/([^/]+)\/(favorite|duplicate)$/);
    if (activityMatch && method === "POST") {
      const id = decodeURIComponent(activityMatch[1]);
      return activityMatch[2] === "favorite"
        ? (req, res, ctx) => handleFavoriteActivity(req, res, ctx, id)
        : (req, res, ctx) => handleDuplicateActivity(req, res, ctx, id);
    }
    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createProviderProductivityApi,
  BASE,
};
