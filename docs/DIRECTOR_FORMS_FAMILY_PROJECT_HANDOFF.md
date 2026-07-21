# Director / Forms / Family Project — Developer Handoff

**Status date:** 2026-07-21  
**Transferability:** Ready for another developer or Cursor account to continue from GitHub.

---

## Start Here

1. Fetch the repository: `git fetch origin`
2. Check out the development branch: `git checkout cursor/director-family-foundation-bc66` then `git pull origin cursor/director-family-foundation-bc66`
3. Read this handoff document end to end
4. Review draft PR [#324](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324)
5. Run all Phase 1–4 automated tests (commands below)
6. Confirm testing-environment safety rules before any preview enablement
7. Continue only from the next **approved** phase (Phase 5+ are not started)
8. **Never merge into `main` and never deploy to production without explicit owner approval**

---

## Project purpose

Build a private, testing-only foundation for:

- **Director Center** — organization, classrooms, staff, children, program profile, roles
- **Teacher Classroom Experience** — classroom week, events, daily logs, observations, goals, timeline
- **Forms Center** — Manual Custom Form Builder (draft / publish / archive; no response collection yet)
- Future **Family Hub** / parent accounts (explicitly not started; must stay OFF)

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
| Tip at handoff | `10383ca2e6dd8a3ef482613b8055131fda451b68` |
| Tip message | Fix handoff tip SHA and commit history table |

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
| Title (may lag body) | Phase 2… (body tracks Phases 1–4; update title if desired) |

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

```
10383ca2e6dd8a3ef482613b8055131fda451b68
Fix handoff tip SHA and commit history table
```

Confirm after pull with `git rev-parse HEAD` / `git log -1 --oneline`.  
Paste-ready PR body (GitHub description may be stale): `docs/PR_324_DESCRIPTION.md`.

Phase tip history (newest first):

| Commit | Summary |
|--------|---------|
| `da3dba9` | Paste-ready PR #324 description |
| `10383ca` | Fix handoff tip SHA and history table |
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

### NOT STARTED

- **Phase 5** built-in form library
- **Phase 6** form sending, responses, signatures, and Child Profile storage
- **Phase 7** AI Form Builder
- Parent accounts
- Family Hub
- Live pricing changes
- Production migration
- Production release

---

## Current feature flags

Policy lives in `scripts/expansion-feature-flags.js`.

| Flag | Intended stored value on testing (after enable) | Runtime behavior |
|------|--------------------------------------------------|------------------|
| `directorCenter` | `true` (testing only) | Requires non-prod host + `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW` + verified admin Bearer |
| `formsCenter` | `true` (testing only, Phase 4) | Requires non-prod host + `ALLOW_FORMS_CENTER_ADMIN_PREVIEW` + verified admin Bearer |
| `familyHub` | **`false` always** | Forced OFF in policy; must remain OFF until approved |
| Defaults in code | All expansion flags **OFF** | Production hosts stay locked even if store says ON |

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
5. Keep **Family Hub forced OFF**.
6. Do **not** merge to `main`.
7. Do **not** deploy to production.
8. Do **not** change production data, production env, or production Stripe/email/AI settings.
9. Query-string admin tokens are rejected for expansion APIs; use verified Admin Bearer.
10. Role preview header (`x-llh-role-preview-membership-id`) is testing-only and must not change stored admin membership role.
11. Forms Center must not collect responses, send forms, store signatures, or call AI in Phase 4.
12. Curriculum Only entitlement simulation must continue to block Director/Forms add-ons without charging.

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

### Shell wiring (shared)

Touched across phases (non-exhaustive): `server/index.js`, `app.js`, `index.html`, `styles.css`, `package.json` (`test:*` scripts).

---

## How Director Center works

1. **Gate:** Non-production host + `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW` + stored `directorCenter=true` + verified admin session (Bearer). Family Hub and (before Phase 4 enablement) Forms stay forced OFF in policy unless separately allowed.
2. **Entry:** Unlock Admin (`/admin`), then open Director Center from platform nav / Admin unlocked CTA. Member login is not required for admin preview sidebar once Admin is unlocked.
3. **API:** `server/director-center-api.js` — overview, classrooms CRUD/archive/restore, staff preview records + classroom assignment (no email), children assign/move with history, program profile, roles matrix, classroom limits, add-on/upgrade **simulation only** (no Stripe checkout).
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

## Tests and commands

### Syntax check

```bash
npm run check
```

### Phase 1–4 automated suite (run all before handing off or starting Phase 5)

```bash
npm run test:director-family-foundation
npm run test:director-center-phase2
npm run test:director-center-phase3
npm run test:forms-center-phase4
npm run test:platform-nav
npm run test:account-access
```

### Optional screenshot captures (Playwright Chromium may be required)

```bash
node scripts/capture-director-center-phase2-screens.js
node scripts/capture-director-center-phase3-screens.js
node scripts/capture-forms-center-phase4-screens.js
```

### Handoff verification results (2026-07-21)

| Command | Result |
|---------|--------|
| `npm run check` | PASS |
| `npm run test:director-family-foundation` | PASS |
| `npm run test:director-center-phase2` | PASS |
| `npm run test:director-center-phase3` | PASS |
| `npm run test:forms-center-phase4` | PASS |
| `npm run test:platform-nav` | PASS |
| `npm run test:account-access` | PASS |

Browser smoke tests (homepage, curriculum UX, etc.) are separate; Phase 1–4 gates are the scripts above.

---

## Known bugs / UX pitfalls

1. **Homepage Sign Up ≠ Admin unlock** — Director/Forms preview needs `/admin` unlock + Bearer, not regular member signup.
2. **Mobile auth checkboxes** — Fixed in `cecbb24`; do not reintroduce giant checkbox CSS that scrambles signup/admin layouts.
3. **Admin sidebar without member login** — Fixed via `admin-unlocked` shell + Director Center CTA (`744d48b` / `80949ff`); preserve this when editing nav CSS.
4. **Testing deploy lag** — Agents cannot auto-deploy Render; owner must Manual Deploy testing after pushes; confirm cache busters match tip.
5. **PR title may still say “Phase 2”** — Body/docs track Phases 1–4; update title when convenient.
6. **ManagePullRequest `update_pr` may fail** on repo rename casing (`little-learner-hub` vs `LITTLE-LEARNER-HUB`); pushes still update the PR head; use GitHub UI or API if body update tooling fails.

---

## Incomplete items

- Phase 5–7 (built-in library, send/responses/signatures/Child Profile storage, AI Form Builder)
- Parent accounts and Family Hub product surfaces
- Live pricing / entitlement go-live
- Production migration and production release
- Any real form delivery, e-sign, or response analytics
- Automated Render deploy from this agent environment

---

## Phase 5 recommendation

When approved, start **Phase 5: built-in form library** as a **read-only / seedable catalog** of provider-ready templates that:

- Reuse Phase 4 `forms-center-data-model` IDs and publish immutability rules
- Stay behind the same Forms Center preview gates
- Still **do not** send forms, collect responses, or enable Family Hub
- Prefer duplicating library templates into editable drafts (already have `sourceFormId` pattern)
- Add focused tests parallel to `test:forms-center-phase4`
- Keep Family Hub, live pricing, and production migration explicitly out of scope

Do not begin Phase 6 (sending/responses/signatures) until Phase 5 is approved and complete.

---

## Exact next steps for another developer

1. `git fetch origin && git checkout cursor/director-family-foundation-bc66 && git pull`
2. Read this file and PR #324
3. Run the full Phase 1–4 test suite; confirm all PASS
4. On testing only: confirm `SITE_URL`, `DATABASE_PROVIDER=local-json`, Stripe/email/AI off, `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`, `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`, stored `directorCenter=true`, `formsCenter=true`, `familyHub=false`
5. Smoke Director Center → Teacher Center → Forms Center Builder/Preview with fake data
6. Wait for owner-written Phase 5 requirements before coding
7. Commit/push only to `cursor/director-family-foundation-bc66`; keep PR #324 draft
8. Never merge/deploy production without written approval

---

## Features that must remain OFF

Until explicitly approved otherwise:

- **Family Hub** (`familyHub`) — forced OFF
- **Parent accounts** / parent login product
- **Live pricing changes** / live entitlement charges for expansion add-ons
- **Phase 6** form send / responses / real signatures / Child Profile form storage
- **Phase 7** AI Form Builder
- **Production migration** and **production release** of Director/Forms expansion
- Any Stripe checkout for classroom/forms add-ons (simulation only)
- Outbound email / AI calls from Forms Center

---

## Production protections

- Expansion feature-flag policy locks production hosts even if stored flags are ON
- Preview env opt-ins (`ALLOW_*_ADMIN_PREVIEW`) required for Director/Forms APIs
- Verified admin Bearer required; query-string admin tokens rejected
- Cross-organization denial (`organization_mismatch`)
- Curriculum Only entitlement friendly denials (no billing side effects)
- Forms store has no response/submission collections in Phase 4
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
- Enable Director Center / Forms Center / Family Hub on production
- Change live Stripe, email, or AI production configuration
- Merge `cursor/director-family-foundation-bc66` into `main`
- Deploy this branch to the production Render service as part of Phase 1–4 delivery

All Phase 1–4 work is on the draft PR branch and testing/local preview paths only.

---

## Related phase docs

- `docs/PHASE_1_DIRECTOR_FAMILY_FOUNDATION.md`
- `docs/PHASE_1_ENTITLEMENT_PRICING_FOUNDATION.md`
- `docs/PHASE_2_DIRECTOR_CENTER_ADMIN_PREVIEW.md`
- `docs/PHASE_2_DIRECTOR_CENTER_COMPLETION_REPORT.md`
- `docs/PHASE_2_TESTING_ENV_SAFETY.md`
- `docs/PHASE_3_TEACHER_EXPERIENCE_COMPLETION_REPORT.md`
- `docs/PHASE_4_FORMS_CENTER_COMPLETION_REPORT.md`

---

## Transfer checklist (for the next owner)

- [ ] Branch tip matches GitHub `origin/cursor/director-family-foundation-bc66`
- [ ] Working tree clean after pull
- [ ] All Phase 1–4 tests PASS
- [ ] Testing safety reconfirmed
- [ ] Family Hub still OFF
- [ ] Phase 5 requirements received before coding
- [ ] No merge / no production deploy without approval
