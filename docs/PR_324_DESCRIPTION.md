# PR #324 description (paste into GitHub)

Copy everything below the line into the draft PR description at  
https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324

---

## Status (transfer-ready)

Private preview work through **Phase 20** (Security, Data Migration, Release-Readiness Simulator), including Phases 1–19.

**Do not merge into `main`. Do not deploy to production. Do not begin the testing-site integration checkpoint or Phase 21 without separate owner instructions.**

### Start Here (next developer)

1. Fetch the repository
2. Check out `cursor/director-family-foundation-bc66`
3. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`
4. Review this draft PR (#324)
5. Run Phase 1–20 automated tests (include `npm run test:security-migration-phase20`)
6. Confirm testing-environment safety
7. Continue only after owner-approved **testing-site integration** or **Phase 21** requirements
8. Never merge or deploy without explicit approval

### COMPLETED

- Phases 1–19 (testing preview)
- Phase 20 Security / Migration / Release Readiness — `docs/PHASE_20_SECURITY_MIGRATION_RELEASE_READINESS_COMPLETION_REPORT.md`
- Fake migration simulator (inspect / preview / confirm / rollback) — fake orgs only
- Release Readiness Center (computer-first; phone status summary)
- Integration plan (docs only) — `docs/TESTING_SITE_INTEGRATION_PLAN.md`
- Owner guide — `docs/TESTING_PREVIEW_LAB_OWNER_GUIDE.md`

### NOT STARTED

- Testing-site integration checkpoint (documented only; not executed)
- Phase 21+
- Live Stripe products/prices/checkout changes
- Live family payment processing
- Live email / SMS / push delivery
- Live AI / production migration
- Formal security or WCAG certification (professional review still required)

### Feature flags (testing)

- `directorCenter=true` + `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`
- `formsCenter=true` + `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`
- `familyHub=true` + `ALLOW_FAMILY_HUB_TESTING_PREVIEW`
- `testingLab=true` + `ALLOW_TESTING_LAB_ADMIN_PREVIEW`
- **Production:** expansion flags locked OFF
- **Stripe:** `DISABLE_STRIPE_CHECKOUT=true`

### Verification

```bash
npm run check
npm run test:security-migration-phase20
npm run test:platform-nav
npm run test:account-access
# plus full Phase 1–20 suite listed in docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md
```

### Tip

Authoritative tip after push: `49317fec24694a337c71ef2fdb30777dbc910522` (`git rev-parse origin/cursor/director-family-foundation-bc66`)

Phase 20 focused suite: **12 PASS**. Full Phase 1–20 regression: **PASS**. Production locked. `main` untouched. Integration checkpoint and Phase 21 not started.
