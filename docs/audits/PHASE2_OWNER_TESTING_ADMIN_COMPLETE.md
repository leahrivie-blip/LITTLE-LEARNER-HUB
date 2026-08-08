# Phase 2 Complete — Owner Admin Tester Control

**Branch:** `cursor/owner-admin-testers-phase2-9c23`  
**Spine:** HDH / `main` (July branch not merged)  
**Fence:** `HOME_DAYCARE_HUB_TESTING` + admin token  
**Date:** 2026-08-07 (updated for owner-validation polish)  

---

## How to use it (end-to-end owner validation)

1. Open the **testing** host with Admin unlock.  
2. Confirm the orange **TESTING ENVIRONMENT** banner.  
3. Sidebar → **Testers** (or Admin → Dashboard quick actions).  
4. **Dashboard** should show programs / testers / children / families / staff / pending / disabled / health / recent signups & actions.  
5. Quick actions: **Add Tester**, **Create Program**, **View As**, **Feature Flags**, **Feedback**.  
6. Create a **Home Daycare** and a **Center** (Add Tester and/or Create Program).  
7. Add testers for every role; configure feature flags; **View As** each role + specific testers.  
8. Disable / reactivate / archive; resend invites (email when configured + always copy-link); reset access.  
9. Open **program detail** → people, children, Family Hub household preview links.  
10. Review **Audit** + **Feedback** inbox.  
11. As a tester: assign a lesson with the **child picker**; log planned activity to daily logs; confirm staff write scopes.

Automated check: `npm run test:owner-testing-admin-phase2`.

---

## Completed checklist

### Owner Admin → Dashboard / Testers
- [x] Dedicated **Testers** admin group  
- [x] Rich Testing dashboard (totals, health, recent signups, recent admin actions, quick actions)  
- [x] Add Tester wizard (home/center, roles, features, notes, cohort, activate-now, send-email option)  
- [x] Create Program (shell Home Daycare / Center)  
- [x] Role assignment (owner / director / teacher / assistant)  
- [x] Activate now + temp password  
- [x] Search + status filter + tester detail  
- [x] Feature access per tester + global testing flags  
- [x] Disable / reactivate / archive (soft)  
- [x] Resend invite (email attempt + copy-link fallback)  
- [x] Reset access / reset demo care data  
- [x] View As role + View as tester + sticky banner  

### Programs / Feedback / Family Hub preview
- [x] Programs list + **program detail** (people, children, classrooms, households, features, activity)  
- [x] Household-specific Family Hub preview (copy / open magic link when present)  
- [x] Testing **Feedback inbox** (list + status updates; testingSite tagging on submit)  

### Connections
- [x] Calendar / planner **child picker** on assign  
- [x] Lesson week assign links **childIds**  
- [x] Planned activity → ActivityLogs  
- [x] Server staff write ACL (assistant/teacher scoped)  

### Safety
- [x] TESTING ENVIRONMENT banner  
- [x] APIs 404 when fence off; admin token required  
- [x] No July merge; no production publish in this work  

---

## Roadmap (confirmed order)

1. Safety + HDH/`main` ✅  
2. Owner Admin ✅ (stabilize during your live validation; fix usability bugs before Phase 3)  
3. Navigation cleanup  
4. One source of truth (children/staff/families)  
5. Daily operations → Family Hub → Forms → Billing (testing) → AI review-before-save  
6. **Live → Testing Feature Sync** (see `docs/audits/LIVE_TO_TESTING_FEATURE_SYNC_PHASE.md`)  
7. Final QA / production readiness  

---

## Still open / during your validation

| Item | Notes |
|---|---|
| Usability bugs you find in Owner Admin | Fix before Navigation Cleanup |
| Hard delete tester | Intentionally omitted (archive only) |
| Email when Resend is not configured | Copy-link remains; dashboard shows invite-email health |
| Rich multi-staff center pack wizard | Director create works; bulk pack later |
| Production Blueprint dual-service | Still Dashboard-managed testing host |

---

## Key files

- `server/owner-testing-admin.js` — APIs (dashboard, testers, programs, flags, feedback, audit)  
- `scripts/owner-testing-admin-ui.js` — Admin UI  
- `styles/owner-testing-admin.css` — TESTING chrome  
- `server/program-ownership.js` — write ACL  
- `app.js` — calendar child picker + feedback testingSite tag  
- `docs/audits/LIVE_TO_TESTING_FEATURE_SYNC_PHASE.md` — new phase brief  
- `scripts/test-owner-testing-admin-phase2.js` — regression  
