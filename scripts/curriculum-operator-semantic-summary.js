/**
 * Owner-readable interpretation. JSON remains available; this is the human view.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

function yn(cond, yes, no) {
  return cond ? yes : no;
}

function buildOwnerSummary({
  signals = {},
  compiled = {},
  command = {},
  targets = {},
  contradictions = [],
  confidence = {},
} = {}) {
  const actions = command.actions || {};
  const scope = command.scope || {};
  const rows = schema.asArray(targets.rows);
  const operation = compiled.primary === "ACTIVITY_IMAGE_REPAIR"
    ? "Repair activity images"
    : compiled.primary === "VOCABULARY_WORK"
      ? "Repair vocabulary"
      : compiled.primary === "PRINTABLE_WORK"
        ? "Repair printables"
        : compiled.primary === "FULL_KIT_WORK"
          ? "Finish Teaching Kit (draft only)"
          : compiled.primary === "META_INSTRUCTION"
            ? "Not a curriculum job"
            : (command.intent || "Review request");

  const targetLine = scope.plan === "Free" && (targets.mode === "collection" || signals.collection)
    ? "All currently matching FREE lessons"
    : rows.length === 1
      ? rows[0].title
      : rows.length
        ? `${rows.length} resolved lessons`
        : (scope.titles || []).join(", ") || "Needs a clearer target";

  const included = [];
  const excluded = [];
  if (actions.checkImages || actions.generateImages) included.push("audit activity images");
  if (signals.keepGoodImages) included.push("keep good images");
  if (actions.replaceBadImages) included.push("replace bad/cartoon/generic images");
  if (actions.generateImages && !signals.keepGoodImages) included.push("generate missing activity images");
  if (signals.realistic) included.push("realistic exact-activity photography");
  if (actions.upgradeLesson && compiled.primary === "VOCABULARY_WORK") included.push("vocabulary cards");
  if (actions.generatePrintables) included.push("printables");
  if (actions.touchCover) included.push("cover image");
  if (actions.upgradeActivities) included.push("activity text");

  if (!actions.upgradeActivities) excluded.push("activity text");
  if (!actions.touchPrintables && !actions.generatePrintables) excluded.push("printables");
  if (!actions.touchSongs) excluded.push("songs");
  if (!actions.touchBooks) excluded.push("books");
  if (compiled.primary === "ACTIVITY_IMAGE_REPAIR") excluded.push("lesson text", "weekly content", "vocabulary");
  if (!actions.touchCover) excluded.push("cover");

  const lines = [
    "UNDERSTOOD REQUEST",
    "",
    `Operation: ${operation}`,
    `Targets: ${targetLine}`,
    "",
    "Included:",
    ...(included.length ? included.map((item) => `✓ ${item}`) : ["✓ audit only / no mutation"]),
    "",
    "Excluded:",
    ...excluded.map((item) => `✗ ${item}`),
    "",
    "Publishing: OFF",
    "Save behavior: Successful approved AI changes will be saved directly into the lesson draft for your review.",
    "Final action: When the job is ready, open the lesson, review the draft, and click Publish.",
    `Cover image: ${actions.touchCover ? "INCLUDED" : "unchanged"}`,
    "",
    `Resolved targets: ${rows.length || (scope.plan ? "filtered collection" : 0)}`,
    `Warnings: ${contradictions.length ? contradictions.map((c) => c.message).join("; ") : "none"}`,
    `Confidence: ${confidence.overall || "medium"}`,
  ];

  const ownerFacingFlags = {
    connectedAutoApply: yn(actions.connectedAutoApply, "Changes will be saved for your review. Nothing will publish automatically.", "Preview only — draft will not be updated until you run a saveable job."),
    touchPrintables: yn(actions.touchPrintables || actions.generatePrintables, "Printables may be updated.", "Printables will not be changed."),
    publish: "Nothing will publish automatically.",
  };

  return {
    text: lines.join("\n"),
    operation,
    targetLine,
    included,
    excluded,
    publishing: "OFF",
    ownerFacingFlags,
  };
}

function summariesMatchCommand(summary, command) {
  if (!summary || !command) return false;
  if (command.actions?.publish === true) return false;
  if (command.intent === "finish_full_kit" && /Repair activity images/.test(summary.operation || "")) return false;
  return true;
}

module.exports = {
  buildOwnerSummary,
  summariesMatchCommand,
};
