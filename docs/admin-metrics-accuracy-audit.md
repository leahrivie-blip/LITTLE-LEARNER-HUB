# Owner / Admin Metrics Accuracy Audit

**Date:** 18 August 2026  
**Scope:** Every owner/admin statistic currently displayed — dashboard, Insights, advisor, marketing funnel, users, subscriptions, revenue, curriculum, and activity.  
**Method:** Read-only inventory of UI + API + store/Stripe sources, then minimal wording and data-quality corrections where the source of truth was already clear.  
**No emails were sent. No Stripe records, prices, or subscriptions were modified. No user plans or access were changed.**

This report is the owner-facing technical record. Status meanings:

| Status | Meaning |
|---|---|
| **GREEN** | Calculation matches the named source of truth and the UI label. Safe for decisions if you read the definition. |
| **YELLOW** | Math is internally consistent, but the label, window, or overlap can still be misunderstood. Use with the caveat. |
| **RED** | Incorrect or previously misleading. Fixed in this change when the source of truth was clear; otherwise called out as still unsafe. |
| **GRAY** | Cannot be measured with current events or Stripe fields. Do not invent a number. |

---

## Canonical sources of truth

| Category | Canonical source | Do not use |
|---|---|---|
| **Account exists / current plan** | `store.users` + `scripts/membership-access.js` (`membershipCurrentAccessKey`, `membershipHasProAccess`) | Analytics events, historical `checkout_success` |
| **Subscription / access now** | Same membership helpers + last Stripe webhook fields on the user (`stripeSubscriptionStatus`, `cancelAtPeriodEnd`, period/trial end) | A past purchase event |
| **Revenue collected (cash)** | `billingEvents` plus unmatched `checkout_success` via `server/analytics-revenue.js` | Failed payments, abandoned checkouts, unpaid invoices, cancels |
| **MRR** | Current paid-access users’ listed `monthlyPrice` (annual ÷ 12) | Cash collected this month |
| **Active user (accounts)** | `lastSeenAt` or `lastLoginAt` only — not `updatedAt`, not page views | Lesson views or saves as “active” |
| **Unique visitor (Insights)** | Unique actor on `website_visit` (`visitorId \|\| user \|\| sessionId \|\| ipHash`) | Raw event counts |
| **Unique visitor (Owner Analytics)** | Unique actor on `website_visit` **or** `page_view` | Insights visitor count (different definition) |
| **Signup completed** | Insights: unique email/actor ∪ user `signupAt`/`createdAt`. Owner “Signup Completions”: raw `account_signup_complete` **events** | Mixing the two |
| **Paid conversion (Insights, range)** | Unique `checkout_success` ∪ `metaPurchaseAt`/`firstPaidInvoiceAt` in range | Current paid snapshot |
| **Paid users (Owner snapshot)** | `membershipHasProAccess` — **includes trials** | Insights paid conversions |
| **Started signup** | Unique actors on `signup_start`, `signup_click`, plan/persona/free selected, **or** Start Free `cta_click` | Form submit (event does not exist) |
| **Lesson views** | `lesson_plan_view` / `curriculum_lesson_view` / lesson `resource_view` **event counts** unless the card says unique viewers | Admin/bot exclusion is incomplete |

**Intentionally overlapping account labels**

- **Founding** is a paid Pro entitlement with a founding lock. A Founding member is not a separate add-on on top of Pro.
- **Early User** is Pro at $13.99, not a third paid pool.
- **Trial** users have Pro access during the trial. Owner `paidUsers` includes them; Insights “Paid” does not (trial is its own stage).
- **Canceling** (cancel-at-period-end) still has access until period/trial end.
- **Center / Home Daycare / Single Provider** are account types, not plans. They overlap Free/Trial/Pro.

---

## 1. Insights → AI Business Advisor

| Metric | Source of truth | Window | Counts | Exact / inferred | Status |
|---|---|---|---|---|---|
| Unique visitors | Insights funnel `website_visit` unique actors | Selected range (Advisor default **Today**) | Unique actors | Exact in loaded events | **GREEN** |
| Signups | Funnel `signupCompletions` unique emails ∪ stamps | Same range | Unique accounts | Exact | **GREEN** |
| Trials | Users with `metaStartTrialAt`/`trialStart` in range | Same range | Accounts | Exact stamps | **YELLOW** — can differ slightly from funnel `trialStarts` stage |
| Paid | Funnel `paidConversions` | Same range | Unique converters | Exact | **GREEN** |
| Avg session (min) | Mean duration of multi-event sessions | Same range | Sessions | Exact among sessions with ≥2 events | **YELLOW** — single-event sessions excluded from the average |
| Open requests | Feature requests not in a closed status | Snapshot | Tickets | Exact | **GREEN** |
| Revenue this month / today | Owner marketing cash totals (see Revenue) | Month / today | Dollars | YELLOW — see Revenue | **YELLOW** |
| Best converting source line | Owner `conversionBySource` | Owner snapshot, **not** Insights range | Mixed | Inferred | **YELLOW** — now shows visitors/signups/paid and small-sample note |
| Top lesson views line | Feature-usage event counts | Insights range | Events | Exact events | **YELLOW** — events, not unique users |
| Largest drop-off line | Required advisor edges only | Insights range | Unique actors | Exact math | **GREEN** after wording fix |

### Advisor opportunities (rules-v1)

| Opportunity | Trigger | Data / window | Denominator | Status |
|---|---|---|---|---|
| Visitor → Started signup | Drop-off ≥50% and fromCount ≥5 | Insights range unique actors | Unique visitors | **GREEN** after wording fix. Previously **RED**: “92.5% drop-off / 37 people” read like a form failure. Now: starting population, started signup, conversion, “37 of 40 visitors did not start signup”, time window. Does **not** say people dropped out of signup. |
| Started signup → completed | Same | Unique actors who started | Started-signup actors | **GREEN** |
| Signup → trial / trial → paid | Same | Account stamps / paid stamps | Prior stage | **GREEN** |
| Improve “{lesson}” | Highest viewed lesson exists | Lesson-view **events** in range | Events + unique viewers now shown | **YELLOW**. Previously **RED** copy claimed users open it “before upgrading.” Copy now states upgrade association is **not measured**. |
| Email N trial users ending in 48h | `trialEnd` within 48h, not already paid, not test email | Current snapshot | Current trial accounts | **GREEN** after excluding test + already-paid |
| Reach N inactive Pro/Founding | `plan` contains pro/found **and** tracked lastSeen/lastLogin older than 14 days | Snapshot | Paid accounts with activity timestamps | **GREEN** after fix. Previously **RED**: missing timestamps counted as inactive. |
| Double down on {source} | Best Owner source by paid, signups > 0, not TikTok | Owner attribution snapshot | Visitors / signups / paid | **YELLOW**. Now shows sample size and “not causal.” Still ranks on Owner snapshot, not Insights range. |
| Build “{search}” | Top no-result query | Insights range | Search events | **GREEN** |
| Advance feature request | Top open request | Snapshot | Votes | **GREEN** |
| Accounts created but no lesson | ≥5 signups and few `lesson_plan_view` events | Insights range **events** | Mixed unique signups vs raw views | **YELLOW** — views are not unique new users |
| Free explorers never start trial | ≥5 `free_plan_selected` events | Events | Events | **YELLOW** |
| Welcome screen not converting | ≥5 `welcome_screen_viewed` | Events | Events | **YELLOW** / **GRAY** if those client events are rare |

---

## 2. Insights → Marketing Funnel

| Metric | Source | Window | Counts | Status |
|---|---|---|---|---|
| Visitors | Unique `website_visit` actors | Range | Unique actors | **GREEN** |
| Landing page views | Unique visit or `page_view` actors | Range | Unique actors | **GREEN** |
| CTA clicks | Unique CTA actors; Start Free / Start Trial KPIs are **event** counts | Range | Mixed | **YELLOW** — KPI cards are events; bar is unique actors |
| Started signup | Unique actors on signup-start events **or** Start Free CTA | Range | Unique actors | **YELLOW** — includes Start Free clicks, not only form opens. `signup_form_submit` does **not exist**. |
| Signup completed | Unique complete events ∪ user stamps | Range | Unique accounts | **GREEN** |
| Email verified | Optional unless env requires verify | Range | Unique | **GREEN** as informational |
| Trial started | User trial stamps in range | Range | Accounts | **GREEN** |
| Trial ended | Optional | Range | Accounts | **GREEN** as informational |
| Converted to paid | Checkout ∪ first paid stamp in range | Range | Unique | **GREEN** |
| Active subscribers | `isActiveSubscriber` **now** | Snapshot | Accounts | **YELLOW** — includes `past_due`; labeled “current”; not a drop-off edge |
| Visit→paid | Paid / visitors | Same range | Unique | **GREEN** when visitors > 0; **Insufficient data** when 0 |
| Step conversion / drop-off | `min(to, from) / from` and `max(from − to, 0) / from` | Same range | Unique actors | **GREEN** math; UI now shows “X% continued · Y of Z did not continue” |
| Why They Left | Actors who reached a stage but not the next, identity-linked | Same range | Unique | **GREEN** |
| By source | Insights channels: Facebook, TikTok, Google, Direct, Organic, Other | Range | Unique per source | **YELLOW** — Email is Organic here; Owner Analytics treats Email separately |
| Cost / signup or paid | Configured ad spend / completions | Range | Dollars | **YELLOW** if spend env is missing (shown as —) |
| Offer breakdown (Early User / annual / founding) | API only — **not rendered** | Snapshot | Accounts | **GRAY** in UI |

**Signup funnel after PR #679**

| Requested step | Fires? | When | Deduped? |
|---|---|---|---|
| Unique visitor | Derived | `website_visit` | Yes, by actor key |
| Start Free CTA | Yes | Homepage / public `cta_click` `{cta:"start_free"}` | Unique in CTA stage; **also** counts as Started signup |
| `signup_start` | Yes | Auth modal opens in signup mode | Unique actor |
| `signup_form_submit` | **No** | — | **GRAY** |
| `account_signup_complete` | Yes | After profile sync succeeds | Unique email; Owner Analytics still counts raw events |
| `signup_landed_free` | **No** | Closest: `free_plan_selected` / confirm events | **GRAY** |

Historical visits from before these events existed cannot be backfilled. Empty older stages are measured 0 in-range, not “unknown history.”

---

## 3. Owner Command Center / Admin Home / Marketing Analytics

Built by `analyticsSummary` + `buildMarketingAnalytics` (`GET /api/admin/analytics`). Postgres loads **last 90 days, ≤5000 events**. No range picker.

| UI label | Calculation | Window | Counts | Status |
|---|---|---|---|---|
| Total / registered users | Filtered `store.users` (test emails excluded) | Snapshot | Accounts | **GREEN** |
| Active today / week / month | `lastSeenAt \|\| lastLoginAt` | UTC day / 7d / 30d | Accounts | **GREEN** definition; **YELLOW** if lastSeen is sparse |
| Active Users (command KPI) | Alias of **active this month (30d)** | 30d | Accounts | **YELLOW** — label does not say 30 days |
| Online now / Live visitors | lastSeen/login or traffic actors | 15 min | Accounts / actors | **GREEN** |
| New today / week / month | User `signupAt`/`createdAt` | UTC day / 7d / 30d | Accounts | **GREEN** |
| Free / Trial / Pro / Early User / Founding | `membershipCurrentAccessKey` | Snapshot | Accounts | **GREEN** if read as **current access**, not additive |
| Paid subs (Marketing) | `membershipHasProAccess` | Snapshot | Accounts | **YELLOW** — includes trials |
| Signup Completions | `account_signup_complete` **event count** | Loaded buffer | Events | **YELLOW** — not unique users |
| Free signups (Marketing) | Same event count | Buffer | Events | **YELLOW** |
| Visitor → Signup rate | **Registered users / unique visitors** | Mixed snapshot vs buffer | Mixed | **YELLOW** — not a cohort conversion |
| Registered → Paid | Snapshot paid / registered | Snapshot | Accounts | **YELLOW** — includes trials in paid |
| Trial Conv. | Paid-with-trial-history / (current trials + converted) | Snapshot | Accounts | **YELLOW** — not a time-boxed cohort |
| Session visits | `website_visit` events | Buffer | Events | **GREEN** |
| Unique viewers | visit ∪ page_view identifiers | Buffer | Unique ids | **YELLOW** vs Insights visitors |
| Page views | `page_view` events | Buffer | Events | **GREEN** |
| Returning viewers | Identifiers with traffic on >1 UTC day | Buffer | Unique ids | **GREEN** |
| Cancellations | Billing key canceled **or** ended | Snapshot | Accounts | **YELLOW** — mixes canceled + ended |
| Failed payments | Billing key `payment_failed` | Snapshot | Accounts | **GREEN** |
| Canceling | `cancelAtPeriodEnd` / “access ends” | Snapshot | Accounts | **GREEN** |
| Past due / billing review | Membership billing-review helpers | Snapshot | Accounts | **GREEN** |
| Home Daycare / Centers / Single Provider | `accountType` | Snapshot | Accounts | **GREEN** as account type, not plan |
| Lesson views / calendar / observations / logs / messages / forms | Named analytics events | Buffer | Events | **YELLOW** — events, not unique users |
| Inactive (14d+) | No lastSeen/login/signup within 14d | Snapshot | Accounts | **YELLOW** — never-seen users count as inactive here (Advisor no longer does) |
| Revenue MTD / today / total | Cash collector | Month / day / all loaded | Dollars | **YELLOW** — see Revenue |
| MRR | Listed prices on current paid-access users | Snapshot | Dollars | **YELLOW** — see Revenue |
| ARR | Not shown | — | — | **GRAY** |
| Annual plan count | Not a KPI (`offerBreakdown.pro_annual` unrendered) | — | — | **GRAY** in UI |
| Promo redemptions / codes | Store promo lists | Snapshot | Counts | **GREEN** if promos exist |
| Draft / published lessons, activities, printables | Local curriculum | Snapshot | Items | **GREEN** as catalog counts |
| Open support / bugs / feature requests | Ticket bags | Snapshot | Tickets | **GREEN** |

Admin Home “Pro · Trial · Founding” uses the same current-access keys. Safe if not added together as “paid + trial + founding.”

---

## 4. Users, User Health, Billing Home, Trial Usage

| Metric | Source | Status |
|---|---|---|
| Users table filters (All / Free / Trial / Pro / Founding / Canceled / Needs review) | Membership current access + billing status | **GREEN** as filters (overlapping by design) |
| Last active | `lastSeenAt \|\| lastLoginAt` | **GREEN** when stamps exist; blank ≠ proven inactive |
| User Health Active / At risk / Inactive | `/api/admin/user-health` score + days since activity | **YELLOW** — third “active” definition; confirm score before acting |
| Billing Home Active / Trials / Founding / Canceled / Needs review | Local owner account rows | **YELLOW** — same membership keys, local cache |
| Trial usage allowance (3 premium exports) | `/api/admin/trial-usage` | **GREEN** for export counts; “possible repeated trial” is a flag |
| Deleted / archived / duplicate emails | Not removed from business totals automatically | **YELLOW** — test emails excluded from analytics; real duplicates can still exist |
| Admin accounts | Not excluded unless they look like test emails | **YELLOW** |

---

## 5. Activity / engagement definitions

| Label | Definition used | Status |
|---|---|---|
| Active today | lastSeen or lastLogin same UTC day | **GREEN** |
| Active 7 days | lastSeen or lastLogin within 7×86400000 ms | **GREEN** |
| Active 14 days | Not a first-class KPI | **GRAY** as a labeled KPI |
| Active 30 days | lastSeen or lastLogin within 30 days; Command “Active Users” uses this | **YELLOW** labeling |
| Inactive 14+ (Owner Customer Health) | Not seen/login/signup in 14 days, including never-seen | **YELLOW** |
| Inactive Pro/Founding (Advisor) | Tracked lastSeen/lastLogin older than 14 days only | **GREEN** after fix |
| Sessions (Feature Usage) | Distinct `sessionId \|\| visitorId` | **GREEN** |
| Logins | `account_login_complete` / lastLoginAt | **YELLOW** — not a dashboard KPI everywhere |
| Lesson / activity views | View events | **YELLOW** — events |
| Saves | Calendar-add aliases; favorites computed but **not shown** | **YELLOW** / **GRAY** for favorites |
| Downloads / prints | Named download/print events | **GREEN** as events |
| Planner / documentation / forms / child / AI | Various named events or AI usage APIs | **YELLOW** — coverage varies |

If lastSeen/lastLogin was never written, do **not** treat the account as inactive in Advisor. Owner “Inactive (14d+)” still includes never-seen users.

---

## 6. Content / Farm Animals

| Claim | Measurable now? | Status |
|---|---|---|
| Highest viewed lesson (event count) | Yes — `lesson_plan_view` + lesson `resource_view` | **GREEN** as **events** |
| Unique viewers of that lesson | Yes from actor keys (Advisor evidence now) | **GREEN** on Advisor card only |
| Free vs paid viewers | Not reconstructed in UI | **GRAY** |
| Upgrade / pricing visits after viewing | Not joined | **GRAY** |
| Conversions after viewing | Not joined | **GRAY** |
| “Farm Animals causes upgrades” | No attribution | **GRAY** — copy that implied this was **RED** and is removed |
| Missing cover / images / incomplete activities | Content Health + Library Health catalog flags | **GREEN** as catalog QC |
| Admin / bot exclusion | Test emails excluded in Insights; guest bots and admin browsing are not fully stripped | **YELLOW** |

Farm Animals (`cur-lp-preschool-farm-animals`) has **no special backend counter**. It only appears if live events use that title/id. This environment cannot reconstruct production view counts.

---

## 7. Stripe / billing / revenue

**No live Stripe mutations were made. Local/test environments cannot verify live Stripe totals.**

| Metric | Implementation | Live Stripe needed? | Status |
|---|---|---|---|
| Active subscription (access) | Webhook-updated user fields + `membershipHasProAccess` | For production drift, yes (`/api/admin/billing-reconciliation`) | **GREEN** locally; **YELLOW** until reconciled in production |
| Trial / cancel-at-period-end / past_due / unpaid | Membership helpers | Yes to confirm webhook freshness | **GREEN** logic |
| Failed charges | `invoice.payment_failed` → billing review | Yes | **GREEN** as review count, not revenue |
| Refunds | Not modeled | Yes if you need net cash | **GRAY** |
| Discounts / Early User $13.99 / Founding $9.99 / Pro $19.99 / Annual $199 / Center | Plan key from Stripe nickname/amount; MRR uses listed `monthlyPrice` | Yes for invoice-level net | **YELLOW** — MRR is listed recurring, not invoice net |
| Cash revenue | billingEvents (non-fail, non-cancel) + unmatched checkout_success | Yes | **YELLOW** — renewals via `invoice.paid` do **not** write billingEvents; twins can double-count if timestamps differ; $0 trials may log list price |
| Gross vs net vs refunds | Not distinguished | Yes | **GRAY** — do not treat “Revenue MTD” as net collected |
| MRR | Sum of current paid-access list prices (annual÷12) | No for listed MRR | **YELLOW** — trials with empty price contribute $0; Founding-in-trial classified as Trial |
| Expected recurring vs collected | MRR ≠ Revenue MTD | — | **GREEN** as long as labels are not swapped (they are not) |

---

## 8. Marketing attribution

| Topic | Owner Analytics | Insights funnel | Status |
|---|---|---|---|
| Channels | Facebook, TikTok, Google, Direct, Referral, Email, Unknown | Facebook, TikTok, Google, Direct, Organic, Other | **YELLOW** — two taxonomies |
| Assignment | First-touch visit if conversion source unknown; user.attribution fill | Event/user attribution mapped by `funnelChannelFromRaw` | **YELLOW** |
| UTM | `utm_source` / medium / campaign + fbclid/ttclid/gclid | Same raw fields, different bucket | **YELLOW** |
| Missing UTM + empty referrer | Direct | Direct | **YELLOW** — cookie/device reset creates a new visitor |
| “Direct is best” | Ranked by paid then signups | Advisor now prints visitors/signups/paid and small-sample warning | **YELLOW** |
| Cross-session | visitorId persistence | Same | **YELLOW** — logout / new device splits visitors |

---

## 9. Other Insights hubs (short)

| Hub | Notes | Status |
|---|---|---|
| Feature Usage | Event counts; search empty = `active_empty` (measured none); favorites pending if no events | **YELLOW** / **GREEN** empty-search honesty |
| Feature Requests | Store tickets | **GREEN** |
| Error Center | Client JS pending if zero; server 5xx live | **YELLOW** |
| Search Analytics | `ledTo` conversions only if client set them | **YELLOW** / **GRAY** for true search→paid |
| Email Analytics | Delivered always null; opens/clicks only welcome/founding receipts | **GREEN** unknown vs 0.0% |
| SEO | Sitemap/robots only; GSC not connected | **GRAY** for query/CTR |
| Churn | `subscription_canceled` or canceledAt; “Annual cancels” = 365-day cancel **events**, not ARR | **YELLOW** |
| Content Health | Catalog + view maps; low performing = views>0 and <3 | **YELLOW** |
| Release Center | Build/health, not usage | **GREEN** as ops |
| Emails (owner tab) | Send/fail/skip + audience lists | **YELLOW** — different from Email Analytics |
| AI Usage / Health | `/api/admin/ai-usage`, `/api/admin/ai-health` | **GREEN** as AI logs |
| System Health | Live checks | **GREEN** as ops |
| Library Health / Curriculum Director | Teaching Kit quality + usage lists | **YELLOW** — “lessons driving Pro upgrades” needs the same caution as Farm Animals |

---

## 10. Time windows

| Surface | Window | Risk |
|---|---|---|
| Insights hubs | Today (UTC midnight) / 7d / 30d / All time | Advisor **opens on Today** — a 92% “drop-off” can be a single morning of visitors |
| Owner Analytics | 90-day / 5000-event buffer, no picker | Do not compare Owner unique visitors to Insights Today visitors |
| Activity today | UTC day | Local timezone can disagree |
| Inactive | Rolling 14×24h | Not calendar days |
| Churn “monthly” | Insights range **or** last 30 days of canceledAt if no events | Documented fallback |
| Rates | Numerator and denominator now stay in the same Insights range | Owner visitor→signup still mixes snapshot users with buffer visitors (**YELLOW**) |

---

## 11. Data-quality flags added

- Funnel rates with a **zero denominator** now show **Insufficient data**, not `0%`.
- Measured zero (10 visitors, 0 starts) still shows **0.0%**.
- Email delivered / open / click already used **Unavailable** vs measured `0.0%`.
- Advisor cards can show numerator/denominator/time window (`evidence`).
- Do not treat missing lastSeen as inactive in Advisor.

---

## 12. Corrections made in this change

1. Advisor/funnel edge label: **Visitor → Started signup** (not “Signup started” as a form-failure story).
2. Conversion opportunities always state starting population, resulting population, number lost, conversion rate, and time window — using **live counts only**.
3. Visitor→signup copy: “N of M visitors did not start signup” / “X% started signup.” Never “people dropped out of signup.”
4. Funnel banner and step rows use the same honest continued / did-not-continue wording.
5. Highest-viewed lesson no longer claims it is opened “before upgrading.”
6. Source ranking shows visitors/signups/paid and a small-sample warning; not causal.
7. Trial-ending rec excludes test emails and already-paid accounts.
8. Inactive Pro/Founding rec requires a real lastSeen/lastLogin; incomplete activity data is excluded.
9. Zero-denominator Insights rates → **Insufficient data**.
10. Advisor cards render evidence (numerator/denominator/window) when present.

**Not changed:** Stripe, prices, subscriptions, user plans, emails, Owner Analytics formulas, membership-access math, event emission (no `signup_form_submit` / `signup_landed_free` invented).

---

## 13. Still cannot measure (GRAY)

- `signup_form_submit` and `signup_landed_free`
- ARR and annual-subscriber KPI
- Refunds / net collected
- Recurring invoice cash (unless a billing row exists)
- Unique Free vs paid Farm Animals viewers and post-view upgrades
- Search→subscription causation
- GSC query/CTR
- Bot vs human visitors
- First-touch vs last-touch as a user-selectable model
- Historical funnel steps from before instrumentation

---

## 14. Can the owner/admin dashboard be trusted for business decisions?

**Yes, with the definitions in this report — not as unlabeled interchangeable totals.**

Trust **now** for:

- Current account inventory (Free / Trial / Pro / Early User / Founding) as **non-additive current access**
- Insights unique-visitor → started-signup → completed signup **in the selected range**
- Cancel-at-period-end vs ended vs billing review
- Whether a lesson is the highest **viewed** (events) in-range

Treat as **directional only**:

- Owner “paid users,” trial conversion %, visitor→signup %
- Revenue MTD vs MRR (different questions)
- “Direct is winning”
- Content “upgrade” stories
- User Health scores vs Command Center “Active Users”

Do **not** decide from:

- A Today Advisor card without reading the window
- Adding Free + Trial + Pro + Founding + Early User
- Any number that would require refunds, ARR, or form-submit steps

---

## 15. Tests run

| Suite | Result |
|---|---|
| `npm run check` | **PASS** |
| `npm run test:admin-insights` | **PASS** |
| `npm run test:admin-metric-accuracy-audit` | **PASS** (new) |
| `npm run test:marketing-funnel-flow` | **PASS** |
| `npm run test:funnel-exit-insights` | **PASS** |
| `npm run test:test-account-guard` | **PASS** |
| `npm run test:billing-membership` | **PASS** (Playwright browser checks skipped — not installed) |
| `npm run test:membership-billing-phase5` | **PASS** |
| `npm run test:account-access` | **PASS** |
| `npm run test:admin-analytics-diagnostics-phase8` | **PASS** |
| `npm run test:admin-analytics-accuracy` | **FAIL (pre-existing)** — stale `app.js` comment and cache-bust version pins (`20260722-lesson-empty-hotfix` vs current `20260817-linked-preview-keep-editor-r2`). Not caused by this audit. |
| `npm run test:marketing-analytics` | **FAIL (pre-existing)** — looks for `data-admin-landing-tab="marketing-analytics"` in `admin-workspace.js`; that tab id is not on Admin Home. Unrelated static wiring. |
| `npm run test:analytics-event-cap` | **FAIL (pre-existing)** — `runtime cap exceeded: 60`. Event-cap script, not metric wording. |

Live Stripe invoice/refund totals were not verified (no production Stripe calls; no mutations).

**Confirmations:** no emails sent; no Stripe records/prices/subscriptions modified; no user plans or access modified.
