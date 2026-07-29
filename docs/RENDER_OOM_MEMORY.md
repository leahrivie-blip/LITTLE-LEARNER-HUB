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

## Immediate fix (Dashboard — do this first)

Upgrade the web service instance type for headroom:

1. Open https://dashboard.render.com/web/srv-d8o3f3r6sc1c73comlc0 → **Settings**
2. **Instance Type**: Starter → **Standard** (2 GB RAM)
3. Save (payment method required)

`render.yaml` still says `starter` for Blueprint defaults; the live Dashboard plan is what matters. Standard is the practical short-term fix while the store stays one large JSON document.

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

## Longer-term (optional)

- Prefer `peekStore()` on more read-only handlers (avoid clones).
- Move analytics events out of the main `llh_store` JSONB blob.
- Split curriculum into its own table/document so lesson imports do not rewrite users/messages/etc.
