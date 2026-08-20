#!/usr/bin/env node
/**
 * Optional Phase 4 printable fixture pipeline (pdf-lib + local store).
 * No live image/OpenAI required. Skips unless LLH_OPERATOR_LIVE_PRINTABLES=1.
 */
"use strict";

const printablesApi = require("./curriculum-operator-printables.js");

async function main() {
  const enabled = ["1", "true", "yes"].includes(
    String(process.env.LLH_OPERATOR_LIVE_PRINTABLES || "").trim().toLowerCase(),
  );
  if (!enabled) {
    console.log("SKIP: set LLH_OPERATOR_LIVE_PRINTABLES=1 to run the printable fixture pipeline test.");
    return;
  }

  const plan = {
    id: "cur-lp-phase4-live-fixture",
    title: "Phase 4 Live Fixture",
    age: "Preschool 3–5",
    theme: "Weather",
    plan: "Pro",
    status: "draft",
  };
  const activity = {
    id: "cur-act-phase4-live-match",
    title: "Weather Clothing Match",
    objective: "Children will match weather pictures to clothing cards.",
    materials: "Matching cards",
    steps: "Match each weather card to a clothing card.",
  };
  const spec = printablesApi.buildPrintableSpec({
    plan,
    activity,
    planItem: {
      activityId: activity.id,
      printable: {
        decision: "CREATE",
        reason: "Matching activity needs usable card pairs.",
        purpose: "Children match weather to clothing during small-group play.",
        type: "matching_cards",
        title: "Weather Clothing Match Cards",
        contents: ["sunny/clothing pair page", "rainy/clothing pair page", "cut-apart card sheet"],
      },
    },
    decision: "CREATE",
  });
  const generated = await printablesApi.generatePrintablePdfBuffer({ spec, plan, activity });
  const validated = await printablesApi.validateGeneratedPdf(generated.buffer, {
    expectedPageCount: generated.pageCount,
    fileName: generated.fileName,
  });
  if (!validated.ok) throw new Error(`validation failed: ${JSON.stringify(validated.failed)}`);
  console.log(`OK: fixture printable PDF ${generated.fileName} · ${generated.pageCount} pages · ${generated.buffer.length} bytes`);
  console.log("Note: upload/link against production curriculum is intentionally not performed here.");
}

main().catch((error) => {
  console.error("Phase 4 live printable test FAILED:", error.message || error);
  process.exit(1);
});
