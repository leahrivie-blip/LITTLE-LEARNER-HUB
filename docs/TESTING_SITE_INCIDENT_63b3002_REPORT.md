# Urgent Testing-Site Incident Report — commit 63b3002

Branch: `cursor/testing-cache-nav-incident-1ab6` (off `testing/full-platform-integration-2026-07`, draft PR only). `main`/production untouched. AI Testing left disabled. Phase 24 not started. No external tester accounts created or distributed.

## 1. Root cause

**Stale cached JS/CSS from before the PR #329 deploy, served next to a fresh server and fresh HTML — not a code regression in PR #329.**

Confirmed two ways:

1. **Live diagnosis.** `GET /api/health`, `/api/launch-readiness`, and the raw HTML/JS bytes at the deployed URL all confirmed the *origin server* was already fully updated (my code's markers were present, `cf-cache-status: DYNAMIC`, no caching at the edge for a fresh `curl`). But **none of `index.html`, `app.js`, or `testing-lab-ui.js` sent any `Cache-Control`/`ETag`/`Last-Modified` header**, and this app registers a real PWA service worker (`service-worker.js`) whose fetch handler for JS/CSS is:
   ```js
   caches.match(event.request).then((cached) => {
     const networkFetch = fetch(event.request).then(r => { putInCache(...); return r; }).catch(() => cached);
     return cached || networkFetch;   // <-- always returns the CACHED copy immediately if one exists
   })
   ```
   That refreshes the cache **in the background for next time only** — the current page load always gets whatever was cached from before, however old. None of the cache-busting version strings this app uses (`app.js?v=…`, `styles.css?v=…`, `testing-lab-ui.js?v=…`, the service worker's own `CACHE_NAME`) had been bumped for this deploy, so a returning browser (the Platform Admin's, across many sessions this week) kept being served pre-PR-#329 JS indefinitely under the exact same cached URL. `docs/TESTING_FULL_PLATFORM_INTEGRATION_COMPLETION_REPORT.md` already documents an earlier, separate incident of this exact shape — this is a known, recurring failure mode of manual version-string bumping, not a one-off mistake.
2. **Fresh-context reproduction.** A completely fresh (no localStorage/cache/service-worker) browser context at commit `63b3002` rendered full, correctly capability-gated navigation for Platform Admin and for every one of the 6 External Tester Sandbox roles — never reduced to "My Messages / What's New." This rules out a code regression: the reported symptom only appears with a stale cache in the mix, exactly matching a version-mismatch between fresh HTML (new sidebar items visible) and stale JS (old click-binding/nav logic that doesn't know about them).

## 2. What was fixed

### A. The immediate incident (make this deploy actually reach everyone)
Bumped every cache-busting version string together and consistently: `app.js`/`styles.css`/`comms-center.js` (`20260722-full-int` → `20260724-incident-fix`) in both `index.html` and `service-worker.js`'s own `APP_SHELL` list, the service worker's `CACHE_NAME` (`llh-shell-v109-full-int` → `llh-shell-v110-incident-fix`, which forces its `activate` handler to purge every old-named cache), and `testing-lab-ui.js` (`20260722-phase20` → `20260724-incident-fix`) in `platform-perf.js`.

### B. Prevent this class of incident recurring (the requested cache-recovery mechanism)
- `GET /api/build-version` — reports the running server's deployed git SHA (prefers `LLH_GIT_SHA`, then Render's own automatically-injected `RENDER_GIT_COMMIT`, then `GIT_COMMIT` — zero manual setup needed on Render) and this process's boot time.
- Client establishes its own baseline once at boot, then re-checks every 90s and on `visibilitychange`/`focus`. On a genuine mismatch it shows **"A new testing version is available."** with a **Reload** button — never on a normal first load.
- **Reload** always unregisters every service worker and clears every Cache Storage entry *before* reloading — never a plain reload that could hit the same stale cache again.
- Every reload is a single explicit click; nothing here is automatic or timer-driven, so this can never trap anyone in a reload loop — confirmed by a real browser-driven test that forces a mismatch, clicks Reload, and verifies the freshly-reloaded page never immediately re-shows the banner.

### C. A second, unrelated bug found while walking every role/device combination with real clicks
The Testing Feedback floating button (bottom-left) was found — via an actual failed Playwright click, not a synthetic check — to sit on top of the calendar's per-week "Wk" jump buttons at some sizes. Moving it to bottom-right fixed that but then collided with Family Hub's full-width bottom tab bar's last tab ("Account"), also confirmed via a real click timing out. Fixed by raising the widget above that tab bar whenever it's present (`body:has(.fh-bottom-nav)`).

## 3. Answers to the specific investigation checklist

1. **Deployed frontend matches 63b3002?** Yes — confirmed live via `curl` against the deployed origin (byte-level check for new-PR markers in `index.html`/`app.js`; `cf-cache-status: DYNAMIC`, not edge-cached).
2. **Service-worker/cache-version mismatch?** Yes — this *is* the root cause (Section 1).
3. **Console errors / failed requests captured?** Yes, throughout every reproduction and the new walkthrough suite; only pre-existing, unrelated 503s from admin-analytics endpoints without Stripe configured (expected in a bare testing env) — never a page error.
4. **Invisible overlays / pointer-events / z-index?** Audited; found and fixed the Testing Feedback widget overlap (Section 2C). No other blocking overlay found anywhere in the walkthrough.
5. **Global click handler cannot throw before navigation runs?** Re-verified intact from the prior hotfix (the analytics `trackEvent` call is `try/catch`-wrapped and the preview-escape/stale-build checks run first, unconditionally, in the delegated handler) — confirmed still present post-merge.
6. **Admin preview escape/navigation survive server failures?** Re-verified via `test:admin-preview-escape` (forces the exit API to fail/abort; local state still clears).
7. **Identity/organization/role/entitlements/capabilities/flags audited post-login?** Yes, for Admin and all 6 sandbox roles — each resolves the correct role/accountType/capability set (see `test:external-tester-sandbox` and the new walkthrough).
8. **Why did role previews show only My Messages/What's New?** Never reproduced against fresh code — this was the stale-JS symptom (Section 1); a stale build's nav-visibility logic evaluating against a mismatched/incompatible fresh DOM (or fresh identity payload) hides every capability-gated item, leaving only the two nav items that were never capability-gated in the first place ("My Messages", "What's New").
9. **Nav built only after identity/capabilities load, re-renders when they do?** Confirmed via `syncPlatformNavVisibility()` being called synchronously from every identity-affecting flow (login, boot restore, preview switch, role switch) and via the walkthrough showing correct, fully-populated nav immediately after every role switch.
10. **Sessions/admin tokens use consistent keys across lazy-loaded modules?** Audited — `llhAdminToken`/`llhMemberSessionToken` are read consistently by `app.js`, `testing-lab-ui.js`, and the External Tester Sandbox code; no mismatch found.
11. **Real links and direct URLs tested, not just DOM presence?** Yes — the new walkthrough loads `?view=messages` directly (not via a click) and confirms a real, non-blank view loads with zero errors, for Platform Admin.
12. **External tester sandbox role switcher re-verified after the nav fix?** Yes — end to end: the picker lists exactly the 6 approved roles, switching updates the banner and reloads, and the resulting navigation is always fully populated for every role, at every device size.

## 4. Live-style walkthroughs (phone / tablet / computer)

`scripts/test-live-style-role-device-walkthrough.js` — 23 checks, all passing: Platform Admin + Director, Solo Home Daycare Provider, Lead Teacher, Assistant, Parent/Guardian, and Curriculum Only, each at phone (390×844), tablet (820×1180), and computer (1280×900). For every one: the real menu opens, every visible nav-chrome button is actually clickable (a real hit-test, not just DOM presence), a real sidebar click changes the page, no blank screen, zero console/page errors, no blocking overlay, and (for testers) the testing banner, Switch Testing Role, Return to Tester Home, and the Testing Feedback button are all present and functional. Platform Admin's Return to Admin (after entering a preview) and a direct `?view=messages` URL load are both explicitly re-verified.

## 5. Files changed

- `index.html`, `service-worker.js`, `platform-perf.js` — cache-buster version bump.
- `server/index.js` — `GET /api/build-version`, shared `deployedGitSha()` helper (also now used by the existing Testing Feedback "deployed commit" field).
- `app.js` — stale-build detection/banner/reload logic.
- `index.html`, `styles.css` — stale-build banner markup/styles; Testing Feedback widget repositioning.
- 24 existing test files — updated hardcoded cache-buster assertions to the new version strings (mechanical, no behavior change).
- `scripts/test-stale-build-recovery.js` (new, 7 checks), `scripts/test-live-style-role-device-walkthrough.js` (new, 23 checks).

## 6. Test results

```
npm run test:stale-build-recovery              → 7 PASS
npm run test:live-style-role-device-walkthrough → 23 PASS
npm run test:admin-clickability-visual          → 8 PASS  (re-verified)
npm run test:external-tester-sandbox            → 15 PASS (re-verified)
npm run test:admin-preview-escape               → 9 PASS  (re-verified)
npm run test:testing-feedback                   → 18 PASS (re-verified)
npm run test:tester-account-manager             → 9 PASS  (re-verified)
npm run test:testing-lab-phase18                → 18 PASS (re-verified)
npm run test:family-hub-phase9                  → 21 PASS (re-verified)
npm run test:phase23-platform-walkthrough       → 15 PASS (re-verified)
npm run check (syntax)                          → clean
```

Two pre-existing, unrelated test failures were found and left as-is (confirmed present before this branch's changes, on the merge-base commit): `test-founding-upgrade-banner`'s "banner placements" assertion and `test-admin-ai-content-manager`'s "tabs" assertion. Neither relates to caching, navigation, or this incident; the one line in `test-founding-upgrade-banner` that *did* reference the old service-worker cache name was still updated for hygiene.

## 7. Screenshots

Refreshed as part of re-running existing suites: `docs/screenshots/phase23/phase23-fake-roles-phone-tablet.png`, `docs/screenshots/testing-admin-hotfix/external-tester-testing-banner.png` (now shows the repositioned Testing Feedback button). The new walkthrough test intentionally does not add further screenshots — it is a correctness suite (23 pass/fail checks across every role/device), not a visual capture tool; the External Tester Sandbox demonstration screenshots from the previous round already show the same repositioned widget.

## 8. Confirmation

- `main`/production untouched. AI Testing remains disabled (`ALLOW_OPENAI_TESTING`/flag untouched — the AI key visible in the live testing service's `/api/launch-readiness` was already configured from a prior session, not touched by this branch).
- Phase 24 not started. No external tester accounts created or distributed.
- Stripe, email, Resend, SMS, and production data untouched.
- **Not merged or deployed — awaiting approval.**
