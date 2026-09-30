#!/usr/bin/env node
/**
 * Admin UI — Free Activation Funnel section (read-only display).
 * Run: npm run test:free-activation-funnel-admin-ui
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const insights = require("../server/admin-insights.js");

const ROOT = path.join(__dirname, "..");

function loadAdminInsightsUi() {
  const src = fs.readFileSync(path.join(ROOT, "admin-insights.js"), "utf8");
  const fetchLog = [];
  const context = {
    window: {},
    document: {},
    URLSearchParams,
    Date,
    fetch: async (url) => {
      fetchLog.push(String(url));
      return {
        ok: true,
        json: async () => ({ insights: { hub: "marketing-funnel", data: {} } }),
      };
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
  };
  vm.createContext(context);
  vm.runInContext(src, context);
  const api = context.window.AdminInsights;
  api._fetchLog = fetchLog;
  return api;
}

const EXPECTED_STAGE_KEYS = insights.FREE_ACTIVATION_FUNNEL_STAGE_DEFS.map((d) => d.id);

function buildFunnelForCohort(cohort) {
  const store = { users: {}, analyticsEvents: [], settings: {} };
  const payload = insights.buildInsights(store, {
    hub: "marketing-funnel",
    range: "7d",
    cohort,
  });
  return payload.data.freeActivationFunnel;
}

function testStageDisplayHelpers() {
  const ui = loadAdminInsightsUi();
  const unavailable = ui.activationFunnelStageDisplay({
    key: "exploreLessonPlansClicked",
    label: "Explore Lesson Plans clicked",
    count: null,
    dataAvailable: false,
    cohortContextOnly: false,
  });
  assert.equal(unavailable.users, "Unavailable");
  assert.equal(unavailable.stepConversion, "Unavailable");
  assert.notEqual(unavailable.users, "0");

  const contextOnly = ui.activationFunnelStageDisplay({
    key: "homepageVisitors",
    label: "Homepage visitors",
    count: 12,
    dataAvailable: true,
    cohortContextOnly: true,
    conversionFromPreviousPct: null,
    overallConversionPct: null,
  });
  assert.equal(contextOnly.users, "12");
  assert.equal(contextOnly.stepConversion, "Context only");
  assert.equal(contextOnly.overallConversion, "Context only");

  const measurable = ui.activationFunnelStageDisplay({
    key: "accountCreated",
    label: "Account created",
    count: 5,
    dataAvailable: true,
    cohortContextOnly: false,
    conversionFromPreviousPct: 50,
    overallConversionPct: 25,
  });
  assert.equal(measurable.stepConversion, "50%");
  assert.equal(measurable.overallConversion, "25%");

  const unavailableButZero = ui.activationFunnelStageDisplay({
    key: "exploreLessonPlansClicked",
    label: "Explore",
    count: 0,
    dataAvailable: false,
  });
  assert.equal(unavailableButZero.users, "Unavailable");
  assert.equal(unavailableButZero.stepConversion, "Unavailable");
  console.log("PASS activationFunnelStageDisplay helpers");
}

async function testFetchCohortQueryString() {
  const ui = loadAdminInsightsUi();
  await ui.fetchInsights({ hub: "marketing-funnel", cohort: "pre_pr853" });
  assert.match(ui._fetchLog[0], /hub=marketing-funnel/);
  assert.match(ui._fetchLog[0], /cohort=pre_pr853/);
  await ui.fetchInsights({ hub: "marketing-funnel", cohort: "all" });
  assert.doesNotMatch(ui._fetchLog[1], /cohort=/);
  await ui.fetchInsights({ hub: "marketing-funnel", cohort: "post_pr853" });
  assert.match(ui._fetchLog[2], /cohort=post_pr853/);
  console.log("PASS cohort query param on fetchInsights");
}

function testStageOrderAndCount() {
  const ui = loadAdminInsightsUi();
  const funnel = buildFunnelForCohort("all");
  assert.equal(funnel.stages.length, EXPECTED_STAGE_KEYS.length);
  funnel.stages.forEach((stage, index) => {
    assert.equal(stage.key, EXPECTED_STAGE_KEYS[index], `stage order index ${index}`);
  });
  const html = ui.renderFreeActivationFunnel(funnel, { cohort: "all" });
  const rowMatches = html.match(/<tr><td>/g) || [];
  assert.equal(rowMatches.length, EXPECTED_STAGE_KEYS.length);
  console.log("PASS stage order and row count");
}

function testRenderFromApiPayload() {
  const ui = loadAdminInsightsUi();
  for (const cohort of ["all", "pre_pr853", "post_pr853"]) {
    const funnel = buildFunnelForCohort(cohort);
    assert.ok(funnel, `freeActivationFunnel missing for cohort ${cohort}`);
    const html = ui.renderFreeActivationFunnel(funnel, { cohort });
    assert.match(html, /Free Activation Funnel/);
    for (const key of EXPECTED_STAGE_KEYS) {
      const stage = funnel.stages.find((s) => s.key === key);
      assert.ok(stage, `backend stage ${key} for cohort ${cohort}`);
      assert.match(html, new RegExp(stage.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    if (cohort === "pre_pr853") {
      const explore = funnel.stages.find((s) => s.key === "exploreLessonPlansClicked");
      assert.equal(explore.dataAvailable, false);
      assert.equal(explore.count, null);
      const exploreUsersCell = html.match(
        /Explore Lesson Plans clicked \(Unavailable for this cohort\)<\/td><td>([^<]+)</,
      );
      assert.ok(exploreUsersCell, "explore row present");
      assert.equal(exploreUsersCell[1], "Unavailable");
    }
    if (cohort !== "all") {
      const home = funnel.stages.find((s) => s.key === "homepageVisitors");
      assert.equal(home.cohortContextOnly, true);
      assert.match(html, /Context only/);
    }
    assert.doesNotMatch(html, /@[a-z0-9.-]+\.[a-z]{2,}/i);
  }
  console.log("PASS renderFreeActivationFunnel for all cohorts");
}

function testMissingFunnelSafe() {
  const ui = loadAdminInsightsUi();
  const html = ui.renderFreeActivationFunnel(null);
  assert.match(html, /not available/);
  assert.doesNotMatch(html, /<td>0<\/td>/);
  console.log("PASS missing freeActivationFunnel does not crash render");
}

function testWiring() {
  const uiSrc = fs.readFileSync(path.join(ROOT, "admin-insights.js"), "utf8");
  assert.match(uiSrc, /renderFreeActivationFunnel/);
  assert.match(uiSrc, /insightsActivationCohort/);
  assert.match(uiSrc, /qs\.set\("cohort"/);
  assert.match(uiSrc, /freeActivationCohort/);
  assert.match(uiSrc, /admin-insights-free-activation-funnel/);
  console.log("PASS admin UI wiring strings");
}

async function main() {
  testStageDisplayHelpers();
  await testFetchCohortQueryString();
  testStageOrderAndCount();
  testRenderFromApiPayload();
  testMissingFunnelSafe();
  testWiring();
  console.log("\nAll free-activation-funnel admin UI checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
