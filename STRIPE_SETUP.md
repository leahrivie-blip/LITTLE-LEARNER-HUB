# Little Learner Hub Stripe Setup

This project now has a Stripe-ready backend in `server/index.js`.

## Stripe Products and Prices

Create these recurring prices in Stripe:

- Founding Member: `$9.99/month`
- Pro Monthly: `$19.99/month`
- Pro Early User: `$13.99/month` (same Pro product / entitlement; separate Price ID)
- Pro Annual: `$199/year`

Copy the Stripe price IDs into your environment:

```bash
STRIPE_PRICE_FOUNDING_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_EARLY_USER_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
EARLY_USER_PRICING_ENABLED=false
```

`EARLY_USER_PRICING_ENABLED` defaults to **false**. Keep it off until checkout verification passes.
When enabled, new customers can select Early User ($13.99). Existing Early User
subscriptions continue renewing at $13.99 even if the flag is later turned off —
renewals depend on the Stripe Price ID, not the feature flag.

Do **not** modify, archive, or replace the existing `$19.99` Pro Monthly Price.

Suggested Stripe Dashboard setup:

1. Go to Stripe Dashboard > Product catalog.
2. Create product: `Little Learner Hub - Founding Member`.
3. Add recurring monthly price: `$9.99`.
4. Create product: `Little Learner Hub - Pro Monthly`.
5. Add recurring monthly price: `$19.99`.
6. Create product: `Little Learner Hub - Pro Annual`.
7. Add recurring yearly price: `$199`.
8. Copy each `price_...` ID into `.env`.

## Required Environment Values

Copy `.env.example` to `.env` and fill in:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FOUNDING_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
OPENAI_API_KEY=sk-proj_...
OPENAI_MODEL=gpt-4o-mini
SITE_URL=http://localhost:4242
ADMIN_EMAIL=little.learners.hub.customer@gmail.com
ADMIN_PASSWORD=use-a-private-password
ADMIN_ACCESS_CODE=use-a-private-code
```

Keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` private. Do not place them in browser JavaScript.
Keep `ADMIN_PASSWORD` and `ADMIN_ACCESS_CODE` private too. The browser calls `/api/admin/login`; it should never contain the real admin password.

## Local Testing

Start the Stripe-ready server:

```bash
node server/index.js
```

Open:

```bash
http://localhost:4242
```

Check whether Stripe is configured:

```bash
node server/stripe-check.js
```

Or open this in your browser:

```bash
http://localhost:4242/api/stripe-readiness
```

## Webhook Endpoint

Use this webhook URL in Stripe:

```bash
https://your-domain.com/api/webhooks/stripe
```

For launch, the webhook must be configured. Checkout can open without it, but account status will not reliably update after payment, cancellation, failed payment, or renewal until the webhook secret is added.

For local testing with the Stripe CLI:

```bash
stripe listen --forward-to localhost:4242/api/webhooks/stripe
```

Copy the webhook signing secret from the Stripe CLI output into `.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

Events handled:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## Founding Member Logic

The server tracks Founding Member inventory in `foundingMembers[]` (local JSON or Postgres). Cap is `FOUNDING_MEMBER_LIMIT` (production closeout: set from the live claimed count so exactly 2 new spots remain — currently **47** after 45 claimed). Checkout claims are durable: Postgres uses `pg_advisory_xact_lock` + `SELECT … FOR UPDATE` + a jsonb inventory patch (and full-document upserts union `foundingMembers` so a stale instance write cannot drop a claim). When remaining hits 0, Founding closes everywhere and new Pro is `$19.99/month`. Existing Founding Members keep `$9.99/month locked while your membership remains continuously active`.

```bash
server/data/launch-store.json
```

`PUBLIC_FOUNDING_CLAIMED_BASE` (production: 15) is a marketing offset added to the ledger length for public countdown display.

## Owner task — Stripe Tax product classification (do not auto-change)

**Status:** Separate owner review required. Do **not** change this automatically in code or via agents.

Stripe currently shows the catalog products as **“Needs info”** and classifies them as **SaaS – personal use**.

Little Learner Hub is primarily **business-use software for childcare providers** (home daycares, centers, preschool teachers). Before enabling or changing **automatic tax**, the owner must:

1. Review each product in Stripe Dashboard → Product catalog → tax code / product tax code.
2. Confirm whether the correct classification is business-use SaaS (or the closest Stripe Tax code for B2B childcare-provider software), not personal-use SaaS.
3. Resolve any “Needs info” prompts in Stripe Tax / Product tax settings.
4. Only then enable or adjust automatic tax / tax behavior on Checkout or invoices.

Do not create, edit, archive, or replace Stripe products or prices as part of routine app deploys. Tax classification is an owner/compliance decision.

## Before Launch

- Use live Stripe keys only when ready to accept real payments.
- Confirm Customer Portal settings in Stripe allow payment method updates and cancellation.
- Add the production domain to `SITE_URL`.
- Add the production webhook URL in Stripe Dashboard.
- Run one test checkout for Founding Member, Pro Monthly, and Pro Annual.
- Run one test cancellation from the Stripe Customer Portal.
- Move billing records from the local JSON file to a real database before paid launch.
- Run `node server/launch-check.js` and confirm the full website launch check says `READY`.
- Complete the **Stripe Tax product classification** owner task above before enabling automatic tax.
