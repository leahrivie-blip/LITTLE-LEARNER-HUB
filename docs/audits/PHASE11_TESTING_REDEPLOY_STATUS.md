# Phase 11 — Testing Redeploy Status

**Updated:** 2026-08-08  
**Branch to deploy:** `cursor/phase11-final-qa-fix-wave-4eae`  
**Commit:** `3acd23b` (+ follow-up tracker commit on same branch)  
**Expected testing shell:** `20260808-phase11-fix-wave`

---

## Services

| Service | ID | Action |
|---|---|---|
| Testing | `LITTLE-LEARNER-HUB-testing` · `srv-d9fsap7jqk9s73806iag` | **Redeploy this branch only** |
| Production | `srv-d8o3f3r6sc1c73comlc0` | **DO NOT DEPLOY** |

---

## Current remote probes (this agent)

| Probe | Result |
|---|---|
| Testing shell (before redeploy) | `20260808-phase11-final-qa` — **stale vs fix-wave** |
| Testing HDH | `homeDaycareHubTesting: true` |
| Production shell | `20260808-cookie-cta` |
| Production HDH | `homeDaycareHubTesting: false` |
| Agent `RENDER_API_KEY` | **Not available** — owner must redeploy via Render Dashboard or local `npm run deploy:testing-only-phase11` |

---

## Owner redeploy steps (testing only)

1. Open Render → **little-learner-hub-testing** only  
2. Deploy branch `cursor/phase11-final-qa-fix-wave-4eae` (clear build cache recommended)  
3. Confirm:

```bash
curl -sS https://little-learner-hub-testing.onrender.com/llh-shell-manifest.json
# expect: "version": "20260808-phase11-fix-wave"

curl -sS https://littlelearnershubbyleah.com/llh-shell-manifest.json
# must remain: "version": "20260808-cookie-cta"
```

4. Do **not** deploy production.

---

## Safety

- No production deploy attempted by this agent  
- No production env writes  
- No database wipe  
- Curriculum content/covers deferred (not part of this redeploy purpose beyond code/system fixes)
