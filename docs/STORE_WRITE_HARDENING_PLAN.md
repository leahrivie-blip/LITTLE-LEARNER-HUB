# Store write hardening — investigation & rollout plan

**Status:** Implemented on branch `cursor/store-write-hardening-9ad1` (not deployed)  
**Date:** 2026-07-30

## Confirmed root cause

Production stores **all launch data in one ~17 MB JSONB document** (`llh_store.data`). Every `writeStore()` call serializes and upserts the **entire** document.

High-frequency paths (especially `POST /api/analytics/event` for `page_view` / `website_visit`) were triggering full-store writes on **every page view**. Render Postgres logs showed:

| Metric | Before fix (production) |
|--------|-------------------------|
| Full-store upsert duration | **~3 s average**, up to **~4.8 s** |
| Checkpoint duration | **157–270 s** (DB briefly refuses connections) |
| Safety alerts | 3× `postgres_disconnect` in 24 h |
| Degraded-mode writes | 30+ “local JSON only” log lines |

When Postgres checkpoints or restarts, connections fail with `ECONNREFUSED` / “not yet accepting connections”. The app entered **degraded mode**: in-memory + ephemeral local file, while still returning **200 OK** on many routes.

**This is not a billing/plan issue** — production is already on Render **Standard** web + **Basic 1 GB** Postgres.

---

## Files changed (this branch)

| File | Change |
|------|--------|
| `server/analytics-store.js` | **New** — `llh_analytics_events` table, row inserts |
| `server/store-write-metrics.js` | **New** — in-process write metrics |
| `server/index.js` | Debounced writes, retry/backoff, degraded-mode throws, analytics path, metrics in store-health |
| `scripts/mock-pg-preload.js` | Mock `connect()`, analytics table |
| `scripts/test-store-write-debounce.js` | **New** regression test |
| `docs/STORE_WRITE_HARDENING_PLAN.md` | This document |

---

## Implementation summary

1. **Analytics isolation (Phase 1 of `STORE_SPLIT_FOLLOWUP.md`)**  
   `page_view` / `website_visit` → `INSERT` into `llh_analytics_events` only. No `llh_store` rewrite.

2. **Write debouncing** (`STORE_WRITE_DEBOUNCE_MS`, default **2500 ms**)  
   Fire-and-forget `writeStore()` coalesces rapid changes into one upsert.  
   Critical paths use `writeStore(store, { immediate: true })` (Founding, Stripe webhooks).

3. **Single write chain** (existing `postgresWriteChain` + generation counter) — unchanged, still enforced.

4. **Retry with backoff** on full-store upsert (`POSTGRES_STORE_WRITE_RETRY_COUNT`, default **4**, delays 75→1200 ms).

5. **`writeStoreAsync` throws** when Postgres not ready — APIs return **503**, not false success.

6. **Production degraded mode** — no silent write to Render ephemeral `launch-store.json`.

7. **Logging** — `[store-persistence]` kinds: `full_store_write_start`, `debounced_flushed`, `write_retry`, `retry_success`, `failed_write`, `database_unavailable`, `ephemeral_only`.

8. **Metrics** — `storeHealthSnapshot().storeWrites` (counts, payload bytes, durations).

---

## Staged store-split plan (future — not in this deploy)

See `docs/STORE_SPLIT_FOLLOWUP.md`. Recommended order after this hotfix:

| Phase | Target | Risk |
|-------|--------|------|
| **1** | Analytics table (done in this branch) | Low |
| **2** | Curriculum tables (`llh_lesson_plans`, activities) | Medium — dual-read/write + backup |
| **3** | Messaging / notifications tables | Medium |
| **4** | Shrink `llh_store` to users + billing core | High — requires migration window |

Each phase: Render manual backup → admin store-export → feature flag → verify inventory counts → rollback via backup ID.

---

## Backup & rollback plan (before production deploy)

### Before deploy

1. Render Dashboard → **little-learner-hub-db** → **Backups** → create **manual backup**; note backup ID + timestamp.
2. Admin → store export download (secondary copy).
3. **Pause auto-deploy** on `LITTLE-LEARNER-HUB` until post-deploy verification passes.

### Deploy

1. Merge PR → single deploy to production.
2. On boot, `CREATE TABLE IF NOT EXISTS llh_analytics_events` runs automatically (no data migration required for existing blob analytics).

### Verify (15–30 min)

```bash
curl -sS https://littlelearnershubbyleah.com/api/launch-readiness
# database.ready must be true

# Admin store-health → storeWrites.analyticsTableInserts increasing, fullStoreWritesSucceeded stable/low
```

Watch Render logs for `[store-persistence]` — should **not** see full-store writes on every page view.

### Rollback

1. Render → **Manual Deploy** → previous green build **or** revert merge commit.
2. If schema issue only: drop `llh_analytics_events` (analytics falls back to blob array in store).
3. Restore Postgres from manual backup **only** if data corruption observed (unlikely — writes are additive).

---

## Remaining data-loss risks

| Risk | Mitigation |
|------|------------|
| Debounced non-critical writes lost on crash before flush | Acceptable for low-priority paths; critical uses `immediate` / `writeStoreAsync` |
| `lastSeenAt` up to 2.5 s stale for logged-in page views | Debounce window; acceptable vs DB overload |
| Legacy analytics in blob not copied to table | Admin analytics merges both sources |
| Long-term: curriculum still in blob | Phase 2 split (separate project) |
| Deploy during active admin edit | Existing risk — pause deploys during repair window |

---

## Tests to run before merge

```bash
npm run check
npm run test:postgres-pool-hardening
npm run test:store-write-race
NODE_ENV=test node scripts/test-store-write-debounce.js
npm run test:store-safety
```

Post-deploy: exercise login, signup, checkout webhook (Stripe test), admin curriculum save, messages, child profiles.
