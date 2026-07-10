# Little Learner Hub

Little Learner Hub is a childcare provider website and app with lesson plans, observations, forms, activities, printables, AI tools, membership billing screens, support tickets, and child management tools.

## Open Locally

The app still works by opening `index.html`, but it is better to test it as a website through a local server.

```bash
npm run start
```

Then open:

```text
http://localhost:4242
```

## Deploy On Render

Use the included `render.yaml` blueprint, or create a Node web service with:

```text
Build command: npm install
Start command: node server/index.js
Health check path: /api/health
```

Set `SITE_URL` to the HTTPS URL Render gives you after the first deploy. Add the Stripe, OpenAI, admin, and database environment values in Render's dashboard rather than committing `.env`.

### Curriculum resource uploads (Phase 2D)

Curriculum resources reuse the same durable storage pattern as Forms, Printables, legacy Uploads, and lesson plan attachments:

- File bytes are stored as **data URLs** (or HTTPS URLs) in `siteContent.curriculum.resources[].fileData`
- Persistence is through the existing app store (**Postgres** in production)
- **No local disk**, **no Render persistent disk**, and **no `CURRICULUM_UPLOADS_DIR`**
- Max upload size: **5 MB** per file (PDF or image), sized for the existing data-URL / JSON store architecture

Resources link to lesson plans only. Approved categories: Classroom Resources, Behavior & Social Emotional, Printables.

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
test after Github transfer
