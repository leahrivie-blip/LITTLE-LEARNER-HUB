# PR #324 description (paste into GitHub)

Copy everything below the line into the draft PR description at  
https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324

---

## Status (transfer-ready)

Private preview work through **Phase 19** (Accessibility, Performance, Reliability, Recovery), including Phases 1–18.

**Do not merge into `main`. Do not deploy to production. Do not begin Phase 20 until Phase 19 is verified.**

### Start Here (next developer)

1. Fetch the repository
2. Check out `cursor/director-family-foundation-bc66`
3. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`
4. Review this draft PR (#324)
5. Run Phase 1–19 automated tests (include `npm run test:platform-resilience-phase19`)
6. Confirm testing-environment safety
7. Continue only after owner-approved Phase 20 requirements
8. Never merge or deploy without explicit approval

### COMPLETED

- Phases 1–18 (testing preview)
- Phase 19 Accessibility / Performance / Reliability / Recovery — `docs/PHASE_19_ACCESSIBILITY_PERFORMANCE_RELIABILITY_COMPLETION_REPORT.md`
- Shared helpers: `platform-a11y.js`, `platform-perf.js`, `platform-resilience.js`
- Testing Lab Health + fake backup/restore simulation
- Owner guide — `docs/TESTING_PREVIEW_LAB_OWNER_GUIDE.md`

### NOT STARTED

- Phase 20+
- Live Stripe products/prices/checkout changes
- Live family payment processing
- Live email / SMS / push delivery
- Live AI / production migration
- Formal WCAG certification (manual review still required)

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
npm run test:platform-resilience-phase19
npm run test:testing-lab-phase18
# plus Phase 1–18 suite listed in docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md
```

### Tip

Authoritative tip after push: `git rev-parse origin/cursor/director-family-foundation-bc66`

Phase 19 focused suite: **15 PASS**. Full Phase 1–19 regression: **PASS**. Production locked. `main` untouched. Phase 20 not started.
