# Curriculum Planner Retirement Plan

**Status:** Soft-retired (owner approved July 13, 2026)  
**Gate met:** Scheduling Phase 1 owner-approved at **100/100**; Calendar + Weekly Planner are the primary path.

## What shipped in soft retirement

- Curriculum Planner **removed from nav** by default
- Deep links / `setView("curriculum-planner")` **redirect to Calendar** with a one-time “moved” banner
- Lesson Library Legacy entry points redirect to **Calendar** (or Lesson Library assign)
- **Dual-write** to `llhCurriculumAssignments` still active for one release (safe rollback / migration)
- View code retained behind rollback flag — not deleted yet

## Rollback (support)

```js
localStorage.setItem("llhCurriculumPlannerLegacy", "1");
location.reload();
```

To hide again:

```js
localStorage.removeItem("llhCurriculumPlannerLegacy");
location.reload();
```

## Source of truth now

| Concern | Source of truth |
|---------|-----------------|
| Lesson plan week assignment | `ScheduleItem` (cloud + cache) |
| Classroom execution notes / checks | `ScheduleItem.execution` |
| Events / closures / reminders | `ScheduleItem` types |
| Lesson catalog | Lesson Library |
| Legacy Curriculum Planner store | Dual-write mirror only |

## Hard-delete checklist (next release, optional)

### Data
- [x] Soft retirement live; ScheduleItem is primary write path
- [ ] Confirm no support need for Legacy after soak in production
- [ ] Stop dual-write behind flag, then remove
- [ ] Delete Curriculum Planner–only localStorage keys after one release of dual-read

### Product / UI
- [x] Remove Curriculum Planner nav item (default)
- [x] Redirect `#view-curriculum-planner` to Calendar
- [x] Remove Lesson Library “Open Curriculum Planner” primary path
- [x] Keep “Plan This Week” → ScheduleItem assign as the only assignment write
- [ ] Delete unused Curriculum Planner renderers after dual-write stop

### Engineering
- [x] Feature flag / rollback: `llhCurriculumPlannerLegacy`
- [x] Owner audit asserts Curriculum Planner is **hidden** and redirects
- [ ] Remove dual-write code in a follow-up PR
- [ ] Update architecture doc status to hard-retired when code is deleted

### Support / comms
- [x] In-app banner when Legacy route is hit
- [ ] Optional help article for directors
- [x] Rollback note documented above

## Explicit non-goals completed / still deferred

- No third planner invented
- ScheduleItem not redesigned
- Director Mode / multi-classroom not shipped in this retirement
- Parent calendar still future work
