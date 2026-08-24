# Conversion Intelligence — Postgres index migration

**Status:** Documented only — DO NOT execute against production without owner review.

The Conversion Intelligence feature reuses the existing `llh_analytics_events` table and `llh_store` JSON blob. No new tables are required for initial launch.

## Optional performance indexes

If admin Conversion Intelligence queries become slow at scale, apply these indexes on production Postgres:

```sql
-- File: migrations/20260824-conversion-intelligence-indexes.sql

CREATE INDEX IF NOT EXISTS llh_analytics_events_name_user_created_idx
  ON llh_analytics_events (name, user_email, created_at DESC);

CREATE INDEX IF NOT EXISTS llh_analytics_events_attribution_source_idx
  ON llh_analytics_events ((attribution->>'source'), created_at DESC)
  WHERE attribution->>'source' IS NOT NULL AND attribution->>'source' <> '';

CREATE INDEX IF NOT EXISTS llh_analytics_events_detail_resource_idx
  ON llh_analytics_events ((detail->>'resourceId'), created_at DESC)
  WHERE detail->>'resourceId' IS NOT NULL AND detail->>'resourceId' <> '';
```

## Existing indexes (already in analytics-store.js)

- `llh_analytics_events_created_at_idx`
- `llh_analytics_events_user_created_idx`
- `llh_analytics_events_name_created_idx`

## Data model notes

Events are stored in `llh_analytics_events` with:

| Field | Purpose |
|-------|---------|
| `name` | Canonical or legacy event name |
| `user_email` | Actor email when signed in |
| `visitor_id` | Anonymous visitor key |
| `session_id` | Browser session |
| `detail` | JSONB — resourceId, title, ctaLocation, featureType (no sensitive data) |
| `attribution` | JSONB — utm_source, utm_medium, utm_campaign, source, referrer |
| `created_at` | Event timestamp |

User-level conversion state is read from `llh_store.users` (plan, stripeSubscriptionStatus, firstPaidInvoiceAt, attribution).
