# Exact minimum Render steps — deploy testing only

**This agent has no Render API key, no Render CLI, and no deploy hook available in its environment.** These are the exact minimum steps for the owner to deploy this branch to the testing service. Production requires none of these steps and is not affected by them.

## 0. Before inviting any tester: durable storage is REQUIRED (do this first)

**Render's default web-service filesystem is ephemeral** — every restart or redeploy wipes anything not on a persistent disk or a real database. `DATABASE_PROVIDER=local-json` writes to a plain file on that ephemeral filesystem. **Unless you do one of the two things below, every restart/redeploy will silently wipe all seeded fake accounts, fake program data, and every tester's feedback thread history.**

**Recommended: Option A (a separate, testing-only Postgres database). Use Option B ONLY if you have personally run the verification step in it and confirmed data survives — do not deploy on local-json "as a shortcut" and assume it will be fine.**

### Option A — RECOMMENDED: a separate, testing-only Postgres database
1. Render dashboard → **New → PostgreSQL**. Name it something obviously non-production, e.g. `little-learner-hub-testing-db`.
2. Copy its **Internal Connection String**.
3. On the `little-learner-hub-testing` **web service**, set:
   - `DATABASE_PROVIDER` = `postgres`
   - `TESTING_DATABASE_URL` = *(the connection string from step 2)*
   - Leave `PRODUCTION_DATABASE_URL` **unset** on this service. (If it is ever set anyway, it is still never read — the server always uses `TESTING_DATABASE_URL` on a non-production `SITE_URL`, and always uses `PRODUCTION_DATABASE_URL` on a live production `SITE_URL`, and never the other one, even if both are present. This was written specifically so a testing service can never end up pointed at the real production database, by design or by mistake — see `scripts/test-testing-database-isolation.js`.)
4. That's it — the same `llh_store` table schema production uses is created automatically on first boot, in this separate database. Fake accounts, fake program data, and Testing Feedback threads now survive every restart and redeploy without any further verification needed (this is exactly what `scripts/test-store-write-race.js` and `scripts/test-testing-database-isolation.js` already prove against a real Postgres wire protocol).

### Option B — local-json + a persistent disk: MUST be verified before use, not assumed
Local JSON storage (with or without a disk) must **never** be treated as durable until you have personally run the restart-and-redeploy check below and confirmed it passes. Do not skip this and "hope it works" — a failed assumption here means silently losing every tester's data and feedback history the first time Render restarts the service for any reason (a deploy, a plan change, routine maintenance).

1. On the `little-learner-hub-testing` web service, add a **Disk** (Render dashboard → the service → Disks → Add Disk). Give it a mount path, e.g. `/var/data`.
2. Set `LLH_STORE_PATH` = `/var/data/launch-store.json`.
3. Leave `DATABASE_PROVIDER` = `local-json` (the default).
4. Deploy, then sign in and seed a small amount of recognizable fake data (e.g. run "Get the testing site ready" once).
5. **Restart the service** from the Render dashboard (Manual → Restart, not a redeploy) and confirm the same fake accounts/data are still there after it comes back up.
6. **Then also do a full redeploy** (push a trivial commit, or use Manual Deploy → Deploy latest commit) and confirm AGAIN that the same fake accounts/data are still there afterward. A restart and a redeploy are not the same operation on Render and disks have been known to behave differently across the two — both must be checked, not just one.
7. Only after BOTH checks (5 and 6) pass should you consider this service's storage durable and start inviting real testers. If either check fails, switch to Option A instead — do not keep using local-json believing it "should" be fine.

**If you deploy without completing Option A, or without completing BOTH verification steps in Option B**, treat the service as having ephemeral, session-only storage: fine for a quick solo look around, not safe to hand to testers who need their feedback threads and progress to persist.

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
| `DATABASE_PROVIDER` | `postgres` (recommended — see Section 0, Option A) |
| `TESTING_DATABASE_URL` | *(the testing-only Postgres connection string; see Section 0, Option A)* |
| `LLH_STORE_PATH` | *(only if using the verified persistent-disk path, Section 0 Option B — and only after completing its restart + redeploy verification)* |
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
| `OPENAI_API_KEY` | a real OpenAI key, used ONLY by this testing service — set it here, as a Render secret, and never anywhere else (see the smoke-test procedure below for how to verify it without ever re-typing it) |
| `OPENAI_MODEL` | `gpt-4o-mini` (small/inexpensive default; optional — this is only used if `OPENAI_MODEL` is unset. `OPENAI_MODEL` is read directly everywhere a real call is made and is never overridden or hardcoded in code — set any OpenAI model name here and it takes effect) |

**Built-in usage limits (already enforced by the app, no setup needed):**
- **5 requests/minute per tester**
- **20 requests/minute per organization** (all testers in that fake organization combined)
- **200 requests/day per organization** — a second, independent daily ceiling so many small per-minute bursts across a day still can't add up to runaway usage
- Every one of these returns a clear, specific message when hit (never a generic error) and always safely falls back to the existing non-AI local review — a tester's entry is never lost.
- Platform Admin can see sanitized usage — request/token/cost totals and per-organization limit status only, **never** the actual text of any request or response — in Testing Lab → AI Outcomes → "Usage limits, by organization".
- These are deliberately conservative starting values for a brand-new feature and can be raised later once real usage is understood.

**Safe spending-limit recommendations, on top of the above:**
- Also set an OpenAI **hard usage limit** (in your OpenAI account's billing settings, not in this app) low enough that even a sustained multi-day testing period can't cause a surprising bill — a few dollars a month is generous for exploratory testing with `gpt-4o-mini` at these request volumes. This app's own limits above are a second, independent layer, not a replacement for an OpenAI-side hard limit.
- Never reuse a production OpenAI key here. Create a **separate key** for the testing service specifically, so you can revoke it independently without touching any production AI feature.
- After turning this on, sign in as Platform Admin and turn on the **"AI Testing"** feature flag once (same place as the other testing flags). Without that flag, the key is configured but nothing calls it.
- To stop all real AI spend immediately at any time: turn the **"AI Testing"** flag back off, or remove `OPENAI_API_KEY` from the environment (either takes effect immediately, and every AI-assisted screen simply falls back to its existing non-AI local review).

**The controlled real-AI smoke test — exact safe procedure (never exposes the OpenAI key):**

Once `OPENAI_API_KEY` is set as a Render secret on the deployed `little-learner-hub-testing` service (per the table above — set once, in the Render dashboard, never anywhere else), verify it works by running the smoke test in **remote mode**, from your own machine, against the live URL. This mode never reads or needs the OpenAI key at all — it logs in as the testing site's own admin (a normal admin login, the same one you already use) and lets the ALREADY-DEPLOYED server use its own configured key server-side:

```bash
AI_TESTING_SMOKE_TARGET_URL=https://little-learner-hub-testing.onrender.com \
AI_TESTING_SMOKE_ADMIN_EMAIL=your-testing-admin-email \
AI_TESTING_SMOKE_ADMIN_PASSWORD=your-testing-admin-password \
AI_TESTING_SMOKE_ADMIN_CODE=your-testing-admin-code \
AI_TESTING_REAL_SMOKE_CONFIRM=yes \
  npm run test:ai-testing-real-smoke
```

Notes on this command:
- It never contains, reads, or displays the OpenAI key — only your existing testing-site admin login (already a secret you manage, but categorically different from and far less sensitive than the OpenAI key: it can't spend money on its own and is scoped to this one testing site).
- It refuses outright — before making any request — if `AI_TESTING_SMOKE_TARGET_URL` looks like the real production hostname, even if pointed there by mistake.
- Run it from a terminal you control; the admin password will be present in that shell's environment/history the same way it already is whenever you log in normally — this is not new exposure beyond what logging in already requires. If you want to avoid even that, export the variables in a shell session first (`export AI_TESTING_SMOKE_ADMIN_PASSWORD=...`) rather than putting them inline in the command, so they never appear in shell history as part of the command line itself.

A **local mode** also exists (`OPENAI_API_KEY=sk-... AI_TESTING_REAL_SMOKE_CONFIRM=yes npm run test:ai-testing-real-smoke`, run from this repo) for testing the feature itself before anything is deployed — that mode does need the key locally, so prefer the remote mode above once a real deployment exists.

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
- Any real database — with `DATABASE_PROVIDER=postgres` (recommended) the server always connects using `TESTING_DATABASE_URL` on this non-production host and will never read `PRODUCTION_DATABASE_URL`, even if it happens to also be set (verified by `scripts/test-testing-database-isolation.js`); with `DATABASE_PROVIDER=local-json` there is no database connection at all.
- Plaintext passwords — every generated testing password is hashed with a salted, memory-hard scrypt derivation before it's stored (never a fast, unsalted digest), shown to you once at issue time, and never logged, returned again, or stored in plaintext anywhere (verified by `scripts/test-password-hash-security.js`).
- Stripe, Resend (email), and SMS — none of their keys are set here, so checkout/outbound email/SMS all remain in their existing safe local-simulation/disabled state, exactly as on any other testing-only deployment.
