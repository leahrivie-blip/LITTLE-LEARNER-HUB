# llh_store size & write-amplification audit (Phase 2 measurement)

**Status:** READ-ONLY measurement complete — **no schema changes, no prune/apply, no merge/deploy**  
**Date:** 2026-08-30  
**Production commit measured against:** `31a2b7a2` (PR #795 already live)  
**Measurement tool:** `scripts/audit-llh-store-size-breakdown.js` (SELECT-only / file mode)  
**Artifact JSON:** `/opt/cursor/artifacts/llh-store-size-audit/size-report.json`

---

## A. Executive summary

Production `llh_store.data` serializes to **36,569,181 bytes (~34.88 MB UTF-8 JSON)**. Postgres reports `pg_column_size(data)=11,127,729` (compressed on-disk TOAST) and `octet_length(data::text)=38,120,278`.

**What dominates the blob (measured):**

| Rank | Section | Bytes | Share |
|---|---|---:|---:|
| 1 | `siteContent` (mostly curriculum) | 20.25 MB | **58.1%** |
| 2 | `curriculumOperatorJobs` | 4.58 MB | **13.1%** |
| 3 | `programData` | 3.05 MB | **8.8%** |
| 4 | `scheduleByUser` | 3.04 MB | **8.7%** |
| 5 | `notifications` | 1.21 MB | **3.5%** |

Inside curriculum:

- `lessonPlans` **13.62 MB** (39.1% of total store)
- `activities` **5.80 MB** (16.6%)
- Enrichment/Teaching Kit related (draft + history + tk fields) **7.92 MB** (22.7%)
- Of that, **`enrichmentPublishHistory` alone = 6.40 MB** (ARCHIVE CANDIDATE)
- Active enrichment drafts = 1.51 MB (KEEP)
- `enrichmentPublished` top-level field ≈ **0** in this snapshot (published content appears folded into other live lesson fields / history snapshots)

**Inline media in the blob:** **0 bytes** detected (no `data:image/*` / heavy base64 strings). Media offload is largely already done; remaining cover fields are tiny URL/metadata.

**Write amplification (code + size):** every durable mutation still `JSON.stringify(storeCache)` **before** fingerprint/no-op skip, then upserts the full JSONB row. Transient retries **reuse** the same payload string; `updated_at` conflict recovery **re-serializes**. Dirty-drain **can** enqueue a second full write after a successful one.

**Hypothesis check:** Curriculum / Teaching Kit enrichment is a major mass driver (**yes**), but it is **not alone** — `curriculumOperatorJobs` (13%) plus Home Daycare `programData` + `scheduleByUser` (~17.5% combined) are also first-class.

PR #795 (startup/recovery retry) remains correct and separate. This audit does **not** reopen it.

---

## B. Current exact/observed total serialized store size

| Metric | Value |
|---|---|
| `JSON.stringify(store)` UTF-8 bytes | **36,569,181** (~**34.875 MB**) |
| Postgres `pg_column_size(data)` | 11,127,729 (~10.6 MB on-disk/compressed) |
| Postgres `octet_length(data::text)` | 38,120,278 |
| `updated_at` (row) | 2026-08-30T17:36:02.402Z |
| Top-level keys | 72 |
| Lesson plans in blob | 133 |
| Activities in blob | 2,812 |
| Public inventory (read-only check) | **129** lessons / **2144** activities (unchanged; public count ≠ raw array lengths) |

Incident logs on 2026-08-30 showed upsert `payloadBytes` ≈ **36.5–36.6 MB**, matching this measurement.

---

## C. Top-level byte breakdown table

Classification: A=core runtime, B=derived, C=historical/audit, D=media/blob, E=split candidate.

| Section | Bytes | MB | % of store | Count | Class |
|---|---:|---:|---:|---:|---|
| siteContent | 21,236,xxx≈20.251MB | 20.251 | 58.07 | 25 keys | A / E |
| curriculumOperatorJobs | ≈4.575MB | 4.575 | 13.12 | 53 jobs | **C / E** |
| programData | ≈3.051MB | 3.051 | 8.75 | 250 | A / E |
| scheduleByUser | ≈3.037MB | 3.037 | 8.71 | 243 | A / E |
| notifications | ≈1.211MB | 1.211 | 3.47 | 1941 | A / E |
| visualProduction | ≈0.779MB | 0.779 | 2.23 | 106 briefs | A |
| users | ≈0.452MB | 0.452 | 1.30 | 336 | A |
| messages | ≈0.398MB | 0.398 | 1.14 | 258 | A / E |
| emailEngagement | ≈0.265MB | 0.265 | 0.76 | — | A |
| enrichmentEditorAudit | ≈0.200MB | 0.200 | 0.57 | 608 | C |
| aiOutputs | ≈0.125MB | 0.125 | 0.36 | — | C |
| enrichmentMediaRegistry | ≈0.104MB | 0.104 | 0.30 | — | E |
| *(all other top-level keys)* | &lt;0.5% each | — | &lt;0.5% | — | mixed |

`siteContent` children (dominant):

| Child | MB |
|---|---:|
| curriculum | **19.531** |
| curriculumDraftReviews | 0.713 |
| remaining chrome (faqs, pricing, homepage, …) | ~0.01 |

---

## D. Largest nested sections

| Nested section | MB | % of total store |
|---|---:|---:|
| siteContent.curriculum.lessonPlans | 13.619 | 39.05 |
| siteContent.curriculum.activities | 5.800 | 16.63 |
| lessonPlans.enrichment+teachingKit (sum) | 7.916 | 22.70 |
| lessonPlans.dailyPlans (sum) | 5.122 | 14.69 |
| curriculumOperatorJobs.jobs | 4.575 | 13.12 |
| programData | 3.051 | 8.75 |
| scheduleByUser | 3.037 | 8.71 |
| siteContent.curriculum.resources | 0.106 | 0.30 |
| siteContent.curriculum.series | 0.005 | 0.01 |
| lessonPlans.cover fields (sum) | 0.009 | 0.03 |

---

## E. Largest individual objects

### Top lesson plans (by serialized bytes)

| MB | History B | Draft B | Daily B | Id / title |
|---:|---:|---:|---:|---|
| 0.762 | 610,887 | 156,300 | 27,888 | cur-lp-preschool-weather-watchers / Weather Watchers |
| 0.656 | 540,481 | 107,812 | 34,101 | cur-lp-infant-tummy-time-adventures / Tiny Artist Studio |
| 0.633 | 463,283 | 121,339 | 70,010 | cur-lp-toddler-bugs-and-butterflies / Bugs & Butterflies |
| 0.538 | 407,921 | 87,730 | 62,345 | cur-lp-toddler-pirate-adventure / Pirate Adventure |
| 0.528 | 423,481 | 84,503 | 39,616 | cur-lp-preschool-all-about-me / All About Me |
| … | … | … | … | (full top 25 in artifact JSON) |

**Largest single object overall (besides root/`siteContent`):**  
`$.siteContent.curriculum.lessonPlans[131]` ≈ **0.762 MB** (Weather Watchers), of which history alone is **~0.58 MB**.

### Largest arrays

| MB | n | Path |
|---:|---:|---|
| 13.619 | 133 | $.siteContent.curriculum.lessonPlans |
| 5.800 | 2812 | $.siteContent.curriculum.activities |
| 4.575 | 53 | $.curriculumOperatorJobs.jobs |
| 1.211 | 1941 | $.notifications |
| 0.779 | 106 | $.visualProduction.briefs |
| 0.583 | 4 | …lessonPlans[131].enrichmentPublishHistory |

### Largest strings

Mostly AI / visual-production prompts and `aiOutputs[].output` (max ~16 KB). **No multi-MB base64 strings.**

---

## F. Duplication findings

Conservative heuristics only (no deletions):

| Signal | Result |
|---|---|
| Plans with both enrichmentDraft + enrichmentPublished fields | 0 |
| Exact draft === published JSON | 0 |
| Plans with publish history | 28 plans / **101** history entries |
| History bytes | **6.397 MB** |
| Daily-plan text appearing inside published enrichment blob | 0 (heuristic) |

**Practical duplication pattern:** each `enrichmentPublishHistory[]` entry stores a **full prior enrichment snapshot**. With retention already at ≤5 entries/plan, history is still fat because **each snapshot is large**, not because entry count exceeds the current cap of 5.

Existing dry-run `prune-enrichment-publish-history.js --from-postgres` with default retention **5** → **0 bytes saved** (already at cap). Lowering retention or archiving snapshots off-blob is required for meaningful reduction.

`curriculumOperatorJobs.jobs` (53) hold per-job `lessonResults` and payloads that duplicate lesson-oriented operator output already reflected in lessons — strong archival candidate.

---

## G. Inline media findings

| Metric | Value |
|---|---|
| Detected `data:` / heavy base64 strings | **0** |
| Total identifiable inline-media bytes | **0** |
| Cover field bytes (URLs/meta sum) | ~0.009 MB |

**Conclusion:** Binary media is largely outside `llh_store` already (`llh_media_assets` / URL refs). Media migration is **not** the next high-ROI cut.

---

## H. Enrichment / history findings

| Group | MB | Count | Classification |
|---|---:|---:|---|
| enrichmentPublishHistory | **6.397** | 133 plans touched / 101 entries | **ARCHIVE CANDIDATE** |
| curriculumOperatorJobs | **4.575** | 53 jobs | **ARCHIVE CANDIDATE** |
| enrichmentDraft (active) | 1.505 | 27 | **KEEP** |
| visualProduction | 0.779 | 106 | KEEP |
| aiOutputs (+ usage logs) | 0.142 | — | ARCHIVE CANDIDATE |
| binderBuilder | 0.022 | 2 drafts | KEEP |
| teachingKit other fields | 0.013 | — | KEEP |
| enrichmentPublished (dedicated field) | 0.000 | 0 | n/a in this snapshot |

**KEEP** = needed for normal runtime / owner workflow today.  
**ARCHIVE CANDIDATE** = valuable but not required to render the live lesson library.  
**PRUNE CANDIDATE** = only after explicit owner approval + backup (not performed here).  
Default history retention tool already exists; it does **not** remove the 6.4 MB while limit stays at 5 fat snapshots.

---

## I. Current write-path trace

Exact durable path (Postgres mode):

```
HTTP / mutation / scheduler
  → writeStore() | writeStoreAsync() | persistStoreOr503() | respondAfterPersist()
  → applyStoreWriteMerges(...)  (preserve sessions/siteContent/etc.)
  → storeCache = next
  → enqueuePostgresStoreWrite()
       → await postgresWriteChain (generation skip if stale)
       → testAccountGuard.pruneEphemeralTestAccountsFromStore(storeCache)
       → assertSafePostgresStoreReplacement(storeCache)
       → payload = JSON.stringify(storeCache)          // FULL serialize HERE
       → fingerprint = sha256(payload)
       → if fingerprint === lastPersistedStoreFingerprint:
            log skip; scheduleDirtyDrain(); return     // still paid full serialize
       → executePostgresStoreUpsert(payload, nextCounts)
            → withPostgresClient:
                 BEGIN
                 pg_advisory_xact_lock(...)
                 SELECT updated_at … FOR UPDATE
                 INSERT … ON CONFLICT DO UPDATE (POSTGRES_UPSERT_STORE)
                   // $2::jsonb full document; foundingMembers union only
                 COMMIT
            → transient retries REUSE same `payload` string
       → on updated_at conflict:
            JSON.parse(payload) + reload from Postgres + reconcile
            retryPayload = JSON.stringify(storeCache)  // RE-SERIALIZE
            executePostgresStoreUpsert(retryPayload)
       → scheduleDirtyDrain()
            → if postgresStoreDirty: enqueuePostgresStoreWrite() again
```

Key symbols (`server/index.js`):

- `writeStore` / `writeStoreAsync`
- `enqueuePostgresStoreWrite` (~5730+)
- `executePostgresStoreUpsert` (~5661+)
- `POSTGRES_UPSERT_STORE` (~5260+)
- `fingerprintStorePayload` / `lastPersistedStoreFingerprint`
- `postgresStoreDirty` / dirty-drain `setImmediate`

**Not full-document:** `llh_analytics_events` inserts; Founding `jsonb_set` union; `llh_media_assets`; `llh_admin_sessions`; email campaign rows.

---

## J. Write-amplification analysis

For one normal durable mutation against today’s store:

| Step | Approx cost |
|---|---|
| Live `storeCache` object graph | Resides in process RAM for life of instance (often multi× JSON size; **exact RSS not measured read-only**) |
| `JSON.stringify(storeCache)` | **~34.88 MB** string allocated **every enqueue**, including no-op/identical fingerprint skips |
| SHA-256 fingerprint | Hashes the full string (CPU); fingerprint retained as hex only |
| `node-pg` bind + send `$2::jsonb` | Another large buffer during query (retries reuse same JS string) |
| Postgres JSONB rewrite | Full-row replace of `data` (on-disk compressed ~11 MB; wire/text form larger) |
| Dirty-drain follow-up | **Yes — can start a second full serialize+upsert** if non-telemetry mutations dirtied the store during the first write |
| Transient connection retries | **Do not reserialize**; reuse `payload` |
| `updated_at` conflict recovery | **Does reserialize** after reload |
| Peak simultaneous copies (worst case) | storeCache graph + payload string (+ driver buffer) + optional parse(clone) on conflict — **exact peak RSS not measured in this read-only audit** |

**Answers to critical questions:**

5/7. **No-op / identical writes still require full JSON serialization** (fingerprint is computed from the new stringify).  
8. **Transient retries do not reserialize**; conflict recovery does.  
9. **Dirty-drain can produce a second full write** immediately after another.

Incident implication: a single Admin/curriculum save transmits ~36 MB into Basic 1GB Postgres; concurrent traffic + JSONB rewrite was sufficient historically to SIGKILL the backend.

---

## K. Risk-ranked reduction opportunities

### 1) Low-risk / no schema split

| Opportunity | Est. savings | Risk | Migration | Rollback | Data-loss risk | Schema change | Prerequisite tests |
|---|---:|---|---|---|---|---|---|
| Cap / archive **`curriculumOperatorJobs`** (keep last N jobs or move completed jobs aside) | **~4.6 MB (~13%)** if fully off hot blob; partial if retain recent | LOW–MED | NO for in-blob cap; YES soft if new table | Easy (restore from backup / re-run jobs) | LOW if archive retained | Optional | Operator UI list/replay; inventory guards; store-safety |
| Archive **`enrichmentPublishHistory`** to side storage / keep 1 pointer | **up to ~6.4 MB (~18%)** | MED | YES for off-blob; NO for lower in-blob retention | MED | MED (rollback versions) | Optional | Existing prune dry-run/apply gates; Teaching Kit rollback; CAS tests |
| Trim `enrichmentEditorAudit` / `aiOutputs` | ~0.3 MB | LOW | NO | Easy | LOW | NO | Admin audit screens |
| Fingerprint / cheap equality **before** full stringify (structural hash or generation token) | CPU/RAM on no-op path; **0 MB stored** but avoids 35MB alloc on identical writes | MED (correctness) | NO | Easy | NONE if fingerprint equivalent | NO | store-write-race, debounce, identical-skip tests |

Default history prune @ retention 5: **0 MB** today (already capped). Savings require **archival or lower retention of fat snapshots**, not the current tool defaults alone.

### 2) Media / offload

| Opportunity | Est. savings | Notes |
|---|---:|---|
| Further media offload | **~0 MB** now | No inline binaries found |

### 3) Safe history/archive candidates

- `enrichmentPublishHistory` (6.4 MB) — ARCHIVE  
- `curriculumOperatorJobs` (4.6 MB) — ARCHIVE  
- `enrichmentEditorAudit` (0.2 MB) — ARCHIVE/PRUNE with approval  
- `aiOutputs` (0.13 MB) — ARCHIVE  

### 4) Serialization / no-op optimization

- Avoid `JSON.stringify` until mutation fingerprint known dirty (generation counter / field-level dirty flags).  
- Does not shrink Postgres row until content leaves the blob, but reduces OOM pressure on the **Node** side during no-op enqueues.

### 5) Curriculum table / domain extraction

- Move `lessonPlans` / `activities` / series / resources out of `llh_store`.  
- Est. removable from hot blob: **~19.5 MB curriculum** (+ draft reviews 0.7 MB) over time.  
- Risk: **HIGH**; requires dual-read/dual-write (see §L).

### 6) Messaging / programData extraction

- `programData` + `scheduleByUser` ≈ **6.1 MB** combined.  
- `messages` + `notifications` ≈ **1.6 MB**.  
- Risk: MEDIUM; Home Daycare Hub correctness.

### 7) Final slim account/billing core

- Retain users / founding / billing chrome only after 5–6.  
- Risk: HIGH until prior phases verified.

---

## L. Proposed future curriculum extraction sequence (DESIGN ONLY)

Aligned with request Phases 1–6 — **not implemented**:

1. **Dual-read** — app can serve curriculum from blob **or** new tables (feature flag).  
2. **Dual-write** — mutations write blob **and** new curriculum persistence.  
3. **Verify** byte/semantic equivalence (lesson/activity counts, Family Connections series IDs, TK fields, publish status).  
4. **Cut reads** to new store.  
5. **Stop writing curriculum into `llh_store`** (writers reject embedded curriculum changes or strip on write).  
6. **Remove embedded curriculum** only after verified backups + rollback path.

### Cutover risks (must design around)

| Risk | Why dangerous | Mitigation sketch |
|---|---|---|
| **Old deploy overwrites new tables with stale blob** | Rollback/redeploy of pre-cutover code calls full upsert and recreates embedded curriculum, wiping newer table-only edits | Version gate: old builds must refuse Postgres writes if `curriculum_storage=external` flag set; or keep dual-write until all instances upgraded |
| `updated_at` / CAS conflicts | Full-blob token vs per-lesson revisions | Per-entity `updated_at`; stop using single blob token for curriculum mutations |
| Publish / Owner Admin / AI Operator drafts | Drafts today live on plan objects + operator jobs | Explicit draft tables; dual-write drafts first |
| Binder Builder `sourceLessonId` | Must resolve lessons after split | Stable IDs; integration tests |
| Public curriculum reads | Caching / DTO assembly | Short TTL cache; inventory smoke |
| Images / printables | Already mostly refs; verify no path re-inlines | Media registry tests |
| Backups / restore | Today backups are full JSONB snapshots | Backup both blob + curriculum tables; restore recipe documented |
| Atomicity | Multi-table publish | Transaction per lesson publish; outbox if needed |

**Most dangerous failure mode:** post-cutover, an older app version performs `POSTGRES_UPSERT_STORE` with a storeCache that still embeds (stale) curriculum and overwrites authoritative table state or reintroduces a mega-blob. Guard with deploy order + write fences + inventory assertions.

---

## M. Required safety gates before any migration

1. Fresh Render Postgres backup + verified `llh_store_backups` / export download.  
2. Record inventory: public 129/2144 + raw blob counts 133/2812 + founding/users.  
3. Dry-run only tools first (`wrote: false`).  
4. Feature-flag dual-read before dual-write.  
5. Keep `assertSafePostgresStoreReplacement` until curriculum leaves the blob.  
6. Prohibit empty/default store upserts.  
7. Rollback plan: previous app SHA + restore recipe; write-fence for mixed versions.  
8. Regression suites: store-safety, store-write-race/debounce/degraded, postgres pool/reliability, Teaching Kit publish, Binder Builder source lesson resolution, Home Daycare programData.  
9. Owner approval before any PRUNE of history/jobs.

---

## N. Explicit recommendation for the NEXT SINGLE implementation task

**Next single task (implementation PR — not this audit):**

> **Offload or hard-cap `curriculumOperatorJobs` out of the hot `llh_store` blob** (53 jobs / **~4.58 MB / ~13%**), with dry-run mode, verified backup gate, and Operator UI still able to list recent jobs from the new location or retained window.

**Why this first (evidence-based):**

1. Largest **non-runtime** top-level section after curriculum itself.  
2. Clear ARCHIVE classification — not required to render the public lesson library.  
3. No media migration complexity; no curriculum publish CAS redesign.  
4. Smaller blast radius than touching `enrichmentPublishHistory` rollback semantics or splitting `lessonPlans`.  
5. Immediate double-digit % reduction in every full-store upsert / Postgres JSONB rewrite.  

**Follow immediately after (separate PRs):**

- Archive/slim `enrichmentPublishHistory` (up to ~6.4 MB) with owner-approved retention policy beyond the current “5 fat snapshots” behavior.  
- Then serialization no-op optimization (avoid stringify on identical generation).  
- Only then begin curriculum dual-read/dual-write design implementation.

---

## Appendix — how to re-run measurement (read-only)

```bash
# File mode
node scripts/audit-llh-store-size-breakdown.js --file /path/to/store.json --out /tmp/size-report.json

# Postgres SELECT-only
PRODUCTION_DATABASE_URL=... DATABASE_SSL=true \
  node scripts/audit-llh-store-size-breakdown.js --postgres --out /tmp/size-report.json
```

This script sets `default_transaction_read_only=on` when possible, never calls writeStore*, refuses `LLH_STORE_AUDIT_ALLOW_WRITE=1`, and redacts sensitive paths in reports.

Enrichment history dry-run (also non-mutating):

```bash
PRODUCTION_DATABASE_URL=... node scripts/prune-enrichment-publish-history.js --from-postgres --json
# Observed 2026-08-30: wrote=false, storeBytesSaved=0 at retention 5
```
