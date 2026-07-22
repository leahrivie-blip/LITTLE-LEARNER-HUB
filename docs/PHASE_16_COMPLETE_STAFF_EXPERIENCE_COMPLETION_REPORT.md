# Phase 16 — Complete Staff Experience

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only)  
**Date:** 2026-07-22  
**Started from tip:** `c43f3457a7b859a8e4daa3f2279036790596b67b`

## What changed

Added a Director Center **Staff Hub** covering staff directory/profiles, onboarding checklists, scheduling, time clock, availability/time-off, training/certifications, coverage↔Phase 15 ratio connection, staff self-service, private director notes, offboarding, and reports foundation. Fake data only. No payroll, banking, Stripe, email/SMS/push, live AI, or production storage.

## Files

| Path | Role |
|------|------|
| `scripts/staff-experience-data-model.js` | Profiles, onboarding, schedules, time clock (append-only), time-off, training, private notes, offboarding |
| `scripts/staff-experience-fixtures.js` | Resettable scenarios (`@example.invalid`) |
| `server/staff-experience-api.js` | `/api/director-center/staff-experience/*` |
| `staff-experience-ui.js` | Staff Hub UI + markers `phase16-staff-experience` / `phase16-staff-self-service` / `phase16-schedule-manager` |
| `director-center-ui.js` | `staff_experience` tab |
| `styles.css` | `.sx-*` responsive rules |
| `scripts/test-staff-experience-phase16.js` | Focused suite |
| `scripts/capture-staff-experience-phase16-screens.js` | ≤2 screenshots |

## Staff Profiles and onboarding

Directory statuses: active, invited, onboarding, on leave, substitute, inactive, ended, archived. Filters + plan staff-limit enforcement. Profiles include overview, contact/emergency (restricted), role, classrooms, schedule, time, training, permissions summary, timeline hooks. Onboarding checklist reuses Forms/Records concepts; invitations stored, never sent externally.

## Scheduling and time clock

Computer-first schedule manager (draft / published-in-testing / history). Coverage suggestions require director action — never auto-move staff. Time clock: in/out, breaks, location change, missed punch, correction requests with required director reason, append-only history. Clock status syncs into Phase 15 `staffDuty` for ratio/coverage. No payroll calculation.

## Training / compliance

Starter categories (CPR, first aid, safe sleep, etc.), expiration statuses, links to Records/Licensing keys. Ratio/coverage disclaimer remains provider-configured — not universal compliance.

## Permissions and offboarding

Plain-language “What this person can access” summaries. Private coaching/performance notes are director/owner only and excluded from directory/Family Hub/classroom views. Offboarding revokes access, preserves messages/forms/time/history, never deletes child/classroom records, removes from ratio after clock-out/access end.

## Tests

```bash
npm run test:staff-experience-phase16
```

**23 PASS** focused. Full Phase 1–16 regression: **PASS**.

## Screenshots (max 2)

<img alt="Staff self-service phone" src="/opt/cursor/artifacts/staff-experience-phase16/1-staff-self-service-phone.png" />
<img alt="Staff directory desktop" src="/opt/cursor/artifacts/staff-experience-phase16/2-staff-directory-desktop.png" />

## Deferred

- Payroll / tax / banking  
- External schedule or time-clock notifications  
- Live Stripe seat billing  
- Phase 17 (not started in this commit)

## Safety

Production expansion locked. `main` untouched. Fake staff only.

Latest tip: `0bb93dcbfea038b48b1760829f58029f2f04967d` (pushed to `origin/cursor/director-family-foundation-bc66`). Working tree clean. Production and `main` untouched. Phase 17 not started.
