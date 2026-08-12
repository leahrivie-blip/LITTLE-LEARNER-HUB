/**
 * Shared helpers for premium Teaching Kit draft packages.
 * Draft-only: never publishes enrichment or lesson status.
 */
"use strict";

const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function lines(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinLines(value) {
  return lines(value).join("\n");
}

function numberedSteps(steps) {
  const list = lines(steps);
  return list
    .map((step, index) => {
      if (/^\d+\./.test(step)) return step;
      return `${index + 1}. ${step}`;
    })
    .join("\n");
}

/**
 * @typedef {object} PremiumActivity
 * @property {string} title
 * @property {string} dayOfWeek
 * @property {string} activityCategory
 * @property {string} ageModifications
 * @property {number|string} durationMinutes
 * @property {string} objective
 * @property {string} description
 * @property {string|string[]} materials
 * @property {string|string[]} preparation
 * @property {string} setup
 * @property {string|string[]} steps
 * @property {string} [teacherLanguage]
 * @property {string|string[]} [observationOpportunities]
 * @property {string} [safetyNotes]
 * @property {string} [cleanupTips]
 * @property {string|string[]} [teacherTips]
 * @property {string|string[]} [substitutions]
 * @property {string|string[]} [vocabulary]
 * @property {string} [extensions]
 * @property {string} [adaptations]
 * @property {"not_needed"|"setup_only"|"example_only"|"required"|"optional"} imageRequirement
 * @property {string} [imageBriefSetup]
 * @property {string} [imageBriefExample]
 * @property {string} [setupImageUrl]
 * @property {string} [exampleImageUrl]
 * @property {string} [decision] keep|improve|replace|add
 * @property {string} [replaces]
 * @property {string} [replaceReason]
 * @property {string} [legacyTitle]
 */

function normalizeActivity(raw, dayOfWeek, index, planId) {
  const day = text(dayOfWeek).toLowerCase();
  const title = text(raw.title);
  const itemId = text(raw.itemId) || `item-${planId.replace(/^cur-lp-/, "")}-${day}-${index + 1}`;
  const sourceKey = `${planId}:${itemId}`;
  const imageRequirement = text(raw.imageRequirement) || "not_needed";
  return {
    itemId,
    sourceKey,
    activityId: sourceKey,
    dayOfWeek: day,
    activityCategory: text(raw.activityCategory),
    title,
    objective: text(raw.objective),
    description: text(raw.description),
    materials: joinLines(raw.materials),
    preparation: joinLines(raw.preparation),
    setup: text(raw.setup),
    steps: numberedSteps(raw.steps),
    teacherLanguage: text(raw.teacherLanguage),
    observationOpportunities: joinLines(raw.observationOpportunities),
    safetyNotes: text(raw.safetyNotes),
    cleanupTips: text(raw.cleanupTips),
    ageModifications: text(raw.ageModifications),
    durationMinutes: raw.durationMinutes == null || raw.durationMinutes === ""
      ? ""
      : Number(raw.durationMinutes) || text(raw.durationMinutes),
    teacherTips: lines(raw.teacherTips),
    substitutions: lines(raw.substitutions).map((need) => {
      if (typeof need === "object" && need) return need;
      const parts = String(need).split("→").map((p) => p.trim());
      if (parts.length === 2) return { need: parts[0], use: parts[1] };
      return { need: "substitute", use: String(need) };
    }),
    vocabulary: lines(raw.vocabulary),
    extensions: text(raw.extensions),
    adaptations: text(raw.adaptations),
    imageRequirement,
    imageBriefSetup: text(raw.imageBriefSetup),
    imageBriefExample: text(raw.imageBriefExample),
    setupImageUrl: text(raw.setupImageUrl),
    exampleImageUrl: text(raw.exampleImageUrl),
    settingTags: lines(raw.settingTags),
    decision: text(raw.decision) || "improve",
    replaces: text(raw.replaces),
    replaceReason: text(raw.replaceReason),
    legacyTitle: text(raw.legacyTitle) || title,
    learningGoals: lines(raw.learningGoals),
  };
}

function buildProposedDailyPlans(planMeta, activitiesByDay) {
  const dailyPlans = {};
  WEEKDAYS.forEach((day) => {
    const dayMeta = planMeta.days?.[day] || {};
    const acts = (activitiesByDay[day] || []).map((act, index) =>
      normalizeActivity(act, day, index, planMeta.id));
    dailyPlans[day] = {
      theme: text(dayMeta.theme),
      focus: text(dayMeta.focus),
      objectives: joinLines(dayMeta.objectives),
      learningDomains: lines(dayMeta.learningDomains || planMeta.learningDomains),
      materials: joinLines(dayMeta.materials || planMeta.weeklyMaterials),
      vocabulary: joinLines(dayMeta.vocabulary || planMeta.vocabularyWords),
      books: Array.isArray(dayMeta.books) ? dayMeta.books : [],
      songs: Array.isArray(dayMeta.songs) ? dayMeta.songs : [],
      circleTime: lines(dayMeta.circleTime),
      outdoorPlay: text(dayMeta.outdoorPlay),
      observations: lines(dayMeta.observations),
      adaptations: text(dayMeta.adaptations || planMeta.adaptations),
      safetyNotes: text(dayMeta.safetyNotes || planMeta.safetyNotes),
      items: acts.map((act) => ({
        itemId: act.itemId,
        importKey: "",
        activityCategory: act.activityCategory,
        title: act.title,
        objective: act.objective,
        description: act.description,
        materials: act.materials,
        preparation: act.preparation,
        setup: act.setup,
        steps: act.steps,
        teacherLanguage: act.teacherLanguage,
        observationOpportunities: act.observationOpportunities,
        safetyNotes: act.safetyNotes,
        cleanupTips: act.cleanupTips,
        ageModifications: act.ageModifications,
        durationMinutes: act.durationMinutes,
        vocabulary: act.vocabulary.join("\n"),
        extensions: act.extensions,
        adaptations: act.adaptations,
        teacherTips: act.teacherTips,
        substitutions: act.substitutions,
        settingTags: act.settingTags,
        imageRequirement: act.imageRequirement,
        imageBriefSetup: act.imageBriefSetup,
        imageBriefExample: act.imageBriefExample,
        setupImageUrl: act.setupImageUrl,
        exampleImageUrl: act.exampleImageUrl,
        learningGoals: act.learningGoals,
        sourceKey: act.sourceKey,
        dayOfWeek: act.dayOfWeek,
      })),
    };
  });
  return dailyPlans;
}

function buildEnrichmentDraft(planMeta, activitiesByDay, extras = {}) {
  const proposedDailyPlans = buildProposedDailyPlans(planMeta, activitiesByDay);
  const activities = {};
  const activityDecisions = [];
  const removedActivityTitles = lines(extras.removedActivityTitles);
  const flat = [];

  WEEKDAYS.forEach((day) => {
    (proposedDailyPlans[day].items || []).forEach((item, index) => {
      const key = item.sourceKey || `${planMeta.id}:${item.itemId}`;
      flat.push({ ...item, dayOfWeek: day, _index: index, key });
      activities[key] = {
        title: item.title,
        dayOfWeek: day,
        activityCategory: item.activityCategory,
        ageModifications: item.ageModifications,
        durationMinutes: item.durationMinutes,
        objective: item.objective,
        description: item.description,
        materials: item.materials,
        preparation: item.preparation,
        setup: item.setup,
        steps: item.steps,
        teacherLanguage: item.teacherLanguage,
        observationOpportunities: item.observationOpportunities,
        safetyNotes: item.safetyNotes,
        cleanupTips: item.cleanupTips,
        teacherTips: item.teacherTips,
        substitutions: item.substitutions,
        observationPrompts: lines(item.observationOpportunities).slice(0, 2),
        vocabulary: lines(item.vocabulary),
        extensions: item.extensions,
        adaptations: item.adaptations,
        settingTags: item.settingTags,
        imageRequirement: item.imageRequirement || "not_needed",
        imageBriefSetup: item.imageBriefSetup || "",
        imageBriefExample: item.imageBriefExample || "",
        setupImageUrl: item.setupImageUrl || "",
        exampleImageUrl: item.exampleImageUrl || "",
      };
      const raw = (activitiesByDay[day] || [])[index] || {};
      activityDecisions.push({
        title: item.title,
        itemId: item.itemId,
        decision: text(raw.decision) || "improve",
        note: text(raw.replaceReason) || text(raw.decisionNote) || "",
        replaces: text(raw.replaces),
      });
    });
  });

  removedActivityTitles.forEach((title) => {
    activityDecisions.push({
      title,
      decision: "remove",
      note: "Removed during premium draft upgrade — age-inappropriate, redundant, or teacher-product craft.",
    });
  });

  return {
    updatedAt: new Date().toISOString(),
    lastEditedBy: "premium-draft-upgrade@littlelearnershub.local",
    previewReady: true,
    draftOnly: true,
    neverAutoPublish: true,
    activities,
    week: {
      weeklyOverview: text(planMeta.weeklyOverview),
      objectives: joinLines(planMeta.objectives),
      weeklyMaterials: joinLines(planMeta.weeklyMaterials),
      familyConnection: text(planMeta.familyConnection),
      adaptations: text(planMeta.adaptations),
      vocabularyWords: joinLines(planMeta.vocabularyWords),
      teacherPreparation: joinLines(planMeta.teacherPreparation),
      fieldOwnership: {
        objectives: true,
        weeklyOverview: true,
        weeklyMaterials: true,
        familyConnection: true,
      },
      proposedDailyPlans,
      activityDecisions,
      removedActivityTitles,
      removedItemIds: lines(extras.removedItemIds),
      books: Array.isArray(planMeta.books) ? planMeta.books : [],
      songs: Array.isArray(planMeta.songs) ? planMeta.songs : [],
      teacherToolkit: planMeta.teacherToolkit || {},
      printableIdeas: Array.isArray(planMeta.printableIdeas) ? planMeta.printableIdeas : [],
      printableIds: Array.isArray(extras.printableIds) ? extras.printableIds : [],
      vocabCards: Array.isArray(planMeta.vocabCards) ? planMeta.vocabCards : lines(planMeta.vocabularyWords).slice(0, 12),
      milestones: Array.isArray(planMeta.milestones) ? planMeta.milestones : [],
      auditNotes: planMeta.auditNotes || {},
      researchSources: Array.isArray(planMeta.researchSources) ? planMeta.researchSources : [],
    },
    meta: {
      purpose: "Premium Teaching Kit draft for owner Admin review — DO NOT PUBLISH automatically",
      sourceLessonId: planMeta.id,
      sourceTitle: planMeta.title,
      activityCount: flat.length,
      imagePolicy: "Assign images only when instructional value is clear",
    },
  };
}

function escapeImportValue(value) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
}

function writeBlock(label, value) {
  const body = escapeImportValue(value);
  if (!body) return `${label}:\n`;
  return `${label}:\n${body}\n`;
}

function activityToImportText(act) {
  const parts = [
    writeBlock("ACTIVITY_NAME", act.title),
    writeBlock("CATEGORY", act.activityCategory),
    writeBlock("OBJECTIVE", act.objective),
    writeBlock("DESCRIPTION", act.description),
    writeBlock("MATERIALS", act.materials),
    writeBlock("SETUP", act.setup || act.preparation),
    writeBlock("TEACHER_ROLE", lines(act.teacherTips)[0] || "Stay responsive and narrate gently."),
    writeBlock("TEACHER_LANGUAGE", act.teacherLanguage),
    writeBlock("DIRECTIONS", act.steps),
    writeBlock("LEARNING_GOALS", joinLines(act.learningGoals)),
    writeBlock("OBSERVATION_OPPORTUNITIES", act.observationOpportunities),
    writeBlock("VOCABULARY", joinLines(act.vocabulary)),
    writeBlock("EXTENSIONS", act.extensions),
    writeBlock("ADAPTATIONS", act.adaptations),
    writeBlock("SAFETY_NOTES", act.safetyNotes),
    writeBlock("AGE_MODIFICATIONS", act.ageModifications),
  ];
  return parts.join("\n");
}

function buildImportText(planMeta, activitiesByDay) {
  const proposed = buildProposedDailyPlans(planMeta, activitiesByDay);
  const chunks = [];
  chunks.push(writeBlock("TITLE", planMeta.title));
  chunks.push(writeBlock("AGE_GROUP", planMeta.age));
  chunks.push(writeBlock("THEME", planMeta.theme));
  chunks.push(writeBlock("PLAN", planMeta.plan || "Free"));
  // Import STATUS stays draft in source for owner review packaging.
  // Startup seed may still force published for Free catalog presence; enrichmentDraft is the upgrade channel.
  chunks.push(writeBlock("STATUS", "draft"));
  chunks.push(writeBlock("LEARNING_DOMAINS", joinLines(planMeta.learningDomains)));
  chunks.push(writeBlock("WEEKLY_OVERVIEW", planMeta.weeklyOverview));
  chunks.push(writeBlock("LEARNING_OBJECTIVES", joinLines(planMeta.objectives)));
  chunks.push(writeBlock("WEEKLY_MATERIALS", joinLines(planMeta.weeklyMaterials)));
  chunks.push(writeBlock("VOCABULARY", joinLines(planMeta.vocabularyWords)));
  chunks.push(writeBlock(
    "BOOKS",
    (planMeta.books || []).map((b) => (b.author ? `${b.title} | ${b.author}` : b.title)).join("\n"),
  ));
  chunks.push(writeBlock(
    "SONGS",
    (planMeta.songs || []).map((s) => s.title || s).join("\n"),
  ));
  chunks.push(writeBlock("FAMILY_CONNECTION", planMeta.familyConnection));
  chunks.push(writeBlock("OBSERVATION_OPPORTUNITIES", joinLines(planMeta.observationOpportunities)));
  chunks.push(writeBlock("ADAPTATIONS", planMeta.adaptations));

  WEEKDAYS.forEach((day) => {
    const dayPlan = proposed[day];
    const label = day.charAt(0).toUpperCase() + day.slice(1);
    chunks.push(`\n${label}\n`);
    chunks.push(writeBlock("DAILY_THEME", dayPlan.theme));
    chunks.push(writeBlock("DAILY_OBJECTIVES", dayPlan.objectives));
    chunks.push(writeBlock("DAILY_VOCABULARY", dayPlan.vocabulary));
    chunks.push(writeBlock("DAILY_MATERIALS", dayPlan.materials));
    chunks.push(writeBlock("DAILY_LEARNING_DOMAINS", joinLines(dayPlan.learningDomains)));
    chunks.push(writeBlock("CIRCLE_TIME", joinLines(dayPlan.circleTime)));
    chunks.push(writeBlock("OUTDOOR_PLAY", dayPlan.outdoorPlay));
    chunks.push(writeBlock("DAILY_OBSERVATIONS", joinLines(dayPlan.observations)));
    chunks.push(writeBlock("DAILY_ADAPTATIONS", dayPlan.adaptations));
    chunks.push(writeBlock("SAFETY_NOTES", dayPlan.safetyNotes));
    (dayPlan.items || []).forEach((item) => {
      chunks.push(`\n${activityToImportText(item)}`);
    });
  });

  return `${chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

module.exports = {
  WEEKDAYS,
  text,
  lines,
  joinLines,
  numberedSteps,
  normalizeActivity,
  buildProposedDailyPlans,
  buildEnrichmentDraft,
  buildImportText,
};
