# Phase 11 — Messaging, Notifications, and Permanent Communication History

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only)  
**Date:** 2026-07-22  
**Started from tip:** `9d0e1ce9cbde46d07e3f895e9887d3c06c0065a2`

## What changed

Built org-scoped family/provider messaging with permanent conversation history and an in-app notification center. The existing platform Messaging Center (member↔admin) is preserved and improved alongside — not replaced. Outbound email/SMS/push remain disabled (`sentExternally: false`).

**Family Hub nav decision:** Messages replaces Calendar in the bottom navigation (still max five items). Calendar remains under Account. Home also shows a Messages entry with an unread badge.

## Files changed

| Path | Role |
|------|------|
| `scripts/family-messaging-data-model.js` | Conversations, messages, drafts, attachments, notifications, retention/export |
| `scripts/family-messaging-fixtures.js` | Fake threads, announcements, internal staff, notifications |
| `server/family-messaging-api.js` | Provider `/api/director-center/family-messaging/*` |
| `server/family-hub-messaging-handlers.js` | Family Hub message/notification handlers |
| `server/family-hub-api.js` / `server/index.js` | Mount + Phase 11 seed/status |
| `family-hub-ui.js` | Messages tab, unread badge, Calendar under Account |
| `family-messaging-ui.js` | Director Center **Family Messaging** tab |
| `director-center-ui.js` / `index.html` / `styles.css` | Wiring |
| `scripts/test-family-messaging-phase11.js` | Focused suite (**13 PASS**) |
| `scripts/capture-family-messaging-phase11-screens.js` | Two screenshots |

## Conversation types

Staff↔guardian, director↔guardian, child-family, staff↔staff, classroom/selected/program announcements, internal staff-only, support/admin foundation. Announcement replies open a private provider-family thread. Recipient emails/phones of other families are never exposed.

## Permanent-history behavior

Classroom moves, role changes, household changes, archive, and access end do not delete conversation or message records. Edits preserve `originalBody` + edit history. Withdrawals keep an audit record and show a withdrawn notice. Authorized directors can export conversation history. Retention policies are configurable placeholders (no universal legal period promised).

## Family and staff permissions

Server-side `messages` capability via Phase 8 access rules. Pickup-only/emergency-only denied. Teachers scoped by classroom/child. Internal notes never appear in Family Hub. Parents cannot open staff-only threads.

## Notification isolation

Regular users never receive `admin_only` notifications. Unread counts match authorized unread rows. Opening a notification validates the target; unavailable targets do not leak data. Duplicate fan-out is avoided by conversation-scoped create paths.

## Outbound delivery status

Email / SMS / push forced off. Delivery preference structure stored (in-app, digests, quiet hours, preview privacy). Fake attempts record `sentExternally: false`.

## Tests and screenshots

```bash
npm run test:family-messaging-phase11
```

**13 PASS** focused. Full Phase 1–11 regression: all suites PASS.

<img alt="Family Hub Messages phone" src="/opt/cursor/artifacts/family-messaging-phase11/1-family-hub-messages-phone.png" />
<img alt="Provider messaging inbox desktop" src="/opt/cursor/artifacts/family-messaging-phase11/2-provider-messaging-inbox-desktop.png" />

## Deferred

- Live email / SMS / push delivery  
- Phase 12+ work  

## Handoff confirmations

- Branch: `cursor/director-family-foundation-bc66`  
- Latest tip: `9d0e1ce9cbde46d07e3f895e9887d3c06c0065a2`  
- Phase 11 feature commit: `a5b1f4c`  
- Pushed; clean tree after docs push  
- Production Family Hub locked; `main` untouched  
- Phase 12 not started  
