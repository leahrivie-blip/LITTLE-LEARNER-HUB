# Phase 2 testing environment safety checklist

**Rechecked:** 2026-07-21 (read-only; secret values not printed)

## Candidate testing service

| Field | Value |
|-------|--------|
| Service hostname | `little-learner-hub-testing.onrender.com` |
| Testing URL | `https://little-learner-hub-testing.onrender.com` |
| Declared in `render.yaml` | No (production `little-learner-hub` only) |
| Agent Render API / deploy hook | **Not available** — manual deploy required |
| Safe for Phase 2 preview work | **YES** (after latest branch tip is deployed) |

## Safety recheck results (pass/fail)

| Check | Result | Notes (no secrets) |
|-------|--------|--------------------|
| Testing `SITE_URL` | **PASS** | Reports `https://little-learner-hub-testing.onrender.com` |
| Testing database separate from production | **PASS** | Testing: `local-json` store path under `/tmp/…`. Production: hosted DB provider ready / different store |
| Founding inventory differs | **PASS** | Testing claimed count ≠ production claimed count |
| No production Director Center APIs on live site | **PASS** | Production `/api/foundation/feature-flags` and `/api/director-center/*` return 404 (Phase 2 not on production) |
| Stripe disabled on testing | **PASS** | Testing Stripe mode `not configured`; checkout not ready. Production remains live/ready |
| Email disabled on testing | **PASS** | Outbound email disabled + preview safe mode; automations disabled; support email not ready |
| AI disabled on testing | **PASS** | AI mode `not configured` / not ready. Production remains configured |
| Production unchanged / healthy | **PASS** | Production launch-ready; brand `SITE_URL`; Stripe + email + AI remain production-ready |
| Branch not merged into `main` | **PASS** | `cursor/director-family-foundation-bc66` tip is ahead of `main`; draft PR #324 |
| `formsCenter` false | **PASS** | Forced OFF in feature-flags policy + stored flags |
| `familyHub` false | **PASS** | Forced OFF in feature-flags policy + stored flags |
| `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW` | **PASS** | Policy reports allow = true on testing |
| Stored `directorCenter` | **NEEDS ENABLE AFTER DEPLOY** | Currently stored `false` on testing until admin site-content enable |
| Latest branch tip deployed | **NEEDS MANUAL REDEPLOY** | Testing HTML cache busters still older than branch tip with Phase 2 UI completion |

## Required testing env (names only — do not paste values)

Keep / confirm on the **testing** Render service only:

- `SITE_URL` → testing hostname
- `DATABASE_PROVIDER=local-json` (isolated test store; never production DB URL)
- `ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true`
- `DISABLE_OUTBOUND_EMAIL=true`
- `DISABLE_STRIPE_CHECKOUT=true`
- `DISABLE_AI_CALLS=true` (or omit AI keys)
- `EMAIL_AUTOMATIONS_ENABLED=false`
- Stripe / Resend / OpenAI keys unset or non-production

**Do not change production environment variables.**

## After deploy (testing only)

1. Unlock Admin on testing
2. Set stored flags via Admin site-content:
   - `directorCenter: true`
   - `formsCenter: false`
   - `familyHub: false`
3. Open Director Center → **Load fake preview data** (Small Center)
4. Confirm banner **Admin Preview — Test Data Only**
5. Confirm anonymous / regular users get 403 on Director Center APIs

## Phase 20 addendum (security / migration / readiness)

| Check | Expected |
|-------|----------|
| Testing Lab migration / readiness APIs | Available only with Lab preview gates + fake orgs |
| Production Lab / migration / readiness mutations | **Must reject** (403 / locked) — never apply real migrations |
| Fake-account domain | `@example.invalid` only in Lab fixtures |
| Rate limits | Admin login + sensitive Lab POSTs limited in-process |
| Secrets in logs / reports / screenshots | Sanitized — no passwords, tokens, or private PHI |
| Integration checkpoint | Documented in `docs/TESTING_SITE_INTEGRATION_PLAN.md` — **not** executed in Phase 20 |

See also: `docs/PHASE_20_SECURITY_MIGRATION_RELEASE_READINESS_COMPLETION_REPORT.md`, `scripts/phase20-security-data-model.js`, `scripts/org-permissions.js`.

## Agent limitations

- No Render API token / deploy hook in this environment
- Cannot click Render dashboard buttons
- Will not merge to `main` or deploy production
