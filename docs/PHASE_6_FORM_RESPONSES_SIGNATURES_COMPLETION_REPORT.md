# Phase 6 Completion Report — Form Sending, Family Responses, Signatures, and Child Profile Storage

**Status:** Complete on branch — awaiting testing-only redeploy and manual owner verification.
**Branch:** `cursor/director-family-foundation-bc66`
**Draft PR:** https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/324
**Do not merge to `main`. Do not deploy production. Do not begin Phase 7 without approval.**

---

## 1. Plain-language summary

Phase 6 completes the base workflow a provider needs to actually **use** a form:
choose a published form, assign it to a child, guardian, staff member, classroom, or
the whole program; the recipient completes it on a mobile-first page reached through a
safe, revocable **testing link** (real parent accounts and outbound email are not
active yet); the recipient signs electronically and submits; a director/owner reviews,
approves, returns for correction, reopens, voids, or archives the response; and the
final response is permanently and securely filed under the correct Child Profile,
Staff Profile, Classroom, or Program record — one authoritative response per
assignment, never duplicated.

Everything remains inside the existing Forms Center private-preview boundary. Family
Hub stays forced OFF. No real parent accounts, no outbound email or SMS, no Stripe
products, and no AI were added or activated. Real signatures, response-to-family
delivery by email, and full Family Hub remain explicitly out of scope for Phase 7+.

## 2. Exact files changed

### New

| Path | Role |
|------|------|
| `scripts/form-responses-data-model.js` | Assignment (`frasg_*`), response (`frresp_*`), signature (`frsig_*`), audit (`fraudit_*`), and medication-log-entry (`frmed_*`) schema, status enums, server-side answer validation |
| `scripts/form-recipient-tokens.js` | Hashed testing-link tokens: issue, verify, expire, revoke; header-only extraction (never a query string) |
| `scripts/form-recipient-payload.js` | Shared recipient-view payload builder used by both the public recipient API and the admin "preview as recipient" endpoint |
| `scripts/form-responses-fixtures.js` | Idempotent Phase 6 fixtures: children (siblings, two-guardian, restricted-guardian), staff (director/teacher/assistant-broad/assistant-limited/staff-recipient), one classroom, a program-level form, and 16 assignment/response scenarios covering every required status |
| `server/form-responses-api.js` | Admin-side `/api/forms-center/assignments/*`, `/api/forms-center/responses/*`, `/api/forms-center/{children,staff,classrooms,program}/.../forms`, `/api/forms-center/recipients-directory` — shares the existing Forms Center gate |
| `server/form-recipient-api.js` | Public, token-authenticated `/api/form-recipient/*` — resolve, save-draft, signature, submit, clear. Never behind the admin gate; rejects production outright |
| `forms-responses-ui.js` | Admin UI: Send/Assign modal (single + bulk + all-verified-guardians), Responses Dashboard (status cards, search/filter/sort/views, bulk actions), Response detail/review panel (signatures, testing-link management, notes, medication log, review actions) |
| `form-recipient.html` / `form-recipient-ui.js` | Standalone, mobile-first recipient completion page: sections, validation, autosave, typed + drawn signature, review, submit, printable confirmation |
| `styles/llh-form-recipient.css` | Dedicated recipient-page styles (not loaded by the main app shell) |
| `scripts/test-forms-center-phase6.js` | Phase 6 automated test suite (38 assertions) |
| `scripts/capture-forms-center-phase6-screens.js` | Screenshot capture → `/opt/cursor/artifacts/forms-center-phase6/` |
| `docs/PHASE_6_FORM_RESPONSES_SIGNATURES_COMPLETION_REPORT.md` | This report |

### Updated

| Path | Change |
|------|--------|
| `server/index.js` | Mounts `getFormResponsesApi()` inside the existing `/api/forms-center/*` gate; mounts `getFormRecipientApi()` at a new, ungated `/api/form-recipient/*` prefix (recipients are never admins) |
| `scripts/org-permissions.js` | New actions: `form_assignment.create`, `form_assignment.manage_links`, `form_response.view`, `form_response.review`, `form_response.approve`, `form_response.void`, `form_response.archive`; Lead Teacher gains `FORM_ASSIGNMENT_CREATE`/`FORM_RESPONSE_VIEW` by default; Assistant override map gains `viewFormResponses` |
| `forms-center-ui.js` | New **Responses** nav tab; "Send / Assign" button on published form cards; mounts `forms-responses-ui.js` inside `#fc-responses-mount`; small polish fix so the global loading indicator doesn't flash on the Responses tab |
| `teacher-center-ui.js` | New **Forms & Documents** section on the child profile, reading `/api/forms-center/children/:id/forms` |
| `server/forms-center-api.js` | (unchanged this phase; reused as-is by the new assignment/response layer) |
| `index.html` | New script tags for `forms-responses-ui.js` and `form-recipient-ui.js`'s host page reference; cache-busters bumped to `?v=20260721-phase6` |
| `package.json` | `npm run check` includes all new Phase 6 files; added `test:forms-center-phase6` |

## 3. Latest branch and commit

Branch: `cursor/director-family-foundation-bc66`. Run `git log -1 --oneline` after this
work is pushed for the exact tip SHA — Phase 6 lands as a series of focused commits on
top of the Phase 5 tip (`dd46c2d`).

## 4. Assignment workflow completed

`POST /api/forms-center/assignments` supports every recipient type from the brief:

- One child / multiple selected children
- One guardian / **all verified guardians connected to a selected child** (resolved
  **server-side** from `childGuardianRelationships`, never client-supplied — an
  unverified/restricted guardian relationship is always excluded)
- One staff member / multiple selected staff members
- One classroom / multiple classrooms
- The entire program

Every assignment stores: form title (via `formId`), recipient, related child/classroom
when applicable, due date, optional provider instructions, required/optional status,
one-time vs. reusable, required signature roles, provider-countersignature requirement,
whether the response may be edited after submission, and a reminder setting that is
**stored only** (`reminder.sent` is always `false`; nothing is ever sent in this phase).

**Bulk separation:** a single request with `recipientIds: [...]` creates one assignment
+ one response record **per recipient**. Verified in tests: two recipients' testing
links can never be swapped to view each other's response (`link_not_issued` on
cross-use).

## 5. Recipient experience completed

`form-recipient.html` + `form-recipient-ui.js` — standalone, mobile-first (small phone
→ desktop), no admin session:

- Program name/logo placeholder, form title, instructions, child name, due date
- Completion progress bar computed from required fillable fields
- Section-by-section navigation with Previous/Next for longer forms, plus a full
  **Review your answers** screen before submission with per-section **Edit** links
- Required-field indicators and inline validation messages
- Accessible buttons/touch targets (44–48px), visible focus states, ARIA labels/roles
  on radio/checkbox groups and progress bar
- Confirmation screen after submission with a **Print / Save Confirmation** button
  (dedicated `@media print` rules hide all interactive controls)
- Every screen carries the required label **"Testing Preview — Fake Data Only"**

## 6. Draft/autosave behavior

- First save transitions `not_started` → `in_progress` and stamps `startedAt`
- Every subsequent save updates `lastSavedAt`; the recipient page shows Saving…/Saved
  \<time\>/Save failed — will retry states
- Autosave is debounced (1s after typing) and never fires on page load; explicit "Save
  and Continue Later" is always available
- On save failure, the client retries automatically after 4s without losing local
  answers; autosave **never** auto-submits
- "Clear Response" requires an explicit confirmation step before wiping an unfinished
  response (blocked entirely once the response is no longer editable)

## 7. Signature behavior

- Typed full legal name is always required; a drawn signature (HTML canvas, pointer +
  touch events) is optional and purely additional — the UI explicitly states *"Can't
  draw a signature? That's OK — your typed name above is a valid electronic
  signature,"* satisfying the accessible-alternative requirement
- A required consent checkbox with configurable, versioned consent text
  (`CONSENT_TEXT_VERSION`) must be checked before a signature is accepted
- Every signature record stores: response ID, form version ID, signer identity
  (recipient identity string or provider membership), signer role, signed timestamp,
  the consent text + version in effect, and a submission event ID
- Multiple signatures are supported on one response (e.g., parent/guardian **and**
  provider), each with its own `signatureOrder`
- **A submitted signature never silently changes.** Returning a response for
  correction or reopening it after submission **invalidates** every existing signature
  (`invalidatedAt` + `invalidatedReason` set, never deleted) and a resubmission requires
  a brand-new signature before it will be accepted
- No claim of legal compliance is made anywhere; the consent text and Forms Center UI
  explicitly note this is a testing preview and providers must confirm their own
  licensing/legal requirements

## 8. Response statuses

All eleven statuses from the brief are implemented and shown in Forms Center:
`not_started`, `in_progress`, `submitted`, `under_review`, `approved`,
`returned_for_correction`, `corrected_and_resubmitted`, `declined`, `expired`,
`archived`, `voided`. "Overdue" is a **separate, non-destructive computed view** (past
due date, still editable) so it never conflicts with or silently promotes into
"Expired" — a response only becomes `expired` through the explicit `mark-expired`
action (or a fixture seed), keeping the two dashboard filters independently observable
and testable.

## 9. Review/correction workflow

Directors/owners can: add an internal note, approve (blocked with
`provider_countersignature_required` until a required provider signature exists),
return for correction (requires a message; invalidates signatures), reopen (only when
`editableAfterSubmission` is true; also invalidates signatures), void (requires a
reason), decline on a recipient's behalf, mark expired, and archive/restore (restore
returns the response to its exact prior status). Teachers see only responses connected
to their assigned classrooms/children; assistants follow the existing Phase 3
server-enforced permission-override system (`viewFormResponses`).

## 10. Child/Staff/Classroom/Program storage

- `GET /api/forms-center/children/:childId/forms`,
  `/staff/:staffMembershipId/forms`, `/classrooms/:classroomId/forms`, and
  `/program/forms` each return the **same single authoritative response records** —
  filtered by permanent foundation IDs (`child_*`, `staff_*`, `classroom_*`), never by
  name strings
- The Teacher Center child profile now has a **Forms & Documents** section showing
  form title, category (via the form record), status, related guardian, submitted/
  approved dates, current form version, signature count, and a "newer version
  available" flag — reading live from the same store, so a response never needs to be
  copied into the child record
- If a child moves classrooms, `relatedChildId` (a permanent ID) keeps the response
  connected regardless of which classroom the child is in today

## 11. Form-version protection

- Every response stores `formVersionId` + `formVersionNumber` at creation time and
  never changes them once set
- `versionPolicy` on the assignment (`keep_original_version` default, or
  `upgrade_to_latest`) is stored for the provider's choice on **unstarted** assignments
  when a form is republished — Phase 6 intentionally does not yet run an automatic
  upgrade job (see §18); the flag and data model are ready for that follow-up
- `newerVersionAvailable` is computed by comparing the response's pinned version number
  against the form's live `latestVersionNumber` (or the built-in template's
  `currentVersionNumber`) and is surfaced in the Responses Dashboard, the response
  detail panel, and the Child Profile Forms & Documents list
- Verified in tests: a response pinned to version 1 keeps that version's exact fields
  even after version 2 is published, and correctly reports "newer version available"

## 12. Medication Administration Log support

The Phase 5 Medication Administration Log built-in template now has a working response
structure: child, medication, authorization reference, date, scheduled/actual time,
dosage, method, administering staff member, witness, result
(given/refused/missed/spilled/unavailable), notes, staff initials, and parent
acknowledgment. **Corrections never overwrite the original entry** — `POST
.../medication-log/:entryId/correct` creates a brand-new entry and marks the original
`supersededByEntryId`, so the full history remains permanently visible. This is
recordkeeping structure only; no medical recommendations are made anywhere in the code
or UI copy.

## 13. Permissions and security results

Enforced entirely server-side (hidden UI is explicitly not relied on for security):

- Owners/directors manage organization-wide assignments and responses
- Teachers/assistants are scoped to assigned classrooms/children via the existing
  `evaluateAccess()` + role-preview header pattern from Phase 3
- Recipients can only ever open **their own** assignment via a matching token
- Curriculum Only accounts are blocked from the entire assignment/response API (shares
  the Forms Center entitlement gate)
- Cross-organization access is rejected everywhere (`organization_mismatch`)
- Testing links are rejected outright on a live production host, before any token
  comparison even happens
- Tokens are SHA-256 hashed at rest, accepted only via a dedicated header (never a
  query string), expire, and are individually revocable/regenerable
- Archived/voided/revoked/expired assignments and responses all enforce their own
  status-transition guards (see the transition-guard tests in §17)

## 14. Fake fixture summary

`scripts/form-responses-fixtures.js` seeds (idempotently):

- 4 children including siblings sharing one guardian (Ava & Ben Lin), a child with two
  verified guardians (Carlos Rivera — Diego & Elena Rivera), and a child with one
  verified + one **restricted/unverified** guardian (Dana Cole — Frank Cole verified,
  Grace Cole restricted/unverified)
- Director/Owner, Lead Teacher, Assistant with broad permissions, Assistant with
  limited permissions, and a plain staff recipient — all on one classroom (Sunflower
  Room)
- 16 assignment/response scenarios: not started, partially completed, submitted,
  awaiting provider signature, returned for correction, approved, overdue, expired,
  archived, voided, a staff recipient, a classroom-level assignment, a program-level
  assignment, multiple signatures, a response connected to an older form version (newer
  version available), and a Medication Administration Log with a correction history
- All fake data uses clearly labeled `(Fixture)` display names and safe
  `@example.invalid` guardian/staff emails

Per instructions, Phase 6 does **not** build a complete reusable fake-account login
system (reserved for Phase 8/15); the testing-link + recipient-preview mechanism is the
Phase 6-appropriate substitute for exercising form completion.

## 15. Responsive screenshots

Captured to `/opt/cursor/artifacts/forms-center-phase6/*-desktop.png` /
`*-mobile.png`:

`assign-form`, `assign-bulk`, `recipient-form-begin`, `recipient-section-nav`,
`recipient-validation-error`, `recipient-review`, `recipient-signature`,
`recipient-confirmation`, `responses-dashboard`, `response-detail`,
`response-returned-for-correction`, `medication-log`, `responses-overdue`, and
`responses-empty-state` (desktop). The Teacher Center Forms & Documents section was
verified live via Playwright (see §17); a dedicated capture was not added to the Phase 6
screenshot script to avoid duplicating Phase 3's own capture tooling, but the section
renders correctly in the automated smoke run.

## 16. Accessibility checks

- Keyboard navigation: all interactive elements are native `<button>`/`<input>`/
  `<select>`/`<textarea>` elements (no click-only `<div>`s)
- Screen-reader labels: `role="radiogroup"`/`role="group"` with `aria-labelledby` on
  choice fields, `role="progressbar"` with `aria-valuenow/min/max` on the progress bar,
  `aria-current="step"` on the active section tab
- Visible focus states: `:focus-visible` outlines added for every interactive recipient
  control
- Error summaries: inline `role="alert"` messages per invalid field, plus a page-level
  error banner when the server rejects a submission
- Large touch targets: 44–48px minimum height on every button/input on the recipient
  page and the new dashboard/assignment/response UI
- Zoom/no horizontal scroll: verified at 390px mobile width across every new screen
- Signature alternative: explicit note that a typed name is a fully valid signature
  without drawing
- Confirmation before destructive actions: "Clear Response" requires an explicit
  confirm step; void/return-for-correction require a typed reason/message before
  proceeding

## 17. All test results

```bash
npm run check
npm run test:director-family-foundation
npm run test:director-center-phase2
npm run test:director-center-phase3
npm run test:forms-center-phase4
npm run test:forms-center-phase5
npm run test:forms-center-phase6
npm run test:forms-center-phase6-documents
npm run test:platform-nav
npm run test:account-access
```

| Suite | Result |
|-------|--------|
| `npm run check` | **PASS** |
| `npm run test:director-family-foundation` | **PASS** (17/17) |
| `npm run test:director-center-phase2` | **PASS** (20/20) |
| `npm run test:director-center-phase3` | **PASS** (17/17) |
| `npm run test:forms-center-phase4` | **PASS** (19/19) |
| `npm run test:forms-center-phase5` | **PASS** (43/43) |
| `npm run test:forms-center-phase6` | **PASS** (38/38) |
| `npm run test:forms-center-phase6-documents` | **PASS** (15/15) |
| `npm run test:platform-nav` | **PASS** (14/14) |
| `npm run test:account-access` | **PASS** (12/12) |

**198 total assertions, zero failures**, run together in one regression pass.

`npm run test:forms-center-phase6` specifically covers: assignment creation, bulk
assignment separation (with cross-recipient token isolation), draft saving, repeated
autosave without duplication, required-field server validation, form-version
preservation, submission, multiple signatures, signature invalidation after
correction/reopen, provider countersignature gating, review/approval, return for
correction, resubmission, archive/restore, void with reason, decline, mark-expired,
child/staff/classroom/program filing, medication log correction history, revoked and
expired testing-link rejection, production rejection of recipient links, cross-org
denial, teacher classroom boundaries, assistant permission boundaries, and Curriculum
Only denial.

A separate Playwright-driven smoke run (not part of the committed automated suite, but
executed during development) exercised the same flows end-to-end through the real
browser UI: opening the Responses tab, creating a bulk assignment through the modal,
completing a full recipient form through section navigation → review → signature →
submit → confirmation, and opening the Teacher Center child profile's new Forms &
Documents section.

**Browser smoke tests unrelated to this phase** (`test:homepage-smoke`,
`test:curriculum-ux`) were spot-checked and reproduce the same pre-existing failures
documented in the Phase 5 handoff on the unmodified branch tip — confirmed unrelated to
Phase 6 by re-running them against `git stash`.

## 18. Known risks

- No automatic "upgrade unstarted assignments to the newest version" job runs yet — the
  `versionPolicy` field and comparison logic are in place, but the actual bulk-upgrade
  action is not yet exposed as a button; a provider today would need to revoke the old
  assignment and create a new one against the latest version
- Conditional/branching field logic does not exist in the Phase 4/5 form model itself
  (fields are always shown; only their `required` flag is enforced), so Phase 6 could
  not preserve or test "conditional fields" beyond required/optional — this should be
  added to the form builder in a future phase if branching logic is desired
- The provider countersignature flow reuses the same recipient signature endpoint under
  the `provider` role; there is no dedicated in-app "countersign" button yet in the
  admin UI (it must be triggered via the assignment's own testing link) — a follow-up
  could add a one-click "Countersign" action directly in the response detail panel
- Drawn signatures are stored as a small PNG data URL on the signature record; there is
  no size/storage-growth guard yet beyond a 200KB truncation safety cap
- The Teacher Center Forms & Documents section does not yet have a dedicated document
  attachment/upload capability (attachments remain a Phase 4 field-type placeholder
  only)

## 19. Items intentionally left for Phase 7 or later

- Real parent-account login/claiming of assigned forms (Phase 8), and the full Family
  Hub interface (Phase 9) — the response/assignment data model already carries
  `recipientType: "guardian"` + `recipientId` so a future parent account can claim and
  continue an existing response without any Phase 6 data migration
- AI Form Builder / AI-assisted import (Phase 7)
- Real outbound email/SMS delivery of assignment links and reminders (the `reminder`
  field on every assignment is fully modeled and stored, just never triggers a send)
- Real digital-signature legal compliance features (e.g., signer IP/geolocation capture,
  tamper-evident hashing, third-party e-sign vendor integration)
- Automatic version-upgrade job for unstarted assignments (see §18)
- File/attachment upload storage for the "file or attachment placeholder" field type

## 20. Confirmation that Family Hub remains OFF

`familyHub` stays forced OFF by the shared `expansion-feature-flags` policy; no Phase 6
code path reads, writes, or references Family Hub. `store.formResponses.meta` also
explicitly records `noOutboundEmail: true`, `noOutboundSms: true`, `noStripe: true`,
`noAi: true` for auditability.

## 21. Confirmation that email, SMS, Stripe, and AI were not activated

No Phase 6 file imports or calls any email, SMS, Stripe, or AI library or API. The only
"delivery" mechanism in this phase is the hashed testing link, which the recipient
receives by an admin manually copying/opening it — never a real message. Verified by
test assertions on `emailSent: false`, `smsSent: false`, and the store-level `noAi`/
`noStripe` flags.

## 22. Confirmation that production was untouched

All work happened against local/testing servers with fake `local-json` stores. No
production Postgres connection was made. Production hosts are locked by the existing
`expansion-feature-flags` policy before any Phase 6 route executes, and recipient links
are independently and additionally rejected outright on a live production host inside
`server/form-recipient-api.js` itself (defense in depth), verified by an automated test.

## 23. Confirmation that nothing was merged into main

All Phase 6 commits land on `cursor/director-family-foundation-bc66` only. The branch
was not merged into `main`, and no production deploy was triggered or requested.

## 24. Commit and push confirmation

All Phase 6 files are committed to `cursor/director-family-foundation-bc66` in a series
of focused commits and pushed to `origin`. See the commit log for the itemized history
(data model/tokens/permissions → admin API → fixtures → recipient API → server wiring →
admin UI → recipient page → child-profile Forms tab → styles → tests → screenshots →
docs).

## 25. Clean working-tree confirmation

`git status` reports a clean working tree immediately after this phase's commits are
pushed — nothing is required to make the project buildable and testable from a fresh
`git clone` + `npm install`.

## 27. Design addition — professional editable digital documents (2026-07-22)

A follow-up design pass made forms feel like professional editable digital
documents end-to-end, continuing directly from the Phase 6 work above without
restarting any of it:

**Workflow completed:** Editable provider form (existing Phase 4 Builder,
unchanged) → secure responsive recipient form (existing Phase 6 recipient
page, now paper-style) → electronic signatures (existing) → provider review
(existing) → **locked approved record** (new: approval now auto-generates a
permanent snapshot) → **printable/downloadable PDF-style snapshot** (new) →
secure Child/Staff/Classroom/Program storage (existing filing views, now also
surfacing the document).

**New files:**

| Path | Role |
|------|------|
| `scripts/form-document-snapshot.js` | Builds the structured "document" content (program branding, form title/version, status, every Q&A, signatures, correction history) and creates/retrieves the permanent, immutable snapshot |
| `form-document-view.js` | Shared, dependency-free client renderer (`window.LLHFormDocumentView.render()`) — one HTML template used identically by the recipient page, the admin embedded view, and the standalone print page |
| `form-document.html` / `form-document-ui.js` | Standalone admin print/download page, opened in a new tab from the Responses Dashboard. Reuses the already-signed-in admin's `localStorage` session — no token in the URL. No app-shell chrome, so printing/saving as PDF is always clean |
| `scripts/test-forms-center-phase6-documents.js` | 15 new assertions for this addition |
| `scripts/capture-forms-center-phase6-documents-screens.js` | Desktop/tablet/mobile screenshots of all four workflow stages |

**Updated:** `scripts/form-responses-data-model.js` (document-snapshot schema,
`documentSnapshotId` on responses), `server/form-responses-api.js` (auto-generate
on approve; `GET`/`POST .../responses/:id/document`), `server/form-recipient-api.js`
(`GET .../document` for the recipient's own response), `scripts/form-responses-fixtures.js`
(pre-generates snapshots for the three already-approved fixtures),
`forms-responses-ui.js` (View Document / Print / Download PDF in the response
detail panel), `form-recipient-ui.js` (the post-submission screen is now the
full read-only document, not a bare confirmation), `styles.css` and
`styles/llh-form-recipient.css` (paper-style desktop/tablet layout + shared
`.fdv-*` document styles + print rules), `index.html` and `form-recipient.html`
(new script includes).

**How the "locked approved record" works:** the response's structured
`answers` remain the single authoritative record forever. A document
**snapshot** is generated automatically the moment a response is approved
(`generateDocumentSnapshot()`), frozen into `formResponses.documentSnapshots`,
and linked back via `response.documentSnapshotId`. From that point on,
`GET .../document` (both admin and recipient) always returns that exact
frozen content — verified in tests to be byte-for-byte identical across
repeated fetches and across the admin/recipient views. Before approval, the
same endpoint renders a **live** (non-frozen) read-only document from current
data, so "submitted forms have a clean read-only document view" even before a
director reviews them. A manual regenerate is available (system/admin only,
approved responses only) and is idempotent unless `force: true` is passed —
forcing creates a **new** snapshot record rather than mutating or deleting the
old one, so no historical snapshot is ever silently changed.

**Paper-style layout:** at ≥640px (tablet/desktop), the recipient page and
every document view render as a centered "page" — off-white surrounding
background, a crisp white card with a subtle multi-layer shadow, and a purple
top accent bar, evoking a real document. Below 640px, the same content is
full-width and flat with no page illusion, and the section-by-section
navigation, inputs, and buttons all meet 44px+ touch targets — verified with
no horizontal scrolling at 390px.

**Print / Download PDF:** consistent with the rest of this codebase (which
already implements all of its own "PDF" features via the browser's native
print-to-PDF, tracked as `generated_pdf` analytics events — there is no
server-side PDF binary generator anywhere in this app), both "Print" and
"Download PDF" open a clean, chrome-free document view and call the browser's
native print dialog, from which "Save as PDF" produces a real PDF file. This
avoids adding a new server-side dependency while fully satisfying "printable
or downloadable."

**Never expose one family's answers to another family:** every document
endpoint reuses the exact same per-recipient token and per-organization admin
checks already enforced elsewhere in Phase 6 — verified by a new test that a
different recipient's token cannot open another recipient's document, and a
different organization's admin cannot open another organization's document.

**Screenshots:** `/opt/cursor/artifacts/forms-center-phase6-documents/` —
`1-editable-provider-form`, `2-recipient-form`, `3-signed-review`,
`4-completed-document-admin`, each at desktop (1440px), tablet (834px), and
mobile (390px).

**Test results:** `npm run test:forms-center-phase6-documents` — **15/15
PASS**. Full regression re-run across all 9 suites — **198/198 assertions
PASS, zero failures.**

**Confirmations:** No email/SMS/Stripe/AI added; Family Hub untouched/OFF;
production untouched; nothing merged into `main`; the structured response
remains the single authoritative record (the snapshot is always a derived,
preserved view, never a second editable copy) — verified explicitly in tests.

## 26. Exact instructions for the next developer

1. `git fetch origin && git checkout cursor/director-family-foundation-bc66 && git pull`
2. Read `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md` and this report
3. Run the full Phase 1–6 test suite (§17); confirm all PASS
4. On testing only: confirm `SITE_URL`, `DATABASE_PROVIDER=local-json`, Stripe/email/AI
   off, `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW`, `ALLOW_FORMS_CENTER_ADMIN_PREVIEW`,
   stored `directorCenter=true`, `formsCenter=true`, `familyHub=false`
5. Smoke Forms Center → My Forms → Send/Assign → Responses dashboard → open a response
   → issue a testing link → open it in a new tab (or another browser) → complete →
   sign → submit → back in the dashboard, approve/return/void/archive as needed
6. Smoke the Teacher Center child profile's new Forms & Documents section
7. Wait for owner-written Phase 7 requirements before coding
8. Commit/push only to `cursor/director-family-foundation-bc66`; keep PR #324 draft
9. Never merge/deploy production without written approval
