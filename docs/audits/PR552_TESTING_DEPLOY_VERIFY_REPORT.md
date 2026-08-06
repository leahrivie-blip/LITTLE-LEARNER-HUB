# PR #552 Testing Deploy Verification

**PR:** [#552](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/552) — **MERGED**  
**Testing branch:** `cursor/family-hub-testing-readiness-d3df`  
**Deployed testing SHA:** `cfa8845d9f12c37e180702675931a6c19370ea55`  
**Production SHA (unchanged):** `59a1b4a30233df6726a3b7301964ba3fb18411a3` (`main`)

## Diff scope confirmation (pre-merge)

Only access-control + related tests/docs:

- `app.js`
- `scripts/account-access.js`
- `server/index.js`
- `scripts/test-pass3-permission-matrix.js`
- `scripts/test-role-settings-auth-matrix.js`
- `package.json`
- `docs/audits/TEACHER_ASSISTANT_SETTINGS_PERM_REPORT.md`

No `render.yaml`, production-env, Stripe secrets, Teaching Kit flags, or production deploy config.

## Permission matrix (176/176)

Run on the **exact deployed commit** `cfa8845` via `npm run test:pass3-permission-matrix` (isolated local-json harness; matrix requires `HOME_DAYCARE_HUB_TESTING=false`, which the live testing host cannot satisfy while still being the testing site).

**Result: 176/176 PASS**

Live host validation for the six former Settings failures + role APIs was performed with password-authenticated sessions against `https://little-learner-hub-testing.onrender.com` (`scripts/live-testing-settings-perm-verify.js`).

## Live password-authenticated role checks

| Role | Settings nav | Settings/billing/plans/upgrade/staff/program-settings deep links | Portal/Checkout API | Staff invite API | Account + classroom tools |
|---|---|---|---|---|---|
| Owner | Visible | Allowed (owner) | 503 Stripe-not-configured (not role-denied) | 200 | Yes |
| Director | Visible | Billing/plans/upgrade denied; Settings/staff/program allowed | **403 `billing_owner_only`** | 200 | Yes |
| Teacher | **Hidden** | **All denied** (redirect to landing) | **403 `billing_owner_only`** | **403** | Account + Daily Logs/Today yes |
| Assistant | **Hidden** | **All denied** | **403 `billing_owner_only`** | **403** | Account + Daily Logs/Today yes |

Desktop + phone browser checks passed for Owner/Director/Teacher; Assistant desktop passed.

## Guest smoke

- Health ok; commit `cfa8845`; work-nav + Daily Logs present  
- Settings work-nav roles = `owner,director`  
- Teaching Kit: `404 teaching_kit_disabled`  
- Console/network: clean (guest)

## Cleanup

- Staff invites created for the run: **revoked**  
- Disposable passwords: **rotated/locked** (old password login returns 401)  
- Emails (Postgres rows remain; no public hard-delete API without admin):  
  - `llh.access.owner.1786039137931@yopmail.com`  
  - `llh.access.director.1786039137931@yopmail.com`  
  - `llh.access.teacher.1786039137931@yopmail.com`  
  - `llh.access.assistant.1786039137931@yopmail.com`  

## Non-blocking observations

- Transient `502` on `/api/schedule/migrate` (and one `/api/account/profile`) during owner browser sessions — not an access-control regression; guest smoke clean afterward.

## Artifacts

- `/opt/cursor/artifacts/live-testing-settings-perm-verify/report.json`  
- `/opt/cursor/artifacts/live-testing-settings-perm-verify/screenshots/`  
- `/opt/cursor/artifacts/overnight-stabilization/pass3/permission-matrix.json` (176/176)

## Phase 3 recommendation

**NO-GO for Phase 3** until you complete manual review of Phase 1–2 (+ this Settings hardening) on the testing site.

Phase 1–2 + Settings hardening are **ready for your manual review** on testing (`cfa8845`).
