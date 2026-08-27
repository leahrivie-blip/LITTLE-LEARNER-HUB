/**
 * AI Curriculum Operator — parser precedence, scope safety, and contradiction gates.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const GARBAGE_TITLE_RE = new RegExp([
  "\\bteachingkit\\.",
  "\\bplan\\.",
  "\\bvocabcards\\b",
  "\\bvocabularywords\\b",
  "\\bhard\\s+success\\b",
  "\\bcurrent\\s+(?:vocabulary|state)\\b",
  "\\bcanonical\\s+write\\b",
  "\\bfinal\\s+report\\b",
  "\\bexpected\\s+(?:values?|outcomes?)\\b",
  "\\bmalformed\\b",
  "\\blegacy\\b",
  "\\bcombined[- ]word\\b",
  "\\bobject\\s+keys?\\b",
  "\\bfield\\s+names?\\b",
  "\\b(?:social\\s+emotional|language\\s*&\\s*literacy|physical\\s+development|creative\\s+arts)\\b",
  "\\b(?:generate|touch|check)(?:images|printables|songs|books)?\\s*=",
  "\\bconnected(?:upgrade|autoapply)\\s*=",
  "\\btrue\\b$",
  "\\bfalse\\b$",
].join("|"), "i");

const TRUSTED_TITLE_PATTERNS = [
  /\blesson\s*title\s*:\s*([^\n\r]{2,120})/i,
  /\blesson\s*:\s*([^\n\r]{2,120})/i,
];

function text(value, max = 4000) {
  return schema.text(value, max);
}

function normalizeTitleKey(value) {
  return text(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isGarbageTitleCandidate(candidate) {
  const raw = text(candidate, 180);
  if (!raw || raw.length < 3) return true;
  if (GARBAGE_TITLE_RE.test(raw)) return true;
  if (/^[a-z0-9_.]+\.[a-z0-9_.]+/i.test(raw)) return true;
  if (/^\{|\}|=>|:=/.test(raw)) return true;
  if (raw.split(/\s+/).length > 8) return true;
  return false;
}

function extractStructuredLessonTitles(rawCommand) {
  const raw = text(rawCommand);
  const titles = [];
  TRUSTED_TITLE_PATTERNS.forEach((re) => {
    const match = raw.match(re);
    if (match && match[1]) {
      const candidate = match[1].split(/\n|\.(?:\s|$)/)[0].trim();
      if (!isGarbageTitleCandidate(candidate)) titles.push(candidate);
    }
  });
  return titles;
}

function sanitizeLessonTitles(titles = [], rawCommand = "", lessonPlans = []) {
  const catalogKeys = new Set(schema.asArray(lessonPlans).map((p) => normalizeTitleKey(p?.title)).filter(Boolean));
  return [...new Set(schema.asArray(titles).map((t) => text(t, 180)).filter(Boolean))]
    .filter((title) => {
      if (isGarbageTitleCandidate(title)) return false;
      const key = normalizeTitleKey(title);
      if (!key) return false;
      if (catalogKeys.size && !catalogKeys.has(key)) {
        const partial = [...catalogKeys].some((ck) => ck.includes(key) || key.includes(ck));
        if (!partial) return false;
      }
      return true;
    });
}

function parseExplicitBooleanAssignments(rawCommand) {
  const raw = text(rawCommand);
  const out = {};
  const re = /\b(checkImages|generateImages|touchImages|replaceBadImages|checkPrintables|generatePrintables|touchPrintables|touchSongs|touchBooks|touchCover|publish|connectedUpgrade|connectedAutoApply|textOnly|saveDraft|createLesson|audit|upgradeLesson|upgradeActivities)\s*=\s*(true|false)\b/gi;
  let match;
  while ((match = re.exec(raw))) {
    out[match[1]] = String(match[2]).toLowerCase() === "true";
  }
  return out;
}

function isVocabularyOnlyCommand(rawCommand) {
  const raw = text(rawCommand);
  return (
    /\bvocabular(?:y|ies)\s*[- ]?only\b/i.test(raw)
    || /\btarget\s*:\s*vocabular(?:y|ies)\s*only\b/i.test(raw)
    || /\b(?:fix|repair|upgrade|prove)\s+only\s+(?:the\s+)?vocabular(?:y|ies)\b/i.test(raw)
    || /\bonly\s+(?:fix|repair|upgrade|prove)\s+(?:the\s+)?vocabular(?:y|ies)\b/i.test(raw)
    || /\b(?:controlled|one)\s+(?:vocabular(?:y|ies)[\s-]*only|text[\s-]*only)\b/i.test(raw)
      && /\bvocab/i.test(raw)
    || (/\bweeklyfieldscope\b/i.test(raw) && /\bvocab/i.test(raw) && !/\b(?:learning\s+)?domains?\b/i.test(raw))
  );
}

function isOneLessonScopeCommand(rawCommand) {
  const raw = text(rawCommand);
  return (
    /\bone\s+(?:controlled|existing|lesson|vocabulary)\b/i.test(raw)
    || /\bexisting\s+lesson\s+only\b/i.test(raw)
    || /\bsame\s+lesson\s+id\b/i.test(raw)
    || /\bexactly\s+one\s+lesson\b/i.test(raw)
  );
}

function isImagesExcluded(rawCommand, exclusions = {}) {
  const raw = text(rawCommand);
  return exclusions.touchImages === false
    || /\bimages?\s*:\s*excluded\b/i.test(raw)
    || /\b(?:do\s+not|don['’]?t)\s+(?:touch|generate|create|mutate)\b[^.\n]{0,80}\b(?:images?|pictures?|photos?)\b/i.test(raw)
    || /\bno\s+image\s+(?:generation|mutation|work)\b/i.test(raw);
}

function isPrintablesExcluded(rawCommand, exclusions = {}) {
  const raw = text(rawCommand);
  return exclusions.touchPrintables === false
    || /\bprintables?\s*:\s*excluded\b/i.test(raw)
    || /\b(?:do\s+not|don['’]?t)\s+(?:touch|generate|create|mutate)\b[^.\n]{0,80}\bprintables?\b/i.test(raw);
}

function isBooksExcluded(rawCommand, exclusions = {}) {
  const raw = text(rawCommand);
  return exclusions.touchBooks === false
    || /\bbooks?\s*:\s*excluded\b/i.test(raw)
    || /\bbooks?\s*:\s*excluded\s+from\s+mutation\b/i.test(raw)
    || /\b(?:do\s+not|don['’]?t)\s+(?:touch|change|mutate)\b[^.\n]{0,60}\bbooks?\b/i.test(raw);
}

function isSongsExcluded(rawCommand, exclusions = {}) {
  const raw = text(rawCommand);
  return exclusions.touchSongs === false
    || /\bsongs?\s*:\s*excluded\b/i.test(raw)
    || /\bsongs?\s*:\s*excluded\s+from\s+mutation\b/i.test(raw)
    || /\b(?:do\s+not|don['’]?t)\s+(?:touch|change|mutate)\b[^.\n]{0,60}\bsongs?\b/i.test(raw);
}

function isConnectedUpgradeRequested(rawCommand, explicitBooleans = {}) {
  if (explicitBooleans.connectedUpgrade === true) return true;
  const raw = text(rawCommand);
  return (
    /\bconnected\s+upgrade\b/i.test(raw)
    || /\bconnectedupgrade\s*=\s*true\b/i.test(raw)
    || /\bcontrolled\s+(?:vocabular(?:y|ies)[\s-]*only|text[\s-]*only)\s+connected\s+upgrade\b/i.test(raw)
    || /\b(?:one|existing)\s+(?:controlled\s+)?(?:vocabular(?:y|ies)[\s-]*only|text[\s-]*only)\s+connected\s+upgrade\b/i.test(raw)
    || (/\bconnectedautoapply\s*=\s*true\b/i.test(raw) && /\b(?:existing|same)\s+lesson\b/i.test(raw))
  );
}

function wantsPositiveImageIntent(rawCommand, exclusions = {}) {
  if (isImagesExcluded(rawCommand, exclusions)) return false;
  const raw = text(rawCommand);
  if (/\bgenerateimages\s*=\s*false\b/i.test(raw) || /\btouchimages\s*=\s*false\b/i.test(raw)) return false;
  const mentions = /\b(picture|pictures|image|images|photo|photos|visual|visuals)\b/i.test(raw);
  if (!mentions) return false;
  if (/\b(?:do\s+not|don['’]?t|no)\s+(?:touch|generate|create|mutate)\b[^.\n]{0,80}\b(?:images?|pictures?|photos?|visuals?)\b/i.test(raw)) {
    return false;
  }
  return /\b(add|fix|make|generate|create|upgrade|replace|keep|need|finish)\b/i.test(raw);
}

function applyExplicitBooleanConstraints(actions, explicitBooleans = {}) {
  const next = { ...actions };
  Object.keys(explicitBooleans).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(next, key)) next[key] = explicitBooleans[key];
  });
  if (explicitBooleans.generateImages === false) {
    next.generateImages = false;
    next.replaceBadImages = false;
  }
  if (explicitBooleans.touchImages === false) {
    next.touchImages = false;
    next.generateImages = false;
    next.replaceBadImages = false;
  }
  if (explicitBooleans.checkImages === false) next.checkImages = false;
  if (explicitBooleans.generatePrintables === false) next.generatePrintables = false;
  if (explicitBooleans.touchPrintables === false) {
    next.touchPrintables = false;
    next.generatePrintables = false;
  }
  if (explicitBooleans.checkPrintables === false) next.checkPrintables = false;
  if (explicitBooleans.touchSongs === false) next.touchSongs = false;
  if (explicitBooleans.touchBooks === false) next.touchBooks = false;
  if (explicitBooleans.publish === false) next.publish = false;
  if (explicitBooleans.connectedUpgrade === true) next.connectedUpgrade = true;
  if (explicitBooleans.connectedAutoApply === true) next.connectedAutoApply = true;
  if (explicitBooleans.textOnly === true) next.textOnly = true;
  return next;
}

function applyVocabularyOnlyRouting(state = {}) {
  const raw = text(state.raw);
  if (!isVocabularyOnlyCommand(raw)) return state;
  state.actions.textOnly = true;
  state.actions.weeklyFieldScope = ["vocabCards"];
  state.actions.touchImages = false;
  state.actions.touchPrintables = false;
  state.actions.touchSongs = false;
  state.actions.touchBooks = false;
  state.actions.touchCover = false;
  state.actions.generateImages = false;
  state.actions.generatePrintables = false;
  state.actions.generateSongsBooks = false;
  state.actions.replaceBadImages = false;
  state.actions.checkImages = false;
  state.actions.checkPrintables = false;
  state.actions.upgradeLesson = true;
  state.actions.upgradeActivities = false;
  state.actions.saveDraft = true;
  state.actions.connectedUpgrade = true;
  state.actions.connectedAutoApply = state.actions.planOnly ? false : true;
  state.intent = "fix_lesson";
  state.notes.push("Vocabulary-only scope — assets and unrelated weekly fields locked.");
  return state;
}

function applyNarrowScopeLocks(actions = {}, weeklyFieldScope = null) {
  const next = { ...actions };
  const scope = schema.asArray(weeklyFieldScope);
  if (!scope.length) return next;
  const vocabOnly = scope.length === 1 && scope[0] === "vocabCards";
  if (vocabOnly || next.textOnly) {
    next.touchImages = false;
    next.touchPrintables = false;
    next.touchSongs = false;
    next.touchBooks = false;
    next.generateImages = false;
    next.generatePrintables = false;
    next.generateSongsBooks = false;
    next.replaceBadImages = false;
    next.checkImages = false;
    next.checkPrintables = false;
    next.checkSongs = false;
    next.checkBooks = false;
    next.upgradeActivities = false;
  }
  return next;
}

function validateParsedCommandSafety({
  rawCommand = "",
  command = {},
  explicitLessonIds = [],
  resolvedLessonIds = [],
  confirmReasons = [],
} = {}) {
  const raw = text(rawCommand);
  const actions = command.actions || {};
  const reasons = [...schema.asArray(confirmReasons)];
  const contradictions = [];
  const explicitIds = [...new Set(schema.asArray(explicitLessonIds).map((id) => text(id, 160)).filter(Boolean))];
  const resolvedIds = [...new Set(schema.asArray(resolvedLessonIds).map((id) => text(id, 160)).filter(Boolean))];

  if (explicitIds.length === 1) {
    const unexpected = resolvedIds.filter((id) => !explicitIds.includes(id));
    if (unexpected.length) {
      reasons.push("unexpected_scope_expansion");
      contradictions.push({
        code: "UNEXPECTED_SCOPE_EXPANSION",
        message: "Resolved lesson scope expanded beyond the single explicit lesson ID.",
        explicitLessonIds: explicitIds,
        resolvedLessonIds: resolvedIds,
        unexpectedLessonIds: unexpected,
      });
    }
    if (resolvedIds.length > 1) {
      reasons.push("multiple_lessons_matched");
      contradictions.push({
        code: "UNEXPECTED_SCOPE_EXPANSION",
        message: "One explicit lesson ID was supplied but multiple lessons were resolved.",
        explicitLessonIds: explicitIds,
        resolvedLessonIds: resolvedIds,
      });
    }
  }

  if (isImagesExcluded(raw) && (actions.touchImages === true || actions.generateImages === true
    || /\bgenerateimages\s*=\s*true\b/i.test(raw)
    || /\btouchimages\s*=\s*true\b/i.test(raw))) {
    reasons.push("parsed_intent_contradiction");
    contradictions.push({ code: "PARSED_INTENT_CONTRADICTION", field: "images", message: "Images excluded but parsed actions would mutate images." });
  }
  if (isPrintablesExcluded(raw) && (actions.touchPrintables === true || actions.generatePrintables === true
    || /\bgenerateprintables\s*=\s*true\b/i.test(raw)
    || /\btouchprintables\s*=\s*true\b/i.test(raw))) {
    reasons.push("parsed_intent_contradiction");
    contradictions.push({ code: "PARSED_INTENT_CONTRADICTION", field: "printables", message: "Printables excluded but parsed actions would mutate printables." });
  }
  if (isVocabularyOnlyCommand(raw) && (!actions.weeklyFieldScope || !actions.weeklyFieldScope.includes("vocabCards"))) {
    reasons.push("parsed_intent_contradiction");
    contradictions.push({ code: "PARSED_INTENT_CONTRADICTION", field: "weeklyFieldScope", message: "Vocabulary-only command did not resolve to vocabulary field scope." });
  }
  if (isConnectedUpgradeRequested(raw, parseExplicitBooleanAssignments(raw)) && actions.connectedUpgrade !== true) {
    reasons.push("parsed_intent_contradiction");
    contradictions.push({ code: "PARSED_INTENT_CONTRADICTION", field: "connectedUpgrade", message: "Connected upgrade requested but parsed connectedUpgrade=false." });
  }
  if (/\bpublish\s*=\s*false\b/i.test(raw) && actions.publish === true) {
    reasons.push("parsed_intent_contradiction");
    contradictions.push({ code: "PARSED_INTENT_CONTRADICTION", field: "publish", message: "publish=false requested but parsed publish=true." });
  }
  if ((isOneLessonScopeCommand(raw) || explicitIds.length === 1) && resolvedIds.length > 1) {
    reasons.push("parsed_intent_contradiction");
    contradictions.push({ code: "PARSED_INTENT_CONTRADICTION", field: "lessonScope", message: "One-lesson command resolved to multiple lessons." });
  }
  if (actions.textOnly === true && (actions.generateImages === true || actions.generatePrintables === true || actions.generateSongsBooks === true)) {
    reasons.push("parsed_intent_contradiction");
    contradictions.push({ code: "PARSED_INTENT_CONTRADICTION", field: "textOnly", message: "textOnly=true but asset generation flags are true." });
  }

  const blocked = contradictions.some((c) => c.code === "UNEXPECTED_SCOPE_EXPANSION" || c.code === "PARSED_INTENT_CONTRADICTION")
    || reasons.includes("unexpected_scope_expansion")
    || reasons.includes("parsed_intent_contradiction");

  return {
    ok: !blocked,
    blocked,
    reasons: [...new Set(reasons)],
    contradictions,
  };
}

module.exports = {
  GARBAGE_TITLE_RE,
  isGarbageTitleCandidate,
  extractStructuredLessonTitles,
  sanitizeLessonTitles,
  parseExplicitBooleanAssignments,
  isVocabularyOnlyCommand,
  isOneLessonScopeCommand,
  isImagesExcluded,
  isPrintablesExcluded,
  isBooksExcluded,
  isSongsExcluded,
  isConnectedUpgradeRequested,
  wantsPositiveImageIntent,
  applyExplicitBooleanConstraints,
  applyVocabularyOnlyRouting,
  applyNarrowScopeLocks,
  validateParsedCommandSafety,
};
