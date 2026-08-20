#!/usr/bin/env node
/**
 * Optional Phase 6 safe integration smoke (fixture AI/assets only).
 * SKIP unless LLH_OPERATOR_LIVE_FULL_KIT=1.
 * Never touches production curriculum. Never publishes.
 */
"use strict";

const commandApi = require("./curriculum-operator-command.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");

async function main() {
  const enabled = ["1", "true", "yes"].includes(
    String(process.env.LLH_OPERATOR_LIVE_FULL_KIT || "").trim().toLowerCase(),
  );
  if (!enabled) {
    console.log("SKIP: set LLH_OPERATOR_LIVE_FULL_KIT=1 to run the Phase 6 full-kit fixture smoke.");
    return;
  }

  const parsed = commandApi.parseOperatorCommand(
    "Finish Weather Watchers and get it ready for me to review.",
    { phase: 6 },
  );
  if (parsed.command.actions.publish) throw new Error("publish must remain blocked");
  if (parsed.command.actions.createLesson) throw new Error("lesson.create must remain blocked");
  const scope = orchestrator.normalizeKitScopeFlags(parsed.command.actions);
  if (scope.cover) throw new Error("cover should stay locked by default");
  console.log("OK: Phase 6 command/scope fixture");
  console.log(`intent=${parsed.command.intent} text=${scope.lessonContent} songs=${scope.songs} images=${scope.images} printables=${scope.printables}`);
  console.log("Note: production curriculum is intentionally not modified here.");
}

main().catch((error) => {
  console.error("Phase 6 live full-kit test FAILED:", error.message || error);
  process.exit(1);
});
