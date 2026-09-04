/**
 * Generic language-vs-plan contradiction checker.
 * Blocks Run when the structured plan contradicts explicit owner language.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

function text(value, max = 400) {
  return schema.text(value, max);
}

function checkContradictions({
  signals = {},
  command = {},
  resolvedRows = [],
  compiled = {},
} = {}) {
  const contradictions = [];
  const actions = command.actions || {};
  const scope = command.scope || {};

  function block(code, field, message) {
    contradictions.push({ code, field, message: text(message, 400) });
  }

  if (signals.access === "Free" && (scope.plan === "Pro" || resolvedRows.some((r) => r.plan === "Pro"))) {
    block("access_tier_mismatch", "scope.plan", "Command requested FREE lessons but the plan resolved Pro.");
  }
  if (signals.access === "Pro" && (scope.plan === "Free" || resolvedRows.some((r) => r.plan === "Free" && signals.collection))) {
    block("access_tier_mismatch", "scope.plan", "Command requested PRO lessons but the plan resolved Free.");
  }
  if (signals.accessConflict) {
    block("semantic_contradiction", "scope.plan", "Command requests both FREE and PRO without a usable exclusion.");
  }
  if (signals.ageBand && scope.ageBand && scope.ageBand !== signals.ageBand) {
    block("age_band_mismatch", "scope.ageBand", `Command requested ${signals.ageBand} but plan uses ${scope.ageBand}.`);
  }
  if ((signals.imagesOnly || signals.exclude.printables) && (
    actions.touchPrintables === true || actions.generatePrintables === true
  )) {
    block("semantic_contradiction", "generatePrintables", "Images-only / printables-excluded command enabled printable mutation.");
  }
  if ((signals.imagesOnly || signals.exclude.activities || signals.exclude.text)
    && actions.upgradeActivities === true) {
    block("semantic_contradiction", "upgradeActivities", "Images-only / no-text command enabled activity-text upgrade.");
  }
  if ((signals.imagesOnly || signals.exclude.songs) && (
    actions.touchSongs === true && actions.generateSongsBooks === true
  )) {
    block("semantic_contradiction", "generateSongsBooks", "Images-only command enabled song generation.");
  }
  if ((signals.imagesOnly || signals.exclude.books) && actions.generateSongsBooks === true && actions.touchBooks !== false) {
    block("semantic_contradiction", "generateSongsBooks", "Images-only command enabled book generation.");
  }
  if (signals.exclude.publish && actions.publish === true) {
    block("semantic_contradiction", "publish", "Command said do not publish but publish=true.");
  }
  if (signals.publishConflict) {
    block("semantic_contradiction", "publish", "Command both forbids and requests publish.");
  }
  if (signals.keepGoodImages && actions.replaceBadImages === false && actions.generateImages === true && !signals.replaceBadImages) {
    block("semantic_contradiction", "generateImages", "Keep-good-images request would regenerate every image.");
  }
  if (signals.imagesOnly && command.intent === "finish_full_kit") {
    block("semantic_contradiction", "intent", "Images-only request collapsed into finish_full_kit.");
  }
  if (signals.fullKitRequested && signals.imagesOnly) {
    block("semantic_contradiction", "intent", "Command asks for images only and also a full-kit rewrite.");
  }
  if (compiled.primary === "META_INSTRUCTION" && (
    actions.saveDraft === true || actions.upgradeLesson === true || actions.generateImages === true
  )) {
    block("meta_instruction", "intent", "System-development instruction must not mutate curriculum.");
  }
  if (signals.collection && !signals.ageBand && scope.ageBand) {
    block("age_band_mismatch", "scope.ageBand", "Age band was invented without being requested.");
  }

  const blocked = contradictions.length > 0;
  return {
    ok: !blocked,
    blocked,
    contradictions,
    confirmReasons: contradictions.map((c) => c.code),
  };
}

module.exports = {
  checkContradictions,
};
