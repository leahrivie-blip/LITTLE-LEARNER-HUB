/**
 * Phase 2 Smart Lesson Plan Importer — core engine.
 * Paste → split → parse (V5) → review model → suggestions → assistant → drafts.
 *
 * Browser: globalThis.LlhSmartLessonImport
 * Node: module.exports
 */
(function smartLessonImportModule() {
  "use strict";

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const DRAFT_KEY = "llhSmartImportSession";
  const HISTORY_KEY = "llhSmartImportHistory";
  const MAX_HISTORY = 20;

  const PRIMARY_COLLECTIONS = [
    "Weekly Lesson Plans",
    "Monthly Curriculums",
    "Seasonal and Holiday",
    "Infant",
    "Toddler",
    "Preschool",
    "Recently Added",
    "Free Lesson Plans",
    "Pro Lesson Plans",
    "Saved Drafts",
  ];

  const SUGGESTED_TAGS = [
    "Math",
    "Literacy",
    "Science",
    "Sensory",
    "Fine Motor",
    "Gross Motor",
    "Music and Movement",
    "Dramatic Play",
    "Art",
    "Social-Emotional",
    "Outdoor Learning",
    "STEM",
    "Cooking",
    "Nature",
    "Holiday",
    "Seasonal",
  ];

  const FIELD_DEFS = [
    { key: "title", label: "Title", required: true, path: "title" },
    { key: "age", label: "Age group", required: true, path: "age" },
    { key: "theme", label: "Theme", required: true, path: "theme" },
    { key: "plan", label: "Free or Pro", required: true, path: "plan" },
    { key: "weeklyOverview", label: "Weekly overview", required: false, path: "weeklyOverview" },
    { key: "objectives", label: "Learning objectives", required: true, path: "objectives" },
    { key: "learningDomains", label: "Learning domains", required: true, path: "learningDomains", isList: true },
    { key: "weeklyMaterials", label: "Materials", required: true, path: "weeklyMaterials" },
    { key: "vocabularyWords", label: "Vocabulary", required: false, path: "vocabularyWords" },
    { key: "books", label: "Books", required: false, path: "books", isList: true },
    { key: "songs", label: "Songs", required: false, path: "songs", isList: true },
    { key: "familyConnection", label: "Family connection", required: false, path: "familyConnection" },
    { key: "observationOpportunities", label: "Observation opportunities", required: false, path: "observationOpportunities" },
    { key: "adaptations", label: "Adaptations", required: false, path: "adaptations" },
    { key: "coverImageUrl", label: "Cover image", required: true, path: "coverImageUrl" },
  ];

  function domainsApi() {
    if (typeof require === "function") {
      try { return require("./curriculum-learning-domains.js"); } catch { /* browser */ }
    }
    return globalThis.CurriculumLearningDomains || null;
  }

  function parserApi() {
    if (typeof require === "function") {
      try {
        require("./curriculum-lesson-import-parser.js");
        require("./curriculum-lesson-import-v4.js");
      } catch { /* already loaded */ }
    }
    return globalThis.CurriculumLessonImportParser || null;
  }

  function enrichApi() {
    if (typeof require === "function") {
      try { return require("./curriculum-import-enrich.js"); } catch { /* browser */ }
    }
    return globalThis.CurriculumImportEnrich || null;
  }

  function coversApi() {
    if (typeof require === "function") {
      try { return require("./lesson-plan-covers.js"); } catch { /* browser */ }
    }
    return globalThis.LlhLessonPlanCovers || null;
  }

  function asText(value) {
    return String(value == null ? "" : value).trim();
  }

  function hasList(value) {
    return Array.isArray(value) && value.some((item) => {
      if (item == null) return false;
      if (typeof item === "string") return Boolean(item.trim());
      if (typeof item === "object") return Boolean(item.title || item.name);
      return true;
    });
  }

  function getFieldValue(plan, path) {
    return plan?.[path];
  }

  function fieldHasValue(plan, def) {
    const value = getFieldValue(plan, def.path);
    if (def.isList) return hasList(value) || (typeof value === "string" && value.trim());
    return Boolean(asText(value));
  }

  function countDaysWithActivities(plan) {
    const daily = plan?.dailyPlans || {};
    return WEEKDAYS.filter((day) => Array.isArray(daily[day]?.items) && daily[day].items.length > 0).length;
  }

  function countActivities(plan) {
    const daily = plan?.dailyPlans || {};
    return WEEKDAYS.reduce((sum, day) => sum + (Array.isArray(daily[day]?.items) ? daily[day].items.length : 0), 0);
  }

  function incompleteActivityIssues(plan) {
    const issues = [];
    const daily = plan?.dailyPlans || {};
    WEEKDAYS.forEach((day) => {
      const items = Array.isArray(daily[day]?.items) ? daily[day].items : [];
      if (!items.length) {
        issues.push({ day, kind: "missing-day", message: `${capitalize(day)} has no activities.` });
        return;
      }
      items.forEach((item, index) => {
        if (!asText(item.title)) {
          issues.push({ day, kind: "missing-title", message: `${capitalize(day)} activity ${index + 1} needs a title.` });
        }
        if (!asText(item.steps || item.directions)) {
          issues.push({ day, kind: "missing-steps", message: `${capitalize(day)} “${item.title || `activity ${index + 1}`}” needs directions.` });
        }
        if (!asText(item.materials)) {
          issues.push({ day, kind: "missing-materials", message: `${capitalize(day)} “${item.title || `activity ${index + 1}`}” needs materials.` });
        }
      });
    });
    return issues;
  }

  function capitalize(day) {
    return String(day || "").replace(/^\w/, (c) => c.toUpperCase());
  }

  /**
   * Normalize everyday-language pastes so the V5 parser can see weekdays + activities.
   * Turns lines like "Monday: Apple counting" into a Monday section with an Activity.
   */
  function normalizeEverydayLessonPaste(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n");
    if (!raw.trim()) return "";
    const dayLineRe = /^(Monday|Tuesday|Wednesday|Thursday|Friday)\s*[:\-–—]\s*(.+)$/i;
    const dayOnlyRe = /^(Monday|Tuesday|Wednesday|Thursday|Friday)\s*$/i;
    const lines = raw.split("\n");
    const out = [];
    let sawDayActivity = false;
    lines.forEach((line) => {
      const trimmed = line.trim();
      const dayActivity = trimmed.match(dayLineRe);
      if (dayActivity) {
        sawDayActivity = true;
        out.push("");
        out.push(dayActivity[1]);
        out.push(`Activity: ${dayActivity[2].trim()}`);
        out.push(`Description: Children explore ${dayActivity[2].trim()} through hands-on play.`);
        out.push("Directions:");
        out.push(`1. Introduce ${dayActivity[2].trim()}.`);
        out.push("2. Offer materials and invite children to explore.");
        out.push("3. Narrate discoveries and support turn-taking.");
        out.push("Materials: Theme props, everyday classroom materials");
        return;
      }
      if (dayOnlyRe.test(trimmed)) {
        out.push("");
        out.push(trimmed);
        return;
      }
      out.push(line);
    });
    let normalized = out.join("\n").trim();
    if (sawDayActivity && !/^title\s*:/im.test(normalized)) {
      // Ensure first non-empty line is treated as title by prefixing a soft label.
      const first = normalized.split("\n").find((l) => l.trim());
      if (first && !/^(title|age|theme)\b/i.test(first)) {
        normalized = `Title: ${first}\n${normalized}`;
      }
    }
    // Promote "Focus on …" prose into learning goals / overview when unlabeled.
    if (!/weekly overview|objectives|learning goals/i.test(normalized)) {
      normalized = normalized.replace(
        /^(Focus on .+)$/im,
        "Weekly Overview:\n$1\nLearning Goals:\n$1",
      );
    }
    return normalized;
  }

  /**
   * Split a pasted blob into one or more lesson-plan chunks.
   * Handles TITLE: markers, blank-line + age/title headers, and "Lesson Plan N" separators.
   */
  function splitLessonPlanChunks(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!raw) return [];

    const titleSplits = raw.split(/(?=^TITLE:\s*)/im).map((c) => c.trim()).filter(Boolean);
    if (titleSplits.length > 1) return titleSplits;

    const numbered = raw.split(/(?=^(?:Lesson\s*Plan|Week)\s*\d+\s*[:.\-–—])/im).map((c) => c.trim()).filter(Boolean);
    if (numbered.length > 1) return numbered;

    // Natural-language: Age + Theme Title blocks separated by blank lines.
    const naturalBlocks = [];
    const lines = raw.split("\n");
    let current = [];
    const ageTitleRe = /^(Infant|Toddler|Preschool|Pre-?K|Kindergarten)\b.+/i;
    const weekTitleRe = /^.+\b(Week|Curriculum|Theme|Lesson Plan)\b.*$/i;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const prevBlank = i > 0 && !String(lines[i - 1] || "").trim();
      const trimmed = line.trim();
      const looksLikeNewPlan = prevBlank
        && current.filter((l) => l.trim()).length >= 2
        && (
          ageTitleRe.test(trimmed)
          || (weekTitleRe.test(trimmed) && trimmed.length < 90 && !/^(Monday|Tuesday|Wednesday|Thursday|Friday)\b/i.test(trimmed))
        );
      if (looksLikeNewPlan) {
        naturalBlocks.push(current.join("\n").trim());
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length) naturalBlocks.push(current.join("\n").trim());
    if (naturalBlocks.length > 1) return naturalBlocks.filter(Boolean);

    return [raw];
  }

  function parseOneChunk(chunk, options = {}) {
    const parser = parserApi();
    if (!parser?.parseCurriculumLessonPlanImport) {
      return {
        ok: false,
        errors: ["Lesson plan parser is not loaded."],
        warnings: [],
        data: null,
        inferences: [],
        parseReport: null,
      };
    }
    const normalizedChunk = normalizeEverydayLessonPaste(chunk);
    return parser.parseCurriculumLessonPlanImport(normalizedChunk, {
      mode: options.mode || "v5",
      generateItemId: options.generateItemId,
      existingTitles: options.existingTitles || [],
      synonyms: options.synonyms || [],
    });
  }

  function inferDomainsFromProse(plan, options = {}) {
    const api = domainsApi();
    if (!api?.resolveLearningDomainsWithConfidence) return { domains: [], mappings: [] };
    const activityBits = [];
    const daily = plan?.dailyPlans || {};
    WEEKDAYS.forEach((day) => {
      (daily[day]?.items || []).forEach((item) => {
        activityBits.push(item.title, item.objective, ...(item.learningGoals || []), item.description);
      });
    });
    const prose = [
      plan?.title,
      plan?.theme,
      plan?.weeklyOverview,
      plan?.objectives,
      plan?.vocabularyWords,
      ...(Array.isArray(plan?.learningDomains) ? plan.learningDomains : []),
      ...activityBits,
    ].filter(Boolean).join(" ");

    // Pull known domain phrases out of free prose (not only comma-separated lists).
    const aliasMap = api.buildAliasMap?.(options.synonyms || []) || {};
    const phrases = Object.keys(aliasMap).sort((a, b) => b.length - a.length);
    const normalizedProse = api.normalizeImportToken?.(prose) || prose.toLowerCase();
    const padded = ` ${normalizedProse} `;
    const foundTokens = [];
    phrases.forEach((phrase) => {
      if (phrase.length < 3) return;
      if (padded.includes(` ${phrase} `) || padded.includes(` ${phrase}s `)) {
        foundTokens.push(phrase);
      }
    });
    const listLike = foundTokens.length
      ? foundTokens.join(", ")
      : prose;
    return api.resolveLearningDomainsWithConfidence(listLike, { synonyms: options.synonyms || [] });
  }

  function suggestMissingFields(plan, options = {}) {
    const suggestions = [];
    const title = asText(plan?.title) || "this week";
    const theme = asText(plan?.theme) || title;
    const age = asText(plan?.age) || "Preschool";

    const push = (field, value, reason) => {
      if (!value) return;
      suggestions.push({
        field,
        value,
        status: "ai-suggested",
        reason,
        accepted: false,
      });
    };

    if (!asText(plan?.objectives)) {
      push(
        "objectives",
        `Children will explore ${theme} through hands-on play, language, and discovery matched to ${age} learners.`,
        "Suggested learning objectives from the theme.",
      );
    }
    if (!asText(plan?.weeklyMaterials)) {
      push(
        "weeklyMaterials",
        `Theme props for ${theme}, art supplies, books, and everyday classroom materials.`,
        "Suggested weekly materials list.",
      );
    }
    if (!asText(plan?.vocabularyWords)) {
      const words = theme
        .split(/[^a-zA-Z]+/)
        .filter((w) => w.length > 3)
        .slice(0, 6)
        .map((w) => w.toLowerCase());
      if (words.length) push("vocabularyWords", words.join(", "), "Suggested vocabulary from the theme words.");
    }
    if (!asText(plan?.familyConnection)) {
      push(
        "familyConnection",
        `Invite families to talk about ${theme} at home and share one related photo or story.`,
        "Suggested family connection.",
      );
    }
    if (!asText(plan?.observationOpportunities)) {
      push(
        "observationOpportunities",
        `Notice how children describe ${theme}, use materials, and work with peers during play.`,
        "Suggested observation opportunities.",
      );
    }
    if (!asText(plan?.adaptations)) {
      push(
        "adaptations",
        `Simplify materials for younger children; add labeling, counting, or writing extensions for older children.`,
        "Suggested adaptations.",
      );
    }
    if (!hasList(plan?.books)) {
      push("books", [{ title: `${theme} Story Time`, author: "", notes: "Choose a classroom favorite that matches the theme." }], "Suggested book placeholder to replace with a real title.");
    }
    if (!hasList(plan?.songs)) {
      push("songs", [{ title: `Sing about ${theme}`, notes: "Use a familiar tune with theme words." }], "Suggested song placeholder.");
    }

    const domainResult = inferDomainsFromProse(plan, options);
    if (!hasList(plan?.learningDomains) && domainResult.domains?.length) {
      push("learningDomains", domainResult.domains, "Suggested learning domains from lesson wording.");
    } else if (hasList(plan?.learningDomains) === false && theme) {
      // Fallback theme-based domain hints
      const fallback = [];
      const t = theme.toLowerCase();
      if (/count|number|math|sort|pattern|measure/.test(t)) fallback.push("Math");
      if (/paint|art|music|drama|song/.test(t)) fallback.push("Creative Arts");
      if (/science|investigate|nature|stem|apple|pumpkin|leaf/.test(t)) fallback.push("Science");
      if (/read|book|vocab|language|story/.test(t)) fallback.push("Language & Literacy");
      if (/feel|friend|share|social/.test(t)) fallback.push("Social Emotional");
      if (/motor|move|outdoor|cut|grasp|write/.test(t)) fallback.push("Physical Development");
      if (fallback.length) push("learningDomains", [...new Set(fallback)], "Suggested domains from theme keywords.");
    }

    // Activity-level direction suggestions
    const daily = plan?.dailyPlans || {};
    WEEKDAYS.forEach((day) => {
      (daily[day]?.items || []).forEach((item, index) => {
        if (asText(item.title) && !asText(item.steps || item.directions)) {
          push(
            `dailyPlans.${day}.items.${index}.steps`,
            `1. Invite children to explore ${item.title}.\n2. Model how to use the materials.\n3. Narrate discoveries and support turn-taking.\n4. Clean up together and recall one new idea.`,
            `Suggested directions for ${capitalize(day)} activity “${item.title}”.`,
          );
        }
        if (asText(item.title) && !asText(item.teacherRole)) {
          push(
            `dailyPlans.${day}.items.${index}.teacherRole`,
            "Observe, narrate, and ask open-ended questions while children lead the play.",
            `Suggested teacher role for “${item.title}”.`,
          );
        }
        if (asText(item.title) && !hasList(item.learningGoals) && !asText(item.learningGoals)) {
          push(
            `dailyPlans.${day}.items.${index}.learningGoals`,
            [`Explore ${theme} through play`, "Build language and social skills"],
            `Suggested learning goals for “${item.title}”.`,
          );
        }
      });
    });

    // Prefer enrichment library when available for weekly overview only if missing.
    if (!asText(plan?.weeklyOverview) && enrichApi()?.enrichCurriculumImport) {
      try {
        const enriched = enrichApi().enrichCurriculumImport({ ...plan }, { fillMissingOnly: true });
        if (asText(enriched?.weeklyOverview)) {
          push("weeklyOverview", enriched.weeklyOverview, "Suggested weekly overview from theme.");
        }
      } catch { /* ignore enrich failures */ }
    } else if (!asText(plan?.weeklyOverview)) {
      push(
        "weeklyOverview",
        `A ${age.toLowerCase()} week focused on ${theme}: playful investigation, language, and hands-on discovery each day.`,
        "Suggested weekly overview.",
      );
    }

    return suggestions;
  }

  function suggestTags(plan) {
    const hay = [
      plan?.title,
      plan?.theme,
      plan?.weeklyOverview,
      plan?.objectives,
      ...(plan?.learningDomains || []),
    ].join(" ").toLowerCase();
    const tags = SUGGESTED_TAGS.filter((tag) => {
      const key = tag.toLowerCase().replace(/[^a-z]+/g, " ");
      return key.split(" ").some((part) => part.length > 2 && hay.includes(part));
    });
    // Domain → tag bridges
    (plan?.learningDomains || []).forEach((domain) => {
      const d = String(domain).toLowerCase();
      if (d.includes("math") && !tags.includes("Math")) tags.push("Math");
      if (d.includes("literacy") || d.includes("language")) {
        if (!tags.includes("Literacy")) tags.push("Literacy");
      }
      if (d.includes("science") && !tags.includes("Science")) tags.push("Science");
      if (d.includes("creative") && !tags.includes("Art")) tags.push("Art");
      if (d.includes("social") && !tags.includes("Social-Emotional")) tags.push("Social-Emotional");
      if (d.includes("physical")) {
        if (!tags.includes("Fine Motor")) tags.push("Fine Motor");
        if (!tags.includes("Gross Motor")) tags.push("Gross Motor");
      }
    });
    return [...new Set(tags)].slice(0, 8);
  }

  function suggestPrimaryCollection(plan) {
    const age = asText(plan?.age).toLowerCase();
    if (age.includes("infant")) return "Infant";
    if (age.includes("toddler")) return "Toddler";
    if (age.includes("preschool") || age.includes("pre-k")) return "Preschool";
    if (asText(plan?.plan) === "Pro") return "Pro Lesson Plans";
    if (asText(plan?.plan) === "Free") return "Free Lesson Plans";
    return "Weekly Lesson Plans";
  }

  function applySuggestion(plan, suggestion) {
    if (!plan || !suggestion?.field) return plan;
    const next = JSON.parse(JSON.stringify(plan));
    const field = suggestion.field;
    if (!field.includes(".")) {
      next[field] = suggestion.value;
      return next;
    }
    const parts = field.split(".");
    let cursor = next;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (cursor[key] == null) cursor[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = suggestion.value;
    return next;
  }

  function applyAcceptedSuggestions(plan, suggestions = []) {
    let next = plan;
    suggestions.filter((s) => s.accepted).forEach((s) => {
      next = applySuggestion(next, s);
    });
    return next;
  }

  function buildFieldStatuses(plan, suggestions = [], options = {}) {
    const suggestedFields = new Set(suggestions.map((s) => s.field.split(".")[0]));
    const acceptedFields = new Set(suggestions.filter((s) => s.accepted).map((s) => s.field.split(".")[0]));
    return FIELD_DEFS.map((def) => {
      const present = fieldHasValue(plan, def) || acceptedFields.has(def.key);
      let status = "complete";
      if (!present && def.required) status = "missing";
      else if (!present && suggestedFields.has(def.key)) status = "ai-suggested";
      else if (!present) status = "needs-review";
      else if (suggestedFields.has(def.key) && !fieldHasValue(plan, def)) status = "ai-suggested";
      else if (options.needsReviewFields?.includes(def.key)) status = "needs-review";
      return {
        key: def.key,
        label: def.label,
        required: def.required,
        status,
        present,
      };
    });
  }

  function buildReviewModel(parsed, options = {}) {
    const plan = parsed?.data || parsed?.plan || parsed || {};
    const warnings = parsed?.warnings || [];
    const errors = parsed?.errors || [];
    const suggestions = options.suggestions || suggestMissingFields(plan, options);
    const fieldStatuses = buildFieldStatuses(plan, suggestions, options);
    const activityIssues = incompleteActivityIssues(plan);
    const tags = options.tags || suggestTags(plan);
    const primaryCollection = options.primaryCollection || suggestPrimaryCollection(plan);
    const cover = coversApi()?.resolveLessonPlanCover?.(plan);
    const dayCount = countDaysWithActivities(plan);
    const activityCount = countActivities(plan);
    const missingRequired = fieldStatuses.filter((f) => f.status === "missing");
    const publishErrors = validateForPublish({
      ...plan,
      coverImageUrl: plan.coverImageUrl || cover?.url || "",
      tags,
      primaryCollection,
    });

    let importStatus = "ready";
    if (errors.length || missingRequired.length) importStatus = "needs-review";
    if (!asText(plan.title)) importStatus = "failed-partial";
    if (suggestions.some((s) => !s.accepted) && importStatus === "ready") importStatus = "ai-suggested";

    return {
      plan: {
        ...plan,
        coverImageUrl: plan.coverImageUrl || "",
        coverImageAlt: plan.coverImageAlt || cover?.alt || "",
        tags: Array.isArray(plan.tags) ? plan.tags : tags,
        primaryCollection: plan.primaryCollection || primaryCollection,
      },
      suggestions,
      fieldStatuses,
      activityIssues,
      tags,
      primaryCollection,
      dayCount,
      activityCount,
      warnings,
      errors,
      importStatus,
      publishErrors,
      coverStatus: plan.coverImageUrl || cover?.url ? "mapped" : "missing",
      resolvedCoverUrl: cover?.url || "",
      curriculumAssignment: options.curriculumAssignment || {
        mode: "standalone", // standalone | existing | new | unassigned
        seriesId: "",
        weekNumber: 0,
        newSeries: {
          title: "",
          month: "",
          season: "",
          age: plan.age || "Preschool",
          weekCount: 4,
          plan: plan.plan || "Free",
        },
      },
    };
  }

  function validateForPublish(plan = {}) {
    const errors = [];
    if (!asText(plan.title)) errors.push("Title is required.");
    if (!asText(plan.age)) errors.push("Age group is required.");
    if (!asText(plan.plan) || !["Free", "Pro"].includes(plan.plan)) errors.push("Free or Pro must be selected.");
    if (!asText(plan.objectives)) errors.push("Learning objectives are required.");
    if (!asText(plan.weeklyMaterials)) errors.push("Materials are required.");
    if (!hasList(plan.learningDomains)) errors.push("At least one learning domain is required.");
    if (!asText(plan.coverImageUrl)) errors.push("A cover image must be selected or generated.");
    WEEKDAYS.forEach((day) => {
      const items = plan.dailyPlans?.[day]?.items || [];
      if (!items.length) errors.push(`${capitalize(day)} must include at least one activity.`);
    });
    incompleteActivityIssues(plan).forEach((issue) => {
      if (issue.kind === "missing-steps" || issue.kind === "missing-materials") errors.push(issue.message);
    });
    return [...new Set(errors)];
  }

  function importSmartPaste(text, options = {}) {
    const chunks = splitLessonPlanChunks(text);
    const existingTitles = new Set((options.existingTitles || []).map((t) => String(t).toLowerCase()));
    const reviews = chunks.map((chunk, index) => {
      const parsed = parseOneChunk(chunk, {
        ...options,
        existingTitles: [...existingTitles],
      });
      if (parsed?.data?.title) existingTitles.add(String(parsed.data.title).toLowerCase());
      // Soft path: keep partial data even when ok=false so review can continue.
      const planData = parsed?.data || {
        title: "",
        age: "Preschool",
        theme: "",
        plan: "Free",
        status: "draft",
        learningDomains: [],
        dailyPlans: Object.fromEntries(WEEKDAYS.map((d) => [d, { theme: "", items: [] }])),
      };
      const review = buildReviewModel({
        ...parsed,
        data: planData,
        ok: parsed?.ok,
      }, options);
      return {
        id: `import-${Date.now().toString(16)}-${index}`,
        index: index + 1,
        sourceText: chunk,
        parsedOk: Boolean(parsed?.ok),
        selected: true,
        status: "draft",
        planTier: review.plan.plan || "Free",
        ...review,
      };
    });

    return {
      ok: reviews.some((r) => asText(r.plan?.title) || r.dayCount > 0),
      chunkCount: chunks.length,
      reviews,
      summary: {
        lessonPlanCount: reviews.length,
        readyCount: reviews.filter((r) => r.importStatus === "ready" || r.importStatus === "ai-suggested").length,
        needsReviewCount: reviews.filter((r) => r.importStatus === "needs-review" || r.importStatus === "failed-partial").length,
        activityCount: reviews.reduce((sum, r) => sum + r.activityCount, 0),
      },
    };
  }

  function applyBulkAction(reviews, action, payload = {}) {
    const selected = (reviews || []).filter((r) => r.selected);
    const targets = selected.length ? selected : (reviews || []);
    return (reviews || []).map((review) => {
      if (!targets.includes(review) && selected.length) return review;
      const next = { ...review, plan: { ...review.plan } };
      switch (action) {
        case "set-age":
          next.plan.age = payload.age || next.plan.age;
          break;
        case "set-plan":
          next.plan.plan = payload.plan === "Pro" ? "Pro" : "Free";
          next.planTier = next.plan.plan;
          break;
        case "set-status":
          next.status = payload.status || "draft";
          next.plan.status = next.status;
          break;
        case "set-collection":
          next.plan.primaryCollection = payload.primaryCollection || next.plan.primaryCollection;
          next.primaryCollection = next.plan.primaryCollection;
          break;
        case "generate-covers": {
          const cover = coversApi()?.resolveLessonPlanCover?.({ ...next.plan, coverImageUrl: "" });
          if (cover?.url) {
            next.plan.coverImageUrl = cover.url;
            next.plan.coverImageAlt = cover.alt || "";
            next.plan.coverImageSource = cover.source || "mapped";
            next.coverStatus = "mapped";
            next.resolvedCoverUrl = cover.url;
          }
          break;
        }
        case "accept-all-suggestions":
          next.suggestions = (next.suggestions || []).map((s) => ({ ...s, accepted: true }));
          next.plan = applyAcceptedSuggestions(next.plan, next.suggestions);
          next.fieldStatuses = buildFieldStatuses(next.plan, next.suggestions);
          next.publishErrors = validateForPublish(next.plan);
          next.importStatus = next.publishErrors.length ? "needs-review" : "ready";
          break;
        case "assign-curriculum":
          next.curriculumAssignment = {
            ...(next.curriculumAssignment || {}),
            ...payload,
          };
          break;
        case "duplicate-age": {
          const clone = JSON.parse(JSON.stringify(next));
          clone.id = `${next.id}-dup-${payload.age || "age"}`;
          clone.plan.age = payload.age || clone.plan.age;
          clone.plan.title = `${clone.plan.title} (${clone.plan.age})`;
          clone.selected = true;
          return [next, clone];
        }
        case "delete":
          return null;
        default:
          break;
      }
      next.fieldStatuses = buildFieldStatuses(next.plan, next.suggestions || []);
      return next;
    }).flat().filter(Boolean);
  }

  function runAssistantCommand(command, reviews, options = {}) {
    const text = asText(command).toLowerCase();
    const changes = [];
    let nextReviews = (reviews || []).map((r) => ({ ...r, plan: { ...r.plan }, suggestions: [...(r.suggestions || [])] }));

    const touchSelected = (fn) => {
      nextReviews = nextReviews.map((review) => {
        if (!review.selected && nextReviews.some((r) => r.selected)) return review;
        return fn(review);
      });
    };

    if (/fill.*missing|missing.*math|fill in the missing/.test(text)) {
      touchSelected((review) => {
        const suggestions = suggestMissingFields(review.plan, options).map((s) => ({ ...s, accepted: true }));
        if (/math/.test(text)) {
          const domains = [...new Set([...(review.plan.learningDomains || []), "Math"])];
          review.plan.learningDomains = domains;
          changes.push(`Added Math domain to “${review.plan.title || "plan"}”.`);
        }
        review.suggestions = suggestions;
        review.plan = applyAcceptedSuggestions(review.plan, suggestions);
        changes.push(`Filled missing fields on “${review.plan.title || "plan"}”.`);
        return review;
      });
    } else if (/play-based|more play/.test(text)) {
      touchSelected((review) => {
        review.plan.weeklyOverview = `${asText(review.plan.weeklyOverview)}\nKeep the week play-based: children lead with open-ended materials while teachers narrate and scaffold.`.trim();
        changes.push(`Made “${review.plan.title || "plan"}” more play-based.`);
        return review;
      });
    } else if (/younger toddler|toddler adaptation|adaptations for younger/.test(text)) {
      touchSelected((review) => {
        review.plan.adaptations = [
          asText(review.plan.adaptations),
          "For younger toddlers: offer larger pieces, shorten wait times, model one step at a time, and stay close for co-regulation.",
        ].filter(Boolean).join("\n");
        changes.push(`Added younger-toddler adaptations to “${review.plan.title || "plan"}”.`);
        return review;
      });
    } else if (/observation/.test(text)) {
      touchSelected((review) => {
        review.plan.observationOpportunities = [
          asText(review.plan.observationOpportunities),
          "Observe language used, peer interactions, persistence with materials, and how children revisit the theme across the day.",
        ].filter(Boolean).join("\n");
        changes.push(`Strengthened observation opportunities on “${review.plan.title || "plan"}”.`);
        return review;
      });
    } else if (/preschool plan|turn this into a preschool/.test(text)) {
      touchSelected((review) => {
        review.plan.age = "Preschool";
        changes.push(`Set age to Preschool for “${review.plan.title || "plan"}”.`);
        return review;
      });
    } else if (/infant version/.test(text)) {
      const clones = [];
      nextReviews.forEach((review) => {
        if (!review.selected && nextReviews.some((r) => r.selected)) return;
        const clone = JSON.parse(JSON.stringify(review));
        clone.id = `${review.id}-infant`;
        clone.plan.age = "Infant (0-12 Months)";
        clone.plan.title = `${review.plan.title} (Infant)`;
        clone.plan.adaptations = "Slow the pace, emphasize caregiver bonding, tummy time, and sensory exploration with safe mouthing materials.";
        clones.push(clone);
        changes.push(`Created infant version of “${review.plan.title}”.`);
      });
      nextReviews = nextReviews.concat(clones);
    } else if (/add this to|october preschool|assign.*curriculum/.test(text)) {
      touchSelected((review) => {
        review.curriculumAssignment = {
          mode: "existing",
          seriesId: options.seriesId || review.curriculumAssignment?.seriesId || "",
          weekNumber: Number(options.weekNumber) || review.curriculumAssignment?.weekNumber || 1,
          newSeries: review.curriculumAssignment?.newSeries || {},
          note: asText(command),
        };
        changes.push(`Queued curriculum assignment for “${review.plan.title || "plan"}”.`);
        return review;
      });
    } else if (/separate.*four|four weekly|split.*week/.test(text)) {
      if (nextReviews.length === 1) {
        const source = nextReviews[0];
        const daily = source.plan.dailyPlans || {};
        const dayEntries = WEEKDAYS.map((day) => ({ day, items: daily[day]?.items || [] })).filter((d) => d.items.length);
        if (dayEntries.length >= 2) {
          nextReviews = dayEntries.slice(0, 4).map((entry, index) => {
            const clone = JSON.parse(JSON.stringify(source));
            clone.id = `${source.id}-w${index + 1}`;
            clone.plan.title = `${source.plan.title || "Theme"} — Week ${index + 1}`;
            clone.plan.theme = daily[entry.day]?.theme || source.plan.theme;
            clone.plan.dailyPlans = Object.fromEntries(WEEKDAYS.map((d) => [d, { theme: "", items: [] }]));
            clone.plan.dailyPlans.monday = {
              theme: daily[entry.day]?.theme || "",
              items: entry.items,
            };
            clone.index = index + 1;
            clone.dayCount = countDaysWithActivities(clone.plan);
            clone.activityCount = countActivities(clone.plan);
            return clone;
          });
          changes.push("Separated the paste into weekly lesson-plan drafts.");
        } else {
          changes.push("Could not separate into four weeks — not enough distinct day activities found.");
        }
      }
    } else if (/fix.*materials|materials so nothing is missing/.test(text)) {
      touchSelected((review) => {
        const mats = new Set(
          String(review.plan.weeklyMaterials || "")
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        );
        WEEKDAYS.forEach((day) => {
          (review.plan.dailyPlans?.[day]?.items || []).forEach((item) => {
            String(item.materials || "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).forEach((m) => mats.add(m));
            if (!asText(item.materials)) {
              item.materials = review.plan.weeklyMaterials || `Materials for ${item.title}`;
            }
          });
        });
        review.plan.weeklyMaterials = [...mats].join(", ");
        changes.push(`Filled missing materials on “${review.plan.title || "plan"}”.`);
        return review;
      });
    } else if (/books and songs|generate books/.test(text)) {
      touchSelected((review) => {
        if (!hasList(review.plan.books)) {
          review.plan.books = [{ title: `${review.plan.theme || review.plan.title} Book`, author: "", notes: "" }];
        }
        if (!hasList(review.plan.songs)) {
          review.plan.songs = [{ title: `${review.plan.theme || "Theme"} Song`, notes: "" }];
        }
        WEEKDAYS.forEach((day) => {
          const dayPlan = review.plan.dailyPlans?.[day];
          if (!dayPlan) return;
          if (!hasList(dayPlan.books)) dayPlan.books = review.plan.books.slice(0, 1);
          if (!hasList(dayPlan.songs)) dayPlan.songs = review.plan.songs.slice(0, 1);
        });
        changes.push(`Added books and songs for “${review.plan.title || "plan"}”.`);
        return review;
      });
    } else if (/complete directions|include complete directions/.test(text)) {
      touchSelected((review) => {
        WEEKDAYS.forEach((day) => {
          (review.plan.dailyPlans?.[day]?.items || []).forEach((item) => {
            if (!asText(item.steps || item.directions)) {
              item.steps = `1. Introduce ${item.title}.\n2. Offer materials and model one idea.\n3. Support children as they explore.\n4. Reflect together.`;
            }
          });
        });
        changes.push(`Completed activity directions on “${review.plan.title || "plan"}”.`);
        return review;
      });
    } else {
      changes.push("Assistant did not recognize that command. Try one of the suggested prompts.");
    }

    nextReviews = nextReviews.map((review) => {
      const rebuilt = buildReviewModel({ data: review.plan, warnings: review.warnings, errors: review.errors }, {
        suggestions: review.suggestions,
        tags: review.tags,
        primaryCollection: review.primaryCollection,
        curriculumAssignment: review.curriculumAssignment,
      });
      return {
        ...review,
        ...rebuilt,
        id: review.id,
        index: review.index,
        sourceText: review.sourceText,
        selected: review.selected,
        status: review.status || "draft",
        planTier: review.plan?.plan || "Free",
      };
    });

    return { reviews: nextReviews, changes };
  }

  function saveDraftSession(session) {
    if (typeof localStorage === "undefined") return false;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        ...session,
        savedAt: new Date().toISOString(),
      }));
      return true;
    } catch {
      return false;
    }
  }

  function loadDraftSession() {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearDraftSession() {
    if (typeof localStorage === "undefined") return;
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  function pushImportHistory(entry) {
    if (typeof localStorage === "undefined") return;
    try {
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      list.unshift({
        id: `hist-${Date.now().toString(16)}`,
        at: new Date().toISOString(),
        ...entry,
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
    } catch { /* ignore */ }
  }

  function loadImportHistory() {
    if (typeof localStorage === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }

  const api = {
    WEEKDAYS,
    PRIMARY_COLLECTIONS,
    SUGGESTED_TAGS,
    FIELD_DEFS,
    DRAFT_KEY,
    splitLessonPlanChunks,
    normalizeEverydayLessonPaste,
    parseOneChunk,
    inferDomainsFromProse,
    suggestMissingFields,
    suggestTags,
    suggestPrimaryCollection,
    applySuggestion,
    applyAcceptedSuggestions,
    buildFieldStatuses,
    buildReviewModel,
    validateForPublish,
    importSmartPaste,
    applyBulkAction,
    runAssistantCommand,
    saveDraftSession,
    loadDraftSession,
    clearDraftSession,
    pushImportHistory,
    loadImportHistory,
    countDaysWithActivities,
    countActivities,
    incompleteActivityIssues,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhSmartLessonImport = api;
  }
})();
