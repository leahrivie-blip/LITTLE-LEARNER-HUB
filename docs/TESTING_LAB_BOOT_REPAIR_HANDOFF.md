# Testing Lab Boot / Routing Repair — Handoff

**Branch:** `cursor/testing-lab-boot-repair-1ab6`  
**Draft PR:** https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/339  
**Base:** `testing/full-platform-integration-2026-07` only (not `main`)  
**Pre-repair deployed tip:** `cb2c0ab267619022f5dd30e46de806b0afca9c68`

## What was broken on the live testing site

1. **Testing Lab sidebar → Calendar**  
   `setView("testing-lab")` is gated by `isExpansionViewEnabled("testing-lab")`, which needs stored flags + `viewer.canAccessTestingLab` + `ALLOW_TESTING_LAB_ADMIN_PREVIEW` + Admin full access. Feature-flag fetch was fire-and-forget at boot; a click before it resolved failed the gate and silently redirected to Calendar.

2. **“App boot timed out — continuing with local UI”**  
   `initializeAppView()` raced boot work against a 12s timeout and, on timeout, continued with potentially stale identity/permissions — unsafe for authenticated Admin sessions and a contributor to the Calendar bounce.

3. **Add External Tester unreachable** as a consequence of (1)/(2) and the Admin Dashboard maze.

## Fixes in this PR

| Area | Change |
|------|--------|
| Feature flags | `ensureExpansionFeatureFlagsLoaded()`; Testing Lab nav waits; Admin boot awaits flags |
| Admin gates | No silent Calendar bounce for Admin-only expansion tools — `renderAdminExpansionGateDiagnostic` + Try Again |
| Boot failure | Authenticated timeout/failure shows recoverable overlay (“We couldn’t load your account”) |
| Owner Testing Home | New default Admin landing on testing hosts; cards for wizard, feedback, role preview, status, readiness |
| Purchases | Non-production hosts: CTAs relabeled; `startCheckout` / `startProTrial` hard-stop with Upgrade panel (no Stripe, no local “Complete Test Payment”) |
| Copy | Free-plan lesson-line dedupe; testing-host founding price-lock phrasing |
| Signed-out Admin | Cleaner unlock screen; hide purchase/nav chrome |

## PR #334 audit (report only — do not re-merge)

- PR #334 (**Fast Daily Logs redesign**) is **already MERGED** into `testing/full-platform-integration-2026-07` as `679bd68a38a4db4b8275dae8aa9109f7b532976c` (2026-07-25).
- Remediation items (group log, undo, medication safety, Create Parent Summary, corrections, photos, etc.) are present in the codebase at and after `cb2c0ab2`.
- If the live testing site still shows the old Daily Logs UI, treat it as a **deploy/cache** issue, not “never merged.”
- This repair PR does **not** re-land #334.

## Tests run

| Suite | Result |
|-------|--------|
| `npm run check` | pass |
| `npm run test:homepage-smoke` | pass (desktop + mobile) |
| `npm run test:testing-lab-routing-fix` | pass (3) |
| `npm run test:owner-testing-home-acceptance` | pass (33) |
| `npm run test:admin-preview-escape` | pass (9) |
| `npm run test:admin-clickability-visual` | pass (8) |

## Screenshots

`docs/screenshots/testing-lab-boot-repair/`

1. `1-signed-out-admin.png`
2. `2-owner-testing-home.png`
3. `3-add-external-tester-wizard.png`
4. `4-provider-home-daycare.png`
5. `5-parent-home-daycare.png`

Capture: `node scripts/capture-testing-lab-boot-repair-screens.js`

## Remaining limitations

- Testing Lab full wizard remains **Computer Recommended** on phone (honest status, not a blank page) — pre-existing; acceptance covers Provider/Parent on phone via API-created tester.
- Purchases on testing hosts never run Stripe **or** the old local “Complete Test Payment” simulator from purchase CTAs (by design).
- Live site will not pick this up until this draft PR is reviewed, merged into the testing branch, and that branch is redeployed (not done by this agent).

## Constraints honored

- No merge to `main` / production  
- No production deploy  
- No Stripe / email / SMS / OpenAI enablement  
- No Phase 24  
- Fake data only in tests and screenshots  
