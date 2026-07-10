# Phase 2H Implementation Plan (Authorized Cleanup)

**Branch:** `cursor/phase-2h-curriculum-cleanup-6400`  
**Date:** July 10, 2026

## 1. Exact files and functions affected

### Primary
| File | Change |
|------|--------|
| `app.js` | Remove `buildLessonPlans`, `buildActivityLibrary`, legacy admin LP/activities, fallback; always use curriculum adapters; empty states; favorites graceful fail; move curriculum status UI |
| `server/index.js` | Curriculum backup + wipe endpoints; stop exposing legacy LP/activities; always serve `curriculumLibrary`; remove generate-lesson-plan route; strip legacy fields from defaults over time |
| `scripts/phase-2h-backup.js` | Export legacy + curriculum backups, record counts |
| `scripts/phase-2h-wipe-curriculum.js` | Clear curriculum collections (local / admin-gated) |
| `scripts/phase-2h-verify.js` | Empty-state + temp lesson sync verification |
| `scripts/test-curriculum-*.js` | Align with always-on curriculum, no legacy tabs |
| `PHASE_2H_IMPLEMENTATION_PLAN.md` | This plan |
| `PHASE_2H_LEGACY_REMOVAL_PLAN.md` | Keep as audit reference |

### Keep (do not gut)
- Curriculum importer/editor/save, `syncCurriculumActivitiesForLessonPlan`
- Curriculum Activities browser, Curriculum Resources
- `loadCurriculumManagedLessonPlans/Activities`, Free/Pro gating
- Observations, forms, printables, menus, billing, users, Family Hub

## 2. Removal waves and rollback

| Wave | Scope | Rollback |
|------|-------|----------|
| W0 | Backups + inventory + backup/wipe APIs | Revert commit; backups remain on disk |
| W1 | Always-on curriculum; move status UI; remove `CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY` | Revert commit |
| W2 | Clear `curriculum.lessonPlans/activities/resources` to [] | Restore curriculum backup JSON |
| W3 | Remove legacy lesson generators, overrides, admin LP tools, visibility limits | Revert commit |
| W4 | Remove legacy activity generators + CMS activities admin | Revert commit |
| W5 | Favorites/portfolio/empty states/counts | Revert commit |
| W6 | Verification script + tests | Revert commit |

## 3. Backup verification

- Local store path: `server/data/launch-store.json`
- Pre-wipe inventory (local): 6 curriculum LPs, 55 activities, 0 resources; 0 legacy overrides/custom/CMS
- Hardcoded generators still in code until W3/W4: 900 LPs, 360 activities
- Production: no admin credentials in this environment — wipe API shipped for post-deploy admin run; public API currently flag-off

## 4. Dependency checklist

- [ ] Favorites: orphan `lesson-*` / legacy activity ids fail gracefully
- [ ] Portfolio / planner suggestions use curriculum resources only
- [ ] Search / viewer / print use curriculum adapters
- [ ] Free/Pro gating unchanged mechanics on curriculum items
- [ ] Nav / back / empty states updated
- [ ] Admin visibility no longer lists 900 legacy plans
- [ ] Marketing/library counts from curriculum
- [ ] Observations/forms/printables/menus/billing untouched
