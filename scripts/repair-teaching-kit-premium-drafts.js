#!/usr/bin/env node
/**
 * In-place repair of the four premium Teaching Kit drafts.
 *
 * Root cause addressed:
 * - Enrichment content was keyed by proposed itemIds that did not match live
 *   store activity ids / dailyPlan itemIds for some kits.
 * - Base dailyPlans + curriculum.activities were missing preparation,
 *   cleanupTips, durationMinutes (and related), so Owner Admin showed blank
 *   core fields and farm-animal EXAMPLE helper text.
 *
 * This script:
 * - Does NOT create new lesson plans or duplicate activities
 * - Preserves live activity ids / itemIds
 * - Writes complete fields onto dailyPlans + activities + enrichmentDraft
 * - Keeps status: draft (never publishes)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { KITS, shared } = require("./lib/teaching-kit-premium-drafts/index.js");
const enrichment = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_STORE = path.join(ROOT, "server/data/launch-store.json");
const DRAFT_DIR = path.join(ROOT, "curriculum-drafts/teaching-kits-premium");
const MATRIX_PATH = path.join(DRAFT_DIR, "completion-matrix.json");
const WEEKDAYS = shared.WEEKDAYS;

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
  return shared.numberedSteps(steps);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function printableTitlesForKit(planId, curriculum) {
  const plan = curriculum.lessonPlans.find((p) => p.id === planId);
  const ids = new Set([
    ...((plan && plan.resourceIds) || []),
    ...((plan && plan.enrichmentDraft && plan.enrichmentDraft.week && plan.enrichmentDraft.week.printableIds) || []),
  ]);
  return (curriculum.resources || [])
    .filter((r) => ids.has(r.id) || (r.lessonPlanIds || []).includes(planId))
    .filter((r) => String(r.status) === "draft" || String(r.id || "").startsWith("cur-res-draft-"))
    .map((r) => ({ id: r.id, title: r.title, status: r.status }));
}

function enrichMaterials(materials, activityTitle, printables, kitKey) {
  let list = lines(materials);
  const lower = `${activityTitle} ${list.join(" ")}`.toLowerCase();
  const addIf = (pred, title) => {
    if (!pred || !title) return;
    if (list.some((m) => m.toLowerCase().includes(title.toLowerCase().slice(0, 18)))) return;
    list.push(`Printable (draft): ${title}`);
  };

  if (kitKey.includes("black-white")) {
    if (/card|pattern|gaze|gallery|arc|peek|hello|focus|track|strip|tummy/.test(lower)) {
      const cards = printables.find((p) => /contrast|pattern|face/i.test(p.title));
      addIf(true, cards && cards.title);
    }
    if (/tummy|strip|gallery|line/.test(lower)) {
      const strip = printables.find((p) => /tummy|strip/i.test(p.title));
      addIf(true, strip && strip.title);
    }
  }
  if (kitKey.includes("colors")) {
    if (/card|gaze|track|scarf|color/.test(lower) && /card|gaze|visual/.test(lower)) {
      const cards = printables.find((p) => /gaze|color card/i.test(p.title));
      addIf(/card|gaze|visual/.test(lower), cards && cards.title);
    }
  }
  if (kitKey.includes("community")) {
    if (/card|map|helper|discovery|interview|tool/.test(lower)) {
      const cards = printables.find((p) => /helper.*card|picture card/i.test(p.title));
      addIf(/card|match|interview|discovery|map|tool/.test(lower), cards && cards.title);
    }
    if (/map|place|mail|library|market|clinic|build|sign/.test(lower)) {
      const signs = printables.find((p) => /sign/i.test(p.title));
      addIf(/map|place|sign|mail|library|market|clinic|build/.test(lower), signs && signs.title);
    }
  }
  if (kitKey.includes("weather")) {
    if (/chart|symbol|circle|meteorolog|report|watchers circle|chart helper/.test(lower)) {
      const chart = printables.find((p) => /chart/i.test(p.title));
      const symbols = printables.find((p) => /symbol/i.test(p.title));
      addIf(true, symbols && symbols.title);
      addIf(/chart|report|helper/.test(lower), chart && chart.title);
    }
    if (/dress|clothing|season|sort|relay/.test(lower)) {
      const clothing = printables.find((p) => /clothing/i.test(p.title));
      addIf(true, clothing && clothing.title);
    }
  }
  return list.join("\n");
}

function buildAdaptationBundle(raw, planMeta) {
  const infant = /infant/i.test(planMeta.age || "");
  const adaptations = text(raw.adaptations)
    || (infant
      ? "Younger infants: shorter looking time, closer visuals, more face-to-face. Pause at gaze aversion."
      : "Offer picture supports, a quieter station, or a peer partner as needed.");
  const extensions = text(raw.extensions)
    || (infant
      ? "If baby stays alert, offer one more brief repetition or a second color/pattern."
      : "Add a child leadership turn or an open-ended follow-up challenge.");
  const mixedAgeAdaptations = text(raw.mixedAgeAdaptations)
    || (infant
      ? "Birth–3 months: looking/listening focus. 3–6 months: invite reaching/grasping when ready."
      : "Younger preschoolers: fewer choices. Older preschoolers: add recording, labeling, or peer teaching.");
  const observationPrompts = lines(raw.observationPrompts);
  if (!observationPrompts.length) {
    lines(raw.observationOpportunities).slice(0, 2).forEach((p) => observationPrompts.push(p));
  }
  if (!observationPrompts.length) {
    observationPrompts.push(infant
      ? "Watch for visual attention and engagement/disengagement cues."
      : "Listen for theme vocabulary and notice how children problem-solve.");
  }
  return { adaptations, extensions, mixedAgeAdaptations, observationPrompts };
}

function contentFromKitActivity(raw, day, planMeta, printables, kitKey) {
  const bundle = buildAdaptationBundle(raw, planMeta);
  const materials = enrichMaterials(raw.materials, raw.title, printables, kitKey);
  const teacherTips = lines(raw.teacherTips);
  if (!teacherTips.length) {
    teacherTips.push(infantTip(planMeta));
  }
  const substitutions = Array.isArray(raw.substitutions) && raw.substitutions.length
    ? raw.substitutions.map((s) => {
      if (s && typeof s === "object") return { need: text(s.need), use: text(s.use) };
      const parts = String(s).split("→").map((p) => p.trim());
      if (parts.length === 2) return { need: parts[0], use: parts[1] };
      return { need: "material", use: String(s) };
    }).filter((s) => s.need && s.use)
    : defaultSubstitutions(planMeta);

  return {
    title: text(raw.title),
    dayOfWeek: day,
    activityCategory: text(raw.activityCategory),
    ageModifications: text(raw.ageModifications) || text(planMeta.age),
    durationMinutes: raw.durationMinutes == null || raw.durationMinutes === ""
      ? ( /infant/i.test(planMeta.age) ? 3 : 15)
      : Number(raw.durationMinutes) || raw.durationMinutes,
    objective: text(raw.objective),
    description: text(raw.description),
    materials,
    preparation: joinLines(raw.preparation) || "Gather listed materials and inspect for safety before children arrive.",
    setup: text(raw.setup) || "Arrange materials at child-accessible level in a calm area.",
    steps: numberedSteps(raw.steps),
    teacherLanguage: text(raw.teacherLanguage) || defaultLanguage(planMeta),
    observationOpportunities: joinLines(raw.observationOpportunities) || bundle.observationPrompts.join("\n"),
    safetyNotes: text(raw.safetyNotes) || defaultSafety(planMeta),
    cleanupTips: text(raw.cleanupTips) || defaultCleanup(planMeta),
    teacherTips,
    substitutions,
    vocabulary: lines(raw.vocabulary),
    observationPrompts: bundle.observationPrompts,
    adaptations: bundle.adaptations,
    extensions: bundle.extensions,
    mixedAgeAdaptations: bundle.mixedAgeAdaptations,
    settingTags: lines(raw.settingTags).length
      ? lines(raw.settingTags)
      : (/outdoor/i.test(raw.activityCategory) ? ["outdoor", "small_group"] : ["indoor", "small_group"]),
    imageRequirement: text(raw.imageRequirement) || "not_needed",
    imageBriefSetup: text(raw.imageBriefSetup),
    imageBriefExample: text(raw.imageBriefExample),
    setupImageUrl: text(raw.setupImageUrl),
    exampleImageUrl: text(raw.exampleImageUrl),
    learningGoals: lines(raw.learningGoals),
    indoorAlternatives: text(raw.indoorAlternatives)
      || (/outdoor/i.test(raw.activityCategory)
        ? "Move the same experience indoors near a window with supervision."
        : ""),
    outdoorAlternatives: text(raw.outdoorAlternatives)
      || (/outdoor/i.test(raw.activityCategory)
        ? ""
        : "If weather and shade allow, offer a brief outdoor version with the same materials."),
  };
}

function infantTip(planMeta) {
  return /infant/i.test(planMeta.age || "")
    ? "Follow the baby’s cues — looking away means pause."
    : "Keep instructions short and model once, then step back.";
}

function defaultLanguage(planMeta) {
  return /infant/i.test(planMeta.age || "")
    ? "Look… I see you watching. Here it comes."
    : "What do you notice? How could we try that?";
}

function defaultSafety(planMeta) {
  return /infant/i.test(planMeta.age || "")
    ? "Stay within arm’s reach. Use mouth-safe materials only. Stop if the infant shows distress."
    : "Supervise tools and active play; keep pathways clear; follow allergy-aware material choices.";
}

function defaultCleanup(planMeta) {
  return /infant/i.test(planMeta.age || "")
    ? "Sanitize mouthed materials and return visuals to a labeled storage sleeve."
    : "Reset materials to labeled places and wipe the work surface.";
}

function defaultSubstitutions(planMeta) {
  if (/infant/i.test(planMeta.age || "")) {
    return [{ need: "specialty toy", use: "large soft household cloth or board book with bold visuals" }];
  }
  return [{ need: "specialty prop", use: "classroom blocks, paper, or dramatic-play stand-ins" }];
}

function matchKitDaysToLive(plan, kit) {
  const mapping = [];
  WEEKDAYS.forEach((day) => {
    const liveItems = Array.isArray(plan.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items : [];
    const kitActs = kit.activitiesByDay[day] || [];
    const count = Math.max(liveItems.length, kitActs.length);
    for (let i = 0; i < count; i += 1) {
      mapping.push({
        day,
        index: i,
        liveItem: liveItems[i] || null,
        kitAct: kitActs[i] || null,
      });
    }
  });
  return mapping;
}

function findStoreActivity(curriculum, planId, itemId, title, day) {
  const list = (curriculum.activities || []).filter((a) => a.lessonPlanId === planId && a.status !== "archived");
  let found = list.find((a) => text(a.itemId) === text(itemId));
  if (found) return found;
  found = list.find((a) => text(a.dayOfWeek).toLowerCase() === day && text(a.title).toLowerCase() === text(title).toLowerCase());
  return found || null;
}

function applyContentToItem(liveItem, content, preserved) {
  return {
    ...liveItem,
    itemId: preserved.itemId,
    title: content.title,
    dayOfWeek: content.dayOfWeek,
    activityCategory: content.activityCategory,
    ageModifications: content.ageModifications,
    durationMinutes: content.durationMinutes,
    objective: content.objective,
    description: content.description,
    materials: content.materials,
    preparation: content.preparation,
    setup: content.setup,
    steps: content.steps,
    teacherLanguage: content.teacherLanguage,
    observationOpportunities: content.observationOpportunities,
    safetyNotes: content.safetyNotes,
    cleanupTips: content.cleanupTips,
    teacherTips: content.teacherTips,
    substitutions: content.substitutions,
    vocabulary: Array.isArray(content.vocabulary) ? content.vocabulary.join("\n") : content.vocabulary,
    adaptations: content.adaptations,
    extensions: content.extensions,
    mixedAgeAdaptations: content.mixedAgeAdaptations,
    settingTags: content.settingTags,
    imageRequirement: content.imageRequirement,
    imageBriefSetup: content.imageBriefSetup,
    imageBriefExample: content.imageBriefExample,
    setupImageUrl: content.setupImageUrl || liveItem.setupImageUrl || "",
    exampleImageUrl: content.exampleImageUrl || liveItem.exampleImageUrl || "",
    learningGoals: content.learningGoals,
    indoorAlternatives: content.indoorAlternatives,
    outdoorAlternatives: content.outdoorAlternatives,
    sourceKey: `${preserved.planId}:${preserved.itemId}`,
  };
}

function draftPatchFromContent(content) {
  return {
    title: content.title,
    dayOfWeek: content.dayOfWeek,
    activityCategory: content.activityCategory,
    ageModifications: content.ageModifications,
    durationMinutes: content.durationMinutes,
    objective: content.objective,
    description: content.description,
    materials: content.materials,
    preparation: content.preparation,
    setup: content.setup,
    steps: content.steps,
    teacherLanguage: content.teacherLanguage,
    observationOpportunities: content.observationOpportunities,
    safetyNotes: content.safetyNotes,
    cleanupTips: content.cleanupTips,
    teacherTips: content.teacherTips,
    substitutions: content.substitutions,
    vocabulary: content.vocabulary,
    observationPrompts: content.observationPrompts,
    adaptations: content.adaptations,
    extensions: content.extensions,
    mixedAgeAdaptations: content.mixedAgeAdaptations,
    settingTags: content.settingTags,
    imageRequirement: content.imageRequirement,
    imageBriefSetup: content.imageBriefSetup,
    imageBriefExample: content.imageBriefExample,
    setupImageUrl: content.setupImageUrl,
    exampleImageUrl: content.exampleImageUrl,
    indoorAlternatives: content.indoorAlternatives,
    outdoorAlternatives: content.outdoorAlternatives,
  };
}

function repairKit(curriculum, kit, now) {
  const planIdx = curriculum.lessonPlans.findIndex((p) => p.id === kit.planMeta.id);
  if (planIdx < 0) {
    return { id: kit.planMeta.id, ok: false, error: "lesson plan missing" };
  }
  const plan = curriculum.lessonPlans[planIdx];
  const printables = printableTitlesForKit(kit.planMeta.id, curriculum);
  const mapping = matchKitDaysToLive(plan, kit);
  const draftActivities = {};
  const proposedDailyPlans = {};
  const preservedIds = [];
  const repairedTitles = [];

  WEEKDAYS.forEach((day) => {
    proposedDailyPlans[day] = {
      ...(plan.dailyPlans?.[day] || {}),
      theme: kit.planMeta.days?.[day]?.theme || plan.dailyPlans?.[day]?.theme || "",
      objectives: joinLines(kit.planMeta.days?.[day]?.objectives) || plan.dailyPlans?.[day]?.objectives || "",
      materials: joinLines(kit.planMeta.weeklyMaterials),
      vocabulary: joinLines(kit.planMeta.vocabularyWords),
      circleTime: lines(kit.planMeta.days?.[day]?.circleTime),
      outdoorPlay: text(kit.planMeta.days?.[day]?.outdoorPlay),
      observations: lines(kit.planMeta.days?.[day]?.observations),
      adaptations: text(kit.planMeta.adaptations),
      safetyNotes: text(kit.planMeta.safetyNotes),
      teacherPreparation: joinLines(kit.planMeta.teacherPreparation),
      items: [],
    };
  });

  const nextDaily = { ...(plan.dailyPlans || {}) };
  WEEKDAYS.forEach((day) => {
    nextDaily[day] = {
      ...(nextDaily[day] || {}),
      theme: kit.planMeta.days?.[day]?.theme || nextDaily[day]?.theme || "",
      objectives: joinLines(kit.planMeta.days?.[day]?.objectives) || nextDaily[day]?.objectives || "",
      materials: joinLines(kit.planMeta.weeklyMaterials),
      vocabulary: joinLines(kit.planMeta.vocabularyWords),
      circleTime: lines(kit.planMeta.days?.[day]?.circleTime),
      outdoorPlay: text(kit.planMeta.days?.[day]?.outdoorPlay),
      observations: lines(kit.planMeta.days?.[day]?.observations),
      adaptations: text(kit.planMeta.adaptations),
      safetyNotes: text(kit.planMeta.safetyNotes),
      teacherPreparation: joinLines(kit.planMeta.teacherPreparation),
      items: Array.isArray(nextDaily[day]?.items) ? [...nextDaily[day].items] : [],
    };
  });

  mapping.forEach((row) => {
    if (!row.kitAct || !row.liveItem) return;
    const content = contentFromKitActivity(row.kitAct, row.day, kit.planMeta, printables, kit.key);
    const itemId = text(row.liveItem.itemId) || `item-${kit.planMeta.id.replace(/^cur-lp-/, "")}-${row.day}-${row.index + 1}`;
    const storeAct = findStoreActivity(curriculum, kit.planMeta.id, itemId, content.title, row.day);
    const activityId = text(storeAct?.id) || text(row.liveItem.activityId) || `${kit.planMeta.id}:${itemId}`;

    const nextItem = applyContentToItem(row.liveItem, content, {
      itemId,
      planId: kit.planMeta.id,
    });
    nextDaily[row.day].items[row.index] = nextItem;
    proposedDailyPlans[row.day].items[row.index] = { ...nextItem };

    const patch = draftPatchFromContent(content);
    // Key by every lookup the Admin editor / merge helpers may use.
    draftActivities[activityId] = patch;
    draftActivities[itemId] = patch;
    draftActivities[`${kit.planMeta.id}:${itemId}`] = patch;
    draftActivities[`${kit.planMeta.id}:${row.day}:${itemId}`] = patch;

    if (storeAct) {
      const actIdx = curriculum.activities.findIndex((a) => a.id === storeAct.id);
      if (actIdx >= 0) {
        curriculum.activities[actIdx] = {
          ...curriculum.activities[actIdx],
          ...nextItem,
          id: storeAct.id,
          itemId,
          lessonPlanId: kit.planMeta.id,
          dayOfWeek: row.day,
          status: "draft",
          updatedAt: now,
          publishedAt: "",
        };
      }
    }

    preservedIds.push({ activityId, itemId, title: content.title, day: row.day });
    repairedTitles.push(content.title);
  });

  // Ensure proposed arrays are dense
  WEEKDAYS.forEach((day) => {
    proposedDailyPlans[day].items = (proposedDailyPlans[day].items || []).filter(Boolean);
    nextDaily[day].items = (nextDaily[day].items || []).filter(Boolean);
  });

  const priorDraft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? plan.enrichmentDraft
    : {};
  const printableIds = [
    ...new Set([
      ...((priorDraft.week && priorDraft.week.printableIds) || []),
      ...printables.map((p) => p.id),
    ]),
  ];

  const weekMeta = shared.completeWeekMetaForAdmin(kit.planMeta);

  const enrichmentDraft = {
    ...priorDraft,
    updatedAt: now,
    lastEditedBy: "premium-draft-repair@littlelearnershub.local",
    previewReady: true,
    draftOnly: true,
    neverAutoPublish: true,
    activities: draftActivities,
    week: {
      ...(priorDraft.week || {}),
      weeklyOverview: text(weekMeta.weeklyOverview),
      objectives: joinLines(weekMeta.objectives),
      weeklyMaterials: joinLines(weekMeta.weeklyMaterials),
      familyConnection: text(weekMeta.familyConnection),
      adaptations: text(weekMeta.adaptations),
      vocabularyWords: joinLines(weekMeta.vocabularyWords),
      teacherPreparation: joinLines(weekMeta.teacherPreparation),
      fieldOwnership: {
        objectives: true,
        weeklyOverview: true,
        weeklyMaterials: true,
        familyConnection: true,
      },
      proposedDailyPlans,
      books: weekMeta.books || [],
      songs: weekMeta.songs || [],
      teacherToolkit: weekMeta.teacherToolkit || {},
      printableIdeas: weekMeta.printableIdeas || [],
      printableIds,
      vocabCards: weekMeta.vocabCards || lines(weekMeta.vocabularyWords).slice(0, 12),
      milestones: weekMeta.milestones || [],
      removedActivityTitles: kit.removedActivityTitles || [],
      activityDecisions: repairedTitles.map((title) => ({
        title,
        decision: "improve",
        note: "In-place completion repair — fields written to live IDs",
      })),
    },
    meta: {
      purpose: "In-place completion repair for Owner Admin review — DRAFT ONLY",
      sourceLessonId: kit.planMeta.id,
      repairedAt: now,
      preservedIdCount: preservedIds.length,
    },
  };

  const resourceIds = Array.isArray(plan.resourceIds) ? [...plan.resourceIds] : [];
  printableIds.forEach((id) => {
    if (!resourceIds.includes(id)) resourceIds.push(id);
  });

  curriculum.lessonPlans[planIdx] = {
    ...plan,
    status: "draft",
    weeklyOverview: text(kit.planMeta.weeklyOverview),
    objectives: joinLines(kit.planMeta.objectives),
    weeklyMaterials: joinLines(kit.planMeta.weeklyMaterials),
    vocabularyWords: joinLines(kit.planMeta.vocabularyWords),
    familyConnection: text(kit.planMeta.familyConnection),
    observationOpportunities: joinLines(kit.planMeta.observationOpportunities),
    adaptations: text(kit.planMeta.adaptations),
    books: weekMeta.books || plan.books || [],
    songs: weekMeta.songs || plan.songs || [],
    dailyPlans: nextDaily,
    resourceIds,
    enrichmentDraft,
    teachingKit: {
      ...(plan.teachingKit || {}),
      schemaVersion: 1,
      completeness: "enriched",
      updatedAt: now,
      teacherToolkit: {
        ...(weekMeta.teacherToolkit || {}),
      },
      printableIdeas: weekMeta.printableIdeas || [],
      printableIds,
      vocabCards: weekMeta.vocabCards || [],
      milestones: weekMeta.milestones || [],
    },
    updatedAt: now,
  };

  // Force linked draft printables to remain draft
  curriculum.resources = (curriculum.resources || []).map((r) => {
    if (!printableIds.includes(r.id) && !String(r.id || "").startsWith("cur-res-draft-")) return r;
    if (!(r.lessonPlanIds || []).includes(kit.planMeta.id) && !printableIds.includes(r.id)) return r;
    return { ...r, status: "draft", publishedAt: "" };
  });

  // Persist repaired enrichment JSON for the PR package
  const draftJsonPath = path.join(DRAFT_DIR, `${kit.key}.enrichment-draft.json`);
  fs.writeFileSync(draftJsonPath, `${JSON.stringify(enrichmentDraft, null, 2)}\n`, "utf8");

  return {
    id: kit.planMeta.id,
    title: kit.planMeta.title,
    ok: true,
    repairedCount: repairedTitles.length,
    preservedIds,
    printableIds,
    lessonStatus: "draft",
  };
}

function fieldStatus(value, naReason) {
  if (value == null) return { status: naReason ? "N/A" : "BLANK", reason: naReason || "missing", value: "" };
  if (Array.isArray(value)) {
    if (!value.length) return { status: naReason ? "N/A" : "BLANK", reason: naReason || "empty array", value: "" };
    return { status: "COMPLETE", reason: "", value: value.join(" | ").slice(0, 160) };
  }
  const t = String(value).trim();
  if (!t) return { status: naReason ? "N/A" : "BLANK", reason: naReason || "empty", value: "" };
  return { status: "COMPLETE", reason: "", value: t.slice(0, 160) };
}

function buildMatrix(curriculum) {
  const kits = [];
  KITS.forEach((kit) => {
    const plan = curriculum.lessonPlans.find((p) => p.id === kit.planMeta.id);
    const acts = enrichment.flattenLessonActivities(plan, curriculum.activities, plan.enrichmentDraft);
    const dayCounts = {};
    WEEKDAYS.forEach((d) => {
      dayCounts[d] = acts.filter((a) => a.dayOfWeek === d).length;
    });
    const activityRows = acts.map((act) => {
      const key = text(act.id) || text(act.itemId);
      const patch = plan.enrichmentDraft?.activities?.[key]
        || plan.enrichmentDraft?.activities?.[`${kit.planMeta.id}:${act.itemId}`]
        || {};
      const model = enrichment.mapActivityToOwnerEditorModel(act, patch, plan);
      const view = enrichment.activityEnrichmentView(act, patch);
      const imageDecision = model.imageRequirement || view.imageRequirement || "needs_owner_classification";
      const needsImage = imageDecision !== "not_needed" && imageDecision !== "";
      const materialsText = String(model.materials || "");
      const printableDecision = /printable \(draft\)|cards \(printable\)|chart \(printable\)/i.test(materialsText)
        || /card|chart|sign|strip/i.test(act.title)
        ? (/scarf|song|cuddle|parade|yoga|interview|celebration|book nook|bounce|hello with caregiver|sway hold|stroll/i.test(act.title)
          ? "OPTIONAL"
          : "REQUIRED")
        : "NO_PRINTABLE";
      const completion = enrichment.computeActivityCompletion(act, patch, plan);
      return {
        kit: kit.planMeta.title,
        day: act.dayOfWeek,
        activityId: act.id,
        itemId: act.itemId,
        name: fieldStatus(model.title),
        age: fieldStatus(model.ageModifications),
        duration: fieldStatus(model.durationMinutes),
        objective: fieldStatus(model.objective),
        childAction: fieldStatus(model.description),
        materials: fieldStatus(model.materials),
        prep: fieldStatus(model.preparation),
        setup: fieldStatus(model.setup),
        steps: fieldStatus(model.steps),
        questionsLanguage: fieldStatus(model.teacherLanguage),
        observation: fieldStatus(model.observationOpportunities),
        safety: fieldStatus(model.safetyNotes),
        cleanup: fieldStatus(model.cleanupTips),
        enrichmentTips: fieldStatus(view.teacherTips),
        enrichmentAdaptations: fieldStatus(view.adaptations),
        enrichmentExtensions: fieldStatus(view.extensions),
        enrichmentMixedAge: fieldStatus(view.mixedAgeAdaptations),
        enrichmentSubs: fieldStatus(view.substitutions.map((s) => `${s.need}→${s.use}`)),
        enrichmentVocab: fieldStatus(view.vocabulary),
        imageDecision,
        imageStatus: needsImage
          ? fieldStatus(view.setupImageUrl || view.exampleImageUrl || view.imageBriefSetup, needsImage ? "" : "no image needed")
          : { status: "N/A", reason: "NO IMAGE NEEDED — instructional value already clear in text", value: "" },
        printableDecision,
        printableStatus: printableDecision === "NO_PRINTABLE"
          ? { status: "N/A", reason: "Activity does not require a printable resource", value: "" }
          : fieldStatus((plan.enrichmentDraft?.week?.printableIds || []).join(", ")),
        coreCompletionPercent: completion.percent,
        coreMissing: completion.missing || [],
      };
    });

    const blankCore = activityRows.filter((r) => r.coreMissing.length > 0);
    kits.push({
      id: kit.planMeta.id,
      title: kit.planMeta.title,
      lessonStatus: plan.status,
      enrichmentDraft: Boolean(plan.enrichmentDraft),
      enrichmentPublished: Boolean(plan.enrichmentPublished),
      activityCount: acts.length,
      dayCounts,
      week: {
        cover: fieldStatus(plan.title),
        weeklyOverview: fieldStatus(plan.weeklyOverview || plan.enrichmentDraft?.week?.weeklyOverview),
        mondaySetup: fieldStatus(plan.dailyPlans?.monday?.teacherPreparation || plan.enrichmentDraft?.week?.teacherPreparation),
        songs: fieldStatus((plan.enrichmentDraft?.week?.songs || plan.songs || []).map((s) => s.title || s)),
        books: fieldStatus((plan.enrichmentDraft?.week?.books || plan.books || []).map((b) => b.title || b)),
        vocabulary: fieldStatus(plan.vocabularyWords || plan.enrichmentDraft?.week?.vocabularyWords),
        materials: fieldStatus(plan.weeklyMaterials || plan.enrichmentDraft?.week?.weeklyMaterials),
        observation: fieldStatus(plan.observationOpportunities),
        familyConnection: fieldStatus(plan.familyConnection || plan.enrichmentDraft?.week?.familyConnection),
        teacherToolkit: fieldStatus(plan.teachingKit?.teacherToolkit?.prepChecklist || plan.enrichmentDraft?.week?.teacherToolkit?.prepChecklist),
        printables: fieldStatus(plan.enrichmentDraft?.week?.printableIds),
        draftStatus: fieldStatus(plan.status === "draft" ? "draft" : plan.status),
      },
      activities: activityRows,
      incompleteActivityCount: blankCore.length,
    });
  });
  return {
    generatedAt: new Date().toISOString(),
    draftOnly: true,
    published: false,
    kits,
    allCoreComplete: kits.every((k) => k.incompleteActivityCount === 0 && k.activityCount === 15),
    allDraft: kits.every((k) => k.lessonStatus === "draft" && k.enrichmentDraft && !k.enrichmentPublished),
  };
}

function main() {
  const storePath = process.env.STORE_PATH || DEFAULT_STORE;
  if (!fs.existsSync(storePath)) {
    console.error("Store not found:", storePath);
    process.exit(1);
  }
  const store = readJson(storePath);
  const curriculum = store.siteContent.curriculum;
  const now = new Date().toISOString();
  const backupPath = `${storePath}.bak-tk-repair-${Date.now()}`;
  fs.copyFileSync(storePath, backupPath);

  const results = KITS.map((kit) => repairKit(curriculum, kit, now));
  curriculum.updatedAt = now;
  store.siteContent.updatedAt = now;
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

  const matrix = buildMatrix(curriculum);
  fs.mkdirSync(DRAFT_DIR, { recursive: true });
  fs.writeFileSync(MATRIX_PATH, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");

  const report = {
    repairedAt: now,
    storePath,
    backupPath,
    results,
    matrixPath: MATRIX_PATH,
    allCoreComplete: matrix.allCoreComplete,
    allDraft: matrix.allDraft,
    publishEnrichmentCalled: false,
  };
  fs.writeFileSync(path.join(DRAFT_DIR, "repair-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!matrix.allCoreComplete || !matrix.allDraft || results.some((r) => !r.ok)) {
    process.exit(2);
  }
}

main();
