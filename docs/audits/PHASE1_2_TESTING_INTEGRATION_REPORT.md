# Phase 1–2 Testing Integration Report

**Integration PR:** [#549](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/549) (**MERGED**)  
**Integration branch:** `cursor/phase1-2-testing-integration-9026`  
**Target (verified live):** `cursor/family-hub-testing-readiness-d3df`  
**Testing service:** `https://little-learner-hub-testing.onrender.com` (`srv-d9fsap7jqk9s73806iag`)  
**Do not merge to `main`. Do not touch production** (`srv-d8o3f3r6sc1c73comlc0`).

## Verified testing-service branch

From live `GET /api/build-version` on the testing host (not docs):

| Field | Pre-integration | Post-integration |
|---|---|---|
| branch | `cursor/family-hub-testing-readiness-d3df` | `cursor/family-hub-testing-readiness-d3df` |
| commit | `629db4d29dde8703a32efff7742f9d7c27aef3a5` | `2d8b7239884f3dce2fb03e7244c0b0617684d442` |
| serviceId | `srv-d9fsap7jqk9s73806iag` | `srv-d9fsap7jqk9s73806iag` |

Production (unchanged):

| Field | Value |
|---|---|
| branch | `main` |
| commit | `5b61f1a241ab8f95800bdbe889dd05a31f02c90f` |
| serviceId | `srv-d8o3f3r6sc1c73comlc0` |

## Integration contents

Cherry-picked onto the testing branch tip (no duplicate PR merges):

1. Phase 1 onboarding / role navigation
2. Phase 2 Daily Logs / attendance / mutations / conflict UI / IndexedDB queue / logout safety
3. Conflict-marker fix for Teacher Today allergy banner + greeting
4. Integration hardening: ack’d mutation local merge; testing-host empty-program seed opt-out for regression; nav shell-version + cross-program isolation proof

Supersedes draft PRs **#546** and **#548** (closed; history preserved; do not merge those separately).

Merge commit of #549: `a17cfbdab925582b4d5b0aa2da9a4d026ceefa5b`  
Final testing tip (docs retarget): `2d8b7239884f3dce2fb03e7244c0b0617684d442`

## Cleanliness gate

- No `_tmp` screenshot scripts in tree  
- No committed screenshots/artifacts  
- No `render.yaml` / production-env inventory changes  
- No Stripe / Teaching Kit customer-flag / production DB config changes in the integration diff  
- Diff vs testing base limited to app/server/tests/docs/styles/package test scripts  

## Pre-merge regression (final integration commit)

| Suite | Result |
|---|---|
| `npm run check` | PASS |
| `test:nav-role-experience` | PASS (all) |
| `test:daily-logs-attendance` | PASS (15/15) |
| `test:child-data-mutations` | PASS |
| `test:child-data-durable-queue` | PASS (queue, rebase, logout, account/program switch, mobile conflict, Attendance/Meal/Nap/Activity/Note/Diaper cases) |
| `test:pass3-permission-matrix` | **170/176** — identical 6 failures on pure testing tip `629db4d` (teacher/assistant settings sidebar). **Not introduced by Phase 1–2.** |

## Post-deploy verification

| Field | Value |
|---|---|
| Integration PR | **#549** (merged) |
| Final testing branch | `cursor/family-hub-testing-readiness-d3df` |
| Final commit SHA | `2d8b7239884f3dce2fb03e7244c0b0617684d442` |
| Render testing deployment ID | **Unavailable** — Render MCP/API unauthorized in this environment (`RENDER_API_KEY` empty). Live `/api/build-version` confirms service `srv-d9fsap7jqk9s73806iag` serving the final SHA after auto-deploy. |
| Production SHA unchanged | **Yes** — still `5b61f1a241ab8f95800bdbe889dd05a31f02c90f` on `main` / `srv-d8o3f3r6sc1c73comlc0` |
| Production data unchanged | **Yes** — no production deploy, no production env writes, no production DB operations |
| Teaching Kit customer flags | **Off** — `GET …/teaching-kit` → `404 teaching_kit_disabled` on testing; production `homeDaycareHubTesting=false`, `aiGuideEnabled=false` |
| Testing `/api/health` | **ok: true** (`homeDaycareHubTesting: true`) |
| Smoke tests | Homepage + static assets + `/api/health` + `/api/build-version` + `/api/launch-readiness` → HTTP 200; work-nav markers present (`data-work-nav-root`, Daily Logs) |
| Console / network errors | **None** on guest homepage load (clean Playwright smoke) |

**Stopped here for manual review before Phase 3 / external testers.**
