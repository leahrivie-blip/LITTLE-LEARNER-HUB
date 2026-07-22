# Phase 17 — Platform Pricing & Family Tuition Billing Simulator

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only)  
**Date:** 2026-07-22  
**Started from tip:** `c9a33e0`

## Platform pricing simulator

Testing-only plan catalog (Curriculum Only → Large Center, classroom add-on, Founding Member $9.99 base protection). Plan comparison shows monthly/annual, limits, features, exclusions, usage, recommended plan, upgrade/downgrade preview, annual savings. Entitlement simulator covers trial, past due, grace, cancel/reactivate, payment failure, founding active/former, add-on add/remove. Downgrade safety never silently deletes classrooms/staff/children/records. No Stripe products, prices, checkout, or card/bank storage. `DISABLE_STRIPE_CHECKOUT=true`.

## Family tuition billing

Provider billing profiles (household, children, payers/splits, subsidy/copay, statement/autopay placeholders). Fake charge types, recurring schedules, idempotent cycle invoices, integer-cent balances, append-only ledger (partial/failed/refund/credit/waiver). Attendance charge suggestions require provider confirmation. Enrollment deposit fixture links Phase 12 offers without processing payment. Family Hub Billing for financially responsible guardians only; no real Pay button; private collection notes and other households hidden.

## Entitlements and founding protection

Reuses `scripts/entitlement-model.js` catalog cents/limits. Simulated subscriptions apply `organizationEntitlements`. Founding base stays $9.99 while continuously active; add-ons separate; former founding history preserved without reclaim promise. Curriculum Only cannot buy classroom add-ons or access center family billing.

## Ledger / data integrity

Money stored as integer cents. Billing-cycle generation and payment simulations use idempotency keys. Corrections are new ledger entries; prior events are never mutated or deleted.

## Permissions

| Actor | Access |
|-------|--------|
| Primary billing owner | Platform subscription simulator |
| Owner / authorized director | Provider family billing |
| Billing manager (flag) | Family billing when granted |
| Teacher / assistant | Denied by default |
| Financially responsible guardian | Own household/child billing only |
| Non-financial / pickup / restricted | Denied unless billing capability |
| Curriculum Only | Own platform catalog/subscription only |
| Cross-organization | Always rejected |

## Tests

```bash
npm run test:billing-simulator-phase17
```

**21 PASS** focused. Full Phase 1–17 regression: **PASS**.

## Screenshots (max 2)

<img alt="Family billing phone" src="/opt/cursor/artifacts/billing-simulator-phase17/1-family-billing-phone.png" />
<img alt="Platform plans desktop" src="/opt/cursor/artifacts/billing-simulator-phase17/2-platform-plans-desktop.png" />

## Stripe / real payments

Untouched. No new Stripe products/prices. Production checkout/catalog unchanged. No card or bank credentials stored. Fake plans/invoices/transactions only.

## Deferred

- Live Stripe checkout / seat billing  
- Real family payment processing  
- Phase 18 Testing and Preview Lab  

## Safety

Production expansion locked. `main` untouched. Fake `@example.invalid` data only.

Latest tip: `cc70d794869f1c329ce49b1a6fae7ae1b4575e59` (pushed to `origin/cursor/director-family-foundation-bc66`). Working tree clean after docs stamp. Production and `main` untouched. Phase 18 not started.
