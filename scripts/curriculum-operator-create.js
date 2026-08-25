/**
 * AI Curriculum Operator — Phase 7 new lesson creation (draft only).
 *
 * Builds a typed creation brief, duplicate-checks, generates base lesson content,
 * and creates via the trusted lesson-plan sync path (injected). Never publishes.
 */
"use strict";

const crypto = require("crypto");
const schema = require("./curriculum-operator-schema.js");
const structurePaste = require("./curriculum-lesson-structure-paste.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const printableAgeBand = require("./curriculum-operator-printable-age-band.js");
const intentRouter = require("./curriculum-operator-intent-router.js");

const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);

const DEFAULT_ACTIVITY_TARGETS = Object.freeze({
  infant: 10,
  toddler: 12,
  preschool: 15,
  school_age: 15,
  mixed: 12,
});

const DOMAIN_ROTATION = Object.freeze([
  "Circle / Group",
  "Sensory",
  "Fine Motor",
  "Gross Motor",
  "Art / Creative",
  "Dramatic Play",
  "Early Literacy",
  "Math",
  "Science / STEM",
  "Social-Emotional",
  "Music / Movement",
  "Outdoor",
]);

function text(value, max = 2000) {
  return schema.text(value, max);
}

function ageLabel(ageBand) {
  if (ageBand === "infant") return "Infant 0–12 Months";
  if (ageBand === "toddler") return "Toddler 18–24 Months";
  if (ageBand === "preschool") return "Preschool 3–5";
  if (ageBand === "school_age") return "School Age";
  return "Mixed Ages";
}

function defaultActivityTarget(ageBand) {
  return DEFAULT_ACTIVITY_TARGETS[ageBand] || DEFAULT_ACTIVITY_TARGETS.mixed;
}

function creationIdempotencyKey(brief) {
  const title = structurePaste.normalizeTitleKey(brief?.title || brief?.theme || "");
  const age = text(brief?.ageBand, 40).toLowerCase();
  const plan = brief?.accessPlan === "Pro" ? "pro" : "free";
  return `create:${title}:${age}:${plan}`;
}

/**
 * Parse owner create command into a typed brief.
 */
function parseCreationBrief(rawCommand, options = {}) {
  const raw = text(rawCommand, 4000);
  const exclusions = orchestrator.parseExclusionHints(raw);
  const parentResolved = options.parentLesson
    ? printableAgeBand.resolvePrintableAgeBand(options.parentLesson, {
      fallbackAgeBand: options.ageBand || null,
    })
    : null;
  const ageBand = schema.normalizeAgeBand(raw)
    || options.ageBand
    || (parentResolved?.ok ? parentResolved.ageBand : null)
    || null;
  let accessPlan = null;
  if (/\bpro\b/i.test(raw)) accessPlan = "Pro";
  else if (/\bfree\b/i.test(raw)) accessPlan = "Free";
  else accessPlan = options.defaultAccessPlan === "Pro" ? "Pro" : "Free";

  const countMatch = raw.match(/\b(\d{1,2})\s+activit/i);
  const activityTarget = countMatch
    ? schema.clampInt(countMatch[1], 4, 24, null)
    : (ageBand ? defaultActivityTarget(ageBand) : null);

  let title = "";
  const quoted = raw.match(/[“"]([^”"]{2,120})[”"]/);
  if (quoted) title = quoted[1].trim();
  if (!title) {
    const m = raw.match(
      /\b(?:create|make|build)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:(?:infant|toddler|preschool|school[\s-]?age|pro|free)\s+)*(.+?)(?:\s+lesson|\s+week|\s+kit|\s+teaching\s+kit)\b/i,
    );
    if (m) {
      title = m[1]
        .replace(/\b(infant|toddler|preschool|school[\s-]?age|pro|free)\b/gi, " ")
        .replace(/\b(with|but|and|for|to|ready|review|leave|get|it)\b.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  if (!title) {
    const themeMatch = raw.match(/\b(?:about|theme|inspired by)\s+([A-Za-z][\w'’\-\s&]{2,60}?)(?:\s+lesson|\s+week|\s+and\b|,|\.|$)/i);
    if (themeMatch) title = themeMatch[1].trim();
  }
  // Title-case cleanup: drop trailing filler
  title = text(title, 120).replace(/\b\d+\s*activit.*$/i, "").trim();
  const theme = title || text(options.theme, 120);

  const researchRequested = /\b(look\s+up|research|find\s+(activity\s+)?inspiration|browse\s+ideas)\b/i.test(raw);
  const coverRequested = exclusions.flags.touchCover === true
    || /\b(cover\s+image|include\s+a\s+cover|with\s+a\s+cover)\b/i.test(raw);

  const needsOwnerInput = [];
  if (!title && !theme) needsOwnerInput.push("title_or_theme");
  if (!ageBand) needsOwnerInput.push("age_band");

  const brief = {
    title: title || theme,
    theme: theme || title,
    ageBand,
    ageLabel: ageBand ? ageLabel(ageBand) : "",
    accessPlan,
    activityTarget: activityTarget || (ageBand ? defaultActivityTarget(ageBand) : 12),
    teachingGoals: [],
    requestedFeatures: {
      songs: exclusions.flags.touchSongs !== false && !exclusions.flags.textOnly,
      books: exclusions.flags.touchBooks !== false && !exclusions.flags.textOnly,
      images: exclusions.flags.touchImages !== false && !exclusions.flags.textOnly,
      printables: exclusions.flags.touchPrintables !== false && !exclusions.flags.textOnly,
      cover: coverRequested,
    },
    exclusions: exclusions.flags,
    coverRequested,
    researchRequested,
    rawCommand: raw,
    idempotencyKey: "",
  };
  brief.idempotencyKey = creationIdempotencyKey(brief);

  return {
    ok: needsOwnerInput.length === 0,
    code: needsOwnerInput.length ? "NEEDS_OWNER_INPUT" : "ok",
    needsOwnerInput,
    brief,
    notes: exclusions.notes.slice(),
  };
}

function titleTokens(title) {
  return structurePaste.normalizeTitleKey(title)
    .split(/\s+/)
    .filter((t) => t && t.length > 2 && !/^(the|and|for|with|week|lesson|plan)$/.test(t));
}

const WEAK_TITLE_TAILS = new Set([
  "zone", "crew", "fun", "time", "club", "lab", "world", "builders", "builder",
  "explorers", "explorer", "friends", "friend", "adventures", "adventure",
  "station", "center", "centre", "play", "unit",
]);

function similarityScore(a, b) {
  const listA = titleTokens(a);
  const listB = titleTokens(b);
  const ta = new Set(listA);
  const tb = new Set(listB);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  ta.forEach((t) => { if (tb.has(t)) overlap += 1; });
  const jaccard = overlap / Math.max(ta.size, tb.size);
  // Near-duplicate lesson naming: shared head word + weak tails (Construction Zone ≈ Construction Crew)
  if (
    listA[0]
    && listA[0] === listB[0]
    && listA.length <= 3
    && listB.length <= 3
    && listA.length >= 2
    && listB.length >= 2
  ) {
    const tailsA = listA.slice(1);
    const tailsB = listB.slice(1);
    const weakA = tailsA.every((t) => WEAK_TITLE_TAILS.has(t));
    const weakB = tailsB.every((t) => WEAK_TITLE_TAILS.has(t));
    if (weakA && weakB) return Math.max(jaccard, 0.85);
  }
  return jaccard;
}

/**
 * Exact + high-similarity same-age duplicate check.
 */
function findCreationDuplicates(brief, curriculum) {
  const plans = schema.asArray(curriculum?.lessonPlans);
  const titleKey = structurePaste.normalizeTitleKey(brief.title);
  const exact = structurePaste.findDuplicateLessonTitle(brief.title, plans);
  if (exact) {
    return {
      ok: false,
      code: "POSSIBLE_DUPLICATE",
      level: "exact",
      matches: [{
        id: exact.id,
        title: exact.title,
        age: exact.age,
        plan: exact.plan,
        similarity: 1,
      }],
      message: `Exact title already exists: “${exact.title}”.`,
    };
  }

  const ageBand = brief.ageBand;
  const similar = [];
  plans.forEach((plan) => {
    const planAge = schema.normalizeAgeBand(plan.age || "");
    if (ageBand && planAge && planAge !== ageBand) return;
    const score = similarityScore(brief.title, plan.title);
    if (score >= 0.6) {
      similar.push({
        id: plan.id,
        title: plan.title,
        age: plan.age,
        plan: plan.plan,
        similarity: Math.round(score * 100) / 100,
      });
    }
  });
  similar.sort((a, b) => b.similarity - a.similarity);
  if (similar.length && similar[0].similarity >= 0.75) {
    return {
      ok: false,
      code: "POSSIBLE_DUPLICATE",
      level: "high_similarity",
      matches: similar.slice(0, 5),
      message: `High similarity to existing “${similar[0].title}” (${similar[0].age}).`,
    };
  }
  return { ok: true, code: "ok", matches: similar.slice(0, 5) };
}

function weekdayProgression(theme, ageBand) {
  const t = text(theme, 40) || "Theme";
  if (ageBand === "infant") {
    return {
      monday: `Meet ${t}`,
      tuesday: `${t} Sensory`,
      wednesday: `${t} Movement`,
      thursday: `${t} Sounds`,
      friday: `${t} Bonding Review`,
    };
  }
  if (ageBand === "toddler") {
    return {
      monday: `Discover ${t}`,
      tuesday: `${t} Explore`,
      wednesday: `${t} Create`,
      thursday: `${t} Play`,
      friday: `${t} Celebrate`,
    };
  }
  return {
    monday: `Meet the ${t}`,
    tuesday: `${t} Investigate`,
    wednesday: `${t} Create`,
    thursday: `${t} Dramatic Play`,
    friday: `${t} Review & Share`,
  };
}

function activitySeedForDay({ theme, weekday, dayFocus, domain, index, ageBand, ageLabel }) {
  const itemId = structurePaste.generateItemId();
  const name = `${dayFocus}: ${domain.split("/")[0].trim()} ${index + 1}`;
  const isInfant = ageBand === "infant";
  const isToddler = ageBand === "toddler";
  return {
    itemId,
    title: text(name, 120),
    dayOfWeek: weekday,
    activityCategory: domain,
    objective: isInfant
      ? `Caregivers and infants share calm ${theme.toLowerCase()} exploration with safe large materials.`
      : isToddler
        ? `Toddlers practice ${domain.toLowerCase()} skills while exploring ${theme.toLowerCase()} with simple, short prompts.`
        : `Children investigate ${theme.toLowerCase()} through ${domain.toLowerCase()} play connected to ${dayFocus}.`,
    description: `Children engage with ${theme.toLowerCase()} materials during ${dayFocus.toLowerCase()}.`,
    materials: isInfant
      ? "Soft scarves, large safe toys, caregiver lap space"
      : isToddler
        ? "Large manipulatives, trays, theme props, wipeable mats"
        : "Theme props, clipboards or cards, scissors if cutting, trays, labels",
    preparation: `Set ${theme.toLowerCase()} materials at child level before ${weekday} ${domain.toLowerCase()}.`,
    setup: `Prepare a clear ${domain.toLowerCase()} space with labeled ${theme.toLowerCase()} materials.`,
    steps: [
      `Invite children to notice one ${theme.toLowerCase()} prop.`,
      `Model one action related to ${dayFocus.toLowerCase()}.`,
      `Offer turns and short language prompts.`,
      `Close by naming one thing children did.`,
    ].join("\n"),
    teacherLanguage: [
      `I notice you exploring the ${theme.toLowerCase()} materials.`,
      `Can you show me how it moves / feels / looks?`,
      `What should we try next for ${dayFocus.toLowerCase()}?`,
    ].join("\n"),
    observationOpportunities: `Watch for engagement, language, and motor use during ${domain.toLowerCase()}.`,
    safetyNotes: isInfant
      ? "Stay within arm's reach; use only large, choke-safe materials."
      : "Check materials for damage; supervise small pieces if any.",
    cleanupTips: "Sort props into labeled bins; wipe trays; reset for next group.",
    indoorAlternatives: `Run the same ${domain.toLowerCase()} invitation at a table or rug.`,
    outdoorAlternatives: ageBand === "infant"
      ? "Bring soft materials outdoors on a blanket with shade."
      : `Move ${theme.toLowerCase()} props outdoors for larger movement.`,
    teacherTips: [`Keep groups small for activity ${index + 1}.`, "Offer one clear next step."],
    substitutions: [`Swap one prop for a classroom ${theme.toLowerCase()} alternative.`],
    adaptations: "Offer hand-over-hand or fewer steps for children who need support.",
    extensions: "Add one extra challenge choice for children ready for more.",
    vocabulary: `${theme}, ${dayFocus}, look, try, next`,
    observationPrompts: [
      "What language did the child use?",
      "How did they use the materials?",
    ],
    durationMinutes: isInfant ? 8 : isToddler ? 12 : 15,
    age: ageLabel,
  };
}

/**
 * Deterministic base lesson content — CI / explicit fixture harness ONLY.
 * Production Operator create must use composeNewLessonContent (Phase 7.5 architect).
 * Never call this as a silent fallback when AI fails.
 */
function buildBaseLessonContent(brief, { allowDeterministicFixture = false } = {}) {
  if (!allowDeterministicFixture && process.env.NODE_ENV !== "test") {
    const flag = String(process.env.LLH_OPERATOR_AI_FIXTURE || "").trim().toLowerCase();
    if (!["1", "true", "yes"].includes(flag)) {
      return {
        ok: false,
        code: "AI_CREATION_FAILED",
        error: "Deterministic base content is fixture-only. Production create requires the AI lesson architect.",
      };
    }
  }
  // Legacy deterministic builder retained for older unit tests that opt in.
  return buildDeterministicFixtureContent(brief);
}

function buildDeterministicFixtureContent(brief) {
  const theme = text(brief.theme || brief.title, 80) || "Theme";
  const ageBand = brief.ageBand || "preschool";
  const ageLabelText = brief.ageLabel || ageLabel(ageBand);
  const target = schema.clampInt(brief.activityTarget, 4, 24, defaultActivityTarget(ageBand));
  const progression = weekdayProgression(theme, ageBand);
  const empty = Object.fromEntries(WEEKDAYS.map((d) => [d, { focus: "", items: [] }]));

  WEEKDAYS.forEach((day) => {
    empty[day].focus = progression[day];
    empty[day].items = [];
  });

  for (let i = 0; i < target; i += 1) {
    const weekday = WEEKDAYS[i % WEEKDAYS.length];
    const domain = DOMAIN_ROTATION[i % DOMAIN_ROTATION.length];
    // Infant: skip worksheet-like domains
    const safeDomain = ageBand === "infant" && /Math|Literacy|Science/i.test(domain)
      ? "Sensory"
      : domain;
    const item = activitySeedForDay({
      theme,
      weekday,
      dayFocus: progression[weekday],
      domain: safeDomain,
      index: i,
      ageBand,
      ageLabel: ageLabelText,
    });
    empty[weekday].items.push(item);
  }

  const titles = [];
  WEEKDAYS.forEach((d) => {
    empty[d].items.forEach((it) => titles.push(it.title));
  });
  const uniqueTitles = new Set(titles.map((t) => t.toLowerCase()));
  if (uniqueTitles.size < titles.length * 0.8) {
    return { ok: false, code: "duplicate_activities", error: "Generated activities look too repetitive." };
  }

  const lesson = {
    title: text(brief.title, 120),
    age: ageLabelText,
    theme,
    plan: brief.accessPlan === "Pro" ? "Pro" : "Free",
    status: "draft",
    weeklyOverview: `${theme} week for ${ageLabelText}: children explore through a Monday–Friday progression from introduction to celebration.`,
    objectives: `During ${theme} week, ${ageLabelText} children practice concrete play skills across domains with prepared materials and short teacher coaching.`,
    weeklyMaterials: `Theme props for ${theme}, trays, labels, books, and open-ended art/sensory materials.`,
    familyConnection: `Share one ${theme.toLowerCase()} word or photo from home and invite families to notice the same idea outdoors.`,
    observationOpportunities: "Notice engagement, new vocabulary, motor planning, and peer interaction across the week.",
    vocabularyWords: `${theme}, explore, notice, try, share`,
    teacherPreparation: `Preview Monday–Friday focuses, gather ${theme.toLowerCase()} props, and stage materials before circle.`,
    prepChecklist: [
      `Gather ${theme.toLowerCase()} props`,
      "Label trays by weekday focus",
      "Prepare one backup open-ended invitation",
    ],
    observationFocus: [
      "Language attempts during play",
      "How children use materials",
      "Peer turn-taking",
    ],
    milestones: [
      "Shows interest in theme materials",
      "Uses related vocabulary with support",
      "Completes a short guided invitation",
    ],
  };

  const payload = {
    lesson,
    dailyPlans: empty,
    books: [],
    songs: [],
  };

  return {
    ok: true,
    content: payload,
    activityCount: target,
    progression,
    usage: { composerCalls: 0 },
    source: "deterministic_fixture",
  };
}

function buildLessonPlanPayload(brief, content, options = {}) {
  const canonical = structurePaste.buildCanonicalLessonPlan(content, {
    lastEditedBy: options.editedBy || "curriculum-operator-phase7",
  });
  canonical.plan = brief.accessPlan === "Pro" ? "Pro" : "Free";
  canonical.status = "draft";
  canonical.theme = brief.theme || brief.title;
  canonical.age = brief.ageLabel || ageLabel(brief.ageBand);
  if (content.lesson?.teacherPreparation) {
    canonical.enrichmentDraft = canonical.enrichmentDraft || { week: {}, activities: {}, updatedAt: new Date().toISOString() };
    canonical.enrichmentDraft.week = canonical.enrichmentDraft.week || {};
    canonical.enrichmentDraft.week.teacherPreparation = content.lesson.teacherPreparation;
    if (content.lesson.prepChecklist) {
      canonical.enrichmentDraft.week.teacherToolkit = {
        ...(canonical.enrichmentDraft.week.teacherToolkit || {}),
        prepChecklist: content.lesson.prepChecklist.slice(),
      };
    }
    if (content.lesson.observationFocus) {
      canonical.enrichmentDraft.week.teacherToolkit = {
        ...(canonical.enrichmentDraft.week.teacherToolkit || {}),
        observationFocus: content.lesson.observationFocus.slice(),
      };
    }
    if (content.lesson.milestones) {
      canonical.enrichmentDraft.week.milestones = content.lesson.milestones.slice();
    }
  }
  return canonical;
}

function validateCreatedIds(lessonPlan, activities) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });
  const id = text(lessonPlan?.id, 160);
  pass(/^cur-lp-[a-f0-9]+$/i.test(id), "lesson_id_format", "Lesson ID has cur-lp format.");
  const acts = schema.asArray(activities).filter((a) => a.lessonPlanId === id);
  pass(acts.length > 0, "activities_present", "Activities linked to lesson.");
  acts.forEach((a) => {
    pass(/^cur-act-/i.test(text(a.id, 160)), `act_id_${a.id}`, "Activity ID has cur-act format.");
    pass(text(a.lessonPlanId, 160) === id, `act_link_${a.id}`, "Activity lessonPlanId matches.");
  });
  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed, activityIds: acts.map((a) => a.id) };
}

function qualityReviewNewLesson({ brief, lessonPlan, activities }) {
  const issues = [];
  const acts = schema.asArray(activities).filter((a) => a.lessonPlanId === lessonPlan?.id);
  if (!text(lessonPlan?.weeklyOverview, 40)) issues.push("missing_weekly_overview");
  if (!text(lessonPlan?.objectives, 20)) issues.push("missing_objectives");
  const target = schema.clampInt(brief?.activityTarget, 4, 24, defaultActivityTarget(brief?.ageBand));
  if (brief?.activityTarget && acts.length !== target) {
    issues.push(`activity_count_mismatch:${acts.length}!=${target}`);
  }
  if (acts.length < 4) issues.push("too_few_activities");
  const titles = acts.map((a) => text(a.title, 120).toLowerCase());
  if (new Set(titles).size < titles.length) issues.push("duplicate_activity_titles");
  for (let i = 0; i < titles.length; i += 1) {
    for (let j = i + 1; j < titles.length; j += 1) {
      if (similarityScore(titles[i], titles[j]) >= 0.75) {
        issues.push(`similar_titles:${titles[i]}~${titles[j]}`);
      }
    }
  }
  const days = new Set(acts.map((a) => text(a.dayOfWeek, 20).toLowerCase()).filter(Boolean));
  if (days.size < 4) issues.push("weak_weekday_coverage");
  const ageBand = brief?.ageBand;
  if (ageBand === "infant" && acts.some((a) => /worksheet|cut out|tiny bead/i.test(`${a.title} ${a.steps}`))) {
    issues.push("infant_inappropriate");
  }
  const generic = acts.filter((a) => /children will learn about|set out materials|what do you see|let children explore/i.test(`${a.objective} ${a.steps}`));
  if (generic.length > 0) issues.push("generic_filler");
  const domains = new Set(acts.map((a) => text(a.activityCategory || a.category, 80).toLowerCase()).filter(Boolean));
  if (acts.length >= 8 && domains.size < 4) issues.push("weak_domain_variety");
  return {
    ok: issues.length === 0,
    issues,
  };
}

function buildOperatorCreateAiFixtureResponse(userPrompt) {
  // Delegate to Phase 7.5 architect fixture (lazy require avoids circular load).
  const architect = require("./curriculum-operator-create-architect.js");
  return architect.buildOperatorCreateArchitectFixtureResponse(userPrompt);
}

function isCreateLessonCommand(rawCommand) {
  const raw = String(rawCommand || "");
  if (printableAgeBand.isPrintableExistingLessonCommand(raw)) return false;
  return intentRouter.detectNewLessonIntent(raw, {
    existingLessonIntent: intentRouter.detectExistingLessonReferences(raw).existingLessonIntent,
  });
}

module.exports = {
  WEEKDAYS,
  DEFAULT_ACTIVITY_TARGETS,
  parseCreationBrief,
  creationIdempotencyKey,
  findCreationDuplicates,
  similarityScore,
  weekdayProgression,
  buildBaseLessonContent,
  buildDeterministicFixtureContent,
  buildLessonPlanPayload,
  validateCreatedIds,
  qualityReviewNewLesson,
  buildOperatorCreateAiFixtureResponse,
  isCreateLessonCommand,
  isPrintableExistingLessonCommand: printableAgeBand.isPrintableExistingLessonCommand,
  ageLabel,
  defaultActivityTarget,
};
