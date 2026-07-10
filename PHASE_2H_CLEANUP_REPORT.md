# Phase 2H Cleanup Report

**Branch:** `cursor/phase-2h-curriculum-cleanup-6400`  
**Date:** July 10, 2026

## Backups (Step 1)

Local backups written under `backups/phase-2h/` (gitignored):

| Artifact | Counts |
|----------|--------|
| Legacy backup | 900 hardcoded shells (code), 0 overrides, 0 custom, 0 CMS activities |
| New curriculum backup | **6** lesson plans, **55** activities, **0** resources (Phase 2F test set) |
| Restore check | Passed (counts + checksum + restore shape) |

Server endpoints added:

- `GET /api/admin/curriculum/backup` — legacy CMS slice (unchanged purpose)
- `GET /api/admin/curriculum/backup/new` — play-based curriculum only
- `GET /api/admin/curriculum/backup/full` — both
- `POST /api/admin/curriculum/wipe` — requires `confirm: "WIPE_CURRICULUM"`

**Production note:** This environment has no admin credentials for Render. After deploy, run full backup then wipe once with an admin token to clear production test curriculum.

## What changed

### Removed / retired
- `buildLessonPlans()` (900 shells)
- `buildActivityLibrary()` (360 shells)
- `CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY` and runtime fallback path
- Legacy Lesson Plans + Activities admin tabs
- Legacy activity CMS config (`adminManagedContentConfig.activities`)
- Legacy visibility limits / old-domain hide rules
- `/api/admin/generate-lesson-plan` route
- Public exposure of legacy `lessonPlans` / `customLessonPlans` / `activities`
- Local test curriculum content wiped to **0 / 0 / 0**

### Kept
- Play-Based Lesson importer + editor
- Automatic lesson→activity sync (`syncCurriculumActivitiesForLessonPlan`)
- Curriculum Activities browser
- Curriculum Resources system
- Public curriculum library adapters
- Free/Pro gating, search/view/print paths (curriculum-backed)

### Always-on curriculum
- `isPlayBasedCurriculumEnabled()` / `useCurriculumLibrarySources()` → always `true`
- Server `normalizedFeatureFlags` always `{ playBasedCurriculum: true }`
- Public API always includes `curriculumLibrary`
- Admin status banner: “Play-Based Curriculum is the active lesson and activity system.”

## Empty states
- Lesson Plan Library: “New play-based lesson plans are being added.”
- Activity Library: “Activities will appear automatically when lesson plans are published.”

## Verification
`node scripts/phase-2h-verify.js` — passed (temp lesson sync → 1 activity → wipe → 0/0/0)

Also passed:
- `test-curriculum-lesson-plan-save.js`
- `test-curriculum-activities-browser.js`
- `test-curriculum-uploads-storage.js`
- `test-store-write-race.js`

## Final local counts
- New curriculum lesson plans: **0**
- New curriculum activities: **0**
- New curriculum resources: **0**
- Legacy generators: **removed from code**
- Legacy lesson/activity admin systems: **removed from nav / retired**

## Post-deploy (production)
1. `GET /api/admin/curriculum/backup/full?adminToken=…`
2. `POST /api/admin/curriculum/wipe` with `{ adminToken, confirm: "WIPE_CURRICULUM" }`
3. Confirm admin Play-Based Lessons / Activities / Resources show 0
4. Begin real curriculum batches via importer
