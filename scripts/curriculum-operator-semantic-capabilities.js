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
  ASSETS_ONLY_WORK: "ASSETS_ONLY_WORK",
  ACTIVITY_CONTENT_WORK: "ACTIVITY_CONTENT_WORK",
  WEEKLY_CONTENT_WORK: "WEEKLY_CONTENT_WORK",
  SONG_WORK: "SONG_WORK",
  BOOK_WORK: "BOOK_WORK",
  FULL_KIT_WORK: "FULL_KIT_WORK",
  CONSERVATIVE_FULL_AUDIT: "CONSERVATIVE_FULL_AUDIT",
  AUDIT_ONLY: "AUDIT_ONLY",
  META_INSTRUCTION: "META_INSTRUCTION",
  RETRY_FAILED_ASSETS: "RETRY_FAILED_ASSETS",
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

  if (signals.retryFailedOnly || signals.retryCoverOnly) {
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    if (signals.retryCoverOnly) {
      allowed.add("touchCover");
      reasons.touchCover = ["retry failed cover only"];
    } else {
      allowed.add("generateImages");
      allowed.add("touchImages");
      allowed.add("replaceBadImages");
      reasons.generateImages = ["retry failed image assets only"];
      reasons.replaceBadImages = ["retry failed image assets only"];
    }
    [
      "upgradeActivities", "upgradeLesson", "generatePrintables", "touchPrintables",
      "generateSongsBooks", "touchSongs", "touchBooks", "publish", "createLesson",
      "connectedUpgrade",
    ].forEach((flag) => forbidden.add(flag));
    if (!signals.retryCoverOnly) forbidden.add("touchCover");
    notes.push("Failed-asset retry — only previously failed selected assets may re-run.");
    return pack(CAPABILITIES.RETRY_FAILED_ASSETS, "finish_images", allowed, forbidden, reasons, notes, true);
  }

  // Printable-only and cover-only outrank generic image-capability inference.
  if (signals.printablesOnly) {
    allowed.add("checkPrintables");
    allowed.add("touchPrintables");
    allowed.add("generatePrintables");
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    reasons.generatePrintables = ["explicit printable work"];
    [
      "upgradeActivities", "generateImages", "replaceBadImages", "touchImages", "checkImages",
      "generateSongsBooks", "touchSongs", "touchBooks", "touchCover", "publish", "createLesson",
    ].forEach((flag) => forbidden.add(flag));
    notes.push("Printables-only capability.");
    return pack(CAPABILITIES.PRINTABLE_WORK, "finish_printables", allowed, forbidden, reasons, notes, true);
  }

  if (signals.coverOnly || (signals.coverRequested && !signals.imageWork && !signals.imagesOnly && !signals.assetsOnlyMulti)) {
    allowed.add("touchCover");
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    reasons.touchCover = ["explicit cover request"];
    [
      "upgradeActivities", "upgradeLesson", "generateImages", "replaceBadImages", "touchImages",
      "checkImages", "generatePrintables", "touchPrintables", "generateSongsBooks",
      "touchSongs", "touchBooks", "publish", "createLesson",
    ].forEach((flag) => forbidden.add(flag));
    notes.push("Cover-only capability — activity images and lesson content stay locked.");
    return pack(CAPABILITIES.COVER_WORK, "fix_lesson", allowed, forbidden, reasons, notes, true);
  }

  if (signals.assetsOnlyMulti) {
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    allowed.add("validate");
    if (signals.coverRequested || signals.coverOnly) {
      allowed.add("touchCover");
      reasons.touchCover = ["explicit cover request in assets-only scope"];
    } else forbidden.add("touchCover");
    if (signals.imageWork || signals.imagesOnly || signals.replaceBadImages || signals.keepGoodImages) {
      allowed.add("audit");
      allowed.add("checkImages");
      allowed.add("touchImages");
      allowed.add("generateImages");
      allowed.add("replaceBadImages");
      reasons.checkImages = ["explicit activity-image request in assets-only scope"];
      reasons.touchImages = ["explicit image mutation scope"];
      reasons.generateImages = ["assets-only activity image repair"];
      reasons.replaceBadImages = signals.keepGoodImages
        ? ["replace bad images only; keep good existing images"]
        : ["replace unjustified activity images"];
    } else {
      ["generateImages", "replaceBadImages", "touchImages", "checkImages"].forEach((f) => forbidden.add(f));
    }
    if (!signals.exclude.printables) {
      allowed.add("checkPrintables");
      allowed.add("touchPrintables");
      allowed.add("generatePrintables");
      reasons.generatePrintables = ["explicit printable request in assets-only scope"];
    } else {
      ["generatePrintables", "touchPrintables", "checkPrintables"].forEach((f) => forbidden.add(f));
    }
    [
      "upgradeActivities", "upgradeLesson", "generateSongsBooks", "touchSongs", "touchBooks",
      "checkSongs", "checkBooks", "publish", "createLesson", "connectedUpgrade",
    ].forEach((flag) => forbidden.add(flag));
    notes.push("Assets-only multi-scope — cover/images/printables as requested; lesson wording locked.");
    return pack(CAPABILITIES.ASSETS_ONLY_WORK, "finish_images", allowed, forbidden, reasons, notes, true);
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

  if (signals.carefulFullAudit && !signals.fullKitRequested) {
    allowed.add("upgradeLesson");
    allowed.add("upgradeActivities");
    allowed.add("saveDraft");
    allowed.add("composeReviewDraft");
    allowed.add("validate");
    allowed.add("audit");
    reasons.upgradeLesson = ["conservative full audit — repair weak required lesson content only"];
    reasons.upgradeActivities = ["conservative full audit — repair weak required activity content only"];
    allowed.add("checkImages");
    allowed.add("touchImages");
    allowed.add("generateImages");
    allowed.add("replaceBadImages");
    reasons.checkImages = ["audit activity images for exact-activity match"];
    reasons.generateImages = ["generate missing activity images"];
    reasons.replaceBadImages = signals.keepGoodImages
      ? ["replace bad/wrong images; keep good exact-match images"]
      : ["replace unjustified activity images"];
    allowed.add("connectedUpgrade");
    allowed.add("connectedAutoApply");
    reasons.connectedUpgrade = ["compose repairs into owner review draft without optional kit churn"];
    reasons.connectedAutoApply = ["approved changes save into the lesson draft — no separate Apply step"];
    [
      "generatePrintables", "touchPrintables", "checkPrintables",
      "generateSongsBooks", "touchSongs", "touchBooks", "checkSongs", "checkBooks",
      "touchCover", "publish", "createLesson",
    ].forEach((flag) => forbidden.add(flag));
    notes.push("Conservative full audit — fix defects and images; optional enrichment stays untouched.");
    return pack(CAPABILITIES.CONSERVATIVE_FULL_AUDIT, "finish_review", allowed, forbidden, reasons, notes, true);
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
  if (compiled.primary === CAPABILITIES.PRINTABLE_WORK) {
    next.connectedUpgrade = false;
    next.upgradeLesson = false;
    next.upgradeActivities = false;
    next.generateImages = false;
    next.replaceBadImages = false;
    next.touchImages = false;
    next.checkImages = false;
    next.generateSongsBooks = false;
    next.touchSongs = false;
    next.touchBooks = false;
    next.touchCover = false;
    next.generatePrintables = true;
    next.touchPrintables = true;
    next.checkPrintables = true;
    next.touchDraft = true;
  }
  if (compiled.primary === CAPABILITIES.COVER_WORK) {
    next.connectedUpgrade = false;
    next.upgradeLesson = false;
    next.upgradeActivities = false;
    next.generateImages = false;
    next.replaceBadImages = false;
    next.touchImages = false;
    next.checkImages = false;
    next.generatePrintables = false;
    next.touchPrintables = false;
    next.generateSongsBooks = false;
    next.touchSongs = false;
    next.touchBooks = false;
    next.touchCover = true;
    next.touchDraft = true;
  }
  if (compiled.primary === CAPABILITIES.ASSETS_ONLY_WORK) {
    next.connectedUpgrade = false;
    next.upgradeLesson = false;
    next.upgradeActivities = false;
    next.generateSongsBooks = false;
    next.touchSongs = false;
    next.touchBooks = false;
    next.checkSongs = false;
    next.checkBooks = false;
    next.touchDraft = true;
    if (compiled.allowed.includes("touchCover")) next.touchCover = true;
    else next.touchCover = false;
    if (compiled.allowed.includes("generateImages")) {
      next.generateImages = true;
      next.touchImages = true;
      next.checkImages = true;
      next.replaceBadImages = compiled.allowed.includes("replaceBadImages");
    } else {
      next.generateImages = false;
      next.replaceBadImages = false;
      next.touchImages = false;
      next.checkImages = false;
    }
    if (compiled.allowed.includes("generatePrintables")) {
      next.generatePrintables = true;
      next.touchPrintables = true;
      next.checkPrintables = true;
    } else {
      next.generatePrintables = false;
      next.touchPrintables = false;
      next.checkPrintables = false;
    }
  }
  if (compiled.primary === CAPABILITIES.RETRY_FAILED_ASSETS) {
    next.connectedUpgrade = false;
    next.upgradeLesson = false;
    next.upgradeActivities = false;
    next.generatePrintables = false;
    next.touchPrintables = false;
    next.generateSongsBooks = false;
    next.touchSongs = false;
    next.touchBooks = false;
    next.touchDraft = true;
    if (compiled.allowed.includes("touchCover")) {
      next.touchCover = true;
      next.generateImages = false;
      next.replaceBadImages = false;
      next.touchImages = false;
    } else {
      next.touchCover = false;
      next.generateImages = true;
      next.replaceBadImages = true;
      next.touchImages = true;
      next.checkImages = true;
    }
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
  if (compiled.primary === CAPABILITIES.CONSERVATIVE_FULL_AUDIT) {
    next.connectedUpgrade = true;
    next.connectedAutoApply = next.planOnly !== true;
    next.composeReviewDraft = true;
    next.conservativeFullAudit = true;
    next.generateSongsBooks = false;
    next.touchSongs = false;
    next.touchBooks = false;
    next.checkSongs = false;
    next.checkBooks = false;
    next.generatePrintables = false;
    next.touchPrintables = false;
    next.checkPrintables = false;
    next.touchCover = false;
    if (compiled.allowed.includes("replaceBadImages")) next.replaceBadImages = true;
    if (compiled.allowed.includes("generateImages")) {
      next.generateImages = true;
      next.touchImages = true;
      next.checkImages = true;
    }
    next.upgradeLesson = true;
    next.upgradeActivities = true;
    next.touchDraft = true;
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
