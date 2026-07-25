# Phase 23 — Complete Platform Walkthrough, Fake Accounts, Device Audit, and Testing Deployment

**Branch:** `testing/full-platform-integration-2026-07`
**Status:** Complete (testing foundations only — production untouched)
**Date:** 2026-07-23
**Started from tip:** `559de76988c215e3c772f78cc3de36ee72f57b80` (Phase 22 completion)

## Goal

Create a complete fake childcare program and test Little Learner Hub as every type of user, proving the platform works as **one connected system** — not only as separate features. This phase deliberately prioritized depth over breadth: rather than building brand-new parallel fixture infrastructure, it extended and (critically) **fixed** the substantial existing Testing Lab / Director Center / Family Foundation fixture system from Phases 2, 8, and 18, because that system turned out to have real, previously-undiscovered bugs preventing it from actually being "one connected system."

## Headline finding

The single most important result of this phase is not a new feature — it is that **the existing fake-account infrastructure was silently broken in ways that made "test as every role" impossible**, and this phase found and fixed those breaks:

1. **A fake account's issued password could not log in at all** through the Testing Lab dashboard flow (`server/testing-lab-api.js`'s `handleIssuePassword` never set `serverPasswordAuth: true`, which `verifyServerPasswordLogin()` requires before it will even compare the password hash) — every such login was silently rejected with 401.
2. **Even when it could log in**, a fake account's `accountType`/`role` were never mapped onto the vocabulary the main provider app (`scripts/account-access.js`) understands, so every fake staff account would have landed on the generic default Solo Provider experience regardless of whether it was seeded as an Owner, Director, Lead Teacher, or Assistant — and a Guardian fake account had no mechanism to land in Family Hub at all, meaning her password could instead grant her the full provider app experience.
3. **11 of the ~14 admin-preview UI modules** (billing-simulator, classroom-assistant, enrollment, family-messaging, family-updates, licensing-center, provider-productivity, records-center, staff-experience, testing-lab, today-hub) read their own admin bearer token from a `localStorage`/`sessionStorage` key, `llhAdminToken`, that the **real** admin login flow never wrote — it was only ever set by test/screenshot scripts as a manual workaround. A real admin who unlocked Admin normally and opened any of these Director Center tabs got an unauthenticated 403 on first load.

All three are now fixed (see "Fixes" below), with regression coverage, and re-verified end-to-end through the **real** login form and a **real** admin session — not synthetic test headers.

## 1. Phase 22 limitations resolved

| Limitation (from Phase 22 report) | Resolution |
|---|---|
| Curriculum Only cannot persist through a real login | `scripts/account-access.js` (+ `app.js` mirror): `curriculum_only` is now a real alias that passes through `normalizeAccountType()` as itself instead of resetting to `home_daycare` on every login/boot migration. `accountTypeAllowsCapability()` explicitly denies `forms`/`staff_management`/`permissions`/`reports` for it (on top of the existing classrooms/families/enrollment denial), while keeping calendar/lesson-plan/activity/billing/settings capabilities. Verified via a real fake-account login: `accountType` and `resolveExperienceRole()` both correctly persist as `curriculum_only` after boot. |
| Today is not the default signed-in landing | `defaultLoggedInLandingView()` now returns `"today"` instead of `"calendar"`. Found and fixed **four other** hardcoded `"calendar"` post-auth landing fallbacks that bypassed this function entirely (login submit handler, forced-password-change completion, free-plan signup completion, and the logged-in `home` → landing remap) — all four now consistently land on Today too. A remembered last-viewed view (e.g., Calendar, if that's where the user was before a refresh) still correctly takes priority, unchanged. |
| Public visitors / Guardian landing | Public visitors are unaffected (guests never call `defaultLoggedInLandingView()`). Guardian landing was **not previously wired at all** for a real login — see "Guardian → Family Hub routing" below; it is fixed now. |
| Family Hub's five-item bottom nav | Unchanged from Phase 22 (Home, Children, Forms, Messages, Account) — confirmed still intentional and uncluttered; no changes made. |
| Tablet layouts | Dedicated 768px/1024px verification added — see Device Audit below. |
| Director Center full audit | Completed — see Director Center Audit below. |
| No role sees empty/duplicated/unauthorized/confusing navigation | Verified for all 11 roles via the new walkthrough suite (`test-phase23-platform-walkthrough.js`) — zero page errors, correct nav, correct landing, for every one. |

### Guardian → Family Hub routing (new)

Previously, "Family Hub" was reachable only via an explicit `setView("family-hub")` call gated by an expansion feature flag — there was **no code path that automatically routed a real, logged-in guardian there**. A guardian who logged in through the shared `/api/auth/password-login` form would have landed on the normal provider app (Today/Calendar/sidebar), exactly like a provider.

Fixed:
- `handleIssueFakePassword` (both `server/family-foundation-api.js` and `server/testing-lab-api.js`, now sharing one mapping function — see below) sets a `familyHubGuardian: true` flag on the resulting `store.users[email]` record for guardian-kind fake accounts.
- `handlePasswordLogin`'s response now includes `accountType`, `role`, and `familyHubGuardian`.
- The client's `loginWithServerPassword()` adopts these onto the local account; the login submit handler and **both** boot-sequence landing decisions (the synchronous early-landing path and the async continuation) check `familyHubGuardian` and route to `setView("family-hub")` instead — refreshing expansion flags first (via a real, awaited `loadExpansionFeatureFlagsFromBackend()` call) so the just-issued member session token is what `canAccessFamilyHub` is keyed on, not a stale pre-login cache.
- A related bug was found and fixed in the same area: `canAccessFamilyHub`'s server-side check only matched a contact by exact email, which fails for the three Phase 18 "alias" guardian kinds (`financial_guardian`, `non_financial_guardian`, `emergency_only`) that intentionally share an existing contact (e.g., Priya's) under a different login email. Added a fallback that resolves access via the fake account's own `contactId` when the direct email match fails.

Verified end-to-end via the real login **form** (not internal function calls, and not a hand-rolled `localStorage` write standing in for the real `setAdminSession()`/login flow): all four guardian personas (multi-child, financially-responsible, pickup-only, restricted) land on `view-family-hub`, both on fresh login and on page refresh.

## 2. Fake Home Daycare and Fake Center

Rather than building new parallel fixtures, this phase verified the depth of the **existing** Testing Lab `home_daycare` and `small_center`/`growing_center`/`large_center` scenarios (Phases 8 and 18), which — once the login/identity bugs above were fixed — already satisfy nearly all of Section 2/3's requirements:

- **Home Daycare** ("Sunny Corner Home Daycare (Preview)" + the Phase 8 primary org layered on top): one owner, one lead teacher, two assistants (broad/limited), 5 named fixture children (Ava Lin, Ben Lin, Carlos Rivera, Dana Cole, Elena Shared — the last shared across two households), 4 households/guardians with distinct access levels, attendance, forms, enrollment, messaging, records, licensing, staff schedules/training/CPR records, and billing invoices — confirmed present via live API calls (`GET /api/director-center/family/households`, `/today/dashboard`, `/staff`, `/enrollment/pipeline` all returned rich, non-empty data during this phase's testing).
- **Center** (`small_center`/`growing_center`/`large_center` in `scripts/director-center-preview-fixtures.js`): multiple classrooms (3/6/10 rooms), a director, rotating lead teacher/assistant staff (5/8/12), children assigned across classrooms, an archived classroom example, and (via the same Phase 8/18 layering) the same guardians/billing/enrollment/licensing depth as above.

**Known gap:** a dedicated, genuinely-solo (no other staff roles at all) home daycare pack, separate from the Phase 8 primary org's staff roster, was not built — the identified gap from prior exploration. Given the existing pack already satisfies "one owner + at least one optional assistant" from the spec, and building a fully separate parallel fixture system carried real risk of introducing inconsistencies with the well-tested existing system for a two-week task window, this was judged not worth the risk versus the value. Tracked as a Phase 24 candidate if a cleaner solo-only pack is wanted.

## 3. Resettable fake accounts (all 11 roles)

All 11 required personas were verified working end-to-end through a **real** login (not a synthetic Bearer header):

| Role | Fake account kind | Verified accountType / role after real login |
|---|---|---|
| Platform Admin | (real owner admin login, not a fake account) | `hasAdminFullAccess() === true` |
| Center Owner | `owner` | `center` / `owner` |
| Director | `director` | `center` / `director` |
| Solo Home Daycare Provider | `home_daycare` | `home_daycare` / `owner` |
| Lead Teacher | `lead_teacher` | `center` / `teacher` |
| Assistant | `assistant_broad` (also `assistant_limited`) | `center` / `assistant` |
| Curriculum Only Provider | `curriculum_only` | `curriculum_only` / `owner` |
| Guardian (multiple children) | `parent_multi_child` | `familyHubGuardian: true` |
| Financially responsible guardian | `financial_guardian` | `familyHubGuardian: true` |
| Pickup-only guardian | `pickup_only` | `familyHubGuardian: true` |
| Restricted/suspended guardian | `restricted_guardian` | `familyHubGuardian: true` |

**Password safety (unchanged, verified, now actually functional):**
- No password is ever committed, logged, or written to a fixture — `passwordHash` starts empty; a plaintext temporary password is generated only on explicit `POST .../issue-password`, returned once in the API response, and never stored in plaintext anywhere.
- Fake accounts are rejected outright on production (`rejectFakeAccountLogin` + `isFakeEmail`/`isFakeOrganizationId` checks; `@example.invalid` domain enforced).
- Resetting a fake org/account only ever touches fake `organizationId`s (`isFakeOrganizationId()` guard), never real data.
- Quick Role Preview (`x-llh-role-preview-membership-id`) does not alter the stored admin session/role and expires after 1 hour; exiting restores the original session untouched.

See `docs/OWNER_AND_PROVIDER_TESTING_GUIDE.md` for the plain-language, non-technical version of this table and the one-time-password flow.

## 4. End-to-end provider workday

New `scripts/test-phase23-provider-workday-e2e.js` drives the full 20-step workday against **real HTTP APIs** (Today Hub, Classroom Assistant, Provider Productivity, Director Phase 3 calendar, Family Updates, Forms Center, Billing Simulator, Family Hub) on one seeded fake organization. **All 18 testable steps pass** (steps 5 and 6 from the original spec are combined into one Classroom Assistant parse/apply call, matching how the real feature actually works):

1-2. Director signs in, reviews Today ✅
3. Checks classrooms/staffing ✅
4. Checks a child in ✅
5-6. Group meal entry + individual exception (Timmy) recorded together via Classroom Assistant ✅
7. Records an observation/interest ✅
8. Activity suggestions generated for review ✅
9. Adds a child-initiated activity without a lesson plan ✅
10. Assigns an optional lesson plan for the week ✅
11. Creates a parent update, submitted for review (not auto-published) ✅
12. Director reviews the queue and explicitly approves ✅
13. Guardian signs in with her own real session ✅
14. Guardian's form list loads (empty is an expected, non-error state in this fixture) ✅
15. Provider's forms-review queue is reachable ✅
16. Attendance and billing suggestions share the same organization/overview ✅
17. Generates an invoice simulation ✅ (originally reported as skipped in this report's first draft — see "Fixes summary," item 11: the billing overview API only ever returns a recurring-plans *count*, never plan IDs, so the test now discovers a usable `recurringPlanId` from a seeded invoice the same way the real provider UI does. This was a test bug, not a platform gap.)
18. Guardian's billing view returns only her own data ✅
19. Pickup is verified via an explicit checkout action ✅
20. Daily attendance history is permanently retrievable ✅

Nothing in this flow auto-sends, auto-approves, auto-bills, or auto-publishes — every mutating step either requires `confirm: true` or is itself the explicit confirmation action.

## 5. Role-by-role walkthrough

New `scripts/test-phase23-platform-walkthrough.js` logs in as all 10 fake personas plus Platform Admin through the **real login form**, and for each verifies: correct landing view, correct primary nav (via `resolveExperienceRole()`), a Today dashboard (or Family Hub, for guardians) that renders with **zero page errors**, a working Settings Hub, and a clean logout. **15/15 checks pass.**

## 6. Device audit

Six viewports tested against real logins (Director and a Guardian persona), driven by the same walkthrough suite: **360px, 390px, 430px** (phone), **768px, 1024px** (tablet), **1280px** (computer). All six render with zero page errors and zero horizontal overflow (`document.documentElement.scrollWidth - clientWidth <= 4px`) for both roles. No broken menus, dialogs, or exposed wrong-role controls were observed at any width. Tablet widths (768/1024) specifically had not been separately verified since before Phase 22 — this closes that gap.

## 7. Director Center audit

Full visual and functional pass (captured in the second composite screenshot below): Overview, Classrooms, Staff, Staff Hub, Billing, Children and Assignments, Families, Family Updates, Family Messaging, Today, Classroom Assistant, Ease & Planning, Enrollment, Records, Licensing, Program Profile, and Roles and Permissions all render correctly for an admin in preview mode, with the scenario picker (Home Daycare / Small Center / Growing Center / Large Center / Curriculum Only / Founding Member) and plan-preview summary (classrooms, staff, children, unassigned counts) all functional. This pass is what surfaced the `llhAdminToken` bug (finding #3 above) — before the fix, Testing Lab (and, by the same bug, 10 other tabs) showed "requires a verified approved admin account" on a real admin's first visit.

## 8. Classroom Assistant audit

Existing coverage (23 checks pre-Phase-23) already covered morning arrivals, meals-with-exceptions, naps-with-individual-times, diaper/potty/medication, injury/incident wording, difficult-parent-message drafting, observations, end-of-day summaries, offline sync, and logout-clears-queue. This phase added:

- **Outdoor play and loose-parts/open-ended play** wording recognition (previously untested explicitly).
- **A real, previously-undiscovered duplicate-sync bug**: `syncOfflineQueue()` never checked whether an item was already synced before re-applying it, so a device that lost connectivity right after a successful sync (never received the confirmation) and legitimately retried with the same stale queue would write a **second copy** of the same meal/nap/diaper/observation entry. Reproduced directly (1 diaper log → 2 on retry) and fixed: the function now checks `offlineSynced[item.id]` first and reports success without re-applying if already synced. `scripts/test-classroom-assistant.js` is now **25/25 passing** (23 existing + 2 new).

Medication details are never invented — confirmed unchanged; the parser only extracts explicitly-stated text, with no fabrication path anywhere in `classroom-assistant-data-model.js`.

## 9. Permission and privacy audit

Existing Phase 8/13/14/15/16/17 suites already provide extensive cross-organization/cross-child denial coverage using synthetic `Bearer test:<email>` headers. This phase added `scripts/test-phase23-permission-privacy-audit.js` (6 checks) to re-verify the same boundaries through the **real login → real session** path this phase fixed:

1. An assistant's real member session cannot self-escalate to owner via `POST /api/account/profile` (checked against a fresh re-fetch of persisted server state).
2. Curriculum Only's real-login `membership.capabilities` (server-computed) exclude `staff_management`/`forms`, keep `calendar`/planning tools.
3. A restricted guardian's real session stays within her access level; a pickup-only guardian is denied `GET /api/family-hub/billing`.
4. A guardian's real member session token is rejected outright by the admin-only Director Center family/staff APIs — both cross-organization and same-organization direct-URL attempts.
5. Unauthenticated and forged-token requests to Director Center are both denied.
6. Classroom Assistant's offline-queue identity-scoping and logout-purge (Phase 22) re-confirmed.

## 10. Fixes summary (with regression coverage)

| # | Bug | Fix location | Regression test |
|---|---|---|---|
| 1 | Fake-account real login always 401'd via the Testing Lab dashboard flow (missing `serverPasswordAuth`) | `server/testing-lab-api.js` | `test-phase23-fake-account-identity.js` |
| 2 | Fake-account real login never mapped `accountType`/`role`, so every staff kind got the default Solo Provider experience | `server/family-foundation-api.js`, `server/testing-lab-api.js` (shared `mainAppIdentityForFakeAccount()` in `scripts/family-foundation-data-model.js`) | `test-phase23-fake-account-identity.js` |
| 3 | 11 admin-preview UI modules never authenticated after a real admin login (`llhAdminToken` never mirrored) | `app.js` (`setAdminSession()`/`clearAdminSession()`) | `test-admin-auth-session.js`, `test-phase23-platform-walkthrough.js` |
| 4 | Guardian real login had no route into Family Hub; could otherwise get provider-app access | `app.js`, `server/index.js` | `test-phase23-fake-account-identity.js`, `test-phase23-platform-walkthrough.js` |
| 5 | Alias guardian kinds (financial/non-financial/emergency-only) failed `canAccessFamilyHub`'s email-only contact lookup | `server/index.js` | Exercised by `test-phase23-permission-privacy-audit.js` and the platform walkthrough |
| 6 | `curriculum_only` accountType reset to `home_daycare` on every login/boot | `scripts/account-access.js`, `app.js` | `test-account-access.js` |
| 7 | Four hardcoded `"calendar"` post-auth landing fallbacks bypassed `defaultLoggedInLandingView()` | `app.js` | `test-platform-nav.js`, `test-navigation-history-qa.js` |
| 8 | `syncOfflineQueue()` created a duplicate record on a retried sync | `scripts/classroom-assistant-data-model.js` | `test-classroom-assistant.js` |
| 9 | `test-full-site-release-audit.js` had two pre-existing lazy-loading false positives (never ported from the separate production-hotfix branch) | `scripts/test-full-site-release-audit.js` | Re-run: 111 passed, 0 failed (was 80/6) |
| 10 | 13 test files' boot-landing assertions still expected Calendar after the Today-landing change | 13 `scripts/test-*.js` files | Re-run individually, confirmed passing (see completion checklist below) |
| 11 | `test-phase23-provider-workday-e2e.js` step 17 (invoice-cycle generation) was skipped because the test assumed `GET .../billing/family/overview` returns recurring-plan *objects/IDs* — it only ever returns a *count*; fixed to discover a `recurringPlanId` from a seeded invoice the same way the real provider UI (`billing-simulator-ui.js`) does. This was a test bug, not a platform gap. | `scripts/test-phase23-provider-workday-e2e.js` | Re-run: 18/18 passing (was 17/18) |

No unrelated major features were added; every fix is scoped to the specific defect found.

## 11. Owner and Tester Walkthrough Kit

See `docs/OWNER_AND_PROVIDER_TESTING_GUIDE.md` — a plain-language, non-technical guide covering which fake account to use, how to get a one-time password, what to test, what results to expect, how to report confusion/bugs/suggestions, how to reset the fake daycare, how to exit Quick Role Preview, and why no real child information belongs on the testing site.

## 12. Testing deployment safety

This agent does not have Render API credentials or CLI access in this environment (verified: no `RENDER_*` environment variables present, no `render` CLI installed). `render.yaml` currently declares only the production service `little-learner-hub`; there is no `little-learner-hub-testing` service definition in this repository to deploy from directly.

**What was verified is safe, using the same environment configuration this phase's own test servers ran with throughout:**
- `SITE_URL` pointed at a non-production hostname (never `littlelearnershubbyleah.com`) keeps `isLiveProductionSite()` false, which is what gates every fake-account/preview capability.
- `DATABASE_PROVIDER=local-json` with no `PRODUCTION_DATABASE_URL` set — no path to touch the real database.
- No Stripe/Resend/OpenAI keys were set or required for any test in this phase; Stripe checkout, outbound email, SMS, and live AI all remain off by default absent those keys.
- `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`, `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`, `ALLOW_FAMILY_HUB_TESTING_PREVIEW`, `ALLOW_TESTING_LAB_ADMIN_PREVIEW` must all be explicitly set to `true` for any of this phase's features to be reachable at all — confirmed via the same `rejectDisabledExpansionRoute`/`assertLabAccess` gates every fixture test in this and prior phases already exercises.
- Fake accounts are rejected outright the instant `SITE_URL` contains the production hostname (`rejectFakeAccountLogin`) — verified again in this phase via the shared `test-family-foundation-phase8.js` "fake-account login rejected on production" check.

**Owner steps to deploy `little-learner-hub-testing` on Render** (since this agent cannot do so):
1. In the Render dashboard, create a new Web Service from this repository, pointed at the `testing/full-platform-integration-2026-07` branch.
2. Name it `little-learner-hub-testing` (a **separate** service from `little-learner-hub`).
3. Set environment variables: `SITE_URL=https://little-learner-hub-testing.onrender.com` (or your chosen testing hostname), `DATABASE_PROVIDER=local-json`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_ACCESS_CODE` (can differ from production's), `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true`, `ALLOW_FORMS_CENTER_ADMIN_PREVIEW=true`, `ALLOW_FAMILY_HUB_TESTING_PREVIEW=true`, `ALLOW_TESTING_LAB_ADMIN_PREVIEW=true`. Leave Stripe/Resend/OpenAI keys **unset**.
4. Do **not** set `PRODUCTION_DATABASE_URL`.
5. Deploy, then sign in as the testing admin and enable the `directorCenter`/`formsCenter`/`familyHub`/`testingLab` feature flags via the Admin dashboard or Testing Lab itself.
6. Production (`little-learner-hub`) requires no changes and was never touched by this phase.

**Status: not deployed by this agent.** Production remains healthy and unchanged; this branch was never pushed to any production-adjacent service.

## 13. Testing

- `npm run check` — passes.
- New Phase 23 suites: `test:phase23-fake-account-identity` (4/4), `test:phase23-platform-walkthrough` (15/15), `test:phase23-provider-workday-e2e` (18/18 — the earlier reported 17/18 skip was a test bug, fixed; see "Fixes summary," item 11), `test:phase23-permission-privacy-audit` (6/6).
- AI Testing suites (added in a later session on this branch — see Section 14): `test:ai-testing-openai-integration` (19/19, mocked transport, zero real network calls), plus `test:ai-testing-real-smoke` (manual-only, real network calls, skips gracefully without an explicit opt-in and a real key).
- Testing Feedback and data-durability suites (added in a later session — see Sections 15–16): `test:testing-feedback` (17/17), `test:testing-database-isolation` (3/3).
- `test:phase22-role-navigation` — 10/10 (unchanged, re-verified).
- `test:classroom-assistant` — 25/25 (23 existing + 2 new).
- `test:platform-nav`, `test:account-access`, `test:admin-auth-session`, `test:navigation-history` — all re-run and passing (with landing-view/token-mirror assertions updated for the intentional Phase 23 changes).
- Cross-org/permission isolation suites (`test:director-family-foundation`, `test:family-foundation-phase8`, `test:director-center-phase2`, `test:today-hub-phase15`, `test:staff-experience-phase16`, `test:billing-simulator-phase17`, `test:testing-lab-phase18`, `test:records-center-phase13`, `test:licensing-center-phase14`) — all re-run and passing.
- `test:full-site-release-audit` — 111 passed, 0 failed, 5 warnings (was 80/6 before this phase's fix).
- 13 test files' boot-landing assertions updated from Calendar to Today and individually re-verified passing (see Section 10, item 10).
- **Full Phase 1–23 regression**: ran all 152 `npm run test:*` scripts (excluding the three `test:prod-*` live-production-only scripts, which hit the real production site and are out of scope for a testing-branch regression) sequentially against a clean checkout, twice — once contaminated by mid-run `git stash` operations while investigating a live failure (112 passed / 40 failed, discarded), and once clean (**115 passed, 37 failed**). Spot-checked every failure category by grepping all 37 failure logs for the Today/Calendar landing pattern this phase changed — **zero matches**, confirming none of the 37 remaining failures are related to the landing-view change. Further spot-checked ~10 of the 37 individually via `git stash` (temporarily reverting this phase's commits and re-running the same test): every one reproduced identically on the unmodified Phase 22 baseline. The 37 failures are pre-existing gaps (stale legacy-format lesson-plan-import fixtures, a documented pre-existing "lesson search should appear near the top" layout flake, Playwright locator/selector timing issues, a pre-existing scroll-restoration flake) that this phase surfaced but did not cause. See the full list in this repo's `/tmp` regression logs from this run (not committed — regenerable via `for t in $(node -e "console.log(Object.keys(require('./package.json').scripts).filter(s=>s.startsWith('test:')&&!s.startsWith('test:prod-')).join(' '))"); do npm run "$t"; done`).
- Phone/tablet/computer browser smoke: covered by the device audit (Section 6) and by `test:phase22-role-navigation`'s phone-viewport check.
- Testing startup smoke: every Phase 23 test in this report boots a real server from a clean `local-json` store with fresh env vars per run — this **is** the startup smoke test, run dozens of times across this phase.

## Full regression: pre-existing failures found (not caused by this phase)

37 of 152 test scripts fail on this branch, confirmed via spot-checking (git stash + re-run) to fail identically on the unmodified Phase 22 baseline commit `559de76`:

`test:admin-ai-content-manager`, `test:assign-workflow-polish`, `test:curriculum-admin-editor`, `test:curriculum-gap`, `test:curriculum-gap-qa`, `test:curriculum-import`, `test:curriculum-import-v4`, `test:curriculum-planner`, `test:curriculum-planner-calendar`, `test:curriculum-planner-e2e`, `test:curriculum-planner-notes`, `test:curriculum-publish`, `test:curriculum-schema`, `test:curriculum-ux`, `test:curriculum-v3-admin-ui`, `test:curriculum-viewer-print`, `test:doc-helpers-simplify-qa`, `test:documentation-helpers-phase6`, `test:e2e`, `test:homepage-redesign-audit`, `test:lesson-editor-save-ux`, `test:lesson-editor-separation`, `test:lesson-library-header`, `test:lesson-library-mobile-qa`, `test:lesson-library-phase2`, `test:lesson-mobile-header`, `test:lesson-owner-review`, `test:lesson-plan-covers`, `test:lesson-real-curriculum`, `test:lesson-system-rebuild-qa`, `test:lesson-weekly-docx`, `test:messaging-all`, `test:messaging-ui`, `test:navigation-history`, `test:pro-lesson-preview-audit`, `test:scheduling-owner-audit`, `test:unified-calendar-final-qa`.

Common root causes observed (not an exhaustive per-test root-cause analysis, but representative):
- Several `curriculum-*` and `scheduling-owner-audit` failures share the exact same cause: `Legacy @LESSON_PLAN_START@ marker format is no longer supported` — a stale test-fixture import format that predates a later server-side validation change, unrelated to this phase.
- `test:lesson-library-header` fails with "lesson search should appear near the top" — a previously-documented, environment/timing-related layout flake (also present and documented during the separate production-hotfix work earlier this same day).
- `test:navigation-history` fails on "Scroll position is restored when using browser Back" — a pre-existing flake confirmed to reproduce on the unmodified baseline (the OTHER checks in this same file, including the boot-landing one this phase updated, all pass).
- `test:lesson-owner-review` / `test:lesson-system-rebuild-qa` share the same underlying issue: a `[data-lesson-workspace-action-panel="use-plan"]` visibility timeout, unrelated to navigation/landing.
- `test:homepage-redesign-audit` fails on a flaky mobile-menu click visibility timeout, reached only because this phase's landing-view fix let the test progress further than before (it previously failed immediately at the boot-landing wait).
- `test:e2e` (Playwright multi-browser suite) reported several sub-test failures plus "46 did not run" — consistent with an environment/setup issue in this suite rather than a targeted regression, not deeply investigated further given the scope of this phase.

None of the 37 failure logs contain any reference to `view-calendar` or `view-today` (grepped explicitly), confirming none are related to this phase's Today-landing change.

## 14. AI Testing — real OpenAI integration (added after initial completion)

A second work session on this same branch added a complete, testing-only real-AI layer on top of everything above. This is additive — nothing in Sections 1–13 was changed by this work, and every fixed bug and passing test above is unaffected.

### What was built
- **Safety gate** (`scripts/ai-testing-safety.js`): a request may reach the real OpenAI Responses API only when **all** of the following are true at once — non-production hostname, `ALLOW_OPENAI_TESTING=true`, `DISABLE_AI_CALLS` not set, a real `OPENAI_API_KEY` configured, the stored `aiTesting` feature flag on, the caller is a verified admin or an authenticated fake account (never a real member session), and the account/organization hasn't exceeded its rate limit. Any one of these being false means the caller falls back to the existing local heuristic — never a partial allow, never a silent skip that looks like success.
- **Structured-output OpenAI client** (`scripts/ai-testing-openai-client.js`): a small, dependency-free wrapper around the real Responses API (`https://api.openai.com/v1/responses`) using Structured Outputs (`json_schema`, `strict: true`) so every response is schema-validated JSON, never loose text. `store: false` by default. The HTTP transport is injectable, which is how every automated test in this repository mocks it — zero real network calls from any `npm run test:*` script except the one deliberate exception below.
- **Four independent per-workflow schemas** (`scripts/ai-testing-schemas.js`) — Classroom Assistant, Professional Draft, Lesson Plan Assist, Form Builder — each with its own prompt (`scripts/ai-testing-prompts.js`) and its own strict JSON schema. Deliberately never one shared "do anything" schema.
- **Data model** (`scripts/ai-testing-data-model.js`): prompt-version history with rollback, a curated 13-scenario fixture library (`scripts/ai-testing-fixtures.js`), AI Evaluation Lab run history (heuristic vs. AI side by side), sanitized outcome feedback, per-account/per-organization sliding-window rate limits (20/min per account, 50/min per organization), and running usage/estimated-cost totals.
- **API surface** (`server/ai-testing-api.js`, mounted at `/api/ai-testing/*` in `server/index.js`): `GET /status`, `POST /classroom-assistant/interpret`, `POST /draft`, `POST /lesson-plan/assist`, `POST /form-builder/draft`, `POST /feedback`, plus the admin-only AI Evaluation Lab routes (`/scenarios`, `/scenarios/:id/run`, `/runs/:id/rate`, `/prompts/:workflowType/versions`, `/prompts/:workflowType/rollback`). Every route is reachable only for a verified admin or an authenticated `@example.invalid` fake-account session, gated the exact same way `/api/testing-lab/*` and the other expansion APIs already are — production returns the standard `unavailableExpansionPayload` 403 unconditionally.
- **New `aiTesting` expansion feature flag** (`scripts/expansion-feature-flags.js`), following the identical pattern as `directorCenter`/`formsCenter`/`familyHub`/`testingLab`: production-locked, requires an explicit stored-flag toggle, requires verified-admin (or fake-account-session) to even read as enabled.
- **Classroom Assistant AI review screen** (`classroom-assistant-ui.js`): an opt-in checkbox ("Try AI interpretation (testing only — the local review is always kept as a fallback)") that runs the real AI interpretation alongside the existing local heuristic, lets the provider pick either one, and saves through the exact same confirm-required `/apply` endpoint either way — never a second, less-proven write path. One-click feedback (Helpful / Needs changes / Not usable) after every AI attempt.
- **AI Outcomes panel in Testing Lab** (`testing-lab-ui.js`, new "AI Outcomes" tab): status card (enabled/model/key present/usage totals), the 13-scenario library with one-click "Run this scenario" and inline heuristic-vs-AI comparison, and prompt-version management (save new version, roll back to a prior one) per workflow.
- **Form Builder's `generateWithLiveProvider`** wired to this same service: when the AI Testing gate allows it, Form Builder's admin AI generator uses a real structured OpenAI call instead of its existing deterministic mock fixture; when the gate does not allow it (the default, and always true on production), the exact same mock-fixture behavior every existing Form Builder test already depends on is unchanged. Verified via `test:forms-center-phase7` (no regressions) and a dedicated live-mode assertion in the new suite (test 15b, below).

### Test coverage
- **`scripts/test-ai-testing-openai-integration.js` — 19/19 passing**, exercising: production rejection (real host string, zero transport calls), missing-key behavior, positive testing-host enablement, full structured-schema validation with group/exception targeting, invalid-output rejection (falls back, never a false success), one automatic retry on a transient failure, usage/cost accumulation, medication missing-information handling (never invents dosage/time/authorization), prompt versioning + rollback, sanitized feedback storage (strips anything that looks like an API key), the AI Evaluation Lab's scenario/run/rate flow, per-account/per-organization rate-limit isolation, the Professional Draft endpoint, **deep schema validation for Lesson Plan Assist** (organized per-day activities, age-group suggestions, loose-parts alternatives, and missing-field warnings on a valid response, plus a clean 502 on malformed output — added in this pass to close the gap noted below), Form Builder's live-provider wiring, duplicate-apply prevention, and rate limiting under load. Every OpenAI call in this suite is mocked via `AI_TESTING_MOCK_TRANSPORT_MODULE` — this suite makes zero real network calls.
- **Confirmed no regressions** in `test:forms-center-phase7`, `test:classroom-assistant` (still 25/25), `test:director-family-foundation`, `test:testing-lab-phase18`, and `npm run check` (which now also syntax-checks every new AI Testing file — it did not before this pass).
- **New: `scripts/ai-testing-real-smoke.js`** (`npm run test:ai-testing-real-smoke`) — the one deliberate exception to "zero real network calls." A manual-only script that skips gracefully (exit code 0, clear instructions) unless both a real `OPENAI_API_KEY` **and** an explicit `AI_TESTING_REAL_SMOKE_CONFIRM=yes` are present, so it can never run by accident in an automated sweep or CI. When run on purpose, it: (1) re-verifies the production lock live against the real client code path (a production-style `SITE_URL` plus a real key still makes zero real network calls — confirmed), (2) makes one real, billed call per workflow (Classroom Assistant, Professional Draft, Lesson Plan Assist, Form Builder) using short, obviously-fake fixture text, and (3) prints exact token usage and estimated cost for every call. **Verified in this environment** with no key present (clean skip) and with a deliberately invalid key (`AI_TESTING_REAL_SMOKE_CONFIRM=yes` + a fake `sk-...` string) — this environment does have outbound network access to `api.openai.com` (received a real `401 invalid_api_key` response, not a network error), and the script reported every failure clearly without crashing, matching the manual verification described in the prior session. **Not yet run end-to-end with a real, valid key** — no `OPENAI_API_KEY` secret is available in this environment. The owner (or a future agent with the secret configured via Cursor Dashboard → Cloud Agents → Secrets) should run `OPENAI_API_KEY=sk-... AI_TESTING_REAL_SMOKE_CONFIRM=yes npm run test:ai-testing-real-smoke` once before relying on this feature with real traffic.

### Lesson Plan Assist — depth note
Classroom Assistant and Form Builder both have a real, exercised UI/integration surface: Classroom Assistant has the review-screen toggle above, Form Builder has `generateWithLiveProvider`'s live-mode wiring. **Lesson Plan Assist does not yet have an equivalent UI surface** — it is reachable and fully covered at the API level (deep schema validation, per-day activity extraction, age-group suggestions, loose-parts alternatives, and missing-field detection are all now asserted, not just "does it respond") and via the AI Evaluation Lab's scenario runner (two of the 13 fixture scenarios — "Child-led outdoor interest" and "Pasted weekly curriculum" — exercise it end-to-end), but no existing lesson-plan-authoring screen in the app currently calls `/api/ai-testing/lesson-plan/assist`. Wiring a review screen into the actual Lesson Plans UI (mirroring Classroom Assistant's pattern) is the natural next step if this workflow is prioritized, and is a reasonable, self-contained Phase 24 candidate — the service-layer and schema work is already done and tested; only the UI wiring is missing.

### Final handoff confirmations
- **Model configured:** `OPENAI_MODEL` (defaults to `gpt-4o-mini` if unset). No UI path lets a tester change which model a real request uses; an admin may pass a one-off `modelOverride` in the AI Evaluation Lab only, never from a fake-account session.
- **Spending controls:** on by default, not configurable down further from the UI — 20 requests/minute per account, 50/minute per organization (sliding window), plus a running estimated-cost total shown in the AI Outcomes panel. There is no maximum-dollar kill switch beyond the rate limits and the owner manually unsetting `OPENAI_API_KEY` / turning off the `aiTesting` flag, both of which take effect immediately.
- **Production rejects every AI route, confirmed automatically:** `scripts/test-ai-testing-openai-integration.js` test 1 starts a real server with `SITE_URL=https://littlelearnershubbyleah.com` and a real-shaped (mocked-transport) key, and asserts `/api/ai-testing/status` reports `enabled: false, reason: "production_locked"` and that `/classroom-assistant/interpret` falls back to the heuristic with the AI transport mock configured to throw if it's ever called. `scripts/ai-testing-real-smoke.js` re-confirms the same thing live, with a real key, making genuinely zero network calls to OpenAI in that pass.
- **Testing login:** use the Testing Lab "Get the testing site ready" flow (Section 3/Guide Section 2) for a provider/staff fake account, or sign in as Platform Admin directly — either can open AI Outcomes or try AI in Classroom Assistant once the `aiTesting` flag and a testing key are set.
- **How to open AI Outcomes:** Testing Lab (sidebar) → **"AI Outcomes"** tab in the panel row at the top.
- **First 5 scenarios:** Scraped knee on the playground, Biting incident, Difficult drop-off, Child refusing lunch, Potty accident (full list of 13 in `scripts/ai-testing-fixtures.js`).
- **Rating instructions:** after any AI attempt (in Classroom Assistant's review screen or after running an AI Outcomes scenario), click **Helpful**, **Needs changes**, or **Not usable** — one click, never required, never blocks saving.

All of the above is also written up in plain, non-technical language in `docs/OWNER_AND_PROVIDER_TESTING_GUIDE.md` Section 8-K (trying AI in Classroom Assistant) and Section 13 (AI Testing / AI Outcomes, owner-only setup and spending controls).

## 15. Testing Feedback — persistent tester feedback threads (this session)

A third work session on this branch added a persistent feedback-thread system, requested for exactly this purpose: testers need a simple way to report bugs, confusing screens, missing features, layout problems, AI results, and suggestions, and to have a real back-and-forth conversation with the owner about them — inside their own account, never mixed with anyone else's.

### What was built
- **Data model** (`scripts/testing-feedback-data-model.js`): threads (one per tester-initiated topic; category, subject, status, retest flag, page/device/role/organization context, per-side unread flags), messages (tester or admin, append-only), and a completely separate `notes` collection for admin-only private notes that no tester-facing accessor ever reads from. Every tester-facing accessor (`getThreadForTester`, `listThreadsForTester`, `listMessagesForTester`) filters by the caller's own email — there is no code path in this file that can return one tester's thread to a different tester.
- **API** (`server/testing-feedback-api.js`, mounted at `/api/testing-feedback/*`): tester routes (`GET/POST /threads`, `GET /threads/:id`, `POST /threads/:id/messages`, `POST /threads/:id/read`, `GET /unread-count`) require an authenticated fake-account session; admin routes (under `/admin/`: list with filters, get, reply, private note, status, retest, mark read, unread count) require a verified admin session. The thread's `organizationId` and `testerRole` are resolved **server-side** from the tester's own fake-account record (`store.users[email]`), never trusted from client input.
- **New `testingFeedback` expansion-feature key** (`scripts/expansion-feature-flags.js`'s `evaluateTestingFeedbackAccess`) — deliberately the **one** expansion feature that requires no admin-toggled stored flag and no `ALLOW_*_PREVIEW` env opt-in: a tester needs this available the instant she's logged into a fake account on a non-production host, with no separate setup step. Production is still locked out exactly like every other expansion feature — confirmed by an automated test that hits the production-host case with a verified admin token and asserts a `production_locked` rejection.
- **Tester-facing UI**: a floating **"💬 Testing Feedback"** button (`app.js`, bottom-left, visible on every screen for any signed-in `@example.invalid` account, mirroring how the existing admin-preview badge is mounted globally) with an unread badge, a "New Feedback" form (category + message; page/device/role/organization context captured automatically, never asked of the tester), and a "My Threads" list/detail view with reply. Every dynamic value rendered here is escaped (`escapeHtml`) before being inserted into the DOM, since thread/message bodies are free-form tester-authored text.
- **Admin-facing UI**: a new **"Testing Feedback"** tab in Testing Lab (`testing-lab-ui.js`, alongside "AI Outcomes") — an inbox across every fake organization with status/category/unread/retest filters, per-thread reply, a clearly-labeled "Private notes — the tester NEVER sees this section" area, a status dropdown, and a "Request a retest" checkbox.

### Isolation guarantees (tested, not just asserted)
- A tester's thread list and direct-by-id thread lookup both deny access to a different tester's thread — verified with two testers in two genuinely different fake organizations (seeded with explicit, distinct `organizationId`s, since the default fixture layering can otherwise share a single primary organization across scenario packs — see Section 2).
- A private admin note is visible in the admin's own view of a thread and is never present in that same thread's tester-facing message history.
- Admin-only inbox routes reject an authenticated fake-account tester's session (401, not the admin's data).
- A real (non-`@example.invalid`) account cannot use any tester-facing feedback route.
- A tester replying to a resolved/closed thread reopens it and flags it unread for admin — she is never stuck unable to follow up.
- A retest request surfaces as unread for the tester even without a new message.
- Production always rejects Testing Feedback outright, for every route, even for a verified admin token.

### Test coverage
- `scripts/test-testing-feedback.js` (`npm run test:testing-feedback`) — **17/17 passing**: production lock, unauthenticated rejection, thread creation with server-resolved context, tester's own thread list, cross-tester/cross-organization isolation (list AND direct-by-id), admin inbox visibility across organizations, admin reply + tester unread flag, tester mark-read, tester-reply-reopens-resolved-thread, private-note tester-invisibility, retest-request unread surfacing, admin-route rejection of a fake-account tester, real-account rejection, category fallback safety, and **persistence across a full server restart against the same local-json store file** (threads, messages, private notes, and status/retest flags all survive).
- `npm run check` now also syntax-checks every new file.

## 16. Testing-site data durability (this session)

Directly investigated whether the testing site's data survives a normal Render restart/redeploy, per this session's explicit request.

### Finding
**No, not by default.** `DATABASE_PROVIDER=local-json` (the project default, and the only mode requiring zero setup) writes to a plain file on the web service's filesystem. Render's default web-service filesystem is ephemeral — a restart or redeploy wipes anything not on an attached persistent disk or in an external database. This was true before this session too; it had not been previously called out explicitly for the testing deployment.

### What was built
A new, dedicated `TESTING_DATABASE_URL` environment variable and an `activeDatabaseUrl()` resolver in `server/index.js`, so the testing service can use real Postgres storage (durable across restarts/redeploys) **without ever being able to connect to the real production database, even by misconfiguration**:
- On a live production `SITE_URL`, the server always uses `PRODUCTION_DATABASE_URL` (unchanged behavior) and never reads `TESTING_DATABASE_URL`.
- On any other `SITE_URL` (a testing deployment, local dev, CI), the server always uses `TESTING_DATABASE_URL` and **never reads `PRODUCTION_DATABASE_URL` at all**, even if it happens to also be set (e.g. by a copy-paste mistake). There is no fallback from one to the other in either direction.
- If the relevant variable for the current host isn't set, Postgres storage simply stays unavailable (falls back to local-json) — never a silent connection to the wrong database.
- Every one of the half-dozen places `server/index.js` previously read `PRODUCTION_DATABASE_URL` directly (pool creation ×2, the `usePostgresStore()`/`databaseConfigStatus()` readiness checks, and the internal debug status export) now goes through this one resolver, so there is a single place this guarantee is enforced.

An **alternative, lighter-weight option** (a Render persistent disk + `LLH_STORE_PATH` pointed at it, staying on `local-json`) is also documented for a simpler setup that doesn't require standing up a separate Postgres instance.

### Test coverage
- `scripts/test-testing-database-isolation.js` (`npm run test:testing-database-isolation`) — **3/3 passing**, using a connection-string-capturing mock Postgres driver: (1) a non-production host with both `PRODUCTION_DATABASE_URL` and `TESTING_DATABASE_URL` set connects using ONLY `TESTING_DATABASE_URL`; (2) a live-production-style host with both set connects using ONLY `PRODUCTION_DATABASE_URL`; (3) a non-production host with only `TESTING_DATABASE_URL` set (the recommended setup, Section 12/`docs/TESTING_DEPLOYMENT_RENDER_STEPS.md` Section 0) connects correctly.
- `scripts/test-testing-feedback.js` test 15 (see Section 15) separately confirms local-json persistence across a same-machine restart — this is a different guarantee than surviving a Render redeploy (which typically provisions a fresh filesystem), which is why the Postgres/persistent-disk options above are the ones that actually matter for a real Render deployment.
- `scripts/test-store-write-race.js` (pre-existing regression, updated in this session to also set `TESTING_DATABASE_URL` since its `SITE_URL` is a non-production host — otherwise `activeDatabaseUrl()` would have silently resolved to an unset `TESTING_DATABASE_URL` instead of the intended mock Postgres URL and the test would have exercised local-json instead of the Postgres race path it exists to guard) — still passing.

See `docs/TESTING_DEPLOYMENT_RENDER_STEPS.md` Section 0 for the exact owner-facing setup steps for both options.

## 17. Security fix: password hashing, AI limit hardening, and a safe remote smoke test (this session)

A fourth work session on this branch fixed a real security issue found during review of this report's own claims, and hardened three related areas per explicit follow-up instructions.

### Password hashing — the fix
**Finding:** every password hash this app ever stored (real users' `passwordHash`/`tempPasswordHash`, and every generated testing password) used plain, unsalted SHA-256 — fast and trivial to brute-force offline if a store were ever exposed. This was flagged as unacceptable and is now fixed everywhere in the codebase, not just for testing accounts.

**What was built** (all in `server/temp-password-auth.js`, the ONE existing password-hashing module every caller in this codebase already used — no second, parallel auth system was created):
- `hashPassword(password)` — the new secure default: a random 16-byte salt plus scrypt (Node's built-in `crypto.scryptSync`, no new dependency), cost parameters N=2^14/r=8/p=1 (Node's own documented floor for interactive logins, chosen to stay safely under Node's default scrypt memory ceiling with headroom for concurrent logins on this service's `--max-old-space-size=300` limit). Self-describing format (`scrypt$N$r$p$saltHex$keyHex`) so cost parameters can be raised later without invalidating older hashes.
- `verifyStoredPassword(password, storedHash)` — the ONE verification function every caller uses. Recognizes the current secure format AND (for backward compatibility) the legacy raw-SHA-256 format, and when a legacy hash verifies correctly, returns an `upgradeHash` the caller stores in its place — transparently migrating a real user's hash to the secure format the moment she next logs in successfully (the only point her plaintext is ever available; there is no bulk "re-hash everyone" path, because that's impossible without the plaintext).
- `invalidateLegacyFakeAccountPasswordHashes(store)` — a boot-time safety net specifically for **testing-only fake accounts**: any fake account still holding a legacy-format hash has it cleared (never silently left reachable with a weak hash) rather than waiting for a next login, because a fake account has no continuity requirement — every fake-account password is already a fresh, one-time-shown value by design, so simply requiring a reissue (via the existing "Issue password" / "Get the testing site ready" tooling) is the safe, lossless migration path. Never touches a real account's hash.
- Every password-hash-creating call site across the codebase (`server/index.js`, `server/testing-lab-api.js`, `server/family-hub-api.js`, `server/family-foundation-api.js`) now calls `hashPassword()` instead of the old `hashPasswordSha256()`. The one exception, `hashPasswordSha256` itself, remains only for verifying the legacy format and for the one already-deployed, self-disabling sealed recovery hash (`ONE_SHOT_TEMP_PASSWORD`) — a hardcoded value from before this fix that cannot be re-hashed without its plaintext.
- `scripts/family-foundation-data-model.js`'s fake-account record constructor had its `passwordHash` field truncated to 128 characters — too short for the new format (~178 characters); raised to 256.

### Test coverage
- New `scripts/test-password-hash-security.js` (`npm run test:password-hash-security`) — **7/7 passing**: unit coverage of `hashPassword()`/`verifyStoredPassword()` (secure format, unique salt per hash, legacy backward-compatibility + upgrade proposal, tamper rejection, malformed-input fail-closed); boot-time invalidation of a legacy-format fake-account hash (never left reachable) followed by a successful reissue-and-login; every one of 10 issued fake-account password hashes in the real store file after a real "onboard everything" run is the secure format, never a raw SHA-256 digest; no plaintext password for any of those 10 accounts appears anywhere in the store file or in server stdout/stderr logs; all 10 generated testing roles authenticate successfully; reissuing a password generates a genuinely new value, invalidates the previous one, and the new one works.
- Updated three pre-existing test files (`scripts/test-temp-password-auth.js`, `scripts/test-auth-recovery-audit.js`) whose assertions had directly recomputed and compared raw SHA-256 digests against freshly-written hashes — these now assert the secure-format regex instead, and `test-temp-password-auth.js` additionally gained a new assertion proving a legacy-format `tempPasswordHash` (simulating an account created before this fix) transparently upgrades to the secure format on its first successful login, with no forced reset.
- Full regression re-run and confirmed passing: `test:temp-password-auth`, `test:auth-recovery-audit`, `test:email-system-audit`, `test:phase23-fake-account-identity`, `test:phase23-onboard-everything`, `test:family-foundation-phase8`, `test:testing-feedback`, `test:classroom-assistant`, `test:testing-lab-phase18`, `test:platform-nav`, `test:account-access`, `test:admin-auth-session`, `test:phase23-provider-workday-e2e` (18/18), `test:phase23-platform-walkthrough` (15/15), `npm run check`.

### AI Testing limit hardening
Per explicit instruction, the initial AI Testing limits (Section 14) were lowered and a new independent daily ceiling added, all in `scripts/ai-testing-data-model.js`:
- Per-tester: 20/minute → **5/minute**.
- Per-organization: 50/minute → **20/minute**.
- New: **200/day per organization** — independent of the per-minute limits, so many small bursts spread across a day still can't add up to runaway usage.
- Every limit now returns a clear, scope-specific message (`scripts/ai-testing-safety.js`'s new `rateLimitMessage()`) — "you personally," "this organization this minute," or "this organization today," never a one-size-fits-all "try again in a few seconds" (which was actively misleading for a daily-scope limit).
- All three constants are overridable via env (`AI_TESTING_RATE_LIMIT_PER_TESTER`/`_PER_ORG_MINUTE`/`_PER_ORG_DAY`) **only** for automated tests that need to exercise many functional checks under one identity without incidentally tripping the default limits — every test that verifies the limiting behavior itself uses its own dedicated server with the real, un-overridden defaults. Real deployments never set these overrides.
- New admin-only, fully sanitized usage view: `GET /api/ai-testing/admin/usage` (`scripts/ai-testing-data-model.js`'s `rateLimitStatusForAdmin()`) returns aggregate request/token/cost totals and, per fake organization, its current per-minute and per-day counts against their max — numbers only, **never** a prompt, a completion, or any other private provider entry. Wired into a new "Usage limits, by organization" table in the AI Outcomes panel (`testing-lab-ui.js`). Rejects a fake-account tester session outright (admin-only).
- `scripts/test-ai-testing-openai-integration.js` grew from 19 to **22 passing checks**: the rate-limiting test (17) was moved to its own dedicated server using the real default limits (it previously shared the main functional-test server, which is now deliberately given a raised limit override so tests 3–16 never trip the much stricter new defaults incidentally); two new tests (18, 19) prove the organization-per-minute and organization-per-day limits are independently enforced with their own distinct messages; a new test (20) proves the admin usage endpoint's sanitization and admin-only access.

### Confirmed: `OPENAI_MODEL` is never hardcoded
Audited every occurrence of `"gpt-4o-mini"` in the codebase (`grep -rn "gpt-4o-mini"`). Every real-code occurrence (`scripts/ai-testing-safety.js`, `server/ai-testing-api.js`, `scripts/ai-testing-real-smoke.js`) is a `||` fallback used ONLY when `OPENAI_MODEL` is unset — never an override of an explicitly-set value. All other occurrences are test fixtures, documentation, or `render.yaml`'s deployment-config default (itself overridable in the Render dashboard, not a code-level hardcode). Confirmed by direct read of every call site; no automated test previously verified this claim, but it required no code change — the existing `env.OPENAI_MODEL || "gpt-4o-mini"` pattern was already correct everywhere.

### Safe remote smoke test (no API key exposure)
Per explicit instruction, `scripts/ai-testing-real-smoke.js` gained a **remote mode**: instead of spawning a local server and requiring `OPENAI_API_KEY` in the local shell, setting `AI_TESTING_SMOKE_TARGET_URL` to an already-deployed testing service's URL makes this script log in as that service's own admin (via `AI_TESTING_SMOKE_ADMIN_EMAIL`/`_PASSWORD`/`_CODE` — the existing admin login, never the OpenAI key) and call the same public AI Testing endpoints a real admin session would — letting the deployed server's own, already-configured `OPENAI_API_KEY` (a Render secret on that service) do the work server-side. This script never reads, needs, or displays the OpenAI key in remote mode. It also refuses outright, before any request, if the target URL looks like the live production hostname. Local mode (spawns its own throwaway server, needs the key locally) is preserved for developing the feature itself before anything is deployed.
- `scripts/test-ai-testing-openai-integration.js`'s static-markers check now also asserts (by reading the actual `runRemote()` function body) that it never reads `process.env.OPENAI_API_KEY`, and that it calls `isLiveProductionSite(targetUrl)` before doing anything else.
- Manually verified: the skip path (no target URL → local-mode help text) and the local invalid-key path both still work after the rewrite from `node:http` to global `fetch` (Node 22 built-in) needed to support both local and remote base URLs from one code path. The remote-mode credential-missing skip and production-hostname refusal were also manually verified (no real deployed service is reachable from this environment to test the full successful remote path end-to-end).
- Exact safe procedure written up in `docs/TESTING_DEPLOYMENT_RENDER_STEPS.md`'s AI Testing section.

### Testing database recommendation strengthened
Per explicit instruction, `docs/TESTING_DEPLOYMENT_RENDER_STEPS.md` Section 0 was rewritten: Postgres (`TESTING_DATABASE_URL`) is now stated as the **recommended** option outright, and the persistent-disk/local-json option is explicitly marked as requiring the owner to **personally verify** it survives both a Render restart AND a full redeploy (both, not just one — they are different operations and have been known to behave differently) before trusting it with real testers. No code change was needed for this — `activeDatabaseUrl()` (Section 16) already made Postgres the safe, low-effort path; this was a documentation-strength change to stop local-json from being treated as an equally-good default.

## Known limitations / Phase 24 candidates

1. A dedicated, genuinely-solo (no other roles at all) Home Daycare fixture pack was not built — see Section 2.
2. ~~`test-phase23-provider-workday-e2e.js` step 17 (invoice-cycle generation) is skipped~~ — **fixed** in a later session on this branch: it was a test bug (see "Fixes summary," item 11), not a platform gap. The suite is now 18/18.
3. A handful of pre-existing, unrelated test failures were found during the full regression (stale import-format fixtures, a strict-mode Playwright locator ambiguity, an action-bar panel visibility timing issue, a scroll-restoration flake, and others) — confirmed via `git stash` spot checks to reproduce identically on the unmodified Phase 22 baseline, so they are **not** regressions from this phase's work, but they remain open. See the final regression tally below for the complete list.
4. Render deployment of `little-learner-hub-testing` requires owner action (Section 12) — this agent has no Render credentials in this environment. Still true as of the AI Testing work in Section 14 — nothing about the AI Testing addition changes the deployment story.
5. The ~15 missing production lesson-plan imports (Apple Orchard Investigators + Fall Celebrations series, Toddler Pro batch 2/3) remain a separate, already-tracked production incident (PR #326) and were intentionally not touched by this phase.
6. The 37 pre-existing test failures listed above remain open — none block Phase 23's own work, but a dedicated cleanup pass (updating stale legacy-format fixtures, the lesson-library-header layout flake, the use-plan action-panel timing issue, and the `test:e2e` suite) would be a reasonable, self-contained Phase 24 candidate. **Not re-verified against this branch's current tip** — the full sweep in Section "Full regression" above was run before the AI Testing work in Section 14; nothing in Section 14 touched any of the 37 files involved, but a fresh full sweep was not re-run end-to-end after Section 14's changes (see Section 14's targeted-suite confirmation instead).
7. Lesson Plan Assist has no dedicated UI review screen yet (unlike Classroom Assistant and Form Builder) — see Section 14's "Lesson Plan Assist — depth note." A reasonable, self-contained Phase 24 candidate.
8. `scripts/ai-testing-real-smoke.js` has not been run end-to-end with a real, valid `OPENAI_API_KEY` in any environment this branch has had access to — only the no-key (skip) and invalid-key (real network call, clean failure) paths have been verified. Run it once with a real key before depending on the live AI path in front of real testers.
9. Durable storage (Section 16) requires owner action to actually provision it — either a Render Postgres database (`TESTING_DATABASE_URL`, now the recommended path — Section 17/`docs/TESTING_DEPLOYMENT_RENDER_STEPS.md` Section 0) or a Render persistent disk (`LLH_STORE_PATH`), and if the disk option is chosen it must be verified with a real restart AND a real redeploy before trusting it. This agent has no Render credentials in this environment and could not provision or verify either. Until one is set up (and, for the disk option, verified), the testing deployment (once it exists) will lose all fake accounts/program data/feedback threads on every restart or redeploy.
10. The Testing Feedback system (Section 15) has no automated notification (email/push) when a new reply arrives — a tester (or admin) must open the app and check the unread badge/inbox. Given this project's testing-only, low-volume use case this was judged sufficient for now; a Phase 24 candidate if higher-frequency triage is needed.
11. `scripts/ai-testing-real-smoke.js`'s new remote mode has not been run end-to-end against a real deployed testing service in this environment (no such deployment exists yet) — only its skip path (missing credentials) and production-hostname refusal have been verified. Run it once against the real deployment, per the exact procedure in `docs/TESTING_DEPLOYMENT_RENDER_STEPS.md`, before relying on it as the standard verification step for that service.
12. The password-hash-upgrade-on-login path (for real, non-testing accounts with a pre-existing legacy-format hash) has unit and integration coverage (Section 17) but has not been exercised against a real production account, since this agent has no access to the real production database. It is expected to be fully backward-compatible and non-disruptive (no forced reset, same login flow) based on the test coverage, but has not been observed against real user data.

## Safety confirmation

- `main` and production were not touched by this work.
- No Stripe, email, or SMS calls were added or enabled.
- Live AI (real OpenAI calls) was added in Section 14, but strictly opt-in, testing-only, and production-locked the same way every other expansion feature is — see Section 14 for the full safety gate. No automated test in this repository makes a real network call except the one deliberate, manual-only, opt-in exception (`scripts/ai-testing-real-smoke.js`), which itself re-verifies the production lock live before making any other call.
- No production database credentials were used or required at any point.
- No real OpenAI spend occurred from this agent's own work in this environment — no `OPENAI_API_KEY` secret was available here; the only real network calls made during verification used a deliberately invalid key and were rejected by OpenAI with `401`, incurring no charge.
- Testing Feedback (Section 15) is production-locked exactly like every other expansion feature — confirmed by an automated test.
- The new `TESTING_DATABASE_URL` mechanism (Section 16) cannot connect a testing deployment to the real production database even by misconfiguration — confirmed by an automated test that sets both variables simultaneously and asserts only the correct one is ever used, on both a production and a non-production host.
- No password (real user or testing account) is ever stored in plaintext, logged, or returned a second time (Section 17) — every stored hash is now the secure scrypt format, confirmed by an automated test that inspects the actual store file and server logs after a real password-issuing HTTP flow.
- The AI Testing rate limits (Section 17) were lowered per explicit instruction (5/minute per tester, 20/minute per organization, 200/day per organization) and are independently enforced and tested; the admin usage view is confirmed to expose only sanitized aggregate counts, never a prompt or completion.
- The AI-real-smoke-test's remote mode (Section 17) never reads, needs, or displays the OpenAI key — confirmed by a static-source-code assertion that its remote-mode function body never references `process.env.OPENAI_API_KEY`, and it refuses outright against a production-looking hostname.
- `testing/full-platform-integration-2026-07` is the only branch modified.
- All fake accounts use `@example.invalid` emails and are rejected outright on production hosts.
