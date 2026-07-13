# Lesson Plan Library Mobile UX — Implementation Map

Read-only audit completed before code changes. Vanilla JS SPA (`app.js`, `index.html`, `styles.css`).

## Architecture

| Concern | Location |
|---------|----------|
| View switching | `setView()` in `app.js` — toggles `.active-view` on `#view-*` sections |
| Lesson library shell | `#view-lessons` in `index.html`; content from `renderCategoryPage("lessons")` |
| Global topbar | `.topbar` in `index.html` — `#searchInput` (“What do you need today?”), Account / Pro Active buttons |
| Per-view topbar hide (existing) | `body.home-view` hides `.search-wrap` only |

## Key touchpoints

1. **Library page** — `renderCategoryPage()`, `categoryResources()`, `renderLessonPlanLibraryNotice()`
2. **Cards** — `resourceCard()` (tall cards; Save / Customize AI / View Activities / Assign / Support / PDF / View)
3. **Viewer** — `openResourceViewer()`, `resourcePrintableHtml()`, `scripts/curriculum-lesson-viewer-render.js`
4. **Activities** — `loadCurriculumManagedActivities()`, `#view-activities`, `activeActivityLessonPlanId`
5. **Save** — `favorites` + `toggleFavorite()` (Pro; localStorage `llhFavorites`)
6. **Customize AI** — `data-customize-lesson-ai` → `setView("generators")` + `renderLessonPlanWorkflow`
7. **Add Support** — `data-add-lesson-support` → child Differentiations + `setView("children")`
8. **Assign to Week** — `openCurriculumPlannerAssignFlow()` → `assignCurriculumLessonPlanToWeek()` + snapshots
9. **Print/PDF** — `printResourceViewer()`, `downloadActiveResourcePdf()`, `buildResourcePdfBlob*`
10. **Calendars** — Curriculum Planner (`renderCurriculumPlanner`), Weekly Planner (`renderWeeklyPlanner`), dashboard curriculum widget
11. **Assignment storage** — `llhCurriculumAssignments:{email}` snapshots via `buildCurriculumLessonPlanSnapshot`
12. **Routing** — no `pushState` for in-app views; back is `data-view` / modal close
13. **Mobile CSS** — `@media (max-width: 820px)` primary; also 600px / 480px
14. **Global header** — hide via new `body.lessons-view` (mirror `home-view`)
15. **Tests** — `test-homepage-smoke`, `test-curriculum-ux-qa`, `test-curriculum-planner-*`, `test-curriculum-viewer-print`, `test-curriculum-access-security`

## Data model (do not change)

Curriculum plans: `scripts/curriculum-safe-values.js` (`dailyPlans` Mon–Fri, books, songs, domains, etc.).
Library resources: `loadCurriculumManagedLessonPlans()` maps plans into `resources[]` with `_curriculumLessonPlan`.

## Batch plan

| Batch | Scope |
|-------|--------|
| 1 | Audit + hide global chrome on library + compact header |
| 2 | Compact cards + search/filter/scroll persistence |
| 3 | Lesson viewer redesign + action organization |
| 4 | Week-at-a-glance schedule |
| 5 | Use This Plan + Curriculum Planner + main calendar |
| 6 | Site-wide back-button audit |
| 7 | Print/PDF menu improvements |
| 8 | Mobile QA, a11y, Playwright regression tests |

## Phase 1 hooks

- `setView()` — toggle `body.lessons-view`; remember return view for Back
- `styles.css` — hide `.topbar .search-wrap` and `.account-actions` on `lessons-view`
- `renderCategoryPage()` — compact `← Back` + title; slim notice; search + age filters first
