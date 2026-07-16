# Little Learner Hub — Full Platform Audit Report

**Date:** 2026-07-16  
**Branch:** `cursor/platform-wide-audit-ad38`  
**Scope:** Platform-wide stability audit (auth, admin, importer, billing, messaging, drafts, library, navigation). No new product features.

---

## Executive summary

Critical and high-severity defects that could log admins out, double-bill, double-send messages, merge multi-plan imports, clear drafts, or mis-label Free users as canceled were identified and fixed. A new regression suite (`npm run test:platform-wide-audit`) locks the fixes in.

**Do not merge until you review this report.** No production data repairs were run.

---

## Issues found and fixed

### CRITICAL

| # | Issue | Root cause | Fix | Files |
|---|--------|------------|-----|-------|
| C1 | Admin unlock outlives server session after deploy/restart | `createAdminToken` returned before durable Postgres persist | Made `createAdminToken` async; `await writeStoreAsync`; login surfaces persist failure | `server/index.js` |
| C2 | Active subscribers could open a second Checkout | No pre-check for existing Pro/trial/founding access | Reject checkout with `409 already_subscribed` | `server/index.js` |
| C3 | Multi-`TITLE:` paste merged into one lesson plan | Single-plan parser treated later plans as more day content | Block pastes with >1 `TITLE:` and tell admin to import one at a time | `app.js` |
| C4 | Member messages sent twice | Legacy `app.js` + `comms-center.js` both handled `#messagesReplyForm`; no server dedupe | Skip legacy handler when Comms Center is active; add fingerprint dedupe on member reply | `app.js`, `comms-center.js`, `server/index.js` |

### HIGH

| # | Issue | Root cause | Fix | Files |
|---|--------|------------|-----|-------|
| H1 | UI “unlocked” without token → silent API 401s | `isAdminUnlocked()` only checked a flag | Require `llhAdminUnlocked` **and** session token | `app.js` |
| H2 | Most admin 401s never showed re-unlock UI | Only analytics/session paths marked invalid | Added `assertAdminApiResponse` + shared `adminAuthFailurePayload` | `app.js`, `server/index.js` |
| H3 | SW / `index.html` cache-bust mismatch (stale JS) | Different version strings | Aligned to `20260716-platform-audit` / `llh-shell-v51-platform-audit` | `index.html`, `service-worker.js` |
| H4 | Status text containing `"failed"` revoked Pro | `includes("failed")` matched unrelated copy | Match only `"payment failed"` / unpaid | `scripts/membership-access.js`, `app.js` |
| H5 | Admin extend-trial set `trialStatus: "Trial Active"` which access ignored | Access required `"in trial"` | Write `"In Trial"`; also accept legacy `"trial active"` | `server/index.js`, `scripts/membership-access.js`, `app.js` |
| H6 | Checkout sync left `lastStripeEventCreatedAt` at 0 | Stale webhook could overwrite fresher checkout | Stamp watermark on `upsertStripeSubscription` | `server/index.js` |
| H7 | Free users labeled “Canceled and Ended” after sync | Default inactive status always canceled | Use `"Free Plan"` when no paid history | `app.js` |
| H8 | Admin saw locked/empty Pro activity how-to | Activities loaded from public locked teasers; admin hydrate returned early | Admin loads full `effectiveCurriculum().activities` + hydrate from private record | `app.js` |
| H9 | Import double-click could re-parse with new IDs | No in-flight lock | `adminCurriculumLessonImporting` guard + disable buttons | `app.js` |
| H10 | Cancel import wiped paste | Cancel cleared preview without restoring text cache | Preserve paste into `adminCurriculumLessonImportTextCache` | `app.js` |
| H11 | Comms tabs remounted legacy Messages shell | Dual `data-messages-tab` attribute | Removed dual attribute; legacy handler ignores center tabs | `comms-center.js`, `app.js` |
| H12 | Search inputs lost focus every keystroke | Full page remount on `input` | Debounce + restore focus/caret | `app.js` |
| H13 | Draft restore overwrote typing; empty drafts revived | Async restore raced; empty never cleared storage | Restore tokens, skip dirty/focused fields, clear on empty, detach intervals, POST `/api/drafts/delete` | `comms-center.js` |
| H14 | Admin-only boot flashed marketing Home | Guest path always `renderHome()` | Restore Admin when unlocked + last view admin | `app.js` |
| H15 | Enrich silently invented missing fields | Preview always enrich-fills gaps | Visible enrichment warning before confirm | `scripts/curriculum-import-preview.js` |

---

## Issues identified but not fully fixed (deferred)

| Priority | Issue | Why deferred | Recommended next step |
|----------|--------|--------------|------------------------|
| CRITICAL (infra) | Multi-instance Postgres store can still overwrite `adminSessions` across instances | Needs Render single-instance policy or dedicated session table | Pin to 1 instance; later move sessions to Redis/table |
| HIGH | Provider `llhUser` not synced via Firebase `onAuthStateChanged` | Larger auth rewrite | Wire `onAuthStateChanged` on boot |
| HIGH | Admin tokens still appear in some GET query strings | Many call sites | Migrate to `Authorization` header |
| HIGH | Boot Pro lock/unlock flicker before subscription sync | Needs UI skeleton / sync gate | Gate lock chrome on `membershipSyncState` |
| MEDIUM | V3 day-level family/transitions/books not imported | Parser schema change | Extend `V3_DAY_FIELDS` + apply |
| MEDIUM | Activity `LEARNING_DOMAINS` incomplete on V3 | Schema | Add field + canonicalize |
| MEDIUM | True multi-plan bulk import UI (save ready plans when one fails) | Blocker message is safer for now | Wire `parseCurriculumLessonPlanBulkImport` in admin UI |
| MEDIUM | Preview mode + guest → bare login modal | Product UX | Soft banner while previewing |
| MEDIUM | No server revoke on Lock Admin | Token remains valid | `POST /api/admin/logout` |
| LOW | Unbounded admin session TTL | Intentional stay-logged-in | Add 14–30 day TTL + refresh |
| — | Production Stripe live E2E / real email delivery | Needs production credentials | Manual QA with test Stripe keys |
| — | Production DB duplicate/orphan repair | Explicitly forbidden without backup | Dry-run only; do not auto-delete |

**No destructive production data repairs were run.**

---

## Files changed

- `server/index.js` — durable admin login, checkout guard, reply dedupe, trial status, webhook watermark, auth failure payload
- `app.js` — admin unlock/boot/auth helper, billing status, importer guards, messaging dual-handler, search focus, admin activities
- `comms-center.js` — drafts restore/clear/detach, tab attribute, drafts delete POST
- `scripts/membership-access.js` — failed-substring fix, trial wording
- `scripts/curriculum-import-preview.js` — enrichment warning
- `index.html` / `service-worker.js` — cache-bust alignment
- `scripts/test-platform-wide-audit-regression.js` — **new** regression suite
- `scripts/test-admin-auth-session.js` — updated cache + boot expectations
- `package.json` — `test:platform-wide-audit`, `test:admin-auth-session`
- `PLATFORM_WIDE_AUDIT_REPORT.md` — this report

---

## Tests

### Added
- `npm run test:platform-wide-audit` → **28/28 passed**

### Updated
- `npm run test:admin-auth-session` → **7/7 passed**

### Passed (this run)
| Suite | Result |
|-------|--------|
| `test:platform-wide-audit` | PASS (28) |
| `test:admin-auth-session` | PASS (7) |
| `test:account-access` | PASS |
| `test:billing-membership` | PASS (incl. browser personas) |
| `test:curriculum-import-preview` | PASS |
| `test:curriculum-import-gold` | PASS |
| `test:importer-pre-batch-qa` | PASS (24/24, ready for bulk import YES) |
| `test:messaging-regression` | PASS |
| `test:comms-ecosystem` | PASS |
| `test:curriculum-access-security` | PASS |
| `test:pro-lesson-preview-audit` | PASS (incl. Free/promo browser) |
| `test:platform-nav` | PASS |
| `test:settings-hub` | PASS |
| `test:navigation-history` | PASS (desktop + mobile viewport) |
| `node --check` on edited JS | PASS |

### Failed / blocked
| Suite | Reason |
|-------|--------|
| Live Stripe checkout/payment | Requires production/test Stripe credentials |
| Live Firebase sign-up / email | Requires Firebase + email credentials |
| Real Safari / iOS / Android devices | Needs human device QA |
| Production DB integrity dry-run | Needs production DB credentials + backup |

---

## Manual QA checklist (pass/fail)

Use fresh test accounts after merge. Mark each:

| Area | Status |
|------|--------|
| Admin | **Code fixed** — re-verify unlock after deploy; stay logged in across refresh/nav/tabs |
| Authentication | **Code fixed** — admin session persist + re-unlock messaging |
| Sign-up | **Not live-tested** — needs Stripe/Firebase |
| Billing | **Code fixed** — duplicate checkout blocked; failed-substring; Free labeling |
| User permissions | **Unit-tested** — access matrix pass |
| Lesson plan importing | **Code fixed + importer QA pass** — multi-TITLE blocked; double-click guarded |
| Lesson plan editing | **Not fully re-tested** — existing editor suites not re-run in full |
| Lesson plan library | **Access security pass** — Pro DTO lock still correct |
| Calendar | **Not re-tested this run** |
| Messaging | **Code fixed + regression pass** — double-send prevented |
| Draft saving | **Code fixed + comms ecosystem pass** |
| Downloads / Printing | **Wiring present in importer QA** — full print visual QA not run |
| Child data | **Not re-tested this run** |
| Mobile | **Code fixes applied** (search/focus/nav) — device QA pending |
| Security | **Admin API still token-gated**; guest admin shell still unlock-gated |

---

## Screens / flows verified (automated)

- Admin session create + validate endpoint shape
- Membership access matrix (Free / Trial / Pro / Founding / Manual / Past due / Cancel-still-access)
- Billing browser persona labels & access
- Curriculum import preview confirmability + duplicate title guard + gold-standard theme checks
- Importer age/plan variants (Infant/Toddler/Preschool, Free/Pro) + Activity Library sync wiring
- Public Pro lesson/activity lock DTO + Free/promo browser locked preview
- Messages / drafts / tags / templates / automations (comms ecosystem)
- Platform sidebar order and role visibility
- Navigation history (boot Calendar, refresh restore, Back, scroll, mobile viewport)

**Desktop Playwright:** billing personas + Pro preview + navigation history — **PASS**  
**Mobile viewport (Playwright):** navigation history §6 — **PASS**  
**Real Safari / physical phones:** not run in this environment.

---

## Expected result after merge

- Admins stay unlocked across refresh/navigation when the server still has their session; after deploy they get a clear **Unlock Admin Again** path instead of a silent login bounce.
- Checkout cannot double-bill an already-active Pro/trial/founding account.
- Lesson importer refuses multi-plan pastes that would merge activities; cancel keeps the paste; double-click does not spawn duplicate imports.
- Messages send once; drafts survive remounts and do not overwrite typing.
- Free accounts are not mislabeled canceled; unrelated “failed” status text does not strip Pro.
- Admin can see full Pro activity content while previewing as Admin.

---

## Merge recommendation

**Safe to merge for stability fixes** after you skim this report.  
**Do not treat as a substitute for morning manual QA** on Admin unlock after a Render deploy, one real Checkout attempt on a Free test account, one Pro library unlock check, and one message send from a member account.
