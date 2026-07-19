/**
 * Admin System Health report builder.
 * Aggregates existing readiness/store/curriculum/billing checks into plain language.
 */
"use strict";

const path = require("path");
const {
  scanCurriculumHealth,
  summarizeOverall,
  plainBillingMismatch,
} = require("../scripts/system-health-lib.js");

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch {
    return null;
  }
}

function readinessFinding(name, statusObj, { urgentWhenMissing = true } = {}) {
  const ready = statusObj?.ready === true || statusObj?.status === "READY" || statusObj?.configured === true;
  if (ready) {
    return {
      id: `ready:${name}`,
      area: "launch",
      severity: "healthy",
      status: "healthy",
      title: `${name} looks ready`,
      message: `${name} is configured and ready.`,
      plainLanguage: `${name} is ready.`,
      autoRepairSafe: false,
    };
  }
  const detail = statusObj?.missing?.length
    ? `Missing: ${statusObj.missing.join(", ")}`
    : (statusObj?.message || statusObj?.error || "Not fully configured");
  return {
    id: `ready:${name}`,
    area: "launch",
    severity: urgentWhenMissing ? "urgent" : "warning",
    status: urgentWhenMissing ? "urgent" : "warning",
    title: `${name} needs attention`,
    message: `${name} is not fully ready. ${detail}`,
    plainLanguage: `${name} is not fully ready for live use. ${detail}`,
    autoRepairSafe: false,
    needsManualReview: true,
  };
}

/**
 * @param {object} deps injected from server/index.js
 */
function buildSystemHealthReport(deps = {}) {
  const generatedAt = new Date().toISOString();
  const store = typeof deps.peekStore === "function" ? deps.peekStore() : (deps.store || {});
  const siteContent = store.siteContent && typeof store.siteContent === "object"
    ? store.siteContent
    : {};
  const curriculum = siteContent.curriculum || { lessonPlans: [], activities: [], resources: [] };
  const previous = store.systemHealth && typeof store.systemHealth === "object"
    ? store.systemHealth
    : {};

  const findings = [];
  const suites = {};

  // Launch / billing readiness
  const launch = typeof deps.launchReadinessStatus === "function" ? deps.launchReadinessStatus() : null;
  if (launch) {
    suites.launch = {
      ready: Boolean(launch.ready),
      status: launch.status || (launch.ready ? "READY" : "NOT READY"),
      required: launch.required || {},
      blockers: launch.blockers || [],
    };
    const required = launch.required || {};
    Object.entries(required).forEach(([key, value]) => {
      const label = ({
        stripe: "Stripe payments",
        admin: "Admin login",
        ai: "AI tools",
        site: "Website address",
        database: "Database",
      })[key] || key;
      const finding = readinessFinding(label, value, {
        urgentWhenMissing: key === "stripe" || key === "admin" || key === "database" || key === "site",
      });
      if (finding.status !== "healthy") findings.push(finding);
    });
    if (Array.isArray(launch.blockers)) {
      launch.blockers.slice(0, 8).forEach((blocker, index) => {
        findings.push({
          id: `blocker:${index}`,
          area: "launch",
          severity: "urgent",
          status: "urgent",
          title: "Launch blocker",
          message: String(blocker),
          plainLanguage: `Launch is blocked: ${blocker}`,
          autoRepairSafe: false,
          needsManualReview: true,
        });
      });
    }
  }

  if (typeof deps.billingReadinessSnapshot === "function") {
    suites.billingReadiness = deps.billingReadinessSnapshot();
  } else if (typeof deps.stripeConfigStatus === "function") {
    const stripe = deps.stripeConfigStatus();
    suites.billingReadiness = { stripe };
    if (!stripe?.ready) {
      findings.push(readinessFinding("Stripe billing", stripe, { urgentWhenMissing: true }));
    }
  }

  // Store / backups
  const storeHealth = typeof deps.storeHealthSnapshot === "function"
    ? deps.storeHealthSnapshot(store)
    : null;
  const backups = Array.isArray(deps.recentBackups) ? deps.recentBackups : [];
  const lastBackup = backups[0] || null;
  suites.store = {
    ...(storeHealth || {}),
    lastBackup: lastBackup ? {
      id: lastBackup.id,
      createdAt: lastBackup.created_at || lastBackup.createdAt || "",
      verified: Boolean(lastBackup.verified),
      userCount: Number(lastBackup.user_count || lastBackup.userCount || 0),
      source: lastBackup.source || "",
    } : null,
    backupCount: backups.length,
  };
  if (storeHealth?.sparseStoreSuspected) {
    findings.push({
      id: "store:sparse",
      area: "backups",
      severity: "urgent",
      status: "urgent",
      title: "User directory looks unusually small",
      message: storeHealth.note || "The live user list looks sparse and may need recovery review.",
      plainLanguage: "The live member list looks unusually small. This can mean a restore/recovery problem and needs urgent review.",
      autoRepairSafe: false,
      needsManualReview: true,
    });
  }
  if (!lastBackup && storeHealth?.database?.usingPostgres) {
    findings.push({
      id: "backup:missing",
      area: "backups",
      severity: "warning",
      status: "warning",
      title: "No recent backup listed",
      message: "Postgres is in use, but no recent store backup was found in the backup list.",
      plainLanguage: "No recent automatic backup was found. Create a backup before major repairs.",
      autoRepairSafe: false,
      needsManualReview: true,
    });
  } else if (lastBackup && lastBackup.verified === false) {
    findings.push({
      id: "backup:unverified",
      area: "backups",
      severity: "needs_review",
      status: "needs_review",
      title: "Latest backup is unverified",
      message: "A backup exists, but it has not been marked as restore-tested/verified.",
      plainLanguage: "A backup exists, but we have not confirmed that restore works. Do not assume it is safe until restore is tested.",
      autoRepairSafe: false,
      needsManualReview: true,
    });
  }

  // Curriculum completeness (live store)
  const standards = safeRequire(path.join(__dirname, "..", "scripts", "curriculum-standards.js"));
  const curriculumScan = scanCurriculumHealth(curriculum, {
    auditLessonPlanAgainstStandards: standards?.auditLessonPlanAgainstStandards,
  });
  suites.curriculum = {
    checked: curriculumScan.checked,
    publishedComplete: curriculumScan.publishedComplete,
    publishedIncomplete: curriculumScan.publishedIncomplete,
    draftIncomplete: curriculumScan.draftIncomplete,
    activityCenterCount: curriculumScan.activityCenterCount,
  };
  findings.push(...curriculumScan.findings);

  // Curriculum referential integrity
  if (typeof deps.validateCurriculumIntegrity === "function") {
    const integrity = deps.validateCurriculumIntegrity(curriculum);
    suites.curriculumIntegrity = {
      valid: !integrity || integrity.valid !== false,
      errorCount: Array.isArray(integrity?.errors) ? integrity.errors.length : 0,
    };
    if (integrity && integrity.valid === false) {
      findings.push({
        id: "curriculum:integrity",
        area: "lesson_plans",
        severity: "urgent",
        status: "urgent",
        title: "Lesson plan database relationships are broken",
        message: `${suites.curriculumIntegrity.errorCount} curriculum relationship problem(s) were found.`,
        plainLanguage: "Some lesson plans and activities are not correctly connected in the database. This needs review before publishing more content.",
        autoRepairSafe: false,
        needsManualReview: true,
      });
    }
  }

  // Billing / access mismatches (read-only)
  const usersMap = store.users && typeof store.users === "object" ? store.users : {};
  const billingAudit = safeRequire(path.join(__dirname, "..", "scripts", "audit-billing-access-enforcement.js"));
  if (billingAudit?.auditMembershipUsers) {
    const audit = billingAudit.auditMembershipUsers({ users: usersMap }, { source: "live-store" });
    suites.billingAccess = {
      totalUsers: audit.totalUsers,
      mismatchCount: audit.mismatchCount,
      usersWithMismatches: audit.usersWithMismatches,
      classCounts: audit.classCounts,
    };
    for (const mismatch of (audit.mismatches || []).slice(0, 40)) {
      findings.push({
        id: `billing:${mismatch.email}:${mismatch.code}`,
        area: "billing",
        severity: "urgent",
        status: "urgent",
        title: "Billing / access mismatch",
        message: plainBillingMismatch(mismatch.code, mismatch.email),
        plainLanguage: plainBillingMismatch(mismatch.code, mismatch.email),
        email: mismatch.email,
        code: mismatch.code,
        autoRepairSafe: false,
        needsManualReview: true,
      });
    }
  }

  // Permission sanity: ensure admin config exists when admin area is expected
  if (typeof deps.adminConfigStatus === "function") {
    const adminCfg = deps.adminConfigStatus();
    suites.adminAccess = adminCfg;
    if (!adminCfg?.ready) {
      findings.push(readinessFinding("Admin access", adminCfg, { urgentWhenMissing: true }));
    }
  }

  // Lightweight role/access flags (read-only; never auto-changed)
  const userRows = Object.values(usersMap).filter((user) => user && typeof user === "object");
  let staffLike = 0;
  let staffWithOverride = 0;
  userRows.forEach((user) => {
    const role = String(user.role || "").toLowerCase();
    const isStaffLike = ["teacher", "assistant", "staff"].includes(role);
    if (!isStaffLike) return;
    staffLike += 1;
    if (user.internalAccessOverride === true) {
      staffWithOverride += 1;
      findings.push({
        id: `perm:override:${user.email || staffWithOverride}`,
        area: "permissions",
        severity: "needs_review",
        status: "needs_review",
        title: "Staff account has a manual access override",
        message: `${user.email || "A staff account"} is marked as staff/teacher but also has a manual access override. Confirm this is intentional.`,
        plainLanguage: `${user.email || "A staff account"} looks like classroom staff but also has a special access override. Please review before changing anything.`,
        email: user.email || "",
        autoRepairSafe: false,
        needsManualReview: true,
      });
    }
  });
  suites.permissions = {
    staffLikeAccounts: staffLike,
    staffWithManualOverride: staffWithOverride,
    note: "Deep notification audience and page-permission matrix checks are listed as skipped until a later phase.",
  };

  const checksSkipped = [
    "mobile_tablet_layout_suite",
    "notification_audience_matrix",
    "error_tracking_aggregation",
    "stripe_live_webhook_latency",
    "production_backup_restore_drill",
  ];

  const summary = summarizeOverall(findings);
  const healthyFindings = [];
  if (summary.urgent === 0 && summary.warning === 0) {
    healthyFindings.push({
      id: "overall:healthy",
      area: "summary",
      severity: "healthy",
      status: "healthy",
      title: "No urgent problems found",
      message: "The automated checks that ran did not find urgent website problems.",
      plainLanguage: "The automated checks that ran did not find urgent website problems.",
    });
  }

  const report = {
    ok: true,
    generatedAt,
    overall: summary.overall,
    summary: {
      ...summary,
      checksRun: Object.keys(suites).length,
      checksSkipped,
      publishedLessonPlansChecked: curriculumScan.checked,
      publishedLessonPlansHealthy: curriculumScan.publishedComplete,
      liveWebsiteSafe: summary.urgent === 0,
    },
    timestamps: {
      lastFullCheck: generatedAt,
      previousFullCheck: previous.lastFullCheck || "",
      lastBackup: suites.store?.lastBackup?.createdAt || previous.lastBackup || "",
      lastDeployment: process.env.RENDER_GIT_COMMIT
        || process.env.GIT_COMMIT
        || previous.lastDeployment
        || "",
      lastBillingCheck: generatedAt,
    },
    suites,
    findings: [...healthyFindings, ...findings].slice(0, 200),
    plainSummary: buildPlainSummary(summary, suites, findings, checksSkipped),
  };

  return report;
}

function buildPlainSummary(summary, suites, findings, checksSkipped = []) {
  const lines = [];
  lines.push(`Overall status: ${summary.overall.replace(/_/g, " ")}.`);
  lines.push(
    summary.urgent === 0
      ? "Live website safety for checked areas: safe to continue using (no urgent issues in this check)."
      : "Live website safety for checked areas: urgent issues need attention before you treat this as fully healthy.",
  );
  lines.push(`Health areas checked: ${Object.keys(suites).length}. Finding rows reviewed: ${summary.totalFindings}.`);
  if (checksSkipped.length) {
    lines.push(`Checks skipped in this phase: ${checksSkipped.join(", ")}.`);
  }
  if (suites.curriculum) {
    lines.push(
      `Lesson plans: ${suites.curriculum.publishedComplete} published plan(s) look complete; ${suites.curriculum.publishedIncomplete} published plan(s) still need weekday/activity fixes.`,
    );
  }
  if (suites.billingAccess) {
    lines.push(
      suites.billingAccess.mismatchCount
        ? `Billing: ${suites.billingAccess.usersWithMismatches} member(s) have access mismatches that need review.`
        : "Billing: no access mismatches were flagged in the live member list.",
    );
  }
  if (suites.permissions) {
    lines.push(
      suites.permissions.staffWithManualOverride
        ? `Permissions: ${suites.permissions.staffWithManualOverride} staff-like account(s) have a manual access override to review.`
        : "Permissions: no staff-like manual access overrides were flagged.",
    );
  }
  if (suites.store?.lastBackup?.createdAt) {
    lines.push(`Last listed backup: ${suites.store.lastBackup.createdAt}.`);
  } else {
    lines.push("Last listed backup: not available in this environment.");
  }
  const top = findings.filter((f) => f.severity === "urgent" || f.status === "urgent").slice(0, 5);
  if (top.length) {
    lines.push("Top urgent items:");
    top.forEach((item) => lines.push(`• ${item.plainLanguage || item.message}`));
  }
  return lines.join("\n");
}

/**
 * Apply only clearly safe repairs. Never touches user-created family/child content.
 */
function applySafeSystemRepairs(deps, report) {
  const repairs = [];
  const store = typeof deps.peekStore === "function" ? deps.peekStore() : null;
  if (!store) return { repairs, report };

  const siteContent = store.siteContent && typeof store.siteContent === "object"
    ? store.siteContent
    : null;
  if (!siteContent?.curriculum) return { repairs, report };

  let curriculum = siteContent.curriculum;
  const candidates = (report.findings || []).filter((f) => f.autoRepairSafe && f.planId);

  for (const finding of candidates) {
    if (finding.repairAction !== "rebuild_activity_links" && finding.repairAction !== "resync_activities") {
      continue;
    }
    const plan = (curriculum.lessonPlans || []).find((item) => item.id === finding.planId);
    if (!plan) continue;
    if (typeof deps.syncCurriculumActivitiesForLessonPlan !== "function") continue;
    const synced = deps.syncCurriculumActivitiesForLessonPlan(curriculum, plan);
    if (!synced) continue;
    curriculum = synced;
    repairs.push({
      id: finding.id,
      planId: finding.planId,
      action: finding.repairAction,
      plainLanguage: `Reconnected activities for “${plan.title || plan.id}”.`,
      status: "repaired",
    });
    finding.status = "repaired";
    finding.severity = "repaired";
    finding.plainLanguage = `Automatically repaired: reconnected activities for “${plan.title || plan.id}”.`;
  }

  if (repairs.length && typeof deps.writeSiteCurriculum === "function") {
    deps.writeSiteCurriculum(store, curriculum, { updatedAt: new Date().toISOString() });
  }

  return { repairs, curriculum, store };
}

module.exports = {
  buildSystemHealthReport,
  applySafeSystemRepairs,
};
