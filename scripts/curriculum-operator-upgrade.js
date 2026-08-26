/**
 * AI Curriculum Operator — Phase 2 / 2.5 draft upgrades.
 *
 * Builds enrichmentDraft patches from Phase 1 audits via the structured AI
 * composer (Phase 2.5). Never publishes. Never touches images, printables,
 * access plan, or lesson identity. Deterministic filler is disabled for upgrades.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const composer = require("./curriculum-operator-ai-composer.js");

function loadEnrichment() {
  try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
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

function snapshotKeepFields(plan, flat, audit) {
  const keep = { week: {}, activities: {} };
  const draft = plan?.enrichmentDraft || {};
  const week = draft.week || {};
  schema.asArray(audit?.weeklyContent).forEach((fieldDec) => {
    if (shouldWriteField(fieldDec.decision)) return;
    const field = text(fieldDec.field, 80);
    if (field === "prepChecklist") {
      keep.week.prepChecklist = JSON.stringify(schema.asArray(week.teacherToolkit?.prepChecklist));
      return;
    }
    if (field === "observationFocus") {
      keep.week.observationFocus = JSON.stringify(schema.asArray(week.teacherToolkit?.observationFocus));
      return;
    }
    keep.week[field] = text(week[field] || plan?.[field], 4000);
  });
  const byId = new Map(flat.map((a) => [text(a.id || a.itemId), a]));
  schema.asArray(audit?.activityClassifications).forEach((actClass) => {
    if (actClass.decision !== "KEEP") return;
    const id = text(actClass.activityId, 160);
    const activity = byId.get(id);
    const draftAct = (draft.activities || {})[id] || {};
    keep.activities[id] = {};
    ["objective", "description", "materials", "setup", "steps", "teacherLanguage",
      "observationOpportunities", "safetyNotes", "cleanupTips", "preparation"].forEach((key) => {
      keep.activities[id][key] = currentActivityValue(activity, draftAct, key);
    });
  });
  return keep;
}

/**
 * Build an enrichmentDraft upgrade from an audit via structured AI composer.
 * Preserves KEEP content exactly. Does not fall back to deterministic filler.
 */
async function buildUpgradeDraft(plan, curriculum, audit, options = {}) {
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

  const keepSnapshots = snapshotKeepFields(plan, flat, audit);
  const composed = await composer.composeUpgradeContent({
    plan,
    activities: flat,
    audit,
    callAi: options.callAi,
    upgradeLesson: options.upgradeLesson !== false,
    upgradeActivities: options.upgradeActivities !== false,
    touchSongs: options.touchSongs !== false,
    touchBooks: options.touchBooks !== false,
    command: options.command || null,
    weeklyFieldScope: options.weeklyFieldScope || options.command?.actions?.weeklyFieldScope || null,
  });

  if (!composed.ok) {
    return {
      ok: false,
      aiFailed: true,
      error: composed.error || "AI composer failed",
      code: composed.code || "ai_failed",
      enrichmentDraft: previous,
      changed: [],
      kept: [
        ...schema.asArray(composed.work?.weekKeep).map((k) => `week.${k.field}`),
        ...schema.asArray(composed.work?.activityKeep).map((k) => `activity.${k.activityId}`),
      ],
      intended: { week: {}, activities: {} },
      keepSnapshots,
      usage: composed.usage || { calls: 0, inputChars: 0, outputChars: 0 },
      composerDiagnostics: composed.diagnostics || null,
      mutations: {
        images: false,
        printables: false,
        publish: false,
        accessPlan: false,
        lessonId: false,
      },
    };
  }

  if (composed.skipped || !composed.validatedPlan) {
    const kept = [
      ...schema.asArray(composed.work?.weekKeep).map((k) => `week.${k.field}`),
      ...schema.asArray(composed.work?.activityKeep).map((k) => `activity.${k.activityId}`),
    ];
    return {
      ok: true,
      aiFailed: false,
      enrichmentDraft: previous,
      changed: [],
      kept,
      intended: { week: {}, activities: {} },
      keepSnapshots,
      usage: composed.usage || { calls: 0, inputChars: 0, outputChars: 0 },
      composerDiagnostics: composed.diagnostics || null,
      code: composed.code || null,
      mutations: {
        images: false,
        printables: false,
        publish: false,
        accessPlan: false,
        lessonId: false,
      },
    };
  }

  const applied = composer.applyComposerPlanToDraft(previous, composed.validatedPlan, composed.work);
  applied.enrichmentDraft.updatedAt = new Date().toISOString();
  applied.enrichmentDraft.lastEditedBy = options.editedBy || "curriculum-operator-phase25";
  applied.enrichmentDraft.operatorPhase = 2.5;
  applied.enrichmentDraft.composerSource = "structured-ai";

  return {
    ok: true,
    aiFailed: false,
    enrichmentDraft: applied.enrichmentDraft,
    changed: applied.changed,
    kept: applied.kept,
    intended: applied.intended,
    keepSnapshots,
    usage: composed.usage || { calls: 1, inputChars: 0, outputChars: 0 },
    validatedPlan: composed.validatedPlan,
    composerDiagnostics: composed.diagnostics || null,
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
 * Verify intended draft fields persisted; identity/access plan unchanged; KEEP preserved.
 */
function verifyUpgradeResult({
  beforePlan,
  afterPlan,
  intended,
  changed,
  keepSnapshots,
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
  pass(text(beforePlan?.title) === text(afterPlan?.title), "title_preserved", "Title preserved.");
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

  // KEEP snapshots must remain byte-for-byte in the stored draft overlay / published body
  if (keepSnapshots && typeof keepSnapshots === "object") {
    Object.entries(keepSnapshots.week || {}).forEach(([field, beforeVal]) => {
      let afterVal = "";
      if (field === "prepChecklist") {
        afterVal = JSON.stringify(schema.asArray(week.teacherToolkit?.prepChecklist));
      } else if (field === "observationFocus") {
        afterVal = JSON.stringify(schema.asArray(week.teacherToolkit?.observationFocus));
      } else {
        afterVal = text(week[field] || afterPlan?.[field], 4000);
      }
      // Only enforce when the KEEP value was non-empty before (empty KEEP can stay empty)
      if (text(beforeVal)) {
        pass(afterVal === beforeVal, `keep_week_${field}`, `KEEP week.${field} unchanged`);
      }
    });
    Object.entries(keepSnapshots.activities || {}).forEach(([actId, fields]) => {
      const patch = draft.activities?.[actId] || {};
      Object.entries(fields || {}).forEach(([key, beforeVal]) => {
        if (!text(beforeVal)) return;
        const afterVal = text(patch[key], 4000) || text(beforeVal, 4000);
        // KEEP activity: draft must not overwrite with a different value
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          pass(text(patch[key], 4000) === text(beforeVal, 4000), `keep_activity_${actId}_${key}`, `KEEP activity ${actId}.${key} unchanged`);
        } else {
          pass(true, `keep_activity_${actId}_${key}`, `KEEP activity ${actId}.${key} not overwritten`);
        }
      });
    });
  }

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
  snapshotKeepFields,
  // Legacy deterministic builders retained for comparison fixtures only — not used for upgrades.
  buildWeeklyOverview,
  buildActivitySteps,
  buildSongForDay,
};
