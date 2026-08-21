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
/** @deprecated Use MAX_EXPANSION_PARSE_RETRIES + MAX_QUALITY_REPAIR_CALLS_PER_BATCH. Kept for export compat. */
const MAX_BATCH_RETRIES = 1;
const MAX_EXPANSION_PARSE_RETRIES = 1; // one parse/transport recovery per batch
const MAX_QUALITY_REPAIR_CALLS_PER_BATCH = 1; // one targeted quality repair per batch
const MAX_FINAL_REPAIR_CALLS = 1;
const STAGE_MAX_OUTPUT_TOKENS = 12000;

/** Canonical Stage 1 weekly Teaching-Kit foundation fields (names-only contract). */
const REQUIRED_WEEKLY_FIELDS = Object.freeze([
  "weeklyOverview",
  "objectives",
  "weeklyMaterials",
  "teacherPreparation",
  "prepChecklist",
  "observationFocus",
  "familyConnection",
]);

const REQUIRED_WEEKLY_TEXT_FIELDS = Object.freeze([
  "weeklyOverview",
  "objectives",
  "weeklyMaterials",
  "teacherPreparation",
  "familyConnection",
]);

const REQUIRED_WEEKLY_LIST_FIELDS = Object.freeze([
  "prepChecklist",
  "observationFocus",
]);

/**
 * Known Stage 1 weekly aliases → canonical names.
 * Reuses the finish-composer map; no fuzzy matching.
 */
const STAGE1_WEEKLY_ALIASES = Object.freeze({
  ...composer.WEEK_FIELD_ALIASES,
  learningObjectives: "objectives",
  learningobjectives: "objectives",
  materialsStrategy: "weeklyMaterials",
  materialsstrategy: "weeklyMaterials",
  teacherPrepStrategy: "teacherPreparation",
  teacherprepstrategy: "teacherPreparation",
});

/**
 * Prompt/contract keys the model sometimes echoes into Stage 1 JSON.
 * Ignore them — never store, never flag as unknown_weekly_alias.
 */
const STAGE1_CONTRACT_ECHO_KEYS = Object.freeze(new Set([
  "requiredWeeklyFields",
  "requiredActivityCount",
  "requiredWeekdays",
  "requiredWeekdayDistribution",
  "requiredJsonSchema",
  "fixOnlyTheseIssues",
  "previousStage1",
  "stage1Repair",
  "revisionDirectives",
  "mode",
  "brief",
  "rules",
  "exclusions",
  "activityTarget",
  "accessPlan",
  "ageBand",
  "ageLabel",
  "CREATE_WEEK_BLUEPRINT",
]));

/** Canonical Stage 2 expansion activity fields (LLH Teaching Kit). */
const REQUIRED_EXPANSION_ACTIVITY_FIELDS = Object.freeze([
  "outlineId",
  "title",
  "dayOfWeek",
  "activityCategory",
  "durationMinutes",
  "objective",
  "description",
  "materials",
  "preparation",
  "setup",
  "steps",
  "teacherLanguage",
  "observationOpportunities",
  "safetyNotes",
  "cleanupTips",
  "indoorAlternatives",
  "outdoorAlternatives",
  "teacherTips",
  "substitutions",
  "adaptations",
  "extensions",
  "vocabulary",
  "observationPrompts",
  "mixedAgeAdaptations",
  "preliminaryAssetIntent",
]);

const STAGE2_CONTRACT_ECHO_KEYS = Object.freeze(new Set([
  "requiredActivityFields",
  "expandExactlyTheseOutlineIds",
  "requestedOutlineIds",
  "outlinesToExpand",
  "weeklyBlueprint",
  "batchNumber",
  "repairTargets",
  "fixOnlyTheseIssues",
  "previousBatchActivities",
  "mode",
  "brief",
  "rules",
  "fieldQualityExpectations",
]));

const FORBIDDEN_EXPANSION_ACTIVITY_KEYS = Object.freeze(new Set([
  "status",
  "published",
  "publishedAt",
  "lessonPlanId",
  "planId",
  "accessPlan",
  "plan",
  "ownerId",
  "createdBy",
]));

const EXPANSION_TEXT_FIELDS = Object.freeze([
  "objective", "description", "materials", "preparation", "setup", "steps",
  "teacherLanguage", "observationOpportunities", "safetyNotes", "cleanupTips",
  "indoorAlternatives", "outdoorAlternatives", "adaptations", "extensions",
  "vocabulary", "mixedAgeAdaptations",
]);

const EXPANSION_LIST_FIELDS = Object.freeze([
  "teacherTips", "observationPrompts", "substitutions",
]);

function text(value, max = 4000) {
  return schema.text(value, max);
}

function emptyUsage() {
  return {
    lessonArchitectCalls: 0,
    lessonRevisionCalls: 0,
    lessonArchitectureCalls: 0,
    activityExpansionCalls: 0,
    activityExpansionRetryCalls: 0,
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
    batches: [],
    stage1: null,
    finalPreCreate: null,
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

function truncationFlags(rawText, parsedCount, expectedCount, options = {}) {
  const trunc = architect.detectOutputTruncation(rawText, parsedCount, expectedCount, options);
  return {
    possibleOutputTruncation: trunc.truncatedLikely === true,
    unterminatedJsonTail: (trunc.reasons || []).includes("unterminated_json_tail"),
    reasons: trunc.reasons || [],
    rawLength: trunc.rawLength,
    parseSucceeded: trunc.parseSucceeded === true,
  };
}

function canonicalizeWeeklyFieldName(field) {
  const raw = text(field, 80);
  if (!raw) return "";
  if (
    REQUIRED_WEEKLY_FIELDS.includes(raw)
    || raw === "milestones"
    || raw === "vocabularyWords"
    || raw === "vocabCards"
    || raw === "dailyFocus"
    || raw === "title"
    || raw === "age"
    || raw === "theme"
    || raw === "plan"
    || raw === "status"
  ) {
    return raw === "vocabCards" ? "vocabularyWords" : raw;
  }
  if (STAGE1_WEEKLY_ALIASES[raw]) return STAGE1_WEEKLY_ALIASES[raw];
  const lower = raw.toLowerCase();
  if (STAGE1_WEEKLY_ALIASES[lower]) return STAGE1_WEEKLY_ALIASES[lower];
  return "";
}

function isStage1ContractEchoKey(key) {
  const raw = text(key, 80);
  if (!raw) return false;
  if (STAGE1_CONTRACT_ECHO_KEYS.has(raw)) return true;
  if (STAGE1_CONTRACT_ECHO_KEYS.has(raw.toLowerCase())) return true;
  return false;
}

/**
 * Build the lesson bag for Stage 1: prefer `lesson` object, but also accept
 * known weekly fields / aliases from the top level so they are not dropped
 * when the model nests a partial `lesson` object.
 */
function extractStage1LessonBag(parsed) {
  const rejectedAliases = [];
  const base = parsed?.lesson && typeof parsed.lesson === "object" && !Array.isArray(parsed.lesson)
    ? { ...parsed.lesson }
    : {};
  // Strip echoed contract keys from the lesson bag before normalization.
  Object.keys(base).forEach((key) => {
    if (isStage1ContractEchoKey(key)) delete base[key];
  });
  const sources = [parsed, base];
  const out = { ...base };

  sources.forEach((src, sourceIndex) => {
    if (!src || typeof src !== "object" || Array.isArray(src)) return;
    const fromLessonObject = sourceIndex === 1 || (parsed?.lesson && src === parsed.lesson);
    Object.keys(src).forEach((key) => {
      if (key === "lesson" || key === "activityOutlines" || key === "outlines" || key === "activities"
        || key === "songIntent" || key === "bookIntent") {
        return;
      }
      if (isStage1ContractEchoKey(key)) return;
      const canonical = canonicalizeWeeklyFieldName(key);
      if (!canonical) {
        // Reject unknown content-like keys (no fuzzy match into schema).
        // Prompt echo keys are ignored above; remaining unknowns stay rejected.
        if (fromLessonObject
          || /overview|objective|material|prep|observation|family|milestone|vocab|weekly/i.test(key)) {
          rejectedAliases.push({ field: key, reason: "unknown_weekly_alias" });
        }
        return;
      }
      if (["title", "age", "theme", "plan", "status", "dailyFocus"].includes(canonical)
        && !Object.prototype.hasOwnProperty.call(out, canonical)) {
        out[canonical] = src[key];
        return;
      }
      if (["title", "age", "theme", "plan", "status", "dailyFocus"].includes(canonical)) {
        if (!text(out[canonical]) && src[key] != null && src[key] !== "") out[canonical] = src[key];
        return;
      }
      const current = out[canonical];
      const incoming = src[key];
      const currentEmpty = Array.isArray(current)
        ? current.length === 0
        : !text(current);
      if (currentEmpty && incoming != null && incoming !== "") {
        out[canonical] = incoming;
      }
    });
  });

  return { lessonIn: out, rejectedAliases };
}

/**
 * When a Stage 1 repair omits or empties a previously valid field / outline set,
 * preserve the prior valid value. Still re-validated — never a loophole.
 */
function outlineSubstanceOk(row) {
  if (!row || typeof row !== "object") return false;
  const concept = text(row.concept || row.summary || row.description, 400);
  const purpose = text(row.developmentalPurpose || row.purpose || row.objective, 400);
  return wordCount(concept) >= 6 && wordCount(purpose) >= 4;
}

/** Explicit Stage 1 outline issue-code → canonical outline field (no fuzzy match). */
const STAGE1_OUTLINE_ISSUE_CODE_FIELD_MAP = Object.freeze({
  thin_concept: "concept",
  thin_purpose: "developmentalPurpose",
});

/**
 * Plan Stage 1 outline-field repair targets from quality issues.
 * thin_concept → concept; thin_purpose → developmentalPurpose.
 */
function planStage1OutlineRepair(issues, outlines) {
  const list = schema.asArray(outlines);
  const byId = new Map();
  const unmappedOutlineIssues = [];
  const initialThinConceptOutlineIds = [];
  const initialThinPurposeOutlineIds = [];

  schema.asArray(issues).forEach((rawIssue) => {
    const raw = text(rawIssue, 240);
    if (!raw) return;
    const m = raw.match(/^(.+)\.(thin_concept|thin_purpose)$/);
    if (!m) return;
    const label = text(m[1], 120);
    const code = m[2];
    const field = STAGE1_OUTLINE_ISSUE_CODE_FIELD_MAP[code];
    if (!field) {
      unmappedOutlineIssues.push(raw);
      return;
    }
    const outline = list.find((o) => (
      text(o?.name, 120) === label || text(o?.outlineId, 80) === label
    ));
    if (!outline?.outlineId) {
      unmappedOutlineIssues.push(raw);
      return;
    }
    if (code === "thin_concept") initialThinConceptOutlineIds.push(outline.outlineId);
    if (code === "thin_purpose") initialThinPurposeOutlineIds.push(outline.outlineId);
    if (!byId.has(outline.outlineId)) {
      byId.set(outline.outlineId, {
        outlineId: outline.outlineId,
        name: text(outline.name, 120),
        weekday: outline.weekday,
        domain: text(outline.domain, 80),
        fields: [],
      });
    }
    const row = byId.get(outline.outlineId);
    if (!row.fields.some((f) => f.field === field)) {
      row.fields.push({
        field,
        reason: code,
        issueCode: code,
        sourceIssue: raw,
      });
    }
  });

  return {
    mappedRepairTargets: [...byId.values()],
    unmappedOutlineIssues,
    initialThinConceptOutlineIds: [...new Set(initialThinConceptOutlineIds)],
    initialThinPurposeOutlineIds: [...new Set(initialThinPurposeOutlineIds)],
    canRepair: unmappedOutlineIssues.length === 0 && byId.size > 0,
  };
}

function coalesceStage1Parsed(priorBlueprint, parsed, brief, options = {}) {
  const target = schema.clampInt(brief.activityTarget, 4, 24, createApi.defaultActivityTarget(brief.ageBand));
  const { lessonIn } = extractStage1LessonBag(parsed);
  const priorLesson = priorBlueprint?.lesson && typeof priorBlueprint.lesson === "object"
    ? priorBlueprint.lesson
    : null;
  const lesson = { ...lessonIn };
  const repairTargets = schema.asArray(options.repairTargets);
  const targeted = new Map(
    repairTargets.map((t) => [
      text(t.outlineId, 80),
      new Set(schema.asArray(t.fields).map((f) => text(f.field || f, 60)).filter(Boolean)),
    ]).filter(([id]) => id),
  );

  if (priorLesson) {
    REQUIRED_WEEKLY_TEXT_FIELDS.forEach((field) => {
      const nextVal = lesson[field];
      const priorVal = priorLesson[field];
      const nextErr = rejectGeneric(field, nextVal);
      const priorErr = rejectGeneric(field, priorVal);
      // Keep prior when repair empties or replaces a previously valid field with invalid filler.
      if (priorErr) return;
      if (!text(priorVal) && !Array.isArray(priorVal)) return;
      if (nextErr || !text(nextVal)) lesson[field] = priorVal;
    });
    REQUIRED_WEEKLY_LIST_FIELDS.forEach((field) => {
      const nextList = schema.asArray(lesson[field]).map((v) => text(v, 200)).filter(Boolean);
      const priorList = schema.asArray(priorLesson[field]).map((v) => text(v, 200)).filter(Boolean);
      if (!nextList.length && priorList.length) lesson[field] = priorList;
    });
    if ((!lesson.dailyFocus || typeof lesson.dailyFocus !== "object") && priorLesson.dailyFocus) {
      lesson.dailyFocus = priorLesson.dailyFocus;
    } else if (lesson.dailyFocus && priorLesson.dailyFocus) {
      const mergedFocus = { ...lesson.dailyFocus };
      WEEKDAYS.forEach((day) => {
        if (!text(mergedFocus[day]) && text(priorLesson.dailyFocus[day])) {
          mergedFocus[day] = priorLesson.dailyFocus[day];
        }
      });
      lesson.dailyFocus = mergedFocus;
    }
    if (!schema.asArray(lesson.milestones).length && schema.asArray(priorLesson.milestones).length) {
      lesson.milestones = priorLesson.milestones;
    }
  }

  let outlines = schema.asArray(parsed?.activityOutlines || parsed?.outlines || parsed?.activities);
  const priorOutlines = schema.asArray(priorBlueprint?.activityOutlines);
  if (priorOutlines.length === target && outlines.length !== target) {
    outlines = priorOutlines;
  } else if (priorOutlines.length === target && outlines.length === target) {
    const priorById = new Map(priorOutlines.map((o) => [text(o.outlineId || o.id, 80), o]));
    outlines = outlines.map((row, index) => {
      const id = text(row?.outlineId || row?.id, 80) || text(priorOutlines[index]?.outlineId, 80) || `outline-${index + 1}`;
      const prior = priorById.get(id) || priorOutlines[index];
      if (!prior) return row;
      const fields = targeted.get(text(prior.outlineId, 80)) || targeted.get(id);
      if (fields && fields.size) {
        // Targeted thin-outline repair: preserve identity; replace only listed fields when non-empty.
        const merged = {
          ...prior,
          outlineId: prior.outlineId,
          name: prior.name,
          weekday: prior.weekday,
          domain: prior.domain,
          concept: prior.concept,
          developmentalPurpose: prior.developmentalPurpose,
          expectedAssetIntent: row?.expectedAssetIntent || prior.expectedAssetIntent,
        };
        if (fields.has("concept")) {
          const nextConcept = text(row.concept || row.summary || row.description, 400);
          // Non-empty repair replaces prior even if still thin — final gate remains authoritative.
          // Do not keep the old thin concept merely because it was non-empty.
          if (nextConcept) merged.concept = nextConcept;
        }
        if (fields.has("developmentalPurpose")) {
          const nextPurpose = text(row.developmentalPurpose || row.purpose || row.objective, 400);
          if (nextPurpose) merged.developmentalPurpose = nextPurpose;
        }
        return merged;
      }
      if (targeted.size > 0) {
        // Other outlines were not targeted — preserve exactly.
        return prior;
      }
      if (outlineSubstanceOk(prior) && !outlineSubstanceOk(row)) return prior;
      return row;
    });
  }

  return {
    lesson,
    activityOutlines: outlines,
    songIntent: parsed?.songIntent,
    bookIntent: parsed?.bookIntent,
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
  const { lessonIn, rejectedAliases } = extractStage1LessonBag(parsed);
  rejectedAliases.forEach((row) => {
    issues.push(`unknown_weekly_alias:${row.field}`);
  });
  const title = text(lessonIn?.title || brief.title, 120);
  if (!title) issues.push("missing_title");

  const dailyFocusIn = lessonIn?.dailyFocus && typeof lessonIn.dailyFocus === "object" ? lessonIn.dailyFocus : {};
  const dailyFocus = {};
  WEEKDAYS.forEach((day) => {
    const provided = text(dailyFocusIn[day], 120);
    if (!provided) issues.push(`missing_daily_focus:${day}`);
    dailyFocus[day] = provided
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
      objectives: text(lessonIn?.objectives, 2000),
      weeklyMaterials: text(lessonIn?.weeklyMaterials, 2000),
      teacherPreparation: text(lessonIn?.teacherPreparation, 2000),
      prepChecklist: schema.asArray(lessonIn?.prepChecklist).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
      observationFocus: schema.asArray(lessonIn?.observationFocus).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
      familyConnection: text(lessonIn?.familyConnection, 2000),
      milestones: schema.asArray(lessonIn?.milestones).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
      vocabularyWords: text(lessonIn?.vocabularyWords || lessonIn?.vocabCards, 500),
      dailyFocus,
    },
    activityOutlines: outlines,
    songIntent: schema.asArray(parsed?.songIntent).slice(0, 8),
    bookIntent: schema.asArray(parsed?.bookIntent).slice(0, 8),
  };

  REQUIRED_WEEKLY_TEXT_FIELDS.forEach((field) => {
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
    rejectedAliases,
  };
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function rejectGeneric(field, value) {
  const sample = Array.isArray(value) ? value.join(" ") : text(value);
  if (!sample) return `Empty ${field}`;
  if (/\b(TODO|TBD|placeholder|lorem ipsum|\[insert)\b/i.test(sample)) {
    return `Placeholder in ${field}`;
  }
  if (/\b(children will (explore|learn about)|set out (the )?materials|what do you see\?)\b/i.test(sample)
    && wordCount(sample) < 45) {
    return `Generic filler in ${field}`;
  }
  // safetyNotes: reject generic supervision/safe-materials filler that names no concrete hazard/action.
  // Does not lower the existing ≥8-word minimum — strengthens substance only.
  if (/\.safetyNotes$/i.test(field) || /(^|\.)safetyNotes$/i.test(field) || field === "safetyNotes") {
    const genericOnly = /\b(supervise children( closely)?|watch children( during play)?|use safe materials|be careful)\b/i.test(sample)
      && !/\b(chok(e|ing)?|mouth(ing)?|allerg(y|ies|en)?|sharp|breakable|spill|slip|sensory|small[- ]?part|temperature|hot|cold|handwash|sanit|tool|crack|adult supervision|pathway)\b/i.test(sample);
    if (genericOnly && wordCount(sample) < 28) {
      return `Generic filler in ${field}`;
    }
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
    "Stage 1 must return BOTH: (A) a complete weekly Teaching-Kit foundation AND (B) exactly requiredActivityCount activity outlines.",
    "Do NOT return until every requiredWeeklyFields entry is populated, all requiredWeekdays have dailyFocus, and exactly requiredActivityCount outlines are present.",
    "Empty strings, empty arrays, placeholder text, and TODO values are invalid.",
    "Do not sacrifice weekly foundation fields to maximize activity outlines — both are mandatory.",
    "Do NOT echo prompt/contract keys (requiredWeeklyFields, requiredActivityCount, requiredJsonSchema, rules, brief, mode) into the lesson object.",
    "Forbidden shallow filler (especially under 45 words): \"Children will explore/learn about…\", \"Set out materials\", \"What do you see?\".",
    "weeklyOverview must name the Mon–Fri progression with concrete classroom actions (not a generic theme sentence).",
    "Each outline concept must answer: what will children actually do, and what are they exploring/practicing? (≥6 words; not a title restatement).",
    "developmentalPurpose ≥4 words.",
    "Honor requiredActivityCount exactly with that many activityOutlines.",
    "Each outline is compact: outlineId, name, weekday, domain, concept, developmentalPurpose.",
    "Do not expand full materials/steps/questions yet.",
    "No duplicate or near-duplicate concepts.",
    "Distribute across Monday–Friday (normally 3 per weekday for 15).",
    ageRules,
  ].join("\n");
}

function classifyStage1RepairIssues(repairIssues, previousBlueprint) {
  const issues = schema.asArray(repairIssues).map((i) => text(i, 200)).filter(Boolean);
  const weeklyFieldFailures = [];
  const thinOutlineNames = [];
  const otherIssues = [];
  issues.forEach((issue) => {
    const weeklyHit = REQUIRED_WEEKLY_TEXT_FIELDS.find((f) => issue.includes(f))
      || REQUIRED_WEEKLY_LIST_FIELDS.find((f) => issue.toLowerCase().includes(f.toLowerCase()));
    if (weeklyHit || /Empty |Generic filler|Too short:|Placeholder|missing_prep_checklist|missing_observation_focus|missing_daily_focus/i.test(issue)) {
      weeklyFieldFailures.push(issue);
      return;
    }
    const thin = issue.match(/^(.+)\.thin_(concept|purpose)$/);
    if (thin) {
      thinOutlineNames.push(thin[1]);
      return;
    }
    otherIssues.push(issue);
  });
  const failedWeeklyFields = [];
  REQUIRED_WEEKLY_FIELDS.forEach((field) => {
    if (issues.some((i) => i.includes(field) || i.toLowerCase().includes(field.toLowerCase()))) {
      failedWeeklyFields.push(field);
    }
  });
  if (issues.some((i) => /missing_prep_checklist/i.test(i)) && !failedWeeklyFields.includes("prepChecklist")) {
    failedWeeklyFields.push("prepChecklist");
  }
  if (issues.some((i) => /missing_observation_focus/i.test(i)) && !failedWeeklyFields.includes("observationFocus")) {
    failedWeeklyFields.push("observationFocus");
  }
  const priorLesson = previousBlueprint?.lesson || {};
  const failedWeeklySnapshots = {};
  failedWeeklyFields.forEach((field) => {
    failedWeeklySnapshots[field] = priorLesson[field];
  });
  const outlinePlan = planStage1OutlineRepair(
    issues,
    schema.asArray(previousBlueprint?.activityOutlines),
  );
  return {
    weeklyFieldFailures,
    failedWeeklyFields,
    failedWeeklySnapshots,
    thinOutlineNames: [...new Set(thinOutlineNames)],
    otherIssues,
    outlineRepairTargets: outlinePlan.mappedRepairTargets,
    initialThinConceptOutlineIds: outlinePlan.initialThinConceptOutlineIds,
    initialThinPurposeOutlineIds: outlinePlan.initialThinPurposeOutlineIds,
    unmappedOutlineIssues: outlinePlan.unmappedOutlineIssues,
  };
}

function buildStage1UserPrompt(brief, repairIssues, previousBlueprint) {
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
    requiredWeeklyFields: [...REQUIRED_WEEKLY_FIELDS],
    requiredJsonSchema: {
      lesson: {
        title: "string",
        weeklyOverview: "string — specific Mon–Fri progression with concrete actions; not empty; not generic filler",
        objectives: "string — several age-appropriate goals; not empty",
        weeklyMaterials: "string — realistic grouped materials; not empty",
        teacherPreparation: "string — specific prep before the week; not empty",
        prepChecklist: ["actionable prep item"],
        observationFocus: ["specific developmental behavior/skill"],
        familyConnection: "string — realistic optional home connection; not empty",
        milestones: ["string"],
        dailyFocus: { monday: "string", tuesday: "string", wednesday: "string", thursday: "string", friday: "string" },
      },
      activityOutlines: [{
        outlineId: "theme-mon-01",
        name: "string",
        weekday: "monday|tuesday|wednesday|thursday|friday",
        domain: "string",
        concept: "1–2 sentences: what children actually do + what they explore/practice (≥6 words; not a title restatement)",
        developmentalPurpose: "string ≥4 words",
      }],
    },
    rules: [
      `Return exactly ${activityTarget} activityOutlines.`,
      "Populate EVERY requiredWeeklyFields value with useful non-empty content.",
      "Empty strings, empty arrays, placeholders, and TODO values are invalid.",
      "Do not echo requiredWeeklyFields or other prompt keys into lesson.",
      "Do not write shallow filler like \"Children will explore X\" unless the field is a full specific paragraph (≥45 words) with Mon–Fri detail.",
      "Each outline concept must answer: What will children actually do, and what are they exploring/practicing?",
      "Avoid title-restatement concepts.",
      "Do not omit weekly foundation fields to fit more outline detail.",
      "All five weekdays must appear in dailyFocus and in outlines when activityTarget >= 5.",
      "Do not return full activity bodies in Stage 1.",
    ],
  };
  if (repairIssues && repairIssues.length) {
    const priorOutlines = schema.asArray(previousBlueprint?.activityOutlines);
    const classified = classifyStage1RepairIssues(repairIssues, previousBlueprint);
    const outlinesCountOk = priorOutlines.length === activityTarget;
    const onlyWeeklyOrThin = classified.otherIssues.length === 0
      && (classified.weeklyFieldFailures.length > 0 || classified.thinOutlineNames.length > 0);
    const conceptTargets = classified.outlineRepairTargets.filter((t) => (
      schema.asArray(t.fields).some((f) => f.field === "concept")
    ));
    const purposeTargets = classified.outlineRepairTargets.filter((t) => (
      schema.asArray(t.fields).some((f) => f.field === "developmentalPurpose")
    ));
    payload.stage1Repair = true;
    payload.fixOnlyTheseIssues = repairIssues.slice(0, 40);
    payload.failedWeeklyFields = classified.failedWeeklyFields;
    payload.failedWeeklySnapshots = classified.failedWeeklySnapshots;
    payload.thinOutlineNames = classified.thinOutlineNames;
    payload.stage1OutlineRepairTargets = classified.outlineRepairTargets;
    payload.initialThinConceptOutlineIds = classified.initialThinConceptOutlineIds;
    payload.conceptQualityExpectation = [
      "A valid concept states (1) what children actually do,",
      "(2) the meaningful skill / exploration / developmental purpose,",
      "and (3) enough specificity to distinguish it from the title and other outlines.",
      "Usually 1–2 useful sentences. Unacceptable: vague title-like phrases or \"Children explore X.\"",
    ].join(" ");
    payload.previousStage1 = previousBlueprint
      ? {
        lesson: previousBlueprint.lesson,
        activityOutlines: priorOutlines,
      }
      : null;
    payload.revisionDirectives = [
      outlinesCountOk && classified.thinOutlineNames.length === 0
        ? `PRESERVE ALL ${activityTarget} VALID ACTIVITY OUTLINES unchanged.`
        : outlinesCountOk
          ? `Keep all ${activityTarget} outlines. Repair ONLY the fields listed in stage1OutlineRepairTargets (by outlineId). Preserve outlineId, weekday, name, and domain unless those fields are listed. Do not redesign the week.`
          : `Return exactly ${activityTarget} distinct activityOutlines.`,
      conceptTargets.length
        ? `thin_concept → concept for outlineIds: ${conceptTargets.map((t) => t.outlineId).join(", ")}. Rewrite each listed concept with concrete child actions + skill/exploration so it is no longer thin.`
        : "",
      purposeTargets.length
        ? `thin_purpose → developmentalPurpose for outlineIds: ${purposeTargets.map((t) => t.outlineId).join(", ")}. Rewrite only those purposes.`
        : "",
      classified.failedWeeklyFields.length
        ? `Repair ONLY these failed weekly fields: ${classified.failedWeeklyFields.join(", ")}. Rewrite them with concrete, non-filler Teaching Kit substance.`
        : "Repair ONLY the failed issues listed in fixOnlyTheseIssues.",
      "Forbidden: \"Children will explore/learn about…\", \"Set out materials\", \"What do you see?\" as short weeklyOverview/objectives text.",
      "weeklyOverview must describe Monday→Friday progression with specific classroom actions.",
      "Do NOT echo requiredWeeklyFields / requiredActivityCount / requiredJsonSchema into the JSON lesson object.",
      "Return the complete Stage 1 object with required weekly fields fully populated.",
      "Empty strings, empty arrays, placeholders, and TODO values remain invalid.",
      onlyWeeklyOrThin ? "Do not invent a new set of outlines unless an outline count/distribution issue is listed." : "",
    ].filter(Boolean);
  }
  return [
    "Create a compact weekly Teaching Kit blueprint.",
    "Respond with JSON only.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function asActivityStringList(value, maxItems = 8, maxLen = 300) {
  if (Array.isArray(value)) {
    return value.map((v) => {
      if (typeof v === "string") return text(v, maxLen);
      if (v && typeof v === "object") {
        return text(`${v.need || v.label || ""} → ${v.use || v.value || v.text || ""}`.replace(/^\s*→\s*/, ""), maxLen)
          || text(v.text || v.prompt || v.tip || "", maxLen);
      }
      return text(v, maxLen);
    }).filter(Boolean).slice(0, maxItems);
  }
  const raw = text(value, 2000);
  if (!raw) return [];
  const parts = raw.split(/\n+|;\s+(?=[A-Z])/)
    .map((part) => text(String(part).replace(/^\s*[-*•]\s*/, "").replace(/^\d+[\).:\]]\s*/, ""), maxLen))
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, maxItems);
  return [text(raw, maxLen)];
}

/**
 * Existing insufficient_questions gate (validateExpansionActivityItem):
 * pass when newline-separated prompt lines ≥ MIN_TEACHER_LANGUAGE_PROMPT_LINES
 * OR wordCount ≥ TEACHER_LANGUAGE_WORD_FALLBACK.
 * Do not change these thresholds — prompts/diagnostics must match them.
 */
const MIN_TEACHER_LANGUAGE_PROMPT_LINES = 2;
const TEACHER_LANGUAGE_WORD_FALLBACK = 24;

/** Existing thin_vocabulary gate: ≥3 distinct usable terms (not one vague theme word). */
const MIN_VOCABULARY_TERMS = 3;

function teacherLanguageShape(value) {
  if (value == null) return "empty";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return text(value) ? "string" : "empty";
  return typeof value;
}

/**
 * Canonical teacherLanguage storage is a newline-separated string.
 * Models often return a string[] (like teacherTips); schema.text(array) joins with
 * commas and collapses separately countable prompts into one line — which fails the
 * existing gate when wordCount < TEACHER_LANGUAGE_WORD_FALLBACK. Preserve array
 * entries as newline-separated prompts instead. Do not invent comma-splitting of prose.
 */
function normalizeTeacherLanguageField(value) {
  if (Array.isArray(value)) {
    return asActivityStringList(value, 8, 500).filter(Boolean).join("\n");
  }
  return text(value, 2000);
}

function countTeacherLanguagePrompts(value) {
  return normalizeTeacherLanguageField(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function teacherLanguageMeetsCountGate(value) {
  const normalized = normalizeTeacherLanguageField(value);
  return countTeacherLanguagePrompts(normalized) >= MIN_TEACHER_LANGUAGE_PROMPT_LINES
    || wordCount(normalized) >= TEACHER_LANGUAGE_WORD_FALLBACK;
}

function vocabularyShape(value) {
  if (value == null) return "empty";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return text(value) ? "string" : "empty";
  return typeof value;
}

/**
 * Extract vocabulary term candidates without fuzzy-splitting arbitrary prose.
 * Arrays: each entry is a term (entries may themselves be comma-lists).
 * Strings with commas/semicolons/newlines: split on those separators.
 * Otherwise: whitespace-separated words (space-separated term lists).
 */
function vocabularyTermCandidates(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => vocabularyTermCandidates(entry));
  }
  const raw = text(value, 500);
  if (!raw) return [];
  if (/[,;\n]/.test(raw)) {
    return raw.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean);
  }
  return raw.split(/\s+/).filter(Boolean);
}

/**
 * Canonical vocabulary storage is a comma-separated STRING of distinct terms.
 * Models often return string[]; schema.text(array) joins without spaces
 * ("a,b,c") so wordCount sees 1 token and falsely fails thin_vocabulary.
 * Deduplicate case-insensitively; do not invent terms.
 */
function normalizeVocabularyField(value) {
  const seen = new Set();
  const terms = [];
  vocabularyTermCandidates(value).forEach((candidate) => {
    const cleaned = text(candidate, 80).replace(/^[-•*\d.)\s]+/, "").trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push(cleaned);
  });
  return terms.join(", ");
}

function countVocabularyTerms(value) {
  const normalized = normalizeVocabularyField(value);
  if (!normalized) return 0;
  return normalized.split(",").map((t) => t.trim()).filter(Boolean).length;
}

function vocabularyMeetsTermGate(value) {
  return countVocabularyTerms(value) >= MIN_VOCABULARY_TERMS;
}

function buildTeacherLanguageRepairDiagnostics(priorActivities, afterActivities, repairPlan, postIssues, rawBeforeById, rawAfterById) {
  const priorById = new Map(schema.asArray(priorActivities).map((a) => [a.outlineId, a]));
  const afterById = new Map(schema.asArray(afterActivities).map((a) => [a.outlineId, a]));
  const rows = [];
  schema.asArray(repairPlan?.mappedRepairTargets).forEach((target) => {
    const teacherField = schema.asArray(target.fields).find((f) => f.field === "teacherLanguage");
    if (!teacherField) return;
    const id = text(target.outlineId, 80);
    const before = priorById.get(id);
    const after = afterById.get(id);
    const title = text(before?.title || after?.title || target.title, 120);
    const rawBefore = rawBeforeById && Object.prototype.hasOwnProperty.call(rawBeforeById, id)
      ? rawBeforeById[id]
      : before?.teacherLanguage;
    const rawAfter = rawAfterById && Object.prototype.hasOwnProperty.call(rawAfterById, id)
      ? rawAfterById[id]
      : after?.teacherLanguage;
    rows.push({
      outlineId: id,
      teacherLanguageShapeBefore: teacherLanguageShape(rawBefore),
      teacherLanguagePromptCountBefore: countTeacherLanguagePrompts(before?.teacherLanguage ?? rawBefore),
      repairTargetReason: text(teacherField.reason || teacherField.issueCode, 80) || "insufficient_questions",
      teacherLanguageShapeAfter: teacherLanguageShape(rawAfter),
      teacherLanguagePromptCountAfter: countTeacherLanguagePrompts(after?.teacherLanguage ?? rawAfter),
      questionQualityFailuresAfter: schema.asArray(postIssues)
        .map((issue) => text(issue, 200))
        .filter((issue) => issue.includes(title) && /\.insufficient_questions$|teacherLanguage/i.test(issue))
        .slice(0, 8),
    });
  });
  return rows;
}

function buildVocabularyRepairDiagnostics(priorActivities, afterActivities, repairPlan, postIssues, rawBeforeById, rawAfterById) {
  const priorById = new Map(schema.asArray(priorActivities).map((a) => [a.outlineId, a]));
  const afterById = new Map(schema.asArray(afterActivities).map((a) => [a.outlineId, a]));
  const rows = [];
  const vocabularyRepairOutlineIds = [];
  schema.asArray(repairPlan?.mappedRepairTargets).forEach((target) => {
    const vocabField = schema.asArray(target.fields).find((f) => f.field === "vocabulary");
    if (!vocabField) return;
    const id = text(target.outlineId, 80);
    vocabularyRepairOutlineIds.push(id);
    const before = priorById.get(id);
    const after = afterById.get(id);
    const title = text(before?.title || after?.title || target.title, 120);
    const rawBefore = rawBeforeById && Object.prototype.hasOwnProperty.call(rawBeforeById, id)
      ? rawBeforeById[id]
      : before?.vocabulary;
    const rawAfter = rawAfterById && Object.prototype.hasOwnProperty.call(rawAfterById, id)
      ? rawAfterById[id]
      : after?.vocabulary;
    rows.push({
      outlineId: id,
      vocabularyShapeBefore: vocabularyShape(rawBefore),
      vocabularyTermsBefore: countVocabularyTerms(before?.vocabulary ?? rawBefore),
      repairTargetReason: text(vocabField.reason || vocabField.issueCode, 80) || "thin_vocabulary",
      vocabularyShapeAfter: vocabularyShape(rawAfter),
      vocabularyTermsAfter: countVocabularyTerms(after?.vocabulary ?? rawAfter),
      postRepairVocabularyFailures: schema.asArray(postIssues)
        .map((issue) => text(issue, 200))
        .filter((issue) => issue.includes(title) && /\.thin_vocabulary$|vocabulary/i.test(issue))
        .slice(0, 8),
    });
  });
  return {
    vocabularyDiagnostics: rows,
    vocabularyRepairOutlineIds,
    vocabularyShapeBefore: Object.fromEntries(rows.map((r) => [r.outlineId, r.vocabularyShapeBefore])),
    vocabularyTermsBefore: Object.fromEntries(rows.map((r) => [r.outlineId, r.vocabularyTermsBefore])),
    vocabularyShapeAfter: Object.fromEntries(rows.map((r) => [r.outlineId, r.vocabularyShapeAfter])),
    vocabularyTermsAfter: Object.fromEntries(rows.map((r) => [r.outlineId, r.vocabularyTermsAfter])),
    postRepairVocabularyFailures: rows.flatMap((r) => r.postRepairVocabularyFailures).slice(0, 20),
  };
}

function rawTeacherLanguageByOutlineId(parsed) {
  const out = {};
  schema.asArray(parsed?.activities).forEach((row) => {
    const id = text(row?.outlineId || row?.id, 80);
    if (!id) return;
    if (Object.prototype.hasOwnProperty.call(row, "teacherLanguage")) {
      out[id] = row.teacherLanguage;
    } else if (Object.prototype.hasOwnProperty.call(row, "teacherQuestions")) {
      out[id] = row.teacherQuestions;
    } else if (Object.prototype.hasOwnProperty.call(row, "questions")) {
      out[id] = row.questions;
    }
  });
  return out;
}

function rawVocabularyByOutlineId(parsed) {
  const out = {};
  schema.asArray(parsed?.activities).forEach((row) => {
    const id = text(row?.outlineId || row?.id, 80);
    if (!id) return;
    if (Object.prototype.hasOwnProperty.call(row, "vocabulary")) {
      out[id] = row.vocabulary;
    } else if (Object.prototype.hasOwnProperty.call(row, "vocabularyWords")) {
      out[id] = row.vocabularyWords;
    }
  });
  return out;
}

function listFieldSubstanceOk(values, minItemWords = 6) {
  const list = schema.asArray(values).map((v) => text(v, 300)).filter(Boolean);
  if (!list.length) return false;
  const joined = list.join(" ");
  if (wordCount(joined) < minItemWords) return false;
  if (/\b(help (children )?as needed|observe the child|provide support|make it harder|be careful)\b/i.test(joined)
    && wordCount(joined) < 20) {
    return false;
  }
  return true;
}

function buildExpansionSystemPrompt(ageBand) {
  return [
    "You are the Little Learner Hub Curriculum Activity Expander.",
    "Expand ONLY the requested outlineIds into full teacher-ready activities.",
    "Return ONLY valid JSON: {\"activities\":[...]} with exactly those outlineIds.",
    "Do not invent extra activities. Do not omit requested outlineIds.",
    "EVERY returned activity must satisfy the complete requiredActivityFields contract before the batch is complete.",
    "Do not leave lower-priority fields blank because objective/setup/steps are present.",
    "teacherTips and observationPrompts MUST be non-empty string arrays with activity-specific substance.",
    "Reject generic filler like \"Children will learn about X\", \"Set out materials\", \"What do you see?\".",
    "Require activity-specific substance: concrete materials counts/placement, modeled steps, multiple useful questions, observation focus, adaptations, tips, observation prompts, and activity-specific safetyNotes.",
    "safetyNotes must name a concrete hazard or supervision need relevant to the activity and the teacher action that reduces it — not generic \"supervise children\" filler.",
    "Do NOT echo prompt/contract keys (requiredActivityFields, expandExactlyTheseOutlineIds, repairTargets) into activity objects.",
    "Do NOT set status, published, publishedAt, or lessonPlanId on activities.",
    ageBand === "preschool"
      ? "PRESCHOOL: play-based, concrete, collaborative, developmentally appropriate."
      : "Match the requested age band precisely.",
  ].join("\n");
}

function expansionFieldQualityExpectations() {
  return {
    description: [
      "Concrete activity-specific description of what the experience looks like.",
      "Include what children will do, the core materials/action/context, and what makes this activity distinct from the title alone.",
      "Bad: \"Children will explore bakery materials through play.\" / \"Children will learn about baking.\" / vague hands-on filler.",
      "Good: name the child actions and materials (scoop, pour, mix, sort, role-play, etc.) so a teacher can picture the experience.",
    ].join(" "),
    objective: [
      "Activity-specific learning objective naming the developmental skill, the child action that practices it, and the connection to this activity.",
      "Bad: \"Children will develop fine motor skills.\" / \"Children will practice counting.\" / \"Children will learn about bakeries.\"",
      "Good: skill + concrete child action in this activity (e.g. one-to-one correspondence by counting and matching items during play).",
    ].join(" "),
    teacherLanguage: [
      `Canonical format: a single newline-separated STRING (not a JSON array).`,
      `Include at least ${MIN_TEACHER_LANGUAGE_PROMPT_LINES} distinct activity-specific teacher prompts`,
      `(one prompt per line) so each is separately countable; prefer 3+ when the activity supports it`,
      `(observation + prediction/problem-solving + comparison/reflection).`,
      `Bad: one generic \"What do you see?\"; one paragraph that packs questions without newlines;`,
      `a JSON array of prompts; three near-duplicate variants.`,
      `Good: each line is a full, usable, activity-tied open prompt.`,
    ].join(" "),
    teacherTips: "Activity-specific implementation help (array). Bad: \"Help children as needed.\" Good: offer limited tools first, then add more once engaged.",
    observationPrompts: "Concrete teacher noticeables (array). Bad: \"Observe the child.\" Good: notice one-to-one correspondence, quantity language, recounts.",
    adaptations: "Real support adaptation (canonical field name: adaptations). Bad: \"Provide support.\" Good: larger manipulatives + one action at a time.",
    extensions: "Real added challenge. Bad: \"Make it harder.\" Good: compare two groups before counting to check.",
    steps: "Multiple actionable steps unless the activity is genuinely tiny.",
    cleanupTips: "May be concise if specific.",
    vocabulary: [
      `Canonical format: a single comma-separated STRING (not a JSON array).`,
      `Include at least ${MIN_VOCABULARY_TERMS} distinct activity-relevant terms useful for teacher-child language.`,
      "Bad: one vague theme word; a JSON array; duplicate padding to inflate count; empty string.",
      "Good: concrete activity-tied words (materials/actions/concepts children can hear and use).",
    ].join(" "),
    safetyNotes: "Activity-specific safety guidance (≥8 words). Name a relevant hazard/supervision need (choking, mouthing, allergy, spills, tools, temperature, etc. when applicable) and the teacher action that reduces it. Bad: \"Supervise children.\" / \"Use safe materials.\" Good: large non-chokable pieces + remove cracked tools + supervise mouthing.",
  };
}

/**
 * Per-field repair contract for aggregated Stage 2 repairTargets.
 * Distinguishes generic_filler (REPLACE/REWRITE) from too_short/missing (write substantive).
 * Does not weaken rejectGeneric — only instructs the model.
 */
function fieldRepairQualityInstruction(field, reason) {
  const canonical = canonicalizeExpansionIssueField(field) || text(field, 60);
  const why = text(reason, 80);
  if (canonical === "description") {
    if (why === "generic_filler") {
      return [
        "The existing description is long enough but too generic.",
        "REPLACE it with concrete activity-specific text.",
        "Do not preserve or lightly paraphrase the generic wording.",
        "Include what children will do, the core materials/action/context, and what makes this activity distinct.",
        "Forbidden short patterns: \"Children will explore/learn about…\", vague \"fun hands-on activity\" filler.",
      ].join(" ");
    }
    return [
      "Write a concrete activity-specific description: what children do,",
      "core materials/action/context, and what makes the experience distinct from the title alone.",
    ].join(" ");
  }
  if (canonical === "objective") {
    if (why === "generic_filler") {
      return [
        "The existing objective is structurally present but too generic.",
        "REWRITE it to name the actual developmental skill and the child action used in this activity.",
        "Do not preserve or lightly paraphrase the generic wording.",
        "Tie the skill to this specific activity's materials/actions.",
        "Forbidden short patterns: \"Children will develop fine motor skills.\" / \"Children will practice counting.\" / \"Children will learn about…\" without a concrete activity action.",
      ].join(" ");
    }
    return [
      "Write an activity-specific objective naming the developmental skill,",
      "the child action that practices it, and how it connects to this activity.",
      "Meet the existing depth gate — not a thin one-liner.",
    ].join(" ");
  }
  if (canonical === "teacherLanguage") {
    return [
      `Return a newline-separated STRING with at least ${MIN_TEACHER_LANGUAGE_PROMPT_LINES} distinct activity-specific prompts.`,
      "Do not return a JSON array or one generic sentence.",
    ].join(" ");
  }
  if (canonical === "safetyNotes") {
    if (why === "generic_filler") {
      return [
        "The existing safetyNotes text is structurally present but too generic.",
        "REPLACE the existing generic safety text. Do not lightly paraphrase it.",
        "Write activity-specific safety guidance that identifies the relevant material/tool/environment risk IF one exists,",
        "what the teacher should do to reduce that risk, and supervision expectations tied specifically to this activity.",
        "Only mention risks relevant to the actual materials/actions (e.g. small parts/choking, mouthing, allergy, spills, scissors/tools, sensory ingestion, temperature, sanitation).",
        "Do not fabricate hazards. Do not return supervise-only or \"use safe materials\" filler.",
      ].join(" ");
    }
    // too_short / missing / other: expand with substance (do not merely lengthen empty filler)
    return [
      "Expand safetyNotes with relevant hazard + teacher action for this activity.",
      "Name a concrete material/tool/supervision need and the teacher action that reduces risk.",
      "Do not return generic supervise-only filler.",
    ].join(" ");
  }
  if (canonical === "indoorAlternatives") {
    if (why === "generic_filler") {
      return [
        "The existing indoorAlternatives text is too generic.",
        "REPLACE it with a practical indoor adaptation of THIS activity.",
        "Explain where/how the activity can happen indoors, what materials or setup change if needed, and preserve the original learning goal.",
        "Do not lightly paraphrase \"do this indoors\" filler.",
      ].join(" ");
    }
    return [
      "EXPAND this field into a practical indoor adaptation of the same activity.",
      "Explain where/how the activity can happen indoors, what materials or setup change if needed,",
      "and preserve the original learning goal.",
      "Do not merely lengthen the existing sentence. Do not write generic filler such as \"Do this activity indoors.\"",
    ].join(" ");
  }
  if (canonical === "outdoorAlternatives") {
    if (why === "generic_filler") {
      return [
        "The existing outdoorAlternatives text is too generic.",
        "REPLACE it with a practical outdoor adaptation of THIS activity.",
        "Explain where/how the activity can happen outdoors, what materials or setup change if needed, and preserve the original learning goal.",
      ].join(" ");
    }
    return [
      "EXPAND this field into a practical outdoor adaptation of the same activity.",
      "Explain where/how the activity can happen outdoors, what materials or setup change if needed,",
      "and preserve the original learning goal. Do not write generic \"do this outside\" filler.",
    ].join(" ");
  }
  if (canonical === "vocabulary") {
    return [
      `Return vocabulary as a single comma-separated STRING with at least ${MIN_VOCABULARY_TERMS} distinct activity-specific terms.`,
      "Do not return a JSON array.",
      "Do not return one vague theme word.",
      "Do not pad with duplicate synonyms used only to inflate count.",
      "Each term should be useful teacher-child language tied to this activity's materials/actions.",
      "Use activityContext.currentVocabulary and replace thin vocabulary with a complete term list.",
    ].join(" ");
  }
  if (canonical === "materials") {
    return "List concrete activity materials with enough detail to set up the experience (not a one-word list).";
  }
  return "";
}

/** Instruction type label for diagnostics: REPLACE (generic_filler) vs EXPAND (too_short/other). */
function safetyRepairInstructionType(reason) {
  return text(reason, 80) === "generic_filler" ? "REPLACE" : "EXPAND";
}

/**
 * Enrich mapped repairTargets with per-field qualityInstruction + activity context
 * for aggregated Stage 2 repair. Does not change mapping/sweep logic.
 */
function enrichExpansionRepairTargets(repairTargets, previousActivities, blueprint) {
  const priorById = new Map(schema.asArray(previousActivities).map((a) => [text(a.outlineId, 80), a]));
  const outlineMap = new Map(
    schema.asArray(blueprint?.activityOutlines).map((o) => [text(o.outlineId, 80), o]),
  );
  return schema.asArray(repairTargets).map((target) => {
    const id = text(target.outlineId, 80);
    const prior = priorById.get(id) || {};
    const outline = outlineMap.get(id) || {};
    const fields = schema.asArray(target.fields).map((f) => {
      const field = text(f.field, 60);
      const reason = text(f.reason || f.issueCode, 80);
      const instruction = fieldRepairQualityInstruction(field, reason);
      const row = {
        field,
        reason,
        issueCode: text(f.issueCode || reason, 80),
        sourceIssue: text(f.sourceIssue, 200),
        ...(instruction ? { qualityInstruction: instruction } : {}),
      };
      if (field === "safetyNotes") {
        row.instructionType = safetyRepairInstructionType(reason);
      }
      return row;
    });
    return {
      outlineId: id,
      title: text(target.title || prior.title || outline.name, 120),
      fields,
      activityContext: {
        name: text(prior.title || outline.name || target.title, 120),
        weekday: text(prior.dayOfWeek || outline.weekday, 20),
        domain: text(prior.activityCategory || outline.domain, 80),
        concept: text(outline.concept, 500),
        developmentalPurpose: text(outline.developmentalPurpose, 500),
        materials: text(prior.materials, 500),
        setup: text(prior.setup, 500),
        steps: text(prior.steps, 500),
        currentDescription: text(prior.description, 500),
        currentObjective: text(prior.objective, 500),
        currentSafetyNotes: text(prior.safetyNotes, 500),
        currentVocabulary: normalizeVocabularyField(prior.vocabulary),
        currentIndoorAlternatives: text(prior.indoorAlternatives, 500),
        currentOutdoorAlternatives: text(prior.outdoorAlternatives, 500),
      },
    };
  });
}

function collectGenericFillerRepairDiagnostics(repairTargets, preIssues, postIssues) {
  const targets = schema.asArray(repairTargets);
  const genericFillerTargets = targets
    .map((t) => ({
      outlineId: text(t.outlineId, 80),
      fields: schema.asArray(t.fields)
        .filter((f) => text(f.reason || f.issueCode, 80) === "generic_filler")
        .map((f) => text(f.field, 60)),
    }))
    .filter((t) => t.fields.length > 0);
  const descriptionRepairsByOutlineId = Object.fromEntries(
    targets
      .filter((t) => schema.asArray(t.fields).some((f) => f.field === "description"))
      .map((t) => [text(t.outlineId, 80), schema.asArray(t.fields).filter((f) => f.field === "description")]),
  );
  const objectiveRepairsByOutlineId = Object.fromEntries(
    targets
      .filter((t) => schema.asArray(t.fields).some((f) => f.field === "objective"))
      .map((t) => [text(t.outlineId, 80), schema.asArray(t.fields).filter((f) => f.field === "objective")]),
  );
  const isGeneric = (row) => {
    if (!row || typeof row !== "object") return /generic_filler|Generic filler/i.test(String(row || ""));
    return text(row.code || row.reason, 80) === "generic_filler"
      || /Generic filler/i.test(text(row.message || row.sourceIssue, 200));
  };
  const isSafetyGeneric = (row) => {
    if (!isGeneric(row)) return false;
    if (row && typeof row === "object") {
      return text(row.field, 60) === "safetyNotes"
        || /\.safetyNotes$/i.test(text(row.message || row.sourceIssue, 200));
    }
    return /safetyNotes/i.test(String(row || ""));
  };
  const safetyFields = targets.flatMap((t) => (
    schema.asArray(t.fields)
      .filter((f) => text(f.field, 60) === "safetyNotes")
      .map((f) => ({
        outlineId: text(t.outlineId, 80),
        reason: text(f.reason || f.issueCode, 80),
        instructionType: text(f.instructionType, 40) || safetyRepairInstructionType(f.reason || f.issueCode),
      }))
  ));
  const safetyRepairReasonByOutlineId = Object.fromEntries(
    safetyFields.map((row) => [row.outlineId, row.reason]),
  );
  const safetyRepairInstructionTypeByOutlineId = Object.fromEntries(
    safetyFields.map((row) => [row.outlineId, row.instructionType]),
  );
  return {
    genericFillerTargets,
    descriptionRepairsByOutlineId,
    objectiveRepairsByOutlineId,
    genericFillerBefore: schema.asArray(preIssues).filter(isGeneric).slice(0, 20),
    genericFillerAfter: schema.asArray(postIssues).filter(isGeneric).slice(0, 20),
    safetyRepairReasonByOutlineId,
    safetyRepairInstructionType: safetyRepairInstructionTypeByOutlineId,
    genericSafetyBefore: schema.asArray(preIssues).filter(isSafetyGeneric).slice(0, 20),
    genericSafetyAfter: schema.asArray(postIssues).filter(isSafetyGeneric).slice(0, 20),
  };
}

function buildExpansionUserPrompt(brief, blueprint, outlineIds, options = {}) {
  const wanted = schema.asArray(outlineIds).map((id) => text(id, 80)).filter(Boolean);
  const outlines = schema.asArray(blueprint.activityOutlines)
    .filter((o) => wanted.includes(o.outlineId));
  const payload = {
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
    requiredActivityFields: [...REQUIRED_EXPANSION_ACTIVITY_FIELDS],
    fieldQualityExpectations: expansionFieldQualityExpectations(),
    rules: [
      `Return exactly ${wanted.length} activities.`,
      "Every expandExactlyTheseOutlineIds value must appear exactly once.",
      "No unrequested outlineId.",
      "Populate EVERY requiredActivityFields entry — missing/empty/TODO/generic filler fails.",
      "description: concrete child actions + materials/context; not \"Children will explore/learn about X\".",
      "objective: developmental skill + child action tied to this activity; not a thin generic skill sentence.",
      `teacherLanguage: return a newline-separated STRING with at least ${MIN_TEACHER_LANGUAGE_PROMPT_LINES} distinct activity-specific prompts (one per line; prefer 3+). Do not return a JSON array. Do not return one generic question. Do not combine all prompts into a single unparseable paragraph.`,
      `vocabulary: return a comma-separated STRING with at least ${MIN_VOCABULARY_TERMS} distinct activity-relevant terms. Do not return a JSON array. Do not return one vague theme word. Do not pad with duplicates.`,
      "teacherTips: non-empty array of activity-specific tips.",
      "observationPrompts: non-empty array of concrete observation prompts.",
      "adaptations: practical activity-specific support (canonical field adaptations).",
      "safetyNotes: activity-specific hazard/supervision guidance with a concrete teacher action — not generic \"supervise children\" filler.",
      "Use week context so Batch activities do not duplicate earlier concepts.",
      "Do not echo requiredActivityFields into activity objects.",
    ],
  };
  if (options.batchNumber) payload.batchNumber = options.batchNumber;
  return [
    "Expand ONLY these activity outlines into full Teaching Kit activities.",
    "Keep outlineId on each returned activity. Keep name/weekday/domain aligned with the outline.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

/**
 * Parse/transport recovery prompt — same requested batch only; no redesign.
 */
function buildExpansionParseRetryUserPrompt(brief, blueprint, outlineIds, options = {}) {
  const base = buildExpansionUserPrompt(brief, blueprint, outlineIds, options);
  return [
    "Your previous response could not be parsed. Return the same requested activity batch in valid structured JSON only.",
    "Do not redesign the batch. Keep the exact expandExactlyTheseOutlineIds, weekday/domain/name alignment, and required activity fields.",
    "Do not omit activities. Do not add extras. Return parseable JSON only.",
    base,
  ].join("\n");
}

/**
 * True when the expansion response failed as parse/transport (not activity quality).
 * Quality failures with a parsed activity set must NOT use this path.
 */
function isExpansionParseTransportFailure(stage, validated, expectedCount) {
  if (!stage || stage.ok !== true) return true;
  const expected = Number(expectedCount) || 0;
  const parsedCount = Number.isFinite(validated?.parsedObjectCount)
    ? validated.parsedObjectCount
    : Number(stage.parsedObjectCount) || 0;
  if (parsedCount === 0) return true;
  if (stage.flags?.unterminatedJsonTail === true && parsedCount < expected) return true;
  if (stage.flags?.possibleOutputTruncation === true && parsedCount === 0) return true;
  const issues = schema.asArray(validated?.issues);
  if (expected > 0) {
    const missingRequested = issues.filter((i) => /^missing_requested_outline_id:/.test(String(i))).length;
    if (missingRequested >= expected) return true;
  }
  const activities = schema.asArray(validated?.activities).filter((a) => a && a.outlineId);
  if (expected > 0 && activities.length === 0) return true;
  return false;
}

/**
 * Explicit Stage 2 quality issue-code → canonical activity field map.
 * No fuzzy matching. Only codes emitted by validateExpansionActivityItem / rejectGeneric.
 */
const EXPANSION_ISSUE_CODE_FIELD_MAP = Object.freeze({
  insufficient_questions: "teacherLanguage",
  missing_tips: "teacherTips",
  thin_tips: "teacherTips",
  missing_observation_prompts: "observationPrompts",
  thin_observation_prompts: "observationPrompts",
  thin_vocabulary: "vocabulary",
});

/** When rejectGeneric embeds a field name, normalize known aliases to canonical. */
const EXPANSION_ISSUE_FIELD_ALIASES = Object.freeze({
  tips: "teacherTips",
  teacherTips: "teacherTips",
  observationPrompts: "observationPrompts",
  observationQuestions: "observationPrompts",
  prompts: "observationPrompts",
  adaptations: "adaptations",
  supportAdaptations: "adaptations",
  support: "adaptations",
  modifications: "adaptations",
  extensions: "extensions",
  addedChallenge: "extensions",
  teacherLanguage: "teacherLanguage",
  questions: "teacherLanguage",
  teacherQuestions: "teacherLanguage",
  vocabulary: "vocabulary",
  objective: "objective",
  description: "description",
  materials: "materials",
  preparation: "preparation",
  teacherPrep: "preparation",
  setup: "setup",
  steps: "steps",
  observationOpportunities: "observationOpportunities",
  observationFocus: "observationOpportunities",
  safetyNotes: "safetyNotes",
  safety: "safetyNotes",
  cleanupTips: "cleanupTips",
  cleanup: "cleanupTips",
  mixedAgeAdaptations: "mixedAgeAdaptations",
  mixedAgeNotes: "mixedAgeAdaptations",
  indoorAlternatives: "indoorAlternatives",
  outdoorAlternatives: "outdoorAlternatives",
  substitutions: "substitutions",
});

const EXPANSION_STRUCTURAL_ISSUE_RE = /^(missing_outline_id|unrequested_outline_id|duplicate_outline_id|missing_requested_outline_id|bad_weekday|unknown_activity_key|forbidden_activity_key|malformed_json|unmapped_quality_issue)/i;

function canonicalizeExpansionIssueField(field) {
  const raw = text(field, 80);
  if (!raw) return "";
  if (EXPANSION_ISSUE_FIELD_ALIASES[raw]) return EXPANSION_ISSUE_FIELD_ALIASES[raw];
  if (REQUIRED_EXPANSION_ACTIVITY_FIELDS.includes(raw)) return raw;
  return "";
}

function isActionableExpansionQualityIssue(issue) {
  const raw = text(issue, 240);
  if (!raw) return false;
  if (EXPANSION_STRUCTURAL_ISSUE_RE.test(raw)) return false;
  if (/^unmapped_quality_issue:/i.test(raw)) return false;
  if (/\.insufficient_questions$/.test(raw)) return true;
  if (/\.(missing_tips|thin_tips|missing_observation_prompts|thin_observation_prompts|thin_vocabulary)$/.test(raw)) {
    return true;
  }
  if (/^(Too short|Generic filler in|Placeholder in|Empty)\b/i.test(raw)) return true;
  return false;
}

function parseExpansionIssueTarget(issue, activities) {
  const raw = text(issue, 240);
  if (!raw) return { hit: null, unmapped: false, issue: raw };

  let title = null;
  let field = null;
  let reason = "invalid";
  let code = null;

  const tooShort = raw.match(/^Too short:\s*(.+)\.([A-Za-z]+)$/);
  const generic = raw.match(/^Generic filler in\s+(.+)\.([A-Za-z]+)$/i);
  const placeholder = raw.match(/^Placeholder in\s+(.+)\.([A-Za-z]+)$/i);
  const emptyField = raw.match(/^Empty\s+(.+)\.([A-Za-z]+)$/i);
  const suffixCode = raw.match(/^(.+)\.(insufficient_questions|missing_tips|thin_tips|missing_observation_prompts|thin_observation_prompts|thin_vocabulary)$/);

  if (tooShort) {
    title = tooShort[1]; field = tooShort[2]; reason = "too_short"; code = "too_short";
  } else if (generic) {
    title = generic[1]; field = generic[2]; reason = "generic_filler"; code = "generic_filler";
  } else if (placeholder) {
    title = placeholder[1]; field = placeholder[2]; reason = "placeholder"; code = "placeholder";
  } else if (emptyField) {
    title = emptyField[1]; field = emptyField[2]; reason = "missing"; code = "empty";
  } else if (suffixCode) {
    title = suffixCode[1];
    code = suffixCode[2];
    field = EXPANSION_ISSUE_CODE_FIELD_MAP[code] || null;
    reason = code === "insufficient_questions" || code.startsWith("missing_") ? "missing" : "too_short";
    if (code === "insufficient_questions") reason = "insufficient_questions";
  } else if (EXPANSION_STRUCTURAL_ISSUE_RE.test(raw)) {
    return { hit: null, unmapped: false, issue: raw, structural: true };
  } else if (isActionableExpansionQualityIssue(raw)) {
    return { hit: null, unmapped: true, issue: raw };
  } else {
    return { hit: null, unmapped: false, issue: raw, structural: true };
  }

  const canonical = canonicalizeExpansionIssueField(field);
  if (!canonical) {
    return {
      hit: null,
      unmapped: isActionableExpansionQualityIssue(raw),
      issue: raw,
      code,
    };
  }

  const act = schema.asArray(activities).find((a) => text(a.title || a.name, 120) === text(title, 120));
  if (!act?.outlineId) {
    return { hit: null, unmapped: true, issue: raw, code };
  }
  return {
    hit: {
      outlineId: act.outlineId,
      field: canonical,
      reason,
      title: text(title, 120),
      issueCode: code || canonical,
      sourceIssue: raw,
    },
    unmapped: false,
    issue: raw,
  };
}

/**
 * Plan Stage 2 repair targets from quality issues.
 * Returns unmapped actionable issues that must block before wasting the repair call.
 */
function planExpansionRepair(issues, activities) {
  const byId = new Map();
  const unmapped = [];
  const initialQualityFailures = schema.asArray(issues).map((i) => text(i, 200)).filter(Boolean);

  initialQualityFailures.forEach((issue) => {
    const parsed = parseExpansionIssueTarget(issue, activities);
    if (parsed.unmapped) {
      unmapped.push(issue);
      return;
    }
    if (!parsed.hit) return;
    const hit = parsed.hit;
    if (!byId.has(hit.outlineId)) {
      byId.set(hit.outlineId, { outlineId: hit.outlineId, title: hit.title, fields: [] });
    }
    const row = byId.get(hit.outlineId);
    if (!row.fields.some((f) => f.field === hit.field)) {
      row.fields.push({
        field: hit.field,
        reason: hit.reason,
        issueCode: hit.issueCode,
        sourceIssue: hit.sourceIssue,
      });
    }
  });

  const targets = [...byId.values()];
  return {
    initialQualityFailures,
    mappedRepairTargets: targets,
    unmappedQualityIssues: unmapped,
    canRepair: unmapped.length === 0 && targets.length > 0,
  };
}

function buildExpansionRepairTargets(issues, activities) {
  return planExpansionRepair(issues, activities).mappedRepairTargets;
}

function buildExpansionRepairUserPrompt(brief, blueprint, outlineIds, previousActivities, issues, options = {}) {
  const wanted = schema.asArray(outlineIds).map((id) => text(id, 80)).filter(Boolean);
  const plan = options.repairPlan || planExpansionRepair(issues, previousActivities);
  const repairTargets = enrichExpansionRepairTargets(
    plan.mappedRepairTargets,
    previousActivities,
    blueprint,
  );
  const failedIds = repairTargets.map((t) => t.outlineId);
  const repairedFieldsByOutlineId = Object.fromEntries(
    repairTargets.map((t) => [t.outlineId, t.fields.map((f) => f.field)]),
  );
  const safetyTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "safetyNotes")
  ));
  const safetyGenericTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "safetyNotes" && f.reason === "generic_filler")
  ));
  const safetyTooShortTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => (
      f.field === "safetyNotes" && f.reason !== "generic_filler"
    ))
  ));
  const teacherLanguageTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "teacherLanguage")
  ));
  const insufficientQuestionsTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => (
      f.field === "teacherLanguage"
      && (f.reason === "insufficient_questions" || f.issueCode === "insufficient_questions")
    ))
  ));
  const descriptionGenericTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "description" && f.reason === "generic_filler")
  ));
  const objectiveGenericTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "objective" && f.reason === "generic_filler")
  ));
  const descriptionTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "description")
  ));
  const objectiveTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "objective")
  ));
  const safetyOutlineIds = repairTargets
    .filter((t) => schema.asArray(t.fields).some((f) => f.field === "safetyNotes"))
    .map((t) => t.outlineId);
  const teacherLanguageOutlineIds = repairTargets
    .filter((t) => schema.asArray(t.fields).some((f) => f.field === "teacherLanguage"))
    .map((t) => t.outlineId);
  const vocabularyTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "vocabulary")
  ));
  return [
    "Repair ONLY the failed activity fields in this expansion batch.",
    "Preserve valid activities and valid fields. Keep outlineId / title / dayOfWeek / activityCategory aligned to the blueprint.",
    "Do not regenerate all activities from scratch — repair every listed canonical field only.",
    "Use each repairTargets[].activityContext (name, concept, developmentalPurpose, materials, setup, steps, currentSafetyNotes, currentVocabulary) and each field's qualityInstruction.",
    JSON.stringify({
      mode: "REPAIR_ACTIVITY_BATCH",
      brief: {
        title: brief.title,
        theme: brief.theme,
        ageBand: brief.ageBand,
        ageLabel: brief.ageLabel,
        accessPlan: brief.accessPlan,
      },
      batchNumber: options.batchNumber || null,
      expandExactlyTheseOutlineIds: wanted,
      repairTargets,
      repairedFieldsByOutlineId,
      safetyRepairOutlineIds: safetyOutlineIds,
      teacherLanguageRepairOutlineIds: teacherLanguageOutlineIds,
      vocabularyRepairOutlineIds: repairTargets
        .filter((t) => schema.asArray(t.fields).some((f) => f.field === "vocabulary"))
        .map((t) => t.outlineId),
      minTeacherLanguagePromptLines: MIN_TEACHER_LANGUAGE_PROMPT_LINES,
      minVocabularyTerms: MIN_VOCABULARY_TERMS,
      fixOnlyTheseIssues: schema.asArray(issues).slice(0, 40),
      requiredActivityFields: [...REQUIRED_EXPANSION_ACTIVITY_FIELDS],
      fieldQualityExpectations: expansionFieldQualityExpectations(),
      weeklyBlueprint: {
        title: blueprint.lesson.title,
        dailyFocus: blueprint.lesson.dailyFocus,
        outlines: schema.asArray(blueprint.activityOutlines)
          .filter((o) => wanted.includes(o.outlineId))
          .map((o) => ({
            outlineId: o.outlineId,
            name: o.name,
            weekday: o.weekday,
            domain: o.domain,
            concept: o.concept,
            developmentalPurpose: o.developmentalPurpose,
          })),
      },
      previousBatchActivities: schema.asArray(previousActivities),
      rules: [
        `Return exactly ${wanted.length} activities covering every expandExactlyTheseOutlineIds value once.`,
        failedIds.length
          ? `Focus repairs on outlineIds: ${failedIds.join(", ")}.`
          : "Repair listed issues only.",
        "Preserve strong original fields that already passed validation.",
        "Preserve outlineId, title, dayOfWeek, and activityCategory unless explicitly targeted.",
        "Fix EVERY listed repairTargets field in this one response. Do not skip any outlineId or field. Do not repair only the first failure.",
        "Follow each field's qualityInstruction exactly. generic_filler means REPLACE/REWRITE — do not lengthen or lightly paraphrase the same generic sentence.",
        teacherLanguageTargeted
          ? `If teacherLanguage is targeted: return the complete canonical teacherLanguage as a newline-separated STRING with at least ${MIN_TEACHER_LANGUAGE_PROMPT_LINES} distinct activity-specific teacher prompts (one prompt per line; prefer 3+ with observation, prediction/problem-solving, and comparison/reflection). Each prompt must be separately countable by the existing validator. Do not return a JSON array. Do not return one generic sentence. Do not combine prompts into a single unparseable paragraph. Do not return generic filler or near-duplicate variants.`
          : "",
        insufficientQuestionsTargeted
          ? `Replace teacherLanguage with at least ${MIN_TEACHER_LANGUAGE_PROMPT_LINES} distinct activity-specific teacher prompts in the canonical newline-separated string format. Each prompt must be separately countable by the existing validator.`
          : "",
        vocabularyTargeted
          ? `If vocabulary is targeted: return a comma-separated STRING with at least ${MIN_VOCABULARY_TERMS} distinct activity-specific terms. Do not return a JSON array. Do not return one vague theme word. Do not pad with duplicate synonyms. Use activityContext (materials/setup/steps/currentVocabulary) so terms are activity-tied.`
          : "",
        descriptionGenericTargeted
          ? "If description is targeted for generic_filler: The existing description is long enough but too generic. REPLACE it with concrete activity-specific text. Do not preserve or lightly paraphrase the generic wording. Include what children will do, the core materials/action/context, and what makes this activity distinct."
          : "",
        descriptionTargeted && !descriptionGenericTargeted
          ? "If description is targeted: write a concrete activity-specific description of child actions, materials/context, and what makes the experience distinct."
          : "",
        objectiveGenericTargeted
          ? "If objective is targeted for generic_filler: The existing objective is structurally present but too generic. REWRITE it to name the actual developmental skill and the child action used in this activity. Do not preserve or lightly paraphrase the generic wording."
          : "",
        objectiveTargeted && !objectiveGenericTargeted
          ? "If objective is targeted: write an activity-specific objective that names the developmental skill, the child action, and how it connects to this activity. Meet the existing depth/length gate — do not return a thin one-liner."
          : "",
        "If adaptations is targeted: return a practical, activity-specific support adaptation (not \"Provide support.\").",
        safetyGenericTargeted
          ? "If safetyNotes is targeted for generic_filler: REPLACE the existing generic safety text. Do not lightly paraphrase it. Write activity-specific safety guidance using materials/setup/steps from activityContext: identify the relevant material/tool/environment risk IF one exists, what the teacher should do to reduce that risk, and supervision expectations tied to this activity. Do not fabricate hazards. Do not return generic supervision language. Do not return supervise-only or \"use safe materials\" filler."
          : "",
        safetyTooShortTargeted && !safetyGenericTargeted
          ? "If safetyNotes is targeted (too_short/missing): expand with a relevant hazard + teacher action for this activity. Do not return generic supervision language. Do not fabricate hazards that do not apply."
          : "",
        safetyTargeted && safetyGenericTargeted && safetyTooShortTargeted
          ? "If safetyNotes is targeted for too_short/missing on other activities: expand with relevant hazard + teacher action. Do not return generic supervision language. Do not fabricate hazards that do not apply."
          : "",
        "teacherTips and observationPrompts must remain non-empty activity-specific arrays when present/targeted.",
        "Do not echo requiredActivityFields / repairTargets into activity objects.",
        "Do not set status/published/publishedAt.",
      ].filter(Boolean),
    }, null, 2),
  ].join("\n");
}

function stripExpansionContractEcho(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return { cleaned: row, rejected: [], forbidden: [] };
  const cleaned = { ...row };
  const rejected = [];
  const forbidden = [];
  Object.keys(cleaned).forEach((key) => {
    if (STAGE2_CONTRACT_ECHO_KEYS.has(key)) {
      delete cleaned[key];
      return;
    }
    if (FORBIDDEN_EXPANSION_ACTIVITY_KEYS.has(key)) {
      forbidden.push(key);
      delete cleaned[key];
      return;
    }
  });
  // Unknown curriculum-like keys (not canonical / known aliases)
  Object.keys(cleaned).forEach((key) => {
    if (REQUIRED_EXPANSION_ACTIVITY_FIELDS.includes(key)) return;
    if (["name", "weekday", "domain", "category", "whatChildrenWillDo", "teacherPrep", "teacherQuestions",
      "observationFocus", "safety", "cleanup", "supportAdaptations", "addedChallenge", "mixedAgeNotes",
      "tips", "questions", "duration", "id", "outline_id"].includes(key)) {
      return; // known aliases handled in normalize
    }
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(key) && !["preliminaryAssetIntent", "expectedAssetIntent"].includes(key)) {
      // Reject unknown content keys that look curriculum-ish
      if (/tip|prompt|adapt|extend|vocab|material|step|setup|objective|status|publish/i.test(key)) {
        rejected.push(key);
        delete cleaned[key];
      }
    }
  });
  return { cleaned, rejected, forbidden };
}

function normalizeExpansionActivity(raw, outline, brief, issues) {
  const { cleaned, rejected, forbidden } = stripExpansionContractEcho(raw);
  const actTitle = text(cleaned.title || cleaned.name || outline.name, 120);
  rejected.forEach((key) => issues.push(`${actTitle}.unknown_activity_key:${key}`));
  forbidden.forEach((key) => issues.push(`${actTitle}.forbidden_activity_key:${key}`));

  const day = normalizeWeekday(cleaned.dayOfWeek || cleaned.weekday || outline.weekday);
  return {
    outlineId: text(cleaned.outlineId || cleaned.id || outline.outlineId, 80),
    title: actTitle,
    dayOfWeek: day,
    activityCategory: text(cleaned.activityCategory || cleaned.domain || cleaned.category || outline.domain, 80),
    objective: text(cleaned.objective, 2000),
    description: text(cleaned.description || cleaned.whatChildrenWillDo, 2000),
    materials: text(cleaned.materials, 2000),
    preparation: text(cleaned.preparation || cleaned.teacherPrep, 2000),
    setup: text(cleaned.setup, 2000),
    steps: text(cleaned.steps, 4000),
    teacherLanguage: normalizeTeacherLanguageField(
      cleaned.teacherLanguage || cleaned.teacherQuestions || cleaned.questions,
    ),
    observationOpportunities: text(cleaned.observationOpportunities || cleaned.observationFocus, 2000),
    safetyNotes: text(cleaned.safetyNotes || cleaned.safety, 2000),
    cleanupTips: text(cleaned.cleanupTips || cleaned.cleanup, 2000),
    indoorAlternatives: text(cleaned.indoorAlternatives || cleaned.indoorOutdoorOptions, 2000),
    outdoorAlternatives: text(cleaned.outdoorAlternatives, 2000),
    teacherTips: asActivityStringList(cleaned.teacherTips || cleaned.tips),
    substitutions: asActivityStringList(cleaned.substitutions),
    adaptations: text(cleaned.adaptations || cleaned.supportAdaptations, 2000),
    extensions: text(cleaned.extensions || cleaned.addedChallenge, 2000),
    vocabulary: normalizeVocabularyField(cleaned.vocabulary || cleaned.vocabularyWords),
    observationPrompts: asActivityStringList(
      cleaned.observationPrompts || cleaned.observationQuestions || cleaned.prompts,
    ),
    durationMinutes: schema.clampInt(
      cleaned.durationMinutes || cleaned.duration,
      3,
      60,
      brief.ageBand === "infant" ? 8 : 15,
    ),
    age: brief.ageLabel,
    mixedAgeAdaptations: text(cleaned.mixedAgeAdaptations || cleaned.mixedAgeNotes, 2000),
    preliminaryAssetIntent: cleaned.preliminaryAssetIntent && typeof cleaned.preliminaryAssetIntent === "object"
      ? cleaned.preliminaryAssetIntent
      : outline.expectedAssetIntent,
  };
}

function validateExpansionActivityItem(item, issues) {
  const actTitle = item.title;
  const requiredTextFields = [
    "objective", "description", "materials", "preparation", "setup", "steps",
    "teacherLanguage", "observationOpportunities", "safetyNotes", "cleanupTips",
    "adaptations", "extensions",
  ];
  requiredTextFields.forEach((field) => {
    const err = rejectGeneric(`${actTitle}.${field}`, item[field]);
    if (err) issues.push(err);
  });
  // Concise cleanup/vocabulary allowed when specific; vocabulary still needs ≥MIN_VOCABULARY_TERMS distinct terms.
  if (!vocabularyMeetsTermGate(item.vocabulary)) issues.push(`${actTitle}.thin_vocabulary`);
  if (!item.teacherTips.length) issues.push(`${actTitle}.missing_tips`);
  else if (!listFieldSubstanceOk(item.teacherTips, 8)) issues.push(`${actTitle}.thin_tips`);
  if (!item.observationPrompts.length) issues.push(`${actTitle}.missing_observation_prompts`);
  else if (!listFieldSubstanceOk(item.observationPrompts, 8)) issues.push(`${actTitle}.thin_observation_prompts`);
  if (!WEEKDAYS.includes(item.dayOfWeek)) issues.push(`bad_weekday:${item.dayOfWeek}`);
  // teacherLanguage: ≥MIN newline-separated prompts OR ≥WORD_FALLBACK words (unchanged gate)
  if (!teacherLanguageMeetsCountGate(item.teacherLanguage)) {
    issues.push(`${actTitle}.insufficient_questions`);
  }
}

/**
 * Convert a legacy Stage 2 issue string into a structured quality finding.
 * Reuses parseExpansionIssueTarget — does not invent new codes or fields.
 */
function toStructuredQualityIssue(issueString, activities) {
  const raw = text(issueString, 240);
  const parsed = parseExpansionIssueTarget(raw, activities);
  if (parsed.hit) {
    return {
      outlineId: parsed.hit.outlineId,
      field: parsed.hit.field,
      code: text(parsed.hit.issueCode || parsed.hit.reason, 80),
      reason: text(parsed.hit.reason, 80),
      message: raw,
      sourceIssue: raw,
    };
  }
  return {
    outlineId: null,
    field: null,
    code: parsed.unmapped ? "unmapped_quality_issue" : (parsed.structural ? "structural" : "unknown"),
    reason: parsed.unmapped ? "unmapped" : "structural",
    message: raw,
    sourceIssue: raw,
    unmapped: parsed.unmapped === true,
    structural: parsed.structural === true,
  };
}

function issueCountByField(structuredIssues) {
  const counts = {};
  schema.asArray(structuredIssues).forEach((row) => {
    const field = text(row?.field, 60) || "_unmapped";
    counts[field] = (counts[field] || 0) + 1;
  });
  return counts;
}

/**
 * Deterministic PRE-CREATE / Stage 2 quality sweep.
 * Runs the existing validateExpansionActivityItem rules across every activity
 * and returns ALL failures in one pass (does not stop after the first).
 * Does not weaken gates. Does not invent new field requirements.
 */
function sweepExpansionActivitiesQuality(activities) {
  const list = schema.asArray(activities).filter((a) => a && typeof a === "object");
  const issueStrings = [];
  list.forEach((item) => {
    validateExpansionActivityItem(item, issueStrings);
  });
  const structuredIssues = issueStrings.map((iss) => toStructuredQualityIssue(iss, list));
  return {
    ok: issueStrings.length === 0,
    issueStrings,
    structuredIssues,
    issueCountByField: issueCountByField(structuredIssues),
    activityCount: list.length,
  };
}

/**
 * Final pre-create sweep over the full assembled Stage 2 activity set (typically 15).
 * Field rules = Stage 2 sweep. Also checks count, weekday coverage, duplicate titles,
 * near-duplicate titles, and placeholder/TODO blobs — same spirit as architect gates.
 */
function sweepAssembledLessonQuality(expandedActivities, brief) {
  const activities = schema.asArray(expandedActivities).filter((a) => a && typeof a === "object");
  const fieldSweep = sweepExpansionActivitiesQuality(activities);
  const issueStrings = [...fieldSweep.issueStrings];
  const structuredIssues = [...fieldSweep.structuredIssues];
  const target = schema.clampInt(brief?.activityTarget, 4, 24, 12);

  if (activities.length !== target) {
    const msg = `activity_count_mismatch:${activities.length}!=${target}`;
    issueStrings.push(msg);
    structuredIssues.push({
      outlineId: null,
      field: null,
      code: "activity_count_mismatch",
      reason: "structural",
      message: msg,
      sourceIssue: msg,
      structural: true,
    });
  }

  const dist = Object.fromEntries(WEEKDAYS.map((d) => [d, 0]));
  activities.forEach((a) => {
    const day = normalizeWeekday(a.dayOfWeek);
    if (Object.prototype.hasOwnProperty.call(dist, day)) dist[day] += 1;
  });
  if (target >= 5) {
    const daysUsed = WEEKDAYS.filter((d) => dist[d] > 0);
    if (daysUsed.length < 5) {
      const msg = `weekday_coverage_incomplete:${daysUsed.length}<5`;
      issueStrings.push(msg);
      structuredIssues.push({
        outlineId: null, field: null, code: "weekday_coverage_incomplete",
        reason: "structural", message: msg, sourceIssue: msg, structural: true,
      });
    }
    const counts = WEEKDAYS.map((d) => dist[d]);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max - min > 1) {
      const msg = `weekday_distribution_imbalanced:max${max}-min${min}`;
      issueStrings.push(msg);
      structuredIssues.push({
        outlineId: null, field: null, code: "weekday_distribution_imbalanced",
        reason: "structural", message: msg, sourceIssue: msg, structural: true,
      });
    }
  }

  const titles = activities.map((a) => text(a.title, 120).toLowerCase()).filter(Boolean);
  if (new Set(titles).size < titles.length) {
    const msg = "duplicate_activity_titles";
    issueStrings.push(msg);
    structuredIssues.push({
      outlineId: null, field: null, code: "duplicate_activity_titles",
      reason: "structural", message: msg, sourceIssue: msg, structural: true,
    });
  }
  for (let i = 0; i < titles.length; i += 1) {
    for (let j = i + 1; j < titles.length; j += 1) {
      if (createApi.similarityScore(titles[i], titles[j]) >= 0.75) {
        const msg = `similar_titles:${titles[i]}~${titles[j]}`;
        if (!issueStrings.includes(msg)) {
          issueStrings.push(msg);
          structuredIssues.push({
            outlineId: null, field: null, code: "similar_titles",
            reason: "structural", message: msg, sourceIssue: msg, structural: true,
          });
        }
      }
    }
  }

  return {
    ok: issueStrings.length === 0,
    issueStrings,
    structuredIssues,
    issueCountByField: issueCountByField(structuredIssues),
    activityCount: activities.length,
    weekdayDistribution: dist,
  };
}

function validateExpansionBatch(parsed, requestedIds, blueprint, brief) {
  const issues = [];
  const requested = schema.asArray(requestedIds).map((id) => text(id, 80));
  // Strip top-level contract echoes
  const top = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
  Object.keys(top).forEach((key) => {
    if (STAGE2_CONTRACT_ECHO_KEYS.has(key) && key !== "activities") delete top[key];
  });
  const activitiesIn = schema.asArray(top.activities || parsed?.activities);
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
    const item = normalizeExpansionActivity(raw, outline, brief, issues);
    item.outlineId = id;
    validateExpansionActivityItem(item, issues);
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

function fieldPassedOnActivity(activity, field, briefTitleIssues) {
  if (!activity) return false;
  const title = text(activity.title, 120);
  const related = schema.asArray(briefTitleIssues).filter((iss) => String(iss).includes(title));
  if (field === "teacherTips") {
    return activity.teacherTips?.length > 0
      && listFieldSubstanceOk(activity.teacherTips, 8)
      && !related.some((i) => /\.missing_tips$|\.thin_tips$/.test(i));
  }
  if (field === "observationPrompts") {
    return activity.observationPrompts?.length > 0
      && listFieldSubstanceOk(activity.observationPrompts, 8)
      && !related.some((i) => /\.missing_observation_prompts$|\.thin_observation_prompts$/.test(i));
  }
  if (field === "teacherLanguage") {
    return teacherLanguageMeetsCountGate(activity.teacherLanguage)
      && !rejectGeneric(`${title}.teacherLanguage`, activity.teacherLanguage)
      && !related.some((i) => /\.insufficient_questions$|Generic filler in .+\.teacherLanguage|Too short: .+\.teacherLanguage/i.test(i));
  }
  if (EXPANSION_TEXT_FIELDS.includes(field)) {
    return !rejectGeneric(`${title}.${field}`, activity[field])
      && !(field === "vocabulary" && !vocabularyMeetsTermGate(activity.vocabulary));
  }
  if (field === "substitutions") return schema.asArray(activity.substitutions).length > 0;
  return text(activity[field]) || schema.asArray(activity[field]).length > 0;
}

function coalesceExpansionBatch(priorActivities, parsed, requestedIds, blueprint, brief, priorIssues) {
  const requested = schema.asArray(requestedIds).map((id) => text(id, 80));
  const priorById = new Map(schema.asArray(priorActivities).map((a) => [a.outlineId, a]));
  const repairValidated = validateExpansionBatch(parsed, requestedIds, blueprint, brief);
  const repairById = new Map(repairValidated.activities.map((a) => [a.outlineId, a]));
  const repairPlan = planExpansionRepair(priorIssues || repairValidated.issues, priorActivities);
  const repairTargets = repairPlan.mappedRepairTargets;
  const targeted = new Map(repairTargets.map((t) => [t.outlineId, new Set(t.fields.map((f) => f.field))]));
  const mergedActivities = [];
  requested.forEach((id) => {
    const prior = priorById.get(id);
    const next = repairById.get(id);
    if (!prior && next) {
      mergedActivities.push(next);
      return;
    }
    if (prior && !next) {
      mergedActivities.push(prior);
      return;
    }
    if (!prior || !next) return;
    const fieldsToPreferRepair = targeted.get(id) || new Set();
    const merged = { ...prior };
    const allFields = [
      ...EXPANSION_TEXT_FIELDS,
      ...EXPANSION_LIST_FIELDS,
      "title", "dayOfWeek", "activityCategory", "durationMinutes", "preliminaryAssetIntent",
    ];
    allFields.forEach((field) => {
      const priorOk = fieldPassedOnActivity(prior, field, priorIssues);
      const nextEmpty = Array.isArray(next[field])
        ? next[field].length === 0
        : !text(next[field]);
      const nextOk = fieldPassedOnActivity(next, field, repairValidated.issues);
      if (fieldsToPreferRepair.has(field)) {
        if (!nextEmpty) merged[field] = next[field];
        return;
      }
      if (priorOk && (nextEmpty || !nextOk)) return; // keep prior
      if (!nextEmpty) merged[field] = next[field];
    });
    // Identity/alignment fields stay on blueprint/prior
    merged.outlineId = id;
    merged.title = prior.title || next.title;
    merged.dayOfWeek = prior.dayOfWeek || next.dayOfWeek;
    merged.activityCategory = prior.activityCategory || next.activityCategory;
    mergedActivities.push(merged);
  });

  // Re-validate merged object shape via validateExpansionBatch wrapper
  return validateExpansionBatch({ activities: mergedActivities }, requestedIds, blueprint, brief);
}

function recordBatchDiagnostic(diagnostics, row) {
  diagnostics.batches = Array.isArray(diagnostics.batches) ? diagnostics.batches : [];
  const repairedFieldsByOutlineId = row.repairedFieldsByOutlineId
    || Object.fromEntries(
      schema.asArray(row.repairTargets || row.mappedRepairTargets).map((t) => [
        text(t.outlineId, 80),
        schema.asArray(t.fields).map((f) => text(f.field, 60)),
      ]),
    );
  const initialQualityFailures = schema.asArray(row.initialQualityFailures || row.activityQualityFailures)
    .map((i) => text(i, 200)).slice(0, 40);
  const postRepairFailures = schema.asArray(row.postRepairFailures).map((i) => text(i, 200)).slice(0, 40);
  const mappedRepairTargets = schema.asArray(row.mappedRepairTargets || row.repairTargets).slice(0, 16);
  const isSafetyIssue = (issue) => /safetyNotes/i.test(String(issue || ""));
  const initialSafetyFailures = initialQualityFailures.filter(isSafetyIssue);
  const safetyRepairOutlineIds = mappedRepairTargets
    .filter((t) => schema.asArray(t.fields).some((f) => text(f.field || f, 60) === "safetyNotes"))
    .map((t) => text(t.outlineId, 80))
    .filter(Boolean);
  const repairedSafetyFields = Object.fromEntries(
    Object.entries(repairedFieldsByOutlineId || {})
      .filter(([, fields]) => schema.asArray(fields).includes("safetyNotes"))
      .map(([id, fields]) => [id, schema.asArray(fields)]),
  );
  const postRepairSafetyFailures = postRepairFailures.filter(isSafetyIssue);
  diagnostics.batches.push({
    batchNumber: row.batchNumber || null,
    requestedOutlineIds: schema.asArray(row.requestedOutlineIds).map((id) => text(id, 80)).slice(0, 24),
    responseTopLevelKeys: schema.asArray(row.responseTopLevelKeys).map((k) => text(k, 60)).slice(0, 24),
    detectedWrapper: row.detectedWrapper ? text(row.detectedWrapper, 40) : null,
    model: row.model ? text(row.model, 80) : null,
    finishReason: row.finishReason ? text(row.finishReason, 80) : null,
    outputChars: Number(row.outputChars) || 0,
    truncationDetected: row.truncationDetected === true,
    expansionAttempts: Number.isFinite(row.expansionAttempts) ? row.expansionAttempts : null,
    parseRetryUsed: row.parseRetryUsed === true,
    parseFailures: schema.asArray(row.parseFailures).map((i) => text(i, 200)).slice(0, 20),
    activityExpansionRetryCalls: Number.isFinite(row.activityExpansionRetryCalls)
      ? row.activityExpansionRetryCalls
      : null,
    activityRepairCalls: Number.isFinite(row.activityRepairCalls) ? row.activityRepairCalls : null,
    initialParsedCount: Number.isFinite(row.initialParsedCount) ? row.initialParsedCount : null,
    parsedActivityCount: Number.isFinite(row.parsedActivityCount) ? row.parsedActivityCount : null,
    acceptedActivityCount: Number.isFinite(row.acceptedActivityCount) ? row.acceptedActivityCount : null,
    rejectedActivityCount: Number.isFinite(row.rejectedActivityCount) ? row.rejectedActivityCount : null,
    initialQualityFailures,
    activityQualityFailures: schema.asArray(row.activityQualityFailures).map((i) => text(i, 200)).slice(0, 40),
    initialSafetyFailures,
    safetyRepairOutlineIds,
    repairedSafetyFields,
    postRepairSafetyFailures,
    mappedRepairTargets,
    unmappedQualityIssues: schema.asArray(row.unmappedQualityIssues).map((i) => text(i, 200)).slice(0, 20),
    repairedFieldsByOutlineId,
    repairUsed: row.repairUsed === true,
    repairTargets: mappedRepairTargets,
    postRepairFailures,
    teacherLanguageDiagnostics: schema.asArray(row.teacherLanguageDiagnostics).slice(0, 16),
    vocabularyDiagnostics: schema.asArray(row.vocabularyDiagnostics).slice(0, 16),
    vocabularyRepairOutlineIds: schema.asArray(row.vocabularyRepairOutlineIds).map((id) => text(id, 80)).slice(0, 24),
    vocabularyShapeBefore: row.vocabularyShapeBefore && typeof row.vocabularyShapeBefore === "object"
      ? row.vocabularyShapeBefore
      : {},
    vocabularyTermsBefore: row.vocabularyTermsBefore && typeof row.vocabularyTermsBefore === "object"
      ? row.vocabularyTermsBefore
      : {},
    vocabularyShapeAfter: row.vocabularyShapeAfter && typeof row.vocabularyShapeAfter === "object"
      ? row.vocabularyShapeAfter
      : {},
    vocabularyTermsAfter: row.vocabularyTermsAfter && typeof row.vocabularyTermsAfter === "object"
      ? row.vocabularyTermsAfter
      : {},
    postRepairVocabularyFailures: schema.asArray(row.postRepairVocabularyFailures).map((i) => text(i, 200)).slice(0, 20),
    preRepairQualityIssues: schema.asArray(row.preRepairQualityIssues).slice(0, 40),
    issueCountByField: row.issueCountByField && typeof row.issueCountByField === "object"
      ? row.issueCountByField
      : {},
    postRepairQualityIssues: schema.asArray(row.postRepairQualityIssues).slice(0, 40),
    genericFillerTargets: schema.asArray(row.genericFillerTargets).slice(0, 16),
    descriptionRepairsByOutlineId: row.descriptionRepairsByOutlineId && typeof row.descriptionRepairsByOutlineId === "object"
      ? row.descriptionRepairsByOutlineId
      : {},
    objectiveRepairsByOutlineId: row.objectiveRepairsByOutlineId && typeof row.objectiveRepairsByOutlineId === "object"
      ? row.objectiveRepairsByOutlineId
      : {},
    genericFillerBefore: schema.asArray(row.genericFillerBefore).slice(0, 20),
    genericFillerAfter: schema.asArray(row.genericFillerAfter).slice(0, 20),
    safetyRepairReasonByOutlineId: row.safetyRepairReasonByOutlineId && typeof row.safetyRepairReasonByOutlineId === "object"
      ? row.safetyRepairReasonByOutlineId
      : {},
    safetyRepairInstructionType: row.safetyRepairInstructionType && typeof row.safetyRepairInstructionType === "object"
      ? row.safetyRepairInstructionType
      : {},
    genericSafetyBefore: schema.asArray(row.genericSafetyBefore).slice(0, 20),
    genericSafetyAfter: schema.asArray(row.genericSafetyAfter).slice(0, 20),
    finalBatchPass: row.finalBatchPass === true,
  });
}

function assembleLessonObject(blueprint, expandedActivities) {
  return {
    lesson: { ...blueprint.lesson },
    // Keep outlineId so final pre-create sweep / Stage 4 repair can target precisely.
    activities: schema.asArray(expandedActivities).map((a) => ({ ...a })),
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

function buildFinalRepairUserPrompt(brief, assembled, issues, options = {}) {
  const issueList = schema.asArray(issues).map((i) => String(i));
  const repairPlan = options.repairPlan || planExpansionRepair(issueList, assembled.activities);
  const repairTargets = enrichExpansionRepairTargets(
    repairPlan.mappedRepairTargets,
    assembled.activities,
    {
      activityOutlines: schema.asArray(assembled.activities).map((a) => ({
        outlineId: a.outlineId,
        name: a.title,
        weekday: a.dayOfWeek,
        domain: a.activityCategory,
        concept: "",
        developmentalPurpose: text(a.objective, 500),
      })),
    },
  );
  const failedActs = schema.asArray(assembled.activities).filter((a) => {
    const title = text(a.title, 120);
    const id = text(a.outlineId, 80);
    return issueList.some((iss) => iss.includes(title))
      || repairTargets.some((t) => t.outlineId === id);
  });
  const indoorTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "indoorAlternatives")
  ));
  const outdoorTargeted = repairTargets.some((t) => (
    schema.asArray(t.fields).some((f) => f.field === "outdoorAlternatives")
  ));
  const indoorAlternativeRepairIds = repairTargets
    .filter((t) => schema.asArray(t.fields).some((f) => f.field === "indoorAlternatives"))
    .map((t) => t.outlineId);
  const outdoorAlternativeRepairIds = repairTargets
    .filter((t) => schema.asArray(t.fields).some((f) => f.field === "outdoorAlternatives"))
    .map((t) => t.outlineId);
  return JSON.stringify({
    mode: "REPAIR_TARGETED_LESSON_PATCH",
    brief: { title: brief.title, ageBand: brief.ageBand, activityTarget: brief.activityTarget },
    fixOnlyTheseIssues: issueList.slice(0, 40),
    repairTargets,
    repairedFieldsByOutlineId: Object.fromEntries(
      repairTargets.map((t) => [t.outlineId, t.fields.map((f) => f.field)]),
    ),
    indoorAlternativeRepairIds,
    outdoorAlternativeRepairIds,
    minTeacherLanguagePromptLines: MIN_TEACHER_LANGUAGE_PROMPT_LINES,
    fieldQualityExpectations: {
      ...expansionFieldQualityExpectations(),
      indoorAlternatives: [
        "Practical indoor adaptation of the SAME activity/learning goal.",
        "Explain where/how it happens indoors, materials/setup changes if needed, and keep the original learning goal.",
        "Bad: \"Do this activity indoors.\" / \"Move the activity inside.\"",
        "Good: concrete classroom station/table setup with the same child actions.",
      ].join(" "),
      outdoorAlternatives: [
        "Practical outdoor adaptation of the SAME activity/learning goal.",
        "Explain where/how it happens outdoors, materials/setup changes if needed, and keep the original learning goal.",
        "Bad: \"Do this outside.\" Good: shaded mat/table with the same props and objective.",
      ].join(" "),
    },
    rules: [
      "Fix EVERY listed repairTargets field in one response. Do not skip any outlineId or field.",
      "Preserve outlineId, title, dayOfWeek, and activityCategory.",
      "Preserve valid non-targeted fields.",
      "Use each repairTargets[].activityContext and each field's qualityInstruction.",
      `teacherLanguage (when targeted): newline-separated STRING with ≥${MIN_TEACHER_LANGUAGE_PROMPT_LINES} distinct prompts.`,
      `vocabulary (when targeted): comma-separated STRING with ≥${MIN_VOCABULARY_TERMS} distinct activity-specific terms; not a JSON array; not one vague theme word; no duplicate padding.`,
      "objective (when targeted): activity-specific skill + child action + activity connection; meet existing depth gate.",
      "safetyNotes (when targeted): activity-specific hazard/supervision + teacher action; no generic supervise-only filler.",
      indoorTargeted
        ? "If indoorAlternatives is targeted: EXPAND into a practical indoor adaptation of the same activity. Explain where/how the activity can happen indoors, what materials or setup change if needed, and preserve the original learning goal. Do not merely lengthen the existing sentence. Do not write generic filler such as \"Do this activity indoors.\""
        : "",
      outdoorTargeted
        ? "If outdoorAlternatives is targeted: EXPAND into a practical outdoor adaptation of the same activity. Explain where/how it happens outdoors, materials/setup changes if needed, and preserve the learning goal. Do not write generic \"do this outside\" filler."
        : "",
    ].filter(Boolean),
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

  if (mode === "EXPAND_ACTIVITY_BATCH" || mode === "REPAIR_ACTIVITY_BATCH") {
    const ids = schema.asArray(parsed.expandExactlyTheseOutlineIds);
    const outlines = schema.asArray(parsed.outlinesToExpand).length
      ? schema.asArray(parsed.outlinesToExpand)
      : schema.asArray(parsed.weeklyBlueprint?.outlines);
    const byId = new Map(outlines.map((o) => [text(o.outlineId, 80), o]));
    // Prefer repairing from previousBatchActivities when present (keep IDs/titles).
    const priorById = new Map(
      schema.asArray(parsed.previousBatchActivities).map((a) => [text(a.outlineId, 80), a]),
    );
    const activities = ids.map((id, index) => {
      const outline = byId.get(text(id, 80)) || {};
      const prior = priorById.get(text(id, 80)) || {};
      const name = text(prior.title || outline.name || `${theme} activity ${index + 1}`, 120);
      const day = normalizeWeekday(prior.dayOfWeek || outline.weekday || WEEKDAYS[index % 5]);
      const domain = text(prior.activityCategory || outline.domain || "Invitation to Play", 80);
      const focus = progression[day] || day;
      const base = {
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
          `Offer only two ${theme.toLowerCase()} tools at first for children who become overwhelmed at “${name}”, then add more once engaged.`,
          "Keep groups small and stage a backup tray if interest spikes.",
        ],
        substitutions: [
          `Swap one commercial prop for a classroom ${theme.toLowerCase()} alternative of the same size.`,
        ],
        adaptations: "Offer fewer steps, hand-over-hand placement, or a seated version for children who need support.",
        extensions: `Invite children to compare two groups at “${name}” and decide which has more before counting to check.`,
        vocabulary: normalizeVocabularyField(`${theme}, ${name}, count, place, share, notice, next`),
        observationPrompts: [
          "Notice whether the child uses one-to-one correspondence while placing pieces or adjusts after counting twice.",
          "How did they solve a turn-taking or counting moment with a peer?",
        ],
        mixedAgeAdaptations: "Younger children use fewer pieces; older children add a second sorting/counting rule.",
        preliminaryAssetIntent: outline.expectedAssetIntent || prior.preliminaryAssetIntent || {
          image: /Sensory|Art|Science|Dramatic/i.test(domain) ? "GENERATE" : "NOT_NEEDED",
          printable: /Math|Literacy|Dramatic/i.test(domain) ? "CREATE" : "NOT_NEEDED",
          reason: "Only when recognition or modeling benefits from a visual.",
        },
      };
      // Preserve strong prior fields when repairing.
      EXPANSION_TEXT_FIELDS.forEach((field) => {
        if (text(prior[field]) && wordCount(prior[field]) >= 8) base[field] = prior[field];
      });
      EXPANSION_LIST_FIELDS.forEach((field) => {
        if (schema.asArray(prior[field]).length) base[field] = prior[field];
      });
      // Ensure tips/prompts always meet fixture quality after repair mode.
      if (!schema.asArray(base.teacherTips).length) {
        base.teacherTips = [
          `Offer only two ${theme.toLowerCase()} tools at first for children who become overwhelmed at “${name}”, then add more once engaged.`,
        ];
      }
      if (!schema.asArray(base.observationPrompts).length) {
        base.observationPrompts = [
          "Notice whether the child uses one-to-one correspondence while placing pieces or adjusts after counting twice.",
        ];
      }
      return base;
    });
    return JSON.stringify({ activities });
  }

  if (mode === "REPAIR_TARGETED_LESSON_PATCH") {
    const failed = schema.asArray(parsed.failedActivities);
    const repairedFieldsByOutlineId = parsed.repairedFieldsByOutlineId && typeof parsed.repairedFieldsByOutlineId === "object"
      ? parsed.repairedFieldsByOutlineId
      : {};
    const substantiveIndoor = (title) => (
      `Set up “${title}” at a classroom table or dramatic-play station with the same materials and learning goal. `
      + "Children complete the same steps indoors in a small group while the teacher coaches turn-taking and language."
    );
    const substantiveOutdoor = (title) => (
      `Take the same “${title}” materials outdoors to a shaded mat or picnic table and keep the original objective `
      + "while children complete the familiar steps with outdoor space to move and share."
    );
    return JSON.stringify({
      lessonPatches: {},
      activities: failed.map((a) => {
        const id = text(a.outlineId, 80);
        const title = text(a.title || a.name, 120);
        const targeted = new Set(schema.asArray(repairedFieldsByOutlineId[id]).map((f) => text(f, 60)));
        const indoorNeedsExpand = targeted.has("indoorAlternatives")
          || wordCount(a.indoorAlternatives) < 8
          || /do this activity indoors|move the activity inside|use an indoor space/i.test(String(a.indoorAlternatives || ""));
        const outdoorNeedsExpand = targeted.has("outdoorAlternatives")
          || wordCount(a.outdoorAlternatives) < 8
          || /do this outside|move the activity outdoors/i.test(String(a.outdoorAlternatives || ""));
        return {
          ...a,
          title,
          objective: text(a.objective, 2000).length > 40
            ? a.objective
            : `Children practice a concrete skill during ${theme} play with clear materials and teacher coaching for “${title}”.`,
          description: text(a.description, 2000).length > 40
            ? a.description
            : `Children use prepared ${theme.toLowerCase()} materials for “${title}” with counted pieces and turn-taking.`,
          materials: text(a.materials, 2000).length > 20
            ? a.materials
            : `Trays, ${theme.toLowerCase()} props, wipeable mat, reset basket`,
          setup: text(a.setup, 2000).length > 20
            ? a.setup
            : `Set one tray per pair for “${title}” with a reset basket beside the mat.`,
          teacherLanguage: text(a.teacherLanguage, 2000).length > 40
            ? a.teacherLanguage
            : "I notice how you placed that piece.\nWhich piece comes next?\nCan you show a friend your method?",
          observationOpportunities: text(a.observationOpportunities, 2000).length > 30
            ? a.observationOpportunities
            : `Watch language, counting/turn-taking, and material use during “${title}”.`,
          adaptations: text(a.adaptations, 2000).length > 20
            ? a.adaptations
            : "Offer fewer steps or hand-over-hand support.",
          indoorAlternatives: indoorNeedsExpand
            ? substantiveIndoor(title)
            : text(a.indoorAlternatives, 2000),
          outdoorAlternatives: outdoorNeedsExpand
            ? substantiveOutdoor(title)
            : text(a.outdoorAlternatives, 2000),
          cleanupTips: text(a.cleanupTips, 2000).length > 20
            ? a.cleanupTips
            : `Sort “${title}” props into labeled bins and wipe trays.`,
          extensions: text(a.extensions, 2000).length > 20
            ? a.extensions
            : `Add a choice card that deepens the weekday focus for “${title}”.`,
          teacherTips: schema.asArray(a.teacherTips).length ? a.teacherTips : ["Keep the group small.", "Stage a backup tray."],
          observationPrompts: schema.asArray(a.observationPrompts).length
            ? a.observationPrompts
            : ["What language did the child use?", "How did they solve a turn-taking moment?"],
          vocabulary: (() => {
            if (targeted.has("vocabulary") || !vocabularyMeetsTermGate(a.vocabulary)) {
              return normalizeVocabularyField(
                text(a.vocabulary, 500).length > 5 && vocabularyMeetsTermGate(a.vocabulary)
                  ? a.vocabulary
                  : `${theme}, try, share, notice, place`,
              );
            }
            return normalizeVocabularyField(a.vocabulary || `${theme}, try, share, notice, place`);
          })(),
        };
      }),
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

  let parsed = null;
  let parseSuccess = true;
  try {
    parsed = JSON.parse(composer.stripJsonFences(unwrapped.text));
  } catch (_e) {
    parseSuccess = false;
  }

  const parsedObjectCount = parseSuccess
    ? schema.asArray(
      parsed?.activityOutlines
      || parsed?.outlines
      || parsed?.activities
      || (stageMeta.stage && String(stageMeta.stage).startsWith("activity_expansion")
        ? parsed?.activities
        : null),
    ).length
    : 0;
  const flags = truncationFlags(
    unwrapped.text,
    Number.isFinite(stageMeta.parsedHint) ? stageMeta.parsedHint : parsedObjectCount,
    stageMeta.expectedObjectCount || 0,
    { finishReason: unwrapped.finishReason, status: unwrapped.finishReason },
  );
  if (flags.possibleOutputTruncation) usage.outputTruncationCount += 1;

  return {
    ok: parseSuccess,
    code: parseSuccess ? "ok" : "malformed_output",
    error: parseSuccess ? null : "AI returned malformed JSON.",
    parsed,
    rawText: unwrapped.text,
    meta: unwrapped,
    flags,
    parsedObjectCount,
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
  const repairPlanner = typeof options.repairPlanner === "function" ? options.repairPlanner : planExpansionRepair;

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
    let priorBlueprint = null;
    let stage1OutlineRepairPlan = null;
    let initialThinConceptOutlineIds = [];
    for (let attempt = 0; attempt < MAX_ARCHITECTURE_CALLS; attempt += 1) {
      usage.lessonArchitectureCalls += 1;
      usage.lessonArchitectCalls += 1;
      if (attempt > 0 && priorBlueprint && stage1Issues) {
        stage1OutlineRepairPlan = planStage1OutlineRepair(
          stage1Issues,
          priorBlueprint.activityOutlines,
        );
        initialThinConceptOutlineIds = stage1OutlineRepairPlan.initialThinConceptOutlineIds;
      }
      const stage = await callAiStage(
        callAi,
        buildStage1SystemPrompt(brief.ageBand),
        buildStage1UserPrompt(brief, stage1Issues, priorBlueprint),
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
          diagnostics.stage1 = {
            initialThinConceptOutlineIds,
            repairTargets: stage1OutlineRepairPlan?.mappedRepairTargets || [],
            repairedConceptOutlineIds: [],
            postRepairThinConceptOutlineIds: initialThinConceptOutlineIds.slice(),
            finalStage1Pass: false,
          };
          return {
            ok: false,
            code: "AI_CREATION_FAILED",
            error: stage.error || "Stage 1 week architecture failed.",
            usage,
            stagedDiagnostics: diagnostics,
            progress: { creationBlueprintComplete: false, creationBlueprint: priorBlueprint, activityExpansionBatches: batchState },
          };
        }
        stage1Issues = [stage.error || "malformed_json", ...(stage.flags?.reasons || [])];
        continue;
      }
      const coalesced = attempt > 0 && priorBlueprint
        ? coalesceStage1Parsed(priorBlueprint, stage.parsed, brief, {
          repairTargets: stage1OutlineRepairPlan?.mappedRepairTargets || [],
        })
        : stage.parsed;
      const validated = validateBlueprint(coalesced, brief);
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
        const repairedConceptOutlineIds = [];
        if (attempt > 0 && priorBlueprint && stage1OutlineRepairPlan) {
          const priorById = new Map(
            schema.asArray(priorBlueprint.activityOutlines).map((o) => [o.outlineId, o]),
          );
          schema.asArray(stage1OutlineRepairPlan.mappedRepairTargets).forEach((t) => {
            if (!schema.asArray(t.fields).some((f) => f.field === "concept")) return;
            const prior = priorById.get(t.outlineId);
            const next = schema.asArray(validated.blueprint.activityOutlines)
              .find((o) => o.outlineId === t.outlineId);
            if (next && text(next.concept) && text(next.concept) !== text(prior?.concept)) {
              repairedConceptOutlineIds.push(t.outlineId);
            }
          });
        }
        diagnostics.stage1 = {
          initialThinConceptOutlineIds,
          repairTargets: stage1OutlineRepairPlan?.mappedRepairTargets || [],
          repairedConceptOutlineIds,
          postRepairThinConceptOutlineIds: [],
          finalStage1Pass: true,
        };
        break;
      }
      priorBlueprint = validated.blueprint;
      stage1Issues = validated.issues;
      if (attempt === 0) {
        initialThinConceptOutlineIds = planStage1OutlineRepair(
          validated.issues,
          validated.blueprint.activityOutlines,
        ).initialThinConceptOutlineIds;
      }
      if (attempt === MAX_ARCHITECTURE_CALLS - 1) {
        const postRepairThin = planStage1OutlineRepair(
          validated.issues,
          validated.blueprint.activityOutlines,
        ).initialThinConceptOutlineIds;
        const repairedConceptOutlineIds = [];
        if (priorBlueprint && stage1OutlineRepairPlan) {
          // priorBlueprint here is the failed post-repair blueprint; compare to first-pass via plan ids
          schema.asArray(stage1OutlineRepairPlan.mappedRepairTargets).forEach((t) => {
            if (!schema.asArray(t.fields).some((f) => f.field === "concept")) return;
            const next = schema.asArray(validated.blueprint.activityOutlines)
              .find((o) => o.outlineId === t.outlineId);
            if (next && wordCount(next.concept) >= 6) repairedConceptOutlineIds.push(t.outlineId);
          });
        }
        diagnostics.stage1 = {
          initialThinConceptOutlineIds,
          repairTargets: stage1OutlineRepairPlan?.mappedRepairTargets || [],
          repairedConceptOutlineIds,
          postRepairThinConceptOutlineIds: postRepairThin,
          finalStage1Pass: false,
        };
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

  if (blueprintComplete && !diagnostics.stage1) {
    diagnostics.stage1 = {
      initialThinConceptOutlineIds: [],
      repairTargets: [],
      repairedConceptOutlineIds: [],
      postRepairThinConceptOutlineIds: [],
      finalStage1Pass: true,
    };
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
    let priorBatchActivities = null;
    let repairUsed = false;
    let parseRetryUsed = false;
    let expansionAttempts = 0;
    let batchExpansionRetryCalls = 0;
    let batchRepairCalls = 0;
    let parseFailures = [];
    let initialParsedCount = null;
    let lastRepairTargets = [];
    let lastUnmappedIssues = [];
    let lastInitialFailures = [];
    let lastResponseKeys = [];
    let lastRepairPlan = null;
    let lastTruncation = false;
    let lastModel = null;
    let lastFinishReason = null;
    let lastOutputChars = 0;
    let validated = null;
    let rawTeacherLanguageBeforeById = {};
    let rawTeacherLanguageAfterById = {};
    let teacherLanguageDiagnostics = [];
    let rawVocabularyBeforeById = {};
    let rawVocabularyAfterById = {};
    let vocabularyDiagBundle = {
      vocabularyDiagnostics: [],
      vocabularyRepairOutlineIds: [],
      vocabularyShapeBefore: {},
      vocabularyTermsBefore: {},
      vocabularyShapeAfter: {},
      vocabularyTermsAfter: {},
      postRepairVocabularyFailures: [],
    };

    // ---- Phase A: expansion + optional parse/transport recovery (max 1) ----
    while (expansionAttempts < 1 + MAX_EXPANSION_PARSE_RETRIES) {
      const isParseRetry = expansionAttempts > 0;
      expansionAttempts += 1;
      if (isParseRetry) {
        parseRetryUsed = true;
        batchExpansionRetryCalls += 1;
        usage.activityExpansionRetryCalls += 1;
      }
      usage.activityExpansionCalls += 1;

      const userPrompt = isParseRetry
        ? buildExpansionParseRetryUserPrompt(brief, blueprint, ids, { batchNumber: batchIndex + 1 })
        : buildExpansionUserPrompt(brief, blueprint, ids, { batchNumber: batchIndex + 1 });
      const stage = await callAiStage(
        callAi,
        buildExpansionSystemPrompt(brief.ageBand),
        userPrompt,
        usage,
        diagnostics,
        {
          stage: `activity_expansion_${batchKey}${isParseRetry ? "_parse_retry" : ""}`,
          expectedObjectCount: ids.length,
        },
      );
      lastResponseKeys = stage.parsed && typeof stage.parsed === "object"
        ? Object.keys(stage.parsed).slice(0, 24)
        : [];
      lastModel = stage.meta?.model || lastModel;
      lastFinishReason = stage.meta?.finishReason || lastFinishReason;
      lastOutputChars = stage.rawText?.length || 0;
      lastTruncation = stage.flags?.possibleOutputTruncation === true;

      if (!stage.ok) {
        lastIssues = [stage.error || "malformed_json", ...(stage.flags?.reasons || [])];
        parseFailures.push(...lastIssues);
        pushStageDiag(diagnostics, {
          stage: `activity_expansion_${batchKey}${isParseRetry ? "_parse_retry" : ""}`,
          model: stage.meta?.model,
          finishReason: stage.meta?.finishReason,
          outputChars: lastOutputChars,
          parseSuccess: false,
          expectedObjectCount: ids.length,
          parsedObjectCount: 0,
          possibleOutputTruncation: stage.flags?.possibleOutputTruncation,
          unterminatedJsonTail: stage.flags?.unterminatedJsonTail,
          validationIssues: lastIssues,
          ok: false,
        });
        if (!isParseRetry && MAX_EXPANSION_PARSE_RETRIES > 0) continue;
        break;
      }

      validated = validateExpansionBatch(stage.parsed, ids, blueprint, brief);
      rawTeacherLanguageBeforeById = rawTeacherLanguageByOutlineId(stage.parsed);
      rawVocabularyBeforeById = rawVocabularyByOutlineId(stage.parsed);
      if (isExpansionParseTransportFailure(stage, validated, ids.length)) {
        lastIssues = validated.issues.length
          ? validated.issues
          : ["parse_transport_failure", ...(stage.flags?.reasons || [])];
        parseFailures.push(...lastIssues);
        pushStageDiag(diagnostics, {
          stage: `activity_expansion_${batchKey}${isParseRetry ? "_parse_retry" : ""}`,
          model: stage.meta?.model,
          finishReason: stage.meta?.finishReason,
          outputChars: lastOutputChars,
          parseSuccess: false,
          expectedObjectCount: ids.length,
          parsedObjectCount: validated.parsedObjectCount,
          possibleOutputTruncation: stage.flags?.possibleOutputTruncation,
          unterminatedJsonTail: stage.flags?.unterminatedJsonTail,
          validationIssues: lastIssues,
          ok: false,
        });
        if (!isParseRetry && MAX_EXPANSION_PARSE_RETRIES > 0) continue;
        validated = null;
        break;
      }

      priorBatchActivities = validated.activities;
      if (initialParsedCount == null) initialParsedCount = validated.parsedObjectCount;
      pushStageDiag(diagnostics, {
        stage: `activity_expansion_${batchKey}${isParseRetry ? "_parse_retry" : ""}`,
        model: stage.meta?.model,
        finishReason: stage.meta?.finishReason,
        outputChars: lastOutputChars,
        parseSuccess: true,
        expectedObjectCount: ids.length,
        parsedObjectCount: validated.parsedObjectCount,
        possibleOutputTruncation: stage.flags?.possibleOutputTruncation,
        unterminatedJsonTail: stage.flags?.unterminatedJsonTail,
        validationIssues: validated.issues,
        ok: validated.ok,
      });
      break; // parseable batch obtained — leave Phase A
    }

    const recordFailDiag = (extra = {}) => {
      recordBatchDiagnostic(diagnostics, {
        batchNumber: batchIndex + 1,
        requestedOutlineIds: ids,
        responseTopLevelKeys: lastResponseKeys,
        model: lastModel || diagnostics.model,
        finishReason: lastFinishReason,
        outputChars: lastOutputChars,
        truncationDetected: lastTruncation,
        expansionAttempts,
        parseRetryUsed,
        parseFailures,
        activityExpansionRetryCalls: batchExpansionRetryCalls,
        activityRepairCalls: batchRepairCalls,
        initialParsedCount,
        parsedActivityCount: schema.asArray(priorBatchActivities).length,
        acceptedActivityCount: 0,
        rejectedActivityCount: ids.length,
        initialQualityFailures: lastInitialFailures.length ? lastInitialFailures : lastIssues,
        activityQualityFailures: lastIssues,
        mappedRepairTargets: lastRepairTargets,
        unmappedQualityIssues: lastUnmappedIssues,
        repairUsed,
        repairTargets: lastRepairTargets,
        postRepairFailures: lastIssues,
        teacherLanguageDiagnostics,
        ...vocabularyDiagBundle,
        finalBatchPass: false,
        ...extra,
      });
    };

    if (!validated || !priorBatchActivities) {
      batchState[batchKey] = {
        status: "FAILED",
        outlineIds: ids,
        issues: lastIssues,
        repairUsed: false,
        parseRetryUsed,
        expansionAttempts,
      };
      recordFailDiag();
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

    // ---- Phase B: quality validation (+ optional one targeted repair) ----
    if (validated.ok) {
      batchState[batchKey] = {
        status: "SUCCESS",
        outlineIds: ids,
        activities: validated.activities,
        repairUsed: false,
        parseRetryUsed,
        expansionAttempts,
      };
      validated.activities.forEach((a) => expandedById.set(a.outlineId, a));
      recordBatchDiagnostic(diagnostics, {
        batchNumber: batchIndex + 1,
        requestedOutlineIds: ids,
        responseTopLevelKeys: lastResponseKeys,
        model: lastModel,
        finishReason: lastFinishReason,
        outputChars: lastOutputChars,
        truncationDetected: lastTruncation,
        expansionAttempts,
        parseRetryUsed,
        parseFailures,
        activityExpansionRetryCalls: batchExpansionRetryCalls,
        activityRepairCalls: 0,
        initialParsedCount,
        parsedActivityCount: validated.parsedObjectCount,
        acceptedActivityCount: validated.activities.length,
        rejectedActivityCount: 0,
        initialQualityFailures: [],
        activityQualityFailures: [],
        mappedRepairTargets: [],
        unmappedQualityIssues: [],
        repairUsed: false,
        repairTargets: [],
        postRepairFailures: [],
        finalBatchPass: true,
      });
      success = true;
    } else {
      lastIssues = validated.issues;
      lastInitialFailures = validated.issues;
      const preSweep = sweepExpansionActivitiesQuality(validated.activities);
      // Prefer full sweep issue list (all field failures) while keeping any structural batch issues.
      const structuralOnly = schema.asArray(validated.issues).filter((iss) => (
        !preSweep.issueStrings.includes(iss)
      ));
      const sweepIssueStrings = [...preSweep.issueStrings, ...structuralOnly];
      lastInitialFailures = sweepIssueStrings.length ? sweepIssueStrings : validated.issues;
      lastIssues = lastInitialFailures;
      lastRepairPlan = repairPlanner(lastInitialFailures, validated.activities);
      lastRepairTargets = lastRepairPlan.mappedRepairTargets;
      lastUnmappedIssues = lastRepairPlan.unmappedQualityIssues;
      const preRepairQualityIssues = preSweep.structuredIssues;
      const preIssueCountByField = preSweep.issueCountByField;
      const genericDiagBase = collectGenericFillerRepairDiagnostics(
        lastRepairTargets,
        preRepairQualityIssues,
        [],
      );

      if (!lastRepairPlan.canRepair || MAX_QUALITY_REPAIR_CALLS_PER_BATCH < 1) {
        const unmappedTags = lastUnmappedIssues.map((i) => `unmapped_quality_issue:${text(i, 160)}`);
        lastIssues = [...new Set([...lastInitialFailures, ...unmappedTags])];
        batchState[batchKey] = {
          status: "FAILED",
          outlineIds: ids,
          issues: lastIssues,
          repairUsed: false,
          parseRetryUsed,
          expansionAttempts,
          unmappedQualityIssues: lastUnmappedIssues,
          mappedRepairTargets: lastRepairTargets,
        };
        recordFailDiag({
          preRepairQualityIssues,
          issueCountByField: preIssueCountByField,
          postRepairQualityIssues: preRepairQualityIssues,
          ...genericDiagBase,
          genericFillerAfter: genericDiagBase.genericFillerBefore,
        });
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

      // ONE targeted quality repair for ALL mapped targets in this batch
      repairUsed = true;
      batchRepairCalls += 1;
      usage.activityRepairCalls += 1;
      const repairPrompt = buildExpansionRepairUserPrompt(
        brief,
        blueprint,
        ids,
        priorBatchActivities,
        lastIssues.filter((i) => !/^unmapped_quality_issue:/i.test(String(i))),
        { batchNumber: batchIndex + 1, repairPlan: lastRepairPlan },
      );
      const repairStage = await callAiStage(
        callAi,
        buildExpansionSystemPrompt(brief.ageBand),
        repairPrompt,
        usage,
        diagnostics,
        {
          stage: `activity_expansion_${batchKey}_repair`,
          expectedObjectCount: ids.length,
        },
      );
      lastResponseKeys = repairStage.parsed && typeof repairStage.parsed === "object"
        ? Object.keys(repairStage.parsed).slice(0, 24)
        : lastResponseKeys;
      lastModel = repairStage.meta?.model || lastModel;
      lastFinishReason = repairStage.meta?.finishReason || lastFinishReason;
      lastOutputChars = repairStage.rawText?.length || 0;
      lastTruncation = repairStage.flags?.possibleOutputTruncation === true || lastTruncation;

      if (!repairStage.ok) {
        lastIssues = [
          ...lastInitialFailures,
          repairStage.error || "malformed_json",
          ...(repairStage.flags?.reasons || []),
        ];
        pushStageDiag(diagnostics, {
          stage: `activity_expansion_${batchKey}_repair`,
          model: repairStage.meta?.model,
          finishReason: repairStage.meta?.finishReason,
          outputChars: lastOutputChars,
          parseSuccess: false,
          expectedObjectCount: ids.length,
          parsedObjectCount: 0,
          possibleOutputTruncation: repairStage.flags?.possibleOutputTruncation,
          unterminatedJsonTail: repairStage.flags?.unterminatedJsonTail,
          validationIssues: lastIssues,
          ok: false,
        });
        batchState[batchKey] = {
          status: "FAILED",
          outlineIds: ids,
          issues: lastIssues,
          repairUsed: true,
          parseRetryUsed,
          expansionAttempts,
          mappedRepairTargets: lastRepairTargets,
        };
        recordFailDiag({
          preRepairQualityIssues,
          issueCountByField: preIssueCountByField,
          postRepairQualityIssues: preRepairQualityIssues,
          ...genericDiagBase,
          genericFillerAfter: genericDiagBase.genericFillerBefore,
        });
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

      validated = coalesceExpansionBatch(
        priorBatchActivities,
        repairStage.parsed,
        ids,
        blueprint,
        brief,
        lastInitialFailures,
      );
      // Full post-repair sweep across all activities/fields (not only targeted fields).
      const postSweep = sweepExpansionActivitiesQuality(validated.activities);
      const postStructural = schema.asArray(validated.issues).filter((iss) => (
        !postSweep.issueStrings.includes(iss)
      ));
      const postAllIssues = [...postSweep.issueStrings, ...postStructural];
      validated = {
        ...validated,
        issues: postAllIssues,
        ok: postAllIssues.length === 0 && validated.activities.length === ids.length,
      };
      const genericDiag = collectGenericFillerRepairDiagnostics(
        lastRepairTargets,
        preRepairQualityIssues,
        postSweep.structuredIssues,
      );
      rawTeacherLanguageAfterById = rawTeacherLanguageByOutlineId(repairStage.parsed);
      teacherLanguageDiagnostics = buildTeacherLanguageRepairDiagnostics(
        priorBatchActivities,
        validated.activities,
        lastRepairPlan,
        validated.issues,
        rawTeacherLanguageBeforeById,
        rawTeacherLanguageAfterById,
      );
      rawVocabularyAfterById = rawVocabularyByOutlineId(repairStage.parsed);
      vocabularyDiagBundle = buildVocabularyRepairDiagnostics(
        priorBatchActivities,
        validated.activities,
        lastRepairPlan,
        validated.issues,
        rawVocabularyBeforeById,
        rawVocabularyAfterById,
      );
      priorBatchActivities = validated.activities;
      lastIssues = validated.issues;
      pushStageDiag(diagnostics, {
        stage: `activity_expansion_${batchKey}_repair`,
        model: repairStage.meta?.model,
        finishReason: repairStage.meta?.finishReason,
        outputChars: lastOutputChars,
        parseSuccess: true,
        expectedObjectCount: ids.length,
        parsedObjectCount: validated.parsedObjectCount,
        possibleOutputTruncation: repairStage.flags?.possibleOutputTruncation,
        unterminatedJsonTail: repairStage.flags?.unterminatedJsonTail,
        validationIssues: validated.issues,
        ok: validated.ok,
      });

      if (validated.ok) {
        batchState[batchKey] = {
          status: "SUCCESS",
          outlineIds: ids,
          activities: validated.activities,
          repairUsed: true,
          parseRetryUsed,
          expansionAttempts,
        };
        validated.activities.forEach((a) => expandedById.set(a.outlineId, a));
        recordBatchDiagnostic(diagnostics, {
          batchNumber: batchIndex + 1,
          requestedOutlineIds: ids,
          responseTopLevelKeys: lastResponseKeys,
          model: lastModel,
          finishReason: lastFinishReason,
          outputChars: lastOutputChars,
          truncationDetected: lastTruncation,
          expansionAttempts,
          parseRetryUsed,
          parseFailures,
          activityExpansionRetryCalls: batchExpansionRetryCalls,
          activityRepairCalls: batchRepairCalls,
          initialParsedCount,
          parsedActivityCount: validated.parsedObjectCount,
          acceptedActivityCount: validated.activities.length,
          rejectedActivityCount: 0,
          initialQualityFailures: lastInitialFailures,
          activityQualityFailures: [],
          mappedRepairTargets: lastRepairTargets,
          unmappedQualityIssues: lastUnmappedIssues,
          repairUsed: true,
          repairTargets: lastRepairTargets,
          postRepairFailures: [],
          teacherLanguageDiagnostics,
          ...vocabularyDiagBundle,
          preRepairQualityIssues,
          issueCountByField: preIssueCountByField,
          postRepairQualityIssues: [],
          ...genericDiag,
          finalBatchPass: true,
        });
        success = true;
      } else {
        batchState[batchKey] = {
          status: "FAILED",
          outlineIds: ids,
          issues: lastIssues,
          repairUsed: true,
          parseRetryUsed,
          expansionAttempts,
          mappedRepairTargets: lastRepairTargets,
        };
        recordFailDiag({
          postRepairFailures: lastIssues,
          preRepairQualityIssues,
          issueCountByField: preIssueCountByField,
          postRepairQualityIssues: postSweep.structuredIssues,
          ...genericDiag,
        });
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

    if (!success) {
      batchState[batchKey] = { status: "FAILED", outlineIds: ids, issues: lastIssues, repairUsed, parseRetryUsed };
      recordFailDiag();
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

  // -------- Stage 3 assemble + final pre-create quality sweep --------
  let assembled = assembleLessonObject(blueprint, expandedActivities);
  const finalSweep = sweepAssembledLessonQuality(expandedActivities, brief);
  let architectValidated = architect.validateArchitectOutput(JSON.stringify(assembled), brief);
  const mergedFinalIssues = [...new Set([
    ...schema.asArray(finalSweep.issueStrings),
    ...schema.asArray(architectValidated.issues),
  ])];
  let validated = {
    ...architectValidated,
    issues: mergedFinalIssues,
    ok: mergedFinalIssues.length === 0,
    error: mergedFinalIssues.length
      ? `Final quality gate failed: ${mergedFinalIssues.slice(0, 8).join("; ")}`
      : architectValidated.error,
  };

  const finalRepairPlan = planExpansionRepair(mergedFinalIssues, expandedActivities);
  const indoorAlternativeRepairIds = finalRepairPlan.mappedRepairTargets
    .filter((t) => schema.asArray(t.fields).some((f) => f.field === "indoorAlternatives"))
    .map((t) => text(t.outlineId, 80));
  const outdoorAlternativeRepairIds = finalRepairPlan.mappedRepairTargets
    .filter((t) => schema.asArray(t.fields).some((f) => f.field === "outdoorAlternatives"))
    .map((t) => text(t.outlineId, 80));
  const indoorAlternativeBefore = Object.fromEntries(
    indoorAlternativeRepairIds.map((id) => {
      const act = expandedActivities.find((a) => text(a.outlineId, 80) === id);
      return [id, text(act?.indoorAlternatives, 500)];
    }),
  );
  diagnostics.finalPreCreate = {
    finalPreCreateIssues: finalSweep.structuredIssues,
    finalIssueCountByField: finalSweep.issueCountByField,
    architectIssues: schema.asArray(architectValidated.issues).map((i) => text(i, 200)).slice(0, 40),
    finalRepairTargets: finalRepairPlan.mappedRepairTargets,
    unmappedQualityIssues: finalRepairPlan.unmappedQualityIssues,
    indoorAlternativeRepairIds,
    outdoorAlternativeRepairIds,
    indoorAlternativeBefore,
    indoorAlternativeAfter: null,
    postRepairIndoorAlternativeFailures: null,
    finalPostRepairIssues: null,
    finalQualityPass: validated.ok === true,
    activityCount: finalSweep.activityCount,
    weekdayDistribution: finalSweep.weekdayDistribution,
  };

  pushStageDiag(diagnostics, {
    stage: "assemble_validate",
    outputChars: JSON.stringify(assembled).length,
    parseSuccess: true,
    expectedObjectCount: usage.activitiesRequested,
    parsedObjectCount: architectValidated.parsedActivityCount,
    validationIssues: mergedFinalIssues,
    ok: validated.ok,
  });

  // -------- Stage 4 targeted repair (ONE call for ALL final repairable issues) --------
  let repaired = false;
  if (!validated.ok && MAX_FINAL_REPAIR_CALLS > 0) {
    if (finalRepairPlan.unmappedQualityIssues.length > 0) {
      const unmappedTags = finalRepairPlan.unmappedQualityIssues
        .map((i) => `unmapped_quality_issue:${text(i, 160)}`);
      const blockedIssues = [...new Set([...mergedFinalIssues, ...unmappedTags])];
      diagnostics.finalPreCreate.finalPostRepairIssues = blockedIssues.map((i) => (
        toStructuredQualityIssue(i, expandedActivities)
      ));
      diagnostics.finalPreCreate.finalQualityPass = false;
      return {
        ok: false,
        code: "AI_CREATION_FAILED",
        error: `Final quality gate failed: ${blockedIssues.slice(0, 8).join("; ")}`,
        issues: blockedIssues,
        usage,
        stagedDiagnostics: diagnostics,
        progress: {
          creationBlueprintComplete: true,
          creationBlueprint: blueprint,
          activityExpansionBatches: batchState,
        },
      };
    }

    usage.activityRepairCalls += 1;
    usage.lessonRevisionCalls += 1;
    const repairStage = await callAiStage(
      callAi,
      buildFinalRepairSystemPrompt(),
      buildFinalRepairUserPrompt(brief, assembled, mergedFinalIssues, { repairPlan: finalRepairPlan }),
      usage,
      diagnostics,
      { stage: "targeted_repair", expectedObjectCount: schema.asArray(mergedFinalIssues).length },
    );
    if (repairStage.ok && repairStage.parsed) {
      assembled = applyRepairPatch(assembled, repairStage.parsed);
      // Prefer patched activities that retain outlineId; fall back to re-linking by title.
      const patchedActivities = schema.asArray(assembled.activities).map((a, index) => {
        const prior = expandedActivities[index];
        return {
          ...a,
          outlineId: text(a.outlineId || prior?.outlineId, 80),
          teacherLanguage: normalizeTeacherLanguageField(a.teacherLanguage),
          teacherTips: asActivityStringList(a.teacherTips || a.tips),
          observationPrompts: asActivityStringList(a.observationPrompts),
          substitutions: asActivityStringList(a.substitutions),
        };
      });
      const indoorAlternativeAfter = Object.fromEntries(
        indoorAlternativeRepairIds.map((id) => {
          const act = patchedActivities.find((a) => text(a.outlineId, 80) === id);
          return [id, text(act?.indoorAlternatives, 500)];
        }),
      );
      const postFinalSweep = sweepAssembledLessonQuality(patchedActivities, brief);
      architectValidated = architect.validateArchitectOutput(JSON.stringify(assembled), brief);
      const postMerged = [...new Set([
        ...schema.asArray(postFinalSweep.issueStrings),
        ...schema.asArray(architectValidated.issues),
      ])];
      validated = {
        ...architectValidated,
        issues: postMerged,
        ok: postMerged.length === 0,
        error: postMerged.length
          ? `Final quality gate failed: ${postMerged.slice(0, 8).join("; ")}`
          : null,
        content: architectValidated.content,
      };
      repaired = validated.ok === true;
      const postRepairIndoorAlternativeFailures = schema.asArray(postMerged)
        .filter((i) => /indoorAlternatives/i.test(String(i)))
        .map((i) => text(i, 200));
      diagnostics.finalPreCreate.indoorAlternativeAfter = indoorAlternativeAfter;
      diagnostics.finalPreCreate.postRepairIndoorAlternativeFailures = postRepairIndoorAlternativeFailures;
      diagnostics.finalPreCreate.finalPostRepairIssues = [
        ...postFinalSweep.structuredIssues,
        ...schema.asArray(architectValidated.issues)
          .filter((iss) => !postFinalSweep.issueStrings.includes(iss))
          .map((iss) => toStructuredQualityIssue(iss, patchedActivities)),
      ];
      diagnostics.finalPreCreate.finalIssueCountByField = issueCountByField(
        diagnostics.finalPreCreate.finalPostRepairIssues,
      );
      diagnostics.finalPreCreate.finalQualityPass = validated.ok === true;
      if (validated.ok) {
        // Rebuild architect content from patched activities when sweep+architect clear
        validated = architect.validateArchitectOutput(JSON.stringify(assembled), brief);
        diagnostics.finalPreCreate.finalQualityPass = validated.ok === true;
      }
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
      diagnostics.finalPreCreate.finalPostRepairIssues = mergedFinalIssues.map((i) => (
        toStructuredQualityIssue(i, expandedActivities)
      ));
      diagnostics.finalPreCreate.finalQualityPass = false;
      pushStageDiag(diagnostics, {
        stage: "targeted_repair",
        outputChars: repairStage.rawText?.length || 0,
        parseSuccess: false,
        validationIssues: [repairStage.error || "repair_failed"],
        ok: false,
      });
    }
  } else if (validated.ok) {
    diagnostics.finalPreCreate.finalPostRepairIssues = [];
    diagnostics.finalPreCreate.finalQualityPass = true;
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
  MAX_EXPANSION_PARSE_RETRIES,
  MAX_QUALITY_REPAIR_CALLS_PER_BATCH,
  MAX_FINAL_REPAIR_CALLS,
  STAGE_MAX_OUTPUT_TOKENS,
  REQUIRED_WEEKLY_FIELDS,
  REQUIRED_EXPANSION_ACTIVITY_FIELDS,
  STAGE1_CONTRACT_ECHO_KEYS,
  STAGE2_CONTRACT_ECHO_KEYS,
  composeStagedLessonContent,
  buildStagedFixtureResponse,
  validateBlueprint,
  validateExpansionBatch,
  assembleLessonObject,
  chunkIds,
  outlineIdFor,
  buildStage1UserPrompt,
  buildStage1SystemPrompt,
  buildExpansionUserPrompt,
  buildExpansionParseRetryUserPrompt,
  buildExpansionRepairUserPrompt,
  buildExpansionRepairTargets,
  planExpansionRepair,
  parseExpansionIssueTarget,
  isExpansionParseTransportFailure,
  EXPANSION_ISSUE_CODE_FIELD_MAP,
  coalesceExpansionBatch,
  extractStage1LessonBag,
  coalesceStage1Parsed,
  canonicalizeWeeklyFieldName,
  classifyStage1RepairIssues,
  planStage1OutlineRepair,
  STAGE1_OUTLINE_ISSUE_CODE_FIELD_MAP,
  isStage1ContractEchoKey,
  asActivityStringList,
  truncationFlags,
  MIN_TEACHER_LANGUAGE_PROMPT_LINES,
  TEACHER_LANGUAGE_WORD_FALLBACK,
  MIN_VOCABULARY_TERMS,
  normalizeTeacherLanguageField,
  countTeacherLanguagePrompts,
  teacherLanguageMeetsCountGate,
  teacherLanguageShape,
  buildTeacherLanguageRepairDiagnostics,
  rawTeacherLanguageByOutlineId,
  normalizeVocabularyField,
  countVocabularyTerms,
  vocabularyMeetsTermGate,
  vocabularyShape,
  vocabularyTermCandidates,
  buildVocabularyRepairDiagnostics,
  rawVocabularyByOutlineId,
  sweepExpansionActivitiesQuality,
  sweepAssembledLessonQuality,
  toStructuredQualityIssue,
  issueCountByField,
  buildFinalRepairUserPrompt,
  expansionFieldQualityExpectations,
  fieldRepairQualityInstruction,
  enrichExpansionRepairTargets,
  collectGenericFillerRepairDiagnostics,
  safetyRepairInstructionType,
  rejectGeneric,
};
