# Production Memory Investigation Report

**Date:** 2026-08-04  
**Service:** `LITTLE-LEARNER-HUB` (`srv-d8o3f3r6sc1c73comlc0`)  
**Branch:** `cursor/production-memory-investigation-8af4`

## Verdict

Persistent System Health **Critical** for memory was not an unbounded leak and not an imminent Standard-instance OOM. Steady RSS of ~300 MB (~15% of the **2048 MB** Standard limit) was classified critical because thresholds were still the Starter-era absolutes (**220 / 280 MB**). Emails minutes apart stayed critical because those thresholds are below normal operating RSS after curriculum growth.

## Memory before optimization (production, last 24h)

| Metric | Value |
|---|---|
| Instance plan / limit | Standard / **2048 MB** |
| RSS average | **301.7 MB** |
| RSS peak | **588.9 MB** (2026-08-04T11:00Z) |
| RSS latest (sample) | **307.4 MB** (~15% of instance) |
| Points ≥ 280 MB critical | **162 / 289** (~56% of samples) |
| Points ≥ 220 MB warning | **214 / 289** |
| Heap during admin analytics | ~53–170 MB (recoverable) |
| Full-store write payload | **~17.7 MB** JSON |
| Curriculum inventory | **127** lessons / **2110** activities |
| Public `/api/site-content` | ~865 KB (~84 KB gzipped) |

## Root causes found

1. **Miscalibrated System Health thresholds** — warning 220 / critical 280 assumed Starter + `--max-old-space-size=300`. Production is already Standard 2GB with uncapped V8 (`node server/index.js`). Normal RSS permanently trips Critical.
2. **Large shared JSON document in RAM** — `storeCache` still holds ~17.7 MB JSON (much larger as JS objects), rewritten on many mutations.
3. **Analytics history still in the blob** — high-volume events go to `llh_analytics_events`, but up to 5k events could remain in `store.analyticsEvents`, amplifying every `structuredClone` / `JSON.stringify`.
4. **Duplicate curriculum work** — `normalizedCurriculumStore` + library DTO rebuild on every `/api/site-content` (2k+ activities).
5. **Read paths still cloning** — lesson/activity/Teaching Kit viewers used `readStore()` → `structuredClone(storeCache)`.
6. **Admin analytics fetch default** — up to 10k / 120 days pulled into Node per admin dashboard open.
7. **Alert idempotency bug** — Resend hour-scoped keys + changing RSS body → 409; `markAlertsSent` skipped on failure → retry spam after deploys.

Not found: unbounded listener/timer leak, image buffer cache growth, or continuous post-GC climb independent of traffic/deploys.

## Fixes applied

| Fix | Effect |
|---|---|
| Thresholds scale from `MONITOR_INSTANCE_MEMORY_MB` (2048 → warn ~921 / critical ~1433) | ~300 MB RSS is **healthy** on Standard |
| Clear `analyticsEvents` from `llh_store` blob at Postgres boot | Shrinks retained store + write payloads |
| 30s curriculum library DTO cache | Cuts repeated normalize/DTO allocation |
| Lesson / activity / Teaching Kit reads use `peekStore()` | Avoids full-store clone on hot viewers |
| Admin analytics/insights fetch capped (5k / 90d) | Smaller admin heap spikes |
| Treat Resend 409 as alert already sent | Stops monitor email retry loops |
| `render.yaml` → `standard`, uncapped start, `MONITOR_INSTANCE_MEMORY_MB=2048` | Blueprint matches live reality |

## Memory after optimization (expected / local profile)

| Metric | Expected |
|---|---|
| Production steady RSS | Still ~200–350 MB baseline (Node + curriculum + `app.js` cache); no longer Critical |
| Peak RSS under normal admin use | Should remain well under **921 MB** warning / **1433 MB** critical |
| Store blob | Smaller once analytics array cleared on boot |
| System Health memory state at ~300 MB RSS | **healthy** |

Local workflow profile is written by `npm run test:memory-profile` → `docs/MEMORY_WORKFLOW_PROFILE.json`.

## Infrastructure upgrade recommendation

**No further instance upgrade required right now.** Production is already on Standard (2GB). Peak ~589 MB is ~29% of limit. Revisit Standard → Pro only if, after these fixes, sustained RSS approaches ~70% of instance (~1.4 GB) during normal usage.

Longer-term: continue `docs/STORE_SPLIT_FOLLOWUP.md` (curriculum out of the mega-document) so imports and clones stop touching the full account store.

## Verify after deploy

```bash
curl -sS https://littlelearnershubbyleah.com/api/health
# Admin → System Health: memory check should be healthy at ~300MB RSS
# Render metrics: RSS stays comfortably below ~921MB warning during normal use
```

## Ops note (2026-08-04)

While setting `MONITOR_*` via the Render API, `PUT /v1/services/.../env-vars` **replaced** the entire env list (API semantics: non-listed keys are removed). The live process kept working because env updates do not auto-deploy. Recoverable vars were restored; Stripe/Resend/Meta CAPI secrets must be re-pasted in the Dashboard **before** the next deploy/restart. Prefer merge-style updates (`update_environment_variables` / Dashboard add) going forward — never full PUT replace unless the complete set is known.
