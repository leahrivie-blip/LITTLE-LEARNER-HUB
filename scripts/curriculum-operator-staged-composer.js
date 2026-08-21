/**
 * AI Curriculum Operator — staged new-lesson composer.
 *
 * Stage 1: compact week blueprint + exact activity outlines
 * Stage 2: expand activities in small batches
 * Stage 3: assemble + existing quality validation
 * Stage 4: one targeted repair (optional)
 *
 * Trusted lesson.create stays blocked until the assembled lesson validates.
 * No deterministic production fallback. No songs/books/images/printables here.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const createApi = require("./curriculum-operator-create.js");
const architect = require("./curriculum-operator-create-architect.js");
const composer = require("./curriculum-operator-ai-composer.js");

const WEEKDAYS = createApi.WEEKDAYS;
const DEFAULT_BATCH_SIZE = 5;
const MAX_ARCHITECTURE_CALLS = 2; // initial + one Stage-1 repair
const MAX_BATCH_RETRIES = 1; // one retry per failed expansion batch
const MAX_FINAL_REPAIR_CALLS = 1;
const STAGE_MAX_OUTPUT_TOKENS = 12000;

function text(value, max = 4000) {
  return schema.text(value, max);
}

function emptyUsage() {
  return {
    lessonArchitectCalls: 0,
    lessonRevisionCalls: 0,
    lessonArchitectureCalls: 0,
    activityExpansionCalls: 0,
    activityRepairCalls: 0,
    activitiesRequested: 0,
    activitiesCompleted: 0,
    outputTruncationCount: 0,
    openaiCalls: 0,
  };
}

function emptyDiagnostics() {
  return {
    stages: [],
    model: null,
    maxOutputTokens: STAGE_MAX_OUTPUT_TOKENS,
    batchSize: DEFAULT_BATCH_SIZE,
  };
}

function pushStageDiag(diagnostics, row) {
  diagnostics.stages.push({
    stage: text(row.stage, 40),
    model: row.model ? text(row.model, 80) : null,
    maxOutputTokens: Number(row.maxOutputTokens) || STAGE_MAX_OUTPUT_TOKENS,
    finishReason: row.finishReason ? text(row.finishReason, 80) : null,
    outputChars: Number(row.outputChars) || 0,
    parseSuccess: row.parseSuccess === true,
    expectedObjectCount: Number.isFinite(row.expectedObjectCount) ? row.expectedObjectCount : null,
    parsedObjectCount: Number.isFinite(row.parsedObjectCount) ? row.parsedObjectCount : null,
    possibleOutputTruncation: row.possibleOutputTruncation === true,
    unterminatedJsonTail: row.unterminatedJsonTail === true,
    validationIssues: schema.asArray(row.validationIssues).map((i) => text(i, 200)).slice(0, 24),
    ok: row.ok === true,
  });
}

function unwrapAiResult(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, "output")) {
    return {
      text: String(raw.output || ""),
      model: raw.model || null,
      maxOutputTokens: raw.maxOutputTokens || STAGE_MAX_OUTPUT_TOKENS,
      finishReason: raw.incompleteDetails?.reason || raw.status || raw.finishReason || null,
      incompleteDetails: raw.incompleteDetails || null,
    };
  }
  return {
    text: String(raw || ""),
    model: null,
    maxOutputTokens: STAGE_MAX_OUTPUT_TOKENS,
    finishReason: null,
    incompleteDetails: null,
  };
}

function truncationFlags(rawText, parsedCount, expectedCount) {
  const trunc = architect.detectOutputTruncation(rawText, parsedCount, expectedCount);
  return {
    possibleOutputTruncation: trunc.truncatedLikely === true,
    unterminatedJsonTail: (trunc.reasons || []).includes("unterminated_json_tail"),
    reasons: trunc.reasons || [],
    rawLength: trunc.rawLength,
  };
}

function outlineIdFor(theme, day, indexOnDay) {
  const themeKey = text(theme, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
  const dayKey = text(day, 20).toLowerCase().slice(0, 3) || "day";
  return `${themeKey}-${dayKey}-${String(indexOnDay).padStart(2, "0")}`;
}

function normalizeWeekday(value) {
  const raw = text(value, 20).toLowerCase();
  if (WEEKDAYS.includes(raw)) return raw;
  const map = {
    mon: "monday",
    tue: "tuesday",
    tues: "tuesday",
    wed: "wednesday",
    thu: "thursday",
    thur: "thursday",
    thurs: "thursday",
    fri: "friday",
  };
  return map[raw] || raw;
}

function validateBlueprint(parsed, brief) {
  const issues = [];
  const target = schema.clampInt(brief.activityTarget, 4, 24, createApi.defaultActivityTarget(brief.ageBand));
  const lessonIn = parsed?.lesson && typeof parsed.lesson === "object" ? parsed.lesson : parsed;
  const title = text(lessonIn?.title || brief.title, 120);
  if (!title) issues.push("missing_title");

  const dailyFocusIn = lessonIn?.dailyFocus && typeof lessonIn.dailyFocus === "object" ? lessonIn.dailyFocus : {};
  const dailyFocus = {};
  WEEKDAYS.forEach((day) => {
    dailyFocus[day] = text(dailyFocusIn[day], 120)
      || createApi.weekdayProgression(brief.theme || title, brief.ageBand)[day];
  });

  const outlinesIn = schema.asArray(parsed?.activityOutlines || parsed?.outlines || parsed?.activities);
  if (outlinesIn.length !== target) {
    issues.push(`outline_count_mismatch:${outlinesIn.length}!=${target}`);
  }

  const outlines = [];
  const seenIds = new Set();
  const concepts = [];
  const titles = [];
  const dayCounts = Object.fromEntries(WEEKDAYS.map((d) => [d, 0]));

  outlinesIn.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      issues.push(`invalid_outline_${index}`);
      return;
    }
    const outlineId = text(row.outlineId || row.id, 80) || `outline-${index + 1}`;
    if (seenIds.has(outlineId)) issues.push(`duplicate_outline_id:${outlineId}`);
    seenIds.add(outlineId);
    const weekday = normalizeWeekday(row.weekday || row.dayOfWeek);
    if (!WEEKDAYS.includes(weekday)) {
      issues.push(`bad_outline_weekday:${weekday || "missing"}`);
      return;
    }
    dayCounts[weekday] += 1;
    const name = text(row.name || row.title, 120);
    if (!name) issues.push(`missing_outline_name_${index}`);
    titles.push(name.toLowerCase());
    concepts.push(architect.conceptKey(name));
    const domain = text(row.domain || row.category || row.activityCategory, 80) || "Invitation to Play";
    const concept = text(row.concept || row.summary || row.description, 400);
    const developmentalPurpose = text(row.developmentalPurpose || row.purpose || row.objective, 400);
    if (wordCount(concept) < 6) issues.push(`${name || outlineId}.thin_concept`);
    if (wordCount(developmentalPurpose) < 4) issues.push(`${name || outlineId}.thin_purpose`);
    outlines.push({
      outlineId,
      name,
      weekday,
      domain,
      concept,
      developmentalPurpose,
      expectedAssetIntent: row.expectedAssetIntent && typeof row.expectedAssetIntent === "object"
        ? {
          image: text(row.expectedAssetIntent.image, 40).toUpperCase() === "GENERATE" ? "GENERATE" : "NOT_NEEDED",
          printable: text(row.expectedAssetIntent.printable, 40).toUpperCase() === "CREATE" ? "CREATE" : "NOT_NEEDED",
          reason: text(row.expectedAssetIntent.reason, 300),
        }
        : null,
    });
  });

  if (new Set(titles.filter(Boolean)).size < titles.filter(Boolean).length) {
    issues.push("duplicate_outline_titles");
  }
  const conceptCounts = new Map();
  concepts.forEach((c) => {
    if (!c) return;
    conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1);
  });
  conceptCounts.forEach((count, key) => {
    if (count >= 2) issues.push(`near_duplicate_outline_concept:${key}`);
  });

  const daysUsed = WEEKDAYS.filter((d) => dayCounts[d] > 0);
  if (target >= 5 && daysUsed.length < 5) {
    issues.push(`weekday_coverage_incomplete:${daysUsed.length}<5`);
  }
  if (outlines.length === target && target >= 5) {
    const counts = WEEKDAYS.map((d) => dayCounts[d]);
    if (Math.max(...counts) - Math.min(...counts) > 1) {
      issues.push(`weekday_distribution_imbalanced:max${Math.max(...counts)}-min${Math.min(...counts)}`);
    }
  }

  const blueprint = {
    lesson: {
      title,
      age: text(lessonIn?.age || brief.ageLabel, 80),
      theme: text(lessonIn?.theme || brief.theme || title, 120),
      plan: brief.accessPlan === "Pro" ? "Pro" : "Free",
      status: "draft",
      weeklyOverview: text(lessonIn?.weeklyOverview, 2000),
      objectives: text(lessonIn?.objectives || lessonIn?.learningObjectives, 2000),
      weeklyMaterials: text(lessonIn?.weeklyMaterials || lessonIn?.materialsStrategy, 2000),
      teacherPreparation: text(lessonIn?.teacherPreparation || lessonIn?.teacherPrepStrategy, 2000),
      prepChecklist: schema.asArray(lessonIn?.prepChecklist).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
      observationFocus: schema.asArray(lessonIn?.observationFocus).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
      familyConnection: text(lessonIn?.familyConnection, 2000),
      milestones: schema.asArray(lessonIn?.milestones).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
      vocabularyWords: text(lessonIn?.vocabularyWords, 500),
      dailyFocus,
    },
    activityOutlines: outlines,
    songIntent: schema.asArray(parsed?.songIntent).slice(0, 8),
    bookIntent: schema.asArray(parsed?.bookIntent).slice(0, 8),
  };

  ["weeklyOverview", "objectives", "weeklyMaterials", "teacherPreparation", "familyConnection"].forEach((field) => {
    const err = rejectGeneric(field, blueprint.lesson[field]);
    if (err) issues.push(err);
  });
  if (!blueprint.lesson.prepChecklist.length) issues.push("missing_prep_checklist");
  if (!blueprint.lesson.observationFocus.length) issues.push("missing_observation_focus");

  return {
    ok: issues.length === 0 && outlines.length === target,
    issues,
    blueprint,
    parsedOutlineCount: outlines.length,
    requiredOutlineCount: target,
    weekdayDistribution: dayCounts,
  };
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function rejectGeneric(field, value) {
  const sample = Array.isArray(value) ? value.join(" ") : text(value);
  if (!sample) return `Empty ${field}`;
  if (/\b(children will (explore|learn about)|set out (the )?materials|what do you see\?)\b/i.test(sample)
    && wordCount(sample) < 45) {
    return `Generic filler in ${field}`;
  }
  if (typeof value === "string" && wordCount(value) < 8
    && !["vocabulary", "vocabularyWords"].includes(field)) {
    return `Too short: ${field}`;
  }
  return null;
}

function buildStage1SystemPrompt(ageBand) {
  const ageRules = ageBand === "infant"
    ? "INFANT only: bonding, sensory, tummy time, large safe materials. Reject worksheets/tiny pieces."
    : ageBand === "toddler"
      ? "TODDLER: short hands-on, large materials, movement, sensory. Reject worksheets/tiny parts."
      : "PRESCHOOL: play-based dramatic play, STEM, counting, sequencing, collaborative art.";
  return [
    "You are the Little Learner Hub Curriculum Week Architect.",
    "Return ONLY valid JSON for a compact WEEK BLUEPRINT — not full activity field dumps.",
    "Design the whole week coherently first.",
    "Honor requiredActivityCount exactly with that many activityOutlines.",
    "Each outline is compact: outlineId, name, weekday, domain, concept, developmentalPurpose.",
    "Do not expand full materials/steps/questions yet.",
    "No duplicate or near-duplicate concepts.",
    "Distribute across Monday–Friday (normally 3 per weekday for 15).",
    ageRules,
  ].join("\n");
}

function buildStage1UserPrompt(brief, repairIssues) {
  const activityTarget = schema.clampInt(brief.activityTarget, 4, 24, createApi.defaultActivityTarget(brief.ageBand));
  const distribution = architect.expectedWeekdayDistribution(activityTarget);
  const payload = {
    mode: "CREATE_WEEK_BLUEPRINT",
    brief: {
      title: brief.title,
      theme: brief.theme,
      ageBand: brief.ageBand,
      ageLabel: brief.ageLabel,
      accessPlan: brief.accessPlan,
      activityTarget,
      exclusions: brief.exclusions || {},
    },
    requiredActivityCount: activityTarget,
    requiredWeekdays: architect.requiredWeekdays(),
    requiredWeekdayDistribution: distribution,
    requiredJsonSchema: {
      lesson: {
        title: "string",
        weeklyOverview: "string",
        objectives: "string",
        weeklyMaterials: "string",
        teacherPreparation: "string",
        prepChecklist: ["string"],
        observationFocus: ["string"],
        familyConnection: "string",
        milestones: ["string"],
        dailyFocus: { monday: "string", tuesday: "string", wednesday: "string", thursday: "string", friday: "string" },
      },
      activityOutlines: [{
        outlineId: "theme-mon-01",
        name: "string",
        weekday: "monday|tuesday|wednesday|thursday|friday",
        domain: "string",
        concept: "one-sentence activity concept",
        developmentalPurpose: "string",
      }],
    },
    rules: [
      `Return exactly ${activityTarget} activityOutlines.`,
      "All five weekdays must be represented when activityTarget >= 5.",
      "Do not return full activity bodies in Stage 1.",
    ],
  };
  if (repairIssues && repairIssues.length) {
    payload.stage1Repair = true;
    payload.fixOnlyTheseIssues = repairIssues.slice(0, 40);
    payload.revisionDirectives = [
      `Return exactly ${activityTarget} distinct activityOutlines.`,
      "Preserve strong outlines; fix listed count/coverage/duplicate issues.",
    ];
  }
  return [
    "Create a compact weekly Teaching Kit blueprint.",
    "Respond with JSON only.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildExpansionSystemPrompt(ageBand) {
  return [
    "You are the Little Learner Hub Curriculum Activity Expander.",
    "Expand ONLY the requested outlineIds into full teacher-ready activities.",
    "Return ONLY valid JSON: {\"activities\":[...]} with exactly those outlineIds.",
    "Do not invent extra activities. Do not omit requested outlineIds.",
    "Reject generic filler like \"Children will learn about X\", \"Set out materials\", \"What do you see?\".",
    "Require activity-specific substance: concrete materials counts/placement, modeled steps, multiple useful questions, observation focus, adaptations.",
    ageBand === "preschool"
      ? "PRESCHOOL: play-based, concrete, collaborative, developmentally appropriate."
      : "Match the requested age band precisely.",
  ].join("\n");
}

function buildExpansionUserPrompt(brief, blueprint, outlineIds) {
  const wanted = schema.asArray(outlineIds).map((id) => text(id, 80)).filter(Boolean);
  const outlines = schema.asArray(blueprint.activityOutlines)
    .filter((o) => wanted.includes(o.outlineId));
  return [
    "Expand ONLY these activity outlines into full Teaching Kit activities.",
    "Keep outlineId on each returned activity. Keep name/weekday/domain aligned with the outline.",
    JSON.stringify({
      mode: "EXPAND_ACTIVITY_BATCH",
      brief: {
        title: brief.title,
        theme: brief.theme,
        ageBand: brief.ageBand,
        ageLabel: brief.ageLabel,
        accessPlan: brief.accessPlan,
      },
      weeklyBlueprint: {
        title: blueprint.lesson.title,
        weeklyOverview: blueprint.lesson.weeklyOverview,
        objectives: blueprint.lesson.objectives,
        dailyFocus: blueprint.lesson.dailyFocus,
        allOutlines: blueprint.activityOutlines.map((o) => ({
          outlineId: o.outlineId,
          name: o.name,
          weekday: o.weekday,
          domain: o.domain,
          concept: o.concept,
        })),
      },
      expandExactlyTheseOutlineIds: wanted,
      outlinesToExpand: outlines,
      requiredActivityFields: [
        "outlineId", "title", "dayOfWeek", "activityCategory", "durationMinutes",
        "objective", "description", "materials", "preparation", "setup", "steps",
        "teacherLanguage", "observationOpportunities", "safetyNotes", "cleanupTips",
        "indoorAlternatives", "outdoorAlternatives", "teacherTips", "substitutions",
        "adaptations", "extensions", "vocabulary", "observationPrompts", "mixedAgeAdaptations",
        "preliminaryAssetIntent",
      ],
      rules: [
        `Return exactly ${wanted.length} activities.`,
        "Every expandExactlyTheseOutlineIds value must appear exactly once.",
        "No unrequested outlineId.",
        "Use week context so Batch activities do not duplicate earlier concepts.",
      ],
    }, null, 2),
  ].join("\n");
}

function validateExpansionBatch(parsed, requestedIds, blueprint, brief) {
  const issues = [];
  const requested = schema.asArray(requestedIds).map((id) => text(id, 80));
  const activitiesIn = schema.asArray(parsed?.activities);
  const byId = new Map();
  activitiesIn.forEach((row, index) => {
    const id = text(row?.outlineId || row?.id, 80);
    if (!id) {
      issues.push(`missing_outline_id_at_${index}`);
      return;
    }
    if (!requested.includes(id)) issues.push(`unrequested_outline_id:${id}`);
    if (byId.has(id)) issues.push(`duplicate_outline_id:${id}`);
    byId.set(id, row);
  });
  requested.forEach((id) => {
    if (!byId.has(id)) issues.push(`missing_requested_outline_id:${id}`);
  });

  const outlineMap = new Map(schema.asArray(blueprint.activityOutlines).map((o) => [o.outlineId, o]));
  const expanded = [];
  requested.forEach((id) => {
    const raw = byId.get(id);
    const outline = outlineMap.get(id);
    if (!raw || !outline) return;
    const actTitle = text(raw.title || raw.name || outline.name, 120);
    const day = normalizeWeekday(raw.dayOfWeek || raw.weekday || outline.weekday);
    const item = {
      outlineId: id,
      title: actTitle,
      dayOfWeek: day,
      activityCategory: text(raw.activityCategory || raw.domain || raw.category || outline.domain, 80),
      objective: text(raw.objective, 2000),
      description: text(raw.description || raw.whatChildrenWillDo, 2000),
      materials: text(raw.materials, 2000),
      preparation: text(raw.preparation || raw.teacherPrep, 2000),
      setup: text(raw.setup, 2000),
      steps: text(raw.steps, 4000),
      teacherLanguage: text(raw.teacherLanguage || raw.teacherQuestions, 2000),
      observationOpportunities: text(raw.observationOpportunities || raw.observationFocus, 2000),
      safetyNotes: text(raw.safetyNotes || raw.safety, 2000),
      cleanupTips: text(raw.cleanupTips || raw.cleanup, 2000),
      indoorAlternatives: text(raw.indoorAlternatives, 2000),
      outdoorAlternatives: text(raw.outdoorAlternatives, 2000),
      teacherTips: schema.asArray(raw.teacherTips || raw.tips).map((v) => text(v, 300)).filter(Boolean).slice(0, 8),
      substitutions: schema.asArray(raw.substitutions).map((v) => (
        typeof v === "string" ? text(v, 300) : text(`${v?.need || ""} → ${v?.use || ""}`, 300)
      )).filter(Boolean).slice(0, 8),
      adaptations: text(raw.adaptations || raw.supportAdaptations, 2000),
      extensions: text(raw.extensions || raw.addedChallenge, 2000),
      vocabulary: text(raw.vocabulary, 500),
      observationPrompts: schema.asArray(raw.observationPrompts).map((v) => text(v, 300)).filter(Boolean).slice(0, 8),
      durationMinutes: schema.clampInt(raw.durationMinutes, 3, 60, brief.ageBand === "infant" ? 8 : 15),
      age: brief.ageLabel,
      mixedAgeAdaptations: text(raw.mixedAgeAdaptations || raw.mixedAgeNotes, 2000),
      preliminaryAssetIntent: raw.preliminaryAssetIntent && typeof raw.preliminaryAssetIntent === "object"
        ? raw.preliminaryAssetIntent
        : outline.expectedAssetIntent,
    };
    [
      "objective", "description", "materials", "preparation", "setup", "steps",
      "teacherLanguage", "observationOpportunities", "safetyNotes", "cleanupTips",
      "adaptations", "extensions",
    ].forEach((field) => {
      const err = rejectGeneric(`${actTitle}.${field}`, item[field]);
      if (err) issues.push(err);
    });
    if (wordCount(item.vocabulary) < 3) issues.push(`${actTitle}.thin_vocabulary`);
    if (!item.teacherTips.length) issues.push(`${actTitle}.missing_tips`);
    if (!item.observationPrompts.length) issues.push(`${actTitle}.missing_observation_prompts`);
    if (!WEEKDAYS.includes(item.dayOfWeek)) issues.push(`bad_weekday:${item.dayOfWeek}`);
    expanded.push(item);
  });

  return {
    ok: issues.length === 0 && expanded.length === requested.length,
    issues,
    activities: expanded,
    parsedObjectCount: activitiesIn.length,
    expectedObjectCount: requested.length,
  };
}

function assembleLessonObject(blueprint, expandedActivities) {
  return {
    lesson: { ...blueprint.lesson },
    activities: schema.asArray(expandedActivities).map((a) => {
      const { outlineId, ...rest } = a;
      void outlineId;
      return rest;
    }),
    songIntent: blueprint.songIntent || [],
    bookIntent: blueprint.bookIntent || [],
  };
}

function buildFinalRepairSystemPrompt() {
  return [
    "You are the Little Learner Hub Curriculum Repair Editor.",
    "Repair ONLY the listed failed weekly fields and/or outline/activity IDs.",
    "Return ONLY valid JSON patch: {\"lessonPatches\":{...},\"activities\":[...]}",
    "Do not regenerate the entire lesson. Do not invent extra activities.",
  ].join("\n");
}

function buildFinalRepairUserPrompt(brief, assembled, issues) {
  const issueList = schema.asArray(issues).map((i) => String(i));
  const failedActs = schema.asArray(assembled.activities).filter((a) => {
    const title = text(a.title, 120);
    return issueList.some((iss) => iss.includes(title));
  });
  return JSON.stringify({
    mode: "REPAIR_TARGETED_LESSON_PATCH",
    brief: { title: brief.title, ageBand: brief.ageBand, activityTarget: brief.activityTarget },
    fixOnlyTheseIssues: issueList.slice(0, 40),
    weeklyContext: {
      dailyFocus: assembled.lesson?.dailyFocus,
      activityTitles: schema.asArray(assembled.activities).map((a) => a.title),
    },
    failedActivities: (failedActs.length ? failedActs : assembled.activities).slice(0, 16),
    lessonSnapshot: {
      weeklyOverview: assembled.lesson?.weeklyOverview,
      objectives: assembled.lesson?.objectives,
      weeklyMaterials: assembled.lesson?.weeklyMaterials,
      teacherPreparation: assembled.lesson?.teacherPreparation,
      familyConnection: assembled.lesson?.familyConnection,
      prepChecklist: assembled.lesson?.prepChecklist,
      observationFocus: assembled.lesson?.observationFocus,
    },
  }, null, 2);
}

function applyRepairPatch(assembled, patch) {
  const next = JSON.parse(JSON.stringify(assembled));
  const lessonPatches = patch?.lessonPatches && typeof patch.lessonPatches === "object"
    ? patch.lessonPatches
    : (patch?.lesson && typeof patch.lesson === "object" ? patch.lesson : {});
  Object.keys(lessonPatches).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(next.lesson, key) || ["prepChecklist", "observationFocus", "milestones"].includes(key)) {
      next.lesson[key] = lessonPatches[key];
    }
  });
  schema.asArray(patch?.activities).forEach((row) => {
    const title = text(row?.title || row?.name, 120).toLowerCase();
    const outlineId = text(row?.outlineId, 80);
    const idx = next.activities.findIndex((a) => (
      (outlineId && text(a.outlineId, 80) === outlineId)
      || text(a.title, 120).toLowerCase() === title
    ));
    if (idx >= 0) {
      next.activities[idx] = { ...next.activities[idx], ...row, title: text(row.title || row.name || next.activities[idx].title, 120) };
    }
  });
  return next;
}

function chunkIds(ids, batchSize) {
  const size = Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE);
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * Deterministic staged fixtures for CI — never a production fallback.
 */
function buildStagedFixtureResponse(userPrompt) {
  const raw = String(userPrompt || "");
  let parsed = {};
  try {
    const jsonStart = raw.indexOf("{");
    parsed = JSON.parse(raw.slice(jsonStart));
  } catch (_e) {
    parsed = {};
  }
  const mode = text(parsed.mode, 60);
  const brief = parsed.brief || {};
  const theme = text(brief.theme || brief.title || "Bakery", 80);
  const ageBand = brief.ageBand || "preschool";
  const ageLabel = brief.ageLabel || createApi.ageLabel(ageBand);
  const target = schema.clampInt(brief.activityTarget, 4, 24, createApi.defaultActivityTarget(ageBand));
  const progression = createApi.weekdayProgression(theme, ageBand);

  if (mode === "EXPAND_ACTIVITY_BATCH") {
    const ids = schema.asArray(parsed.expandExactlyTheseOutlineIds);
    const outlines = schema.asArray(parsed.outlinesToExpand);
    const byId = new Map(outlines.map((o) => [text(o.outlineId, 80), o]));
    const activities = ids.map((id, index) => {
      const outline = byId.get(text(id, 80)) || {};
      const name = text(outline.name || `${theme} activity ${index + 1}`, 120);
      const day = normalizeWeekday(outline.weekday || WEEKDAYS[index % 5]);
      const domain = text(outline.domain || "Invitation to Play", 80);
      const focus = progression[day] || day;
      return {
        outlineId: text(id, 80),
        title: name,
        dayOfWeek: day,
        activityCategory: domain,
        durationMinutes: 15,
        objective: `Children practice a concrete ${domain.toLowerCase()} skill during ${focus} using ${theme.toLowerCase()} materials tied to “${name}”.`,
        description: `Children use prepared ${theme.toLowerCase()} props for “${name}”: they handle counted pieces, take turns, and complete the invitation linked to ${focus}.`,
        materials: `Labeled tray, ${theme.toLowerCase()} props for “${name}”, wipeable mat, reset basket, 8–12 large manipulatives`,
        preparation: `Stage the “${name}” tray before arrival: count pieces, place tools at child height, and post the ${focus} card.`,
        setup: `Clear a small ${domain.toLowerCase()} space, set one tray per pair for “${name}”, and keep a reset basket beside the mat.`,
        steps: [
          `Name today’s focus (${focus}) and show one ${theme.toLowerCase()} prop for “${name}”.`,
          "Model one concrete action with one-to-one correspondence or turn-taking.",
          `Invite children to try the same action at the “${name}” tray with a clear start/stop signal.`,
          "Coach language with one specific stem related to the materials.",
          "Close by asking each child to name one action they completed.",
        ].join("\n"),
        teacherLanguage: [
          `I notice how you are using the ${theme.toLowerCase()} pieces at “${name}”.`,
          "Which piece should we try next, and why?",
          "Can you show a friend how you counted or placed that item?",
        ].join("\n"),
        observationOpportunities: `Watch grip, counting/turn-taking language, and whether children connect actions to ${focus} during “${name}”.`,
        safetyNotes: "Use large choke-safe props; keep pathways clear; supervise any tools.",
        cleanupTips: `Sort “${name}” props into labeled bins, wipe trays, and reset the mat.`,
        indoorAlternatives: `Move “${name}” to a table with the same props and objective.`,
        outdoorAlternatives: `Take the same “${name}” materials outdoors on a shaded mat.`,
        teacherTips: [
          `Keep “${name}” groups small.`,
          "Have one backup tray ready if interest spikes.",
        ],
        substitutions: [
          `Swap one commercial prop for a classroom ${theme.toLowerCase()} alternative of the same size.`,
        ],
        adaptations: "Offer fewer steps, hand-over-hand placement, or a seated version for children who need support.",
        extensions: `Add a choice card that deepens ${focus} for children ready for more challenge at “${name}”.`,
        vocabulary: `${theme}, ${name}, count, place, share, notice, next`,
        observationPrompts: [
          "What language did the child use with the materials?",
          "How did they solve a turn-taking or counting moment?",
        ],
        mixedAgeAdaptations: "Younger children use fewer pieces; older children add a second sorting/counting rule.",
        preliminaryAssetIntent: outline.expectedAssetIntent || {
          image: /Sensory|Art|Science|Dramatic/i.test(domain) ? "GENERATE" : "NOT_NEEDED",
          printable: /Math|Literacy|Dramatic/i.test(domain) ? "CREATE" : "NOT_NEEDED",
          reason: "Only when recognition or modeling benefits from a visual.",
        },
      };
    });
    return JSON.stringify({ activities });
  }

  if (mode === "REPAIR_TARGETED_LESSON_PATCH") {
    const failed = schema.asArray(parsed.failedActivities);
    return JSON.stringify({
      lessonPatches: {},
      activities: failed.map((a) => ({
        ...a,
        title: text(a.title || a.name, 120),
        objective: text(a.objective, 2000).length > 40
          ? a.objective
          : `Children practice a concrete skill during ${theme} play with clear materials and teacher coaching for “${a.title}”.`,
        description: text(a.description, 2000).length > 40
          ? a.description
          : `Children use prepared ${theme.toLowerCase()} materials for “${a.title}” with counted pieces and turn-taking.`,
        materials: text(a.materials, 2000).length > 20
          ? a.materials
          : `Trays, ${theme.toLowerCase()} props, wipeable mat, reset basket`,
        setup: text(a.setup, 2000).length > 20
          ? a.setup
          : `Set one tray per pair for “${a.title}” with a reset basket beside the mat.`,
        teacherLanguage: text(a.teacherLanguage, 2000).length > 40
          ? a.teacherLanguage
          : "I notice how you placed that piece.\nWhich piece comes next?\nCan you show a friend your method?",
        observationOpportunities: text(a.observationOpportunities, 2000).length > 30
          ? a.observationOpportunities
          : `Watch language, counting/turn-taking, and material use during “${a.title}”.`,
        adaptations: text(a.adaptations, 2000).length > 20
          ? a.adaptations
          : "Offer fewer steps or hand-over-hand support.",
        indoorAlternatives: text(a.indoorAlternatives, 2000).length > 20
          ? a.indoorAlternatives
          : `Move “${a.title}” to a table with the same props and objective.`,
        outdoorAlternatives: text(a.outdoorAlternatives, 2000).length > 20
          ? a.outdoorAlternatives
          : `Take the same “${a.title}” materials outdoors on a shaded mat.`,
        cleanupTips: text(a.cleanupTips, 2000).length > 20
          ? a.cleanupTips
          : `Sort “${a.title}” props into labeled bins and wipe trays.`,
        extensions: text(a.extensions, 2000).length > 20
          ? a.extensions
          : `Add a choice card that deepens the weekday focus for “${a.title}”.`,
        teacherTips: schema.asArray(a.teacherTips).length ? a.teacherTips : ["Keep the group small.", "Stage a backup tray."],
        observationPrompts: schema.asArray(a.observationPrompts).length
          ? a.observationPrompts
          : ["What language did the child use?", "How did they solve a turn-taking moment?"],
        vocabulary: text(a.vocabulary, 500).length > 5 ? a.vocabulary : `${theme}, try, share, notice`,
      })),
    });
  }

  // Stage 1 blueprint fixture (default)
  const outlines = [];
  for (let i = 0; i < target; i += 1) {
    const day = WEEKDAYS[i % WEEKDAYS.length];
    const indexOnDay = Math.floor(i / WEEKDAYS.length) + 1;
    const outlineId = outlineIdFor(theme, day, indexOnDay);
    const uniqueNoun = ["station", "invitation", "workshop", "lab", "trail", "studio", "circle", "hunt", "table", "corner", "path", "basket", "mat", "nook", "yard"][i % 15];
    const titleVerb = ["mix", "roll", "measure", "serve", "frost", "knead", "sift", "taste", "shape", "share", "count", "pour", "pack", "deliver", "celebrate"][i % 15];
    const name = `${theme} ${titleVerb} ${uniqueNoun}`;
    outlines.push({
      outlineId,
      name,
      weekday: day,
      domain: ["Sensory", "Math", "Dramatic Play", "Science / STEM", "Art / Creative", "Early Literacy", "Gross Motor", "Fine Motor", "Social-Emotional", "Music / Movement", "Outdoor", "Circle / Group", "STEM", "Language", "Practical Life"][i % 15],
      concept: `Children ${titleVerb} with ${theme.toLowerCase()} materials at the ${uniqueNoun} during ${progression[day]}.`,
      developmentalPurpose: `Build vocabulary, fine-motor control, and turn-taking tied to ${progression[day]}.`,
      expectedAssetIntent: {
        image: i % 3 === 0 ? "GENERATE" : "NOT_NEEDED",
        printable: i % 4 === 0 ? "CREATE" : "NOT_NEEDED",
        reason: "Only when modeling recognition helps.",
      },
    });
  }

  return JSON.stringify({
    lesson: {
      title: text(brief.title || theme, 120),
      age: ageLabel,
      theme,
      plan: brief.accessPlan === "Pro" ? "Pro" : "Free",
      weeklyOverview: `${theme} week for ${ageLabel}: Monday–Friday progression with varied play invitations.`,
      objectives: `During ${theme} week, ${ageLabel} children practice concrete play skills across domains with prepared materials and short coaching.`,
      weeklyMaterials: `Theme props for ${theme}, trays, labels, open-ended art/sensory materials, and a cleanup station.`,
      teacherPreparation: `Preview each weekday focus, gather ${theme.toLowerCase()} props, label trays, and stage Monday materials before arrival.`,
      prepChecklist: [
        `Gather ${theme.toLowerCase()} props by weekday`,
        "Label trays and reset baskets",
        "Prepare one open-ended backup invitation",
      ],
      observationFocus: [
        "Language attempts during play",
        "How children use materials",
        "Peer turn-taking",
      ],
      familyConnection: `Invite families to share one ${theme.toLowerCase()} word or photo from home.`,
      milestones: [
        "Shows interest in theme materials",
        "Uses related vocabulary with support",
        "Completes a short guided invitation",
      ],
      vocabularyWords: `${theme}, explore, notice, try, share`,
      dailyFocus: progression,
    },
    activityOutlines: outlines,
    songIntent: [],
    bookIntent: [],
  });
}

async function callAiStage(callAi, systemPrompt, userPrompt, usage, diagnostics, stageMeta) {
  let raw;
  try {
    raw = await callAi(systemPrompt, userPrompt, {
      maxOutputTokens: STAGE_MAX_OUTPUT_TOKENS,
      returnMeta: true,
      stage: stageMeta.stage,
    });
  } catch (error) {
    pushStageDiag(diagnostics, {
      stage: stageMeta.stage,
      ok: false,
      parseSuccess: false,
      outputChars: 0,
      validationIssues: [text(error?.message || "AI call failed", 200)],
      expectedObjectCount: stageMeta.expectedObjectCount,
    });
    return {
      ok: false,
      code: "AI_CREATION_FAILED",
      error: text(error?.message || "AI staged composer call failed", 500),
    };
  }
  const unwrapped = unwrapAiResult(raw);
  diagnostics.model = diagnostics.model || unwrapped.model;
  usage.openaiCalls += 1;
  const flags = truncationFlags(unwrapped.text, stageMeta.parsedHint || 0, stageMeta.expectedObjectCount || 0);
  if (flags.possibleOutputTruncation) usage.outputTruncationCount += 1;

  let parsed = null;
  let parseSuccess = true;
  try {
    parsed = JSON.parse(composer.stripJsonFences(unwrapped.text));
  } catch (_e) {
    parseSuccess = false;
  }

  return {
    ok: parseSuccess,
    code: parseSuccess ? "ok" : "malformed_output",
    error: parseSuccess ? null : "AI returned malformed JSON.",
    parsed,
    rawText: unwrapped.text,
    meta: unwrapped,
    flags,
  };
}

/**
 * Main staged compose entry — same success shape as composeNewLessonContent.
 */
async function composeStagedLessonContent(brief, options = {}) {
  const fixtureMode = architect.isCreateFixtureMode(options);
  let callAi = options.callAi;
  if (fixtureMode && typeof callAi !== "function") {
    callAi = async (_system, user) => buildStagedFixtureResponse(user);
  }
  if (typeof callAi !== "function") {
    return {
      ok: false,
      code: "AI_CREATION_FAILED",
      error: "Structured AI staged composer requires callAi. Deterministic production fallback is disabled.",
      usage: emptyUsage(),
    };
  }

  const usage = emptyUsage();
  const diagnostics = emptyDiagnostics();
  diagnostics.batchSize = schema.clampInt(options.batchSize, 2, 8, DEFAULT_BATCH_SIZE);
  usage.activitiesRequested = schema.clampInt(brief.activityTarget, 4, 24, createApi.defaultActivityTarget(brief.ageBand));

  const prior = options.priorProgress && typeof options.priorProgress === "object"
    ? options.priorProgress
    : {};

  let blueprint = prior.creationBlueprint || null;
  let blueprintComplete = prior.creationBlueprintComplete === true && blueprint;
  const batchState = prior.activityExpansionBatches && typeof prior.activityExpansionBatches === "object"
    ? { ...prior.activityExpansionBatches }
    : {};

  // -------- Stage 1 --------
  if (!blueprintComplete) {
    let stage1Issues = null;
    for (let attempt = 0; attempt < MAX_ARCHITECTURE_CALLS; attempt += 1) {
      usage.lessonArchitectureCalls += 1;
      usage.lessonArchitectCalls += 1;
      const stage = await callAiStage(
        callAi,
        buildStage1SystemPrompt(brief.ageBand),
        buildStage1UserPrompt(brief, stage1Issues),
        usage,
        diagnostics,
        { stage: attempt === 0 ? "week_architecture" : "week_architecture_repair", expectedObjectCount: usage.activitiesRequested },
      );
      if (!stage.ok) {
        pushStageDiag(diagnostics, {
          stage: attempt === 0 ? "week_architecture" : "week_architecture_repair",
          model: stage.meta?.model,
          finishReason: stage.meta?.finishReason,
          outputChars: stage.rawText?.length || 0,
          parseSuccess: false,
          expectedObjectCount: usage.activitiesRequested,
          parsedObjectCount: 0,
          possibleOutputTruncation: stage.flags?.possibleOutputTruncation,
          unterminatedJsonTail: stage.flags?.unterminatedJsonTail,
          validationIssues: [stage.error || "malformed_json"],
          ok: false,
        });
        if (attempt === MAX_ARCHITECTURE_CALLS - 1) {
          return {
            ok: false,
            code: "AI_CREATION_FAILED",
            error: stage.error || "Stage 1 week architecture failed.",
            usage,
            stagedDiagnostics: diagnostics,
            progress: { creationBlueprintComplete: false, creationBlueprint: null, activityExpansionBatches: batchState },
          };
        }
        stage1Issues = [stage.error || "malformed_json", ...(stage.flags?.reasons || [])];
        continue;
      }
      const validated = validateBlueprint(stage.parsed, brief);
      pushStageDiag(diagnostics, {
        stage: attempt === 0 ? "week_architecture" : "week_architecture_repair",
        model: stage.meta?.model,
        finishReason: stage.meta?.finishReason,
        outputChars: stage.rawText?.length || 0,
        parseSuccess: true,
        expectedObjectCount: validated.requiredOutlineCount,
        parsedObjectCount: validated.parsedOutlineCount,
        possibleOutputTruncation: stage.flags?.possibleOutputTruncation,
        unterminatedJsonTail: stage.flags?.unterminatedJsonTail,
        validationIssues: validated.issues,
        ok: validated.ok,
      });
      if (validated.ok) {
        blueprint = validated.blueprint;
        blueprintComplete = true;
        break;
      }
      stage1Issues = validated.issues;
      if (attempt === MAX_ARCHITECTURE_CALLS - 1) {
        return {
          ok: false,
          code: "AI_CREATION_FAILED",
          error: `Stage 1 quality gate failed: ${validated.issues.slice(0, 8).join("; ")}`,
          issues: validated.issues,
          usage,
          stagedDiagnostics: diagnostics,
          progress: { creationBlueprintComplete: false, creationBlueprint: validated.blueprint, activityExpansionBatches: batchState },
        };
      }
    }
  }

  const outlineIds = schema.asArray(blueprint.activityOutlines).map((o) => o.outlineId);
  const batches = chunkIds(outlineIds, diagnostics.batchSize);
  const expandedById = new Map();

  // Restore successful prior batch expansions
  Object.keys(batchState).forEach((key) => {
    const row = batchState[key];
    if (row && row.status === "SUCCESS" && Array.isArray(row.activities)) {
      row.activities.forEach((a) => {
        if (a?.outlineId) expandedById.set(a.outlineId, a);
      });
    }
  });

  // -------- Stage 2 --------
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batchKey = `batch${batchIndex + 1}`;
    const ids = batches[batchIndex];
    if (batchState[batchKey]?.status === "SUCCESS" && Array.isArray(batchState[batchKey].activities)
      && batchState[batchKey].activities.length === ids.length) {
      continue;
    }

    let lastIssues = [];
    let success = false;
    for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt += 1) {
      usage.activityExpansionCalls += 1;
      const stage = await callAiStage(
        callAi,
        buildExpansionSystemPrompt(brief.ageBand),
        buildExpansionUserPrompt(brief, blueprint, ids),
        usage,
        diagnostics,
        {
          stage: `activity_expansion_${batchKey}${attempt ? `_retry${attempt}` : ""}`,
          expectedObjectCount: ids.length,
        },
      );
      if (!stage.ok) {
        lastIssues = [stage.error || "malformed_json", ...(stage.flags?.reasons || [])];
        pushStageDiag(diagnostics, {
          stage: `activity_expansion_${batchKey}`,
          model: stage.meta?.model,
          finishReason: stage.meta?.finishReason,
          outputChars: stage.rawText?.length || 0,
          parseSuccess: false,
          expectedObjectCount: ids.length,
          parsedObjectCount: 0,
          possibleOutputTruncation: stage.flags?.possibleOutputTruncation,
          unterminatedJsonTail: stage.flags?.unterminatedJsonTail,
          validationIssues: lastIssues,
          ok: false,
        });
        continue;
      }
      const validated = validateExpansionBatch(stage.parsed, ids, blueprint, brief);
      pushStageDiag(diagnostics, {
        stage: `activity_expansion_${batchKey}`,
        model: stage.meta?.model,
        finishReason: stage.meta?.finishReason,
        outputChars: stage.rawText?.length || 0,
        parseSuccess: true,
        expectedObjectCount: ids.length,
        parsedObjectCount: validated.parsedObjectCount,
        possibleOutputTruncation: stage.flags?.possibleOutputTruncation,
        unterminatedJsonTail: stage.flags?.unterminatedJsonTail,
        validationIssues: validated.issues,
        ok: validated.ok,
      });
      if (validated.ok) {
        batchState[batchKey] = {
          status: "SUCCESS",
          outlineIds: ids,
          activities: validated.activities,
        };
        validated.activities.forEach((a) => expandedById.set(a.outlineId, a));
        success = true;
        break;
      }
      lastIssues = validated.issues;
      batchState[batchKey] = { status: "FAILED", outlineIds: ids, issues: lastIssues };
    }

    if (!success) {
      if (!batchState[batchKey] || batchState[batchKey].status !== "FAILED") {
        batchState[batchKey] = { status: "FAILED", outlineIds: ids, issues: lastIssues };
      }
      return {
        ok: false,
        code: "AI_CREATION_FAILED",
        error: `Stage 2 batch ${batchKey} failed: ${lastIssues.slice(0, 8).join("; ")}`,
        issues: lastIssues,
        usage,
        stagedDiagnostics: diagnostics,
        progress: {
          creationBlueprintComplete: true,
          creationBlueprint: blueprint,
          activityExpansionBatches: batchState,
        },
      };
    }
  }

  const expandedActivities = outlineIds.map((id) => expandedById.get(id)).filter(Boolean);
  usage.activitiesCompleted = expandedActivities.length;
  if (expandedActivities.length !== outlineIds.length) {
    return {
      ok: false,
      code: "AI_CREATION_FAILED",
      error: `Assembled activity count mismatch: ${expandedActivities.length}!=${outlineIds.length}`,
      usage,
      stagedDiagnostics: diagnostics,
      progress: {
        creationBlueprintComplete: true,
        creationBlueprint: blueprint,
        activityExpansionBatches: batchState,
      },
    };
  }

  // -------- Stage 3 assemble + validate --------
  let assembled = assembleLessonObject(blueprint, expandedActivities);
  let validated = architect.validateArchitectOutput(JSON.stringify(assembled), brief);
  pushStageDiag(diagnostics, {
    stage: "assemble_validate",
    outputChars: JSON.stringify(assembled).length,
    parseSuccess: true,
    expectedObjectCount: usage.activitiesRequested,
    parsedObjectCount: validated.parsedActivityCount,
    validationIssues: validated.issues || [],
    ok: validated.ok,
  });

  // -------- Stage 4 targeted repair --------
  let repaired = false;
  if (!validated.ok && MAX_FINAL_REPAIR_CALLS > 0) {
    usage.activityRepairCalls += 1;
    usage.lessonRevisionCalls += 1;
    const repairStage = await callAiStage(
      callAi,
      buildFinalRepairSystemPrompt(),
      buildFinalRepairUserPrompt(brief, assembled, validated.issues),
      usage,
      diagnostics,
      { stage: "targeted_repair", expectedObjectCount: schema.asArray(validated.issues).length },
    );
    if (repairStage.ok && repairStage.parsed) {
      assembled = applyRepairPatch(assembled, repairStage.parsed);
      validated = architect.validateArchitectOutput(JSON.stringify(assembled), brief);
      repaired = validated.ok === true;
      pushStageDiag(diagnostics, {
        stage: "targeted_repair",
        model: repairStage.meta?.model,
        finishReason: repairStage.meta?.finishReason,
        outputChars: repairStage.rawText?.length || 0,
        parseSuccess: true,
        expectedObjectCount: usage.activitiesRequested,
        parsedObjectCount: validated.parsedActivityCount,
        validationIssues: validated.issues || [],
        ok: validated.ok,
      });
    } else {
      pushStageDiag(diagnostics, {
        stage: "targeted_repair",
        outputChars: repairStage.rawText?.length || 0,
        parseSuccess: false,
        validationIssues: [repairStage.error || "repair_failed"],
        ok: false,
      });
    }
  }

  if (!validated.ok) {
    return {
      ok: false,
      code: "AI_CREATION_FAILED",
      error: validated.error || `Final quality gate failed: ${(validated.issues || []).slice(0, 8).join("; ")}`,
      issues: validated.issues,
      usage,
      stagedDiagnostics: diagnostics,
      progress: {
        creationBlueprintComplete: true,
        creationBlueprint: blueprint,
        activityExpansionBatches: batchState,
      },
    };
  }

  return {
    ok: true,
    content: validated.content,
    activityCount: schema.clampInt(brief.activityTarget, 4, 24, 12),
    progression: validated.content.lesson.dailyFocus,
    preliminaryAssetIntent: validated.content.preliminaryAssetIntent || [],
    researchStatus: brief.researchRequested ? "RESEARCH_NOT_AVAILABLE" : "not_requested",
    usage,
    revised: repaired,
    source: fixtureMode ? "fixture_ai" : "live_ai",
    staged: true,
    stagedDiagnostics: diagnostics,
    progress: {
      creationBlueprintComplete: true,
      creationBlueprint: {
        lesson: blueprint.lesson,
        activityOutlines: blueprint.activityOutlines,
      },
      activityExpansionBatches: Object.fromEntries(
        Object.entries(batchState).map(([k, v]) => [k, {
          status: v.status,
          outlineIds: v.outlineIds,
          // Persist compact success marker; full activities already assembled in content.
          activityCount: schema.asArray(v.activities).length,
          issues: v.issues || undefined,
        }]),
      ),
    },
  };
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  MAX_ARCHITECTURE_CALLS,
  MAX_BATCH_RETRIES,
  MAX_FINAL_REPAIR_CALLS,
  STAGE_MAX_OUTPUT_TOKENS,
  composeStagedLessonContent,
  buildStagedFixtureResponse,
  validateBlueprint,
  validateExpansionBatch,
  assembleLessonObject,
  chunkIds,
  outlineIdFor,
  buildStage1UserPrompt,
  buildExpansionUserPrompt,
};
