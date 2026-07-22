# Overnight decisions and blockers

**Branch:** `cursor/director-family-foundation-bc66`  
**Updated:** 2026-07-22 (Phase 12 Enrollment)

## Decisions

### Family Hub nav — Enrollment entry (Phase 12)

**Decision:** Enrollment is accessed from **Home** (button + `tab=enrollment` / deep links such as `#family-hub?tab=enrollment`), not by replacing a bottom-nav item.

**Why:** Family Hub bottom nav stays at **max five** items and must keep **Messages** (Phase 11). Adding Enrollment as a sixth tab would break that constraint; swapping Messages out would regress messaging UX.

**Provider side:** Director Center uses a dedicated **Enrollment** tab (`data-dc-tab="enrollment"`).

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

## Safety / still OFF

- No Stripe enrollment checkout  
- No public production inquiries  
- No outbound email/SMS/push for enrollment  
- Production Family Hub locked  

## Blockers

None recorded for Phase 12 completion. Next coding waits on **owner-written Phase 13** requirements.
