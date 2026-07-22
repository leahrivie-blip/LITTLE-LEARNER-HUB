/**
 * Classroom Assistant API — /api/director-center/classroom-assistant/*
 * Fake/testing only. No OpenAI, Stripe, email, SMS, push, or production writes.
 */

const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");
const model = require("../scripts/classroom-assistant-data-model.js");
const fixtures = require("../scripts/classroom-assistant-fixtures.js");

const BASE = "/api/director-center/classroom-assistant";
const PRODUCTION_HOST = "littlelearnershubbyleah.com";
const TESTING_BANNER = model.TESTING_BANNER;
const previewPlanCache = new Map();

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
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

function createClassroomAssistantApi({
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
      classroomAssistant: true,
      preview: true,
      testingBanner: TESTING_BANNER,
      liveAiUsed: false,
    });
  }

  function ensureOrg(store, adminEmail, options = {}) {
    model.ensureClassroomAssistantStore(store);
    const seeded = fixtures.ensureClassroomAssistantPreview(store, {
      adminEmail: normalizeEmail?.(adminEmail) || adminEmail,
      organizationId: options.organizationId || "",
    });
    const organization = store.organizations?.[seeded.organizationId] || null;
    return { organization, seeded };
  }

  function resolveActor(store, organizationId, adminEmail) {
    const email = normalizeEmail?.(adminEmail) || adminEmail;
    const members = listValues(store.staffMemberships).filter((row) => (
      row.organizationId === organizationId && row.status === foundation.STAFF_STATUS.ACTIVE
    ));
    return members.find((row) => safeLower(row.userEmail) === safeLower(email))
      || members.find((row) => row.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER)
      || members[0]
      || {
        userEmail: email,
        role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
        organizationId,
        status: foundation.STAFF_STATUS.ACTIVE,
      };
  }

  function isDirectorRole(role) {
    const normalized = orgPermissions.normalizeOrgRole(role);
    return normalized === orgPermissions.ORG_ROLES.DIRECTOR_OWNER || normalized === orgPermissions.ORG_ROLES.DIRECTOR;
  }

  function assertAccess(store, request, response, adminEmail, options = {}) {
    if (env().liveProduction || !env().allowDirectorCenterAdminPreview) {
      deny(response, 403, "production_preview_rejected", "Classroom Assistant preview is unavailable in production.");
      return null;
    }
    if (!adminEmail) {
      deny(response, 401, "verified_admin_required", "Verified admin unlock is required.");
      return null;
    }
    const { organization, seeded } = ensureOrg(store, adminEmail, options);
    if (!organization || organization.preview !== true) {
      deny(response, 403, "fake_org_required", "Classroom Assistant requires a fake preview organization.");
      return null;
    }
    const requestedOrg = options.organizationId || "";
    if (requestedOrg && requestedOrg !== organization.id) {
      deny(response, 403, "cross_org_denied", "This request is outside the current fake organization.");
      return null;
    }
    const actor = resolveActor(store, organization.id, adminEmail);
    if (!isDirectorRole(actor.role)) {
      deny(response, 403, "director_required", "Only owners/directors can use Classroom Assistant preview.");
      return null;
    }
    return { organization, seeded, actor };
  }

  function orgQuery(url) {
    return url?.searchParams?.get("organizationId") || "";
  }

  function recentNotes(store, organizationId) {
    const ca = model.ensureClassroomAssistantStore(store);
    const rows = [
      ...listValues(ca.mealLogs).map((row) => ({ ...row, kind: "meal", label: row.mealType || "Meal" })),
      ...listValues(ca.activityLogs).map((row) => ({ ...row, kind: "activity", label: row.title || "Activity" })),
      ...listValues(ca.observations).map((row) => ({ ...row, kind: "observation", label: "Observation" })),
      ...listValues(ca.dailySummaries).map((row) => ({ ...row, kind: "summary", label: row.bucket || "Daily summary" })),
    ];
    return rows
      .filter((row) => row.organizationId === organizationId)
      .sort((a, b) => String(b.createdAt || b.at || "").localeCompare(String(a.createdAt || a.at || "")))
      .slice(0, 12);
  }

  function dashboardPayload(store, gate) {
    const checkedInChildren = model.getCheckedInChildren(store, gate.organization.id, {});
    const ca = model.ensureClassroomAssistantStore(store);
    return {
      ok: true,
      preview: true,
      fakeDataOnly: true,
      noExternalServices: true,
      noLiveAi: true,
      noOutboundEmail: true,
      noOutboundSms: true,
      noPush: true,
      noStripe: true,
      liveAiUsed: false,
      featureMarker: model.FEATURE_MARKER,
      phoneMarker: model.PHONE_MARKER,
      testingBanner: TESTING_BANNER,
      banners: [
        TESTING_BANNER,
        "Review every preview before saving.",
        "Group notes apply to children checked in today unless a child is named.",
      ],
      organization: {
        id: gate.organization.id,
        name: gate.organization.name,
        ownerEmail: gate.organization.ownerEmail,
        preview: gate.organization.preview === true,
      },
      actor: {
        email: gate.actor.userEmail || gate.seeded.actorEmail,
        role: gate.actor.role || "director_owner",
      },
      checkedInChildren,
      recentNotes: recentNotes(store, gate.organization.id),
      counts: {
        mealLogs: listValues(ca.mealLogs).filter((row) => row.organizationId === gate.organization.id).length,
        activityLogs: listValues(ca.activityLogs).filter((row) => row.organizationId === gate.organization.id).length,
        observations: listValues(ca.observations).filter((row) => row.organizationId === gate.organization.id).length,
        lessonPlanDrafts: listValues(ca.lessonPlanDrafts).filter((row) => row.organizationId === gate.organization.id).length,
      },
    };
  }

  function resetOrgData(store, organizationId) {
    const ca = model.ensureClassroomAssistantStore(store);
    for (const key of ["parsedPlans", "mealLogs", "activityLogs", "observations", "dailySummaries", "lessonPlanDrafts", "suggestionActions"]) {
      Object.keys(ca[key] || {}).forEach((id) => {
        if (ca[key][id]?.organizationId === organizationId) delete ca[key][id];
      });
    }
    ca.history = (ca.history || []).filter((row) => row.organizationId !== organizationId);
    for (const [id, entry] of previewPlanCache.entries()) {
      if (entry?.organizationId === organizationId) previewPlanCache.delete(id);
    }
  }

  async function handleSeed(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const requestedOrg = String(body.organizationId || "").trim();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: requestedOrg });
    if (!gate) return;
    if (body.reset === true) resetOrgData(store, gate.organization.id);
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

  async function handleParse(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "" });
    if (!gate) return;
    const checkedIn = model.getCheckedInChildren(store, gate.organization.id, {});
    const children = model.childrenForOrg(store, gate.organization.id);
    const plan = model.parseNaturalNote(body.text || "", {
      organizationId: gate.organization.id,
      children,
      checkedInIds: checkedIn.map((child) => child.id),
      now: body.now || undefined,
    });
    previewPlanCache.set(plan.id, { organizationId: gate.organization.id, plan, createdAt: Date.now() });
    jsonResponse(response, 200, {
      ok: true,
      preview: true,
      requiresReview: true,
      plan,
      checkedInChildren: checkedIn,
      liveAiUsed: false,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleApply(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const requestedOrg = body.organizationId || body.plan?.organizationId || "";
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: requestedOrg });
    if (!gate) return;
    if (body.confirm !== true) {
      return deny(response, 400, "confirm_required", "Review the preview and send confirm:true before saving.");
    }
    let plan = body.plan && typeof body.plan === "object" ? body.plan : null;
    if (!plan && body.planId) {
      const cached = previewPlanCache.get(String(body.planId));
      if (cached?.organizationId === gate.organization.id) plan = cached.plan;
    }
    if (!plan) return deny(response, 404, "plan_not_found", "Preview plan not found. Parse again or include the plan.");
    if (plan.organizationId && plan.organizationId !== gate.organization.id) {
      return deny(response, 403, "cross_org_denied", "Plan belongs to another organization.");
    }
    const result = model.applyParsedPlan(store, plan, {
      confirm: true,
      organizationId: gate.organization.id,
      actorEmail: gate.actor.userEmail || ctx.adminEmail,
    });
    if (!result.ok) return deny(response, 400, result.errors?.[0] || "apply_failed", "Plan could not be applied.");
    writeStore(store);
    return jsonResponse(response, 200, {
      ...result,
      dashboard: dashboardPayload(store, gate),
    });
  }

  async function handleAcceptSuggestion(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || body.plan?.organizationId || "" });
    if (!gate) return;
    if (body.confirm !== true) {
      return deny(response, 400, "confirm_required", "One-click suggestions still require confirm:true.");
    }
    const ca = model.ensureClassroomAssistantStore(store);
    const suggestion = body.suggestion && typeof body.suggestion === "object"
      ? body.suggestion
      : { type: body.type || "daily_report", label: body.label || "Classroom Assistant suggestion", oneClick: true };
    const action = {
      id: model.newId("casug"),
      organizationId: gate.organization.id,
      planId: body.planId || body.plan?.id || body.plan?.planId || "",
      type: suggestion.type || body.type || "daily_report",
      label: suggestion.label || body.label || "Classroom Assistant suggestion",
      oneClick: true,
      confirmed: true,
      actorEmail: safeLower(gate.actor.userEmail || ctx.adminEmail),
      createdAt: model.nowIso(),
      testingOnly: true,
      liveAiUsed: false,
    };
    ca.suggestionActions[action.id] = action;
    ca.history.unshift({ id: model.newId("cahist"), type: "suggestion_accepted", organizationId: gate.organization.id, actionId: action.id, at: model.nowIso() });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, action, liveAiUsed: false, testingBanner: TESTING_BANNER });
  }

  async function handleLessonPlanParse(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || "" });
    if (!gate) return;
    const draft = model.createLessonPlanDraftFromPaste(store, body.text || body.paste || "", {
      organizationId: gate.organization.id,
      actorEmail: gate.actor.userEmail || ctx.adminEmail,
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      draft,
      requiresReview: true,
      liveAiUsed: false,
      testingBanner: TESTING_BANNER,
    });
  }

  async function handleLessonPlanConfirm(request, response, ctx) {
    const body = await readJson(request).catch(() => ({}));
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: body.organizationId || body.draft?.organizationId || "" });
    if (!gate) return;
    if (body.confirm !== true) return deny(response, 400, "confirm_required", "Review and confirm before saving the lesson plan draft.");
    const result = model.confirmLessonPlanDraft(store, body.draft || body.draftId, {
      confirm: true,
      organizationId: gate.organization.id,
      actorEmail: gate.actor.userEmail || ctx.adminEmail,
    });
    if (!result.ok) return deny(response, result.code === "cross_org_denied" ? 403 : 404, result.code || "draft_not_found", result.error);
    writeStore(store);
    jsonResponse(response, 200, result);
  }

  async function handlePhoneSummary(request, response, ctx, url) {
    const store = readStore();
    const gate = assertAccess(store, request, response, ctx.adminEmail, { organizationId: orgQuery(url) });
    if (!gate) return;
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      phone: {
        featureMarker: model.PHONE_MARKER,
        headline: "Classroom Assistant works for quick phone notes",
        note: "Use a phone for daily classroom notes. Lesson plan paste review is computer-recommended.",
        checkedInCount: model.getCheckedInChildren(store, gate.organization.id, {}).length,
        computerRecommendedForLessonPlans: true,
      },
      liveAiUsed: false,
      testingBanner: TESTING_BANNER,
    });
  }

  function matchRoute(method, pathname, url) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "POST" && path === `${BASE}/seed`) return (req, res, ctx) => handleSeed(req, res, ctx);
    if (method === "GET" && path === `${BASE}/dashboard`) return (req, res, ctx) => handleDashboard(req, res, ctx, url);
    if (method === "POST" && path === `${BASE}/parse`) return (req, res, ctx) => handleParse(req, res, ctx);
    if (method === "POST" && path === `${BASE}/apply`) return (req, res, ctx) => handleApply(req, res, ctx);
    if (method === "POST" && path === `${BASE}/suggestions/accept`) return (req, res, ctx) => handleAcceptSuggestion(req, res, ctx);
    if (method === "POST" && path === `${BASE}/admin/lesson-plan/parse`) return (req, res, ctx) => handleLessonPlanParse(req, res, ctx);
    if (method === "POST" && path === `${BASE}/admin/lesson-plan/confirm`) return (req, res, ctx) => handleLessonPlanConfirm(req, res, ctx);
    if (method === "GET" && path === `${BASE}/phone-summary`) return (req, res, ctx) => handlePhoneSummary(req, res, ctx, url);
    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createClassroomAssistantApi,
  BASE,
};
