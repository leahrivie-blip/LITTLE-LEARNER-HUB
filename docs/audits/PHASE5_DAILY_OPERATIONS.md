# Phase 5 — Daily Operations (begun)

**Status:** 🚧 In progress  
**Started after:** Phase 4 One Source of Truth ✅  
**Branch:** continues on `cursor/phase4-one-source-of-truth-9c23` until a dedicated Phase 5 branch is cut if needed  
**Production:** Read-only  

Policy: `docs/audits/TESTING_IS_THE_FUTURE_POLICY.md`  
Canonical homes: `docs/audits/PHASE4_ONE_SOURCE_OF_TRUTH.md`

---

## Goal

Make day-to-day care workflows reliable on the testing spine — using the **same** Child, Classroom, Schedule, and Daily Log records established in Phase 4.

In scope (testing):
- Attendance
- Meals / snacks
- Naps
- Diapers / toileting
- Activity logs
- Photos tied to child profiles
- Teacher Today / quick-add → durable child blob
- Classroom scoping for teachers/assistants

Out of scope until later phases:
- Family Hub parent UX overhaul (Phase 6)
- Forms library redesign (Phase 7)
- Tuition billing (Phase 8)
- Production deploy

---

## Hard rules from Phase 4

- Child care data writes go to `programData[programId].child` collections only  
- Classroom scope from `schedule.classrooms` + Profile `classroomId`  
- No second Family Hub roster; no parallel meal/nap stores  
- Drift: report first; no auto-delete  

---

## Next steps

1. Audit Teacher Today / Daily Logs write paths against canonical child blob  
2. Fix any remaining dual-write or orphaned local-only records  
3. HD + Center smoke: attendance → meal → nap → photo → Family Hub Today sees it  
4. Phase 5 completion report before Family Hub phase  

## Kickoff notes (2026-08-08)

- Care writes already funnel through `appendChildRecord` → child blob keys (`Attendance`, `Meals`, `Naps`, …) synced via `/api/child-data`  
- Family Hub Today already overlays those arrays from the owner child blob  
- Phase 5 focus: reliability, classroom scoping, end-of-day completeness — not new stores  

---

## Production confirmation

- [x] No production work at Phase 5 start  
