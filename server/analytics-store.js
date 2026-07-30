/**
 * Append-only analytics events in Postgres — avoids rewriting the ~17MB llh_store blob
 * on every page_view / website_visit.
 */

const ANALYTICS_IMMEDIATE_STORE_EVENTS = new Set([
  "account_signup_complete",
  "account_login_complete",
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

const ANALYTICS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS llh_analytics_events_created_at_idx
  ON llh_analytics_events (created_at DESC)
`;

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
  await queryFn(ANALYTICS_INDEX_SQL, [], { label: "Postgres index llh_analytics_events" });
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

async function fetchRecentAnalyticsEvents(pool, queryFn, { limit = 10000, days = 120 } = {}) {
  const cappedLimit = Math.max(1, Math.min(25000, Number(limit) || 10000));
  const cappedDays = Math.max(1, Math.min(365, Number(days) || 120));
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

function requiresImmediateStoreWrite(eventName) {
  return ANALYTICS_IMMEDIATE_STORE_EVENTS.has(String(eventName || ""));
}

function isHighVolumeAnalyticsEvent(eventName) {
  const name = String(eventName || "");
  return name === "page_view"
    || name === "website_visit"
    || name === "event";
}

module.exports = {
  ANALYTICS_IMMEDIATE_STORE_EVENTS,
  initAnalyticsTable,
  insertAnalyticsEvent,
  fetchRecentAnalyticsEvents,
  requiresImmediateStoreWrite,
  isHighVolumeAnalyticsEvent,
  rowToEvent,
};
