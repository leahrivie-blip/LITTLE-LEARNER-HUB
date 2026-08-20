/**
 * AI Curriculum Operator — natural-language → typed command parser (Phase 1).
 * Deterministic rules first (no OpenAI required). Extensible for LLM assist later.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");

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
    /\b(?:[Cc]heck|[Aa]udit|[Ff]ix|[Rr]eview|[Ii]nspect|[Ff]inish|[Uu]pgrade|[Cc]omplete)\s+([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*){0,5})(?=\s+and\b|[,.!?:]|$|\s+to\b|\s+but\b|\s+for\b)/,
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
  const phase = schema.clampInt(options.phase, 1, 8, 6);
  const exclusions = orchestrator.parseExclusionHints(raw);
  exclusions.notes.forEach((n) => notes.push(n));
  Object.assign(actions, {
    touchImages: exclusions.flags.touchImages,
    touchPrintables: exclusions.flags.touchPrintables,
    touchSongs: exclusions.flags.touchSongs,
    touchBooks: exclusions.flags.touchBooks,
    touchCover: exclusions.flags.touchCover,
    touchDraft: exclusions.flags.touchDraft,
    textOnly: exclusions.flags.textOnly,
  });
  if (!exclusions.flags.touchImages) {
    actions.generateImages = false;
    actions.replaceBadImages = false;
  }
  if (!exclusions.flags.touchPrintables) actions.generatePrintables = false;

  if (/\b(?:need|missing|without|weakest)\s+(?:activity\s+)?(?:pictures?|images?)\b/i.test(raw)
    || /\bactivity\s+(?:pictures?|images?)\b/i.test(raw)
    || /\bweak(?:est)?\s+activity\s+(?:pictures?|images?)\b/i.test(raw)
    || /\bweakest\s+(?:activity\s+)?(?:pictures?|images?)\b/i.test(raw)) {
    selection = "needs_activity_images";
    actions.checkImages = true;
  } else if (/\b(weakest|lowest\s+readiness|need(?:s|ed)?\s+the\s+most\s+work|most\s+incomplete)\b/i.test(raw)) {
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
  } else if (titles.length) {
    selection = "named_titles";
  } else if (options.currentlySelectedLessonId && /\b(this|current|selected)\s+lesson\b/i.test(raw)) {
    selection = "currently_selected";
  }

  const mentionsImages = /\b(picture|pictures|image|images|photo|photos)\b/i.test(raw);
  const wantsImages = mentionsImages
    && /\b(fix|make|generate|create|upgrade|replace|keep|need)\b/i.test(raw);
  const wantsSongsBooks = (
    /\b(songs?\s+and\s+books?|books?\s+and\s+songs?|song\/book|songs\/books)\b/i.test(raw)
    || (/\b(songs?|books?)\b/i.test(raw)
      && /\b(finish|complete|fix|add|improve|check|fill)\b/i.test(raw)
      && !wantsImages
      && !/\bprintable/i.test(raw))
  );
  const wantsPrintables = /\b(printable|printables|pdf|resource pack)\b/i.test(raw)
    && /\b(fix|make|generate|create|upgrade|replace|keep|finish|need)\b/i.test(raw);
  const noTouchPrintables = exclusions.flags.touchPrintables === false
    || /\bdo\s+not\s+touch\s+(?:the\s+)?printables?\b/i.test(raw)
    || /\bleave\s+(?:the\s+)?printables?\s+alone\b/i.test(raw);
  const imageFocusedFix = wantsImages
    && /\bfix\b/i.test(raw)
    && !/\b(upgrade|improve|including|lesson\s+content|text|fields)\b/i.test(raw);
  const printableFocusedFix = wantsPrintables
    && /\bfix\b/i.test(raw)
    && !/\b(upgrade|improve|including|lesson\s+content|text|fields|pictures?|images?)\b/i.test(raw);
  const wantsUpgrade = /\b(upgrade|improve|finish|complete|make\s+ready|fill\s+(?:the\s+)?missing|ready\s+for\s+(?:me\s+to\s+)?review)\b/i.test(raw)
    || (/\bfix\b/i.test(raw) && !imageFocusedFix && !mentionsImages);
  const noTouchImages = exclusions.flags.touchImages === false;
  const replaceBadOnly = /\b(keep\s+(?:all\s+)?good|only\s+replace\s+(?:the\s+)?bad|replace\s+(?:the\s+)?bad)\b/i.test(raw);
  const fullKitFinish = phase >= 6 && orchestrator.isFullKitFinishCommand(raw)
    && !wantsSongsBooks
    && !printableFocusedFix
    && !(imageFocusedFix && !wantsUpgrade);

  if (noTouchImages) {
    actions.touchImages = false;
    actions.generateImages = false;
    actions.replaceBadImages = false;
    if (!exclusions.notes.length) notes.push("Image actions disabled for this command.");
  }

  if (wantsSongsBooks && !fullKitFinish) {
    intent = titles.length === 1 ? "fix_lesson" : "finish_songs_books";
    if (/\b(finish|complete|fill)\s+(the\s+)?(songs?|books?)/i.test(raw)
      || /\bsongs?\s+and\s+books?\b/i.test(raw)
      || /\bbooks?\s+and\s+songs?\b/i.test(raw)) {
      intent = "finish_songs_books";
    }
    actions.generateSongsBooks = phase >= 5;
    actions.checkSongs = actions.touchSongs !== false;
    actions.checkBooks = actions.touchBooks !== false;
    actions.saveDraft = phase >= 5;
    if (phase < 6) {
      actions.generateImages = false;
      actions.generatePrintables = false;
    }
    if (phase >= 5 && phase < 6) {
      notes.push("Phase 5 will finish songs/books into enrichmentDraft only (not published). No image/printable changes.");
    } else if (phase >= 6) {
      notes.push("Songs/books included in Phase 6 full-kit finish.");
    } else {
      notes.push("Songs/books generation is Phase 5+; not executed now.");
    }
  }

  if (wantsImages && !noTouchImages && !fullKitFinish) {
    intent = selection === "needs_activity_images" || /\bweakest\b/i.test(raw)
      ? "finish_images"
      : (titles.length === 1 ? "fix_lesson" : "finish_images");
    actions.generateImages = (phase === 3) || (phase >= 6);
    actions.checkImages = true;
    actions.saveDraft = actions.generateImages || actions.saveDraft;
    if (replaceBadOnly) actions.replaceBadImages = true;
    if (phase === 3) {
      notes.push("Phase 3 will generate/replace only useful activity images into enrichmentDraft (not published).");
    } else if (phase === 5) {
      actions.generateImages = false;
      notes.push("Phase 5 does not regenerate activity images.");
    } else if (phase >= 6) {
      notes.push("Phase 6 may generate justified activity images when not locked.");
    } else {
      notes.push("Image generation is Phase 3+; not executed now.");
    }
  }

  if (fullKitFinish) {
    intent = (selection === "lowest_readiness" || (count && count > 1) || titles.length > 1)
      ? "upgrade_batch"
      : "finish_full_kit";
    actions.upgradeLesson = actions.touchDraft !== false;
    actions.upgradeActivities = actions.touchDraft !== false;
    actions.saveDraft = true;
    if (!actions.textOnly) {
      if (actions.touchSongs !== false || actions.touchBooks !== false) {
        actions.generateSongsBooks = true;
        actions.checkSongs = actions.touchSongs !== false;
        actions.checkBooks = actions.touchBooks !== false;
      }
      if (actions.touchImages !== false) {
        actions.generateImages = true;
        actions.checkImages = true;
        if (replaceBadOnly) actions.replaceBadImages = true;
      }
      if (actions.touchPrintables !== false) {
        actions.generatePrintables = true;
        actions.checkPrintables = true;
      }
    }
    notes.push("Phase 6 full Teaching Kit finish — draft only, not published. Exclusions are immutable.");
  } else if (wantsUpgrade && !wantsSongsBooks) {
    intent = titles.length === 1 ? "fix_lesson" : (intent === "finish_images" ? intent : "upgrade_batch");
    actions.upgradeLesson = true;
    actions.upgradeActivities = true;
    actions.saveDraft = true;
    if (/\bincluding\s+(?:the\s+)?pictures?\b/i.test(raw) && !noTouchImages && (phase === 3 || phase >= 6)) {
      actions.generateImages = true;
      actions.checkImages = true;
    }
    if (phase >= 6) {
      intent = selection === "lowest_readiness" || (count && count > 1) ? "upgrade_batch" : "finish_full_kit";
      if (!actions.textOnly) {
        if (actions.touchSongs !== false || actions.touchBooks !== false) actions.generateSongsBooks = true;
        if (actions.touchImages !== false) actions.generateImages = true;
        if (actions.touchPrintables !== false) actions.generatePrintables = true;
      }
      notes.push("Phase 6 will orchestrate permitted Teaching Kit upgrades into enrichmentDraft (not published).");
    } else if (phase >= 2) {
      notes.push("Phase 2+ will upgrade fields into enrichmentDraft only (not published).");
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
  if (/\b(generate|create|make)\b.+\b(image|picture|photo)s?\b/i.test(raw) && !noTouchImages) {
    actions.generateImages = phase === 3 || phase >= 6;
    if (phase < 3) notes.push("Image generation is Phase 3+; not executed now.");
    if (phase === 5) {
      actions.generateImages = false;
      notes.push("Phase 5 does not regenerate activity images.");
    }
  }
  if (!fullKitFinish && (/\b(generate|create|make|finish)\b.+\bprintable/i.test(raw) || (wantsPrintables && !noTouchPrintables))) {
    actions.generatePrintables = phase === 4 || phase >= 6;
    actions.checkPrintables = true;
    actions.saveDraft = actions.generatePrintables || actions.saveDraft;
    if (phase === 4) {
      intent = selection === "weak_printables" ? "finish_printables" : (titles.length === 1 ? "fix_lesson" : "finish_printables");
      actions.generateImages = false;
      actions.generateSongsBooks = false;
      notes.push("Phase 4 will create/replace only useful activity-driven printables into draft resources (not published).");
    } else if (phase === 5) {
      actions.generatePrintables = false;
      notes.push("Phase 5 does not regenerate printables.");
    } else if (phase >= 6) {
      notes.push("Phase 6 may create justified printables when not locked.");
    } else {
      notes.push("Printable generation is Phase 4+; not executed now.");
    }
  }
  if (noTouchPrintables) {
    actions.touchPrintables = false;
    actions.generatePrintables = false;
    if (!exclusions.notes.some((n) => /printable/i.test(n))) {
      notes.push("Printable actions disabled for this command.");
    }
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

  // "Fix Weather Watchers" / "Fix this lesson" — full kit at phase 6 unless focused
  if (/\bfix\b/i.test(raw) && (titles.length || selection === "currently_selected" || selection === "named_titles" || selection === "weak_printables")) {
    if (fullKitFinish) {
      // already configured above
    } else if (wantsSongsBooks && phase >= 5 && phase < 6) {
      intent = "finish_songs_books";
      actions.generateSongsBooks = true;
      actions.checkSongs = true;
      actions.checkBooks = true;
      actions.saveDraft = true;
      actions.generateImages = false;
      actions.generatePrintables = false;
    } else if (printableFocusedFix && phase === 4) {
      intent = "finish_printables";
      actions.generatePrintables = true;
      actions.checkPrintables = true;
      actions.saveDraft = true;
      actions.generateImages = false;
    } else if (imageFocusedFix || (wantsImages && !wantsUpgrade)) {
      intent = imageFocusedFix || wantsImages ? (wantsUpgrade ? "fix_lesson" : "finish_images") : "fix_lesson";
      if (!imageFocusedFix) {
        actions.upgradeLesson = true;
        actions.upgradeActivities = true;
        actions.saveDraft = true;
      } else if (phase === 3 || phase >= 6) {
        actions.generateImages = true;
        actions.checkImages = true;
        actions.saveDraft = true;
        actions.replaceBadImages = true;
      }
    } else if (!wantsSongsBooks) {
      intent = phase >= 6 ? "finish_full_kit" : "fix_lesson";
      actions.upgradeLesson = true;
      actions.upgradeActivities = true;
      actions.saveDraft = true;
      if (phase >= 6 && !actions.textOnly) {
        if (actions.touchSongs !== false || actions.touchBooks !== false) actions.generateSongsBooks = true;
        if (actions.touchImages !== false) actions.generateImages = true;
        if (actions.touchPrintables !== false) actions.generatePrintables = true;
      }
    }
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
