# App Conversion Readiness — Little Learner Hub

Short report for future native/PWA packaging. Based on current website code as of Final Owner Review Round.

## Current foundation

| Area | Status | Notes |
|------|--------|--------|
| PWA manifest | Ready | `site.webmanifest` has `name`, `short_name`, `start_url`, `display: standalone`, PNG + maskable icons |
| Service worker | Ready | `service-worker.js` caches the app shell, offline-safe navigation fallback, and now handles `push` + `notificationclick` |
| Install prompt | Ready | `beforeinstallprompt` handled in `app.js` with install surfaces/settings (unchanged) |
| Apple touch icon | Ready | `apple-touch-icon` now points at a real 180×180 PNG export |
| Login persistence | Present | Account/plan/favorites in `localStorage`; backend session for admin/API |
| Offline handling | Improved | Shell-only cache + dedicated `offline.html` fallback for first-ever offline visits |
| Push notifications | Ready | Web Push (VAPID) subscribe/unsubscribe, opt-in preference center, Messages + notification bell — see `docs/MESSAGING_AND_PUSH_SETUP.md` and `MESSAGING_PUSH_LAUNCH_REPORT.md` |
| App icon / brand | Rasterized | SVG brand art rasterized to PNG 192/512 + maskable via `scripts/generate-app-icons.js`; still same placeholder brand mark — swap the source SVGs and re-run the script when final logo art is ready |

## What works today for “Add to Home Screen”

1. Manifest + service worker registration already run on load.
2. Standalone display mode is configured.
3. Install prompt can be deferred and surfaced in settings.
4. Basic offline reopen of the shell is possible if previously visited.

## Gaps before a real app-like release

### PWA readiness
- Refresh cache versions for `app.js` / `styles.css` so installs do not stick on stale lesson UX.
- Add `id` / better `short_name` if needed for store-like installers.
- Verify iOS Safari Add to Home Screen with final icons (iOS ignores some manifest fields).

### Install to Home Screen
- QA on iPhone Safari and Android Chrome install flows.
- Confirm splash/theme colors match brand.
- Ensure install CTA copy is daycare-teacher friendly and not buried.

### Offline handling
- Decide offline scope: lesson library browse vs open saved plans vs planner.
- Cache published curriculum payloads carefully (size + freshness).
- Show clear offline banners; never silently fail Plan This Week / print.

### Push notification readiness
- Not started. Needs:
  - permission UX
  - server push endpoint + VAPID
  - preference center (reminders only; no spam)
  - likely later than core lesson library merge

### Login persistence
- Local account persistence works for demo/local mode.
- For production app packaging, harden auth token refresh, logout everywhere, and secure storage expectations on native wrappers.

### App icon replacement
- Replace `images/icons/icon-192.svg` and `icon-512.svg` with final LLH logo exports:
  - 192×192 PNG
  - 512×512 PNG
  - maskable safe-zone variant
- Update `site.webmanifest` + `apple-touch-icon`.

## Suggested conversion sequence (technical)

1. Stabilize web Lesson Library UX (this review track) and production curriculum.
2. Swap final brand icons + theme colors.
3. Harden PWA cache strategy for lesson shell + selected offline reads.
4. Validate Install / standalone on Safari + Chrome.
5. Only then package as TWA / Capacitor / App Store wrapper.
6. Push notifications after install + auth are stable.

## Bottom line

The site is **PWA-scaffold ready**, not **app-release ready**. Install-to-home-screen can be improved quickly with final icons and cache hygiene. Offline curriculum and push notifications are later phases and should not block Lesson Library merge.

## Logo integration note
Current icons are SVG placeholders under `images/icons/`. Before public install campaigns, replace with the new Little Learner Hub logo as PNG 192 / 512 + maskable, then update `site.webmanifest` and `apple-touch-icon`.
