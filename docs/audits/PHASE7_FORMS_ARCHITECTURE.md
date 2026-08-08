# Phase 7 — Forms Architecture (Source of Truth)

**Branch:** `cursor/phase7-forms-completion-9c23`  
**Policy:** Testing only. Production untouched.

## Four different things (do not collapse them)

| Concept | What it is | Where it lives |
|---|---|---|
| **Form template** | Reusable blank / wording | **System:** `formGroups` + `HOME_DAYCARE_FORMS_PACK` + optional `siteContent.forms`. **Provider:** `programSettings.formTemplates` (`sourceType: "provider"`). |
| **Assigned form** | A template (or custom body) given to a recipient | **Child/family:** `programData[programId].child.data.Documents[]` with `childId`. **Staff:** `programSettings.staffFormDocuments[]` with `assigneeEmail` → `store.users`. |
| **Completed response** | Parent/staff progress + submission | Same assignment row: `parentProgressText`, `status`, timestamps. |
| **Signature** | Who signed which version | Same assignment row: `signedAt`, `signedBy`, `signedRole`, `signedSnapshot`, `signedBodyHash`, `contentVersion` / `contentVersionSigned`. |

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

- Visibility: Documents with `shareWithFamily === true` ∩ household `childIds` (`family-hub-lib.liveDocumentsForChildren`).
- Progress: `POST /api/family-hub/documents/:id/progress` → `in_progress` + `parentProgressText` (does not overwrite provider `draftText`).
- Sign: `POST .../acknowledge` → signature record; requires membership + share flag; idempotent on same body hash.
- Content change after sign → `needs_correction` and cleared signature fields (`applyFormBodyEdit`).

## Owner / Director tracking

HDH Forms attention panel + `formsStatusSummary` / `formsDashboardSummary`: assigned, awaiting, overdue, needs review, complete — with assignee labels for child or staff.

## Reminders

Foundation only: `lastNotifiedAt` on assign/notify + `buildFormReminderStub`. Manual “Remind family” / “Notify again” remains. No unreliable auto-push engine in this phase.

## AI Form Builder

Preserved: generate → edit → **explicit** Save to child / Save as template / Share. Does **not** auto-assign, auto-send, or invent child/family facts.

## Packets note

`store.formPackets` remains a parallel HDH tracker from earlier work. Phase 7 spine is Documents + staffFormDocuments. Packet dual-status sync is a known limitation (deferred).

## Security

- Parent APIs bind to session `householdId`.
- Cross-household document progress/ack → 404.
- Staff-only docs never appear in Family Hub.
- Program isolation via program child blob / owner context.
