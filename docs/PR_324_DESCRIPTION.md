# PR #324 description (paste into GitHub)

Copy everything below the line into the draft PR description at  
https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324

---

## Status (transfer-ready)

Private preview work through **Phase 9 Responsive Family Hub Base**.

**Do not merge into `main`. Do not deploy to production.**

### Start Here (next developer)

1. Fetch the repository
2. Check out `cursor/director-family-foundation-bc66`
3. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`
4. Review this draft PR (#324)
5. Run all Phase 1–9 automated tests
6. Confirm testing-environment safety
7. Continue only from the next **approved** phase (Phase 10+)
8. Never merge or deploy without explicit approval

### COMPLETED

- Phases 1–7 (Director Center, Teacher Classroom, Forms Builder, Built-In Library, Assignments/Responses/Signatures, AI Form Builder)
- Phase 8 Family / Guardian / Household / Fake-Account Foundation
- Phase 9 Responsive Family Hub Base — mobile-first Home/Children/Forms/Calendar/Account for approved fake guardians under `ALLOW_FAMILY_HUB_TESTING_PREVIEW`; production Family Hub remains locked — see `docs/PHASE_9_FAMILY_HUB_BASE_COMPLETION_REPORT.md`

### NOT STARTED

- Phase 10 photos/videos/daily updates/family sharing
- Phase 11 messaging and notification delivery
- Phase 18 Testing and Preview Lab
- Real AI / outbound email-SMS / live pricing / production migration

### Feature flags (testing)

- `directorCenter=true` + `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`
- `formsCenter=true` + `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`
- `familyHub=true` + `ALLOW_FAMILY_HUB_TESTING_PREVIEW` (authenticated fake guardians only)
- **Production:** all expansion flags locked OFF (Family Hub included)

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
npm run test:platform-nav
npm run test:account-access
```

### Tip (Phase 9 complete)

`14d42368f8c650036183a5a413f97cbd6f176dc9` on `cursor/director-family-foundation-bc66`

Full regression: **280 PASS**. Phase 10 not started. Production Family Hub locked. `main` untouched.

### Suggested PR title

Phases 1–9: Director/Forms/Family Hub Base (do not merge/deploy)
