# Work handoff (saved 2026-07-11 night)

Branch: `cursor/playwright-e2e-1b07`

## Decision for next session

**Pause the large Playwright suite.** Prefer the existing fast local Node QA scripts for verifying curriculum works.

## QA progress (local isolated server — no production)

| Step | Status | Result |
|------|--------|--------|
| 1. Boot + sanity (`npm run check` + isolated server) | **Done** | Pass |
| 2. Admin → Publish → Public (`npm run test:curriculum-publish`) | **Done** | **14/14 pass** |
| 3. Curriculum UX (`npm run test:curriculum-ux`) | **Done** | **All areas A–H pass** |
| 4. Gap audit (Free/Pro, featured, nav/back, empty states) | **Not started** | — |
| 5. Final QA report | **Not started** | — |

### Bugs found so far in Steps 1–3
**None.** Publish flow, draft/public visibility, edit/unpublish/republish, resource linking, activity sync, search haystack, category aliases, and desktop+mobile browser UX checks all passed.

## Resume tomorrow

```bash
git fetch origin
git checkout cursor/playwright-e2e-1b07
npm install

# Fast checks (preferred):
npm run check
npm run test:curriculum-publish
npm run test:curriculum-ux

# Then continue Step 4 gap audit from the QA plan.
```

## Playwright WIP (paused — not the priority)

Scaffold + stability fixes are on this branch but **not fully green** and **not needed** for the current QA approach. Do not merge Playwright until explicitly resumed.

Uncommitted Playwright fixes that were saved in this commit:
- `free-port.js`, fresh store per run
- `waitForAppReady` (don’t wait on hidden home search)
- logged-out access test expects login modal
- stress lesson import format fix
- navigation/back assertions adjusted for SPA

## Test credentials (isolated only)

- Admin: `e2e-admin@test.local` / `e2e-admin-pass-1b07` / `e2e-admin-code-1b07`
- Never use production credentials for these checks
