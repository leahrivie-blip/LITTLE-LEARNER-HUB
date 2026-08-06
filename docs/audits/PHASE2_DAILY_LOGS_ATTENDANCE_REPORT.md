# Phase 2 Daily Logs — Complete Proof Report (human conflict UX + IndexedDB queue)

**Environment:** Disposable local test server (`HOME_DAYCARE_HUB_TESTING`)  
**Branch:** `cursor/phase2-daily-logs-attendance-9026`  
**PR:** #548 (draft) — do not merge, do not deploy

## Verdict

- Automated proof checks: **PASS**
- Merge #548: **NO-GO** (awaiting owner approval)
- Place Phase 1–2 on testing site: **NO-GO** (awaiting owner approval; agent must not deploy)

## What this follow-up closed

1. **Human-readable conflict UI** — no raw JSON, IDs, revisions, or timestamps shown to providers.
2. **IndexedDB-only durable queue** — no child-data localStorage fallback; scoped by immutable `userId` + `programId` (+ `childId` on entries).
3. **Logout / account-switch safety** — warn + Sync now / Stay signed in / Discard (explicit); cross-account and cross-program isolation.
4. **Clear statuses/actions** — Saving / Saved to cloud / Waiting for connection / Sync failed / Needs review…; Cancel pending / Discard failed / Retry sync.
5. **Apply my change rebases** intended fields onto the latest server record with a fresh `baseRevision` (never resends the stale revision blindly).

## Concurrency model

- **Creates are append-only.** New record ids insert; two staff adding different meals/naps/notes both survive.
- **Edits are revision-checked.** Updates must send explicit envelope `baseRevision` matching the server revision.
- **Stale edits → conflict** (`stale_revision`) with `serverRecord` — never silent LWW.
- **Deleted/unavailable edits → conflict** (`not_found`) when envelope `baseRevision` is present but the row is gone — no silent recreate.
- Auth and classroom restrictions are rechecked on every mutation, including retries.

## Durable queue design

| Item | Policy |
|---|---|
| Storage | IndexedDB only — DB `llh-child-mutations-v2`, store `pending` |
| localStorage | **Never write** child mutations. Legacy `llhChildMutations:*` keys are purged on load only |
| Scope | `scopeKey = userId::programId` (immutable actor id + program id). Email is not the security boundary |
| Entry fields | `clientMutationId`, `op`, `storeKey`, `record`, `baseRevision`, `baseSnapshot`, `intendedFields`, `childId`, `userId`, `programId`, `scopeKey`, `queuedAt`, `status` |
| Retention / expiration | **14 days** from `queuedAt` (`CHILD_MUTATION_MAX_AGE_MS`). Missing/invalid `queuedAt` → removed. Wrong scope → ignored |
| IDB unavailable | Fail visibly (“Offline saving is unavailable…”); keep entry on screen when possible; allow online retry; **no** silent localStorage fallback |
| Flush | Online event, login, after child-data sync. Ack’d mutations removed from memory + IDB |
| Saved wording | Never “Saved to cloud” before server acknowledgement |

## Conflict-resolution UX

Panel shows:

- Child’s name · record type (Meal, Attendance, Nap, Activity, Note, Diaper/Potty, …)
- Explanation that another staff member updated the record
- Only differing fields with friendly labels and formatted times
- **Your change** vs **Latest saved information**

Actions:

1. **Keep latest saved version** — apply `serverRecord` locally, discard conflicting mutation  
2. **Apply my change to the latest version** — rebase `intendedFields` onto server record, new `clientMutationId`, `baseRevision = server.revision`  
3. **Review and edit** — open Daily Logs for that child  
4. **Cancel** — drop pending mutation; cloud unchanged  

Deleted records hide “Apply my change” and explain the record is no longer available.

## Logout / shared-device safety

Before logout, if unsynced child-data changes exist:

1. Offer **Sync now** (or Cancel = **Stay signed in**)
2. If still unsynced → require explicit **Discard unsynced changes** confirmation
3. Prompts do **not** list child names or queued record details

After logout / account switch:

- In-memory queue cleared
- Next account loads only its own `userId::programId` IDB scope
- Email change keeps the same `localActorId` / Firebase uid scope
- Program change loads a different scope (prior program mutations do not flush)

## Exact files changed

- `app.js` — human conflict UI, rebase apply, IDB v2 scope by userId/programId, logout unsynced prompt, status/action copy, edit/delete via mutations, cancel pending snapshot clobber after mutation flush
- `server/child-data-mutations.js` — `not_found` for explicit-baseRevision edits of missing rows
- `styles.css` — human conflict diff layout (desktop + mobile)
- `scripts/test-child-data-durable-queue.js` — expanded isolation / conflict / IDB / logout suite
- `scripts/test-child-data-mutations.js` — `not_found` unit coverage
- `scripts/test-daily-logs-attendance.js` — enqueue-scoped idempotency proof
- `docs/audits/PHASE2_DAILY_LOGS_ATTENDANCE_REPORT.md` — this report

## Complete test results

| Suite | Result |
|---|---|
| `npm run test:child-data-mutations` | PASS |
| `npm run test:child-data-durable-queue` | PASS |
| `npm run test:daily-logs-attendance` | PASS (15/15) |
| `npm run test:nav-role-experience` | PASS |
| `npm run check` | PASS |

Durable-queue coverage includes:

- Two staff editing different fields + rebase proof  
- Same-field conflict + keep latest  
- Attendance / meals / naps / activities / notes / diaper-potty conflict labels  
- Deleted/unavailable record conflict  
- Mobile conflict layout  
- No child-mutation keys in localStorage  
- Owner → teacher and teacher A → teacher B isolation  
- Email change keeps actor scope  
- Program change isolates prior queue  
- Session expired / permission failed pending work  
- Corrupted / obsolete / wrong-scope cleanup  
- IndexedDB unavailable fail-safe  
- Logout unsynced warning without child-name leak  
- Queue cleanup after ack; **14-day** retention  

## Screenshots

Artifacts: `/opt/cursor/artifacts/phase2-durable-queue/screenshots/`

- `status-conflict-desktop.png` — human-readable conflict (child name, Meal, Your change / Latest saved, actions)
- `status-conflict-mobile.png` — same flow on mobile viewport
- `status-saving.png` / `status-offline.png` / `status-failed.png` / `status-saved.png`

Prior Daily Logs desktop/mobile proof: `/opt/cursor/artifacts/phase2-daily-logs-proof/screenshots/`.

## Remaining limitations (later phases — acceptable)

- Live AI testing until a testing key is available  
- Real Family Hub parent-session testing  
- Physical printer testing  
- Field-level CRDT merge inside a single record (revision conflicts require explicit resolve)  
- Owner full-snapshot path still exists for some non-mutation writes; mutation flush cancels pending snapshot timers to reduce LWW clobber risk  

## GO / NO-GO

| Decision | Verdict |
|---|---|
| Merge PR #548 | **NO-GO** — stop for approval |
| Deploy Phase 1–2 to testing site | **NO-GO** — stop for approval |
