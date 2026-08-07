# Platform Testing Readiness Tracker

**Branch:** `cursor/family-hub-testing-readiness-d3df` (and feature PRs into it)  
**Rule:** Testing only. No production merge/deploy. Family Hub customer flags stay OFF.  
**Teaching Kits / lesson plans:** Owned by another agent — do not audit or modify unless a change here breaks them.  
**Updated:** 2026-08-07  
**Priority order (owner-approved):** 1 Tuition → 2 Daily ops→FH → 3 Forms spine → 4 Parent delivery. Stop after each milestone for approval.

---

## Production gate (global)

| Item | Status |
|---|---|
| Production `main` at `ccd01fe` | Do not touch |
| Family Hub customer enablement | OFF (`HOME_DAYCARE_HUB_TESTING` fence) |
| Phase 3 phone Case 1 (conflict UI on real phone) | MANUAL REQUIRED |
| Phase 3 phone Case 5 (assistant load on real phone) | MANUAL REQUIRED |
| Final full-system regression (incl. Teaching Kits) | Deferred until major features complete |

---

## Completed on testing (production-quality for testing fence)

| Area | What’s done | Evidence |
|---|---|---|
| Tester onboarding / role nav | Work-mode nav, role landings | Phase 1 report |
| Daily Logs / attendance | Mutations, conflict UI, durable queue | Phase 2–3 reports |
| Teacher/Assistant Settings + billing hardening | Settings ACL, billing owner-only | PR #552 |
| Classroom hardening (Phase 3) | 6 scenarios automated; 2 phone gates open | Phase 3 reports |
| Classroom floor ops (Phase 4) | Unassigned empty state, assign-classroom, room-mode care actions | PR #557 / `8016094` |
| Family Hub provider request inbox + director ACL | Approve/decline with note, director ACL, recent decided | PR #560 merged to testing `f676438` |
| **Family Tuition Billing v1** | Invoices, sibling discount, late fees, balances, mark paid, parent pay (Checkout/sim), AI reminder, provider dashboard | `FAMILY_TUITION_BILLING_V1_REPORT.md` (awaiting testing merge approval) |

---

## Next (awaiting approval after Tuition merge)

| Area | Gap | Priority |
|---|---|---|
| Daily ops → Family Hub (one-tap daily report + share defaults) | Not complete | **2 — next after approval** |
| Forms spine (due dates, e-sign, PDF, needs attention) | Incomplete | 3 |
| Parent delivery reliability | Incomplete | 4 |
| Activity/Lesson → Daily Log, enrollment, ratios, staff ACL, room mode polish | Horizon B | After Horizon A |

---

## Known issues (testing)

| Issue | Severity | Notes |
|---|---|---|
| Phase 3 Case 1 & 5 phone gates | Production blocker | Not confirmed code bugs; automation PASSED |
| Forms/FH shell-version + lazy-load harness | Fixed (this PR) | Shell pins + `LLHLazyLoader.ensure("forms")` before FormsCenter assertions |
| Homepage-smoke / some UX pins | Low | Occasional flakiness noted in Phase 4 E2E QA |
| Family Hub still testing-fenced | Intentional | Not customer-ready; do not enable in production |

---

## Milestone reports

1. `docs/audits/PHASE4_CLASSROOM_FLOOR_OPS_REPORT.md` — classroom floor ops  
2. `docs/audits/PHASE4_E2E_QA_REVIEW.md` — Phase 4 E2E (NO-GO production)  
3. `docs/audits/PHASE3_PHONE_GATES_BLOCKER_REPORT.md` — phone gates  
4. `docs/audits/FAMILY_HUB_PROVIDER_INBOX_REPORT.md` — FH inbox  
5. `docs/audits/FAMILY_TUITION_BILLING_V1_REPORT.md` — Family Tuition Billing v1  

---

## How to update this file

After each milestone: move items between Completed / In progress / Known issues; link the milestone report; keep production gates accurate. Do not mark Family Hub or Daily Logs production-ready until phone gates and owner approval are closed.
