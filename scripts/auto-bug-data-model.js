/**
 * Automated testing-only bug records.
 *
 * Stores sanitized technical failures for Admin review and Cursor-safe
 * investigation. Never stores passwords, tokens, childcare content, medical
 * data, payment data, messages, or form answers.
 */
"use strict";

const crypto = require("node:crypto");
const {
  cleanText,
  sanitizeErrorMessage,
  sanitizePathname,
  roleCategory,
  deviceBucket,
} = require("./testing-sentry-sanitize.js");
const { classifyEligibility } = require("./auto-bug-eligibility.js");

const SCHEMA_VERSION = 1;

const ERROR_TYPES = Object.freeze({
  BROWSER_EXCEPTION: "browser_exception",
  SERVER_EXCEPTION: "server_exception",
  FAILED_API: "failed_api",
  APP_BOOT_TIMEOUT: "app_boot_timeout",
  BROKEN_ROUTE: "broken_route",
  CONSOLE_ERROR: "console_error",
  DATABASE_FAILURE: "database_failure",
  OFFLINE_SYNC_FAILURE: "offline_sync_failure",
  DUPLICATE_REQUEST: "duplicate_request",
  PERMISSION_ROLE_MISMATCH: "permission_role_mismatch",
  DEPLOYED_SMOKE_FAILURE: "deployed_smoke_failure",
  PERFORMANCE_THRESHOLD: "performance_threshold",
  OTHER: "other",
});

const STATUSES = Object.freeze({
  OPEN: "open",
  INVESTIGATING: "investigating",
  FIX_READY: "fix_ready",
  NEEDS_OWNER: "needs_owner",
  VERIFIED: "verified",
  REOPENED: "reopened",
  CLOSED: "closed",
});

const ENVIRONMENTS = Object.freeze({
  LOCAL: "local",
  TESTING: "testing",
  UNKNOWN: "unknown",
});

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function ensureAutoBugStore(store) {
  store.autoBugs = store.autoBugs && typeof store.autoBugs === "object" ? store.autoBugs : {};
  const s = store.autoBugs;
  s.schemaVersion = SCHEMA_VERSION;
  s.records = s.records && typeof s.records === "object" ? s.records : {};
  return s;
}

function normalizeErrorType(value) {
  const raw = cleanText(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (Object.values(ERROR_TYPES).includes(raw)) return raw;
  if (/windowerror|typeerror|referenceerror|browser/.test(raw)) return ERROR_TYPES.BROWSER_EXCEPTION;
  if (/server|express|unhandledrejection/.test(raw) && /server/.test(raw)) return ERROR_TYPES.SERVER_EXCEPTION;
  if (/api|fetch|http|status/.test(raw)) return ERROR_TYPES.FAILED_API;
  if (/boot/.test(raw)) return ERROR_TYPES.APP_BOOT_TIMEOUT;
  if (/route|404|view/.test(raw)) return ERROR_TYPES.BROKEN_ROUTE;
  if (/console/.test(raw)) return ERROR_TYPES.CONSOLE_ERROR;
  if (/database|postgres|neon|store/.test(raw)) return ERROR_TYPES.DATABASE_FAILURE;
  if (/offline|sync/.test(raw)) return ERROR_TYPES.OFFLINE_SYNC_FAILURE;
  if (/duplicate/.test(raw)) return ERROR_TYPES.DUPLICATE_REQUEST;
  if (/permission|forbidden|403|role/.test(raw)) return ERROR_TYPES.PERMISSION_ROLE_MISMATCH;
  if (/smoke/.test(raw)) return ERROR_TYPES.DEPLOYED_SMOKE_FAILURE;
  if (/perf|slow|threshold|timing/.test(raw)) return ERROR_TYPES.PERFORMANCE_THRESHOLD;
  return ERROR_TYPES.OTHER;
}

/**
 * Sanitize a stack trace for storage. Keep file:line frames only.
 * Never keep absolute home paths, query strings, tokens, or emails.
 */
function sanitizeStackTrace(stack, maxLines = 12) {
  const text = String(stack || "");
  if (!text.trim()) return "";
  return text
    .split("\n")
    .map((line) => cleanText(sanitizeErrorMessage(line), 220)
      .replace(/file:\/\/\/[^\s)]+/gi, "[file]")
      .replace(/\/(?:Users|home)\/[^\s:)]+/gi, "[path]")
      .replace(/[A-Za-z]:\\[^\s:)]+/g, "[path]")
      .replace(/\?[^:\s)]+/g, ""))
    .filter((line) => line.trim())
    .slice(0, maxLines)
    .join("\n")
    .slice(0, 2400);
}

function normalizeMessageForFingerprint(message) {
  return sanitizeErrorMessage(message)
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/gi, "hex")
    .replace(/\b\d+\b/g, "n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function buildFingerprint({ errorType, message, page, roleCategory: role }) {
  const material = [
    normalizeErrorType(errorType),
    normalizeMessageForFingerprint(message),
    cleanText(page, 80).toLowerCase(),
    roleCategory(role),
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 24);
}

function shortTitle({ errorType, message, page }) {
  const typeLabel = normalizeErrorType(errorType).replace(/_/g, " ");
  const pagePart = cleanText(page, 40) || "unknown page";
  const msg = sanitizeErrorMessage(message).slice(0, 70);
  const base = msg ? `${typeLabel}: ${msg}` : `${typeLabel} on ${pagePart}`;
  return cleanText(base, 120) || "Testing technical failure";
}

function defaultReproductionSteps(intake = {}) {
  const steps = [
    `Open testing environment (${cleanText(intake.testingEnvironment || "testing", 40)}).`,
    `Sign in as role category: ${roleCategory(intake.role || intake.roleCategory)}.`,
    `Go to page/view: ${cleanText(intake.page, 80) || "unknown"}.`,
    `Observe sanitized error type: ${normalizeErrorType(intake.errorType)}.`,
  ];
  if (intake.deviceBrowser || intake.device) {
    steps.push(`Device/browser bucket: ${cleanText(intake.deviceBrowser || intake.device, 80)}.`);
  }
  if (intake.reproductionSteps) {
    return cleanText(intake.reproductionSteps, 1200);
  }
  return steps.join("\n");
}

function publicRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    fingerprint: record.fingerprint,
    title: record.title,
    testingEnvironment: record.testingEnvironment,
    deployedCommit: record.deployedCommit,
    page: record.page,
    roleCategory: record.roleCategory,
    deviceBrowser: record.deviceBrowser,
    errorType: record.errorType,
    sanitizedStack: record.sanitizedStack,
    reproductionSteps: record.reproductionSteps,
    frequency: record.frequency,
    firstSeenAt: record.firstSeenAt,
    lastSeenAt: record.lastSeenAt,
    affectsMultipleUsers: record.affectsMultipleUsers,
    distinctActorKeys: record.distinctActorKeys?.length || 0,
    status: record.status,
    eligibility: record.eligibility,
    stopReason: record.stopReason || "",
    investigation: record.investigation || null,
    ownerReport: record.ownerReport || null,
    verification: record.verification || null,
    draftPrUrl: record.draftPrUrl || "",
    githubIssueUrl: record.githubIssueUrl || "",
    source: record.source || "",
    updatedAt: record.updatedAt,
  };
}

function actorKey(ingest = {}) {
  // Never store emails. Prefer fake org id, else opaque device+role bucket.
  const fakeOrg = cleanText(ingest.fakeOrganizationId, 160);
  if (fakeOrg) return `org:${fakeOrg}`;
  const device = cleanText(ingest.deviceBrowser || ingest.device, 40) || "unknown";
  const role = roleCategory(ingest.role || ingest.roleCategory);
  return `bucket:${role}:${device}`;
}

function resolveEnvironment(value, hostHint = "") {
  const raw = cleanText(value, 40).toLowerCase();
  if (raw === ENVIRONMENTS.LOCAL || raw === ENVIRONMENTS.TESTING) return raw;
  const host = String(hostHint || "").toLowerCase();
  if (/localhost|127\.0\.0\.1/.test(host)) return ENVIRONMENTS.LOCAL;
  if (/testing/.test(host)) return ENVIRONMENTS.TESTING;
  return ENVIRONMENTS.UNKNOWN;
}

/**
 * Create or update one bug record for a sanitized failure (deduped).
 */
function ingestFailure(store, ingest = {}) {
  const bag = ensureAutoBugStore(store);
  const errorType = normalizeErrorType(ingest.errorType);
  const page = sanitizePathname(ingest.page || "") || cleanText(ingest.page, 120) || "unknown";
  const role = roleCategory(ingest.role || ingest.roleCategory);
  const message = sanitizeErrorMessage(ingest.message || "");
  const fingerprint = cleanText(ingest.fingerprint, 40) || buildFingerprint({
    errorType,
    message,
    page,
    roleCategory: role,
  });
  const now = nowIso();
  const actor = actorKey(ingest);
  const existing = Object.values(bag.records).find((row) => row && row.fingerprint === fingerprint);

  if (existing) {
    existing.frequency = Number(existing.frequency || 1) + 1;
    existing.lastSeenAt = now;
    existing.updatedAt = now;
    existing.deployedCommit = cleanText(ingest.deployedCommit || existing.deployedCommit, 40);
    existing.sanitizedStack = sanitizeStackTrace(ingest.sanitizedStack || ingest.stack || existing.sanitizedStack);
    existing.message = message || existing.message;
    if (!Array.isArray(existing.actorKeys)) existing.actorKeys = [];
    if (actor && !existing.actorKeys.includes(actor)) {
      existing.actorKeys.push(actor);
      if (existing.actorKeys.length > 24) existing.actorKeys.length = 24;
    }
    existing.affectsMultipleUsers = (existing.actorKeys?.length || 0) > 1;
    existing.distinctActorKeys = existing.actorKeys.slice();
    // Reopen verified/closed records when the same failure returns.
    if (existing.status === STATUSES.VERIFIED || existing.status === STATUSES.CLOSED) {
      existing.status = STATUSES.REOPENED;
      existing.verification = {
        ...(existing.verification || {}),
        reopenedAt: now,
        reopenReason: "Same sanitized fingerprint recurred after verification/close.",
      };
    }
    return { created: false, record: existing };
  }

  const eligibility = classifyEligibility({
    errorType,
    message,
    page,
    roleCategory: role,
    source: ingest.source,
  });

  const record = {
    id: newId("abug"),
    fingerprint,
    title: shortTitle({ errorType, message, page }),
    testingEnvironment: resolveEnvironment(ingest.testingEnvironment, ingest.host),
    deployedCommit: cleanText(ingest.deployedCommit, 40),
    page,
    roleCategory: role,
    deviceBrowser: cleanText(ingest.deviceBrowser || ingest.device || deviceBucket(ingest.userAgent || "", Number(ingest.width) || 0), 80) || "unknown",
    errorType,
    message,
    sanitizedStack: sanitizeStackTrace(ingest.sanitizedStack || ingest.stack || ""),
    reproductionSteps: defaultReproductionSteps({ ...ingest, page, roleCategory: role, errorType }),
    frequency: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    actorKeys: actor ? [actor] : [],
    distinctActorKeys: actor ? [actor] : [],
    affectsMultipleUsers: false,
    status: eligibility.eligible ? STATUSES.OPEN : STATUSES.NEEDS_OWNER,
    eligibility: eligibility.code,
    stopReason: eligibility.eligible ? "" : eligibility.reason,
    investigation: null,
    ownerReport: null,
    verification: null,
    draftPrUrl: "",
    githubIssueUrl: "",
    source: cleanText(ingest.source, 40) || "unknown",
    updatedAt: now,
  };
  bag.records[record.id] = record;
  return { created: true, record };
}

function listRecords(store, { status = "", errorType = "", limit = 100 } = {}) {
  const bag = ensureAutoBugStore(store);
  let rows = Object.values(bag.records).filter(Boolean);
  if (status) rows = rows.filter((row) => row.status === status);
  if (errorType) rows = rows.filter((row) => row.errorType === normalizeErrorType(errorType));
  rows.sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
  return rows.slice(0, Math.max(1, Math.min(200, Number(limit) || 100))).map(publicRecord);
}

function getRecord(store, id) {
  const bag = ensureAutoBugStore(store);
  return publicRecord(bag.records[String(id || "")]);
}

function getRawRecord(store, id) {
  const bag = ensureAutoBugStore(store);
  return bag.records[String(id || "")] || null;
}

function updateStatus(store, id, status, note = "") {
  const record = getRawRecord(store, id);
  if (!record) return null;
  if (!Object.values(STATUSES).includes(status)) return null;
  record.status = status;
  record.updatedAt = nowIso();
  if (note) {
    record.statusNotes = cleanText(note, 500);
  }
  return publicRecord(record);
}

function attachInvestigation(store, id, investigation = {}) {
  const record = getRawRecord(store, id);
  if (!record) return null;
  record.investigation = {
    at: nowIso(),
    branchName: cleanText(investigation.branchName, 120),
    rootCause: cleanText(investigation.rootCause, 800),
    whatChanged: cleanText(investigation.whatChanged, 800),
    testResults: cleanText(investigation.testResults, 800),
    beforeScreenshot: cleanText(investigation.beforeScreenshot, 260),
    afterScreenshot: cleanText(investigation.afterScreenshot, 260),
    riskLevel: cleanText(investigation.riskLevel, 40) || "unknown",
    stopped: investigation.stopped === true,
    stopReason: cleanText(investigation.stopReason, 500),
  };
  if (investigation.draftPrUrl) record.draftPrUrl = cleanText(investigation.draftPrUrl, 260);
  if (investigation.stopped) {
    record.status = STATUSES.NEEDS_OWNER;
    record.stopReason = record.investigation.stopReason;
  } else if (investigation.draftPrUrl) {
    record.status = STATUSES.FIX_READY;
  } else {
    record.status = STATUSES.INVESTIGATING;
  }
  record.updatedAt = nowIso();
  return publicRecord(record);
}

function attachOwnerReport(store, id, report = {}) {
  const record = getRawRecord(store, id);
  if (!record) return null;
  record.ownerReport = {
    at: nowIso(),
    whatBroke: cleanText(report.whatBroke, 500),
    whoItAffects: cleanText(report.whoItAffects, 400),
    rootCause: cleanText(report.rootCause, 800),
    whatChanged: cleanText(report.whatChanged, 800),
    beforeScreenshot: cleanText(report.beforeScreenshot, 260),
    afterScreenshot: cleanText(report.afterScreenshot, 260),
    testResults: cleanText(report.testResults, 800),
    draftPrUrl: cleanText(report.draftPrUrl || record.draftPrUrl, 260),
    riskLevel: cleanText(report.riskLevel, 40) || "unknown",
    approveQuestion: "Approve merge to testing?",
  };
  if (record.ownerReport.draftPrUrl) record.draftPrUrl = record.ownerReport.draftPrUrl;
  record.updatedAt = nowIso();
  return publicRecord(record);
}

function attachVerification(store, id, verification = {}) {
  const record = getRawRecord(store, id);
  if (!record) return null;
  const ok = verification.ok === true;
  record.verification = {
    at: nowIso(),
    ok,
    deployedCommit: cleanText(verification.deployedCommit, 40),
    expectedCommit: cleanText(verification.expectedCommit, 40),
    originalErrorGone: verification.originalErrorGone === true,
    newCriticalErrors: verification.newCriticalErrors === true,
    smokeOk: verification.smokeOk === true,
    notes: cleanText(verification.notes, 800),
  };
  if (!ok || verification.originalErrorGone === false || verification.newCriticalErrors === true || verification.smokeOk === false) {
    record.status = STATUSES.REOPENED;
    record.verification.reopenedAt = nowIso();
    record.verification.reopenReason = cleanText(
      verification.reopenReason || "Post-deploy verification failed — issue automatically reopened.",
      400,
    );
  } else {
    record.status = STATUSES.VERIFIED;
  }
  record.updatedAt = nowIso();
  return publicRecord(record);
}

function openCount(store) {
  const bag = ensureAutoBugStore(store);
  return Object.values(bag.records).filter((row) => row && [STATUSES.OPEN, STATUSES.REOPENED, STATUSES.INVESTIGATING, STATUSES.FIX_READY, STATUSES.NEEDS_OWNER].includes(row.status)).length;
}

function githubIssueBody(record) {
  const r = publicRecord(record) || record;
  return [
    "## Automated testing bug (sanitized)",
    "",
    `- **Title:** ${r.title}`,
    `- **Testing environment:** ${r.testingEnvironment}`,
    `- **Deployed commit:** \`${r.deployedCommit || "unknown"}\``,
    `- **Page:** ${r.page}`,
    `- **Role category:** ${r.roleCategory}`,
    `- **Device/browser:** ${r.deviceBrowser}`,
    `- **Error type:** ${r.errorType}`,
    `- **Frequency:** ${r.frequency}`,
    `- **First seen:** ${r.firstSeenAt}`,
    `- **Most recent:** ${r.lastSeenAt}`,
    `- **Affects multiple users:** ${r.affectsMultipleUsers ? "yes" : "no"}`,
    `- **Eligibility:** ${r.eligibility}`,
    r.stopReason ? `- **Stop reason:** ${r.stopReason}` : null,
    "",
    "### Sanitized stack",
    "```",
    r.sanitizedStack || "(none)",
    "```",
    "",
    "### Reproduction steps",
    r.reproductionSteps || "(none)",
    "",
    "### Automation limits",
    "- Do **not** merge, deploy, push to main, or change production.",
    "- Do **not** change prices, permissions, billing, legal, medical, or layout decisions.",
    "- Stop without code changes when stop conditions apply (see docs/AUTO_BUG_SAFE_REPAIR.md).",
  ].filter((line) => line !== null).join("\n");
}

module.exports = {
  SCHEMA_VERSION,
  ERROR_TYPES,
  STATUSES,
  ENVIRONMENTS,
  ensureAutoBugStore,
  normalizeErrorType,
  sanitizeStackTrace,
  buildFingerprint,
  shortTitle,
  ingestFailure,
  listRecords,
  getRecord,
  getRawRecord,
  updateStatus,
  attachInvestigation,
  attachOwnerReport,
  attachVerification,
  openCount,
  publicRecord,
  githubIssueBody,
};
