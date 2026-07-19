/**
 * Plain-language System Health helpers shared by the server aggregator and tests.
 * Does not mutate production data — report builders only.
 */
"use strict";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKDAY_LABEL = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

function weekdayActivityCounts(plan) {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [
      day,
      Array.isArray(plan?.dailyPlans?.[day]?.items)
        ? plan.dailyPlans[day].items.filter((item) => String(item?.title || "").trim()).length
        : 0,
    ]),
  );
}

function emptyWeekdays(counts) {
  return WEEKDAYS.filter((day) => !(counts[day] > 0));
}

function plainBillingMismatch(code, email) {
  const who = email || "A member";
  switch (code) {
    case "pro_access_without_stripe_evidence":
      return `${who} still has paid access, but there is no matching Stripe subscription evidence.`;
    case "founding_active_without_pro_access":
      return `${who} is marked as an active Founding Member but does not currently have Pro access.`;
    case "paid_plan_label_with_free_access":
      return `${who} is labeled as a paid plan but is currently treated as Free.`;
    case "stripe_active_without_pro_access":
      return `${who} has an active Stripe subscription but is not receiving Pro access.`;
    case "past_due_with_pro_access":
      return `${who} has a failed/past-due payment but still has full paid access.`;
    case "canceled_access_past_access_ends_at":
      return `${who}'s canceled subscription should have ended, but paid access is still on.`;
    case "stored_hasProAccess_mismatch":
      return `${who}'s saved access flag does not match the live billing rules.`;
    default:
      return `${who} has a billing/access mismatch that needs review (${code}).`;
  }
}

function plainCurriculumIssue(plan, issue) {
  const title = plan?.title || plan?.id || "A lesson plan";
  const code = issue?.code || "";
  const detail = String(issue?.detail || "");
  if (code === "empty_weekday" || /empty weekday|missing activities on/i.test(detail)) {
    const days = WEEKDAYS
      .filter((day) => detail.toLowerCase().includes(day) || detail.toUpperCase().includes(day.toUpperCase()))
      .map((day) => WEEKDAY_LABEL[day]);
    if (days.length) {
      return `${title} is missing activities on ${days.join(", ")}.`;
    }
    return `${title} is missing activities on one or more weekdays.`;
  }
  if (code === "no_activities") {
    return `${title} has no activities at all.`;
  }
  if (code === "missing_gold_field") {
    return `${title} is incomplete: ${detail.replace(/^[^:]+:\s*/, "") || "required teaching details are missing"}.`;
  }
  if (code === "age_inappropriate") {
    return `${title} may include an activity that is not a good fit for its age group.`;
  }
  if (code === "insufficient_directions") {
    return `${title} has an activity with too few step-by-step directions.`;
  }
  if (detail) return `${title}: ${detail}`;
  return `${title} needs a content review.`;
}

function severityFromIssue(issue, { published = false } = {}) {
  const code = issue?.code || "";
  const sev = String(issue?.severity || "").toLowerCase();
  if (code === "empty_weekday" || code === "no_activities") return published ? "urgent" : "warning";
  if (sev === "critical") return published ? "urgent" : "warning";
  if (sev === "high") return "warning";
  return "needs_review";
}

/**
 * Scan stored lesson plans for completeness + standards issues.
 * @param {object} curriculum
 * @param {{ auditLessonPlanAgainstStandards: Function }} deps
 */
function scanCurriculumHealth(curriculum, deps = {}) {
  const auditFn = deps.auditLessonPlanAgainstStandards;
  const plans = Array.isArray(curriculum?.lessonPlans) ? curriculum.lessonPlans : [];
  const activities = Array.isArray(curriculum?.activities) ? curriculum.activities : [];
  const findings = [];
  let publishedComplete = 0;
  let publishedIncomplete = 0;
  let draftIncomplete = 0;
  let checked = 0;

  const activitiesByPlan = new Map();
  for (const activity of activities) {
    const planId = String(activity?.lessonPlanId || "").trim();
    if (!planId) continue;
    if (!activitiesByPlan.has(planId)) activitiesByPlan.set(planId, []);
    activitiesByPlan.get(planId).push(activity);
  }

  for (const plan of plans) {
    if (!plan || typeof plan !== "object") continue;
    const status = String(plan.status || "draft").toLowerCase();
    if (status === "archived") continue;
    checked += 1;
    const published = status === "published" || status === "featured";
    const counts = weekdayActivityCounts(plan);
    const missingDays = emptyWeekdays(counts);
    const totalActs = WEEKDAYS.reduce((sum, day) => sum + (counts[day] || 0), 0);

    if (missingDays.length) {
      const labels = missingDays.map((day) => WEEKDAY_LABEL[day]);
      findings.push({
        id: `weekday:${plan.id}`,
        area: "lesson_plans",
        severity: published ? "urgent" : "warning",
        status: published ? "urgent" : "warning",
        title: published
          ? `${labels.length === 1 ? "One" : String(labels.length)} weekday${labels.length === 1 ? " is" : "s are"} empty on a published lesson`
          : "Draft lesson is missing weekday activities",
        message: published
          ? `“${plan.title || plan.id}” is published but missing activities on ${labels.join(", ")}.`
          : `“${plan.title || plan.id}” is still a draft and needs activities on ${labels.join(", ")}.`,
        plainLanguage: `“${plan.title || plan.id}” is missing activities on ${labels.join(", ")}.`,
        planId: plan.id,
        planTitle: plan.title || plan.id,
        missingDays,
        counts,
        autoRepairSafe: false,
        needsManualReview: true,
      });
      if (published) publishedIncomplete += 1;
      else draftIncomplete += 1;
    } else if (published) {
      publishedComplete += 1;
    }

    if (!String(plan.coverImageUrl || "").trim()) {
      findings.push({
        id: `cover:${plan.id}`,
        area: "lesson_plans",
        severity: "warning",
        status: "warning",
        title: "Missing cover image",
        message: `“${plan.title || plan.id}” does not have a cover image yet.`,
        plainLanguage: `“${plan.title || plan.id}” is missing a cover image.`,
        planId: plan.id,
        autoRepairSafe: false,
        needsManualReview: true,
      });
    }

    // Broken activity links: plan lists activityIds that are missing/archived.
    const linkedIds = Array.isArray(plan.activityIds) ? plan.activityIds : [];
    const liveActs = activitiesByPlan.get(plan.id) || [];
    const liveById = new Map(liveActs.map((a) => [a.id, a]));
    const brokenLinks = linkedIds.filter((id) => {
      const hit = liveById.get(id);
      return !hit || hit.status === "archived";
    });
    if (brokenLinks.length) {
      findings.push({
        id: `links:${plan.id}`,
        area: "lesson_plans",
        severity: published ? "urgent" : "warning",
        status: published ? "urgent" : "warning",
        title: "Broken lesson ↔ activity connections",
        message: `“${plan.title || plan.id}” has ${brokenLinks.length} broken activity connection${brokenLinks.length === 1 ? "" : "s"}.`,
        plainLanguage: `“${plan.title || plan.id}” has ${brokenLinks.length} broken activity connection${brokenLinks.length === 1 ? "" : "s"} that should be rebuilt.`,
        planId: plan.id,
        brokenCount: brokenLinks.length,
        autoRepairSafe: true,
        repairAction: "rebuild_activity_links",
        needsManualReview: false,
      });
    }

    // Daily items exist but Activity Center has no published rows for a weekday.
    if (totalActs > 0 && published) {
      const byDay = {};
      for (const act of liveActs) {
        if (act.status === "archived") continue;
        const day = String(act.dayOfWeek || "").toLowerCase();
        byDay[day] = (byDay[day] || 0) + 1;
      }
      const catalogMissing = WEEKDAYS.filter((day) => (counts[day] || 0) > 0 && !(byDay[day] > 0));
      if (catalogMissing.length) {
        findings.push({
          id: `catalog:${plan.id}`,
          area: "lesson_plans",
          severity: "warning",
          status: "warning",
          title: "Activities not showing in Activity Center",
          message: `“${plan.title || plan.id}” has weekday activities that are not fully connected in the Activity Center (${catalogMissing.map((d) => WEEKDAY_LABEL[d]).join(", ")}).`,
          plainLanguage: `“${plan.title || plan.id}” needs its Activity Center connections refreshed for ${catalogMissing.map((d) => WEEKDAY_LABEL[d]).join(", ")}.`,
          planId: plan.id,
          autoRepairSafe: true,
          repairAction: "resync_activities",
          needsManualReview: false,
        });
      }
    }

    if (typeof auditFn === "function") {
      try {
        const audit = auditFn(plan, { source: plan.id });
        for (const issue of (audit.issues || []).slice(0, 8)) {
          if (issue.code === "empty_weekday" || issue.code === "no_activities") continue; // already covered
          findings.push({
            id: `std:${plan.id}:${issue.code}:${issue.field || issue.detail || ""}`.slice(0, 180),
            area: "lesson_plans",
            severity: severityFromIssue(issue, { published }),
            status: severityFromIssue(issue, { published }),
            title: "Lesson quality check",
            message: plainCurriculumIssue(plan, issue),
            plainLanguage: plainCurriculumIssue(plan, issue),
            planId: plan.id,
            code: issue.code,
            autoRepairSafe: false,
            needsManualReview: true,
          });
        }
      } catch {
        /* ignore audit failures per plan */
      }
    }
  }

  return {
    checked,
    publishedComplete,
    publishedIncomplete,
    draftIncomplete,
    activityCenterCount: activities.filter((a) => a && a.status !== "archived").length,
    findings,
  };
}

function summarizeOverall(findings) {
  const urgent = findings.filter((f) => f.severity === "urgent" || f.status === "urgent").length;
  const warning = findings.filter((f) => f.severity === "warning" || f.status === "warning").length;
  const needsReview = findings.filter((f) => f.severity === "needs_review" || f.status === "needs_review").length;
  const repaired = findings.filter((f) => f.status === "repaired" || f.severity === "repaired").length;
  let overall = "healthy";
  if (urgent) overall = "urgent";
  else if (warning) overall = "warning";
  else if (needsReview) overall = "needs_review";
  return { overall, urgent, warning, needsReview, repaired, totalFindings: findings.length };
}

module.exports = {
  WEEKDAYS,
  WEEKDAY_LABEL,
  weekdayActivityCounts,
  emptyWeekdays,
  plainBillingMismatch,
  plainCurriculumIssue,
  scanCurriculumHealth,
  summarizeOverall,
};
