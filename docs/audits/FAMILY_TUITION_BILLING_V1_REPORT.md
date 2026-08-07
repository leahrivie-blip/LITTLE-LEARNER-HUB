# Milestone report: Family Tuition Billing v1

**Scope:** Testing branch only (`HOME_DAYCARE_HUB_TESTING`)  
**Branch:** `cursor/family-tuition-billing-v1-9026`  
**Date:** 2026-08-07  
**Production merge/deploy:** NO — awaiting your approval for testing merge only  
**Do not continue to Priority 2** until you approve this milestone.

---

## Verdict

**Testing GO** for Family Tuition Billing v1 behind the testing fence.  
**Production NO-GO** — fenced; membership Stripe unchanged; no production promote.

---

## Feature checklist

| Capability | Status |
|---|---|
| Provider tuition rates (cadence, default rate) | Done |
| Sibling discount (% on 2nd+ child) | Done |
| Late fees + grace days | Done |
| Create invoices per Family Hub household | Done |
| Balance tracking / outstanding / overdue | Done |
| Payment status (open / overdue / paid / void) | Done |
| Provider mark paid (manual/cash) | Done |
| Void unpaid invoices | Done |
| Payment history | Done |
| Provider billing dashboard (Business → Family Tuition) | Done |
| Family balances list | Done |
| AI reminder draft (subject + body) | Done |
| Parent billing history (Family Hub → More → Billing) | Done |
| Parent online pay (Stripe Checkout one-time) | Done |
| Local/test simulated pay (`LLH_STRIPE_CHECKOUT_SIMULATION`) | Done |
| Webhook path for `metadata.purpose=family_tuition` | Done |
| Teacher/Assistant denied (403) | Done |
| Separate from LLH membership billing | Done |
| Autopay / subscriptions for tuition | Not in v1 |
| Subsidy / CCDF | Deferred |
| Email delivery of invoices | Deferred to Priority 4 |

---

## Screenshots / demo

Artifacts: `/opt/cursor/artifacts/family-tuition-v1/screenshots/`

1. `01-provider-dashboard.png` — rates, create invoice, balances, invoices, payments  
2. `02-parent-billing-more.png` — captured when browser boot allows (API parent path is fully covered)

### Demo walkthrough (testing site)

1. Enable `HOME_DAYCARE_HUB_TESTING` (already on testing service).  
2. As **Owner**: Business → **Family Tuition**.  
3. Set rates (e.g. $800/child, 10% sibling discount, $25 late fee).  
4. Invite a Family Hub household with 2 children.  
5. Create invoice → confirm sibling discount on 2nd child.  
6. Open **AI reminder draft** for that family.  
7. As **Parent**: Family Hub → More → Billing → **Pay online** (simulates when Stripe sim is on).  
8. As Owner: confirm payment history + collected total update.  
9. Create an overdue invoice (past due + grace 0) → late fee appears on dashboard.

---

## Testing results

| Suite | Result |
|---|---|
| `npm run check` | PASS |
| `npm run test:family-tuition-billing-v1` | PASS |
| `npm run test:billing-membership` | PASS (membership untouched) |
| `npm run test:family-hub-provider-inbox` | PASS |

---

## Database / schema changes

No SQL migration. Store collections (local-json / same document store as Family Hub):

```text
store.familyTuitionPolicies[ownerEmail] = {
  billingCadence, defaultRateCents, siblingDiscountPercent,
  lateFeeCents, lateFeeGraceDays, dueDayOfMonth, invoicePrefix, ...
}

store.familyTuitionInvoices[] = {
  id, ownerEmail, householdId, number, periodStart/End, dueAt,
  lineItems[], subtotal/discount/lateFee/total/amountPaid/balance cents,
  status, paidAt, voidedAt, stripeCheckoutSessionId, notes, ...
}

store.familyTuitionPayments[] = {
  id, invoiceId, householdId, ownerEmail, amountCents,
  method, status, stripeCheckoutSessionId, stripePaymentIntentId, ...
}
```

### Migration notes

- Empty collections auto-created on first use (`ensureFamilyTuitionCollections`).  
- No backfill required.  
- Safe alongside existing `users` / membership Stripe fields — tuition Checkout uses `metadata.purpose=family_tuition` and never calls membership upgrade.  
- Production: leave fence off; routes return 404.

---

## API surface (testing only)

- `GET/PUT /api/family-tuition/policy`  
- `GET /api/family-tuition/dashboard`  
- `POST /api/family-tuition/invoices`  
- `POST /api/family-tuition/invoices/:id/mark-paid`  
- `POST /api/family-tuition/invoices/:id/void`  
- `POST /api/family-tuition/reminder-draft`  
- `GET /api/family-tuition/me` (family session)  
- `POST /api/family-tuition/pay` (family session → Checkout or sim)

---

## Remaining known issues

1. Parent Family Hub browser paint for Billing can soft-timeout under boot gate load (API path green).  
2. Invoice email/push not sent yet (Priority 4 — Parent Delivery).  
3. No recurring autopay / saved payment methods in v1.  
4. Directors can manage tuition on testing; confirm if you want owner-only for rate edits.  
5. Stripe MCP not authenticated in this environment — live Checkout needs `STRIPE_SECRET_KEY` on testing; sim covers local QA.

---

## Recommended next phase (awaiting your approval)

**Priority 2 — Daily Operations → Family Hub**  
Document through the day → one-tap polished Daily Report → send to families → share defaults → AI wording with provider edits.

Do **not** start Priority 2 until you approve this Billing v1 milestone and say to continue.
