# Lesson Plan System Rebuild — Handoff

Last updated: July 14, 2026  
Repo: `github.com/leahrivie-blip/LITTLE-LEARNER-HUB`  
Base branch: `main`  
Current cache (this branch): `llh-shell-v23-lesson-docx` / `?v=20260714-lesson-docx`

## Status

| Step | Focus | Status | PR / Branch |
|------|--------|--------|-------------|
| 1 | Separate Create vs Edit + true editor | Merged | [#173](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/173) |
| 2 | Viewer action bars | Merged | [#174](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/174) |
| 3 | Save UX | Merged | [#175](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/175) |
| 4 | Mobile / header overlap polish | Open (merge when ready) | [#176](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/176) `cursor/lesson-mobile-header-6627` |
| 5 | Weekly Calendar **DOCX** (landscape Mon–Fri) | This PR | `cursor/lesson-weekly-calendar-docx-cf3e` |
| 6 | Full Lesson Plan DOCX (+ existing PDF button) | This PR | same |
| 7 | Print consistency + QA suite | This PR | same |

## What this branch adds (Steps 5–7)

- Pure-JS OOXML builder: `scripts/llh-lesson-docx.js` (no npm `docx` dependency)
- **Download Weekly Calendar** → landscape Mon–Fri `.docx` (primary)
- **Download Full Lesson Plan** → portrait full-plan `.docx`
- **Download PDF** unchanged (existing PDF path)
- Weekly **Print** uses landscape Letter + 5-column day board (`body.printing-lesson-week`)
- Tests:
  - `npm run test:lesson-docx`
  - `npm run test:lesson-weekly-docx`
  - `npm run test:lesson-print-qa`

## Explicitly out of scope (still)

Recurring events, notifications, Family Hub, Google Calendar sync, staff calendars, RBAC.

## Key code locations

- DOCX: `scripts/llh-lesson-docx.js`
- Wiring: `downloadLessonPlanVariant`, `buildLessonPlanWeeklyCalendarDocxBlob`, `buildLessonPlanFullDocxBlob` in `app.js`
- Print CSS: `body.printing-lesson-week`, `@page lesson-week-landscape`
