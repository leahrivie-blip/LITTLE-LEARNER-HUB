/**
 * Phase 23 — AI Testing API — /api/ai-testing/*
 *
 * Production always rejects (mounted behind the same expansionFlags gate as
 * Director Center / Forms Center / Testing Lab — see server/index.js). Every
 * handler additionally calls scripts/ai-testing-safety.js's full gate
 * (env + stored flag + admin/fake-account + rate limit) before touching
 * OpenAI, because a route being reachable at all is not the same guarantee
 * as "this specific request may call the real AI provider."
 */

const aiModel = require("../scripts/ai-testing-data-model.js");
const aiFixtures = require("../scripts/ai-testing-fixtures.js");
const aiService = require("../scripts/ai-testing-service.js");
const safety = require("../scripts/ai-testing-safety.js");
const caModel = require("../scripts/classroom-assistant-data-model.js");

const BASE = "/api/ai-testing";

// Test-only mock transport hook. When AI_TESTING_MOCK_TRANSPORT_MODULE points
// at a file exporting a function, every OpenAI call from this API uses THAT
// function instead of a real network fetch — this is how every automated
// test in this repository exercises the AI testing pathway end-to-end over
// real HTTP without ever calling api.openai.com. Never read outside of
// NODE_ENV=test, and never something a production deploy would set.
function resolveTestFetchImpl() {
  if (String(process.env.NODE_ENV || "") !== "test") return undefined;
  const modulePath = process.env.AI_TESTING_MOCK_TRANSPORT_MODULE;
  if (!modulePath) return undefined;
  try {
    // Tests overwrite this same file between assertions to change mock
    // behavior mid-run — always bust Node's require cache so each call
    // reads the CURRENT file content, not whatever was first required.
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(modulePath);
  } catch {
    return undefined;
  }
}

function createAiTestingApi({ readStore, writeStore, jsonResponse, readJson, rawEnv }) {
  // ai-testing-safety.js expects RAW env vars (SITE_URL, ALLOW_OPENAI_TESTING,
  // OPENAI_API_KEY, OPENAI_MODEL, DISABLE_AI_CALLS as flat strings) and builds
  // its own resolved environment internally — unlike the OTHER expansion APIs'
  // already-resolved `expansionEnvironment()` object, which has a different
  // shape (allowDirectorCenterAdminPreview, liveProduction, etc. already
  // booleans) that would be the wrong input here.
  function env() {
    return (typeof rawEnv === "function" ? rawEnv() : rawEnv) || process.env;
  }

  function deny(response, status, payload) {
    jsonResponse(response, status, { ok: false, ...payload });
  }

  function callerContext(ctx, store) {
    // ctx.adminEmail is set by the outer admin-preview mount for a verified
    // admin. Fake-account "actor" sessions (used by the AI Review Screen
    // inside the main Classroom Assistant surface, not the admin-only Lab)
    // arrive with ctx.fakeAccountEmail/ctx.fakeOrganizationId instead —
    // never a real member session, matching every other testing-only route.
    return {
      isVerifiedAdmin: Boolean(ctx.adminEmail),
      isFakeAccountSession: Boolean(ctx.fakeAccountEmail),
      accountEmail: ctx.adminEmail || ctx.fakeAccountEmail || "",
      organizationId: ctx.organizationId || "",
    };
  }

  async function handleStatus(request, response, ctx) {
    const store = readStore();
    aiModel.ensureAiTestingStore(store);
    const storedFlags = store.siteContent?.featureFlags || {};
    const access = safety.resolveAiTestingAccess({
      env: env(), storedFlags, isVerifiedAdmin: Boolean(ctx.adminEmail),
    });
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: "Testing Account — Fake Data Only. AI output is never automatically saved, sent, published, approved, billed, or diagnosed.",
      enabled: access.allowed && safety.hasRealOpenAiKey(env()),
      environmentAllowed: access.allowed,
      hasApiKey: safety.hasRealOpenAiKey(env()),
      model: String(env().OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"),
      reason: access.reason,
      usageTotals: aiModel.ensureAiTestingStore(store).usageTotals,
    });
  }

  // ---- Admin-only sanitized usage breakdown ------------------------------
  // Deliberately its own admin-only handler/route, not folded into the
  // shared /status above: /status is reachable by a fake-account tester too,
  // and a per-organization breakdown would leak OTHER organizations' usage
  // to a tester — that must never happen. This route requires ctx.adminEmail.
  async function handleAdminUsage(request, response, ctx) {
    if (!ctx.adminEmail) return deny(response, 401, { error: "Admin session required." });
    const store = readStore();
    const s = aiModel.ensureAiTestingStore(store);
    jsonResponse(response, 200, {
      ok: true,
      // Aggregate counts/cost only — see rateLimitStatusForAdmin's own doc
      // comment for the guarantee that no prompt/completion content is ever
      // included here.
      usageTotals: s.usageTotals,
      limits: {
        perTesterPerMinute: aiModel.RATE_LIMIT_MAX_PER_WINDOW,
        perOrganizationPerMinute: aiModel.RATE_LIMIT_MAX_PER_ORG_WINDOW,
        perOrganizationPerDay: aiModel.RATE_LIMIT_MAX_PER_ORG_DAY,
      },
      organizations: aiModel.rateLimitStatusForAdmin(store),
    });
  }

  async function handleInterpretClassroomAssistant(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const { isVerifiedAdmin, isFakeAccountSession, accountEmail, organizationId } = callerContext(ctx, store);
    const orgId = body.organizationId || organizationId;
    const children = caModel.childrenForOrg(store, orgId);
    const checkedInIds = (caModel.getCheckedInChildren(store, orgId, {}) || []).map((c) => c.id);
    const result = await aiService.interpretClassroomAssistantEntry({
      store, env: env(), text: body.text || "", organizationId: orgId, children, checkedInIds,
      accountEmail, isVerifiedAdmin, isFakeAccountSession,
      modelOverride: ctx.adminEmail ? (body.modelOverride || "") : "",
      storedFlags: store.siteContent?.featureFlags || {},
      fetchImpl: resolveTestFetchImpl(),
    });
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      testingBanner: "Testing Account — Fake Data Only.",
      ...result,
    });
  }

  async function handleProfessionalDraft(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const { isVerifiedAdmin, isFakeAccountSession, accountEmail, organizationId } = callerContext(ctx, store);
    const outcome = await aiService.generateProfessionalDraft({
      store, env: env(), text: body.text || "", draftType: body.draftType || "",
      accountEmail, organizationId: body.organizationId || organizationId, isVerifiedAdmin, isFakeAccountSession,
      modelOverride: ctx.adminEmail ? (body.modelOverride || "") : "",
      storedFlags: store.siteContent?.featureFlags || {},
      fetchImpl: resolveTestFetchImpl(),
    });
    writeStore(store);
    if (!outcome.ok) return deny(response, outcome.unavailable ? (outcome.status || 403) : 502, outcome);
    jsonResponse(response, 200, { ok: true, testingBanner: "Testing Account — Fake Data Only.", ...outcome });
  }

  async function handleLessonPlanAssist(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const { isVerifiedAdmin, isFakeAccountSession, accountEmail, organizationId } = callerContext(ctx, store);
    const outcome = await aiService.assistLessonPlan({
      store, env: env(), text: body.text || "",
      accountEmail, organizationId: body.organizationId || organizationId, isVerifiedAdmin, isFakeAccountSession,
      modelOverride: ctx.adminEmail ? (body.modelOverride || "") : "",
      storedFlags: store.siteContent?.featureFlags || {},
      fetchImpl: resolveTestFetchImpl(),
    });
    writeStore(store);
    if (!outcome.ok) return deny(response, outcome.unavailable ? (outcome.status || 403) : 502, outcome);
    jsonResponse(response, 200, { ok: true, testingBanner: "Testing Account — Fake Data Only.", ...outcome });
  }

  async function handleFormBuilderDraft(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const { isVerifiedAdmin, isFakeAccountSession, accountEmail, organizationId } = callerContext(ctx, store);
    const outcome = await aiService.draftForm({
      store, env: env(), text: body.text || "",
      accountEmail, organizationId: body.organizationId || organizationId, isVerifiedAdmin, isFakeAccountSession,
      modelOverride: ctx.adminEmail ? (body.modelOverride || "") : "",
      storedFlags: store.siteContent?.featureFlags || {},
      fetchImpl: resolveTestFetchImpl(),
    });
    writeStore(store);
    if (!outcome.ok) return deny(response, outcome.unavailable ? (outcome.status || 403) : 502, outcome);
    jsonResponse(response, 200, { ok: true, testingBanner: "Testing Account — Fake Data Only.", ...outcome });
  }

  async function handleFeedback(request, response, ctx) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    if (!body.workflowType || !body.rating) {
      return deny(response, 400, { error: "workflowType and rating are required." });
    }
    if (!Object.values(aiModel.OUTCOME_RATINGS).includes(body.rating)) {
      return deny(response, 400, { error: "Invalid rating." });
    }
    const record = aiModel.saveFeedback(store, {
      workflowType: body.workflowType,
      promptVersionId: body.promptVersionId || "",
      model: body.model || "",
      rating: body.rating,
      reasons: body.reasons || [],
      note: body.note || "",
      actorEmail: ctx.adminEmail || ctx.fakeAccountEmail || "",
      organizationId: body.organizationId || "",
      runId: body.runId || "",
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, feedback: record });
  }

  // ---- Admin-only AI Evaluation Lab ------------------------------------

  async function handleListScenarios(request, response) {
    const store = readStore();
    const scenarios = aiFixtures.ensureScenarioLibrary(store);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, scenarios });
  }

  async function handleRunScenario(request, response, ctx, scenarioId) {
    const store = readStore();
    const scenario = store.aiTesting?.scenarios?.[scenarioId];
    if (!scenario) return deny(response, 404, { error: "Scenario not found." });
    const body = await readJson(request).catch(() => ({}));
    const orgId = body.organizationId || "org_ai_eval_lab";
    const children = [{ id: "child_fixture_a", name: "Ava Fixture" }, { id: "child_fixture_b", name: "Timmy Fixture" }];

    let outcome;
    let heuristicResult = null;
    if (scenario.workflowType === aiModel.WORKFLOW_TYPES.CLASSROOM_ASSISTANT) {
      const combined = await aiService.interpretClassroomAssistantEntry({
        store, env: env(), text: scenario.inputText, organizationId: orgId, children, checkedInIds: children.map((c) => c.id),
        accountEmail: ctx.adminEmail, isVerifiedAdmin: true,
        modelOverride: body.modelOverride || "",
        storedFlags: store.siteContent?.featureFlags || {},
      fetchImpl: resolveTestFetchImpl(),
      });
      heuristicResult = combined.heuristicPlan;
      outcome = combined.usedFallback
        ? { ok: false, unavailable: combined.aiUnavailable, error: combined.aiUnavailableReason, code: combined.aiUnavailableCode }
        : { ok: true, result: combined.aiRawResult, model: combined.model, promptVersionId: combined.promptVersionId, tokensUsed: combined.tokensUsed, latencyMs: combined.latencyMs, costCents: combined.costCents };
    } else if (scenario.workflowType === aiModel.WORKFLOW_TYPES.LESSON_PLAN_ASSIST) {
      outcome = await aiService.assistLessonPlan({
        store, env: env(), text: scenario.inputText, accountEmail: ctx.adminEmail, organizationId: orgId,
        isVerifiedAdmin: true, modelOverride: body.modelOverride || "", storedFlags: store.siteContent?.featureFlags || {},
      fetchImpl: resolveTestFetchImpl(),
      });
    } else if (scenario.workflowType === aiModel.WORKFLOW_TYPES.FORM_BUILDER) {
      outcome = await aiService.draftForm({
        store, env: env(), text: scenario.inputText, accountEmail: ctx.adminEmail, organizationId: orgId,
        isVerifiedAdmin: true, modelOverride: body.modelOverride || "", storedFlags: store.siteContent?.featureFlags || {},
      fetchImpl: resolveTestFetchImpl(),
      });
    } else {
      outcome = await aiService.generateProfessionalDraft({
        store, env: env(), text: scenario.inputText, accountEmail: ctx.adminEmail, organizationId: orgId,
        isVerifiedAdmin: true, modelOverride: body.modelOverride || "", storedFlags: store.siteContent?.featureFlags || {},
      fetchImpl: resolveTestFetchImpl(),
      });
    }

    const run = aiModel.saveRun(store, {
      scenarioId,
      workflowType: scenario.workflowType,
      model: outcome.model || "",
      promptVersionId: outcome.promptVersionId || "",
      heuristicResult,
      aiResult: outcome.ok ? outcome.result : null,
      warnings: outcome.ok ? [] : [outcome.error || "AI unavailable"],
      tokensUsed: outcome.tokensUsed || {},
      latencyMs: outcome.latencyMs || 0,
      costCents: outcome.costCents || 0,
      actorEmail: ctx.adminEmail || "",
      organizationId: orgId,
    });
    writeStore(store);
    jsonResponse(response, outcome.ok ? 200 : 200, { ok: true, run, aiSucceeded: outcome.ok, aiError: outcome.ok ? "" : outcome.error });
  }

  async function handleRateRun(request, response, ctx, runId) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const run = aiModel.rateRun(store, { runId, rating: body.rating, correctedExpectedResponse: body.correctedExpectedResponse ?? null });
    if (!run) return deny(response, 404, { error: "Run not found." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, run });
  }

  async function handleListPromptVersions(request, response, ctx, workflowType) {
    const store = readStore();
    aiService.resolvePromptText(store, workflowType); // ensure a default v1 exists
    const versions = aiModel.listPromptVersions(store, workflowType);
    writeStore(store);
    jsonResponse(response, 200, { ok: true, versions });
  }

  async function handleSavePromptVersion(request, response, ctx, workflowType) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    if (!body.text || !String(body.text).trim()) return deny(response, 400, { error: "Prompt text is required." });
    const record = aiModel.savePromptVersion(store, {
      workflowType, text: body.text, schemaName: workflowType, createdBy: ctx.adminEmail || "admin",
    });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, version: record });
  }

  async function handleRollbackPromptVersion(request, response, ctx, workflowType) {
    const store = readStore();
    const body = await readJson(request).catch(() => ({}));
    const record = aiModel.rollbackPromptVersion(store, { workflowType, versionId: body.versionId });
    if (!record) return deny(response, 404, { error: "Prompt version not found." });
    writeStore(store);
    jsonResponse(response, 200, { ok: true, version: record });
  }

  function matchRoute(method, pathname) {
    const path = String(pathname || "");
    if (!path.startsWith(BASE)) return null;
    if (method === "GET" && path === `${BASE}/status`) return (req, res, ctx) => handleStatus(req, res, ctx);
    if (method === "GET" && path === `${BASE}/admin/usage`) return (req, res, ctx) => handleAdminUsage(req, res, ctx);
    if (method === "POST" && path === `${BASE}/classroom-assistant/interpret`) return (req, res, ctx) => handleInterpretClassroomAssistant(req, res, ctx);
    if (method === "POST" && path === `${BASE}/draft`) return (req, res, ctx) => handleProfessionalDraft(req, res, ctx);
    if (method === "POST" && path === `${BASE}/lesson-plan/assist`) return (req, res, ctx) => handleLessonPlanAssist(req, res, ctx);
    if (method === "POST" && path === `${BASE}/form-builder/draft`) return (req, res, ctx) => handleFormBuilderDraft(req, res, ctx);
    if (method === "POST" && path === `${BASE}/feedback`) return (req, res, ctx) => handleFeedback(req, res, ctx);
    if (method === "GET" && path === `${BASE}/scenarios`) return (req, res, ctx) => handleListScenarios(req, res, ctx);
    const runMatch = path.match(/^\/api\/ai-testing\/scenarios\/([^/]+)\/run$/);
    if (method === "POST" && runMatch) return (req, res, ctx) => handleRunScenario(req, res, ctx, runMatch[1]);
    const rateMatch = path.match(/^\/api\/ai-testing\/runs\/([^/]+)\/rate$/);
    if (method === "POST" && rateMatch) return (req, res, ctx) => handleRateRun(req, res, ctx, rateMatch[1]);
    const promptsListMatch = path.match(/^\/api\/ai-testing\/prompts\/([^/]+)\/versions$/);
    if (method === "GET" && promptsListMatch) return (req, res, ctx) => handleListPromptVersions(req, res, ctx, promptsListMatch[1]);
    if (method === "POST" && promptsListMatch) return (req, res, ctx) => handleSavePromptVersion(req, res, ctx, promptsListMatch[1]);
    const rollbackMatch = path.match(/^\/api\/ai-testing\/prompts\/([^/]+)\/rollback$/);
    if (method === "POST" && rollbackMatch) return (req, res, ctx) => handleRollbackPromptVersion(req, res, ctx, rollbackMatch[1]);
    return null;
  }

  return { matchRoute, BASE };
}

module.exports = {
  createAiTestingApi,
  BASE,
};
