# Director / Classroom / Parent Architecture Proposal

**Status:** Architecture only — **no implementation in Phase 1**  
**Date:** July 13, 2026  
**Foundation to keep:** Cloud-backed `ScheduleItem` + Calendar / Weekly Planner / Dashboard / Lesson Library

Phase 1 established one scheduling OS. Phase 2 should extend identity and visibility — not rebuild planners.

## North-star hierarchy

```
Center
  └── Classroom(s)
        └── Teacher(s)
              └── Family / Parent view (read-filtered)
```

Each layer sees a filtered projection of the **same ScheduleItem store**.

## Roles (product model)

### Director Mode
- Owns the **center**
- Plans across classrooms
- Assigns shared or classroom-specific lesson plans
- Manages center-wide events, closures, reminders
- Grants staff permissions

### Teacher Mode
- Owns one (or a few assigned) **classroom(s)**
- Executes the assigned week in Weekly Planner
- Adds classroom notes and observation focus
- May create classroom-scoped events if permitted

### Parent / Family (future)
- Read-only calendar projection
- Sees: public events, closures, reminders, lesson **themes** (not private teacher notes)

## Data model extensions (additive)

Keep Phase 1 item types:

- `lesson_plan`
- `classroom_event`
- `closure`
- `reminder`

Add scope fields (proposed):

```json
{
  "id": "sch-…",
  "type": "lesson_plan",
  "centerId": "center-main",
  "classroomId": "classroom-toddlers",
  "visibility": "staff" | "center" | "parents",
  "sharedFromLessonPlanId": null,
  "weekStartDate": "2026-07-13",
  "execution": { "dailyTeacherNotes": {}, "observations": [], "dailyOps": {} }
}
```

### Classroom entity

```json
{
  "id": "classroom-toddlers",
  "centerId": "center-main",
  "name": "Toddler Room",
  "ageGroupDefault": "Toddler",
  "teacherUserIds": ["uid-…"]
}
```

### Permissions (staff)

| Capability | Director | Lead teacher | Assistant |
|------------|----------|--------------|-----------|
| Assign lesson plans | ✓ | classroom only (optional) | — |
| Edit center closures | ✓ | — | — |
| Add classroom events | ✓ | ✓ | optional |
| Edit execution notes | ✓ | ✓ classroom | ✓ classroom |
| View other classrooms | ✓ | — | — |
| Publish to parents | ✓ | optional | — |

Implement as capability flags, not separate apps.

## Surfaces (reuse, don’t fork)

| Surface | Director | Teacher | Parent |
|---------|----------|---------|--------|
| Calendar | Center + classroom filters; assign plans | Classroom calendar (filtered) | Parent calendar (visibility=parents) |
| Weekly Planner | Optional classroom switcher | Classroom execution | — |
| Dashboard | Center overview + per-room cards | TODAY → THIS WEEK → UPCOMING for assigned room | Optional “this week’s theme” card |
| Lesson Library | Assign to classroom / week | Assign if permitted | — |

**Do not** create:

- A second “Director Planner”
- A separate “Parent Planner” write UI
- Competing assignment flows

## Calendar scopes

1. **Center-wide calendar** — closures, center events, reminders that apply to all rooms  
2. **Classroom calendars** — lesson plans + room events  
3. **Teacher execution view** — Weekly Planner for the active classroom week  

UI suggestion: one Calendar with a classroom filter chips row (`All · Toddlers · Preschool · …`).

## Shared lesson plans

- Lesson Library remains the catalog
- Assign creates a ScheduleItem per classroom week (copy-on-assign snapshot stays)
- “Shared plan” means same `lessonPlanId` referenced by multiple classroom ScheduleItems — not one mutable shared row that fights classroom notes

## Parent calendar projection

Parent-visible fields only:

- Event title + date (if `visibility` includes parents)
- Closure dates
- Reminders marked parent-visible
- Lesson plan **theme / title** for the week (not activity checklists, not teacher notes, not observations)

Private forever:

- `execution.teacherNotes`
- `execution.dailyTeacherNotes`
- `execution.observations`
- Staff-only reminders

## Migration path from Phase 1

Current Phase 1 docs already have a default classroom (`classroom-main`). Phase 2:

1. Promote that default into a real Classroom record under a Center
2. Backfill `centerId` / `classroomId` on existing ScheduleItems
3. Add filter UI before multi-room creation UX
4. Add permissions last (after filters feel solid)

## Implementation phases (future)

### Phase 2A — Multi-classroom foundation
- Classroom CRUD for directors
- Calendar classroom filter
- ScheduleItem scoped queries

### Phase 2B — Staff permissions
- Role assignment
- Capability-gated assign / event create

### Phase 2C — Center-wide items
- Closures / reminders with `classroomId: null` meaning center-wide
- Dashboard center rollup

### Phase 2D — Parent calendar
- Parent auth / invite
- Read API filtering by visibility
- Theme-only lesson projection

## Success criteria for Phase 2

Directors understand: **Center calendar → filter classroom → assign plan**  
Teachers understand: **My classroom → Weekly Planner**  
Families understand: **What’s happening this week** — without seeing staff paperwork

## Explicit non-goals (now)

- No implementation in the current Phase 1 polish PR
- No redesign of Weekly Planner architecture
- No retirement of Curriculum Planner inside Phase 2A
- No multi-center franchising UI yet (schema may reserve `centerId` only)
