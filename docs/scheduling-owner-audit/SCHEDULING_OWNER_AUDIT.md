# Scheduling System — Owner Audit

**Date:** July 13, 2026  
**Scope:** Unified ScheduleItem foundation (Calendar, Weekly Planner, Dashboard, Lesson Library assign flow)  
**Curriculum Planner:** Still present — dual-write verified; **not retired**  
**Owner-review score: 90 / 100**

## Devices audited
- iPhone width: 390×844
- Android width: 412×915
- Desktop: 1280×900

## Real curriculum used
- Free: **Community Helpers Audit Week** (`cur-lp-audit-d7596f`)
- Alternate Free: **Transportation Audit Week** (`cur-lp-audit-588b5a`)

## Verification matrix

| Check | Result | Detail |
|-------|--------|--------|
| Dashboard empty state visible | PASS | Expected empty THIS WEEK copy |
| Calendar no horizontal overflow (iPhone) | PASS | {"scrollWidth":390,"clientWidth":390,"overflowX":false} |
| Weekly Planner empty guidance | PASS | Need clear empty path |
| Curriculum Planner still available | PASS | Must not be retired yet |
| Plan This Week action exists | PASS | Use This Plan sheet |
| Assign success message | PASS | “Community Helpers Audit Week” assigned to Main Classroom for 2026-07-13–2026-07-17. |
| ScheduleItem written on assign | PASS | ["Community Helpers Audit Week"] |
| Curriculum Planner dual-write on assign | PASS | legacy count 1 |
| Weekly Planner synced on assign | PASS | Community Helpers Audit Week |
| Cloud schedule has lesson after assign | PASS | status 200 |
| Weekly Planner shows assigned theme | PASS | ← Back to Lesson Plan

EXECUTION

Weekly Planner

Your classroom week — activities, materials, notes, and observations.

WEEKLY CLASSROOM VIEW

Community Helpers Audit Week

Presch |
| Weekly Planner shows execution checklist | PASS | checklist missing |
| Weekly Planner classroom day cards present | PASS | cards=5 |
| Weekly Planner mobile day tabs present | PASS | day tabs missing |
| Weekly Planner shows one active day on mobile | PASS | expected single active day card |
| Weekly Planner has Activities + Materials + Notes | PASS |  |
| Weekly Planner legacy form removed | PASS | legacy form copy still visible |
| Weekly Planner no horizontal overflow (iPhone) | PASS | {"scrollWidth":390,"clientWidth":390,"overflowX":false} |
| Dashboard shows THIS WEEK assignment | PASS | Good afternoon, sched-audit-teacher

Monday, July 13

TODAY

Monday

Soil and Seeds Monday

ACTIVITIES

Soil Scientists Tray
Seed Sort Lab

REMINDERS

No reminders for today.

OBSERVATIONS

Add observ |
| Dashboard has Open Weekly Planner | PASS |  |
| Dashboard has Open Calendar / Upcoming | PASS |  |
| Dashboard primary order Today → This Week → Upcoming | PASS | Primary workflow order missing |
| Dashboard puts secondary tools below fold | PASS | More tools details missing |
| Calendar shows week bar / assigned title | PASS | ← Back to Dashboard

PLANNING

Calendar

Plan future weeks, lesson plans, classroom events, closures, and reminders.

PLANNING

July 2026
Previous
Today
Next
As |
| Calendar week bar rendered | PASS | bars=1 |
| Future week planning assign works | PASS | Transportation Audit Week |
| Future week present in ScheduleItem store | PASS | ["2026-07-13","2026-07-20"] |
| Future week dual-written to Curriculum Planner | PASS | ["2026-07-20","2026-07-13"] |
| Change lesson plan (replace) works | PASS | Transportation Audit Week |
| Dashboard updates after change | PASS | Good afternoon, sched-audit-teacher

Monday, July 13

TODAY

Monday

Soil and Seeds Monday

ACTIVITIES

Soil Scientists Tray
Seed Sort Lab

REMINDERS

No remind |
| Weekly Planner updates after change | PASS | ← Back to Dashboard

EXECUTION

Weekly Planner

Your classroom week — activities, materials, notes, and observations.

WEEKLY CLASSROOM VIEW

Transportation Aud |
| Remove lesson plan works | PASS | sch-2f78977624d4 |
| Dashboard clears after remove | PASS | Good afternoon, sched-audit-teacher

Monday, July 13

TODAY

Monday

No lesson plan assigned for this week yet.

THIS WEEK

No plan assigned

2026-07-13 – 2026- |
| Calendar has back button | PASS |  |
| Calendar back returns to a safe view | PASS | view-home |
| Calendar shows Saving… busy state hook | PASS |  |
| Add Event uses modal (no prompt) | PASS |  |
| Schedule cache merge guards empty remote overwrite | PASS |  |
| Force reload keeps local items when remote is empty | PASS |  |
| Force reload does not wipe ScheduleItem cache | PASS | {"countBefore":2,"countAfter":2} |
| Android calendar no overflow | PASS |  |
| Desktop Weekly Planner shows five day cards | PASS |  |
| Desktop calendar uses weekday planning grid | PASS |  |
| Desktop Add Event opens modal | PASS |  |
| Add Event modal opens without prompt | PASS |  |

## Punch list

### Blockers
- None

### High
- None

### Medium
- **[calendar]** Calendar chrome feels button-heavy on mobile — 24 visible buttons

### Low / polish
- **[navigation]** Curriculum Planner and Calendar both remain in nav — intentional until 90+ re-audit and retirement gate
- **[loading]** No dedicated skeleton UI while schedule loads — brief empty flash still possible
- **[calendar]** No multi-month agenda list yet — directors planning far ahead use month paging

## Screenshot index

- `01-iphone-dashboard-empty.png`
- `02-iphone-calendar-empty.png`
- `03-iphone-weekly-planner-empty.png`
- `04-iphone-curriculum-planner-legacy.png`
- `05-iphone-lesson-library.png`
- `06-iphone-lesson-workspace.png`
- `07-iphone-use-this-plan-sheet.png`
- `08-iphone-plan-this-week-form.png`
- `09-iphone-assign-success.png`
- `10-iphone-weekly-planner-assigned.png`
- `11-iphone-dashboard-assigned.png`
- `12-iphone-calendar-assigned.png`
- `13-iphone-calendar-future-week.png`
- `14-iphone-dashboard-after-change.png`
- `15-iphone-planner-after-change.png`
- `16-iphone-calendar-after-change.png`
- `17-iphone-dashboard-after-remove.png`
- `18-android-dashboard.png`
- `19-android-calendar.png`
- `20-android-weekly-planner.png`
- `21-android-lesson-library.png`
- `22-android-curriculum-planner.png`
- `23-desktop-dashboard.png`
- `24-desktop-calendar.png`
- `25-desktop-weekly-planner.png`
- `26-desktop-lesson-library.png`
- `27-desktop-curriculum-planner.png`
- `28-desktop-calendar-week-detail.png`
- `29-desktop-add-event-modal.png`

Artifacts also copied under `/opt/cursor/artifacts/scheduling-owner-audit/`.

## Score rationale
Starts at 100. Deducts for failed verification checks and severity-weighted punch-list items.  
**Do not merge as “Curriculum Planner retired.”** Score reflects production readiness of the new scheduling surfaces while legacy planner still coexists.

## Recommendation
Teacher UX pass meets the 90+ gate for soak; keep Curriculum Planner until a final retirement re-audit.
