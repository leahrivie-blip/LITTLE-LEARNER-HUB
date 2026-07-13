# Curriculum Planner Retirement Plan

**Status:** Soak period — **do not retire yet**  
**Date:** July 13, 2026  
**Gate:** Scheduling Phase 1 approved (owner audit **94/100**). Retirement requires a dedicated post-soak decision.

## Why it stays as Legacy

Curriculum Planner remains visible and dual-written so real-world teachers and directors can:

1. Compare old vs new workflows during soak
2. Recover if any ScheduleItem edge case appears
3. Confirm migration completeness before permanent removal

Nav label: **Curriculum Planner · Legacy**

## Source of truth during soak

| Concern | Source of truth | Legacy role |
|---------|-----------------|-------------|
| Lesson plan week assignment | `ScheduleItem` (cloud + cache) | Dual-write mirror |
| Classroom execution notes / checks | `ScheduleItem.execution` | Optional sync into Weekly Planner local cache |
| Events / closures / reminders | `ScheduleItem` types | Not owned by Curriculum Planner |
| Lesson catalog | Lesson Library | Unchanged |

## Retirement prerequisites (all required)

- [ ] Soak period complete with no P0/P1 scheduling defects
- [ ] Owner confirms teachers use Calendar + Weekly Planner as primary path
- [ ] Dual-write verified across Free / Pro accounts for ≥ N active weeks
- [ ] Export/backup of remaining Curriculum Planner local assignments documented
- [ ] Support FAQ updated (“Where did Curriculum Planner go?”)
- [ ] Final retirement audit score ≥ **90/100** with Curriculum Planner **hidden**
- [ ] Explicit owner approval to remove nav entry and view

## Migration checklist

### Data

- [ ] Confirm every `llhCurriculumAssignments:{email}` lesson week has a matching `ScheduleItem` (`type: lesson_plan`)
- [ ] Confirm Weekly Planner execution notes live on ScheduleItem (not only `llhWeeklyPlanner`)
- [ ] One-time migration job already available: `POST /api/schedule/migrate` — re-run with `force` only if gaps found
- [ ] Snapshot backup of assignment stores before code removal

### Product / UI

- [ ] Remove Curriculum Planner nav item
- [ ] Remove `#view-curriculum-planner` and related renderers **or** redirect to Calendar
- [ ] Remove Lesson Library “Open Curriculum Planner” leftovers (already removed from success sheet)
- [ ] Keep “Plan This Week” → ScheduleItem assign as the only assignment write
- [ ] Update empty states that still mention Curriculum Planner language

### Engineering

- [ ] Stop dual-write once soak confidence is high (feature flag recommended)
- [ ] Delete Curriculum Planner–only localStorage keys after one release of dual-read
- [ ] Update e2e / owner audit to assert Curriculum Planner is **gone**
- [ ] Update `UNIFIED_SCHEDULING_SYSTEM_ARCHITECTURE.md` retirement status

### Support / comms

- [ ] In-app banner: “Curriculum Planner has moved into Calendar + Weekly Planner”
- [ ] Short Loom or help article for directors
- [ ] Rollback note: Legacy view can be re-enabled via flag for one release

## Recommended soak exit criteria

Retirement is ready when:

1. Directors assign future weeks from **Calendar** without opening Legacy
2. Teachers run the week from **Weekly Planner** without opening Legacy
3. Dashboard reflects ScheduleItem without Legacy fallback being required
4. Zero support tickets asking “which planner do I use?”

## Explicit non-goals for retirement PR

- Do not invent a third planner
- Do not redesign ScheduleItem
- Do not ship Director Mode / multi-classroom in the retirement PR
- Do not remove parent-calendar future hooks if already reserved in schema
