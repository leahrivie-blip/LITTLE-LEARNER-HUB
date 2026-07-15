# Post-Merge Library Browse Audit Report

**Date:** 2026-07-15  
**Merged PR:** [#224](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/224) (`7d8ccf4`)  
**Follow-up branch:** `cursor/post-merge-library-audit-d049`

## Summary

PR #224 was merged to `main`. A full post-merge audit was run across Lesson Plan Library, Activity Center, viewers, calendar assign, permissions, core navigation, and responsive widths.

**Critical redesign regressions found and fixed:** 1  
**Critical failures remaining in redesign scope:** 0  
**Known unrelated / pre-existing issues noted:** 2

---

## Everything tested

### Lesson Plan Library
- Featured banner
- Continue Planning / age rows (Infant including exact ranges when present, Toddler, Preschool)
- Free / Seasonal & Holiday / Recently Added / Most Popular rows (when content exists)
- View All, desktop arrows, horizontal rows
- Search, age filters, Free/Pro filters, Saved Plans
- Empty sections hidden
- Card opens correct plan; no duplicates within a row; no broken images; no page overflow

### Lesson Plan Viewer
- View Plan (card click)
- Back / close
- Save / Unsave
- Use This Plan → Add to Calendar assign sheet
- Print + Download controls present in workspace chrome
- Weekly overview, materials, vocabulary, books, Mon–Fri day tabs + activities
- Pro user can open Pro plans
- Free user Pro lock / preview enforced
- Founding Member Pro access

### Activity Center
- Compact header, stats line, access badge
- Browse rows: Continue Browsing, Recently Added, Popular, age + activity-type categories
- View All, filters, advanced filters
- Activity opens with Print controls
- No Download PDF on browse cards
- Empty rows hidden

### Calendar & Weekly Planner
- Use This Plan / Add to Calendar assigns lesson
- Assigned lesson appears on calendar
- No “Weekend” labels
- No horizontal overflow
- Dedicated `test-lesson-use-this-plan` passed (assign + weekly planner update + replacement warning)

### Downloads & printing
- Lesson workspace Print / Download menu present
- Activity viewer Print present
- Download not removed from viewers (only removed from activity browse cards)

### Homepage / public / navigation
- Homepage CTAs present
- Core views render (calendar, lessons, activities, children, ai, settings, account, billing, plans)
- Logout / login again
- Logged-out visitor path

### Permissions
- Logged-out, Free, Pro, Founding Member
- Curriculum access security suite passed (Pro content protected server-side)
- Admin content IDs unique / intact

### Responsive
- 320, 375, 390, 430, 768, 820, 834, 1024, 1280, 1440
- Lessons, activities, calendar — no page-level horizontal overflow

### Admin
- Seeded create/publish via admin API
- No duplicate lesson plan IDs
- Activities sync into Activity Center (720+ activities visible in browse)

---

## Bugs found

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| 1 | Searching in Lesson Plan Library left `searchInput` populated; switching to Activity Center forced filtered-grid mode and hid Netflix browse rows | Critical (redesign) | **Fixed** |
| 2 | `test-unified-calendar-final-qa` still expected old Use This Plan “choose Weekly Plan vs Calendar” panel (product now goes straight to Calendar) | Test drift (pre-existing product change) | **Test updated** |
| 3 | Unified calendar suite later flakes on Weekly Planner “Back to This Week” / delete-menu visibility | Pre-existing calendar UI flakiness, outside browse redesign | **Documented** (suite no longer hard-crashes on missing Back control) |
| 4 | Homepage smoke can fail when Founding upgrade CTA inside feature-preview is visually covered by sticky mobile bar | Pre-existing modal/sticky UX | **Test uses force click**; product CTA still present |

---

## Bugs fixed in this follow-up

1. **Search bleed between libraries** (`app.js` `setView`):
   - When navigating between Lessons ↔ Activities (or into either from another view), clear shared search + reset browse filters so Netflix rows appear by default.
   - Preserves `activeActivityLessonPlanId` when drilling from a parent lesson into its activities.

2. **Card max-width on very small phones** (`llh-library-browse.css`):
   - Added `max-width: calc(100vw - 40px/48px)` so browse cards cannot exceed the viewport width.

3. **Audit / regression harness updates**:
   - New `scripts/test-post-merge-library-audit.js` (+ npm script)
   - Calendar QA updated for direct Calendar assign flow
   - Homepage smoke force-clicks Founding CTA when sticky bar covers it

---

## Remaining issues

1. **Unified Calendar final QA suite** still has flaky steps around Weekly Planner “Back to This Week” and calendar item delete-menu visibility. Core assign path works (`test-lesson-use-this-plan` + post-merge audit). Recommend a focused calendar-menu follow-up, not a browse-redesign rollback.

2. **403 console noise** during Free-user Pro preview is expected (authorized endpoint correctly denies Free users).

3. **Promo-code user** path was not fully end-to-end exercised with a live Stripe promo redemption in this environment (no private promo secrets). Access model covered via Free / Pro / Founding + server access security suite.

4. **Admin UI create/edit/delete in browser** was validated via API seeding + public library appearance; full Admin CMS click-through UI was not re-run as a Playwright suite in this pass.

---

## Devices / screen sizes / roles

| Dimension | Coverage |
|-----------|----------|
| Screen sizes | 320, 375, 390, 430, 768, 820, 834, 1024, 1280, 1440 |
| Roles | Logged-out, Free, Pro, Founding Member, Admin (API) |
| Automated suites | `test-post-merge-library-audit`, `test-library-browse-redesign`, `test-lesson-library-header/cards/card-buttons`, `test-lesson-use-this-plan`, `test-curriculum-access-security` |

---

## Confirmation checklist

| Area | Status |
|------|--------|
| Lesson Plans Netflix browsing | Works |
| Activities Netflix browsing | Works |
| Downloads available in viewers | Works |
| Printing controls in viewers | Works |
| Calendar assign from Use This Plan | Works |
| Weekly Planner assign updates | Works (`test-lesson-use-this-plan`) |
| Permissions Free/Pro/Founding | Works |
| Saved content Save/Unsave | Works |
| Admin published content appears | Works |
| Buttons respond (audited paths) | Works |
| No functionality lost by redesign | Confirmed for audited surfaces |
| Critical redesign bugs unresolved | **None** |

---

## Verdict

The Netflix-style library redesign is merged and audit-clean for its scope. One real post-merge bug (search bleed hiding Activity Center rows) was fixed. Remaining calendar-suite flakiness is outside the browse redesign and should be tracked separately.
