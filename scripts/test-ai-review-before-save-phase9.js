#!/usr/bin/env node
/**
 * Phase 9 — AI review-before-save (testing spine, no production).
 * Asserts AI never auto-saves/shares/publishes/charges; review gates present.
 *
 * Run: npm run test:ai-review-before-save-phase9
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const aiReview = require("../server/ai-review-lib.js");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function sourceMarkers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const aiGuideJs = fs.readFileSync(path.join(ROOT, "server", "ai-guide.js"), "utf8");
  const enrichmentAi = fs.existsSync(path.join(ROOT, "server", "enrichment-ai.js"))
    ? fs.readFileSync(path.join(ROOT, "server", "enrichment-ai.js"), "utf8")
    : "";
  const assistantJs = fs.existsSync(path.join(ROOT, "scripts", "teaching-kit-ai-teacher-assistant.js"))
    ? fs.readFileSync(path.join(ROOT, "scripts", "teaching-kit-ai-teacher-assistant.js"), "utf8")
    : "";

  // Core invariant helpers
  assert.equal(aiReview.INVARIANT.autoPublishForbidden, true);
  assert.equal(aiReview.INVARIANT.productionReadOnly, true);
  assert.throws(() => aiReview.assertProposalOnly({ autoPublished: true }));
  assert.throws(() => aiReview.assertProposalOnly({ action: "charge" }));
  assert.equal(aiReview.canPersistAiProposal({ outputText: "x", reviewAcknowledged: true }), true);
  assert.equal(aiReview.canPersistAiProposal({ outputText: "x" }), false);

  // AI Guide gold standard
  assert.match(appJs, /id="aiGuideReviewAck"/);
  assert.match(appJs, /Check the review box before saving/);
  assert.match(appJs, /Nothing is sent, published, signed, or filed automatically/);
  assert.match(aiGuideJs, /acknowledgeReview|reviewAcknowledged/);

  // Doc Helpers
  assert.match(indexHtml, /id="docHelperReviewAck"/);
  assert.match(indexHtml, /id="docHelperShareFamily"/);
  assert.match(indexHtml, /data-ai-review-before-save="true"/);
  assert.match(appJs, /Check “I reviewed this AI-generated draft” before saving|Check .I reviewed this AI-generated draft. before saving/);
  // Must NOT force share for daily-log / parent-message
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf('const docHelperSaveBtn = event.target.closest("#docHelperSaveBtn")'), appJs.indexOf('const docHelperSaveBtn = event.target.closest("#docHelperSaveBtn")') + 4500),
    /\["daily-log", "parent-message"\]\.includes\(docType\)/,
  );

  // HDH form AI
  assert.match(appJs, /id="hdhAiReviewAck"/);
  assert.match(appJs, /function saveHomeDaycareAiFormDraftToChild/);
  {
    const saveFn = appJs.slice(
      appJs.indexOf("function saveHomeDaycareAiFormDraftToChild"),
      appJs.indexOf("function saveHomeDaycareAiFormDraftToChild") + 2200,
    );
    assert.match(saveFn, /hdhAiReviewAck/);
    assert.match(saveFn, /shareWithFamily:\s*false/);
    assert.doesNotMatch(saveFn, /shareWithFamily:\s*true/);
  }

  // Daily Logs end-of-day — generate stages review; no auto share strings
  assert.match(appJs, /function generateDailyReportDraftFromChild/);
  assert.match(appJs, /function saveReviewedAiChildRecord/);
  assert.match(appJs, /data-dlc-ai-review-save/);
  assert.match(appJs, /data-dlc-ai-review-ack/);
  assert.match(appJs, /dlcAiReviewState/);
  assert.doesNotMatch(appJs, /Daily report saved and shared with Family Hub/);
  assert.doesNotMatch(appJs, /Weekly summary saved and shared with Family Hub/);
  assert.doesNotMatch(appJs, /Parent message saved and shared with Family Hub/);

  // End-day handler must not appendChildRecord before review (within the end-day block)
  {
    const start = appJs.indexOf('const dlcEndDayAi = event.target.closest("[data-dlc-end-day-ai]")');
    const end = appJs.indexOf("const dlcAiReviewSave", start);
    assert.ok(start > 0 && end > start, "end-day AI handler block not found");
    const block = appJs.slice(start, end);
    assert.doesNotMatch(block, /appendChildRecord\(/);
    assert.match(block, /dlcAiReviewState\s*=/);
  }

  // Goals / support plans are proposals
  {
    const goalFn = appJs.slice(
      appJs.indexOf("function maybeSuggestGoalFromObservation"),
      appJs.indexOf("function maybeSuggestGoalFromObservation") + 1800,
    );
    assert.doesNotMatch(goalFn, /appendChildRecord\("Goals"/);
    assert.match(goalFn, /__llhAiPendingSuggestions/);
    assert.match(appJs, /function acceptAiPendingSuggestion/);
  }

  // Teaching Kit / enrichment never auto-publish
  if (assistantJs) {
    assert.match(assistantJs, /autoPublished:\s*false/);
    assert.match(assistantJs, /autoSaved:\s*false/);
  }
  if (enrichmentAi) {
    assert.doesNotMatch(enrichmentAi, /autoPublished:\s*true/);
  }

  // Server generate is text-only route (still present)
  assert.match(serverJs, /\/api\/ai-generate/);
  assert.doesNotMatch(serverJs, /ai-generate.*publish_enrichment|handleAiGenerate[\s\S]{0,400}publish_enrichment/);

  // No AI → Stripe/tuition charge coupling in review lib
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "server", "ai-review-lib.js"), "utf8"), /stripe\.charges|tuitionPayments/);

  // Mobile / CSS markers
  assert.match(stylesCss, /data-ai-review-before-save|dlc-ai-review-panel|doc-helper-review-gates/);

  // Forms / FH / Billing spines not rewritten by Phase 9
  assert.doesNotMatch(appJs, /llhAiChildRoster|parallelAiFamilyRoster/);

  pass("source_markers_phase9");
}

function unitInvariants() {
  const proposal = aiReview.publicAiProposal({
    proposalId: "p1",
    tool: "daily",
    outputText: "Hello family",
  });
  assert.equal(proposal.autoPublished, false);
  assert.equal(proposal.autoSaved, false);
  assert.equal(proposal.autoShared, false);
  assert.equal(aiReview.canPersistAiProposal(proposal), false);
  assert.equal(aiReview.canPersistAiProposal({ ...proposal, reviewAcknowledgedAt: new Date().toISOString() }), true);
  assert.equal(aiReview.assertProposalOnly({ action: "generate" }), true);
  pass("unit_invariants_phase9");
}

function main() {
  try { sourceMarkers(); } catch (error) { fail("source_markers_phase9", error); }
  try { unitInvariants(); } catch (error) { fail("unit_invariants_phase9", error); }
  if (process.exitCode) {
    console.error("\nPhase 9 AI review-before-save tests FAILED");
    process.exit(process.exitCode);
  }
  console.log("\nAll Phase 9 AI review-before-save tests PASSED");
}

main();
