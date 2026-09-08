"use strict";

/**
 * Owner Lesson Complete — substantive content quality for READY.
 * Field presence alone is never enough; thin / placeholder / title-echo text fails.
 */

function text(v) {
  return String(v == null ? "" : v).trim();
}

function lines(v) {
  if (Array.isArray(v)) return v.map(text).filter(Boolean);
  return String(v || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function wordCount(v) {
  return text(v).split(/\s+/).filter(Boolean).length;
}

function sentenceCount(v) {
  const raw = text(v);
  if (!raw) return 0;
  return raw.split(/[.!?]+/).map((s) => s.trim()).filter((s) => wordCount(s) >= 3).length;
}

const PLACEHOLDER_RE =
  /coming soon|theme focus coming soon|lorem ipsum|\btodo\b|\btbd\b|placeholder|\[insert|set up materials\.?$|supervise (the )?children\.?$|have fun\.?$/i;

const GENERIC_OBJECTIVE_RE =
  /^children will (learn about|explore|discover|have fun with)\b.{0,40}$/i;

const GENERIC_DESCRIPTION_RE =
  /^children will (explore|learn about|discover)\b.{0,50}$/i;

const GENERIC_SETUP_RE =
  /^(set up materials\.?|circle on rug\.?|open space\.?|small (circle|table|group)\.?|cozy (corner|space)\.?)$/i;

const GENERIC_QUESTION_RE =
  /^(what do you see\??|what do you notice\??|tell me about it\.?)$/i;

function isPlaceholderText(value) {
  return PLACEHOLDER_RE.test(text(value));
}

function normalizeForCompare(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleEcho(value, title) {
  const a = normalizeForCompare(value);
  const b = normalizeForCompare(title);
  if (!a || !b) return false;
  return a === b || a === `children will ${b}` || a === `explore ${b}`;
}

function materialItems(activity) {
  return lines(activity?.materials).filter((m) => !/^(none|n\/?a)\.?$/i.test(m));
}

function softCategory(activity) {
  return text(activity?.activityCategory).toLowerCase();
}

function activityExpectsMaterialsList(activity) {
  const cat = softCategory(activity);
  const items = materialItems(activity);
  if (items.length) return true;
  // Songs / pure circle with explicitly none may skip a long list.
  if (/(song|music|circle|fingerplay|transition)/.test(cat)) return false;
  return true;
}

function activityExpectsQuestions(activity) {
  const cat = softCategory(activity);
  // Infant sensory / nonverbal — teacher language still expected, but as narration.
  if (/(infant|sensory|non-?verbal)/.test(cat)) return false;
  return true;
}

function activityExpectsSubstitutions(activity) {
  return materialItems(activity).length >= 2 || activityExpectsMaterialsList(activity);
}

function activityExpectsChallenge(activity) {
  const cat = softCategory(activity);
  // Pure goodbye/transition may skip challenge; everything else should have an extension.
  if (/(transition|goodbye|cleanup song)/.test(cat)) return false;
  return true;
}

function activityExpectsMixedAge(activity) {
  return true;
}

function activityExpectsTips(activity) {
  return true;
}

function activityExpectsCleanup(activity) {
  if (!activity || typeof activity !== "object") return false;
  if (activity.cleanupNotApplicable === true || activity.cleanupRequired === false) return false;
  const tip = text(activity.cleanupTips || activity.cleanup || activity.resetNotes);
  if (/^(n\/?a|none|not applicable|no cleanup( needed)?)\.?$/i.test(tip)) return false;
  const materials = text(activity.materials);
  const noMaterials = !materials || /^(none|n\/?a)\.?$/i.test(materials);
  const cat = softCategory(activity);
  if (noMaterials && /(circle|song|music|movement|story|transition|fingerplay)/.test(cat)) {
    return false;
  }
  return true;
}

function listFieldQuality(value, { minItems = 1, minWordsPerItem = 3 } = {}) {
  const items = lines(value);
  if (items.length < minItems) return { ok: false, reason: `list(${items.length}/${minItems})` };
  const thin = items.filter((item) => wordCount(item) < minWordsPerItem || isPlaceholderText(item));
  if (thin.length === items.length) return { ok: false, reason: "list_thin" };
  return { ok: true, items };
}

function proseQuality(value, {
  minWords = 12,
  minSentences = 1,
  title = "",
  rejectGeneric,
} = {}) {
  const raw = text(value);
  if (!raw) return { ok: false, reason: "blank" };
  if (isPlaceholderText(raw)) return { ok: false, reason: "placeholder" };
  if (title && titleEcho(raw, title)) return { ok: false, reason: "title_echo" };
  if (rejectGeneric && rejectGeneric.test(raw)) return { ok: false, reason: "generic" };
  if (wordCount(raw) < minWords) return { ok: false, reason: `thin(${wordCount(raw)}w)` };
  if (minSentences > 1 && sentenceCount(raw) < minSentences) {
    return { ok: false, reason: `sentences(${sentenceCount(raw)}/${minSentences})` };
  }
  return { ok: true };
}

function stepsQuality(activity) {
  const stepLines = lines(activity?.steps || activity?.directions);
  if (!stepLines.length) return { ok: false, reason: "blank" };
  const totalWords = stepLines.reduce((n, s) => n + wordCount(s), 0);
  if (stepLines.length === 1 && totalWords < 40) return { ok: false, reason: "single_vague_step" };
  if (stepLines.length < 3 && totalWords < 35) return { ok: false, reason: `steps(${stepLines.length})` };
  if (stepLines.every((s) => wordCount(s.replace(/^\d+\.\s*/, "")) < 3)) {
    return { ok: false, reason: "steps_too_terse" };
  }
  return { ok: true };
}

function teacherLanguageQuality(activity) {
  const prompts = lines(activity?.teacherLanguage);
  if (!prompts.length) return { ok: false, reason: "blank" };
  if (prompts.length === 1 && GENERIC_QUESTION_RE.test(prompts[0])) {
    return { ok: false, reason: "generic_filler_question" };
  }
  const useful = prompts.filter((p) => wordCount(p) >= 3 && !isPlaceholderText(p));
  const min = activityExpectsQuestions(activity) ? 2 : 1;
  if (useful.length < min) return { ok: false, reason: `few_prompts(${useful.length}/${min})` };
  return { ok: true };
}

function tipsQuality(activity) {
  const tips = Array.isArray(activity?.teacherTips)
    ? activity.teacherTips.map(text).filter(Boolean)
    : lines(activity?.teacherTips);
  if (!tips.length) return { ok: false, reason: "blank" };
  if (!tips.some((t) => wordCount(t) >= 8 && !isPlaceholderText(t))) {
    return { ok: false, reason: "tips_thin" };
  }
  return { ok: true };
}

function substitutionsQuality(activity) {
  const subs = Array.isArray(activity?.substitutions) ? activity.substitutions : [];
  const usable = subs.filter((s) => s && text(s.need || s.from) && text(s.use || s.to));
  if (!usable.length) return { ok: false, reason: "blank" };
  return { ok: true };
}

function vocabularyQuality(activity) {
  const vocab = Array.isArray(activity?.vocabulary)
    ? activity.vocabulary.map(text).filter(Boolean)
    : text(activity?.vocabulary)
      .split(/[,;\n]+/)
      .map(text)
      .filter(Boolean);
  if (vocab.length < 3) return { ok: false, reason: `vocab(${vocab.length}/3)` };
  return { ok: true };
}

function observationPromptsQuality(activity) {
  const prompts = Array.isArray(activity?.observationPrompts)
    ? activity.observationPrompts.map(text).filter(Boolean)
    : [];
  if (prompts.length >= 2 && prompts.every((p) => wordCount(p) >= 4)) return { ok: true };
  const fromObs = lines(activity?.observationOpportunities).filter((l) => wordCount(l) >= 4);
  if (fromObs.length >= 2) return { ok: true };
  if (wordCount(activity?.observationOpportunities) >= 20 && sentenceCount(activity?.observationOpportunities) >= 2) {
    return { ok: true };
  }
  return { ok: false, reason: "obs_prompts_thin" };
}

/**
 * Audit one activity against Owner Admin–visible fields.
 * @returns {{ blank: string[], thin: string[], good: string[], ok: boolean }}
 */
function auditActivityContentQuality(activity) {
  const blank = [];
  const thin = [];
  const good = [];
  const title = text(activity?.title);

  function check(name, result, required = true) {
    if (!required) {
      if (result.ok) good.push(name);
      return;
    }
    if (!result.ok) {
      if (result.reason === "blank") blank.push(name);
      else thin.push(`${name}:${result.reason}`);
    } else good.push(name);
  }

  check("objective", proseQuality(activity?.objective, {
    minWords: 10,
    title,
    rejectGeneric: GENERIC_OBJECTIVE_RE,
  }));
  check("description", proseQuality(activity?.description, {
    minWords: 35,
    minSentences: 2,
    title,
    rejectGeneric: GENERIC_DESCRIPTION_RE,
  }));
  check(
    "materials",
    activityExpectsMaterialsList(activity)
      ? listFieldQuality(activity?.materials, { minItems: 1, minWordsPerItem: 1 })
      : { ok: true },
    activityExpectsMaterialsList(activity),
  );
  check("preparation", proseQuality(activity?.preparation || activity?.prep, {
    minWords: 12,
    title,
  }));
  check("setup", proseQuality(activity?.setup, {
    minWords: 15,
    title,
    rejectGeneric: GENERIC_SETUP_RE,
  }));
  check("steps", stepsQuality(activity));
  check("teacherLanguage", teacherLanguageQuality(activity));
  check("observationOpportunities", proseQuality(activity?.observationOpportunities, {
    minWords: 18,
    minSentences: 1,
    title,
  }));
  check("observationPrompts", observationPromptsQuality(activity));
  check("safetyNotes", proseQuality(activity?.safetyNotes, {
    minWords: 8,
    title,
  }));
  check("cleanupTips", proseQuality(activity?.cleanupTips || activity?.cleanup, {
    minWords: 8,
    title,
  }), activityExpectsCleanup(activity));
  check("teacherTips", tipsQuality(activity), activityExpectsTips(activity));
  check("substitutions", substitutionsQuality(activity), activityExpectsSubstitutions(activity));
  check("adaptations", proseQuality(activity?.adaptations || activity?.supportAdaptations, {
    minWords: 10,
    title,
  }));
  check("extensions", proseQuality(activity?.extensions || activity?.addedChallenge, {
    minWords: 8,
    title,
  }), activityExpectsChallenge(activity));
  check("mixedAgeAdaptations", proseQuality(activity?.mixedAgeAdaptations || activity?.mixedAge, {
    minWords: 8,
    title,
  }), activityExpectsMixedAge(activity));
  check("vocabulary", vocabularyQuality(activity));

  return {
    blank,
    thin,
    good,
    ok: blank.length === 0 && thin.length === 0,
  };
}

/**
 * Lesson-level duplicate description / objective detection.
 */
function findCopiedContentIssues(activities) {
  const issues = [];
  const byDesc = new Map();
  const byObj = new Map();
  for (const a of activities || []) {
    const d = normalizeForCompare(a.description);
    const o = normalizeForCompare(a.objective);
    if (d && wordCount(a.description) >= 8) {
      if (!byDesc.has(d)) byDesc.set(d, []);
      byDesc.get(d).push(text(a.title));
    }
    if (o && wordCount(a.objective) >= 6) {
      if (!byObj.has(o)) byObj.set(o, []);
      byObj.get(o).push(text(a.title));
    }
  }
  for (const [_, titles] of byDesc) {
    if (titles.length >= 3) {
      issues.push(`identical description repeated on ${titles.length} activities (${titles.slice(0, 3).join(", ")}…)`);
    }
  }
  for (const [_, titles] of byObj) {
    if (titles.length >= 3) {
      issues.push(`identical objective repeated on ${titles.length} activities (${titles.slice(0, 3).join(", ")}…)`);
    }
  }
  return issues;
}

/**
 * READY gate helper — returns errors for live activities that fail quality.
 */
function collectActivityQualityErrors(activities, { maxList = 12 } = {}) {
  const errors = [];
  const live = Array.isArray(activities) ? activities : [];
  let failCount = 0;
  for (const a of live) {
    const audit = auditActivityContentQuality(a);
    if (audit.ok) continue;
    failCount += 1;
    const bits = [
      ...audit.blank.map((f) => `${f}=blank`),
      ...audit.thin,
    ].slice(0, 4);
    if (errors.length < maxList) {
      errors.push(`${text(a.title) || a.id}: ${bits.join("; ")}`);
    }
  }
  if (failCount > maxList) {
    errors.push(`…and ${failCount - maxList} more activities failing quality`);
  }
  const copied = findCopiedContentIssues(live);
  errors.push(...copied.slice(0, 3));
  return { errors, failCount, total: live.length };
}

module.exports = {
  text,
  lines,
  wordCount,
  sentenceCount,
  isPlaceholderText,
  activityExpectsCleanup,
  activityExpectsMaterialsList,
  activityExpectsQuestions,
  activityExpectsSubstitutions,
  activityExpectsChallenge,
  activityExpectsTips,
  activityExpectsMixedAge,
  auditActivityContentQuality,
  findCopiedContentIssues,
  collectActivityQualityErrors,
  PLACEHOLDER_RE,
  GENERIC_OBJECTIVE_RE,
  GENERIC_DESCRIPTION_RE,
  GENERIC_SETUP_RE,
};
