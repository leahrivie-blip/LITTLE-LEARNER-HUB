# Store write route audit (PR #385)

This document answers review item **#2**: which API paths trigger an immediate `llh_store` full-document upsert, which use debouncing, and which use analytics-table inserts only.

## Write primitives

| Primitive | Postgres behavior | Success semantics |
|-----------|-------------------|-------------------|
| `insertAnalyticsEvent` | `INSERT` into `llh_analytics_events` (`ON CONFLICT DO NOTHING`) | Optional — failures return `tracking: false` for page views |
| `writeStore()` (default) | Immediate enqueue → single chained full-store upsert | **Internal/background only** — not used for HTTP success paths |
| `writeStore({ debounced: true, immediate: false })` | Coalesced upsert after `STORE_WRITE_DEBOUNCE_MS` (2.5s) | **Only** optional `lastSeenAt` from logged-in `page_view` |
| `writeStoreAsync()` / `persistStoreOr503()` / `respondAfterPersist()` | Await durable upsert before HTTP 200 | Returns **503** if Postgres not ready or write fails |

Production never treats Render ephemeral `launch-store.json` as durable (`isProductionPostgresDeployment()`).

---

## Analytics (`POST /api/analytics/event`)

| Event | `llh_analytics_events` | `llh_store` blob | Notes |
|-------|------------------------|------------------|-------|
| `page_view`, `website_visit`, `event` | **Yes** (always in Postgres mode) | **No** for analytics array | Logged-in users may debounce `lastSeenAt` only |
| `account_signup_complete`, `account_login_complete` | **Yes** | **Yes** (`writeStoreAsync`) — user fields only | Analytics row never appended to blob in Postgres mode |
| `checkout_success`, `subscription_canceled` | **Yes** | **Yes** (`writeStoreAsync`) — user + billing patch | Same as above |

---

## Debouncing scope

**The 2.5s debounce applies only to:**

- `lastSeenAt` / analytics user touch from **logged-in** `page_view` / `website_visit` via `scheduleDebouncedPostgresStoreWrite()`.

**The debounce does NOT apply to** messages, forms, child profiles, schedule, curriculum admin saves, checkout, webhooks, or billing mutations.

---

## Routes with awaited durable write — fail 503 if not saved

All user-facing and admin saves listed below use `writeStoreAsync`, `persistStoreOr503`, or `respondAfterPersist` before returning HTTP 200.

### Account & auth
- `POST /api/account/profile`
- `POST /api/auth/password-login`, password-reset complete, forced password change

### User program data
- `POST /api/child-data`
- `PUT /api/schedule`, schedule item upsert/delete, week assign, migrate

### Messaging & forms
- `POST /api/messages/reply`, `POST /api/admin/messages/send`
- Support / bug / feature / feedback create + admin update paths
- `POST /api/admin/reply`
- Comms API drafts, templates, tags, archive, automations (`persistStoreOrFail`)

### Admin operations (resolved in PR #385)
- `POST /api/admin/site-content`
- `POST /api/admin/membership-update`
- `POST /api/admin/subscription-refresh`
- `POST /api/admin/notifications/mark-read`
- `POST /api/admin/bug-report-update`, lesson-plan request create/update
- `POST /api/feature-request/vote`, `POST /api/admin/feature-request-update`
- `POST /api/admin/feedback-update`
- `POST /api/admin/announcements`, `POST /api/admin/announcement-update`
- `POST /api/admin/messages/draft`, draft delete
- `GET /api/admin/messages/conversation` (mark-read side effect)
- `POST /api/admin/messages/mark-read` / mark-unread
- `POST /api/admin/messaging-settings`
- `POST /api/admin/release-notes`, release-note update
- `POST /api/admin/onboarding-welcome`
- `POST /api/staff/invites`, `DELETE /api/staff/invites/:id`, accept/peek expired paths
- `GET /api/admin/program-migration-plan?apply=1`, `POST /api/admin/program-migration-rollback`
- `POST /api/admin/billing-reconciliation/apply`
- `POST /api/messages/mark-read`, mark-all-read, notification preferences, push subscribe/unsubscribe
- Email engagement admin: settings, preflight audit, prepare/send one-time, run onboarding/weekly, send-step

### Billing & checkout (HTTP)
- `POST /api/checkout` (pending plan + trial-dup flag)
- `GET /api/checkout/status` (paid upgrade path)
- `POST /api/stripe/webhook` — defers mutations, single `writeStoreAsync` flush before 200; returns 503 on persist failure

### Curriculum & site
- Curriculum import/save/publish paths (`writeStoreAsync`)
- `POST /api/admin/free-starter-library`, admin AI prompts/settings

### AI
- `POST /api/ai/generate` — usage log persisted before 200

---

## Intentionally asynchronous (background / best-effort)

These may still call fire-and-forget `writeStore()` because they are not user-facing HTTP success paths, or they run on boot/schedulers with logging and safe retries:

| Path | File | Rationale |
|------|------|-----------|
| Email engagement hourly scheduler (`startScheduler`) | `email-engagement.js` | Background; logs failures; admin manual runs await persist |
| `pauseEmailAutomationsInStore` on boot | `index.js` | Boot housekeeping |
| VAPID key `persistKeys` callback | `index.js` | Boot one-time |
| `ensureFoundingMemberUserStubs` on analytics read | `index.js` | Read-path reconciliation; rare |
| `purgeExpiredFoundingReservations` | `index.js` | Helper; founding HTTP uses atomic Postgres path |
| Legacy sync `claimFoundingSpot` / `reserveFoundingSpot` (non-atomic) | `index.js` | Superseded by `*Atomic` + Postgres transaction for checkout |
| Admin alert side-effects outside awaited handlers | `index.js` | Best-effort notifications; primary mutation already awaited |
| Founding/free welcome email schedulers | `founding-member-email.js`, `free-user-welcome-email.js` | Background campaigns with idempotent delivery rows |
| Debounced `lastSeenAt` from `page_view` | `index.js` | Optional UX; flushed on shutdown |

---

## Graceful shutdown

On **SIGTERM** / **SIGINT**: `flushPendingStoreWritesForShutdown()` → debounced flush → await `postgresWriteChain`.

---

## Tests

- `npm run test:store-write-degraded` — admin site-content, membership-update, announcements, messaging-settings, email-engagement settings return **503** when mock Postgres upserts fail
- `npm run test:release-candidate-regression` — full gate including store write safety suites
