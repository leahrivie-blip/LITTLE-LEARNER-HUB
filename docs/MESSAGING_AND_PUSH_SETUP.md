# Member Messaging Center + Push Notifications — Setup

This documents the new in-app messaging system and Web Push notifications
added to Little Learner Hub. See `MESSAGING_PUSH_LAUNCH_REPORT.md` in the
repo root for the full launch report (test results, limitations, how Leah
sends messages, etc.). This file is just the environment/setup reference.

## Is any manual setup required?

**No — it works out of the box.** On first boot, the server generates a
VAPID key pair (used to sign Web Push messages) and persists it in the same
store the rest of the app already uses (Postgres `llh_store` table, or the
local JSON file in dev). You do not have to generate or configure anything
for push to start working.

Optional environment variables let you override that behavior:

```bash
# Optional — only needed if you want push to survive a full database wipe,
# or want a specific "From" identity in the VAPID JWT. If unset, keys are
# auto-generated once and persisted in the store.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@littlelearnerhub.com

# Optional — tuning for bulk sends (defaults shown).
PUSH_BULK_BATCH_SIZE=20          # concurrent push sends per batch
PUSH_BULK_BATCH_DELAY_MS=75      # pause between batches
PUSH_BULK_MAX_RECIPIENTS=2000    # hard cap per send; excess devices are logged "skipped"
MAX_PUSH_DEVICES_PER_USER=8      # oldest device is evicted beyond this
```

To generate your own VAPID key pair manually (e.g. to move to a new
database without losing subscriber pushes):

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Then set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in your environment —
env vars always take priority over the auto-generated/persisted pair.

**Never** put `VAPID_PRIVATE_KEY` in client-side code, `site.webmanifest`,
or `/api/client-config.js`. Only the public key is ever sent to the browser
(via `/api/push/vapid-public-key` and `window.LLH_CONFIG.push.publicKey`).

## What changed on the server

- New store collections (same JSON-blob store as everything else —
  `server/index.js` `defaultStore()` / `ensureMessagingStore()`):
  `messages`, `messageDrafts`, `notifications`, `pushSubscriptions`,
  `notificationPreferences`, `pushDeliveryLog`, `pushConfig`.
- New modules:
  - `server/messaging-lib.js` — pure audience-targeting + copy helpers
    (unit tested in `scripts/test-messaging-lib.js`).
  - `server/push-lib.js` — VAPID key handling + rate-limited Web Push
    sending via the `web-push` npm package.
- New API routes — see `server/index.js` (search "Member Messaging Center").

## What changed on the client

- `app.js`: notification bell, Messages page (conversation + updates +
  notification settings), admin composer with recipient preview/confirm,
  Web Push subscribe/unsubscribe flow, service worker registration is
  unchanged (still in `registerPwaSupport()`).
- `service-worker.js`: added `push` and `notificationclick` listeners; cache
  version bumped; added `offline.html` fallback and PNG icons to the
  precached app shell.
- `index.html`: `Messages` nav item + badge, notification bell in the
  topbar, `#view-messages` container, admin "Messages" panel.
- `styles/llh-messaging.css`: all new UI styling (loaded after `styles.css`).
- `site.webmanifest`: added PNG + maskable icons (generated from the
  existing brand SVGs via `scripts/generate-app-icons.js`, no new artwork).

## Testing

```bash
npm run test:messaging-all
```

Runs, in order: pure audience-targeting unit tests, database foundation +
one-to-one messaging + replies + unread badges, group messaging with
preview/confirmation + access-group safety, push subscription/delivery
(single device, multi-device, expired/failed cleanup, duplicate prevention,
rate limiting, admin test-send restrictions), a Playwright UI smoke test,
and a regression pass over pre-existing endpoints (support tickets, bug
reports, announcements, staff invites, static PWA assets).

Individual suites: `npm run test:messaging-lib`, `test:messaging-foundation`,
`test:messaging-group-broadcast`, `test:push-notifications`,
`test:messaging-ui`, `test:messaging-regression`.
