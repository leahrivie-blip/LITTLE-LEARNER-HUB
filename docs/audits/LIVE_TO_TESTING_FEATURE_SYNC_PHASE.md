# Live → Testing Feature Sync (dedicated phase)

**Status:** Planned — runs **after** AI review-before-save, **before** Final QA / production readiness  
**Spine:** HDH / `main` testing architecture remains source of truth  
**Fence:** TESTING only — do **not** publish to production in this phase  

---

## Purpose

Bring the **testing site** to user-facing feature parity with the **current live site**, so all future development happens in one place.

This is **feature synchronization**, not an architecture merge.

### Explicitly do NOT

- Merge admin architectures (keep testing Owner Admin; do not replace with production admin)
- Merge `origin/testing/full-platform-integration-2026-07` (July Testing Lab / foundation orgs)
- Merge legacy testing systems or different organization models
- Overwrite newer testing work on HDH/`main`
- Regress completed testing functionality (Owner Admin Testers, Family Hub, Forms spine, etc.)
- Deploy or publish curriculum/data to production

### Resolve conflicts with

Current **HDH / `main`** testing architecture.

---

## Placement in roadmap

1. Safety + HDH/`main` confirmation ✅  
2. Owner Admin (tester control + dashboard polish) ✅ / stabilize during owner validation  
3. Navigation cleanup  
4. One source of truth (children / staff / families)  
5. Daily operations  
6. Family Hub  
7. Forms  
8. Billing (testing)  
9. AI review-before-save  
10. **Live → Testing Feature Sync** ← this phase  
11. Final QA, bug fixing, performance, production readiness  

---

## Method

1. **Compare** live vs testing feature-by-feature (user-facing surfaces first).  
2. **Produce a checklist** of differences (identical / missing / diverged / redesign).  
3. **Migrate safely** onto HDH testing spine (port UX + behavior, not parallel stacks).  
4. **Skip or redesign** when live behavior conflicts with newer testing architecture.  
5. **Deliver** the parity report below — then Final QA tests the complete app once.

### Candidate areas (examples — confirm against live)

| Area | Notes |
|---|---|
| Lesson Plans / Teaching Kit | Prefer newer TK work already on `main` |
| Activity Center | Port gaps only |
| Calendar | Keep child-link + daily-log connections |
| Child Profiles | Prefer one source of truth work if already started |
| Documentation Helpers | Port improvements |
| Daily Logs | Prefer testing improvements |
| Behavior & Support | Gap check |
| Settings | Gap check |
| Marketing / Homepage | Port only if testing marketing trails live |
| Customer dashboard | Prefer testing Owner/Provider home if newer |
| Subscription experience | Testing simulator ≠ live Stripe — document intentionally |
| Print / download / cover artwork | Prefer repaired TK print on `main` |
| Lesson viewer / AI editing | Prefer current `main` |
| Production-only admin tools | Migrate **individually** only if they fit Owner Testing Admin |

---

## Deliverable checklist (fill at end of phase)

### Features already identical

- [ ] _(list)_

### Features migrated

- [ ] _(list)_

### Features intentionally skipped

- [ ] Production admin command center (keep separate)  
- [ ] July Testing Lab / foundation org stack  
- [ ] Live Stripe production billing wiring on testing (use testing billing instead)  
- [ ] _(add others)_

### Features needing redesign instead of migration

- [ ] _(list — e.g. org model differences)_

### Remaining differences between Live and Testing

- [ ] _(list — expected deltas after sync)_

---

## Exit criteria

- Testing site contains every **user-facing** live feature that belongs on the HDH spine (or is documented as intentionally skipped / redesign).  
- Owner Admin testing console remains the development/admin environment.  
- No production publish from this phase.  
- Final QA can treat testing as the single complete application under test.
