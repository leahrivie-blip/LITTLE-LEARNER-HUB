# Curriculum Integrity Audit

Generated: 2026-08-04T18:05:00Z (final pass)  
Sites: production `littlelearnershubbyleah.com` (read-only) vs testing `little-learner-hub-testing.onrender.com`  
Artifacts: `/opt/cursor/artifacts/curriculum-integrity-audit/`

## Verdict

**PASS — testing curriculum is an exact working copy of production lesson content.**

Synchronization was **stopped mid-audit** when gaps were found (6 unlinked printables + 17 media bytes missing from testing). Those were remediated, then the audit was re-run to **0 blockers**.

Production was never written.

## Counts

| | Production | Testing |
|---|---:|---:|
| Lesson plans | 127 | 127 |
| Activities | 2565 | 2960 |
| Resources / printables | 17 | 17 |
| Series | 3 | 3 |
| Public lesson inventory | 127 | 127 |
| Production snapshot lessons | — | 127 |
| Media assets referenced by production curriculum | 17 | 17 present |

Extra testing activities (**+395**) are testing-only leftovers and were left isolated on purpose.

## Checklist (every production lesson)

| Check | Result |
|---|---|
| Cover image loads | **PASS** — 0 broken covers (HTTP 200 for `/images/lesson-covers/*`) |
| Theme matches production | **PASS** — 0 mismatches |
| Daily plans Mon–Fri present | **PASS** — 0 incomplete weeks |
| Activities attached | **PASS** — 0 missing production activity IDs |
| Books intact | **PASS** — exact match vs production |
| Songs intact | **PASS** — exact match vs production |
| Materials intact | **PASS** — exact match vs production |
| Learning objectives intact | **PASS** — exact match vs production |
| Printables linked | **PASS** — 17/17 resources + media bytes on testing |
| Teaching Kit generation | **FLAGGED (env)** — endpoint returns `teaching_kit_disabled` on testing (feature flag), not data corruption |
| AI lesson upgrade | **FLAGGED (env)** — depends on AI flags/keys on testing; curriculum JSON intact |
| Preview | **PASS** — detail API 200 for sampled lessons (anonymous locked preview expected) |
| Print | **PASS** — print UI uses the same lesson payload; payload present |
| Download | **PASS (parity)** — printable media auth-gated (403) on **both** prod and testing for Pro resources; 6 example PDFs 404 on **both** prod and testing (pre-existing production parity, not testing-only breakage) |
| Calendar assignment | **PASS** — lesson IDs match production exactly |
| Favorites | **PASS** — favorite control present on desktop + mobile curriculum UI |
| Search finds lessons | **PASS** — library contains searchable titles (e.g. Farm); desktop + mobile |
| Filters / categories | **PASS** — age filter controls present; ages infant/toddler/preschool covered |
| Mobile + desktop display | **PASS** — curriculum library visible; screenshots saved |

## Comparison report

| Issue | Count |
|---|---:|
| Lesson plans missing from testing | 0 |
| Lesson plans that differ from production | 0 |
| Broken covers | 0 |
| Broken images (testing ≠ production) | 0 |
| Missing activities (production IDs) | 0 |
| Missing books / songs / materials / objectives | 0 |
| Missing printables | 0 |
| Duplicate lessons | 0 |
| Broken lesson detail links (sample) | 0 |
| Data corruption | **None detected** |

## What was found mid-audit (then fixed)

Before remediation, sync was **not complete**:

1. **6 production printables** had empty `lessonPlanIds`, so the first sync skipped them.
2. **17 curriculum media blobs** in `llh_media_assets` were missing from testing.

Remediation (testing DB only):

- Imported the 6 resources → testing resources **17/17**
- Upserted **17** media rows from production
- Redeployed testing service to reload store
- Re-audited → **0 blockers**

## Isolation preserved

- Tester-only / extra testing activities kept
- No production writes
- Snapshot markers on all 127 production lessons in testing

## How to re-run

```bash
node scripts/audit-curriculum-integrity.js \
  --source-db-url-file /path/prod.url \
  --target-db-url-file /path/test.url
```

Screenshots: `01-desktop-curriculum.png`, `01-mobile-curriculum.png` under `/opt/cursor/artifacts/curriculum-integrity-audit/`.
