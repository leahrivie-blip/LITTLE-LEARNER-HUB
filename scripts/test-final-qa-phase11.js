#!/usr/bin/env node
/**
 * Phase 11 — Final QA / Production Readiness orchestrator.
 * Runs local HDH testing-spine regression (Phases 2–10 + print/security) and
 * records live vs testing remote version probes (read-only).
 *
 * Does NOT deploy production. Does NOT enable EARLY_USER_PRICING permanently.
 * Run: HOME_DAYCARE_HUB_TESTING=1 NODE_ENV=test node scripts/test-final-qa-phase11.js
 */
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/phase11-final-qa";
const ARTIFACT = path.join(ARTIFACT_DIR, "final-qa-results.json");
const EXPECTED_LOCAL_SHELL = "20260808-phase11-final-qa";
const PROD_SERVICE_ID = "srv-d8o3f3r6sc1c73comlc0";

const SUITES = [
  { id: "syntax-check", npm: "check", critical: true, area: "Stability" },
  { id: "owner-admin-phase2", npm: "test:owner-testing-admin-phase2", critical: true, area: "Owner Admin" },
  { id: "canonical-data-phase4", npm: "test:canonical-data-phase4", critical: true, area: "Data & Security" },
  { id: "canonical-fixtures-phase4", npm: "test:canonical-fixtures-phase4", critical: true, area: "Data & Security" },
  { id: "daily-operations-phase5", npm: "test:daily-operations-phase5", critical: true, area: "Daily Operations" },
  { id: "daily-operations-mobile-phase5", npm: "test:daily-operations-mobile-phase5", critical: true, area: "Mobile" },
  { id: "family-hub-phase6", npm: "test:family-hub-phase6", critical: true, area: "Family Hub" },
  { id: "forms-phase7", npm: "test:forms-phase7", critical: true, area: "Forms" },
  { id: "tuition-phase8", npm: "test:tuition-phase8", critical: true, area: "Tuition Billing" },
  { id: "ai-review-before-save-phase9", npm: "test:ai-review-before-save-phase9", critical: true, area: "AI" },
  { id: "live-testing-feature-sync-phase10", npm: "test:live-testing-feature-sync-phase10", critical: true, area: "Feature Sync" },
  { id: "account-access", npm: "test:account-access", critical: true, area: "Account & Access" },
  { id: "login-logout-session", npm: "test:login-logout-session-audit", critical: true, area: "Account & Access" },
  { id: "curriculum-access-security", npm: "test:curriculum-access-security", critical: true, area: "Curriculum" },
  { id: "lesson-print-qa", npm: "test:lesson-print-qa", critical: true, area: "Print/Download" },
  { id: "teaching-kit-print-system", script: "scripts/test-teaching-kit-print-system.js", critical: true, area: "Print/Download" },
  { id: "teaching-kit-real-print-validation", script: "scripts/test-teaching-kit-real-print-validation.js", critical: true, area: "Print/Download" },
  { id: "curriculum-viewer-print", npm: "test:curriculum-viewer-print", critical: false, area: "Print/Download" },
  { id: "messaging-foundation", script: "scripts/test-messaging-foundation.js", critical: true, area: "Messaging" },
  { id: "messaging-regression", script: "scripts/test-messaging-regression.js", critical: true, area: "Messaging" },
  { id: "permissions-privacy", script: "scripts/test-permissions-privacy-phase3.js", critical: true, area: "Data & Security" },
  { id: "render-env-safety", npm: "test:render-env-safety", critical: true, area: "Production Safety" },
];

function fetchJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { timeout: timeoutMs || 20000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: JSON.parse(data), raw: data.slice(0, 2000) });
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

function runSuite(suite) {
  const started = Date.now();
  let proc;
  if (suite.npm) {
    proc = spawnSync("npm", ["run", suite.npm], {
      cwd: ROOT,
      env: { ...process.env, HOME_DAYCARE_HUB_TESTING: "1", NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 420000,
    });
  } else {
    proc = spawnSync(process.execPath, [path.join(ROOT, suite.script)], {
      cwd: ROOT,
      env: { ...process.env, HOME_DAYCARE_HUB_TESTING: "1", NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 420000,
    });
  }
  return {
    id: suite.id,
    area: suite.area,
    critical: suite.critical !== false,
    ok: proc.status === 0,
    status: proc.status,
    ms: Date.now() - started,
    stdoutTail: String(proc.stdout || "").slice(-1200),
    stderrTail: String(proc.stderr || "").slice(-1200),
  };
}

function inspectLocalShellMarkers() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "llh-shell-manifest.json"), "utf8"));
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const checks = {
    manifestVersion: manifest.version,
    manifestMatchesExpected: manifest.version === EXPECTED_LOCAL_SHELL,
    swHasVersion: sw.includes(EXPECTED_LOCAL_SHELL),
    indexHasVersion: indexHtml.includes(EXPECTED_LOCAL_SHELL),
    indexCacheBust: /app\.js\?v=20260808-phase11-final-qa/.test(indexHtml),
  };
  checks.ok = checks.manifestMatchesExpected && checks.swHasVersion && checks.indexHasVersion && checks.indexCacheBust;
  return checks;
}

function inspectPrintHtmlForVisualDefects() {
  const Print = require(path.join(ROOT, "scripts/teaching-kit-print.js"));
  const Present = require(path.join(ROOT, "scripts/teaching-kit-present.js"));
  const defects = [];
  const kit = {
    id: "tk-phase11-qa",
    title: "Phase 11 Print Visual QA Kit",
    theme: "Apples",
    ageGroup: "Toddler",
    weekOf: "2026-08-03",
    activities: [
      {
        id: "act-1",
        title: "Apple Taste Test",
        domain: "Science",
        materials: ["Apples", "Cutting board"],
        steps: ["Wash apples", "Offer tastes", "Talk about sweet vs tart"],
        tips: ["Watch for allergies"],
      },
      {
        id: "act-2",
        title: "Apple Song Circle",
        domain: "Music",
        materials: ["Song card"],
        steps: ["Sing once", "Add motions", "Invite children to lead"],
      },
    ],
    songs: [{ id: "song-1", title: "Way Up High in the Apple Tree", lyrics: "Way up high in the apple tree..." }],
    books: [{ id: "book-1", title: "Ten Apples Up On Top" }],
    printables: [{ id: "print-1", title: "Apple Sorting Mat", type: "printable" }],
    materials: ["Apples", "Basket", "Song card"],
  };
  const plan = {
    id: "lp-phase11-qa",
    title: "Apple Week",
    theme: "Apples",
    ageGroup: "Toddler",
    days: [
      { day: "Monday", focus: "Taste", activities: ["Apple Taste Test"] },
      { day: "Tuesday", focus: "Song", activities: ["Apple Song Circle"] },
    ],
  };

  const binder = Print.buildEntireBinderKitHtml(kit, { plan, paperSize: "letter" });
  const html = String(binder.html || "");
  const checks = [
    { id: "has-title", pass: /Phase 11 Print Visual QA Kit|Apple Week/i.test(html), detail: "kit/plan title present" },
    { id: "no-raw-field-keys", pass: !/\b(activityId|lessonPlanId|__proto__|undefined)\b/.test(html), detail: "no raw field names / undefined" },
    { id: "no-modal-chrome", pass: !/data-modal|class="modal"|aria-modal="true"/i.test(html), detail: "no browser/modal chrome" },
    { id: "has-activity", pass: /Apple Taste Test/i.test(html), detail: "activity content present" },
    { id: "has-song", pass: /Apple Tree|Apple Song/i.test(html), detail: "song content present" },
    { id: "not-empty", pass: html.replace(/<[^>]+>/g, " ").trim().length > 400, detail: "substantial text content" },
    { id: "friendly-preset", pass: Present.presentLabel("week_binder") === "Entire Binder Kit", detail: "preset label friendly" },
  ];
  for (const c of checks) {
    if (!c.pass) defects.push(c);
  }
  return { ok: defects.length === 0, checks, defects, htmlLength: html.length };
}

async function probeRemotes() {
  const liveManifest = await fetchJson("https://little-learner-hub.onrender.com/llh-shell-manifest.json");
  const testManifest = await fetchJson("https://little-learner-hub-testing.onrender.com/llh-shell-manifest.json");
  const liveHealth = await fetchJson("https://little-learner-hub.onrender.com/api/health");
  const testHealth = await fetchJson("https://little-learner-hub-testing.onrender.com/api/health");
  const testingStale =
    !testManifest.json ||
    String(testManifest.json.version || "").includes("20260805") ||
    testManifest.json.version !== EXPECTED_LOCAL_SHELL;
  return {
    live: {
      manifest: liveManifest.json || null,
      healthSummary: liveHealth.json
        ? {
            ok: liveHealth.json.ok,
            homeDaycareHubTesting: liveHealth.json.homeDaycareHubTesting,
            stripeCheckoutReady: liveHealth.json.stripeCheckoutReady,
            aiGuideEnabled: liveHealth.json.aiGuideEnabled,
            foundingSoldOut: liveHealth.json.founding && liveHealth.json.founding.soldOut,
          }
        : null,
      error: liveManifest.error || liveHealth.error || null,
    },
    testing: {
      manifest: testManifest.json || null,
      healthSummary: testHealth.json
        ? {
            ok: testHealth.json.ok,
            homeDaycareHubTesting: testHealth.json.homeDaycareHubTesting,
            stripeCheckoutReady: testHealth.json.stripeCheckoutReady,
            features: (testHealth.json.homeDaycareHub && testHealth.json.homeDaycareHub.features) || [],
            aiGuideEnabled: testHealth.json.aiGuideEnabled,
          }
        : null,
      error: testManifest.error || testHealth.error || null,
      staleVsPhase11: testingStale,
    },
    productionServiceIdInInventory: PROD_SERVICE_ID,
    note:
      "Remote probes are read-only. Testing redeploy requires RENDER_API_KEY + RENDER_TESTING_SERVICE_ID (not production srv id).",
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const localShell = inspectLocalShellMarkers();
  const printVisual = inspectPrintHtmlForVisualDefects();
  const remotes = await probeRemotes();

  console.log("Phase 11 Final QA — local shell:", localShell.manifestVersion, localShell.ok ? "OK" : "FAIL");
  console.log("Print visual HTML inspection:", printVisual.ok ? "PASS" : "FAIL", printVisual.defects);
  console.log(
    "Remote testing version:",
    remotes.testing.manifest && remotes.testing.manifest.version,
    remotes.testing.staleVsPhase11 ? "STALE" : "CURRENT"
  );
  console.log(
    "Remote production version:",
    remotes.live.manifest && remotes.live.manifest.version,
    "HDH testing:",
    remotes.live.healthSummary && remotes.live.healthSummary.homeDaycareHubTesting
  );

  const results = [];
  let criticalFailed = 0;
  for (const suite of SUITES) {
    console.log(`\n=== ${suite.id} (${suite.area}) ===`);
    const entry = runSuite(suite);
    results.push(entry);
    if (!entry.ok && entry.critical) criticalFailed += 1;
    console.log(entry.ok ? `PASS ${suite.id} (${entry.ms}ms)` : `${entry.critical ? "FAIL" : "SOFT-FAIL"} ${suite.id}`);
    if (!entry.ok) {
      if (entry.stderrTail) console.error(entry.stderrTail);
      else if (entry.stdoutTail) console.error(entry.stdoutTail);
    }
  }

  const areaRollup = {};
  for (const r of results) {
    if (!areaRollup[r.area]) areaRollup[r.area] = { pass: 0, fail: 0, soft: [] };
    areaRollup[r.area][r.ok ? "pass" : "fail"] += 1;
    areaRollup[r.area].tests.push({ id: r.id, ok: r.ok, critical: r.critical, ms: r.ms });
  }

  const report = {
    title: "Phase 11 Final QA / Production Readiness",
    finishedAt: new Date().toISOString(),
    expectedLocalShell: EXPECTED_LOCAL_SHELL,
    localShell,
    printVisual,
    remotes,
    deployCredentialsPresent: {
      RENDER_API_KEY: Boolean(process.env.RENDER_API_KEY),
      RENDER_TESTING_SERVICE_ID: Boolean(process.env.RENDER_TESTING_SERVICE_ID),
      note: "Absent → cannot redeploy testing from this agent; local QA used instead.",
    },
    safety: {
      productionDeployAttempted: false,
      productionEnvWriteAttempted: false,
      earlyUserPricingPermanentlyEnabled: false,
      realCharges: false,
    },
    totals: {
      suites: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      criticalFailed,
    },
    areaRollup,
    results,
    releaseBlocking: [],
  };

  if (!localShell.ok) report.releaseBlocking.push("Local shell version markers incomplete");
  if (!printVisual.ok) report.releaseBlocking.push("Print HTML visual inspection failed");
  if (criticalFailed > 0) report.releaseBlocking.push(`${criticalFailed} critical automated suite(s) failed`);
  if (remotes.testing.staleVsPhase11) {
    report.releaseBlocking.push(
      "Remote testing Render deploy is stale vs Phase 11 shell (redeploy testing only before claiming remote Final QA complete)"
    );
  }

  report.verdict =
    report.releaseBlocking.length === 0
      ? "PASS — ready for owner written production deploy approval (still do not deploy)"
      : "NOT COMPLETE — release-blocking items remain (see releaseBlocking)";

  fs.writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log("\n=== Phase 11 Final QA summary ===");
  console.log(JSON.stringify({ totals: report.totals, verdict: report.verdict, releaseBlocking: report.releaseBlocking }, null, 2));
  console.log("Wrote", ARTIFACT);
  process.exit(report.releaseBlocking.filter((x) => !String(x).includes("Remote testing")).length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
