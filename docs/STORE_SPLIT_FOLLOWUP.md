# Follow-up: Split the single in-memory JSON store

**Status:** Planned (not in PR #366)  
**Why now:** Render OOM on Starter showed the current “one JSON document in RAM” model does not scale. Upgrading to **Standard (2 GB)** is an immediate stability fix, not the final architecture.

## Current model (today)

- Postgres table `llh_store` holds **one JSONB document** (`users`, `messages`, `siteContent.curriculum`, `analyticsEvents`, billing helpers, etc.).
- Node keeps that document in `storeCache`.
- Many paths `structuredClone` or `JSON.stringify` the **entire** document.
- Measured production size (2026-07-29): ~17 MB JSON (~9.5 MB analytics, ~6.2 MB curriculum).

PR #366 only **caps analytics history**. It does not change the document shape.

## Target model

Move growing / high-churn collections out of the shared blob so:

1. Curriculum imports no longer rewrite users/messages/subscriptions.
2. Analytics appends do not clone lesson plans.
3. Memory and write amplification stay proportional to the changed slice.

### Phase 1 — Analytics out (highest ROI)

- New table `llh_analytics_events` (or append-only partitioned table): `id`, `name`, `user_email`, `payload JSONB`, `created_at`.
- Write path: insert one row; **never** touch `llh_store`.
- Read path for admin analytics: SQL aggregations / recent window (e.g. 30–90 days), not “load 11k events into Node”.
- Keep a small rollup in `llh_store` only if the dashboard needs instant counters.
- Migration: copy last N events from `store.analyticsEvents`, then clear the array (or leave capped stub).

### Phase 2 — Curriculum out

- Tables (or one JSONB doc per plan):
  - `llh_lesson_plans`
  - `llh_curriculum_activities`
  - `llh_curriculum_series` (Family Connections collections)
- Admin import/publish updates only those rows.
- Public `/api/site-content` builds DTOs from queries (with short TTL cache), not from cloning the mega-document.
- Protect Family Connections and other collections with row-level updates + optimistic `updated_at`, not full-blob replace.

### Phase 3 — Sessions / messaging / notifications (already partly started)

- Admin sessions already moved to `llh_admin_sessions` (PR #335).
- Next: member sessions, notifications, message threads into dedicated tables (same pattern as admin sessions).
- Keeps login and inbox traffic off the curriculum blob.

### Phase 4 — Shrink `llh_store` to “account core”

Retain in the shared document only what must be atomic for billing/access:

- `users` (or later normalize)
- founding / promo inventory
- feature flags / site chrome

Everything high-volume becomes relational or side documents.

## Guardrails while migrating

- Keep inventory wipe guards (`assertSafePostgresStoreReplacement`) until curriculum is no longer in the blob.
- Dual-read / dual-write during each phase; feature-flag cutover.
- Never “reset” production by writing an empty default store.
- After each phase: verify Family Connections series IDs, lesson plan counts, Stripe membership fields, and message threads.

## Success metrics

- Process RSS well under instance RAM under import + admin load.
- Postgres write payload size per lesson import much smaller than the full store size.
- No OOM / unexpected restart emails on Standard during normal traffic.
- Curriculum Collections (Infant / Toddler / Preschool Family Connections) remain intact across deploys.

## Related docs

- `docs/RENDER_OOM_MEMORY.md` — immediate OOM cause + Standard upgrade
- `docs/audits/ADMIN_SESSION_STORAGE_PERFORMANCE_AUDIT.md` — prior clone/write amplification work
