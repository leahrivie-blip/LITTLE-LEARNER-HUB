/**
 * Contradiction + empty-field scan for Teaching Kit proof lessons.
 * Fails when title/objective/description/steps/teacherRole/goals/observations disagree.
 */
"use strict";

function text(v) {
  return String(v == null ? "" : v).trim();
}

function asList(v) {
  if (Array.isArray(v)) return v.map(text).filter(Boolean);
  return text(v).split(/\n+/).map(text).filter(Boolean);
}

const GENERIC_ADAPT =
  /provide visual steps, partner support, or a simplified materials set|extend with an open-ended challenge/i;
const GENERIC_SAFETY =
  /^supervise tools and materials, review allergy-safe consumables/i;
const GENERIC_DAY =
  /introduce the theme through literacy|extend the theme with|explore the theme|review, celebrate/i;

const FAMILY_SIZE_COMPARE =
  /family size|compare results|compare quantities|reports family size|data collection|counting families|ranked columns|who has more (people|family)/i;

const BODY_HEIGHT_COMPARE =
  /stands still for measuring|height chart|measure (my |the )?height|body outline|tracing (body|outline)|label(?:s|ing)? body parts|supervise tracing/i;

function activityCorpus(act) {
  return [
    act.title,
    act.objective,
    act.description,
    act.setup,
    act.steps,
    act.teacherRole,
    act.teacherLanguage,
    act.observationOpportunities,
    act.vocabulary,
    act.extensions,
    act.adaptations,
    act.differentiation,
    act.supportAdaptations,
    act.additionalChallenge,
    act.mixedAgeAdaptations,
    act.safetyNotes,
    ...(asList(act.learningGoals)),
    ...(asList(act.learningDomains)),
  ].map(text).join("\n");
}

function withoutNegations(value) {
  return text(value)
    // Drop short negation / redirect clauses so corrective language is not flagged as the bad practice.
    .replace(/\b(without|never|no|not|don'?t|do not|interrupt any|redirect any|avoid|skip|stop|pause|keep .+ out of)\b[^.!\n]{0,120}/gi, " ")
    .replace(/\b(circles are not|not compared|not ranked|instead of shared ranked columns)\b[^.!\n]{0,80}/gi, " ")
    .replace(/‘who has more’|‘who has more’|"who has more"/gi, " ");
}

function scanActivity(act, { weekday } = {}) {
  const issues = [];
  const title = text(act.title);
  const corpus = activityCorpus(act);
  const affirmative = withoutNegations(corpus);
  const empty = [];

  const required = [
    ["objective", act.objective],
    ["description", act.description],
    ["setup", act.setup],
    ["steps", act.steps],
    ["teacherRole", act.teacherRole],
    ["teacherLanguage", act.teacherLanguage],
    ["observationOpportunities", act.observationOpportunities],
    ["vocabulary", act.vocabulary],
    ["extensions", act.extensions],
    ["adaptations", act.adaptations],
  ];
  for (const [name, val] of required) {
    if (!text(val) || text(val).split(/\s+/).length < 4) empty.push(name);
  }
  if (!asList(act.learningDomains).length) empty.push("learningDomains");
  if (!asList(act.learningGoals).length) empty.push("learningGoals");

  if (GENERIC_ADAPT.test(text(act.adaptations))) {
    issues.push({ code: "generic_adaptations", message: `${title}: adaptations are boilerplate` });
  }
  if (GENERIC_SAFETY.test(text(act.safetyNotes))) {
    issues.push({ code: "generic_safety", message: `${title}: safetyNotes are generic filler` });
  }
  if (/replaces |process collage replacing|meta stub/i.test(text(act.description))) {
    issues.push({ code: "meta_description", message: `${title}: description is a rewrite stub, not teachable copy` });
  }

  // Inclusive redesign contradictions — only affirmative leftover instructions fail.
  if (/people in my circle/i.test(title) && FAMILY_SIZE_COMPARE.test(affirmative)) {
    issues.push({
      code: "contradiction_family_size",
      message: `${title}: inclusive circle activity still contains family-size/compare language`,
    });
  }
  if (/build\s*&\s*measure my tower|build and measure my tower/i.test(title) && BODY_HEIGHT_COMPARE.test(affirmative)) {
    issues.push({
      code: "contradiction_height",
      message: `${title}: tower measuring activity still contains child-height language`,
    });
  }
  if (/friendship scarf path/i.test(title) && BODY_HEIGHT_COMPARE.test(affirmative)) {
    issues.push({
      code: "contradiction_body_outline",
      message: `${title}: scarf path still contains body-outline/tracing language`,
    });
  }

  // Five senses vs look-only
  if (/apple investigation/i.test(title)) {
    if (/five senses/i.test(corpus) && !/taste/i.test(text(act.steps))) {
      issues.push({
        code: "contradiction_senses",
        message: `${title}: objective mentions five senses but steps omit taste (or should say look/touch/smell)`,
      });
    }
  }

  // Title vs teacherRole mismatch — affirmative tracing instruction only
  const roleAffirm = withoutNegations(act.teacherRole);
  if (/scarf path/i.test(title) && /\b(supervise tracing|trace (the )?body|label(?:s|ing)? body parts)\b/i.test(roleAffirm)) {
    issues.push({ code: "contradiction_teacher_role", message: `${title}: teacherRole disagrees with title` });
  }
  if (/people in my circle/i.test(title) && /compare results/i.test(roleAffirm)) {
    issues.push({ code: "contradiction_teacher_role", message: `${title}: teacherRole asks to compare results` });
  }

  return {
    title,
    weekday: weekday || "",
    emptyFields: empty,
    emptyCount: empty.length,
    contradictions: issues.filter((i) => i.code.startsWith("contradiction") || i.code === "meta_description"),
    qualityIssues: issues,
  };
}

function scanDay(dayKey, dayPlan) {
  const issues = [];
  const theme = text(dayPlan?.theme);
  const materials = text(dayPlan?.materials || dayPlan?.dailyMaterials);
  const outdoor = text(dayPlan?.outdoorPlay);
  const observations = text(dayPlan?.observations);
  const circle = text(dayPlan?.circleTime);

  if (GENERIC_DAY.test(theme) || GENERIC_DAY.test(circle)) {
    issues.push({ code: "generic_day_theme", message: `${dayKey}: generic theme/circle wording` });
  }
  if (/family size labels/i.test(materials)) {
    issues.push({ code: "stale_day_materials", message: `${dayKey}: materials still list family size labels` });
  }
  if (/height chart|body outline/i.test(materials)) {
    issues.push({ code: "stale_day_materials", message: `${dayKey}: materials still list height chart / body outline` });
  }
  if (/family graph|height and measure me|body outline tracing/i.test(outdoor + observations)) {
    issues.push({ code: "stale_day_copy", message: `${dayKey}: outdoor/observations still name replaced activities` });
  }
  if (FAMILY_SIZE_COMPARE.test(observations)) {
    issues.push({ code: "contradiction_day_obs", message: `${dayKey}: observations still compare family size` });
  }
  return issues;
}

function scanPlan(plan) {
  const activityResults = [];
  const dayIssues = [];
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  for (const day of days) {
    const dp = plan?.dailyPlans?.[day] || {};
    dayIssues.push(...scanDay(day, dp));
    for (const act of dp.items || []) {
      activityResults.push(scanActivity(act, { weekday: day }));
    }
  }
  const contradictions = [
    ...dayIssues.filter((i) => /contradiction|stale|generic_day/i.test(i.code)),
    ...activityResults.flatMap((r) => r.contradictions),
  ];
  const emptyFieldCount = activityResults.reduce((n, r) => n + r.emptyCount, 0);
  const qualityIssues = [
    ...dayIssues,
    ...activityResults.flatMap((r) => r.qualityIssues),
  ];
  return {
    activityResults,
    dayIssues,
    contradictions,
    contradictionCount: contradictions.length,
    emptyFieldCount,
    qualityIssues,
    fail: contradictions.length > 0,
  };
}

module.exports = {
  scanActivity,
  scanDay,
  scanPlan,
  FAMILY_SIZE_COMPARE,
  BODY_HEIGHT_COMPARE,
  GENERIC_ADAPT,
};
