/**
 * Phase 19 — Accessibility, Performance, Reliability, and Recovery data model.
 * Fake / testing-safe helpers only. Never store secrets, passwords, signatures,
 * private notes, medical details, or message contents in logs or drafts metadata.
 */

const crypto = require("node:crypto");

const PHASE = 19;
const FEATURE_MARKER = "phase19-platform-resilience";
const TESTING_BANNER = "Private Testing Environment — Fake Data Only";

const SAVE_STATES = Object.freeze([
  "idle",
  "saving",
  "saved",
  "unsaved",
  "retrying",
  "failed",
]);

const NETWORK_STATES = Object.freeze([
  "online",
  "offline",
  "slow",
  "timeout",
  "server_error",
]);

/** Soft budgets for important testing flows (milliseconds / counts). */
const PERFORMANCE_BUDGETS = Object.freeze({
  testingLabDashboardMs: 2500,
  healthSummaryMs: 1500,
  listPageSize: 25,
  activityHistoryPageSize: 50,
  maxConcurrentDedupe: 1,
  scriptLazyLoadMs: 4000,
});

const SECRET_FIELD_PATTERN = /(password|passwd|token|secret|signature|ssn|medical|diagnosis|allerg|privateNote|messageBody|messageContent|api[_-]?key|authorization|bearer)/i;

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isFakeOrganizationId(organizationId) {
  const id = String(organizationId || "");
  if (!id) return false;
  if (/prod|live|stripe|customer|main/i.test(id)) return false;
  return /^org_[a-f0-9]+$/i.test(id) || /^fake_org_/i.test(id) || id.startsWith("org_");
}

/**
 * Build a scoped draft key. Never restore across user/org/child/classroom/record.
 */
function buildDraftScopeKey({
  surface,
  organizationId,
  userId,
  childId,
  classroomId,
  recordId,
} = {}) {
  const parts = [
    "llh-draft",
    cleanText(surface, 40) || "unknown",
    cleanText(organizationId, 80) || "no-org",
    cleanText(userId, 80) || "no-user",
    cleanText(childId, 80) || "no-child",
    cleanText(classroomId, 80) || "no-classroom",
    cleanText(recordId, 80) || "no-record",
  ];
  return parts.join("::");
}

function scopesMatch(a = {}, b = {}) {
  const keys = ["organizationId", "userId", "childId", "classroomId", "recordId", "surface"];
  return keys.every((key) => cleanText(a[key], 80) === cleanText(b[key], 80));
}

/**
 * Strip secrets from error / log payloads. Keeps technical codes only.
 */
function sanitizeErrorLog(input = {}) {
  const out = {
    at: nowIso(),
    code: cleanText(input.code || input.name || "error", 80),
    message: cleanText(input.message || "Something went wrong.", 240),
    surface: cleanText(input.surface, 60),
    organizationId: isFakeOrganizationId(input.organizationId) ? cleanText(input.organizationId, 80) : "",
    testingOnly: true,
    noSecrets: true,
  };
  if (input.statusCode != null) out.statusCode = Number(input.statusCode) || 0;
  if (input.networkState && NETWORK_STATES.includes(input.networkState)) {
    out.networkState = input.networkState;
  }
  // Drop any accidental sensitive fields
  for (const key of Object.keys(input || {})) {
    if (SECRET_FIELD_PATTERN.test(key)) continue;
  }
  return out;
}

function createFailedSaveRecord(input = {}) {
  return {
    id: input.id || newId("fsave"),
    ...sanitizeErrorLog(input),
    retryable: input.retryable !== false,
    resolved: input.resolved === true,
    surface: cleanText(input.surface, 60),
  };
}

function createDraftRecord(input = {}) {
  const scope = {
    surface: cleanText(input.surface, 40),
    organizationId: cleanText(input.organizationId, 80),
    userId: cleanText(input.userId, 80),
    childId: cleanText(input.childId, 80),
    classroomId: cleanText(input.classroomId, 80),
    recordId: cleanText(input.recordId, 80),
  };
  if (!isFakeOrganizationId(scope.organizationId) && scope.organizationId) {
    // Allow empty org for anonymous demos, but never accept real-looking org ids for recovery sims
    if (/prod|live|customer/i.test(scope.organizationId)) {
      throw new Error("Draft scope rejected: organization looks real/production.");
    }
  }
  const payload = input.payload && typeof input.payload === "object" ? { ...input.payload } : {};
  for (const key of Object.keys(payload)) {
    if (SECRET_FIELD_PATTERN.test(key)) delete payload[key];
  }
  return {
    id: input.id || newId("draft"),
    scopeKey: buildDraftScopeKey(scope),
    scope,
    payload,
    updatedAt: input.updatedAt || nowIso(),
    testingOnly: true,
    neverCrossUser: true,
  };
}

function ensureResilienceStore(store) {
  if (!store.platformResilience || typeof store.platformResilience !== "object") {
    store.platformResilience = {};
  }
  const pr = store.platformResilience;
  for (const key of ["failedSaves", "draftSims", "backupSims", "restorePreviews", "perfSamples", "healthSnapshots"]) {
    if (!pr[key] || typeof pr[key] !== "object") pr[key] = {};
  }
  if (!pr.meta || typeof pr.meta !== "object") {
    pr.meta = {
      phase: PHASE,
      featureMarker: FEATURE_MARKER,
      testingOnly: true,
      noProductionBackup: true,
      noProductionRestore: true,
      noSecretsInLogs: true,
      createdAt: nowIso(),
    };
  }
  pr.meta.updatedAt = nowIso();
  return pr;
}

function buildHealthSummary({
  store,
  env = {},
  launchReadiness = null,
  databaseProvider = "local-json",
} = {}) {
  ensureResilienceStore(store);
  const flags = store.siteContent?.featureFlags || {};
  const failed = Object.values(store.platformResilience.failedSaves || {}).filter((r) => !r.resolved);
  const external = {
    stripeCheckout: env.DISABLE_STRIPE_CHECKOUT === true || env.DISABLE_STRIPE_CHECKOUT === "true" || !env.STRIPE_SECRET_KEY
      ? "disabled"
      : "configured",
    outboundEmail: env.DISABLE_OUTBOUND_EMAIL === true || env.DISABLE_OUTBOUND_EMAIL === "true" || !env.SMTP_URL
      ? "disabled"
      : "configured",
    outboundSms: "disabled",
    pushNotifications: "disabled",
    liveAi: env.DISABLE_AI_CALLS === true || env.DISABLE_AI_CALLS === "true" || !env.OPENAI_API_KEY
      ? "disabled"
      : "configured",
  };
  return {
    ok: true,
    phase: PHASE,
    featureMarker: FEATURE_MARKER,
    testingBanner: TESTING_BANNER,
    at: nowIso(),
    storage: {
      provider: cleanText(databaseProvider, 40) || "local-json",
      ready: true,
      testingSafe: databaseProvider === "local-json" || databaseProvider === "test",
      note: "Testing uses local JSON / fake orgs only. No production restore.",
    },
    featureFlags: {
      directorCenter: flags.directorCenter === true,
      formsCenter: flags.formsCenter === true,
      familyHub: flags.familyHub === true,
      testingLab: flags.testingLab === true,
    },
    externalServices: external,
    failedSaves: {
      openCount: failed.length,
      samples: failed.slice(0, 5).map((row) => ({
        id: row.id,
        code: row.code,
        surface: row.surface,
        at: row.at,
        retryable: row.retryable,
      })),
    },
    launchReadiness: launchReadiness
      ? {
          ready: launchReadiness.ready === true,
          blockers: Array.isArray(launchReadiness.blockers) ? launchReadiness.blockers : [],
          note: "Launch readiness is informational in Testing Lab; Stripe/email may be NOT READY locally.",
        }
      : null,
    backupRestore: {
      productionBackup: false,
      productionRestore: false,
      fakeSimulationAvailable: true,
      requiresFakeOrganizationConfirm: true,
    },
  };
}

function createBackupSimulation(input = {}) {
  if (!isFakeOrganizationId(input.organizationId)) {
    throw new Error("Backup simulation limited to validated fake organizations.");
  }
  return {
    id: input.id || newId("bak"),
    organizationId: cleanText(input.organizationId, 80),
    label: cleanText(input.label || "Fake data backup simulation", 160),
    createdAt: nowIso(),
    createdBy: cleanText(input.createdBy, 160).toLowerCase(),
    includes: ["fake accounts metadata", "scenario label", "checklist notes", "lab session"],
    excludes: ["passwords", "tokens", "production data", "Stripe", "real users"],
    testingOnly: true,
    notProduction: true,
    snapshot: {
      scenario: cleanText(input.scenario, 80),
      accountCount: Number(input.accountCount) || 0,
      noteCount: Number(input.noteCount) || 0,
      featureState: cleanText(input.featureState, 80),
    },
  };
}

function createRestorePreview(backup, current = {}) {
  if (!backup || !isFakeOrganizationId(backup.organizationId)) {
    throw new Error("Restore preview rejected: invalid fake backup.");
  }
  return {
    id: newId("rstprev"),
    backupId: backup.id,
    organizationId: backup.organizationId,
    at: nowIso(),
    testingOnly: true,
    requiresConfirm: true,
    wouldChange: {
      scenario: {
        from: cleanText(current.scenario, 80) || "—",
        to: backup.snapshot?.scenario || "—",
      },
      featureState: {
        from: cleanText(current.featureState, 80) || "—",
        to: backup.snapshot?.featureState || "—",
      },
      note: "Would re-apply fake Lab session labels from the simulation snapshot. Does not touch production.",
    },
    wouldNotChange: [
      "production database",
      "main branch",
      "real customer orgs",
      "Stripe / email / SMS / push / live AI",
      "password hashes",
    ],
  };
}

function recordPerfSample(store, input = {}) {
  ensureResilienceStore(store);
  const sample = {
    id: input.id || newId("perf"),
    flow: cleanText(input.flow, 80),
    durationMs: Math.max(0, Number(input.durationMs) || 0),
    budgetMs: Number(input.budgetMs) || 0,
    withinBudget: input.budgetMs ? Number(input.durationMs) <= Number(input.budgetMs) : true,
    organizationId: isFakeOrganizationId(input.organizationId) ? cleanText(input.organizationId, 80) : "",
    at: nowIso(),
    testingOnly: true,
  };
  store.platformResilience.perfSamples[sample.id] = sample;
  return sample;
}

function paginateList(items, { page = 1, pageSize = PERFORMANCE_BUDGETS.listPageSize } = {}) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.min(100, Math.max(1, Number(pageSize) || PERFORMANCE_BUDGETS.listPageSize));
  const pageNum = Math.max(1, Number(page) || 1);
  const start = (pageNum - 1) * size;
  const slice = list.slice(start, start + size);
  return {
    items: slice,
    page: pageNum,
    pageSize: size,
    total: list.length,
    totalPages: Math.max(1, Math.ceil(list.length / size)),
    hasMore: start + size < list.length,
  };
}

module.exports = {
  PHASE,
  FEATURE_MARKER,
  TESTING_BANNER,
  SAVE_STATES,
  NETWORK_STATES,
  PERFORMANCE_BUDGETS,
  SECRET_FIELD_PATTERN,
  newId,
  nowIso,
  cleanText,
  isFakeOrganizationId,
  buildDraftScopeKey,
  scopesMatch,
  sanitizeErrorLog,
  createFailedSaveRecord,
  createDraftRecord,
  ensureResilienceStore,
  buildHealthSummary,
  createBackupSimulation,
  createRestorePreview,
  recordPerfSample,
  paginateList,
};
