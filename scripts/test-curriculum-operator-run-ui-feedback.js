#!/usr/bin/env node
/**
 * Run Job UI feedback helpers + duplicate-click guard expectations.
 * Run: npm run test:curriculum-operator-run-ui-feedback
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const uiPath = path.join(__dirname, "curriculum-operator-ui.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function loadUiTestHelpers() {
  const src = fs.readFileSync(uiPath, "utf8");
  const sandbox = { window: {}, globalThis: {} };
  vm.runInNewContext(src, sandbox, { filename: uiPath });
  return sandbox.window.LLHCurriculumOperatorUi.__test__;
}

console.log("A–D. Run Job status helpers");
{
  const t = loadUiTestHelpers();
  ok(t.runButtonLabel("starting") === "Starting…", "starting button label");
  ok(t.runButtonLabel("running") === "Running…", "running button label");
  ok(t.runButtonLabel("idle") === "Run job", "idle button label");
  ok(t.mapCurrentActionToLabel("image.inspect") === "Processing images…", "image phase label");
  ok(t.mapCurrentActionToLabel("printable.plan") === "Processing printables…", "printable phase label");
  ok(t.mapCurrentActionToLabel("lesson.validate") === "Finalizing…", "finalize label");
  ok(
    t.formatRunStatusFromJob({ status: "completed", lessonResults: [] })
      === "Job complete — open the lesson to review.",
    "completed status message",
  );
  ok(
    t.formatRunStatusFromJob({
      status: "running",
      progress: { currentAction: "lesson.updateFields" },
    }) === "Updating content…",
    "running job uses real currentAction",
  );
  ok(t.profileSummary({ version: 3, instructions: ["Use realistic photos.", "Keep the cover."] }).includes("Use realistic photos."),
    "remembered instruction summary uses saved profile");
  ok(t.profileSummary({ instructions: [] }).includes("No permanent"), "empty profile has honest summary");
}

console.log("\nE–I. UI source guards duplicate submission + running panel");
{
  const src = fs.readFileSync(uiPath, "utf8");
  ok(/runInFlight/.test(src), "runInFlight duplicate guard present");
  ok(/if \(state\.runInFlight\) return/.test(src), "onRun exits when already in flight");
  ok(/Starting curriculum job…/.test(src), "immediate starting message");
  ok(/Job started — working now/.test(src), "job-started message after poll");
  ok(/co-run-status/.test(src), "visible running status panel");
  ok(/aria-live="polite"/.test(src), "live region for screen readers / mobile");
  ok(/startRunPolling/.test(src), "poll loop while long run executes");
  ok(/!state\.runInFlight\) render/.test(src), "refreshJobs preserves running indicator");
  ok(/profile_get/.test(src), "profile loads through API");
  ok(/profile_save/.test(src), "profile save uses API");
  ok(/requestId: action === "parse"/.test(src), "parse requests include an idempotency request ID");
  ok(/Live research ready/.test(src) && /researchSources/.test(src), "research readiness and validated sources render in UI");
  ok(/permanent preferences are still remembered/.test(src), "start-over preserves profile copy");
  ok(/disabled" : ""\}>Run job/.test(src) === false, "run button disabled via runInFlight/busy");
}

console.log(`\nRun UI feedback tests passed ${passed} assertions`);
