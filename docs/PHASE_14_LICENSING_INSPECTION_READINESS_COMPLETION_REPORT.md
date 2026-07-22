# Phase 14 — Licensing and Inspection Readiness

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete for backend/permissions; **Family Hub licensing UI + responsive + screenshots remediated 2026-07-22** (see `docs/PHASE_12_14_REMEDIATION_COMPLETION_REPORT.md`)  
**Date:** 2026-07-22  
**Started from tip:** `c39beae`

## What changed

Added a Director Center **Licensing Center** with configurable readiness checklists that reference Phase 13 authoritative records, corrective-action tracking, time-limited inspector packets, and Family Hub licensing-tasks API + **real Family Hub Home/Account navigation**. Fake data only. **Does not claim legal compliance** or invent state regulations. No email/SMS/push/Stripe/live AI/production storage.

## Files

| Path | Role |
|------|------|
| `scripts/licensing-center-data-model.js` | Setup, pack, requirements, corrective, inspection packets |
| `scripts/licensing-center-fixtures.js` | Fake readiness scenarios (child IDs attached for family-visible tasks) |
| `server/licensing-center-api.js` | `/api/director-center/licensing/*` |
| `server/family-hub-api.js` | `GET /api/family-hub/licensing/tasks` + home `licensingTasks` |
| `licensing-center-ui.js` | Director Licensing tab + `data-feature-marker="phase14-licensing"` |
| `family-hub-ui.js` | Home card **Licensing Documents Needed** + licensing tab UI |
| `styles.css` | Real `.lc-*` responsive rules |
| `scripts/test-licensing-center-phase14.js` | Focused suite |
| `scripts/capture-licensing-center-phase14-screens.js` | Desktop dashboard + **real** phone licensing-task screen |

## Behavior

- Program setup (center/home), generic testing pack with disclaimer
- Dashboard counts + actionable filter cards (“Ready based on configured checklist — not a universal compliance label”)
- Checklist customize (add, N/A, assign, connect record, archive/restore)
- Recurring complete creates next occurrence (history preserved)
- Corrective actions with history preservation
- Inspection prepare / revoke; inspector token read-only, org-scoped, time-limited
- Permissions: curriculum denied; assistant denied default; teacher assigned-classroom tasks only; personnel director-only
- Family Hub licensing tasks: missing/expiring family-visible items; Home card when authorized; Computer Recommended in **application UI**
- Pickup-only / restricted guardians: **403** on licensing tasks

## Responsive (remediated)

- Full Licensing Center / state config / inspection packets / reports remain **computer-first**
- Phone: missing/expiring summaries + assigned family tasks + Computer Recommended (app-rendered)
- Tablet verified in remediation tests (no tablet screenshot required)

## Tests

```bash
npm run test:licensing-center-phase14
npm run test:phase12-14-remediation
```

**19 PASS** focused. Remediation **24 PASS**.

## Deferred

- Verified state/territory licensing packs  
- Real inspector public portal  
- External reminder delivery  
- Legal compliance certification (never claimed)  
- Phase 15 (not started — owner review first)  

## Screenshots

Valid (re-captured; not marketing homepage):

<img alt="Licensing dashboard desktop" src="/opt/cursor/artifacts/licensing-center-phase14/1-licensing-dashboard-desktop.png" />
<img alt="Family licensing tasks phone" src="/opt/cursor/artifacts/licensing-center-phase14/2-family-licensing-tasks-phone.png" />

Disclaimer: Licensing requirements vary. Verify with your state/agency. No compliance guarantee.

Latest tip: `git rev-parse origin/cursor/director-family-foundation-bc66`  
Phase 15 not started. main untouched. Production Family Hub locked.
