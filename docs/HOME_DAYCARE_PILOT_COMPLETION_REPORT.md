# Home Daycare Pilot — Completion Report

Branch: `cursor/home-daycare-pilot-1ab6` (based on `testing/full-platform-integration-2026-07`)
Status: **Draft PR, not merged, not deployed.** AI Testing remains disabled. Phase 24 was not started. `main`/production untouched.

## 1. What was built

A connected, isolated **Home Daycare Pilot** sandbox: one External Tester Sandbox login that works as **Solo Home Daycare Provider**, adds fake children/guardians, links them with real permissions, posts family updates/messages/forms/fake billing — then switches to **Parent/Guardian** and sees the **exact same connected records**, never disconnected per-view fake data.

### New server modules
- `scripts/home-daycare-pilot-data-model.js` — pure data-model functions for children, guardians (+ access-rule links/permissions), family updates, messages, forms, fake billing, an aggregated Parent-Home snapshot, org-scoped reset, and fixture generation. Reuses the existing Phase 8 foundation primitives (`foundation-data-model.js#createChildRecord`, `family-foundation-data-model.js#createContactRecord/createAccessRuleRecord/evaluateContactChildAccess`) so guardian permission checks are the same mechanism `family-hub-api.js` already understands.
- `server/home-daycare-pilot-api.js` — `/api/pilot/*`. Resolves WHO is asking (provider vs. parent-preview vs. admin) and organization/child access **server-side**, never trusting a client-supplied id. Routes: children, guardians (+ access), updates, messages (+ read receipts), forms (+ status), billing, and an aggregated `parent-home` view.
- Extended `server/external-tester-sandbox-api.js` / `scripts/external-tester-sandbox-data-model.js`:
  - `POST /api/external-tester/create-pilot` — the one-shot "Add External Tester" wizard action (creates the fake org, the sandbox account approved for **only** Solo Home Daycare Provider + Parent/Guardian, a starting set of connected fake children/guardians, issues the one-time password, returns a welcome message).
  - `GET /api/external-tester/guardian-options` — "which family would you like to preview" candidate list.
  - `switch-role` now accepts an explicit `previewContactId` so the tester (not a fixed donor-kind search) chooses which guardian/child relationship to preview.
  - **Fixed a real information-leak bug** in the pre-existing guardian shadow-contact mechanism: switching preview target from guardian A to guardian B previously left guardian A's access rules on the shared shadow contact — a later preview would see BOTH guardians' children. The shadow contact now clears every stale rule that doesn't belong to the currently-chosen guardian before cloning the new one.
  - `POST /api/external-tester/reset-fake-data` (confirm-gated, org-scoped, preserves Testing Feedback + audit), `GET /api/external-tester/activity` (login activity + checklist progress), `GET`/`POST /api/external-tester/checklist`.
- `server/testing-feedback-api.js` / `scripts/testing-feedback-data-model.js` — added `context.relatedChildId` so a report can be tied to a specific fake child, and auto-marks the "Submit feedback" checklist item.

### New client UI (`app.js`, `testing-lab-ui.js`, `index.html`)
- **Testing Lab → Accounts → "Add External Tester — Home Daycare Pilot"** wizard: tester name/email + starting child count → one click creates everything and shows the one-time password + a copyable welcome message (never shown again).
- Six new views: `pilot-families` (provider: add child/guardian, set permissions), `pilot-messages`, `pilot-forms`, `pilot-billing` (both roles, scoped per server-side access), `pilot-parent-home` (aggregated parent view, with a "which family would you like to preview" picker when more than one guardian relationship exists), `pilot-checklist`.
- Curated sidebar nav (`refreshHomeDaycarePilotNav()`): shows Families / Messages / Forms & Enrollment / Billing / Home / Pilot Checklist for a Home Daycare Pilot sandbox account, and **hides** the core My Messages / Billing / Forms items they replace (so there is never a confusingly similar duplicate link pointing at disconnected data). Runs every time `syncPlatformNavVisibility()` runs, so it self-corrects on every view change/refresh.
- The existing "Switch Testing Role" picker now shows a second "which family would you like to preview?" screen before finalizing a switch to Parent/Guardian whenever more than one guardian relationship exists in that organization.

## 2. Section-by-section confirmation

**1. External Tester Setup** — Done via the wizard above. Admin can also (already existing, reused): reissue password, suspend/reactivate/end, and now: reset fake data (confirm-gated), view login activity + checklist progress. "Open the sandbox for support" is available today through Testing Lab's existing Quick Role Preview (admin previews the SAME organization's Solo Provider/Director experience) — a dedicated "open this exact tester's sandbox" shortcut was not separately wired in the time available; the admin uses the org id already shown next to the account.

**2. Connected provider and parent data** — Verified end-to-end, by both an API-level test suite (`scripts/test-home-daycare-pilot.js`, 14 checks) and a real-browser Playwright test (`scripts/test-home-daycare-pilot-ui.js`, 4 checks, with screenshots) that drives the actual wizard/Families screen/role switch/Parent Home screen: a child + guardian added as provider, a family update and a fake billing record posted, then — after switching role through the real UI — the exact same child/update/billing appear on Parent Home. Repeating read-only requests (guardian options, parent-home) never creates duplicate records. A guardian previewing one child is denied direct-route access to a different child in the same organization (403, server-enforced, not just hidden client-side).

**3 & 4. Home Daycare Provider / Parent navigation** — Implemented on desktop via the curated sidebar described above. **Scope note:** a distinct 5-icon phone bottom-tab-bar (separate from the desktop sidebar drawer) was not built in the time available — on phone, the pilot tester gets the *same curated, shortened* sidebar (opened via the existing hamburger menu) rather than a dedicated bottom nav bar. Parent Home already surfaces today's update, forms needing action, unread message count, and billing reminders (gated to financially-responsible guardians only); it does not yet surface "shared photos" or "upcoming events" specifically (no photo-upload or events feature exists in the new lightweight pilot model — see the "Classroom Assistant" note below for the same reasoning).

**5. Testing Feedback** — Works from both roles (already-existing widget); now also records `relatedChildId` when provided. Tester-only-own-threads, admin-sees-all, private-notes-hidden-from-tester, no outbound email — all pre-existing guarantees, re-verified passing.

**6. Testing checklist** — All 10 requested items implemented (`scripts/external-tester-sandbox-data-model.js#HOME_DAYCARE_PILOT_CHECKLIST`). 8 of the 10 auto-check themselves from real actions (add child, add guardian, send update, send form, switch to parent, verify parent info, reply as parent, test billing, submit feedback); "Record attendance and care" is a manual checkbox (the pilot intentionally reuses the *existing* core Daily Logs feature for this, rather than duplicating it, so there's no single pilot-API call to hook). Progress persists server-side (survives refresh/logout/restart).

**7. Safety and verification** — All automated:
- Organization isolation, child isolation, direct-route enforcement: `test-home-daycare-pilot.js` #4, #5.
- No duplicate records from retrying reads: #3.
- Role switching + curated nav verified through a real browser at desktop viewport (`test-home-daycare-pilot-ui.js`); the full phone/tablet/computer role-switch walkthrough from the prior incident-fix work (`test-live-style-role-device-walkthrough.js`) still passes unmodified.
- Restart persistence against the same store file: #12.
- No production access: production-lock check (wizard rejected outright on a production host).
- No real email/SMS/Stripe/OpenAI: nothing in any new file touches Resend, Stripe, SMS, or the OpenAI client — every billing record is explicitly marked `testingOnly`/`noRealPaymentProcessed`.
- Reset preserves feedback/audit: #11.
- Underlying center features (Director Center, Classroom Assistant, Forms Center, Family Messaging/Updates, Billing Simulator) were **not modified or removed** — the pilot's Messages/Forms/Billing/Updates are a small, new, self-contained model specifically because those larger systems are hard-gated to a *verified admin session* end-to-end in `server/index.js`'s `/api/director-center/*` mount, and loosening that gate to also accept a non-admin tester session was judged too broad a change to make safely in this pass. They remain fully available for real Director Center use later, exactly as before.

## 3. Known scope limitations (explicit, not silent)

- **Classroom Assistant** nav item was not wired to real functionality for the sandbox tester — it requires a verified-admin-only backend (`/api/director-center/*`) that this pass did not modify. It is not listed as a curated pilot nav item as a result (left available only through the pre-existing admin-preview path).
- Phone-specific bottom tab bar (distinct from desktop sidebar) not built; the curated sidebar is available at all viewport sizes via the existing mobile drawer.
- "Shared photos" and "Upcoming events" are not surfaced on Parent Home (no photo/event concept exists in the new lightweight pilot model).
- "Open the sandbox for support" is available via the existing Testing Lab Quick Role Preview for that organization, not a dedicated one-click shortcut.

## 4. Test results

```
npm run test:home-daycare-pilot        → 14/14 passed
npm run test:home-daycare-pilot-ui     → 4/4 passed (Playwright, real browser)
npm run test:external-tester-sandbox   → 15/15 passed (no regressions; shadow-contact leak fixed)
npm run test:testing-feedback          → 18/18 passed
npm run test:admin-preview-escape      → 9/9 passed
npm run test:tester-account-manager    → 9/9 passed
npm run test:password-hash-security    → 7/7 passed
npm run test:copyright-protection      → passed
npm run check                          → all files syntax-clean
```

## 5. Screenshots

- `docs/screenshots/home-daycare-pilot/1-admin-add-external-tester-wizard.png` — Platform Admin's Testing Lab wizard, showing the issued one-time password + welcome message.
- `docs/screenshots/home-daycare-pilot/2-provider-families-connected-data.png` — the tester, as Solo Home Daycare Provider, with the fake child + guardian she just added.
- `docs/screenshots/home-daycare-pilot/3-parent-home-same-connected-data.png` — the same tester, after switching to Parent/Guardian, viewing the identical connected child/update/billing data.

## 6. Files changed (new)

- `scripts/home-daycare-pilot-data-model.js`, `server/home-daycare-pilot-api.js`
- `scripts/test-home-daycare-pilot.js`, `scripts/test-home-daycare-pilot-ui.js`
- `docs/HOME_DAYCARE_PILOT_COMPLETION_REPORT.md`, `docs/screenshots/home-daycare-pilot/*.png`

## Files changed (modified)

- `scripts/external-tester-sandbox-data-model.js`, `server/external-tester-sandbox-api.js` — pilot wizard, guardian preview picker, checklist, activity, reset, shadow-contact leak fix.
- `server/index.js` — mounted `/api/pilot/*`; login-activity hook for sandbox accounts.
- `scripts/testing-feedback-data-model.js`, `server/testing-feedback-api.js` — `relatedChildId` context field, checklist auto-completion.
- `testing-lab-ui.js` — "Add External Tester" wizard UI.
- `app.js` — pilot state/API client, curated nav, 6 new render functions, guardian-preview picker inside the role switcher.
- `index.html` — 6 new view sections, curated nav buttons.
- `package.json` — `test:home-daycare-pilot`, `test:home-daycare-pilot-ui` scripts.

## 7. Next steps for the owner

1. Review the PR and screenshots.
2. If approved, merge into `testing/full-platform-integration-2026-07` only (not main) and redeploy the testing service per the existing `docs/TESTING_DEPLOYMENT_RENDER_STEPS.md` steps — no new environment variables are required for this feature.
3. Decide whether the known scope limitations above (Classroom Assistant, phone bottom-nav, photos/events) should be addressed in a follow-up pass.
