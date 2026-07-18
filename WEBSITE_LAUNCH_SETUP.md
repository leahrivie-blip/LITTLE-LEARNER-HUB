# Little Learner Hub Website Launch Setup

This checklist is for the website launch only.

## 1. Private Admin Login

The website backend now has private admin values in `.env`:

```bash
ADMIN_EMAIL=little.learners.hub.customer@gmail.com
ADMIN_PASSWORD=stored in .env
ADMIN_ACCESS_CODE=stored in .env
```

Keep the password and access code private. Do not paste them into public code, screenshots, ads, or support messages.

## 2. Stripe Live Billing

In Stripe, create these recurring prices:

- Founding Member: `$9.99/month`
- Pro Monthly: `$19.99/month`
- Pro Annual: `$199/year`

Paste the live values into `.env`:

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FOUNDING_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
```

For testing first, use Stripe test keys that start with `sk_test_`. Switch to `sk_live_` only when you are ready to accept real money.

## 3. OpenAI API

Paste your OpenAI API key into `.env`:

```bash
OPENAI_API_KEY=sk-proj_...
OPENAI_MODEL=gpt-4o-mini
```

The backend enforces AI limits:

- Free: 10 AI generations/month
- Pro and Founding: 250 AI generations/month

## 4. HTTPS Domain

When the website is hosted, update `.env` / Render Environment:

```bash
SITE_URL=https://www.littlelearnerhub.com
```

Use that same domain for Stripe redirect URLs and webhook setup.

Stripe webhook URL:

```bash
https://www.littlelearnerhub.com/api/webhooks/stripe
```

**Important:** `littlelearnerhub.com` must resolve to Render (`www` CNAME → `little-learner-hub.onrender.com`, apex A → `216.24.57.1`), regardless of registrar/DNS host.  
See **`docs/DOMAIN_DNS_FIX.md`** and Admin → Safety Center → Custom domain DNS (`GET /api/domain-dns-check`).

Working public URLs while the brand domain is propagating:

```bash
https://littlelearnershubbyleah.com/
https://little-learner-hub.onrender.com/
```

The project includes basic Node hosting files:

- `Procfile`
- `render.yaml`
- `/api/health`

For a simple website launch, use a Node host that supports environment variables and HTTPS. Set the start command to:

```bash
node server/index.js
```

After hosting, set the production `SITE_URL` to the HTTPS URL the host gives you.

## 5. Protected Database

The current website stores launch data in:

```bash
server/data/launch-store.json
```

That is fine for local testing, but not for serious traffic.

Before paid ads or many real customers, move these records to a protected hosted database:

- accounts
- Stripe customer/subscription records
- founding member claims
- AI usage
- AI outputs
- support tickets
- analytics events
- leads

Set these when the protected database is ready:

```bash
DATABASE_PROVIDER=external
PRODUCTION_DATABASE_URL=...
PRODUCTION_DATABASE_SERVICE_KEY=...
```

Do not upload `.env` publicly. The `.gitignore` file excludes `.env` and local `server/data/` records.

## 6. Run Checks

Start the website backend:

```bash
node server/index.js
```

Check Stripe:

```bash
node server/stripe-check.js
```

Stripe can be checkout-ready before it is launch-ready. Launch-ready requires:

- Stripe secret key
- all 3 Stripe price IDs
- Stripe webhook secret

Check the full website launch status:

```bash
node server/launch-check.js
```

You can also open:

```bash
http://localhost:4242/api/launch-readiness
```

The website is ready for paying customers only when the launch check says `READY`.

## 7. Current Status

As of the latest local setup:

- Stripe test checkout: ready
- Admin login: ready
- Stripe webhook: still needed
- OpenAI API key: still needed
- HTTPS domain/hosting: still needed
- Protected production database: still needed
