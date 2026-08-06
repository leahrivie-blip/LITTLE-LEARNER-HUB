# Phase 1–2 Testing Integration Report

**Integration PR:** [#549](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/549)  
**Integration branch:** `cursor/phase1-2-testing-integration-9026`  
**Target (verified live):** `cursor/family-hub-testing-readiness-d3df`  
**Testing service:** `https://little-learner-hub-testing.onrender.com` (`srv-d9fsap7jqk9s73806iag`)  
**Do not merge to `main`. Do not touch production** (`srv-d8o3f3r6sc1c73comlc0`).

## Verified testing-service branch

From live `GET /api/build-version` on the testing host (not docs):

| Field | Value |
|---|---|
| branch | `cursor/family-hub-testing-readiness-d3df` |
| commit (pre-integration) | `629db4d29dde8703a32efff7742f9d7c27aef3a5` |
| serviceId | `srv-d9fsap7jqk9s73806iag` |

Production (unchanged reference):

| Field | Value |
|---|---|
| branch | `main` |
| commit | `5b61f1a241ab8f95800bdbe889dd05a31f02c90f` |
| serviceId | `srv-d8o3f3r6sc1c73comlc0` |

## Integration contents

Cherry-picked onto the testing branch tip (no duplicate PR merges):

1. Phase 1 onboarding / role navigation (`aedcae2`, `ad5f392`)
2. Phase 2 Daily Logs / attendance / mutations / conflict UI / IndexedDB queue / logout safety (`4a3b64e` … `5ba514c`)
3. Conflict-marker fix for Teacher Today allergy banner + greeting (`958c7eb`)
4. Integration hardening (`ef9b7d8`): ack’d mutation local merge; testing-host empty-program seed opt-out for regression; nav shell-version + cross-program isolation proof

Supersedes draft PRs **#546** and **#548** (closed; history preserved; do not merge those separately).

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

Merge gate: Phase 1–2 approved suites green; permission-matrix baseline unchanged.

## Post-deploy (filled after testing merge)

| Field | Value |
|---|---|
| Integration PR | #549 |
| Final testing branch | `cursor/family-hub-testing-readiness-d3df` |
| Final commit SHA | _(pending merge)_ |
| Render testing deployment ID | _(pending)_ |
| Production SHA unchanged | _(pending)_ |
| Production data unchanged | _(pending)_ |
| Teaching Kit customer flags | _(pending)_ |
| Testing `/api/health` | _(pending)_ |
| Smoke tests | _(pending)_ |
| Console / network errors | _(pending)_ |
