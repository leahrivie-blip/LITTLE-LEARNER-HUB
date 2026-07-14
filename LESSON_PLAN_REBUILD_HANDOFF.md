# Lesson Plan System Rebuild — Handoff

Last updated: July 14, 2026  
Repo: `github.com/leahrivie-blip/LITTLE-LEARNER-HUB`  
Base branch: `main` (clean, up to date)  
Current cache on main: `llh-shell-v21-lesson-save-ux` / `?v=20260714-lesson-save-ux`

## Merged steps (done)

| Step | Focus | PR | Branch |
|------|--------|-----|--------|
| 1 | Separate Create vs Edit + true editor | [#173](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/173) | `cursor/lesson-plan-editor-separation-6627` |
| 2 | Viewer action bars (Edit / Calendar / My Week / downloads) | [#174](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/174) | `cursor/lesson-viewer-action-bar-6627` |
| 3 | Save UX (Save/Discard/Cancel + after-save panel) | [#175](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/175) | `cursor/lesson-editor-save-ux-6627` |

## What works now

- **Create:** Dashboard → Lesson Plan Helper → Generate → Save  
- **Manage:** Library → Open → Edit Lesson Plan → `#/lesson-plans/:id/edit` (no Helper/generators)  
- Personal editable copies (`_userLessonCopy`) leave library originals untouched  
- Viewer top+bottom action bars; Add to Calendar / My Week open pick-week immediately  
- Editor sticky Save + leave dialog + after-save next actions  

## Next step to implement: Step 4 — Mobile / header overlap

**Branch naming:** `cursor/<descriptive-name>-6627`  
Note: local branch `cursor/lesson-mobile-header-6627` may already exist empty/stale — delete or reuse after checking it has no unique commits vs main.

### Root cause (already mapped)

In `styles.css`, mobile lesson editor sticky bar uses:

```css
.lesson-editor-sticky-bar {
  top: env(safe-area-inset-top, 0px); /* ignores topbar height */
  z-index: 24; /* below .topbar z-index 25/30 */
}
```

Desktop correctly uses `top: 64px`. On iPhone, Back/Save sit under the floating topbar.

### Recommended fixes

1. Add CSS vars `--llh-topbar-height` / `--llh-editor-sticky-height`
2. Mobile sticky bar: `top: calc(var(--llh-topbar-height) + env(safe-area-inset-top, 0px))`
3. Slim/hide topbar on `body.lesson-editor-view` (mirror `lessons-view`)
4. `viewport-fit=cover` on meta viewport in `index.html`
5. Optional JS `syncTopbarMetrics()` after `renderUserLessonEditor` / resize
6. Clip `overflow-x` on editor + lesson workspace modal
7. Full-width tap targets for Back/actions on small screens
8. Sticky workspace header back on viewer (mobile)
9. Planner day tabs offset under topbar similarly
10. Bump cache to `v22-lesson-mobile-header` / `20260714-lesson-mobile-header`

### Tests to run / add

- `npm run test:lesson-editor-separation`
- `npm run test:lesson-editor-save-ux`
- `npm run test:lesson-viewer-action-bar`
- `npm run test:lesson-library-mobile-qa` (update if selectors need it)
- New smoke: no horizontal overflow + sticky bar not under topbar at 390×844

## Remaining rebuild steps (after 4)

| Step | Focus |
|------|--------|
| 5 | Download Weekly Calendar **DOCX** (primary; landscape Mon–Fri) — no DOCX lib yet; add `docx` or OOXML builder |
| 6 | Full Lesson Plan DOCX + PDF matching weekly calendar layout |
| 7 | Print consistency + full QA suite |

## Explicitly out of scope (still)

Recurring events, notifications, Family Hub, Google Calendar sync, staff calendars, RBAC.

## Key code locations

- Editor: `openLessonPlanEditor`, `renderUserLessonEditor`, `saveUserLessonEditorForm` in `app.js`
- Viewer chrome: `lessonWorkspaceChromeHtml`, `lessonWorkspaceActionBarsHtml`
- Assign sheet: `toggleLessonWorkspaceActionSheet`, `openLessonWorkspaceAssignSheet`
- Styles: `.lesson-editor-sticky-bar`, `.lesson-workspace-*`, `body.lesson-editor-view`
- Tests: `scripts/test-lesson-*.js`

## New agent start prompt (copy/paste)

```
Continue the Lesson Plan System Rebuild from LESSON_PLAN_REBUILD_HANDOFF.md.
Steps 1–3 are merged on main. Implement Step 4: mobile/header overlap polish
(branch cursor/lesson-mobile-header-6627 or fresh cursor/lesson-mobile-polish-6627),
then PR. After that continue Steps 5–7 (DOCX weekly calendar primary download, etc.).
```
