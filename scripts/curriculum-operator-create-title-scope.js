/**
 * create_lesson: quoted "called" titles are new lesson names, not catalog selectors.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const selectApi = require("./curriculum-operator-select.js");
const intentRouter = require("./curriculum-operator-intent-router.js");
const targetsApi = require("./curriculum-operator-semantic-targets.js");

const NEW_LESSON_TITLE_RE = /\b(?:called|named|titled)\s+[“"]([^”"]{2,120})[”"]/i;

const CREATE_GATE_REASONS = Object.freeze([
  "ambiguous_scope",
  "unresolved_target",
  "multiple_lessons_matched",
]);

function text(value, max = 4000) {
  return schema.text(value, max);
}

function titleKey(value) {
  return selectApi.normalizeTitleKey(value);
}

function titlesEqual(a, b) {
  const ka = titleKey(a);
  const kb = titleKey(b);
  return Boolean(ka && kb && ka === kb);
}

/**
 * Explicit new-lesson title from owner wording (called / named / titled).
 * @param {string} rawCommand
 * @returns {string}
 */
function extractRequestedNewLessonTitle(rawCommand) {
  const raw = text(rawCommand, 4000);
  const match = NEW_LESSON_TITLE_RE.exec(raw);
  return match ? match[1].trim() : "";
}

/**
 * Remove the requested new title from lesson-target title hints.
 * @param {string[]} titles
 * @param {string} requestedNewLessonTitle
 * @returns {string[]}
 */
function filterTitlesForTargetResolution(titles, requestedNewLessonTitle) {
  const newTitle = text(requestedNewLessonTitle, 120);
  if (!newTitle) return schema.asArray(titles).slice();
  return schema.asArray(titles).filter((title) => !titlesEqual(title, newTitle));
}

function catalogResolveHints(titles, lessonPlans) {
  const catalog = targetsApi.catalogRows(lessonPlans);
  return targetsApi.resolveRequestedTitles(schema.asArray(titles), catalog, null);
}

/**
 * Owner named a new lesson and also pointed at an existing lesson target.
 * @returns {boolean}
 */
function detectCreateExistingTargetConflict(rawCommand, lessonPlans, requestedNewLessonTitle) {
  const raw = text(rawCommand, 4000);
  const newTitle = text(requestedNewLessonTitle, 120);
  if (!newTitle) return false;

  const explicitIds = intentRouter.extractExplicitLessonIds(raw, lessonPlans);
  if (explicitIds.length) return true;

  const quoted = [];
  const re = /[“"]([^”"]{2,120})[”"]/g;
  let match;
  while ((match = re.exec(raw))) {
    const candidate = match[1].trim();
    if (candidate && !titlesEqual(candidate, newTitle)) quoted.push(candidate);
  }
  if (quoted.length) {
    const resolved = catalogResolveHints(quoted, lessonPlans);
    if (resolved.requested.length || resolved.ambiguous.length) return true;
  }

  const fixMatch = raw.match(
    /\b(?:[Ff]ix|[Rr]eview|[Uu]pgrade|[Cc]omplete)\s+([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*){0,5})(?=\s+and\b|[,.!?:]|$|\s+to\b|\s+but\b|\s+for\b)/,
  );
  if (fixMatch) {
    const candidate = fixMatch[1].trim();
    if (candidate && !titlesEqual(candidate, newTitle)) {
      const resolved = catalogResolveHints([candidate], lessonPlans);
      if (resolved.requested.length || resolved.ambiguous.length) return true;
    }
  }

  return false;
}

function stripCreateTitleGateReasons(confirmReasons) {
  return schema.asArray(confirmReasons).filter((reason) => !CREATE_GATE_REASONS.includes(reason));
}

/**
 * Adjust parse scope so create_lesson "called" titles do not participate in catalog targeting.
 * @returns {{
 *   titles: string[],
 *   lessonIds: string[],
 *   selection: string,
 *   confirmReasons: string[],
 *   requestedNewLessonTitle: string,
 *   createTargetConflict: boolean,
 *   ambiguous: boolean,
 * }}
 */
function applyCreateLessonTitleScope({
  rawCommand,
  titles = [],
  lessonIds = [],
  selection = "filter",
  confirmReasons = [],
  lessonPlans = [],
  isCreateLesson = false,
  ambiguous = false,
} = {}) {
  const base = {
    titles: schema.asArray(titles).slice(),
    lessonIds: schema.asArray(lessonIds).slice(),
    selection: text(selection, 40) || "filter",
    confirmReasons: schema.asArray(confirmReasons).slice(),
    requestedNewLessonTitle: "",
    createTargetConflict: false,
    ambiguous: Boolean(ambiguous),
  };
  if (!isCreateLesson) return base;

  const requestedNewLessonTitle = extractRequestedNewLessonTitle(rawCommand);
  base.requestedNewLessonTitle = requestedNewLessonTitle;

  if (detectCreateExistingTargetConflict(rawCommand, lessonPlans, requestedNewLessonTitle)) {
    base.createTargetConflict = true;
    base.confirmReasons = [...new Set([...base.confirmReasons, "conflicting_create_and_existing"])];
    base.ambiguous = true;
    return base;
  }

  if (!requestedNewLessonTitle) return base;

  base.titles = filterTitlesForTargetResolution(base.titles, requestedNewLessonTitle);
  base.lessonIds = [];
  if (base.selection === "named_titles" || base.selection === "explicit_ids") {
    base.selection = "filter";
  }

  base.confirmReasons = stripCreateTitleGateReasons(base.confirmReasons);
  if (base.confirmReasons.every((r) => r !== "ambiguous_scope" && r !== "unresolved_target")) {
    base.ambiguous = false;
  }
  return base;
}

/**
 * After semantic enrichment, clear create-only gate noise when a new title was explicit.
 */
function finalizeCreateLessonInterpretation(parsed, options = {}) {
  const command = parsed?.command;
  if (!command?.actions?.createLesson) return parsed;
  const raw = command.rawCommand || options.rawCommand || "";
  const requestedNewLessonTitle = extractRequestedNewLessonTitle(raw);
  if (!requestedNewLessonTitle) return parsed;

  if (detectCreateExistingTargetConflict(raw, options.lessonPlans || [], requestedNewLessonTitle)) {
    const reasons = [...new Set([...(parsed.confirmReasons || []), "conflicting_create_and_existing"])];
    return {
      ...parsed,
      ambiguous: true,
      confirmReasons: reasons,
      command: {
        ...command,
        scope: {
          ...(command.scope || {}),
          requestedNewLessonTitle,
        },
        confirmations: {
          ...(command.confirmations || {}),
          reasons,
        },
      },
    };
  }

  const confirmReasons = stripCreateTitleGateReasons(parsed.confirmReasons || []);
  const scope = { ...(command.scope || {}) };
  scope.requestedNewLessonTitle = requestedNewLessonTitle;
  scope.lessonIds = [];
  scope.titles = filterTitlesForTargetResolution(scope.titles, requestedNewLessonTitle);
  if (scope.selection === "named_titles") scope.selection = "filter";

  const interpretation = parsed.interpretation || command.interpretation;
  const nextInterpretation = interpretation && typeof interpretation === "object"
    ? {
      ...interpretation,
      targets: {
        ...(interpretation.targets || {}),
        mode: "create_new",
        ids: [],
        unresolved: [],
        ambiguous: [],
      },
    }
    : interpretation;

  return {
    ...parsed,
    ambiguous: false,
    confirmReasons,
    needsConfirmation: (parsed.needsConfirmation && confirmReasons.some((r) =>
      r === "publish_requested" || r === "possible_duplicate" || r === "scope_review_required"))
      || confirmReasons.includes("publish_requested")
      || confirmReasons.includes("possible_duplicate"),
    command: {
      ...command,
      scope,
      confirmations: {
        ...(command.confirmations || {}),
        reasons: confirmReasons,
      },
      interpretation: nextInterpretation,
    },
    interpretation: nextInterpretation,
    parseSafety: parsed.parseSafety && typeof parsed.parseSafety === "object"
      ? {
        ...parsed.parseSafety,
        blocked: Boolean(parsed.parseSafety.blocked),
        reasons: schema.asArray(parsed.parseSafety.reasons)
          .filter((r) => !CREATE_GATE_REASONS.includes(r)),
      }
      : parsed.parseSafety,
  };
}

module.exports = {
  extractRequestedNewLessonTitle,
  filterTitlesForTargetResolution,
  detectCreateExistingTargetConflict,
  applyCreateLessonTitleScope,
  finalizeCreateLessonInterpretation,
  stripCreateTitleGateReasons,
};
