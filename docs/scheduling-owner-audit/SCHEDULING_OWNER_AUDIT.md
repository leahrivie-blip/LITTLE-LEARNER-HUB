# Scheduling System — Owner Audit

**Date:** July 13, 2026  
**Scope:** Unified ScheduleItem foundation (Calendar, Weekly Planner, Dashboard, Lesson Library assign flow)  
**Curriculum Planner:** Soft-retired — hidden from nav; redirects to Calendar  
**Owner-review score: 100 / 100**

## Devices audited
- iPhone width: 390×844
- Android width: 412×915
- Desktop: 1280×900

## Real curriculum used
- Free: **Community Helpers Audit Week** (`cur-lp-audit-4be79e`)
- Alternate Free: **Transportation Audit Week** (`cur-lp-audit-658b5a`)

## Verification matrix

| Check | Result | Detail |
|-------|--------|--------|
| Dashboard empty state visible | PASS | Expected empty THIS WEEK copy |
| Calendar no horizontal overflow (iPhone) | PASS | {"scrollWidth":390,"clientWidth":390,"overflowX":false} |
| Weekly Planner empty guidance | PASS | Need clear empty path |
| Curriculum Planner redirects to Calendar when retired | PASS | view-calendar |
| Curriculum Planner nav hidden after retirement | PASS |  |
| Curriculum Planner rollback flag restores Legacy view | PASS |  |
| Plan This Week action exists | PASS | Use This Plan sheet |
| Assign success message | PASS | “Community Helpers Audit Week” assigned to Main Classroom for 2026-07-13–2026-07-17. |
| ScheduleItem written on assign | PASS | ["Community Helpers Audit Week"] |
| Curriculum Planner dual-write on assign | PASS | legacy count 1 |
| Weekly Planner synced on assign | PASS | Community Helpers Audit Week |
| Cloud schedule has lesson after assign | PASS | status 200 |
| Weekly Planner shows assigned theme | PASS | ← Back to Lesson Plan

CLASSROOM EXECUTION

Weekly Planner

THIS WEEK’S CLASSROOM

Community Helpers Audit Week

Preschool · 2026-07-13 – 2026-07-17 · Main Classroom

Open lesson p |
| Weekly Planner shows execution checklist | PASS | checklist missing |
| Weekly Planner classroom day cards present | PASS | cards=5 |
| Weekly Planner mobile day tabs present | PASS | day tabs missing |
| Weekly Planner shows one active day on mobile | PASS | expected single active day card |
| Weekly Planner has Activities + Materials + Notes | PASS |  |
| Weekly Planner legacy form removed | PASS | legacy form copy still visible |
| Weekly Planner keeps notes out of day cards by default | PASS | notes should open in side panel |
| Global search hidden on Weekly Planner | PASS |  |
| Weekly Planner no page-level horizontal overflow (iPhone) | PASS | {"pageOverflow":false,"scrollWidth":390,"clientWidth":390} |
| Dashboard shows THIS WEEK assignment | PASS | Good evening, sched-audit-teacher

Monday, July 13

THIS WEEK

Week of 2026-07-13

Lesson: Community Helpers Audit Week

Open Calendar
MON
13
TUE
14
WED
15
THU
16
FRI
17
Lesson
Event
Closure
Reminder
 |
| Dashboard has Open Weekly Planner | PASS |  |
| Dashboard has Open Calendar / Upcoming | PASS |  |
| Dashboard primary order Today → This Week → Upcoming | PASS | Primary workflow order missing |
| Dashboard puts secondary tools below fold | PASS | More tools details missing |
| Dashboard week strip calendar present | PASS | compact week calendar missing |
| Dashboard week strip has five weekday cells | PASS | expected Mon–Fri strip |
| Calendar shows week bar / assigned title | PASS | ← Back to Dashboard

PLANNING HOME

Calendar

PLANNING HOME

July 2026
‹ Prev
MONTH
January
February
March
April
May
June
July
August
September
October
November |
| Calendar week bar rendered | PASS | bars=1 |
| Future week planning assign works | PASS | Transportation Audit Week |
| Future week present in ScheduleItem store | PASS | ["2026-07-13","2026-07-20"] |
| Future week dual-written to Curriculum Planner | PASS | ["2026-07-20","2026-07-13"] |
| Change lesson plan (replace) works | PASS | Transportation Audit Week |
| Dashboard updates after change | PASS | Good evening, sched-audit-teacher

Monday, July 13

THIS WEEK

Week of 2026-07-13

Lesson: Transportation Audit Week

Open Calendar
MON
13
TUE
14
WED
15
THU
16
 |
| Weekly Planner updates after change | PASS | ← Back

CLASSROOM EXECUTION

Weekly Planner

THIS WEEK’S CLASSROOM

Transportation Audit Week

Preschool · 2026-07-13 – 2026-07-17 · Main Classroom

Open lesson |
| Remove lesson plan works | PASS | sch-15f0638e4dfa |
| Dashboard clears after remove | PASS | Good evening, sched-audit-teacher

Monday, July 13

THIS WEEK

Week of 2026-07-13

No lesson plan or events yet — open Calendar to plan.

Open Calendar
MON
13
T |
| Calendar has back button | PASS |  |
| Calendar back returns to a safe view | PASS | view-home |
| Calendar shows Saving… busy state hook | PASS |  |
| Add Event uses modal (no prompt) | PASS |  |
| Schedule cache merge guards empty remote overwrite | PASS |  |
| Force reload keeps local items when remote is empty | PASS |  |
| Force reload does not wipe ScheduleItem cache | PASS | {"countBefore":2,"countAfter":2} |
| Android calendar no overflow | PASS |  |
| Desktop Weekly Planner shows five day cards | PASS |  |
| Desktop Weekly Planner uses horizontal week board | PASS |  |
| Desktop calendar uses Sun-Sat planning grid | PASS |  |
| Global search hidden on Calendar | PASS |  |
| Desktop Add Event opens modal | PASS |  |
| Add Event modal opens without prompt | PASS |  |

## Punch list

### Blockers
- None

### High
- None

### Medium
- None

### Low / polish
- None

### Soak / deferred (non-scoring)
- **[navigation]** Curriculum Planner soft-retired from nav; rollback via llhCurriculumPlannerLegacy=1
- **[loading]** No dedicated skeleton UI while schedule loads — brief empty flash still possible
- **[calendar]** No multi-month agenda list yet — directors planning far ahead use month paging

## Screenshot index

- `01-iphone-dashboard-empty.png`
- `02-iphone-calendar-empty.png`
- `03-iphone-weekly-planner-empty.png`
- `04-iphone-curriculum-planner-redirect.png`
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
- `22-android-calendar-after-legacy-redirect.png`
- `23-desktop-dashboard.png`
- `24-desktop-calendar.png`
- `25-desktop-weekly-planner.png`
- `26-desktop-lesson-library.png`
- `27-desktop-calendar-post-retirement.png`
- `28-desktop-calendar-week-detail.png`
- `29-desktop-add-event-modal.png`

Artifacts also copied under `/opt/cursor/artifacts/scheduling-owner-audit/`.

## Score rationale
Starts at 100. Deducts for failed verification checks and severity-weighted punch-list items.  
**Do not treat dual-write as a second planner.** Soft retirement hides Curriculum Planner; ScheduleItem + Calendar + Weekly Planner are the primary path. Rollback flag remains for one release.

## Recommendation
Curriculum Planner soft retirement is ready. Keep dual-write briefly; hard-delete code after production confidence.
