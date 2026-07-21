/**
 * Monthly Curriculum Series — links existing weekly lesson plans into
 * Week 1–4/5 collections without duplicating plan records.
 */
(function curriculumSeriesModule() {
  const SERIES_STATUSES = ["draft", "needs_review", "published", "featured", "archived"];
  const SERIES_AGES = ["Infant", "Toddler", "Preschool"];
  const SERIES_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const SERIES_SEASONS = ["Spring", "Summer", "Fall", "Winter", "Back to School", "Holiday"];

  function shortText(value, max = 180) {
    return String(value || "").trim().slice(0, max);
  }

  function multiline(value, max = 4000) {
    return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
  }

  function sanitizedCoverUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.startsWith("data:")) return "";
    if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw.slice(0, 500);
    return "";
  }

  function emptySeriesWeek(weekNumber) {
    return {
      weekNumber: Number(weekNumber) || 1,
      lessonPlanId: "",
      displayOrder: Number(weekNumber) || 1,
      label: "",
    };
  }

  function normalizedSeriesWeek(value) {
    const entry = value && typeof value === "object" ? value : {};
    const weekNumber = Math.max(1, Math.min(5, Number(entry.weekNumber) || 1));
    return {
      weekNumber,
      lessonPlanId: shortText(entry.lessonPlanId, 160),
      displayOrder: Math.max(1, Math.min(5, Number(entry.displayOrder) || weekNumber)),
      label: shortText(entry.label || entry.missingPlanTitle, 180),
    };
  }

  function defaultSeriesWeeks(weekCount) {
    const count = weekCount === 5 ? 5 : 4;
    return Array.from({ length: count }, (_, index) => emptySeriesWeek(index + 1));
  }

  function mergeSeriesWeeks(weeks, weekCount) {
    const count = weekCount === 5 ? 5 : 4;
    const byNumber = new Map();
    (Array.isArray(weeks) ? weeks : []).forEach((week) => {
      const normalized = normalizedSeriesWeek(week);
      byNumber.set(normalized.weekNumber, normalized);
    });
    return Array.from({ length: count }, (_, index) => {
      const weekNumber = index + 1;
      return byNumber.get(weekNumber) || emptySeriesWeek(weekNumber);
    });
  }

  function normalizedBook(value) {
    const entry = value && typeof value === "object" ? value : {};
    const title = shortText(entry.title, 180);
    if (!title) return null;
    return {
      title,
      author: shortText(entry.author, 120),
      notes: multiline(entry.notes, 1000),
    };
  }

  function normalizedSong(value) {
    const entry = value && typeof value === "object" ? value : {};
    const title = shortText(entry.title, 180);
    if (!title) return null;
    return {
      title,
      notes: multiline(entry.notes, 1000),
    };
  }

  function normalizedDomainList(value) {
    const official = [
      "Social Emotional",
      "Language & Literacy",
      "Math",
      "Science",
      "Physical Development",
      "Creative Arts",
    ];
    const items = Array.isArray(value) ? value : [];
    const seen = new Set();
    const out = [];
    items.forEach((item) => {
      const raw = shortText(item, 80);
      const match = official.find((domain) => domain.toLowerCase() === raw.toLowerCase());
      if (match && !seen.has(match)) {
        seen.add(match);
        out.push(match);
      }
    });
    return out.slice(0, 6);
  }

  function normalizedCurriculumSeries(value) {
    const entry = value && typeof value === "object" ? value : {};
    const id = shortText(entry.id, 160);
    if (!id) return null;
    const status = shortText(entry.status, 20).toLowerCase().replace(/\s+/g, "_");
    const age = shortText(entry.age, 40);
    const plan = shortText(entry.plan, 20) === "Pro" ? "Pro" : "Free";
    const weekCount = Number(entry.weekCount) === 5 ? 5 : 4;
    const month = shortText(entry.month, 40);
    const season = shortText(entry.season, 40);
    const books = (Array.isArray(entry.books) ? entry.books : [])
      .map(normalizedBook)
      .filter(Boolean)
      .slice(0, 20);
    const songs = (Array.isArray(entry.songs) ? entry.songs : [])
      .map(normalizedSong)
      .filter(Boolean)
      .slice(0, 20);
    return {
      id,
      title: shortText(entry.title, 180) || "Untitled Curriculum",
      description: multiline(entry.description, 4000),
      theme: shortText(entry.theme, 120),
      age: SERIES_AGES.includes(age) ? age : (age || "Preschool"),
      month: SERIES_MONTHS.includes(month) ? month : month,
      season: SERIES_SEASONS.includes(season) ? season : season,
      year: shortText(entry.year, 8),
      weekCount,
      overallGoals: multiline(entry.overallGoals, 4000),
      overallMaterials: multiline(entry.overallMaterials, 4000),
      familyConnection: multiline(entry.familyConnection, 4000),
      learningDomains: normalizedDomainList(entry.learningDomains),
      books,
      songs,
      coverImageUrl: sanitizedCoverUrl(entry.coverImageUrl),
      coverImageAlt: shortText(entry.coverImageAlt, 240),
      coverImageSource: ["uploaded", "generated", "default", "mapped", "fallback"].includes(String(entry.coverImageSource || "").trim())
        ? String(entry.coverImageSource).trim()
        : (sanitizedCoverUrl(entry.coverImageUrl) ? "uploaded" : "fallback"),
      coverImagePosition: shortText(entry.coverImagePosition, 40) || "center",
      plan,
      status: SERIES_STATUSES.includes(status) ? status : "draft",
      featured: Boolean(entry.featured) || status === "featured",
      displayOrder: Math.max(0, Number(entry.displayOrder) || 0),
      weeks: mergeSeriesWeeks(entry.weeks, weekCount),
      createdAt: shortText(entry.createdAt, 80),
      updatedAt: shortText(entry.updatedAt, 80),
      publishedAt: shortText(entry.publishedAt, 80),
    };
  }

  /**
   * Publish validation — returns specific, plain-language errors.
   * @param {object} series
   * @param {object[]} lessonPlans
   */
  function validateCurriculumSeriesForPublish(series, lessonPlans = []) {
    const errors = [];
    const record = normalizedCurriculumSeries(series);
    if (!record) {
      return ["Curriculum could not be validated."];
    }
    if (!shortText(record.title) || record.title === "Untitled Curriculum") {
      errors.push("Title is missing.");
    }
    if (!SERIES_AGES.includes(record.age)) {
      errors.push("Age group is not selected.");
    }
    const hasCover = Boolean(record.coverImageUrl) || record.coverImageSource === "fallback";
    if (!hasCover) {
      errors.push("Cover or fallback is required.");
    }
    const plansById = new Map((lessonPlans || []).map((plan) => [plan.id, plan]));
    const weekNumbers = new Set();
    const occupied = new Map();
    record.weeks.forEach((week) => {
      if (weekNumbers.has(week.weekNumber)) {
        errors.push(`Two lesson plans are assigned to Week ${week.weekNumber}.`);
      }
      weekNumbers.add(week.weekNumber);
      if (!week.lessonPlanId) {
        errors.push(`Week ${week.weekNumber} is missing.`);
        return;
      }
      if (occupied.has(week.lessonPlanId)) {
        // Same plan in two weeks is allowed? Usually not ideal — warn.
        errors.push(`The same lesson plan is linked to Week ${occupied.get(week.lessonPlanId)} and Week ${week.weekNumber}.`);
      } else {
        occupied.set(week.lessonPlanId, week.weekNumber);
      }
      const plan = plansById.get(week.lessonPlanId);
      if (!plan) {
        errors.push(`Week ${week.weekNumber} links to a lesson plan that was not found.`);
        return;
      }
      const planStatus = String(plan.status || "").toLowerCase();
      if (!["published", "featured"].includes(planStatus)) {
        errors.push(`Week ${week.weekNumber} lesson plan "${plan.title || plan.id}" is not published.`);
      }
      const planAge = String(plan.age || "");
      const seriesAge = record.age;
      if (planAge && seriesAge && !planAge.toLowerCase().includes(seriesAge.toLowerCase()) && !seriesAge.toLowerCase().includes(planAge.toLowerCase().split(/\s/)[0])) {
        // Soft age-bucket check: Infant/Toddler/Preschool prefix
        const bucket = (value) => {
          const lower = String(value || "").toLowerCase();
          if (lower.includes("infant")) return "Infant";
          if (lower.includes("toddler")) return "Toddler";
          if (lower.includes("preschool")) return "Preschool";
          return value;
        };
        if (bucket(planAge) !== bucket(seriesAge)) {
          errors.push(`The Week ${week.weekNumber} lesson plan is ${bucket(planAge)}, but this curriculum is ${seriesAge}.`);
        }
      }
      if (record.plan === "Free" && String(plan.plan || "") === "Pro") {
        errors.push(`Week ${week.weekNumber} is a Pro lesson plan, but this curriculum is Free.`);
      }
    });
    // Detect duplicate week numbers from raw input before merge
    const rawWeeks = Array.isArray(series?.weeks) ? series.weeks : [];
    const rawCounts = new Map();
    rawWeeks.forEach((week) => {
      const n = Number(week?.weekNumber) || 0;
      if (!n) return;
      rawCounts.set(n, (rawCounts.get(n) || 0) + 1);
    });
    rawCounts.forEach((count, weekNumber) => {
      if (count > 1 && !errors.some((e) => e.includes(`Week ${weekNumber}`) && e.includes("Two lesson plans"))) {
        errors.push(`Two lesson plans are assigned to Week ${weekNumber}.`);
      }
    });
    return [...new Set(errors)];
  }

  function seriesFilledWeekCount(series) {
    const record = normalizedCurriculumSeries(series);
    if (!record) return 0;
    return record.weeks.filter((week) => week.lessonPlanId).length;
  }

  function publicSeriesDto(series, { includeDrafts = false } = {}) {
    const record = normalizedCurriculumSeries(series);
    if (!record) return null;
    if (!includeDrafts && !["published", "featured"].includes(record.status)) return null;
    return record;
  }

  const api = {
    SERIES_STATUSES,
    SERIES_AGES,
    SERIES_MONTHS,
    SERIES_SEASONS,
    emptySeriesWeek,
    defaultSeriesWeeks,
    mergeSeriesWeeks,
    normalizedCurriculumSeries,
    validateCurriculumSeriesForPublish,
    seriesFilledWeekCount,
    publicSeriesDto,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.CurriculumSeries = api;
  }
})();
