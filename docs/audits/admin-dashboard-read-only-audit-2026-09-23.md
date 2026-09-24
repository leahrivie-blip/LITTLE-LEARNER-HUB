# Admin dashboard read-only audit — 2026-09-23

Scope: source and local regression-fixture inspection only. No production API, Stripe, Render, email-provider, AI-provider, or production-store request was made; no production record was read or changed.

## Metric definitions and sources

The Admin analytics endpoint is `GET /api/admin/analytics` in `server/index.js` (`handleAdminAnalytics`, line 20480). It calls `analyticsSummary` (line 20074). Customer metrics first exclude users only through the existing explicit `server/test-account-guard.js` classifier.

| Metric | Exact calculation |
| --- | --- |
| Total users | `Object.values(store.users)` after `filterUsersForCustomerAnalytics`; exposed as `totals.totalRegisteredUsers`. |
| Free users | Users whose `membershipCurrentAccessKey(user) === "free"`; `totals.freeUsers`. |
| Trials | Users whose current access key is `"trial"`; `totals.trialUsers`. |
| Pro users | Users whose current access key is `"pro"`; `totals.proUsers`. This excludes Founding and Early User plans by design. |
| Founding users | Users whose current access key is `"founding"`; `totals.foundingMembers`. Historical founders without active access are excluded. |
| Active memberships | Users with billing status `"active"`; `totals.activeSubscriptions`. This is intentionally narrower than paid access because it excludes canceling-but-still-entitled accounts and inherited staff access. |
| Paid access | `membershipHasProAccess(user)` and `accountStatus !== "Disabled"`; `totals.paidUsers`. It includes active, canceling-with-access, manual/provisioned access, and eligible inherited staff access. |
| Paid conversions | There are two metrics: `proCheckoutsCompleted` counts filtered `checkout_success` analytics events; `subscriptionConversions` counts currently paid users whose `subscriptionStartedAt` (or signup date fallback) is within 30 days. Neither is an authoritative Stripe invoice count. |
| Revenue | `totalRevenue` and `revenueThisMonth` sum normalized `analyticsRevenue.collectRevenueItems(paidEvents, billingEvents)`. It is event/history based, not a Stripe ledger reconciliation. |
| MRR | `monthlyRecurringRevenue` sums current paid users' monthly price, dividing annual price by 12; otherwise it falls back to Founding `$9.99`, Early User `$13.99`, and Pro `$19.99`. It is an estimate and includes non-Stripe paid access. |
| Canceled/inactive users | Canceled = billing key `"canceled"` or `"ended"` (`canceledSubscriptions`). Inactive = no `lastSeenAt`, `lastLoginAt`, `signupAt`, or `createdAt` within 14 days (`inactiveUsers`). |
| Accounts needing review | Billing key `"needs_billing_review"` (`billingStatusCounts.needsBillingReview`); the detailed admin buckets are `membershipAdminAuditBuckets(users)` in `server/membership-access.js`. |

## Confirmed discrepancies

1. **Paid counts are not interchangeable.** `paidUsers` means current access, `activeSubscriptions` means Stripe-style active billing only, `paidAccessNotCanceling` excludes scheduled cancellations, and `proUsers` excludes Founding/Early User. These definitions explain differing visible counts without evidence of a duplicate user record.
2. **Paid conversion and revenue figures use different sources.** Checkout analytics events can be retained/filtered independently of billing events, while MRR derives from current memberships. They should not be presented as a reconciliation.
3. **Confirmed issue: unverified Checkout success could grant access.** `handleCheckoutStatus` used `session.payment_status === "paid" || session.status === "complete"` before calling `applyCheckoutMembershipUpgrade`. A complete session is not by itself an adequate paid-payment proof. The smallest fix is to require `payment_status === "paid"` for this browser-visible status endpoint; the webhook remains the authoritative lifecycle path.

## Stripe synchronization and billing records

Per-user admin rows expose `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, `lastStripeSyncAt`, membership audit entries, access source, and period/cancellation details through `membershipSummaryForUser` (`server/index.js`, lines 12257–12370) and the membership-access helpers.

Webhook updates route through `upsertStripeSubscription` and persist a Stripe event timestamp/event-ID watermark. The webhook handler also compares event timestamps before applying updates. Existing focused coverage is `scripts/test-stripe-billing-reconciliation.js` and `scripts/test-subscription-status-auth.js`.

The code has a valid idempotency/order strategy for webhooks. The browser checkout-status endpoint was the exception above; it is being corrected without changing webhook behavior, Stripe data, or any membership record.

## Google Ads paid conversion tracking

`scripts/google-ads-paid-subscription-conversion.js` emits `gtag("event", "conversion")` only from `emitAfterPaidSubscriptionConfirmed`. Current configured `send_to` is `AW-18405245658/oFU5CM7VwYAdENqFp8hE`; it sends USD amount-total/100 and uses the Checkout Session ID as `transaction_id`. It rejects trial, zero-value, missing-session, non-USD, no-consent, and failed `gtag` cases. Session storage deduplicates a successfully emitted Checkout Session ID.

`app.js` calls this only when the server response says `paymentConfirmed === true`. `scripts/test-google-ads-paid-subscription-conversion.js` proves the local implementation and its guards. It does not prove that Google Ads has received or attributed a production conversion, so production tracking cannot be claimed as working from this audit.

## Admin Home analytics

The client request is `loadAdminAnalyticsFromBackend` (`app.js`, lines 55180–55362). It has timeout/abort handling, raw-body JSON parsing, HTTP diagnostics, and a `finally` that clears the loading state. The server now uses `peekStore()` and indexes events once, avoiding the previously expensive per-user clone. `scripts/test-admin-analytics-root-cause.js` exercises the endpoint with 120 users and 8,000 events.

No currently reproducible stuck-Refreshing defect was found in the inspected code. A stale/invalid admin token, non-JSON server failure, or backend timeout now produces a diagnostic and clears the spinner rather than silently rendering zero data.

## Messages and Support Inbox

`comms-center.js` consolidates messages, support, feedback, bugs, features, and explicit test/internal items, supports title/name/email/preview search, preserves reply/archive/conversation behavior, and marks selected test/internal rows without deleting them. The server classifier (`server/comms-api.js`) uses explicit account markers, configured admin identities, and explicit message markers such as `[test]`, `[probe]`, and `smoke test`.

Confirmed small usability omission: Admin Inbox has the underlying unread counts but no unread-only filter. A targeted filter can be added without changing any message state.

## Password reset

The route stores only a token hash (`server/email-auth.js`) and `scripts/test-password-reset-email.js` covers known/unknown neutral responses, Resend delivery attempt, address normalization, production URL, expiry, one-time use, provider failure, and non-logging of the raw reset token.

No confirmed delivery bug is reproducible in the local mocked-provider test. Actual delivery requires production email-provider logs/status and Leah's approval to inspect them; no live reset email was requested.

## AI Health

AI Health reports provider/configuration operational readiness (`OPENAI_API_KEY` configured plus master enablement), while each tool row reports only its individual enable switch. Therefore “Unavailable” plus “Enabled” tool switches is expected when a tool is enabled but the provider is unconfigured/unhealthy. `scripts/test-ai-reliability.js` verifies this without a paid AI call.

No AI configuration or generation was invoked.

## Follow-up fixes from source review

- **Admin Home analytics:** The loader cleared `adminAnalyticsLoading` without repainting the visible Admin Home workspace, leaving its Refresh button disabled and totals stale. `app.js` now rerenders only the visible Home workspace for loading, success, failure, and completion states.
- **Support Inbox:** Conversation previews now request `markRead=0`, so reviewing a member reply does not silently remove it from the unread inbox. Test/internal items remain visible in All and Test/Internal, but are excluded from operational category and unread filters.
- **Analytics event ingestion:** Client-submitted `checkout_success` and `subscription_canceled` telemetry can no longer change a user's membership, subscription status, or billing ledger. Verified Stripe and authenticated billing paths remain responsible for those mutations.
- **Password-reset delivery:** A failed provider send can leave a short-lived reset token stored while the public response remains deliberately neutral. Changing write/send ordering would trade that for potentially delivered but unusable links, so it is not safe as an isolated change; provider-log review is required before any delivery-flow redesign.

## Test-data review list

No production store was read in this audit, so there is no live-account or live-message list to classify. The existing safe classifier supplies the review criteria below; it must be used rather than new ad-hoc filters:

| Candidate marker | Classification reason |
| --- | --- |
| `@example.com`, `.test`, `.local`, `.example`, documented QA domains | Explicit fixture/test domain in `server/test-account-guard.js`. |
| Local-part tokens delimited as `test`, `demo`, `audit`, `qa`, `fake`, `sample`, `dummy`, `playwright`, `selenium`, `smoke`, `probe`, `verify`, `e2e`, or `matrix` | Explicit documented test-account marker; delimiters avoid classifying names such as `testimony`. |
| `prod-up`, `regression-probe`, `llh-signup`, `signup-ui`, `ui-test` prefixes | Explicit documented automation marker. |
| `llh.prod.flag.*` | Explicit internal production-flag convention (used by campaign eligibility code). |
| Inbox content with `[test]`, `[probe]`, `[internal]`, or explicit `smoke/e2e/regression` ticket wording | Explicit server-side message marker in `isTestOrInternalInboxItem`. |
| Configured admin-member email | Explicit internal identity, not a name/email heuristic. |

“TK persona” wording alone is not currently an explicit safe account classifier and should be manually reviewed, not excluded from business metrics. Unusual names, unfamiliar domains, or email style alone are not test evidence.

## Post-deployment Stripe configuration verification

Read-only production checks confirmed that `/api/build-version` reports commit `a215339a801129d38b80a80d618940a71704201c`. Stripe readiness, checkout readiness, and webhook configuration all report `true`; the configured webhook endpoint is `/api/webhooks/stripe`. No secret values were read or exposed.

No checkout request was repeated because the endpoint may perform server-side housekeeping before rejecting invalid input, which conflicts with the no-data-change requirement. Consequently, valid checkout creation, payment completion, signed webhook delivery, and production entitlement persistence remain unverified. This records Stripe as configuration-ready, not payment-verified.

## Required approval / follow-up

Leah's approval is required before inspecting live provider logs, changing production configuration, modifying any production user/message/subscription/payment record, or performing a Stripe reconciliation/backfill. None is part of this change.
