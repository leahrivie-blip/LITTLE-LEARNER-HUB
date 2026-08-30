# Curriculum Operator Jobs offload — Stage 2 DESIGN

**Status:** DESIGN / TOOLING ONLY — **NO PRODUCTION APPLY**  
**Label:** Stage 2 design/tooling — NO PRODUCTION APPLY  
**Branch:** `cursor/operator-jobs-stage2-design-53a4`  
**Prerequisite:** Stage 1 live & stable (`6ffb98ef…`, deploy `dep-daa7msajnfac73fpab3g`)

## Goal

Design (and fixture-test) the safest explicit maintenance cutover that will, in a **future authorized** PR:

1. Back up current production operator-job state  
2. Verify source identities + payload integrity  
3. Migrate all historical full `curriculumOperatorJobs` into `llh_curriculum_operator_jobs`  
4. Verify destination completeness **before** modifying `llh_store`  
5. Preserve all active/resumable jobs in full  
6. Rewrite `llh_store.curriculumOperatorJobs` only after successful verification  
7. Reduce hot operator section from ~4.80 MB → roughly tens of KB  
8. Preserve rollback capability  
9. Leave curriculum / users / billing / programData / scheduleByUser unchanged  
10. Fail closed at every unsafe boundary  

**This PR does not execute any of the above against production.**

## Verified production baseline (read-only context)

| Item | Value |
|---|---|
| Production commit | `6ffb98ef233f8ba80db4092474da51d7703cef89` |
| Deployment | `dep-daa7msajnfac73fpab3g` |
| Health | ok / launchReady / database.ready / postgres |
| Curriculum | 129 lessons / 2144 activities |
| Legacy operator jobs | 53 total, 53 full `lessonResults`, 0 stubs |
| Operator section bytes | 4,797,540 |
| Dedicated table | `llh_curriculum_operator_jobs` exists, **0 rows** |
| Full `llh_store` | ~38,145,878 text bytes ≈ 36.38 MB |
| users / programData / scheduleByUser / billingEvents | 337 / 251 / 244 / 71 |
| Stage 1 | STABLE (`isHotStoreCutoverEnabled()` = false) |

Expected size after a future authorized cutover (approximate; do not hard-code):

| Metric | Baseline | After cutover (approx.) |
|---|---:|---:|
| `curriculumOperatorJobs` bytes | 4,797,540 | tens of KB |
| Full `llh_store` text bytes | ~38.1 MB | ~31.8–32 MB |

## Hard rules

- Normal HTTP/API runtime **cannot** activate Stage 2.  
- `isHotStoreCutoverEnabled()` stays **false** in app runtime.  
- Stage 2 tooling may call `buildHotStoreJobBag` **after** verification; it does **not** flip a permanent runtime switch.  
- No boot migration. No env-var accidental production switch.  
- Production Postgres `--apply` remains **hard-refused** in this design PR (`assertProductionApplyUnlocked`).  
- Curriculum / users / programData / scheduleByUser / billing / enrichmentPublishHistory / Binder Builder untouched.  
- Do not alter PR #795 Postgres recovery logic, Stage 1 `backendMode` safety, or `selectJobsChangedInWrite`.  

---

## PHASE 0 — READ-ONLY PREFLIGHT

Read production **without writes**. Capture (ids/status/bytes/hashes only — **never** lesson content):

- `llh_store.updated_at` and exact `updated_at::text` CAS token  
- full `llh_store` serialized/text bytes  
- `curriculumOperatorJobs` count  
- operator section bytes  
- IDs / status / createdAt / updatedAt for every job  
- active/resumable IDs vs terminal IDs  
- `lessonResults` counts per job  
- dedicated table row count  
- curriculum inventory  
- users / programData / scheduleByUser / billing counts  
- database health  

Fingerprints:

- **Per job:** `SHA-256(JSON.stringify(normalizeOperatorJob(job)))`  
- **Aggregate:** `SHA-256(sorted "id:hash" lines joined by "\n")`  

Tooling: `buildSourceManifest()` / CLI dry-run (`--file` or future `--postgres` read-only).

---

## PHASE 1 — BACKUP

Durable backup **before** any migration write.

**Preferred mechanism (existing project convention):**

- Table: `llh_store_backups`  
- Creator: `createLogicalStoreBackup({ source: "pre-operator-jobs-stage2" })`  
  or admin `POST /api/admin/store-backups`  
- Verify with the same pattern as enrichment prune: `verifyPostgresBackup` in  
  `scripts/lib/enrichment-history-postgres-apply.js` (verified flag + store fingerprint bind)

Backup payload / metadata must include (or be recoverable from):

- entire current `curriculumOperatorJobs` bag (via full store snapshot)  
- `llh_store.updated_at`  
- exact source job count  
- per-job SHA-256 hashes + aggregate hash (in Stage 2 audit/manifest)  
- timestamp  
- production build SHA  
- migration run ID  

Local filesystem backups are **not** acceptable for production.  
If durable backup cannot be created/verified → **STOP**.

---

## PHASE 2 — DEDICATED MIGRATION

Idempotent migration into `llh_curriculum_operator_jobs`.

For each source job preserve exact: `id`, full job data, `status`, `createdAt`, `updatedAt`,
`createdBy`, `phase`, `lessonResults`, logs/data required for Operator behavior.

Rules (reuse Stage 1 `upsertJob`):

- never overwrite a newer destination with an older source (`destination_newer` skip)  
- exact-equal destination → skip / matched  
- report conflicts  
- restart-safe / partial rerun / idempotent  

**Do not hot-cap during this phase.** `llh_store` remains untouched/full.

Planning helper (no writes): `planDedicatedMigration()` (optional dry plan).  
Fixture simulation: `simulateStage2OnFixtureStore()` uses in-memory/local job store only.

---

## PHASE 3 — DESTINATION VERIFICATION

Before any hot-store rewrite:

`SOURCE COUNT == DESTINATION REQUIRED COUNT` for all source IDs:

- destination row exists; id matches  
- destination `updatedAt` is source-equal **or safely newer**  
- destination full payload hash matches source unless safely newer  
- `lessonResults` count preserved (for exact matches)  
- active/resumable status preserved  
- terminal payloads preserved in dedicated storage  

Report: sourceCount, destinationCount, matchedCount, exactMatches, newerDestination,
missingCount, hashMismatchCount, conflictCount.

**REQUIRED CUTOVER GATE:**

```
missing = 0
hashMismatch = 0
unsafeConflict = 0
```

If any non-zero → **STOP. Do not modify `llh_store`.**

Tooling: `verifyDestinationAgainstSource` + `assertCutoverVerificationGate`.

---

## PHASE 4 — ACTIVE JOB SAFETY GATE

Immediately before hot rewrite: re-read `llh_store` and dedicated table.

Detect mid-migration change via aggregate hash / count / CAS (`detectSourceDrift`).

If source changed:

1. refresh/reconcile safely into dedicated storage (newest wins)  
2. re-run verification  
3. never hot-cap from a stale snapshot  

Active/resumable statuses **always FULL** in hot bag:

`planned | awaiting_confirm | running | paused`

Never stub/drop an active job. Unknown statuses fail-safe as active (Stage 1 store policy).

---

## PHASE 5 — HOT BAG BUILD (PREVIEW ONLY)

Only after gates pass: build proposed capped compatibility bag via existing
`buildHotStoreJobBag` (tooling calls builder directly; runtime flag stays false).

Policy:

- all active/resumable jobs **FULL**  
- newest ≤10 terminal jobs as **stubs**  
- older terminal jobs **omitted** from hot bag  
- all omitted/stubbed terminals remain **FULL** in dedicated table  

Preview metrics (no write): before/after operator bytes, bytes saved, % reduction,
expected full `llh_store` size after rewrite.

Tooling: `buildHotBagPreview()` — `previewOnly: true`, `wrote: false`.

---

## PHASE 6 — EXPLICIT CUTOVER APPLY (FUTURE; LOCKED HERE)

One-time explicit maintenance apply requiring multiple independent confirmations, e.g.:

```
--apply
--confirm-migrate-operator-jobs
--confirm-hot-store-cutover
--backup-id <verified llh_store_backups id>
--expected-source-count 53
--expected-source-hash <aggregate>
--expected-store-updated-at <exact updated_at::text>
```

Refuse cutover when any of:

- backup absent / verification fails  
- source count or aggregate hash changed unexpectedly  
- active job changed without reconciliation  
- destination missing rows / hash mismatch  
- database unhealthy  
- expected production build changed  
- `llh_store` CAS/update timestamp changed unexpectedly  

**In this PR:** `assertProductionApplyUnlocked()` **always throws** for `--postgres --apply`.

---

## PHASE 7 — CAS / CONCURRENCY PROTECTION

Reuse proven conventions (do not invent weaker guards):

- `scripts/lib/enrichment-history-postgres-apply.js`  
- `server/llh-store-updated-at-reconcile.js`  
- Exact token: `updated_at::text` (`LLH_STORE_UPDATED_AT_EXACT_SQL`)  
- Advisory lock + `FOR UPDATE`  
- Conditional `UPDATE … WHERE updated_at IS NOT DISTINCT FROM $cas`  

On CAS miss: **STOP**, re-read, do not blind-retry with stale data.

---

## PHASE 8 — POST-WRITE VERIFICATION (FUTURE APPLY)

Immediately after authorized hot rewrite, verify:

- database ready; `llh_store` write succeeded  
- hot job count / active full count / terminal stub count  
- terminal empty `lessonResults` only on stubs; **no active stub**  
- dedicated row count; all historical IDs recoverable via dual-read  
- owner-publish can resolve full `lessonResults`  
- curriculum / users / programData / scheduleByUser / billing unchanged  
- full `llh_store` size reduced by expected approximate amount  

---

## PHASE 9 — ROLLBACK DESIGN

Explicit rollback **before** Stage 2 execution is authorized:

1. Restore full `curriculumOperatorJobs` bag from verified backup  
2. CAS-protect the restore  
3. Preserve newer legitimate Operator mutations (never blind overwrite newer jobs)  
4. Verify all historical jobs / full `lessonResults` restored  
5. Leave dedicated rows intact by default (additional safety)  

Preferred: restore hot legacy bag; keep dedicated table.

Tooling simulation: `simulateRollbackFromBackup()`.

---

## PHASE 10 — AUDIT RECORD

Migration audit report fields (no secrets / lesson payloads):

```json
{
  "migrationRunId": "uuid",
  "productionCommit": "6ffb98ef…",
  "preflightTimestamp": "ISO",
  "sourceCount": 53,
  "sourceAggregateHash": "sha256…",
  "backup": { "ok": true, "backupId": "…", "kind": "curriculum_operator_jobs_stage2" },
  "destinationCount": 53,
  "verification": { "missing": 0, "hashMismatch": 0, "unsafeConflict": 0 },
  "operatorSectionBytes": { "before": 4797540, "after": null },
  "llhStoreBytes": { "before": 38145878, "after": null },
  "activeJobIds": [],
  "terminalStubCount": null,
  "casVersion": { "before": "…", "after": null },
  "health": { "before": {}, "after": null },
  "inventory": {
    "curriculum": { "before": {}, "after": null },
    "users": { "before": 337, "after": null },
    "programData": { "before": 251, "after": null },
    "scheduleByUser": { "before": 244, "after": null },
    "billingEvents": { "before": 71, "after": null }
  },
  "rollbackReadiness": "backup_verified",
  "wroteProduction": false
}
```

Tooling: `buildAuditReport()`.

---

## Exact write/cutover sequence (proposed for future unlock)

```
1. Phase 0 preflight (read-only) → manifest + aggregate hash + CAS token
2. Phase 1 createLogicalStoreBackup(source=pre-operator-jobs-stage2) → verify fingerprint
3. Phase 2 upsert each job into llh_curriculum_operator_jobs (idempotent; llh_store untouched)
4. Phase 3 verifyDestinationAgainstSource → gate missing/hashMismatch/conflict == 0
5. Phase 4 re-read source; detectSourceDrift; reconcile if needed; re-verify
6. Phase 5 buildHotBagPreview (no write) → show bytes saved
7. Phase 6 multi-confirm CLI gates
8. Phase 7 CAS conditional UPDATE of llh_store.curriculumOperatorJobs only
9. Phase 8 post-write verification + dual-read / publish checks
10. Phase 10 emit audit; Phase 9 rollback path remains available from backup
```

Normal app runtime never enters this sequence.

---

## Tooling map

| Path | Role |
|---|---|
| `docs/audits/CURRICULUM_OPERATOR_JOBS_OFFLOAD_STAGE2_DESIGN.md` | This design |
| `scripts/lib/curriculum-operator-jobs-stage2.js` | Preflight, fingerprint, verify, preview, gates, fixture sim, rollback sim |
| `scripts/migrate-curriculum-operator-jobs-stage2.js` | CLI (dry-run default; production apply refused) |
| `scripts/test-curriculum-operator-jobs-stage2.js` | Regression suite (30 gates) |

## Hardening (PR #800 review)

### Backup proof (GAP 1)
`verified: true` alone is **not** enough for production-grade cutover.
`assertBackupMatchesSource()` requires a proof bound to:

- backup id, verified, source=`pre-operator-jobs-stage2`
- migration run id, production build SHA (when build binding required)
- source job count, source aggregate hash
- exact `llh_store` `updated_at::text` CAS token
- full-store fingerprint, createdAt

Fixture proofs must be explicitly `kind: "fixture"` / `fixture: true` and are refused by `requireProductionGrade`.

### Destination-newer reconciliation (GAP 2)
Timestamp-newer dedicated rows become `newerDestinationPendingReconcile` — **not** automatic matches.
`reconcileNewerDestinationsAgainstLive()` must confirm live payload hash equals dedicated newer row (or STOP).
Cutover gate fails while any pending reconcile / same-timestamp divergence / malformed newer row remains.

### Postgres read-only fail-closed (GAP 3)
`enforcePostgresSessionReadOnly()` SETs read-only, confirms via `SHOW`, then `BEGIN READ ONLY` + `SHOW transaction_read_only`.
Any SET/confirm failure aborts before reading migration state (no silent `.catch`).

### Rollback same-timestamp conflict (GAP 4)
If `live.updatedAt === backup.updatedAt` and hashes differ → `stage2_rollback_same_timestamp_conflict` (STOP).
Genuinely newer live jobs and live-only new IDs are preserved.

---

## What this PR does NOT do

- Does not migrate production historical jobs  
- Does not hot-cap production  
- Does not unlock Postgres apply  
- Does not deploy or merge automatically  
- Does not add HTTP/API routes that activate Stage 2  
- Does not change `isHotStoreCutoverEnabled()`  
