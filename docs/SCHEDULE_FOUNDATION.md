# ScheduleItem Foundation — Implementation Notes

**Date:** July 13, 2026 (updated Phase 4 — 2026-08-08)  
**Status:** Foundation shipped; Phase 4 marks **program schedule** as authoritative  

## Authoritative source (Phase 4)

| Layer | Path | Role |
|---|---|---|
| **Canonical** | `store.programData[programId].schedule` | Source of truth for classrooms + items |
| Temporary mirror | `store.scheduleByUser[uid]` | Write mirror / read fallback during migration — **not** permanent |
| Client cache | `localStorage llhScheduleItems:{email}` | Offline cache of schedule doc |
| Temporary planner cache | `localStorage llhWeeklyPlanner` | Dual-read fallback only when no schedule lesson item for the week |

### Weekly Planner dual-read (temporary)

1. Prefer schedule lesson item for the focused week (`buildPlannerFromLessonItem`).
2. Fall back to `llhWeeklyPlanner` only if no schedule item exists.
3. Edits must persist via `updateScheduleLessonSnapshot` / schedule APIs.

**Before removing the planner fallback:** all active weeks live on schedule; migration flags set; ops confirms Calendar and View Weekly Plan match without LS planner.

**Before removing `scheduleByUser` mirror:** set `CANONICAL_MIRROR_LEGACY=0` on testing after drift is clean; confirm no readers depend on UID buckets; then stop writes (reads may keep fallback one release).

## What landed

### Server
- `server/schedule-lib.js` — normalize, migrate, upsert, filter helpers
- APIs (auth: Firebase Bearer, or `Bearer test:` / `X-LLH-User-Email` when Firebase not ready / test):
  - `GET /api/schedule`
  - `PUT /api/schedule`
  - `POST /api/schedule/migrate`
  - `PUT /api/schedule/weeks/:weekStart`
  - `PUT /api/schedule/items/:id`
  - `DELETE /api/schedule/items/:id`
- Store path (canonical): `store.programData[programId].schedule` via `program-ownership.writeProgramSchedule`

### Client
- `scripts/llh-schedule.js` — local cache + cloud sync + legacy migrate
- `assignScheduleLessonPlan` — one write path; dual-writes Curriculum Planner localStorage (temporary)
- Main **Calendar** view (`#view-calendar`)
- Weekly Planner execution checklist from assignment snapshot (schedule-authoritative dual-read)

## Still deferred (by design)
- Permanently deleting `llhWeeklyPlanner` / `llhCurriculumAssignments` after ops sign-off
- Permanently stopping `scheduleByUser` mirrors (`CANONICAL_MIRROR_LEGACY=0`)
- Multi-center / director permission UI
- Parent calendar delivery

## Test
```bash
npm run test:schedule-foundation
npm run test:canonical-fixtures-phase4
```
