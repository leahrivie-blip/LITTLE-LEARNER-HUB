# Scheduling Phase 1 — Owner Approved + Curriculum Planner Soft Retirement

**Date:** July 13, 2026  
**Owner-review score: 100 / 100**  
**Curriculum Planner:** Soft-retired (nav hidden; redirects to Calendar)

## Primary workflow (locked)

1. **Dashboard** — week strip + TODAY → THIS WEEK → UPCOMING  
2. **Calendar** — planning home (assign plans, events, closures, reminders)  
3. **Weekly Planner** — classroom execution  
4. **Lesson Library** — assignment source  

## Soft retirement

- Legacy Curriculum Planner removed from default nav  
- Deep links redirect to Calendar with a “moved” banner  
- Rollback: `localStorage.setItem('llhCurriculumPlannerLegacy','1')`  
- Dual-write retained briefly for safety  

See `docs/CURRICULUM_PLANNER_RETIREMENT_PLAN.md`.

## Future enhancement (parked)

Dashboard day-tap quick preview of lessons/events/materials — not required now.
