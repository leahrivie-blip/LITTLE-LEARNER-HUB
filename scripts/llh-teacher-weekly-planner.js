/**
 * Teacher Weekly Planner day shaping + validation.
 * Ensures printable Mon–Fri grids never contain empty cells.
 * Browser: globalThis.LlhTeacherWeeklyPlanner
 * Node: module.exports
 */
(function llhTeacherWeeklyPlannerModule() {
  "use strict";

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const DAY_LONG = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  };

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function presentApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPresent)
      ? globalThis.LLHTeachingKitPresent
      : null;
  }

  function presentLabel(value, fallback) {
    const api = presentApi();
    if (api?.presentLabel) return api.presentLabel(value, fallback);
    return cleanText(value) || cleanText(fallback) || "";
  }

  function presentCopy(value) {
    const api = presentApi();
    if (api?.presentCopy) return api.presentCopy(value);
    return cleanText(value);
  }

  function asStringArray(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => cleanText(typeof entry === "string" ? entry : entry?.title || entry)).filter(Boolean);
    }
    const text = cleanText(value);
    if (!text) return [];
    return text.split(/\r?\n+|;\s+/).map((line) => line.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  }

  function formatBook(book) {
    if (!book) return "";
    if (typeof book === "string") return cleanText(book);
    const title = cleanText(book.title);
    if (!title) return "";
    const author = cleanText(book.author);
    return author ? `${title} by ${author}` : title;
  }

  function formatSong(song) {
    if (!song) return "";
    if (typeof song === "string") return cleanText(song);
    return cleanText(song.title);
  }

  function activityTitle(activity) {
    return cleanText(activity?.title);
  }

  function isCircleCategory(category) {
    const value = cleanText(category).toLowerCase();
    return value.includes("circle") || value === "music & movement" || value.includes("music");
  }

  function isOutdoorCategory(category) {
    const value = cleanText(category).toLowerCase();
    return value.includes("outdoor") || value.includes("outside") || value.includes("playground");
  }

  function isMovementCategory(category) {
    const value = cleanText(category).toLowerCase();
    return value.includes("gross") || value.includes("movement") || isOutdoorCategory(value);
  }

  function firstSentence(value, maxChars = 90) {
    const clean = cleanText(value);
    if (!clean) return "";
    const match = clean.match(/^(.+?[.!?])(?:\s|$)/);
    const sentence = match ? match[1] : clean;
    return sentence.length > maxChars ? `${sentence.slice(0, maxChars - 1).trim()}…` : sentence;
  }

  /** Title + supporting detail so PDF cells never look blank/sparse. */
  function cellBlock(title, detail, tip) {
    const head = cleanText(title);
    const body = cleanText(detail);
    const extra = cleanText(tip);
    const parts = [];
    if (head) parts.push(head);
    if (body && body.toLowerCase() !== head.toLowerCase()) parts.push(body);
    if (extra && !parts.some((part) => part.toLowerCase() === extra.toLowerCase())) parts.push(extra);
    return parts.join(" — ");
  }

  function themeFillers(themeFocus, dayLabel) {
    const theme = themeFocus || "Weekly Theme";
    return [
      { title: `${theme} Discovery Centers`, detail: `Hands-on ${theme.toLowerCase()} invitations for ${dayLabel}.` },
      { title: `${theme} Fine Motor Practice`, detail: `Tracing, sorting, and small-muscle ${theme.toLowerCase()} work.` },
      { title: `${dayLabel} ${theme} Group Game`, detail: `Active group play tied to ${theme.toLowerCase()}.` },
      { title: `${theme} Sensory Exploration`, detail: `Touch, pour, and describe ${theme.toLowerCase()} materials.` },
      { title: `${theme} Creative Art`, detail: `Open-ended art connected to ${theme.toLowerCase()}.` },
    ];
  }

  /**
   * Dense Mon–Fri planner rows. Every required cell is non-empty and content-rich.
   */
  function buildTeacherPlannerDays(plan = {}, options = {}) {
    const exportApi = typeof globalThis !== "undefined" ? globalThis.LlhLessonWeeklyExport : null;
    const normalized = plan && typeof plan === "object" ? plan : {};
    const summary = exportApi?.buildWeeklySummary
      ? exportApi.buildWeeklySummary(normalized)
      : {
        title: cleanText(normalized.title) || "Weekly Lesson Plan",
        theme: cleanText(normalized.theme) || "Classroom Theme",
        age: cleanText(normalized.age) || "Preschool",
        weeklyOverview: cleanText(normalized.weeklyOverview),
        vocabularyWords: cleanText(normalized.vocabularyWords).replace(/\n+/g, ", "),
        books: (Array.isArray(normalized.books) ? normalized.books : []).map(formatBook).filter(Boolean),
        songs: (Array.isArray(normalized.songs) ? normalized.songs : []).map(formatSong).filter(Boolean),
      };
    const richDays = exportApi?.buildRichWeeklyDays
      ? exportApi.buildRichWeeklyDays(normalized)
      : WEEKDAYS.map((day) => ({ day, label: DAY_LONG[day], activities: [], activitySlots: [] }));

    const books = (summary.books || []).map(formatBook).filter(Boolean);
    const songs = (summary.songs || []).map(formatSong).filter(Boolean);
    const weeklyTheme = cleanText(summary.theme || normalized.theme) || "Weekly Theme";

    const days = richDays.map((day, dayIndex) => {
      const dayLabel = day.label || DAY_LONG[day.day] || DAY_LONG[WEEKDAYS[dayIndex]];
      const dayPlan = normalized.dailyPlans?.[day.day] || {};
      const themeBase = cleanText(day.themeFocus || day.theme || weeklyTheme) || weeklyTheme;
      const themeDetail = firstSentence(
        dayPlan.objectives || day.objectives || summary.weeklyOverview || `${dayLabel} ${themeBase} exploration`,
        110,
      );
      const themeFocus = cellBlock(
        themeBase,
        themeDetail,
        "Open centers; coach language, turn-taking, and curiosity",
      );

      const sourceActivities = [];
      const pushActivity = (activity) => {
        const title = activityTitle(activity);
        if (!title) return;
        if (sourceActivities.some((entry) => activityTitle(entry).toLowerCase() === title.toLowerCase())) return;
        sourceActivities.push(activity);
      };
      (Array.isArray(day.activities) ? day.activities : []).forEach(pushActivity);
      (Array.isArray(day.activitySlots) ? day.activitySlots : []).filter(Boolean).forEach(pushActivity);
      asStringArray(dayPlan.circleTime).forEach((entry) => {
        pushActivity({ title: entry, category: "Circle Time", description: "Warm-up songs, vocabulary, and group talk." });
      });

      const activityCards = [];
      const pushCard = (title, detail, category = "Activity") => {
        const head = presentCopy(title) || cleanText(title);
        if (!head) return;
        if (activityCards.some((entry) => entry.title.toLowerCase() === head.toLowerCase())) return;
        const categoryLabel = presentLabel(category, "Activity");
        const body = firstSentence(presentCopy(detail) || categoryLabel, 100);
        activityCards.push({
          title: head,
          detail: body,
          category: categoryLabel || "Activity",
          cell: cellBlock(head, body, "Materials out · model · guided play · clean-up cue"),
        });
      };

      sourceActivities.forEach((activity) => {
        pushCard(
          activityTitle(activity),
          activity.description || activity.objective || activity.learningGoals?.[0] || activity.category,
          activity.category || activity.activityCategory,
        );
      });
      if (activityCards.length < 3) {
        songs.forEach((song) => {
          if (activityCards.length >= 3) return;
          pushCard(`Song Play: ${song}`, "Sing, move, and practice theme vocabulary together.", "Music & Movement");
        });
      }
      if (activityCards.length < 3) {
        themeFillers(themeBase, dayLabel).forEach((filler) => {
          if (activityCards.length >= 3) return;
          pushCard(filler.title, filler.detail, "Open-Ended Exploration");
        });
      }
      while (activityCards.length < 3) {
        pushCard(`${themeBase} Learning Centers`, `Teacher-guided ${themeBase.toLowerCase()} invitations.`, "Open-Ended Exploration");
      }
      const cards = activityCards.slice(0, 3);

      let circleRaw = cleanText(day.circleTime);
      if (!circleRaw) {
        const circleActivity = sourceActivities.find((activity) => isCircleCategory(activity.category));
        if (circleActivity) circleRaw = activityTitle(circleActivity);
      }
      if (!circleRaw) {
        const song = songs[dayIndex % Math.max(songs.length, 1)] || songs[0];
        circleRaw = song ? `Circle + Song: ${song}` : `${themeBase} Circle Time`;
      }
      const circleTime = cellBlock(
        circleRaw,
        "Greetings, songs, and theme talk",
        "Review letter/number/shape/color; invite every voice",
      );

      let outdoorRaw = cleanText(day.outdoorPlay);
      if (!outdoorRaw) {
        const movement = sourceActivities.find((activity) => (
          isMovementCategory(activity.category)
          || /outdoor|outside|playground|walk|movement/i.test(activityTitle(activity))
        ));
        if (movement) outdoorRaw = `Outdoor: ${activityTitle(movement)}`;
      }
      if (!outdoorRaw) outdoorRaw = `Outdoor ${themeBase} Play`;
      const outdoorPlay = cellBlock(
        outdoorRaw,
        "Gross motor + fresh-air exploration",
        "Safety scan; active play; calm transition indoors",
      );

      const bookTitle = cleanText(day.bookOfTheDay)
        || cleanText(books[dayIndex % Math.max(books.length, 1)])
        || cleanText(books[0])
        || `${themeBase} Story Time`;
      const bookOfTheDay = cellBlock(
        bookTitle,
        "Read-aloud + story talk",
        "Picture walk; retell; tie story words to play",
      );

      return {
        day: day.day || WEEKDAYS[dayIndex],
        label: dayLabel,
        themeFocus,
        circleTime,
        outdoorPlay,
        bookOfTheDay,
        plannerActivities: cards.map((card) => card.cell),
        activity1: cards[0].cell,
        activity2: cards[1].cell,
        activity3: cards[2].cell,
        activityTitles: cards.map((card) => card.title),
      };
    });

    if (options.validate !== false) {
      const validation = validateTeacherPlannerDays(days);
      if (!validation.ok && options.strict) {
        const error = new Error(validation.message);
        error.validation = validation;
        throw error;
      }
    }
    return { days, summary, weeklyTheme };
  }

  function validateTeacherPlannerDays(days) {
    const required = [
      ["themeFocus", "Theme Focus"],
      ["circleTime", "Circle Time"],
      ["activity1", "Activity 1"],
      ["activity2", "Activity 2"],
      ["activity3", "Activity 3"],
      ["outdoorPlay", "Outdoor Play"],
      ["bookOfTheDay", "Book of the Day"],
    ];
    const missing = [];
    (Array.isArray(days) ? days : []).forEach((day) => {
      required.forEach(([key, label]) => {
        const value = key.startsWith("activity")
          ? cleanText(day[key] || day.plannerActivities?.[Number(key.slice(-1)) - 1])
          : cleanText(day[key]);
        if (!value) missing.push(`${day.label || day.day}: ${label}`);
      });
    });
    if ((Array.isArray(days) ? days : []).length !== 5) {
      missing.push("Expected Monday–Friday (5 days)");
    }
    return {
      ok: missing.length === 0,
      missing,
      message: missing.length
        ? `Teacher Weekly Planner is incomplete:\n- ${missing.join("\n- ")}`
        : "Teacher Weekly Planner is complete.",
    };
  }

  function repairLessonPlanForPlanner(plan = {}) {
    const normalized = plan && typeof plan === "object" ? { ...plan } : {};
    const theme = cleanText(normalized.theme) || "Weekly Theme";
    const books = Array.isArray(normalized.books) ? normalized.books.slice() : [];
    const songs = Array.isArray(normalized.songs) ? normalized.songs.slice() : [];
    const dailyPlans = normalized.dailyPlans && typeof normalized.dailyPlans === "object"
      ? { ...normalized.dailyPlans }
      : {};

    WEEKDAYS.forEach((day, dayIndex) => {
      const existing = dailyPlans[day] && typeof dailyPlans[day] === "object" ? { ...dailyPlans[day] } : {};
      const items = Array.isArray(existing.items) ? existing.items.map((item) => ({ ...item })) : [];
      while (items.length < 3) {
        const fillers = themeFillers(theme, DAY_LONG[day]);
        const filler = fillers[items.length] || { title: `${theme} Learning Centers`, detail: `Teacher-guided ${theme.toLowerCase()} experience.` };
        items.push({
          itemId: `repair-${day}-a${items.length + 1}`,
          activityCategory: items.length === 0 ? "Open-Ended Exploration" : items.length === 1 ? "Fine Motor" : "Gross Motor & Movement",
          title: filler.title,
          description: filler.detail,
          materials: cleanText(normalized.weeklyMaterials) || "Classroom materials",
          steps: "1. Introduce the invitation.\n2. Support exploration.\n3. Close with reflection.",
          learningGoals: [`Explore ${theme}`],
        });
      }
      const circle = asStringArray(existing.circleTime);
      if (!circle.length) {
        const song = formatSong(songs[dayIndex % Math.max(songs.length, 1)] || songs[0]);
        circle.push(song ? `Circle + Song: ${song}` : `${theme} Circle Time`);
      }
      if (!cleanText(existing.outdoorPlay)) {
        const movement = items.find((item) => isMovementCategory(item.activityCategory));
        existing.outdoorPlay = movement
          ? `Outdoor: ${cleanText(movement.title)}`
          : `Outdoor ${theme} Play`;
      }
      if (!cleanText(existing.theme)) existing.theme = theme;
      if (!Array.isArray(existing.books) || !existing.books.length) {
        const book = books[dayIndex % Math.max(books.length, 1)] || books[0];
        if (book) existing.books = [book];
      }
      existing.circleTime = circle;
      existing.items = items;
      dailyPlans[day] = existing;
    });

    normalized.dailyPlans = dailyPlans;
    return normalized;
  }

  function auditPlanPlannerReadiness(plan = {}) {
    const repaired = repairLessonPlanForPlanner(plan);
    const built = buildTeacherPlannerDays(repaired, { validate: true });
    const before = buildTeacherPlannerDays(plan, { validate: false, strict: false });
    const beforeValidation = validateTeacherPlannerDays(before.days);
    const afterValidation = validateTeacherPlannerDays(built.days);
    return {
      title: cleanText(plan.title) || "Untitled",
      age: cleanText(plan.age) || "",
      readyBeforeRepair: beforeValidation.ok,
      readyAfterRepair: afterValidation.ok,
      missingBefore: beforeValidation.missing,
      missingAfter: afterValidation.missing,
      repairedPlan: repaired,
    };
  }

  const api = {
    WEEKDAYS,
    DAY_LONG,
    buildTeacherPlannerDays,
    validateTeacherPlannerDays,
    repairLessonPlanForPlanner,
    auditPlanPlannerReadiness,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhTeacherWeeklyPlanner = api;
  }
})();
