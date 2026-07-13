# Curriculum Calendar Roadmap

**Status:** Calendar project **complete through F3** (verified and on `main`).  
**Last updated:** July 13, 2026  
**Do not start F4 until explicitly approved.**

> **Superseding architecture (July 13, 2026):** See  
> [`UNIFIED_SCHEDULING_SYSTEM_ARCHITECTURE.md`](./UNIFIED_SCHEDULING_SYSTEM_ARCHITECTURE.md)  
> for the audit + phased plan that unifies Main Calendar, Weekly Planner, Dashboard, and Lesson Library around one scheduling source of truth.  
> **Do not implement that plan until owner approval.** Do **not** delete Curriculum Planner yet.

This document parks the F1–F3 calendar plan for context so future work can resume without re-deriving history.

---

## What is complete now (F1–F3)

Shipped on `main` (F1 #147, F2 #148, F3 merge `490b4df`):

| Phase | Delivered |
|-------|-----------|
| **F1** | Curriculum Planner: assign lesson plan to week with snapshot; library “Assign to Week”; viewer “Use This Lesson Plan”; dashboard “This Week’s Curriculum”; Free/Pro gate; mobile accordion |
| **F2** | Private teacher notes (weekly + prep + daily); group observations (optional activity/child); privacy boundary; teacher text print foundation |
| **F3** | Teacher-authored Parent Calendar: parent message, classroom events, parent preview, parent text print; events preserved on reassignment |

**Storage today:** account-scoped browser `localStorage` key `llhCurriculumAssignments:{email}`.

**Tests:**

```bash
npm run test:curriculum-planner
npm run test:curriculum-planner-notes
npm run test:curriculum-planner-calendar
npm run test:curriculum-planner-e2e
```

**Known non-bugs / limitations of F3:** planner data is device-local; parent features are teacher preview/print only (no family delivery yet).

---

## Intentionally deferred (future phases)

These are **not** unfinished F3 bugs. Revisit when ready:

1. **Backend Curriculum Planner cloud migration** — move weeks/notes/observations/`parentCalendar` to authenticated server storage (plan approved; implement **before Family Hub**).
2. **Family Hub foundation** — parent-facing shell; Family Hub nav is still “Soon”.
3. **F4 Parent Sharing / Export** — share links, durable family delivery, PDF/export productization.
4. **Styled planner week / parent print** — match lesson-viewer print quality (planner prints are text foundations today).
5. **Director / multi-classroom shared calendars** — `organizationId` / `classroomId` are stubs (`null`).
6. **Parent calendar without an assigned lesson plan** — today requires a week assignment first.
7. **Snapshot drift UI** — `lessonPlanUpdatedAt` stored but no “library updated since assign” signal.
8. **Planner observations → Observation Hub** — not connected.
9. **Weekly Planner vs Curriculum Planner clarity** — two different tools still coexist in nav.

---

## Recommended order when calendar work resumes

**Prefer the unified plan** in `UNIFIED_SCHEDULING_SYSTEM_ARCHITECTURE.md` (ScheduleItem source of truth, Main Calendar = planning, Weekly Planner = execution).

Legacy F-series order (do **not** jump to F4 on localStorage alone) if staying on the old track:

1. **Cloud / backend Curriculum Planner migration** (B1–B4 from the approved migration plan) — or, preferably, migrate into the unified Schedule store instead
2. **Family Hub foundation** (parent-safe APIs only)
3. **F4 Parent sharing / export**
4. Styled print / PDF polish (can pair with F4)
5. Activity ↔ planner click-through polish (optional; can also run on content track)
6. Director / Classroom shared weeks

### Cloud migration reminder (approved direction)

- Keep teacher-private fields separate from parent payloads (server-side parent DTO).
- Owner scoped by verified auth (Firebase uid preferred; email alias for localStorage migrate).
- Endpoints: list/get/put/patch/delete week + one-time `migrate` from localStorage.
- Feature flag + local backup for rollback.
- Full write-up was produced in-session as **Backend Curriculum Planner Migration Plan** (B1 server → B2 flagged client → B3 migrate → B4 default-on). Re-read that plan before coding.

---

## What is NOT calendar work

Do not confuse with unfinished calendar:

- Lesson Plan → Activity Library integration / sync
- Activity save/publish reliability
- Admin importer / editor / publish
- Curriculum resources
- Public lesson viewer (Phase D) content issues

Those are the **content/admin track**. Current product focus may continue there while calendar stays parked.

---

## Resume checklist

When picking calendar back up:

- [ ] Confirm F1–F3 tests still green on `main`
- [ ] Re-read this file + Backend Curriculum Planner Migration Plan
- [ ] Explicitly approve **cloud migration** or **F4** (do not start both by accident)
- [ ] Do not build parent share links until cloud storage is in place (or accept device-only risk)

---

## One-line memory

> **Calendar F1–F3 done. Next investment = unified scheduling architecture (see UNIFIED_SCHEDULING_SYSTEM_ARCHITECTURE.md) after approval — cloud ScheduleItem store, then Family Hub / F4. Do not delete Curriculum Planner yet.**
