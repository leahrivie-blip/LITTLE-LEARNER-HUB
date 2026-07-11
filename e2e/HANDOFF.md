# Work handoff (updated 2026-07-11)

Branch: `cursor/playwright-e2e-1b07`

## Decision

**Playwright E2E paused** — user may skip entirely. Use fast local Node QA scripts for curriculum verification.

## QA progress (local isolated server — no production)

| Step | Status | Result |
|------|--------|--------|
| 1. Boot + sanity (`npm run check` + isolated server) | **Done** | Pass |
| 2. Admin → Publish → Public (`npm run test:curriculum-publish`) | **Done** | **14/14 pass** |
| 3. Curriculum UX (`npm run test:curriculum-ux`) | **Done** | **All areas A–H pass** |
| 4. Gap audit (`npm run test:curriculum-gap`) | **Done** | **Pass** |
| 5. Final QA report | **Done** | See below |

### Step 4 coverage (`scripts/test-curriculum-gap-qa.js`)

- Archived lessons hidden from public API
- Broken resource file returns 404/400
- Activity sync count integrity
- Logged-out users blocked from lessons (login modal)
- Pro / Trial unlock Pro lessons; Free cannot bypass via View Activities
- Viewer open/close and lesson library back navigation
- Mobile nav (412px) + horizontal overflow check
- Static checks: guest access, activity filter banner controls

### Bugs found

| Severity | Issue | Location | Fix now? |
|----------|-------|----------|----------|
| **Medium** | Pro subscribers with `$19.99/month` billing can be misclassified as **Founding** because `monthlyPrice.includes("9.99")` matches the substring in `19.99` | `app.js` → `subscriptionToAccountUpdates()` ~line 2684 | Yes — use exact price/plan match, not substring |

**No Critical or High bugs** in publish, UX, or gap flows. Curriculum publish → public → viewer → activities → search → access gating all work on isolated QA.

### QA test note (not a product bug)

Browser persona tests must **seed server-side subscription records** (`store.users`) before page load. Analytics creates a Free server user on first visit; `syncSubscriptionFromBackend` then overwrites local Pro accounts unless the server already has an active subscription. Gap script handles this via `seedServerPersonas()` + isolated `LLH_STORE_PATH`.

## Fast verification commands

```bash
git checkout cursor/playwright-e2e-1b07
npm install

npm run check
npm run test:curriculum-publish
npm run test:curriculum-ux
npm run test:curriculum-gap
```

## Playwright WIP (paused)

Scaffold on branch; blocker spec passed alone; full suite not green. Do not merge unless explicitly resumed.
