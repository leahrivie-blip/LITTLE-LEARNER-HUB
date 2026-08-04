# Trial-Length Audit — 2026-08-04

## Exact root cause

**Not a standard 7-day creation bug.**  
**Not a countdown/display bug.**  
**Mixed intentional-promo reality + Admin labeling gap.**

All customer-visible “about a month remaining” trials are **Promo-Extended** via `TRY1MONTH` (30 days). Three longer trials use historical `TRYPRO3` (90 days). Stripe `trial_end` and local `trialEnd` match (within the same calendar day / same remaining-day ceil).

Standard introductory checkout (`trial7day: true`) still sets `subscription_data.trial_period_days = 7` with `payment_method_collection: always`. Stripe Price objects have **no** built-in trial days.

## Failure classification

**Multiple causes (mostly non-bugs):**

1. **Promotion intentionally extended the trial** — primary explanation for ~1 month remaining (7 accounts on `TRY1MONTH`).
2. **Legacy/historical promo** — 3 accounts on `TRYPRO3` (90 days); code no longer listed in active store promos, but Stripe subscriptions remain.
3. **Admin clarity gap** — UI previously showed generic “Trial (N Days Remaining)” without Standard / Promo / Manual / Legacy labels (fixed in this change).
4. **No evidence** that new standard trials are being created for 30 days.

## Source of truth

| Phase | Source of truth |
|-------|-----------------|
| Checkout create | App → Stripe `trial_period_days` |
| After webhook / refresh | **Stripe** `trial_start` / `trial_end` written to local store |
| Admin / customer countdown | **Local** `trialEnd` / `accessEndsAt` (synced from Stripe) |
| Admin +7 extension | **Local only** (+ `internalAccessOverride`); does not move Stripe charge date |

## Environment / Stripe product settings

- Stripe Prices (`STRIPE_PRICE_PRO_MONTHLY`, annual, founding): `recurring.trial_period_days = null`
- Production env: **no** `PROMO_FREE_TRIAL_*` keys (code defaults unused because store promo wins)
- Active store promos at audit time:
  - `TRY1MONTH` → 30 days (active)
  - `THANKUYEARFREE` → 365 days (active)
  - `TRYPRO3` → not in current store list (historical redemptions still trialing in Stripe)

## Active trials inventory (do not shorten)

**10 Stripe trialing subscriptions + 1 local-only test/manual trial.**

| Email | Type | Promo | Stripe start | Stripe end | Local end match | Days rem (Admin=Customer) |
|-------|------|-------|--------------|------------|-----------------|---------------------------|
| taylordenson8@gmail.com | Promo-Extended | TRY1MONTH | 2026-07-31 | 2026-08-30 | yes | ~26 |
| rosschrissy686@yahoo.com | Promo-Extended | TRY1MONTH | 2026-07-29 | 2026-08-28 | yes | ~24 |
| laurelj13@icloud.com | Promo-Extended | TRY1MONTH | 2026-07-29 | 2026-08-28 | yes | ~24 |
| duran.kassandra17@gmail.com | Promo-Extended | TRY1MONTH | 2026-07-29 | 2026-08-28 | yes | ~24 |
| oliviaberry0929@yahoo.com | Promo-Extended | TRY1MONTH | 2026-07-29 | 2026-08-28 | yes | ~24 |
| alyanagonzalez642@gmail.com | Promo-Extended | TRY1MONTH | 2026-07-27 | 2026-08-26 | yes | ~22 |
| ajanssen6218@gmail.com | Promo-Extended | TRY1MONTH | 2026-07-20 | 2026-08-19 | yes | ~15 |
| alexxarae@live.com | Promo-Extended | TRYPRO3 | 2026-06-24 | 2026-09-22 | yes | ~49 |
| leslienicole2424@gmail.com | Promo-Extended | TRYPRO3 | 2026-06-24 | 2026-09-22 | yes | ~49 |
| bjoffutt97@gmail.com | Promo-Extended | TRYPRO3 | 2026-06-18 | 2026-09-16 | yes | ~43 |
| llh.prod.flag.trial…@littlelearnershubbyleah.com | Manually Extended / test | none | (no Stripe trial) | local ~2026-08-10 | n/a | ~6 |

**Affected customer accounts showing ~1 month:** **7** (`TRY1MONTH`).  
**Longer promo:** **3** (`TRYPRO3`).  
**Incorrect standard 30-day creations:** **0**.

Checkout sessions since 2026-06-01: **0 completed** standard `trial7day` sessions; completed trials observed were promo-coded. Open/abandoned `trial7day` sessions exist, so the 7-day path is wired but little used vs promo/paid checkout.

## Code changes in this PR

- `scripts/membership-access.js` — `classifyMembershipTrialOffer` (+ helpers)
- `app.js` — Admin trial type labels (Standard / Promo / Manual / Legacy) with start/end/extension source/promo
- `server/index.js` — manual extend provenance (`trialExtensionSource`, `manualTrialExtensionDays`)
- `scripts/test-trial-length-system.js` — coverage for 7-day checkout, promo separation, countdown parity, manual extend, convert, cancel
- Shell cache bump `20260804-trial-length-audit-r1`

**No existing customer `trialEnd` values were modified.**

## Correction plan for existing accounts (awaiting owner approval)

Do **not** auto-shorten anyone.

Recommended options for Leah:

1. **Keep as-is (recommended default)** — honor `TRY1MONTH` / `TRYPRO3` through their Stripe `trial_end`; Admin labels now make the type obvious.
2. **Stop new 30-day promos** — set store promo `TRY1MONTH` (and `THANKUYEARFREE` if undesired) to inactive / expired; leave UI example copy updated so providers aren’t steered into a month free unless intentional.
3. **Optional customer messaging** — email promo-trial members reminding them of their promo end date and that card will be charged unless canceled (no date change).
4. **Only if a specific account was sold as 7-day but redeemed TRY1MONTH by mistake** — case-by-case Stripe `trial_end` edit with owner approval (not bulk).

## Production verification checklist

- [x] Stripe prices have no default trial days
- [x] Active Stripe trials enumerated (10)
- [x] Local store compared; dates match
- [x] Standard checkout still emits 7-day trial in tests
- [x] Card-required behavior unchanged (`payment_method_collection: always`)
- [ ] Deploy Admin label UI + tests to production
- [ ] Owner review of correction plan before any trial-date edits
