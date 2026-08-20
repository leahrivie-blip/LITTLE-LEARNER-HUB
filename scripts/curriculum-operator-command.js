/**
 * AI Curriculum Operator — natural-language → typed command parser (Phase 1).
 * Deterministic rules first (no OpenAI required). Extensible for LLM assist later.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

function parseCount(command) {
  const m = String(command || "").match(/\b(?:top|next|first|the)?\s*(\d{1,2})\b/i)
    || String(command || "").match(/\b(\d{1,2})\s+(?:weakest|lessons?|plans?)\b/i);
  if (!m) return null;
  return schema.clampInt(m[1], 1, schema.DEFAULT_LIMITS.hardMaxLessons, null);
}

function parsePlan(command) {
  const text = String(command || "");
  if (/\bpro\b/i.test(text)) return "Pro";
  if (/\bfree\b/i.test(text)) return "Free";
  return null;
}

function parseAgeBand(command) {
  return schema.normalizeAgeBand(command);
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

function extractNamedLessonHints(command) {
  const titles = extractQuotedTitles(command);
  const text = String(command || "");
  // Title Case capture only — do not use /i on [A-Z] (would swallow lowercase words).
  const checkMatch = text.match(
    /\b(?:[Cc]heck|[Aa]udit|[Ff]ix|[Rr]eview|[Ii]nspect)\s+([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*){0,5})(?=\s+and\b|[,.!?:]|$|\s+to\b)/,
  );
  if (checkMatch) {
    const candidate = checkMatch[1].trim();
    if (!/^(The|All|These|Those|Lessons?|Plans?|Toddler|Preschool|Infant|Pro|Free)\b/.test(candidate)) {
      titles.push(candidate);
    }
  }
  return [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
}

/**
 * @param {string} rawCommand
 * @param {{ currentlySelectedLessonId?: string, phase?: number }} [options]
 */
function parseOperatorCommand(rawCommand, options = {}) {
  const raw = schema.text(rawCommand, 4000);
  const lower = raw.toLowerCase();
  const notes = [];
  const actions = schema.emptyActionsFlags();
  const count = parseCount(raw);
  const plan = parsePlan(raw);
  const ageBand = parseAgeBand(raw);
  const titles = extractNamedLessonHints(raw);
  let selection = "filter";
  let intent = "audit";
  let updatedSince = null;
  let ambiguous = false;
  const confirmReasons = [];
  const phase = schema.clampInt(options.phase, 1, 8, 2);

  if (/\b(weakest|lowest\s+readiness|need(?:s|ed)?\s+the\s+most\s+work|most\s+incomplete)\b/i.test(raw)) {
    selection = "lowest_readiness";
    intent = "audit";
  } else if (/\b(updated|worked\s+on)\s+today\b/i.test(raw) || (/\btoday\b/i.test(raw) && /\b(lesson|plan|worked|updated)\b/i.test(raw))) {
    selection = "updated_today";
    updatedSince = "today";
  } else if (/\bmissing\s+teaching\s+kit\b/i.test(raw) || /\bneed(?:s)?\s+teaching\s+kit\b/i.test(raw)
    || /\bfill\s+(?:the\s+)?missing\b/i.test(raw)) {
    selection = "missing_teaching_kit";
  } else if (/\bweak\s+printables?\b/i.test(raw) || /\bprintables?\s+(?:are\s+)?(?:weak|generic|bad|wrong)\b/i.test(raw)
    || /\bmissing\s+printables?\b/i.test(raw) || /\bneed(?:s)?\s+printables?\b/i.test(raw)) {
    selection = "weak_printables";
    actions.checkPrintables = true;
  } else if (/\b(?:need|missing|without)\s+(?:activity\s+)?(?:pictures?|images?)\b/i.test(raw)
    || /\bactivity\s+(?:pictures?|images?)\b/i.test(raw)) {
    selection = "needs_activity_images";
    actions.checkImages = true;
  } else if (titles.length) {
    selection = "named_titles";
  } else if (options.currentlySelectedLessonId && /\b(this|current|selected)\s+lesson\b/i.test(raw)) {
    selection = "currently_selected";
  }

  const wantsUpgrade = /\b(upgrade|improve|fix|finish|complete|make\s+ready|fill\s+(?:the\s+)?missing|ready\s+for\s+(?:me\s+to\s+)?review)\b/i.test(raw);
  if (wantsUpgrade) {
    intent = titles.length === 1 ? "fix_lesson" : "upgrade_batch";
    actions.upgradeLesson = true;
    actions.upgradeActivities = true;
    actions.saveDraft = true;
    if (phase >= 2) {
      notes.push("Phase 2 will upgrade fields into enrichmentDraft only (not published).");
    } else {
      notes.push("Upgrade requested, but phase 1 will audit/plan only.");
    }
  }
  if (/\b(create|make\s+me|build)\b.+\b(lesson|week)\b/i.test(raw) && !wantsUpgrade) {
    intent = "create_lesson";
    actions.createLesson = true;
    notes.push("New-lesson creation is planned for a later phase.");
  }
  if (/\bpublish\b/i.test(raw) && !/\bready\s+to\s+publish\b/i.test(raw)) {
    actions.publish = true;
    confirmReasons.push("publish_requested");
    notes.push("Publishing is disabled until Phase 8. Draft upgrades only.");
  }
  if (/\b(generate|create|make)\b.+\b(image|picture|photo)s?\b/i.test(raw)) {
    actions.generateImages = true;
    notes.push("Image generation is Phase 3+; not executed now.");
  }
  if (/\b(generate|create|make|finish)\b.+\bprintable/i.test(raw)) {
    actions.generatePrintables = true;
    notes.push("Printable generation is Phase 4+; not executed now.");
  }

  if (!selection || selection === "filter") {
    if (!plan && !ageBand && !titles.length && !count && !/\baudit|find|check|list|show|upgrade|fix|fill|finish\b/i.test(lower)) {
      ambiguous = true;
      confirmReasons.push("ambiguous_scope");
    }
  }

  if (/\ball\s+lessons\b/i.test(raw) && !plan && !ageBand && !count) {
    ambiguous = true;
    confirmReasons.push("unexpectedly_large_scope");
    notes.push("Refusing unlimited catalog scope without filters.");
  }

  const readyToPublishAsk = /\bready\s+to\s+publish\b/i.test(raw)
    || /\beverything\s+that\s+would\s+need\s+to\s+be\s+done\b/i.test(raw);
  if (readyToPublishAsk) {
    actions.validate = true;
    actions.checkSongs = true;
    actions.checkBooks = true;
    actions.checkImages = true;
    actions.checkPrintables = true;
    if (wantsUpgrade || /\bfix\b/i.test(raw)) {
      actions.upgradeLesson = true;
      actions.upgradeActivities = true;
      actions.saveDraft = true;
      intent = titles.length === 1 ? "fix_lesson" : intent;
    }
    notes.push("Will produce Ready-for-Review draft work without publishing.");
  }

  // "Fix Weather Watchers" / "Fix this lesson"
  if (/\bfix\b/i.test(raw) && (titles.length || selection === "currently_selected" || selection === "named_titles")) {
    intent = "fix_lesson";
    actions.upgradeLesson = true;
    actions.upgradeActivities = true;
    actions.saveDraft = true;
  }

  const command = schema.normalizeOperatorCommand({
    rawCommand: raw,
    intent,
    scope: {
      selection,
      count: count || schema.DEFAULT_LIMITS.maxLessons,
      plan,
      ageBand,
      lessonIds: [],
      titles,
      updatedSince,
      currentlySelectedLessonId: options.currentlySelectedLessonId || null,
      requireExplicitIdsIfAmbiguous: true,
    },
    actions,
    limits: {
      maxLessons: count || schema.DEFAULT_LIMITS.maxLessons,
    },
    confirmations: {
      planAcknowledged: false,
      reasons: confirmReasons,
    },
    parsedNotes: notes,
    completion: { phase },
  }, { phase });

  return {
    command,
    ambiguous,
    needsConfirmation: ambiguous || confirmReasons.includes("publish_requested")
      || confirmReasons.includes("unexpectedly_large_scope"),
    confirmReasons: [...new Set(confirmReasons)],
    phase1Executable: true,
    phase2Executable: phase >= 2,
    mutationsStripped: !command.completion.mutationsEnabled,
  };
}

module.exports = {
  parseOperatorCommand,
  parseCount,
  parsePlan,
  parseAgeBand,
  extractNamedLessonHints,
};
