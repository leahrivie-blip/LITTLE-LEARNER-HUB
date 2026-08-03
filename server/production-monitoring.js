/**
 * Lightweight, read-only production monitoring.
 *
 * Aggregates process metrics + existing store signals. Does not change
 * membership, checkout, curriculum, or other product logic.
 */

const DEFAULTS = {
  windowMs: 5 * 60 * 1000,
  errorSpikeCount: 10,
  errorSpikeRate: 0.05,
  memoryCriticalMb: 280,
  dbSizeCriticalMb: 12000,
  metaSilenceHours: 24,
  webhookFailWindowMs: 30 * 60 * 1000,
  alertCooldownMs: 60 * 60 * 1000,
  checkIntervalMs: 5 * 60 * 1000,
};

function numEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function flagEnv(name, fallback = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function createProductionMonitoring(options = {}) {
  const cfg = {
    windowMs: numEnv("MONITOR_WINDOW_MS", options.windowMs || DEFAULTS.windowMs),
    errorSpikeCount: numEnv("MONITOR_5XX_COUNT", options.errorSpikeCount || DEFAULTS.errorSpikeCount),
    errorSpikeRate: Number(process.env.MONITOR_5XX_RATE || options.errorSpikeRate || DEFAULTS.errorSpikeRate),
    memoryCriticalMb: numEnv("MONITOR_MEMORY_CRITICAL_MB", options.memoryCriticalMb || DEFAULTS.memoryCriticalMb),
    dbSizeCriticalMb: numEnv("MONITOR_DB_SIZE_CRITICAL_MB", options.dbSizeCriticalMb || DEFAULTS.dbSizeCriticalMb),
    metaSilenceHours: numEnv("MONITOR_META_SILENCE_HOURS", options.metaSilenceHours || DEFAULTS.metaSilenceHours),
    webhookFailWindowMs: numEnv("MONITOR_WEBHOOK_FAIL_WINDOW_MS", options.webhookFailWindowMs || DEFAULTS.webhookFailWindowMs),
    alertCooldownMs: numEnv("MONITOR_ALERT_COOLDOWN_MS", options.alertCooldownMs || DEFAULTS.alertCooldownMs),
    checkIntervalMs: numEnv("MONITOR_CHECK_INTERVAL_MS", options.checkIntervalMs || DEFAULTS.checkIntervalMs),
    alertsEnabled: flagEnv("MONITOR_ALERTS_ENABLED", options.alertsEnabled !== false),
  };

  /** @type {{ at: number, status: number, path: string }[]} */
  const httpEvents = [];
  /** @type {{ at: number, type: string, message: string }[]} */
  const webhookFailures = [];
  /** @type {Record<string, number>} */
  const lastAlertAt = Object.create(null);
  let timer = null;
  let lastSnapshot = null;

  function prune(list, windowMs = cfg.windowMs) {
    const cutoff = Date.now() - windowMs;
    while (list.length && list[0].at < cutoff) list.shift();
  }

  function recordHttpStatus(statusCode, rawPath = "") {
    const status = Number(statusCode) || 0;
    if (!status) return;
    const path = String(rawPath || "").split("?")[0].slice(0, 160);
    // Ignore monitoring/health self-traffic for spike math noise.
    if (path === "/api/health" || path === "/api/admin/production-monitoring") return;
    httpEvents.push({ at: Date.now(), status, path });
    prune(httpEvents, cfg.windowMs);
  }

  function recordStripeWebhookFailure(type = "", message = "") {
    webhookFailures.push({
      at: Date.now(),
      type: String(type || "unknown").slice(0, 80),
      message: String(message || "").slice(0, 240),
    });
    prune(webhookFailures, Math.max(cfg.webhookFailWindowMs, cfg.windowMs));
  }

  function httpWindowStats() {
    prune(httpEvents, cfg.windowMs);
    const total = httpEvents.length;
    const failed = httpEvents.filter((row) => row.status >= 500);
    const rate = total ? failed.length / total : 0;
    return {
      windowMinutes: Math.round(cfg.windowMs / 60000),
      total,
      failed5xx: failed.length,
      rate,
      samplePaths: failed.slice(-5).map((row) => `${row.status} ${row.path}`),
    };
  }

  function memoryStats() {
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const maxOldSpaceMb = Number(process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1]) || 300;
    return { heapUsedMb, rssMb, maxOldSpaceMb, criticalMb: cfg.memoryCriticalMb };
  }

  function metaStats(store = {}, metaConfig = {}) {
    const deliveries = Array.isArray(store.metaTrackingEvents) ? store.metaTrackingEvents : [];
    const recentOk = deliveries
      .filter((row) => row && row.ok && !row.skipped)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const recentFail = deliveries
      .filter((row) => row && row.ok === false && !row.skipped)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const lastOkAt = recentOk[0]?.createdAt || "";
    const lastFailAt = recentFail[0]?.createdAt || "";
    const ageHours = lastOkAt
      ? (Date.now() - new Date(lastOkAt).getTime()) / (60 * 60 * 1000)
      : null;
    return {
      pixelConfigured: Boolean(metaConfig.pixelId),
      pixelEnabled: Boolean(metaConfig.pixelEnabled),
      capiConfigured: Boolean(metaConfig.accessToken),
      capiEnabled: Boolean(metaConfig.capiEnabled),
      lastOkAt,
      lastFailAt,
      recentFailCount: recentFail.filter((row) => {
        const ts = new Date(row.createdAt || 0).getTime();
        return Number.isFinite(ts) && (Date.now() - ts) <= cfg.windowMs;
      }).length,
      ageHours,
      silenceHours: cfg.metaSilenceHours,
    };
  }

  function evaluateCheck({ id, label, ok, severity = "critical", detail, value = null }) {
    return {
      id,
      label,
      ok: Boolean(ok),
      severity: ok ? "ok" : severity,
      status: ok ? "working" : (severity === "warning" ? "attention" : "attention"),
      detail: String(detail || ""),
      value,
    };
  }

  /**
   * @param {object} deps
   * @param {() => object} deps.getStore
   * @param {() => object} deps.getMetaConfig
   * @param {() => boolean} deps.isDatabaseReady
   * @param {() => string} deps.getDatabaseProvider
   * @param {() => Promise<number|null>} [deps.getDatabaseSizeMb]
   * @param {() => object} [deps.getHealthHints] — optional { stripeWebhookSecretConfigured, websiteOk }
   */
  async function buildSnapshot(deps = {}) {
    const store = typeof deps.getStore === "function" ? (deps.getStore() || {}) : {};
    const metaConfig = typeof deps.getMetaConfig === "function" ? (deps.getMetaConfig() || {}) : {};
    const databaseReady = typeof deps.isDatabaseReady === "function" ? Boolean(deps.isDatabaseReady()) : true;
    const databaseProvider = typeof deps.getDatabaseProvider === "function"
      ? String(deps.getDatabaseProvider() || "local-json")
      : "local-json";
    const hints = typeof deps.getHealthHints === "function" ? (deps.getHealthHints() || {}) : {};

    let dbSizeMb = null;
    if (typeof deps.getDatabaseSizeMb === "function") {
      try { dbSizeMb = await deps.getDatabaseSizeMb(); } catch { dbSizeMb = null; }
    }

    const http = httpWindowStats();
    const mem = memoryStats();
    const meta = metaStats(store, metaConfig);
    prune(webhookFailures, cfg.webhookFailWindowMs);
    const recentWebhookFails = webhookFailures.length;

    const websiteOk = hints.websiteOk !== false;
    const checks = [
      evaluateCheck({
        id: "website_health",
        label: "Website health check",
        ok: websiteOk,
        detail: websiteOk ? "Process is serving /api/health." : "Website health check failed.",
      }),
      evaluateCheck({
        id: "database",
        label: "Database availability",
        ok: databaseProvider === "local-json" ? true : databaseReady,
        detail: databaseProvider === "local-json"
          ? "Local JSON store (dev)."
          : (databaseReady ? "Postgres connection ready." : "Database is unavailable."),
        value: { provider: databaseProvider, ready: databaseReady },
      }),
      evaluateCheck({
        id: "stripe_webhooks",
        label: "Stripe webhook failures",
        ok: recentWebhookFails === 0,
        detail: recentWebhookFails === 0
          ? `No webhook processing failures in the last ${Math.round(cfg.webhookFailWindowMs / 60000)} minutes.`
          : `${recentWebhookFails} webhook failure(s) recently. Latest: ${webhookFailures[webhookFailures.length - 1]?.type || "unknown"}.`,
        value: { recentFailures: recentWebhookFails, latest: webhookFailures.slice(-3) },
      }),
      evaluateCheck({
        id: "meta_tracking",
        label: "Meta Pixel / CAPI events",
        ok: (() => {
          if (!meta.pixelConfigured && !meta.capiConfigured) return true; // not configured → not alarming
          if (meta.capiEnabled || meta.pixelEnabled) {
            if (meta.recentFailCount >= 5) return false;
            if (meta.ageHours == null) return true; // no events yet after wiring — warning only below
            return meta.ageHours <= meta.silenceHours;
          }
          return true;
        })(),
        severity: (meta.pixelConfigured || meta.capiConfigured) && meta.ageHours == null ? "warning" : "critical",
        detail: (() => {
          if (!meta.pixelConfigured && !meta.capiConfigured) return "Meta tracking is not configured.";
          if (meta.recentFailCount >= 5) return `${meta.recentFailCount} CAPI failures in the monitoring window.`;
          if (meta.ageHours == null) return "Configured, but no successful delivery logged yet.";
          if (meta.ageHours > meta.silenceHours) {
            return `No successful Meta delivery for ${meta.ageHours.toFixed(1)} hours (threshold ${meta.silenceHours}h).`;
          }
          return `Last successful delivery ${meta.ageHours.toFixed(1)}h ago. Pixel ${meta.pixelEnabled ? "on" : "off"}, CAPI ${meta.capiEnabled ? "on" : "off"}.`;
        })(),
        value: meta,
      }),
      evaluateCheck({
        id: "error_rate_5xx",
        label: "Error rate (5xx)",
        ok: http.failed5xx < cfg.errorSpikeCount && http.rate < cfg.errorSpikeRate,
        detail: http.total === 0
          ? `No sampled requests in the last ${http.windowMinutes} minutes.`
          : `${http.failed5xx}/${http.total} requests were 5xx (${(http.rate * 100).toFixed(1)}%) in ${http.windowMinutes}m.`,
        value: http,
      }),
      evaluateCheck({
        id: "memory",
        label: "Memory usage",
        ok: mem.heapUsedMb < cfg.memoryCriticalMb,
        detail: `Heap ${mem.heapUsedMb} MB / RSS ${mem.rssMb} MB (critical ≥ ${cfg.memoryCriticalMb} MB; max-old-space ${mem.maxOldSpaceMb} MB).`,
        value: mem,
      }),
      evaluateCheck({
        id: "database_storage",
        label: "Database storage",
        ok: dbSizeMb == null ? true : dbSizeMb < cfg.dbSizeCriticalMb,
        severity: dbSizeMb == null ? "warning" : "critical",
        detail: dbSizeMb == null
          ? (databaseProvider === "postgres"
            ? "Database size not available yet."
            : "Storage size check applies to Postgres production.")
          : `Database size ${Math.round(dbSizeMb)} MB (critical ≥ ${cfg.dbSizeCriticalMb} MB).`,
        value: { dbSizeMb, criticalMb: cfg.dbSizeCriticalMb },
      }),
    ];

    // Soft-fail meta "none yet" as attention/warning without paging if severity warning
    const failing = checks.filter((check) => !check.ok && check.severity === "critical");
    const warnings = checks.filter((check) => !check.ok && check.severity !== "critical");
    const snapshot = {
      ok: failing.length === 0,
      updatedAt: new Date().toISOString(),
      overall: failing.length ? "critical" : (warnings.length ? "attention" : "healthy"),
      checks,
      alerts: {
        enabled: cfg.alertsEnabled,
        cooldownMinutes: Math.round(cfg.alertCooldownMs / 60000),
        lastAlertAt: { ...lastAlertAt },
      },
      config: {
        windowMinutes: Math.round(cfg.windowMs / 60000),
        memoryCriticalMb: cfg.memoryCriticalMb,
        dbSizeCriticalMb: cfg.dbSizeCriticalMb,
        metaSilenceHours: cfg.metaSilenceHours,
      },
    };
    lastSnapshot = snapshot;
    return snapshot;
  }

  function alertsDue(snapshot) {
    if (!cfg.alertsEnabled || !snapshot) return [];
    const now = Date.now();
    return (snapshot.checks || []).filter((check) => {
      if (check.ok || check.severity !== "critical") return false;
      const prev = lastAlertAt[check.id] || 0;
      return (now - prev) >= cfg.alertCooldownMs;
    });
  }

  function markAlertsSent(checks) {
    const now = Date.now();
    for (const check of checks || []) lastAlertAt[check.id] = now;
  }

  function formatAlertEmail(snapshot, dueChecks, siteUrl = "") {
    const lines = dueChecks.map((check) => `- ${check.label}: ${check.detail}`);
    const subject = `[LLH Alert] ${dueChecks.length} production issue${dueChecks.length === 1 ? "" : "s"} — ${snapshot.overall}`;
    const text = [
      "Little Learner Hub production monitoring detected critical issues:",
      "",
      ...lines,
      "",
      `Overall: ${snapshot.overall}`,
      `Checked at: ${snapshot.updatedAt}`,
      siteUrl ? `Admin → System Health: ${siteUrl.replace(/\/$/, "")}/?view=admin` : "",
      "",
      "This is an automated read-only monitor. Alerts are rate-limited.",
    ].filter(Boolean).join("\n");
    return { subject, text };
  }

  function start(runner) {
    if (timer || typeof runner !== "function") return;
    const tick = () => {
      Promise.resolve()
        .then(() => runner())
        .catch((error) => console.warn("[production-monitoring] tick failed:", error?.message || error));
    };
    timer = setInterval(tick, cfg.checkIntervalMs);
    if (typeof timer.unref === "function") timer.unref();
    // First run shortly after boot so Admin has data without waiting a full interval.
    setTimeout(tick, 15000).unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    cfg,
    recordHttpStatus,
    recordStripeWebhookFailure,
    httpWindowStats,
    memoryStats,
    buildSnapshot,
    alertsDue,
    markAlertsSent,
    formatAlertEmail,
    start,
    stop,
    getLastSnapshot: () => lastSnapshot,
  };
}

module.exports = {
  DEFAULTS,
  createProductionMonitoring,
};
