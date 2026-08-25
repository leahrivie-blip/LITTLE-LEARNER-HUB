/**
 * AI Curriculum Operator — deterministic Owner intent routing.
 *
 * Resolves natural-language commands to existing-lesson workflows vs new-lesson create,
 * using lesson-reference detection, asset/action categories, and fixed precedence rules.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const printableAgeBand = require("./curriculum-operator-printable-age-band.js");

const ROUTES = Object.freeze({
  CREATE_LESSON: "create_lesson",
  EXISTING_PRINTABLE: "existing_printable",
  EXISTING_IMAGE: "existing_image",
  EXISTING_COVER: "existing_cover",
  EXISTING_SONGS_BOOKS: "existing_songs_books",
  EXISTING_CONNECTED_UPGRADE: "existing_connected_upgrade",
  OPERATOR_GENERIC: "operator_generic",
  AMBIGUOUS: "ambiguous",
});

const ASSET_CATEGORIES = Object.freeze([
  "cover",
  "printable",
  "image",
  "songs_books",
  "full_upgrade",
]);

const ACTION_VERBS = /\b(add|make|create|fix|replace|regenerate|finish|complete|upgrade|improve|edit|update|generate|build|upload|need|whatever)\b/i;

const STOP_TITLE_PREFIX = /^(The|All|These|Those|Lessons?|Plans?|Toddler|Toddlers|Preschool|Infant|Infants|Pro|Free|This|Current|Selected|A|An|New)\b/;

function isAgeOrPlanNoiseTitle(candidate) {
  const key = normalizeTitleKey(candidate);
  if (!key) return true;
  if (/^(toddler|toddlers|infant|infants|preschool|school age|mixed ages?|pro|free)$/.test(key)) return true;
  return STOP_TITLE_PREFIX.test(candidate);
}

function text(value, max = 4000) {
  return schema.text(value, max);
}

function normalizeTitleKey(value) {
  return text(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractQuotedTitles(command) {
  const titles = [];
  const re = /[“"]([^”"]{2,120})[”"]/g;
  let match;
  while ((match = re.exec(String(command || "")))) {
    titles.push(match[1].trim());
  }
  return titles;
}

function extractVerbLedTitles(command) {
  const titles = [];
  const textRaw = String(command || "");
  const checkMatch = textRaw.match(
    /\b(?:[Cc]heck|[Aa]udit|[Ff]ix|[Rr]eview|[Ii]nspect|[Ff]inish|[Uu]pgrade|[Cc]omplete|[Ee]dit|[Ii]mprove|[Mm]ake|[Aa]dd|[Uu]pdate|[Rr]eplace|[Gg]enerate|[Cc]reate|[Bb]uild)\s+([A-Z][\w'’\-]*(?:\s+(?:&\s+)?[A-Z][\w'’\-]*){0,6})(?=\s+and\b|[,.!?:]|$|\s+to\b|\s+but\b|\s+for\b|\s+teaching\b|\s+lesson\b|\s+printable\b|\s+pictures?\b|\s+images?\b|\s+cover\b|\s+songs?\b|\s+books?\b)/,
  );
  if (checkMatch) {
    const candidate = checkMatch[1].trim();
    if (!isAgeOrPlanNoiseTitle(candidate)) titles.push(candidate);
  }
  return titles;
}

function extractPrepositionTitles(command) {
  const titles = [];
  const textRaw = String(command || "");
  const re = /\b(?:for|in|to)\s+([A-Z][\w'’\-]*(?:\s+(?:&\s+)?[A-Z][\w'’\-]*){0,6})(?=\s*(?:and\b|teaching\s+kit|lesson|\.|,|$|\b))/g;
  let match;
  while ((match = re.exec(textRaw))) {
    const candidate = match[1].trim();
    if (!isAgeOrPlanNoiseTitle(candidate)) titles.push(candidate);
  }
  return titles;
}

/**
 * @param {string} command
 * @returns {string[]}
 */
function extractLessonTitleHints(command) {
  const merged = [
    ...extractQuotedTitles(command),
    ...extractVerbLedTitles(command),
    ...extractPrepositionTitles(command),
  ];
  return [...new Set(merged.map((t) => t.trim()).filter(Boolean))];
}

function planRowSummary(plan) {
  const ageBand = schema.normalizeAgeBand(plan?.age || plan?.ageBand || plan?.age_band) || "unspecified";
  return {
    id: text(plan?.id, 160),
    title: text(plan?.title, 180),
    age: text(plan?.age, 80),
    ageBand,
    accessPlan: plan?.plan === "Pro" ? "Pro" : "Free",
    status: text(plan?.status, 40),
  };
}

/**
 * Match catalog lesson titles mentioned in free text.
 * @param {string} command
 * @param {object[]} lessonPlans
 */
function matchLessonsFromCatalog(command, lessonPlans = []) {
  const normalizedCommand = normalizeTitleKey(command);
  if (!normalizedCommand) return [];
  const plans = schema.asArray(lessonPlans).filter((p) => p && p.status !== "archived");
  const matches = [];
  plans.forEach((plan) => {
    const title = text(plan.title, 180);
    const key = normalizeTitleKey(title);
    if (!key || key.length < 4) return;
    if (normalizedCommand.includes(key)) {
      matches.push(planRowSummary(plan));
      return;
    }
    const tokens = key.split(" ").filter((t) => t.length > 2 && !/^(the|and|for|with)$/.test(t));
    if (tokens.length < 2) return;
    const hits = tokens.filter((t) => normalizedCommand.includes(t));
    if (hits.length >= Math.min(2, tokens.length)) {
      matches.push(planRowSummary(plan));
    }
  });
  const byId = new Map();
  matches.forEach((row) => { if (row.id) byId.set(row.id, row); });
  return [...byId.values()];
}

/**
 * Short Owner mutation commands that should inherit currentlySelectedLessonId
 * without requiring the literal words "this lesson".
 */
function isShortSelectedLessonMutation(rawCommand) {
  const raw = text(rawCommand);
  if (!raw) return false;
  if (detectNewLessonIntent(raw, { existingLessonIntent: false })) return false;
  if (/\b(finish|improve|fix|upgrade|complete|edit)\s+(it|this)\b/i.test(raw)) return true;
  if (detectAssetCategories(raw).length) return true;
  if (ACTION_VERBS.test(raw) && (
    /\b(books?|songs?|cover|pictures?|images?|photos?|printables?|visuals?|lesson|kit)\b/i.test(raw)
    || /\b(finish|improve|fix|upgrade)\b/i.test(raw)
  )) {
    return true;
  }
  return false;
}

/**
 * @param {string} rawCommand
 * @param {{ currentlySelectedLessonId?: string|null, lessonPlans?: object[] }} [options]
 */
function detectExistingLessonReferences(rawCommand, options = {}) {
  const raw = text(rawCommand);
  const hints = extractLessonTitleHints(raw).filter((t) => !isAgeOrPlanNoiseTitle(t));
  const catalogMatches = matchLessonsFromCatalog(raw, options.lessonPlans || []);
  const selectedId = text(options.currentlySelectedLessonId, 160) || null;
  const selectedLesson = selectedId
    ? catalogMatches.find((m) => m.id === selectedId)
      || schema.asArray(options.lessonPlans).map(planRowSummary).find((m) => m.id === selectedId)
      || null
    : null;

  const refersToThisLesson = /\b(this|current|selected)\s+lesson\b/i.test(raw)
    || /\bfor\s+this\s+one\b/i.test(raw)
    || /\bthis\s+one\b/i.test(raw);
  const shortSelectedMutation = Boolean(
    selectedId && isShortSelectedLessonMutation(raw),
  );
  const newLessonIntent = detectNewLessonIntent(raw, { existingLessonIntent: false });

  const ageScopedHint = /\b(?:the|a)\s+(infant|toddler|preschool|school[\s-]?age|mixed)\s+lesson\b/i.exec(raw);
  let ageScopedMatches = [];
  if (ageScopedHint) {
    const band = schema.normalizeAgeBand(ageScopedHint[1]);
    if (band) {
      ageScopedMatches = schema.asArray(options.lessonPlans)
        .map(planRowSummary)
        .filter((row) => row.ageBand === band);
    }
  }

  const resolvedLessons = [];
  const pushUnique = (row) => {
    if (!row?.id) return;
    if (!resolvedLessons.some((r) => r.id === row.id)) resolvedLessons.push(row);
  };
  catalogMatches.forEach(pushUnique);

  // Selected-lesson inheritance for short mutation commands (no "this lesson" required).
  // Never override an explicit new-lesson create intent.
  if (!newLessonIntent && selectedLesson && (refersToThisLesson || shortSelectedMutation)) {
    // If catalog matched a different named lesson, prefer the named match(es).
    if (!catalogMatches.length || catalogMatches.some((m) => m.id === selectedId)) {
      resolvedLessons.length = 0;
      pushUnique(selectedLesson);
    }
  } else if (!newLessonIntent && selectedId && (refersToThisLesson || shortSelectedMutation) && selectedLesson) {
    pushUnique(selectedLesson);
  }

  if (ageScopedMatches.length === 1) pushUnique(ageScopedMatches[0]);

  const titles = [...new Set([
    ...hints,
    ...resolvedLessons.map((r) => r.title),
  ].filter(Boolean))];

  let source = null;
  if (resolvedLessons.length === 1 && selectedId && resolvedLessons[0].id === selectedId
    && (refersToThisLesson || shortSelectedMutation)) {
    source = "selected";
  } else if (resolvedLessons.length) {
    source = catalogMatches.length ? "catalog" : "title_hint";
  } else if (hints.length) source = "title_hint";
  else if (ageScopedMatches.length === 1) source = "age_filter";

  return {
    titles,
    lessonIds: resolvedLessons.map((r) => r.id),
    resolvedLessons,
    refersToThisLesson,
    shortSelectedMutation,
    usesSelectedContext: refersToThisLesson || shortSelectedMutation,
    selectedLessonId: selectedId,
    source,
    existingLessonIntent: Boolean(
      resolvedLessons.length
      || hints.length
      || ((refersToThisLesson || shortSelectedMutation) && selectedId)
      || ageScopedMatches.length === 1,
    ),
  };
}

/**
 * Explicit new-lesson create intent only — never inferred from teaching-kit phrasing alone.
 * @param {string} rawCommand
 * @param {{ existingLessonIntent?: boolean }} [context]
 */
function detectNewLessonIntent(rawCommand, context = {}) {
  const raw = text(rawCommand);
  if (/\bdo\s+not\s+create\s+(?:a\s+)?new\s+lesson\b/i.test(raw)) return false;
  if (/\b(?:same|existing)\s+lesson\s+id\b/i.test(raw)) return false;
  if (context.existingLessonIntent) return false;
  if (printableAgeBand.isPrintableExistingLessonCommand(raw)) return false;
  if (/\b(?:create|make|build)\s+\d{1,2}\s+new\s+lessons?\b/i.test(raw)) return true;
  if (/\b(\d{1,2})\s+new\s+lessons?\b/i.test(raw) && /\b(?:create|make|build)\b/i.test(raw)) return true;
  if (/\b(?:create|make|build)\s+(?:me\s+)?(?:a\s+|an\s+)?new\b/i.test(raw) && /\blesson\b/i.test(raw)) {
    return true;
  }
  if (/\bmake\s+me\s+a\s+new\b/i.test(raw)) return true;
  if (/\bcreate\s+an?\s+new\b/i.test(raw) && /\b(?:lesson|week)\b/i.test(raw)) return true;
  if (/\bnew\b/i.test(raw) && /\blesson\b/i.test(raw) && /\b(?:create|make|build)\b/i.test(raw)) {
    return true;
  }
  if (
    /\b(?:create|make|build)\s+(?:a\s+|an\s+)?(?:infant|toddler|preschool|school[\s-]?age|pro|free)\b/i.test(raw)
    && /\blesson\b/i.test(raw)
    && !/\b(?:fix|upgrade|finish|improve|edit|replace|add)\b/i.test(raw)
  ) {
    return true;
  }
  return false;
}

function detectAssetCategories(rawCommand) {
  const raw = text(rawCommand);
  const found = [];

  const cover = /\b(cover|cover\s+image|cover\s+photo)\b/i.test(raw) && ACTION_VERBS.test(raw);
  const printableStrong = /\b(printable|printables|pdf|resource\s+pack)\b/i.test(raw);
  const printableTeachingAsset = /\b(station\s+signs?|activity\s+cards?|maker\s+signs?|sorting\s+cards?|dramatic\s+play(?:\s+pack)?)\b/i.test(raw)
    && ACTION_VERBS.test(raw);
  const printable = printableStrong || printableTeachingAsset
    || (/\bprintables?\b/i.test(raw) && ACTION_VERBS.test(raw));

  const image = /\b(picture|pictures|image|images|photo|photos|visuals?)\b/i.test(raw)
    && (ACTION_VERBS.test(raw) || /\b(bad|better|weak)\b/i.test(raw));

  const songsBooksCombined = /\b(songs?\s+and\s+books?|books?\s+and\s+songs?|song\/book|songs\/books)\b/i.test(raw);
  const songsBooksSingle = (/\b(songs?|books?)\b/i.test(raw) && ACTION_VERBS.test(raw));
  const songsBooks = songsBooksCombined || songsBooksSingle;

  const multiAsset = [cover, printable, image, songsBooks].filter(Boolean).length > 1;
  const broadUpgrade = multiAsset
    || /\bpublish[\s-]?ready\b/i.test(raw)
    || /\bauto[\s-]?apply\b/i.test(raw)
    || /\b(?:fix|upgrade|improve|finish|complete)\b/i.test(raw)
      && /\b(?:completely|everything|all\s+weak|teaching\s+kit|ready\s+for\s+(?:me\s+to\s+)?review)\b/i.test(raw)
    || /\bfinish\s+(?:everything|the\s+teaching\s+kit|this\s+lesson|it)\b/i.test(raw)
    || /\bimprove\s+(?:this|it)\b/i.test(raw)
    || /\beverything\s+missing\b/i.test(raw)
    || /\badd\s+anything\s+it\s+needs\b/i.test(raw)
    || orchestrator.isFullKitFinishCommand(raw)
    || (/\b(?:fix|upgrade|improve|finish|complete|edit)\b/i.test(raw)
      && /\bteaching\s+kit\b/i.test(raw)
      && !printableStrong && !image && !cover && !songsBooksSingle);

  if (cover) found.push("cover");
  if (printable) found.push("printable");
  if (image) found.push("image");
  if (songsBooks) found.push("songs_books");
  if (broadUpgrade) found.push("full_upgrade");

  return found;
}

function pickPrimaryAssetCategory(categories) {
  const set = new Set(schema.asArray(categories));
  if (set.has("full_upgrade") || set.size > 1) return "full_upgrade";
  for (const key of ASSET_CATEGORIES) {
    if (set.has(key)) return key;
  }
  return null;
}

/** Owner asked for plan/preview only — successful upgrades must not auto-save into the lesson record. */
function isPlanOnlyOperatorCommand(rawCommand) {
  const raw = text(rawCommand);
  if (!raw) return false;
  return (
    /\bplan[\s-]?only\b/i.test(raw)
    || /\bpreview\s+(?:what\s+you\s+would\s+change|only)\b/i.test(raw)
    || /\bshow\s+me\s+(?:the\s+)?upgrade\s+plan\b/i.test(raw)
    || /\b(?:don['’]?t|do\s+not)\s+apply\b/i.test(raw)
    || /\bwithout\s+applying\b/i.test(raw)
    || /\bdo\s+not\s+(?:save|write|merge)\b/i.test(raw)
  );
}

function buildInheritedContext(resolvedLessons) {
  if (resolvedLessons.length !== 1) return null;
  const lesson = resolvedLessons[0];
  const ageResolved = printableAgeBand.resolvePrintableAgeBand({
    id: lesson.id,
    title: lesson.title,
    age: lesson.age,
    ageBand: lesson.ageBand,
  });
  return {
    lessonId: lesson.id,
    title: lesson.title,
    age: lesson.age,
    ageBand: ageResolved.ok ? ageResolved.ageBand : lesson.ageBand,
    accessPlan: lesson.accessPlan,
  };
}

/**
 * @param {string} rawCommand
 * @param {{ phase?: number, currentlySelectedLessonId?: string|null, lessonPlans?: object[] }} [options]
 */
function resolveOwnerIntent(rawCommand, options = {}) {
  const raw = text(rawCommand);
  const phase = schema.clampInt(options.phase, 1, 8, 7);
  const lessonRef = detectExistingLessonReferences(raw, options);
  const newLessonIntent = detectNewLessonIntent(raw, {
    existingLessonIntent: lessonRef.existingLessonIntent,
  });
  const assetCategories = detectAssetCategories(raw);
  const assetCategory = pickPrimaryAssetCategory(assetCategories);
  const inherited = buildInheritedContext(lessonRef.resolvedLessons);
  const notes = [];

  let route = ROUTES.OPERATOR_GENERIC;
  let needsClarification = false;
  const clarificationReasons = [];

  const hasMutationVerb = ACTION_VERBS.test(raw)
    || /\b(audit|find|check|list|show)\b/i.test(raw);

  if (lessonRef.existingLessonIntent && newLessonIntent) {
    needsClarification = true;
    clarificationReasons.push("conflicting_create_and_existing");
    route = ROUTES.AMBIGUOUS;
  } else if (newLessonIntent) {
    route = ROUTES.CREATE_LESSON;
  } else if (lessonRef.existingLessonIntent) {
    if (assetCategory === "cover") route = ROUTES.EXISTING_COVER;
    else if (assetCategory === "printable") route = ROUTES.EXISTING_PRINTABLE;
    else if (assetCategory === "image") route = ROUTES.EXISTING_IMAGE;
    else if (assetCategory === "songs_books") route = ROUTES.EXISTING_SONGS_BOOKS;
    else if (
      assetCategory === "full_upgrade"
      || /\b(?:fix|upgrade|improve|finish|complete|edit)\b/i.test(raw)
      || /\bpublish[\s-]?ready\b/i.test(raw)
    ) {
      route = ROUTES.EXISTING_CONNECTED_UPGRADE;
    } else if (/\b(?:add|make|create|generate|fix|replace|update)\b/i.test(raw)) {
      route = ROUTES.EXISTING_CONNECTED_UPGRADE;
      notes.push("Existing-lesson command without a focused asset — routing to connected upgrade.");
    } else {
      route = ROUTES.OPERATOR_GENERIC;
    }
  } else if (hasMutationVerb && !/\b(?:audit|find|check|list|show|weakest)\b/i.test(raw)) {
    needsClarification = true;
    clarificationReasons.push("ambiguous_scope");
    route = ROUTES.AMBIGUOUS;
  }

  if (lessonRef.refersToThisLesson && !options.currentlySelectedLessonId) {
    needsClarification = true;
    clarificationReasons.push("missing_selected_lesson");
    route = ROUTES.AMBIGUOUS;
  } else if (
    lessonRef.shortSelectedMutation
    && !options.currentlySelectedLessonId
    && lessonRef.resolvedLessons.length !== 1
  ) {
    needsClarification = true;
    clarificationReasons.push("ambiguous_scope");
    route = ROUTES.AMBIGUOUS;
  }

  if (lessonRef.titles.length && !lessonRef.resolvedLessons.length && (options.lessonPlans || []).length) {
    notes.push("Lesson title hint present but not matched in catalog — selection may fail until title is confirmed.");
  }

  if (lessonRef.resolvedLessons.length > 1 && route !== ROUTES.OPERATOR_GENERIC) {
    needsClarification = true;
    clarificationReasons.push("multiple_lessons_matched");
    route = ROUTES.AMBIGUOUS;
  }

  const selection = lessonRef.lessonIds.length === 1
    ? "explicit_ids"
    : (lessonRef.usesSelectedContext && options.currentlySelectedLessonId
      ? "currently_selected"
      : (lessonRef.titles.length ? "named_titles" : "filter"));

  if (
    /\bauto[\s-]?apply\b/i.test(raw)
    && lessonRef.existingLessonIntent
    && lessonRef.resolvedLessons.length === 1
    && !newLessonIntent
  ) {
    route = ROUTES.EXISTING_CONNECTED_UPGRADE;
    needsClarification = false;
    clarificationReasons.length = 0;
    notes.push("Explicit auto-apply request — routing to connected upgrade for the resolved existing lesson.");
  }

  return {
    route,
    existingLessonIntent: lessonRef.existingLessonIntent,
    newLessonIntent,
    needsClarification,
    clarificationReasons: [...new Set(clarificationReasons)],
    assetCategory,
    assetCategories,
    lessonReference: {
      titles: lessonRef.titles,
      lessonIds: lessonRef.lessonIds,
      resolvedLessons: lessonRef.resolvedLessons,
      source: lessonRef.source,
      selection,
    },
    inheritFromLesson: inherited,
    forceNotCreateLesson: lessonRef.existingLessonIntent && !newLessonIntent,
    forceCreateLesson: newLessonIntent && !lessonRef.existingLessonIntent,
    notes,
    phase,
  };
}

/**
 * Apply routing decisions onto parseOperatorCommand working state.
 * @param {object} state — mutable flags from parseOperatorCommand
 * @param {ReturnType<typeof resolveOwnerIntent>} intent
 */
function applyIntentRouting(state, intent) {
  if (!intent || !state) return;

  const planOnly = isPlanOnlyOperatorCommand(state.raw);
  state.actions.planOnly = planOnly;
  if (planOnly) {
    state.actions.connectedAutoApply = false;
    state.notes.push("Plan-only / preview-only — will not auto-apply enrichment into the editable lesson record.");
  }

  if (intent.lessonReference.titles.length) {
    state.titles = [...new Set([...(state.titles || []), ...intent.lessonReference.titles])];
  }
  if (intent.lessonReference.lessonIds.length === 1) {
    state.lessonIds = intent.lessonReference.lessonIds.slice();
    state.selection = "explicit_ids";
  } else if (intent.lessonReference.selection === "currently_selected") {
    state.selection = "currently_selected";
  } else if (intent.lessonReference.titles.length) {
    state.selection = "named_titles";
  }

  if (intent.forceNotCreateLesson) state.isCreateCommand = false;
  if (intent.forceCreateLesson) state.isCreateCommand = true;

  if (intent.needsClarification) {
    state.ambiguous = true;
    intent.clarificationReasons.forEach((r) => state.confirmReasons.push(r));
  }

  if (intent.inheritFromLesson?.ageBand && !state.ageBand) {
    state.ageBand = intent.inheritFromLesson.ageBand;
  }
  if (intent.inheritFromLesson?.accessPlan && !state.plan) {
    state.plan = intent.inheritFromLesson.accessPlan;
  }

  const route = intent.route;
  const phase = intent.phase || state.phase || 7;

  if (route === ROUTES.EXISTING_CONNECTED_UPGRADE) {
    state.isCreateCommand = false;
    state.actions.createLesson = false;
    state.intent = phase >= 6 ? "finish_full_kit" : "fix_lesson";
    state.actions.upgradeLesson = state.actions.touchDraft !== false;
    state.actions.upgradeActivities = state.actions.touchDraft !== false;
    state.actions.saveDraft = true;
    const planOnly = state.actions.planOnly === true;
    if (phase >= 6) {
      state.actions.connectedUpgrade = true;
      state.actions.connectedAutoApply = !planOnly;
      if (!planOnly && !state.actions.textOnly) {
        if (state.actions.touchSongs !== false || state.actions.touchBooks !== false) {
          state.actions.generateSongsBooks = true;
          state.actions.checkSongs = state.actions.touchSongs !== false;
          state.actions.checkBooks = state.actions.touchBooks !== false;
        }
        if (state.actions.touchImages !== false) {
          state.actions.generateImages = true;
          state.actions.checkImages = true;
        }
        if (state.actions.touchPrintables !== false) {
          state.actions.generatePrintables = true;
          state.actions.checkPrintables = true;
        }
      }
      state.notes.push("Existing-lesson connected upgrade — lesson record is source of truth for age/access.");
    } else {
      state.notes.push("Existing-lesson upgrade — lesson record is source of truth for age/access.");
    }
  } else if (route === ROUTES.EXISTING_PRINTABLE) {
    state.isCreateCommand = false;
    state.actions.createLesson = false;
    state.actions.generatePrintables = phase === 4 || phase >= 6;
    state.actions.checkPrintables = true;
    state.actions.saveDraft = state.actions.generatePrintables || state.actions.saveDraft;
    state.intent = phase === 4 ? "finish_printables" : (state.titles?.length === 1 ? "fix_lesson" : "finish_printables");
    state.notes.push("Printable workflow — parent lesson age/access inherited from lesson record.");
  } else if (route === ROUTES.EXISTING_IMAGE) {
    state.isCreateCommand = false;
    state.actions.createLesson = false;
    state.actions.generateImages = phase === 3 || phase >= 6;
    state.actions.checkImages = true;
    state.actions.saveDraft = state.actions.generateImages || state.actions.saveDraft;
    if (/\b(bad|replace|weak)\b/i.test(state.raw || "")) state.actions.replaceBadImages = true;
    state.intent = state.titles?.length === 1 ? "fix_lesson" : "finish_images";
  } else if (route === ROUTES.EXISTING_COVER) {
    state.isCreateCommand = false;
    state.actions.createLesson = false;
    state.actions.touchCover = true;
    state.actions.saveDraft = true;
    state.intent = "fix_lesson";
    state.notes.push("Cover update explicitly requested for existing lesson.");
  } else if (route === ROUTES.EXISTING_SONGS_BOOKS) {
    state.isCreateCommand = false;
    state.actions.createLesson = false;
    state.intent = state.titles?.length === 1 ? "fix_lesson" : "finish_songs_books";
    state.actions.generateSongsBooks = phase >= 5;
    state.actions.checkSongs = state.actions.touchSongs !== false;
    state.actions.checkBooks = state.actions.touchBooks !== false;
    state.actions.saveDraft = phase >= 5 || state.actions.saveDraft;
  } else if (route === ROUTES.CREATE_LESSON) {
    state.isCreateCommand = true;
  } else if (route === ROUTES.AMBIGUOUS) {
    state.isCreateCommand = false;
    state.actions.createLesson = false;
  }

  intent.notes.forEach((n) => state.notes.push(n));
  state.intentRoute = intent.route;
  state.inheritFromLesson = intent.inheritFromLesson;
}

module.exports = {
  ROUTES,
  ASSET_CATEGORIES,
  extractLessonTitleHints,
  matchLessonsFromCatalog,
  detectExistingLessonReferences,
  detectNewLessonIntent,
  detectAssetCategories,
  isShortSelectedLessonMutation,
  pickPrimaryAssetCategory,
  isPlanOnlyOperatorCommand,
  resolveOwnerIntent,
  applyIntentRouting,
  isExistingLessonOperationCommand: printableAgeBand.isPrintableExistingLessonCommand,
};
