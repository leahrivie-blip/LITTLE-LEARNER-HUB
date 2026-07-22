# Director / Forms / Family Project — Developer Handoff

**Status date:** 2026-07-22 (Phase 17 Platform Pricing & Family Billing Simulator complete; Phase 18 not started)
**Transferability:** Ready for another developer or Cursor account to continue from GitHub.

---

## Start Here

1. Fetch the repository: `git fetch origin`
2. Check out the development branch: `git checkout cursor/director-family-foundation-bc66` then `git pull origin cursor/director-family-foundation-bc66`
3. Read this handoff document end to end
4. Review draft PR [#324](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324)
5. Run all Phase 1–17 automated tests (commands below; include `npm run test:billing-simulator-phase17`)
6. Confirm testing-environment safety rules before any preview enablement
7. Continue only from the next **approved** phase (**Phase 18** — do not start until Phase 17 is verified on the branch tip)
8. **Never merge into `main` and never deploy to production without explicit owner approval**

---

## Project purpose

Build a private, testing-only foundation for:

- **Director Center** — organization, classrooms, staff, children, program profile, roles
- **Teacher Classroom Experience** — classroom week, events, daily logs, observations, goals, timeline
- **Forms Center** — Manual Custom Form Builder (draft / publish / archive) plus a **Built-In Form Library** (29 starter templates, browse/search/preview/favorite, "Use This Template" → editable program copy) plus **Assignments, Responses, and Signatures** (send/assign a published form, complete it via a safe testing link, sign electronically, review/approve, and file the response under the correct Child/Staff/Classroom/Program record) plus an **AI Form Builder** foundation (describe/paste → structured draft suggestions → review → save as program-owned draft; live AI disabled; mock fixtures only)
- **Family / guardian / household foundation** (Phase 8) — households, multi-guardian access levels, invitations (no email/SMS), safe fake accounts
- **Family Hub base** (Phase 9) — mobile-first Home/Children/Forms/Calendar/Account for fake guardians (testing preview only; production locked)
- **Family updates / Daily Reports / media / sharing** (Phase 10) — provider-controlled family feed, consent-gated placeholder media, acknowledgments
- **Family messaging / notifications / history** (Phase 11) — org-scoped provider/family messaging + in-app notifications; outbound delivery disabled; platform Messaging Center preserved
- **Enrollment** (Phase 12) — provider pipeline (inquiry → tour → application → waitlist/offer → forms → enrolled) + Family Hub checklist/offers; no Stripe enrollment; Enrollment from Home (max-five nav keeps Messages)
- **Records Center** (Phase 13) — authoritative records, unfiled inbox, Family Hub documents
- **Licensing Center** (Phase 14) — configurable readiness + Family Hub **Licensing Documents Needed** from Home
- **Phase 12–14 remediation** — responsive `.en-`/`.rc-`/`.lc-*` rules, real Family Hub licensing UI, valid screenshots (`docs/PHASE_12_14_REMEDIATION_COMPLETION_REPORT.md`)
- **Today Hub / Daily Operations** (Phase 15) — role-specific Today Hub, attendance foundation, provider-configured ratios, task aggregation — `docs/PHASE_15_TODAY_DAILY_OPERATIONS_COMPLETION_REPORT.md`
- **Complete Staff Experience** (Phase 16) — Staff Hub directory/profiles, onboarding, schedule, time clock, training, self-service, offboarding — `docs/PHASE_16_COMPLETE_STAFF_EXPERIENCE_COMPLETION_REPORT.md`
- **Platform Pricing & Family Tuition Billing Simulator** (Phase 17) — testing-only plan catalog/entitlement simulator + provider→family tuition billing — `docs/PHASE_17_PRICING_FAMILY_BILLING_SIMULATOR_COMPLETION_REPORT.md`

All work is additive, flag-gated, fake-data-only in preview, and must not affect live production customers, Stripe, email, or AI until separately approved.

---

## Repository

| Item | Value |
|------|--------|
| GitHub | `leahrivie-blip/LITTLE-LEARNER-HUB` |
| Clone URL | `https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB.git` |
| App shape | Single Node.js service (`server/index.js`) + static `index.html` / `app.js` / `styles.css` |

---

## Development branch

| Item | Value |
|------|--------|
| Branch | `cursor/director-family-foundation-bc66` |
| Base | `main` (do **not** merge without approval) |
| Tip at handoff | Branch tip on `origin/cursor/director-family-foundation-bc66` (verify after push: `git rev-parse HEAD`) |
| Tip message | Phase 17 Pricing & Family Billing Simulator complete (tip SHA via `git rev-parse` after push) |

Confirm tip after pull:

```bash
git rev-parse HEAD
git log -1 --oneline
```

---

## Draft PR

| Item | Value |
|------|--------|
| PR | [#324](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324) |
| State | Draft / open — **do not merge** |
| Title (may lag body) | May still say Phase 2 — paste `docs/PR_324_DESCRIPTION.md` into the PR body; agent token cannot edit PR description (403) |

---

## Testing website

| Item | Value |
|------|--------|
| Testing URL | `https://little-learner-hub-testing.onrender.com` |
| Production brand site | Do **not** use for this work; production must stay locked |
| Deploy method | Owner Manual Deploy on Render testing service (agents have no Render API/deploy hook) |
| After deploy | Confirm HTML cache busters and feature flags match branch tip |

Local dev:

```bash
npm run start   # http://localhost:4242
```

Default local store: `DATABASE_PROVIDER=local-json` → `server/data/launch-store.json` (git-ignored).

---

## Latest commit

Authoritative tip is always:

```bash
git fetch origin cursor/director-family-foundation-bc66
git rev-parse origin/cursor/director-family-foundation-bc66
git log -1 --oneline origin/cursor/director-family-foundation-bc66
```

Handoff commits (newest first among transfer docs — update after each new phase commit):

- Phase 6 Form Assignments, Responses, and Signatures (data model, tokens, permissions, admin API, recipient API, fixtures, UI, recipient page, tests, docs)
- Phase 5 Built-In Form Library (data model, importer, 29 starter templates, fixtures, API, UI, tests, docs)
- Fix handoff tip SHA and commit history table
- Add paste-ready PR #324 description for handoff transfer (`da3dba9`)
- Add Director/Forms/Family project handoff for transferability (`cf6a11a`)
- Phase 4 Manual Custom Form Builder (`f0f393a`)

Paste-ready PR body (GitHub description may be stale): `docs/PR_324_DESCRIPTION.md`.

Phase tip history (newest first):

| Commit | Summary |
|--------|---------|
| *(branch tip — set after push via `git rev-parse`)* | Phase 17 Pricing & Family Billing Simulator complete |
| `c9a33e0` | Phase 16 tip (Phase 17 start) |
| `c43f345` | Phase 15 tip (Phase 16 start) |
| `94bc315` | Phase 12–14 remediation tip (Phase 15 start) |
| `b69707e` | Tip before Phase 12 feature commit |
| `a5b1f4c` | Phase 11 family messaging implementation |
| `99a8aa7` | Phase 10 family updates implementation |
| `aa6e9a9` | Phase 9 Responsive Family Hub Base complete |
| `809b83d` | Phase 9 Family Hub base implementation |
| `ab61b77` | Phase 8 Family / Guardian / Fake-Account Foundation complete |
| *(earlier)* | Phase 6 Form Assignments, Responses, and Signatures complete |
| `dd46c2d` | Phase 5 Built-In Form Library complete |
| `18f0b0b` | Handoff transfer docs (Phase 1–4) |
| `da3dba9` | Paste-ready PR #324 description |
| `cf6a11a` | Transfer handoff document |
| `f0f393a` | Phase 4 Manual Custom Form Builder |
| `f9d5ee7` | Phase 3 teacher classroom preview UI |
| `3ba8577` | Phase 3 teacher API |
| `6a308a9` | Phase 2 Director Center UI connections |
| `80949ff` / `744d48b` | Admin sidebar + Director Center CTA |
| `cecbb24` | Mobile auth checkbox fix |
| `775a0de` | Preview testing safety switches |
| `037baad` / `3076ce7` | Phase 2 Director Center preview |
| `adce87b` | Phase 1 foundation (flags off) |

---

## Completed phases

### COMPLETED

- **Phase 1 foundation** — org/classroom/permission/entitlement models; expansion flags default OFF
- **Phase 2 Director Center** — private admin preview (Overview, Classrooms, Staff, Children, Program Profile, Roles)
- **Phase 3 teacher/classroom/child connections** — Teacher Center preview, role preview header, week assignments, events, daily logs, observations, goals, timeline, migration dry-run
- **Phase 4 Manual Custom Form Builder** — Forms Center Home / My Forms / Templates / Archived / Builder / Preview; draft autosave; immutable publish versions; duplicate/archive/restore; no responses
- **Phase 5 Built-In Form Library** — 29 system-owned starter templates inside Forms Center; Built-In Library browse/search/filter/sort; preview; favorites; recently previewed/copied; "Use This Template" → new organization-owned draft with fresh IDs; template versioning (newer-version demo) and retirement (retired-template demo) that never breaks existing organization copies; structured importer (system-admin only); role-scoped access (director/owner full, teacher/assistant only with director-granted override, system-admin-only template management). See `docs/PHASE_5_BUILT_IN_FORM_LIBRARY_COMPLETION_REPORT.md`.
- **Phase 6 Form Assignments, Responses, and Signatures** — Send/Assign a published form to one/many children, guardians (incl. all verified guardians for a child), staff, classrooms, or the whole program; safe hashed/expiring/revocable testing links (never on production); mobile-first recipient completion page with sections, autosave, review, typed + drawn signatures, and printable confirmation; full response status workflow with review/approve/return/reopen/void/archive; Child/Staff/Classroom/Program filing by permanent ID; form-version protection; Medication Administration Log with non-destructive corrections. See `docs/PHASE_6_FORM_RESPONSES_SIGNATURES_COMPLETION_REPORT.md`.
- **Phase 7 AI-Assisted Form Builder Foundation** — Describe or paste a childcare form → deterministic mock suggestions (live AI disabled) → review warnings → edit suggested fields → save as a new program-owned draft with a permanent ID → continue in the Phase 4 Form Builder. Never auto-publishes, sends, signs, or overwrites. Production rejects mock AI. See `docs/PHASE_7_AI_FORM_BUILDER_COMPLETION_REPORT.md`.
- **Phase 8 Family / Guardian / Household / Fake-Account Foundation** — Director Center **Families** tab for households, guardians/contacts, child-specific access levels, invitations (hashed/expiring/revocable; no email/SMS), and resettable `@example.invalid` fake accounts. Production rejects fake accounts. See `docs/PHASE_8_FAMILY_GUARDIAN_FAKE_ACCOUNT_FOUNDATION_COMPLETION_REPORT.md`.
- **Phase 9 Responsive Family Hub Base** — Mobile-first Family Hub (Home / Children / Forms / Calendar / Account) for approved fake guardians under testing-preview gate. Production Family Hub remains locked. See `docs/PHASE_9_FAMILY_HUB_BASE_COMPLETION_REPORT.md`.
- **Phase 10 Family Updates, Daily Reports, Media, and Sharing** — Provider-controlled updates and Daily Report shares, consent-gated testing media placeholders, shared observations/goals, family acknowledgments. See `docs/PHASE_10_FAMILY_UPDATES_MEDIA_COMPLETION_REPORT.md`.
- **Phase 11 Messaging, Notifications, and Permanent History** — Org-scoped family/provider messaging, in-app notifications, permanent history/export. Outbound email/SMS/push remain disabled. See `docs/PHASE_11_MESSAGING_NOTIFICATIONS_COMPLETION_REPORT.md`.
- **Phase 12 Enrollment** — Provider enrollment pipeline + Family Hub checklist/offers (testing only; no Stripe enrollment; Enrollment from Home to keep max-five nav with Messages). See `docs/PHASE_12_ENROLLMENT_COMPLETION_REPORT.md`.
- **Phase 13 Records, Documents, and Communication Archive** — see `docs/PHASE_13_RECORDS_DOCUMENTS_COMMUNICATION_ARCHIVE_COMPLETION_REPORT.md`
- **Phase 14 Licensing** — `docs/PHASE_14_LICENSING_INSPECTION_READINESS_COMPLETION_REPORT.md` and `docs/OVERNIGHT_DECISIONS_AND_BLOCKERS.md`
- **Phase 12–14 remediation** — responsive UI, Family Hub licensing Home card, valid screenshots — `docs/PHASE_12_14_REMEDIATION_COMPLETION_REPORT.md`
- **Phase 15 Today Hub / Daily Operations** — role-specific Today Hub, attendance + ratios, task aggregation — `docs/PHASE_15_TODAY_DAILY_OPERATIONS_COMPLETION_REPORT.md`
- **Phase 16 Complete Staff Experience** — Staff Hub, schedule, time clock, training, self-service, offboarding — `docs/PHASE_16_COMPLETE_STAFF_EXPERIENCE_COMPLETION_REPORT.md`
- **Phase 17 Platform Pricing & Family Tuition Billing Simulator** — plan catalog, entitlement simulator, family tuition ledger — `docs/PHASE_17_PRICING_FAMILY_BILLING_SIMULATOR_COMPLETION_REPORT.md`

### NOT STARTED

- **Phase 18** complete Testing and Preview Lab
- Real approved AI provider connection (provider interface is ready; live calls stay off)
- PDF / Word / image / scanned-form extraction (import foundation prepared only)
- Real outbound email/SMS delivery of assignment links and reminders
- Live Stripe products/prices/checkout changes
- Live family payment processing
- Production migration
- Production release

---

## Current feature flags

Policy lives in `scripts/expansion-feature-flags.js`.

| Flag | Intended stored value on testing (after enable) | Runtime behavior |
|------|--------------------------------------------------|------------------|
| `directorCenter` | `true` (testing only) | Requires non-prod host + `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW` + verified admin Bearer |
| `formsCenter` | `true` (testing only, Phase 4/5/6) | Requires non-prod host + `ALLOW_FORMS_CENTER_ADMIN_PREVIEW` + verified admin Bearer. The Phase 5 Built-In Library (`/api/forms-center/library/*`) and the Phase 6 assignment/response admin API (`/api/forms-center/assignments/*`, `/api/forms-center/responses/*`) all ride on this **same** flag — no separate flag was added. |
| `familyHub` | `true` on testing only with `ALLOW_FAMILY_HUB_TESTING_PREVIEW` | Testing preview for authenticated fake guardians; **production always locked** |
| Defaults in code | All expansion flags **OFF** | Production hosts stay locked even if store says ON |

The Phase 6 **recipient** API (`/api/form-recipient/*`) is intentionally **not** part of
this flag table — recipients are never admins, so it cannot require an admin Bearer.
Instead it has its own independent production lock (`isLiveProductionHost()` inside
`server/form-recipient-api.js`) plus per-assignment hashed/expiring/revocable tokens.
See `docs/PHASE_6_FORM_RESPONSES_SIGNATURES_COMPLETION_REPORT.md` §13.

Required testing env vars (names only; never commit secrets):

- `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true`
- `ALLOW_FORMS_CENTER_ADMIN_PREVIEW=true`
- `SITE_URL` → testing hostname
- `DATABASE_PROVIDER=local-json` (isolated from production Postgres)

Stored flags alone are **not** enough without the `ALLOW_*` env opt-ins and non-production host checks.

---

## Testing-environment safety rules

See also: `docs/PHASE_2_TESTING_ENV_SAFETY.md`.

1. Work only on branch `cursor/director-family-foundation-bc66` and draft PR #324.
2. Preview only on **testing** (`little-learner-hub-testing.onrender.com`) or local — never production.
3. Use **fake data only** for Director / Teacher / Forms fixtures.
4. Keep Stripe / outbound email / AI **disabled** on testing.
5. Keep **Family Hub locked on production**; testing preview only via `ALLOW_FAMILY_HUB_TESTING_PREVIEW` + stored `familyHub=true` + authenticated fake guardian.
6. Do **not** merge to `main`.
7. Do **not** deploy to production.
8. Do **not** change production data, production env, or production Stripe/email/AI settings.
9. Query-string admin tokens are rejected for expansion APIs; use verified Admin Bearer.
10. Role preview header (`x-llh-role-preview-membership-id`) is testing-only and must not change stored admin membership role.
11. Forms Center must not send real forms by email/SMS, store real signatures, or call AI in Phases 4–6 — only testing-preview signature placeholders and hashed testing links.
12. Curriculum Only entitlement simulation must continue to block Director/Forms add-ons without charging.
13. Built-in template administration (`/api/forms-center/library/admin/*`) must remain rejected whenever a role-preview header is active, even for a valid admin bearer token.
14. "Use This Template" must never modify a built-in template or its immutable version — only create a new organization-owned draft.
15. Testing links (`/api/form-recipient/*`) must always be rejected outright on a live production host, independent of and in addition to the admin expansion-flag gate.
16. Raw recipient tokens are never stored, logged, or committed — only a SHA-256 hash persists on the assignment; tokens must remain expiring and revocable.
17. A submitted signature must never silently change; reopening or returning a response for correction must invalidate its signatures and require a fresh one before resubmission.

**Confirmation:** Production data was **not** changed by this project work. Production migration has **not** started.

---

## Files and systems added

### Foundation (Phase 1)

| Path | Role |
|------|------|
| `scripts/foundation-data-model.js` | Additive org / classroom / membership / child-link models |
| `scripts/org-permissions.js` | Permission checks (director/teacher/assistant/parent scopes) |
| `scripts/entitlement-model.js` | Entitlement catalog (live pricing unchanged; concepts separate) |
| `scripts/expansion-feature-flags.js` | Director / Forms / Family gates + production locks |
| `scripts/test-director-family-foundation.js` | Phase 1/2 security tests |
| `docs/PHASE_1_DIRECTOR_FAMILY_FOUNDATION.md` | Phase 1 report |
| `docs/PHASE_1_ENTITLEMENT_PRICING_FOUNDATION.md` | Pricing/entitlement notes |

### Director Center (Phase 2)

| Path | Role |
|------|------|
| `server/director-center-api.js` | `/api/director-center/*` |
| `director-center-ui.js` | Director Center admin preview UI |
| `scripts/director-center-preview-fixtures.js` | Fake seed data |
| `scripts/test-director-center-phase2.js` | Phase 2 tests |
| `scripts/capture-director-center-phase2-screens.js` | Screenshots → `/opt/cursor/artifacts/director-center-phase2/` |
| `docs/PHASE_2_DIRECTOR_CENTER_ADMIN_PREVIEW.md` | Preview notes |
| `docs/PHASE_2_DIRECTOR_CENTER_COMPLETION_REPORT.md` | Completion report |
| `docs/PHASE_2_TESTING_ENV_SAFETY.md` | Testing safety checklist |

### Teacher Classroom (Phase 3)

| Path | Role |
|------|------|
| `server/phase3-teacher-api.js` | `/api/director-center/phase3/*` |
| `teacher-center-ui.js` | Teacher Classroom Experience UI |
| `scripts/phase3-seed-expand.js` | Phase 3 fake seed expand |
| `scripts/test-director-center-phase3.js` | Phase 3 tests |
| `scripts/capture-director-center-phase3-screens.js` | Screenshots → `/opt/cursor/artifacts/director-center-phase3/` |
| `docs/PHASE_3_TEACHER_EXPERIENCE_COMPLETION_REPORT.md` | Completion report |

### Forms Center (Phase 4)

| Path | Role |
|------|------|
| `scripts/forms-center-data-model.js` | Forms store, IDs (`fcform_*` / `fcver_*` / `fcfield_*` / `fcaudit_*`), validation |
| `scripts/forms-center-preview-fixtures.js` | Fake form seeds |
| `server/forms-center-api.js` | `/api/forms-center/*` |
| `forms-center-ui.js` | Forms Center + Manual Form Builder UI |
| `scripts/test-forms-center-phase4.js` | Phase 4 tests |
| `scripts/capture-forms-center-phase4-screens.js` | Screenshots → `/opt/cursor/artifacts/forms-center-phase4/` |
| `docs/PHASE_4_FORMS_CENTER_COMPLETION_REPORT.md` | Completion report |

### Built-In Form Library (Phase 5)

| Path | Role |
|------|------|
| `scripts/built-in-form-library-data-model.js` | System-template schema, IDs (`bftpl_*` / `bftver_*`), categories, age groups, intended users |
| `scripts/built-in-form-library-starter-templates.js` | 29 starter templates (structured-import format) |
| `scripts/built-in-form-library-importer.js` | Structured import validation + apply (version-safety rules) |
| `scripts/built-in-form-library-copy.js` | "Use This Template" → new organization-owned Forms Center draft with fresh IDs |
| `scripts/built-in-form-library-fixtures.js` | Seeds catalog, newer-version + retired-template demos, org copies, favorites, recents, role-preview staff |
| `server/built-in-form-library-api.js` | `/api/forms-center/library/*` (shares the Forms Center gate) |
| `scripts/test-forms-center-phase5.js` | Phase 5 tests |
| `scripts/capture-forms-center-phase5-screens.js` | Screenshots → `/opt/cursor/artifacts/forms-center-phase5/` |
| `docs/PHASE_5_BUILT_IN_FORM_LIBRARY_COMPLETION_REPORT.md` | Completion report |

### Assignments, Responses, and Signatures (Phase 6)

| Path | Role |
|------|------|
| `scripts/form-responses-data-model.js` | Assignment/response/signature/audit/medication-log-entry schema, status enums, server-side validation |
| `scripts/form-recipient-tokens.js` | Hashed testing-link tokens: issue, verify, expire, revoke |
| `scripts/form-recipient-payload.js` | Shared recipient-view payload builder (public API + admin preview) |
| `scripts/form-responses-fixtures.js` | Idempotent Phase 6 fixtures: children/guardians/staff/classroom + 16 response scenarios |
| `server/form-responses-api.js` | Admin-side `/api/forms-center/assignments/*`, `/responses/*`, filing views, recipients directory (shares Forms Center gate) |
| `server/form-recipient-api.js` | Public, token-authenticated `/api/form-recipient/*` (never behind the admin gate; own production lock) |
| `forms-responses-ui.js` | Send/Assign modal, Responses Dashboard, response detail/review panel |
| `form-recipient.html` / `form-recipient-ui.js` | Standalone mobile-first recipient completion page |
| `styles/llh-form-recipient.css` | Dedicated recipient-page styles |
| `scripts/test-forms-center-phase6.js` | Phase 6 tests |
| `scripts/capture-forms-center-phase6-screens.js` | Screenshots → `/opt/cursor/artifacts/forms-center-phase6/` |
| `scripts/form-document-snapshot.js` | Design addition: builds the structured document content + permanent snapshot for the "locked approved record" step |
| `form-document-view.js` | Design addition: shared client-side document renderer (recipient page, admin panel, standalone print page) |
| `form-document.html` / `form-document-ui.js` | Design addition: standalone admin print/download page |
| `scripts/test-forms-center-phase6-documents.js` | Design addition tests |
| `scripts/capture-forms-center-phase6-documents-screens.js` | Screenshots → `/opt/cursor/artifacts/forms-center-phase6-documents/` |
| `docs/PHASE_6_FORM_RESPONSES_SIGNATURES_COMPLETION_REPORT.md` | Completion report (see §27 for the design addition) |
| `scripts/ai-form-builder-provider.js` | Phase 7: clean AI provider interface + mock/live mode resolution + input sanitization |
| `scripts/ai-form-builder-fixtures.js` | Phase 7: deterministic fake AI suggestions |
| `scripts/ai-form-builder-analyzer.js` | Phase 7: review warnings before save |
| `scripts/ai-form-builder-data-model.js` | Phase 7: AI builder session store + audit |
| `server/ai-form-builder-api.js` | Phase 7: `/api/forms-center/ai-builder/*` |
| `ai-form-builder-ui.js` | Phase 7: Forms Center AI Form Builder UI |
| `scripts/test-forms-center-phase7.js` | Phase 7 tests |
| `scripts/capture-forms-center-phase7-screens.js` | Screenshots → `/opt/cursor/artifacts/forms-center-phase7/` |
| `docs/PHASE_7_AI_FORM_BUILDER_COMPLETION_REPORT.md` | Phase 7 completion report |
| `scripts/family-foundation-data-model.js` | Phase 8: households, contacts, access rules, invitations, fake accounts, audit |
| `scripts/family-foundation-fixtures.js` | Phase 8: resettable fake households/guardians/access/fake accounts |
| `scripts/family-invitation-tokens.js` | Phase 8: hashed invitation tokens |
| `server/family-foundation-api.js` | Phase 8: `/api/director-center/family/*` + `/api/family-foundation/*` |
| `family-foundation-ui.js` | Phase 8: Director Families tab + guardian-session placeholder |
| `scripts/test-family-foundation-phase8.js` | Phase 8 tests |
| `scripts/capture-family-foundation-phase8-screens.js` | Screenshots → `/opt/cursor/artifacts/family-foundation-phase8/` |
| `docs/PHASE_8_FAMILY_GUARDIAN_FAKE_ACCOUNT_FOUNDATION_COMPLETION_REPORT.md` | Phase 8 completion report |
| `scripts/family-hub-data-model.js` | Phase 9: documents, change requests, calendar, notification prefs |
| `scripts/family-hub-fixtures.js` | Phase 9 fixtures |
| `server/family-hub-api.js` | Phase 9: `/api/family-hub/*` |
| `family-hub-ui.js` | Phase 9 Family Hub UI |
| `scripts/test-family-hub-phase9.js` | Phase 9 tests |
| `docs/PHASE_9_FAMILY_HUB_BASE_COMPLETION_REPORT.md` | Phase 9 completion report |
| `scripts/family-updates-data-model.js` | Phase 10: updates, media, consent, shares |
| `scripts/family-updates-fixtures.js` | Phase 10 fixtures |
| `server/family-updates-api.js` | Phase 10: `/api/director-center/family-updates/*` |
| `family-updates-ui.js` | Phase 10 Director Family Updates tab |
| `scripts/test-family-updates-phase10.js` | Phase 10 tests |
| `docs/PHASE_10_FAMILY_UPDATES_MEDIA_COMPLETION_REPORT.md` | Phase 10 completion report |
| `scripts/family-messaging-data-model.js` | Phase 11 messaging/notifications |
| `server/family-messaging-api.js` | Phase 11 provider messaging API |
| `family-messaging-ui.js` | Phase 11 Director Family Messaging tab |
| `scripts/test-family-messaging-phase11.js` | Phase 11 tests |
| `docs/PHASE_11_MESSAGING_NOTIFICATIONS_COMPLETION_REPORT.md` | Phase 11 completion report |
| `scripts/enrollment-data-model.js` | Phase 12 enrollment pipeline/waitlist/offers/conversion |
| `scripts/enrollment-fixtures.js` | Phase 12 fixtures |
| `server/enrollment-api.js` | Phase 12 provider `/api/director-center/enrollment/*` |
| `server/family-hub-enrollment-handlers.js` | Phase 12 Family Hub enrollment handlers |
| `enrollment-ui.js` | Phase 12 Director Enrollment tab |
| `scripts/test-family-enrollment-phase12.js` | Phase 12 tests (**19 PASS**) |
| `scripts/capture-enrollment-phase12-screens.js` | Screenshots → `/opt/cursor/artifacts/enrollment-phase12/` |
| `docs/PHASE_12_ENROLLMENT_COMPLETION_REPORT.md` | Phase 12 completion report |
| `docs/OVERNIGHT_DECISIONS_AND_BLOCKERS.md` | Nav + permission overnight notes |

### Shell wiring (shared)

Touched across phases (non-exhaustive): `server/index.js`, `app.js`, `index.html`, `styles.css`, `package.json` (`test:*` scripts), `forms-center-ui.js` (Built-In Library tab added in Phase 5; Responses tab + Send/Assign added in Phase 6), `teacher-center-ui.js` (Forms & Documents child-profile section added in Phase 6), `director-center-ui.js` (Families tab added in Phase 8; Family Updates tab added in Phase 10; Enrollment tab added in Phase 12), `family-hub-ui.js` (Phase 9 base; Phase 10 feed sections; Phase 11 Messages; Phase 13 Records / Phase 12 Enrollment from Home).

---

## How Director Center works

1. **Gate:** Non-production host + `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW` + stored `directorCenter=true` + verified admin session (Bearer). Family Hub and (before Phase 4 enablement) Forms stay forced OFF in policy unless separately allowed.
2. **Entry:** Unlock Admin (`/admin`), then open Director Center from platform nav / Admin unlocked CTA. Member login is not required for admin preview sidebar once Admin is unlocked.
3. **API:** `server/director-center-api.js` — overview, classrooms CRUD/archive/restore, staff preview records + classroom assignment (no email), children assign/move with history, program profile, roles matrix, classroom limits, add-on/upgrade **simulation only** (no Stripe checkout). Phase 8 adds `server/family-foundation-api.js` under `/api/director-center/family/*` (households, contacts, access, invitations, fake accounts) plus `/api/family-foundation/*` guardian-session routes (Family Hub product remains OFF).
4. **UI:** `director-center-ui.js` — tabs Overview, Classrooms, Staff, Children, Program Profile, Roles.
5. **Data:** Fake fixtures via `scripts/director-center-preview-fixtures.js`; permanent foundation IDs from Phase 1 model.
6. **Safety:** Cross-org → `403`; Curriculum Only → friendly entitlement denial; production hosts → locked / 404-style rejection.

---

## How Teacher Classroom Experience works

1. **API prefix:** `/api/director-center/phase3/*` in `server/phase3-teacher-api.js`.
2. **UI:** `teacher-center-ui.js` — classroom week assignments/snapshots, events, daily logs (group → per-child with `groupBatchId`), observations, goals, child timeline, assistant permission overrides.
3. **Role preview:** Header `x-llh-role-preview-membership-id` scopes teacher/assistant **without** changing stored admin membership role (testing-only; rejected when preview disabled or on production host).
4. **Permissions:** Directors see org-wide classrooms; teachers limited to assigned classrooms; assistants need overrides (e.g. daily log); medical/allergy redacted without `CHILD_VIEW_MEDICAL`.
5. **Migration:** Dry-run endpoint is fake-data-only and unapplied.
6. **Forms/Family:** Phase 3 tests assert Forms/Family remain appropriately gated; Phase 4 can enable Forms separately without breaking Director/Teacher.

---

## How the Manual Form Builder works

1. **Gate:** Same pattern as Director Center with `formsCenter` + `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`.
2. **Store:** `ensureFormsCenterStore(store)` additive; explicitly has **no** response/submission collections.
3. **Statuses:** `draft` | `published` | `archived`.
4. **IDs:** Forms `fcform_*`, versions `fcver_*` (immutable publish snapshots), fields `fcfield_*`, audits `fcaudit_*`.
5. **UI sections:** Home, My Forms, Templates, Archived, Create/Edit Builder, Preview.
6. **Builder:** Field chooser; add/edit/duplicate/move/delete/undo; sections; autosave; Save Draft; Preview; Publish; Version History.
7. **Field types:** Content blocks, text/selection inputs, childcare smart fields, acknowledgments, **testing-only signature placeholders** (not real signature capture).
8. **Preview:** Shows “Preview only - responses are not being collected”; desktop/mobile toggle.
9. **Out of scope (Phase 4):** Send to parents, response storage, Child Profile attach, email, Stripe, AI generation.

---

## How the Built-In Form Library works (Phase 5)

1. **Gate:** Same `formsCenter` flag as Phase 4 — no separate flag. Routes live at `/api/forms-center/library/*`, mounted alongside `/api/forms-center/*` in `server/index.js`.
2. **Ownership:** Templates (`bftpl_*`) and their immutable versions (`bftver_*`) live in `store.builtInFormLibrary`, entirely separate from any organization's `formsCenter` collections. They are never written to by browsing, previewing, favoriting, or "Use This Template".
3. **Use This Template:** `POST /api/forms-center/library/templates/:id/use` (requires `{ confirm: true }`) creates a brand-new organization-owned draft form via `scripts/built-in-form-library-copy.js`, generating fresh `fcform_*`/`fcsec_*`/`fcfield_*` IDs and preserving `sourceTemplateId`/`sourceTemplateVersionId`/`sourceTemplateVersionNumber` on the new form. A client-supplied `requestId` dedupes repeated clicks for 60 seconds.
4. **Versioning:** Templates track `currentVersionNumber` and full version history; publishing a new version never touches existing organization copies. My Forms shows a "Newer template version available" badge by comparing the org copy's `sourceTemplateVersionNumber` against the template's live `currentVersionNumber`.
5. **Retirement:** Retired templates (`status: "retired"`) remain fetchable as historical references and keep existing organization copies working, but cannot be selected for a new copy (`409 template_retired`).
6. **Structured import:** `POST /api/forms-center/library/admin/*` (system-admin only) validates before saving, rejects duplicate template/field IDs and unsupported field types, and requires a strictly higher version number **and** a change summary to update an existing template — never a silent overwrite.
7. **Role access:** Director/Owner always full access. Lead Teacher / Assistant need a director-granted override recorded in `store.builtInFormLibrary.staffLibraryPermissions` (assistant is view-only even with an override — never copy access). System-admin routes are rejected whenever the testing-only `x-llh-role-preview-membership-id` header is present, even for a valid admin bearer.
8. **UI:** `forms-center-ui.js` — new **Built-In Library** tab inside the renamed Forms Center nav (Forms Home / Built-In Library / My Forms / Program Templates / Archived Forms / Create Form). Featured/most-used/recently-added/favorites rows, category chips, search/filter/sort toolbar, read-only preview, and a "Use This Template" confirmation modal.
9. **Out of scope (Phase 5):** Sending forms, collecting responses, real signatures, Child Profile attachment, AI-assisted import, state-specific compliance claims.

---

## How Assignments, Responses, and Signatures work (Phase 6)

1. **Admin side (gated):** `server/form-responses-api.js` under `/api/forms-center/assignments/*` and `/api/forms-center/responses/*` — same `formsCenter` flag + admin Bearer + role-preview scoping as every other Forms Center route.
2. **Recipient side (ungated, token-only):** `server/form-recipient-api.js` under `/api/form-recipient/*` — never behind the admin gate (recipients aren't admins). It has its own independent production-host lock and requires a valid, unexpired, unrevoked token via the `x-llh-form-recipient-token` header (never a query string).
3. **Testing links:** an admin issues a link from a response's detail panel (`POST .../testing-link/issue`), which returns a raw token **exactly once** — only its SHA-256 hash is stored (`assignment.testingLinkTokenHash`). "Regenerate" reissues a new hash; "Revoke" flips `testingLinkRevoked`. The recipient URL is `form-recipient.html#a=<assignmentId>&t=<rawToken>` — the token lives in the URL **fragment**, which browsers never send to the server or record in access logs.
4. **Bulk separation:** assigning to multiple recipients always creates one assignment + one response **per recipient**; one recipient's token can never resolve another recipient's response (`link_not_issued`).
5. **Recipient experience:** `form-recipient.html` + `form-recipient-ui.js` — mobile-first sections, autosave, review-before-submit, typed + optional drawn signature, submit, printable confirmation. Standalone page, no admin session, no shared CSS with the main app shell.
6. **Signatures:** captured via `POST /api/form-recipient/:id/signature` (requires typed name + consent checkbox); a **provider countersignature** is the one exception allowed to be added **after** submission (`isProviderCountersignAfterSubmit` in `form-recipient-api.js`). Reopening or returning a response for correction always invalidates its existing signatures.
7. **Review workflow:** `server/form-responses-api.js` exposes mark-under-review / approve / return-for-correction / reopen / void / decline / mark-expired / archive / restore, each with its own status-transition guard, plus internal notes and bulk archive/mark-for-review.
8. **Filing:** `/api/forms-center/{children,staff,classrooms,program}/.../forms` return the same authoritative response records filtered by permanent foundation ID — never duplicated into a separate record. The Teacher Center child profile's new **Forms & Documents** section reads the children endpoint live.
9. **Medication Administration Log:** `POST .../medication-log` adds a dose entry; `POST .../medication-log/:entryId/correct` creates a new corrected entry and marks the original `supersededByEntryId` — the original is never deleted or overwritten.
10. **Out of scope (Phase 6):** Full Family Hub product UI (Phase 9), real outbound email/SMS delivery, AI-assisted anything, automatic version-upgrade jobs for unstarted assignments, and file/attachment upload storage. (Phase 8 later added family/guardian foundation + fake accounts; Family Hub product remains OFF.)
11. **Design addition — locked approved record + PDF-style snapshot:** approving a response (`server/form-responses-api.js` → `handleApprove`) automatically calls `scripts/form-document-snapshot.js` to freeze a permanent, immutable document snapshot (`frdoc_*`, stored in `formResponses.documentSnapshots`, linked via `response.documentSnapshotId`). `GET /api/forms-center/responses/:id/document` (admin) and `GET /api/form-recipient/:id/document` (recipient) always return that frozen snapshot once it exists, or a live read-only view before approval. `form-document-view.js` is a single shared, dependency-free HTML renderer used identically by the recipient page, the admin Responses Dashboard's embedded "View Document" panel, and the standalone `form-document.html` print/download page (opened in a new tab; reuses the admin's existing `localStorage` session, no token in the URL). "Print" and "Download PDF" both trigger the browser's native print dialog — consistent with how every other "PDF" feature in this codebase already works (there is no server-side PDF binary generator anywhere in this app).

---

## Tests and commands

### Syntax check

```bash
npm run check
```

### Phase 1–12 automated suite (run all before handing off or starting Phase 13)

```bash
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
npm run test:staff-experience-phase16
npm run test:billing-simulator-phase17
npm run test:platform-nav
npm run test:account-access
```

### Optional screenshot captures (Playwright Chromium may be required)

```bash
node scripts/capture-director-center-phase2-screens.js
node scripts/capture-director-center-phase3-screens.js
node scripts/capture-forms-center-phase4-screens.js
node scripts/capture-forms-center-phase5-screens.js
node scripts/capture-forms-center-phase6-screens.js
node scripts/capture-forms-center-phase6-documents-screens.js
node scripts/capture-forms-center-phase7-screens.js
node scripts/capture-family-foundation-phase8-screens.js
node scripts/capture-family-hub-phase9-screens.js
node scripts/capture-family-updates-phase10-screens.js
node scripts/capture-family-messaging-phase11-screens.js
node scripts/capture-enrollment-phase12-screens.js
node scripts/capture-today-hub-phase15-screens.js
node scripts/capture-staff-experience-phase16-screens.js
node scripts/capture-billing-simulator-phase17-screens.js
```

### Handoff verification results (2026-07-22, Phase 17)

| Command | Result |
|---------|--------|
| `npm run check` | PASS |
| `npm run test:director-family-foundation` | PASS |
| `npm run test:director-center-phase2` | PASS |
| `npm run test:director-center-phase3` | PASS |
| `npm run test:forms-center-phase4` | PASS |
| `npm run test:forms-center-phase5` | PASS (43/43) |
| `npm run test:forms-center-phase6` | PASS (38/38) |
| `npm run test:forms-center-phase6-documents` | PASS (15/15) |
| `npm run test:forms-center-phase7` | PASS |
| `npm run test:family-foundation-phase8` | PASS (36/36) |
| `npm run test:family-hub-phase9` | PASS (21/21) |
| `npm run test:family-updates-phase10` | PASS (14/14) |
| `npm run test:family-messaging-phase11` | PASS (13/13) |
| `npm run test:family-enrollment-phase12` | PASS (19/19) |
| `npm run test:records-center-phase13` | PASS (27/27) |
| `npm run test:licensing-center-phase14` | PASS (19/19) |
| `npm run test:phase12-14-remediation` | PASS (24/24) |
| `npm run test:today-hub-phase15` | PASS (17/17) |
| `npm run test:staff-experience-phase16` | PASS (23/23) |
| `npm run test:billing-simulator-phase17` | PASS (21/21) |
| `npm run test:platform-nav` | PASS |
| `npm run test:account-access` | PASS |

Full Phase 1–17 regression: **PASS**. See `docs/PHASE_17_PRICING_FAMILY_BILLING_SIMULATOR_COMPLETION_REPORT.md`.

---

## Known bugs / UX pitfalls

1. **Homepage Sign Up ≠ Admin unlock** — Director/Forms preview needs `/admin` unlock + Bearer, not regular member signup.
2. **Mobile auth checkboxes** — Fixed in `cecbb24`; do not reintroduce giant checkbox CSS that scrambles signup/admin layouts.
3. **Admin sidebar without member login** — Fixed via `admin-unlocked` shell + Director Center CTA (`744d48b` / `80949ff`); preserve this when editing nav CSS.
4. **Testing deploy lag** — Agents cannot auto-deploy Render; owner must Manual Deploy testing after pushes; confirm cache busters match tip.
5. **PR title may still say an earlier phase** — Body/docs track Phases 1–12; update title when convenient.
6. **ManagePullRequest `update_pr` may fail** on repo rename casing (`little-learner-hub` vs `LITTLE-LEARNER-HUB`); pushes still update the PR head; use GitHub UI or API if body update tooling fails.
7. **Hard-coded cache-buster regexes in tests** — `test-platform-nav.js` and `test-director-center-phase3.js` previously pinned an exact `?v=20260721-phase4` string for `forms-center-ui.js`/`styles.css`; relaxed to `\?v=` so future version bumps don't break unrelated test files. Prefer version-agnostic assertions for shared shell files going forward.
8. **Standalone re-render modules need a bind-guard** — `forms-responses-ui.js` and `form-recipient-ui.js` re-render their whole container on every state change; `bind()` in both files guards against re-attaching duplicate event listeners with a `dataset.*Bound` flag. If you add another standalone re-rendering module, copy this guard — omitting it silently double/triple-fires click handlers (this caused a real bug during Phase 6 development: a checkbox toggle appeared to do nothing because two listeners canceled each other out).
9. **Provider countersignature timing** — a provider signature is the one signer role allowed to be added **after** submission (see `isProviderCountersignAfterSubmit` in `server/form-recipient-api.js`); every other role must sign before submitting.

---

## Incomplete items

- Phase 14+ licensing (not started at Phase 13 tip)
- Phase 18 complete Testing and Preview Lab
- Real approved AI provider connection (Phase 7 provider interface is ready; live calls stay off)
- PDF / Word / image / scanned-form extraction (Phase 7 import foundation prepared only)
- Real outbound email/SMS/push delivery (preference structure + `sentExternally:false` audit only in Phase 11; enrollment events also in-app only in Phase 12)
- Stripe enrollment checkout / deposits (explicitly disabled in Phase 12)
- Public production inquiry intake
- Automatic version-upgrade job for unstarted assignments when a newer form version is published (the `versionPolicy` field and comparison logic exist; the bulk-upgrade action itself does not yet)
- Production file/attachment upload storage (fake messaging attachments only in Phase 11; no permanent public URLs)
- A dedicated one-click "Countersign" button in the admin response detail panel (today a provider signs via the same recipient-facing signature endpoint)
- Live pricing / entitlement go-live
- Production migration and production release
- Any real form delivery, e-sign, or response analytics
- Automated Render deploy from this agent environment
- A Forms Center in-app role-preview switcher (Teacher Center has one; Forms Center enforcement is server-side and tested but has no UI toggle yet)
- Admin UI to grant/revoke teacher/assistant Built-In Library overrides interactively (currently server-side only, seeded via fixtures)
- Completing the reviewed household/contact merge process beyond queue-only merge reviews
- Configurable state/program retention enforcement beyond the Phase 11 placeholder policy

---

## Phase 18 recommendation

**Do not begin Phase 18** until Phase 17 is verified on the branch tip (`docs/PHASE_17_PRICING_FAMILY_BILLING_SIMULATOR_COMPLETION_REPORT.md`).

Until then:

- Keep Phases 1–17 green on this branch
- Keep Family Hub production-locked
- Keep outbound email/SMS/push disabled
- Keep Stripe checkout disabled (`DISABLE_STRIPE_CHECKOUT=true`); Phase 17 simulators only
- Do not create live Stripe products/prices or process real family payments

See phase completion reports and `docs/OVERNIGHT_DECISIONS_AND_BLOCKERS.md`.

---

## Exact next steps for another developer

1. `git fetch origin && git checkout cursor/director-family-foundation-bc66 && git pull`
2. Read this file and PR #324
3. Run the full Phase 1–17 test suite; confirm all PASS
4. On testing only: confirm `SITE_URL`, `DATABASE_PROVIDER=local-json`, Stripe/email/AI off, preview flags on, `DISABLE_STRIPE_CHECKOUT=true`
5. Smoke Director Billing tab → Family Hub Billing → plan downgrade preview
6. Continue only with owner-written Phase 18 requirements
7. Commit/push only to `cursor/director-family-foundation-bc66`; keep PR #324 draft
8. Never merge/deploy production without written approval

---

## Features that must remain OFF

Until explicitly approved otherwise:

- **Family Hub on production** — always locked; testing preview only via `ALLOW_FAMILY_HUB_TESTING_PREVIEW`
- **Production media storage / public media URLs**
- **Live pricing changes** / live entitlement charges for expansion add-ons
- **Live AI calls** from the AI Form Builder (mock fixtures only in testing; provider interface ready for a later approved connection)
- **Live outbound** email/SMS/push for family messaging or enrollment (preference structure / in-app only)
- **Stripe enrollment checkout** / real deposits or tuition charges (Phase 12 simulation only; `stripe_disabled`)
- **Public production inquiry intake**
- **Phase 13** and later expansion phases that are not yet approved
- **Phase 18** complete Testing and Preview Lab
- Real outbound email/SMS delivery of assignment links/invitations/reminders/updates
- **Production migration** and **production release** of Director/Forms/Family expansion
- Any Stripe checkout for classroom/forms add-ons (simulation only)
- Live family tuition payment processing (Phase 17 simulator only)
- Outbound email / Stripe / live AI from Forms Center, the Built-In Library, Assignments/Responses, the AI Form Builder, Family foundation, Family Updates, Messaging, or Enrollment

---

## Production protections

- Expansion feature-flag policy locks production hosts even if stored flags are ON
- Preview env opt-ins (`ALLOW_*_ADMIN_PREVIEW`) required for Director/Forms APIs (the Built-In Library and Assignments/Responses admin API share the Forms Center gate)
- Verified admin Bearer required; query-string admin tokens rejected
- Cross-organization denial (`organization_mismatch`); per-organization isolation of library favorites/recents/copies and of assignment/response records
- Curriculum Only entitlement friendly denials (no billing side effects) — blocks Forms Center, the Built-In Library, Assignments/Responses, and Enrollment alike
- Forms store, built-in library store, and form-responses store have no email/SMS/Stripe/AI capability
- Enrollment store has no Stripe checkout and no public production inquiry path
- System-template administration (`/api/forms-center/library/admin/*`) rejected whenever a role-preview header is active, even for a valid admin bearer
- Recipient testing links (`/api/form-recipient/*`) have their **own independent** production-host lock, in addition to never being reachable through the admin gate, plus hashed/expiring/revocable tokens accepted only via a header (never a query string)
- Branch not merged to `main`; production not deployed from this workstream
- Testing uses isolated `local-json` store, not production Postgres

---

## Migration status

| Item | Status |
|------|--------|
| Additive foundation models in code | Present (flags off by default) |
| Production DB migration applied | **No** |
| Production data changed | **No** |
| Production feature flags ON | **No** (locked) |
| Testing fake seed / dry-run migration | Preview-only; dry-run unapplied |

---

## Confirmation that production data was not changed

This project did **not**:

- Migrate or write production Postgres data
- Enable Director Center / Forms Center / Built-In Library / Assignments-Responses / Family Hub on production
- Change live Stripe, email, or AI production configuration
- Merge `cursor/director-family-foundation-bc66` into `main`
- Deploy this branch to the production Render service as part of Phase 1–12 delivery

All Phase 1–12 work is on the draft PR branch and testing/local preview paths only.

---

## Related phase docs

- `docs/PHASE_1_DIRECTOR_FAMILY_FOUNDATION.md`
- `docs/PHASE_1_ENTITLEMENT_PRICING_FOUNDATION.md`
- `docs/PHASE_2_DIRECTOR_CENTER_ADMIN_PREVIEW.md`
- `docs/PHASE_2_DIRECTOR_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_2_TESTING_ENV_SAFETY.md`
- `docs/PHASE_3_TEACHER_EXPERIENCE_COMPLETION_REPORT.md`
- `docs/PHASE_4_FORMS_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_5_BUILT_IN_FORM_LIBRARY_COMPLETION_REPORT.md`
- `docs/PHASE_6_FORM_RESPONSES_SIGNATURES_COMPLETION_REPORT.md`
- `docs/PHASE_7_AI_FORM_BUILDER_COMPLETION_REPORT.md`
- `docs/PHASE_8_FAMILY_GUARDIAN_FAKE_ACCOUNT_FOUNDATION_COMPLETION_REPORT.md`
- `docs/PHASE_9_FAMILY_HUB_BASE_COMPLETION_REPORT.md`
- `docs/PHASE_10_FAMILY_UPDATES_MEDIA_COMPLETION_REPORT.md`
- `docs/PHASE_11_MESSAGING_NOTIFICATIONS_COMPLETION_REPORT.md`
- `docs/PHASE_12_ENROLLMENT_COMPLETION_REPORT.md`
- `docs/OVERNIGHT_DECISIONS_AND_BLOCKERS.md`
- `docs/PR_324_DESCRIPTION.md`

---

## Transfer checklist (for the next owner)

- [ ] Branch tip matches GitHub `origin/cursor/director-family-foundation-bc66` (after push: `git rev-parse`)
- [ ] Working tree clean after pull
- [ ] All Phase 1–12 tests PASS (incl. `test:family-enrollment-phase12` 19 PASS)
- [ ] Testing safety reconfirmed
- [ ] Production Family Hub still locked
- [ ] Stripe enrollment still disabled
- [ ] Live AI still disabled / mock-only in testing
- [ ] Phase 13 requirements received before coding
- [ ] No merge / no production deploy without approval
