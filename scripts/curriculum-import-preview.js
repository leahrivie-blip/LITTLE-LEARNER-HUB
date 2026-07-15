/**
 * Phase C: curriculum lesson plan import preview model (read-only).
 * Used by browser (global CurriculumImportPreview) and Node tests.
 */
(function curriculumImportPreviewModule() {
const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const CURRICULUM_PREMIUM_TEXT_LIMIT = 12000;
const CURRICULUM_ITEM_TEXT_LIMITS = {
  title: 180,
  objective: 4000,
  description: 4000,
  materials: 4000,
  setup: CURRICULUM_PREMIUM_TEXT_LIMIT,
  steps: CURRICULUM_PREMIUM_TEXT_LIMIT,
  teacherRole: 4000,
  teacherLanguage: CURRICULUM_PREMIUM_TEXT_LIMIT,
  observationOpportunities: 4000,
  vocabulary: 4000,
  extensions: 4000,
  adaptations: 4000,
  safetyNotes: 4000,
  ageModifications: 4000,
};

function normalizedShortText(value) {
  return String(value || "").trim();
}

function countDailyActivities(dailyPlans = {}) {
  const perDay = {};
  let total = 0;
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const count = Array.isArray(dailyPlans?.[day]?.items) ? dailyPlans[day].items.length : 0;
    perDay[day] = count;
    total += count;
  });
  return { total, perDay };
}

function countBooksAndSongs(data = {}) {
  let books = Array.isArray(data.books) ? data.books.length : 0;
  let songs = Array.isArray(data.songs) ? data.songs.length : 0;
  CURRICULUM_WEEKDAYS.forEach((day) => {
    books += Array.isArray(data.dailyPlans?.[day]?.books) ? data.dailyPlans[day].books.length : 0;
    songs += Array.isArray(data.dailyPlans?.[day]?.songs) ? data.dailyPlans[day].songs.length : 0;
  });
  return { books, songs };
}

function parseImportMessage(message, severity) {
  const text = String(message || "").trim();
  const entry = {
    severity,
    message: text,
    section: "",
    weekday: "",
    activityName: "",
    line: null,
  };
  const dayMatch = text.match(/^(monday|tuesday|wednesday|thursday|friday)\b/i);
  if (dayMatch) entry.weekday = dayMatch[1].toLowerCase();
  const activityMatch = text.match(/"([^"]+)"/);
  if (activityMatch) entry.activityName = activityMatch[1];
  if (/^missing required/i.test(text) || /TITLE/i.test(text)) entry.section = "lesson";
  if (/AGE_GROUP|AGE GROUP/i.test(text)) entry.section = "lesson";
  if (/CATEGORY/i.test(text)) entry.section = "activity";
  if (/DIRECTIONS/i.test(text)) entry.section = "activity";
  if (/WEEKLY|weekly/i.test(text)) entry.section = "weekly";
  if (/marker/i.test(text)) entry.section = "markers";
  if (/activity/i.test(text) && !entry.section) entry.section = "activity";
  return entry;
}

function isBlockingUnmappedEntry(entry) {
  const text = String(entry?.text || "").trim();
  if (!text) return false;
  if (/^@[A-Z0-9_]+@$/i.test(text)) return true;
  if (/^(ACTIVITY_NAME|CATEGORY|DIRECTIONS|TITLE|AGE_GROUP|THEME|PLAN|STATUS|BOOKS|SONGS|MATERIALS|SETUP):/i.test(text)) return true;
  if (/^---ACTIVITY---/i.test(text)) return true;
  if (text.includes("|") && text.length > 3) return true;
  if (entry.reason === "content_outside_marked_region") return true;
  if (entry.reason === "unrecognized_line") return true;
  if (entry.reason === "unexpected_marker") return true;
  if (entry.reason === "content_after_lesson_plan_end") return true;
  return false;
}

function fieldLengthErrors(data) {
  const errors = [];
  const checkText = (label, value, max, context = {}) => {
    const text = String(value || "");
    if (text.length > max) {
      errors.push({
        severity: "error",
        message: `${label} exceeds the ${max}-character server limit (${text.length} characters).`,
        section: context.section || "lesson",
        weekday: context.weekday || "",
        activityName: context.activityName || "",
        line: null,
      });
    }
  };
  checkText("Title", data.title, 180, { section: "lesson" });
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const dayPlan = data.dailyPlans?.[day] || {};
    (dayPlan.items || []).forEach((item) => {
      const ctx = { section: "activity", weekday: day, activityName: item.title || "" };
      Object.entries(CURRICULUM_ITEM_TEXT_LIMITS).forEach(([field, max]) => {
        checkText(`${item.title || "Activity"} ${field}`, item[field], max, ctx);
      });
    });
  });
  return errors;
}

function duplicateTitleWarnings(data) {
  const warnings = [];
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const items = data.dailyPlans?.[day]?.items || [];
    const byTitle = new Map();
    items.forEach((item) => {
      const key = normalizedShortText(item.title).toLowerCase();
      if (!key) return;
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(item);
    });
    byTitle.forEach((group, title) => {
      if (group.length > 1) {
        warnings.push({
          severity: "warning",
          message: `Duplicate activity title "${title}" appears ${group.length} times on ${day}.`,
          section: "activity",
          weekday: day,
          activityName: title,
          line: null,
        });
      }
    });
  });
  return warnings;
}

function emptyWeekdayWarnings(data, formatVersion = 1) {
  const warnings = [];
  const skipDayMediaWarnings = formatVersion === 3;
  CURRICULUM_WEEKDAYS.forEach((day) => {
    const dayPlan = data.dailyPlans?.[day];
    if (!dayPlan) return;
    const hasDayContent = Boolean(
      dayPlan.theme
      || dayPlan.objectives
      || (dayPlan.items || []).length
      || (dayPlan.books || []).length
      || (dayPlan.songs || []).length,
    );
    if (hasDayContent && !(dayPlan.items || []).length) {
      warnings.push({
        severity: "warning",
        message: `${day.charAt(0).toUpperCase() + day.slice(1)} has daily content but no activities.`,
        section: "daily",
        weekday: day,
        activityName: "",
        line: null,
      });
    }
    if ((dayPlan.items || []).length && !(dayPlan.books || []).length && !skipDayMediaWarnings) {
      warnings.push({
        severity: "warning",
        message: `No books entered for ${day}.`,
        section: "daily",
        weekday: day,
        activityName: "",
        line: null,
      });
    }
    if ((dayPlan.items || []).length && !(dayPlan.songs || []).length && !skipDayMediaWarnings) {
      warnings.push({
        severity: "warning",
        message: `No songs entered for ${day}.`,
        section: "daily",
        weekday: day,
        activityName: "",
        line: null,
      });
    }
  });
  return warnings;
}

function resolveDuplicateLessonTitle(importData, existingPlans = [], editingLessonPlanId = "") {
  const title = normalizedShortText(importData?.title);
  if (!title) return { status: "none" };
  const match = (existingPlans || []).find(
    (plan) => normalizedShortText(plan?.title).toLowerCase() === title.toLowerCase(),
  );
  if (!match) return { status: "none" };
  if (match.id && match.id === editingLessonPlanId) return { status: "same-plan" };
  return { status: "duplicate", existingPlan: match };
}

function computeActivitySyncPreview(importData, { lessonPlanId = "", existingActivities = [] } = {}) {
  const planId = normalizedShortText(lessonPlanId);
  const linked = (existingActivities || []).filter((item) => item.lessonPlanId === planId);
  const linkedBySourceKey = new Map(linked.map((item) => [item.sourceKey, item]));
  const activeItems = [];
  CURRICULUM_WEEKDAYS.forEach((day) => {
    (importData?.dailyPlans?.[day]?.items || []).forEach((item) => {
      if (!item?.itemId) return;
      const sourceKey = planId ? `${planId}:${item.itemId}` : "";
      activeItems.push({
        itemId: item.itemId,
        importKey: item.importKey || "",
        title: item.title || "",
        dayOfWeek: day,
        sourceKey,
        existing: sourceKey ? linkedBySourceKey.get(sourceKey) || null : null,
      });
    });
  });
  const activeSourceKeys = new Set(activeItems.map((item) => item.sourceKey).filter(Boolean));
  const entries = activeItems.map((item) => ({
    ...item,
    action: item.existing ? "update" : "create",
  }));
  linked.forEach((activity) => {
    if (activity.status === "archived") return;
    if (!activeSourceKeys.has(activity.sourceKey)) {
      entries.push({
        itemId: activity.itemId,
        importKey: "",
        title: activity.title,
        dayOfWeek: activity.dayOfWeek,
        sourceKey: activity.sourceKey,
        existing: activity,
        action: "archive",
      });
    }
  });
  const duplicateTitleGroups = [];
  const titleBuckets = new Map();
  activeItems.forEach((item) => {
    const key = `${item.dayOfWeek}:${normalizedShortText(item.title).toLowerCase()}`;
    if (!titleBuckets.has(key)) titleBuckets.set(key, []);
    titleBuckets.get(key).push(item);
  });
  titleBuckets.forEach((group) => {
    if (group.length > 1) {
      duplicateTitleGroups.push({
        day: group[0].dayOfWeek,
        title: group[0].title,
        itemIds: group.map((item) => item.itemId),
      });
    }
  });
  return {
    newEntries: entries.filter((item) => item.action === "create").length,
    updatedEntries: entries.filter((item) => item.action === "update").length,
    archivedEntries: entries.filter((item) => item.action === "archive").length,
    duplicateTitleGroups,
    missingStableIds: activeItems.filter((item) => !item.itemId).length,
    missingImportKeys: activeItems.filter((item) => !item.importKey).length,
    entries,
  };
}

function buildCurriculumImportPreview(parsed, options = {}) {
  const {
    formatVersion = parsed?.parseReport?.formatVersion || 1,
    existingPlans = [],
    editingLessonPlanId = "",
    existingActivities = [],
    proposedLessonPlanId = "",
  } = options;
  const data = parsed?.data || null;
  const activityCounts = countDailyActivities(data?.dailyPlans || {});
  const mediaCounts = countBooksAndSongs(data || {});
  const daysPresent = CURRICULUM_WEEKDAYS.filter((day) => {
    const dayPlan = data?.dailyPlans?.[day];
    if (!dayPlan) return false;
    return Boolean(
      dayPlan.theme
      || dayPlan.objectives
      || (dayPlan.items || []).length
      || (dayPlan.books || []).length
      || (dayPlan.songs || []).length
      || (dayPlan.circleTime || []).length,
    );
  });
  const structuredErrors = [
  ...(parsed?.errors || []).map((message) => parseImportMessage(message, "error")),
  ...fieldLengthErrors(data || {}),
  ];
  const structuredWarnings = [
  ...(parsed?.warnings || []).map((message) => parseImportMessage(message, "warning")),
  ...duplicateTitleWarnings(data || {}),
  ...emptyWeekdayWarnings(data || {}, formatVersion),
  ];
  if (formatVersion === 2) {
    structuredWarnings.unshift({
      severity: "error",
      message: "Legacy @LESSON_PLAN_START@ marker format is no longer supported. Paste the current label-only format instead.",
      section: "format",
      weekday: "",
      activityName: "",
      line: null,
    });
  }
  if (formatVersion === 0 || formatVersion === 1) {
    structuredWarnings.unshift({
      severity: "error",
      message: "Unrecognized paste format. Use TITLE:, AGE_GROUP:, weekday headers (MONDAY–FRIDAY), and ACTIVITY_NAME: blocks.",
      section: "format",
      weekday: "",
      activityName: "",
      line: null,
    });
  }
  const unmapped = Array.isArray(parsed?.unmapped) ? parsed.unmapped : [];
  const blockingUnmapped = unmapped.filter(isBlockingUnmappedEntry);
  const duplicateTitle = resolveDuplicateLessonTitle(data, existingPlans, editingLessonPlanId);
  const lessonPlanId = proposedLessonPlanId || editingLessonPlanId || "";
  const activitySync = computeActivitySyncPreview(data, {
    lessonPlanId,
    existingActivities,
  });
  const publishedWarning = data?.status === "published" || data?.status === "featured"
    ? {
      severity: "warning",
      message: `This lesson is marked ${data.status}. After you Save in the editor, it may become visible according to its Free/Pro access rules.`,
      section: "lesson",
      weekday: "",
      activityName: "",
      line: null,
    }
    : null;
  if (publishedWarning) structuredWarnings.unshift(publishedWarning);
  if (duplicateTitle.status === "duplicate") {
    structuredWarnings.push({
      severity: "warning",
      message: `A lesson plan titled "${data.title}" already exists. Choose how to proceed before confirming.`,
      section: "lesson",
      weekday: "",
      activityName: "",
      line: null,
    });
  }
  const summary = {
    lessonPlanCount: 1,
    weekdaysDetected: daysPresent.length,
    activityCount: activityCounts.total,
    activityCountByDay: activityCounts.perDay,
    bookCount: mediaCounts.books,
    songCount: mediaCounts.songs,
    activityLibraryEntries: activitySync.newEntries + activitySync.updatedEntries,
    errorCount: structuredErrors.length,
    warningCount: structuredWarnings.length,
    unmappedCount: unmapped.length,
    blockingUnmappedCount: blockingUnmapped.length,
    formatVersion,
    formatLabel: formatVersion === 3
      ? "Little Learner Hub lesson plan format"
      : formatVersion === 2
        ? "legacy marker format (unsupported)"
        : "unrecognized format",
  };
  return {
    ok: Boolean(parsed?.ok) && structuredErrors.length === 0,
    parsed,
    data,
    summary,
    errors: structuredErrors,
    warnings: structuredWarnings,
    unmapped,
    blockingUnmapped,
    duplicateTitle,
    activitySync,
    daysPresent,
    canConfirm: Boolean(parsed?.ok)
      && structuredErrors.length === 0
      && blockingUnmapped.length === 0
      && duplicateTitle.status !== "duplicate",
    confirmMessage: `Import & Save will create 1 lesson plan and ${summary.activityLibraryEntries} linked Activity Library ${summary.activityLibraryEntries === 1 ? "entry" : "entries"} automatically.`,
  };
}

function applyImportTitleAction(preview, action) {
  if (!preview?.data) return preview;
  const next = { ...preview, titleAction: action };
  if (action === "new-copy" && preview.data.title) {
    const copyTitle = `${preview.data.title} (Import copy)`;
    next.data = { ...preview.data, title: copyTitle };
    next.duplicateTitle = { status: "resolved-copy", existingPlan: preview.duplicateTitle?.existingPlan || null };
    next.canConfirm = preview.ok && preview.errors.length === 0 && preview.blockingUnmapped.length === 0;
    next.confirmMessage = `Import & Save will create 1 lesson plan titled "${copyTitle}" and ${preview.summary.activityLibraryEntries} linked Activity Library entries automatically.`;
  } else if (action === "same-plan" || action === "open-existing") {
    next.canConfirm = false;
  }
  return next;
}

const api = {
  CURRICULUM_WEEKDAYS,
  CURRICULUM_PREMIUM_TEXT_LIMIT,
  buildCurriculumImportPreview,
  computeActivitySyncPreview,
  resolveDuplicateLessonTitle,
  isBlockingUnmappedEntry,
  applyImportTitleAction,
  countDailyActivities,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.CurriculumImportPreview = api;
}
})();
