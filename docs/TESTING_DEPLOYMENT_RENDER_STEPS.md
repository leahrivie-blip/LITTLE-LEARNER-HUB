# Exact minimum Render steps — deploy testing only

**This agent has no Render API key, no Render CLI, and no deploy hook available in its environment.** These are the exact minimum steps for the owner to deploy this branch to the testing service. Production requires none of these steps and is not affected by them.

## 0. Before inviting any tester: durable storage (do this first)

**Render's default web-service filesystem is ephemeral** — every restart or redeploy wipes anything not on a persistent disk or a real database. `DATABASE_PROVIDER=local-json` (the default, and the only mode this project needs zero setup for) writes to a plain file on that ephemeral filesystem. That means, **unless you do one of the two things below, every restart/redeploy will silently wipe all seeded fake accounts, fake program data, and every tester's feedback thread history.**

Pick ONE of these before you invite testers:

### Option A (recommended): a separate, testing-only Postgres database
1. Render dashboard → **New → PostgreSQL**. Name it something obviously non-production, e.g. `little-learner-hub-testing-db`.
2. Copy its **Internal Connection String**.
3. On the `little-learner-hub-testing` **web service**, set:
   - `DATABASE_PROVIDER` = `postgres`
   - `TESTING_DATABASE_URL` = *(the connection string from step 2)*
   - Leave `PRODUCTION_DATABASE_URL` **unset** on this service. (If it is ever set anyway, it is still never read — the server always uses `TESTING_DATABASE_URL` on a non-production `SITE_URL`, and always uses `PRODUCTION_DATABASE_URL` on a live production `SITE_URL`, and never the other one, even if both are present. This was written specifically so a testing service can never end up pointed at the real production database, by design or by mistake — see `scripts/test-testing-database-isolation.js`.)
4. That's it — the same `llh_store` table schema production uses is created automatically on first boot, in this separate database. Fake accounts, fake program data, and Testing Feedback threads now survive every restart and redeploy.

### Option B (lighter-weight): a Render persistent disk
1. On the `little-learner-hub-testing` web service, add a **Disk** (Render dashboard → the service → Disks → Add Disk). Give it a mount path, e.g. `/var/data`.
2. Set `LLH_STORE_PATH` = `/var/data/launch-store.json`.
3. Leave `DATABASE_PROVIDER` = `local-json` (the default).
4. Data now survives restarts and redeploys as long as the disk itself isn't deleted. (This is simpler than Option A but ties data to one specific disk/service; Option A is more robust for a service you expect to keep around and iterate on.)

**If you skip both of these**, the testing site still works fine for a single session, but a restart or redeploy will silently reset it back to empty — plan your first real tester invitations accordingly.

## One-time service setup (only needed once, if `little-learner-hub-testing` doesn't exist yet)

1. Render dashboard → **New → Web Service**.
2. Connect this repository.
3. **Branch:** `testing/full-platform-integration-2026-07`
4. **Name:** `little-learner-hub-testing` (must be a separate service from `little-learner-hub`)
5. **Build command:** `npm install`
6. **Start command:** `node --max-old-space-size=300 server/index.js`
7. **Health check path:** `/api/health`

## Environment variables (testing service only)

Set these on `little-learner-hub-testing`. **Never copy production's `PRODUCTION_DATABASE_URL`, Stripe keys, or `RESEND_API_KEY` onto this service.**

| Variable | Value |
|---|---|
| `SITE_URL` | `https://little-learner-hub-testing.onrender.com` |
| `DATABASE_PROVIDER` | `local-json` (or `postgres` — see Section 0, Option A) |
| `TESTING_DATABASE_URL` | *(only if `DATABASE_PROVIDER=postgres`; see Section 0, Option A)* |
| `LLH_STORE_PATH` | *(only if using Section 0, Option B's persistent disk)* |
| `ADMIN_EMAIL` | (your choice — can differ from production) |
| `ADMIN_PASSWORD` | (your choice) |
| `ADMIN_ACCESS_CODE` | (your choice) |
| `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW` | `true` |
| `ALLOW_FORMS_CENTER_ADMIN_PREVIEW` | `true` |
| `ALLOW_FAMILY_HUB_TESTING_PREVIEW` | `true` |
| `ALLOW_TESTING_LAB_ADMIN_PREVIEW` | `true` |

Leave unset (always): `PRODUCTION_DATABASE_URL`, `STRIPE_*`, `RESEND_API_KEY`.

**Testing Feedback** (the "Send Testing Feedback" button testers see, and the admin inbox in Testing Lab) needs **no environment variable or feature flag at all** — it works the moment a tester is logged into a fake account on this non-production host. It is still, like everything else here, completely unreachable on the real production service.

### Optional: trying real AI ("AI Testing" / "AI Outcomes")

Everything above works with zero AI setup. If you also want to try the real OpenAI integration (Classroom Assistant's "Try AI interpretation" checkbox, and the AI Outcomes panel in Testing Lab), additionally set:

| Variable | Value |
|---|---|
| `ALLOW_OPENAI_TESTING` | `true` |
| `OPENAI_API_KEY` | a real OpenAI key, used ONLY by this testing service |
| `OPENAI_MODEL` | `gpt-4o-mini` (small/inexpensive default; optional, this is the default if unset) |

**Safe spending-limit recommendations for this key:**
- Set an OpenAI **hard usage limit** (in your OpenAI account's billing settings, not in this app) low enough that even a runaway test session can't cause a surprising bill — a few dollars is generous for exploratory testing with `gpt-4o-mini`. This app's own rate limits (20 requests/minute per tester, 50/minute per fake organization — see `scripts/ai-testing-data-model.js`) are a second, independent layer, not a replacement for an OpenAI-side hard limit.
- Never reuse a production OpenAI key here. Create a **separate key** for the testing service specifically, so you can revoke it independently without touching any production AI feature.
- After turning this on, sign in as Platform Admin and turn on the **"AI Testing"** feature flag once (same place as the other testing flags). Without that flag, the key is configured but nothing calls it.
- To stop all real AI spend immediately at any time: turn the **"AI Testing"** flag back off, or remove `OPENAI_API_KEY` from the environment (either takes effect immediately, and every AI-assisted screen simply falls back to its existing non-AI local review).

**The controlled real-AI smoke test** (run manually, never automatically, makes a small number of real billed calls with obviously-fake fixture text):

```bash
OPENAI_API_KEY=sk-... AI_TESTING_REAL_SMOKE_CONFIRM=yes npm run test:ai-testing-real-smoke
```

Run this once against a real key (from this repo, e.g. via a one-off shell with the same env vars set) before relying on the live AI path with real testers — it also re-verifies, live, that production would still make zero real network calls even with a valid key present.

## Deploy

8. **Manual Deploy** → select branch `testing/full-platform-integration-2026-07` → deploy the latest commit.
9. Wait for the health check to pass.
10. Visit `https://little-learner-hub-testing.onrender.com`, sign in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_ACCESS_CODE`.
11. Turn on the **Testing Lab** flag once (Settings → Testing and Advanced Tools, or the Admin feature-flags panel).
12. Open **Testing Lab** → select **"Get the testing site ready"** — this seeds both fake programs, turns on the other three testing flags, and issues every role's one-time password in one step. See `docs/OWNER_AND_PROVIDER_TESTING_GUIDE.md`.
13. (Optional, AI only) Turn on the **"AI Testing"** flag if you set up the OpenAI variables above.

## What this never touches

- `little-learner-hub` (production) — different service, different environment variables, not deployed by any of the steps above.
- `main` branch — this deploys `testing/full-platform-integration-2026-07` only.
- Any real database — with `DATABASE_PROVIDER=local-json` (default) there is no database at all; with `DATABASE_PROVIDER=postgres` the server always connects using `TESTING_DATABASE_URL` on this non-production host and will never read `PRODUCTION_DATABASE_URL`, even if it happens to also be set (verified by `scripts/test-testing-database-isolation.js`).
- Stripe, Resend (email), and SMS — none of their keys are set here, so checkout/outbound email/SMS all remain in their existing safe local-simulation/disabled state, exactly as on any other testing-only deployment.
