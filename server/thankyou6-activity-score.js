/**
 * Isolated activity scoring for FREE_USER_THANKYOU6_AUG2026.
 *
 * Uses only canonical fields already stored on user records:
 *   - lastSeenAt / lastLoginAt  (recency; never updatedAt)
 *   - featureUsage[eventName]   (durable per-user counters written by analytics)
 *
 * Does not invent fields. Does not scan trimmed analyticsEvents history.
 * Lifetime featureUsage totals are ignored when the account is older than
 * RECENT_WINDOW_DAYS (stale historical volume cannot outrank recent use).
 */

const RECENT_WINDOW_DAYS = 60;
const SELECT_LIMIT = 25;

const LESSON_KEYS = Object.freeze([
  "lesson_plan_view",
  "curriculum_lesson_view",
  "resource_view",
]);

const ACTIVITY_KEYS = Object.freeze([
  "activity_view",
  "curriculum_activity_view",
]);

const SAVE_KEYS = Object.freeze([
  "favorite_add",
  "resource_favorite",
]);

const PLANNER_KEYS = Object.freeze([
  "lesson_plan_added_to_calendar",
  "calendar_lesson_assigned",
  "add_to_calendar",
  "schedule_assign_lesson",
  "curriculum_planner_assign",
  "lesson_use_this_plan_main_calendar",
  "lesson_add_to_my_week",
]);

const DOC_TOOL_KEYS = Object.freeze([
  "documentation_helper",
  "observation_created",
  "observation_saved",
  "daily_log_created",
  "daily_report_saved",
  "form_submitted",
  "forms_submitted",
]);

const AI_KEYS = Object.freeze([
  "ai_helper_used",
  "ai_generation",
  "ai_guide_open",
  "helper_generate",
]);

const DOWNLOAD_PRINT_KEYS = Object.freeze([
  "resource_pdf_download",
  "resource_docx_download",
  "resource_download",
  "lesson_docx_download",
  "generated_pdf",
  "resource_print",
  "generated_print",
  "provider_tool_pdf",
]);

const LOGIN_KEYS = Object.freeze(["account_login_complete"]);
const PAGE_KEYS = Object.freeze(["page_view", "website_visit"]);

function parseIsoMs(value) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function usageSum(featureUsage, keys) {
  const usage = featureUsage && typeof featureUsage === "object" ? featureUsage : {};
  return keys.reduce((total, key) => total + (Number(usage[key]) || 0), 0);
}

function featureUsageTotal(featureUsage) {
  const usage = featureUsage && typeof featureUsage === "object" ? featureUsage : {};
  return Object.values(usage).reduce((total, value) => total + (Number(value) || 0), 0);
}

/**
 * Canonical last-active stamp. Matches Admin analytics: lastSeenAt || lastLoginAt.
 * Never falls back to updatedAt (admin edits / stubs must not look active).
 */
function lastActiveAtOf(user) {
  return String(user?.lastSeenAt || user?.lastLoginAt || "").trim();
}

function accountCreatedAtOf(user) {
  return String(user?.createdAt || user?.signupAt || user?.accountCreatedAt || "").trim();
}

function recencyPoints(daysSince) {
  if (!Number.isFinite(daysSince) || daysSince < 0) return { points: 0, label: "no last-active timestamp" };
  if (daysSince <= 7) return { points: 40, label: `active within ${Math.max(0, Math.floor(daysSince))} day(s)` };
  if (daysSince <= 14) return { points: 32, label: "active within 14 days" };
  if (daysSince <= 30) return { points: 24, label: "active within 30 days" };
  if (daysSince <= 60) return { points: 12, label: "active within 60 days" };
  return { points: 0, label: `inactive for ${Math.floor(daysSince)} days — lifetime usage ignored` };
}

function cappedPoints(count, perItem, cap, label) {
  const n = Number(count) || 0;
  if (n <= 0) return { points: 0, count: 0, label: "" };
  const points = Math.min(cap, n * perItem);
  return { points, count: n, label: `${label}: ${n} (+${points})` };
}

function scoreThankYou6Activity(user, nowMs = Date.now()) {
  const usage = user?.featureUsage && typeof user.featureUsage === "object" ? user.featureUsage : {};
  const lastActiveAt = lastActiveAtOf(user);
  const lastActiveMs = parseIsoMs(lastActiveAt);
  const createdAt = accountCreatedAtOf(user);
  const createdMs = parseIsoMs(createdAt);
  const daysSinceActive = lastActiveMs > 0
    ? Math.max(0, (nowMs - lastActiveMs) / 86400000)
    : Infinity;
  const usageTotal = featureUsageTotal(usage);
  const hasRecency = lastActiveMs > 0;
  const recentEnough = hasRecency && daysSinceActive <= RECENT_WINDOW_DAYS;
  const measurable = hasRecency || usageTotal > 0;

  const recency = recencyPoints(daysSinceActive);
  const reasons = [];
  if (recency.points > 0) reasons.push(`Recency: ${recency.label} (+${recency.points})`);
  else reasons.push(`Recency: ${recency.label} (+0)`);

  const signals = {
    lastActiveAt,
    lastLoginAt: String(user?.lastLoginAt || ""),
    lastSeenAt: String(user?.lastSeenAt || ""),
    createdAt,
    daysSinceActive: Number.isFinite(daysSinceActive) ? Number(daysSinceActive.toFixed(2)) : null,
    pageViews: usageSum(usage, PAGE_KEYS),
    loginEvents: usageSum(usage, LOGIN_KEYS),
    lessonViews: usageSum(usage, LESSON_KEYS),
    activityViews: usageSum(usage, ACTIVITY_KEYS),
    saves: usageSum(usage, SAVE_KEYS),
    plannerUses: usageSum(usage, PLANNER_KEYS),
    docToolUses: usageSum(usage, DOC_TOOL_KEYS),
    aiUses: usageSum(usage, AI_KEYS),
    downloadsPrints: usageSum(usage, DOWNLOAD_PRINT_KEYS),
    featureUsageTotal: usageTotal,
  };

  let engagement = 0;
  if (recentEnough) {
    const buckets = [
      cappedPoints(signals.lessonViews, 3, 24, "Lesson/resource views"),
      cappedPoints(signals.activityViews, 3, 15, "Activity views"),
      cappedPoints(signals.saves, 5, 20, "Saves/favorites"),
      cappedPoints(signals.plannerUses, 4, 16, "Planner/calendar"),
      cappedPoints(signals.docToolUses, 4, 16, "Documentation/tools"),
      cappedPoints(signals.aiUses, 3, 12, "AI helpers"),
      cappedPoints(signals.downloadsPrints, 2, 10, "Downloads/prints"),
      cappedPoints(signals.loginEvents, 3, 12, "Repeat logins"),
      cappedPoints(signals.pageViews, 1, 10, "Page views"),
    ];
    for (const bucket of buckets) {
      engagement += bucket.points;
      if (bucket.label) reasons.push(bucket.label);
    }
  } else if (usageTotal > 0 && !recentEnough) {
    reasons.push("Lifetime featureUsage present but ignored — no activity in the last 60 days");
  }

  const score = recency.points + engagement;
  return {
    score,
    recencyPoints: recency.points,
    engagementPoints: engagement,
    lastActiveAt,
    lastActiveMs,
    createdAt,
    createdMs,
    daysSinceActive: signals.daysSinceActive,
    measurable,
    recentEnough,
    hasRecency,
    signals,
    reasons,
    rankWhy: reasons.join("; "),
  };
}

function compareThankYou6Activity(left, right) {
  const scoreDiff = (Number(right.score) || 0) - (Number(left.score) || 0);
  if (scoreDiff) return scoreDiff;
  const activeDiff = (Number(right.lastActiveMs) || 0) - (Number(left.lastActiveMs) || 0);
  if (activeDiff) return activeDiff;
  return (Number(right.createdMs) || 0) - (Number(left.createdMs) || 0);
}

function rankThankYou6ByActivity(rows, options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : SELECT_LIMIT;
  const nowMs = options.nowMs || Date.now();
  const scored = (Array.isArray(rows) ? rows : []).map((row) => {
    const activity = scoreThankYou6Activity(row.user || row, nowMs);
    return { ...row, ...activity };
  });
  const measurable = scored.filter((row) => row.measurable);
  const recent = scored.filter((row) => row.recentEnough);
  const ranked = scored.slice().sort(compareThankYou6Activity);
  const selected = ranked.filter((row) => row.recentEnough && row.score > 0).slice(0, limit);

  const selectedActiveMs = selected.map((row) => row.lastActiveMs).filter((ms) => ms > 0);
  return {
    scored: ranked,
    selected,
    measurableCount: measurable.length,
    recentCount: recent.length,
    selectedCount: selected.length,
    highestScore: selected.length ? selected[0].score : 0,
    lowestSelectedScore: selected.length ? selected[selected.length - 1].score : 0,
    activityDateRange: selectedActiveMs.length
      ? {
        oldestSelectedActiveAt: new Date(Math.min(...selectedActiveMs)).toISOString(),
        newestSelectedActiveAt: new Date(Math.max(...selectedActiveMs)).toISOString(),
      }
      : { oldestSelectedActiveAt: "", newestSelectedActiveAt: "" },
    insufficientActivityData: recent.length === 0,
    formula: [
      "lastActiveAt = lastSeenAt || lastLoginAt (never updatedAt)",
      "If lastActiveAt is missing or older than 60 days: engagement points = 0",
      "Recency: ≤7d=+40, ≤14d=+32, ≤30d=+24, ≤60d=+12, else +0",
      "Engagement (only when lastActiveAt ≤ 60 days), from featureUsage counters:",
      "  lesson/resource views ×3 cap 24; activity views ×3 cap 15; saves ×5 cap 20;",
      "  planner ×4 cap 16; documentation/tools ×4 cap 16; AI ×3 cap 12;",
      "  downloads/prints ×2 cap 10; logins ×3 cap 12; page views ×1 cap 10",
      "Tie-break: most recent lastActiveAt, then newest createdAt/signupAt",
      "Select max 25 with recentEnough && score > 0. Do not pad with inactive accounts.",
    ].join(" "),
  };
}

module.exports = {
  RECENT_WINDOW_DAYS,
  SELECT_LIMIT,
  LESSON_KEYS,
  ACTIVITY_KEYS,
  SAVE_KEYS,
  PLANNER_KEYS,
  DOC_TOOL_KEYS,
  AI_KEYS,
  DOWNLOAD_PRINT_KEYS,
  LOGIN_KEYS,
  PAGE_KEYS,
  lastActiveAtOf,
  accountCreatedAtOf,
  scoreThankYou6Activity,
  compareThankYou6Activity,
  rankThankYou6ByActivity,
  usageSum,
};
