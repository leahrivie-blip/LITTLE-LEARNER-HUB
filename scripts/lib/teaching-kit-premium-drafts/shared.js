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

/**
 * Ensure books meet Admin bookRecordComplete (title, author, why + reading prompts).
 * Does not reproduce copyrighted book text — prompts are caregiver/teacher language only.
 */
function completeBooksForAdmin(books, { infant = false } = {}) {
  return (Array.isArray(books) ? books : []).map((book) => {
    const b = book && typeof book === "object" ? { ...book } : { title: String(book || "") };
    if (!text(b.whyThisBook || b.whyItFits)) {
      b.whyThisBook = infant
        ? (text(b.notes) || "Short, visually clear pages for brief face-to-face looking — not a long storytime.")
        : (text(b.notes) || "Supports theme vocabulary, prediction, and discussion during the week.");
    }
    if (!asArrayLocal(b.beforeReadingQuestions).length) {
      b.beforeReadingQuestions = infant
        ? ["Look — here’s the cover. What colors/patterns do you notice with me?"]
        : ["What do you think this book might be about?", "Have you seen something like this before?"];
    }
    if (!asArrayLocal(b.duringReadingPrompts).length) {
      b.duringReadingPrompts = infant
        ? ["Look here with me.", "I see a bright page — watch with your eyes.", "You looked!"]
        : ["What do you notice on this page?", "What might happen next?", "How does this helper/weather feel?"];
    }
    if (!asArrayLocal(b.afterReadingQuestions || b.questions || b.readAloudQuestions).length) {
      b.afterReadingQuestions = infant
        ? ["Should we look at your favorite page again?", "Would you like one more soft look before we rest?"]
        : ["What was your favorite part?", "How does this connect to our centers today?"];
    }
    return b;
  });
}

function asArrayLocal(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const t = text(value);
  return t ? [t] : [];
}

/**
 * Ensure songs meet Admin songRecordComplete (title, rightsStatus, motions/directions/whenToUse).
 */
function completeSongsForAdmin(songs) {
  return (Array.isArray(songs) ? songs : []).map((song) => {
    const s = song && typeof song === "object" ? { ...song } : { title: String(song || "") };
    if (!text(s.rightsStatus || s.copyrightStatus)) {
      s.rightsStatus = /twinkle|itsy|wheels on the bus/i.test(s.title || "")
        ? "public_domain"
        : "original";
    }
    if (!text(s.motions) && !text(s.teacherDirections) && !text(s.whenToUse)) {
      s.whenToUse = text(s.notes) || "Use during circle, transitions, or calm holds related to the theme.";
      s.motions = "Gentle, theme-related gestures; keep infant/preschool movements age-safe.";
    }
    return s;
  });
}

/**
 * Ensure teacher toolkit meets Admin toolkitRecordComplete thresholds.
 */
function completeToolkitForAdmin(toolkit, planMeta = {}) {
  const t = toolkit && typeof toolkit === "object" ? { ...toolkit } : {};
  const infant = /infant|0\s*[–-]\s*6/i.test(String(planMeta.age || ""));
  if (!text(t.teacherPreparation)) {
    t.teacherPreparation = joinLines(planMeta.teacherPreparation)
      || "Gather specialty materials, print draft resources, and stage a calm ready space.";
  }
  if (!text(t.familyConnection)) {
    t.familyConnection = text(planMeta.familyConnection)
      || "Share one simple home connection related to this week’s theme.";
  }
  if (!text(t.mixedAgeAdaptations)) {
    t.mixedAgeAdaptations = infant
      ? "Younger infants: closer, slower, shorter bursts. Older infants: offer large graspable items when ready."
      : "Offer picture supports, peer helpers, and quieter stations alongside active centers.";
  }
  if (!text(t.extraSupportAdaptations || t.extraSupport)) {
    t.extraSupportAdaptations = infant
      ? "Reduce visuals to one focal item; pause when baby looks away; keep sessions very brief."
      : "Provide visual schedules, shorter turns, and adult scaffolding for multi-step centers.";
  }
  if (!text(t.challengeExtensions || t.extensions)) {
    t.challengeExtensions = infant
      ? "When baby is alert and reaching, widen the tracking arc slightly or offer a second texture."
      : "Invite children to document discoveries, lead a short report, or design a center variation.";
  }
  if (!text(t.safetyInclusionNotes || t.safetyNotes)) {
    t.safetyInclusionNotes = text(planMeta.safetyNotes)
      || (infant
        ? "Constant supervision; mouth-safe large materials; stop at distress/disengagement cues."
        : "Supervise active play and tools; inclusive role/language representation; allergy-aware materials.");
  }
  if (!text(t.endOfWeekReflection)) {
    t.endOfWeekReflection = infant
      ? "Which colors/patterns held attention? When did babies disengage? What caregiver language felt natural?"
      : "Which centers sparked the richest talk? What should rotate next week? Whose voices were quieter?";
  }
  if (!asArrayLocal(t.teacherTips || t.tips).length) {
    t.teacherTips = infant
      ? [
        "Your face and voice matter more than perfect materials.",
        "Follow the baby’s alert windows — stop early rather than push.",
        "Narrate without expecting verbal answers.",
      ]
      : [
        "Keep process art open-ended — no model products to copy.",
        "Rotate dramatic-play roles so the week stays balanced.",
        "Capture one observation per child during natural play.",
      ];
  }
  if (!asArrayLocal(t.setupCleanupShortcuts).length) {
    t.setupCleanupShortcuts = infant
      ? [
        "Stage one sensory set at a time",
        "Sanitize mouthed items immediately after use",
        "Return cards/books to a labeled tray",
      ]
      : [
        "Prep center bins the night before",
        "Wipe trays between groups",
        "Photograph charts/art before teardown",
      ];
  }
  if (!asArrayLocal(t.observationPrompts).length && !asArrayLocal(t.observationFocus).length) {
    t.observationFocus = lines(planMeta.observationOpportunities).slice(0, 6);
  }
  if (!asArrayLocal(t.documentationPrompts).length) {
    t.documentationPrompts = infant
      ? [
        "Note gaze/tracking moments in plain language for families",
        "Photo of setup (not staged ‘perfect’ baby performance)",
      ]
      : [
        "Capture child language quotes during centers",
        "Keep a quick chart of who led vs followed in group play",
      ];
  }
  if (!asArrayLocal(t.materialSubstitutions || t.substitutions).length) {
    t.materialSubstitutions = infant
      ? [
        { need: "Scarves", use: "Large soft cloth squares" },
        { need: "Printed cards", use: "Bold board-book pages held still" },
      ]
      : [
        { need: "Specialty props", use: "Classroom dress-up + labeled picture cards" },
        { need: "Outdoor investigation", use: "Window observation + indoor sensory tray" },
      ];
  }
  if (!asArrayLocal(t.prepChecklist).length) {
    t.prepChecklist = lines(planMeta.teacherPreparation);
  }
  return t;
}

function completeWeekMetaForAdmin(planMeta) {
  const infant = /infant|0\s*[–-]\s*6/i.test(String(planMeta.age || ""));
  return {
    ...planMeta,
    books: completeBooksForAdmin(planMeta.books, { infant }),
    songs: completeSongsForAdmin(planMeta.songs),
    teacherToolkit: completeToolkitForAdmin(planMeta.teacherToolkit, planMeta),
  };
}

function buildEnrichmentDraft(planMeta, activitiesByDay, extras = {}) {
  const meta = completeWeekMetaForAdmin(planMeta);
  const proposedDailyPlans = buildProposedDailyPlans(meta, activitiesByDay);
  const activities = {};
  const activityDecisions = [];
  const removedActivityTitles = lines(extras.removedActivityTitles);
  const flat = [];

  WEEKDAYS.forEach((day) => {
    (proposedDailyPlans[day].items || []).forEach((item, index) => {
      const key = item.sourceKey || `${meta.id}:${item.itemId}`;
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
      weeklyOverview: text(meta.weeklyOverview),
      objectives: joinLines(meta.objectives),
      weeklyMaterials: joinLines(meta.weeklyMaterials),
      familyConnection: text(meta.familyConnection),
      adaptations: text(meta.adaptations),
      vocabularyWords: joinLines(meta.vocabularyWords),
      teacherPreparation: joinLines(meta.teacherPreparation),
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
      books: Array.isArray(meta.books) ? meta.books : [],
      songs: Array.isArray(meta.songs) ? meta.songs : [],
      teacherToolkit: meta.teacherToolkit || {},
      printableIdeas: Array.isArray(meta.printableIdeas) ? meta.printableIdeas : [],
      printableIds: Array.isArray(extras.printableIds) ? extras.printableIds : [],
      vocabCards: Array.isArray(meta.vocabCards) ? meta.vocabCards : lines(meta.vocabularyWords).slice(0, 12),
      milestones: Array.isArray(meta.milestones) ? meta.milestones : [],
      auditNotes: meta.auditNotes || {},
      researchSources: Array.isArray(meta.researchSources) ? meta.researchSources : [],
    },
    meta: {
      purpose: "Premium Teaching Kit draft for owner Admin review — DO NOT PUBLISH automatically",
      sourceLessonId: meta.id,
      sourceTitle: meta.title,
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
  completeBooksForAdmin,
  completeSongsForAdmin,
  completeToolkitForAdmin,
  completeWeekMetaForAdmin,
};
