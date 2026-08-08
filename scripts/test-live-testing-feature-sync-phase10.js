#!/usr/bin/env node
/**
 * Phase 10 — Live → Testing Feature Sync parity checks (codebase).
 * Asserts valuable live strengths exist on the testing architecture branch.
 * Does NOT call production write APIs.
 *
 * Run: npm run test:live-testing-feature-sync-phase10
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function sourceParity() {
  const appJs = read("app.js");
  const indexHtml = read("index.html");
  const stylesCss = read("styles.css");
  const hpCss = read("styles/llh-homepage.css");
  const serverJs = read("server/index.js");
  const policy = read("docs/audits/TESTING_IS_THE_FUTURE_POLICY.md");
  const audit = read("docs/audits/PHASE10_LIVE_TESTING_FEATURE_SYNC_AUDIT.md");
  const syncBrief = read("docs/audits/LIVE_TO_TESTING_FEATURE_SYNC_PHASE.md");

  assert.match(policy, /testing site.*future|TESTING IS THE FUTURE/i);
  assert.match(policy, /Production must remain completely unchanged|read-only/i);
  assert.match(syncBrief, /Production is read-only/i);
  assert.match(audit, /Phase 10/);
  assert.match(audit, /Early-user/);

  // Live strengths that testing deploy lagged — must exist in codebase
  assert.match(appJs, /function earlyUserPricingEnabled/);
  assert.match(appJs, /function earlyUserOfferHeadline/);
  assert.match(appJs, /function offeredProMonthlyAmount/);
  assert.match(appJs, /accountIsEarlyUser|membershipIsEarlyUser|early_user/);
  assert.match(serverJs, /earlyUserPricingAvailable/);
  assert.match(serverJs, /early_user/);
  assert.match(serverJs, /13\.99/);

  // Lesson covers (live strength)
  assert.match(appJs, /openAdminCurriculumQuickCoverModal|renderAdminCurriculumQuickCoverModal/);
  assert.match(appJs, /deriveAdminCoverQualityStatus|coverQualityStatusLabel/);

  // TK print / download
  assert.match(appJs, /buildLessonPlanDownloadText|printTeachingKit|binder/i);
  assert.match(stylesCss, /tk-print|\.tk-print/);

  // Homepage sticky CTA above cookie
  assert.match(hpCss, /z-index:\s*45/);
  assert.match(hpCss, /Sticky mobile CTA|cookie/i);

  // Phases 8–9 preserved on sync branch
  assert.ok(fs.existsSync(path.join(ROOT, "server/tuition-billing-lib.js")));
  assert.ok(fs.existsSync(path.join(ROOT, "server/ai-review-lib.js")));
  assert.match(appJs, /dlcAiReviewState|docHelperReviewAck|hdhAiReviewAck/);
  assert.match(appJs, /renderTuitionBillingPanel|family-hub\/tuition|tuitionBilling/);

  // Must NOT merge July lab / production command center as architecture
  assert.doesNotMatch(appJs, /foundationOrgRoster|julyTestingLabMerge|replaceOwnerAdminWithProdCommandCenter/);
  assert.match(audit, /Intentionally skipped/);
  assert.match(audit, /July Testing Lab|production admin/i);

  // Mobile markers
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(stylesCss, /safe-area-inset|data-tuition-mobile-ready|data-ai-review-before-save/);

  // Production read-only confirmation language in audit
  assert.match(audit, /Production confirmation|No Render env writes|HTTP GET only/i);

  pass("source_parity_live_strengths");
}

function unitDocs() {
  const tracker = read("docs/audits/MASTER_PROJECT_PROGRESS.md");
  assert.match(tracker, /Phase 10/);
  // Phase 10 complete stays true after Phase 11 starts; accept either end-of-10 or in-progress-11 tracker wording.
  assert.match(
    tracker,
    /91%|10 of 11|10\/11|~95%|Phase 11 in progress|Phase 10 complete|owner approved/i
  );
  assert.match(tracker, /Phase 11/i);
  assert.match(tracker, /written deploy approval|DO NOT deploy production|Do not deploy after Phase 10/i);
  pass("tracker_phase10");
}

function main() {
  try { sourceParity(); } catch (error) { fail("source_parity_live_strengths", error); }
  try { unitDocs(); } catch (error) { fail("tracker_phase10", error); }
  if (process.exitCode) {
    console.error("\nPhase 10 live→testing sync tests FAILED");
    process.exit(process.exitCode);
  }
  console.log("\nAll Phase 10 live→testing feature sync tests PASSED");
}

main();
