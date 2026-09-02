/**
 * AI Curriculum Operator — explicit action allowlist.
 * Only categories clearly requested by the owner may be enabled.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const commandSafety = require("./curriculum-operator-command-safety.js");
const intentRouter = require("./curriculum-operator-intent-router.js");

const CATEGORY_KEYS = Object.freeze([
  "songs",
  "books",
  "printables",
  "images",
  "lessonText",
  "activities",
  "cover",
  "draft",
  "publish",
]);

function text(value, max = 4000) {
  return schema.text(value, max);
}

function parseLockedCategories(rawCommand) {
  const raw = text(rawCommand);
  const locked = new Set();
  const listMatch = raw.match(/\b(?:do\s+not|don['’]?t)\s+touch\s+([^.;\n]+)/i);
  const blob = listMatch ? listMatch[1].toLowerCase() : "";
  const consider = `${blob} ${raw.toLowerCase()}`;

  if (commandSafety.isSongsExcluded(raw) || /\bsongs?\b/.test(blob)) locked.add("songs");
  if (commandSafety.isBooksExcluded(raw) || /\bbooks?\b/.test(blob)) locked.add("books");
  if (commandSafety.isPrintablesExcluded(raw) || /\bprintables?\b/.test(blob)) locked.add("printables");
  if (commandSafety.isImagesExcluded(raw) || /\b(?:images?|pictures?|photos?|visuals?)\b/.test(blob)) {
    locked.add("images");
  }
  if (/\bcover\b/.test(blob) || /\b(?:do\s+not|don['’]?t)\s+touch\s+(?:the\s+)?cover\b/i.test(raw)) {
    locked.add("cover");
  }
  if (/\bdrafts?\b/.test(blob) || /\b(?:do\s+not|don['’]?t)\s+(?:touch|save|create)\s+(?:a\s+|the\s+)?drafts?\b/i.test(raw)) {
    locked.add("draft");
  }
  if (/\blesson\s+text\b/.test(blob) || /\blesson\s+body\b/.test(blob)
    || /\b(?:do\s+not|don['’]?t)\s+(?:touch|rewrite|change)\s+(?:the\s+)?lesson\s+(?:text|body|content)\b/i.test(raw)) {
    locked.add("lessonText");
  }
  if (/\bactivit(?:y|ies)\b/.test(blob) && /\b(?:do\s+not|don['’]?t)\s+touch\b/i.test(raw)
    && !/\bactivity\s+images?\b/i.test(raw)) {
    locked.add("activities");
  }
  if (/\bpublish\b/.test(blob) || /\b(?:do\s+not|don['’]?t)\s+publish\b/i.test(raw) || /\bpublish\s*=\s*false\b/i.test(raw)) {
    locked.add("publish");
  }
  return locked;
}

function isAuditOnlyCommand(rawCommand) {
  const raw = text(rawCommand);
  if (!/\b(audit|identify\s+the\s+weakest|find\s+the\s+weakest|check\s+only|inspect)\b/i.test(raw)
    && !/\baudit[-\s]?only\b/i.test(raw)) {
    return false;
  }
  if (/\b(upgrade|finish|complete|save\s+draft|create\s+(?:a\s+)?new\s+lesson|publish\s+it)\b/i.test(raw)
    && !/\baudit\b/i.test(raw)) {
    return false;
  }
  if (/\b(?:generate|regenerate|create|make|replace)\b.{0,40}\b(?:images?|pictures?|printables?)\b/i.test(raw)
    && !/\baudit\b/i.test(raw)) {
    return false;
  }
  if (/\baudit\b/i.test(raw) && /\b(?:do\s+not|don['’]?t)\s+touch\s+[^.;\n]*\bdrafts?\b/i.test(raw)) {
    return true;
  }
  if (/\baudit[-\s]?only\b/i.test(raw)) return true;
  if (/\baudit\b/i.test(raw) && !/\b(?:generate|regenerate|upgrade|finish|complete|save\s+draft|publish\s+it)\b/i.test(raw)) {
    return true;
  }
  return false;
}

function isImageFocusedRequest(rawCommand, locked = new Set()) {
  const raw = text(rawCommand);
  if (commandSafety.isVocabularyOnlyCommand(raw)) return false;
  if (commandSafety.isImagesExcluded(raw) || locked.has("images")) return false;
  const mentionsImages = /\b(?:images?|pictures?|photos?|visuals?)\b/i.test(raw);
  if (!mentionsImages) return false;
  const otherRequested = (
    (/\b(?:songs?|books?)\b/i.test(raw) && !locked.has("songs") && !locked.has("books")
      && /\b(finish|complete|fix|add|upgrade|generate)\b.{0,40}\b(?:songs?|books?)\b/i.test(raw))
    || (/\bprintables?\b/i.test(raw) && !locked.has("printables")
      && /\b(finish|complete|fix|add|upgrade|generate|create)\b.{0,40}\bprintables?\b/i.test(raw))
    || (intentRouter.isExplicitCoverRequestCommand(raw) && !locked.has("cover"))
    || (/\b(?:teaching\s+kit)\b/i.test(raw) && /\b(finish|complete|upgrade|full)\b/i.test(raw)
      && locked.size === 0)
  );
  if (otherRequested) return false;
  return (
    /\bimage[-\s]?only\b/i.test(raw)
    || /\b(?:activity\s+)?(?:images?|pictures?)\s+only\b/i.test(raw)
    || /\baudit\b.{0,80}\b(?:activity\s+)?(?:images?|pictures?)\b/i.test(raw)
    || /\b(?:finish|generate|regenerate|fix)\b.{0,40}\b(?:activity\s+)?(?:images?|pictures?)\b/i.test(raw)
    || (mentionsImages && locked.has("songs") && locked.has("books") && locked.has("printables"))
  );
}

function isPrintableOnlyRequest(rawCommand, locked = new Set()) {
  const raw = text(rawCommand);
  if (commandSafety.isPrintablesExcluded(raw) || locked.has("printables")) return false;
  if (!/\bprintables?\b/i.test(raw)) return false;
  if (isImageFocusedRequest(raw, locked) && !/\bprintables?\s+only\b/i.test(raw)) return false;
  return (
    /\bprintable[-\s]?only\b/i.test(raw)
    || /\bprintables?\s+only\b/i.test(raw)
    || (/\b(?:audit|finish|generate|create|fix)\b.{0,40}\bprintables?\b/i.test(raw)
      && (locked.has("images") || locked.has("songs") || /\bonly\b/i.test(raw)))
  );
}

function isTextOnlyRequest(rawCommand, locked = new Set()) {
  const raw = text(rawCommand);
  if (commandSafety.isVocabularyOnlyCommand(raw)) return true;
  return locked.has("images") && locked.has("printables")
    && (/\blesson\s+text\b/i.test(raw) || /\bactivit/i.test(raw))
    && (/\b(upgrade|fix|improve|finish)\b/i.test(raw) || /\btext[-\s]?only\b/i.test(raw));
}

function isDraftOnlyCommand(rawCommand) {
  const raw = text(rawCommand);
  return (
    /\bdraft[-\s]?only\b/i.test(raw)
    || intentRouter.isDirectDraftSaveCommand(raw)
    || (/\bsave\s+(?:to\s+)?(?:a\s+|the\s+)?(?:enrichment\s+)?draft\b/i.test(raw)
      && /\b(?:do\s+not|don['’]?t)\s+publish\b/i.test(raw))
  );
}

function wantsExplicitImageGeneration(rawCommand) {
  const raw = text(rawCommand);
  return (
    /\b(?:generate|regenerate|create|make|replace|finish)\b.{0,40}\b(?:images?|pictures?|photos?)\b/i.test(raw)
    || /\b(?:images?|pictures?)\b.{0,40}\b(?:generate|regenerate|create|replace|finish)\b/i.test(raw)
  );
}

function emptyAllowlistActions() {
  return {
    audit: true,
    upgradeLesson: false,
    upgradeActivities: false,
    checkSongs: false,
    checkBooks: false,
    checkImages: false,
    checkPrintables: false,
    createLesson: false,
    generateImages: false,
    generatePrintables: false,
    generateSongsBooks: false,
    replaceBadImages: false,
    touchImages: false,
    touchPrintables: false,
    touchSongs: false,
    touchBooks: false,
    touchCover: false,
    touchDraft: false,
    textOnly: false,
    validate: true,
    saveDraft: false,
    publish: false,
    connectedUpgrade: false,
    connectedAutoApply: false,
    planOnly: false,
  };
}

function applyLocksToActions(actions, locked) {
  const next = { ...actions };
  if (locked.has("images")) {
    next.touchImages = false;
    next.generateImages = false;
    next.replaceBadImages = false;
    if (next.checkImages !== true) next.checkImages = false;
  }
  if (locked.has("printables")) {
    next.touchPrintables = false;
    next.generatePrintables = false;
    next.checkPrintables = false;
  }
  if (locked.has("songs")) {
    next.touchSongs = false;
    next.checkSongs = false;
  }
  if (locked.has("books")) {
    next.touchBooks = false;
    next.checkBooks = false;
  }
  if (locked.has("songs") && locked.has("books")) next.generateSongsBooks = false;
  if (locked.has("cover")) next.touchCover = false;
  if (locked.has("draft")) {
    next.touchDraft = false;
    next.saveDraft = false;
  }
  if (locked.has("lessonText")) next.upgradeLesson = false;
  if (locked.has("activities")) next.upgradeActivities = false;
  next.publish = false;
  return next;
}

function allowedBlockedFromActions(actions, locked) {
  const allowed = [];
  const blocked = [];
  if (actions.checkImages || actions.generateImages) allowed.push(actions.generateImages ? "generateImages" : "auditImages");
  else blocked.push("images");
  if (actions.checkPrintables || actions.generatePrintables) {
    allowed.push(actions.generatePrintables ? "generatePrintables" : "auditPrintables");
  } else blocked.push("printables");
  if (actions.checkSongs || actions.generateSongsBooks) allowed.push("songs");
  else blocked.push("songs");
  if (actions.checkBooks || actions.generateSongsBooks) allowed.push("books");
  else blocked.push("books");
  if (actions.upgradeLesson) allowed.push("lessonText");
  else blocked.push("lessonText");
  if (actions.upgradeActivities) allowed.push("activities");
  else blocked.push("activities");
  if (actions.touchCover) allowed.push("cover");
  else blocked.push("cover");
  if (actions.saveDraft || actions.touchDraft) allowed.push("draft");
  else blocked.push("draft");
  blocked.push("publish");
  locked.forEach((key) => {
    if (!blocked.includes(key)) blocked.push(key);
  });
  return {
    allowedActions: [...new Set(allowed)],
    blockedActions: [...new Set(blocked.filter((k) => CATEGORY_KEYS.includes(k) || k === "draft" || k === "publish" || k === "images" || k === "lessonText"))],
  };
}

/**
 * Overlay a strict allowlist onto parsed actions for narrow commands.
 * Full-kit / connected-upgrade commands without category restrictions pass through
 * with exclusion locks only — existing working logic is preserved.
 */
function applyActionScope(rawCommand, actionsIn = {}, options = {}) {
  const raw = text(rawCommand);
  const locked = parseLockedCategories(raw);
  const auditOnly = isAuditOnlyCommand(raw);
  const imageOnly = isImageFocusedRequest(raw, locked);
  const printableOnly = isPrintableOnlyRequest(raw, locked);
  const textOnly = isTextOnlyRequest(raw, locked);
  const draftOnly = isDraftOnlyCommand(raw);
  const vocabOnly = commandSafety.isVocabularyOnlyCommand(raw);
  const explicitGenerateImages = wantsExplicitImageGeneration(raw);
  const narrow = auditOnly || imageOnly || printableOnly || (textOnly && !vocabOnly && locked.size > 0);

  let actions = { ...(actionsIn && typeof actionsIn === "object" ? actionsIn : {}) };
  let mode = "passthrough";

  if (auditOnly && imageOnly) {
    mode = "audit_image_only";
    actions = {
      ...emptyAllowlistActions(),
      weeklyFieldScope: actions.weeklyFieldScope || null,
      audit: true,
      checkImages: true,
      generateImages: false,
      upgradeLesson: false,
      upgradeActivities: false,
      generatePrintables: false,
      generateSongsBooks: false,
      checkSongs: false,
      checkBooks: false,
      checkPrintables: false,
      touchImages: false,
      touchPrintables: false,
      touchSongs: false,
      touchBooks: false,
      touchCover: false,
      touchDraft: false,
      saveDraft: false,
      publish: false,
      mutationsEnabled: false,
      planOnly: true,
    };
  } else if (auditOnly && printableOnly) {
    mode = "audit_printable_only";
    actions = {
      ...emptyAllowlistActions(),
      weeklyFieldScope: actions.weeklyFieldScope || null,
      audit: true,
      checkPrintables: true,
      planOnly: true,
    };
  } else if (auditOnly) {
    mode = "audit_only";
    actions = applyLocksToActions({
      ...emptyAllowlistActions(),
      weeklyFieldScope: actions.weeklyFieldScope || null,
      audit: true,
      checkImages: imageOnly || actions.checkImages === true,
      checkPrintables: printableOnly || actions.checkPrintables === true,
      planOnly: true,
    }, locked);
    actions.touchDraft = false;
    actions.saveDraft = false;
    actions.publish = false;
    actions.upgradeLesson = false;
    actions.upgradeActivities = false;
    actions.generateImages = false;
    actions.generatePrintables = false;
    actions.generateSongsBooks = false;
    actions.connectedUpgrade = false;
    actions.connectedAutoApply = false;
  } else if (imageOnly) {
    mode = "image_only";
    const generate = explicitGenerateImages;
    actions = {
      ...emptyAllowlistActions(),
      weeklyFieldScope: actions.weeklyFieldScope || null,
      audit: true,
      checkImages: true,
      generateImages: generate,
      replaceBadImages: generate && /\b(?:weak|bad|replace)\b/i.test(raw),
      touchImages: generate,
      touchDraft: generate,
      saveDraft: generate,
      intentHint: generate ? "finish_images" : "audit",
    };
  } else if (printableOnly) {
    mode = "printable_only";
    const generate = /\b(?:generate|create|make|finish|fix)\b/i.test(raw);
    actions = {
      ...emptyAllowlistActions(),
      weeklyFieldScope: actions.weeklyFieldScope || null,
      audit: true,
      checkPrintables: true,
      generatePrintables: generate,
      touchPrintables: generate,
      touchDraft: generate,
      saveDraft: generate,
    };
  } else if (textOnly && !vocabOnly) {
    mode = "text_only";
    actions = applyLocksToActions({
      ...actions,
      textOnly: true,
      upgradeLesson: !locked.has("lessonText"),
      upgradeActivities: !locked.has("activities"),
      generateImages: false,
      generatePrintables: false,
      generateSongsBooks: false,
      touchImages: false,
      touchPrintables: false,
      touchCover: false,
      checkImages: false,
      checkPrintables: false,
      checkSongs: false,
      checkBooks: false,
    }, locked);
    if (draftOnly) {
      actions.saveDraft = true;
      actions.touchDraft = locked.has("draft") ? false : true;
    }
  } else {
    mode = vocabOnly ? "vocabulary_only" : "passthrough";
    actions = applyLocksToActions(actions, locked);
    if (/\bcomplete\s+teaching\s+kit\b/i.test(raw) || /\bfull\s+teaching\s+kit\b/i.test(raw)) {
      if (locked.has("images")) {
        actions.generateImages = false;
        actions.touchImages = false;
      }
      if (locked.has("printables")) {
        actions.generatePrintables = false;
        actions.touchPrintables = false;
      }
      if (locked.has("songs")) actions.touchSongs = false;
      if (locked.has("books")) actions.touchBooks = false;
      if (locked.has("cover")) actions.touchCover = false;
      if (locked.has("songs") && locked.has("books")) actions.generateSongsBooks = false;
    }
  }

  if (draftOnly && !auditOnly) {
    actions.publish = false;
    if (!locked.has("draft")) {
      actions.saveDraft = true;
      actions.touchDraft = true;
    }
  }

  actions.publish = false;
  actions.createLesson = actionsIn.createLesson === true && !auditOnly && !imageOnly && !printableOnly
    ? actionsIn.createLesson
    : false;
  if (vocabOnly) {
    actions.createLesson = false;
    actions.connectedUpgrade = actionsIn.connectedUpgrade === true ? true : actions.connectedUpgrade;
    actions.connectedAutoApply = actionsIn.connectedAutoApply === true ? true : actions.connectedAutoApply;
    actions.weeklyFieldScope = actionsIn.weeklyFieldScope || ["vocabCards"];
    actions.textOnly = true;
    actions.saveDraft = locked.has("draft") ? false : true;
  }

  const lists = allowedBlockedFromActions(actions, locked);
  const mutationsEnabled = Boolean(
    !auditOnly
    && (
      actions.saveDraft === true
      || actions.generateImages === true
      || actions.generatePrintables === true
      || actions.generateSongsBooks === true
      || actions.upgradeLesson === true
      || actions.upgradeActivities === true
      || actions.createLesson === true
    )
    && actions.touchDraft !== false
  );

  return {
    actions,
    mode,
    auditOnly,
    imageOnly,
    printableOnly,
    textOnly,
    draftOnly,
    lockedCategories: [...locked],
    allowedActions: lists.allowedActions,
    blockedActions: lists.blockedActions,
    mutationsEnabled,
    generateImages: actions.generateImages === true,
    generatePrintables: actions.generatePrintables === true,
    touchSongs: actions.touchSongs === true,
    touchBooks: actions.touchBooks === true,
    touchLessonBody: actions.upgradeLesson === true,
    publish: false,
    narrow,
  };
}

module.exports = {
  CATEGORY_KEYS,
  parseLockedCategories,
  isAuditOnlyCommand,
  isImageFocusedRequest,
  isPrintableOnlyRequest,
  isTextOnlyRequest,
  isDraftOnlyCommand,
  wantsExplicitImageGeneration,
  applyActionScope,
  emptyAllowlistActions,
};
