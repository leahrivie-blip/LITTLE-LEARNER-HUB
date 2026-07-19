/**
 * Plain-language System Health helpers shared by the server aggregator and tests.
 * Report builders and history helpers only — safe repairs stay in server/system-health.js.
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

const SEVERITY_RANK = Object.freeze({
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
});

const HEALTH_HISTORY_MAX = 60;
const HEALTH_REPAIR_LOG_MAX = 200;
const OPEN_ISSUES_MAX = 300;

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
 * Map legacy status labels onto Critical / High / Medium / Low.
 */
function normalizeSeverityLevel(finding) {
  if (finding?.severityLevel && SEVERITY_RANK[finding.severityLevel]) {
    return finding.severityLevel;
  }
  const key = String(finding?.severity || finding?.status || "").toLowerCase();
  if (key === "urgent" || key === "critical") return "critical";
  if (key === "warning" || key === "high") return "high";
  if (key === "needs_review" || key === "needs-review" || key === "medium") return "medium";
  if (key === "repaired" || key === "healthy" || key === "low" || key === "ok") return "low";
  if (finding?.area === "billing" || finding?.area === "backups" && key !== "needs_review") return "critical";
  return "medium";
}

function severityLabel(level) {
  const key = normalizeSeverityLevel({ severityLevel: level, severity: level });
  return ({
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  })[key] || "Medium";
}

function estimateUserImpact(finding) {
  if (finding?.userImpact) return String(finding.userImpact);
  const area = String(finding?.area || "");
  const level = normalizeSeverityLevel(finding);
  if (area === "billing") {
    return level === "critical"
      ? "One or more members may see the wrong plan access right now."
      : "A member’s billing display may be confusing until reviewed.";
  }
  if (area === "lesson_plans") {
    if (String(finding?.id || "").startsWith("weekday:") || /missing activities/i.test(finding?.plainLanguage || "")) {
      return "Teachers may open this published lesson and see empty weekday activities.";
    }
    if (String(finding?.id || "").startsWith("links:") || /broken activity/i.test(finding?.title || "")) {
      return "Activities may not open correctly from this lesson plan.";
    }
    if (/cover/i.test(finding?.title || "")) {
      return "The lesson library card may look incomplete, but the lesson can still open.";
    }
    return "Lesson quality or completeness may confuse teachers using this plan.";
  }
  if (area === "backups") {
    return "If something goes wrong, restoring the website could be harder until backups are healthy.";
  }
  if (area === "launch") {
    return "Checkout, admin login, or another launch-critical piece may not work for new or returning users.";
  }
  if (area === "permissions") {
    return "A staff account may have more access than intended.";
  }
  if (level === "critical") return "This can affect live members or published content.";
  if (level === "high") return "This can affect some members or published content soon.";
  if (level === "medium") return "This needs review but may not block daily classroom use.";
  return "Low impact — mostly housekeeping or already repaired.";
}

function buildFindingDeepLinks(finding) {
  const links = [];
  const planId = String(finding?.planId || "").trim();
  const email = String(finding?.email || "").trim().toLowerCase();
  const area = String(finding?.area || "");

  if (planId) {
    links.push({
      label: "Open lesson plan",
      kind: "lesson",
      href: `/?view=admin&adminSection=curriculum-lesson-plans&adminLessonId=${encodeURIComponent(planId)}`,
      planId,
    });
    links.push({
      label: "Open Activity Center filter",
      kind: "activity",
      href: `/?view=admin&adminSection=curriculum-activities&adminLessonFilter=${encodeURIComponent(planId)}`,
      planId,
    });
  }
  if (email) {
    links.push({
      label: "Open member",
      kind: "user",
      href: `/?view=admin&adminSection=users&adminFocusEmail=${encodeURIComponent(email)}`,
      email,
    });
  }
  if (area === "billing") {
    links.push({
      label: "Open Stripe / backup tools",
      kind: "page",
      href: "/?view=admin&adminSection=stripe-backfill",
    });
  }
  if (area === "backups" || area === "launch") {
    links.push({
      label: "Open Safety Center",
      kind: "page",
      href: "/?view=admin&adminSection=dashboard&adminOwnerSection=safety",
    });
  }
  links.push({
    label: "Open System Health",
    kind: "page",
    href: "/?view=admin&adminSection=system-health",
  });
  return links;
}

function enrichFinding(finding, openIssues = {}) {
  const id = String(finding?.id || "");
  const severityLevel = normalizeSeverityLevel(finding);
  const prior = id && openIssues[id] ? openIssues[id] : null;
  return {
    ...finding,
    severityLevel,
    severityLabel: severityLabel(severityLevel),
    userImpact: estimateUserImpact({ ...finding, severityLevel }),
    deepLinks: Array.isArray(finding?.deepLinks) && finding.deepLinks.length
      ? finding.deepLinks
      : buildFindingDeepLinks(finding),
    firstSeenAt: prior?.firstSeenAt || "",
    lastSeenAt: prior?.lastSeenAt || "",
    occurrenceCount: prior?.occurrenceCount || 0,
  };
}

function enrichFindings(findings, openIssues = {}) {
  return (Array.isArray(findings) ? findings : []).map((finding) => enrichFinding(finding, openIssues));
}

/**
 * Scan stored lesson plans for completeness + standards issues.
 */
function scanCurriculumHealth(curriculum, deps = {}) {
  const auditFn = deps.auditLessonPlanAgainstStandards;
  const plans = Array.isArray(curriculum?.lessonPlans) ? curriculum.lessonPlans : [];
  const activities = Array.isArray(curriculum?.activities) ? curriculum.activities : [];
  const findings = [];
  let publishedComplete = 0;
  let publishedIncomplete = 0;
  let draftIncomplete = 0;
  let draftCount = 0;
  let checked = 0;
  let brokenLinkPlans = 0;

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
    if (status === "draft") draftCount += 1;
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
        planTitle: plan.title || plan.id,
        autoRepairSafe: false,
        needsManualReview: true,
      });
    }

    const linkedIds = Array.isArray(plan.activityIds) ? plan.activityIds : [];
    const liveActs = activitiesByPlan.get(plan.id) || [];
    const liveById = new Map(liveActs.map((a) => [a.id, a]));
    const brokenLinks = linkedIds.filter((id) => {
      const hit = liveById.get(id);
      return !hit || hit.status === "archived";
    });
    if (brokenLinks.length) {
      brokenLinkPlans += 1;
      findings.push({
        id: `links:${plan.id}`,
        area: "lesson_plans",
        severity: published ? "urgent" : "warning",
        status: published ? "urgent" : "warning",
        title: "Broken lesson ↔ activity connections",
        message: `“${plan.title || plan.id}” has ${brokenLinks.length} broken activity connection${brokenLinks.length === 1 ? "" : "s"}.`,
        plainLanguage: `“${plan.title || plan.id}” has ${brokenLinks.length} broken activity connection${brokenLinks.length === 1 ? "" : "s"} that should be rebuilt.`,
        planId: plan.id,
        planTitle: plan.title || plan.id,
        brokenCount: brokenLinks.length,
        autoRepairSafe: true,
        repairAction: "rebuild_activity_links",
        needsManualReview: false,
      });
    }

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
          planTitle: plan.title || plan.id,
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
          if (issue.code === "empty_weekday" || issue.code === "no_activities") continue;
          findings.push({
            id: `std:${plan.id}:${issue.code}:${issue.field || issue.detail || ""}`.slice(0, 180),
            area: "lesson_plans",
            severity: severityFromIssue(issue, { published }),
            status: severityFromIssue(issue, { published }),
            title: "Lesson quality check",
            message: plainCurriculumIssue(plan, issue),
            plainLanguage: plainCurriculumIssue(plan, issue),
            planId: plan.id,
            planTitle: plan.title || plan.id,
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
    draftCount,
    draftIncomplete,
    brokenLinkPlans,
    activityCenterCount: activities.filter((a) => a && a.status !== "archived").length,
    findings,
  };
}

function summarizeOverall(findings) {
  const enriched = enrichFindings(findings);
  const urgent = enriched.filter((f) => f.severity === "urgent" || f.status === "urgent" || f.severityLevel === "critical").length;
  const warning = enriched.filter((f) => (f.severity === "warning" || f.status === "warning" || f.severityLevel === "high") && f.severityLevel !== "critical").length;
  const needsReview = enriched.filter((f) => f.severity === "needs_review" || f.status === "needs_review" || f.severityLevel === "medium").length;
  const repaired = enriched.filter((f) => f.status === "repaired" || f.severity === "repaired").length;
  const critical = enriched.filter((f) => f.severityLevel === "critical" && f.status !== "healthy" && f.status !== "repaired").length;
  const high = enriched.filter((f) => f.severityLevel === "high" && f.status !== "healthy" && f.status !== "repaired").length;
  const medium = enriched.filter((f) => f.severityLevel === "medium" && f.status !== "healthy" && f.status !== "repaired").length;
  const low = enriched.filter((f) => f.severityLevel === "low" || f.status === "repaired" || f.status === "healthy").length;
  let overall = "healthy";
  if (critical || urgent) overall = "urgent";
  else if (high || warning) overall = "warning";
  else if (medium || needsReview) overall = "needs_review";
  return {
    overall,
    urgent,
    warning,
    needsReview,
    repaired,
    critical,
    high,
    medium,
    low,
    totalFindings: findings.length,
  };
}

function buildPlatformStats(store, curriculumScan = {}, extras = {}) {
  const curriculum = store?.siteContent?.curriculum || {};
  const plans = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
  const activities = Array.isArray(curriculum.activities) ? curriculum.activities : [];
  const pushLog = Array.isArray(store?.pushDeliveryLog) ? store.pushDeliveryLog : [];
  const failedNotifications = pushLog.filter((row) => {
    const status = String(row?.status || row?.result || "").toLowerCase();
    return status.includes("fail") || status.includes("error") || row?.ok === false;
  }).length;
  const aiLogs = Array.isArray(store?.aiUsageLogs) ? store.aiUsageLogs : [];
  const recentAiFailures = aiLogs.filter((row) => {
    const status = String(row?.status || "").toLowerCase();
    return status === "error" || status === "failed" || row?.ok === false;
  }).length;
  const users = store?.users && typeof store.users === "object" ? Object.keys(store.users).length : 0;

  return {
    publishedLessonPlans: (Number(curriculumScan.publishedComplete || 0) + Number(curriculumScan.publishedIncomplete || 0))
      || plans.filter((p) => ["published", "featured"].includes(String(p.status || "").toLowerCase())).length,
    publishedComplete: curriculumScan.publishedComplete || 0,
    publishedIncomplete: curriculumScan.publishedIncomplete || 0,
    incompleteDrafts: curriculumScan.draftIncomplete || 0,
    draftLessonPlans: curriculumScan.draftCount || plans.filter((p) => String(p.status || "").toLowerCase() === "draft").length,
    brokenActivityLinkPlans: curriculumScan.brokenLinkPlans || 0,
    activityCenterCount: curriculumScan.activityCenterCount || activities.filter((a) => a && a.status !== "archived").length,
    failedNotifications,
    failedPdfGenerations: extras.failedPdfGenerations != null
      ? Number(extras.failedPdfGenerations)
      : (Array.isArray(store?.pdfFailureLog) ? store.pdfFailureLog.length : 0),
    failedPdfGenerationsNote: "",
    recentClientErrors: extras.recentClientErrors != null ? Number(extras.recentClientErrors) : 0,
    recentLoginOrServerErrors: Number(extras.recentClientErrors || 0) + Number(extras.recentAiFailures != null ? extras.recentAiFailures : recentAiFailures),
    recentLoginOrServerErrorsNote: "Combines browser/client errors with recent AI/tool failures.",
    healthScore: extras.healthScore != null ? Number(extras.healthScore) : null,
    memberAccounts: users,
    openIssueCount: extras.openIssueCount || 0,
    repairLogCount: extras.repairLogCount || 0,
    historyCount: extras.historyCount || 0,
  };
}

function detectTrends(history = [], openIssues = {}) {
  const rows = Array.isArray(history) ? history.slice(0, 30) : [];
  const trends = [];

  const billingRuns = rows.filter((row) => Number(row.criticalBilling || row.billingFindings || 0) > 0 || (row.areas || {}).billing > 0).length;
  if (billingRuns >= 3) {
    trends.push({
      id: "trend:billing-recurring",
      area: "billing",
      severityLevel: "critical",
      title: "Recurring billing issues",
      plainLanguage: `Billing/access problems showed up in ${billingRuns} of the last ${rows.length} health checks.`,
      userImpact: "Members may keep hitting the wrong plan access until the root cause is fixed.",
    });
  }

  const lessonFailRuns = rows.filter((row) => Number(row.publishedIncomplete || 0) > 0 || Number((row.areas || {}).lesson_plans || 0) > 0).length;
  if (lessonFailRuns >= 3) {
    trends.push({
      id: "trend:lesson-validation",
      area: "lesson_plans",
      severityLevel: "high",
      title: "Lesson plans frequently fail validation",
      plainLanguage: `Lesson-plan completeness problems appeared in ${lessonFailRuns} of the last ${rows.length} checks.`,
      userImpact: "Published lessons may keep showing empty weekdays or broken activity links.",
    });
  }

  const mobileFailRuns = rows.filter((row) => Number((row.areas || {}).mobile || 0) > 0).length;
  if (mobileFailRuns >= 3) {
    trends.push({
      id: "trend:mobile-recurring",
      area: "mobile",
      severityLevel: "high",
      title: "Repeated mobile layout problems",
      plainLanguage: `Mobile/tablet layout problems appeared in ${mobileFailRuns} of the last ${rows.length} health checks.`,
      userImpact: "Phone and tablet users may keep hitting cut-off menus or hard-to-read notifications.",
    });
  }

  const frequent = Object.values(openIssues || {})
    .filter((issue) => Number(issue.occurrenceCount || 0) >= 3)
    .sort((a, b) => Number(b.occurrenceCount || 0) - Number(a.occurrenceCount || 0))
    .slice(0, 8)
    .map((issue) => ({
      id: `trend:repeat:${issue.id}`,
      area: issue.area || "general",
      severityLevel: issue.severityLevel || "medium",
      title: "Repeated issue",
      plainLanguage: `“${issue.title || issue.id}” has appeared in ${issue.occurrenceCount} checks since ${issue.firstSeenAt || "it was first seen"}.`,
      userImpact: issue.userImpact || estimateUserImpact(issue),
      planId: issue.planId || "",
      email: issue.email || "",
      findingId: issue.id,
    }));

  return [...trends, ...frequent].slice(0, 20);
}

function updateOpenIssues(previousOpen = {}, findings = [], nowIso) {
  const next = {};
  const activeIds = new Set();
  for (const finding of findings) {
    if (!finding?.id || finding.status === "healthy") continue;
    if (finding.status === "repaired") continue;
    activeIds.add(finding.id);
    const prior = previousOpen[finding.id] || {};
    next[finding.id] = {
      id: finding.id,
      area: finding.area || "",
      title: finding.title || "",
      plainLanguage: finding.plainLanguage || finding.message || "",
      severityLevel: normalizeSeverityLevel(finding),
      userImpact: estimateUserImpact(finding),
      planId: finding.planId || "",
      planTitle: finding.planTitle || "",
      email: finding.email || "",
      deepLinks: buildFindingDeepLinks(finding),
      firstSeenAt: prior.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
      occurrenceCount: Number(prior.occurrenceCount || 0) + 1,
      status: finding.status || finding.severity || "",
    };
  }
  const resolved = Object.keys(previousOpen)
    .filter((id) => !activeIds.has(id))
    .map((id) => previousOpen[id]);
  const newIds = Object.keys(next).filter((id) => !previousOpen[id]);
  // Cap open issues map
  const capped = {};
  Object.values(next)
    .sort((a, b) => (SEVERITY_RANK[b.severityLevel] || 0) - (SEVERITY_RANK[a.severityLevel] || 0))
    .slice(0, OPEN_ISSUES_MAX)
    .forEach((issue) => { capped[issue.id] = issue; });
  return { openIssues: capped, newIds, resolved };
}

function appendHealthHistory(systemHealth, entry, { max = HEALTH_HISTORY_MAX } = {}) {
  const current = systemHealth && typeof systemHealth === "object" ? systemHealth : {};
  const history = Array.isArray(current.history) ? current.history.slice() : [];
  history.unshift(entry);
  return history.slice(0, max);
}

function appendRepairLog(systemHealth, repairs, { trigger = "manual", at = "" } = {}) {
  const current = systemHealth && typeof systemHealth === "object" ? systemHealth : {};
  const log = Array.isArray(current.repairLog) ? current.repairLog.slice() : [];
  const stamp = at || new Date().toISOString();
  for (const repair of repairs || []) {
    log.unshift({
      at: stamp,
      trigger,
      findingId: repair.id || "",
      planId: repair.planId || "",
      action: repair.action || "",
      plainLanguage: repair.plainLanguage || "",
      before: repair.before || null,
      after: repair.after || null,
      status: repair.status || "repaired",
    });
  }
  return log.slice(0, HEALTH_REPAIR_LOG_MAX);
}

function buildHistoryEntry({
  report,
  repairs = [],
  trigger = "manual",
  newIds = [],
  resolved = [],
}) {
  const findings = Array.isArray(report?.findings) ? report.findings.filter((f) => f.status !== "healthy") : [];
  const areas = {};
  findings.forEach((f) => {
    const area = f.area || "general";
    areas[area] = (areas[area] || 0) + 1;
  });
  const summary = report?.summary || {};
  return {
    id: `health-${Date.now().toString(16)}`,
    at: report?.generatedAt || new Date().toISOString(),
    trigger,
    overall: report?.overall || "unknown",
    critical: summary.critical || 0,
    high: summary.high || 0,
    medium: summary.medium || 0,
    low: summary.low || 0,
    urgent: summary.urgent || 0,
    warning: summary.warning || 0,
    repairedCount: repairs.length,
    publishedIncomplete: report?.suites?.curriculum?.publishedIncomplete || 0,
    billingFindings: areas.billing || 0,
    criticalBilling: findings.filter((f) => f.area === "billing" && normalizeSeverityLevel(f) === "critical").length,
    areas,
    findingIds: findings.map((f) => f.id).filter(Boolean).slice(0, 100),
    newFindingIds: newIds.slice(0, 50),
    resolvedFindingIds: resolved.map((r) => r.id).filter(Boolean).slice(0, 50),
    plainSummary: report?.plainSummary || "",
    skipped: report?.summary?.checksSkipped || [],
    repairs: repairs.map((r) => ({
      id: r.id,
      planId: r.planId,
      action: r.action,
      plainLanguage: r.plainLanguage,
    })),
  };
}

function buildExportPayload({ report, systemHealth = {}, repairs = [] }) {
  return {
    exportedAt: new Date().toISOString(),
    product: "Little Learner Hub",
    reportType: "system-health",
    overall: report?.overall,
    plainSummary: report?.plainSummary,
    summary: report?.summary,
    timestamps: report?.timestamps,
    stats: report?.stats,
    trends: report?.trends,
    scheduler: systemHealth.scheduler || report?.scheduler || null,
    findings: (report?.findings || []).filter((f) => f.status !== "healthy"),
    history: Array.isArray(systemHealth.history) ? systemHealth.history : [],
    openIssues: systemHealth.openIssues || {},
    repairLog: Array.isArray(systemHealth.repairLog) ? systemHealth.repairLog : [],
    latestRepairs: repairs,
    checksSkipped: report?.summary?.checksSkipped || [],
  };
}

function compactReportSnapshot(report) {
  return {
    generatedAt: report.generatedAt,
    overall: report.overall,
    summary: report.summary,
    timestamps: report.timestamps,
    stats: report.stats,
    trends: report.trends,
    scheduler: report.scheduler,
    plainSummary: report.plainSummary,
    suites: report.suites,
    findings: (report.findings || []).slice(0, 120),
  };
}

module.exports = {
  WEEKDAYS,
  WEEKDAY_LABEL,
  SEVERITY_RANK,
  HEALTH_HISTORY_MAX,
  HEALTH_REPAIR_LOG_MAX,
  weekdayActivityCounts,
  emptyWeekdays,
  plainBillingMismatch,
  plainCurriculumIssue,
  severityFromIssue,
  normalizeSeverityLevel,
  severityLabel,
  estimateUserImpact,
  buildFindingDeepLinks,
  enrichFinding,
  enrichFindings,
  scanCurriculumHealth,
  summarizeOverall,
  buildPlatformStats,
  detectTrends,
  updateOpenIssues,
  appendHealthHistory,
  appendRepairLog,
  buildHistoryEntry,
  buildExportPayload,
  compactReportSnapshot,
};
