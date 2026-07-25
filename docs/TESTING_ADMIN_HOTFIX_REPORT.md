# Urgent Testing-Site Admin Hotfix — Report

Branch: `cursor/testing-admin-preview-hotfix-1ab6` (targets `testing/full-platform-integration-2026-07`, **not** `main`). No production code path, Stripe, Resend, email/SMS, or OpenAI integration was touched.

## 1. Root cause of the unclickable Admin screen

Two confirmed, reproduced bugs combined to produce "I entered the Director preview and now buttons do not respond, including 'Return to Admin.'":

1. **Testing Lab's "Exit Role Preview" / "Return to Admin" only cleared local state *after* a successful round‑trip to the server.** Both handlers awaited `POST /api/testing-lab/role-preview/exit` inside a `try` block and only cleared `sessionStorage.llhRolePreviewMembershipId` / `state.preview` on success. Any transient server error (this environment was independently observed returning `503`s from other admin endpoints during investigation) left the admin stuck in preview with no way to leave — exactly the reported symptom. **Fixed:** both handlers now clear local state *first, unconditionally*, and treat the server call as best‑effort (fire‑and‑forget), in `testing-lab-ui.js`.
2. **A single unguarded call inside the app's global delegated click handler could silently stop every later click check for that click.** `document.addEventListener("click", ...)` runs one big handler; the very first thing it did was call `trackEvent(...)` (unwrapped) for almost every button click. If that call ever threw, execution stopped there and *none* of the checks below it in the same handler — including the "Return to Admin" / preview‑mode buttons — would run for that click. **Fixed:** wrapped that call in `try/catch` in `app.js`, and moved the brand‑new top‑nav escape check to the very top of the handler so it can never be blocked by anything else in the same function.

A related, confirmed defect was also fixed as part of this: the always‑visible floating "Admin mode" badge (`position: fixed; right:16px; bottom:16px`) was shown *unconditionally*, even with no preview active, and could visually overlap and swallow clicks on other bottom‑right content (e.g. "Open Testing Lab") on narrower/shorter screens — found via the new automated clickability sweep. It now only appears while a preview or impersonation is actually active.

Also discovered and fixed while auditing the Testing Feedback path: the tester‑facing feedback textarea and its containing panel both used the same `data-tf-body` attribute, so the submit handler's `querySelector("[data-tf-body]")` always matched the *container div* (which has no `.value`), meaning a tester could never actually submit real feedback text through the floating button — every attempt silently failed with "Please describe what you want to share." Renamed the textarea's hook to `data-tf-new-body-input`. A second issue in the same widget — a draft could be silently wiped mid‑typing by the 30‑second background unread‑count poll re‑rendering the panel — was also fixed by syncing `state.bodyText`/`state.replyText` on every keystroke.

## 2. What changed, by requirement

### Admin preview escape
- `testing-lab-ui.js`: local‑first, best‑effort exit for both "Exit Role Preview" (desktop + phone, now on distinct `data-tl-exit-preview` / `data-tl-exit-preview-mobile` attributes instead of a shared one) and "Return to Admin".
- `app.js`: new `exitAllPreviewModes()` — a single function that resets admin plan‑preview mode, stops impersonation, and clears the Testing Lab role‑preview flag, each step independently try/catch‑guarded so one failure can never block the others.
- New **second, permanent escape** in the top navigation (`#topNavExitPreviewBtn`, `index.html`) — normal document flow, never an overlay, visible whenever any preview is active, wired first in the global click handler.
- `applyAdminPreviewToPlatform()`'s render dispatch is now wrapped in try/catch; a rendering failure while previewing falls back to Admin mode instead of leaving a broken page.
- Refreshing mid‑preview lands on a safe view; the real admin session (token/email/unlocked flag) is provably untouched by entering, refreshing, or exiting a preview (new automated test).

### Clear testing identity
- New global banner "LITTLE LEARNER HUB TESTING — FAKE DATA ONLY" (`#testingIdentityBanner`, non‑obstructive, normal document flow) plus a role line ("Testing Account — Viewing as …") for fake‑account testers and admin preview/impersonation states. Both are gated by a client‑side `isProductionHostClient()` check mirroring the server's own production‑hostname list — **never shown on the real production host**.
- Every "Live production data" string in the Admin Dashboard (`app.js`) is now conditional and reads "Testing database loaded — fake data only" on a non‑production host.

### Real tester accounts
- New Testing Lab UI section: create/reset a fake tester organization (Solo Home Daycare or Multi‑Classroom Center) with a custom label, then "Generate fresh logins for every role in this organization" in one action, each with an immediate Copy button.
- New endpoints in `server/testing-lab-api.js`: `accounts/issue-passwords-for-org`, `accounts/suspend`, `accounts/reactivate`, `accounts/end`. Suspend blocks login reversibly; End permanently clears every stored credential (old password never works again, even after reactivating — a fresh reissue is required). A previously‑issued password is never returned anywhere again.
- Account rows now show their assigned organization and role.
- External testers still have no role‑switcher — this is exclusively an Admin/Testing Lab surface.

### Testing feedback
- Testers can attach a screenshot, gated by an explicit privacy‑warning confirmation dialog before the file is ever read. Screenshots are validated (image MIME type, size‑bounded ~650KB) both client‑ and server‑side (`scripts/testing-feedback-data-model.js`).
- Every thread now automatically records the server's deployed commit SHA (`context.deployedCommit`, from `LLH_GIT_SHA`/`GIT_COMMIT`), shown in the admin thread view alongside role/org/page/device/timestamp.
- Fixed the textarea bug above so testers can actually submit feedback at all, and fixed the draft‑wipe bug so long messages survive the background poll.

### Testing Lab access
- New persistent "Testing Lab" link in the primary sidebar (`index.html`, `data-testing-lab-nav`), visible whenever Admin is unlocked on a non‑production host — no Settings search or hidden route required.

### Clickability & visual regression
- New `scripts/test-admin-preview-escape.js` (9 checks): every admin plan‑preview mode and every Quick Role Preview target enter/exit cleanly; the new top‑nav escape works and hides itself; **the core fix is directly verified by forcing the server‑side exit call to fail/abort and confirming local state still clears**; refresh‑safety; session‑immutability; Testing Lab nav reachability; no production wording.
- New `scripts/test-tester-account-manager.js` (9 checks): org creation, org‑wide login generation, suspend/reactivate/end, "never view a password again."
- New `scripts/test-admin-clickability-visual.js` (8 checks): every visible button at desktop/tablet/phone actually receives its own clicks, no invisible full‑screen overlay, sidebar scroll, Testing Lab reachable at every size, account generation and tester feedback work end‑to‑end, no production wording, **zero real Stripe/Resend/OpenAI/SMS network calls across the whole run**, and the two required screenshots.
- Extended `scripts/test-testing-feedback.js` (+1) and `scripts/test-testing-lab-phase18.js` (selector fix for the renamed mobile attribute).

## 3. Test results (this branch)

```
npm run test:admin-preview-escape        → 9 PASS
npm run test:tester-account-manager      → 9 PASS
npm run test:admin-clickability-visual   → 8 PASS
npm run test:testing-feedback            → 18 PASS
npm run test:testing-lab-phase18         → 18 PASS
npm run test:phase23-platform-walkthrough→ 15 PASS
npm run test:password-hash-security      → 7 PASS
npm run test:testing-database-isolation  → 3 PASS
npm run test:family-foundation-phase8    → 36 PASS
npm run test:director-family-foundation  → all PASS
npm run check (syntax)                   → clean
```

## 4. Screenshots

- `docs/screenshots/testing-admin-hotfix/admin-testing-lab.png` — Platform Admin's Testing Lab, testing banner visible at top.
- `docs/screenshots/testing-admin-hotfix/external-tester-testing-banner.png` — an external tester (Lead Teacher fake account) with the testing banner, role line, and floating Testing Feedback button visible.

## 5. Confirmation

- `main` and production were never touched — this branch only ever targets `testing/full-platform-integration-2026-07`.
- AI Testing remains disabled (no change to `ALLOW_OPENAI_TESTING`/`DISABLE_AI_CALLS`), Phase 24 was not started.
- Stripe, Resend, email, and SMS integrations are untouched; the clickability test explicitly asserts zero requests to any of those hosts across the whole browser-driven run.
- Do not merge or deploy until reviewed and approved.
