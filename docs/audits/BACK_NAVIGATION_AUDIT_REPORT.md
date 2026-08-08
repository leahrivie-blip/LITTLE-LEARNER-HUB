# Back Navigation Audit — Production UX Fix Report

Generated: 2026-08-08

## Scope

Surgical Back navigation pass across user-facing and admin nested routes. No redesign. No curriculum, cover, Teaching Kit content, billing logic, auth/permissions, Family Hub data, or production lesson data changes.

Shared helper: `llhPageBackButtonHtml()` in `app.js` (also exposed on `window`). Manage shells accept `viewKey` / `fallbackView` via `renderManageSurfaceShell`.

---

## 1. Areas audited

| Area | Status |
|---|---|
| Lesson Plans / individual lessons / lesson workspace / Teaching Kit | Already had Back — preserved |
| Activity Center / activity details | Already had Back — preserved |
| Calendar / Planner / day & week | Already had Back — preserved |
| Daily Logs (home, wizard, child) | Home was missing — **fixed** |
| Child Profiles + Observations / Goals / Documents / Forms / Photos / Timeline / Daily Reports | Already had Back — preserved |
| Child Portfolio | Standardized treatment |
| Documentation Helpers / AI / generators | Already had Back — preserved |
| Behavior & Support home / category / topic | Home missing — **fixed**; nested preserved |
| Forms Center / assigned forms | Already had Back — preserved |
| Messages | Already had Back — preserved |
| Settings hub + children (account, program, forms/curriculum settings) | Hub contextual when deep-linked; children preserved |
| Director / Owner Program tools | Missing — **fixed** |
| Staff / User management | Weak mid-page — **standardized to top Back** |
| Classrooms / Enrollment / Families manage surfaces | Missing — **fixed** |
| Billing / Plans / Upgrade / Subscription / History / Cancel | Weak bottom placement — **standardized to header** |
| Admin Dashboard / curriculum lesson editor | Hub exception; editors already had Back |
| Resources hub | Missing — **fixed** |
| Provider Tools | Missing — **fixed** |
| What's New | Footer-only — **moved to header** |
| Work hubs (Today / Classroom / Business / More / owner Home) | Intentional primary nav roots |
| Reports / Favorites / Menus | Already had Back — preserved |
| Modals (auth, confirms, resource viewer) | Close/Cancel / dedicated Back — preserved |

---

## 2. Routes that were missing Back navigation

- `#view-tools` (Provider Tools)
- `#view-resources` (Resources hub)
- Behavior & Support **home**
- Daily Logs **dashboard home** (wizard already had Back)
- Director Center
- Classrooms / Enrollment / Families manage shells
- Staff (only a mid-row “Back to Settings”, not a top Back control)
- What's New (footer-only)
- Plans / Upgrade / Subscription / Billing History / Cancel (Back buried mid/bottom or missing from header)

---

## 3. Routes fixed

- Provider Tools → contextual Back (fallback Calendar)
- Resources → contextual Back (fallback Calendar)
- Support home → contextual Back (fallback Resources)
- Director Center → contextual Back (fallback Settings)
- Staff / Classrooms / Enrollment / Families → top contextual Back via manage shell
- Daily Logs home → `← Back to Children` (exits daily-logs mode to list)
- Plans / Upgrade / Subscription / Billing History / Cancel → header contextual Back; removed duplicate bottom Backs where applicable
- What's New → header contextual Back
- Settings hub → contextual Back **only when** a return context exists (not forced on primary hub landings)
- Portfolio → `back-button` class + `←` label

---

## 4. Existing Back controls standardized

- Shared `llhPageBackButtonHtml` + `data-contextual-back` pattern
- `.back-button` CSS: `min-height/min-width: 44px` for mobile tap targets
- Manage surface shells consistently place Back above the page title
- Billing nested pages use the same header pattern as Billing Management
- Did **not** duplicate Back on screens that already had a correct control (Messages, Generators, Planner, Lesson/Activity libraries, Lesson workspace / Teaching Kit, Child profile nest, Forms/Menus libraries, etc.)

---

## 5. Intentional exceptions

| Surface | Why no always-visible Back |
|---|---|
| Public Home | Marketing landing / auth entry |
| Calendar (signed-in default landing) | Primary daily hub; contextual Back still appears when entered from another section |
| Settings hub | Primary account hub; Back shows only with return context |
| Admin Dashboard root | Admin shell; nested editors keep their own Back |
| Work hubs: Today / Classroom / Business / More / owner Home | Work-mode primary nav roots (when HDH testing nav is on) |
| Family Hub parent portal | Separate parent app shell with its own bottom nav / sign-out — not a provider nested page |
| Auth / confirm modals | Use Close/Cancel, not page Back |
| Payment success / failed | Result screens with primary CTAs that include an exit Back in the action row |

---

## 6. Mobile results

- Global `.back-button` tap target raised to **44×44px** minimum
- Back remains in the expected top/header area (not sticky-nav collision by design; same placement as existing child/lesson Backs)
- Contextual labels still update via `refreshContextualViewBackButtons`
- Daily Logs / Child Profile Backs already used the child-page header pattern with adequate tap size

---

## 7. Regression / test results

Commands:

```bash
npm run check
npm run test:navigation-back-phase6
npm run test:back-navigation-audit
node scripts/audit-back-navigation.js
npm run test:navigation-history
```

**Static results:** all passed (phase6, audit suite, history QA, full-view audit 0 fails).

**Playwright desktop + mobile smoke:** 16/16 passed. Artifacts under `/opt/cursor/artifacts/back-navigation-audit/` (screenshots + `playwright-smoke-results.json`). Mobile Back controls measured **44px** tall on tools/resources/support/daily-logs. Resources Back returned to Calendar without logout.

Browser/device Back continues to use the existing `llhPlatformNav` history stack (`navigateContextualBack` prefers `history.back()` when primed). No auth logout path was added to Back handlers. Unsaved admin lesson discard warning (`confirmDiscardAdminLessonChanges`) is unchanged.

---

## 8. Production data / content confirmation

**No production data or content was modified.**

- No lesson/cover media uploads or remaps
- No Teaching Kit / curriculum content edits
- No billing, subscription, auth, or permission logic changes (UI Back placement only)
- No Family Hub data changes
- Local JSON store and Postgres production content untouched

---

## Parent/context behavior

Back uses `viewReturnContexts` set by sidebar/`data-view` navigation (and existing lesson/workspace setters). Examples:

- Lesson from Lesson Plans → Lesson Plans
- Support topic → Support category → Support home → Resources/Calendar
- Staff opened from Director → Director; from Settings → Settings
- Child document / Daily Logs → Children (or prior child nest)
- Billing nested → Billing / Settings as configured
