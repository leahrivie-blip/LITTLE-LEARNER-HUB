# Admin Session Storage & Data-Integrity Audit

**Scope:** live `main` branch. Read-only investigation, then a scoped, tested fix on a
separate draft PR. No production data was read/written/changed as part of this work
(one earlier, separate read-only production login check — using credentials the
account owner gave directly in chat — was done in an *earlier* conversation turn to
diagnose a live incident; **no production credentials, production database access, or
production writes were used for anything in this document or its accompanying code
changes/tests**).

**Branch:** `cursor/admin-session-storage-audit-1d13`
**Status:** draft PR, not merged, not deployed.

---

## 1. Proving the current behavior (before this change)

### 1.1 Exactly which function performed each write

| Action | Function (pre-fix) | What it wrote |
|---|---|---|
| Admin login | `createAdminToken()` → `await writeStoreAsync(storeCache)` | The **entire** application store document |
| Admin session refresh (`GET /api/admin/session`) | `handleAdminSession()` | In-memory only (`storeCache.adminSessions[token].lastValidatedAt`) — *not* a full write, already optimized in a prior pass |
| Admin logout | `handleAdminLogout()` → `writeStore(store)` | The entire application store document (fire-and-forget) |
| Auth check on ~every admin API call | `validAdminToken()` → `readStore()` | For Postgres mode, `readStore()` returns `structuredClone(storeCache)` — a full **deep clone** of the entire store, on every single call |
| Ordinary member server-password login | `handlePasswordLogin()` → `await writeStoreAsync(store)` | The entire application store document (same pattern, not admin-specific) |

Code references (all on `main` before this fix, commit `d5bbc97`):

- `createAdminToken()` — wrote `storeCache.adminSessions[token] = {...}` then `await writeStoreAsync(storeCache)`.
- `validAdminToken()` — `const store = readStore(); return Boolean(store.adminSessions?.[clean]);`
- `readStore()` — `if (usePostgresStore()) return structuredClone(storeCache || defaultStore());`
- `handlePasswordLogin()` — ordinary member login, same `await writeStoreAsync(store)` pattern.

### 1.2 Was the whole store serialized?

**Yes, on every login.** `writeStoreAsync()`/`writeStore()` always operate on the
entire `storeCache` object — there is no partial/field-level write path in the
pre-fix code. `JSON.stringify(storeCache)` (inside the Postgres upsert query) and
`structuredClone(storeCache)` (inside every `readStore()` call) both touch the whole
document, regardless of how small the actual change is.

### 1.3 One large JSONB document, or individual records?

**One large JSONB document.** Production Postgres schema (from `initializePostgresStore()`):

```sql
CREATE TABLE IF NOT EXISTS llh_store (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,          -- <- users, messages, curriculum, sessions, billing, everything
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

Persisted with `INSERT ... ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data` — a
single-row upsert of the entire JSON blob. Three other tables already exist and are
already properly normalized (`llh_media_assets`, `llh_email_campaign_deliveries`,
`llh_store_backups`) — sessions were simply never given the same treatment.

`adminSessions` (admin) and `memberSessions` (ordinary users, via
`server/temp-password-auth.js`) both lived as sub-objects **inside** that single
`data` JSONB document.

### 1.4 Store size / approximate bytes written per login

We did not dump raw production data (to avoid handling PII), but built a
**production-shaped fixture** to measure this safely (see `scripts/test-admin-session-storage.js`,
section D):

- Fixture: 70 users (each with 3 children + 5 observations), 90 lesson plans, 1,530
  activities — deliberately similar in shape/scale to the live site (89 lesson
  plans / 1,500 activities observed via the public API on 2026-07-25).
- **Fixture size: 9.75 MB.**
- **Before this fix:** every login would write **all 9.75 MB** (JSON-stringify the whole document, then upsert it).
- **After this fix:** every login writes **1,076 bytes** (a single session row).
- That's roughly a **9,500x reduction** in bytes written per login.

We separately corroborated (read-only, via the health/store-health endpoints in an
earlier session) that the live production store has 70 users, 1,500+ activities,
89 lesson plans, and other collections of comparable scale — consistent with the
fixture being a realistic stand-in, not an exaggerated worst case.

### 1.5 Do ordinary user logins do the same thing?

**Yes.** `handlePasswordLogin()` (the server-password/temp-password login path used
for account recovery — see `server/temp-password-auth.js`) also called
`await writeStoreAsync(store)` on every successful login, for the exact same reason:
`store.memberSessions` also lives inside the shared document. This audit's fix is
scoped to **admin** sessions only (per the requested scope); member sessions are
flagged below as a follow-up with the identical fix pattern available.

### 1.6 Can multiple simultaneous logins overwrite newer data?

For the **admin session field specifically**: yes, in principle, before this fix —
though a dedicated guard (`mergeStorePreserveAdminSessions()`) already existed to
paper over it (merging cached sessions back in on every write so a stale clone
couldn't silently drop a session). That guard remains in the code as inert
rollback-safety scaffolding, but it is no longer load-bearing for *new* admin
sessions once this fix lands, because sessions no longer touch the shared document
in the first place — there is nothing for a stale clone to lose.

For the **rest of the shared document** (curriculum vs. users vs. messages, etc.):
concurrent writes to different fields can still theoretically race in the general
case (this is a pre-existing architectural characteristic of "one big document,
last full write wins", partially mitigated by `mergeStorePreserveAdminSessions`,
`mergeStorePreserveEmailCampaigns`, `mergeStorePreferNewerSiteContent`, and the
monotonic write-generation counter in `enqueuePostgresStoreWrite()`). This audit
does **not** claim to have fully solved that broader class of risk — see §3 and the
"Not in scope" note below. What this fix *does* prove (with tests) is that **login
itself can no longer be a party to that race at all**, because it no longer writes
the shared document.

### 1.7 Did login persistence touch curriculum, users, messages, or billing?

**Only indirectly, via the full-document write.** `createAdminToken()` never
*intended* to touch those fields, but because it wrote the entire `storeCache`
object, it necessarily re-serialized and re-persisted whatever those fields
currently held — meaning any bug in a concurrent process that had *already*
corrupted `storeCache` in memory would have been "helpfully" persisted by the very
next admin login, unrelated to what that login was trying to do.

After this fix: **no.** `scripts/test-admin-session-storage.js` proves this directly —
tests fire an admin login concurrently with a curriculum save, a
membership/user-record update, and a message send, and assert byte-for-byte that
the main store file is unaffected by the login (see §3 below for the full list).

### 1.8 Why did the health endpoint briefly return 503?

**We looked for, and did not find, any code path where `handleHealth()` itself
returns a 503.** It calls `peekStore()` (which returns the in-memory `storeCache`
directly — no clone, no Postgres query — as long as `storeCache` is already
populated, which it normally is on a running server), then builds a plain JSON
response. There is no `jsonResponse(response, 503, ...)` anywhere in `handleHealth()`.

This means the 503 we observed was **not** an application-level decision by this
server's own code. The strongest code-backed explanation, in order of likelihood:

1. **Event-loop blocking under memory pressure.** The process is started with
   `node --max-old-space-size=300` (a 300MB V8 heap cap — see `package.json`,
   `render.yaml`, `Procfile`; the comment trail in `server/index.js` explicitly
   references "the prior OOM crash source on Render starter"). `readStore()` calls
   `structuredClone()` of the *entire* multi-MB store on **every** call
   (181 call sites; `validAdminToken()` alone is called from ~102 admin endpoints).
   Under concurrent admin traffic, this can produce large, short-lived allocations
   that trigger V8 GC pauses; a long enough pause can make Node miss Render's own
   health-check window, and Render's edge/proxy layer — not this application — would
   then be the one returning a substitute 503 while the origin is unresponsive.
2. **A deploy-triggered restart window.** The 503 was observed within ~15 minutes of
   a merge to `main` (which triggers a Render auto-deploy). A brief window where the
   old instance is draining and the new one is still starting is a completely normal
   platform-level 503 source and is consistent with the timing.

We did **not** have Render dashboard/log access to distinguish between these
definitively, and we are not asserting either one as *the* proven root cause — we
are reporting what the code does and does not do, and what the timing does and does
not support. What this fix demonstrably *reduces* is contributor #1: fewer
full-store clones per request (see §1.9) means less GC pressure under concurrent
admin load, which is the piece we could actually test and fix.

### 1.9 The `readStore()` read-amplification finding (a second, related root cause)

Beyond the login-writes-everything problem the user flagged, we found a second,
closely related issue while tracing the auth-check path itself:

- `validAdminToken()` called `readStore()` on **every single authenticated admin
  request** (102 call sites across `server/index.js` call `validAdminToken()`).
- `readStore()`, in Postgres mode, does `structuredClone(storeCache || defaultStore())`
  — a full deep clone of the entire multi-MB store — **every time it's called**.
- Many admin handlers then call `readStore()` **again** for their own `store`
  variable immediately after the auth check, meaning a single admin API request
  could clone the entire store **twice**.

This is arguably the larger contributor to the intermittent slowness/instability,
since it fires on *every* admin request, not just logins. Moving sessions to their
own store (§2) fixes this as a natural side effect: `validAdminToken()` now checks
an in-memory session map directly and **never calls `readStore()` at all**.

---

## 2. Safe session storage design (implemented)

New module: **`server/admin-session-store.js`**. Design:

- **Separate server-side session records.** Production: a dedicated Postgres table,
  `llh_admin_sessions` (`token` PRIMARY KEY, `email`, `created_at`, `expires_at`,
  `last_validated_at`, `revoked_at`). Local-json/test mode: a small sibling JSON file
  next to the main store file (e.g. `launch-store.admin-sessions.json`), never inside
  the main store document.
- **Secure random session identifiers.** `admin_` + 32 bytes (256 bits) of
  `crypto.randomBytes`, hex-encoded (previously 24 bytes/192 bits — already strong,
  bumped for margin).
- **Salted password verification is unchanged.** `ADMIN_PASSWORD` /
  `ADMIN_ACCESS_CODE` comparison via `timingSafeEqualText()` and
  `isConfiguredAdminEmail()` were **not touched at all** — this fix is entirely about
  what happens *after* credentials are already verified.
- **Session expiration.** New: a 12-hour sliding idle-timeout (`DEFAULT_SESSION_TTL_MS`).
  **This did not exist before** — the legacy `store.adminSessions` records never
  expired at all. This is a genuine security improvement, not just a refactor.
- **Revocation and logout.** `adminSessionStore.revoke(token)` — deletes exactly one
  row/record; logout no longer reads or writes the main store at all.
- **Admin lockout/rate limits.** New: in-memory (not persisted — see trade-off note
  below) sliding-window lockout. Default: 6 failed attempts within 10 minutes locks
  the *email* out for 15 minutes, regardless of whether subsequent attempts use the
  correct credentials. Checked *before* verifying credentials so response
  timing/content can't be used to keep probing during a lockout.
- **Rotation after successful authentication.** Every successful login always mints
  a brand-new, independent, unrelated random token (`create()` is the only place a
  token is minted). Nothing about a prior session is extended or reused on login.
- **No tokens in URLs or logs** — **not fully addressed in this PR; see "Known gap"
  below.** Many existing `GET /api/admin/*` endpoints already pass `adminToken` as a
  query string parameter (a pre-existing pattern used across the majority of the
  admin surface, not introduced by this change). We did not attempt to migrate that
  calling convention in this PR — see the explicit callout below.
- **No browser-controlled Admin permissions.** Unchanged: every admin request is
  still verified server-side against a server-held session record; the client never
  supplies or can spoof an "is admin" flag that the server trusts directly.
- **Existing active sessions must not suddenly break — migration plan.** See below.

### Migration plan (existing sessions keep working)

On boot, after the main store is loaded (Postgres or local-json), `initializeStorage()`
now:

1. Creates `llh_admin_sessions` (Postgres) if it doesn't exist, or resolves the local
   sessions file path (local-json).
2. Loads any already-migrated sessions from that dedicated storage into memory.
3. Calls `adminSessionStore.migrateLegacySessions(store.adminSessions)` — reads the
   **legacy** field one time, and for every token not already present in the new
   store, inserts it with a **fresh full TTL from migration time** (not the stale/
   nonexistent old expiry, since legacy sessions never expired) — so an admin who was
   already logged in via the old mechanism is not logged out by this deploy.
4. This is **idempotent** — safe to run on every boot. Once a token has been
   migrated, re-running the migration is a no-op for that token (proven by
   `scripts/test-admin-session-storage.js`, unit tests: *"migrateLegacySessions()
   is idempotent"* and *"never overwrites a session already migrated in a prior boot"*).

`store.adminSessions` (the legacy field) and its associated merge helper,
`mergeStorePreserveAdminSessions()`, are **left in place, untouched, as inert
rollback scaffolding** — new logins never write to that field again, but if this PR
needed to be rolled back after being deployed, the old code would still find that
field in a consistent (if frozen-in-time) shape rather than erroring on a missing key.

### Known gap (intentionally not fixed in this PR — flagging for a follow-up)

**Admin tokens are still passed as `?adminToken=...` query parameters on the many
existing `GET /api/admin/*` endpoints.** This is a pre-existing pattern (not
introduced here) used across roughly 100 admin GET endpoints and the entire admin
front-end's calling convention. Query-string tokens can end up in server access
logs, browser history, and `Referer` headers. Properly fixing this means migrating
every one of those ~100 call sites (server *and* client) to send the token as an
`Authorization: Bearer` header instead — a large, separate, non-trivial refactor
that touches the entire admin surface area. Given this PR's explicit "read-only
investigation → scoped, tested fix → stop for approval" mandate, we deliberately
**did not** attempt that sweeping change in the same PR as the session-storage
migration. We recommend it as a **separate, dedicated follow-up PR** if you want it
addressed, so it can be reviewed and tested on its own without conflating it with
the storage-architecture change here.

Ordinary member sessions (`store.memberSessions`, `server/temp-password-auth.js`)
have the identical "sessions live inside the shared document" issue, fixable with
the same pattern used here. Not touched in this PR (scope was admin sessions per
the request); flagging as a natural, low-risk follow-up using the same module shape.

---

## 3. Data-integrity protection: concurrency test results

All of the following are automated, run against a real spawned server (not
mocked-out), and all **pass** on this branch (`scripts/test-admin-session-storage.js`
+ existing `scripts/test-store-write-race.js`):

| Scenario (as required) | Result |
|---|---|
| Two admin logins simultaneously | ✅ Each mints its own independent token; both remain valid; neither interferes with the other |
| Admin login while a lesson plan is saved | ✅ Curriculum save succeeds and its lesson plan is present after 3 concurrent logins; logins succeed |
| Admin login while a user record changes (`/api/admin/membership-update`) | ✅ User record updates and stays intact; concurrent logins succeed |
| Admin login while a message is sent (`/api/admin/messages/send`) | ✅ Message send succeeds; concurrent logins succeed |
| Multiple normal users signing in concurrently with an admin login | ✅ 5 concurrent (unregistered, intentionally-failing) member logins via `/api/auth/password-login` run alongside an admin login; the admin login succeeds independently |
| Server restart with valid and expired sessions | ✅ A session valid before restart is still valid after; a session manually marked expired before restart is rejected after (not silently revived) |
| Failed database write during login | ✅ (mock Postgres, forced failure) Login still succeeds — falls back to the in-memory session (valid for this process) + local file, same "degrade gracefully" philosophy the rest of the app already uses for Postgres blips |
| Duplicate requests and retries | ✅ 3 concurrent identical login requests each get their own independent, valid token — no corruption, no lost session |
| **Login never rewrites unrelated collections** | ✅ Proved directly: main store file is byte-for-byd identical before/after login, before/after session-check, and after 5 back-to-back logins against a 9.75MB fixture |
| **Login never touches inventory counts** | ✅ 10 concurrent logins against the multi-MB fixture leave `/api/admin/store-health` counts (users, messages, founding members, etc.) byte-for-byte unchanged |

### What this PR does *not* claim to fully solve

Optimistic concurrency / transactional guarantees for the **rest** of the shared
JSONB document (i.e., two *unrelated* full-store writes to, say, curriculum and a
completely different field, racing against each other) is a broader, pre-existing
architectural characteristic of the "one big document, full-object writes" model
that predates this PR and is not addressed here beyond what already existed
(`mergeStorePreserveEmailCampaigns`, `mergeStorePreferNewerSiteContent`, the
monotonic write-generation counter). This PR's concurrency claim is scoped
precisely to what was asked: **admin session creation/validation can no longer be a
party to a lost-update race with any other collection, because it no longer touches
the shared document at all.** We did not attempt a general per-field optimistic-
concurrency rewrite of the whole store in this PR — that would be a much larger,
separate architectural project.

---

## 4. Performance: before/after, measured

Measured against the 9.75MB production-shaped fixture described in §1.4
(`scripts/test-admin-session-storage.js`, section D):

| Metric | Before (computed, not executed — the old code path no longer exists on this branch) | After (measured) |
|---|---|---|
| Bytes written per login | ~9,982 KB (the entire store) | **1,076 bytes** (~9,500x smaller) |
| Main store file touched by login? | Yes, every time | **No — byte-for-byte identical before/after, proven by test** |
| Avg. login time (5 logins, local disk) | Not separately re-measured (the old write path was removed as part of the fix, per the task's instruction to implement the safe design rather than keep both paths side-by-side) | **0.8–2.2ms** |
| Health check response time while a login is in flight | Not separately re-measured for the same reason | **< 250ms for all 5 samples taken during a concurrent login** (well within the health-check timeout budget) |
| 503s under 10 concurrent logins | Not applicable — old path removed | **Zero** |
| Curriculum/user/message/billing counts changed by login? | Yes, incidentally possible (whole document rewritten) | **No — proven byte-identical / count-identical** |

We did not keep the old full-store-write code path alongside the new one specifically
in order to produce a live A/B benchmark within the same running process — doing so
would have meant shipping (even temporarily, even disabled) the exact code this audit
determined should not exist. Instead, the "before" bytes-written figure is a direct,
exact computation from the same fixture (`JSON.stringify(fixture).length`), not an
estimate.

**No real production credentials or records were used in any automated test.** All
tests in `scripts/test-admin-session-storage.js` spawn their own throwaway server
process with synthetic admin credentials and either a local-json temp store or a
mocked Postgres (`scripts/mock-pg-admin-sessions-preload.js`).

---

## 5. Founding-count cleanup (read-only, additive, no eligibility/pricing/Stripe change)

New, admin-only, read-only endpoint: **`GET /api/admin/founding-breakdown`**
(`handleAdminFoundingBreakdown()` in `server/index.js`). It does not change any
existing field, endpoint, or computation — it only reads and clearly labels numbers
that already existed under different names in different places:

| Label | What it actually is | Where it already appeared before this PR |
|---|---|---|
| **Total founding spots** | `FOUNDING_LIMIT` (fixed cap, env-configurable) | `/api/health` → `founding.limit` |
| **Ever claimed** | `store.foundingMembers` array length + base offset — an **append-only ledger**; an email is never removed even after cancellation | `/api/health` / `/api/founding-status` → `founding.claimed` |
| **Currently active** | Users whose `membershipCurrentAccessKey(user) === "founding"` **right now** | Previously only visible per-user (`foundingMemberActive`, `foundingEligibilityLabel`) or folded into the admin analytics `currentAccessCounts.founding` total, with no explicit "vs. ever-claimed" framing |
| **Canceled/expired** | `everClaimed − currentlyActive` | Previously only visible per-user via the `"Historical Founding Member (no auto $9.99)"` label; never surfaced as an aggregate count |
| **Remaining available** | `FOUNDING_LIMIT − everClaimed` | `/api/health` / `/api/founding-status` → `founding.remaining` |

**This explains the discrepancy the user saw** (e.g. "claimed: 32" on the public
health check vs. a smaller "foundingMembers" figure elsewhere in admin analytics):
those are the **ever-claimed ledger** and the **currently-active** count,
respectively — two different, both-correct numbers, not evidence of lost founding
spots. Nothing about founding eligibility, Stripe, pricing, or subscription state
was changed to produce this endpoint — it is a pure read, gated by the existing
`validAdminToken()` check, and tests prove calling it never changes the public
`/api/founding-status` response.

---

## 6. Deliverables

- **Root cause, with code references:** §1 above.
- **Current storage architecture:** §1.3 — single `llh_store.data` JSONB document for
  everything; three collections (`llh_media_assets`, `llh_email_campaign_deliveries`,
  `llh_store_backups`) already properly normalized; sessions were the odd one out.
- **Proposed migration approach:** §2 — dedicated `llh_admin_sessions` table
  (Postgres) / sibling file (local-json), idempotent boot-time migration of legacy
  sessions, old field left inert for rollback safety.
- **Before/after timing and bytes written:** §4.
- **Concurrency test results:** §3.
- **Exact files changed:**
  - `server/admin-session-store.js` (new) — the dedicated session store module.
  - `server/index.js` — wire-up: table creation, boot migration, `createAdminToken`,
    `validAdminToken`, `handleAdminLogin` (+ lockout), `handleAdminLogout`,
    `handleAdminSession`, plus the three other call sites that read
    `store.adminSessions[token]` directly for display/audit purposes
    (`appendCurriculumRestoreAudit`, the billing-reconciliation apply handler, the
    admin-analytics summary logger). New read-only `handleAdminFoundingBreakdown`
    + route registration.
  - `scripts/test-admin-session-storage.js` (new) — the full test suite described
    in §3/§4 (unit + integration + mock-Postgres + performance-fixture + founding-
    breakdown tests).
  - `scripts/mock-pg-admin-sessions-preload.js` (new) — test-only mock Postgres that
    distinguishes `llh_store` writes from `llh_admin_sessions` writes so tests can
    prove exactly which table gets touched and how many bytes.
  - `scripts/test-admin-auth-session.js`, `scripts/test-platform-wide-audit-regression.js`
    — updated to assert the new architecture instead of the removed one.
  - `package.json` — new `test:admin-session-storage` script.
  - `.gitignore` — ignore pattern for the new local-json sibling session files
    test runs create.
- **Exact commit SHA and draft PR:** see the PR description/commit list on branch
  `cursor/admin-session-storage-audit-1d13` (this document is committed alongside
  the code in the same PR).
- **Rollback plan:** revert the PR. `store.adminSessions` (legacy field) and
  `mergeStorePreserveAdminSessions()` were deliberately left untouched and
  functional, so reverting to the pre-fix `createAdminToken()`/`validAdminToken()`
  would immediately work again against whatever legacy sessions still exist in that
  field (sessions created *only* under the new code, after this PR was live, would
  not have been mirrored back into the legacy field — this is the same one-directional
  trade-off any storage migration has; documented here rather than silently accepted).
  No database migration/teardown step is required to roll back — the new
  `llh_admin_sessions` table/file can simply be left in place unused.
- **Confirmation curriculum, users, billing, Stripe, and production data were
  untouched:** No production credentials, production database connection, or
  production write of any kind was used to produce this document or its
  accompanying code/tests. All new tests run against throwaway, synthetic,
  locally-spawned servers (`scripts/test-admin-session-storage.js`). The full
  existing regression suite (`test-billing-membership-qa.js`,
  `test-platform-wide-audit-regression.js`,
  `test-curriculum-activities-wipe-protection.js`,
  `test-lesson-library-empty-curriculum-hotfix.js`, `test-store-safety-guards.js`,
  `test-store-write-race.js`, `test-admin-auth-session.js`, and a broad sample of
  ~30 additional test files spanning curriculum, messaging, and billing) was run
  against this branch and produces identical results to the unmodified `main`
  branch (the small number of pre-existing failures found were confirmed, by
  running them against `main` unmodified, to already fail identically there —
  i.e. not caused by this change).

**This PR has not been merged or deployed.** It is a draft PR targeting `main`,
stopped here for approval as instructed.
