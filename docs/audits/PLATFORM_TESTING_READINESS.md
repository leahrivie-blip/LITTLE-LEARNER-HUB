# Platform Testing Readiness Tracker

**Branch:** `cursor/family-hub-testing-readiness-d3df` (and feature PRs into it)  
**Rule:** Testing only. No production merge/deploy. Family Hub customer flags stay OFF.  
**Teaching Kits / lesson plans:** Owned by another agent — do not audit or modify unless a change here breaks them.  
**Updated:** 2026-08-07

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
| Family Hub provider request inbox + director ACL | Approve/decline with note, director acts as program owner, teacher 403, recent decided, Work/Families attention | This milestone |

---

## In progress / next candidates

| Area | Gap | Priority |
|---|---|---|
| Parent email/push delivery | Magic-link handoff still often manual | High |
| Forms e-sign / packet PDF on child file | Acknowledge ≠ legal e-sign | High |
| Daily ops → Family Hub defaults | Some share paths exist; not default-complete | High |
| Tuition billing for families | Membership billing only | Large / later |
| Notifications (cross-role) | FH + ops alerts partial | Medium |
| Admin Dashboard polish | Exists; needs regression pass | Medium |
| Calendar family-facing defaults | Partial | Medium |
| AI features regression | Exists; needs pass without Teaching Kit deep dive | Medium |
| Mobile / performance / security sweeps | Ongoing | Medium |

---

## Known issues (testing)

| Issue | Severity | Notes |
|---|---|---|
| Phase 3 Case 1 & 5 phone gates | Production blocker | Not confirmed code bugs; automation PASSED |
| Forms shell-version pin tests | Low | Outdated `SHELL_VERSION` regex vs `20260805-testing-stabilization-r32` |
| Homepage-smoke / some UX pins | Low | Occasional flakiness noted in Phase 4 E2E QA |
| Family Hub still testing-fenced | Intentional | Not customer-ready; do not enable in production |

---

## Milestone reports

1. `docs/audits/PHASE4_CLASSROOM_FLOOR_OPS_REPORT.md` — classroom floor ops  
2. `docs/audits/PHASE4_E2E_QA_REVIEW.md` — Phase 4 E2E (NO-GO production)  
3. `docs/audits/PHASE3_PHONE_GATES_BLOCKER_REPORT.md` — phone gates  
4. `docs/audits/FAMILY_HUB_PROVIDER_INBOX_REPORT.md` — this milestone  

---

## How to update this file

After each milestone: move items between Completed / In progress / Known issues; link the milestone report; keep production gates accurate. Do not mark Family Hub or Daily Logs production-ready until phone gates and owner approval are closed.
