# Phase 2 — Daily Logs & attendance

**Target:** Testing site only (`HOME_DAYCARE_HUB_TESTING`)  
**Branch:** `cursor/phase2-daily-logs-attendance-9026` (based on corrected Phase 1)  
**Rule:** Do not merge. Do not deploy production or testing from this agent turn.

## Fixes implemented

1. Classroom filter on Daily Logs dashboard  
2. Present-group logging + Group Log Present/All/Clear  
3. Group actions: bottle, nap, diaper/potty, mood, note + meal amounts  
4. Duplicate attendance tap guards + quick-action lock  
5. Undo stack for recent appends / attendance updates  
6. Save status bar (saving / saved / failed / offline)  
7. Timeline recorder + Shared/Internal labels  
8. Mobile touch targets + overflow clipping  
9. **Critical follow-up:** report/message drafts stay internal until preview → Share confirm  
10. **Critical follow-up:** `upsertDailyLogAttendance()` for form paths (one row per child/day)  
11. **Critical follow-up:** `dlcGuardFormSubmit()` on group + attendance/meal forms  

## Tests

```bash
npm run test:daily-logs-attendance
npm run check
```

## GO / NO-GO for Phase 3

**GO** for Phase 3 (Child Profiles) after review — disposable data only; no merge/deploy.

**NO-GO** for 20 external testers until Phases 1–2 are on the testing site.
