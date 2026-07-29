# Handoff: Postgres safety emails + “site can’t be found” (2026-07-29)

**For:** next agent / Leah  
**Status as of:** 2026-07-29 ~03:00 UTC  
**Owner action still needed:**
1. **Render:** upgrade web service **Free → Starter** (see `docs/RENDER_STARTER_UPGRADE.md`) — this is the durable Postgres-disconnect fix  
2. **Bluehost:** 301 redirect old domain (see below)

---

## Plain-language summary

1. Leah was getting repeated **`[LLH SAFETY] postgres_disconnect`** emails (`postgres_write_failed` / `Connection terminated unexpectedly`).
2. Some people said the website **“can’t be found.”**
3. We investigated, fixed connection recovery, merged to production, and added keepalive.
4. Official site is healthy. Old domain `littlelearnerhub.com` still does **not** point at this app.
5. **Root cause still live on Render:** production web service plan is **`free`** (spins down). `render.yaml` says `starter`, but the Dashboard instance was never upgraded. API plan change returned HTTP 500 — Leah must flip it in the Dashboard.

---

## What was wrong

### A) Safety emails
- App stores data in Postgres (`llh_store` JSON blob).
- On Render **starter** deploys / cold starts, TCP connections to Postgres get severed mid-write.
- App treated that as `postgres_write_failed` → emailed `postgres_disconnect` → set `databaseReady=false`.
- Not a full DB wipe. Inventory/memberships stayed intact after recovery.

### B) “Can’t be found”
Two separate causes:

| Cause | What happens |
|---|---|
| **Old domain** `littlelearnerhub.com` | DNS still points at **Bluehost/Cloudflare**, not Render. Visitors get Cloudflare challenge / parking — looks broken. |
| **Cold start / deploy 503** | Starter plan spins down; first request can return 502/503 for a bit. Feels like the site is missing. |

**Official working URLs:**
- https://littlelearnershubbyleah.com ← **use this**
- https://www.littlelearnershubbyleah.com → redirects to apex
- https://little-learner-hub.onrender.com

**Broken / not this app:**
- https://littlelearnerhub.com (Bluehost/Cloudflare, HTTP 403 challenge)

---

## What we shipped (merged)

### PR #358 — Postgres pool hardening
- **Merged:** 2026-07-29T02:39:35Z  
- **Merge commit:** `20057ef73f548eb577f6c614dc91832f9a521a3b`  
- **URL:** https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/358  

**Code changes (main ideas):**
- `createConfiguredPostgresPool()` — idle timeout, connection timeout, bounded pool size
- Defensive `pool.on("error")` for idle client drops (no crash)
- `postgresQueryWithTransientRetry()` — **one retry** only for safe/idempotent ops:
  - `SELECT`
  - `CREATE TABLE IF NOT EXISTS`
  - store upsert `ON CONFLICT DO UPDATE`
- Bootstrap insert uses `retries: 0` (no duplicate rows)
- Backups / email campaign claims are **not** retried
- Exhausted failures still set `databaseReady=false` and send **one** safety alert
- Reconnect still reloads from Postgres (never pushes local JSON fallback over production)

**Tests:**
- `npm run test:postgres-pool-hardening`
- Full release gate green on final tip before merge

### PR #359 — Keepalive + sticky error cleanup + domain docs
- **Merged:** 2026-07-29T02:48:46Z  
- **Merge commit:** `0398750186ca720a27e43b012a876d2dc6849faf`  
- **URL:** https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/359  

**Code/ops changes:**
- `.github/workflows/keepalive.yml` — every **10 minutes**, read-only `GET /api/health` for official + www + onrender (reduces starter spin-down)
- Idle pool errors no longer sticky as `lastPostgresError` after DB is healthy again
- Successful readiness probe clears stale `lastPostgresError` when `databaseReady`
- `docs/DOMAIN_DNS_FIX.md` — documents old-domain Bluehost redirect steps

---

## Production verification (after merges)

Checked live:

| Check | Result |
|---|---|
| `/api/health` (apex, www, onrender) | 200, `ok: true`, `launchReady: true` |
| `/api/launch-readiness` | `ready: true`, Postgres `ready: true`, `lastError: ""` |
| `/api/public/home-inventory` | **89** lessons / **1500** activities |
| Founding | 41 claimed / 9 remaining |
| Tiffany `tclashley@icloud.com` | Founding owner, Active, program `prog_c58ca12867729a2e` |
| Shadaisha `ladiisha01@gmail.com` | director, Active, same program, Pro via owner |
| `/login`, `/signup`, `/admin` | 200 |
| Old domain `littlelearnerhub.com` | still **403** (not fixed in app — needs Bluehost) |

Artifacts from investigation/verification:
- `/opt/cursor/artifacts/postgres-disconnect-investigation/`
- `/opt/cursor/artifacts/pr358-release-verification/`

---

## Owner action still required (Leah)

### 1) Upgrade Render Free → Starter (fixes Postgres disconnect root cause)

Follow **`docs/RENDER_STARTER_UPGRADE.md`**.

Short version:
1. Open https://dashboard.render.com/web/srv-d8o3f3r6sc1c73comlc0 → **Settings**
2. **Instance Type:** Free → **Starter** → save (add payment method if asked)
3. Confirm deploy finishes; check `/api/launch-readiness` still shows Postgres ready

Until this is done, Free-tier spin-down can still sever DB connections even with pool retry + keepalive.

### 2) Redirect the old domain (remaining “can’t be found” fix)

In **Bluehost** (nameservers were `ns1.bluehost.com` / `ns2.bluehost.com`):

1. Open DNS / domain forwarding for `littlelearnerhub.com`
2. Set **301 permanent redirect** for apex + `www` → `https://littlelearnershubbyleah.com`
3. Tell members the official link is only **https://littlelearnershubbyleah.com**

App code cannot fix DNS we don’t control. Until Bluehost forwards the old name, old bookmarks will keep looking broken.

### Optional
- Confirm Render auto-deploy of #358/#359/#360 finished (sites were healthy after merge).
- After Starter upgrade, watch whether `[LLH SAFETY] postgres_disconnect` emails stop. Rare emails during a real/long outage are still expected.
- GitHub Actions → **Keepalive** should ping every 5 minutes (and on each `main` push).

---

## What the next agent should / should not do

**Do:**
- Help Leah complete Bluehost redirect if she asks
- Monitor keepalive workflow runs under GitHub Actions → **Keepalive**
- If safety emails continue after keepalive + pool fix are live, pull Render logs (needs Render API auth — was unauthorized in this environment) and check whether writes are still exhausting retries
- Prefer official domain in any member-facing copy

**Do not:**
- Point production at the old domain again as a primary brand URL
- Enable `ALLOW_DESTRUCTIVE_STORE_WRITE` or boot sparse recovery without explicit owner approval
- “Fix” can’t-be-found by guessing — verify whether the user hit `littlelearnerhub.com` vs cold-start 503
- Merge/deploy further DB schema changes without re-checking inventory (89/1500) + launch-readiness

---

## Key files

| File | Why |
|---|---|
| `server/index.js` | Pool hardening, retry helper, reconnect loop, safety alerts |
| `scripts/mock-pg-preload.js` | Dropped-connection mock for pool tests |
| `scripts/mock-pg-admin-sessions-preload.js` | Admin-session mock `pool.on` compatibility |
| `scripts/test-postgres-pool-hardening.js` | Regression suite for disconnect/retry/alerts |
| `.github/workflows/keepalive.yml` | Scheduled health pings (every 5 min + on `main` push) |
| `docs/DOMAIN_DNS_FIX.md` | Official DNS + old-domain redirect instructions |
| `docs/RENDER_STARTER_UPGRADE.md` | **Required** Dashboard steps: Free → Starter |
| `render.yaml` | Declares `starter`; live service was still `free` until Dashboard upgrade |

---

## Quick commands for the next agent

```bash
# Live health
curl -sS https://littlelearnershubbyleah.com/api/health | python3 -m json.tool | head
curl -sS https://littlelearnershubbyleah.com/api/launch-readiness | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["ready"], d["required"]["database"])'
curl -sS https://littlelearnershubbyleah.com/api/public/home-inventory

# Local regression for the pool fix
npm run test:postgres-pool-hardening
npm run test:store-write-race
npm run test:store-safety
npm run test:release   # full release gate (Playwright)

# Old domain still wrong until Bluehost redirect
curl -sSI https://littlelearnerhub.com/ | head
```

---

## Answer bank (for Leah)

| Question | Answer |
|---|---|
| Will the safety emails stop? | Mostly after **Free → Starter** upgrade. #358/#359 already soften blips; Free spin-down is still the root cause until Starter. A real/long outage can still alert once per cooldown. |
| Is the official website working? | Yes — `littlelearnershubbyleah.com` (Postgres ready, 89 lessons / 1500 activities verified). |
| Why do people still say can’t be found? | They’re likely on **`littlelearnerhub.com`** (old Bluehost domain) or hitting a Free-tier cold-start. |
| Was any user/lesson data deleted? | No evidence of loss; inventory and key accounts verified after incident + merges. |
| What does Leah still need to do? | (1) Render Free → Starter. (2) Bluehost 301 redirect old domain → official site. |
