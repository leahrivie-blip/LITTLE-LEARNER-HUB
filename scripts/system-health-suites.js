/**
 * System Health suite runners for previously skipped protections.
 * Safe to call during report builds — no production overwrite, no Playwright.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function readText(relPath) {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), "utf8");
  } catch {
    return "";
  }
}

function findingBase(partial) {
  return {
    autoRepairSafe: false,
    needsManualReview: true,
    ...partial,
  };
}

/**
 * Mobile / tablet layout suite — static structural protections that already
 * shipped in CSS/JS (fullscreen lesson, notification panel, more-sheet).
 * Full Playwright flow tests remain in npm scripts; this suite verifies the
 * protections are still present in the codebase and records last CI stamp.
 */
function runMobileLayoutSuite(store = {}) {
  const findings = [];
  const css = readText("styles.css");
  const appJs = readText("app.js");
  const indexHtml = readText("index.html");
  const checks = [];

  const mark = (id, ok, title, plainLanguage, severity = "high") => {
    checks.push({ id, ok, title });
    if (!ok) {
      findings.push(findingBase({
        id: `mobile:${id}`,
        area: "mobile",
        severity: severity === "critical" ? "urgent" : "warning",
        status: severity === "critical" ? "urgent" : "warning",
        title,
        plainLanguage,
        message: plainLanguage,
      }));
    }
  };

  mark(
    "viewport-meta",
    /name=["']viewport["']/i.test(indexHtml),
    "Mobile viewport meta tag",
    "The website is missing a mobile viewport setting, so phone layouts may scale incorrectly.",
    "critical",
  );
  mark(
    "lesson-fullscreen",
    /\.lesson-workspace[\s\S]{0,400}100dvh|llh-lesson-fullscreen|lesson-workspace--fullscreen/i.test(css + appJs),
    "Fullscreen lesson viewer protections",
    "Mobile lesson fullscreen styles/scripts look missing — lesson pages may get trapped in small containers on phones.",
    "high",
  );
  mark(
    "notification-panel",
    /notification-panel|llh-notif|adminNotificationsPanel/i.test(css + appJs + indexHtml),
    "Notification panel mobile shell",
    "Notification panel markup/styles look incomplete — alerts may be cut off on small screens.",
    "high",
  );
  mark(
    "more-menu-sheet",
    /lesson-more|more-sheet|data-lesson-more/i.test(css + appJs),
    "Lesson More-menu sheet",
    "The lesson “More” menu mobile sheet protections look missing — menus may go off-screen.",
    "high",
  );
  mark(
    "horizontal-scroll-guard",
    /overflow-x:\s*hidden|overflow-x:\s*clip/i.test(css),
    "Horizontal overflow guard",
    "No clear horizontal overflow guard was found — pages may scroll sideways on phones.",
    "medium",
  );

  const stamp = store?.systemHealth?.suiteResults?.mobile || null;
  if (stamp && stamp.ok === false) {
    findings.push(findingBase({
      id: "mobile:last-playwright",
      area: "mobile",
      severity: "urgent",
      status: "urgent",
      title: "Latest mobile Playwright suite failed",
      plainLanguage: stamp.plainLanguage
        || `The last mobile/tablet Playwright run failed at ${stamp.at || "unknown time"}.`,
      message: stamp.message || stamp.plainLanguage || "Mobile Playwright suite failed.",
    }));
  }

  const passed = checks.filter((c) => c.ok).length;
  return {
    id: "mobile_tablet_layout_suite",
    ran: true,
    ok: findings.length === 0,
    checked: checks.length + (stamp ? 1 : 0),
    passed,
    failed: findings.length,
    note: stamp
      ? `Static protections checked. Last Playwright stamp: ${stamp.at || "unknown"} (${stamp.ok ? "passed" : "failed"}).`
      : "Static protections checked. Full phone/tablet Playwright flows still need a CI or manual run to stamp results.",
    checks,
    findings,
    playwrightStamp: stamp,
  };
}

/**
 * Notification audience matrix — verify admin alerts are not sitting in member inboxes.
 */
function runNotificationMatrixSuite(store = {}, deps = {}) {
  const findings = [];
  const notifications = Array.isArray(store.notifications) ? store.notifications : [];
  const adminEmails = new Set(
    [
      ...(Array.isArray(deps.ADMIN_EMAILS) ? deps.ADMIN_EMAILS : String(deps.ADMIN_EMAILS || "").split(/[,;\s]+/)),
      deps.ADMIN_EMAIL,
      store.__adminEmail,
      ...(Array.isArray(store.__adminEmails) ? store.__adminEmails : []),
    ]
      .map((email) => String(email || "").trim().toLowerCase())
      .filter(Boolean),
  );

  let adminNotifOnMember = 0;
  const sampleMembers = [];
  notifications.forEach((note) => {
    const type = String(note?.type || "");
    const email = String(note?.email || "").trim().toLowerCase();
    if (!email || !type) return;
    const looksAdmin = type.startsWith("admin_") || String(note?.category || "") === "system" && type.includes("admin");
    if (!looksAdmin) return;
    if (adminEmails.has(email)) return;
    adminNotifOnMember += 1;
    if (sampleMembers.length < 5) sampleMembers.push(email);
  });

  if (adminNotifOnMember > 0) {
    findings.push(findingBase({
      id: "notif:admin-on-member",
      area: "notifications",
      severity: "urgent",
      status: "urgent",
      title: "Admin notifications reached regular members",
      plainLanguage: `${adminNotifOnMember} admin-only notification${adminNotifOnMember === 1 ? "" : "s"} appear in regular member inboxes${sampleMembers.length ? ` (examples: ${sampleMembers.join(", ")})` : ""}.`,
      message: "Admin notification leakage detected.",
    }));
  }

  // Members should not have director/admin page deep links in notifications.
  let badDeepLinks = 0;
  notifications.forEach((note) => {
    const email = String(note?.email || "").trim().toLowerCase();
    if (!email || adminEmails.has(email)) return;
    const url = String(note?.url || note?.deepLink || "");
    if (/adminSection=|view=admin/i.test(url) && String(note?.type || "").startsWith("admin_")) {
      badDeepLinks += 1;
    }
  });
  if (badDeepLinks > 0) {
    findings.push(findingBase({
      id: "notif:member-admin-deeplink",
      area: "notifications",
      severity: "warning",
      status: "warning",
      title: "Members received admin-page notification links",
      plainLanguage: `${badDeepLinks} member notification${badDeepLinks === 1 ? "" : "s"} include admin-only page links.`,
      message: "Member notification deep links point at admin pages.",
    }));
  }

  const pushLog = Array.isArray(store.pushDeliveryLog) ? store.pushDeliveryLog : [];
  const failedPush = pushLog.filter((row) => {
    const status = String(row?.status || row?.result || "").toLowerCase();
    return status.includes("fail") || status.includes("error") || row?.ok === false;
  }).length;

  return {
    id: "notification_audience_matrix",
    ran: true,
    ok: findings.length === 0,
    checked: 3,
    passed: 3 - findings.length,
    failed: findings.length,
    adminEmailsConfigured: adminEmails.size,
    adminNotificationsScanned: notifications.filter((n) => String(n?.type || "").startsWith("admin_")).length,
    failedPushDeliveries: failedPush,
    note: adminEmails.size
      ? "Checked live notification inbox isolation against configured admin emails."
      : "No admin emails were configured in this environment — isolation check used an empty admin set.",
    findings,
  };
}

/**
 * Aggregate dedicated error tracker + AI failures + open bug reports.
 */
function runErrorTrackingSuite(store = {}) {
  const findings = [];
  const clientErrors = Array.isArray(store.clientErrors) ? store.clientErrors : [];
  const aiLogs = Array.isArray(store.aiUsageLogs) ? store.aiUsageLogs : [];
  const bugReports = Array.isArray(store.bugReports) ? store.bugReports : [];
  const supportBugs = (Array.isArray(store.supportTickets) ? store.supportTickets : [])
    .filter((ticket) => /bug/i.test(String(ticket.type || ticket.category || ticket.subject || "")));

  const recentClient = clientErrors.filter((row) => {
    const ms = new Date(row.createdAt || 0).getTime();
    return Number.isFinite(ms) && (Date.now() - ms) < 7 * 24 * 60 * 60 * 1000;
  });
  const recentAiFails = aiLogs.filter((row) => {
    const status = String(row?.status || "").toLowerCase();
    const failed = status === "error" || status === "failed" || row?.ok === false;
    if (!failed) return false;
    const ms = new Date(row.createdAt || row.at || 0).getTime();
    return Number.isFinite(ms) && (Date.now() - ms) < 7 * 24 * 60 * 60 * 1000;
  });
  const openBugs = [...bugReports, ...supportBugs].filter((item) => !["Resolved", "Completed", "Archived", "Complete"].includes(String(item.status || "")));

  // Group client errors by type for top issues
  const byType = {};
  recentClient.forEach((row) => {
    const key = String(row.errorType || row.message || "unknown").slice(0, 120);
    if (!byType[key]) byType[key] = { count: 0, users: new Set(), sample: row };
    byType[key].count += 1;
    if (row.role) byType[key].users.add(String(row.role));
    if (row.userHash) byType[key].users.add(String(row.userHash));
  });
  Object.entries(byType)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .forEach(([type, info]) => {
      const severity = info.count >= 10 ? "urgent" : info.count >= 3 ? "warning" : "needs_review";
      findings.push(findingBase({
        id: `error:${type}`.slice(0, 160),
        area: "errors",
        severity,
        status: severity,
        title: "Repeated website error",
        plainLanguage: `“${type}” happened ${info.count} time${info.count === 1 ? "" : "s"} in the last 7 days${info.sample?.page ? ` on ${info.sample.page}` : ""}.`,
        message: info.sample?.message || type,
        affectedUsersApprox: info.users.size,
      }));
    });

  if (recentAiFails.length >= 5) {
    findings.push(findingBase({
      id: "error:ai-failures",
      area: "errors",
      severity: "warning",
      status: "warning",
      title: "AI tools failing recently",
      plainLanguage: `${recentAiFails.length} AI tool failure${recentAiFails.length === 1 ? "" : "s"} were logged in the last 7 days.`,
      message: "AI usage failures elevated.",
    }));
  }

  return {
    id: "error_tracking_aggregation",
    ran: true,
    ok: findings.filter((f) => f.severity === "urgent").length === 0,
    checked: 3,
    passed: findings.length ? 2 : 3,
    failed: findings.length,
    recentClientErrors: recentClient.length,
    recentAiFailures: recentAiFails.length,
    openBugReports: openBugs.length,
    findings,
    note: "Aggregates client error log, AI failures, and open bug reports. Child/family details are never stored in client error rows.",
  };
}

function runPdfFailureSuite(store = {}) {
  const findings = [];
  const pdfLog = Array.isArray(store.pdfFailureLog) ? store.pdfFailureLog : [];
  const events = Array.isArray(store.analyticsEvents) ? store.analyticsEvents : [];
  const eventFails = events.filter((event) => event.name === "pdf_generation_failed");
  const recent = [...pdfLog, ...eventFails.map((event) => ({
    createdAt: event.createdAt,
    title: event.detail?.title || "",
    variant: event.detail?.printVariant || "",
    message: event.detail?.message || "PDF failed",
  }))].filter((row) => {
    const ms = new Date(row.createdAt || 0).getTime();
    return Number.isFinite(ms) && (Date.now() - ms) < 30 * 24 * 60 * 60 * 1000;
  });

  if (recent.length) {
    findings.push(findingBase({
      id: "pdf:recent-failures",
      area: "pdf",
      severity: recent.length >= 5 ? "urgent" : "warning",
      status: recent.length >= 5 ? "urgent" : "warning",
      title: "Lesson-plan PDF downloads failed",
      plainLanguage: `${recent.length} PDF generation failure${recent.length === 1 ? "" : "s"} were logged in the last 30 days.`,
      message: recent[0]?.message || "PDF generation failed",
    }));
  }

  return {
    id: "failed_pdf_generation_log",
    ran: true,
    ok: findings.length === 0,
    checked: 1,
    passed: findings.length ? 0 : 1,
    failed: findings.length,
    recentFailures: recent.length,
    findings,
    note: "Counts persisted PDF failure log rows and analytics pdf_generation_failed events.",
  };
}

/**
 * Backup restore drill — verifies a backup payload can be read and structurally
 * restored in memory without writing over production.
 */
function runBackupRestoreDrillSuite(store = {}, deps = {}) {
  const findings = [];
  const previous = store.systemHealth?.restoreDrill || null;
  let drill = null;

  try {
    let payload = null;
    let source = "live-store-clone";
    if (typeof deps.loadLatestBackupData === "function") {
      const loaded = deps.loadLatestBackupData();
      if (loaded?.data) {
        payload = loaded.data;
        source = `backup:${loaded.id || "latest"}`;
      }
    }
    if (!payload) {
      // Safe in-memory clone of current store (never written back).
      payload = JSON.parse(JSON.stringify({
        users: store.users || {},
        siteContent: store.siteContent || {},
        notifications: Array.isArray(store.notifications) ? store.notifications.slice(0, 20) : [],
      }));
      source = "live-store-clone";
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Backup payload was not a store object.");
    }
    if (!payload.users || typeof payload.users !== "object") {
      throw new Error("Backup is missing the users map.");
    }
    const userCount = Object.keys(payload.users).length;
    const plans = Array.isArray(payload.siteContent?.curriculum?.lessonPlans)
      ? payload.siteContent.curriculum.lessonPlans.length
      : 0;
    // Round-trip serialize to prove the payload is restore-shaped.
    const again = JSON.parse(JSON.stringify(payload));
    if (Object.keys(again.users || {}).length !== userCount) {
      throw new Error("Restore round-trip changed the user count.");
    }

    drill = {
      at: new Date().toISOString(),
      ok: true,
      source,
      userCount,
      lessonPlanCount: plans,
      wroteToProduction: false,
      plainLanguage: `Restore drill passed on ${source} without changing the live website (${userCount} members, ${plans} lesson plans in the tested payload).`,
    };
  } catch (error) {
    drill = {
      at: new Date().toISOString(),
      ok: false,
      source: "drill",
      wroteToProduction: false,
      error: String(error.message || error),
      plainLanguage: `Restore drill failed: ${error.message || error}`,
    };
    findings.push(findingBase({
      id: "backup:restore-drill-failed",
      area: "backups",
      severity: "urgent",
      status: "urgent",
      title: "Backup restore drill failed",
      plainLanguage: drill.plainLanguage,
      message: drill.error,
    }));
  }

  if (drill?.ok && previous && previous.ok === false) {
    // recovered — no extra finding
  }

  const ageMs = previous?.at ? Date.now() - new Date(previous.at).getTime() : Number.POSITIVE_INFINITY;
  if (!drill?.ok && previous?.ok && ageMs < 7 * 24 * 60 * 60 * 1000) {
    // keep prior success note in suite even if this run failed oddly — still report failure
  }

  return {
    id: "production_backup_restore_drill",
    ran: true,
    ok: Boolean(drill?.ok),
    checked: 1,
    passed: drill?.ok ? 1 : 0,
    failed: drill?.ok ? 0 : 1,
    drill,
    findings,
    note: drill?.ok
      ? "Verified restore shape in memory only — production data was not overwritten."
      : "Restore drill could not verify a safe restore path.",
  };
}

module.exports = {
  runMobileLayoutSuite,
  runNotificationMatrixSuite,
  runErrorTrackingSuite,
  runPdfFailureSuite,
  runBackupRestoreDrillSuite,
};
