# Overnight decisions and blockers

**Branch:** `cursor/director-family-foundation-bc66`  
**Updated:** 2026-07-22 (Phase 12–14 remediation)

## Decisions

### Family Hub nav — Enrollment entry (Phase 12)

**Decision:** Enrollment is accessed from **Home** (button + `tab=enrollment` / deep links such as `#family-hub?tab=enrollment`), not by replacing a bottom-nav item.

**Why:** Family Hub bottom nav stays at **max five** items and must keep **Messages** (Phase 11). Adding Enrollment as a sixth tab would break that constraint; swapping Messages out would regress messaging UX.

**Provider side:** Director Center uses a dedicated **Enrollment** tab (`data-dc-tab="enrollment"`).

### Family Hub nav — Licensing Documents Needed (Phase 14 remediation)

**Decision:** Licensing document tasks are accessed from **Home** (card shown only when the guardian has authorized tasks) and optionally **Account → More**, not a sixth bottom-nav item.

**Why:** Same max-five constraint. Complex licensing tools remain Computer Recommended on phone.

### Capture scripts must assert feature markers

**Decision:** Phase 12–14 screenshot scripts fail loudly unless a unique `data-feature-marker` is visible, and refuse the marketing homepage. Views must use `.active-view` to become visible.

## Permissions notes (no `docs/PERMISSIONS*` file)

Enrollment permissions live in API gates (`server/enrollment-api.js`, Family Hub enrollment handlers + Phase 8 access rules):

| Actor | Enrollment access |
|-------|-------------------|
| Director / owner | Full pipeline + conversion |
| Assistant | Denied by default |
| Teacher | Denied unless limited grant; offer/priority needs offer grant |
| Curriculum Only | Denied |
| Guardian (digital/full) | Own cases / checklist / testing offer respond only |
| Pickup-only / emergency-only | Denied digital enrollment |
| Other orgs | Never listed / 404-style denial |

Family views never expose internal notes, waitlist priority rules, other applicants, capacity guidance, or confidential decline reasons.

Licensing family tasks: digital guardians only; pickup-only / restricted → 403; wrong-child / cross-org remain denied.

## Safety / still OFF

- No Stripe enrollment checkout  
- No public production inquiries  
- No outbound email/SMS/push for enrollment  
- Production Family Hub locked  

## Blockers / audit remediation

**Owner audit found Phase 12–14 incomplete for:** responsive verification, Family Hub licensing wiring, and valid screenshots (homepage duplicates).

**Remediation completed 2026-07-22** — see `docs/PHASE_12_14_REMEDIATION_COMPLETION_REPORT.md`.

**Do not begin Phase 15** until the owner reviews the remediation completion confirmation.

## Phase 14 notes

- Generic testing pack only — not verified state law.
- Readiness wording: "Ready based on configured checklist" — never universal "compliant".
- Inspection packets are read-only, time-limited, revocable, audited.
- Phone shows Computer Recommended for complex licensing tools (**application UI**, not screenshot injection).
