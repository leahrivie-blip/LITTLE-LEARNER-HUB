# Phase 1 Entitlement & Pricing Foundation

**Status:** Planning + technical structure only  
**Live Stripe / checkout / prices:** **Unchanged**  
**Date:** July 21, 2026

Phase 1 prepares the structure needed to support future pricing. It does **not**:
- create Stripe products or prices
- change current subscriptions
- charge customers
- display new pricing publicly
- change current feature access
- remove Founding Member benefits
- deploy pricing changes

Implementation module: `scripts/entitlement-model.js`  
Read-only API: `GET /api/foundation/entitlements`

---

## 1. How existing Stripe subscriptions work today

Confirmed in `server/index.js` + `scripts/membership-access.js` + `STRIPE_SETUP.md`:

| Plan | Price | Identification |
|------|-------|----------------|
| Founding Member | $9.99/month | `foundingMemberActive`, founding price ID, lifetime price lock while continuously active |
| Pro Monthly | $19.99/month | Stripe monthly price + `subscriptionCadence: monthly` |
| Pro Annual | $199/year | Stripe annual price + `subscriptionCadence: annual` |
| Free | $0 | No paid Stripe access / ended access |

Key flows:
- Checkout: `POST /api/create-checkout-session`
- Portal: `POST /api/create-customer-portal-session`
- Webhooks: `POST /api/webhooks/stripe` (idempotent via `processedStripeEvents`)
- Access decision: `membershipHasProAccess(user)` — Stripe status, past_due/unpaid locks, trial/period end, founding flags, internal overrides

Access is **not** determined by dollar amount alone.

---

## 2. How plans and access are currently identified

User fields commonly used:
- `plan`, `subscriptionStatus`, `subscriptionCadence`
- `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, `stripePriceId`
- `foundingMember`, `foundingMemberActive`, `foundingMemberHistorical`, `foundingMemberNumber`, `priceLock`
- `accessEndsAt`, `currentPeriodEnd`, `trialEnd`, `cancelAtPeriodEnd`
- Staff inheritance: `programAccessViaOwner` + `linkedProgramOwnerEmail`

Client mirrors with `isProUser()` / `effectiveAccessPlan()` and admin overrides.

Account type (`home_daycare` / `center` / `single_provider`) and role (`owner` / `director` / `teacher` / `assistant`) are **separate** from billing entitlements today.

---

## 3. How Founding Members are currently protected

- Limited founding inventory (`FOUNDING_LIMIT`, default 50)
- Checkout blocks sold-out founding purchases
- Former founding members are **not** auto-routed back to $9.99
- Continuous activity required for $9.99 lock
- Cancellation keeps access through paid period end; after end, Founding price is not guaranteed on return
- Failed payments lock Pro access (`past_due` / `unpaid` / payment failed)

Phase 1 does not alter any of the above.

---

## 4. Proposed future entitlement model

Keep these concepts separate in data and logic:

| Concept | Proposed home |
|---------|----------------|
| Stripe customer | `organizationEntitlements.stripeCustomerId` (+ user mirror) |
| Stripe subscription | `stripeSubscriptionId` |
| Stripe product / price | `stripeProductId` / `stripePriceId` |
| Base plan | `basePlanKey` |
| Billing interval | `billingInterval` (`monthly` \| `annual`) |
| Subscription status | `subscriptionStatus` |
| Account type | organization / user (`accountType`) — not an entitlement substitute |
| User role | staff membership / guardian role — not an entitlement substitute |
| Organization | `organizations` |
| Physical location | organization location limit fields |
| Feature entitlement | `featureEntitlements[]` |
| Classroom limit | `classroomLimit` |
| Staff-account limit | `staffAccountLimit` |
| Classroom add-on quantity | `classroomAddOnQuantity` + `classroomAddOns` collection |
| Founding eligibility | `foundingMemberEligible` |
| Grandfathered / promo price | `grandfatheredPriceCents` / `promotionalPriceCents` |
| Trial status | `trialStatus` |
| Access-end date | `accessEndsAt` |

Planned base plans (not live):

1. Curriculum Only — $14.99 / mo, $149 / yr  
2. Home Daycare — $19.99 / mo, $199 / yr (1 classroom, owner + 1 staff)  
3. Small Center — $29.99 / mo, $299 / yr (≤8 classrooms, ≤15 staff)  
4. Growing Center — $44.99 / mo, $449 / yr (≤15 classrooms, ≤30 staff)  
5. Large Center — $74.99 / mo, $749 / yr (≤30 classrooms, ≤60 staff)  
6. Founding Member — $9.99 / mo locked while continuously active  

Annual presentation message:

> Choose annual billing and get approximately two months free.

UI must eventually show monthly price, annual price, annual savings, billing interval, renewal date, and cancellation terms — **not in Phase 1 public UI**.

---

## 5. Classroom add-on structure

| | Monthly | Annual |
|--|---------|--------|
| Price | $6.99 | $69 |
| Grants | +1 classroom, +2 staff accounts | same |

Rules encoded in `CLASSROOM_ADD_ON` + `recommendUpgradeInsteadOfAddOns()`:
- Curriculum Only cannot buy add-ons
- Home Daycare should upgrade rather than stack rooms
- Center plans may buy add-ons when allowed
- Add-ons tracked separately from base subscription
- Canceling an add-on must not cancel base plan
- Access continues through paid period
- Ending an add-on never deletes classroom/child records — archive/restrict instead
- Before stacking many add-ons, compare against next plan and show:

> Based on the number of classrooms you need, upgrading your plan will save you money.

---

## 6. Monthly and annual billing support

`BILLING_INTERVALS.MONTHLY | ANNUAL` on entitlement + add-on records.  
`plannedBillingDisplay()` returns display fields with `live: false`.

---

## 7. Upgrade / downgrade behavior (future)

**Upgrade:** may increase access immediately per future billing rules.

**Downgrade:** must not delete information. If usage exceeds new limits:
1. Show exceeded classroom/staff limits
2. Require director to choose active classrooms/staff
3. Archive remaining classrooms safely
4. Preserve history, signed forms, audit records
5. Block new activity in restricted classrooms
6. Allow restore after upgrade

---

## 8. Failed-payment behavior

Current live behavior (unchanged): `membershipHasProAccess` returns false for past_due / unpaid / payment failed.

Future entitlement status should use `past_due` / `unpaid`, retain records, restrict new paid activity, and keep a clear recovery CTA. Founding $9.99 remains only if continuous eligibility is preserved through recovery rules.

---

## 9. Migration risks

- Mapping today’s single Pro/Founding SKU onto multiple future plans without stripping Founding benefits
- Home daycare owners who already created multiple schedule classrooms
- Staff counts vs future staff-account limits
- Curriculum-only customers must not silently receive center tools
- Dual systems during transition: `membership-access.js` (live) vs `organizationEntitlements` (future)
- Never infer access from UI plan labels alone

---

## 10. Rollback approach

1. Do not connect `organizationEntitlements` to checkout until a later approved phase.
2. Keep serving access from `membership-access.js`.
3. If future entitlement rows are written and must be undone, delete/restore only `organizationEntitlements` / `classroomAddOns` from backup — never Stripe customer objects from this app layer alone; use Stripe dashboard/API with a documented ops plan.
4. Founding Members: no Stripe price migration in Phase 1, so no founding price rollback is required.

---

## Confirmation

Phase 1 prepared the technical structure only.  
**No live pricing implementation. No Stripe products created. No production billing change.**
