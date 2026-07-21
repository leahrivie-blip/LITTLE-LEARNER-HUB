# PR #324 description (paste into GitHub)

Copy everything below the line into the draft PR description at  
https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324

Automated PR body updates from this agent environment return HTTP 403  
(`pull_requests:write` not granted). Branch pushes still update the PR head.

---

## Status (transfer-ready)

Private preview work for Director Center → Teacher Classroom → Manual Custom Form Builder → Built-In Form Library.

**Do not merge into `main`. Do not deploy to production.**

### Start Here (next developer)

1. Fetch the repository
2. Check out `cursor/director-family-foundation-bc66`
3. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`
4. Review this draft PR (#324)
5. Run all Phase 1–5 automated tests
6. Confirm testing-environment safety
7. Continue only from the next **approved** phase
8. Never merge or deploy without explicit approval

### Links

| Item | Value |
|------|--------|
| Repository | `leahrivie-blip/LITTLE-LEARNER-HUB` |
| Branch | `cursor/director-family-foundation-bc66` |
| Latest commit | See branch tip / `git log -1` |
| Testing site | https://little-learner-hub-testing.onrender.com |
| Handoff doc | `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md` |

### COMPLETED

- Phase 1 foundation (flags default OFF)
- Phase 2 Director Center private admin preview
- Phase 3 teacher/classroom/child connections
- Phase 4 Manual Custom Form Builder
- Phase 5 Built-In Form Library — 29 starter templates, browse/search/filter/sort, preview, favorites, recent activity, "Use This Template" → new organization-owned draft, versioning + retirement safety, structured importer (system-admin only), role-scoped access

### NOT STARTED

- Phase 6 form sending, responses, signatures, Child Profile storage, repeatable Medication Administration Log entries
- Phase 7 AI Form Builder
- Parent accounts / Family Hub
- Live pricing changes
- Production migration / production release

### Feature flags (testing)

- `directorCenter=true` (with `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`)
- `formsCenter=true` (with `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`)
- `familyHub=false` (**forced OFF** — must remain off)

### Safety

- Fake data only in preview
- Stripe / email / AI disabled on testing
- Production hosts locked by expansion flag policy
- Production data **not** changed; no production migration applied
- Agents have no Render deploy hook — owner Manual Deploy on testing only

### Verification commands

```bash
npm run check
npm run test:director-family-foundation
npm run test:director-center-phase2
npm run test:director-center-phase3
npm run test:forms-center-phase4
npm run test:forms-center-phase5
npm run test:platform-nav
npm run test:account-access
```

### Phase docs

- `docs/PHASE_1_DIRECTOR_FAMILY_FOUNDATION.md`
- `docs/PHASE_2_DIRECTOR_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_2_TESTING_ENV_SAFETY.md`
- `docs/PHASE_3_TEACHER_EXPERIENCE_COMPLETION_REPORT.md`
- `docs/PHASE_4_FORMS_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_5_BUILT_IN_FORM_LIBRARY_COMPLETION_REPORT.md`
- `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`

Suggested title:

`Phases 1–5: Director Center, Teacher Classroom, Forms Builder, Built-In Form Library (do not merge/deploy)`
