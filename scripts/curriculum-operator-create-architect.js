/**
 * AI Curriculum Operator — Phase 7.5 new-lesson architect.
 *
 * Uses the injected callOperatorAi transport (same as Phase 2.5).
 * Produces a full structured lesson payload for trusted lesson.create.
 * Deterministic seeds are NEVER used as a production fallback.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const structurePaste = require("./curriculum-lesson-structure-paste.js");
const composer = require("./curriculum-operator-ai-composer.js");
const createApi = require("./curriculum-operator-create.js");

const WEEKDAYS = createApi.WEEKDAYS;
const ACTIVITY_TEXT_FIELDS = Object.freeze([
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
  "adaptations",
  "extensions",
  "vocabulary",
]);

const GENERIC_FILLER_RE = /\b(children will (explore|learn about)|set out (the )?materials|encourage children to participate|what do you see\?|have fun exploring|let children explore)\b/i;

function text(value, max = 4000) {
  return schema.text(value, max);
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function isCreateFixtureMode(options = {}) {
  if (options.forceFixture === true) return true;
  if (options.forceLive === true) return false;
  if (process.env.NODE_ENV === "test") return true;
  const flag = String(process.env.LLH_OPERATOR_AI_FIXTURE || "").trim().toLowerCase();
  return ["1", "true", "yes"].includes(flag);
}

function buildArchitectSystemPrompt(ageBand) {
  const ageRules = ageBand === "infant"
    ? "INFANT only: bonding, sensory, tummy time, visual tracking, large safe materials, sounds, movement, caregiver interaction. Reject worksheets, tiny pieces, complex pretend play."
    : ageBand === "toddler"
      ? "TODDLER: short hands-on, large materials, movement, sensory, simple dramatic play, process art, simple sorting, short concrete questions. Reject tiny parts, long seated work, worksheets."
      : "PRESCHOOL: play-based dramatic play, STEM, counting, sequencing, early literacy, collaborative art, simple games, cutting, scavenger hunts. Still childcare/play-based.";
  return [
    "You are the Little Learner Hub Curriculum Architect.",
    "Design one complete original Teaching Kit week from the creation brief.",
    "Return ONLY valid JSON matching the schema in the user message — the ENTIRE structured lesson, never prose commentary.",
    "Do not invent image URLs, printable PDFs, cover art, or published book fabrications.",
    "Do not copy paid curriculum or another site's activity text.",
    "Every activity must be a full supported activity object with useful teacher-ready depth (not summaries).",
    "Reject generic filler like \"Children will learn about X\", \"Set out materials\", \"Let children explore\", \"What do you see?\".",
    "Honor requiredActivityCount exactly: return that many activity objects — never fewer, never more, never one-per-weekday summaries.",
    "Distribute activities across Monday–Friday (requiredWeekdays). For counts divisible by 5, use equal counts per day (e.g. 15 → 3 per day).",
    "Do not summarize multiple activities into one object. Do not return only one activity per weekday when more are required.",
    "Design Monday–Friday progression first, then place the exact activity count under those day focuses.",
    "Vary domains meaningfully; do not rename the same sorting/coloring idea repeatedly.",
    ageRules,
  ].join("\n");
}

function requiredWeekdays() {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
}

function expectedWeekdayDistribution(activityTarget) {
  const target = schema.clampInt(activityTarget, 4, 24, 12);
  const base = Math.floor(target / WEEKDAYS.length);
  const remainder = target % WEEKDAYS.length;
  const distribution = {};
  WEEKDAYS.forEach((day, index) => {
    distribution[day] = base + (index < remainder ? 1 : 0);
  });
  return distribution;
}

function buildArchitectUserPrompt(brief, { revisionIssues, previousContent, previousActivityCount } = {}) {
  const activityTarget = schema.clampInt(brief.activityTarget, 4, 24, createApi.defaultActivityTarget(brief.ageBand));
  const weekdayDistribution = expectedWeekdayDistribution(activityTarget);
  const payload = {
    mode: "CREATE_NEW_LESSON_ARCHITECT",
    brief: {
      title: brief.title,
      theme: brief.theme,
      ageBand: brief.ageBand,
      ageLabel: brief.ageLabel,
      accessPlan: brief.accessPlan,
      activityTarget,
      exclusions: brief.exclusions || {},
      requestedFeatures: brief.requestedFeatures || {},
      researchRequested: brief.researchRequested === true,
      coverRequested: brief.coverRequested === true,
    },
    requiredActivityCount: activityTarget,
    requiredWeekdays: requiredWeekdays(),
    requiredWeekdayDistribution: weekdayDistribution,
    contentDepthRequirements: {
      objective: "specific developmental/learning purpose",
      description: "clear description of actual child participation (what children will do)",
      preparation: "actual teacher preparation steps",
      setup: "specific physical arrangement",
      steps: "multiple actionable steps where appropriate",
      teacherLanguage: "multiple age-appropriate prompts/questions",
      observationOpportunities: "observable developmental behaviors",
      adaptations: "specific support adaptations (not \"help as needed\")",
      extensions: "specific added challenge",
      safetyNotes: "activity-specific safety information",
      note: "Useful depth required; do not pad with empty verbosity where a short field is naturally sufficient.",
    },
    requiredJsonSchema: {
      lesson: {
        title: "string",
        age: "string (must match brief.ageLabel)",
        theme: "string",
        plan: "Free|Pro (must match brief.accessPlan)",
        weeklyOverview: "string",
        objectives: "string",
        weeklyMaterials: "string",
        teacherPreparation: "string",
        prepChecklist: ["string"],
        observationFocus: ["string"],
        familyConnection: "string",
        milestones: ["string"],
        vocabularyWords: "string",
        dailyFocus: {
          monday: "string",
          tuesday: "string",
          wednesday: "string",
          thursday: "string",
          friday: "string",
        },
      },
      activities: [{
        title: "string",
        dayOfWeek: "monday|tuesday|wednesday|thursday|friday",
        activityCategory: "string domain",
        durationMinutes: "number",
        objective: "string",
        description: "string (what children will do)",
        materials: "string",
        preparation: "string",
        setup: "string",
        steps: "string (step-by-step)",
        teacherLanguage: "string (multiple useful questions)",
        observationOpportunities: "string",
        safetyNotes: "string",
        cleanupTips: "string",
        indoorAlternatives: "string",
        outdoorAlternatives: "string",
        teacherTips: ["string"],
        substitutions: ["string"],
        adaptations: "string",
        extensions: "string",
        vocabulary: "string",
        observationPrompts: ["string"],
        preliminaryAssetIntent: {
          image: "GENERATE|NOT_NEEDED",
          printable: "CREATE|NOT_NEEDED",
          reason: "string",
        },
      }],
      songIntent: ["optional weekday song ideas — titles/notes only, original"],
      bookIntent: ["optional verified-style book ideas — do not fabricate ISBNs"],
    },
    rules: [
      `Create exactly ${activityTarget} activity objects in activities[].`,
      `requiredActivityCount=${activityTarget} is mandatory and non-optional.`,
      `Distribute across weekdays per requiredWeekdayDistribution (typically ${JSON.stringify(weekdayDistribution)}).`,
      "Every activity must include dayOfWeek from requiredWeekdays (lowercase in JSON: monday…friday).",
      "All five weekdays must be represented when activityTarget >= 5.",
      "No near-duplicate activity concepts.",
      "researchRequested is informational only; do not claim web research occurred.",
    ],
  };
  if (revisionIssues && revisionIssues.length) {
    const received = schema.clampInt(previousActivityCount, 0, 24, flattenActivityTitles(previousContent).length);
    const missing = Math.max(0, activityTarget - received);
    payload.revisionPass = true;
    payload.fixOnlyTheseIssues = revisionIssues.slice(0, 40);
    payload.revisionDirectives = [
      `Expected requiredActivityCount=${activityTarget}; received ${received}.`,
      missing > 0
        ? `Add ${missing} complete new activities (do not summarize; each must be a full activity object).`
        : `Keep exactly ${activityTarget} activities (remove extras if over-count).`,
      "Preserve strong existing activities; repair listed Too short / quality issues in place.",
      "Ensure Monday–Friday distribution matches requiredWeekdayDistribution.",
      "Return the ENTIRE corrected structured lesson JSON (lesson + all activities), not a prose explanation and not a partial patch.",
    ];
    payload.previousContentSummary = {
      dailyFocus: previousContent?.lesson?.dailyFocus || null,
      activityTitles: flattenActivityTitles(previousContent).slice(0, 40),
      previousActivityCount: received,
    };
  }
  return [
    "Create one complete Little Learner Hub draft Teaching Kit from this brief.",
    "Respond with JSON only.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function flattenActivityTitles(content) {
  const titles = [];
  const plans = content?.dailyPlans || {};
  WEEKDAYS.forEach((day) => {
    schema.asArray(plans[day]?.items).forEach((item) => {
      titles.push(text(item.title, 120));
    });
  });
  return titles;
}

function conceptKey(title) {
  return structurePaste.normalizeTitleKey(title)
    .replace(/\b(the|a|an|and|with|for|game|activity|sort|sorting|color|colour|red|green)\b/g, " ")
    .replace(/\bs\b/g, " ")
    .replace(/ies\b/g, "y")
    .replace(/s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rejectGenericField(field, value) {
  const sample = Array.isArray(value) ? value.join(" ") : text(value);
  if (!sample) return `Empty ${field}`;
  if (GENERIC_FILLER_RE.test(sample) && wordCount(sample) < 45) {
    return `Generic filler in ${field}`;
  }
  if (typeof value === "string" && wordCount(value) < 8
    && !["vocabulary", "vocabularyWords"].includes(field)) {
    return `Too short: ${field}`;
  }
  return null;
}

function detectOutputTruncation(rawText, parsedActivityCount, requiredCount) {
  const raw = String(rawText || "");
  const trimmed = raw.trim();
  const reasons = [];
  if (!trimmed) reasons.push("empty_output");
  if (trimmed && !trimmed.endsWith("}") && !trimmed.endsWith("]")) {
    reasons.push("unterminated_json_tail");
  }
  // Common truncation smell: far fewer activities than required with a large but incomplete-looking payload
  if (
    Number.isFinite(parsedActivityCount)
    && Number.isFinite(requiredCount)
    && requiredCount >= 10
    && parsedActivityCount > 0
    && parsedActivityCount < Math.ceil(requiredCount * 0.5)
    && raw.length > 8000
  ) {
    reasons.push("activity_count_far_below_target_with_large_payload");
  }
  try {
    JSON.parse(composer.stripJsonFences(raw));
  } catch (_e) {
    if (raw.includes("{") && raw.length > 500) reasons.push("json_parse_failed_after_substantial_output");
  }
  return {
    truncatedLikely: reasons.length > 0 && (
      reasons.includes("unterminated_json_tail")
      || reasons.includes("json_parse_failed_after_substantial_output")
      || reasons.includes("activity_count_far_below_target_with_large_payload")
    ),
    reasons,
    rawLength: raw.length,
    parsedActivityCount,
    requiredCount,
  };
}

/**
 * Validate architect JSON into create content shape (lesson + dailyPlans.items).
 */
function validateArchitectOutput(rawText, brief) {
  let parsed;
  try {
    parsed = JSON.parse(composer.stripJsonFences(rawText));
  } catch (_e) {
    const truncation = detectOutputTruncation(rawText, 0, schema.clampInt(brief.activityTarget, 4, 24, 12));
    return {
      ok: false,
      code: "malformed_output",
      error: "AI returned malformed JSON.",
      issues: truncation.truncatedLikely
        ? ["malformed_json", "possible_output_truncation", ...truncation.reasons]
        : ["malformed_json"],
      truncation,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: "malformed_output", error: "AI returned non-object JSON.", issues: ["malformed_json"] };
  }

  const issues = [];
  const lessonIn = parsed.lesson && typeof parsed.lesson === "object" ? parsed.lesson : parsed;
  const title = text(lessonIn.title || brief.title, 120);
  if (!title) issues.push("missing_title");
  const age = text(lessonIn.age || brief.ageLabel, 80);
  const plan = text(lessonIn.plan, 20) === "Pro" || brief.accessPlan === "Pro" ? "Pro" : "Free";
  if (brief.accessPlan === "Pro" && plan !== "Pro") issues.push("access_plan_mismatch");
  if (brief.accessPlan === "Free" && plan !== "Free") issues.push("access_plan_mismatch");

  const dailyFocusIn = lessonIn.dailyFocus && typeof lessonIn.dailyFocus === "object"
    ? lessonIn.dailyFocus
    : {};
  const dailyFocus = {};
  WEEKDAYS.forEach((day) => {
    dailyFocus[day] = text(dailyFocusIn[day] || dailyFocusIn[day[0].toUpperCase() + day.slice(1)], 120)
      || createApi.weekdayProgression(brief.theme || title, brief.ageBand)[day];
  });

  const lesson = {
    title,
    age: age || brief.ageLabel,
    theme: text(lessonIn.theme || brief.theme || title, 120),
    plan,
    status: "draft",
    weeklyOverview: text(lessonIn.weeklyOverview, 2000),
    objectives: text(lessonIn.objectives, 2000),
    weeklyMaterials: text(lessonIn.weeklyMaterials, 2000),
    familyConnection: text(lessonIn.familyConnection, 2000),
    observationOpportunities: text(lessonIn.observationOpportunities, 2000),
    vocabularyWords: text(lessonIn.vocabularyWords, 500),
    teacherPreparation: text(lessonIn.teacherPreparation, 2000),
    prepChecklist: schema.asArray(lessonIn.prepChecklist).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
    observationFocus: schema.asArray(lessonIn.observationFocus).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
    milestones: schema.asArray(lessonIn.milestones).map((v) => text(v, 200)).filter(Boolean).slice(0, 16),
    dailyFocus,
  };

  ["weeklyOverview", "objectives", "weeklyMaterials", "teacherPreparation", "familyConnection"].forEach((field) => {
    const err = rejectGenericField(field, lesson[field]);
    if (err) issues.push(err);
  });
  if (!lesson.prepChecklist.length) issues.push("missing_prep_checklist");
  if (!lesson.observationFocus.length) issues.push("missing_observation_focus");

  const activitiesIn = schema.asArray(parsed.activities);
  const target = schema.clampInt(brief.activityTarget, 4, 24, createApi.defaultActivityTarget(brief.ageBand));
  const truncation = detectOutputTruncation(rawText, activitiesIn.length, target);
  if (activitiesIn.length !== target) {
    issues.push(`activity_count_mismatch:${activitiesIn.length}!=${target}`);
  }
  if (truncation.truncatedLikely) {
    issues.push("possible_output_truncation");
    truncation.reasons.forEach((reason) => issues.push(reason));
  }

  const dailyPlans = Object.fromEntries(WEEKDAYS.map((d) => [d, { focus: dailyFocus[d], items: [] }]));
  const titles = [];
  const concepts = [];
  const domains = new Set();
  const assetIntent = [];
  const descriptionFingerprints = [];

  activitiesIn.forEach((raw, index) => {
    const day = text(raw?.dayOfWeek, 20).toLowerCase();
    if (!WEEKDAYS.includes(day)) {
      issues.push(`bad_weekday:${day || "missing"}`);
      return;
    }
    const actTitle = text(raw?.title || raw?.name, 120);
    if (!actTitle) {
      issues.push(`missing_activity_title_${index}`);
      return;
    }
    titles.push(actTitle.toLowerCase());
    concepts.push(conceptKey(actTitle));
    const category = text(raw?.activityCategory || raw?.category || raw?.domain, 80) || "Invitation to Play";
    domains.add(category.toLowerCase());
    descriptionFingerprints.push(
      structurePaste.normalizeTitleKey(`${raw?.objective || ""} ${raw?.description || ""} ${raw?.steps || ""}`).slice(0, 160),
    );

    const item = {
      itemId: structurePaste.generateItemId(),
      title: actTitle,
      dayOfWeek: day,
      activityCategory: category,
      objective: text(raw?.objective, 2000),
      description: text(raw?.description || raw?.whatChildrenWillDo, 2000),
      materials: text(raw?.materials, 2000),
      preparation: text(raw?.preparation || raw?.teacherPrep, 2000),
      setup: text(raw?.setup, 2000),
      steps: text(raw?.steps, 4000),
      teacherLanguage: text(raw?.teacherLanguage || raw?.teacherQuestions, 2000),
      observationOpportunities: text(raw?.observationOpportunities || raw?.observationFocus, 2000),
      safetyNotes: text(raw?.safetyNotes || raw?.safety, 2000),
      cleanupTips: text(raw?.cleanupTips || raw?.cleanup, 2000),
      indoorAlternatives: text(raw?.indoorAlternatives, 2000),
      outdoorAlternatives: text(raw?.outdoorAlternatives, 2000),
      teacherTips: schema.asArray(raw?.teacherTips || raw?.tips).map((v) => text(v, 300)).filter(Boolean).slice(0, 8),
      substitutions: schema.asArray(raw?.substitutions).map((v) => (
        typeof v === "string" ? text(v, 300) : text(`${v?.need || ""} → ${v?.use || ""}`, 300)
      )).filter(Boolean).slice(0, 8),
      adaptations: text(raw?.adaptations || raw?.supportAdaptations, 2000),
      extensions: text(raw?.extensions || raw?.addedChallenge, 2000),
      vocabulary: text(raw?.vocabulary, 500),
      observationPrompts: schema.asArray(raw?.observationPrompts).map((v) => text(v, 300)).filter(Boolean).slice(0, 8),
      durationMinutes: schema.clampInt(raw?.durationMinutes, 3, 60, brief.ageBand === "infant" ? 8 : 15),
      age: brief.ageLabel || age,
      mixedAgeAdaptations: text(raw?.mixedAgeAdaptations || raw?.mixedAgeNotes, 2000),
    };

    ACTIVITY_TEXT_FIELDS.forEach((field) => {
      if (field === "vocabulary") return;
      const err = rejectGenericField(`${actTitle}.${field}`, item[field]);
      if (err) issues.push(err);
    });
    if (wordCount(item.vocabulary) < 3) issues.push(`${actTitle}.thin_vocabulary`);
    if (!item.teacherTips.length) issues.push(`${actTitle}.missing_tips`);
    if (!item.observationPrompts.length) issues.push(`${actTitle}.missing_observation_prompts`);

    const intent = raw?.preliminaryAssetIntent && typeof raw.preliminaryAssetIntent === "object"
      ? raw.preliminaryAssetIntent
      : null;
    if (intent) {
      assetIntent.push({
        activityTitle: actTitle,
        dayOfWeek: day,
        image: text(intent.image, 40).toUpperCase() === "GENERATE" ? "GENERATE" : "NOT_NEEDED",
        printable: text(intent.printable, 40).toUpperCase() === "CREATE" ? "CREATE" : "NOT_NEEDED",
        reason: text(intent.reason, 300),
      });
    }

    dailyPlans[day].items.push(item);
  });

  if (new Set(titles).size < titles.length) issues.push("duplicate_activity_titles");
  const conceptCounts = new Map();
  concepts.forEach((c) => {
    if (!c) return;
    conceptCounts.set(c, (conceptCounts.get(c) || 0) + 1);
  });
  conceptCounts.forEach((count, key) => {
    if (count >= 2) issues.push(`near_duplicate_concept:${key}`);
  });
  for (let i = 0; i < titles.length; i += 1) {
    for (let j = i + 1; j < titles.length; j += 1) {
      const score = createApi.similarityScore(titles[i], titles[j]);
      if (score >= 0.75) issues.push(`similar_titles:${titles[i]}~${titles[j]}`);
      if (
        descriptionFingerprints[i]
        && descriptionFingerprints[i] === descriptionFingerprints[j]
        && descriptionFingerprints[i].length > 40
      ) {
        issues.push(`duplicate_activity_body:${titles[i]}~${titles[j]}`);
      }
    }
  }

  const daysUsed = WEEKDAYS.filter((d) => dailyPlans[d].items.length > 0);
  if (target >= 5 && daysUsed.length < 5) {
    issues.push(`weekday_coverage_incomplete:${daysUsed.length}<5`);
  } else if (daysUsed.length < 4) {
    issues.push("weak_weekday_coverage");
  }
  if (activitiesIn.length === target && target >= 5) {
    const counts = WEEKDAYS.map((day) => dailyPlans[day].items.length);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    // Allow off-by-one imbalance; reject extreme piles (e.g. 11 on Monday, 1 elsewhere).
    if (max - min > 1) {
      issues.push(`weekday_distribution_imbalanced:max${max}-min${min}`);
    }
  }

  const ageBand = brief.ageBand;
  const allText = activitiesIn.map((a) => JSON.stringify(a)).join(" ").toLowerCase();
  if (ageBand === "infant" && /worksheet|tiny bead|cut out|scissor|write the letter/i.test(allText)) {
    issues.push("infant_inappropriate");
  }
  if (ageBand === "toddler" && /worksheet|multiply|essay|independent research/i.test(allText)) {
    issues.push("toddler_inappropriate");
  }
  if (domains.size < Math.min(4, Math.max(2, Math.floor(target / 4)))) {
    issues.push("weak_domain_variety");
  }

  const content = {
    lesson,
    dailyPlans,
    books: [],
    songs: [],
    songIntent: schema.asArray(parsed.songIntent).slice(0, 8),
    bookIntent: schema.asArray(parsed.bookIntent).slice(0, 8),
    preliminaryAssetIntent: assetIntent,
  };

  if (issues.length) {
    return {
      ok: false,
      code: "quality_failed",
      error: `Architect quality gate failed: ${issues.slice(0, 8).join("; ")}`,
      issues,
      content,
      truncation,
      parsedActivityCount: activitiesIn.length,
      requiredActivityCount: target,
    };
  }
  return {
    ok: true,
    content,
    issues: [],
    assetIntent,
    truncation,
    parsedActivityCount: activitiesIn.length,
    requiredActivityCount: target,
  };
}

/**
 * Deterministic high-quality fixture architect JSON for CI.
 * Theme-specific enough to pass quality gates; never a production fallback.
 */
function buildOperatorCreateArchitectFixtureResponse(userPrompt) {
  let brief = {};
  try {
    const jsonStart = String(userPrompt).indexOf("{");
    const parsed = JSON.parse(String(userPrompt).slice(jsonStart));
    brief = parsed.brief || {};
  } catch (_e) {
    brief = {};
  }
  const theme = text(brief.theme || brief.title || "Bakery", 80);
  const ageBand = brief.ageBand || "preschool";
  const ageLabel = brief.ageLabel || createApi.ageLabel(ageBand);
  const target = schema.clampInt(brief.activityTarget, 4, 24, createApi.defaultActivityTarget(ageBand));
  const plan = brief.accessPlan === "Pro" ? "Pro" : "Free";
  const progression = createApi.weekdayProgression(theme, ageBand);

  const domains = ageBand === "infant"
    ? ["Sensory", "Gross Motor", "Music / Movement", "Social-Emotional", "Outdoor", "Circle / Group"]
    : ageBand === "toddler"
      ? ["Sensory", "Fine Motor", "Gross Motor", "Art / Creative", "Dramatic Play", "Music / Movement", "Early Literacy", "Outdoor"]
      : ["Circle / Group", "Sensory", "Fine Motor", "Gross Motor", "Art / Creative", "Dramatic Play", "Early Literacy", "Math", "Science / STEM", "Social-Emotional", "Music / Movement", "Outdoor"];

  const activities = [];
  for (let i = 0; i < target; i += 1) {
    const day = WEEKDAYS[i % WEEKDAYS.length];
    const domain = domains[i % domains.length];
    const dayFocus = progression[day];
    const uniqueNoun = ["station", "invitation", "workshop", "lab", "trail", "studio", "circle", "hunt", "table", "corner", "path", "basket", "mat", "nook", "yard"][i % 15];
    const titleVerb = ["mix", "roll", "measure", "serve", "frost", "knead", "sift", "taste", "shape", "share", "count", "pour", "pack", "deliver", "celebrate"][i % 15];
    const title = `${theme} ${titleVerb} ${uniqueNoun}`.replace(/\s+/g, " ").trim();
    const infant = ageBand === "infant";
    const toddler = ageBand === "toddler";
    activities.push({
      title,
      dayOfWeek: day,
      activityCategory: domain,
      durationMinutes: infant ? 8 : toddler ? 12 : 15,
      objective: infant
        ? `Caregivers support calm ${theme.toLowerCase()} sensory exploration during ${dayFocus}, watching for tracking and co-regulation.`
        : toddler
          ? `Toddlers practice one ${domain.toLowerCase()} skill with large ${theme.toLowerCase()} props during ${dayFocus}, using short concrete prompts.`
          : `Children investigate ${theme.toLowerCase()} through ${domain.toLowerCase()} play tied to ${dayFocus}, using specific materials and turn-taking.`,
      description: `Children use prepared ${theme.toLowerCase()} materials at the ${uniqueNoun} to complete a clear ${domain.toLowerCase()} invitation for ${dayFocus}.`,
      materials: infant
        ? `Large soft ${theme.toLowerCase()} scarves, mirror, caregiver lap blanket, choke-safe sound makers`
        : toddler
          ? `Large ${theme.toLowerCase()} props, trays, wipeable mats, two backup open-ended pieces`
          : `${theme} props, labeled trays, clipboards or cards, scissors only if cutting is planned, cleanup tub`,
      preparation: `Stage the ${uniqueNoun} before arrival: place ${theme.toLowerCase()} materials at child level, pre-count pieces, and post the ${dayFocus} focus card.`,
      setup: `Clear a ${domain.toLowerCase()} space, set one tray per child or pair, and keep a reset basket beside the ${uniqueNoun}.`,
      steps: [
        `Gather children and name today's focus: ${dayFocus}.`,
        `Show one ${theme.toLowerCase()} material and model a single action.`,
        `Invite children to try the action at the ${uniqueNoun} with a clear start and stop signal.`,
        `Coach turn-taking with one specific language stem related to ${theme.toLowerCase()}.`,
        `Close by asking each child to name one thing they did with the materials.`,
      ].join("\n"),
      teacherLanguage: [
        `I notice you using the ${theme.toLowerCase()} materials at the ${uniqueNoun}.`,
        `Which part should we try next for ${dayFocus}?`,
        `Can you show a friend how that ${theme.toLowerCase()} piece moves?`,
      ].join("\n"),
      observationOpportunities: `Watch grip, language attempts, peer turn-taking, and whether children connect actions to ${dayFocus}.`,
      safetyNotes: infant
        ? "Stay within arm's reach; use only large choke-safe materials; skip tiny parts."
        : "Check props for damage; supervise any small pieces; keep pathways clear.",
      cleanupTips: `Sort ${theme.toLowerCase()} props into labeled bins, wipe trays, and reset the ${uniqueNoun} for the next group.`,
      indoorAlternatives: `Move the same ${domain.toLowerCase()} invitation to a rug or table with the same ${theme.toLowerCase()} props.`,
      outdoorAlternatives: infant
        ? "Bring soft materials outdoors on a shaded blanket with caregiver support."
        : `Take ${theme.toLowerCase()} props outdoors for larger movement while keeping the same objective.`,
      teacherTips: [
        `Keep the group small at the ${uniqueNoun}.`,
        "Have one backup tray ready if interest spikes.",
      ],
      substitutions: [
        `Swap one commercial prop for a classroom ${theme.toLowerCase()} alternative that is the same size.`,
      ],
      adaptations: "Offer hand-over-hand, fewer steps, or a seated version for children who need support.",
      extensions: `Add one choice card that deepens ${dayFocus} for children ready for more challenge.`,
      vocabulary: `${theme}, ${dayFocus}, ${titleVerb}, try, next, share, notice`,
      observationPrompts: [
        "What language did the child use with the materials?",
        "How did they solve a turn-taking moment?",
      ],
      preliminaryAssetIntent: {
        image: /Dramatic|Art|Sensory|Science/i.test(domain) ? "GENERATE" : "NOT_NEEDED",
        printable: /Math|Literacy|Dramatic/i.test(domain) ? "CREATE" : "NOT_NEEDED",
        reason: `${domain} may benefit from a visual or card set only when recognition matters.`,
      },
    });
  }

  return JSON.stringify({
    lesson: {
      title: text(brief.title || theme, 120),
      age: ageLabel,
      theme,
      plan,
      weeklyOverview: `${theme} week for ${ageLabel}: a Monday–Friday progression from introduction through celebration with varied play invitations.`,
      objectives: `During ${theme} week, ${ageLabel} children practice concrete play skills across domains using prepared materials and short teacher coaching tied to each weekday focus.`,
      weeklyMaterials: `Theme props for ${theme}, trays, labels, open-ended art/sensory materials, and a cleanup station.`,
      teacherPreparation: `Preview each weekday focus, gather ${theme.toLowerCase()} props, label trays, and stage Monday materials before children arrive.`,
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
      familyConnection: `Invite families to share one ${theme.toLowerCase()} word or photo from home and notice the same idea outdoors.`,
      milestones: [
        "Shows interest in theme materials",
        "Uses related vocabulary with support",
        "Completes a short guided invitation",
      ],
      vocabularyWords: `${theme}, explore, notice, try, share`,
      dailyFocus: progression,
    },
    activities,
    songIntent: [{ weekday: "monday", title: `Hello ${theme}`, note: "original greeting chant" }],
    bookIntent: [],
  });
}

async function callArchitectOnce(brief, callAi, revision) {
  const systemPrompt = buildArchitectSystemPrompt(brief.ageBand);
  const previousActivityCount = revision?.previousContent
    ? flattenActivityTitles(revision.previousContent).length
    : revision?.previousActivityCount;
  const userPrompt = buildArchitectUserPrompt(brief, {
    ...(revision || {}),
    previousActivityCount,
  });
  let raw;
  try {
    raw = await callAi(systemPrompt, userPrompt);
  } catch (error) {
    return {
      ok: false,
      code: "AI_CREATION_FAILED",
      error: text(error?.message || "AI lesson architect call failed", 500),
      usage: { lessonArchitectCalls: 1, lessonRevisionCalls: revision ? 1 : 0 },
    };
  }
  const validated = validateArchitectOutput(raw, brief);
  return {
    ...validated,
    rawPreview: text(raw, 400),
    usage: {
      lessonArchitectCalls: revision ? 0 : 1,
      lessonRevisionCalls: revision ? 1 : 0,
      inputChars: systemPrompt.length + userPrompt.length,
      outputChars: String(raw || "").length,
      maxOutputTokensHint: Number(callAi?.maxOutputTokensHint) || null,
    },
  };
}

/**
 * Production path: require AI (or fixture-mode AI). Never fall back to deterministic seeds.
 */
/**
 * Production create path: staged week architecture + batched activity expansion.
 * Single-shot full-lesson generation is no longer used for create (response-size failures).
 * Lazy-require avoids circular dependency with the staged composer module.
 */
async function composeNewLessonContent(brief, options = {}) {
  const staged = require("./curriculum-operator-staged-composer.js");
  return staged.composeStagedLessonContent(brief, options);
}

module.exports = {
  isCreateFixtureMode,
  buildArchitectSystemPrompt,
  buildArchitectUserPrompt,
  validateArchitectOutput,
  buildOperatorCreateArchitectFixtureResponse,
  composeNewLessonContent,
  conceptKey,
  expectedWeekdayDistribution,
  requiredWeekdays,
  detectOutputTruncation,
};
