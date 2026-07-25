# External Tester Sandbox — Confirmation Report

Adds a single external tester login that self-service switches among a fixed, admin-chosen set of non-admin roles, strictly enforced server-side. Committed on top of the admin hotfix in PR #329 (branch `cursor/testing-admin-preview-hotfix-1ab6`, still targeting `testing/full-platform-integration-2026-07`, still not merged/deployed). AI remains disabled; Phase 24 was not started; `main`/production untouched.

## 1–2. Admin creates the sandbox and chooses its allowed roles

`POST /api/external-tester/create` (admin-only, production-locked, fake-organization-only) creates one account with an admin-chosen subset of roles. `POST /api/external-tester/set-allowed-roles` updates that subset at any time. Both are exposed in Testing Lab → Accounts → "External Tester Sandbox" (new section: org id, tester email, display name, and a checkbox per role).

## 3. The tester switches among approved roles herself

`GET /api/external-tester/me` + `POST /api/external-tester/switch-role` (tester's own member session, never an admin token). Client UI: a "Switch Testing Role" button in the permanent testing banner opens a picker showing only her approved roles; picking one calls the API and reloads. All 6 roles (Director, Solo Home Daycare Provider, Lead Teacher, Assistant, Parent/Guardian, Curriculum Only) resolve to the exact role/accountType vocabulary the rest of the app already expects (`scripts/external-tester-sandbox-data-model.js#SANDBOX_ROLE_GENERIC_IDENTITY`), and — when the assigned organization already has a real fake account of a matching kind — borrows its linked staff membership / guardian contact data so the experience isn't empty.

## 4. The tester can never switch to an admin role, another org, or production

- The switchable role enum (`SANDBOX_ROLE_KEYS`) is a fixed, hardcoded list of 6 values — Platform Admin, Testing Lab Admin, and AI Outcomes Admin are not representable in it at all, so no request payload can ever select them (`invalid_role`, tested explicitly for `platform_admin`/`testing_lab_admin`/`ai_outcomes_admin`/`admin`/`super_admin`/empty string).
- `organizationId` is read from the stored sandbox account only — never from the request body. A smuggled `organizationId` in a switch-role request is silently ignored (tested).
- Production: every admin route checks the live-production lock; every tester route (`me`, `switch-role`) also checks it independently, even though sandbox accounts could never exist on production data in the first place (defense in depth).

## 5. Enforced server-side, not just hidden in the browser

Every check above is inside `scripts/external-tester-sandbox-data-model.js#switchActiveRole` and `server/external-tester-sandbox-api.js`, never the client. **A real vulnerability was found and fixed during this work**: the admin-only routes (`create`/`set-allowed-roles`/`list`) initially checked only environment/feature-flag state, not caller identity — so any authenticated fake-account tester could call them directly. Fixed by requiring `ctx.adminEmail` explicitly on every admin route; regression test `7.` in `scripts/test-external-tester-sandbox.js` calls all three with a tester's own session and asserts they are rejected.

## 6. Permanent banner

`LITTLE LEARNER HUB TESTING — FAKE DATA ONLY` / `CURRENTLY VIEWING AS: [ROLE]`, exact wording, rendered in the existing non-obstructive top banner (never shown on production).

## 7. Switch Testing Role / Return to Tester Home

Both buttons live inside the permanent banner. "Return to Tester Home" navigates to the safe landing view for whichever role is currently active (Today for provider roles, Family Hub for Parent/Guardian) — it never changes role, only navigation.

## 8. Refresh / logout / failed request never traps the tester

- Refresh: the switched identity is persisted server-side on `store.users[email]`; a fresh `/me` call (what a reload effectively restores from) always reflects the latest switch (tested). The client also updates its own local cache immediately from the server's *confirmed* response before reloading, so a reload can never show a stale role even if nothing else re-syncs.
- Logout: clears the session only; next login re-reads the current server-side role.
- Failed request: `switchSandboxRole()` never optimistically changes anything locally — on any error it shows the error and leaves the tester on her last successfully-confirmed role.
- An admin narrowing the allow-list while a tester is active on a now-disallowed role immediately moves her to a still-allowed one (tested); removing every role blocks login entirely rather than leaving her on a stale role (tested).

## 9. Testing Feedback works from every role

Unchanged Testing Feedback code path — since role/organization live on `store.users[email]`, a thread filed after switching automatically records the current role, page, device, and organization (tested for Lead Teacher and Parent/Guardian).

## 10. Everything stays inside the assigned org, with audit records

`organizationId` is immutable per sandbox account. Every creation, allow-list change, and role switch calls `testing-lab-data-model.js#appendAudit` with that fixed `organizationId` (tested).

## 11. Screenshots

`docs/screenshots/external-tester-sandbox/`:
1. `1-admin-assigns-allowed-roles.png` — Platform Admin's "External Tester Sandbox" section with per-role checkboxes.
2. `2-tester-switching-roles.png` — the tester's "Switch Testing Role" picker, showing only her 4 approved roles.
3. `3-tester-parent-guardian-view.png` — the tester viewing the Parent/Guardian experience: banner reads "CURRENTLY VIEWING AS: PARENT/GUARDIAN", a real linked child ("Ava Lin (Fixture)") is shown. (Getting this to show *real* data required a second fix: Family Hub resolves guardians by looking up a contact record by login email directly, not via any field on the sandbox account — so switching to Parent/Guardian now creates an idempotent "shadow" contact under the sandbox's own email, cloning the donor guardian's access rules only; the original donor guardian's own separate account/contact is never modified.)

Captured/regenerated via `npm run capture:external-tester-sandbox-screens`.

## 12. Admin-surface isolation confirmed

The tester's session (a normal fake-account member session, never an admin token) is explicitly tested against: the main Testing Lab dashboard, feature-flag writes, AI Outcomes admin usage, the admin Testing Feedback inbox, Release Readiness controls, and the admin-only sandbox-creation/list/set-allowed-roles routes — every one rejected. Client-side, all of this chrome is already gated behind `isAdminUnlocked()`, which a fake-account login can never satisfy.

## Test results

```
npm run test:external-tester-sandbox      → 15 PASS
npm run test:admin-preview-escape         → 9 PASS  (re-verified)
npm run test:admin-clickability-visual    → 8 PASS  (re-verified, phone/tablet/desktop)
npm run test:tester-account-manager       → 9 PASS  (re-verified)
npm run test:testing-feedback             → 18 PASS (re-verified)
npm run test:testing-lab-phase18          → 18 PASS (re-verified)
npm run test:phase23-platform-walkthrough → 15 PASS (re-verified, phone/tablet/desktop)
npm run test:family-foundation-phase8     → 36 PASS (re-verified)
npm run test:director-family-foundation   → all PASS (re-verified)
npm run check (syntax)                    → clean
```

## Files changed (new work on top of the existing hotfix commits)

- `scripts/external-tester-sandbox-data-model.js` (new) — fixed role enum, identity resolution, donor-borrowing, guardian shadow-contact, audit-safe switching.
- `server/external-tester-sandbox-api.js` (new) — admin + tester routes, production lock, admin-identity check.
- `server/index.js` — mounts `/api/external-tester/*`.
- `testing-lab-ui.js` — admin "External Tester Sandbox" manager (create, per-account role checkboxes, save).
- `app.js` — sandbox banner wording/buttons, role picker modal, switch/return-home logic, local-cache sync before reload.
- `index.html`, `styles.css` — banner buttons + role picker modal markup/styles.
- `scripts/test-external-tester-sandbox.js` (new, 15 checks), `scripts/capture-external-tester-sandbox-screens.js` (new, 3 screenshots).

Not merged, not deployed. AI remains disabled. Phase 24 not started.
