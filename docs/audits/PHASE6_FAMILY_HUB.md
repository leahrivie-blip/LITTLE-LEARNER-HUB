# Phase 6 — Family Hub Completion

**Status:** Complete (testing spine)  
**Branch:** `cursor/phase6-family-hub-completion-9c23`  
**Policy:** Testing only. Production untouched. Do not start Phase 7 Forms until Leah confirms this report.

## Goal

Make Family Hub the complete parent-facing experience, wired to the same Child/Profile + household membership from Phase 4 and the same daily-care records from Phase 5 — **no second roster**.

## Canonical rules (unchanged)

| Object | Source of truth |
|---|---|
| Child names / classrooms | `programData[programId].child.data.Profiles` |
| Household membership | `familyHouseholds[id].childIds` (id-only) |
| Daily care | Same child blob (`Meals`, `Naps`, `Diapers`, …) with `shareWithFamily === true` for parent visibility |
| Messages | `familyHubMessages` + bridged family-visible Communications |

## Delivered

- Guardian login / magic redeem with session email attribution
- Multi-guardian + sibling households; guardians only see authorized children
- Daily Ops → Family Hub: reports, meals, bottles/diapers, naps, activities, mood/notes, family-visible photos & observations
- Staff-only entries never appear in Family Hub (`shareWithFamily === true` required)
- Forms: only family-shared docs list/acknowledge; staff-only ack denied server-side
- Provider ↔ family messaging; provider inbox unread counts; parent→provider notifications
- Documents/resources via shared Documents overlay
- Owner Admin household preview (magic link + Profile names via canonical overlay)
- Billing area is **placeholder only** (no tuition billing this phase)
- Staff/teacher provider routes resolve `ownerEmail` via program context
- Household list / invite peek / invite email overlay live Profile names

## Security

- Session carries `householdId`; parent APIs do not accept another household id
- Cross-household child focus, form ack, and absence requests rejected
- Revoke invalidates sessions + magic links
- Document acknowledge requires membership **and** `shareWithFamily === true`

## Tests

```bash
npm run test:family-hub-phase6
npm run test:family-hub-testing-readiness
npm run test:daily-operations-phase5
```

## Explicit non-goals

- Real tuition billing (later Billing phase)
- Phase 7 Forms redesign
- Production deploy / env writes
