# Classroom Assistant — New Highest Priority

**Date:** 2026-07-22  
**Branch:** `testing/full-platform-integration-2026-07`  
**Decision:** Pause Phase 22. Reprioritize around **Classroom Assistant**.

## Why

Provider feedback: eliminate repetitive data entry. Providers should write naturally; the Classroom Assistant organizes information automatically into the correct places.

Guiding question for every feature: **Can we make this faster and easier for the provider?** If yes, build that workflow first.

## Scope (highest priority)

1. **Group meal logging** from natural language (everyone + exceptions)
2. **Group activity logging** + individual highlights/observations
3. **Daily summary** routing into reports, activities, meals, observations, parent reports, documentation, timelines
4. **Individual exceptions** (nap, meals, etc.) without opening every profile
5. **Checked-in awareness** — group entries apply only to checked-in children unless named
6. **Admin Classroom Assistant** — paste lesson plans → structured draft → review → save
7. **Smart suggestions** after writing (observation, parent message, documentation, milestone, daily report, portfolio)

## Safety (testing)

- Fake data only
- Local deterministic parsing only — **no live AI** until separately approved
- Preview/review before apply
- No production deploy / no merge to `main` without owner approval
- Stripe, outbound email, SMS, push remain disabled for this workstream

## Phase 22

**Paused.** Do not begin Phase 22 until Classroom Assistant priority work is accepted and the owner writes new Phase 22 instructions.

## Related report

See `docs/CLASSROOM_ASSISTANT_FOUNDATION_COMPLETION_REPORT.md` after the foundation lands.
