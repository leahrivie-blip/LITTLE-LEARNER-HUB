# Curriculum Production → Testing Sync Report

Generated: 2026-08-04T17:46:25.066Z (sync applied)  
Verification: live public inventory after testing redeploy

## Counts

| Environment | Before | After |
|---|---:|---:|
| Production | 127 | 127 |
| Testing | 89 | 127 |

Status: **✓ In Sync**

Last synced: Aug 4, 2026, 5:46 PM UTC

## Safety

- Production unmodified: **yes** (read-only source connection; production count still 127)
- Testing backup id: `curriculum_sync_2026-08-04T17-46-25-569Z_0a0874`
- Conflicts blocked: 0
- Failed imports: 0
- Missing after sync: 0
- Duplicates after sync: 0
- Tester-only lessons preserved: any non-production IDs remain untouched (none blocked this run)
- All 127 testing lessons marked `productionSnapshot: true`

## Changes

- Imported: **38**
- Updated: **89** (stale catalog copies refreshed + snapshot markers applied)
- Activities / resources / series upserted from production for shared lesson IDs

## Live verification (testing site)

- Public inventory: Production **127** / Testing **127**
- Public ID parity: **exact match** (0 missing, 0 extras)
- Lesson detail opens: sampled IDs return 200
- Covers download: sampled `/images/lesson-covers/*` return 200
- Full bodies in testing DB: 127/127 have `dailyPlans`, books, and songs
- Search/filter inputs available via public library ages/themes
- Teaching Kit endpoint currently returns `teaching_kit_disabled` on testing (feature flag), not a sync defect
- Favorites / calendar assignment / print flows use the same curriculum IDs; library parity is the prerequisite and is satisfied

## Admin Testing Center button (code in this PR — not merged)

Adds **Sync Production Curriculum** with status:

- Production: N lesson plans  
- Testing: N lesson plans  
- Last synced: …  
- Status: ✓ In Sync / Needs sync / Conflict

### Required testing-only env (for one-click sync later)

Set on `little-learner-hub-testing` only:

- `PRODUCTION_CURRICULUM_SOURCE_DATABASE_URL` = production Postgres **external** URL (read-only use), **or**
- `PRODUCTION_CURRICULUM_ADMIN_TOKEN` + `PRODUCTION_CURRICULUM_SOURCE_URL`

Do **not** point this at the testing Neon host. Do **not** set these on production.

## How to re-run from CLI

```bash
node scripts/sync-production-curriculum.js --dry-run \
  --source-db-url-file /path/prod.url \
  --target-db-url-file /path/test.url

node scripts/sync-production-curriculum.js --apply \
  --source-db-url-file /path/prod.url \
  --target-db-url-file /path/test.url
```

Testing site only. Production was not written. This PR is draft — do not merge/deploy production from it unless requested.
