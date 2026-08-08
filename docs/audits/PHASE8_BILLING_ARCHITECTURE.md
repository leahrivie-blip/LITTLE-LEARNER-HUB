# Phase 8 — Tuition Billing Architecture (Source of Truth)

**Date:** 2026-08-08  
**Spine:** HDH / `main` testing  
**Scope:** Provider → family childcare tuition (NOT Little Learner Hub SaaS subscription billing)

---

## Two billing systems (must stay separate)

| System | Purpose | Canonical home |
|---|---|---|
| **SaaS subscription** | Provider pays LLH (plans, Stripe Checkout, webhooks) | `store.users` Stripe/plan fields · `billingEvents` |
| **Tuition billing** | Families pay the childcare program | `store.tuitionRates` · `store.tuitionInvoices` · `store.tuitionPayments` · `store.tuitionPaymentIdempotency` |

Never mix Stripe Checkout / `store.users` subscription fields into tuition invoice ledgers.

---

## Canonical relationships (no second roster)

```
Program (store.programs)
  └── Child Profiles (programData[programId].child.data.Profiles)
  └── Family household (familyHouseholds[id].childIds → Profiles)
        └── Tuition rate (optional per child + schedule)
        └── Invoice (householdId + childIds[])
              └── Payments (idempotent)
```

Billing APIs accept only:
- `programId` from provider auth / program ownership
- `householdId` from `familyHouseholds`
- `childId` / `childIds` that exist on canonical Profiles and household membership

Do **not** create parallel child or family lists for billing.

---

## Ledger model

### Rates (`tuitionRates`)
- Per child + schedule: `weekly` | `monthly` | `custom`
- Amount in cents; optional label / custom cadence note
- Used to seed invoice line items (convenience), not a separate entitlement system

### Invoices (`tuitionInvoices`)
- Line types: `tuition_weekly`, `tuition_monthly`, `tuition_custom`, `registration_fee`, `one_time`, `discount`, `credit`, `adjustment`
- Discounts/credits are negative line amounts
- Derived statuses: `draft`, `open` (unpaid), `partially_paid`, `paid`, `overdue`, `void`, `credited`
- Fields: amount due (balance), due date, period, notes, `simulated: true` in testing

### Payments (`tuitionPayments` + `tuitionPaymentIdempotency`)
- Simulated / manual_recorded in testing (`realChargesEnabled: false`)
- Receipt number on each succeeded payment
- **Idempotency:** same `idempotencyKey` returns the same payment; never double-applies
- Future processor: attach `processor` / `processorPaymentId` without redesigning invoices

---

## APIs (testing fence: `HOME_DAYCARE_HUB_TESTING`)

**Provider**
- `GET /api/tuition/dashboard` — who owes, amounts, overdue, status counts
- `GET|POST /api/tuition/rates`
- `GET|POST /api/tuition/invoices`
- `POST /api/tuition/invoices/:id/void`
- `POST /api/tuition/payments/record`

**Family Hub** (session-bound household)
- `GET /api/family-hub/tuition` — balance, invoices, payment history for **this** household only
- `POST /api/family-hub/tuition/invoices/:id/pay-simulated`

Server authorization: invoice `householdId` must match the authenticated Family Hub session. Cross-household ID guessing returns 404.

---

## UI surfaces

- **Provider / Owner–Director:** HDH panel `renderTuitionBillingPanel` — rates, issue invoices, who owes, record/partial/void, refresh
- **Family Hub:** Billing nav + `renderFamilyHubBillingPanel` — balance, invoices, simulated pay, receipts/history
- Mobile: `data-tuition-mobile-ready` + 44px / 16px input rules in `styles.css`

---

## Future Stripe Connect (or other processor)

Safe attach points without redesign:
1. Keep invoices/balances as source of truth
2. Create processor PaymentIntent / Checkout Session from an open invoice balance
3. On webhook success, call `recordPayment` with processor id + **idempotency key = processor event id**
4. Set `payment.processor` / `processorPaymentId`; leave SaaS Stripe customer fields alone

---

## Library

`server/tuition-billing-lib.js` — pure ledger helpers (normalize lines, derive status, dashboard, idempotent pay).
