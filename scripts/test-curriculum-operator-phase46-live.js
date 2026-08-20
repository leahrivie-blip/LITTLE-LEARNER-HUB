#!/usr/bin/env node
/**
 * Optional Phase 4.6 visual-embed smoke (fixture PNG embeds; no production curriculum).
 * SKIP unless LLH_OPERATOR_LIVE_PRINTABLES=1.
 */
"use strict";

const planner = require("./curriculum-operator-printable-planner.js");
const visuals = require("./curriculum-operator-printable-visuals.js");
const printablesApi = require("./curriculum-operator-printables.js");

async function main() {
  const enabled = ["1", "true", "yes"].includes(
    String(process.env.LLH_OPERATOR_LIVE_PRINTABLES || "").trim().toLowerCase(),
  );
  if (!enabled) {
    console.log("SKIP: set LLH_OPERATOR_LIVE_PRINTABLES=1 to run the Phase 4.6 visual printable smoke test.");
    return;
  }

  const plan = { id: "cur-lp-p46-live", title: "Weather Watchers", age: "Preschool 3–5" };
  const activity = {
    id: "cur-act-p46-live",
    title: "Weather Clothing Match",
    objective: "Match weather to clothing.",
    steps: "Match cards.",
  };
  const planned = await planner.planPrintableContent({
    plan,
    activity,
    baseSpec: {
      lessonId: plan.id,
      activityIds: [activity.id],
      decision: "CREATE",
      title: "Weather Clothing Match Cards",
      resourceType: "matching_cards",
      purpose: "Children match weather to clothing during small-group play.",
      teacherUse: "Print and cut pairs for the matching activity.",
      pageCount: 1,
      pages: [{ index: 1, label: "match", kind: "matching_cards" }],
      filename: "weather.pdf",
    },
    callAi: async (_s, u) => planner.buildOperatorPrintableAiFixtureResponse(u),
  });
  if (!planned.ok) throw new Error(planned.error || "planner failed");
  const mats = await visuals.materializePrintableVisuals({
    spec: planned.spec,
    plan,
    activity,
    forceFixture: true,
  });
  if (!mats.ok) throw new Error(mats.error || "visuals failed");
  const pdf = await printablesApi.generatePrintablePdfBuffer({
    spec: { ...mats.spec, filename: "weather-watchers-weather-clothing-match.pdf" },
    plan,
    activity,
    forbidGenericFallback: true,
  });
  console.log(`OK: Phase 4.6 visual printable ${pdf.fileName} · ${pdf.pageCount} pages · visuals=${mats.usage.generations} · ${pdf.buffer.length} bytes`);
  console.log("Note: upload/link against production curriculum is intentionally not performed here.");
}

main().catch((error) => {
  console.error("Phase 4.6 live printable test FAILED:", error.message || error);
  process.exit(1);
});
