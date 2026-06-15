# Little Learner Hub

Little Learner Hub is a childcare provider website and app with lesson plans, observations, forms, activities, printables, AI tools, membership billing screens, support tickets, and child management tools.

## Open Locally

The app still works by opening `index.html`, but it is better to test it as a website through a local server.

```bash
npm run start
```

Then open:

```text
http://localhost:4173
```

## Ad-Ready Routes

These routes are mapped inside the app for ad traffic and analytics:

- `/free-daycare-forms`
- `/daycare-lesson-plans`
- `/observation-generator`
- `/home-daycare-provider-tools`

For a hosted static site, configure the host to serve `index.html` for those routes.

## Before Real Ads

Connect production services before accepting real payments:

- Stripe Checkout Sessions
- Stripe Customer Portal
- Stripe webhooks
- A secure user database
- Secure storage for child records, support tickets, saved resources, and billing status
- Production analytics

The current local version includes a safe Stripe checkout simulation so the buyer path can be tested without live keys.
