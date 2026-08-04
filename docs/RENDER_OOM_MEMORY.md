# Render OOM: “exceeded its memory limit”

## What the email means

Render killed and restarted the `LITTLE-LEARNER-HUB` web instance because it used more RAM than the instance type allows. During that restart the site is briefly unavailable (often looks like a 502/503).

## Why it happened (production, 2026-07-29)

Measured live store export:

| Piece | Size |
|---|---|
| Full store JSON | **~17.2 MB** |
| `analyticsEvents` (~11.6k events) | **~9.5 MB** |
| Curriculum (`siteContent.curriculum`) | **~6.2 MB** |
| Everything else | ~1.5 MB |

The app keeps this document in memory (`storeCache`). Hot paths still:

1. `structuredClone` the whole store via `readStore()` (many call sites)
2. `JSON.stringify` the whole store on every Postgres upsert

On **Starter** (~512 MB RAM) with `node --max-old-space-size=300`, a spike from:

- bulk curriculum imports (Family Connections weeks)
- admin analytics / store export
- concurrent `readStore()` clones + a full write

…can push the process over the instance limit. That matches Render’s OOM email.

This is primarily **undersized RAM for the current data model**, amplified by full-document clone/write — not a classic unbounded leak.

## Current production (2026-08-04)

| Signal | Value |
|---|---|
| Render plan | **Standard** (memory limit **2048 MB**) |
| Start command | `node server/index.js` (no 300MB V8 cap) |
| Store write payload | **~17.7 MB** JSON |
| Curriculum inventory | **127** lesson plans / **2110** activities |
| 24h RSS | avg **~302 MB**, peak **~589 MB**, latest ~15% of instance |

System Health previously used Starter-era thresholds (**warning 220 / critical 280**). Steady ~300 MB RSS therefore stayed **Critical** across multiple monitor ticks even though the process was only ~15% of Standard RAM. Thresholds now scale from `MONITOR_INSTANCE_MEMORY_MB=2048` (warn ~45% / critical ~70%).

## Immediate fix (Dashboard — do this first)

Upgrade the web service instance type for headroom:

1. Open https://dashboard.render.com/web/srv-d8o3f3r6sc1c73comlc0 → **Settings**
2. **Instance Type**: Starter → **Standard** (2 GB RAM)
3. Save (payment method required)

`render.yaml` now defaults to `standard` and sets `MONITOR_INSTANCE_MEMORY_MB=2048`. Confirm the live Dashboard plan still matches.

## Code relief (this change)

- Cap analytics history at **5,000** events (was 25,000). Override with env `MAX_ANALYTICS_EVENTS`.
- **Boot prune** trims existing history once and persists.
- Admin `store-health` now reports `memory` + `analyticsEvents` counts so you can watch heap/RSS after deploy.

## After deploy — verify

```bash
# Health
curl -sS https://littlelearnershubbyleah.com/api/health

# After admin login, store-health should show analyticsEvents ≤ 5000 and memory.rssMb
# well under the instance RAM (Standard ≈ 2048 MB).
```

In Render → Metrics, confirm memory stays below ~70% after imports/admin use.

## Longer-term (required follow-up)

Standard RAM buys time. The durable fix is to stop keeping growing collections in one in-memory JSON document.

See **`docs/STORE_SPLIT_FOLLOWUP.md`** for the phased plan (analytics → curriculum → messaging → slim account core).
