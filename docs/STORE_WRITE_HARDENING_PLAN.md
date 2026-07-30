# Store write hardening — investigation & rollout plan

**Status:** PR #385 (`cursor/store-write-hardening-9ad1`) — **not merged, not deployed**  
**Date:** 2026-07-30

## Confirmed root cause

Production stores **all launch data in one ~17 MB JSONB document** (`llh_store.data`). Every full-store `writeStore()` serializes and upserts the **entire** document.

High-frequency paths (especially `POST /api/analytics/event` for `page_view` / `website_visit`) were triggering full-store writes on **every page view**. Render Postgres logs showed ~3s average upserts, long checkpoints, and intermittent `ECONNREFUSED` leading to degraded mode.

**This is not a billing/plan issue** — production is on Render Standard web + Basic 1 GB Postgres.

---

## What this PR changes

### 1. Analytics isolation
- `page_view` / `website_visit` / generic `event` → `INSERT` into `llh_analytics_events` only
- Login, signup, checkout, subscription analytics → table row **plus** targeted user/billing patch via `writeStoreAsync` (never append to blob `analyticsEvents` in Postgres mode)

### 2. Debouncing — **narrow scope**
- **Only** optional `lastSeenAt` updates from logged-in page views use `scheduleDebouncedPostgresStoreWrite()` (2.5s, `STORE_WRITE_DEBOUNCE_MS`)
- Default `writeStore()` is **immediate** again — messages, forms, child data, schedule, admin curriculum are **not** debounced

### 3. Critical vs optional failure modes
- **503** for account, billing patches, messages, forms, child data, schedule, admin saves when Postgres cannot persist
- **200 + `tracking: false`** for optional analytics table insert failures on page views

### 4. Graceful shutdown flush
- SIGTERM/SIGINT → `flushPendingStoreWritesForShutdown()` flushes debounced writes and awaits the write chain (Render deploy drain)

### 5. Retry, logging, metrics
- Exponential backoff on full-store upsert (4 attempts)
- `[store-persistence]` structured logs
- `storeHealthSnapshot().storeWrites` metrics

### 6. Analytics retention
- Indexes on `created_at`, `(user_email, created_at)`, `(name, created_at)`
- Scheduled prune: 90-day default age, 50k row cap

See also: `docs/STORE_WRITE_ROUTE_AUDIT.md` for per-route classification.

---

## Files changed

| File | Change |
|------|--------|
| `server/analytics-store.js` | Analytics table, indexes, retention prune, patch event sets |
| `server/store-write-metrics.js` | In-process write metrics |
| `server/index.js` | Analytics handler, debounce scope, shutdown flush, `respondAfterPersist`, critical route awaits |
| `server/comms-api.js` | `persistStoreOrFail` for drafts/templates/tags/automations |
| `scripts/mock-pg-preload.js` | Mock `connect()`, analytics table + prune |
| `scripts/test-store-write-debounce.js` | Regression tests |
| `scripts/test-store-write-degraded.js` | Degraded-mode tests |
| `docs/STORE_WRITE_ROUTE_AUDIT.md` | Per-route write classification |
| `docs/STORE_WRITE_HARDENING_PLAN.md` | This document |

---

## Backup & rollback (before production deploy)

1. Render Dashboard → Postgres → **manual backup** (note ID + timestamp)
2. Admin → store export download
3. **Pause auto-deploy** until verification passes

### Rollback
- Redeploy previous green build or revert merge
- Optional: `DROP TABLE llh_analytics_events` (analytics falls back to blob in local-json mode only; production should redeploy fix instead)

---

## Tests before merge

```bash
npm run check
npm run test:postgres-pool-hardening
npm run test:store-write-race
npm run test:store-write-debounce
npm run test:store-write-degraded
npm run test:store-safety
npm run test:release-candidate-regression   # full existing suite gate
```

---

## Post-deploy verification checklist

Run after deploy (pause auto-deploy until complete). Check admin **store-health** → `storeWrites` during browsing.

### Infrastructure
- [ ] `GET /api/launch-readiness` → `database.ready: true`
- [ ] `GET /api/health` → Postgres connected, not degraded
- [ ] Admin store-health → `storeWrites.analyticsTableInserts` increases on page views; `fullStoreWritesSucceeded` does **not** spike per page view
- [ ] Render logs: no burst of `[store-persistence] full_store_write_start` on normal browsing

### Account
- [ ] **Signup** — new account, profile fields saved, survives hard refresh
- [ ] **Login** — password login works; `account_login_complete` does not spike full-store writes
- [ ] **Password reset** — request email, complete reset, login with new password

### Lessons & favorites
- [ ] Free and Pro users can open lesson library and viewer
- [ ] Add/remove **favorite** — persists after refresh
- [ ] Pro lesson access matches plan

### Messaging
- [ ] Member sends message → appears in admin inbox
- [ ] Admin replies → member sees reply
- [ ] Archive conversation works

### Forms & signatures
- [ ] Submit support ticket / feedback / bug report — saved and visible in admin
- [ ] Form draft save (comms drafts API) survives refresh
- [ ] Provider form with signature fields saves/prints as expected

### Child profiles & daily logs
- [ ] **Child profile** data (`/api/child-data`) saves and reloads
- [ ] **Daily log** / attendance entries persist for linked program (client + server sync)

### Billing
- [ ] Stripe test checkout completes; plan updates on account
- [ ] Webhook endpoint accepts signed test event (Stripe CLI or dashboard)
- [ ] Subscription cancel flow updates access

### Admin
- [ ] Curriculum lesson edit + publish persists
- [ ] Site content / hero save persists
- [ ] Free Starter Library save (if used)

### Write-storm regression
- [ ] Browse 10+ lesson pages as guest and logged-in user
- [ ] Confirm **zero** full-store blob upserts attributable only to `page_view` (metrics + logs)
- [ ] Optional: `lastSeenAt` may produce at most one debounced upsert per 2.5s window when logged in

---

## Remaining follow-up (not blocking this hotfix)

- Convert remaining fire-and-forget admin paths (staff invites, some status-update handlers) to `writeStoreAsync`
- Phase 2+ store split per `docs/STORE_SPLIT_FOLLOWUP.md` (curriculum tables, messaging tables)
