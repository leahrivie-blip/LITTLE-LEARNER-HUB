# Subscription & Permission Test Matrix

**Date:** 2026-07-14  
**Environment:** Safe test accounts only. No live Stripe charges unless Stripe test mode is confirmed.

## Account coverage status

| Persona | Dedicated test account | Status |
| --- | --- | --- |
| Free | Needed | Pending — create via signup on staging/local |
| Trial | Needed | Pending — Stripe test mode trial |
| Founding Member | `LLH_TEST_EMAIL` (existing founding) | Available in env; do not change plan/price |
| Pro | Needed | Pending — Stripe test mode |
| Center | Needed | Pending |
| Director/Owner | Needed | Pending (maps to director role) |
| Lead Teacher | Needed | Pending |
| Assistant/Staff | Needed | Pending |
| Home Daycare | Needed | Pending (accountType home_daycare) |
| Single Provider | Needed | Pending (owner/home daycare) |

## Checks per account (checklist)

- [ ] Sidebar / dashboard matches role & plan
- [ ] Lesson-plan access (Free samples vs Pro unlock)
- [ ] Pro locks/unlocks correctly
- [ ] Promo-code access matches promised entitlement
- [ ] Staff see only assigned classrooms/children
- [ ] Staff cannot open billing or director-only settings
- [ ] Directors can open staff, forms, enrollment, billing
- [ ] Upgrade prompts route to the correct plan
- [ ] Founding members remain $9.99/month locked while membership remains continuously active
- [ ] No production Stripe mutations during testing

## Notes

- Only one production founding credential is available in this agent environment (`LLH_TEST_EMAIL`).
- Full multi-role E2E requires creating dedicated safe accounts and (for paid tiers) Stripe **test mode**.
- Code gates already exist via `canAccessPlatformFeature`, `canAccess`, and role helpers; this matrix tracks live verification, not implementation.
