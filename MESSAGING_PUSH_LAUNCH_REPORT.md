# Member Messaging Center + Push Notifications — Launch Report

## Summary

Little Learner Hub now has an in-app Member Messaging Center (private
messages, group/broadcast messages, replies, unread badges, a notification
bell) and installed-app Web Push notifications, built on top of the
existing PWA scaffold. In-app messaging is always the source of truth — a
message is saved and an unread notification created first; push is a
best-effort layer on top that never blocks or breaks the in-app message if
it's unavailable, declined, or fails.

## Is the app installable?

**Yes.** It already had a working manifest + service worker + install
prompt (`APP_CONVERSION_READINESS.md`), which we hardened rather than
rebuilt:

- `site.webmanifest` now ships real PNG icons (192/512 + maskable variants,
  rasterized from the existing brand SVGs — same artwork, no placeholder
  logo swap yet) instead of SVG-only icons, which is more broadly supported
  for "Add to Home Screen" across browsers.
- `apple-touch-icon` now points at a real 180×180 PNG instead of an SVG
  (iOS Safari does not reliably use SVG touch icons).
- `service-worker.js` cache version was bumped and now also precaches the
  new icons, messaging stylesheet, and a dedicated `offline.html` fallback.
- Install prompt logic (`beforeinstallprompt`, Settings → "Add to Home
  Screen", the Calendar install card) is untouched and still works.

## Which browsers/devices support the push notifications?

Web Push (the standard used here — VAPID + the Push API + Service Workers)
is supported on:

- **Android Chrome / Edge / Firefox / Samsung Internet** — full support,
  installed or not.
- **Desktop Chrome, Edge, Firefox** — full support, installed or not.
- **iOS/iPadOS Safari 16.4+** — supported **only when the app is installed
  to the Home Screen** (Apple's platform restriction, not something this
  app can work around). Safari on iOS without installing does not support
  Web Push at all.
- **macOS Safari** — supported since Safari 16 for both installed and
  regular tabs.

The client checks `"serviceWorker" in navigator && "PushManager" in window
&& "Notification" in window` (`browserPushSupport()` in `app.js`) before
ever showing an enable action, and the Notification Settings tab tells the
user plainly when their browser doesn't support it. In-app messages and the
notification bell work identically everywhere regardless of push support.

## What manual setup or environment variables are required?

**None are required.** VAPID keys (used to sign push messages) are
generated automatically on first boot and persisted in the same database
the rest of the app already uses, so they survive restarts/redeploys with
zero configuration. See `docs/MESSAGING_AND_PUSH_SETUP.md` for the optional
environment variables (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` to pin a
specific key pair, and bulk-send rate-limit tuning knobs). The Render
deploy config (`render.yaml`) documents these as optional, `sync: false`
values.

## How users message Leah (User → Leah)

Users can start conversations — admins do not have to message first.

1. From the top bar, click **Message Support** (desktop), or open **Messages**
   in the nav, or Settings → **Message Support** / **Help & Support**.
2. On the Conversation with Leah tab, type a message and click **Send**.
3. That creates a private thread immediately. Leah sees it under Admin →
   **Messages → Conversations**, with the member's profile (name, account
   type, Free/Pro/Founding, signup date, last active) above the thread.
4. Support tickets, bug reports, and feature requests still work via
   Settings → Need Help? (feedback modal / Contact page). Lesson plans also
   include 👍 / 👎 / 💡 shortcuts that land in the feedback + support inbox.

## Dashboard announcement banner (separate from messaging)

Site Editor → Announcement still drives `#siteAnnouncementBanner`
(`renderManagedAnnouncementBanner()`). That banner can show copy like
"🎉 New Lesson Plans Added This Week" without sending any message or
notification. Messaging announcements and the bell are a separate system.

## How Leah sends one private message

1. Admin Dashboard → **Messages → Compose**.
2. "Send to" → **Private message to one user**.
3. Enter the user's email, write the message, click **Send Message**.
4. It is saved immediately (in-app), an unread notification/badge appears
   for that user, and — if they've installed the app and turned on
   notifications — they get a push: *"Little Learner Hub — Leah sent you a
   new message."* The message text itself is never in the push preview.
5. Leah can also reply from **Messages → Conversations**, which lists every
   private thread with an unread-from-user count, click a conversation to
   see full history and reply inline.

## How Leah sends a group announcement

1. Admin Dashboard → **Messages → Compose**.
2. "Send to" → choose **All Free users**, **All Pro users**, **All Founding
   Members**, **Selected users** (paste/comma-separate emails), or
   **Everyone (announcement)**.
3. Write the message, click **Preview & Send**.
4. A confirmation dialog shows the **exact recipient count**, the
   **audience name**, and a **preview of the message text** — nothing sends
   until Leah explicitly clicks **Send to N**. Canceling sends nothing.
5. Audience membership is computed from the same authoritative
   Stripe/access data used for billing/feature gates
   (`membershipCurrentAccessKey`), not the display label — so a lapsed
   "Founding" flag or a trialing user is classified correctly, and staff
   accounts inherit their program owner's tier. Drafts (saved but not sent)
   never notify anyone and never appear in any user's inbox.

## How users enable notifications

1. **Messages → Notification Settings** (also linked from Settings → "Push
   Notifications").
2. Toggle **"Receive push notifications from Little Learner Hub"** on.
   This is the only place the browser permission prompt is triggered, and
   only from that explicit click — never automatically on page load.
3. If they allow it, the device subscribes and is registered to their
   account (multiple devices are all supported independently).
4. If they decline (browser prompt "Block") or turn the toggle off, the
   preference is recorded and **the app never asks again automatically**.
   In-app messages and the notification bell keep working exactly the same
   either way.
5. Turning the toggle back on later re-subscribes without any extra setup.
   Logging out revokes that device's subscription automatically so the
   next person on a shared browser does not inherit it.

## Push notification copy (matches the product spec)

- Private message: *"Little Learner Hub — Leah sent you a new message."*
- Announcement: title = the announcement's subject (e.g. "New lesson plans
  added 🎉"), body = *"Open Little Learner Hub to see what's new."*
- Support reply: *"Little Learner Hub — Your support request has an
  update."*
- Bug-fix update: *"Little Learner Hub — There's an update on a bug you
  reported."*

None of these ever include private message text, ticket contents, or bug
report details — see `server/messaging-lib.js` `pushCopyForNotification()`,
which is unit-tested to guarantee this.

## Push delivery test results

Ran against a real Web Push (VAPID) send path — the only thing swapped out
is the destination push *provider* (a local HTTPS test server instead of
Google/Mozilla's), because a real subscription can only come from a real
browser. Everything else (VAPID signing, payload encryption, subscription
storage, delivery, error handling) is the production code path.

| Scenario | Result |
|---|---|
| Single device subscribes, receives a private-message push | ✅ Pass |
| Duplicate subscribe (same device/endpoint) does not create a 2nd row | ✅ Pass |
| Second device for the same user gets its own, independent push | ✅ Pass |
| Expired subscription (410 from provider) is logged "expired" and deleted | ✅ Pass |
| Failed delivery (500 from provider) is logged "failed", not dropped silently | ✅ Pass |
| Turning notifications off stops future push but in-app message still sends | ✅ Pass |
| Logout/unsubscribe removes only that user's device, never another user's | ✅ Pass |
| Admin test-send only reaches the admin's own device (never a real user) | ✅ Pass |
| Bulk send beyond the configured rate-limit cap is marked "skipped", logged | ✅ Pass |
| Notification preferences default OFF; no push before explicit opt-in | ✅ Pass |

Full suite: `npm run test:push-notifications` (13/13 passing).

## Permission and regression test results

**Messaging + safety (43 automated tests, all passing —**
`npm run test:messaging-all`**):**

- Database foundation: routes exist, unauthenticated requests rejected,
  private thread isolated per user (one user can never see another's
  private conversation).
- One-to-one admin messaging + user replies + unread badges: send → read →
  reply → admin sees unread-from-user → mark-read clears the badge.
- Group messaging: preview shows exact recipient count; sending a group
  message without `confirm: true` is rejected outright (no accidental
  broadcast); private sends don't require confirmation.
- **Notification safety:** a Founding-only send reaches only Founding
  members — Free users and users with an expired/historical founding flag
  never receive it; a "selected users" send reaches exactly that list; the
  admin account is always excluded from `all`; an announcement to
  "everyone" reaches every non-admin user.
- Drafts never appear in any inbox and never trigger a notification or
  push.
- Duplicate-submission protection: an identical send fired twice in a row
  is rejected the second time.
- Browser UI smoke test (Playwright): notification bell badge, bell panel
  contents, Messages conversation rendering, reply round-trip,
  auto-mark-read on opening a conversation, Notification Settings default
  OFF, admin composer recipient-count confirmation dialog — all render and
  behave correctly with zero console errors.

**Full-app regression (confirmed still working):**

- `node --check` passes on every edited/added server + client file.
- Health, launch-readiness, founding-status endpoints.
- The pre-existing announcements banner system (untouched, separate from
  the new Messaging Center).
- Support tickets and bug reports — now also raise a bell notification
  when Leah replies/updates status, without changing their existing
  create/update/list behavior.
- Staff invite endpoints.
- Static PWA assets (manifest, service worker, app shell, icons) still
  serve.
- `/api/client-config.js` still renders valid JS with Firebase config
  intact (push config added alongside it, not replacing anything).
- Separately verified via the pre-existing test suites: account-access
  (Free/Pro/Founding/promo/staff/admin capability matrix), billing/Stripe/
  membership audit (checkout, cancellation, founding limit, webhook
  handling, admin overrides), platform navigation, settings hub, staff
  invite flow, curriculum access security (Free vs. Pro gating), PWA
  install QA — all passing unmodified.

Two pre-existing Playwright regression scripts
(`test-homepage-smoke.js`, `test-unified-calendar-final-qa.js`) fail in
this sandbox on an unrelated UI-timing step (a "locked lesson upgrade"
modal button and a calendar item's delete-menu visibility); reproduced
identically on the unmodified base branch before any of this work, so it
is a pre-existing environment flakiness, not a regression from this
change.

## Limitations

- **iOS Safari push requires installing the app first** — this is an Apple
  platform restriction, not a limitation of this implementation.
- **Real push delivery to actual phones/browsers was not tested** in this
  environment (no way to obtain a real browser-issued push subscription
  from a headless CI sandbox). The full protocol path — VAPID signing,
  payload encryption, subscription storage, retry/error classification —
  was exercised end-to-end against a local test push provider standing in
  for FCM/Mozilla's push service; this is the standard way to test Web
  Push server-side logic without a real device.
- **Shared-device edge case:** if a user logs out without the browser
  revoking the OS-level notification permission (or on a shared computer
  where two people use the same browser profile without ever logging out),
  the *browser* may still show a queued notification tied to the previous
  subscription until the next actual push attempt (which will then prune
  it as expired/re-subscribed). Because push preview copy never contains
  private content (see above), no private message text can leak this way
  — the worst case is a generic "you have a new message" notification
  appearing at a slightly wrong moment.
- **Group/broadcast messages fan out one notification row per recipient**,
  which is appropriate at this app's scale (a childcare business platform,
  not a mass-market consumer app); if the user base grows to tens of
  thousands, this should move to an async job queue rather than an inline
  request-time fan-out.
- **Brand icons are rasterized placeholders**, not final artwork — swap the
  source SVGs in `images/icons/` and re-run
  `node scripts/generate-app-icons.js` (requires
  `npm install --no-save sharp` first) when the final Little Learner Hub
  logo is ready.
- Admin is a single owner account (`ADMIN_EMAIL`), consistent with the rest
  of the app — there is no multi-admin messaging inbox; this matches how
  Support/Feedback/Announcements already work.

## Do-not-activate note

Per the task's final instruction, this implementation does not enable,
force-send, or automatically trigger any real push notification to any
user — everything above is opt-in, tested against a local mock provider,
and the "admin test-send" path is hard-restricted to the admin's own
device.
