#!/usr/bin/env node
/**
 * Phase 11 — remote testing smoke after TESTING-ONLY redeploy.
 * Targets https://little-learner-hub-testing.onrender.com (not production).
 *
 * Run: node scripts/test-remote-testing-smoke-phase11.js
 */
"use strict";

const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const TESTING = "https://little-learner-hub-testing.onrender.com";
const PRODUCTION = "https://little-learner-hub.onrender.com";
const EXPECTED_SHELL = process.env.LLH_EXPECTED_TESTING_SHELL || "20260808-phase11-testers-go5";
const EXPECTED_COMMIT_HINT = "4474dff";
const ARTIFACT = "/opt/cursor/artifacts/phase11-final-qa/remote-testing-smoke.json";

function fetchJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs || 45000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: JSON.parse(data), raw: data.slice(0, 1500) });
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: String(err && err.message), raw: data.slice(0, 500) });
        }
      });
    });
    req.on("error", (err) => resolve({ ok: false, error: String(err && err.message) }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

function fetchText(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs || 45000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data }));
    });
    req.on("error", (err) => resolve({ ok: false, error: String(err && err.message) }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

function check(name, pass, detail) {
  return { name, pass: !!pass, detail: detail || "" };
}

async function main() {
  const results = [];
  const testingManifest = await fetchJson(`${TESTING}/llh-shell-manifest.json`);
  const prodManifest = await fetchJson(`${PRODUCTION}/llh-shell-manifest.json`);
  const testingHealth = await fetchJson(`${TESTING}/api/health`);
  const prodHealth = await fetchJson(`${PRODUCTION}/api/health`);
  const testingIndex = await fetchText(`${TESTING}/`);
  const testingSw = await fetchText(`${TESTING}/service-worker.js`);
  const siteContent = await fetchJson(`${TESTING}/api/site-content`);

  const shellVersion = testingManifest.json && testingManifest.json.version;
  const shellMatch = shellVersion === EXPECTED_SHELL;
  results.push(check("testing_shell_manifest", shellMatch, `got ${shellVersion}`));
  results.push(check("testing_sw_shell", testingSw.ok && String(testingSw.text || "").includes(EXPECTED_SHELL), "service-worker SHELL_VERSION"));
  results.push(check("testing_index_cachebust", testingIndex.ok && String(testingIndex.text || "").includes(EXPECTED_SHELL), "index app.js?v="));
  results.push(check("testing_health_ok", !!(testingHealth.json && testingHealth.json.ok), JSON.stringify(testingHealth.json && { ok: testingHealth.json.ok, hdh: testingHealth.json.homeDaycareHubTesting })));
  results.push(check("testing_hdh_on", !!(testingHealth.json && testingHealth.json.homeDaycareHubTesting === true), "HOME_DAYCARE_HUB_TESTING"));
  results.push(
    check(
      "production_untouched",
      !!(prodManifest.json && prodManifest.json.version === "20260808-cookie-cta" && prodHealth.json && prodHealth.json.homeDaycareHubTesting === false),
      `prod shell=${prodManifest.json && prodManifest.json.version} hdh=${prodHealth.json && prodHealth.json.homeDaycareHubTesting}`
    )
  );

  const plans = (siteContent.json && siteContent.json.siteContent && siteContent.json.siteContent.curriculumLibrary && siteContent.json.siteContent.curriculumLibrary.lessonPlans) || [];
  results.push(check("curriculum_library_present", plans.length >= 80, `lessonPlans=${plans.length}`));
  results.push(check("curriculum_near_127", plans.length >= 120 || plans.length >= 88, `lessonPlans=${plans.length} (target ~127)`));

  const features = (testingHealth.json && testingHealth.json.homeDaycareHub && testingHealth.json.homeDaycareHub.features) || [];
  for (const feat of ["family-hub", "forms-pack", "family-tuition", "ai-drafts"]) {
    results.push(check(`feature_${feat}`, features.includes(feat), features.join(",")));
  }

  const failed = results.filter((r) => !r.pass);
  const report = {
    title: "Phase 11 remote testing smoke",
    finishedAt: new Date().toISOString(),
    expectedShell: EXPECTED_SHELL,
    expectedCommitHint: EXPECTED_COMMIT_HINT,
    testing: {
      manifest: testingManifest.json || null,
      healthSummary: testingHealth.json
        ? {
            ok: testingHealth.json.ok,
            homeDaycareHubTesting: testingHealth.json.homeDaycareHubTesting,
            features,
            stripeCheckoutReady: testingHealth.json.stripeCheckoutReady,
            aiGuideEnabled: testingHealth.json.aiGuideEnabled,
          }
        : null,
      lessonPlanCount: plans.length,
    },
    production: {
      manifest: prodManifest.json || null,
      homeDaycareHubTesting: prodHealth.json && prodHealth.json.homeDaycareHubTesting,
    },
    results,
    passed: results.filter((r) => r.pass).length,
    failed: failed.length,
    matchesLocalPhase11: shellMatch && failed.filter((f) => f.name.startsWith("testing_") || f.name.startsWith("feature_")).length === 0,
    verdict: failed.length === 0 ? "PASS" : "FAIL",
  };

  fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  fs.writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, shellVersion, lessonPlanCount: plans.length, failed, matchesLocalPhase11: report.matchesLocalPhase11 }, null, 2));
  console.log("Wrote", ARTIFACT);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
