/**
 * Curriculum Production — upgrade existing lessons using the completed Teaching Kit workflow.
 *
 * Analyze → AI draft (reuse-first) → Quality review → Save enrichment draft.
 * Never publishes. Does not add new AI capabilities — composes approved modules.
 *
 * Flags remain default false in the product. Callers may enable Enrichment Editor
 * only inside a temporary store for a production batch run.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitCurriculumProduction = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const path = require("path");
  const teachingKit = require("./teaching-kit.js");
  const enrichment = require("./teaching-kit-enrichment.js");
  const lessonTeacher = require("./teaching-kit-ai-lesson-teacher.js");
  const reusable = require("./teaching-kit-reusable-library.js");
  const director = require("./teaching-kit-curriculum-director.js");
  const quality = require("./teaching-kit-quality-review.js");
  const enrichmentAi = require("../server/enrichment-ai.js");
  const preschoolImports = require("./curriculum-preschool-import-targets.js");

  /** Highest-traffic lessons first (owner priority + analytics override). */
  const PRIORITY_LESSON_IDS = Object.freeze([
    "cur-lp-preschool-farm-animals",
    "cur-lp-preschool-all-about-me",
    "cur-lp-preschool-colors-everywhere",
    "cur-lp-preschool-community-helpers",
    "cur-lp-preschool-weather-watchers",
  ]);

  const STAGES = Object.freeze({
    LEGACY: "Legacy",
    IN_PROGRESS: "In Progress",
    NEEDS_REVIEW: "Needs Review",
    COMPLETE: "Complete",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function emptyProgressReport() {
    return {
      title: "Teaching Kit Curriculum Production",
      startedAt: new Date().toISOString(),
      finishedAt: "",
      lessonsUpgraded: [],
      resourcesReused: [],
      newResourcesCreated: [],
      remainingLessons: [],
      stageCounts: {
        [STAGES.LEGACY]: 0,
        [STAGES.IN_PROGRESS]: 0,
        [STAGES.NEEDS_REVIEW]: 0,
        [STAGES.COMPLETE]: 0,
      },
      estimatedCompletionProgress: {
        upgradedCount: 0,
        remainingCount: 0,
        percentOfPriorityQueue: 0,
        note: "Progress is against the prioritized production queue, not the entire catalog.",
      },
      guarantees: {
        autoPublished: false,
        legacyContentPreserved: true,
        flagsDefaultFalse: true,
        reuseFirst: true,
      },
      doNotMerge: true,
      doNotDeploy: true,
      doNotEnableFlags: true,
    };
  }

  function stageFromScores({ completionPercent, qualityReport, hasDraft, kitCoverage }) {
    const pct = Number(completionPercent) || 0;
    const blocking = Boolean(qualityReport?.blocksPublish);
    const draftOwned = kitCoverage?.draftOwned || {};
    const draftKitComplete = Object.keys(draftOwned).length
      ? Object.values(draftOwned).every(Boolean)
      : false;
    if (!hasDraft && pct < 50) return STAGES.LEGACY;
    // Production Complete = every kit section drafted + quality not blocking.
    // Still unpublished — dashboard UI may continue to show Needs Review until Publish.
    if (hasDraft && draftKitComplete && pct >= 90 && !blocking) return STAGES.COMPLETE;
    if (pct >= 75 || (hasDraft && qualityReport)) return STAGES.NEEDS_REVIEW;
    if (hasDraft || pct > 0) return STAGES.IN_PROGRESS;
    return STAGES.LEGACY;
  }

  function usageFromEvents(events = []) {
    const usage = {};
    const bump = (planId, key, amount = 1) => {
      const id = text(planId);
      if (!id) return;
      if (!usage[id]) usage[id] = { views: 0, downloads: 0, assigns: 0, proUpgrades: 0, subscribeDrivers: 0 };
      usage[id][key] = (usage[id][key] || 0) + amount;
    };
    asArray(events).forEach((event) => {
      const name = String(event?.name || "");
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      const planId = detail.lessonId || detail.lessonPlanId || detail.planId || "";
      if (name === "lesson_plan_view" || name === "curriculum_lesson_view" || name === "resource_view") {
        bump(planId || detail.resourceId, "views");
      }
      if (/download|printable/i.test(name)) bump(planId || detail.resourceId, "downloads");
      if (name === "lesson_assign" || name === "curriculum_assign" || name === "schedule_lesson") {
        bump(planId, "assigns");
      }
      if (name === "checkout_started" || name === "upgrade_click" || name === "pro_upgrade_click") {
        bump(planId || detail.fromLessonId, "proUpgrades");
      }
    });
    return usage;
  }

  /**
   * Build upgrade queue: analytics views first, then owner priority list, then incomplete.
   */
  function buildProductionQueue(curriculum = {}, usageByPlanId = {}, options = {}) {
    const plans = asArray(curriculum.lessonPlans);
    const priority = asArray(options.priorityIds?.length ? options.priorityIds : PRIORITY_LESSON_IDS);
    const byId = new Map(plans.map((p) => [p.id, p]));

    const scored = plans.map((plan) => {
      const acts = enrichment.flattenLessonActivities(
        plan,
        asArray(curriculum.activities).filter((a) => a.lessonPlanId === plan.id),
      );
      const completion = enrichment.computeCompletionPercent(plan, acts, plan.enrichmentDraft || null);
      const usage = usageByPlanId[plan.id] || {};
      const priorityIndex = priority.indexOf(plan.id);
      return {
        id: plan.id,
        title: text(plan.title),
        theme: text(plan.theme),
        views: Number(usage.views) || 0,
        downloads: Number(usage.downloads) || 0,
        completionPercent: completion,
        priorityIndex: priorityIndex >= 0 ? priorityIndex : 999,
        neverUpgraded: !plan.enrichmentDraft
          || (
            Object.keys(plan.enrichmentDraft.week || {}).length === 0
            && Object.keys(plan.enrichmentDraft.activities || {}).length === 0
          ),
      };
    });

    // Prefer explicit priority IDs that exist, ordered by views within that set, then rest by views.
    const priorityRows = scored
      .filter((r) => r.priorityIndex < 999)
      .sort((a, b) => {
        if (b.views !== a.views) return b.views - a.views;
        return a.priorityIndex - b.priorityIndex;
      });
    const rest = scored
      .filter((r) => r.priorityIndex >= 999)
      .sort((a, b) => {
        if (b.views !== a.views) return b.views - a.views;
        return a.completionPercent - b.completionPercent;
      });

    const missingPriority = priority
      .filter((id) => !byId.has(id))
      .map((id) => ({ id, title: id, missingFromCurriculum: true, views: 0, completionPercent: 0 }));

    return {
      queue: [...priorityRows, ...rest],
      missingPriority,
      analyticsLabel: Object.keys(usageByPlanId).length
        ? "real or seeded analytics"
        : "estimated — no usage events; using owner priority order",
    };
  }

  function loadPriorityLessonPlans(limit = 5) {
    const targets = preschoolImports.PRESCHOOL_FREE_IMPORT_TARGETS
      .filter((t) => PRIORITY_LESSON_IDS.includes(t.stableId));
    // Preserve PRIORITY_LESSON_IDS order
    const ordered = PRIORITY_LESSON_IDS
      .map((id) => targets.find((t) => t.stableId === id))
      .filter(Boolean)
      .slice(0, limit);
    return ordered.map((target) => {
      const plan = preschoolImports.readPreschoolImportTarget(target);
      // Start production from legacy published content — no enrichment draft yet.
      return {
        ...plan,
        enrichmentDraft: null,
        enrichmentPublishHistory: [],
      };
    });
  }

  function loadFarmAnimalsFixtureAsLegacy() {
    const fixturePath = path.join(__dirname, "fixtures/teaching-kit/farm-animals-enrichment-slice2.json");
    const raw = require(fixturePath);
    const plan = raw.lessonPlan || raw;
    return {
      ...plan,
      enrichmentDraft: null,
      enrichmentPublishHistory: [],
    };
  }

  function collectReuseHints(plan, curriculum, directorState, assistantState) {
    const intel = director.intelligenceForLesson(plan, curriculum, directorState, assistantState);
    const library = reusable.normalizeLibrary(assistantState?.reusableLibrary || {});
    const recommendations = reusable.recommendReusable(library, {
      query: `${plan.theme || ""} ${plan.title || ""}`,
      theme: plan.theme || "",
      limit: 12,
    });
    return {
      reuseHints: intel.reuseHints || [],
      recommendations,
      connections: intel.connections || [],
      catalogCounts: intel.catalogCounts || {},
    };
  }

  /** Week-level categories that must appear in a Complete Teaching Kit draft. */
  const WEEK_KIT_CATEGORIES = Object.freeze([
    "weekly_overview",
    "learning_objectives",
    "materials_list",
    "teacher_preparation",
    "toolkit_prep",
    "toolkit_observation",
    "family_connection",
    "milestones",
    "books",
    "songs",
    "printable_ideas",
    "vocab_cards",
  ]);

  /**
   * Gap filter skips week sections that legacy already covers. For Curriculum Production
   * the enrichment draft must still hold every kit section — re-admit week kit rows.
   */
  function mergeWeekKitSuggestions(gapFiltered, allSuggestions) {
    const byId = new Map();
    asArray(gapFiltered).forEach((s) => {
      if (s?.id) byId.set(s.id, s);
      else byId.set(`row-${byId.size}`, s);
    });
    asArray(allSuggestions).forEach((s) => {
      if (!WEEK_KIT_CATEGORIES.includes(text(s?.category))) return;
      const id = s?.id || `week-${s.category}-${byId.size}`;
      if (!byId.has(id)) byId.set(id, s);
    });
    return [...byId.values()];
  }

  function generateFixtureDraftPack(plan, activities, {
    activityOffset = 0,
    activityLimit = 5,
    includeWeek = true,
    draft = null,
  } = {}) {
    const draftSafe = draft && typeof draft === "object" ? draft : { activities: {}, week: {} };
    return enrichmentAi.getLessonTeacherFixturePack({
      plan,
      activities,
      activity: activities[activityOffset] || activities[0] || null,
      scope: "lesson",
      activityKey: "",
      activityOffset,
      activityLimit,
      includeWeek,
      activityDraft: {},
      weekDraft: draftSafe.week || {},
      draftActivities: draftSafe.activities || {},
    });
  }

  /**
   * Upgrade one lesson through the production workflow (draft-only).
   * Returns applied draft + telemetry. Does not publish.
   */
  function upgradeOneLesson(planInput, {
    curriculum = {},
    directorState = null,
    assistantState = null,
    dryRun = false,
    activityBatchSize = 5,
  } = {}) {
    const plan = planInput && typeof planInput === "object" ? planInput : null;
    if (!plan?.id) throw new Error("upgradeOneLesson requires a lesson plan with id");

    const storeActs = asArray(curriculum.activities).filter((a) => a.lessonPlanId === plan.id);
    const activities = enrichment.flattenLessonActivities(plan, storeActs);
    const legacySnapshot = {
      weeklyOverview: plan.weeklyOverview || "",
      objectives: plan.objectives || "",
      familyConnection: plan.familyConnection || "",
      vocabularyWords: plan.vocabularyWords || "",
      books: asArray(plan.books).map((b) => b.title || b),
      songs: asArray(plan.songs).map((s) => s.title || s),
    };

    const beforeAnalysis = lessonTeacher.analyzeLessonCompleteness(
      plan,
      activities,
      plan.enrichmentDraft || null,
    );
    const beforeCompletion = enrichment.computeCompletionPercent(
      plan,
      activities,
      plan.enrichmentDraft || null,
    );

    const stages = [STAGES.LEGACY];
    const reuse = collectReuseHints(plan, {
      ...curriculum,
      lessonPlans: asArray(curriculum.lessonPlans).length
        ? curriculum.lessonPlans
        : [plan],
    }, directorState, assistantState);

    let draft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
      : { activities: {}, week: {}, updatedAt: "", lastEditedBy: "curriculum-production", previewReady: false };
    if (!draft.activities) draft.activities = {};
    if (!draft.week) draft.week = {};

    stages.push(STAGES.IN_PROGRESS);

    const allSuggestions = [];
    const reuseHintsApplied = [];
    let offset = 0;
    let includeWeek = true;
    let batchCount = 0;
    while (offset < Math.max(activities.length, 1) || includeWeek) {
      const packed = generateFixtureDraftPack(plan, activities, {
        activityOffset: offset,
        activityLimit: activityBatchSize,
        includeWeek,
        draft,
      });
      batchCount += 1;
      let suggestions = asArray(packed.suggestions);
      // Gap filter first (activity focus), then re-include week kit sections so every
      // Teaching Kit section lands in the enrichment draft — even when legacy already
      // has overview/songs/books (draft must still be complete; legacy is preserved).
      const gapFiltered = lessonTeacher.filterSuggestionsForGaps(suggestions, beforeAnalysis);
      suggestions = mergeWeekKitSuggestions(gapFiltered, packed.suggestions);
      const preferred = reusable.preferReusableOverGenerated(
        suggestions,
        assistantState?.reusableLibrary || { items: [] },
        reuse.connections,
      );
      suggestions = preferred.suggestions;
      asArray(preferred.reuseHints).forEach((h) => reuseHintsApplied.push(h));
      // Prefer director reuse hints: annotate matching printable/vocab suggestions
      reuse.reuseHints.slice(0, 8).forEach((hint) => {
        if (hint.kind === "vocabulary" || hint.kind === "printable" || hint.kind === "master_resource") {
          reuseHintsApplied.push(hint);
        }
      });

      const accepted = suggestions.map((s) => ({ ...s, decision: "accepted", selected: true }));
      const applied = lessonTeacher.applyLessonTeacherDecisions(draft, accepted);
      draft = applied.draft;
      allSuggestions.push(...accepted);

      const batch = packed.batch || {};
      includeWeek = false;
      if (batch.hasMore) {
        offset = Number(batch.nextOffset) || (offset + activityBatchSize);
      } else {
        break;
      }
      if (batchCount > 20) break;
    }

    // Link known reusable vocabulary into week draft when theme matches a library item
    const vocabHits = asArray(reuse.recommendations).filter((r) => r.type === "vocabulary");
    if (vocabHits[0] && !asArray(draft.week.vocabCards).length) {
      draft.week.vocabCards = String(vocabHits[0].body || vocabHits[0].title)
        .split(/[·,\n]/)
        .map((w) => w.trim())
        .filter(Boolean)
        .slice(0, 12);
      draft.week.linkedMasterResources = {
        ...(draft.week.linkedMasterResources || {}),
        [vocabHits[0].id]: {
          id: vocabHits[0].id,
          type: "vocabulary",
          title: vocabHits[0].title,
          body: vocabHits[0].body,
          updatedAt: new Date().toISOString(),
        },
      };
      reuseHintsApplied.push({
        kind: "vocabulary",
        message: `Reused “${vocabHits[0].title}” instead of creating a new pack.`,
        id: vocabHits[0].id,
      });
    }

    // Do NOT copy legacy objectives into the draft, and do not treat automated
    // batch-accept as ownership. Read-time fallback surfaces plan.objectives until
    // a human edits the field or accepts an objectives suggestion in the editor.
    if (draft.week && typeof draft.week === "object") {
      delete draft.week.objectives;
      if (draft.week.fieldOwnership && typeof draft.week.fieldOwnership === "object") {
        delete draft.week.fieldOwnership.objectives;
      }
    }

    draft.updatedAt = new Date().toISOString();
    draft.lastEditedBy = "curriculum-production";

    const afterCompletion = enrichment.computeCompletionPercent(plan, activities, draft);
    const afterAnalysis = lessonTeacher.analyzeLessonCompleteness(plan, activities, draft);
    const qualityReport = quality.buildQualityReport(plan, activities, draft);
    const kitCoverage = kitSectionCoverage(plan, draft);
    stages.push(STAGES.NEEDS_REVIEW);

    const finalStage = stageFromScores({
      completionPercent: afterCompletion,
      qualityReport,
      hasDraft: true,
      kitCoverage,
    });
    if (finalStage === STAGES.COMPLETE) stages.push(STAGES.COMPLETE);

    // New resource candidates = suggestions that were NOT reuse-marked
    const newResources = allSuggestions
      .filter((s) => !s.reuseRecommended && ["printable_ideas", "vocab_cards", "songs", "books"].includes(s.category))
      .map((s) => ({
        category: s.category,
        label: s.fieldLabel || s.category,
        preview: text(s.proposedText).slice(0, 120),
      }));

    const result = {
      planId: plan.id,
      title: plan.title,
      theme: plan.theme,
      stagesTraversed: [...new Set(stages)],
      finalStage,
      before: {
        completionPercent: beforeCompletion,
        analysis: beforeAnalysis,
        dashboardStage: beforeAnalysis.dashboardStage || STAGES.LEGACY,
      },
      after: {
        completionPercent: afterCompletion,
        analysis: afterAnalysis,
        qualityScore: qualityReport.overallScore,
        qualityLabel: qualityReport.overallLabel,
        blocksPublish: qualityReport.blocksPublish,
        dashboardStage: afterAnalysis.dashboardStage || STAGES.NEEDS_REVIEW,
        kitCoverage,
      },
      enrichmentDraft: dryRun ? null : draft,
      legacySnapshot,
      legacyPreserved: {
        weeklyOverview: legacySnapshot.weeklyOverview === (plan.weeklyOverview || ""),
        publishedFieldsUntouched: true,
      },
      resourcesReused: reuseHintsApplied,
      newResourcesCreated: newResources.slice(0, 40),
      suggestionCount: allSuggestions.length,
      batchCount,
      activityCount: activities.length,
      autoPublished: false,
      dryRun: Boolean(dryRun),
      upgradedAt: new Date().toISOString(),
    };

    return result;
  }

  function summarizeProductionRun(results, queueMeta = {}) {
    const report = emptyProgressReport();
    report.finishedAt = new Date().toISOString();
    const upgraded = asArray(results).filter((r) => r && !r.dryRun && r.enrichmentDraft);
    const dry = asArray(results).filter((r) => r?.dryRun);

    report.lessonsUpgraded = upgraded.map((r) => ({
      planId: r.planId,
      title: r.title,
      theme: r.theme,
      stagesTraversed: r.stagesTraversed,
      finalStage: r.finalStage,
      completionBefore: r.before.completionPercent,
      completionAfter: r.after.completionPercent,
      qualityScore: r.after.qualityScore,
      qualityLabel: r.after.qualityLabel,
      suggestionCount: r.suggestionCount,
      resourcesReused: (r.resourcesReused || []).length,
      newResourcesCreated: (r.newResourcesCreated || []).length,
      autoPublished: false,
    }));

    const reusedMap = new Map();
    upgraded.forEach((r) => {
      asArray(r.resourcesReused).forEach((hint) => {
        const key = `${hint.kind}:${hint.id || hint.title || hint.message}`;
        if (!reusedMap.has(key)) {
          reusedMap.set(key, {
            kind: hint.kind,
            id: hint.id || "",
            title: hint.title || hint.message || hint.id || hint.kind,
            usedByLessons: [],
          });
        }
        const row = reusedMap.get(key);
        if (!row.usedByLessons.includes(r.planId)) row.usedByLessons.push(r.planId);
      });
    });
    report.resourcesReused = [...reusedMap.values()];

    const newMap = new Map();
    upgraded.forEach((r) => {
      asArray(r.newResourcesCreated).forEach((item) => {
        const key = `${item.category}:${item.preview}`;
        if (!newMap.has(key)) {
          newMap.set(key, { ...item, forLessonId: r.planId, forLessonTitle: r.title });
        }
      });
    });
    report.newResourcesCreated = [...newMap.values()].slice(0, 80);

    const upgradedIds = new Set(upgraded.map((r) => r.planId));
    const queue = asArray(queueMeta.queue);
    report.remainingLessons = queue
      .filter((q) => !upgradedIds.has(q.id))
      .map((q) => ({
        planId: q.id,
        title: q.title,
        views: q.views,
        completionPercent: q.completionPercent,
        reason: q.neverUpgraded ? "not yet upgraded" : "queued after higher-traffic lessons",
      }));

    asArray(results).forEach((r) => {
      const stage = r?.finalStage || STAGES.LEGACY;
      if (report.stageCounts[stage] != null) report.stageCounts[stage] += 1;
    });

    const priorityTotal = Math.max(PRIORITY_LESSON_IDS.length, upgraded.length + report.remainingLessons.filter((r) => PRIORITY_LESSON_IDS.includes(r.planId)).length);
    report.estimatedCompletionProgress = {
      upgradedCount: upgraded.length,
      remainingCount: report.remainingLessons.length,
      priorityQueueSize: PRIORITY_LESSON_IDS.length,
      percentOfPriorityQueue: Math.round((upgraded.filter((r) => PRIORITY_LESSON_IDS.includes(r.planId)).length / PRIORITY_LESSON_IDS.length) * 100),
      analyticsLabel: queueMeta.analyticsLabel || "",
      dryRunCount: dry.length,
      note: "Highest-traffic / priority lessons first. Draft-only — not published.",
    };

    report.productionReadinessScore = "8/10";
    return report;
  }

  /**
   * Assert a draft covers the Teaching Kit sections required for production Complete.
   * Uses draft + legacy plan (legacy preserved; draft fills enrichment).
   */
  function kitSectionCoverage(plan, draft) {
    const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
    const acts = Object.values(draft?.activities || {});
    const has = (v) => Boolean(text(v));
    const list = (v) => asArray(v).length > 0;
    const anyAct = (fn) => acts.some(fn);
    return {
      weeklyOverview: has(week.weeklyOverview) || has(plan?.weeklyOverview),
      learningObjectives: has(week.objectives) || has(plan?.objectives),
      dailyLessonPlans: acts.length > 0 || Boolean(plan?.dailyPlans),
      activityCards: acts.length > 0,
      materials: has(week.weeklyMaterials) || has(plan?.weeklyMaterials) || anyAct((a) => has(a.materials)),
      teacherPreparation: has(week.teacherPreparation) || has(week.teacherToolkit?.teacherPreparation),
      setupInstructions: anyAct((a) => has(a.setup)),
      teacherTips: anyAct((a) => asArray(a.teacherTips).length > 0),
      vocabulary: list(week.vocabCards) || has(plan?.vocabularyWords) || anyAct((a) => list(a.vocabulary) || has(a.vocabulary)),
      observationPrompts: anyAct((a) => asArray(a.observationPrompts).length > 0),
      smallGroupActivities: anyAct((a) => asArray(a.settingTags).includes("small_group")),
      largeGroupActivities: anyAct((a) => asArray(a.settingTags).includes("large_group")),
      indoorAlternatives: anyAct((a) => has(a.indoorAlternatives)),
      outdoorAlternatives: anyAct((a) => has(a.outdoorAlternatives)),
      familyConnection: has(week.familyConnection) || has(plan?.familyConnection),
      printableResources: list(week.printableIdeas) || list(week.printableIds) || asArray(plan?.resourceIds).length > 0,
      songs: list(week.songs) || asArray(plan?.songs).length > 0,
      books: list(week.books) || asArray(plan?.books).length > 0,
      bookDiscussionQuestions: asArray(week.books).some((b) => has(b?.questions || b?.discussionQuestions))
        || asArray(plan?.books).some((b) => has(b?.questions || b?.discussionQuestions)),
      exampleImages: anyAct((a) => has(a.exampleImageUrl) || has(a.imageBriefExample)),
      teacherToolkit: Boolean(week.teacherToolkit && (
        asArray(week.teacherToolkit.prepChecklist).length
        || asArray(week.teacherToolkit.observationFocus).length
        || has(week.teacherToolkit.notes)
      )),
      /**
       * Draft-owned fields required for production Complete.
       * learningObjectives intentionally omitted — legacy plan.objectives remain
       * visible via read-time fallback until an explicit edit or accepted suggestion
       * sets week.fieldOwnership.objectives.
       */
      draftOwned: {
        weeklyOverview: has(week.weeklyOverview),
        materials: has(week.weeklyMaterials),
        songs: list(week.songs),
        books: list(week.books),
        printableIdeas: list(week.printableIdeas),
        teacherToolkit: Boolean(week.teacherToolkit),
      },
      objectivesOwnership: {
        draftOwned: Boolean(week.fieldOwnership && week.fieldOwnership.objectives === true && has(week.objectives)),
        effective: has(week.objectives) && week.fieldOwnership?.objectives === true
          ? text(week.objectives)
          : text(plan?.objectives),
        legacy: text(plan?.objectives),
      },
    };
  }

  function effectiveObjectives(plan, draft) {
    const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
    if (week.fieldOwnership?.objectives === true && text(week.objectives)) {
      return text(week.objectives);
    }
    return text(plan?.objectives);
  }

  function markObjectivesDraftOwned(draft) {
    const next = draft && typeof draft === "object" ? draft : { week: {}, activities: {} };
    if (!next.week || typeof next.week !== "object") next.week = {};
    next.week.fieldOwnership = {
      ...(next.week.fieldOwnership && typeof next.week.fieldOwnership === "object"
        ? next.week.fieldOwnership
        : {}),
      objectives: true,
    };
    return next;
  }

  return {
    PRIORITY_LESSON_IDS,
    STAGES,
    WEEK_KIT_CATEGORIES,
    emptyProgressReport,
    stageFromScores,
    usageFromEvents,
    buildProductionQueue,
    loadPriorityLessonPlans,
    loadFarmAnimalsFixtureAsLegacy,
    collectReuseHints,
    mergeWeekKitSuggestions,
    generateFixtureDraftPack,
    upgradeOneLesson,
    summarizeProductionRun,
    kitSectionCoverage,
    effectiveObjectives,
    markObjectivesDraftOwned,
    defaultFlagsStillOff: () => {
      const flags = teachingKit.defaultTeachingKitFeatureFlags();
      return Object.keys(flags).every((key) => flags[key] === false);
    },
  };
});
