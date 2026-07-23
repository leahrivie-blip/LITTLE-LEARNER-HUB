# Exact minimum Render steps — deploy testing only

**This agent has no Render API key, no Render CLI, and no deploy hook available in its environment.** These are the exact minimum steps for the owner to deploy this branch to the testing service. Production requires none of these steps and is not affected by them.

## One-time service setup (only needed once, if `little-learner-hub-testing` doesn't exist yet)

1. Render dashboard → **New → Web Service**.
2. Connect this repository.
3. **Branch:** `testing/full-platform-integration-2026-07`
4. **Name:** `little-learner-hub-testing` (must be a separate service from `little-learner-hub`)
5. **Build command:** `npm install`
6. **Start command:** `node --max-old-space-size=300 server/index.js`
7. **Health check path:** `/api/health`

## Environment variables (testing service only)

Set these on `little-learner-hub-testing`. Do not copy production's `PRODUCTION_DATABASE_URL`, Stripe keys, or `RESEND_API_KEY` — leave them unset.

| Variable | Value |
|---|---|
| `SITE_URL` | `https://little-learner-hub-testing.onrender.com` |
| `DATABASE_PROVIDER` | `local-json` |
| `ADMIN_EMAIL` | (your choice — can differ from production) |
| `ADMIN_PASSWORD` | (your choice) |
| `ADMIN_ACCESS_CODE` | (your choice) |
| `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW` | `true` |
| `ALLOW_FORMS_CENTER_ADMIN_PREVIEW` | `true` |
| `ALLOW_FAMILY_HUB_TESTING_PREVIEW` | `true` |
| `ALLOW_TESTING_LAB_ADMIN_PREVIEW` | `true` |

Leave unset: `PRODUCTION_DATABASE_URL`, `STRIPE_*`, `OPENAI_API_KEY`, `RESEND_API_KEY`.

## Deploy

8. **Manual Deploy** → select branch `testing/full-platform-integration-2026-07` → deploy the latest commit.
9. Wait for the health check to pass.
10. Visit `https://little-learner-hub-testing.onrender.com`, sign in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_ACCESS_CODE`.
11. Turn on the **Testing Lab** flag once (Settings → Testing and Advanced Tools, or the Admin feature-flags panel).
12. Open **Testing Lab** → select **"Get the testing site ready"** — this seeds both fake programs, turns on the other three testing flags, and issues every role's one-time password in one step. See `docs/OWNER_AND_PROVIDER_TESTING_GUIDE.md`.

## What this never touches

- `little-learner-hub` (production) — different service, different environment variables, not deployed by any of the steps above.
- `main` branch — this deploys `testing/full-platform-integration-2026-07` only.
- Any real database — `DATABASE_PROVIDER=local-json` with no `PRODUCTION_DATABASE_URL` set means there is no path to a real database from this service.
