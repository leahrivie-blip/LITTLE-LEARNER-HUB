# Phase 3 — Daily Logs classroom hardening (testing only)

**Branch:** `cursor/phase3-daily-logs-classroom-9026`  
**Target:** `cursor/family-hub-testing-readiness-d3df` (testing site only)  
**Rule:** Do not merge to `main`. Do not deploy or change production.

## Scope

Real classroom use of:

- Daily Logs + multi-session attendance
- Durable mutation queue / refresh safety
- Conflict handling (including multi-conflict)
- Role-based classroom access for Owner, Director, Teacher, Assistant

No unrelated features. No Teaching Kit / Stripe / production work.

## Fixes shipped

1. **Conflict ACK safety** — `conflict` / `stale_revision` / `not_found` handled before `duplicate`, so a cached conflict+duplicate response cannot silently drop a staff change.
2. **Server conflicts not idempotency-cached** — stale conflicts re-evaluate on retry (aligned with `not_found`).
3. **Multi-conflict UI** — status bar renders every queued conflict panel (up to 5) with a clear count message.
4. **Queue persist barrier** — serialized IndexedDB puts + `flushChildDataMutationPersists()` on `pagehide` / `visibilitychange(hidden)` / `beforeunload`.
5. **Load/persist race** — `loadChildDataMutationQueue` keeps in-memory entries not yet visible in IndexedDB.
6. **Classroom scope parity** — Teachers/Assistants match room **id or name**; unassigned linked staff see no children (Owner/Director unchanged).
7. **Undo / archive / share** — undo discards pending creates (never claims cloud-saved); archive + Family Hub share enqueue revisioned mutations.
8. **Conflict retry** — conflicted mutations force rebase instead of non-rebase retry.

## Automated results

| Suite | Result |
|---|---|
| `npm run check` | PASS |
| `npm run test:phase3-daily-logs-classroom` | **10/10 PASS** |
| `npm run test:daily-logs-attendance` | **15/15 PASS** |
| `npm run test:child-data-mutations` | PASS |
| `npm run test:child-data-durable-queue` | PASS |
| `npm run test:pass3-permission-matrix` | **176/176 PASS** |
| `npm run test:role-settings-auth-matrix` | PASS |
| `npm run test:nav-role-experience` | (run in CI / agent turn) |

Artifacts: `/opt/cursor/artifacts/phase3-daily-logs-classroom/`

## Production status

| Env | Expectation |
|---|---|
| Production (`main`) | **Untouched** — no merge, deploy, env write, or cherry-pick |
| Testing site | Update only after this PR merges into the testing branch |

## What still needs manual review on testing

Fill results in **[PHASE3_MANUAL_REVIEW_WORKSHEET.md](./PHASE3_MANUAL_REVIEW_WORKSHEET.md)** (compact case sheets). Hold next phase and production until that worksheet is complete and explicitly approved.

1. **Two staff devices, same child** — Teacher A edits lunch while Teacher B edits notes; confirm conflict panels and Keep latest / Apply my change feel clear on phone.
2. **Hard refresh mid-save on a slow network** — enter a meal, refresh immediately; confirm status recovers to pending/sync without losing the entry.
3. **Director with linked staff account** — confirm Director still sees all rooms after deploy.
4. **Unassigned Teacher invite** — confirm empty Daily Logs (no accidental “all children”) and a clear next step (assign classroom).
5. **Assistant phone** — check-in / diaper / note under supervision load; confirm Settings/billing still denied.
6. **Owner logout with pending offline queue** — Sync now vs Discard copy still correct.

## GO / NO-GO

| Decision | Verdict |
|---|---|
| Merge Phase 3 into **testing** branch | **GO** after your approval of this PR |
| External tester invites | **NO-GO** until manual review items above |
| Production / `main` | **NO-GO** — wait for explicit approval |
