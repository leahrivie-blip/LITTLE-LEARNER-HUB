/**
 * Append-only analytics events in Postgres — avoids rewriting the ~17MB llh_store blob
 * on every page_view / website_visit.
 *
 * Analytics rows are idempotent (ON CONFLICT DO NOTHING on event id).
 * User/billing side-effects for login/signup/checkout use separate store patches.
 */

/** Events that may update users / billing in llh_store — never the analytics array in Postgres mode. */
const ANALYTICS_USER_STORE_PATCH_EVENTS = new Set([
  "account_signup_complete",
  "account_login_complete",
  "checkout_success",
  "subscription_canceled",
]);

const ANALYTICS_BILLING_STORE_PATCH_EVENTS = new Set([
  "checkout_success",
  "subscription_canceled",
]);

const ANALYTICS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS llh_analytics_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_email TEXT NOT NULL DEFAULT '',
    visitor_id TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT '',
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
    referrer TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    ip_hash TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL
  )
`;

const ANALYTICS_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS llh_analytics_events_created_at_idx
   ON llh_analytics_events (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS llh_analytics_events_user_created_idx
   ON llh_analytics_events (user_email, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS llh_analytics_events_name_created_idx
   ON llh_analytics_events (name, created_at DESC)`,
];

function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    user: row.user_email || "",
    visitorId: row.visitor_id || "",
    sessionId: row.session_id || "",
    path: row.path || "",
    plan: row.plan || "",
    detail: row.detail && typeof row.detail === "object" ? row.detail : {},
    attribution: row.attribution && typeof row.attribution === "object" ? row.attribution : {},
    referrer: row.referrer || "",
    userAgent: row.user_agent || "",
    ipHash: row.ip_hash || "",
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at || ""),
  };
}

async function initAnalyticsTable(pool, queryFn) {
  await queryFn(ANALYTICS_TABLE_SQL, [], { label: "Postgres create llh_analytics_events" });
  for (const sql of ANALYTICS_INDEX_SQL) {
    await queryFn(sql, [], { label: "Postgres index llh_analytics_events" });
  }
}

async function insertAnalyticsEvent(pool, queryFn, event) {
  await queryFn(
    `INSERT INTO llh_analytics_events (
      id, name, user_email, visitor_id, session_id, path, plan,
      detail, attribution, referrer, user_agent, ip_hash, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13::timestamptz)
    ON CONFLICT (id) DO NOTHING`,
    [
      event.id,
      event.name,
      event.user || "",
      event.visitorId || "",
      event.sessionId || "",
      event.path || "",
      event.plan || "",
      JSON.stringify(event.detail || {}),
      JSON.stringify(event.attribution || {}),
      event.referrer || "",
      event.userAgent || "",
      event.ipHash || "",
      event.createdAt,
    ],
    { label: "Postgres insert analytics event" },
  );
}

async function fetchRecentAnalyticsEvents(pool, queryFn, { limit = 5000, days = 90 } = {}) {
  const cappedLimit = Math.max(1, Math.min(25000, Number(limit) || 5000));
  const cappedDays = Math.max(1, Math.min(365, Number(days) || 90));
  const result = await queryFn(
    `SELECT id, name, user_email, visitor_id, session_id, path, plan,
            detail, attribution, referrer, user_agent, ip_hash, created_at
     FROM llh_analytics_events
     WHERE created_at >= NOW() - ($2::text || ' days')::interval
     ORDER BY created_at DESC
     LIMIT $1`,
    [cappedLimit, String(cappedDays)],
    { label: "Postgres fetch analytics events" },
  );
  return (result.rows || []).map(rowToEvent).filter(Boolean);
}

async function pruneOldAnalyticsEvents(pool, queryFn, { retentionDays = 90, maxRows = 50000 } = {}) {
  const days = Math.max(30, Math.min(365, Number(retentionDays) || 90));
  const cap = Math.max(1000, Math.min(250000, Number(maxRows) || 50000));
  const byAge = await queryFn(
    `DELETE FROM llh_analytics_events
     WHERE created_at < NOW() - ($1::text || ' days')::interval`,
    [String(days)],
    { label: "Postgres prune analytics by age" },
  );
  const byCount = await queryFn(
    `DELETE FROM llh_analytics_events
     WHERE id IN (
       SELECT id FROM llh_analytics_events
       ORDER BY created_at DESC
       OFFSET $1
     )`,
    [cap],
    { label: "Postgres prune analytics by count" },
  );
  return {
    deletedByAge: byAge.rowCount || 0,
    deletedByCount: byCount.rowCount || 0,
    retentionDays: days,
    maxRows: cap,
  };
}

function requiresUserStorePatch(eventName) {
  return ANALYTICS_USER_STORE_PATCH_EVENTS.has(String(eventName || ""));
}

function requiresBillingStorePatch(eventName) {
  return ANALYTICS_BILLING_STORE_PATCH_EVENTS.has(String(eventName || ""));
}

function isHighVolumeAnalyticsEvent(eventName) {
  const name = String(eventName || "");
  return name === "page_view"
    || name === "website_visit"
    || name === "event";
}

/** @deprecated use requiresUserStorePatch */
function requiresImmediateStoreWrite(eventName) {
  return requiresUserStorePatch(eventName);
}

module.exports = {
  ANALYTICS_USER_STORE_PATCH_EVENTS,
  ANALYTICS_BILLING_STORE_PATCH_EVENTS,
  initAnalyticsTable,
  insertAnalyticsEvent,
  fetchRecentAnalyticsEvents,
  pruneOldAnalyticsEvents,
  requiresUserStorePatch,
  requiresBillingStorePatch,
  requiresImmediateStoreWrite,
  isHighVolumeAnalyticsEvent,
  rowToEvent,
};
