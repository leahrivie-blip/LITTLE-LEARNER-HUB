/**
 * Admin Workspace API — /api/admin/workspace/*
 * Plain-language aggregates for the redesigned Admin Home. Requires verified
 * Platform Admin Bearer token. Never exposes secrets or raw env values.
 */

const expansionFlags = require("../scripts/expansion-feature-flags.js");
const testingFeedbackModel = require("../scripts/testing-feedback-data-model.js");
const familyModel = require("../scripts/family-foundation-data-model.js");

const PRODUCTION_HOST = "littlelearnershubbyleah.com";

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
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
    env = expansionFlags.resolveExpansionEnvironment({ siteUrl, env: process.env });
  }
  const siteUrl = String(env.siteUrl || process.env.SITE_URL || "");
  const liveProduction = env.liveProduction === true || productionSiteFromUrl(siteUrl);
  return {
    ...env,
    liveProduction,
    allowTestingLabAdminPreview: env.allowTestingLabAdminPreview === true && !liveProduction,
    siteUrl,
  };
}

function statusLabel(state) {
  return ({
    working: "Working",
    attention: "Needs Attention",
    missing: "Not Configured",
    disabled: "Disabled for Testing",
  }[state] || state);
}

function createAdminWorkspaceApi({
  readStore,
  jsonResponse,
  expansionEnvironment,
  getGitSha,
  getBranchName,
  listRecentErrors,
}) {
  function env() {
    return resolveEnv(expansionEnvironment);
  }

  function testingLabGateDiagnostics(store) {
    const e = env();
    const stored = store?.siteContent?.featureFlags || {};
    const checks = [];
    if (e.liveProduction) {
      checks.push({
        key: "production_host",
        ok: false,
        label: "Testing Lab environment",
        detail: "This is the live production site. Testing Lab is never available here.",
        ownerAction: "Use the dedicated testing deployment on Render instead.",
        envVar: null,
      });
    } else {
      checks.push({
        key: "env_preview",
        ok: e.allowTestingLabAdminPreview,
        label: "Testing Lab environment setting",
        detail: e.allowTestingLabAdminPreview
          ? "ALLOW_TESTING_LAB_ADMIN_PREVIEW is enabled on this server."
          : "ALLOW_TESTING_LAB_ADMIN_PREVIEW is missing or off on this Render service.",
        ownerAction: e.allowTestingLabAdminPreview
          ? null
          : "In Render → your testing web service → Environment, add ALLOW_TESTING_LAB_ADMIN_PREVIEW=true and redeploy.",
        envVar: e.allowTestingLabAdminPreview ? null : "ALLOW_TESTING_LAB_ADMIN_PREVIEW",
      });
    }
    checks.push({
      key: "stored_flag",
      ok: stored.testingLab === true,
      label: "Testing Lab stored feature flag",
      detail: stored.testingLab === true
        ? "testingLab is ON in site content."
        : "testingLab is OFF in stored site content.",
      ownerAction: stored.testingLab === true
        ? null
        : "From Admin Home, tap Set Up Testing Site (or run onboard from Advanced Tools).",
      envVar: null,
    });
    checks.push({
      key: "admin_permission",
      ok: true,
      label: "Platform Admin permission",
      detail: "You unlocked Admin with a valid owner session.",
      ownerAction: null,
      envVar: null,
    });
    const allOk = checks.every((c) => c.ok);
    return { checks, allOk, ready: allOk };
  }

  function contentCounts(store) {
    const site = store.siteContent || {};
    const curriculum = site.curriculumLessonPlans || {};
    const lessonPlans = listValues(curriculum).filter((p) => p && p.status !== "deleted");
    const activities = listValues(site.activities || {}).filter((a) => a && !a.deleted);
    const forms = listValues(site.forms || site.formLibrary || {}).length;
    const printables = listValues(site.printables || {}).length;
    const announcements = listValues(site.announcements || site.whatsNew || {}).length;
    return {
      lessonPlans: lessonPlans.length,
      activities: activities.length,
      forms,
      printables,
      announcements,
      monthlyCurriculum: listValues(site.monthlyCurriculum || {}).length,
    };
  }

  async function handleHome(request, response) {
    let store;
    let databaseConnected = true;
    try {
      store = readStore();
    } catch {
      databaseConnected = false;
      store = { siteContent: {}, familyFoundation: {}, testingFeedback: {}, platformResilience: {}, testingHealth: {} };
    }
    const e = env();
    const flags = expansionFlags.publicExpansionFeatureFlagsPayload(store.siteContent?.featureFlags, {
      environment: e,
      isVerifiedAdmin: true,
    });
    const gate = testingLabGateDiagnostics(store);
    const health = store.testingHealth && typeof store.testingHealth === "object" ? store.testingHealth : {};
    const smoke = health.lastSmokeResult || null;
    const testerCount = listValues(store.familyFoundation?.fakeAccounts || {}).length;
    const sandboxCount = listValues(store.externalTesterSandbox?.accounts || store.familyFoundation?.sandboxAccounts || {}).length;
    let openFeedbackCount = 0;
    try {
      openFeedbackCount = testingFeedbackModel.listThreadsForAdmin(store, { status: "open" }).length
        + testingFeedbackModel.listThreadsForAdmin(store, { status: "in_progress" }).length;
    } catch { openFeedbackCount = 0; }
    let pendingFailedSaves = 0;
    try {
      pendingFailedSaves = listValues(store.platformResilience?.failedSaves || {}).filter((item) => item && !item.resolvedAt).length;
    } catch { pendingFailedSaves = 0; }
    const recentErrors = typeof listRecentErrors === "function" ? listRecentErrors().slice(0, 5) : [];
    const commit = typeof getGitSha === "function" ? getGitSha() : "";
    const counts = contentCounts(store);

    const testingDatabaseState = databaseConnected ? "working" : "attention";
    const testingLabState = gate.allOk ? "working" : "attention";
    const testerSetupState = gate.allOk && (testerCount > 0 || sandboxCount > 0) ? "working" : (gate.allOk ? "attention" : "attention");

    const attention = [];
    gate.checks.filter((c) => !c.ok).forEach((c) => {
      attention.push({
        title: c.label,
        detail: c.detail,
        ownerAction: c.ownerAction || "See System Health for details.",
        envVar: c.envVar || null,
        canContinueTesting: !e.liveProduction,
      });
    });
    if (!databaseConnected) {
      attention.push({
        title: "Database disconnected",
        detail: "The server could not read the data store.",
        ownerAction: "Check DATABASE_PROVIDER and TESTING_DATABASE_URL on Render, then redeploy.",
        envVar: "TESTING_DATABASE_URL",
        canContinueTesting: false,
      });
    }
    if (smoke && !smoke.ok) {
      attention.push({
        title: "Latest release tests failed",
        detail: `Smoke result at ${smoke.at || "unknown time"}.`,
        ownerAction: "Open System Health, then fix failing suites before inviting testers.",
        envVar: null,
        canContinueTesting: true,
      });
    }
    if (pendingFailedSaves > 0) {
      attention.push({
        title: "Unsynced testing records exist",
        detail: `${pendingFailedSaves} failed save(s) need review.`,
        ownerAction: "Open System Health → Failed syncs and retry or clear safely.",
        envVar: null,
        canContinueTesting: true,
      });
    }

    let nextAction = "preview";
    if (!gate.allOk) nextAction = "setup_testing_site";
    else if (sandboxCount === 0 && testerCount === 0) nextAction = "add_tester";
    else if (openFeedbackCount > 0) nextAction = "view_feedback";

    jsonResponse(response, 200, {
      ok: true,
      testingBanner: "Private Testing Environment — Fake Data Only",
      deployedCommit: commit,
      branch: typeof getBranchName === "function" ? getBranchName() : "",
      testingStatus: {
        testingDatabase: { state: testingDatabaseState, label: statusLabel(testingDatabaseState) },
        testingLab: { state: testingLabState, label: statusLabel(testingLabState) },
        testerSetup: { state: testerSetupState, label: testerSetupState === "working" ? "Ready" : "Needs Attention" },
        fakeAccountCount: testerCount + sandboxCount,
        openFeedbackCount,
        pendingFailedSaves,
        lastReleaseTest: smoke ? { ok: smoke.ok, at: smoke.at, passed: smoke.passed } : null,
      },
      testingLabGate: gate,
      contentCounts: counts,
      needsAttention: attention,
      nextAction,
      recentActivity: (health.recentActivity || []).slice(0, 8),
      openErrorCount: recentErrors.length,
    });
  }

  async function handleHealth(request, response) {
    let store;
    let databaseConnected = true;
    try {
      store = readStore();
    } catch {
      databaseConnected = false;
      store = { siteContent: {}, testingHealth: {}, platformResilience: {} };
    }
    const e = env();
    const gate = testingLabGateDiagnostics(store);
    const health = store.testingHealth && typeof store.testingHealth === "object" ? store.testingHealth : {};
    const smoke = health.lastSmokeResult || null;
    const recentErrors = typeof listRecentErrors === "function" ? listRecentErrors().slice(0, 8) : [];
    let pendingFailedSaves = 0;
    try {
      pendingFailedSaves = listValues(store.platformResilience?.failedSaves || {}).filter((item) => item && !item.resolvedAt).length;
    } catch { pendingFailedSaves = 0; }
    const commit = typeof getGitSha === "function" ? getGitSha() : "";

    const cards = [
      { key: "website", label: "Website", state: "working", detail: "Server is responding.", canContinue: true, ownerAction: null },
      {
        key: "database",
        label: "Database",
        state: databaseConnected ? "working" : "attention",
        detail: databaseConnected ? String(process.env.DATABASE_PROVIDER || "local-json") : "Not connected",
        canContinue: databaseConnected,
        ownerAction: databaseConnected ? null : "Check TESTING_DATABASE_URL on Render.",
      },
      { key: "admin_login", label: "Admin login", state: "working", detail: "Owner admin session verified.", canContinue: true, ownerAction: null },
      {
        key: "testing_lab",
        label: "Testing Lab",
        state: gate.allOk ? "working" : "attention",
        detail: gate.checks.find((c) => !c.ok)?.detail || "All gates satisfied.",
        canContinue: !e.liveProduction,
        ownerAction: gate.checks.find((c) => !c.ok)?.ownerAction || null,
        envVar: gate.checks.find((c) => !c.ok)?.envVar || null,
      },
      {
        key: "release_tests",
        label: "Release tests",
        state: !smoke ? "missing" : (smoke.ok ? "working" : "attention"),
        detail: smoke ? `${smoke.ok ? "Passed" : "Failed"} — ${smoke.at || ""}` : "No result recorded yet.",
        canContinue: true,
        ownerAction: smoke && !smoke.ok ? "Fix failing release gate suites before merge." : null,
      },
      {
        key: "deployment",
        label: "Latest deployment",
        state: commit ? "working" : "missing",
        detail: commit ? commit.slice(0, 12) : "Commit SHA not reported",
        canContinue: true,
        ownerAction: null,
      },
      {
        key: "failed_sync",
        label: "Daily Care synchronization",
        state: pendingFailedSaves ? "attention" : "working",
        detail: pendingFailedSaves ? `${pendingFailedSaves} pending failed save(s)` : "No failed sync queue items.",
        canContinue: true,
        ownerAction: pendingFailedSaves ? "Review failed saves in Advanced Tools." : null,
      },
      { key: "stripe", label: "Stripe", state: "disabled", detail: "Disabled for testing — no real charges.", canContinue: true, ownerAction: null },
      { key: "email_sms", label: "Email / SMS", state: "disabled", detail: "Disabled for testing — no real sends.", canContinue: true, ownerAction: null },
      { key: "openai", label: "OpenAI", state: "disabled", detail: "Disabled for testing — no AI calls.", canContinue: true, ownerAction: null },
    ];

    jsonResponse(response, 200, {
      ok: true,
      cards: cards.map((c) => ({ ...c, stateLabel: statusLabel(c.state) })),
      recentErrors,
      loadedAt: new Date().toISOString(),
    });
  }

  function matchRoute(method, pathname) {
    if (method === "GET" && pathname === "/api/admin/workspace/home") return handleHome;
    if (method === "GET" && pathname === "/api/admin/workspace/health") return handleHealth;
    return null;
  }

  return { matchRoute };
}

module.exports = { createAdminWorkspaceApi };
