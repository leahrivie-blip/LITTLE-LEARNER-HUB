# Little Learner Hub Stripe Setup

This project now has a Stripe-ready backend in `server/index.js`.

## Stripe Products and Prices

Create these recurring prices in Stripe:

- Founding Member: `$9.99/month`
- Pro Monthly: `$19.99/month`
- Pro Annual: `$199/year`

Copy the Stripe price IDs into your environment:

```bash
STRIPE_PRICE_FOUNDING_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
```

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

The server tracks the first 50 paid founding subscribers in:

```bash
server/data/launch-store.json
```

The public site shows 15 founding spots already filled and counts down from there. In production, move this tracking to Firestore or another secure database so the first-50 logic is protected and durable.

## Before Launch

- Use live Stripe keys only when ready to accept real payments.
- Confirm Customer Portal settings in Stripe allow payment method updates and cancellation.
- Add the production domain to `SITE_URL`.
- Add the production webhook URL in Stripe Dashboard.
- Run one test checkout for Founding Member, Pro Monthly, and Pro Annual.
- Run one test cancellation from the Stripe Customer Portal.
- Move billing records from the local JSON file to a real database before paid launch.
- Run `node server/launch-check.js` and confirm the full website launch check says `READY`.
