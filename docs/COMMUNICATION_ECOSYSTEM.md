# Communication Ecosystem Rebuild

Little Learner Hub’s messaging system expands into a full communication
ecosystem for members and admins.

## Member: My Messages & Requests

Nav → **My Messages** opens the Message Center with:

- Inbox / Conversation / Sent / Drafts
- Support Requests / Feature Requests / Bug Reports
- Archived / Unread
- Notification settings

Nothing typed or submitted disappears from the member history.

## Draft protection

Forms marked with `data-draft-form` + `data-draft-scope` auto-save every few
seconds (localStorage + server `/api/drafts`). Contact, feature, bug, and
feedback forms are wired. Leaving with unsaved changes warns via
`beforeunload`.

## Notifications

The header bell covers messages, support replies, feature/bug status updates,
announcements, feature updates, and admin alerts when new support/feature/bug/
messages arrive.

## Admin tools

| Area | Where |
|---|---|
| Message a user / broadcast | Admin → Messages → Compose (in-app / email / both) |
| Conversations + profile | Admin → Messages → Conversations |
| Reusable templates | Admin → Messages → Templates |
| Automations (trial/founding) | Admin → Messages → Automations |
| Support tickets | Admin → Dashboard → Support |
| Feedback | Admin → Dashboard → Feedback |
| Feature requests | Admin → Dashboard → Feature Requests |
| Bug reports | Admin → Dashboard → Bug Reports |
| User health | Admin → Users → User Health |
| Tags / timeline | Admin user tools + `/api/admin/user-tags` / `user-timeline` |
| What’s New editor | Admin → Site Editor → What’s New Editor |
| Site banner (no message) | Admin → Site Editor → Announcement |

## What’s New (members)

Nav → **What’s New** lists published release notes by category (features,
improvements, bug fixes, lesson plan additions, activity additions).

## Founding Member experience

`renderFoundingMemberExperience()` adds a badge/join-date/lifetime pricing card
for founding members (wired from the communications center module).

## Tests

```bash
npm run test:comms-ecosystem
npm run test:messaging-all
```
