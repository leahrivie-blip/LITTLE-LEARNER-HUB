# AI Guide button audit (Phases 1–3)

Generated: 2026-07-30T19:07:59.994Z

**PASS:** 214 · **GAP:** 0 · **FAIL:** 0

## Testing site status (at audit time)

- Code on testing: `20260730-ai-guide-audit` / merge commit present
- Feature flag: requires `AI_GUIDE_ENABLED=true` + `AI_GUIDE_TESTING_ONLY=true` on testing only
- Production must keep these unset

## Results

| Status | Area | Detail |
|--------|------|--------|
| PASS | Fence | Health reports aiGuideEnabled=true |
| PASS | Client flag | isAiGuideEnabled=true |
| PASS | Auth | isLoggedIn=true |
| PASS | Nav button | AI Guide nav visible when signed in |
| PASS | Open view | AI Guide page active |
| PASS | Home categories | 14 enabled category cards |
| PASS | Category label | “Lesson Planning” present |
| PASS | Category label | “Activities” present |
| PASS | Category label | “Observations” present |
| PASS | Category label | “Daily Reports” present |
| PASS | Category label | “Parent Communication” present |
| PASS | Category label | “Incident” present |
| PASS | Category label | “Behavior” present |
| PASS | Category label | “Child Development” present |
| PASS | Category label | “Forms” present |
| PASS | Category label | “Policies” present |
| PASS | Category label | “Staff” present |
| PASS | Category label | “Enrollment” present |
| PASS | Category label | “Administrative Writing” present |
| PASS | Category label | “Ask About My Program” present |
| PASS | Insights | insights panel rendered |
| PASS | Category open | observations → compose |
| PASS | Generate | observations draft length=170 |
| PASS | Review banner | observations |
| PASS | No auto-send | observations: dangerousButtons=0 |
| PASS | Revise buttons | observations: 10/10 |
| PASS | Revise click | observations: make_shorter |
| PASS | Save draft | observations |
| PASS | Copy | observations |
| PASS | Feedback buttons | observations: 5/5 |
| PASS | Use helpers | observations: present |
| PASS | Clear | observations |
| PASS | Back home | observations |
| PASS | Category open | daily-reports → compose |
| PASS | Generate | daily-reports draft length=201 |
| PASS | Review banner | daily-reports |
| PASS | No auto-send | daily-reports: dangerousButtons=0 |
| PASS | Revise buttons | daily-reports: 10/10 |
| PASS | Revise click | daily-reports: make_shorter |
| PASS | Save draft | daily-reports |
| PASS | Copy | daily-reports |
| PASS | Feedback buttons | daily-reports: 5/5 |
| PASS | Use helpers | daily-reports: present |
| PASS | Clear | daily-reports |
| PASS | Back home | daily-reports |
| PASS | Category open | behavior → compose |
| PASS | Generate | behavior draft length=297 |
| PASS | Review banner | behavior |
| PASS | No auto-send | behavior: dangerousButtons=0 |
| PASS | Revise buttons | behavior: 10/10 |
| PASS | Revise click | behavior: make_shorter |
| PASS | Save draft | behavior |
| PASS | Copy | behavior |
| PASS | Feedback buttons | behavior: 5/5 |
| PASS | Use helpers | behavior: present |
| PASS | Clear | behavior |
| PASS | Back home | behavior |
| PASS | Category open | parent-communication → compose |
| PASS | Templates | Save as template clicked |
| PASS | Demo fixtures | fixture filled notes |
| PASS | Generate | parent-communication draft length=96 |
| PASS | Review banner | parent-communication |
| PASS | No auto-send | parent-communication: dangerousButtons=0 |
| PASS | Revise buttons | parent-communication: 10/10 |
| PASS | Revise click | parent-communication: make_shorter |
| PASS | Save draft | parent-communication |
| PASS | Copy | parent-communication |
| PASS | Feedback buttons | parent-communication: 5/5 |
| PASS | Use helpers | parent-communication: present |
| PASS | Clear | parent-communication |
| PASS | Back home | parent-communication |
| PASS | Category open | incident → compose |
| PASS | Generate | incident draft length=284 |
| PASS | Review banner | incident |
| PASS | No auto-send | incident: dangerousButtons=0 |
| PASS | Revise buttons | incident: 10/10 |
| PASS | Revise click | incident: make_shorter |
| PASS | Save draft | incident |
| PASS | Copy | incident |
| PASS | Feedback buttons | incident: 5/5 |
| PASS | Use helpers | incident: present |
| PASS | Clear | incident |
| PASS | Back home | incident |
| PASS | Category open | lesson-planning → compose |
| PASS | Generate | lesson-planning draft length=200 |
| PASS | Review banner | lesson-planning |
| PASS | No auto-send | lesson-planning: dangerousButtons=0 |
| PASS | Revise buttons | lesson-planning: 10/10 |
| PASS | Revise click | lesson-planning: make_shorter |
| PASS | Save draft | lesson-planning |
| PASS | Copy | lesson-planning |
| PASS | Feedback buttons | lesson-planning: 5/5 |
| PASS | Use helpers | lesson-planning: present |
| PASS | Clear | lesson-planning |
| PASS | Back home | lesson-planning |
| PASS | Category open | activities → compose |
| PASS | Generate | activities draft length=291 |
| PASS | Review banner | activities |
| PASS | No auto-send | activities: dangerousButtons=0 |
| PASS | Revise buttons | activities: 10/10 |
| PASS | Revise click | activities: make_shorter |
| PASS | Save draft | activities |
| PASS | Copy | activities |
| PASS | Feedback buttons | activities: 5/5 |
| PASS | Use helpers | activities: present |
| PASS | Clear | activities |
| PASS | Back home | activities |
| PASS | Category open | forms → compose |
| PASS | Generate | forms draft length=273 |
| PASS | Review banner | forms |
| PASS | No auto-send | forms: dangerousButtons=0 |
| PASS | Revise buttons | forms: 10/10 |
| PASS | Revise click | forms: make_shorter |
| PASS | Save draft | forms |
| PASS | Copy | forms |
| PASS | Feedback buttons | forms: 5/5 |
| PASS | Use helpers | forms: present |
| PASS | Clear | forms |
| PASS | Back home | forms |
| PASS | Category open | policies → compose |
| PASS | Policy state | state selector present |
| PASS | Generate | policies draft length=336 |
| PASS | Review banner | policies |
| PASS | No auto-send | policies: dangerousButtons=0 |
| PASS | Revise buttons | policies: 10/10 |
| PASS | Revise click | policies: make_shorter |
| PASS | Save draft | policies |
| PASS | Copy | policies |
| PASS | Feedback buttons | policies: 5/5 |
| PASS | Use helpers | policies: present |
| PASS | Clear | policies |
| PASS | Back home | policies |
| PASS | Category open | enrollment → compose |
| PASS | Generate | enrollment draft length=77 |
| PASS | Review banner | enrollment |
| PASS | No auto-send | enrollment: dangerousButtons=0 |
| PASS | Revise buttons | enrollment: 10/10 |
| PASS | Revise click | enrollment: make_shorter |
| PASS | Save draft | enrollment |
| PASS | Copy | enrollment |
| PASS | Feedback buttons | enrollment: 5/5 |
| PASS | Use helpers | enrollment: present |
| PASS | Clear | enrollment |
| PASS | Back home | enrollment |
| PASS | Category open | staff → compose |
| PASS | Generate | staff draft length=104 |
| PASS | Review banner | staff |
| PASS | No auto-send | staff: dangerousButtons=0 |
| PASS | Revise buttons | staff: 10/10 |
| PASS | Revise click | staff: make_shorter |
| PASS | Save draft | staff |
| PASS | Copy | staff |
| PASS | Feedback buttons | staff: 5/5 |
| PASS | Use helpers | staff: present |
| PASS | Clear | staff |
| PASS | Back home | staff |
| PASS | Category open | admin-writing → compose |
| PASS | Generate | admin-writing draft length=112 |
| PASS | Review banner | admin-writing |
| PASS | No auto-send | admin-writing: dangerousButtons=0 |
| PASS | Revise buttons | admin-writing: 10/10 |
| PASS | Revise click | admin-writing: make_shorter |
| PASS | Save draft | admin-writing |
| PASS | Copy | admin-writing |
| PASS | Feedback buttons | admin-writing: 5/5 |
| PASS | Use helpers | admin-writing: present |
| PASS | Clear | admin-writing |
| PASS | Back home | admin-writing |
| PASS | Category open | development → compose |
| PASS | Source records | development: 1 source checkbox(es) |
| PASS | Generate | development draft length=296 |
| PASS | Review banner | development |
| PASS | No auto-send | development: dangerousButtons=0 |
| PASS | Revise buttons | development: 10/10 |
| PASS | Revise click | development: make_shorter |
| PASS | Save draft | development |
| PASS | Copy | development |
| PASS | Feedback buttons | development: 5/5 |
| PASS | Use helpers | development: present |
| PASS | Clear | development |
| PASS | Back home | development |
| PASS | Category open | ask-program → compose |
| PASS | Source records | ask-program: 1 source checkbox(es) |
| PASS | Generate | ask-program draft length=270 |
| PASS | Review banner | ask-program |
| PASS | No auto-send | ask-program: dangerousButtons=0 |
| PASS | Revise buttons | ask-program: 10/10 |
| PASS | Revise click | ask-program: make_shorter |
| PASS | Save draft | ask-program |
| PASS | Copy | ask-program |
| PASS | Feedback buttons | ask-program: 5/5 |
| PASS | Ask isolation | Ask hides Use in Helpers |
| PASS | Citations | sources used shown |
| PASS | Clear | ask-program |
| PASS | Back home | ask-program |
| PASS | Helpers handoff | navigated to Documentation Helpers |
| PASS | Control inventory | data-ai-guide-category |
| PASS | Control inventory | data-ai-guide-back-home |
| PASS | Control inventory | data-ai-guide-revise |
| PASS | Control inventory | data-ai-guide-save-draft |
| PASS | Control inventory | data-ai-guide-copy |
| PASS | Control inventory | data-ai-guide-use-helpers |
| PASS | Control inventory | data-ai-guide-clear-draft |
| PASS | Control inventory | data-ai-guide-feedback |
| PASS | Control inventory | data-ai-guide-insights |
| PASS | Control inventory | data-ai-guide-open-ask |
| PASS | Control inventory | data-ai-guide-save-template |
| PASS | Control inventory | data-ai-guide-fixture |
| PASS | Control inventory | data-ai-guide-kill |
| PASS | Control inventory | data-ai-guide-template |
| PASS | Nav markup | index.html AI Guide nav |
| PASS | Admin login | status 200 |
| PASS | Admin overview API | status 200 |
| PASS | Logged-out API | config status 401 |

## Gaps / buttons to add or fix

- None.

## Failures

- None.
