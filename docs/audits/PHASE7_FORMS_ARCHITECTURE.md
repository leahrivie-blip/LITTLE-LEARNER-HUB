# Phase 7 — Forms Architecture (Source of Truth)

**Branch:** `cursor/phase7-forms-completion-9c23`  
**Policy:** Testing only. Production untouched.

## Four different things (do not collapse them)

| Concept | What it is | Where it lives |
|---|---|---|
| **Form template** | Reusable blank / wording | **System:** `formGroups` + `HOME_DAYCARE_FORMS_PACK` + optional `siteContent.forms`. **Provider (authoritative):** `programData[programId].forms.templates[]`. Temporary read-only fallback: client `programSettings.formTemplates`. |
| **Assigned form** | A template (or custom body) given to a recipient | **Child/family:** `programData[programId].child.data.Documents[]` with `childId`. **Staff (authoritative):** `programData[programId].forms.staffDocuments[]` with `assigneeEmail` → `store.users`. Temporary read-only fallback: client `programSettings.staffFormDocuments`. |
| **Completed response** | Parent/staff progress + submission | Same assignment row: `parentProgressText`, `status`, timestamps. |
| **Signature** | Who signed which version | Same assignment row: `signedAt`, `signedBy`, `signedRole`, `signedSnapshot`, `signedBodyHash`, `contentVersion` / `contentVersionSigned`. |
| **Forms audit** | Append-only server evidence | `store.formsAudit` (+ `formsAuditArchive` for preservation moves). Never destructive FIFO. Clients cannot write/edit/delete. |

There is **no** separate Forms child roster, family roster, or staff roster. Assignment always references canonical IDs.

## Authoritative lifecycle

Normalize aliases →:

`draft` → `assigned` → `in_progress` → `submitted` → `completed`

Also used when the workflow needs them: `needs_correction`, `declined`, `expired`.

**Derived (not stored as primary status):** overdue = dueDate &lt; today && not signed/completed.

Helpers: `server/forms-lib.js` (`normalizeFormStatus`, `formStatusLabel`, `isFormOverdue`).

Legacy UI strings (`needed`, `notified`, `signed`, `on_file`, …) still accepted and map into the lifecycle.

## Assignment targets → IDs only

`resolveFormAssignmentTargets` / `resolveFormAssignmentTargetsClient`:

| Mode | Resolves to |
|---|---|
| children | selected `childIds` |
| classroom | Profiles with `classroomId` |
| household / families | union of household `childIds` |
| program | all active Profile ids |
| staff | staff emails (`store.users`) |

Never copies child/family/staff name records into a Forms store.

## Family Hub

- Visibility: Documents with **`shareWithFamily === true` only** ∩ household `childIds` (`family-hub-lib.liveDocumentsForChildren`).
- **Default deny:** missing / null / undefined `shareWithFamily` never grants access (Wave 1). Invite/household snapshots must stamp `shareWithFamily: true` explicitly for shared docs only.
- Progress: `POST /api/family-hub/documents/:id/progress` → `in_progress` + `parentProgressText` (does not overwrite provider `draftText`).
- Sign: `POST .../acknowledge` → signature record; requires membership + share flag; idempotent on same body hash.
- Content change after sign → `needs_correction` and cleared signature fields (`applyFormBodyEdit`).

## Wave 1 durable namespace

- `programData[programId].forms = { staffDocuments[], templates[], updatedAt }`
- APIs: `GET /api/program-forms`, `POST .../migrate`, `POST .../staff-documents`, `POST .../templates`, `POST .../assign/validate`, `GET .../audit`
- New writes go to server only. Fallback removal requires documented gate (not removed in Wave 1).

## Owner / Director tracking

HDH Forms attention panel + `formsStatusSummary` / `formsDashboardSummary`: assigned, awaiting, overdue, needs review, complete — with assignee labels for child or staff.

## Wave 2 — Connected Paperwork UX

Presentation-only surfaces over the Wave 1 stores (no second roster / dual-write):

| Surface | Source records | Notes |
|---|---|---|
| **Paperwork HQ** | Child `Documents[]` + `forms.staffDocuments[]` | Work-queue rails + filters; HDH simple; Center may show classroom/staff filters |
| **Child → Documents & Forms** | Same child `Documents[]` | Buckets: Needs Action / In Progress / Completed / Uploads (if data) / Archived |
| **Staff Profile → Documents & Forms** | `forms.staffDocuments[]` for selected staff | Owner/Director only; never Family Hub; teachers cannot browse peers |
| **My Paperwork** | Own `forms.staffDocuments[]` rows | Staff self-service; blank templates may surface; child Incident → child Documents |
| **Family Hub Forms** | ACL-filtered child `Documents[]` only | Needs Attention / Needs Signature / In Progress / Completed |

Helpers: `scripts/paperwork-surfaces.js` (derived rails/buckets). Dirty-state: `scripts/forms-dirty-state.js` for filter/progress inputs.

**Same record everywhere:** opening a document from HQ / Child / Staff / My Paperwork / Family Hub resolves to the same canonical `id`.

Derived presentation rails (not new persisted enums): Awaiting Signature, Not Opened, Due Soon, Overdue.

## Reminders

Foundation only: `lastNotifiedAt` on assign/notify + `buildFormReminderStub`. Manual “Remind family” / “Notify again” remains. No unreliable auto-push engine in this phase. Wave 2 surfaces the existing manual reminder from Paperwork HQ only.

## Wave 3 — Structured Form Builder + Template Library

| Piece | Where |
|---|---|
| Field schema | `server/form-fields-lib.js` — types, normalize/validate, AI draft extract |
| Provider templates | Still `programData[programId].forms.templates[]` (no second store) |
| Builder UI | `scripts/form-builder-lib.js` + HDH Template Library / Form Builder in `app.js` |
| Unified library | View over My Templates + Starter Pack + System Library (read-only origins) |

Supports body-only, fields-only, and hybrid templates. Duplicate creates new provider id + `originTemplateId`. Assigned forms snapshot `fields` + `draftText` so later template edits do not mutate history.

AI Form Builder may propose the same structured field schema. **Save as Template requires `#hdhAiReviewAck`** (Phase 9 gate — Wave 3 closed the audit gap). Server rejects `aiGenerated` saves without review acknowledgment.

## AI Form Builder

Preserved: generate → edit → **explicit** Save to child / Save as template / Share. Does **not** auto-assign, auto-send, or invent child/family facts.

## Packets note

`store.formPackets` remains a parallel HDH tracker from earlier work. Phase 7 spine is Documents + staffFormDocuments. Packet dual-status sync is a known limitation (deferred).

## Security

- Parent APIs bind to session `householdId`.
- Cross-household document progress/ack → 404.
- Staff-only docs never appear in Family Hub.
- Program isolation via program child blob / owner context.
