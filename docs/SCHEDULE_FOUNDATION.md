# ScheduleItem Foundation — Implementation Notes

**Date:** July 13, 2026  
**Status:** Foundation shipped on this branch  

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
- Store path: `store.scheduleByUser[uid]`

### Client
- `scripts/llh-schedule.js` — local cache + cloud sync + legacy migrate
- `assignScheduleLessonPlan` — one write path; dual-writes Curriculum Planner localStorage
- Main **Calendar** view (`#view-calendar`)
- Dashboard THIS WEEK / UPCOMING from ScheduleItem
- Weekly Planner execution checklist generated from assignment snapshot
- Lesson Library “Plan This Week” success → Open Weekly Planner primary

### Design system
- Tokens loaded app-wide (`styles/llh-design-tokens.css`)
- New scheduling surfaces use lavender-led LLH chrome

## Still deferred (by design)
- Multi-center / director permission UI
- Parent calendar delivery
- Birthdays / form deadlines / staff events as first-class types (schema can grow)
- Deleting Curriculum Planner (kept alive; dual-write)

## Test
```bash
npm run test:schedule-foundation
```
