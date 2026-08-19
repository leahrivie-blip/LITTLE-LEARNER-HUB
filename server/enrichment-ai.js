/**
 * Teaching Kit Enrichment Editor — AI suggestion helpers.
 * Suggestions are advisory only: never write curriculum, never publish, never touch media.
 * Upgrade Workspace expands categories so any lesson can be upgraded field-by-field.
 */
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const ENRICHMENT_AI_TIMEOUT_MS = 25000;

let enrichmentHelpers = null;
function loadEnrichmentHelpers() {
  if (enrichmentHelpers) return enrichmentHelpers;
  try {
    enrichmentHelpers = require(path.join(__dirname, "..", "scripts", "teaching-kit-enrichment.js"));
  } catch (_error) {
    enrichmentHelpers = null;
  }
  return enrichmentHelpers;
}

/** Allowed suggestion targets — keep in sync with editor approval tray + applySuggestionsToDraft. */
const SUGGESTION_CATEGORIES = Object.freeze({
  teacher_tips: {
    field: "teacherTips",
    fieldLabel: "Teacher tips",
    scope: "activity",
    kind: "string_list",
  },
  observation_prompts: {
    field: "observationPrompts",
    fieldLabel: "Observation prompts",
    scope: "activity",
    kind: "string_list",
  },
  vocabulary: {
    field: "vocabulary",
    fieldLabel: "Vocabulary support",
    scope: "activity",
    kind: "string_list",
  },
  substitutions: {
    field: "substitutions",
    fieldLabel: "Supply substitutions",
    scope: "activity",
    kind: "sub_list",
  },
  indoor_alternatives: {
    field: "indoorAlternatives",
    fieldLabel: "Indoor alternatives",
    scope: "activity",
    kind: "string",
  },
  outdoor_alternatives: {
    field: "outdoorAlternatives",
    fieldLabel: "Outdoor alternatives",
    scope: "activity",
    kind: "string",
  },
  /** Legacy category — maps to indoorAlternatives text for older fixtures/tests. */
  indoor_outdoor: {
    field: "indoorAlternatives",
    fieldLabel: "Indoor/outdoor adaptations",
    scope: "activity",
    kind: "string_list",
  },
  group_ideas: {
    field: "teacherTips",
    fieldLabel: "Small-group / large-group ideas",
    scope: "activity",
    kind: "string_list",
  },
  setting_tags: {
    field: "settingTags",
    fieldLabel: "Group & setting tags",
    scope: "activity",
    kind: "tag_list",
  },
  adaptations: {
    field: "adaptations",
    fieldLabel: "Adaptations",
    scope: "activity",
    kind: "string",
  },
  extensions: {
    field: "extensions",
    fieldLabel: "Extensions / family extension",
    scope: "activity",
    kind: "string",
  },
  setup: {
    field: "setup",
    fieldLabel: "Setup directions",
    scope: "activity",
    kind: "string",
  },
  steps: {
    field: "steps",
    fieldLabel: "Step-by-step directions",
    scope: "activity",
    kind: "string",
  },
  image_brief_setup: {
    field: "imageBriefSetup",
    fieldLabel: "Setup example image brief",
    scope: "activity",
    kind: "string",
  },
  image_brief_example: {
    field: "imageBriefExample",
    fieldLabel: "Finished example image brief",
    scope: "activity",
    kind: "string",
  },
  image_requirement: {
    field: "imageRequirementAiSuggestion",
    fieldLabel: "Image requirement recommendation (owner decides)",
    scope: "activity",
    kind: "string",
  },
  family_connection: {
    field: "familyConnection",
    fieldLabel: "Family connection ideas",
    scope: "week",
    kind: "string",
  },
  milestones: {
    field: "milestones",
    fieldLabel: "Developmental milestone language",
    scope: "week",
    kind: "string_list",
  },
  weekly_overview: {
    field: "weeklyOverview",
    fieldLabel: "Weekly overview",
    scope: "week",
    kind: "string",
  },
  learning_objectives: {
    field: "objectives",
    fieldLabel: "Learning objectives",
    scope: "week",
    kind: "string",
  },
  materials_list: {
    field: "weeklyMaterials",
    fieldLabel: "Materials list",
    scope: "week",
    kind: "string",
  },
  teacher_preparation: {
    field: "teacherPreparation",
    fieldLabel: "Teacher preparation",
    scope: "week",
    kind: "string",
  },
  toolkit_prep: {
    field: "toolkitPrep",
    fieldLabel: "Teacher Toolkit prep checklist",
    scope: "week",
    kind: "string_list",
  },
  toolkit_observation: {
    field: "toolkitObservation",
    fieldLabel: "Teacher Toolkit observation focus",
    scope: "week",
    kind: "string_list",
  },
  books: {
    field: "books",
    fieldLabel: "Book suggestion",
    scope: "week",
    kind: "book",
  },
  songs: {
    field: "songs",
    fieldLabel: "Song suggestion",
    scope: "week",
    kind: "song",
  },
  printable_ideas: {
    field: "printableIdeas",
    fieldLabel: "Printable idea",
    scope: "week",
    kind: "string_list",
  },
  vocab_cards: {
    field: "vocabCards",
    fieldLabel: "Vocabulary card idea",
    scope: "week",
    kind: "string_list",
  },
});

const ALLOWED_SETTING_TAGS = new Set(["small_group", "large_group", "indoor", "outdoor"]);

const IMAGE_STYLE_RULES = [
  "Classroom-achievable setup or craft — ordinary childcare materials.",
  "Teacher-manual / educational illustration style, or simple paper craft mockup.",
  "Natural light, real mess tolerance, no glossy stock-photo look.",
  "No unrealistic children, no AI artifacts, no fancy filters or glow.",
].join(" ");

function text(value, max = 400) {
  if (value == null) return "";
  if (typeof value === "object") return "";
  return String(value).trim().slice(0, max);
}

function printableIdeaCurrentText(value, max = 120) {
  const helpers = loadEnrichmentHelpers();
  if (helpers && typeof helpers.printableIdeaLabel === "function") {
    return text(helpers.printableIdeaLabel(value), max);
  }
  if (value == null) return "";
  if (typeof value === "string") return text(value, max);
  if (typeof value !== "object") return "";
  return text([
    value.title || value.name || value.label,
    value.purpose || value.description || value.summary,
    value.type || value.kind || value.format,
    value.instructions || value.howTo || value.directions,
  ].filter((part) => part != null && typeof part !== "object" && String(part).trim()).join(" — "), max);
}

function vocabCardCurrentText(value, max = 120) {
  const helpers = loadEnrichmentHelpers();
  if (helpers && typeof helpers.vocabCardLabel === "function") {
    return text(helpers.vocabCardLabel(value), max);
  }
  if (value == null) return "";
  if (typeof value === "string") return text(value, max);
  if (typeof value !== "object") return "";
  return text([
    value.title || value.word || value.term || value.label,
    value.definition || value.description || value.meaning,
  ].filter((part) => part != null && typeof part !== "object" && String(part).trim()).join(" — "), max);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createEnrichmentAiRequestId() {
  return `enrai-${crypto.randomBytes(8).toString("hex")}`;
}

function logEnrichmentAiEvent(entry) {
  const safe = {
    event: text(entry.event, 80) || "enrichment_ai",
    status: text(entry.status, 40),
    requestId: text(entry.requestId, 80),
    planId: text(entry.planId, 160),
    activityKey: text(entry.activityKey, 160),
    scope: text(entry.scope, 40),
    suggestionCount: Number.isFinite(Number(entry.suggestionCount)) ? Number(entry.suggestionCount) : undefined,
    fields: Array.isArray(entry.fields) ? entry.fields.map((f) => text(f, 60)).filter(Boolean).slice(0, 20) : undefined,
    insertedCount: Number.isFinite(Number(entry.insertedCount)) ? Number(entry.insertedCount) : undefined,
    durationMs: Number.isFinite(Number(entry.durationMs)) ? Number(entry.durationMs) : undefined,
    code: text(entry.code, 80) || undefined,
    timestamp: new Date().toISOString(),
  };
  Object.keys(safe).forEach((key) => {
    if (safe[key] === undefined || safe[key] === "") delete safe[key];
  });
  console.log(`[enrichment-ai] ${JSON.stringify(safe)}`);
  return safe;
}

function currentValueForField(field, activityDraft, weekDraft, plan) {
  if (field === "familyConnection") {
    const draft = text(weekDraft?.familyConnection, 2000);
    const published = text(plan?.familyConnection, 2000);
    return draft || published || "(empty)";
  }
  if (field === "milestones") {
    const list = asArray(weekDraft?.milestones).map((m) => text(m, 80)).filter(Boolean);
    return list.length ? list.join(", ") : "(none selected)";
  }
  if (field === "weeklyOverview") {
    return text(weekDraft?.weeklyOverview, 400) || text(plan?.weeklyOverview, 400) || "(empty)";
  }
  if (field === "objectives") {
    return text(weekDraft?.objectives, 400) || text(plan?.objectives, 400) || "(empty)";
  }
  if (field === "weeklyMaterials") {
    return text(weekDraft?.weeklyMaterials, 400) || text(plan?.weeklyMaterials, 400) || "(empty)";
  }
  if (field === "teacherPreparation" || field === "toolkitPrep" || field === "toolkitObservation") {
    const toolkit = weekDraft?.teacherToolkit || plan?.teachingKit?.teacherToolkit || {};
    if (field === "teacherPreparation") {
      return text(weekDraft?.teacherPreparation, 400)
        || text(toolkit.teacherPreparation, 400)
        || "(empty)";
    }
    if (field === "toolkitPrep") {
      const list = asArray(toolkit.prepChecklist).map((m) => text(m, 80)).filter(Boolean);
      return list.length ? list.join(" · ") : "(none yet)";
    }
    const list = asArray(toolkit.observationFocus).map((m) => text(m, 80)).filter(Boolean);
    return list.length ? list.join(" · ") : "(none yet)";
  }
  if (field === "books") {
    const draft = asArray(weekDraft?.books).map((b) => text(b?.title || b, 80)).filter(Boolean);
    const published = asArray(plan?.books).map((b) => text(b?.title || b, 80)).filter(Boolean);
    const list = draft.length ? draft : published;
    return list.length ? list.join(" · ") : "(none yet)";
  }
  if (field === "songs") {
    const draft = asArray(weekDraft?.songs).map((s) => text(s?.title || s, 80)).filter(Boolean);
    const published = asArray(plan?.songs).map((s) => text(s?.title || s, 80)).filter(Boolean);
    const list = draft.length ? draft : published;
    return list.length ? list.join(" · ") : "(none yet)";
  }
  if (field === "printableIdeas") {
    const list = asArray(weekDraft?.printableIdeas).map((m) => printableIdeaCurrentText(m, 120)).filter(Boolean);
    return list.length ? list.join(" · ") : "(none yet)";
  }
  if (field === "vocabCards") {
    const list = asArray(weekDraft?.vocabCards).map((m) => vocabCardCurrentText(m, 120)).filter(Boolean);
    return list.length ? list.join(" · ") : "(none yet)";
  }
  if (field === "teacherTips") {
    const list = asArray(activityDraft?.teacherTips).map((t) => text(t, 280)).filter(Boolean);
    return list.length ? list.join(" · ") : "(none yet)";
  }
  if (field === "observationPrompts") {
    const list = asArray(activityDraft?.observationPrompts).map((t) => text(t, 280)).filter(Boolean);
    return list.length ? list.join(" · ") : "(none yet)";
  }
  if (field === "vocabulary") {
    const list = asArray(activityDraft?.vocabulary).map((t) => text(t, 80)).filter(Boolean);
    return list.length ? list.join(", ") : "(none yet)";
  }
  if (field === "substitutions") {
    const list = asArray(activityDraft?.substitutions)
      .map((s) => {
        const need = text(s?.need, 120);
        const use = text(s?.use, 120);
        return need && use ? `${need} → ${use}` : "";
      })
      .filter(Boolean);
    return list.length ? list.join(" · ") : "(none yet)";
  }
  if (field === "settingTags") {
    const list = asArray(activityDraft?.settingTags).map((t) => text(t, 40)).filter(Boolean);
    return list.length ? list.join(", ") : "(none yet)";
  }
  if ([
    "indoorAlternatives",
    "outdoorAlternatives",
    "adaptations",
    "extensions",
    "setup",
    "steps",
    "imageBriefSetup",
    "imageBriefExample",
  ].includes(field)) {
    return text(activityDraft?.[field], 400) || "(none yet)";
  }
  return "(n/a)";
}

function normalizeSuggestionItem(raw, index, ctx) {
  const category = text(raw?.category || raw?.type, 60).toLowerCase().replace(/\s+/g, "_");
  const meta = SUGGESTION_CATEGORIES[category];
  if (!meta) return null;
  // Week-scoped requests only return week fields. Activity requests may also include
  // additive week ideas for the same lesson draft. Lesson scope accepts both.
  if (ctx.scope === "week" && meta.scope !== "week") return null;

  let proposedValue = null;
  let proposedText = "";

  if (meta.kind === "sub_list") {
    const need = text(raw?.need || raw?.proposedValue?.need, 120);
    const use = text(raw?.use || raw?.proposedValue?.use || raw?.text, 120);
    if (!need || !use) return null;
    proposedValue = { need, use };
    proposedText = `No ${need} → use ${use}`;
  } else if (meta.kind === "tag_list") {
    const tag = text(raw?.tag || raw?.proposedValue || raw?.text, 40).toLowerCase().replace(/\s+/g, "_");
    if (!ALLOWED_SETTING_TAGS.has(tag)) return null;
    proposedValue = tag;
    proposedText = tag.replace(/_/g, " ");
  } else if (meta.kind === "book") {
    const title = text(raw?.title || raw?.proposedValue?.title || raw?.text, 160);
    if (!title) return null;
    const author = text(raw?.author || raw?.proposedValue?.author, 120);
    const questions = text(
      raw?.questions || raw?.discussionQuestions || raw?.proposedValue?.questions,
      600,
    );
    proposedValue = { title, author, questions };
    proposedText = author
      ? `${title} — ${author}${questions ? ` · Ask: ${questions}` : ""}`
      : `${title}${questions ? ` · Ask: ${questions}` : ""}`;
  } else if (meta.kind === "song") {
    const title = text(raw?.title || raw?.proposedValue?.title || raw?.text, 160);
    if (!title) return null;
    const lyrics = text(raw?.lyrics || raw?.proposedValue?.lyrics, 800);
    const motions = text(raw?.motions || raw?.proposedValue?.motions, 400);
    proposedValue = { title, lyrics, motions };
    proposedText = motions || lyrics ? `${title} — ${motions || lyrics}` : title;
  } else if (meta.kind === "string") {
    proposedText = text(raw?.text || raw?.proposedText || raw?.proposedValue, 800);
    if (!proposedText) return null;
    proposedValue = proposedText;
  } else {
    proposedText = text(raw?.text || raw?.proposedText || raw?.proposedValue, 280);
    if (!proposedText) return null;
    proposedValue = proposedText;
  }

  return {
    id: text(raw?.id, 80) || `sug-${index + 1}-${category}`,
    category,
    field: meta.field,
    fieldLabel: meta.fieldLabel,
    scope: meta.scope,
    activityKey: text(raw?.activityKey || ctx.activityKey, 160),
    proposedText,
    proposedValue,
    currentValue: currentValueForField(meta.field, ctx.activityDraft, ctx.weekDraft, ctx.plan),
    decision: "pending",
  };
}

const GENERIC_FILLER_RE = /\b(engage learners|foster creativity|make it fun|in today's world|leverage|synerg(?:y|ize)|holistic approach|unlock potential|game.?changer)\b/i;
const BOILERPLATE_RE = /\b(offer a simpler choice|invite families to find one related object|no specialty prop\b|classroom picture card or recycled box|use a tabletop tray and quiet voices|hands-on play, songs, books, and simple classroom|invite children to look\.?\s*2\)\s*model one action)\b/i;
const PLACEHOLDER_RE = /\b(TODO|TBD|FIXME|lorem ipsum|\[insert|\[book|\[author|placeholder|xxx+)\b/i;
const CHILD_DETAIL_RE = /\b(my child|your child [A-Z][a-z]+|[A-Z][a-z]+ (?:is|was) (?:3|4|5) years? old|diagnosed with|IEP for)\b/;
const DOUBLED_PUNCT_RE = /[!?]{2,}|\.{4,}|,{2,}|;{2,}/;
const MARKDOWN_ARTIFACT_RE = /(^|\n)\s{0,3}#{1,6}\s+|(\*\*|__|```|`{2,})/;
const FAKE_BOOK_AUTHOR_RE = /^(unknown|n\/a|na|author|tba|tbd|various|anonymous|classroom collection|classroom favorite|classroom library)$/i;
const GENERIC_VOCAB_RE = /^(explore|gentle|observe|share|notice|try|look|listen|play|learn|create|fun)$/i;
const LIBRARY_SEARCH_RE = /\b(library search|search (your|the) classroom library|find a read-aloud|unverified title)\b/i;
const SPECIFICITY_CATEGORIES = new Set([
  "teacher_tips",
  "observation_prompts",
  "adaptations",
  "extensions",
  "indoor_alternatives",
  "outdoor_alternatives",
  "indoor_outdoor",
  "family_connection",
  "setup",
  "steps",
  "group_ideas",
  "image_brief_setup",
  "image_brief_example",
  "weekly_overview",
  "learning_objectives",
  "materials_list",
  "teacher_preparation",
  "substitutions",
]);
const DUPLICATE_TRACK_CATEGORIES = new Set([
  "teacher_tips",
  "observation_prompts",
  "adaptations",
  "extensions",
  "indoor_alternatives",
  "outdoor_alternatives",
  "indoor_outdoor",
  "family_connection",
  "group_ideas",
  "image_brief_setup",
  "image_brief_example",
  "setup",
  "steps",
  "substitutions",
]);
const ANCHOR_STOPWORDS = new Set([
  "this", "that", "with", "from", "into", "your", "their", "them", "have", "will",
  "week", "lesson", "activity", "children", "child", "teacher", "classroom", "through",
  "about", "using", "during", "after", "before", "simple", "today", "where", "when",
  "what", "each", "other", "than", "then", "also", "into", "over", "under", "more",
]);

function suggestionBodyText(item) {
  if (!item || typeof item !== "object") return "";
  const valueBits = [];
  if (item.proposedValue && typeof item.proposedValue === "object") {
    valueBits.push(
      item.proposedValue.title,
      item.proposedValue.author,
      item.proposedValue.questions,
      item.proposedValue.lyrics,
      item.proposedValue.motions,
      item.proposedValue.need,
      item.proposedValue.use,
      item.proposedValue.tag,
    );
  } else {
    valueBits.push(item.proposedValue);
  }
  return [
    item.proposedText,
    ...valueBits,
    item.text,
    item.title,
    item.author,
    item.questions,
    item.lyrics,
    item.need,
    item.use,
  ].map((v) => String(v || "")).join(" ").trim();
}

function sanitizeSuggestionProse(value) {
  let out = String(value || "");
  out = out.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  out = out.replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1");
  out = out.replace(/\*\*|__/g, "");
  out = out.replace(/([!?])\1+/g, "$1");
  out = out.replace(/\.{4,}/g, "...");
  out = out.replace(/,{2,}/g, ",");
  return out.trim();
}

function tokenizeAnchors(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s/-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !ANCHOR_STOPWORDS.has(part));
}

/** Collect lesson-specific anchors used by the specificity validator. */
function resolveActivityFromCtx(ctx = {}, item = null) {
  if (ctx.activity && typeof ctx.activity === "object") return ctx.activity;
  const key = text(item?.activityKey || ctx.activityKey, 160);
  if (!key) return null;
  const activities = asArray(ctx.activities);
  return activities.find((row) => text(row?.id || row?.itemId, 160) === key) || null;
}

function collectLessonAnchors(ctx = {}, item = null) {
  const plan = ctx.plan || {};
  const activity = resolveActivityFromCtx(ctx, item) || {};
  const sources = [
    plan.title,
    plan.theme,
    plan.age,
    plan.objectives,
    plan.weeklyOverview,
    activity.title,
    activity.objective,
    activity.materials,
    activity.setup,
    activity.steps,
    activity.dayOfWeek,
    ...(asArray(activity.vocabulary)),
    ...(asArray(plan.vocabulary)),
  ];
  const seen = new Set();
  const anchors = [];
  sources.forEach((source) => {
    tokenizeAnchors(source).forEach((token) => {
      if (seen.has(token)) return;
      seen.add(token);
      anchors.push(token);
    });
  });
  return anchors;
}

function countAnchorHits(body, anchors) {
  const hay = String(body || "").toLowerCase();
  let hits = 0;
  anchors.forEach((anchor) => {
    if (hay.includes(anchor)) hits += 1;
  });
  return hits;
}

function isLibrarySearchSuggestion(title, author, body) {
  return LIBRARY_SEARCH_RE.test(`${title} ${author} ${body}`);
}

function normalizeDuplicateKey(category, body) {
  return `${String(category || "").toLowerCase()}::${String(body || "").toLowerCase().replace(/\s+/g, " ").slice(0, 140)}`;
}

/**
 * Generation-time validation for future AI output.
 * Does not rewrite stored lesson content — only drops/flags suggestion rows.
 */
function validateEnrichmentSuggestion(item, ctx = {}, seenKeys = new Set()) {
  if (!item || typeof item !== "object") {
    return { ok: false, reason: "empty_item" };
  }
  const category = String(item.category || "").toLowerCase();
  const body = suggestionBodyText(item);
  if (!body) return { ok: false, reason: "empty_text" };
  if (PLACEHOLDER_RE.test(body)) return { ok: false, reason: "placeholder" };
  if (GENERIC_FILLER_RE.test(body) || BOILERPLATE_RE.test(body)) {
    return { ok: false, reason: "generic_filler" };
  }
  if (CHILD_DETAIL_RE.test(body)) return { ok: false, reason: "child_details" };
  if (DOUBLED_PUNCT_RE.test(body)) return { ok: false, reason: "doubled_punctuation" };
  if (MARKDOWN_ARTIFACT_RE.test(body)) return { ok: false, reason: "markdown_artifact" };

  if (category === "vocabulary" || category === "vocab_cards") {
    const word = String(item.proposedValue || item.text || item.proposedText || "")
      .split(/[—\-:]/)[0]
      .trim();
    if (GENERIC_VOCAB_RE.test(word)) return { ok: false, reason: "generic_vocabulary" };
  }

  if (category === "books" || category === "book") {
    const title = String(item.title || item.proposedValue?.title || "").trim();
    const author = String(item.author || item.proposedValue?.author || "").trim();
    if (!title || PLACEHOLDER_RE.test(title)) return { ok: false, reason: "invented_book_title" };
    if (isLibrarySearchSuggestion(title, author, body)) {
      // Explicit unverified search guidance is allowed; fabricated titles are not.
      if (!/search|find a read-aloud|library/i.test(title)) {
        return { ok: false, reason: "invented_book_title" };
      }
    } else {
      if (!author || FAKE_BOOK_AUTHOR_RE.test(author) || PLACEHOLDER_RE.test(author)) {
        return { ok: false, reason: "invented_book_author" };
      }
      if (/read-aloud favorite|picture walk|our .+ book$/i.test(title)) {
        return { ok: false, reason: "invented_book_title" };
      }
    }
  }

  if (category === "substitutions") {
    const need = String(item.need || item.proposedValue?.need || "").toLowerCase();
    const use = String(item.use || item.proposedValue?.use || "").toLowerCase();
    if (/specialty prop/.test(need) && /picture card|recycled box/.test(use)) {
      return { ok: false, reason: "generic_filler" };
    }
  }

  if (DUPLICATE_TRACK_CATEGORIES.has(category) || /teacher_tips|group_ideas|observation_prompts/.test(category)) {
    const tipKey = normalizeDuplicateKey(category, body);
    if (seenKeys.has(tipKey)) return { ok: false, reason: "repeated_tip" };
    // Also catch near-identical family / indoor / outdoor copy across categories.
    const crossKey = normalizeDuplicateKey("cross", body);
    if (seenKeys.has(crossKey) && /family_connection|indoor_|outdoor_|extensions|adaptations/.test(category)) {
      return { ok: false, reason: "repeated_tip" };
    }
    seenKeys.add(tipKey);
    seenKeys.add(crossKey);
  }

  if (SPECIFICITY_CATEGORIES.has(category)) {
    const anchors = collectLessonAnchors(ctx, item);
    if (anchors.length >= 2) {
      const hits = countAnchorHits(body, anchors);
      if (hits < 2) return { ok: false, reason: "lacks_specificity" };
    }
  }

  // Concise childcare-ready observations / tips
  if (/observation_prompts|teacher_tips/.test(category) && body.split(/\s+/).length > 40) {
    return { ok: false, reason: "too_long" };
  }

  const cleaned = {
    ...item,
    proposedText: sanitizeSuggestionProse(item.proposedText || body),
  };
  if (item.proposedValue && typeof item.proposedValue === "string") {
    cleaned.proposedValue = sanitizeSuggestionProse(item.proposedValue);
  }
  return { ok: true, item: cleaned, reason: "" };
}

function filterValidatedSuggestions(items, ctx = {}) {
  const seenKeys = new Set();
  const kept = [];
  const rejected = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const result = validateEnrichmentSuggestion(item, ctx, seenKeys);
    if (result.ok) kept.push(result.item);
    else rejected.push({ reason: result.reason, category: item?.category || "" });
  });
  return { suggestions: kept, rejected };
}

/** Duplicate rate helper for QA (rejected repeats / total content-like rows). */
function measureSuggestionDuplicateRate(items, ctx = {}) {
  const list = Array.isArray(items) ? items : [];
  const contentLike = list.filter((item) => DUPLICATE_TRACK_CATEGORIES.has(String(item?.category || "").toLowerCase()));
  if (!contentLike.length) return { total: 0, duplicates: 0, rate: 0 };
  const seen = new Set();
  let duplicates = 0;
  contentLike.forEach((item) => {
    const key = normalizeDuplicateKey(item.category, suggestionBodyText(item));
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  });
  return {
    total: contentLike.length,
    duplicates,
    rate: duplicates / contentLike.length,
  };
}

function parseEnrichmentAiOutput(rawText, ctx) {
  const textIn = String(rawText || "").trim();
  if (!textIn) {
    return { ok: false, code: "empty_output", suggestions: [], error: "AI returned no suggestions." };
  }
  let parsed;
  try {
    const cleaned = textIn.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, code: "malformed_output", suggestions: [], error: "AI returned malformed output. Existing content was not changed." };
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
      : null;
  if (!list) {
    return { ok: false, code: "malformed_output", suggestions: [], error: "AI returned unexpected JSON shape. Existing content was not changed." };
  }
  const normalized = list
    .map((item, index) => normalizeSuggestionItem(item, index, ctx))
    .filter(Boolean);
  const filtered = filterValidatedSuggestions(normalized, ctx);
  const suggestions = filtered.suggestions.slice(0, 20);
  if (!suggestions.length) {
    return { ok: false, code: "empty_suggestions", suggestions: [], error: "No usable suggestions were returned. Existing content was not changed.", rejected: filtered.rejected };
  }
  return { ok: true, code: "ok", suggestions, rejected: filtered.rejected };
}

function buildEnrichmentAiSystemPrompt() {
  return [
    "You are assisting an admin who is upgrading ONE early childhood lesson into a complete Teaching Kit for childcare providers.",
    "Return ONLY valid JSON (no markdown) shaped as:",
    '{"suggestions":[{"category":"teacher_tips","text":"..."},{"category":"books","title":"...","author":"...","questions":"..."},{"category":"setting_tags","tag":"small_group"}]}',
    "Allowed categories:",
    "teacher_tips, observation_prompts, vocabulary, substitutions, indoor_alternatives, outdoor_alternatives, indoor_outdoor, group_ideas, setting_tags, adaptations, extensions, setup, steps, image_brief_setup, image_brief_example, image_requirement, family_connection, milestones, weekly_overview, learning_objectives, materials_list, teacher_preparation, toolkit_prep, toolkit_observation, books, songs, printable_ideas, vocab_cards",
    "Rules:",
    "- Suggest additive classroom help only. Never invent photo URLs or claim images were uploaded.",
    "- Image briefs must follow this style: " + IMAGE_STYLE_RULES,
    "- Never instruct publishing or changing other lessons.",
    "- Keep tips/prompts under 180 characters unless overview/materials/book questions (then under 400).",
    "- Observation prompts must be concise (under ~40 words) and based only on supplied lesson/activity facts.",
    "- Do not invent books or authors. Only suggest widely known classroom books with a real title AND author, or omit books.",
    "- If a specific book cannot be verified, return a library-search suggestion (title must say Search your classroom library…) instead of a fabricated title.",
    "- Distinguish verified public-domain songs from original Little Learner Hub songs. Never reproduce copyrighted modern lyrics.",
    "- Every tip/adaptation/extension/family/indoor/outdoor suggestion must reference at least TWO lesson-specific anchors (theme, objective, materials, activity steps, age, vocabulary, or observation focus).",
    "- Reject generic boilerplate that could apply unchanged to almost any lesson (e.g. Offer a simpler choice…, Invite families to find one related object…).",
    "- Do not use bare vocabulary words like explore/gentle alone; pick theme-linked words.",
    "- Never repeat the same tip, family connection, indoor/outdoor option, adaptation, or image brief text.",
    "- No generic filler, placeholders (TODO/TBD/[book]), markdown headings, or doubled punctuation.",
    "- Do not make content longer merely to sound specific — be concrete and short.",
    "- setting_tags tags must be one of: small_group, large_group, indoor, outdoor.",
    "- Do not include child names, ages of specific children, diagnoses, or private family data.",
    "- Do not assume preschool if age is missing; stay age-neutral or use the provided age only.",
    "- Provide 8–16 suggestions across several allowed categories for the requested scope.",
    "- Weekly activity standard: 10 strong activities = a complete week. Do NOT recommend adding more activities just to raise a score once the lesson already has about 10–12 quality activities across five weekdays.",
    "- Images: suggest image briefs only where a visual genuinely helps (setup, finished example, sensory/art/STEM invitation). Simple songs, movement games, fingerplays, transitions, and teacher-led talks do not need an image. Do not request an image for every activity.",
    "- Everything is a draft for human review. Nothing publishes automatically.",
  ].join("\n");
}

function buildEnrichmentAiUserPrompt({ plan, activity, scope, existing }) {
  const lines = [
    `Lesson title: ${text(plan?.title, 180) || "Lesson"}`,
    `Age: ${text(plan?.age, 40) || "(age not set — stay age-neutral)"}`,
    `Theme: ${text(plan?.theme, 120) || ""}`,
    `Scope: ${scope}`,
    `Weekly overview (current): ${text(plan?.weeklyOverview, 500) || "(empty)"}`,
  ];
  if (scope === "activity" && activity) {
    lines.push(`Activity title: ${text(activity.title, 180)}`);
    lines.push(`Activity category: ${text(activity.activityCategory, 80)}`);
    lines.push(`Day: ${text(activity.dayOfWeek, 20)}`);
    lines.push(`Objective: ${text(activity.objective, 400)}`);
    const materialsForPrompt = (() => {
      try {
        const sentinel = require("../scripts/curriculum-sentinel.js");
        const raw = text(activity.materials, 400);
        return sentinel.isSentinelValue(raw) ? "" : raw;
      } catch {
        return text(activity.materials, 400);
      }
    })();
    if (materialsForPrompt) lines.push(`Materials: ${materialsForPrompt}`);
    lines.push(`Setup: ${text(activity.setup, 400)}`);
  } else {
    lines.push(`Books count: ${asArray(plan?.books).length}`);
    lines.push(`Songs count: ${asArray(plan?.songs).length}`);
    lines.push(`Family connection: ${text(plan?.familyConnection, 300) || "(empty)"}`);
  }
  lines.push(`Existing enrichment (do not repeat verbatim; suggest additions only): ${text(JSON.stringify(existing || {}), 1200)}`);
  lines.push("Suggest additive upgrade ideas for the allowed categories only.");
  return lines.join("\n");
}

/** Default activities per lesson-teacher batch (safe payload size; client loops until done). */
const LESSON_TEACHER_ACTIVITY_BATCH_SIZE = 5;

function primaryMaterialHint(activity, theme) {
  const materials = String(activity?.materials || "")
    .split(/[,·|]/)
    .map((part) => part.trim())
    .filter((part) => part && !/none|n\/a|not required/i.test(part));
  if (materials[0]) return text(materials[0], 60);
  const fromTheme = text(theme, 40);
  return fromTheme ? `${fromTheme} picture cards` : "labeled tray materials";
}

function themeWord(theme, lesson) {
  const token = tokenizeAnchors(theme || lesson)[0];
  return token || text(theme || lesson, 40).toLowerCase() || "theme";
}

function buildLessonTeacherWeekRaw(plan) {
  const lesson = text(plan.title, 80) || "this lesson";
  const theme = text(plan.theme, 80) || lesson;
  const age = text(plan.age, 40) || "Preschool";
  const focus = themeWord(theme, lesson);
  return [
    {
      category: "weekly_overview",
      text: `This week ${age} children study ${theme} in ${lesson}: name ${focus} ideas, use themed vocabulary, and practice turn-taking from Monday setup through Friday share.`,
    },
    {
      category: "learning_objectives",
      text: `Name and describe ${theme} ideas in ${lesson}\nUse ${focus}-linked vocabulary during play\nPractice turn-taking in small groups with ${theme} materials\nNotice details during ${theme} read-alouds\nCare for ${focus} materials and clean up together`,
    },
    {
      category: "materials_list",
      text: `${theme} picture cards · ${lesson} book basket · ${focus} song sheet · trays · crayons · recyclable craft materials · observation clipboard · family letter · rinse tub · towels`,
    },
    {
      category: "teacher_preparation",
      text: `Preview ${theme} books for ${lesson}, print ${focus} vocabulary cards, stage themed trays before arrival, post the daily flow, and skim the family message.`,
    },
    { category: "toolkit_prep", text: `Print ${theme} vocabulary cards for ${lesson} (ink-friendly)` },
    { category: "toolkit_prep", text: `Set ${focus} observation clipboard near the ${lesson} station` },
    { category: "toolkit_prep", text: `Stage Monday–Friday ${theme} trays the night before` },
    { category: "toolkit_observation", text: `Listen for ${theme} / ${focus} vocabulary during free play in ${lesson}` },
    { category: "toolkit_observation", text: `Note turn-taking and care of ${theme} materials during clean-up` },
    {
      category: "family_connection",
      text: `At home, ask children to share one ${theme} moment from ${lesson} and name one ${focus} word they used at school.`,
    },
    { category: "milestones", text: "Language" },
    { category: "milestones", text: "Social-emotional" },
    { category: "milestones", text: "Fine motor" },
    { category: "milestones", text: "Gross motor" },
    { category: "milestones", text: "Cognition" },
    { category: "milestones", text: "Creativity" },
    {
      category: "books",
      title: `Search your classroom library for a ${theme} read-aloud`,
      author: "Library search (unverified title)",
      questions: `Before: What ${focus} clues do you see? During: What is happening with the ${theme} idea? After: What could we try in ${lesson}?`,
    },
    {
      category: "songs",
      title: `${theme} Hello Song`,
      lyrics: `Hello friends, let's study ${focus} today — look, listen, try, and share.`,
      motions: "Wave, march in place, freeze on the last word. Original LLH classroom song — no copyrighted lyrics.",
    },
    {
      category: "songs",
      title: `${theme} Clean-Up Helper Song`,
      lyrics: `${focus} tools go home, hands are kind — tidy ${theme} pieces, one at a time.`,
      motions: "Point to shelf, clap softly, sit ready. Original LLH classroom chant — no copyrighted lyrics.",
    },
    { category: "printable_ideas", text: `${theme} vocabulary cards for ${lesson} (simple outlines, ink-friendly)` },
    { category: "printable_ideas", text: `Teacher instruction sheet for Monday ${theme} setup` },
    { category: "printable_ideas", text: `${focus} observation sheet with 3 prompts for ${lesson}` },
    { category: "printable_ideas", text: `${theme} matching cards for small-group review` },
    { category: "printable_ideas", text: `${focus} craft template (simple outline)` },
    { category: "printable_ideas", text: `Parent letter with ${theme} home talk ideas` },
    { category: "vocab_cards", text: `${focus} — A ${theme} word children can say, show, and use in ${lesson}` },
    { category: "vocab_cards", text: `${theme} — Name one detail children can point to during play` },
  ];
}

function buildLessonTeacherActivityRaw(activity, actIndex, plan = {}) {
  const title = text(activity.title, 80) || `Activity ${actIndex + 1}`;
  const key = text(activity.id || activity.itemId, 160);
  const day = text(activity.dayOfWeek, 20) || "this day";
  const lesson = text(plan.title, 80) || "this lesson";
  const theme = text(plan.theme, 80) || lesson;
  const objective = text(activity.objective, 120) || `practice ${theme} skills`;
  const material = primaryMaterialHint(activity, theme);
  const focus = themeWord(theme, title);
  const tagged = (item) => ({ ...item, activityKey: key });
  return [
    tagged({ category: "teacher_tips", text: `For ${title} in ${lesson}, set ${material} at child height before ${day} arrival.` }),
    tagged({ category: "teacher_tips", text: `Cleanup for ${title}: sort ${material} into labeled bowls before the next ${theme} transition.` }),
    tagged({ category: "observation_prompts", text: `During ${title}, does the child name or gesture toward a ${focus} idea from ${theme}?` }),
    tagged({ category: "observation_prompts", text: `In ${title}, how does the child use ${focus} vocabulary while working toward “${objective}”?` }),
    tagged({ category: "vocabulary", text: focus }),
    tagged({ category: "vocabulary", text: `${text(title, 40).split(/\s+/).filter((w) => w.length >= 4)[0] || "theme"}` }),
    tagged({ category: "setup", text: `Place ${material} for ${title} on a labeled low tray before circle. Keep spare ${theme} pieces nearby for rotations.` }),
    tagged({ category: "steps", text: `1) Invite children to look at ${material}. 2) Model one ${focus} action for ${title}. 3) Let children try. 4) Ask one ${theme} wonder question. 5) Clean up ${material} together.` }),
    tagged({ category: "adaptations", text: `For ${title}, offer fewer ${material} pieces or hand-over-hand support so emerging skills still meet “${objective}”.` }),
    tagged({ category: "extensions", text: `After ${title}, invite families to reuse one ${focus} word from ${theme} at drop-off and tell what they noticed.` }),
    tagged({ category: "indoor_alternatives", text: `Keep ${title} indoors on a tabletop tray with ${material}; use quiet voices when outdoor ${theme} space is unavailable.` }),
    tagged({ category: "outdoor_alternatives", text: `Move ${title} and ${material} to a shaded sidewalk or grass edge; keep a rinse tub for ${theme} clean-up.` }),
    tagged({ category: "group_ideas", text: `Small group: two or three children take turns leading one ${focus} step of ${title}.` }),
    tagged({ category: "group_ideas", text: `Large group: chorus response — children echo a ${theme} word from ${title} together.` }),
    tagged({ category: "substitutions", need: `${title} prop`, use: `${material} or a labeled ${focus} picture card from ${lesson}` }),
    tagged({
      category: "image_brief_setup",
      text: `Simple classroom tray setup for ${title} (${theme}): show ${material}, natural light, teacher-manual style — no glossy stock look. ${IMAGE_STYLE_RULES}`,
    }),
    tagged({
      category: "image_brief_example",
      text: `Finished achievable craft/play example for ${title} using ${material}: educational illustration or paper mockup style, real-mess friendly. ${IMAGE_STYLE_RULES}`,
    }),
    tagged({ category: "setting_tags", tag: "small_group" }),
    tagged({ category: "setting_tags", tag: "large_group" }),
    tagged({ category: "setting_tags", tag: "indoor" }),
    tagged({ category: "setting_tags", tag: "outdoor" }),
  ];
}

/**
 * Full-lesson AI Lesson Teacher fixture pack (batched).
 * Generates week (first batch) + every activity's gap-fill suggestions for review.
 * Never invents photo URLs or copyrighted lyrics/book text.
 * Returns { suggestions, batch } for continuous multi-request review sessions.
 */
function buildLessonTeacherFixtureSuggestions(ctx) {
  const plan = ctx.plan || {};
  const activities = asArray(ctx.activities);
  const offset = Math.max(0, Number(ctx.activityOffset) || 0);
  const requestedLimit = Number(ctx.activityLimit);
  const limit = Math.max(1, Math.min(
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : LESSON_TEACHER_ACTIVITY_BATCH_SIZE,
    20,
  ));
  const includeWeek = ctx.includeWeek !== false && offset === 0;
  const slice = activities.slice(offset, offset + limit);

  const weekSuggestions = [];
  if (includeWeek) {
    const ctxWeek = { ...ctx, scope: "week", activityKey: "" };
    buildLessonTeacherWeekRaw(plan).forEach((item, index) => {
      const normalized = normalizeSuggestionItem(item, index, ctxWeek);
      if (normalized) weekSuggestions.push(normalized);
    });
  }

  const activitySuggestions = [];
  slice.forEach((activity, sliceIndex) => {
    const key = text(activity.id || activity.itemId, 160);
    const actDraft = ctx.draftActivities && typeof ctx.draftActivities === "object"
      ? (ctx.draftActivities[key] || {})
      : {};
    const actCtx = {
      ...ctx,
      scope: "lesson",
      activity,
      activityKey: key,
      activityDraft: actDraft,
    };
    const globalIndex = offset + sliceIndex;
    buildLessonTeacherActivityRaw(activity, globalIndex, plan).forEach((item) => {
      const normalized = normalizeSuggestionItem(
        item,
        weekSuggestions.length + activitySuggestions.length,
        actCtx,
      );
      if (normalized) activitySuggestions.push(normalized);
    });
  });

  const nextOffset = offset + slice.length;
  const filtered = filterValidatedSuggestions([...weekSuggestions, ...activitySuggestions], ctx);
  return {
    suggestions: filtered.suggestions,
    rejected: filtered.rejected,
    batch: {
      activityOffset: offset,
      activityLimit: limit,
      activityTotal: activities.length,
      processedCount: slice.length,
      nextOffset,
      hasMore: nextOffset < activities.length,
      includeWeek,
      weekSuggestionCount: weekSuggestions.length,
      activitySuggestionCount: activitySuggestions.length,
    },
  };
}

/** Deterministic suggestions for local/dev/tests (no OpenAI required). */
function buildFixtureSuggestions(ctx) {
  if (ctx.scope === "lesson") {
    const packed = buildLessonTeacherFixtureSuggestions(ctx);
    // Back-compat: callers that expect an array still work via .length / map when they
    // already handle the object form on the server. Prefer getLessonTeacherFixturePack.
    return packed.suggestions;
  }
  if (ctx.scope === "week") {
    const raw = buildLessonTeacherWeekRaw(ctx.plan || {});
    const normalized = raw
      .map((item, index) => normalizeSuggestionItem(item, index, ctx))
      .filter(Boolean);
    return filterValidatedSuggestions(normalized, ctx).suggestions.slice(0, 20);
  }
  const raw = buildLessonTeacherActivityRaw(ctx.activity || {}, 0, ctx.plan || {});
  const normalized = raw
    .map((item, index) => normalizeSuggestionItem(item, index, ctx))
    .filter(Boolean);
  return filterValidatedSuggestions(normalized, ctx).suggestions.slice(0, 24);
}

/**
 * Apply accepted suggestions to a draft copy (pure). Never removes existing content.
 * Canonical implementation lives in scripts/teaching-kit-enrichment.js.
 */
function applySuggestionsToDraft(draftInput, suggestions, options) {
  const helpers = loadEnrichmentHelpers();
  if (!helpers?.applySuggestionsToDraft) {
    return { draft: draftInput || { activities: {}, week: {} }, inserted: [], fields: [] };
  }
  return helpers.applySuggestionsToDraft(draftInput, suggestions, options);
}

function imageStyleGuideSnippet() {
  return IMAGE_STYLE_RULES;
}

function getLessonTeacherFixturePack(ctx) {
  return buildLessonTeacherFixtureSuggestions(ctx);
}

module.exports = {
  ENRICHMENT_AI_TIMEOUT_MS,
  LESSON_TEACHER_ACTIVITY_BATCH_SIZE,
  SUGGESTION_CATEGORIES,
  IMAGE_STYLE_RULES,
  createEnrichmentAiRequestId,
  logEnrichmentAiEvent,
  parseEnrichmentAiOutput,
  buildEnrichmentAiSystemPrompt,
  buildEnrichmentAiUserPrompt,
  validateEnrichmentSuggestion,
  filterValidatedSuggestions,
  sanitizeSuggestionProse,
  collectLessonAnchors,
  measureSuggestionDuplicateRate,
  buildFixtureSuggestions,
  buildLessonTeacherFixtureSuggestions,
  getLessonTeacherFixturePack,
  applySuggestionsToDraft,
  currentValueForField,
  normalizeSuggestionItem,
  imageStyleGuideSnippet,
};
