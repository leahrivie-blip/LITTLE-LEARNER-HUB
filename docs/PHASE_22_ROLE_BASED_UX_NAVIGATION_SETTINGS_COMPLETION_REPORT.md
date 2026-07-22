# Phase 22 — Role-Based Layout, Navigation, Dashboards, and Settings Redesign

**Branch:** `testing/full-platform-integration-2026-07`
**Status:** Complete (testing foundations only — production untouched)
**Date:** 2026-07-22
**Started from tip:** `a292f50c73285715c6b9a7641a6303e0076b0dc7`

## Goal

Make Little Learner Hub feel simple and calm for every role, without adding major new features — organize, simplify, connect, and polish what already existed. Every role should immediately understand where they are, what they need to do today, what they're allowed to access, where common actions live, and which advanced tasks are better completed on a computer.

## What changed

| Area | Paths |
|------|-------|
| Role model | `app.js` — `EXPERIENCE_ROLES`, `resolveExperienceRole()`, `experienceRoleLabel()`, `isCurriculumOnlyAccount()` |
| Navigation | `app.js` — `syncRoleAwareNavGrouping()`, `NAV_PRIMARY_VIEWS_BY_EXPERIENCE`, `NAV_ALWAYS_MORE_TOOLS_VIEWS`; `index.html` — new "Today" nav item, new "More Tools" section, un-hid Classrooms/Families/Enrollment/Staff/Billing/Reports/Resources/Forms |
| Today dashboard | `app.js` — `renderTodayDashboard()`, `quickActionsForExperienceRole()`; `index.html` — `#view-today` |
| Settings redesign | `app.js` — `renderSettingsHubPage()` (rewritten), `bindSettingsHubSearch()` |
| Device rules | `app.js` — `renderManageSurfaceShell({ computerRecommended })` + call sites for Classrooms/Families/Enrollment/Staff |
| Classroom Assistant hardening | `app.js`, `classroom-assistant-ui.js` — offline queue scoped by identity+org, cleared on admin logout |
| Styling | `styles.css` — `.nav-section-more`, `.today-dashboard-*`, `.settings-hub-search`, `.settings-hub-tag-*`, `.platform-computer-recommended-note` |
| Tests | `scripts/test-phase22-role-navigation.js` (new), `scripts/test-platform-nav.js`, `scripts/test-settings-hub.js`, `scripts/test-classroom-assistant.js` (updated) |

## 1. Role-specific experiences

`resolveExperienceRole(account)` is the single source of truth for navigation/dashboard/Settings curation. It **never grants access** — `canAccessCapability()` / `canAccessPlatformFeature()` (unchanged from Phase 1/2) remain the real, server-respecting security boundary. The resolver:

```
Platform Admin      hasAdminFullAccess() === true
Curriculum Only     account.plan === "curriculum_only" OR account.accountType === "curriculum_only"
Assistant           role === "assistant"
Lead Teacher        role === "teacher"
Director            accountType === "center" AND role in {owner, director}
Solo Provider       everything else (home_daycare / single_provider owner)
```

Guardian is **not** part of this resolver — Family Hub (`family-hub-ui.js`) is a fully separate SPA with its own bottom nav, audited separately in Section 5.

Verified with fake accounts (server-seeded `users` + client `llhAccounts`, matching the pattern used by existing Phase 1–21 tests) across Solo Provider, Director, Lead Teacher, and Assistant in `scripts/test-phase22-role-navigation.js`. See "Known limitations" for Curriculum Only.

## 2. Solo provider experience

Primary nav for Solo Provider: **Today, Calendar, Lesson Plans, Activities, Daily Logs, Child Profiles, Documentation Helpers, Messages, Settings.** Center-only language (staff directories, classrooms, enrollment pipeline) never appears — this was already true via `accountTypeAllowsCapability()` (center-only capabilities require `accountType === "center"`), Phase 22 didn't need to add new hiding logic here, only confirm it and add the Today landing.

## 3. Director experience

Primary nav for Director: **Today, Classrooms, Staff & Permissions, Children & Families, Enrollment, Forms & Enrollment, Reports, Settings.** These pages already existed and worked (`renderClassroomsPage`, `renderFamiliesPage`, `renderEnrollmentPage`, `renderStaffManagementPage`, `renderReportsPage` — all capability-gated, all using real, non-preview APIs like the schedule/child-records system) but were previously reachable **only** through Settings Hub cards, and Classrooms/Families/Enrollment weren't reachable from the sidebar at all. Phase 22 connects them directly into the sidebar for the first time.

Billing remains **owner-only**, per the existing capability matrix (`roleAllowsCapability("billing")` returns true only for `owner`) — a Director never sees Billing in the sidebar or Settings, unchanged by this phase.

Calendar/Lesson Plans/Activities/Daily Logs move to "More Tools" for the Director experience specifically (still one click away, still fully accessible) — this is a deliberate reading of the spec, which lists Director priorities as administrative (Classrooms/Staff/Enrollment/Records/Billing/Reports) and does not include day-to-day classroom tools, reflecting that Directors typically delegate daily lesson execution to teachers.

## 4. Teacher and Assistant experiences

Both get: **Today, Child Profiles, Daily Logs, Activities, Messages** as primary, with Behavior & Support, Lesson Plans, and Documentation Helpers available (teachers) or tucked into More Tools (assistants get a narrower core set). Director-only clutter (Staff, Billing, Classrooms, Families, Enrollment) is **absent from the entire sidebar**, not just reordered — verified in `test-phase22-role-navigation.js` by asserting these views never appear in `#platformNav .nav-link`, hidden or visible, for these two roles.

## 5. Guardian experience

**Audited, not restructured.** Family Hub's existing bottom nav (Home, Children, Forms, Messages, Account — `family-hub-ui.js`) already satisfies "no more than five main navigation choices." It differs from this phase's literal wording (which lists Calendar as a bottom-nav priority) because Phase 11 made a deliberate, documented, tested decision to put Messages in the bottom nav instead and move Calendar under Account (`docs/OVERNIGHT_DECISIONS_AND_BLOCKERS.md`, "Family Hub nav — Enrollment/Licensing/Today/Billing entry" decisions). Reverting that would touch many later phases' nav tests for a reordering with no functional change (Calendar is already one tap away). **Kept as-is**; flagged for an explicit owner decision in Phase 23 if a literal Calendar-in-bottom-nav is wanted.

## 6. Curriculum-only experience

`resolveExperienceRole()` correctly returns `curriculum_only` when `account.plan` or `account.accountType` literally holds `"curriculum_only"`, and its primary nav (`lessons`, `activities`, `calendar`, `settings`) matches the spec (Lesson Plans, Monthly Curriculum, Activity Center, Calendar, Settings/billing). **However**, this cannot yet be exercised through a real, persistent login — see "Known limitations."

## 7. Platform Admin experience

Unchanged in this phase — the Admin Dashboard (`#view-admin`, `adminGroups`) is a separate navigation system from the provider sidebar audited here, and already separates platform administration (Users, Curriculum, Support, Platform Health, Testing Lab, Feature Flags, Release Readiness) from daycare-program management. When an Admin is in "Admin" preview mode, the provider sidebar shows everything as primary (no curation) rather than hiding anything, since `hasAdminFullAccess()` already bypasses capability checks (`adminOverride: true`) — curating what Admin sees in the *provider* sidebar was judged out of scope for this phase.

## 8. Navigation redesign

- **Core vs. More Tools**: `syncRoleAwareNavGrouping()` runs after the existing capability-visibility pass (`syncPlatformNavVisibility()`) and only *relocates* already-visible `.nav-link` elements between the "Core" and new "More Tools" `<div class="nav-section nav-section-more" data-nav-section="more">` section — it never sets `hidden`. The "More Tools" section auto-hides when empty via the pre-existing `[data-nav-section]` empty-check.
- **New "Today" nav item** — first item in the sidebar, ahead of Calendar, for every role.
- **Quick Actions** — `quickActionsForExperienceRole()` returns 3–5 role-relevant shortcuts, rendered inside the Today dashboard.
- Favorites/Recent — surfaced on the Today dashboard (existing `favorites`/`lessonRecentlyViewed`/`activityRecentlyViewed` client state), not as new nav items.
- No duplicate links with different names were introduced; no dead-end pages; nothing was added that a role cannot access (every relocated item is still capability-gated exactly as before).

## 9. Settings redesign

`renderSettingsHubPage()` groups are now: **My Account, Billing and Subscription, Program, Classrooms** (Center only)**, Staff and Permissions, Children and Families, Planning Preferences, Forms and Records, Communication and Notifications, Privacy and Security, Integrations, Testing and Advanced Tools** (Admin only)**, Support, Account Actions.**

- **Search**: a live client-side filter (`bindSettingsHubSearch()`) matches card title + detail text; non-matching cards/groups hide, an empty state shows when nothing matches.
- **Short explanations**: every group has a one-line `detail`; every card already had a `detail` line (carried over from before this phase).
- **Owner/computer tags**: cards now carry `settings-hub-tag-owner` ("Director/Owner") and `settings-hub-tag-computer` ("Best on a computer") badges where relevant (Classrooms, Staff & Permissions, Program, Cancel Subscription, Testing Lab).
- **Cancel Subscription** is a real, findable card (`data-view="cancel-subscription"`) inside "Billing and Subscription" — confirmed reachable by searching "cancel".
- **Integrations** is honest about current state: the only "integration" today is installing the PWA; no calendar/export integrations exist yet (no new feature was invented to fill the section).
- Settings is still multiple grouped sections, not one long page — same overall pattern as before, just regrouped and searchable.

## 10. Dashboards

New **"Today"** view (`#view-today`, `renderTodayDashboard()`) for every role: **Needs Attention** (unread messages, forced password change, Free-plan nudge), **Today** (this week's assigned lesson plan via the existing schedule API, `curriculumPlannerWeekStartIso()` + `api.lessonForWeek()`), **Recent** (last-viewed lesson plans/activities), **Favorites**, **Quick Actions**. Built entirely from data already loaded client-side — no new backend endpoint. Kept intentionally light (5 cards, no charts/graphs), matching "avoid filling dashboards with large numbers of cards."

**A genuine bug was found and fixed during this work**: an early version of `renderTodayDashboard()` retried `ensureScheduleLoaded()` from *inside* its own render function whenever no lesson was found for the week, which — because the schedule promise can resolve synchronously-fast in a fresh session — created a `render → load → render → load → …` loop that crashed the browser tab (confirmed via Playwright: "Target page, context or browser has been closed"). Fixed by moving the one-time refresh into the `setView("today")` navigation handler (outside the render function itself), and covered by a dedicated regression test (`test-phase22-role-navigation.js`, "repeated Today navigation does not crash or loop").

## 11. Device rules

- Phone/computer breakpoints and the "Computer Recommended" pattern already existed (Phases 12–21: `.en-computer-recommended`, `.th-computer-recommended`, Testing Lab device presets, etc.) — Phase 22 extends the same pattern to newly-surfaced pages via a shared, reusable flag: `renderManageSurfaceShell({ computerRecommended: true })` now renders a consistent "💻 Best on a computer" note on Classrooms, Families, Enrollment, and Staff & Permissions (all bulk-management tools), plus `settings-hub-tag-computer` badges on the matching Settings cards and Testing Lab.
- Today dashboard and Settings search were verified at a 390×844 phone viewport with zero layout/JS errors.
- No new tablet-specific layout was required — the existing responsive CSS breakpoints (`max-width: 1100px` sidebar drawer, card-grid `auto-fit` patterns) already scale correctly between phone and computer widths for the new surfaces; a dedicated tablet viewport pass is listed under Known limitations for completeness rather than skipped silently.

## 12. Classroom Assistant final verification

Re-verified against the 12-point checklist:

| # | Check | Result |
|---|---|---|
| 1 | Phone/tablet/computer layouts work | ✅ Pre-existing phone-first flagship layout + "Best on a computer" Admin Assistant copy confirmed via `test-classroom-assistant.js` (`phone_summary_marker`, `phone_computer_markers_in_ui_file`) |
| 2 | Offline entries isolated by user and organization | ⚠️→✅ **Fixed this phase.** Previously keyed only by `organizationId`; now `llh-ca-offline-queue::{adminEmail}::{organizationId}` |
| 3 | Account switching cannot expose queued entries | ⚠️→✅ **Fixed this phase** (same key change) + queue purge added to `clearAdminSession()` (logout) |
| 4 | Group updates and child exceptions save correctly | ✅ `apply_with_confirm_writes_group_and_exception` (existing, passing) |
| 5 | Suggestions remain drafts until confirmed | ✅ `parse_preview_does_not_mutate_store`, `apply_without_confirm_rejected` (existing, passing) |
| 6 | Medication details are never invented | ✅ Parser only extracts explicitly-stated medication text (`unit_parse_diaper_potty_med_attendance`); no fabrication path exists in `classroom-assistant-data-model.js` |
| 7 | Failed sync cannot create duplicates | ✅ `offline_sync_endpoint_parses_and_writes` + server-side confirm-gated apply (existing, passing) |
| 8 | Logout protects private offline information | ⚠️→✅ **Fixed this phase** — `clearAdminSession()` now purges all `llh-ca-offline-queue::*` keys |
| 9 | Admin Assistant stays separate from the daily classroom interface | ✅ Same page, progressive disclosure (collapsed by default, explicit "paste lesson plans & curriculum" toggle) — confirmed by design, not a literal separate page, which matches how it shipped in the Classroom Assistant Polish phase |

New regression: `phase22_offline_queue_isolated_by_identity_and_cleared_on_logout` in `test-classroom-assistant.js` (now 23 checks, up from 22).

## 13. Visual and functional audit

Full pixel-level audit of every historical screen across Phases 1–21 was out of scope for a single phase given the size of the codebase (20+ `*-ui.js` modules, tens of thousands of lines). This phase audited and verified:

- The main sidebar and every newly-surfaced destination (Classrooms, Families, Enrollment, Staff, Billing, Reports, Forms, Resources) for correct role access, page title, and back navigation (all reuse the existing `renderManageSurfaceShell` / settings-subpage back-button pattern).
- The new Today dashboard and redesigned Settings Hub across phone (390×844) and computer (1280×800 / 1440×900) viewports, including loading/empty states (Today's "no lesson assigned yet" / "nothing needs attention" copy; Settings' "no settings match your search" empty state).
- Zero console/page errors during the entire full regression run (Phase 1–21 suites + Phase 22 + Classroom Assistant), across all tested roles and viewports.

**Recommended for Phase 23**: a systematic per-screen audit (loading/empty/error/success states, duplicate actions, tiny tables/nested scroll boxes) of the Director Center admin-preview tabs (Today Hub, Staff Experience, Billing Simulator, Records, Licensing, Provider Productivity) and Forms Center, which were not touched by this phase.

## Tests

- `npm run check` — passes across the entire testing-branch codebase (140+ files checked via the branch's expanded check script)
- `npm run test:phase22-role-navigation` — **10/10 PASS** (new)
- `npm run test:classroom-assistant` — **23/23 PASS** (22 existing + 1 new)
- `npm run test:platform-nav` — **15/15 PASS** (2 tests rewritten to assert the new, intentional nav visibility)
- `npm run test:account-access` — **12/12 PASS** (unchanged — confirms `curriculum_only` remains correctly documented as a reserved, non-active account type)
- `npm run test:settings-hub` — **4/4 PASS** (1 test rewritten, 1 new)
- Cross-organization / permission regression: `test:director-family-foundation`, `test:family-foundation-phase8`, `test:director-center-phase2`, `test:today-hub-phase15`, `test:staff-experience-phase16`, `test:family-hub-phase9`, `test:family-updates-phase10`, `test:family-messaging-phase11`, `test:family-enrollment-phase12`, `test:records-center-phase13`, `test:licensing-center-phase14`, `test:billing-simulator-phase17`, `test:testing-lab-phase18`, `test:platform-resilience-phase19`, `test:security-migration-phase20`, `test:provider-productivity-phase21` — **all PASS**, confirming Phase 22's navigation/Settings changes did not regress any earlier phase's cross-org or role-boundary guarantees
- Spot-checked: `test:doc-helpers-post-generate`, `test:child-profile-redesign`, `test:daily-logs-attendance` — **all PASS**

Every role was tested on phone (390×844) and computer (1280×800 / 1440×900) viewports; tablet-specific layout testing (e.g. 768×1024) is listed under Known limitations.

## Screenshots

- `docs/screenshots/phase22/composite-1-phone-roles.png` — Solo Provider, Director, Lead Teacher, and Assistant Today dashboards side-by-side at phone width (390×844)
- `docs/screenshots/phase22/composite-2-computer-director-admin-settings.png` — Director's Today+Nav, Director's redesigned Settings, and the Platform Admin Dashboard side-by-side at computer width (1440×900)

## Known limitations / Phase 23 candidates

1. **Curriculum Only cannot persist through a real login yet.** `resolveExperienceRole()`'s logic is correct and tested directly, but the existing, deliberate `migrateAccountAccessFields()` (boot-time) and `normalizeBillingPlan()` (login-time) functions reset any unrecognized `accountType`/`plan` value back to `home_daycare`/`Free` — this is intentional, existing behavior (see `test-account-access.js`, "curriculum_only remains a reserved future account type"), not something this phase should override without a broader onboarding/pricing decision (`docs/FUTURE_ONBOARDING_PRICING.md`). Wiring a real, persistent Curriculum Only account/plan is Phase 23+ work.
2. **Today's default landing.** Today is a new primary nav item but is **not** the default landing view for logged-in users (Calendar remains the default, unchanged) — promoting Today to the default landing would touch many existing tests across Phases 1–21 that assert Calendar-as-landing; recommended as an explicit, separately-tested Phase 23 change.
3. **Guardian bottom nav** literal wording (Calendar as a bottom tab) was not implemented — see Section 5 for the reasoning; flagged for an explicit owner decision.
4. **Tablet-specific viewport testing** (e.g. 768×1024) was not separately run for the new surfaces in this phase; the existing responsive breakpoints are shared with phone/computer and were not observed to break, but were not exhaustively screenshotted at tablet width.
5. **Full per-screen visual audit** of Director Center's admin-preview tabs and Forms Center (untouched by this phase) remains open — see Section 13.
6. **The ~15 missing production lesson-plan imports** (Apple Orchard Investigators + Fall Celebrations series, 14 Toddler Pro batch 2/3 plans including Fossil Hunters) identified during the separate production-incident recovery are tracked in that incident's PR (#326) and documentation only — intentionally **not** touched, recreated, or referenced by any Phase 22 code on this branch, per instruction.

## Safety confirmation

- `main` and production were not touched by this work.
- No Stripe, email, SMS, or live AI calls were added or enabled.
- No new backend endpoints were introduced — Today dashboard and nav/Settings changes are entirely client-side, built from already-loaded data and already-existing capability checks.
- `testing/full-platform-integration-2026-07` is the only branch modified.
