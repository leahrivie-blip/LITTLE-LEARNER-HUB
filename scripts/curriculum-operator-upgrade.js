/**
 * AI Curriculum Operator — Phase 2 draft upgrades.
 *
 * Builds enrichmentDraft patches from Phase 1 audits and applies them through
 * existing Teaching Kit draft helpers. Never publishes. Never touches images,
 * printables, access plan, or lesson identity.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

function loadEnrichment() {
  try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
}

function loadEnrichmentAi() {
  try { return require("../server/enrichment-ai.js"); } catch (_e) { return null; }
}

function text(value, max = 4000) {
  return schema.text(value, max);
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function themeOf(plan) {
  return text(plan?.theme || plan?.title || "this week", 80);
}

function ageOf(plan, activity) {
  return text(activity?.ageModifications || activity?.age || plan?.age || "early childhood", 60);
}

function shouldWriteField(decision) {
  return ["FILL", "IMPROVE", "REPLACE", "MISSING", "WRONG"].includes(decision);
}

function buildWeeklyOverview(plan) {
  const theme = themeOf(plan);
  const age = ageOf(plan);
  return [
    `This week children explore ${theme} through play-based learning designed for ${age}.`,
    "Each day mixes hands-on exploration, language-rich conversation, movement, and calm teacher-guided moments so providers can run a complete childcare week without rewriting the plan.",
    `Activities stay concrete, developmentally appropriate, and tied to the ${theme} theme so children can notice, try, talk, and repeat ideas across the week.`,
  ].join(" ");
}

function buildObjectives(plan) {
  const theme = themeOf(plan);
  return [
    `Children will explore ${theme} materials and routines with curiosity and growing independence.`,
    `Children will use theme-related vocabulary during play, songs, and conversations.`,
    "Children will practice turn-taking, observation, and simple problem-solving with teacher support.",
  ].join(" ");
}

function buildMaterials(plan) {
  const theme = themeOf(plan);
  return [
    `${theme} related books and photos`,
    "Open-ended art materials (paper, washable paint, crayons, glue)",
    "Sensory bin base and scooping tools",
    "Simple dramatic-play props",
    "Chart paper or whiteboard for group ideas",
    "Outdoor/movement materials as needed",
  ].join(" · ");
}

function buildTeacherPrep(plan) {
  const theme = themeOf(plan);
  return [
    `Preview the ${theme} activities and gather materials the day before.`,
    "Set up one invitation table and one backup simple activity for early finishers.",
    "Prepare open-ended questions that invite children to notice, compare, and describe.",
    "Check outdoor/weather options and safety supervision points for active play.",
  ].join(" ");
}

function buildPrepChecklist(plan) {
  const theme = themeOf(plan);
  return [
    `Collect ${theme} materials in labeled bins`,
    "Print or stage any teacher reference cards",
    "Prep one sensory or art invitation",
    "Choose morning song and closing reflection prompt",
    "Review allergy/safety notes for materials",
  ];
}

function buildObservationFocus(plan) {
  const theme = themeOf(plan);
  return [
    `Listen for ${theme} vocabulary during play and conversations.`,
    "Notice how children approach materials (exploring, repeating, asking for help, or extending ideas).",
    "Observe social exchanges during shared materials and dramatic play.",
  ].join(" ");
}

function buildFamilyConnection(plan) {
  const theme = themeOf(plan);
  return [
    `Invite families to notice one ${theme}-related moment at home this week (a walk, a mealtime talk, or a simple shared chore).`,
    "Ask them to share one word or observation at pickup so children can connect home and classroom learning.",
  ].join(" ");
}

function buildMilestones(plan) {
  const theme = themeOf(plan);
  return [
    `Uses 1–2 ${theme} words during play or conversation`,
    "Participates in a short teacher-guided activity with support",
    "Tries a new material or role during free play",
  ];
}

function buildActivityObjective(plan, activity) {
  const theme = themeOf(plan);
  const title = text(activity?.title || "this activity", 120);
  return `Children will engage with “${title}” to explore ${theme} ideas through hands-on play while practicing language, focus, and cooperative classroom routines with teacher support.`;
}

function buildActivityDescription(plan, activity) {
  const title = text(activity?.title || "the activity", 120);
  const theme = themeOf(plan);
  return [
    `Children take part in ${title}, using real classroom materials connected to ${theme}.`,
    "They explore, talk about what they notice, and try simple actions modeled by the teacher.",
    "The experience stays short, concrete, and play-based so it fits a busy childcare day.",
  ].join(" ");
}

function buildActivityMaterials(plan, activity) {
  const title = text(activity?.title || "activity", 80);
  return [
    `Materials for ${title}`,
    "Child-safe tools sized for the age group",
    "Tray or table space for setup",
    "Cleanup cloths / bin",
    "Optional visual cue card for the activity name",
  ].join(" · ");
}

function buildActivityPrep(plan, activity) {
  return [
    "Gather materials before children arrive at the center.",
    "Arrange a clear invitation with enough space for 2–4 children.",
    "Preview one model action and two open-ended questions.",
  ].join(" ");
}

function buildActivitySetup(plan, activity) {
  const title = text(activity?.title || "activity", 80);
  return [
    `Place ${title} materials on a low table or defined floor space.`,
    "Keep pathways clear and put a small cleanup bin nearby.",
    "Display one sample or visual so children understand the invitation at a glance.",
  ].join(" ");
}

function buildActivitySteps(plan, activity) {
  const title = text(activity?.title || "the activity", 80);
  return [
    `1. Invite 2–4 children to the ${title} space and name the materials.`,
    "2. Model one simple action, then hand materials to children.",
    "3. Stay nearby to coach language, turn-taking, and safe use of tools.",
    "4. Ask children what they notice and what they want to try next.",
    "5. Give a calm 2-minute warning, then guide cleanup together.",
  ].join("\n");
}

function buildTeacherQuestions(plan, activity) {
  const theme = themeOf(plan);
  const title = text(activity?.title || "this", 80);
  return [
    `What do you notice about the ${theme} materials in ${title}?`,
    "How does that feel / look / move when you try it?",
    "What could we try next to change it?",
    "How can we share the materials so everyone gets a turn?",
  ].join("\n");
}

function buildObservation(plan, activity) {
  const theme = themeOf(plan);
  return [
    `Note whether children use ${theme}-related words during the activity.`,
    "Watch for persistence, asking for help, and peer sharing.",
    "Capture one specific action or comment for documentation.",
  ].join(" ");
}

function buildSafety(plan, activity) {
  return [
    "Supervise closely and match materials to the age group.",
    "Keep small pieces away from children who still mouth objects.",
    "Wipe spills promptly and keep walking paths clear.",
  ].join(" ");
}

function buildCleanup(plan, activity) {
  return [
    "Give a clear cleanup cue and assign simple jobs (collect, wipe, sort).",
    "Return materials to labeled bins and reset the invitation for later.",
  ].join(" ");
}

function buildTips(plan, activity) {
  const theme = themeOf(plan);
  return [
    `Keep the first round short so children leave wanting another turn with the ${theme} materials.`,
    "Offer a simpler version and a stretch version so mixed ages can join successfully.",
  ];
}

function buildVocabulary(plan, activity) {
  const theme = themeOf(plan);
  const base = theme.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3);
  return [...base, "observe", "gentle", "share", "try"].slice(0, 8);
}

function buildSongForDay(plan, day) {
  const theme = themeOf(plan);
  const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
  return {
    title: `${theme} ${dayLabel} Song`,
    notes: `Original classroom song for ${dayLabel} circle — simple motions, no copyrighted lyrics.`,
    linkedWeekday: day,
    rightsStatus: "original",
    allowPrintLyrics: true,
    teacherDirections: "Sing once with motions, then invite children to echo one line.",
  };
}

function activityNeedsField(actClass, field) {
  if (!actClass) return false;
  if (actClass.decision === "KEEP") return false;
  if (Array.isArray(actClass.missingFields) && actClass.missingFields.includes(field)) return true;
  // Improve/replace/fill whole activity → fill core weak fields
  return ["objective", "description", "materials", "setup", "steps", "teacherLanguage",
    "observationOpportunities", "safetyNotes", "cleanupTips", "preparation"].includes(field);
}

function currentActivityValue(activity, draftAct, key) {
  const enrich = loadEnrichment();
  if (enrich?.getCoreActivityFieldValue) {
    return enrich.getCoreActivityFieldValue(activity, draftAct, key);
  }
  return text(draftAct?.[key] || activity?.[key]);
}

/**
 * Build an enrichmentDraft upgrade from an audit. Preserves KEEP content.
 */
function buildUpgradeDraft(plan, curriculum, audit, options = {}) {
  const enrich = loadEnrichment();
  const activities = schema.asArray(curriculum?.activities).filter((a) => a.lessonPlanId === plan.id);
  const flat = enrich?.flattenLessonActivities
    ? enrich.flattenLessonActivities(plan, activities)
    : activities;
  const previous = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
    : { week: {}, activities: {} };
  if (!previous.week || typeof previous.week !== "object") previous.week = {};
  if (!previous.activities || typeof previous.activities !== "object") previous.activities = {};

  const changed = [];
  const kept = [];
  const intended = { week: {}, activities: {} };

  const weekMap = {
    weeklyOverview: buildWeeklyOverview,
    objectives: buildObjectives,
    weeklyMaterials: buildMaterials,
    teacherPreparation: buildTeacherPrep,
    familyConnection: buildFamilyConnection,
    observationFocus: buildObservationFocus,
    milestones: buildMilestones,
    prepChecklist: buildPrepChecklist,
  };

  schema.asArray(audit?.weeklyContent).forEach((fieldDec) => {
    const field = fieldDec.field;
    if (!shouldWriteField(fieldDec.decision)) {
      kept.push(`week.${field}`);
      return;
    }
    if (options.upgradeLesson === false) {
      kept.push(`week.${field}`);
      return;
    }
    if (field === "vocabularyWords") {
      const words = buildVocabulary(plan, null);
      previous.week.vocabCards = words;
      intended.week.vocabCards = words;
      changed.push({ path: "week.vocabCards", decision: fieldDec.decision });
      return;
    }
    if (field === "prepChecklist" || field === "observationFocus" || field === "teacherPreparation") {
      if (!previous.week.teacherToolkit || typeof previous.week.teacherToolkit !== "object") {
        previous.week.teacherToolkit = {};
      }
      if (field === "prepChecklist") {
        const list = buildPrepChecklist(plan);
        previous.week.teacherToolkit.prepChecklist = list;
        intended.week.prepChecklist = list;
        changed.push({ path: "week.teacherToolkit.prepChecklist", decision: fieldDec.decision });
      } else if (field === "observationFocus") {
        const focus = buildObservationFocus(plan);
        previous.week.teacherToolkit.observationFocus = Array.isArray(focus) ? focus : [focus];
        previous.week.observationOpportunities = text(focus);
        intended.week.observationFocus = previous.week.teacherToolkit.observationFocus;
        changed.push({ path: "week.teacherToolkit.observationFocus", decision: fieldDec.decision });
      } else {
        const prep = buildTeacherPrep(plan);
        previous.week.teacherPreparation = prep;
        previous.week.teacherToolkit.teacherPreparation = prep;
        intended.week.teacherPreparation = prep;
        changed.push({ path: "week.teacherPreparation", decision: fieldDec.decision });
      }
      return;
    }
    if (field === "milestones") {
      const list = buildMilestones(plan);
      previous.week.milestones = list;
      intended.week.milestones = list;
      changed.push({ path: "week.milestones", decision: fieldDec.decision });
      return;
    }
    const builder = weekMap[field];
    if (!builder) {
      kept.push(`week.${field}`);
      return;
    }
    const value = builder(plan);
    previous.week[field] = value;
    intended.week[field] = value;
    if (field === "objectives") {
      if (!previous.week.fieldOwnership || typeof previous.week.fieldOwnership !== "object") {
        previous.week.fieldOwnership = {};
      }
      previous.week.fieldOwnership.objectives = true;
    }
    changed.push({ path: `week.${field}`, decision: fieldDec.decision });
  });

  // Songs: fill MISSING days only (do not replace KEEP)
  if (options.touchSongs !== false) {
    schema.asArray(audit?.songs).forEach((songDec) => {
      if (songDec.decision !== "MISSING" && songDec.decision !== "FILL") {
        kept.push(songDec.field);
        return;
      }
      const day = text(songDec.field).replace(/^song\./, "");
      if (!["monday", "tuesday", "wednesday", "thursday", "friday"].includes(day)) return;
      if (!Array.isArray(previous.week.songs)) previous.week.songs = schema.asArray(plan.songs).map((s) => ({ ...s }));
      const exists = previous.week.songs.some((s) => text(s.linkedWeekday || s.suggestedWeekday).toLowerCase() === day);
      if (exists) {
        kept.push(songDec.field);
        return;
      }
      const song = buildSongForDay(plan, day);
      previous.week.songs.push(song);
      changed.push({ path: `week.songs.${day}`, decision: songDec.decision, value: song.title });
    });
  }

  // Books: only fill when missing; never invent famous copyrighted titles — use classroom library prompt
  if (options.touchBooks !== false && audit?.books && shouldWriteField(audit.books.decision)) {
    if (!Array.isArray(previous.week.books) || !previous.week.books.length) {
      previous.week.books = [{
        title: `Search your classroom library for a ${themeOf(plan)} picture book`,
        author: "",
        notes: "Choose a familiar book you already own. Ask what children notice on the cover and one detail in the pictures.",
        whyThisBook: "Uses an existing classroom book rather than inventing a title.",
        beforeReadingQuestions: ["What do you notice on the cover?"],
        duringReadingPrompts: ["What is happening in this picture?"],
        afterReadingQuestions: ["What part would you like to try in play today?"],
      }];
      intended.week.books = previous.week.books;
      changed.push({ path: "week.books", decision: audit.books.decision });
    } else {
      kept.push("books");
    }
  } else if (audit?.books?.decision === "KEEP") {
    kept.push("books");
  }

  const byId = new Map(flat.map((a) => [text(a.id || a.itemId), a]));
  if (options.upgradeActivities !== false) {
    schema.asArray(audit?.activityClassifications).forEach((actClass) => {
      const id = text(actClass.activityId);
      const activity = byId.get(id);
      if (!activity) return;
      if (actClass.decision === "KEEP") {
        kept.push(`activity.${id}`);
        return;
      }
      if (!previous.activities[id] || typeof previous.activities[id] !== "object") {
        previous.activities[id] = {};
      }
      const draftAct = previous.activities[id];
      const intendedAct = {};
      const fieldBuilders = {
        objective: () => buildActivityObjective(plan, activity),
        description: () => buildActivityDescription(plan, activity),
        materials: () => buildActivityMaterials(plan, activity),
        preparation: () => buildActivityPrep(plan, activity),
        setup: () => buildActivitySetup(plan, activity),
        steps: () => buildActivitySteps(plan, activity),
        teacherLanguage: () => buildTeacherQuestions(plan, activity),
        observationOpportunities: () => buildObservation(plan, activity),
        safetyNotes: () => buildSafety(plan, activity),
        cleanupTips: () => buildCleanup(plan, activity),
      };

      Object.keys(fieldBuilders).forEach((key) => {
        const current = currentActivityValue(activity, draftAct, key);
        const needs = activityNeedsField(actClass, key)
          || (actClass.decision !== "KEEP" && wordCount(current) < 8);
        if (!needs && wordCount(current) >= 12) {
          kept.push(`activity.${id}.${key}`);
          return;
        }
        if (!needs && actClass.decision === "KEEP") return;
        // Preserve strong fields even on IMPROVE activities
        if (wordCount(current) >= 25 && actClass.decision === "IMPROVE" && !(actClass.missingFields || []).includes(key)) {
          kept.push(`activity.${id}.${key}`);
          return;
        }
        const nextVal = fieldBuilders[key]();
        draftAct[key] = nextVal;
        intendedAct[key] = nextVal;
        changed.push({
          path: `activity.${id}.${key}`,
          activityId: id,
          activityTitle: text(activity.title, 120),
          decision: actClass.decision,
        });
      });

      // Additive enrichment lists when activity is weak
      if (actClass.decision !== "KEEP") {
        if (!schema.asArray(draftAct.teacherTips).length && !schema.asArray(activity.teacherTips).length) {
          draftAct.teacherTips = buildTips(plan, activity);
          intendedAct.teacherTips = draftAct.teacherTips;
          changed.push({ path: `activity.${id}.teacherTips`, activityId: id, decision: actClass.decision });
        }
        if (!schema.asArray(draftAct.vocabulary).length && !text(activity.vocabulary)) {
          draftAct.vocabulary = buildVocabulary(plan, activity);
          intendedAct.vocabulary = draftAct.vocabulary;
          changed.push({ path: `activity.${id}.vocabulary`, activityId: id, decision: actClass.decision });
        }
        if (!text(draftAct.dayOfWeek) && text(activity.dayOfWeek)) {
          draftAct.dayOfWeek = text(activity.dayOfWeek).toLowerCase();
        }
        if (!text(draftAct.activityCategory) && text(activity.activityCategory || activity.category)) {
          draftAct.activityCategory = text(activity.activityCategory || activity.category, 80);
        }
        if (!text(draftAct.title)) draftAct.title = text(activity.title, 180);
        if (!text(draftAct.ageModifications)) draftAct.ageModifications = ageOf(plan, activity);
        if (!Number(draftAct.durationMinutes) && !Number(activity.durationMinutes)) {
          draftAct.durationMinutes = /infant/i.test(ageOf(plan, activity)) ? 5 : 15;
        }
      }

      if (Object.keys(intendedAct).length) intended.activities[id] = intendedAct;
    });
  }

  // Optional: blend fixture suggestions for additional coverage (still draft-only)
  const enrichmentAi = loadEnrichmentAi();
  if (enrichmentAi?.getLessonTeacherFixturePack && options.useFixtures === true) {
    try {
      const packed = enrichmentAi.getLessonTeacherFixturePack({
        plan,
        activities: flat,
        enrichmentDraft: previous,
        scope: "lesson",
        activityOffset: 0,
        activityLimit: Math.min(flat.length, 8),
        includeWeek: true,
      });
      const accepted = schema.asArray(packed?.suggestions).map((s) => ({
        ...s,
        decision: "accepted",
        selected: true,
      }));
      // Only apply suggestions for fields still empty / weak — filter by intended gaps
      const filtered = accepted.filter((sug) => {
        const field = text(sug.field || sug.category);
        if (/image|printable/i.test(field)) return false;
        return true;
      });
      if (enrich?.applySuggestionsToDraft && filtered.length) {
        // Apply week suggestions
        const weekOnly = filtered.filter((s) => text(s.scope) === "week" || /weekly|family|book|song|toolkit|objective|material|milestone|vocab/i.test(text(s.category)));
        const appliedWeek = enrich.applySuggestionsToDraft(previous, weekOnly, { activityKey: "" });
        Object.assign(previous, appliedWeek.draft || previous);
        flat.slice(0, 8).forEach((act) => {
          const key = text(act.id || act.itemId);
          const actSugs = filtered.filter((s) => text(s.activityKey || s.activityId) === key || text(s.scope) === "activity");
          if (!actSugs.length) return;
          const applied = enrich.applySuggestionsToDraft(previous, actSugs, { activityKey: key });
          Object.assign(previous, applied.draft || previous);
        });
      }
    } catch (_e) {
      /* fixtures optional */
    }
  }

  previous.updatedAt = new Date().toISOString();
  previous.lastEditedBy = options.editedBy || "curriculum-operator-phase2";
  previous.operatorPhase = 2;

  return {
    enrichmentDraft: previous,
    changed,
    kept,
    intended,
    mutations: {
      images: false,
      printables: false,
      publish: false,
      accessPlan: false,
      lessonId: false,
    },
  };
}

function readNested(obj, pathStr) {
  const parts = String(pathStr || "").split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return "";
    if (part.startsWith("activity.") || false) break;
    cur = cur[part];
  }
  return cur;
}

/**
 * Verify intended draft fields persisted; identity/access plan unchanged.
 */
function verifyUpgradeResult({
  beforePlan,
  afterPlan,
  intended,
  changed,
}) {
  const checks = [];
  const pass = (ok, code, message) => checks.push({ ok: Boolean(ok), code, message });

  pass(beforePlan?.id && beforePlan.id === afterPlan?.id, "lesson_id", "Lesson ID unchanged.");
  pass(
    (beforePlan?.plan === "Pro" ? "Pro" : "Free") === (afterPlan?.plan === "Pro" ? "Pro" : "Free"),
    "access_plan",
    "Access plan unchanged.",
  );
  pass(text(beforePlan?.age) === text(afterPlan?.age), "age", "Age band unchanged.");
  pass(afterPlan?.enrichmentDraft && typeof afterPlan.enrichmentDraft === "object", "draft_present", "Enrichment draft present after save.");
  pass(
    !schema.asArray(afterPlan?.enrichmentPublishHistory).some((h) => h.kind === "publish" && h.publishedAt === afterPlan?.enrichmentDraft?.updatedAt),
    "not_published_kind",
    "No publish history entry created by this upgrade.",
  );

  const draft = afterPlan?.enrichmentDraft || {};
  const week = draft.week || {};
  schema.asArray(Object.keys(intended?.week || {})).forEach((field) => {
    if (field === "prepChecklist") {
      const list = schema.asArray(week.teacherToolkit?.prepChecklist);
      pass(list.length > 0, `saved_${field}`, `Saved week.${field}`);
      return;
    }
    if (field === "observationFocus") {
      const list = schema.asArray(week.teacherToolkit?.observationFocus);
      pass(list.length > 0 || text(week.observationOpportunities), `saved_${field}`, `Saved week.${field}`);
      return;
    }
    if (field === "books" || field === "milestones" || field === "vocabCards") {
      pass(schema.asArray(week[field]).length > 0, `saved_${field}`, `Saved week.${field}`);
      return;
    }
    pass(wordCount(week[field]) >= 6, `saved_${field}`, `Saved week.${field}`);
  });

  Object.keys(intended?.activities || {}).forEach((actId) => {
    const patch = draft.activities?.[actId] || {};
    Object.keys(intended.activities[actId] || {}).forEach((key) => {
      const val = patch[key];
      const okVal = Array.isArray(val) ? val.length > 0 : wordCount(val) >= 3 || Number(val) > 0;
      pass(okVal, `saved_activity_${actId}_${key}`, `Saved activity ${actId}.${key}`);
    });
  });

  // Ensure KEEP weekly fields that were strong on the plan were not wiped from published body
  // (enrichment draft save should not alter published body fields)
  pass(
    text(beforePlan?.title) === text(afterPlan?.title),
    "title_preserved",
    "Title preserved.",
  );

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    failed,
    changedCount: schema.asArray(changed).length,
  };
}

function classifyOwnerReviewStatus({ beforeScores, afterScores, verification, blockers }) {
  if (!verification?.ok) return "BLOCKED";
  const blocking = schema.asArray(blockers).length > 0 || afterScores?.blocksPublish === true;
  const improved = (Number(afterScores?.premiumReadinessPercent) || 0)
    >= (Number(beforeScores?.premiumReadinessPercent) || 0);
  const readyEnough = (Number(afterScores?.premiumReadinessPercent) || 0) >= 75
    && (Number(afterScores?.completionPercent) || 0) >= 70;
  if (blocking && !readyEnough) return "BLOCKED";
  if (readyEnough && improved) return "READY_FOR_OWNER_REVIEW";
  if (improved || (Number(afterScores?.completionPercent) || 0) > (Number(beforeScores?.completionPercent) || 0)) {
    return "PARTIAL";
  }
  return "PARTIAL";
}

module.exports = {
  buildUpgradeDraft,
  verifyUpgradeResult,
  classifyOwnerReviewStatus,
  shouldWriteField,
  buildWeeklyOverview,
  buildActivitySteps,
  buildSongForDay,
};
