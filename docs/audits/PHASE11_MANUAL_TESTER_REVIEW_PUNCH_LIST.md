# Phase 11 — Manual Tester Review Punch List

**Owner reviewer:** Leah  
**Environment:** Testing only — `https://little-learner-hub-testing.onrender.com`  
**Shell (keep stable unless a bug fix requires a testing-only redeploy):** `20260808-phase11-final-qa`  
**Policy:** Fix reported bugs on **testing only**. Rerun affected regression tests. No production deploy. No unrelated architecture/feature work unless required to fix a reported bug.  

**Automated / testing gate:** 100% PASS  
**Production approval:** **BLOCKED** — pending Leah’s manual tester review + **explicit written** production deploy approval  

---

## Review coverage checklist (manual)

| Area | Reviewer status | Notes |
|---|---|---|
| Owner Admin | ⏳ In review | |
| Home Daycare setup | ⏳ In review | |
| Center setup | ⏳ In review | |
| Director experience | ⏳ In review | |
| Teacher experience | ⏳ In review | |
| Assistant permissions | ⏳ In review | |
| Family/Guardian experience | ⏳ In review | |
| Child Profiles | ⏳ In review | |
| Daily Logs | ⏳ In review | |
| Family Hub | ⏳ In review | |
| Messaging | ⏳ In review | |
| Forms | ⏳ In review | |
| Tuition Billing | ⏳ In review | Simulated only — no real charges |
| Calendar / Weekly Planner | ⏳ In review | |
| Lesson Plans | ⏳ In review | |
| Complete Teaching Kits | ⏳ In review | |
| Teaching Kit printing / downloads | ⏳ In review | Inspect actual pages, not download-only |
| AI review-before-save | ⏳ In review | Propose only — never silent save/send/charge |
| Mobile experience | ⏳ In review | |

---

## Punch list

| ID | Issue | Area | Severity | Reproduction steps | Fix | Test added/rerun | Status |
|---|---|---|---|---|---|---|---|
| — | *(none yet — awaiting Leah’s Final QA feedback)* | — | — | — | — | — | — |

**Severity guide:** `blocker` · `high` · `medium` · `low` · `nit`  
**Status guide:** `open` · `in progress` · `fixed on testing` · `verified` · `deferred` · `wontfix`

---

## How new issues are handled

1. Leah reports Final QA feedback (issue + area + steps).  
2. Agent adds a punch-list row (`open`).  
3. Fix on **testing branch only**; avoid unrelated refactors.  
4. Rerun affected `npm run test:*` suites; note results in the row.  
5. Testing-only redeploy **only if required** for the fix (preserve DB / tester data).  
6. Mark `fixed on testing` → Leah verifies → `verified`.  
7. **Never** treat punch-list clearance alone as production approval.

---

## Production lock

| Check | Status |
|---|---|
| Production deploy | **FORBIDDEN** until Leah explicitly writes approval |
| Production env / flags / DB | **Read-only** |
| Automated gate 100% | Does **not** equal production-approved |
| Current production shell (must stay) | `20260808-cookie-cta` |

---

## Log

| Date | Note |
|---|---|
| 2026-08-08 | Punch list opened. Testing redeploy confirmed stable. Awaiting manual review findings. |
