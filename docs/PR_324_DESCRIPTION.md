# PR #324 description (paste into GitHub)

Copy everything below the line into the draft PR description at  
https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324

---

## Status (transfer-ready)

Private preview work through **Phase 18** (Testing and Preview Lab), including Phases 1–17.

**Do not merge into `main`. Do not deploy to production. Do not begin Phase 19 until Phase 18 is verified.**

### Start Here (next developer)

1. Fetch the repository
2. Check out `cursor/director-family-foundation-bc66`
3. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`
4. Review this draft PR (#324)
5. Run Phase 1–18 automated tests (include `npm run test:testing-lab-phase18`)
6. Confirm testing-environment safety
7. Continue only after owner-approved Phase 19 requirements
8. Never merge or deploy without explicit approval

### COMPLETED

- Phases 1–17 (testing preview)
- Phase 18 Testing and Preview Lab — `docs/PHASE_18_TESTING_PREVIEW_LAB_COMPLETION_REPORT.md`
- Owner guide — `docs/TESTING_PREVIEW_LAB_OWNER_GUIDE.md`

### NOT STARTED

- Phase 19+
- Live Stripe products/prices/checkout changes
- Live family payment processing
- Live email / SMS / push delivery
- Live AI / production migration

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
npm run test:testing-lab-phase18
# plus Phase 1–17 suite listed in docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md
```

### Tip

Authoritative tip after push: `git rev-parse origin/cursor/director-family-foundation-bc66`

Phase 18 focused suite: **17 PASS**. Full Phase 1–18 regression: **PASS**. Tip: `9dda210`. Production locked. `main` untouched. Phase 19 not started.

### Suggested PR title

Phases 1–18 Testing and Preview Lab (do not merge/deploy)
