#!/usr/bin/env node
/**
 * Optional Phase 3 LIVE image integration (safe fixture store only).
 *
 * Requires:
 *   OPENAI_API_KEY (image-capable)
 *   LLH_OPERATOR_LIVE_IMAGES=1
 *
 * Never touches production curriculum.
 * Run: LLH_OPERATOR_LIVE_IMAGES=1 npm run test:curriculum-operator-phase3-live
 */
"use strict";

const imagesApi = require("./curriculum-operator-images.js");

async function main() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  const enabled = ["1", "true", "yes"].includes(
    String(process.env.LLH_OPERATOR_LIVE_IMAGES || "").trim().toLowerCase(),
  );
  if (!enabled) {
    console.log("SKIP: set LLH_OPERATOR_LIVE_IMAGES=1 to run the live image fixture test.");
    return;
  }
  if (!key || key.length < 20) {
    console.log("SKIP: OPENAI_API_KEY not configured.");
    return;
  }

  const plan = {
    id: "cur-lp-phase3-live-fixture",
    title: "Phase 3 Live Fixture",
    age: "Toddler 18–24 Months",
    theme: "Apples",
    plan: "Pro",
    status: "draft",
    enrichmentDraft: { week: {}, activities: {} },
  };
  const activity = {
    id: "cur-act-phase3-live-paint",
    lessonPlanId: plan.id,
    title: "Apple Rolling Painting",
    materials: "Shallow tray, paper, washable paint, apples",
    setup: "Tray on low table with paper.",
    steps: "Roll apples through paint onto paper.",
    objective: "Explore process art with rolling apples.",
  };
  const prompt = imagesApi.buildActivityImagePrompt({
    plan,
    activity,
    draftActivity: {},
    field: "setupImageUrl",
  });
  console.log("Generating one fixture image (live)…");
  const generated = await imagesApi.generateActivityImageBuffer({
    apiKey: key,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    prompt,
    mock: false,
  });
  if (!generated?.buffer?.length) {
    throw new Error("Live generation returned empty buffer.");
  }
  console.log(`OK: live generate produced ${generated.buffer.length} bytes (${generated.mimeType}).`);
  console.log("Note: upload/attach against production curriculum is intentionally not performed here.");
}

main().catch((error) => {
  console.error("Phase 3 live image test FAILED:", error.message || error);
  process.exit(1);
});
