# PR #324 description (paste into GitHub)

Copy everything below the line into the draft PR description at  
https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324

Automated PR body updates from this agent environment may return HTTP 403  
(`pull_requests:write` not granted). Branch pushes still update the PR head.

---

## Status (transfer-ready)

Private preview work for Director Center → Teacher Classroom → Manual Custom Form Builder → Built-In Form Library → Assignments/Responses/Signatures → AI Form Builder Foundation → Family / Guardian / Household / Fake-Account Foundation.

**Do not merge into `main`. Do not deploy to production.**

### Start Here (next developer)

1. Fetch the repository
2. Check out `cursor/director-family-foundation-bc66`
3. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`
4. Review this draft PR (#324)
5. Run all Phase 1–8 automated tests
6. Confirm testing-environment safety
7. Continue only from the next **approved** phase (Phase 9+)
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
- Phase 6 Assignments, Responses, and Signatures — Send/Assign, safe testing links, recipient completion/signatures, response workflow, Child/Staff/Classroom/Program filing, Medication Administration Log corrections
- Phase 6 design addition — paper-style documents + permanent PDF-style snapshot on approve
- Phase 7 AI-Assisted Form Builder Foundation — describe/paste → mock suggestions → review → save new program-owned draft; live AI off; production rejects mock AI — see `docs/PHASE_7_AI_FORM_BUILDER_COMPLETION_REPORT.md`
- Phase 8 Family / Guardian / Household / Fake-Account Foundation — Director Center Families tab; households; multi-guardian / sibling / multi-household / shared-custody relationships; child-specific access levels; invitations (no email/SMS); resettable `@example.invalid` fake accounts; guardian Family Hub OFF placeholder; production rejects fake accounts — see `docs/PHASE_8_FAMILY_GUARDIAN_FAKE_ACCOUNT_FOUNDATION_COMPLETION_REPORT.md`

### NOT STARTED

- Phase 9 full Family Hub interface
- Phase 18 complete Testing and Preview Lab
- Real approved AI provider connection
- PDF / Word / image / scanned-form extraction
- Real outbound email/SMS delivery of assignment links/invitations/reminders
- Live pricing changes
- Production migration / production release

### Feature flags (testing)

- `directorCenter=true` (with `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`)
- `formsCenter=true` (with `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`) — Built-In Library, Assignments/Responses, and AI Form Builder admin routes share this same flag
- `familyHub=false` (**forced OFF** — must remain off; Phase 8 is foundation only)

Recipient testing links (`/api/form-recipient/*`) and Phase 8 guardian-session / invitation-accept routes are intentionally **not** Family Hub product surfaces; they have independent production locks.

### Safety

- Fake data only in preview
- Stripe / email / SMS / live AI disabled on testing
- AI Form Builder uses deterministic mock fixtures labeled “Testing Preview — AI Not Called.”
- Fake accounts use `@example.invalid`; passwords issued once via admin action — never hardcoded
- Production hosts locked by expansion flag policy, plus independent locks on recipient links, mock AI, fake accounts, and invitation accept
- Production data **not** changed; no production migration applied
- Agents have no Render deploy hook — owner Manual Deploy on testing only
- Raw invitation / recipient tokens are never stored/logged — only SHA-256 hashes persist
- Relationship history is preserved on suspend/end — never silently deleted

### Verification commands

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
npm run test:platform-nav
npm run test:account-access
```

Full Phase 1–8 regression — all PASS (see handoff).

### Phase docs

- `docs/PHASE_1_DIRECTOR_FAMILY_FOUNDATION.md`
- `docs/PHASE_2_DIRECTOR_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_2_TESTING_ENV_SAFETY.md`
- `docs/PHASE_3_TEACHER_EXPERIENCE_COMPLETION_REPORT.md`
- `docs/PHASE_4_FORMS_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_5_BUILT_IN_FORM_LIBRARY_COMPLETION_REPORT.md`
- `docs/PHASE_6_FORM_RESPONSES_SIGNATURES_COMPLETION_REPORT.md`
- `docs/PHASE_7_AI_FORM_BUILDER_COMPLETION_REPORT.md`
- `docs/PHASE_8_FAMILY_GUARDIAN_FAKE_ACCOUNT_FOUNDATION_COMPLETION_REPORT.md`
- `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`

### Suggested PR title

Phases 1–8: Director Center, Forms, AI Form Builder, Family/Guardian/Fake-Account Foundation (do not merge/deploy)
