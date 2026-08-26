/**
 * AI Curriculum Operator — Phase 6 full Teaching Kit orchestration.
 *
 * Coordinates Phases 1–5. Does not invent a second upgrade engine.
 * Never publishes. Never creates lessons. Cover stays locked unless explicit.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const FULL_KIT_EXECUTION_ORDER = Object.freeze([
  "PARSE_COMMAND",
  "SELECT_LESSONS",
  "INITIAL_AUDIT",
  "BUILD_WORK_PLAN",
  "PRE_JOB_SNAPSHOT",
  "UPGRADE_TEXT",
  "VERIFY_TEXT",
  "SONGS_BOOKS",
  "VERIFY_SONGS_BOOKS",
  "IMAGES",
  "VERIFY_IMAGES",
  "PRINTABLES",
  "VERIFY_PRINTABLES",
  "FINAL_RELOAD",
  "FINAL_TEACHING_KIT_AUDIT",
  "OWNER_REVIEW_STATUS",
  "JOB_SUMMARY",
]);

/**
 * Immutable exclusion / permission flags derived from natural language + typed actions.
 * Later AI planning must not override these.
 */
function normalizeKitScopeFlags(actionsIn = {}, options = {}) {
  const a = actionsIn && typeof actionsIn === "object" ? actionsIn : {};
  const textOnly = options.textOnly === true || a.textOnly === true;
  const lessonContent = textOnly
    ? true
    : (a.upgradeLesson !== false && a.touchDraft !== false);
  const activities = textOnly
    ? true
    : (a.upgradeActivities !== false && a.touchDraft !== false);
  const images = !textOnly
    && a.touchImages !== false
    && a.generateImages === true;
  const printables = !textOnly
    && a.touchPrintables !== false
    && a.generatePrintables === true;
  const songs = !textOnly
    && a.touchSongs !== false
    && a.checkSongs !== false
    && a.generateSongsBooks === true;
  const books = !textOnly
    && a.touchBooks !== false
    && a.checkBooks !== false
    && a.generateSongsBooks === true;
  const cover = a.touchCover === true; // default locked
  return {
    lessonContent: Boolean(lessonContent),
    activities: Boolean(activities),
    songs: Boolean(songs),
    books: Boolean(books),
    images: Boolean(images),
    printables: Boolean(printables),
    cover: Boolean(cover),
    textOnly: Boolean(textOnly),
    locks: {
      images: a.touchImages === false,
      printables: a.touchPrintables === false,
      songs: a.touchSongs === false,
      books: a.touchBooks === false,
      cover: a.touchCover !== true,
      draft: a.touchDraft === false,
    },
  };
}

function countDecisions(list, key = "decision") {
  const counts = {};
  schema.asArray(list).forEach((row) => {
    const d = String(row?.[key] || "UNKNOWN").toUpperCase();
    counts[d] = (counts[d] || 0) + 1;
  });
  return counts;
}

/**
 * Build a human + machine full work plan from an existing audit (Phase 1).
 * Does not mutate curriculum.
 */
function buildFullKitWorkPlan({ plan, audit, kitScope, command } = {}) {
  const scope = kitScope || normalizeKitScopeFlags(command?.actions || {});
  const weekly = schema.asArray(audit?.weeklyContent);
  const activities = schema.asArray(audit?.activities?.items || audit?.activityDecisions);
  const assetPlan = schema.asArray(audit?.assetPlan);
  const songs = schema.asArray(audit?.songs);
  const books = audit?.books ? [audit.books] : [];

  const textPlan = weekly.map((f) => ({
    field: f.field,
    label: f.label || f.field,
    decision: scope.lessonContent ? f.decision : "KEEP",
    reason: scope.locks.draft ? "Text locked by command exclusion." : f.reason,
  }));

  const activityPlan = (activities.length
    ? activities
    : schema.asArray(audit?.activities?.details)
  ).map((a) => ({
    activityId: a.activityId || a.id,
    title: a.title || a.activityTitle,
    decision: scope.activities ? (a.decision || "KEEP") : "KEEP",
    reason: scope.locks.draft ? "Activities locked by command exclusion." : (a.reason || ""),
  }));

  const songPlan = songs.map((s) => ({
    field: s.field,
    weekday: String(s.field || "").replace(/^song\./i, ""),
    decision: scope.songs ? s.decision : "KEEP",
    reason: scope.locks.songs ? "Songs locked by command exclusion." : s.reason,
  }));

  const bookPlan = books.map((b) => ({
    field: "books",
    decision: scope.books ? b.decision : "KEEP",
    reason: scope.locks.books ? "Books locked by command exclusion." : b.reason,
    preview: b.preview,
  }));

  const imagePlan = assetPlan.map((item) => ({
    activityId: item.activityId,
    activityTitle: item.activityTitle,
    decision: scope.images
      ? (item.image?.decision || "NOT_NEEDED")
      : (item.image?.existingUrl ? "KEEP_EXISTING" : "NOT_NEEDED"),
    reason: scope.locks.images
      ? "Images locked by command exclusion."
      : (item.image?.reason || ""),
  }));

  const printablePlan = assetPlan.map((item) => ({
    activityId: item.activityId,
    activityTitle: item.activityTitle,
    decision: scope.printables
      ? (item.printable?.decision || "NOT_NEEDED")
      : (schema.asArray(item.printable?.existingResourceIds).length ? "KEEP_EXISTING" : "NOT_NEEDED"),
    reason: scope.locks.printables
      ? "Printables locked by command exclusion."
      : (item.printable?.reason || ""),
  }));

  const expectedReady = scope.lessonContent || scope.activities || scope.songs
    || scope.books || scope.images || scope.printables;

  return {
    lessonId: schema.text(plan?.id || audit?.lessonId, 160),
    title: schema.text(plan?.title || audit?.title, 180),
    age: schema.text(plan?.age || audit?.age, 80),
    accessPlan: plan?.plan === "Pro" ? "Pro" : (audit?.accessPlan || "Free"),
    kitScope: scope,
    cover: scope.cover ? "UPDATE_IF_REQUESTED" : "LOCKED",
    text: textPlan,
    activities: activityPlan,
    songs: songPlan,
    books: bookPlan,
    images: imagePlan,
    printables: printablePlan,
    counts: {
      text: countDecisions(textPlan),
      activities: countDecisions(activityPlan),
      songs: countDecisions(songPlan),
      books: countDecisions(bookPlan),
      images: countDecisions(imagePlan),
      printables: countDecisions(printablePlan),
    },
    executionOrder: FULL_KIT_EXECUTION_ORDER.slice(),
    expectedOwnerReview: expectedReady ? "READY_FOR_OWNER_REVIEW" : "AUDIT_ONLY",
    publishes: false,
    createsLesson: false,
  };
}

function summarizeWorkPlanForOwner(workPlan) {
  if (!workPlan) return "";
  const lines = [];
  lines.push(String(workPlan.title || workPlan.lessonId || "Lesson").toUpperCase());
  lines.push(`Cover: ${workPlan.cover}`);
  const pushCounts = (label, counts) => {
    const parts = Object.keys(counts || {}).map((k) => `${counts[k]} ${k}`);
    if (parts.length) lines.push(`${label}: ${parts.join(" · ")}`);
  };
  pushCounts("TEXT", workPlan.counts?.text);
  pushCounts("ACTIVITIES", workPlan.counts?.activities);
  pushCounts("SONGS", workPlan.counts?.songs);
  pushCounts("BOOKS", workPlan.counts?.books);
  pushCounts("IMAGES", workPlan.counts?.images);
  pushCounts("PRINTABLES", workPlan.counts?.printables);
  lines.push(`EXPECTED: ${workPlan.expectedOwnerReview}`);
  lines.push("PUBLISH: NOT PUBLISHED");
  return lines.join("\n");
}

/**
 * Soft scope estimate for Phase 6 batch jobs.
 */
function assessFullKitScope({
  lessonCount = 1,
  workPlans = [],
  limits = {},
} = {}) {
  const maxLessons = Number(limits.maxLessons) || schema.DEFAULT_LIMITS.maxLessons;
  const hardMax = Number(limits.hardMaxLessons) || schema.DEFAULT_LIMITS.hardMaxLessons;
  if (lessonCount > hardMax) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Lesson count ${lessonCount} exceeds hard max ${hardMax}.`,
    };
  }
  if (lessonCount > maxLessons) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Lesson count ${lessonCount} exceeds soft max ${maxLessons}.`,
    };
  }
  let plannedImages = 0;
  let plannedPrintables = 0;
  let plannedComposer = 0;
  schema.asArray(workPlans).forEach((wp) => {
    plannedComposer += 1;
    schema.asArray(wp.images).forEach((i) => {
      if (["GENERATE", "REPLACE"].includes(String(i.decision || "").toUpperCase())) plannedImages += 1;
    });
    schema.asArray(wp.printables).forEach((p) => {
      if (["CREATE", "REPLACE"].includes(String(p.decision || "").toUpperCase())) plannedPrintables += 1;
    });
  });
  const maxImages = Number(limits.maxImageGenerations) || schema.DEFAULT_LIMITS.maxImageGenerations;
  const maxPrintables = Number(limits.maxPrintableGenerations) || schema.DEFAULT_LIMITS.maxPrintableGenerations;
  if (plannedImages > maxImages) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Planned image generations ${plannedImages} exceed limit ${maxImages}.`,
      plannedImages,
      plannedPrintables,
      plannedComposer,
    };
  }
  if (plannedPrintables > maxPrintables) {
    return {
      ok: false,
      code: "SCOPE_REVIEW_REQUIRED",
      reason: `Planned printable packs ${plannedPrintables} exceed limit ${maxPrintables}.`,
      plannedImages,
      plannedPrintables,
      plannedComposer,
    };
  }
  return {
    ok: true,
    plannedImages,
    plannedPrintables,
    plannedComposer,
    lessonCount,
  };
}

/**
 * Classify final Owner review status after orchestrated phases.
 */
function classifyFullKitOwnerReview({
  kitScope,
  textOk = true,
  textRan = false,
  songsBooksOk = true,
  songsBooksRan = false,
  imagesOk = true,
  imagesRan = false,
  printablesOk = true,
  printablesRan = false,
  finalVerificationOk = true,
  criticalBlockers = [],
  partialErrors = [],
} = {}) {
  if (!finalVerificationOk) return "BLOCKED";
  if (schema.asArray(criticalBlockers).length) return "BLOCKED";
  if (textRan && !textOk) return "BLOCKED";

  const enabledFailed = [];
  if (kitScope?.songs || kitScope?.books) {
    if (songsBooksRan && !songsBooksOk) enabledFailed.push("songs_books");
  }
  if (kitScope?.images && imagesRan && !imagesOk) enabledFailed.push("images");
  if (kitScope?.printables && printablesRan && !printablesOk) enabledFailed.push("printables");
  if (schema.asArray(partialErrors).length || enabledFailed.length) return "PARTIAL";

  const anyEnabled = Boolean(
    kitScope?.lessonContent || kitScope?.activities || kitScope?.songs
    || kitScope?.books || kitScope?.images || kitScope?.printables,
  );
  if (!anyEnabled) return "AUDIT_ONLY";
  return "READY_FOR_OWNER_REVIEW";
}

/**
 * Final identity + publish lock checks on the reloaded stored lesson.
 */
function verifyFullKitStoredState({ beforePlan, afterPlan, kitScope } = {}) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  pass(beforePlan?.id === afterPlan?.id, "lesson_id", "Lesson ID unchanged.");
  pass(
    schema.text(beforePlan?.title, 180) === schema.text(afterPlan?.title, 180),
    "title",
    "Title unchanged.",
  );
  pass(
    schema.text(beforePlan?.age, 80) === schema.text(afterPlan?.age, 80),
    "age",
    "Age unchanged.",
  );
  pass(
    (beforePlan?.plan === "Pro" ? "Pro" : "Free") === (afterPlan?.plan === "Pro" ? "Pro" : "Free"),
    "access_plan",
    "Access plan unchanged.",
  );
  pass(beforePlan?.status === afterPlan?.status, "publish_status", "Publish status unchanged.");
  pass(afterPlan?.status !== "published" || beforePlan?.status === "published", "not_auto_published", "Operator did not auto-publish.");
  pass(
    schema.text(beforePlan?.weeklyOverview, 500) === schema.text(afterPlan?.weeklyOverview, 500),
    "published_weekly_overview",
    "Published weeklyOverview unchanged.",
  );

  if (kitScope?.locks?.images) {
    const beforeActs = beforePlan?.enrichmentDraft?.activities || {};
    const afterActs = afterPlan?.enrichmentDraft?.activities || {};
    Object.keys(beforeActs).forEach((id) => {
      const b = beforeActs[id] || {};
      const a = afterActs[id] || {};
      pass(
        schema.text(b.setupImageUrl, 500) === schema.text(a.setupImageUrl, 500)
          && schema.text(b.exampleImageUrl, 500) === schema.text(a.exampleImageUrl, 500),
        `image_lock_${id}`,
        `Images locked for activity ${id}.`,
      );
    });
  }
  if (kitScope?.locks?.printables) {
    const beforeIds = schema.asArray(beforePlan?.enrichmentDraft?.week?.printableIds).map(String).sort().join(",");
    const afterIds = schema.asArray(afterPlan?.enrichmentDraft?.week?.printableIds).map(String).sort().join(",");
    pass(beforeIds === afterIds, "printable_lock", "Printable IDs locked by exclusion.");
  }
  if (kitScope?.locks?.cover) {
    pass(
      schema.text(beforePlan?.coverImageUrl || beforePlan?.imageUrl, 500)
        === schema.text(afterPlan?.coverImageUrl || afterPlan?.imageUrl, 500),
      "cover_lock",
      "Cover unchanged (default locked).",
    );
  }

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed };
}

function parseExclusionHints(rawCommand) {
  const raw = String(rawCommand || "");
  const notes = [];
  const flags = {
    touchImages: true,
    touchPrintables: true,
    touchSongs: true,
    touchBooks: true,
    touchCover: false,
    touchDraft: true,
    textOnly: false,
  };

  if (/\bonly\s+(fix|improve|upgrade)\s+(the\s+)?(lesson\s+)?text\b/i.test(raw)
    || /\bonly\s+improve\s+activity\s+descriptions?\b/i.test(raw)
    || /\btext\s+only\b/i.test(raw)
    || /\bonly\s+fix\s+(the\s+)?lesson\s+text\b/i.test(raw)) {
    flags.textOnly = true;
    flags.touchImages = false;
    flags.touchPrintables = false;
    flags.touchSongs = false;
    flags.touchBooks = false;
    notes.push("Text-only scope: images/printables/songs/books locked.");
  }

  if (/\bdo\s+not\s+(?:touch|change|update|make|create|generate)\s+(?:the\s+|activity\s+)?(?:pictures?|images?)\b/i.test(raw)
    || /\bdon['’]?t\s+(?:touch|change|make|create|generate)\s+(?:the\s+|activity\s+)?(?:pictures?|images?)\b/i.test(raw)
    || /\bwithout\s+(?:activity\s+)?(?:pictures?|images?)\b/i.test(raw)
    || /\bleave\s+(?:the\s+)?(?:pictures?|images?)\s+alone\b/i.test(raw)
    || /\bkeep\s+(?:the\s+)?(?:current\s+)?(?:pictures?|images?)\b/i.test(raw)) {
    flags.touchImages = false;
    notes.push("Images locked by exclusion.");
  }

  if (/\bdo\s+not\s+(?:touch|change|update|make|create|generate)\s+(?:the\s+)?printables?\b/i.test(raw)
    || /\bdon['’]?t\s+(?:touch|change|make|create|generate)\s+(?:the\s+)?printables?\b/i.test(raw)
    || /\bwithout\s+printables?\b/i.test(raw)
    || /\bkeep\s+(?:the\s+)?(?:current\s+|existing\s+)?printables?\b/i.test(raw)
    || /\bleave\s+(?:the\s+)?printables?\s+(?:untouched|alone)\b/i.test(raw)
    || /\bprintables?\s+(?:must\s+)?(?:stay|remain)\s+untouched\b/i.test(raw)) {
    flags.touchPrintables = false;
    notes.push("Printables locked by exclusion.");
  }

  if (/\bdo\s+not\s+(?:touch|change)\s+(?:the\s+)?songs?\b/i.test(raw)
    || /\bdon['’]?t\s+(?:touch|change)\s+(?:the\s+)?songs?\b/i.test(raw)
    || /\beverything\s+except\s+songs?\b/i.test(raw)) {
    flags.touchSongs = false;
    notes.push("Songs locked by exclusion.");
  }

  if (/\bdo\s+not\s+(?:touch|change)\s+(?:the\s+)?books?\b/i.test(raw)
    || /\bdon['’]?t\s+(?:touch|change)\s+(?:the\s+)?books?\b/i.test(raw)
    || /\beverything\s+except\s+books?\b/i.test(raw)
    || /\bdo\s+everything\s+except\s+books?\b/i.test(raw)) {
    flags.touchBooks = false;
    notes.push("Books locked by exclusion.");
  }

  if (/\b(?:update|change|replace|create|generate|make|new)\s+(?:a\s+)?(?:realistic\s+)?(?:lesson\s+)?cover\b/i.test(raw)
    || /\bREALISTIC_LESSON_COVER\b/i.test(raw)
    || /\brealistic\s+lesson\s+cover\b/i.test(raw)
    || /\band\s+update\s+(?:the\s+)?cover\b/i.test(raw)) {
    flags.touchCover = true;
    notes.push("Cover update explicitly requested.");
  }

  return { flags, notes };
}

function isFullKitFinishCommand(rawCommand) {
  const raw = String(rawCommand || "");
  return (
    /\bfinish\b.+\b(lesson|plan|kit|watchers|week)\b/i.test(raw)
    || /\bfinish\s+this\s+lesson\b/i.test(raw)
    || /\bfix\s+this\s+lesson\s+completely\b/i.test(raw)
    || /\bfix\s+.+\s+completely\b/i.test(raw)
    || /\bready\s+for\s+(me\s+to\s+)?review\b/i.test(raw)
    || /\bfull\s+teaching\s+kit\b/i.test(raw)
    || /\bupgrade\s+.+\s+to\s+full\s+teaching\s+kit\b/i.test(raw)
    || /\bfix\s+everything\s+missing\b/i.test(raw)
    || /\bget\s+it\s+ready\s+for\s+(me\s+to\s+)?review\b/i.test(raw)
  );
}

module.exports = {
  FULL_KIT_EXECUTION_ORDER,
  normalizeKitScopeFlags,
  buildFullKitWorkPlan,
  summarizeWorkPlanForOwner,
  assessFullKitScope,
  classifyFullKitOwnerReview,
  verifyFullKitStoredState,
  parseExclusionHints,
  isFullKitFinishCommand,
  countDecisions,
};
