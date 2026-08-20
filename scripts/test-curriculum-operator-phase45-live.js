#!/usr/bin/env node
/**
 * Optional Phase 4.5 printable content planner live/fixture smoke.
 * Skips unless LLH_OPERATOR_LIVE_PRINTABLES=1 (still uses fixture planner unless OpenAI is configured separately).
 */
"use strict";

const planner = require("./curriculum-operator-printable-planner.js");
const printablesApi = require("./curriculum-operator-printables.js");

async function main() {
  const enabled = ["1", "true", "yes"].includes(
    String(process.env.LLH_OPERATOR_LIVE_PRINTABLES || "").trim().toLowerCase(),
  );
  if (!enabled) {
    console.log("SKIP: set LLH_OPERATOR_LIVE_PRINTABLES=1 to run the Phase 4.5 printable content smoke test.");
    return;
  }

  const plan = {
    id: "cur-lp-phase45-live-fixture",
    title: "Weather Watchers",
    age: "Preschool 3–5",
    theme: "Weather",
  };
  const activity = {
    id: "cur-act-phase45-live-match",
    title: "Weather Clothing Match",
    objective: "Children match weather pictures to clothing cards.",
    materials: "Matching cards",
    steps: "Match each weather card to a clothing card.",
  };
  const baseSpec = {
    lessonId: plan.id,
    activityIds: [activity.id],
    decision: "CREATE",
    title: "Weather Clothing Match Cards",
    resourceType: "matching_cards",
    ageBand: plan.age,
    purpose: "Children match weather to clothing during small-group play.",
    teacherUse: "Print and cut pairs for the matching activity.",
    pageCount: 1,
    pages: [{ index: 1, label: "match", kind: "matching_cards" }],
    filename: "weather-clothing-match.pdf",
  };

  const planned = await planner.planPrintableContent({
    plan,
    activity,
    baseSpec,
    callAi: async (_s, user) => planner.buildOperatorPrintableAiFixtureResponse(user),
  });
  if (!planned.ok) throw new Error(planned.error || "planner failed");
  const generated = await printablesApi.generatePrintablePdfBuffer({
    spec: {
      ...planned.spec,
      filename: "weather-watchers-weather-clothing-match.pdf",
    },
    plan,
    activity,
  });
  const validated = await printablesApi.validateGeneratedPdf(generated.buffer, {
    expectedPageCount: generated.pageCount,
    fileName: generated.fileName,
  });
  if (!validated.ok) throw new Error(`validation failed: ${JSON.stringify(validated.failed)}`);
  console.log(`OK: Phase 4.5 enriched printable ${generated.fileName} · ${generated.pageCount} pages · pairs=${planned.spec.pages[0]?.pairs?.length || 0}`);
  console.log("Note: upload/link against production curriculum is intentionally not performed here.");
}

main().catch((error) => {
  console.error("Phase 4.5 live printable test FAILED:", error.message || error);
  process.exit(1);
});
