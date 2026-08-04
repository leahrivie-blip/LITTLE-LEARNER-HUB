/**
 * Lightweight, read-only production monitoring.
 *
 * Aggregates process metrics + existing store signals. Does not change
 * membership, checkout, curriculum, or other product logic.
 *
 * Canonical component states:
 * - healthy / working — verified OK (below warning thresholds)
 * - warning — at or above warning threshold
 * - critical — at or above critical threshold / hard failure
 * - not-configured — missing required configuration (never "working")
 * - unknown — unable to verify (never "healthy")
 *
 * Memory thresholds:
 * - Explicit MONITOR_MEMORY_*_MB / options always win.
 * - Else when MONITOR_INSTANCE_MEMORY_MB (or RENDER_INSTANCE_MEMORY_MB) ≥ 1024,
 *   thresholds are percentages of instance RAM (Standard 2GB → warn ~45%, critical ~70%).
 * - Else Starter-era absolutes (220 / 280) for ~512MB instances.
 */

const DEFAULTS = {
  windowMs: 5 * 60 * 1000,
  errorSpikeCount: 10,
  errorSpikeRate: 0.05,
  memoryWarningMb: 220,
  memoryCriticalMb: 280,
  /** Fraction of instance RAM used as warning when instance size is known. */
  memoryWarningFraction: 0.45,
  /** Fraction of instance RAM used as critical when instance size is known. */
  memoryCriticalFraction: 0.70,
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

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Resolve RSS warning/critical thresholds from env + instance size.
 * Explicit MONITOR_MEMORY_CRITICAL_MB (or options.memoryCriticalMb) wins.
 */
function resolveMemoryThresholds(options = {}) {
  const instanceMemoryMb = numEnv(
    "MONITOR_INSTANCE_MEMORY_MB",
    numEnv("RENDER_INSTANCE_MEMORY_MB", positiveNumber(options.instanceMemoryMb)),
  );

  const envCriticalRaw = process.env.MONITOR_MEMORY_CRITICAL_MB;
  const hasExplicitCritical = (
    (envCriticalRaw != null && String(envCriticalRaw).trim() !== "" && positiveNumber(envCriticalRaw) > 0)
    || positiveNumber(options.memoryCriticalMb) > 0
  );

  if (hasExplicitCritical) {
    const memoryCriticalMb = numEnv(
      "MONITOR_MEMORY_CRITICAL_MB",
      positiveNumber(options.memoryCriticalMb) || DEFAULTS.memoryCriticalMb,
    );
    const memoryWarningMb = numEnv(
      "MONITOR_MEMORY_WARNING_MB",
      positiveNumber(options.memoryWarningMb) || Math.max(1, Math.floor(memoryCriticalMb * 0.8)),
    );
    return {
      instanceMemoryMb: instanceMemoryMb || null,
      memoryWarningMb,
      memoryCriticalMb,
      thresholdMode: "explicit",
    };
  }

  if (instanceMemoryMb >= 1024) {
    const memoryCriticalMb = Math.max(
      512,
      Math.floor(instanceMemoryMb * (options.memoryCriticalFraction || DEFAULTS.memoryCriticalFraction)),
    );
    const memoryWarningMb = numEnv(
      "MONITOR_MEMORY_WARNING_MB",
      positiveNumber(options.memoryWarningMb)
        || Math.max(384, Math.floor(instanceMemoryMb * (options.memoryWarningFraction || DEFAULTS.memoryWarningFraction))),
    );
    return {
      instanceMemoryMb,
      memoryWarningMb: Math.min(memoryWarningMb, memoryCriticalMb - 1),
      memoryCriticalMb,
      thresholdMode: "instance-percent",
    };
  }

  return {
    instanceMemoryMb: instanceMemoryMb || null,
    memoryWarningMb: numEnv(
      "MONITOR_MEMORY_WARNING_MB",
      positiveNumber(options.memoryWarningMb) || DEFAULTS.memoryWarningMb,
    ),
    memoryCriticalMb: DEFAULTS.memoryCriticalMb,
    thresholdMode: instanceMemoryMb ? "starter-absolute" : "legacy-absolute",
  };
}

/**
 * Canonical threshold classifier.
 * Below warning → healthy; at/above warning → warning; at/above critical → critical;
 * missing/non-finite → unknown (never healthy).
 */
function classifyThreshold(value, { warningAt, criticalAt } = {}) {
  if (value == null || !Number.isFinite(Number(value))) {
    return { state: "unknown", severity: "unknown", ok: false };
  }
  const n = Number(value);
  const critical = Number(criticalAt);
  const warning = Number(warningAt);
  if (Number.isFinite(critical) && n >= critical) {
    return { state: "critical", severity: "critical", ok: false };
  }
  if (Number.isFinite(warning) && n >= warning) {
    return { state: "warning", severity: "warning", ok: false };
  }
  return { state: "healthy", severity: "ok", ok: true };
}

function aggregateOverall(checks = []) {
  const list = Array.isArray(checks) ? checks : [];
  if (!list.length) return "unknown";
  const stateOf = (c) => String(c?.state || c?.status || (c?.ok ? "healthy" : "") || c?.severity || "");
  if (list.some((c) => ["critical"].includes(stateOf(c)) || c.severity === "critical")) {
    return "critical";
  }
  if (list.some((c) => ["unknown", "not-verified"].includes(stateOf(c)) || c.severity === "unknown")) {
    return "unknown";
  }
  if (list.some((c) => ["warning", "attention", "not-configured"].includes(stateOf(c)) || c.severity === "warning")) {
    return "warning";
  }
  if (list.every((c) => c.ok === true || ["healthy", "working", "ok"].includes(stateOf(c)))) {
    return "healthy";
  }
  return "unknown";
}

function createProductionMonitoring(options = {}) {
  const memoryThresholds = resolveMemoryThresholds(options);
  const cfg = {
    windowMs: numEnv("MONITOR_WINDOW_MS", options.windowMs || DEFAULTS.windowMs),
    errorSpikeCount: numEnv("MONITOR_5XX_COUNT", options.errorSpikeCount || DEFAULTS.errorSpikeCount),
    errorSpikeRate: Number(process.env.MONITOR_5XX_RATE || options.errorSpikeRate || DEFAULTS.errorSpikeRate),
    memoryWarningMb: memoryThresholds.memoryWarningMb,
    memoryCriticalMb: memoryThresholds.memoryCriticalMb,
    instanceMemoryMb: memoryThresholds.instanceMemoryMb,
    memoryThresholdMode: memoryThresholds.thresholdMode,
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
    const maxOldSpaceMatch = String(process.env.NODE_OPTIONS || "").match(/--max-old-space-size=(\d+)/);
    const maxOldSpaceMb = maxOldSpaceMatch ? Number(maxOldSpaceMatch[1]) : null;
    const instanceMemoryMb = cfg.instanceMemoryMb || null;
    const pctOfInstance = instanceMemoryMb
      ? Math.round((rssMb / instanceMemoryMb) * 1000) / 10
      : null;
    return {
      heapUsedMb,
      rssMb,
      maxOldSpaceMb,
      instanceMemoryMb,
      pctOfInstance,
      warningMb: cfg.memoryWarningMb,
      criticalMb: cfg.memoryCriticalMb,
      thresholdMode: cfg.memoryThresholdMode,
    };
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

  function makeCheck({
    id,
    label,
    state,
    detail,
    value = null,
    recommendedAction = "",
  }) {
    const normalized = String(state || "unknown");
    const ok = normalized === "healthy" || normalized === "working";
    let severity = "ok";
    let status = "working";
    if (normalized === "critical") {
      severity = "critical";
      status = "critical";
    } else if (normalized === "warning" || normalized === "attention") {
      severity = "warning";
      status = "warning";
    } else if (normalized === "not-configured") {
      severity = "warning";
      status = "not-configured";
    } else if (normalized === "unknown" || normalized === "not-verified") {
      severity = "unknown";
      status = "unknown";
    } else if (normalized === "healthy" || normalized === "working") {
      severity = "ok";
      status = "working";
    }
    return {
      id,
      label,
      ok,
      state: ok ? "healthy" : normalized,
      severity,
      status,
      detail: String(detail || ""),
      recommendedAction: String(recommendedAction || ""),
      value,
    };
  }

  /**
   * @param {object} deps
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
    const mem = typeof deps.getMemoryStats === "function"
      ? { ...memoryStats(), ...(deps.getMemoryStats() || {}) }
      : memoryStats();
    const meta = metaStats(store, metaConfig);
    prune(webhookFailures, cfg.webhookFailWindowMs);
    const recentWebhookFails = webhookFailures.length;

    const websiteOk = hints.websiteOk !== false;
    const stripeWebhookConfigured = hints.stripeWebhookSecretConfigured;
    const stripeKeysConfigured = hints.stripeKeysConfigured;

    const rssClass = classifyThreshold(mem.rssMb, {
      warningAt: cfg.memoryWarningMb,
      criticalAt: cfg.memoryCriticalMb,
    });

    const checks = [
      makeCheck({
        id: "website_health",
        label: "Website health check",
        state: websiteOk ? "healthy" : "critical",
        detail: websiteOk ? "Process is serving /api/health." : "Website health check failed.",
        recommendedAction: websiteOk ? "" : "Inspect process logs and redeploy if /api/health stays down.",
      }),
      makeCheck({
        id: "database",
        label: "Database availability",
        state: databaseProvider === "local-json"
          ? "healthy"
          : (databaseReady ? "healthy" : "critical"),
        detail: databaseProvider === "local-json"
          ? "Local JSON store (dev)."
          : (databaseReady ? "Postgres connection ready." : "Database is unavailable."),
        value: { provider: databaseProvider, ready: databaseReady },
        recommendedAction: databaseReady || databaseProvider === "local-json"
          ? ""
          : "Check DATABASE_URL / Postgres readiness on Render and recent deploy logs.",
      }),
      (() => {
        if (stripeWebhookConfigured === false) {
          return makeCheck({
            id: "stripe_webhooks",
            label: "Stripe webhook health",
            state: "not-configured",
            detail: "Stripe webhook secret is not configured. Zero recorded failures does not mean webhooks are working.",
            value: { configured: false, recentFailures: recentWebhookFails },
            recommendedAction: "Set STRIPE_WEBHOOK_SECRET after creating the Stripe webhook endpoint.",
          });
        }
        if (stripeWebhookConfigured == null && hints.stripeVerificationUnavailable) {
          return makeCheck({
            id: "stripe_webhooks",
            label: "Stripe webhook health",
            state: "unknown",
            detail: "Unable to verify Stripe webhook configuration.",
            value: { configured: null, recentFailures: recentWebhookFails },
            recommendedAction: "Retry System Health refresh. If this persists, check admin auth and billing-readiness.",
          });
        }
        if (recentWebhookFails > 0) {
          return makeCheck({
            id: "stripe_webhooks",
            label: "Stripe webhook health",
            state: "critical",
            detail: `Configured but failing: ${recentWebhookFails} webhook failure(s) in the last ${Math.round(cfg.webhookFailWindowMs / 60000)} minutes. Latest: ${webhookFailures[webhookFailures.length - 1]?.type || "unknown"}.`,
            value: { configured: true, recentFailures: recentWebhookFails, latest: webhookFailures.slice(-3) },
            recommendedAction: "Open Stripe Dashboard → Webhooks, inspect failed deliveries, and verify STRIPE_WEBHOOK_SECRET matches the endpoint.",
          });
        }
        if (stripeWebhookConfigured === true) {
          return makeCheck({
            id: "stripe_webhooks",
            label: "Stripe webhook health",
            state: "healthy",
            detail: `Configured and healthy: no webhook processing failures in the last ${Math.round(cfg.webhookFailWindowMs / 60000)} minutes.`,
            value: { configured: true, recentFailures: 0 },
          });
        }
        // Legacy callers without hints — treat zero failures as unknown, never healthy.
        return makeCheck({
          id: "stripe_webhooks",
          label: "Stripe webhook health",
          state: "unknown",
          detail: "Unable to verify whether the Stripe webhook secret is configured.",
          value: { configured: null, recentFailures: recentWebhookFails },
          recommendedAction: "Confirm STRIPE_WEBHOOK_SECRET is set in the production environment.",
        });
      })(),
      (() => {
        if (stripeKeysConfigured === false) {
          return makeCheck({
            id: "stripe_api_keys",
            label: "Stripe API keys",
            state: "not-configured",
            detail: "Stripe API keys are missing.",
            recommendedAction: "Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY (or price env vars) for checkout.",
          });
        }
        if (stripeKeysConfigured === true) {
          return makeCheck({
            id: "stripe_api_keys",
            label: "Stripe API keys",
            state: "healthy",
            detail: "Configured and healthy: Stripe API keys are present for checkout.",
          });
        }
        return makeCheck({
          id: "stripe_api_keys",
          label: "Stripe API keys",
          state: "unknown",
          detail: "Unable to verify Stripe API key configuration from monitoring hints.",
          recommendedAction: "Open Billing readiness or refresh System Health.",
        });
      })(),
      (() => {
        if (!meta.pixelConfigured && !meta.capiConfigured) {
          return makeCheck({
            id: "meta_tracking",
            label: "Meta Pixel / CAPI events",
            state: "not-configured",
            detail: "Meta tracking is not configured.",
            value: meta,
          });
        }
        if (meta.recentFailCount >= 5) {
          return makeCheck({
            id: "meta_tracking",
            label: "Meta Pixel / CAPI events",
            state: "critical",
            detail: `${meta.recentFailCount} CAPI failures in the monitoring window.`,
            value: meta,
            recommendedAction: "Inspect Meta CAPI credentials and recent delivery errors.",
          });
        }
        if (meta.ageHours == null) {
          return makeCheck({
            id: "meta_tracking",
            label: "Meta Pixel / CAPI events",
            state: "warning",
            detail: "Configured, but no successful delivery logged yet.",
            value: meta,
          });
        }
        if (meta.ageHours > meta.silenceHours) {
          return makeCheck({
            id: "meta_tracking",
            label: "Meta Pixel / CAPI events",
            state: "warning",
            detail: `No successful Meta delivery for ${meta.ageHours.toFixed(1)} hours (threshold ${meta.silenceHours}h).`,
            value: meta,
          });
        }
        return makeCheck({
          id: "meta_tracking",
          label: "Meta Pixel / CAPI events",
          state: "healthy",
          detail: `Last successful delivery ${meta.ageHours.toFixed(1)}h ago. Pixel ${meta.pixelEnabled ? "on" : "off"}, CAPI ${meta.capiEnabled ? "on" : "off"}.`,
          value: meta,
        });
      })(),
      (() => {
        if (http.total === 0) {
          return makeCheck({
            id: "error_rate_5xx",
            label: "Error rate (5xx)",
            state: "healthy",
            detail: `No sampled requests in the last ${http.windowMinutes} minutes.`,
            value: http,
          });
        }
        const spiked = http.failed5xx >= cfg.errorSpikeCount || http.rate >= cfg.errorSpikeRate;
        return makeCheck({
          id: "error_rate_5xx",
          label: "Error rate (5xx)",
          state: spiked ? "critical" : "healthy",
          detail: `${http.failed5xx}/${http.total} requests were 5xx (${(http.rate * 100).toFixed(1)}%) in ${http.windowMinutes}m.`,
          value: http,
          recommendedAction: spiked ? "Inspect recent 5xx paths in logs and roll back the last deploy if errors spiked after release." : "",
        });
      })(),
      (() => {
        if (rssClass.state === "unknown") {
          return makeCheck({
            id: "memory",
            label: "Memory usage",
            state: "unknown",
            detail: "Unable to verify process memory metrics.",
            value: mem,
            recommendedAction: "Retry System Health. If memory metrics stay unavailable, inspect the Node process on Render.",
          });
        }
        const instancePart = mem.instanceMemoryMb
          ? ` · ${mem.pctOfInstance != null ? `${mem.pctOfInstance}% of` : "of"} ${mem.instanceMemoryMb} MB instance`
          : "";
        const heapCapPart = mem.maxOldSpaceMb != null
          ? ` · max-old-space ${mem.maxOldSpaceMb} MB`
          : "";
        const detail = `RSS ${mem.rssMb} MB · Heap ${mem.heapUsedMb} MB${instancePart} · warning ≥ ${cfg.memoryWarningMb} MB · critical ≥ ${cfg.memoryCriticalMb} MB${heapCapPart}.`;
        if (rssClass.state === "critical") {
          return makeCheck({
            id: "memory",
            label: "Memory usage",
            state: "critical",
            detail: `${detail} RSS is at or above the critical threshold.`,
            value: mem,
            recommendedAction: mem.instanceMemoryMb && mem.rssMb < Math.floor(mem.instanceMemoryMb * 0.5)
              ? "Thresholds may be miscalibrated for this instance size. Confirm MONITOR_INSTANCE_MEMORY_MB matches the Render plan, then investigate retained store/curriculum payloads."
              : "Restart the web service on Render, then investigate memory growth (large curriculum payloads, leaked caches, full-store clones). Consider raising the instance size only if RSS stays near the instance limit after optimization.",
          });
        }
        if (rssClass.state === "warning") {
          return makeCheck({
            id: "memory",
            label: "Memory usage",
            state: "warning",
            detail: `${detail} RSS is at or above the warning threshold.`,
            value: mem,
            recommendedAction: "Monitor RSS over the next hour. Avoid large admin curriculum imports until memory drops below the warning threshold.",
          });
        }
        return makeCheck({
          id: "memory",
          label: "Memory usage",
          state: "healthy",
          detail,
          value: mem,
        });
      })(),
      (() => {
        if (dbSizeMb == null) {
          return makeCheck({
            id: "database_storage",
            label: "Database storage",
            state: databaseProvider === "postgres" ? "unknown" : "healthy",
            detail: databaseProvider === "postgres"
              ? "Unable to verify database size yet."
              : "Storage size check applies to Postgres production.",
            value: { dbSizeMb, criticalMb: cfg.dbSizeCriticalMb },
          });
        }
        const storageClass = classifyThreshold(dbSizeMb, {
          warningAt: Math.floor(cfg.dbSizeCriticalMb * 0.85),
          criticalAt: cfg.dbSizeCriticalMb,
        });
        return makeCheck({
          id: "database_storage",
          label: "Database storage",
          state: storageClass.state,
          detail: `Database size ${Math.round(dbSizeMb)} MB (warning ≥ ${Math.floor(cfg.dbSizeCriticalMb * 0.85)} MB; critical ≥ ${cfg.dbSizeCriticalMb} MB).`,
          value: { dbSizeMb, criticalMb: cfg.dbSizeCriticalMb },
          recommendedAction: storageClass.state === "critical"
            ? "Increase Postgres storage or prune non-essential analytics retention after owner approval."
            : "",
        });
      })(),
    ];

    const overall = aggregateOverall(checks);
    const snapshot = {
      ok: overall === "healthy",
      updatedAt: new Date().toISOString(),
      overall,
      checks,
      alerts: {
        enabled: cfg.alertsEnabled,
        cooldownMinutes: Math.round(cfg.alertCooldownMs / 60000),
        lastAlertAt: { ...lastAlertAt },
        activeCritical: checks.filter((c) => c.state === "critical").map((c) => c.id),
      },
      config: {
        windowMinutes: Math.round(cfg.windowMs / 60000),
        memoryWarningMb: cfg.memoryWarningMb,
        memoryCriticalMb: cfg.memoryCriticalMb,
        instanceMemoryMb: cfg.instanceMemoryMb,
        memoryThresholdMode: cfg.memoryThresholdMode,
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
      if (check.state !== "critical" && check.severity !== "critical") return false;
      const prev = lastAlertAt[check.id] || 0;
      return (now - prev) >= cfg.alertCooldownMs;
    });
  }

  function markAlertsSent(checks) {
    const now = Date.now();
    for (const check of checks || []) lastAlertAt[check.id] = now;
  }

  function formatAlertEmail(snapshot, dueChecks, siteUrl = "") {
    const lines = dueChecks.map((check) => {
      const action = check.recommendedAction ? ` Action: ${check.recommendedAction}` : "";
      return `- ${check.label}: ${check.detail}${action}`;
    });
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
  classifyThreshold,
  aggregateOverall,
  resolveMemoryThresholds,
  createProductionMonitoring,
};
