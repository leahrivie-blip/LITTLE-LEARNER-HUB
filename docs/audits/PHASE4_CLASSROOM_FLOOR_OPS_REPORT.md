# Phase 4 — Classroom floor ops (testing only)

**Branch:** `cursor/phase4-classroom-floor-ops-9026`  
**Target:** `cursor/family-hub-testing-readiness-d3df` (testing site only)  
**Rule:** Do not merge to `main`. Do not deploy or change production.

## Scope

1. Unassigned-staff Daily Logs empty-state guidance  
2. Owner/Director Staff UI + API to assign/reassign classroom after invite  
3. Room-mode one-tap Meal / Diaper / Nap / Note on checked-in roster cards (mutation queue intact)  
4. Full permission + Phase 1–3 regression after changes  

No Family Hub customer-flag enablement. No production merge/deploy.

## What was added

| Area | Change |
|---|---|
| Daily Logs empty state | `data-dlc-empty-reason="unassigned-staff"` with “Ask your owner to assign your classroom” copy; distinct from no-assigned-children / owner-empty |
| Staff assign API | `POST /api/staff/members/assign-classroom` — Owner/Director only; updates `programMembers` + `store.users.classroomIds` |
| Membership sync | `membershipSummaryForUser` + client subscription sync include `classroomIds` / `classroomName` so Teachers pick up assignments on refresh |
| Staff UI | Per-member classroom `<select data-staff-assign-classroom>` on Staff management; `roleDisplayLabel` for role text |
| Room mode | Checked-in cards show Meal / Diaper / Nap / Note; `saveDailyLogQuickAction` + click handler stay on roster and use `appendChildRecord` → mutation queue |
| Styles | `.dlc-room-mode-actions`, `.staff-assign-classroom-*` |
| Tests | `npm run test:phase4-classroom-floor-ops` |

## Phase 3 holds (unchanged)

Physical-phone items remain **MANUAL REQUIRED** in `PHASE3_MANUAL_REVIEW_WORKSHEET.md`:

1. Case 1 — physical phone conflict panel taps/readability  
2. Case 5 — physical phone Assistant care under real supervision load  

Phase 3 is **not** production-approved. Phase 4 does not remove or weaken those holds.

## Production status

| Env | Expectation |
|---|---|
| Production (`main` @ `ccd01fe`) | **Untouched** — no merge, deploy, env write, or cherry-pick |
| Family Hub customer flags | **OFF** |
| Testing site | Update only after this PR merges into the testing branch |

## Automated results

| Suite | Result |
|---|---|
| `npm run check` | **PASS** |
| `npm run test:phase4-classroom-floor-ops` | **10/10 PASS** |
| `npm run test:pass3-permission-matrix` | **176/176 PASS** |
| `npm run test:role-settings-auth-matrix` | **PASS** |
| `npm run test:daily-logs-attendance` | **15/15 PASS** |
| `npm run test:child-data-mutations` | **PASS** |
| `npm run test:child-data-durable-queue` | **PASS** |
| `npm run test:phase3-daily-logs-classroom` | **10/10 PASS** |
| `npm run test:nav-role-experience` | **PASS** |

**Regressions:** none in Daily Logs, permissions, offline queue, or staff access.  
Artifacts: `/opt/cursor/artifacts/phase4-classroom-floor-ops/`

## What still needs manual review

1. **Phase 3 Case 1 + Case 5** physical phone checks — still **MANUAL REQUIRED** (blocking for Phase 3 / production approval)  
2. Owner assigns classroom in Staff UI on live testing; Teacher refreshes and sees room children  
3. Room-mode taps on a real phone during floor ops (optional usability)

## GO / NO-GO

| Decision | Verdict |
|---|---|
| Merge Phase 4 into **testing** branch | **GO** |
| Production / `main` (`ccd01fe`) | **NO-GO** — wait for explicit approval |
| Phase 3 production approval | **NO-GO** — physical-phone Cases 1 & 5 still open |
| Next phase after Phase 4 | **GO for planning on testing only** after this merges to testing; **NO-GO for production** |
