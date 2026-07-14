# Lesson Plan System Rebuild — Handoff

Last updated: July 14, 2026  
Repo: `github.com/leahrivie-blip/LITTLE-LEARNER-HUB`  
Base branch: `main`  
Current cache: `llh-shell-v22-lesson-mobile-header` / `?v=20260714-lesson-mobile-header`

## Merged steps (done)

| Step | Focus | PR | Branch |
|------|--------|-----|--------|
| 1 | Separate Create vs Edit + true editor | [#173](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/173) | `cursor/lesson-plan-editor-separation-6627` |
| 2 | Viewer action bars (Edit / Calendar / My Week / downloads) | [#174](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/174) | `cursor/lesson-viewer-action-bar-6627` |
| 3 | Save UX (Save/Discard/Cancel + after-save panel) | [#175](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/175) | `cursor/lesson-editor-save-ux-6627` |

## In progress / this branch

| Step | Focus | PR | Branch |
|------|--------|-----|--------|
| 4 | Mobile / header overlap polish | [#176](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/176) | `cursor/lesson-mobile-header-6627` |

### Step 4 changes

- CSS vars `--llh-topbar-height` / `--llh-editor-sticky-height`
- Mobile sticky editor bar sits below measured topbar (not under it)
- Slimmed `body.lesson-editor-view` topbar (mirrors lessons-view)
- `viewport-fit=cover` on meta viewport
- `syncTopbarMetrics()` after editor render / view change / resize
- `overflow-x: clip` on editor + lesson workspace
- Full-width mobile tap targets for Back/actions
- Sticky workspace header back on viewer (mobile)
- Planner day tabs offset under topbar
- Cache bumped to `v22-lesson-mobile-header`
- Smoke: `npm run test:lesson-mobile-header`

## Remaining rebuild steps (after 4)

| Step | Focus |
|------|--------|
| 5 | Download Weekly Calendar **DOCX** (primary; landscape Mon–Fri) — no DOCX lib yet; add `docx` or OOXML builder |
| 6 | Full Lesson Plan DOCX + PDF matching weekly calendar layout |
| 7 | Print consistency + full QA suite |

## Explicitly out of scope (still)

Recurring events, notifications, Family Hub, Google Calendar sync, staff calendars, RBAC.

## Key code locations

- Editor: `openLessonPlanEditor`, `renderUserLessonEditor`, `saveUserLessonEditorForm`, `syncTopbarMetrics` in `app.js`
- Viewer chrome: `lessonWorkspaceChromeHtml`, `lessonWorkspaceActionBarsHtml`
- Styles: `.lesson-editor-sticky-bar`, `.lesson-workspace-*`, `body.lesson-editor-view`, `--llh-topbar-height`
- Tests: `scripts/test-lesson-*.js` (+ `test-lesson-mobile-header.js`)

## New agent start prompt (copy/paste)

```
Continue the Lesson Plan System Rebuild from LESSON_PLAN_REBUILD_HANDOFF.md.
Steps 1–3 are merged on main. Step 4 (mobile/header) is on PR #176 —
confirm merged or finish polish. Then implement Steps 5–7:
Weekly Calendar DOCX primary download, full lesson DOCX/PDF, print QA.
```
