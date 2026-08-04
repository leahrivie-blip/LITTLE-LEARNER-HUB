# Family Hub Testing Readiness Remediation

**Date:** 2026-08-03  
**Environment:** Testing only (`https://little-learner-hub-testing.onrender.com`)  
**Branch:** `cursor/family-hub-testing-readiness-d3df`  
**Production:** not modified, not deployed, Family Hub remains fenced off  

---

## Recommendation

**Needs more work before testing on the live testing host** — code is ready for limited internal testing once the testing service storage is made durable.

Locally / after durable storage is configured on the testing Render service: **Ready for limited internal testing**.

Updated **beta readiness score: 5 / 10** (was 3/10).  
Still not ready for outside parents.

---

## 1. Loading issue — root cause + fix

### Root cause
`loadFamilyHubParentDashboard()` could **return silently** when auth headers or the mount node were missing, while the UI still showed **“Loading your household…”**. There was also no request timeout, so a hung `/api/family-hub/me` call left the page spinning forever. The Playwright wait condition treated “Loading…” as success (`text.length > 20`).

### Fix
- Always render a helpful error/empty/retry state (never an infinite loader)
- 12s abort timeout on `/me` and login
- Load-id guard against stale renders
- Explicit handling for missing session, 401, 410 expired, 404 revoked, 5xx, network failures, empty children
- Retry + sign-out actions on failure

---

## 2. Testing database — root cause + fix

### Root cause (verified on live testing health/launch-readiness)
Testing service reports:

```json
"database": {
  "ready": false,
  "provider": "postgres",
  "localJsonPath": "/tmp/llh-testing-store.json",
  "lastError": ""
}
```

Interpretation:
1. `DATABASE_PROVIDER=postgres` but Postgres is **not ready** (likely missing/unusable `PRODUCTION_DATABASE_URL`; empty `lastError` means credentials were never successfully used).
2. `LLH_STORE_PATH=/tmp/llh-testing-store.json` is **ephemeral**.
3. Critical app behavior: when Postgres is configured but not ready, `writeStore()` keeps changes **in memory only** (does not even write `/tmp`). Family Hub invites appeared to succeed, then vanished on restart.

### Fix in code
- `server/family-hub-lib.js` + `persistFamilyHubStore()` durability gate
- Family Hub create / redeem / login / revoke / seed **fail with HTTP 503** unless storage is durable
- `GET /api/family-hub/storage` and health `homeDaycareHub.familyHubStorage` expose durability status
- Test runners set `LLH_ALLOW_EPHEMERAL_FAMILY_HUB=true` for temp JSON files only

### Required ops step on Render testing (manual — this agent has no Render API access)
Choose **one**:

**Option A (preferred): reconnect testing Neon/Postgres**
- Set `DATABASE_PROVIDER=postgres`
- Set valid `PRODUCTION_DATABASE_URL` for the **testing** Neon DB (not production)
- Remove `/tmp` store path override, or stop relying on it
- Confirm `GET /api/launch-readiness` → `required.database.ready === true`
- Confirm `GET /api/family-hub/storage` → `storage.durable === true`

**Option B: local-json on a persistent disk**
- Attach a Render Disk (e.g. `/var/data`)
- `DATABASE_PROVIDER=local-json`
- `LLH_STORE_PATH=/var/data/llh-testing-store.json`
- Do **not** use `/tmp`

Until one of these is done on the testing service, Family Hub invite creation correctly returns **503** and internal parent testing should not start on that host.

---

## 3. Invite flow

Verified in automated suite (`npm run test:family-hub-testing-readiness`):

| Case | Result |
|------|--------|
| Invite creation | Pass (when durable) |
| Magic link peek/redeem | Pass |
| 6-digit code login | Pass |
| Accept invite | Pass |
| Expired invite | 410 |
| Revoked invite | 404 |
| Invalid invite | 404 |
| Duplicate invite | Replaces prior active invite |
| Multiple children | Pass (seed + create) |
| Multiple guardians | Pass (primary + second guardian, same code) |

### Email disabled handoff
If support email is not configured, provider UI shows an explicit **testing handoff**: copy magic link + login code. Seed demo also prints parent/guardian emails + code.

---

## 4–5. Parent experience + navigation

- Testing preview banner on parent view
- Parent-only chrome (`body.family-hub-parent-mode`): hides sidebar, pricing/upgrade CTAs, provider search, tester sticky chrome for pure parents
- Provider preview keeps a compact “Exit parent preview” path only
- Coming Soon cards for Messaging, Calendar, Attendance, Form signing
- Shared Daily Reports / Photos / Observations render when `shareWithFamily` data exists server-side; otherwise friendly Coming Soon empty states
- No fake action buttons for unfinished workflows

---

## 6. Nice-to-have: shareWithFamily → `/me`

Wired. `GET /api/family-hub/me` now returns:

```json
{
  "shared": { "reports": [], "photos": [], "observations": [] },
  "documents": [],
  "comingSoon": []
}
```

Documents prefer live program child data when available, else invite snapshot.

---

## 7. Seeded testing household

`POST /api/family-hub/seed-demo` (provider auth, testing fence):

- Provider = logged-in tester
- Parent `familyhub.demo.parent@llh.test`
- Guardian `familyhub.demo.guardian@llh.test`
- Children Ava Demo + Milo Demo
- Shared reports, photos, observations
- Sample documents + magic link + login code

Also available in Hub UI: **Seed demo household**.

---

## Files changed

- `server/family-hub-lib.js` (new)
- `server/index.js` (Family Hub persistence, shared feed, seed/storage routes, guardian login)
- `app.js` (loading states, parent chrome, Coming Soon, seed/invite UX)
- `styles.css` (parent-only shell + preview styles)
- `index.html` / `service-worker.js` / `llh-shell-manifest.json` (cache bump `20260803-family-hub-ready`)
- `scripts/test-family-hub-testing-readiness.js` (new)
- `scripts/test-home-daycare-hub-step-*.js` / walkthrough (shell + ephemeral allow)
- `package.json` (`test:family-hub-testing-readiness`)
- `docs/audits/FAMILY_HUB_TESTING_READINESS_REMEDIATION.md` (this file)

---

## Tests added / run

**Added**
- `npm run test:family-hub-testing-readiness`

**Run**
- `node --check` on touched JS
- `npm run test:family-hub-testing-readiness` ✅
- `npm run test:home-daycare-hub-step-d` (run in same session)
- Production fence still asserted (404 when `HOME_DAYCARE_HUB_TESTING` off)

---

## Remaining blockers (before internal testers on the live testing URL)

1. **Make testing Render storage durable** (Postgres URL or disk path) — required
2. Deploy **this branch to the testing service only** (not production)
3. Run Seed demo / create invite on testing and smoke magic-link on a phone
4. Confirm email handoff copy is understood by the internal group

## Still out of scope (intentionally)

Messaging product, push notifications, attendance system, e-sign, calendar product, production enablement.
