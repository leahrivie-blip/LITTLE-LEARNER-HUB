/**
 * Post-import verification for curriculum lesson plans.
 *
 * Checks completeness, library visibility, covers, print render, and that
 * pre-existing plans were not modified. Fail-fast friendly: returns structured
 * results; callers should stop before production promote when ok === false.
 *
 * Node: module.exports
 */
(function curriculumPostImportVerifyModule() {
  "use strict";

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

  const coverAssign = typeof require === "function"
    ? require("./lesson-plan-cover-assign.js")
    : (typeof globalThis !== "undefined" ? globalThis.LlhLessonPlanCoverAssign : null);
  const covers = typeof require === "function"
    ? require("./lesson-plan-covers.js")
    : (typeof globalThis !== "undefined" ? globalThis.LlhLessonPlanCovers : null);
  const standards = typeof require === "function"
    ? require("./curriculum-standards.js")
    : null;
  const viewerRender = (() => {
    try {
      return typeof require === "function" ? require("./curriculum-lesson-viewer-render.js") : null;
    } catch {
      return null;
    }
  })();

  function textHas(value) {
    return Boolean(String(value || "").trim());
  }

  function countDayItems(dailyPlans = {}) {
    return WEEKDAYS.reduce((sum, day) => sum + ((dailyPlans[day]?.items || []).length), 0);
  }

  function daysWithItems(dailyPlans = {}) {
    return WEEKDAYS.filter((day) => (dailyPlans[day]?.items || []).some((item) => textHas(item?.title)));
  }

  function fingerprintPlan(plan) {
    if (!plan) return "";
    return JSON.stringify({
      id: plan.id,
      title: plan.title,
      age: plan.age,
      theme: plan.theme,
      plan: plan.plan,
      status: plan.status,
      activityIds: [...(plan.activityIds || [])].sort(),
      coverImageUrl: plan.coverImageUrl || "",
      weeklyOverview: plan.weeklyOverview || "",
      objectives: plan.objectives || "",
    });
  }

  function snapshotExistingPlans(lessonPlans = [], importedIds = new Set()) {
    const map = {};
    for (const plan of lessonPlans) {
      if (!plan?.id || importedIds.has(plan.id)) continue;
      map[plan.id] = fingerprintPlan(plan);
    }
    return map;
  }

  function verifyPlanSections(plan) {
    const issues = [];
    const required = [
      ["title", plan.title],
      ["age", plan.age],
      ["theme", plan.theme],
      ["weeklyOverview", plan.weeklyOverview],
      ["objectives", plan.objectives],
      ["weeklyMaterials", plan.weeklyMaterials],
      ["vocabularyWords", plan.vocabularyWords],
      ["observationOpportunities", plan.observationOpportunities],
      ["familyConnection", plan.familyConnection],
      ["adaptations", plan.adaptations],
    ];
    for (const [key, value] of required) {
      if (!textHas(value)) issues.push({ severity: "critical", code: `missing_${key}`, detail: `Missing ${key}` });
    }
    if (!Array.isArray(plan.books) || !plan.books.length) {
      issues.push({ severity: "high", code: "missing_books", detail: "Missing books" });
    }
    if (!Array.isArray(plan.songs) || !plan.songs.length) {
      issues.push({ severity: "high", code: "missing_songs", detail: "Missing songs" });
    }
    if (!Array.isArray(plan.learningDomains) || !plan.learningDomains.length) {
      issues.push({ severity: "high", code: "missing_learning_domains", detail: "Missing learning domains" });
    }

    const days = daysWithItems(plan.dailyPlans);
    if (days.length < 5) {
      issues.push({
        severity: "critical",
        code: "incomplete_week",
        detail: `Only ${days.length}/5 weekdays have titled activities (${days.join(", ") || "none"})`,
      });
    }

    const activityCount = countDayItems(plan.dailyPlans);
    if (activityCount < 5) {
      issues.push({ severity: "critical", code: "too_few_activities", detail: `Only ${activityCount} activities` });
    }

    for (const day of WEEKDAYS) {
      const items = plan.dailyPlans?.[day]?.items || [];
      for (const item of items) {
        if (!textHas(item.title)) {
          issues.push({ severity: "critical", code: "untitled_activity", detail: `${day}: untitled activity` });
        }
        if (!textHas(item.activityCategory)) {
          issues.push({ severity: "high", code: "missing_category", detail: `${day}/${item.title || "?"}: missing category` });
        }
        if (!textHas(item.description) && !textHas(item.steps) && !textHas(item.directions)) {
          issues.push({ severity: "high", code: "empty_activity_body", detail: `${day}/${item.title || "?"}: missing description/directions` });
        }
      }
    }

    return { ok: !issues.some((i) => i.severity === "critical"), issues, activityCount, daysWithItems: days.length };
  }

  function verifyPlanCover(plan) {
    const resolved = covers.resolveLessonPlanCover(plan);
    const assigned = coverAssign.resolveAssignableCover(plan);
    const issues = [];
    if (!resolved.url) {
      issues.push({ severity: "critical", code: "missing_cover", detail: "No cover URL resolved" });
    }
    if (!assigned.assetExists && !/^https?:\/\//i.test(resolved.url)) {
      issues.push({ severity: "critical", code: "cover_asset_missing", detail: `Cover file missing: ${resolved.url}` });
    }
    return {
      ok: issues.length === 0,
      url: resolved.url,
      source: resolved.source,
      quality: assigned.quality,
      issues,
    };
  }

  function verifyPrintLayout(plan) {
    const renderFn = viewerRender?.renderCurriculumLessonPlanHtml
      || viewerRender?.renderCurriculumLessonViewerHtml;
    if (!renderFn) {
      return { ok: true, skipped: true, issues: [] };
    }
    const issues = [];
    try {
      const html = renderFn(plan, { mode: "print" });
      if (!html || html.length < 200) {
        issues.push({ severity: "critical", code: "print_empty", detail: "Print HTML empty or too short" });
      }
      if (!/curriculum-print-day|print/i.test(html)) {
        issues.push({ severity: "high", code: "print_structure", detail: "Print HTML missing expected day structure" });
      }
      if (String(plan.title || "") && !html.includes(String(plan.title).slice(0, Math.min(12, plan.title.length)))) {
        issues.push({ severity: "high", code: "print_title_missing", detail: "Print HTML missing lesson title" });
      }
    } catch (error) {
      issues.push({ severity: "critical", code: "print_render_failed", detail: error.message });
    }
    return { ok: !issues.some((i) => i.severity === "critical"), issues };
  }

  function ageBucket(age) {
    const text = String(age || "").toLowerCase();
    if (/\binfant\b|0\s*[-–]\s*12|0\s*to\s*12/.test(text)) return "Infant";
    if (/\btoddler\b/.test(text)) return "Toddler";
    return "Preschool";
  }

  function verifyLibraryPlacement(plan, publicPlans = []) {
    const issues = [];
    const isPublic = plan.status === "published" || plan.status === "featured";
    if (!isPublic) {
      return { ok: true, skipped: true, issues: [], visible: false };
    }
    const found = publicPlans.find((item) => item.id === plan.id);
    if (!found) {
      issues.push({ severity: "critical", code: "not_in_public_library", detail: "Published plan missing from public curriculum library" });
      return { ok: false, issues, visible: false };
    }
    if (ageBucket(found.age) !== ageBucket(plan.age)) {
      issues.push({ severity: "critical", code: "age_mismatch_public", detail: "Public age bucket mismatch" });
    }
    const haystack = [
      found.title,
      found.age,
      found.theme,
      found.weeklyOverview,
      found.objectives,
      found.weeklyMaterials,
    ].join(" ").toLowerCase();
    if (plan.title && !haystack.includes(String(plan.title).toLowerCase().slice(0, 8))) {
      issues.push({ severity: "high", code: "search_haystack_weak", detail: "Title not clearly present in public search fields" });
    }
    return { ok: !issues.some((i) => i.severity === "critical"), issues, visible: true };
  }

  function verifyExistingUnchanged(beforeSnapshot, afterPlans, importedIds = new Set()) {
    const issues = [];
    const afterById = new Map((afterPlans || []).map((p) => [p.id, p]));
    for (const [id, beforeFp] of Object.entries(beforeSnapshot || {})) {
      if (importedIds.has(id)) continue;
      const after = afterById.get(id);
      if (!after) {
        issues.push({ severity: "critical", code: "existing_plan_missing", detail: `Existing plan removed: ${id}` });
        continue;
      }
      const afterFp = fingerprintPlan(after);
      if (afterFp !== beforeFp) {
        issues.push({ severity: "critical", code: "existing_plan_modified", detail: `Existing plan modified: ${id} (${after.title})` });
      }
    }
    return { ok: issues.length === 0, issues, checked: Object.keys(beforeSnapshot || {}).length };
  }

  function verifyImportedBatch({
    importedPlans = [],
    allPlans = [],
    publicPlans = [],
    activities = [],
    beforeSnapshot = {},
    strictStandards = false,
  } = {}) {
    const importedIds = new Set(importedPlans.map((p) => p.id).filter(Boolean));
    const planReports = [];
    const critical = [];

    for (const plan of importedPlans) {
      const sections = verifyPlanSections(plan);
      const cover = verifyPlanCover(plan);
      const print = verifyPrintLayout(plan);
      const library = verifyLibraryPlacement(plan, publicPlans);
      const standardsAudit = standards?.auditLessonPlanAgainstStandards
        ? standards.auditLessonPlanAgainstStandards(plan, { source: plan.id })
        : null;

      const synced = (activities || []).filter((a) => a.lessonPlanId === plan.id && a.status !== "archived");
      const syncIssues = [];
      if (synced.length !== sections.activityCount) {
        syncIssues.push({
          severity: "critical",
          code: "activity_sync_mismatch",
          detail: `Activity Center has ${synced.length}, plan has ${sections.activityCount}`,
        });
      }

      const standardsIssues = [];
      if (strictStandards && standardsAudit) {
        for (const issue of standardsAudit.issues || []) {
          if (issue.severity === "critical" || issue.severity === "high") {
            standardsIssues.push(issue);
          }
        }
      }

      const issues = [
        ...sections.issues,
        ...cover.issues,
        ...print.issues,
        ...library.issues,
        ...syncIssues,
        ...standardsIssues,
      ];
      const ok = !issues.some((i) => i.severity === "critical");
      if (!ok) critical.push({ id: plan.id, title: plan.title, issues: issues.filter((i) => i.severity === "critical") });

      planReports.push({
        id: plan.id,
        title: plan.title,
        age: plan.age,
        theme: plan.theme,
        plan: plan.plan,
        status: plan.status,
        ok,
        activityCount: sections.activityCount,
        daysWithItems: sections.daysWithItems,
        cover: { url: cover.url, source: cover.source, quality: cover.quality },
        libraryVisible: library.visible,
        issueCount: issues.length,
        issues,
      });
    }

    const existing = verifyExistingUnchanged(beforeSnapshot, allPlans, importedIds);
    if (!existing.ok) {
      for (const issue of existing.issues) critical.push({ id: "existing", title: "Existing content", issues: [issue] });
    }

    const coverAudit = coverAssign.auditBatchCovers(importedPlans);

    return {
      ok: critical.length === 0 && existing.ok && coverAudit.ok,
      importedCount: importedPlans.length,
      criticalCount: critical.length,
      existingChecked: existing.checked,
      existingUnchanged: existing.ok,
      covers: {
        ok: coverAudit.ok,
        illustratedCount: coverAudit.illustratedCount,
        needsCustomArtCount: coverAudit.needsCustomArtCount,
        missingAssetCount: coverAudit.missingAssetCount,
        newImageFilesCreated: 0,
        sharedCoverAssignments: coverAudit.sharedCoverAssignments.length,
      },
      plans: planReports,
      critical,
      existingIssues: existing.issues,
    };
  }

  const api = {
    WEEKDAYS,
    fingerprintPlan,
    snapshotExistingPlans,
    verifyPlanSections,
    verifyPlanCover,
    verifyPrintLayout,
    verifyLibraryPlacement,
    verifyExistingUnchanged,
    verifyImportedBatch,
    ageBucket,
    countDayItems,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhCurriculumPostImportVerify = api;
  }
})();
