# Lesson Library Phase 2 — Gap Completion Plan

**Status:** Planning only. Do **not** merge PRs #156–#160 yet.  
**Base branch for Phase 2 work:** `cursor/lesson-back-nav-audit-693d` (or a fresh `cursor/lesson-library-phase2-*-693d` branched from it after review).  
**Scope rule:** Close remaining gaps from the original Lesson Plan Library mobile UX requirements. No unrelated redesign.

---

## Current baseline (already in draft PRs)

Working well enough to keep:

- Compact Lesson Plan Library (global search/Account/Pro Active hidden on lessons)
- Compact tappable lesson cards + filter/Saved/sort persistence
- Lesson workspace tabs (Week / Plan / Activities / Materials)
- Use This Plan → Assign / Calendar / Curriculum Planner wiring
- Playwright scripts for header, cards, viewer, use-this-plan, mobile QA

Gaps this Phase 2 plan closes are listed below in priority order.

---

## Priority 1 — Back Navigation (true browser history)

### What remains
- App still uses `setView()` / modal open-close with **no** `history.pushState` / `popstate` for library → lesson → activity.
- Visible Back works on many lesson flows via `viewReturnContexts`, but **device/browser Back can exit the app** instead of closing one level.
- Lesson-related screens still need a focused audit pass (library, viewer, activity detail, linked activities list, Customize AI return, Assign flow, Curriculum Planner open-lesson, Weekly Planner open-lesson).

### Recommended approach (smallest safe change)
1. Add a lightweight `lessonNavHistory` helper (not a full app router):
   - Push state when opening Lesson Library from Home.
   - Push state when opening a lesson workspace.
   - Push state when opening an activity from a lesson (`returnTo` parent lesson id).
   - On `popstate`, close/reopen the correct level (activity → lesson → library).
2. Keep existing visible Back buttons; wire them to the same pop/close helpers so UI Back and browser Back share one stack.
3. Add Playwright coverage for:
   `Library → Lesson → Activity → Back → Lesson → Back → Library` using both visible Back and `page.goBack()`.
4. Do **not** rewrite site-wide routing for Account/Billing/Admin in this phase unless a lesson flow depends on it.

### Effort / risk
- **Touchpoints:** `openResourceViewer`, `closeResourceViewer`, `resourceViewerBack`, activity open handlers, `setView("lessons")`, one `popstate` listener.
- **Invasiveness:** Moderate (history bugs are easy to introduce).
- **Risk:** Medium — must avoid double-close and broken Escape handling.

### Acceptance
- Device Back and on-screen Back both step one logical level.
- Scroll/search/filters still restore when returning to Library.
- No dead-end screens in the lesson/activity chain.

---

## Priority 2 — Calendar (clarify before building)

### What “Add to Main Calendar” does today
Evidence from current UI:

1. User picks Monday + age group.
2. System calls `assignCurriculumLessonPlanToWeek()` (Curriculum Planner snapshot = source of truth).
3. System also updates `llhWeeklyPlanner` theme/resource/day text from activity titles.
4. Success offers “Open Curriculum Planner” / “Open Weekly Planner”.

There is **no** month grid and **no** timed day calendar.

### Current screenshots (before any Phase 2 code)

<img alt="Add to Main Calendar form" src="/opt/cursor/artifacts/lesson-library-phase2-plan/02-current-add-to-main-calendar-form.png" />
<img alt="Weekly Planner after add" src="/opt/cursor/artifacts/lesson-library-phase2-plan/04-current-weekly-planner.png" />
<img alt="Curriculum Planner" src="/opt/cursor/artifacts/lesson-library-phase2-plan/05-current-curriculum-planner.png" />

### Recommendation: **Option B — Rename to match reality** (preferred)
Do **not** build a true month calendar in Phase 2 (that is a separate product surface).

Rename / rewrite copy to something accurate, for example:
- Button: **Add to This Week’s Plan**
- Sheet title: **Add to Weekly Plan**
- Helper text: “Assigns this Monday–Friday lesson to Curriculum Planner and fills your Weekly Planner day notes.”
- Success CTAs: **Open Curriculum Planner** / **Open Weekly Planner** (keep)

Optional small UX polish (still Option B):
- After success, default CTA = Curriculum Planner week board (richer teaching view than Weekly Planner forms).

### Option A — True calendar (explicitly out of Phase 2 unless you override)
Would require month UI, event model, conflict handling, and dashboard redesign. Too large for “finish remaining gaps.”

### Effort / risk
- Option B: Low invasiveness (labels + helper copy + maybe button order).
- Option A: High invasiveness; defer.

### Acceptance
- Teachers understand they are assigning a teaching week, not adding a Google-Calendar-style event.
- No silent duplicate assignments; replace warning remains.

---

## Priority 3 — Professional Weekly PDF / Print

### What remains
Current “Week at a Glance” print/PDF is effectively a **vertical activity dump**, not a classroom wall schedule.

<img alt="Current weekly print HTML" src="/opt/cursor/artifacts/lesson-library-phase2-plan/07-current-weekly-print-html-preview.png" />

### Recommended approach
Build one dedicated print template (HTML + print CSS), used by both Print and PDF:

**Header**
- Little Learner Hub mark / wordmark
- Lesson title
- Age group · Theme · Week label (optional Monday date if assigned)

**Body (print/desktop):** 5 columns Mon–Fri  
**Body (narrow preview):** stacked day sections with clear day headings (same content)

**Each day cell**
- Day name
- Activity title + category (1 line each)
- Optional short materials line if space allows

**Footer**
- Weekly materials summary (consolidated)
- “Little Learner Hub” + page-friendly margins
- Page-break rules so day headers stay with content

Implementation hooks:
- Extend `lessonPlanPrintVariantHtml(..., { printVariant: "week" })`
- Add `.lesson-week-schedule-print` CSS under `@media print` and `body.printing-resource`
- PDF download should render the **same HTML layout** (not `lessonPlanVariantText` text dump)

### Effort / risk
- Touchpoints: viewer-render/print helpers in `app.js`, print CSS in `styles.css`, PDF blob path for weekly variant.
- Invasiveness: Moderate, localized.
- Risk: Medium around PDF fidelity in mobile browsers — validate Print Preview first, then PDF.

### Acceptance
- Teachers can print a one-page (or two-page max) Mon–Fri schedule that looks classroom-ready.
- Not a plain text file.
- Pro gating unchanged.

---

## Priority 4 — Lesson Viewer Actions (layout only)

### Current layout
<img alt="Current viewer actions" src="/opt/cursor/artifacts/lesson-library-phase2-plan/08-current-viewer-primary-actions.png" />

Today:
- Primary: **Use This Plan** + **Save** + **More**
- Print/Download live under Week tab and More → Print & Download
- Assign / Calendar live inside Use This Plan sheet

### Required final workflow (product intent)
Use This Plan → Assign Week → Add to Calendar → Print → Download PDF

### Recommended cleanest mobile layout (no redesign of tabs)
Keep tabs. Reorganize actions only:

**Row 1 (primary)**  
`[ Use This Plan ]`

**Use This Plan sheet (ordered)**  
1. Assign to a Week  
2. Add to Weekly Plan *(renamed)*  
3. Print Full Lesson Plan  
4. Download Lesson Plan PDF  
5. View in Curriculum Planner *(secondary link)*  
6. Cancel  

**Row 2 (secondary, compact)**  
`[ Save ] [ More ]`

**More menu**  
- Customize with AI  
- Add Support  
- View Linked Activities  
- Print Week at a Glance  
- Download Weekly Schedule PDF  
- Print Materials List  

**Week tab**  
Keep week-specific Print/Download Weekly buttons (contextual), but avoid duplicating Full PDF next to them.

### Effort / risk
- Low: markup/order/copy in `lessonWorkspaceChromeHtml` + handlers.
- Risk: Low if existing handlers are reused.

---

## Priority 5 — Global Search compact lesson cards

### What remains
`showSearchResults()` still maps results through `resourceCard()` (old tall multi-button cards for lessons).

### Recommended approach
```js
results.map((resource) =>
  resource.category === "Lesson Plans" ? lessonPlanCard(resource) : resourceCard(resource)
)
```
Also ensure search-result container uses `.lesson-library-grid` (or equivalent) when any lesson cards are present.

### Effort / risk
- Very low invasiveness; low risk.
- Quick Playwright assertion: global search lesson hit uses `.lesson-plan-card` and has no Customize AI / Assign stack.

---

## Priority 6 — Real Curriculum Testing

### What remains
Many automated checks seed import-sample / placeholder plans (“Monday Activity 1”, etc.). Need verification on real Infant / Toddler / Preschool published content.

### Recommended approach
1. Use existing published corpus from site content / preschool free+pro seed data (not only `curriculum-import-samples`).
2. Manual + automated matrix for **one real plan per age**:

| Check | Infant | Toddler | Preschool |
|-------|--------|---------|-----------|
| Opens in workspace | | | |
| Week days + activities | | | |
| Books / songs / materials tabs | | | |
| Open activity → Back to lesson | | | |
| Assign week | | | |
| Weekly print preview | | | |
| Pro lock (if Pro plan) | | | |

3. Add a Playwright “real corpus smoke” that picks first published Free plan per age from `/api/site-content` (skip if age missing).

### Effort / risk
- Depends on local/store content availability in test env.
- Risk: Low–medium if seed data differs by environment.

---

## Priority 7 — Mobile QA (iPhone widths)

### What remains
Automated 412px coverage exists; Phase 14 manual checklist and multi-width visual QA are incomplete.

### Recommended approach
Test widths: **390, 412, 430** (+ one desktop sanity).

Checklist (screenshot any failure):
1. Library shows plans near top; no global “What do you need today?”
2. No horizontal overflow
3. Cards compact; whole card opens lesson
4. Back chain Library ⇄ Lesson ⇄ Activity (UI + browser)
5. Use This Plan sheet actions reachable with thumb
6. Sticky/header never covers final content
7. Print preview opens without clipped header
8. Locked Pro preview still gated

Deliverable: short QA note + failure screenshots in `/opt/cursor/artifacts/`.

### Effort / risk
- Mostly verification; code fixes only for bugs found.
- Risk: Low.

---

## Suggested Phase 2 execution order

| Step | Work | Depends on |
|------|------|------------|
| P2-0 | Confirm Option B calendar rename (product decision) | You |
| P2-1 | Back history stack + lesson chain tests | — |
| P2-2 | Calendar rename/copy + Use This Plan action order | P2-0 |
| P2-3 | Global search compact lesson cards | — |
| P2-4 | Professional weekly print/PDF template | — |
| P2-5 | Real Infant/Toddler/Preschool verification | P2-1, P2-4 |
| P2-6 | Mobile QA pass + bugfix | All above |
| P2-7 | Update draft PR description / replace #160 scope notes | End |

Keep commits small and focused. Prefer **one Phase 2 PR** stacked on the current draft branch after you decide whether Batches 1–5 stay.

---

## Explicitly out of scope for Phase 2

- New month-grid calendar product
- Redesigning Home, Account, Admin, or non-lesson libraries
- Changing the curriculum data model
- Removing Pro server protections
- Broad design-system restyle

---

## Decision needed from you before coding

1. **Calendar:** Confirm **Option B (rename)** vs Option A (true calendar).  
2. **PR strategy:** Keep #156–#159 and land Phase 2 on top of #160, or close earlier PRs and use one Phase 2 branch only.  
3. **Weekly PDF:** One-page dense schedule preferred, or allow two pages if activity counts are high?

No implementation will start until you confirm at least item 1.
