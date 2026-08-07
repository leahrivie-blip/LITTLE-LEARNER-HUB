# Milestone report: Family Hub provider request inbox + director ACL

**Scope:** Testing branch only  
**Feature fence:** `HOME_DAYCARE_HUB_TESTING`  
**Date:** 2026-08-07  
**Production merge/deploy:** NO — not requested  

---

## Verdict (this feature set only)

**Testing GO** for provider request inbox + owner/director management ACL.  
**Production NO-GO** — Family Hub remains testing-fenced; Phase 3 phone gates still open; no owner production approval.

---

## What shipped

1. **Program-owner ACL for Family Hub management**
   - Owners (and unlinked directors) manage their own households.
   - Linked **Directors** manage the **owner’s** households (`linkedProgramOwnerEmail`).
   - Linked **Teachers/Assistants** receive **403** on invite, inbox, approve/decline, unlink, revoke, seed-demo, provider messages, and provider notifications.

2. **Provider inbox completeness**
   - Pending requests with approve/decline.
   - Optional provider note stored on the request and appended to the parent notification.
   - `recentDecided` history (last 20) with reviewer email and note.
   - `pendingRequestCount` on inbox + households list APIs.

3. **UI**
   - Inbox note field + recently decided list.
   - Families hub tiles show pending count badge when known.
   - Owner/Director Work “Needs attention” card when pending FH requests exist (testing fence).

4. **Tests**
   - `npm run test:family-hub-provider-inbox`

---

## Acceptance coverage

| Case | Expected | Covered by |
|---|---|---|
| Teacher opens provider inbox | 403 | `test:family-hub-provider-inbox` |
| Teacher approves request | 403 | same |
| Director lists owner households / inbox | 200 under owner email | same |
| Director approves with note | Parent notified; `reviewedBy` = director | same |
| Owner declines with note | Parent notified | same |
| Recent decided history | Appears after decision | same |

---

## Regression (run with this PR)

| Suite | Result |
|---|---|
| `npm run check` | PASS |
| `npm run test:family-hub-provider-inbox` | PASS |
| `npm run test:family-hub-testing-readiness` | PASS |
| `npm run test:pass3-permission-matrix` | 176/176 PASS |
| `npm run test:role-settings-auth-matrix` | PASS |
| `npm run test:phase3-daily-logs-classroom` | 10/10 PASS |
| `npm run test:phase4-classroom-floor-ops` | 10/10 PASS |
| `npm run test:forms-center` | PASS (lazy-load harness fix) |
| `npm run test:forms-ecosystem` | PASS (lazy-load harness fix) |

Teaching Kit suites intentionally not re-audited (owned elsewhere).

---

## Explicitly not done (out of this milestone)

- Parent email/SMS/push delivery productization  
- Legal e-sign packets  
- Enabling Family Hub outside the testing fence  
- Closing Phase 3 phone Case 1 / Case 5  
- Tuition billing for families  

---

## Follow-ups

1. Wire pending-count refresh into Work home without requiring a prior Families/HDH visit (light background fetch for owner/director).  
2. Optional: surface pending requests on Messages hub.  
3. Keep `PLATFORM_TESTING_READINESS.md` updated as the next non–Teaching-Kit area is completed.
