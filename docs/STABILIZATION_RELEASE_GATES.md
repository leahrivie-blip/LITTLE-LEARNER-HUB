# Stabilization Release Gates — Owner Setup

**Branch:** `cursor/stabilization-release-gates-1ab6`  
**Base:** `testing/full-platform-integration-2026-07` only  
**Do not merge/deploy from this handoff until you review.**

## What this delivers

1. **`npm run test:release`** — single local/CI gate for critical suites (syntax, auth, Admin, Testing Lab, External Tester, Home Daycare roles, Daily Care sync/offline, messages, forms, feedback, org isolation, production locks).
2. **GitHub Actions** — `.github/workflows/release-tests.yml` runs that gate on every PR to `testing/full-platform-integration-2026-07` and `main`.
3. **Deployed testing smoke** — `npm run test:deployed-testing-smoke` hits `https://little-learner-hub-testing.onrender.com` (not localhost).
4. **Testing-only Sentry foundation** — sanitized browser + Express errors; disabled on production; no replay/screenshots/PII.
5. **`BUGBOT.md`** — Cursor Bugbot review rules for this repo.
6. **Testing Feedback one-click diagnostics** — page, role, device, commit, online/offline, failed request names/statuses, console error types (never private content).
7. **Admin Health Center** on Owner Testing Home — plain-language Working / Needs attention / Not configured / Disabled for testing.

## GitHub branch-protection checks to mark required

In GitHub → Settings → Branches → Branch protection for:

- `testing/full-platform-integration-2026-07`
- `main`

Require these status checks before merge:

| Check name | Source |
|------------|--------|
| **`npm run test:release`** | Workflow job name from `.github/workflows/release-tests.yml` |

Optional (keep non-required until stable):

- Manual `E2E Curriculum Tests` (`e2e.yml` is still `workflow_dispatch` only)

Also recommended protection settings:

- Require a pull request before merging
- Do not allow force pushes
- Do not allow deletions
- Restrict who can push to `main` (production) separately from the testing branch

## Render testing environment variable (Sentry)

On the **testing** Render service only (`little-learner-hub-testing`):

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN_TESTING` | Testing-only Sentry DSN. **Do not paste the value into Cursor, GitHub, chat, or this repo.** Set it in the Render dashboard. |
| `SENTRY_TESTING_ENABLED` | Optional. Default enabled when DSN is set. Set to `false` to disable without removing the DSN. |

Also keep existing testing locks:

- `SITE_URL` pointing at the testing host (never the production brand domain alone)
- `TESTING_DATABASE_URL` (never `PRODUCTION_DATABASE_URL` on the testing service)
- `ALLOW_TESTING_LAB_ADMIN_PREVIEW=true`
- Leave OpenAI / Stripe live / email / SMS disabled for testers (`aiEnabled` / `stripeEnabled` / `emailSmsEnabled` stay false on testing hosts)

If `SENTRY_DSN_TESTING` is unset, the site works normally with zero Sentry traffic.

## Deployed smoke credentials (local/CI secret store only)

Never commit these. Provide via environment when running:

```bash
export LLH_TESTING_SMOKE_URL=https://little-learner-hub-testing.onrender.com
export LLH_TESTING_SMOKE_ADMIN_EMAIL='…'
export LLH_TESTING_SMOKE_ADMIN_PASSWORD='…'
export LLH_TESTING_SMOKE_ADMIN_CODE='…'
# optional: pin expected deploy
export LLH_TESTING_SMOKE_EXPECTED_SHA='2e7f239…'
npm run test:deployed-testing-smoke
```

CI should set `LLH_TESTING_SMOKE_SKIP=1` unless those secrets are configured as GitHub Actions secrets for a scheduled job (not part of the PR gate by default — the PR gate stays local-fixture-only).

## Sentry safety design (summary)

- Testing hostname / non-production `SITE_URL` only
- Browser never receives the DSN; it POSTs to `/api/testing-health/client-error`
- Server sanitizes: strips tokens, emails, query strings, bodies, headers
- Allow-listed tags only: deployed commit, page, role category, device, fake org id, error type, timing
- Rate limited (~20/min server, ~15/min browser)
- No session replay, no screenshots, no child/family/staff names, no message/form/medical/billing content
- Admin Health Center links to recent sanitized errors (Admin only)

## Current bugs status (as of this branch)

| Issue | Status |
|-------|--------|
| App boot timeout continuing with stale UI | Fixed in #339 (recoverable overlay) — covered by release gate |
| Testing Lab → Calendar | Fixed in #339 — `test:testing-lab-routing-fix` |
| Missing Add External Tester workflow | Fixed via Owner Testing Home — `test:owner-testing-home-acceptance` |
| Daily Logs vs approved redesign | Code present since #334 merge; release gate runs `test:fast-daily-logs`; live mismatch = deploy/cache |
| Incorrect/stale role navigation | Covered by role-nav + home-daycare suites |
| Hidden role UI before auth | Signed-out Admin uses `signed-out-admin-view` body class |
| Signed-out `/admin` showing marketing homepage | Fixed in #339 — smoke asserts Admin unlock form + body class |

## Exact owner setup steps

1. Review draft PR targeting `testing/full-platform-integration-2026-07` only.
2. Confirm CI job `npm run test:release` is green.
3. Mark that check **required** on the testing branch (and later on `main`).
4. After merge + testing deploy: set `SENTRY_DSN_TESTING` in Render (never paste here).
5. Run `npm run test:deployed-testing-smoke` with smoke Admin secrets against the testing URL.
6. Open Owner Testing Home → confirm Admin Health Center shows Working / Disabled for testing labels.
7. Do **not** enable AI, Stripe live checkout, email/SMS, or Phase 24.
8. Do **not** touch `main` / production until a separate approved production PR.
