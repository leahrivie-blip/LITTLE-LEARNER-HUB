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
  return String(value == null ? "" : value).trim().slice(0, max);
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
  if (field === "printableIdeas" || field === "vocabCards") {
    const list = asArray(weekDraft?.[field]).map((m) => text(m, 120)).filter(Boolean);
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
const PLACEHOLDER_RE = /\b(TODO|TBD|FIXME|lorem ipsum|\[insert|\[book|\[author|placeholder|xxx+)\b/i;
const CHILD_DETAIL_RE = /\b(my child|your child [A-Z][a-z]+|[A-Z][a-z]+ (?:is|was) (?:3|4|5) years? old|diagnosed with|IEP for)\b/;
const DOUBLED_PUNCT_RE = /[!?]{2,}|\.{4,}|,{2,}|;{2,}/;
const MARKDOWN_ARTIFACT_RE = /(^|\n)\s{0,3}#{1,6}\s+|(\*\*|__|```|`{2,})/;
const FAKE_BOOK_AUTHOR_RE = /^(unknown|n\/a|author|tba|tbd|various|anonymous)$/i;

function suggestionBodyText(item) {
  if (!item || typeof item !== "object") return "";
  return [
    item.proposedText,
    item.proposedValue,
    item.text,
    item.title,
    item.author,
    item.questions,
    item.lyrics,
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

/**
 * Generation-time validation for future AI output.
 * Does not rewrite stored lesson content — only drops/flags suggestion rows.
 */
function validateEnrichmentSuggestion(item, ctx = {}, seenTipKeys = new Set()) {
  if (!item || typeof item !== "object") {
    return { ok: false, reason: "empty_item" };
  }
  const category = String(item.category || "").toLowerCase();
  const body = suggestionBodyText(item);
  if (!body) return { ok: false, reason: "empty_text" };
  if (PLACEHOLDER_RE.test(body)) return { ok: false, reason: "placeholder" };
  if (GENERIC_FILLER_RE.test(body)) return { ok: false, reason: "generic_filler" };
  if (CHILD_DETAIL_RE.test(body)) return { ok: false, reason: "child_details" };
  if (DOUBLED_PUNCT_RE.test(body)) return { ok: false, reason: "doubled_punctuation" };
  if (MARKDOWN_ARTIFACT_RE.test(body)) return { ok: false, reason: "markdown_artifact" };

  if (category === "books" || category === "book") {
    const title = String(item.title || item.proposedValue?.title || "").trim();
    const author = String(item.author || item.proposedValue?.author || "").trim();
    if (!title || PLACEHOLDER_RE.test(title)) return { ok: false, reason: "invented_book_title" };
    if (!author || FAKE_BOOK_AUTHOR_RE.test(author) || PLACEHOLDER_RE.test(author)) {
      return { ok: false, reason: "invented_book_author" };
    }
  }

  if (/teacher_tips|group_ideas|observation_prompts/.test(category)) {
    const tipKey = body.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    if (seenTipKeys.has(tipKey)) return { ok: false, reason: "repeated_tip" };
    seenTipKeys.add(tipKey);
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
  const seenTipKeys = new Set();
  const kept = [];
  const rejected = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const result = validateEnrichmentSuggestion(item, ctx, seenTipKeys);
    if (result.ok) kept.push(result.item);
    else rejected.push({ reason: result.reason, category: item?.category || "" });
  });
  return { suggestions: kept, rejected };
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
    "teacher_tips, observation_prompts, vocabulary, substitutions, indoor_alternatives, outdoor_alternatives, indoor_outdoor, group_ideas, setting_tags, adaptations, extensions, setup, steps, image_brief_setup, image_brief_example, family_connection, milestones, weekly_overview, learning_objectives, materials_list, teacher_preparation, toolkit_prep, toolkit_observation, books, songs, printable_ideas, vocab_cards",
    "Rules:",
    "- Suggest additive classroom help only. Never invent photo URLs or claim images were uploaded.",
    "- Image briefs must follow this style: " + IMAGE_STYLE_RULES,
    "- Never instruct publishing or changing other lessons.",
    "- Keep tips/prompts under 180 characters unless overview/materials/book questions (then under 400).",
    "- Observation prompts must be concise (under ~40 words) and based only on supplied lesson/activity facts.",
    "- Do not invent books or authors. Only suggest widely known classroom books with a real title AND author, or omit books.",
    "- Never repeat the same tip text across activities.",
    "- No generic filler, placeholders (TODO/TBD/[book]), markdown headings, or doubled punctuation.",
    "- setting_tags tags must be one of: small_group, large_group, indoor, outdoor.",
    "- Do not include child names, ages of specific children, diagnoses, or private family data.",
    "- Do not assume preschool if age is missing; stay age-neutral or use the provided age only.",
    "- Provide 8–16 suggestions across several allowed categories for the requested scope.",
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
    lines.push(`Materials: ${text(activity.materials, 400)}`);
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

function buildLessonTeacherWeekRaw(plan) {
  const lesson = text(plan.title, 80) || "this lesson";
  const theme = text(plan.theme, 80) || lesson;
  const age = text(plan.age, 40) || "Preschool";
  return [
    {
      category: "weekly_overview",
      text: `This week ${age.toLowerCase()} children explore ${theme} through hands-on play, songs, books, and simple classroom invitations. Everything they need is organized for Monday setup through Friday share.`,
    },
    {
      category: "learning_objectives",
      text: `Name and describe key ideas in ${theme}\nUse new vocabulary during play\nPractice turn-taking in small groups\nNotice details during read-alouds\nCare for materials and clean up together`,
    },
    {
      category: "materials_list",
      text: "Picture cards · books · song sheet · trays · crayons · recyclable craft materials · observation clipboard · family letter · rinse tub · towels",
    },
    {
      category: "teacher_preparation",
      text: `Preview ${theme} books, print vocabulary cards, stage trays before arrival, post the daily flow, and skim the family message.`,
    },
    { category: "toolkit_prep", text: "Print vocabulary cards (ink-friendly)" },
    { category: "toolkit_prep", text: "Set observation clipboard near the main station" },
    { category: "toolkit_prep", text: "Stage Monday–Friday trays the night before" },
    { category: "toolkit_observation", text: `Listen for ${theme.toLowerCase()} vocabulary during free play` },
    { category: "toolkit_observation", text: "Note turn-taking and material care during clean-up" },
    {
      category: "family_connection",
      text: `At home, invite children to share one favorite part of ${lesson}, find one related object, and ask one wonder question together.`,
    },
    { category: "milestones", text: "Language" },
    { category: "milestones", text: "Social-emotional" },
    { category: "milestones", text: "Fine motor" },
    { category: "milestones", text: "Gross motor" },
    { category: "milestones", text: "Cognition" },
    { category: "milestones", text: "Creativity" },
    {
      category: "books",
      title: `${theme} Read-Aloud Favorite`,
      author: "Classroom Collection",
      questions: "Before: What do you notice on the cover? During: What is happening now? After: What would you try in our classroom?",
    },
    {
      category: "books",
      title: `${theme} Picture Walk`,
      author: "Classroom Collection",
      questions: "Before: What might we learn? During: How does the character feel? After: How can we care for our classroom helpers?",
    },
    {
      category: "songs",
      title: `${theme} Hello Song`,
      lyrics: "Hello friends, let's explore today — look, listen, try, and share.",
      motions: "Wave, march in place, freeze on the last word. Original LLH classroom song — no copyrighted lyrics.",
    },
    {
      category: "songs",
      title: "Clean-Up Helper Song",
      lyrics: "Toys go home, hands are kind — tidy together, one at a time.",
      motions: "Point to shelf, clap softly, sit ready. Public-domain style classroom chant — no copyrighted lyrics.",
    },
    { category: "printable_ideas", text: "Vocabulary cards (simple outlines, ink-friendly)" },
    { category: "printable_ideas", text: "Teacher instruction sheet for Monday setup" },
    { category: "printable_ideas", text: "Observation sheet with 3 prompts" },
    { category: "printable_ideas", text: "Matching cards for small-group review" },
    { category: "printable_ideas", text: "Craft template (simple outline)" },
    { category: "printable_ideas", text: "Parent letter with home talk ideas" },
    { category: "vocab_cards", text: `${theme} — A word children can say, show, and use in play` },
    { category: "vocab_cards", text: "gentle — Soft hands and careful voices" },
    { category: "vocab_cards", text: "observe — Look closely and notice details" },
  ];
}

function buildLessonTeacherActivityRaw(activity, actIndex) {
  const title = text(activity.title, 80) || `Activity ${actIndex + 1}`;
  const key = text(activity.id || activity.itemId, 160);
  const day = text(activity.dayOfWeek, 20) || "this day";
  const tagged = (item) => ({ ...item, activityKey: key });
  return [
    tagged({ category: "teacher_tips", text: `Set ${title} materials at child height before children arrive (${day}).` }),
    tagged({ category: "teacher_tips", text: `Cleanup tip: sort ${title} pieces into labeled bowls before transition.` }),
    tagged({ category: "observation_prompts", text: `Does the child name or gesture toward a key idea during ${title}?` }),
    tagged({ category: "observation_prompts", text: `How does the child use new vocabulary while trying ${title}?` }),
    tagged({ category: "vocabulary", text: "explore" }),
    tagged({ category: "vocabulary", text: "gentle" }),
    tagged({ category: "setup", text: `Place ${title} materials on a labeled low tray before circle. Keep extras nearby for rotations.` }),
    tagged({ category: "steps", text: "1) Invite children to look. 2) Model one action. 3) Let children try. 4) Ask one wonder question. 5) Clean up together." }),
    tagged({ category: "adaptations", text: "Offer a simpler choice, larger pieces, or hand-over-hand support for emerging skills." }),
    tagged({ category: "extensions", text: "Invite families to find one related object at home and describe it at drop-off." }),
    tagged({ category: "indoor_alternatives", text: "Use a tabletop tray and quiet voices when outdoor space is unavailable." }),
    tagged({ category: "outdoor_alternatives", text: "Move the same materials to a shaded sidewalk or grass edge with a rinse tub nearby." }),
    tagged({ category: "group_ideas", text: `Small group: two or three children take turns leading one step of ${title}.` }),
    tagged({ category: "group_ideas", text: `Large group: chorus response — children echo the key word from ${title} together.` }),
    tagged({ category: "setting_tags", tag: "small_group" }),
    tagged({ category: "setting_tags", tag: "large_group" }),
    tagged({ category: "setting_tags", tag: "indoor" }),
    tagged({ category: "setting_tags", tag: "outdoor" }),
    tagged({ category: "substitutions", need: "specialty prop", use: "a classroom picture card or recycled box" }),
    tagged({
      category: "image_brief_setup",
      text: `Simple classroom tray setup for ${title}: ordinary materials, natural light, teacher-manual style — no glossy stock look. ${IMAGE_STYLE_RULES}`,
    }),
    tagged({
      category: "image_brief_example",
      text: `Finished achievable craft/play example for ${title}: educational illustration or paper mockup style, real-mess friendly. ${IMAGE_STYLE_RULES}`,
    }),
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
    buildLessonTeacherActivityRaw(activity, globalIndex).forEach((item) => {
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
  const title = text(ctx.activity?.title, 80) || "this activity";
  const lesson = text(ctx.plan?.title, 80) || "this lesson";
  const theme = text(ctx.plan?.theme, 80) || lesson;
  const raw = ctx.scope === "week"
    ? [
      { category: "weekly_overview", text: `This week children explore ${theme} through hands-on play, songs, books, and simple classroom setups.` },
      { category: "learning_objectives", text: `Name key ideas in ${theme}\nUse new vocabulary in play\nPractice turn-taking during small-group activities` },
      { category: "materials_list", text: "Tray · picture cards · books · song sheet · crayons · recyclable craft materials" },
      { category: "teacher_preparation", text: "Print cards, stage trays before arrival, and preview the family message." },
      { category: "toolkit_prep", text: "Print vocabulary cards" },
      { category: "toolkit_prep", text: "Set observation clipboard by the main station" },
      { category: "toolkit_observation", text: "Listen for new vocabulary during free play" },
      { category: "family_connection", text: `At home, invite children to talk about one favorite part of ${lesson}.` },
      { category: "milestones", text: "Language" },
      { category: "milestones", text: "Social-emotional" },
      { category: "books", title: `Our ${theme} Book`, author: "Classroom Favorite", questions: "What did you notice first? How could we care for it?" },
      { category: "songs", title: `${theme} Hello Song`, lyrics: "Hello friends, let's explore today…", motions: "Wave, march in place, freeze on the last word." },
      { category: "printable_ideas", text: "Vocabulary cards (ink-friendly outlines)" },
      { category: "printable_ideas", text: "Parent letter with home talk prompts" },
      { category: "vocab_cards", text: `${theme} — A word children can say and show` },
    ]
    : [
      { category: "teacher_tips", text: `Set ${title} materials at child height before circle begins.` },
      { category: "observation_prompts", text: "Does the child name or gesture toward a familiar idea from the lesson?" },
      { category: "vocabulary", text: "explore" },
      { category: "vocabulary", text: "gentle" },
      { category: "substitutions", need: "specialty prop", use: "a classroom picture card or recycled box" },
      { category: "indoor_alternatives", text: "Use a tabletop tray when outdoor space is unavailable." },
      { category: "outdoor_alternatives", text: "Move the same materials to a shaded sidewalk or grass edge." },
      { category: "indoor_outdoor", text: "Indoor: use a tray; outdoor: add a rinse tub nearby." },
      { category: "group_ideas", text: "Small group: two children choose together; large group: chorus response." },
      { category: "setting_tags", tag: "small_group" },
      { category: "setting_tags", tag: "indoor" },
      { category: "adaptations", text: "Offer hand-over-hand help or a simpler sorting choice for emerging skills." },
      { category: "extensions", text: "Invite families to find one related object at home and describe it." },
      { category: "setup", text: "Place materials on a low tray with picture labels before children arrive." },
      { category: "steps", text: "1) Invite children to look. 2) Model one action. 3) Let children try. 4) Clean up together." },
      {
        category: "image_brief_setup",
        text: `Simple classroom tray setup for ${title}: ordinary materials labeled, natural light, teacher-manual style — no glossy stock look.`,
      },
      {
        category: "image_brief_example",
        text: `Finished paper-craft / play example for ${title}: achievable childcare craft, educational illustration style, real-mess friendly.`,
      },
      { category: "milestones", text: "Language" },
      { category: "family_connection", text: `Ask families what children notice during ${lesson} week.` },
    ];
  const normalized = raw
    .map((item, index) => normalizeSuggestionItem(item, index, ctx))
    .filter(Boolean);
  return filterValidatedSuggestions(normalized, ctx).suggestions.slice(0, 20);
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
  buildFixtureSuggestions,
  buildLessonTeacherFixtureSuggestions,
  getLessonTeacherFixturePack,
  applySuggestionsToDraft,
  currentValueForField,
  normalizeSuggestionItem,
  imageStyleGuideSnippet,
};
