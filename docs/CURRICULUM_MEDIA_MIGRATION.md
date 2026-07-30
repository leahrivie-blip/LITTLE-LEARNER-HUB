# Curriculum media migration — Option A (surgical)

**Status:** PR prepared — **not merged, not deployed, migration not run on production**  
**Date:** 2026-07-30  
**Auto-deploy:** must remain **paused** until migration is reviewed and executed under control.

## Problem

Production `llh_store` is **~63 MB** because **17 curriculum resources** store **~49 MB** of base64 PNG/PDF data inside `siteContent.curriculum.resources[].fileData`. Every full-store write serializes the entire document (~9–12 s today).

PR #385 fixed analytics page-view isolation; it did **not** cause this bloat. The inline resources were uploaded **2026-07-30 between 15:10–16:11 UTC** (before the #385 deploy).

## Storage recommendation

| Option | Verdict |
|--------|---------|
| **`llh_media_assets` Postgres table (BYTEA)** | **Recommended** — already used for lesson-plan covers; durable; backed up with Postgres; no Render ephemeral disk; same access pattern as existing `/api/media/lesson-covers/*` |
| Render web-service filesystem | **Rejected** — ephemeral on deploy/restart |
| External object storage (S3/R2) | Deferred — adds credentials, CORS, and migration complexity; not required for 17 files (~49 MB total) |

### Why `llh_media_assets`

- **Durability:** Postgres Basic 1 GB with daily backups (same as `llh_store`)
- **Access control:** Serve via app endpoints with existing curriculum auth checks
- **Migration complexity:** Lowest — table + handlers already exist for covers
- **Performance:** BYTEA read for 3 MB PNG is fine via streaming endpoint
- **Cost:** No new service; ~49 MB in Postgres vs ~49 MB in JSONB TOAST bloat

## Architecture (this PR)

| Layer | Behavior |
|-------|----------|
| **Binary storage** | `llh_media_assets` row (`kind = curriculum-resource`, `bytes BYTEA`) |
| **Resource metadata** | Stays in `siteContent.curriculum.resources[]` with `mediaAssetId` + `mediaUrl` |
| **Legacy inline** | `fileData` retained until migration verifies asset checksum, then cleared with `--remove-inline` |
| **Serving** | `GET /api/media/curriculum-resources/:id` (public auth same as `/api/curriculum/resources/file`) |
| **Admin file API** | `GET /api/admin/curriculum/resources/file` returns `mediaUrl` (dual-read: inline `fileData` still works) |
| **Upload freeze (Postgres)** | New uploads → `llh_media_assets` only; **503/400** if Postgres unavailable or inline base64 attempted |

### New / updated API

| Method | Path | Purpose |
|--------|------|---------|
| `GET/POST` | `/api/admin/curriculum/resources/inline-inventory` | List inline resources + sizes (no base64) |
| `POST` | `/api/admin/curriculum/resources/migrate-inline-media` | Admin migration (`dryRun` default true) |
| `GET/HEAD` | `/api/media/curriculum-resources/:mediaAssetId` | Stream binary |
| `POST` | `/api/admin/curriculum/resources/upload` | Postgres: returns `mediaAssetId` + `mediaUrl` (no `fileData`) |

### Migration progress table

`llh_curriculum_media_migrations` — per-resource status: `pending` → `asset_stored` → `verified` → `inline_removed` (or `failed`).

## Files changed

| File | Change |
|------|--------|
| `server/curriculum-media.js` | Media helpers, inventory, BYTEA insert/read, checksum |
| `server/curriculum-resource-migration.js` | Resumable idempotent migration engine |
| `server/index.js` | Upload freeze, dual-read, media endpoint, admin migration routes |
| `app.js` | Client supports `mediaUrl` / `mediaAssetId` on upload + save |
| `scripts/inventory-inline-curriculum-resources.js` | Production inventory CLI |
| `scripts/migrate-inline-curriculum-resources.js` | Controlled migration CLI |
| `scripts/test-curriculum-media-migration.js` | Unit + optional Postgres integration tests |
| `scripts/verify-migration-manual-checks.js` | Production sign-off automation (`RENDER_API_KEY` required) |
| `package.json` | Scripts + syntax check entries |
| `docs/CURRICULUM_MEDIA_MIGRATION.md` | This plan |

## Pre-migration backup requirements (production)

Before **any** `--execute` on production:

1. **Postgres manual backup** — record backup ID + timestamp in Render Dashboard
2. **Admin store export** — download from admin safety screen
3. **Inline resource manifest** — `npm run inventory:inline-curriculum-resources -- --json > manifest.json`
4. **Deploy rollback point** — current live: merge `0e33ee5` (PR #385), deploy `dep-d9loufgu01pc738kgu30`
5. **Checksum manifest** — produced by migration dry-run / execute results (`sha256` per resource)

### Rollback plan

- **If migration fails mid-run:** Re-run is idempotent; failed rows stay in `llh_curriculum_media_migrations` with `status=failed`
- **If store must roll back:** Redeploy prior build **or** restore Postgres backup / store export — external `llh_media_assets` rows remain harmless orphans until re-linked
- **Do not delete** `llh_media_assets` rows until store metadata rollback is verified

## Canary migration plan (production — not run yet)

1. Confirm backups + manifest (above)
2. **Dry-run all 17:**  
   `PRODUCTION_DATABASE_URL=... npm run migrate:inline-curriculum-resources -- --dry-run`
3. **Canary (1 resource):**  
   `... --execute --resource-id=cur-res-19fb392842ccf9ee08f`  
   (smallest PDF pair excluded — pick one PNG, e.g. first Grandfriends resource)
4. Verify canary:
   - Admin open file
   - Entitled user public file endpoint
   - `GET /api/media/curriculum-resources/curriculum-resource-<id>` streams bytes
   - SHA-256 matches manifest
   - Lesson/activity links unchanged
   - Store size drops only after `--remove-inline` phase
   - No 502/503 / disconnect logs
5. **Execute remaining 16** (no `--remove-inline` yet — dual-read period)
6. After all verified: **second pass** with `--execute --remove-inline` (batch or per-resource)
7. Report final store size + write durations from `[store-persistence]` logs

## Dry-run output (production, 2026-07-30)

```
storeBytes: 66,526,828 (~63.44 MB)
attempted: 17, succeeded: 17 (dry_run), failed: 0
bytesRemoved: 0 (dry-run does not mutate)
```

Expected after full inline removal: **~49 MB** removed from blob → **~14–16 MB** store (plus analytics blob ~4 MB).

## Follow-up (separate PRs — not in this migration)

- Move `lastSeenAt` out of full blob
- Store-size warning threshold in admin store-health
- Alert when any resource field exceeds safe size
- Block base64 at `sanitizedResourceUrl` layer for all store paths

## Tests

```bash
npm run check
npm run test:curriculum-media-migration   # unit + Postgres integration (requires DB URL)
npm run test:curriculum-media-access      # media auth + upload validation (requires DB URL)
node scripts/test-curriculum-uploads-storage.js   # local-json inline path unchanged
```

### Postgres backup scope

Render Postgres backups snapshot the **entire database**, including `llh_store`, `llh_media_assets`, and `llh_curriculum_media_migrations`. No separate backup configuration is required for media tables.

### Logging / migration safety

- Migration progress table stores **checksums and byte counts only** — never binary or base64 payloads.
- API inventory and migration responses expose metadata only (`sha256`, sizes, IDs).
- Server logs on media read/upload failures log `error.message` only, not file bytes.

## Manual checklist (post-migration — for site owner)

See prior deploy checklist in `docs/STORE_WRITE_HARDENING_PLAN.md`, plus:

- [ ] Admin → curriculum resources → open each migrated file
- [ ] Member with Pro access opens linked lesson resource
- [ ] Store export size dropped ~49 MB
- [ ] Admin store-health: full-store write duration improved on save
- [ ] No new inline resources in inventory endpoint
