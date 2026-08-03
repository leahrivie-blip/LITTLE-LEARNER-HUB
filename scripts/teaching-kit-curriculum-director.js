/**
 * AI Curriculum Director — library-wide curriculum intelligence.
 * Understands the entire Little Learner Hub curriculum (themes, printables,
 * vocabulary, songs, books, activities, observations, family, tips) so every
 * upgrade can reuse instead of recreate.
 *
 * Master reusable resources live independently of lessons and can link into many.
 * Updating a master updates linked lesson draft references — never auto-publishes.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitCurriculumDirector = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function loadReusable() {
    if (root && root.LLHTeachingKitReusableLibrary) return root.LLHTeachingKitReusableLibrary;
    if (typeof module === "object" && typeof require === "function") {
      try { return require("./teaching-kit-reusable-library.js"); } catch (_e) { return null; }
    }
    return null;
  }

  function loadEnrichment() {
    if (root && root.LLHTeachingKitEnrichment) return root.LLHTeachingKitEnrichment;
    if (typeof module === "object" && typeof require === "function") {
      try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
    }
    return null;
  }

  function normalizeKey(value) {
    return text(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ageBand(age) {
    const a = normalizeKey(age);
    if (/infant|0\s*[-–]\s*12|0\s*to\s*12|baby/.test(a)) return "infant";
    if (/toddler|12\s*[-–]\s*24|18\s*[-–]\s*24|1\s*[-–]\s*2|2\s*[-–]\s*3/.test(a)) return "toddler";
    if (/pre.?k|preschool|3\s*[-–]\s*4|3\s*[-–]\s*5|4\s*[-–]\s*5/.test(a)) return "preschool";
    if (/school.?age|5\s*[-–]\s*8|k\b|kindergarten/.test(a)) return "school_age";
    return a ? "other" : "unspecified";
  }

  function emptyDirectorState() {
    return {
      masterResources: [],
      planningNotes: [],
      updatedAt: "",
    };
  }

  function normalizeMasterResource(raw, index = 0) {
    if (!raw || typeof raw !== "object") return null;
    const type = text(raw.type).toLowerCase().replace(/\s+/g, "_") || "toolkit";
    const title = text(raw.title || raw.name).slice(0, 160);
    const body = text(raw.body || raw.text || raw.content).slice(0, 8000);
    if (!title && !body) return null;
    return {
      id: text(raw.id).slice(0, 80) || `master-${type}-${index + 1}-${Date.now().toString(36)}`,
      type,
      title: title || body.slice(0, 60),
      body,
      theme: text(raw.theme).slice(0, 80),
      ageBands: asArray(raw.ageBands).map((a) => text(a).slice(0, 40)).filter(Boolean).slice(0, 8),
      tags: asArray(raw.tags).map((t) => text(t).slice(0, 40)).filter(Boolean).slice(0, 16),
      linkedPlanIds: asArray(raw.linkedPlanIds).map((id) => text(id).slice(0, 160)).filter(Boolean).slice(0, 200),
      previewImageUrl: text(raw.previewImageUrl).slice(0, 500),
      printableUrl: text(raw.printableUrl).slice(0, 500),
      accessibilityText: text(raw.accessibilityText).slice(0, 2000),
      needsUpdate: raw.needsUpdate === true,
      createdAt: text(raw.createdAt) || new Date().toISOString(),
      updatedAt: text(raw.updatedAt) || new Date().toISOString(),
      useCount: Math.max(0, Number(raw.useCount) || 0),
    };
  }

  function normalizeDirectorState(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const masters = asArray(input.masterResources).map(normalizeMasterResource).filter(Boolean).slice(0, 2000);
    return {
      masterResources: masters,
      planningNotes: asArray(input.planningNotes).slice(0, 40).map((n) => ({
        question: text(n.question).slice(0, 400),
        answer: text(n.answer).slice(0, 4000),
        at: text(n.at) || "",
      })),
      updatedAt: text(input.updatedAt),
    };
  }

  function songTitles(plan, draftWeek) {
    return [
      ...asArray(plan?.songs),
      ...asArray(draftWeek?.songs),
    ].map((s) => text(s?.title || s)).filter(Boolean);
  }

  function bookTitles(plan, draftWeek) {
    return [
      ...asArray(plan?.books),
      ...asArray(draftWeek?.books),
    ].map((b) => text(b?.title || b)).filter(Boolean);
  }

  function lessonHasPrintables(plan, draftWeek, resourcesById) {
    if (asArray(plan?.resourceIds).some((id) => resourcesById.has(text(id)))) return true;
    if (asArray(draftWeek?.printableIdeas).length) return true;
    if (asArray(draftWeek?.printablePacks).length) return true;
    if (asArray(draftWeek?.vocabCards).length) return true;
    return false;
  }

  function lessonHasExampleImages(plan, activities, draftActs) {
    const list = asArray(activities);
    if (!list.length) {
      return Boolean(plan?.setupImageUrl || plan?.exampleImageUrl);
    }
    return list.some((act) => {
      const key = text(act.id || act.itemId);
      const patch = draftActs[key] || {};
      return Boolean(
        act.setupImageUrl
        || act.exampleImageUrl
        || patch.setupImageUrl
        || patch.exampleImageUrl
        || text(patch.imageBriefSetup)
        || text(patch.imageBriefExample),
      );
    });
  }

  function hasBeenUpgraded(plan) {
    const draft = plan?.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? plan.enrichmentDraft
      : null;
    if (!draft) return false;
    const weekKeys = Object.keys(draft.week || {}).length;
    const actKeys = Object.keys(draft.activities || {}).length;
    const history = asArray(plan.enrichmentPublishHistory).length;
    return weekKeys > 0 || actKeys > 0 || history > 0 || text(plan.teachingKit?.completeness) === "complete";
  }

  function completionPercentForPlan(plan, activities) {
    const enrich = loadEnrichment();
    if (enrich?.computeCompletionPercent) {
      try {
        return Number(enrich.computeCompletionPercent(plan, activities, plan.enrichmentDraft || null)) || 0;
      } catch (_e) {
        /* fall through */
      }
    }
    // Lightweight fallback when enrichment helpers unavailable
    let score = 0;
    const checks = [
      text(plan?.weeklyOverview),
      text(plan?.familyConnection),
      text(plan?.vocabularyWords),
      asArray(plan?.books).length,
      asArray(plan?.songs).length,
      asArray(plan?.resourceIds).length,
      hasBeenUpgraded(plan),
    ];
    checks.forEach((ok) => { if (ok) score += 1; });
    return Math.round((score / checks.length) * 100);
  }

  /**
   * Index the entire curriculum so upgrades know what already exists.
   */
  function buildCurriculumIntelligence(curriculum = {}, directorState = null, assistantState = null) {
    const plans = asArray(curriculum.lessonPlans);
    const activities = asArray(curriculum.activities);
    const resources = asArray(curriculum.resources);
    const director = normalizeDirectorState(directorState);
    const reusable = loadReusable();
    const library = reusable?.normalizeLibrary
      ? reusable.normalizeLibrary(assistantState?.reusableLibrary || {})
      : { items: [] };

    const themes = new Map();
    const printables = [];
    const vocabulary = [];
    const songs = new Map();
    const books = new Map();
    const activityIndex = [];
    const observations = [];
    const family = [];
    const teacherTips = [];

    resources.forEach((res) => {
      printables.push({
        id: text(res.id),
        title: text(res.title || res.name),
        lessonPlanIds: asArray(res.lessonPlanIds),
        kind: "curriculum_resource",
      });
    });

    director.masterResources.forEach((master) => {
      if (master.type === "printable" || master.type === "vocabulary") {
        printables.push({
          id: master.id,
          title: master.title,
          lessonPlanIds: master.linkedPlanIds,
          kind: "master_resource",
          type: master.type,
        });
      }
      if (master.type === "vocabulary") {
        vocabulary.push({
          id: master.id,
          title: master.title,
          body: master.body,
          theme: master.theme,
          source: "master",
          linkedPlanIds: master.linkedPlanIds,
        });
      }
    });

    asArray(library.items).forEach((item) => {
      if (item.type === "vocabulary") {
        vocabulary.push({
          id: item.id,
          title: item.title,
          body: item.body,
          theme: item.theme,
          source: "reusable_library",
          linkedPlanIds: item.sourcePlanId ? [item.sourcePlanId] : [],
        });
      }
      if (item.type === "printable") {
        printables.push({
          id: item.id,
          title: item.title,
          lessonPlanIds: item.sourcePlanId ? [item.sourcePlanId] : [],
          kind: "reusable_library",
        });
      }
      if (item.type === "observation") {
        observations.push({ id: item.id, title: item.title, body: item.body, source: "reusable_library" });
      }
      if (item.type === "family_connection") {
        family.push({ id: item.id, title: item.title, body: item.body, source: "reusable_library" });
      }
      if (item.type === "teacher_tip") {
        teacherTips.push({ id: item.id, title: item.title, body: item.body, source: "reusable_library" });
      }
      if (item.type === "song") {
        songs.set(normalizeKey(item.title), { title: item.title, source: "reusable_library", planIds: [] });
      }
      if (item.type === "book") {
        books.set(normalizeKey(item.title), { title: item.title, source: "reusable_library", planIds: [] });
      }
    });

    plans.forEach((plan) => {
      const theme = text(plan.theme || plan.title) || "Untitled";
      const themeKey = normalizeKey(theme);
      if (!themes.has(themeKey)) {
        themes.set(themeKey, {
          theme,
          planIds: [],
          ages: new Set(),
          completionScores: [],
        });
      }
      const themeRow = themes.get(themeKey);
      themeRow.planIds.push(plan.id);
      themeRow.ages.add(ageBand(plan.age));

      const draftWeek = plan.enrichmentDraft?.week || {};
      const draftActs = plan.enrichmentDraft?.activities || {};
      const planActs = activities.filter((a) => a.lessonPlanId === plan.id);
      const pct = completionPercentForPlan(plan, planActs);
      themeRow.completionScores.push(pct);

      if (text(plan.vocabularyWords)) {
        vocabulary.push({
          id: `plan-vocab-${plan.id}`,
          title: `${theme} vocabulary`,
          body: text(plan.vocabularyWords),
          theme,
          source: "lesson",
          linkedPlanIds: [plan.id],
        });
      }
      asArray(draftWeek.vocabCards).forEach((card, i) => {
        vocabulary.push({
          id: `draft-vocab-${plan.id}-${i}`,
          title: text(card?.title || card).slice(0, 80) || `${theme} vocab card`,
          body: text(card?.body || card),
          theme,
          source: "draft",
          linkedPlanIds: [plan.id],
        });
      });

      songTitles(plan, draftWeek).forEach((title) => {
        const key = normalizeKey(title);
        const row = songs.get(key) || { title, source: "lesson", planIds: [] };
        if (!row.planIds.includes(plan.id)) row.planIds.push(plan.id);
        songs.set(key, row);
      });
      bookTitles(plan, draftWeek).forEach((title) => {
        const key = normalizeKey(title);
        const row = books.get(key) || { title, source: "lesson", planIds: [] };
        if (!row.planIds.includes(plan.id)) row.planIds.push(plan.id);
        books.set(key, row);
      });

      if (text(plan.familyConnection) || text(draftWeek.familyConnection)) {
        family.push({
          id: `family-${plan.id}`,
          title: `${theme} family connection`,
          body: text(draftWeek.familyConnection || plan.familyConnection),
          source: "lesson",
          planId: plan.id,
        });
      }

      planActs.forEach((act) => {
        activityIndex.push({
          id: text(act.id),
          title: text(act.title),
          planId: plan.id,
          theme,
          age: text(plan.age),
        });
        const key = text(act.id || act.itemId);
        const patch = draftActs[key] || {};
        asArray(patch.observationPrompts).forEach((obs, i) => {
          observations.push({
            id: `obs-${key}-${i}`,
            title: text(obs).slice(0, 80),
            body: text(obs),
            source: "draft",
            planId: plan.id,
            activityId: key,
          });
        });
        asArray(patch.teacherTips).forEach((tip, i) => {
          teacherTips.push({
            id: `tip-${key}-${i}`,
            title: text(tip).slice(0, 80),
            body: text(tip),
            source: "draft",
            planId: plan.id,
            activityId: key,
          });
        });
      });
    });

    const themeList = [...themes.values()].map((row) => {
      const scores = row.completionScores;
      const avg = scores.length
        ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length)
        : 0;
      return {
        theme: row.theme,
        planCount: row.planIds.length,
        planIds: row.planIds,
        ages: [...row.ages],
        averageCompletion: avg,
        incomplete: avg < 75,
      };
    }).sort((a, b) => a.averageCompletion - b.averageCompletion);

    return {
      themes: themeList,
      printables,
      vocabulary,
      songs: [...songs.values()],
      books: [...books.values()],
      activities: activityIndex,
      observations,
      family,
      teacherTips,
      masterResources: director.masterResources,
      reusableLibraryCount: asArray(library.items).length,
      planCount: plans.length,
      resourceCount: resources.length,
      builtAt: new Date().toISOString(),
    };
  }

  function lessonCoverageRow(plan, activities, resourcesById, usage = {}) {
    const draftWeek = plan.enrichmentDraft?.week || {};
    const draftActs = plan.enrichmentDraft?.activities || {};
    const planActs = asArray(activities).filter((a) => a.lessonPlanId === plan.id);
    const completion = completionPercentForPlan(plan, planActs);
    const missing = [];
    if (!lessonHasPrintables(plan, draftWeek, resourcesById)) missing.push("printables");
    if (!songTitles(plan, draftWeek).length) missing.push("songs");
    if (!bookTitles(plan, draftWeek).length) missing.push("books");
    if (!lessonHasExampleImages(plan, planActs, draftActs)) missing.push("example_images");
    if (!(text(plan.familyConnection) || text(draftWeek.familyConnection))) missing.push("family");
    if (!(text(plan.vocabularyWords) || asArray(draftWeek.vocabCards).length)) missing.push("vocabulary");
    const upgraded = hasBeenUpgraded(plan);
    return {
      id: plan.id,
      title: text(plan.title) || "Untitled",
      theme: text(plan.theme) || text(plan.title),
      age: text(plan.age),
      ageBand: ageBand(plan.age),
      completionPercent: completion,
      missing,
      upgraded,
      neverUpgraded: !upgraded,
      views: Number(usage.views) || 0,
      downloads: Number(usage.downloads) || 0,
      assigns: Number(usage.assigns) || 0,
    };
  }

  function buildCoverageDashboard(curriculum = {}, usageByPlanId = {}) {
    const plans = asArray(curriculum.lessonPlans);
    const activities = asArray(curriculum.activities);
    const resources = asArray(curriculum.resources);
    const resourcesById = new Map(resources.map((r) => [text(r.id), r]));
    const rows = plans.map((plan) => lessonCoverageRow(
      plan,
      activities,
      resourcesById,
      usageByPlanId[plan.id] || {},
    ));

    const byAge = {};
    rows.forEach((row) => {
      const band = row.ageBand;
      if (!byAge[band]) byAge[band] = { ageBand: band, lessons: 0, avgCompletion: 0, missingToolkits: 0, scores: [] };
      byAge[band].lessons += 1;
      byAge[band].scores.push(row.completionPercent);
      if (row.missing.includes("printables") || row.missing.length >= 3) byAge[band].missingToolkits += 1;
    });
    Object.values(byAge).forEach((band) => {
      band.avgCompletion = band.scores.length
        ? Math.round(band.scores.reduce((s, n) => s + n, 0) / band.scores.length)
        : 0;
      delete band.scores;
    });

    const intel = buildCurriculumIntelligence(curriculum);
    return {
      summary: {
        lessonCount: rows.length,
        neverUpgraded: rows.filter((r) => r.neverUpgraded).length,
        missingPrintables: rows.filter((r) => r.missing.includes("printables")).length,
        missingSongs: rows.filter((r) => r.missing.includes("songs")).length,
        missingBooks: rows.filter((r) => r.missing.includes("books")).length,
        missingExampleImages: rows.filter((r) => r.missing.includes("example_images")).length,
        incompleteThemes: intel.themes.filter((t) => t.incomplete).length,
      },
      incompleteThemes: intel.themes.filter((t) => t.incomplete).slice(0, 24),
      weakestAgeGroups: Object.values(byAge).sort((a, b) => a.avgCompletion - b.avgCompletion),
      missingPrintables: rows.filter((r) => r.missing.includes("printables")).slice(0, 40),
      missingSongs: rows.filter((r) => r.missing.includes("songs")).slice(0, 40),
      missingBooks: rows.filter((r) => r.missing.includes("books")).slice(0, 40),
      missingExampleImages: rows.filter((r) => r.missing.includes("example_images")).slice(0, 40),
      neverUpgraded: rows.filter((r) => r.neverUpgraded).slice(0, 40),
      mostViewed: [...rows].sort((a, b) => b.views - a.views).slice(0, 20),
      lowestCompletion: [...rows].sort((a, b) => a.completionPercent - b.completionPercent).slice(0, 20),
      rows,
      builtAt: new Date().toISOString(),
    };
  }

  function jaccard(a, b) {
    const reusable = loadReusable();
    if (reusable?.jaccard) return reusable.jaccard(a, b);
    const A = new Set(normalizeKey(a).split(" ").filter((t) => t.length > 2));
    const B = new Set(normalizeKey(b).split(" ").filter((t) => t.length > 2));
    if (!A.size || !B.size) return 0;
    let overlap = 0;
    A.forEach((t) => { if (B.has(t)) overlap += 1; });
    return overlap / (A.size + B.size - overlap);
  }

  function buildRecommendations(curriculum = {}, directorState = null, assistantState = null, usageByPlanId = {}) {
    const coverage = buildCoverageDashboard(curriculum, usageByPlanId);
    const intel = buildCurriculumIntelligence(curriculum, directorState, assistantState);
    const recommendations = [];

    const themes = intel.themes;
    if (themes.length >= 2) {
      const strongest = [...themes].sort((a, b) => b.averageCompletion - a.averageCompletion)[0];
      const weakest = themes[0];
      if (strongest && weakest && strongest.theme !== weakest.theme) {
        recommendations.push({
          severity: "high",
          code: "theme_strength_gap",
          message: `Your ${weakest.theme} curriculum is weaker than ${strongest.theme} (${weakest.averageCompletion}% vs ${strongest.averageCompletion}% average completion).`,
        });
      }
    }

    const ages = coverage.weakestAgeGroups || [];
    if (ages.length >= 2) {
      const weak = ages[0];
      const strong = [...ages].sort((a, b) => b.avgCompletion - a.avgCompletion)[0];
      if (weak && strong && weak.ageBand !== strong.ageBand) {
        recommendations.push({
          severity: "high",
          code: "age_band_gap",
          message: `${strong.ageBand.replace(/_/g, " ")} has stronger kits (${strong.avgCompletion}%) but ${weak.ageBand.replace(/_/g, " ")} is behind (${weak.avgCompletion}%) — ${weak.missingToolkits} lesson(s) need toolkit work.`,
        });
      }
    }

    coverage.missingBooks.slice(0, 5).forEach((row) => {
      recommendations.push({
        severity: "medium",
        code: "needs_books",
        message: `${row.title} needs books.`,
        planId: row.id,
      });
    });

    // Duplicate printables
    const printableGroups = new Map();
    intel.printables.forEach((p) => {
      const key = normalizeKey(p.title);
      if (!key) return;
      if (!printableGroups.has(key)) printableGroups.set(key, []);
      printableGroups.get(key).push(p);
    });
    printableGroups.forEach((group, key) => {
      if (group.length >= 2) {
        recommendations.push({
          severity: "medium",
          code: "duplicate_printables",
          message: `${group[0].title || key} has duplicate printables (${group.length} copies). Consolidate into one master resource.`,
        });
      }
    });

    // Vocab reuse opportunities
    const vocabClusters = [];
    intel.vocabulary.forEach((v) => {
      const match = vocabClusters.find((c) => jaccard(c.title + " " + c.body, v.title + " " + v.body) >= 0.45);
      if (match) {
        match.planIds = [...new Set([...match.planIds, ...asArray(v.linkedPlanIds)])];
        match.count += 1;
      } else {
        vocabClusters.push({
          title: v.title,
          body: v.body,
          planIds: [...asArray(v.linkedPlanIds)],
          count: 1,
        });
      }
    });
    vocabClusters
      .filter((c) => c.planIds.length >= 3 || c.count >= 3)
      .slice(0, 5)
      .forEach((c) => {
        recommendations.push({
          severity: "high",
          code: "vocab_reuse",
          message: `${Math.max(c.planIds.length, c.count)} lessons could reuse the same vocabulary cards (“${c.title}”).`,
        });
      });

    // Master printable reuse for themed lessons
    const masters = normalizeDirectorState(directorState).masterResources
      .filter((m) => m.type === "printable" || m.type === "vocabulary");
    themes.slice(0, 12).forEach((themeRow) => {
      const master = masters.find((m) => jaccard(m.theme || m.title, themeRow.theme) >= 0.35);
      if (master) {
        const unlinked = themeRow.planIds.filter((id) => !master.linkedPlanIds.includes(id));
        if (unlinked.length) {
          const samplePlan = asArray(curriculum.lessonPlans).find((p) => p.id === unlinked[0]);
          recommendations.push({
            severity: "medium",
            code: "link_master",
            message: `${samplePlan?.title || themeRow.theme} should reuse the “${master.title}” master resource.`,
            masterResourceId: master.id,
            planId: unlinked[0],
          });
        }
      }
    });

    return {
      recommendations: recommendations.slice(0, 40),
      coverageSummary: coverage.summary,
      builtAt: new Date().toISOString(),
    };
  }

  function assessResourceHealth(master, curriculum = {}) {
    const plans = asArray(curriculum.lessonPlans);
    const linked = asArray(master.linkedPlanIds).filter((id) => plans.some((p) => p.id === id));
    const flags = [];
    if (!linked.length) flags.push("never_used");
    if (master.needsUpdate) flags.push("needs_update");
    if (!text(master.previewImageUrl)) flags.push("missing_preview_image");
    if ((master.type === "printable" || master.type === "vocabulary") && !text(master.printableUrl) && !text(master.body)) {
      flags.push("missing_printable");
    }
    if (!text(master.accessibilityText)) flags.push("missing_accessibility_text");

    // Duplicate detection among masters + curriculum resources
    const titles = [
      ...asArray(curriculum.resources).map((r) => text(r.title || r.name)),
    ];
    const dup = titles.some((t) => t && normalizeKey(t) === normalizeKey(master.title));
    if (dup) flags.push("duplicate_detected");

    return {
      id: master.id,
      title: master.title,
      type: master.type,
      linkedBy: linked.length,
      linkedPlanIds: linked,
      flags,
      healthy: flags.length === 0,
    };
  }

  function buildResourceHealth(directorState, curriculum = {}) {
    const director = normalizeDirectorState(directorState);
    const rows = director.masterResources.map((m) => assessResourceHealth(m, curriculum));
    return {
      rows,
      neverUsed: rows.filter((r) => r.flags.includes("never_used")),
      duplicates: rows.filter((r) => r.flags.includes("duplicate_detected")),
      needsUpdate: rows.filter((r) => r.flags.includes("needs_update")),
      missingPreview: rows.filter((r) => r.flags.includes("missing_preview_image")),
      missingAccessibility: rows.filter((r) => r.flags.includes("missing_accessibility_text")),
      builtAt: new Date().toISOString(),
    };
  }

  function saveMasterResource(directorState, itemInput) {
    const director = normalizeDirectorState(directorState);
    const item = normalizeMasterResource(itemInput, director.masterResources.length);
    if (!item) return { director, saved: null, duplicate: null };
    const duplicate = director.masterResources.find((existing) => (
      existing.type === item.type
      && (
        normalizeKey(existing.title) === normalizeKey(item.title)
        || jaccard(`${existing.title} ${existing.body}`, `${item.title} ${item.body}`) >= 0.82
      )
    )) || null;
    if (duplicate && text(itemInput.id) !== duplicate.id) {
      return { director, saved: null, duplicate };
    }
    if (text(itemInput.id)) {
      director.masterResources = director.masterResources.map((m) => (m.id === item.id ? { ...m, ...item, updatedAt: new Date().toISOString() } : m));
    } else {
      director.masterResources = [item, ...director.masterResources].slice(0, 2000);
    }
    director.updatedAt = new Date().toISOString();
    return { director, saved: item, duplicate: null };
  }

  /**
   * Link a master resource into lessons. Returns draft patches only — never publishes.
   */
  function linkMasterToLessons(directorState, masterId, planIds = []) {
    const director = normalizeDirectorState(directorState);
    const master = director.masterResources.find((m) => m.id === masterId);
    if (!master) return { director, master: null, linkedPlanIds: [], draftPatches: [] };
    const nextIds = [...new Set([...master.linkedPlanIds, ...asArray(planIds).map((id) => text(id)).filter(Boolean)])].slice(0, 200);
    master.linkedPlanIds = nextIds;
    master.useCount = nextIds.length;
    master.updatedAt = new Date().toISOString();
    director.updatedAt = master.updatedAt;
    const draftPatches = nextIds.map((planId) => ({
      planId,
      enrichmentDraftPatch: {
        week: {
          linkedMasterResources: {
            [master.id]: {
              id: master.id,
              type: master.type,
              title: master.title,
              body: master.body,
              updatedAt: master.updatedAt,
            },
          },
        },
      },
    }));
    return { director, master, linkedPlanIds: nextIds, draftPatches, autoPublished: false };
  }

  /**
   * Propagate master content into linked lesson enrichment drafts (not published fields).
   */
  function propagateMasterUpdate(directorState, masterId) {
    const director = normalizeDirectorState(directorState);
    const master = director.masterResources.find((m) => m.id === masterId);
    if (!master) return { director, draftPatches: [], autoPublished: false };
    master.updatedAt = new Date().toISOString();
    director.updatedAt = master.updatedAt;
    const draftPatches = master.linkedPlanIds.map((planId) => ({
      planId,
      enrichmentDraftPatch: {
        week: {
          linkedMasterResources: {
            [master.id]: {
              id: master.id,
              type: master.type,
              title: master.title,
              body: master.body,
              updatedAt: master.updatedAt,
            },
          },
        },
      },
    }));
    return {
      director,
      master,
      draftPatches,
      message: `Updated ${draftPatches.length} linked lesson draft reference(s). Published lessons unchanged until you review and publish.`,
      autoPublished: false,
    };
  }

  /**
   * Curriculum intelligence for a single lesson upgrade — prefer reuse.
   */
  function intelligenceForLesson(plan, curriculum = {}, directorState = null, assistantState = null) {
    const intel = buildCurriculumIntelligence(curriculum, directorState, assistantState);
    const theme = text(plan?.theme || plan?.title);
    const reusable = loadReusable();
    const connections = reusable?.findLessonConnections
      ? reusable.findLessonConnections(plan, curriculum, plan?.enrichmentDraft || null)
      : [];

    const reuse = [];
    intel.vocabulary
      .filter((v) => jaccard(v.theme || v.title, theme) >= 0.3 && !(v.linkedPlanIds || []).includes(plan?.id))
      .slice(0, 6)
      .forEach((v) => reuse.push({
        kind: "vocabulary",
        message: `We already have vocabulary “${v.title}”. Link/reuse instead of recreating.`,
        id: v.id,
        source: v.source,
      }));
    intel.printables
      .filter((p) => jaccard(p.title, theme) >= 0.25)
      .slice(0, 6)
      .forEach((p) => reuse.push({
        kind: "printable",
        message: `We already have printable “${p.title}”.`,
        id: p.id,
        source: p.kind,
      }));
    intel.songs
      .filter((s) => jaccard(s.title, theme) >= 0.2)
      .slice(0, 4)
      .forEach((s) => reuse.push({
        kind: "song",
        message: `Song already exists: “${s.title}”.`,
        title: s.title,
      }));
    intel.books
      .filter((b) => jaccard(b.title, theme) >= 0.2)
      .slice(0, 4)
      .forEach((b) => reuse.push({
        kind: "book",
        message: `Book already exists: “${b.title}”.`,
        title: b.title,
      }));
    intel.masterResources
      .filter((m) => jaccard(m.theme || m.title, theme) >= 0.3)
      .slice(0, 6)
      .forEach((m) => reuse.push({
        kind: "master_resource",
        message: `Master resource “${m.title}” can link into this lesson.`,
        id: m.id,
        linkedBy: m.linkedPlanIds.length,
      }));

    return {
      planId: plan?.id || "",
      theme,
      reuseHints: reuse,
      connections,
      catalogCounts: {
        themes: intel.themes.length,
        printables: intel.printables.length,
        vocabulary: intel.vocabulary.length,
        songs: intel.songs.length,
        books: intel.books.length,
        activities: intel.activities.length,
        observations: intel.observations.length,
        family: intel.family.length,
        teacherTips: intel.teacherTips.length,
        masters: intel.masterResources.length,
      },
    };
  }

  function answerPlanningQuestion(question, curriculum = {}, directorState = null, assistantState = null, usageByPlanId = {}) {
    const q = normalizeKey(question);
    const coverage = buildCoverageDashboard(curriculum, usageByPlanId);
    const intel = buildCurriculumIntelligence(curriculum, directorState, assistantState);
    const recs = buildRecommendations(curriculum, directorState, assistantState, usageByPlanId);
    let answer = "";

    if (/fall|autumn/.test(q)) {
      const fallish = intel.themes.filter((t) => /fall|autumn|harvest|pumpkin|leaf|apple|scarecrow/.test(normalizeKey(t.theme)));
      answer = fallish.length
        ? `Fall building blocks already in your library: ${fallish.map((t) => `${t.theme} (${t.averageCompletion}%)`).join("; ")}. Upgrade the weakest first, then add any missing infant/toddler fall themes.`
        : "You don’t have a clear Fall theme cluster yet. Start with Leaves & Harvest, Apples, Pumpkins, and Weather Watchers — reuse one Fall vocabulary master across them.";
    } else if (/create next|themes? should|missing for infant|infant/.test(q)) {
      const infantThemes = intel.themes.filter((t) => t.ages.includes("infant"));
      const gaps = coverage.weakestAgeGroups.find((a) => a.ageBand === "infant");
      answer = gaps
        ? `Infant coverage averages ${gaps.avgCompletion}%. Existing infant themes: ${infantThemes.map((t) => t.theme).join(", ") || "none yet"}. Prioritize sensory, attachment, and simple outdoor themes next.`
        : `Infant themes on file: ${infantThemes.map((t) => t.theme).join(", ") || "none"}. Add 2–3 infant kits before expanding preschool further.`;
    } else if (/upgrade today|which lesson/.test(q)) {
      const pick = coverage.lowestCompletion[0] || coverage.neverUpgraded[0];
      answer = pick
        ? `Upgrade “${pick.title}” today (${pick.completionPercent}% complete${pick.neverUpgraded ? ", never upgraded" : ""}${pick.missing.length ? `; missing ${pick.missing.join(", ")}` : ""}).`
        : "Your library looks evenly upgraded — pick the most-viewed lesson with any remaining gaps.";
    } else if (/tiktok|post|social/.test(q)) {
      const top = coverage.mostViewed.filter((r) => r.views > 0).slice(0, 3);
      answer = top.length
        ? `Post about your most-viewed lessons: ${top.map((r) => r.title).join(", ")}. Show a setup tray + one printable close-up; CTA to the Free sample.`
        : "Not enough view data yet — post a process-art or sensory setup from your strongest complete kit and track which theme gets saves.";
    } else if (/resources? used|most used|popular resource/.test(q)) {
      const health = buildResourceHealth(directorState, curriculum);
      const used = [...health.rows].sort((a, b) => b.linkedBy - a.linkedBy).slice(0, 5);
      answer = used.length
        ? `Most-linked master resources: ${used.map((r) => `${r.title} (${r.linkedBy} lessons)`).join("; ") || "none linked yet"}.`
        : "No master resources linked yet — promote Farm/Garden vocabulary packs into masters and link related lessons.";
    } else if (/reusable|build next/.test(q)) {
      const topRec = (recs.recommendations || []).find((r) => r.code === "vocab_reuse" || r.code === "duplicate_printables" || r.code === "link_master");
      answer = topRec
        ? topRec.message
        : "Build a shared vocabulary pack and a matching printable for your weakest incomplete theme; link it into every related lesson.";
    } else {
      answer = [
        `Library: ${coverage.summary.lessonCount} lessons · ${coverage.summary.neverUpgraded} never upgraded · ${coverage.summary.incompleteThemes} incomplete themes.`,
        (recs.recommendations[0] && recs.recommendations[0].message) || "Ask about Fall planning, infant gaps, what to upgrade today, TikTok ideas, or reusable resources to build next.",
      ].join(" ");
    }

    return {
      question: text(question),
      answer,
      recommendations: (recs.recommendations || []).slice(0, 8),
      autoPublished: false,
      at: new Date().toISOString(),
    };
  }

  function buildBusinessInsights(usageByPlanId = {}, searchGaps = [], curriculum = {}) {
    const plans = asArray(curriculum.lessonPlans);
    const rows = plans.map((plan) => {
      const usage = usageByPlanId[plan.id] || {};
      return {
        id: plan.id,
        title: text(plan.title),
        theme: text(plan.theme),
        views: Number(usage.views) || 0,
        downloads: Number(usage.downloads) || 0,
        assigns: Number(usage.assigns) || 0,
        proUpgrades: Number(usage.proUpgrades) || 0,
        subscribeDrivers: Number(usage.subscribeDrivers) || 0,
      };
    });
    return {
      mostViewedLessons: [...rows].sort((a, b) => b.views - a.views).slice(0, 15),
      mostDownloadedPrintables: [...rows].sort((a, b) => b.downloads - a.downloads).slice(0, 15),
      mostAssignedLessons: [...rows].sort((a, b) => b.assigns - a.assigns).slice(0, 15),
      lessonsDrivingProUpgrades: [...rows].sort((a, b) => b.proUpgrades - a.proUpgrades).filter((r) => r.proUpgrades > 0).slice(0, 15),
      lessonsDrivingSubscribe: [...rows].sort((a, b) => b.subscribeDrivers - a.subscribeDrivers).filter((r) => r.subscribeDrivers > 0).slice(0, 15),
      searchedButMissing: asArray(searchGaps).slice(0, 20),
      buildNext: (() => {
        const demand = rows.filter((r) => r.views >= 3 && (completionPercentForPlan(
          plans.find((p) => p.id === r.id) || {},
          [],
        ) < 70));
        const search = asArray(searchGaps).slice(0, 5).map((g) => `People search “${g.query || g}” but can’t find a match.`);
        const weakPopular = demand.slice(0, 5).map((r) => `Upgrade popular lesson “${r.title}” (views ${r.views}).`);
        return [...weakPopular, ...search].slice(0, 10);
      })(),
      builtAt: new Date().toISOString(),
    };
  }

  return {
    emptyDirectorState,
    normalizeDirectorState,
    normalizeMasterResource,
    buildCurriculumIntelligence,
    buildCoverageDashboard,
    buildRecommendations,
    buildResourceHealth,
    assessResourceHealth,
    saveMasterResource,
    linkMasterToLessons,
    propagateMasterUpdate,
    intelligenceForLesson,
    answerPlanningQuestion,
    buildBusinessInsights,
    ageBand,
    completionPercentForPlan,
  };
});
