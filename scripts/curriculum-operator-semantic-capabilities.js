/**
 * Capability matrix + reason map.
 * Powerful flags require an explicit semantic reason — never "default".
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const CAPABILITIES = Object.freeze({
  ACTIVITY_IMAGE_REPAIR: "ACTIVITY_IMAGE_REPAIR",
  VOCABULARY_WORK: "VOCABULARY_WORK",
  PRINTABLE_WORK: "PRINTABLE_WORK",
  COVER_WORK: "COVER_WORK",
  ACTIVITY_CONTENT_WORK: "ACTIVITY_CONTENT_WORK",
  WEEKLY_CONTENT_WORK: "WEEKLY_CONTENT_WORK",
  SONG_WORK: "SONG_WORK",
  BOOK_WORK: "BOOK_WORK",
  FULL_KIT_WORK: "FULL_KIT_WORK",
  AUDIT_ONLY: "AUDIT_ONLY",
  META_INSTRUCTION: "META_INSTRUCTION",
});

function text(value, max = 200) {
  return schema.text(value, max);
}

function compileCapabilities(signals = {}, context = {}) {
  const reasons = {};
  const allowed = new Set();
  const forbidden = new Set();
  const notes = [];

  if (signals.metaInstruction) {
    return {
      primary: CAPABILITIES.META_INSTRUCTION,
      allowed: [],
      forbidden: ["upgradeLesson", "upgradeActivities", "generateImages", "generatePrintables", "generateSongsBooks", "publish", "createLesson"],
      reasons: { meta: ["system-development instruction — no curriculum mutation"] },
      intent: "unknown",
      mutationsEnabled: false,
      composeReviewDraft: false,
      notes: ["This appears to be a system-development instruction rather than a curriculum job. No curriculum mutation planned."],
    };
  }

  if ((signals.doTheSame || signals.sameAsPrevious) && context.previousIntent === CAPABILITIES.ACTIVITY_IMAGE_REPAIR) {
    signals = { ...signals, imagesOnly: true, imageWork: true };
  }

  if (signals.vocabOnly) {
    allowed.add("upgradeLesson");
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    allowed.add("validate");
    reasons.upgradeLesson = ["vocabulary-only request"];
    [
      "upgradeActivities", "generateImages", "touchImages", "generatePrintables",
      "touchPrintables", "generateSongsBooks", "touchSongs", "touchBooks", "touchCover", "publish",
    ].forEach((flag) => forbidden.add(flag));
    notes.push("Vocabulary-only capability.");
    return pack(CAPABILITIES.VOCABULARY_WORK, "fix_lesson", allowed, forbidden, reasons, notes, true);
  }

  if (signals.imagesOnly || (signals.imageWork && (signals.exclude.text || signals.exclude.activities))) {
    allowed.add("audit");
    allowed.add("checkImages");
    allowed.add("touchImages");
    allowed.add("generateImages");
    allowed.add("replaceBadImages");
    allowed.add("validate");
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    reasons.checkImages = ["explicit activity-image request"];
    reasons.touchImages = ["explicit image mutation scope"];
    reasons.generateImages = signals.replaceBadImages || signals.generateMissingImages
      ? ["replace bad / generate missing activity images"]
      : ["activity-image repair"];
    reasons.replaceBadImages = signals.keepGoodImages
      ? ["replace bad images only; keep good existing images"]
      : ["replace unjustified activity images"];
    [
      "upgradeActivities", "generatePrintables", "touchPrintables", "checkPrintables",
      "generateSongsBooks", "touchSongs", "touchBooks", "checkSongs", "checkBooks",
      "touchCover", "publish", "createLesson",
    ].forEach((flag) => forbidden.add(flag));
    if (!signals.coverRequested) forbidden.add("touchCover");
    notes.push("Images-only capability — full Teaching Kit flags remain off.");
    return pack(CAPABILITIES.ACTIVITY_IMAGE_REPAIR, "finish_images", allowed, forbidden, reasons, notes, true);
  }

  if (signals.printablesOnly) {
    allowed.add("checkPrintables");
    allowed.add("touchPrintables");
    allowed.add("generatePrintables");
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    reasons.generatePrintables = ["explicit printable work"];
    [
      "upgradeActivities", "generateImages", "touchImages", "generateSongsBooks",
      "touchSongs", "touchBooks", "touchCover", "publish",
    ].forEach((flag) => forbidden.add(flag));
    notes.push("Printables-only capability.");
    return pack(CAPABILITIES.PRINTABLE_WORK, "finish_printables", allowed, forbidden, reasons, notes, true);
  }

  if (signals.fullKitRequested) {
    allowed.add("upgradeLesson");
    allowed.add("upgradeActivities");
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    allowed.add("validate");
    reasons.upgradeLesson = ["explicit full Teaching Kit request"];
    reasons.upgradeActivities = ["explicit full Teaching Kit request"];
    if (!signals.exclude.images) {
      allowed.add("generateImages");
      allowed.add("touchImages");
      reasons.generateImages = ["full-kit image finish"];
      if (signals.replaceBadImages || signals.keepGoodImages
        || (/\bweak\b/.test(signals.folded || "") && /\b(?:images?|pictures?|photos?)\b/.test(signals.folded || ""))) {
        allowed.add("replaceBadImages");
        reasons.replaceBadImages = ["replace weak/bad images only"];
      }
    } else forbidden.add("generateImages");
    allowed.add("connectedUpgrade");
    allowed.add("connectedAutoApply");
    reasons.connectedUpgrade = ["existing-lesson Teaching Kit work composes into the review draft"];
    reasons.connectedAutoApply = ["approved changes save into the lesson draft — no separate Apply step"];
    if (!signals.exclude.printables) {
      allowed.add("generatePrintables");
      reasons.generatePrintables = ["full-kit printable finish"];
    } else forbidden.add("generatePrintables");
    if (!signals.exclude.songs && !signals.exclude.books) {
      allowed.add("generateSongsBooks");
      reasons.generateSongsBooks = ["full-kit songs/books finish"];
    } else forbidden.add("generateSongsBooks");
    if (signals.coverRequested) {
      allowed.add("touchCover");
      reasons.touchCover = ["explicit cover request"];
    } else forbidden.add("touchCover");
    forbidden.add("publish");
    notes.push("Full Teaching Kit — only capabilities with an explicit reason are enabled.");
    return pack(CAPABILITIES.FULL_KIT_WORK, "finish_full_kit", allowed, forbidden, reasons, notes, true);
  }

  if (signals.coverRequested && !signals.imageWork) {
    allowed.add("touchCover");
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    reasons.touchCover = ["explicit cover request"];
    forbidden.add("publish");
    return pack(CAPABILITIES.COVER_WORK, "fix_lesson", allowed, forbidden, reasons, notes, true);
  }

  if (signals.ambiguousBare && !context.previousIntent) {
    return {
      primary: CAPABILITIES.AUDIT_ONLY,
      allowed: ["audit"],
      forbidden: ["upgradeLesson", "upgradeActivities", "generateImages", "generatePrintables", "generateSongsBooks", "publish"],
      reasons: { ambiguous: ["bare command without a usable target or prior context"] },
      intent: "audit",
      mutationsEnabled: false,
      composeReviewDraft: false,
      notes: ["Need a clearer target and operation before any mutation."],
    };
  }

  return {
    primary: null,
    allowed: [],
    forbidden: [],
    reasons,
    intent: null,
    mutationsEnabled: null,
    composeReviewDraft: null,
    notes,
  };
}

function pack(primary, intent, allowed, forbidden, reasons, notes, composeReviewDraft) {
  return {
    primary,
    allowed: [...allowed],
    forbidden: [...forbidden],
    reasons,
    intent,
    mutationsEnabled: true,
    composeReviewDraft,
    notes,
  };
}

function applyCapabilityFlags(actions = {}, compiled = {}) {
  const next = { ...actions };
  schema.asArray(compiled.forbidden).forEach((flag) => {
    if (Object.prototype.hasOwnProperty.call(next, flag)) next[flag] = false;
  });
  schema.asArray(compiled.allowed).forEach((flag) => {
    if (Object.prototype.hasOwnProperty.call(next, flag) || flag === "composeReviewDraft") {
      next[flag] = true;
    }
  });
  next.publish = false;
  if (compiled.composeReviewDraft && next.planOnly !== true) {
    next.composeReviewDraft = true;
    next.saveDraft = true;
    next.connectedAutoApply = true;
  }
  if (compiled.primary === CAPABILITIES.ACTIVITY_IMAGE_REPAIR) {
    next.connectedUpgrade = false;
    next.upgradeLesson = false;
    next.upgradeActivities = false;
    next.checkSongs = false;
    next.checkBooks = false;
    next.checkPrintables = false;
    next.touchSongs = false;
    next.touchBooks = false;
    next.touchPrintables = false;
    next.touchDraft = true;
  }
  if (compiled.primary === CAPABILITIES.VOCABULARY_WORK) {
    next.connectedUpgrade = true;
    next.weeklyFieldScope = ["vocabCards"];
    next.textOnly = true;
    next.upgradeActivities = false;
  }
  if (compiled.primary === CAPABILITIES.FULL_KIT_WORK) {
    next.connectedUpgrade = true;
    next.connectedAutoApply = next.planOnly !== true;
    next.composeReviewDraft = true;
    if (compiled.allowed.includes("replaceBadImages")) next.replaceBadImages = true;
    if (compiled.allowed.includes("touchCover")) next.touchCover = true;
  }
  if (compiled.primary === CAPABILITIES.META_INSTRUCTION || compiled.mutationsEnabled === false) {
    next.saveDraft = false;
    next.upgradeLesson = false;
    next.upgradeActivities = false;
    next.generateImages = false;
    next.generatePrintables = false;
    next.generateSongsBooks = false;
    next.connectedUpgrade = false;
    next.connectedAutoApply = false;
    next.composeReviewDraft = false;
  }
  return next;
}

function capabilityWithoutReason(actions = {}, reasons = {}) {
  const powerful = [
    "upgradeActivities", "generatePrintables", "generateSongsBooks",
    "connectedUpgrade", "touchCover", "createLesson", "publish",
  ];
  return powerful.filter((flag) => actions[flag] === true && !schema.asArray(reasons[flag]).length);
}

module.exports = {
  CAPABILITIES,
  compileCapabilities,
  applyCapabilityFlags,
  capabilityWithoutReason,
  text,
};
