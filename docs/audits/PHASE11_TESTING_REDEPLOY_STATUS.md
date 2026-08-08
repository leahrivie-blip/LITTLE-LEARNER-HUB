# Phase 11 — Testing-only redeploy status

**Date:** 2026-08-08  
**Target:** `little-learner-hub-testing` → branch `cursor/phase11-final-qa-production-readiness-9c23` @ `4474dff` / shell `20260808-phase11-final-qa`  
**Production:** **not** deployed / **not** modified  

---

## Executive status

**TESTING-ONLY redeploy could not be executed from this agent.**

| Requirement | Status |
|---|---|
| Deploy only `little-learner-hub-testing` | ⛔ Blocked — missing credentials |
| Do not merge/deploy production | ✅ Honored |
| Preserve testing DB / curriculum / FH / Forms / Tuition / testers | ✅ No wipe attempted (no deploy ran) |
| Confirm Phase 11 shell on live testing | ❌ Still `20260805-testing-full-integration-r8` |
| Re-run smoke against live testing URL | ✅ Ran (baseline) — shell mismatch FAIL |
| Soft-fail curriculum viewer/print classified + fixed | ✅ Fixture/test-only; suite now PASS |

---

## 1. Remote testing deploy ID

**N/A — no deploy was triggered.**

Required to proceed:

- `RENDER_API_KEY`
- `RENDER_TESTING_SERVICE_ID` (must **not** be production `srv-d8o3f3r6sc1c73comlc0`)

Safe helper ready once secrets exist:

```bash
RENDER_API_KEY=... RENDER_TESTING_SERVICE_ID=srv-... npm run deploy:testing-only-phase11
```

(`scripts/deploy-testing-only-phase11.js` refuses the production service id and refuses non-testing service names.)

Manual Render path (owner):

1. Open **only** `little-learner-hub-testing`  
2. Deploy branch `cursor/phase11-final-qa-production-readiness-9c23` @ `4474dff`  
3. Do **not** clear Postgres / wipe data  
4. Do **not** deploy production  

---

## 2. Remote testing version / commit

| Surface | Value |
|---|---|
| Remote testing shell (live now) | `20260805-testing-full-integration-r8` |
| Remote testing cache | `llh-shell-v188-testing-full-integration-r8` |
| Target shell | `20260808-phase11-final-qa` |
| Local / branch commit | `4474dff` |
| Remote production shell (unchanged) | `20260808-cookie-cta` |

---

## 3. Does remote testing match local Phase 11?

**No.**

Remote smoke (`npm run test:remote-testing-smoke-phase11`):

- ❌ shell manifest / SW / index cache-bust still on `20260805…`  
- ✅ `/api/health` ok, `homeDaycareHubTesting: true`  
- ✅ curriculum public library **127** lesson plans present  
- ✅ HDH features include family-hub, forms-pack, family-tuition, ai-drafts  
- ✅ production still `20260808-cookie-cta` with HDH off  

Artifact: `/opt/cursor/artifacts/phase11-final-qa/remote-testing-smoke.json`

---

## 4. Live-only bugs found

None attributable to a completed Phase 11 testing redeploy (redeploy did not happen).

Baseline notes on current stale testing host:

- Curriculum count already at **127** (good for post-deploy verification target).  
- Shell/version markers are the primary mismatch vs local Phase 11.

### Curriculum viewer/print soft-fail — classification

**Verdict: test-fixture / outdated-test issue — not a real product print/viewer bug.**

| Finding | Detail |
|---|---|
| Original soft-fail | Publish returned 400: missing activities on **thursday, friday** |
| Product rule | Intentional: published plans must have titled activities every weekday so the viewer never shows empty weekdays |
| Sample used by test | `label-only-garden-scientists-v3.txt` only has Mon–Wed activity items |
| Secondary outdated assertion | Guest `/api/site-content` no longer unlocks full `dailyPlans` for non-curated Free plans (curated Free Starter Library policy) |
| Fix applied | Enrich Thu/Fri in-test; update visibility assertions to curated-lock policy |
| Result | `npm run test:curriculum-viewer-print` → **PASS** |

Print/render model checks (screen + print HTML) were already healthy; the failure was publish/visibility harness expectations.

---

## 5. Updated readiness percentage

**~98%** — unchanged as a release percentage while live testing shell is stale.

Do **not** move tracker to **100%** until live testing serves `20260808-phase11-final-qa` and remote smoke PASSes.

---

## 6. Ready for tester review: **No**

Testers should not be pointed at the live testing URL for Phase 11 sign-off until the testing service is redeployed to `4474dff` / `20260808-phase11-final-qa`. Local QA remains strong; remote shell is behind.

---

## 7. Ready for production approval: **No**

Production remains untouched and must stay that way until:

1. Testing-only redeploy succeeds and remote smoke PASSes  
2. Leah gives **explicit written** production deploy approval  

---

## What was committed for this step

- Soft-fail fix: `scripts/test-curriculum-viewer-print.js`  
- Remote smoke: `scripts/test-remote-testing-smoke-phase11.js`  
- Safe testing deploy helper: `scripts/deploy-testing-only-phase11.js`  

---

## STOP

**No production deploy. No production env changes. No DB wipe.**
