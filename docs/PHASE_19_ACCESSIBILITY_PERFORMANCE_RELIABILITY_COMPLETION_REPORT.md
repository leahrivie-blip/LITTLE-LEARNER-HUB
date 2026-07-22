# Phase 19 — Accessibility, Performance, Reliability, and Recovery

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing foundations only)  
**Date:** 2026-07-22  
**Started from tip:** `c3a54be118ae4018b53e32552b891c5c002e0f08`

## What changed

Shared client foundations and Testing Lab admin tools to make Director, Teacher, Staff, Forms, Family Hub, Billing Simulator, and Testing Lab experiences more accessible, faster to load when unused, and safer against lost work — without rewriting working features or unlocking production.

| Layer | Paths |
|-------|--------|
| A11y helpers | `platform-a11y.js` |
| Reliability helpers | `platform-resilience.js` |
| Performance helpers | `platform-perf.js` |
| Data model / fixtures | `scripts/platform-resilience-data-model.js`, `scripts/platform-resilience-fixtures.js` |
| API handlers | `server/platform-resilience-api.js` (mounted under `/api/testing-lab/*`) |
| Lab UI | `testing-lab-ui.js` Health + Data Controls backup/restore simulation |
| Shell | `index.html` skip link + lazy expansion scripts; `app.js` `ensureViewScripts` on expansion views |
| CSS | `styles.css` focus-visible, reduced-motion, error summary, status pills, touch targets |

## Accessibility improvements

- Skip link to `#main-content`
- Global `:focus-visible` outlines
- Live region announce helper; dialog open/trap/restore helper; error-summary helper that links to fields
- Status pills with text labels (not color-only)
- Testing Lab landmarks (`nav` panels, `aria-current`, save `role="status"`)
- Touch-friendly `.tl-touch` targets (min 44px)
- `@media (prefers-reduced-motion: reduce)` across the app stylesheet
- Phone Lab remains intentional status/handoff (computer recommended)

**Not claimed:** full WCAG / legal certification. Automated keyboard focus, reduced-motion helper, zoom foundation, and phone layout checks were run. Remaining work needs professional/manual review (full screen-reader pass, full color-contrast audit with design tokens, every dialog/drawer/menu across legacy `app.js` surfaces).

## Performance improvements and measurements

- Expansion UIs (Director, Forms, Family Hub, Testing Lab, and related tabs) are **lazy-loaded** via `LLHPlatformPerf.ensureViewScripts` when those views open — not downloaded for users who never open them
- Org/role-scoped GET cache helper that refuses unscoped keys
- Request dedupe helper; list pagination helper (default page size 25; activity history 50)
- Lazy image hydrate helper (`data-llh-src` + IntersectionObserver)
- Soft budgets in `PERFORMANCE_BUDGETS` (e.g. health summary 1500ms, dashboard 2500ms, script lazy-load 4000ms)
- Testing Lab Health panel records health timing vs budget

## Reliability and draft-recovery behavior

- Save controller states: idle / saving / saved / unsaved / retrying / failed
- Double-submit blocked while in flight
- `beforeunload` guard when dirty controllers are registered
- Client draft store scoped by surface + organization + user + child + classroom + record — mismatch refuses restore
- Server draft simulation endpoints with the same scope rules; secrets stripped from payloads
- Failed-save recording with sanitized metadata only (no passwords/tokens/message bodies)
- Network banners + Try Again patterns; never silent success on failure
- Checklist note saves in Testing Lab use the save controller and record sanitized failures

## Health and recovery simulator behavior

Admin Testing Lab **Health** panel (`GET /api/testing-lab/health`):

- Storage readiness (local-json testing-safe)
- Feature-flag status
- Disabled external-service status (Stripe checkout, email, SMS, push, live AI)
- Open failed-save counts (sanitized samples)
- Launch-readiness informational blockers
- Backup/restore policy (production backup/restore always false; fake simulation available)

Fake backup/restore (Data Controls):

- `POST /backup/simulate` — fake org only
- `POST /restore/preview` — shows would-change / would-not-change before confirm
- `POST /restore/confirm` — requires `confirm: true`; applies fake session labels only
- Rejects production/`prod`/`live`/real-looking organization ids

## Cross-device

| Viewport | Expectation |
|----------|-------------|
| Phone ~360/390/430 | Lab mobile summary + a11y foundations; no full desktop Lab |
| Tablet 768–1024 | Computer Lab available; computer-recommended patterns retained |
| Computer ≥1280 | Full Lab including Health / backup simulation |

## Tests and results

```bash
npm run test:platform-resilience-phase19
```

**15 PASS** focused (unit model, production rejection, health, backup/restore, draft isolation, failed-save sanitize, activity pagination, assets, phone 360/390/430, computer health/keyboard, zoom foundation, phase17 smoke).

Also: `npm run test:testing-lab-phase18` **18 PASS**; `npm run test:platform-nav` **PASS**; `npm run test:account-access` **PASS**; full Phase 1–19 regression **PASS** (after wiring tests updated for lazy-load).

## Remaining manual accessibility review

- Full VoiceOver / NVDA pass on Director, Forms builder, Family Hub, and legacy lesson editor
- Contrast ratios for every badge/status against brand tokens
- Every modal in `app.js` migrated to shared focus-trap helper
- Formal WCAG 2.2 AA audit by a specialist (not claimed here)

## Known limitations / deferred

- Draft recovery server simulation is Testing Lab / fake-org scoped; not a full multi-surface cloud draft sync
- Idempotency keys exist in Lab store foundations; not every legacy create endpoint was rewritten
- Lazy-load covers expansion UIs; core `app.js` remains a large single script (no framework rewrite)
- No real production backup, restore, migration, or deletion
- Phase 20 not started

## Screenshots (max 2)

<img alt="Phone accessibility and recovery summary" src="/opt/cursor/artifacts/platform-resilience-phase19/1-phone-a11y-recovery.png" />
<img alt="Computer Testing Lab health and performance" src="/opt/cursor/artifacts/platform-resilience-phase19/2-computer-health-performance.png" />

## Safety

Stripe/email/SMS/push/live AI/production storage untouched. `main` untouched. Production and production data untouched.

Latest tip will be stamped after docs push to `origin/cursor/director-family-foundation-bc66`.
