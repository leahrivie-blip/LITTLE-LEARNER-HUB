/**
 * Teaching Kit Enrichment Editor — AI suggestion helpers (Slice 6).
 * Suggestions are advisory only: never write curriculum, never publish, never touch media.
 */
"use strict";

const crypto = require("node:crypto");

const ENRICHMENT_AI_TIMEOUT_MS = 25000;

/** Allowed suggestion targets — keep in sync with editor approval tray. */
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
  indoor_outdoor: {
    field: "teacherTips",
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
});

const ALLOWED_SETTING_TAGS = new Set(["small_group", "large_group", "indoor", "outdoor"]);

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
  return "(n/a)";
}

function normalizeSuggestionItem(raw, index, ctx) {
  const category = text(raw?.category || raw?.type, 60).toLowerCase().replace(/\s+/g, "_");
  const meta = SUGGESTION_CATEGORIES[category];
  if (!meta) return null;
  // Week-scoped requests only return week fields. Activity requests may also include
  // additive week ideas (family connection / milestones) for the same lesson draft.
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
  } else if (meta.kind === "string") {
    proposedText = text(raw?.text || raw?.proposedText || raw?.proposedValue, 600);
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
    proposedText,
    proposedValue,
    currentValue: currentValueForField(meta.field, ctx.activityDraft, ctx.weekDraft, ctx.plan),
    decision: "pending",
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
  const suggestions = list
    .map((item, index) => normalizeSuggestionItem(item, index, ctx))
    .filter(Boolean)
    .slice(0, 16);
  if (!suggestions.length) {
    return { ok: false, code: "empty_suggestions", suggestions: [], error: "No usable suggestions were returned. Existing content was not changed." };
  }
  return { ok: true, code: "ok", suggestions };
}

function buildEnrichmentAiSystemPrompt() {
  return [
    "You are assisting an admin who is enriching ONE early childhood lesson activity for childcare providers.",
    "Return ONLY valid JSON (no markdown) shaped as:",
    '{"suggestions":[{"category":"teacher_tips","text":"..."},{"category":"substitutions","need":"...","use":"..."},{"category":"setting_tags","tag":"small_group"}]}',
    "Allowed categories only:",
    "teacher_tips, observation_prompts, vocabulary, substitutions, indoor_outdoor, group_ideas, setting_tags, family_connection, milestones",
    "Rules:",
    "- Suggest additive classroom help only. Never invent photos or media.",
    "- Never instruct publishing or changing other lessons.",
    "- Keep each tip/prompt under 180 characters. Warm, practical, preschool-appropriate.",
    "- setting_tags tags must be one of: small_group, large_group, indoor, outdoor.",
    "- Do not include child names or private family data.",
    "- Provide 6–12 suggestions across several allowed categories.",
  ].join("\n");
}

function buildEnrichmentAiUserPrompt({ plan, activity, scope, existing }) {
  const lines = [
    `Lesson title: ${text(plan?.title, 180) || "Lesson"}`,
    `Age: ${text(plan?.age, 40) || "Preschool"}`,
    `Theme: ${text(plan?.theme, 120) || ""}`,
    `Scope: ${scope}`,
  ];
  if (scope === "activity" && activity) {
    lines.push(`Activity title: ${text(activity.title, 180)}`);
    lines.push(`Activity category: ${text(activity.activityCategory, 80)}`);
    lines.push(`Day: ${text(activity.dayOfWeek, 20)}`);
    lines.push(`Objective: ${text(activity.objective, 400)}`);
    lines.push(`Materials: ${text(activity.materials, 400)}`);
  }
  lines.push(`Existing enrichment (do not repeat verbatim; suggest additions only): ${text(JSON.stringify(existing || {}), 1200)}`);
  lines.push("Suggest additive enrichment ideas for the allowed categories only.");
  return lines.join("\n");
}

/** Deterministic suggestions for local/dev/tests (no OpenAI required). */
function buildFixtureSuggestions(ctx) {
  const title = text(ctx.activity?.title, 80) || "this activity";
  const lesson = text(ctx.plan?.title, 80) || "this lesson";
  const raw = ctx.scope === "week"
    ? [
      { category: "family_connection", text: `At home, invite children to name one animal from ${lesson} and tell who cares for it.` },
      { category: "milestones", text: "Language" },
      { category: "milestones", text: "Social-emotional" },
      { category: "family_connection", text: "Share a photo or drawing of a favorite farm animal from a book you read together." },
    ]
    : [
      { category: "teacher_tips", text: `Set ${title} materials at child height before circle begins.` },
      { category: "observation_prompts", text: "Does the child name or gesture toward a familiar animal?" },
      { category: "vocabulary", text: "barn" },
      { category: "vocabulary", text: "hoof" },
      { category: "substitutions", need: "hay", use: "shredded paper or fabric strips" },
      { category: "indoor_outdoor", text: "Indoor: use a tray; outdoor: move the basket to shade and add a water rinse tub." },
      { category: "group_ideas", text: "Small group: two children choose together; large group: pass one animal for a sound chorus." },
      { category: "setting_tags", tag: "small_group" },
      { category: "setting_tags", tag: "indoor" },
      { category: "milestones", text: "Language" },
      { category: "family_connection", text: `Ask families what farm animals children notice on ${lesson} week.` },
    ];
  // Filter week-only / activity-only via normalize
  return raw
    .map((item, index) => normalizeSuggestionItem(item, index, ctx))
    .filter(Boolean)
    .slice(0, 16);
}

/**
 * Apply accepted suggestions to a draft copy (pure). Never removes existing content.
 * Returns { draft, inserted, fields }.
 */
function applySuggestionsToDraft(draftInput, suggestions, { activityKey = "" } = {}) {
  const draft = draftInput && typeof draftInput === "object"
    ? JSON.parse(JSON.stringify(draftInput))
    : { activities: {}, week: {} };
  if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};
  if (!draft.week || typeof draft.week !== "object") draft.week = {};

  const inserted = [];
  const fields = new Set();

  asArray(suggestions).forEach((sug) => {
    if (!sug || sug.decision === "discarded") return;
    if (sug.decision !== "accepted" && sug.selected !== true) return;
    const category = text(sug.category, 60);
    const meta = SUGGESTION_CATEGORIES[category];
    if (!meta) return;

    if (meta.scope === "week") {
      if (meta.field === "familyConnection") {
        const next = text(sug.proposedValue || sug.proposedText, 600);
        if (!next) return;
        const prev = text(draft.week.familyConnection, 2000);
        draft.week.familyConnection = prev ? `${prev}\n\n${next}` : next;
        inserted.push(sug.id);
        fields.add(meta.field);
        return;
      }
      if (meta.field === "milestones") {
        const label = text(sug.proposedValue || sug.proposedText, 80);
        if (!label) return;
        const list = asArray(draft.week.milestones).map((m) => text(m, 80)).filter(Boolean);
        if (!list.includes(label)) list.push(label);
        draft.week.milestones = list.slice(0, 16);
        inserted.push(sug.id);
        fields.add(meta.field);
      }
      return;
    }

    const key = text(activityKey, 160);
    if (!key) return;
    if (!draft.activities[key] || typeof draft.activities[key] !== "object") {
      draft.activities[key] = {};
    }
    const act = draft.activities[key];

    if (meta.field === "substitutions") {
      const need = text(sug.proposedValue?.need || sug.need, 120);
      const use = text(sug.proposedValue?.use || sug.use, 120);
      if (!need || !use) return;
      const list = asArray(act.substitutions).filter((s) => s && typeof s === "object");
      const exists = list.some((s) => text(s.need, 120) === need && text(s.use, 120) === use);
      if (!exists) list.push({ need, use });
      act.substitutions = list.slice(0, 12);
      inserted.push(sug.id);
      fields.add(meta.field);
      return;
    }

    if (meta.field === "settingTags") {
      const tag = text(sug.proposedValue || sug.proposedText, 40).toLowerCase().replace(/\s+/g, "_");
      if (!ALLOWED_SETTING_TAGS.has(tag)) return;
      const list = asArray(act.settingTags).map((t) => text(t, 40)).filter(Boolean);
      if (!list.includes(tag)) list.push(tag);
      act.settingTags = list.slice(0, 8);
      inserted.push(sug.id);
      fields.add(meta.field);
      return;
    }

    const value = text(sug.proposedValue || sug.proposedText, 280);
    if (!value) return;
    const listKey = meta.field;
    const max = listKey === "vocabulary" ? 24 : 8;
    const list = asArray(act[listKey]).map((t) => text(t, 280)).filter(Boolean);
    if (!list.includes(value)) list.push(value);
    act[listKey] = list.slice(0, max);
    inserted.push(sug.id);
    fields.add(listKey);
  });

  return { draft, inserted, fields: [...fields] };
}

module.exports = {
  ENRICHMENT_AI_TIMEOUT_MS,
  SUGGESTION_CATEGORIES,
  createEnrichmentAiRequestId,
  logEnrichmentAiEvent,
  parseEnrichmentAiOutput,
  buildEnrichmentAiSystemPrompt,
  buildEnrichmentAiUserPrompt,
  buildFixtureSuggestions,
  applySuggestionsToDraft,
  currentValueForField,
  normalizeSuggestionItem,
};
