# Store write route audit (PR #385)

This document answers review item **#2**: which API paths still trigger an immediate `llh_store` full-document upsert, which use debouncing, and which use analytics-table inserts only.

## Write primitives

| Primitive | Postgres behavior | Success semantics |
|-----------|-------------------|-------------------|
| `insertAnalyticsEvent` | `INSERT` into `llh_analytics_events` (`ON CONFLICT DO NOTHING`) | Optional — failures return `tracking: false` for page views |
| `writeStore()` (default) | Immediate enqueue → single chained full-store upsert | Fire-and-forget; used for background/internal paths |
| `writeStore({ debounced: true, immediate: false })` | Coalesced upsert after `STORE_WRITE_DEBOUNCE_MS` (2.5s) | **Only** optional `lastSeenAt` from logged-in `page_view` |
| `writeStoreAsync()` / `respondAfterPersist()` | Await durable upsert before HTTP 200 | Returns **503** if Postgres not ready or write fails |

Production never treats Render ephemeral `launch-store.json` as durable (`isProductionPostgresDeployment()`).

---

## Analytics (`POST /api/analytics/event`)

| Event | `llh_analytics_events` | `llh_store` blob | Notes |
|-------|------------------------|------------------|-------|
| `page_view`, `website_visit`, `event` | **Yes** (always in Postgres mode) | **No** for analytics array | Logged-in users may debounce `lastSeenAt` only |
| `account_signup_complete`, `account_login_complete` | **Yes** | **Yes** (`writeStoreAsync`) — user fields only | Analytics row never appended to blob in Postgres mode |
| `checkout_success`, `subscription_canceled` | **Yes** | **Yes** (`writeStoreAsync`) — user + billing patch | Same as above |
| Other analytics names | **Yes** when Postgres ready | No unless user patch events above | Failures are non-blocking unless user/billing patch |

**Confirmed:** login, signup, checkout, and subscription analytics do **not** append to `store.analyticsEvents` in Postgres mode and therefore do **not** trigger a 17 MB rewrite for the analytics payload itself.

---

## Debouncing scope (review item #4)

**The 2.5s debounce applies only to:**

- `lastSeenAt` / analytics user touch from **logged-in** `page_view` / `website_visit` via `scheduleDebouncedPostgresStoreWrite()`.

**The debounce does NOT apply to:**

- Messages, forms, drafts, child profiles (`POST /api/child-data`), schedule saves, daily logs (client-synced program child data + schedule), admin curriculum edits, Stripe webhooks, account signup/login, or billing mutations — these use immediate `writeStore()` or awaited `writeStoreAsync()`.

---

## Routes with awaited durable write (`writeStoreAsync` / `respondAfterPersist`) — fail 503 if not saved

These return success only after Postgres confirms the upsert:

### Account & auth
- `POST /api/account/profile` (signup / profile sync)
- `POST /api/auth/password-login`
- `POST /api/auth/password-reset/complete`
- `POST /api/auth/complete-forced-password-change`
- Password-reset / verification token persistence (before email send)

### User program data
- `POST /api/child-data`
- `PUT /api/schedule`, schedule item upsert/delete, week assign, migrate

### Messaging & forms
- `POST /api/messages/reply` (member)
- `POST /api/admin/messages/send` (admin broadcast/private)
- `POST /api/support-ticket`, `POST /api/support-ticket-update`
- `POST /api/bug-report`, `POST /api/feature-request`, `POST /api/feedback`
- `POST /api/admin/reply`
- Comms API: drafts save/delete, archive conversation, templates, tags, admin inbox archive, automations (`persistStoreOrFail`)

### Admin curriculum & site content
- Curriculum import/save/publish/visibility paths (existing `writeStoreAsync`)
- `POST /api/admin/site-content` save
- `POST /api/admin/free-starter-library` (confirm save)
- Admin AI prompts/settings saves

### Billing (critical)
- Stripe webhook handler paths use `writeStore(..., { immediate: true })` inside webhook processing (not debounced)
- Checkout session completion handlers using `writeStoreAsync`

### Store admin
- Store restore, Firebase hybrid recovery apply, logical backup-triggered writes

---

## Routes with immediate full-store write (`writeStore()` default) — still fire-and-forget

These enqueue an immediate upsert but **do not** await it before HTTP 200 unless noted above. Grouped by risk:

### Critical / user-facing (still fire-and-forget — known follow-up)
- Staff invite create/revoke/accept (`/api/staff-invites/*`)
- Some admin submission status updates (bug/feature/lesson-plan admin update) after notification fan-out
- Admin announcements create/update
- Admin message draft save (legacy path)
- Mark notifications read (`POST` admin notifications)
- Program migration admin apply/rollback

### Billing & founding (immediate by design)
- Founding claim/release/reservation (`writeStore({ immediate: true })` on claim paths)
- `appendBillingEvent` helper (Stripe-adjacent deduped billing log)
- Stripe webhook inner saves (`immediate: true`)
- Promo redemption recording

### Background / best-effort (acceptable fire-and-forget)
- Admin alert emission side-effects
- Email engagement scheduler state patches
- Push notification delivery bookkeeping
- `pauseEmailAutomationsInStore` on boot
- VAPID key persistence callback
- Curriculum restore audit append (rare admin)
- AI usage counter increment
- `ensureFoundingMemberUserStubs` reconciliation

### Optional / low priority
- `POST /api/analytics/event` — debounced `lastSeenAt` only (see above)
- Notification mark-read for members (non-critical UX)

---

## Graceful shutdown (review item #5)

On **SIGTERM** / **SIGINT** (Render deploy drain):

1. `flushPendingStoreWritesForShutdown()` runs
2. `flushDebouncedPostgresStoreWrite()` — flushes any pending debounced `lastSeenAt` write
3. Awaits `postgresWriteChain` to finish in-flight upserts
4. Process exits

Registered once after storage boot in `initializeStorage()`.

---

## Retry idempotency (review item #6)

| Domain | Mechanism |
|--------|-----------|
| Analytics rows | `ON CONFLICT (id) DO NOTHING` on event id |
| Full-store upsert | Replaces same `llh_store` document; generation counter skips stale writes |
| Stripe webhooks | Signature verification + event-type handlers; subscription state derived from Stripe object ids (no duplicate Stripe API calls on retry) |
| Billing event log | `appendBillingEvent` 5-minute dedupe window per email/type/plan |
| Message send | `sendFingerprintKey` + `isDuplicateSend` blocks double-submit within window |
| Account creation | Upsert by email key — retries overwrite same user row |
| Email campaigns | Postgres `llh_email_campaign_deliveries` unique `(campaign_id, email)` |

Postgres write retries (`POSTGRES_STORE_WRITE_RETRY_COUNT`, default 4) re-attempt the **same** serialized payload, not duplicate business actions.

---

## Analytics table indexes & retention (review item #7)

**Table:** `llh_analytics_events`

**Indexes:**
- `llh_analytics_events_created_at_idx` — `(created_at DESC)`
- `llh_analytics_events_user_created_idx` — `(user_email, created_at DESC)`
- `llh_analytics_events_name_created_idx` — `(name, created_at DESC)`

**Retention** (`startAnalyticsRetentionScheduler`, hourly after 60s boot delay):
- Delete rows older than `ANALYTICS_TABLE_RETENTION_DAYS` (default **90**, env override)
- Cap total rows at `ANALYTICS_TABLE_MAX_ROWS` (default **50,000**) by deleting oldest beyond offset

Admin analytics reads merge Postgres table rows (recent) with any legacy blob `analyticsEvents` during transition.

---

## False success prevention (review item #8)

In production Postgres mode:

- `writeStoreAsync` / `respondAfterPersist` **throw** → **503** when `databaseReady` is false or upsert fails
- Critical routes listed above use these helpers
- Optional tracking (`page_view` table insert failure) returns **200** with `tracking: false`
- Boot gate: API routes return **503** until `initializeStorage()` completes (`storageBootReady`)

**Remaining gap:** some secondary admin paths still use fire-and-forget `writeStore()` (listed above). They do not claim durable success explicitly but can return 200 before the chain completes; these are documented for a follow-up pass.
