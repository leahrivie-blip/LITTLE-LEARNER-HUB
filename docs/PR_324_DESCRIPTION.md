# PR #324 description (paste into GitHub)

Copy everything below the line into the draft PR description at  
https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324

---

## Status (transfer-ready)

Private preview work through **Phase 15** (Today Hub / Daily Operations), including Phase 12–14 remediation.

**Do not merge into `main`. Do not deploy to production. Do not begin Phase 16 until Phase 15 is verified.**

### Start Here (next developer)

1. Fetch the repository
2. Check out `cursor/director-family-foundation-bc66`
3. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`
4. Review this draft PR (#324)
5. Run Phase 1–15 automated tests (include `npm run test:today-hub-phase15`)
6. Confirm testing-environment safety
7. Continue only after owner-approved Phase 16 requirements
8. Never merge or deploy without explicit approval

### COMPLETED

- Phases 1–14 (testing preview; backend/permissions)
- Phase 12–14 remediation — `docs/PHASE_12_14_REMEDIATION_COMPLETION_REPORT.md`
- Phase 15 Today Hub — `docs/PHASE_15_TODAY_DAILY_OPERATIONS_COMPLETION_REPORT.md`

### NOT STARTED

- Phase 16+
- Live Stripe enrollment checkout
- Live email / SMS / push delivery
- Live AI / live pricing / production migration
- Staff scheduling / billing (deferred from Phase 15)

### Feature flags (testing)

- `directorCenter=true` + `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`
- `formsCenter=true` + `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`
- `familyHub=true` + `ALLOW_FAMILY_HUB_TESTING_PREVIEW`
- **Production:** expansion flags locked OFF

### Verification

```bash
npm run check
npm run test:director-family-foundation
npm run test:director-center-phase2
npm run test:director-center-phase3
npm run test:forms-center-phase4
npm run test:forms-center-phase5
npm run test:forms-center-phase6
npm run test:forms-center-phase6-documents
npm run test:forms-center-phase7
npm run test:family-foundation-phase8
npm run test:family-hub-phase9
npm run test:family-updates-phase10
npm run test:family-messaging-phase11
npm run test:family-enrollment-phase12
npm run test:records-center-phase13
npm run test:licensing-center-phase14
npm run test:phase12-14-remediation
npm run test:today-hub-phase15
npm run test:platform-nav
npm run test:account-access
```

### Tip

Authoritative tip after push: `git rev-parse origin/cursor/director-family-foundation-bc66`  

Phase 15 focused suite: **17 PASS**. Full Phase 1–15 regression: **PASS**. Tip: `f97b195`. Production Family Hub locked. `main` untouched. Phase 16 not started.

### Suggested PR title

Phases 1–15 Today Hub (do not merge/deploy)
