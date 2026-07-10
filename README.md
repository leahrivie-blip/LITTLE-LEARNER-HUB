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

### Curriculum uploads persistent disk (Phase 2D)

Curriculum resource files are stored on disk. Metadata and file URLs live in `siteContent.curriculum.resources` only.

| Setting | Value |
| --- | --- |
| Environment variable | `CURRICULUM_UPLOADS_DIR` |
| Render mount / env value | `/opt/render/project/src/server/data/curriculum-uploads` |
| Local fallback (env unset) | `server/data/curriculum-uploads` |
| Estimated disk cost | **$0.25/GB/month** (1 GB ≈ **$0.25/month**) |

`render.yaml` includes a `disk` block and `CURRICULUM_UPLOADS_DIR`. **Do not assume the disk is active** on an existing Render service until you complete and verify the Dashboard steps below. Blueprint disk settings do not automatically attach a disk to a service that was created outside Blueprint sync.

**Manual Render Dashboard steps (required before production uploads):**

1. Open the **little-learner-hub** web service in the Render Dashboard.
2. Go to **Disks** → **Add disk** (or edit the existing disk if one already exists).
3. Set **Name** to `curriculum-uploads` (or keep the existing name if already attached).
4. Set **Mount path** exactly to:
   `/opt/render/project/src/server/data/curriculum-uploads`
5. Set **Size** to **1 GB** (you can increase later; you cannot decrease).
6. Save — Render will redeploy. Zero-downtime deploys are disabled while a disk is attached; the service stays single-instance.
7. In **Environment**, set (or confirm):
   `CURRICULUM_UPLOADS_DIR=/opt/render/project/src/server/data/curriculum-uploads`
8. After deploy, **verify** before relying on uploads:
   - Upload one test curriculum resource in Admin → Curriculum Resources (Beta).
   - Confirm the file appears under the mount path (Render Shell: `ls /opt/render/project/src/server/data/curriculum-uploads`).
   - Restart or redeploy the service and confirm the same file still exists and opens.
9. Until steps 1–8 succeed, treat curriculum uploads as **ephemeral** (lost on restart/deploy).

Local development does **not** need `CURRICULUM_UPLOADS_DIR`; the server falls back to `server/data/curriculum-uploads` automatically.

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
