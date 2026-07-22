# PR #324 description (paste into GitHub)

Copy everything below the line into the draft PR description at  
https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324

Automated PR body updates from this agent environment return HTTP 403  
(`pull_requests:write` not granted). Branch pushes still update the PR head.

---

## Status (transfer-ready)

Private preview work for Director Center → Teacher Classroom → Manual Custom Form Builder → Built-In Form Library → Assignments/Responses/Signatures → AI Form Builder Foundation.

**Do not merge into `main`. Do not deploy to production.**

### Start Here (next developer)

1. Fetch the repository
2. Check out `cursor/director-family-foundation-bc66`
3. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`
4. Review this draft PR (#324)
5. Run all Phase 1–7 automated tests
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
- Phase 6 Assignments, Responses, and Signatures — Send/Assign a published form to children/guardians (incl. all verified guardians for a child)/staff/classrooms/program; safe hashed/expiring/revocable testing links (never on production); mobile-first recipient page with sections, autosave, review, typed + drawn signatures, printable confirmation; full response status workflow (review/approve/return/reopen/void/archive); Child/Staff/Classroom/Program filing by permanent ID; form-version protection; Medication Administration Log with non-destructive corrections
- Phase 6 design addition — paper-style desktop/tablet document layout, full-width mobile section-by-section experience, a clean read-only document view for any submitted response, and a permanent, print/download-ready PDF-style snapshot generated automatically when a response is approved (the "locked approved record" step) — see completion report §27
- Phase 7 AI-Assisted Form Builder Foundation — describe/paste a childcare form → deterministic mock suggestions (live AI disabled) → review warnings → edit suggested fields → save as a new program-owned draft; never auto-publishes/sends/signs/overwrites; production rejects mock AI; provider interface ready for a later approved live connection — see `docs/PHASE_7_AI_FORM_BUILDER_COMPLETION_REPORT.md`

### NOT STARTED

- Phase 8 real parent accounts (claiming/completing assigned forms)
- Phase 9 full Family Hub interface
- Real approved AI provider connection
- PDF / Word / image / scanned-form extraction
- Real outbound email/SMS delivery of assignment links/reminders
- Live pricing changes
- Production migration / production release

### Feature flags (testing)

- `directorCenter=true` (with `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`)
- `formsCenter=true` (with `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`) — Built-In Library, Assignments/Responses, and AI Form Builder admin routes share this same flag
- `familyHub=false` (**forced OFF** — must remain off)

Recipient testing links (`/api/form-recipient/*`) are intentionally **not** gated by
this flag table (recipients are never admins); they have their own independent
production-host lock plus hashed/expiring/revocable per-assignment tokens.

### Safety

- Fake data only in preview
- Stripe / email / SMS / live AI disabled on testing
- AI Form Builder uses deterministic mock fixtures labeled “Testing Preview — AI Not Called.”
- Production hosts locked by expansion flag policy, plus an independent lock on recipient testing links and mock AI
- Production data **not** changed; no production migration applied
- Agents have no Render deploy hook — owner Manual Deploy on testing only
- Raw recipient tokens are never stored/logged — only a SHA-256 hash persists
- The approved-response document snapshot is a derived, preserved view — the structured response answers always remain the single authoritative record

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
npm run test:platform-nav
npm run test:account-access
```

Full Phase 1–7 regression — all PASS.

### Phase docs

- `docs/PHASE_1_DIRECTOR_FAMILY_FOUNDATION.md`
- `docs/PHASE_2_DIRECTOR_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_2_TESTING_ENV_SAFETY.md`
- `docs/PHASE_3_TEACHER_EXPERIENCE_COMPLETION_REPORT.md`
- `docs/PHASE_4_FORMS_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_5_BUILT_IN_FORM_LIBRARY_COMPLETION_REPORT.md`
- `docs/PHASE_6_FORM_RESPONSES_SIGNATURES_COMPLETION_REPORT.md`
- `docs/PHASE_7_AI_FORM_BUILDER_COMPLETION_REPORT.md`
- `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`

### Suggested PR title

Phases 1–7: Director Center, Teacher Classroom, Forms Builder, Built-In Form Library, Assignments/Responses/Signatures, AI Form Builder Foundation (do not merge/deploy)
