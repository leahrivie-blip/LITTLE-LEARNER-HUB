# Curriculum Operator Jobs offload — Stage 1 (implementation)

**Status:** Stage 1 implementation — infrastructure only; historical cutover deferred to Stage 2  
**Branch:** `cursor/operator-jobs-offload-53a4`  
**Does not modify:** audit PR #796, enrichmentPublishHistory, curriculum lesson bodies, users, billing, programData, scheduleByUser, PR #795 retry logic, writeStore debounce/race.

## Dependency map (pre-change)

| Area | Location | Role |
|---|---|---|
| Job model / normalize | `scripts/curriculum-operator-job.js` | create/normalize jobs, `normalizeOperatorJobStore` (max 100) |
| Status enum | `scripts/curriculum-operator-schema.js` `JOB_STATUSES` | planned, awaiting_confirm, running, paused, completed, completed_with_gaps, failed, cancelled |
| Read/write bag | `server/curriculum-operator.js` `readJobs` / `writeJobs` | All operator API mutations persist via `writeStoreAsync` |
| Preserve on store merge | `mergeStorePreserveCurriculumOperatorJobs` | Prevents stale clones wiping newer jobs |
| Owner publish lookup | `server/curriculum-operator-owner-publish.js` | Reads jobs from store bag |
| HTTP entry | `POST /api/admin/curriculum/operator` in `server/index.js` | Constructs operator API |

### Required vs historical (production measured 2026-08-30)

| Class | Count | Bytes | Stage 1 hot-store policy |
|---|---:|---:|---|
| running (active) | 1 | 9,661 | **KEEP FULL** in llh_store |
| planned / awaiting_confirm / paused | 0 | 0 | **KEEP FULL** in llh_store |
| completed | 15 | 2,934,920 | **KEEP FULL** in llh_store (Stage 1); dedicated dual-write only if later mutated |
| failed | 34 | 1,620,094 | **KEEP FULL** in llh_store (Stage 1); dedicated dual-write only if later mutated |
| cancelled | 3 | 232,763 | **KEEP FULL** in llh_store (Stage 1); dedicated dual-write only if later mutated |
| **Total bag** | **53** | **4,797,540** | No automatic migrate/cap in Stage 1 |

`lessonResults` alone ≈ **4.13 MB** of the bag.

## Stage 1 architecture

1. **Table** `llh_curriculum_operator_jobs` (id, status, timestamps, created_by, phase, data JSONB) + indexes.
2. **Module** `server/curriculum-operator-job-store.js` — get/list/upsert, local-file **only when not Postgres-intended**, plus `buildHotStoreJobBag` for future Stage 2 / tests.
3. **Backend state** — `backendMode` (`postgres` | `local-file` | `memory`) is separate from readiness (`isReady` / `canSafelyPersistDedicated`). Temporary `databaseReady=false` must **not** switch Postgres mode to local-file.
4. **Dual-read** — `mergeWithLegacyBag`: dedicated memory/table first, legacy llh_store ids as fallback (Owner-publish uses this path).
5. **Dual-write (Stage 1)** — `writeJobs` persists **only changed/new** jobs (`selectJobsChangedInWrite`) to dedicated storage when ready, and always writes the **full** normalized bag to `llh_store`. Historical jobs are **not** bulk-seeded.
6. **Hot-cap / cutover** — `isHotStoreCutoverEnabled()` is hard-`false` in Stage 1, so `canSafelyCapHotStore()` stays false. `buildHotStoreJobBag` exists for Stage 2 tooling/tests but is **not** used for production cutover in Stage 1.
7. **Migration script** — dry-run default; file apply for fixtures; **production Postgres apply refused** in Stage 1.
8. **Reconnect** — `ensureCurriculumOperatorJobStoreReady("reconnect")` re-inits the dedicated table after Postgres recovers; mode stays postgres; cutover remains disabled.

### Production safety invariant

If Postgres is the intended store: **full operator job must persist to PostgreSQL before** `llh_store` may replace that job with a terminal stub. Local side-file must never act as a durability substitute.

### Stage 1 vs Stage 2 cutover boundary

| Capability | Stage 1 (this PR) | Stage 2 (future, authorized) |
|---|---|---|
| Create dedicated table / dual-read | Yes | — |
| Dual-write **changed/new** jobs only | Yes | — |
| Bulk-migrate all legacy jobs via normal API | **No** | Explicit migration script only |
| Hot-cap / stub `llh_store` historical bag | **No** (`isHotStoreCutoverEnabled() === false`) | Only after dry-run → backup → migrate → verify |
| Production Postgres migration `--apply` | **Refused** by script | Separately authorized |

Ordinary Operator HTTP traffic must never substitute for Stage 2.

## What Stage 1 does NOT do

- Does not auto-migrate production blob → table on boot.
- Does not delete legacy `curriculumOperatorJobs` from llh_store until an authorized apply + hot rewrite.
- Does not touch `enrichmentPublishHistory`.
- Does not change `JSON.stringify` fingerprint ordering or dirty-drain.

## Next stage (after this PR is verified)

1. Authorized maintenance: dry-run → backup → migrate apply to `llh_curriculum_operator_jobs`.
2. Rewrite hot `curriculumOperatorJobs` to capped bag once dedicated rows verified.
3. Confirm Operator UI list/resume against dual-read.
4. Then consider `enrichmentPublishHistory` offload.

## Estimated size after completed cutover

If hot bag retains 1 running job full + ≤10 terminal stubs:

- Hot `curriculumOperatorJobs`: roughly **tens of KB** (order ~0.05 MB) vs **4.58 MB** today  
- Reduction: **~4.5 MB ≈ 13% of the 34.88 MB llh_store** (and ~99% of the operator-jobs section)  
- Dedicated table retains full historical payloads
