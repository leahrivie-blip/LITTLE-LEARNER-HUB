# Curriculum Operator Jobs offload — Stage 1 (implementation)

**Status:** Implementation PR — **DO NOT merge/deploy until review**  
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

| Class | Count | Bytes | Hot-store policy (Stage 1) |
|---|---:|---:|---|
| running (active) | 1 | 9,661 | **KEEP FULL** |
| planned / awaiting_confirm / paused | 0 | 0 | KEEP FULL |
| completed | 15 | 2,934,920 | Dedicated full; hot stub |
| failed | 34 | 1,620,094 | Dedicated full; hot stub |
| cancelled | 3 | 232,763 | Dedicated full; hot stub |
| **Total bag** | **53** | **4,797,540** | — |

`lessonResults` alone ≈ **4.13 MB** of the bag.

## Stage 1 architecture

1. **Table** `llh_curriculum_operator_jobs` (id, status, timestamps, created_by, phase, data JSONB) + indexes.
2. **Module** `server/curriculum-operator-job-store.js` — get/list/upsert, local-file fallback, hot-store cap helper.
3. **Dual-read** — `mergeWithLegacyBag`: dedicated memory/table first, legacy llh_store ids as fallback.
4. **Dual-write** — `writeJobs` upserts **full** jobs to dedicated store, then writes **capped** bag to llh_store.
5. **Cap rules** — never drop active statuses; keep ≤10 newest terminal jobs as stubs (`lessonResults: []`, truncated log).
6. **Migration script** — dry-run default; file apply for fixtures; **production Postgres apply refused** in Stage 1.

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
