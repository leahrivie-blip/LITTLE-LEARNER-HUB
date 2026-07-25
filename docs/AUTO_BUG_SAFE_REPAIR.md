# Automated bug detection & safe repair (testing only)

This workflow reduces how often the owner must personally discover technical bugs on the **testing** site.

It does **not** merge PRs, deploy, push to `main`, change production, delete data, change prices, contact users, refund subscriptions, enable Stripe/email/SMS/OpenAI, or relax security checks.

## 1. Detect (sanitized)

Browser + server collectors record only allow-listed fields:

| Signal | How |
|--------|-----|
| Browser exceptions | `auto-bug-client.js` + optional testing Sentry intake |
| Server exceptions | `server/index.js` request catch → auto-bug ingest |
| Failed API requests | Client fetch wrapper (5xx / network) |
| App-boot timeouts | Boot retry overlay + client watcher |
| Broken routes | `LLHAutoBug.reportBrokenRoute(viewId)` |
| Console errors | Wrapped `console.error` (message sanitized) |
| Database failures | Console/server patterns → `database_failure` |
| Offline-sync failures | Console patterns / `reportOfflineSyncFailure` |
| Repeated duplicate requests | Same `/api/*` path ≥4× in 4s |
| Permission denials vs role | 403 on gated Admin/testing paths |
| Deployed smoke failures | Smoke result `ok:false` → bug records |
| Performance thresholds | `/api/*` slower than 8s |

**Never captured:** passwords, tokens, API keys, childcare content, form answers, messages, medical data, payment data, session replay, or raw request bodies.

## 2. Create a bug record

Each unique failure creates or updates **one** record in `store.autoBugs` (deduped by fingerprint of error type + sanitized message + page + role category).

Fields: short title, testing environment, deployed commit, page, role category, device/browser, error type, sanitized stack, reproduction steps, frequency, first/most recent occurrence, multi-user flag.

Admin APIs:

- `GET /api/auto-bugs` — list
- `GET /api/auto-bugs/:id` — detail + GitHub issue body + owner report
- `POST /api/auto-bugs/ingest` — sanitized public intake (testing hosts only)
- `POST /api/auto-bugs/from-smoke` — Admin smoke failures
- `POST /api/auto-bugs/:id/investigation`
- `POST /api/auto-bugs/:id/owner-report`
- `POST /api/auto-bugs/:id/verification`

GitHub issue template: `.github/ISSUE_TEMPLATE/auto-bug.md`.

## 3. Safe Cursor investigation

Eligible technical issues may be investigated by Cursor:

1. Branch from latest `testing/full-platform-integration-2026-07`
2. Reproduce with fake fixtures only (`@example.invalid`)
3. Add a failing regression test
4. Diagnose root cause
5. Smallest scoped fix
6. Run focused tests + `npm run test:release`
7. Capture before/after screenshots
8. Open a **draft PR targeting testing only**
9. Update the bug record

Helper:

```bash
node scripts/prepare-auto-bug-investigation.js --fixture
# or
LLH_STORE_PATH=... node scripts/prepare-auto-bug-investigation.js --id abug_...
```

### Stop without changing code when

- Expected behavior is unclear
- Fix requires a product/layout decision
- Permissions must change
- Real data is involved
- Stripe / email / SMS / OpenAI behavior would change
- Database migration is destructive
- Tests reveal unrelated failures
- Change would touch `main` or production

Eligibility engine: `scripts/auto-bug-eligibility.js`.

## 4. Automation limits (hard)

Never:

- Merge automatically
- Deploy automatically
- Push to `main`
- Change production
- Delete or rewrite data
- Change prices
- Contact users
- Refund/cancel subscriptions
- Enable external services
- Relax security checks
- Guess childcare, medication, licensing, billing, or parent-access requirements

## 5. Owner report

Every prepared fix must include a plain-language report ending with:

**Approve merge to testing?**

Template: `docs/AUTO_BUG_OWNER_REPORT_TEMPLATE.md`  
Generator: `scripts/auto-bug-owner-report.js`

## 6. Verify after deployment

After the owner approves and deploys to testing:

```bash
export LLH_AUTO_BUG_ID='abug_…'
export LLH_TESTING_SMOKE_EXPECTED_SHA='…'
export LLH_TESTING_SMOKE_URL='https://little-learner-hub-testing.onrender.com'
export LLH_TESTING_SMOKE_ADMIN_EMAIL='…'
export LLH_TESTING_SMOKE_ADMIN_PASSWORD='…'
export LLH_TESTING_SMOKE_ADMIN_CODE='…'
npm run test:auto-bug-verify-after-deploy
```

Or run GitHub Action **Auto-bug verify after deploy** (`workflow_dispatch` only).

Verification:

1. Confirms exact deployed commit
2. Runs deployed smoke (unless skipped)
3. Confirms original fingerprint is gone
4. Confirms no new critical auto-bugs
5. **Automatically reopens** the bug record if verification fails

## Tests

```bash
npm run test:auto-bug-workflow
```

Included in `npm run test:release`.
