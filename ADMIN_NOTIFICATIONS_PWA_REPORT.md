# Admin Notifications, PWA Install & Persistent Login

**Branch:** `cursor/admin-notifications-pwa-login-d098`  
**Status:** Ready for review — **do not merge until approved**  
**Date:** 2026-07-17

---

## 1. Current Notification Audit

| Area | Status before this PR | Notes |
| --- | --- | --- |
| In-app bell (members) | Working | Polls `/api/notifications` |
| Push (opt-in) | Working | VAPID auto-config; SW click deep-links |
| Admin email on support/bug/feature | Working | `notifyAdmin` / `notifySupportTicket` |
| Admin in-app on support/bug/feature | Working | `notifyAdminsInApp` |
| Member → admin message | **Broken (duplicate)** | Two notifications fired for one reply |
| New signup → admin | **Missing** | No owner alert |
| Billing lifecycle → admin | **Missing** | No owner alert for checkout/fail/cancel/renew |
| Reports / doc helpers → admin | Partial | Support/bug/feature only; not all future report types |
| Account reminder checkboxes | Non-functional | UI only; not wired to delivery (left as-is / future) |
| Admin sidebar unread badge | Missing | Added |
| Admin notification center | Missing | Added |

---

## 2. Missing Notification List (addressed vs remaining)

### Added in this PR
- New account signup (in-app + email)
- New Founding / Pro / Annual / Trial via checkout membership assign (in-app + email)
- Payment failed (in-app + email)
- Subscription canceled / ended (in-app + email)
- Cancel-at-period-end scheduled (in-app)
- Subscription renewed (`subscription_cycle` invoices) (in-app)
- Member message / reply (single deduped in-app + push if admin opted in)
- Admin Notification Center with filters + mark read + open target
- Admin nav unread badge + command-center quick launch

### Still remaining / future
- Trial ending soon (scheduled job; not implemented — recommend daily cron)
- Documentation-helper / incident / parent-communication specific typed alerts beyond support tickets
- SMS (Twilio etc.) — **not implemented** (see recommendations)
- Wiring Account “Reminders and alerts” checkboxes to real delivery

---

## 3. Fixes Made

1. **Duplicate admin message alerts** — member reply now emits one `emitAdminAlertSafe` instead of `notifyAdminsInApp` + `fanOut`.
2. **Past_due-style gaps for owner awareness** — billing webhooks + checkout now alert Admin.
3. **Signup silence** — `/api/account/profile` with `signup: true` emits `admin_new_signup`.
4. **PWA/cache** — asset versions bumped; install card no longer login-gated; iPhone/iPad/Android/Desktop steps expanded.
5. **Persistent login** — member session token can live in `localStorage` when “Keep me signed in” is checked; Firebase persistence set to local vs session; Admin “Trust this device”.
6. **Manifest shortcuts** — Admin, Messages, Lesson Plans for installed app quick actions.

---

## 4. New Features Added

### Add to Home Screen
- Friendlier install card + modal steps for iPhone/iPad Safari, Android Chrome, Desktop Chrome/Edge
- Guests can see install prompt (not only logged-in users)
- `apple-touch-startup-image` + `mobile-web-app-capable`
- Manifest shortcuts + categories

### Admin quick access
- Home-screen shortcut: `/?view=admin`
- Command center card on Admin dashboard
- Notifications button + `#adminNavBadge`
- Admin-only Notification Center panel

### Notification methods
1. In-app bell / Admin center / badge (Priority 1)
2. Email to support/admin inbox for signup + key billing (Priority 2)
3. Push when Admin email has opted in on an installed device (Priority 3)
4. SMS deferred

### Persistent login
- Keep me signed in (default on)
- Trust this device for Admin unlock
- Member session token persistence across restarts when opted in
- Logout / Lock Admin still clears sessions

---

## 5. Testing Results

| Test | Result |
| --- | --- |
| `node --check` server/app | Run in CI of this PR |
| `test:admin-notifications-pwa` | Signup alert, mark-read, filter, single message alert |
| `test:admin-auth-session` | Cache + Lock Admin wiring |
| `test:platform-wide-audit` | Cache alignment |
| `test:pwa-install` | Existing PWA contract |
| `test:messaging-foundation` / push suite | Regression for messaging/push |

Manual / post-deploy recommended:
- Install on iPhone Safari home screen; reopen; confirm stay signed in
- Unlock Admin with Trust this device; kill app; reopen Admin
- Opt Admin into push; send a test member message; confirm one push
- Confirm private/incognito does not keep session after close

---

## 6. Recommendations for Future SMS

- Do **not** add paid SMS until volume justifies it.
- Prefer: Admin push + email first (shipped).
- If SMS later: Twilio/MessageBird with hard allowlist to Leah’s number only, rate limits, and only for `payment_failed` + `admin_new_founding` + unread message spikes.
- Keep SMS opt-in separate from push; never SMS message bodies.

---

## 7. Files Changed (high level)

- `server/admin-notifications.js` (new)
- `server/index.js` — alerts, endpoints, message dedupe, fanOut deep links
- `app.js` — install, persist login, admin center UI
- `index.html` — panels, keep-me-signed-in, splash meta
- `site.webmanifest` — shortcuts
- `service-worker.js` / cache bust
- `styles.css` — admin notif / command center
- `scripts/test-admin-notifications-pwa.js` (new)
- This report

---

## 8. Intentionally Not Changed

- No SMS provider integration
- No merge to `main` until you approve
- Account reminder checkboxes still local UI only
- No automatic marketing emails (`EMAIL_AUTOMATIONS_ENABLED` remains false)
