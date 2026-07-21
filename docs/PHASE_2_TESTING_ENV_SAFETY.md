# Phase 2 testing environment safety checklist

**Do not deploy Phase 2 until every item below passes.**

## Candidate testing service (discovered read-only)

| Field | Value |
|-------|--------|
| Likely service name | `little-learner-hub-testing` (inferred from hostname; not declared in `render.yaml`) |
| Testing URL | `https://little-learner-hub-testing.onrender.com` |
| Connected branch | **Unknown** (no Render API access from this agent) |
| Auto-deploy | **Unknown** |
| Separate database | **Not confirmed — fails current check** |
| Safe for Phase 2 deploy | **NO** |

`render.yaml` only defines production service `little-learner-hub`.

## Blocking failures found (2026-07-21 read-only check)

1. **Database appears shared with production**
   - Testing and production both report Postgres ready
   - Identical public inventory fingerprint: curriculum lesson-plan count, activity count, and `updatedAt` timestamp
   - Identical founding claimed count
   - **Do not deploy** until testing uses a separate Postgres database or isolated test-only JSON store with **no** production `PRODUCTION_DATABASE_URL`

2. **Stripe is live mode on testing**
   - Launch readiness reports `stripe.mode: live`
   - Requirement: test-mode keys only, or checkout fully disabled
   - Secret values were not printed

3. **Outbound email is configured/ready on testing**
   - Resend provider reports ready
   - Requirement: `DISABLE_OUTBOUND_EMAIL=true` (and prefer removing/clearing mail API keys on testing)

4. **SITE_URL is wrong**
   - Testing currently reports configured site URL as `http://localhost:4242`
   - Requirement: `SITE_URL=https://little-learner-hub-testing.onrender.com`

5. **Phase 2 preview flags not verified on testing**
   - `/api/foundation/feature-flags` was not present on the currently deployed testing build (Phase 2 branch not deployed yet — correct until safety passes)
   - After a safe deploy, require:
     - `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true`
     - stored `directorCenter=true`
     - `formsCenter=false`
     - `familyHub=false`

6. **AI is configured** on testing (not required for Phase 2). Prefer `DISABLE_AI_CALLS=true` or omit AI keys.

## Required env fixes on the testing Render service (before deploy)

Set / correct (values not listed here on purpose):

| Variable | Required testing value |
|----------|------------------------|
| `SITE_URL` | `https://little-learner-hub-testing.onrender.com` |
| `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW` | `true` |
| `DISABLE_OUTBOUND_EMAIL` | `true` |
| `DISABLE_STRIPE_CHECKOUT` | `true` |
| `DISABLE_AI_CALLS` | `true` (recommended) |
| `EMAIL_AUTOMATIONS_ENABLED` | `false` |
| `STRIPE_SECRET_KEY` | test-mode only (`sk_test_…`) or unset |
| `STRIPE_PUBLISHABLE_KEY` | test-mode only (`pk_test_…`) or unset |
| `STRIPE_WEBHOOK_SECRET` | separate test webhook or unset |
| `PRODUCTION_DATABASE_URL` | **separate testing DB only** — never production |
| `DATABASE_PROVIDER` | `postgres` (testing DB) **or** `local-json` with isolated path |
| `RESEND_API_KEY` / other mail keys | prefer unset while `DISABLE_OUTBOUND_EMAIL=true` |
| `OPENAI_API_KEY` | prefer unset for Phase 2 |

After deploy (once safe), set stored feature flags via admin site-content:

- `directorCenter: true`
- `formsCenter: false`
- `familyHub: false`

## Code safety added on branch (not deployed)

`server/index.js` now supports:

- `DISABLE_OUTBOUND_EMAIL=true` → blocks all `sendEmail()`
- `DISABLE_STRIPE_CHECKOUT=true` → blocks checkout
- `DISABLE_AI_CALLS=true` → blocks `/api/ai-generate`
- When `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true` on a **non-live** `SITE_URL`, the same three protections auto-enable (preview safe mode)

Production live hosts remain locked for Director Center / Forms / Family Hub.

## Agent limitations

- No Render API token in this environment → cannot confirm Render dashboard branch, auto-deploy, or service ID
- Cannot rotate env vars in Render from here
- Will not deploy until the owner confirms a separate database and the blockers above are fixed
