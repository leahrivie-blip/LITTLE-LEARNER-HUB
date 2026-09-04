/**
 * Authorized FREE-user projection for premium lesson weeks.
 * Metadata only — never instructions, teacher-prep text, asset URLs, or PDFs.
 * @module premium-week-preview
 */
"use strict";

/** @typedef {{ title: string, activityCategory: string, printableIncluded: boolean, prepMinutes: number|null }} WeekPreviewActivity */
/** @typedef {{ day: string, dayLabel: string, activities: WeekPreviewActivity[] }} WeekPreviewDay */
/** @typedef {{ days: WeekPreviewDay[], printableCount: number, activityCount: number, packet: Record<string, boolean> }} AuthorizedWeekPreview */

const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
const DAY_LABELS = Object.freeze({
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
});

/** Keys that must never appear on a preview activity. */
const FORBIDDEN_PREVIEW_KEYS = Object.freeze([
  "objective",
  "description",
  "materials",
  "setup",
  "steps",
  "directions",
  "teacherRole",
  "teacherLanguage",
  "learningGoals",
  "observationOpportunities",
  "vocabulary",
  "extensions",
  "adaptations",
  "safetyNotes",
  "ageModifications",
  "familyConnection",
  "preparation",
  "prep",
  "printableInstructions",
  "setupImageUrl",
  "exampleImageUrl",
  "mediaUrl",
  "fileUrl",
  "downloadUrl",
  "signedUrl",
  "mediaAssetId",
  "previewImageUrl",
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function shortText(value, max = 180) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function optionalMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 180) return null;
  return Math.round(n);
}

/**
 * Presence-only printable flag. Never returns IDs or URLs.
 * @param {Record<string, unknown>|null} item
 * @returns {boolean}
 */
function activityHasPrintable(item) {
  if (!item || typeof item !== "object") return false;
  if (item.hasPrintable === true || item.printableIncluded === true) return true;
  if (Array.isArray(item.printableIds) && item.printableIds.some((id) => String(id || "").trim())) return true;
  if (Array.isArray(item.resourceIds) && item.resourceIds.some((id) => String(id || "").trim())) return true;
  return false;
}

/**
 * Count printable pack items without exposing IDs or URLs.
 * @param {Record<string, unknown>|null} plan
 * @returns {number}
 */
function countLessonPrintables(plan) {
  if (!plan || typeof plan !== "object") return 0;
  const ids = new Set();
  const add = (raw) => {
    const id = String(raw == null ? "" : raw).trim();
    if (id) ids.add(id);
  };
  (Array.isArray(plan.resourceIds) ? plan.resourceIds : []).forEach(add);
  const tk = plan.teachingKit && typeof plan.teachingKit === "object" ? plan.teachingKit : {};
  (Array.isArray(tk.printableIds) ? tk.printableIds : []).forEach(add);
  const draft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object" ? plan.enrichmentDraft : {};
  const week = draft.week && typeof draft.week === "object" ? draft.week : {};
  (Array.isArray(week.printableIds) ? week.printableIds : []).forEach(add);
  return ids.size;
}

/**
 * @param {unknown} item
 * @returns {WeekPreviewActivity|null}
 */
function projectActivity(item) {
  if (!item || typeof item !== "object") return null;
  const title = shortText(item.title, 180);
  if (!title) return null;
  return {
    title,
    activityCategory: shortText(item.activityCategory || item.category, 80),
    printableIncluded: activityHasPrintable(item),
    prepMinutes: optionalMinutes(
      item.setupMinutes != null ? item.setupMinutes : item.durationMinutes,
    ),
  };
}

/**
 * Boolean packet inventory — only items the lesson actually contains.
 * @param {Record<string, unknown>|null} plan
 * @param {WeekPreviewDay[]} days
 * @param {number} printableCount
 */
function packetSummary(plan, days, printableCount) {
  const entry = plan && typeof plan === "object" ? plan : {};
  const weekdayFlags = {};
  WEEKDAYS.forEach((day) => {
    const row = days.find((item) => item.day === day);
    weekdayFlags[day] = Boolean(row && row.activities.length);
  });
  return {
    weeklyOverview: Boolean(shortText(entry.weeklyOverview, 8)),
    teachingNotes: Boolean(shortText(entry.objectives, 8)),
    observationPrompts: Boolean(shortText(entry.observationOpportunities, 8)),
    familyConnection: Boolean(shortText(entry.familyConnection, 8)),
    printablePack: printableCount > 0,
    ...weekdayFlags,
  };
}

/**
 * Server-authoritative week preview for locked Pro lessons.
 * @param {Record<string, unknown>|null} plan
 * @returns {AuthorizedWeekPreview|null}
 */
function buildAuthorizedWeekPreview(plan) {
  if (!plan || typeof plan !== "object") return null;
  const daily = plan.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  /** @type {WeekPreviewDay[]} */
  const days = [];
  let activityCount = 0;
  WEEKDAYS.forEach((day) => {
    const dayInput = daily[day] && typeof daily[day] === "object" ? daily[day] : {};
    const items = Array.isArray(dayInput.items) ? dayInput.items : [];
    const activities = items.map(projectActivity).filter(Boolean);
    activityCount += activities.length;
    days.push({
      day,
      dayLabel: DAY_LABELS[day],
      activities,
    });
  });
  const printableCount = countLessonPrintables(plan);
  return {
    days,
    printableCount,
    activityCount,
    packet: packetSummary(plan, days, printableCount),
  };
}

/**
 * True when a payload still contains forbidden premium fields.
 * @param {unknown} value
 * @returns {string[]}
 */
function forbiddenPreviewLeaks(value) {
  const found = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    Object.keys(node).forEach((key) => {
      if (FORBIDDEN_PREVIEW_KEYS.includes(key)) found.add(key);
      walk(node[key]);
    });
  };
  walk(value);
  return [...found];
}

module.exports = {
  WEEKDAYS,
  DAY_LABELS,
  FORBIDDEN_PREVIEW_KEYS,
  shortText,
  optionalMinutes,
  activityHasPrintable,
  countLessonPrintables,
  projectActivity,
  buildAuthorizedWeekPreview,
  forbiddenPreviewLeaks,
};
