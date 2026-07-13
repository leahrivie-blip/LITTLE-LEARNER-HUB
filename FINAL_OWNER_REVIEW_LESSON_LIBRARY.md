# Final Owner Review — Lesson Plan Library
**Handoff for tomorrow · Do not merge yet**

## Current state (saved)

| Item | Value |
|------|--------|
| Branch | `cursor/lesson-library-phase2-693d` |
| Latest commit | `47c1695` — Complete lesson library phase 2 |
| Draft PR | https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/161 |
| Base | Includes Batches 1–8 + Phase 2 on top of prior draft work |
| Merge status | **Not merged. Do not merge until this review passes.** |
| Superseded drafts | Prefer #161 over #156–#160 |

### What Phase 2 already delivered
- Compact library + hidden global “What do you need today?” on lessons
- Lesson workspace tabs + Use This Plan sheet
- Browser history for Library → Lesson → Activity
- Renamed calendar action: **Add to This Week’s Plan**
- Weekly schedule print/PDF (schedule layout; up to 2 pages)
- Global search compact cards for Lesson Plan hits
- Automated tests: `test:lesson-library-phase2` + prior lesson-library scripts

### Artifacts already captured
- `/opt/cursor/artifacts/lesson-library-ux/`
- `/opt/cursor/artifacts/lesson-library-phase2-plan/`
- `/opt/cursor/artifacts/lesson-library-phase2-complete/`
- Plan docs: `LESSON_LIBRARY_UX_IMPLEMENTATION_MAP.md`, `LESSON_LIBRARY_PHASE2_COMPLETION_PLAN.md`

### Production readiness (end of Phase 2)
**~84/100** — staging/review ready, not auto-merge ready.

---

## Tomorrow’s work: Final Owner Review

Goal: one final **UX simplification + real curriculum proof** pass.  
Not a redesign. Not a new calendar. Not unrelated features.

### 1. Lesson Library still feels too busy
Review the full flow and remove/consolidate anything not essential.

Current clutter to challenge:
- Search
- Age filters
- Filters
- Saved
- Use This Plan / Save / More
- Tabs
- Print buttons

**Goal:** daycare provider can find and use a lesson in seconds.  
**North star:** “Find lesson → Use lesson” — not “figure out which of 15 buttons to press.”

### 2. Saved needs redesign
Saved must not remain a small filter chip.  
Make **Saved Lesson Plans** its own destination/page so teachers instantly find saved plans.

### 3. Use This Plan — remove duplicates
Current sheet:
- Assign to a Week
- Add to This Week’s Plan
- Print Full Lesson Plan
- Download Full Lesson Plan PDF
- View in Curriculum Planner

Review for near-duplicates. Keep the **minimum** actions. Combine if two do nearly the same thing (especially Assign vs Add to This Week’s Plan).

### 4. Weekly Schedule PDF — classroom-ready, not demo
Verify with real teacher conditions:
- iPhone Safari print
- Android print
- Desktop print
- PDF download
- Fits normal printer paper
- Looks good with **15–20+ activities**, long names, large materials lists
- No cut-off text, overlaps, missing activities, bad page breaks
- Feels binder/clipboard/wall-ready

### 5. Lesson Viewer back/navigation safety
Every screen:
- Visible Back
- Device Back works
- No dead ends
- No modal traps

### 6. Mobile QA
Devices/browsers:
- iPhone Safari
- Chrome Mobile
- Small phones
- Large phones

Check scrolling, overflow, clipped buttons, hidden text, modal behavior, PDF actions.

### 7. Real curriculum testing (mandatory)
**Do not use placeholder/demo plans for proof.**

Test actual Little Learner Hub published plans:
- Infant
- Toddler
- Preschool

Especially:
- multiple activities per day
- long activity names
- large materials lists
- long weekly objectives
- premium plans where relevant

### 8. Final UX simplification pass
Reduce clicks and button clutter across library + viewer.  
If a control isn’t needed for the core path, hide it, move it, or merge it.

### 9. Monday–Friday printable must be production ready
Before merge approval, provide screenshots generated from **actual** LLH curriculum (not import-sample placeholders), proving:
- Real Infant / Toddler / Preschool plans
- Large lesson plans (15–20+ activities)
- Teacher-friendly layout (title, theme, age, Mon–Fri, activities by day)
- Print + PDF quality on mobile and desktop

---

## Suggested start order tomorrow

1. Pull/checkout `cursor/lesson-library-phase2-693d`
2. Audit current button inventory (library + viewer + Use This Plan) with screenshots
3. Propose consolidation (Saved page, Use This Plan merge, hide secondary print/filters)
4. Implement small UX simplification commits
5. Run real curriculum print/PDF proof with published Infant/Toddler/Preschool plans
6. Mobile QA + screenshots
7. Update #161 with findings; **still do not merge** until owner approval

## Explicitly out of scope tomorrow
- Building a true month calendar
- Restarting the project on a new branch family
- Unrelated homepage/admin redesign
- Merging without owner sign-off

## Acceptance for merge (tomorrow+)
Owner can approve merge only when:
- Core path feels “Find → Use” with minimal clutter
- Saved is a clear destination
- Use This Plan has no duplicate actions
- Weekly schedule print/PDF proven with real, large curriculum
- Back/device-back safe on mobile
- Screenshots from actual LLH Infant/Toddler/Preschool plans attached
