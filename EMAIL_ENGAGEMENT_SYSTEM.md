# Email & User Engagement System

## Summary

Built an outbound engagement layer on top of the existing `sendEmail()` helper (Resend / SendGrid / Postmark). No duplicate mail stack. Support/bug/feature/feedback/staff-invite emails are unchanged.

**Canonical From:** `Little Learner Hub <support@littlelearnershubbyleah.com>`  
**Master kill-switch:** `EMAIL_AUTOMATIONS_ENABLED` (default `false`) — blocks scheduler, signup welcome, drip, weekly, and one-time bulk sends. Admin single-user test sends still work. See `EMAIL_STRATEGY_REPORT.md`.

## Onboarding drip (once-only)

| Step | Timing | Focus |
|------|--------|-------|
| `welcome` | Immediate on first signup | Explains LLH, notes that new lesson plans are added regularly, invites feedback |
| `tips` | Day 2+ | Requests feedback and bug reports |
| `explore` | Day 5+ | Upcoming features, new content, what’s coming next |

Flags: `onboardingEmails.welcomeSentAt|tipsSentAt|exploreSentAt`.

## Weekly Monday “What’s New”

Detects newly published curriculum in the last 7 days:

| Content type | Detected now? | Notes |
|--------------|---------------|-------|
| Lesson plans | Yes | title, age, theme, deep link, activity count, resource count |
| Activities | Yes | via `publishedAt` when published with/after a lesson |
| Curriculum resources | Yes | via `publishedAt` on resource publish |
| Site printables library | Yes | via `publishedAt` or `createdAt` |
| Coloring pages / vocabulary cards | Partial | Only if stored as curriculum resources or printables — not separate content types today |

**Skip send if nothing new exists.**

`publishedAt` is set the first time a lesson/activity/resource becomes public. Startup seeds use a stable historical stamp so they do not falsely fill the digest.

## One-time welcome/update (all users)

Manual, audit-gated blast for a **single** welcome/update email to every eligible account.

- **Not scheduled** and **not recurring** (never added to the hourly scheduler)
- Prepare first (no send): `POST /api/admin/email-engagement/prepare-one-time`
- Requires `POST /api/admin/email-engagement/preflight-audit` to pass before delivery
- Send via `POST /api/admin/email-engagement/send-one-time` with `{ auditToken, confirm: true }`
- Stamped in `emailEngagement.settings.oneTimeWelcomeUpdate.sentAt` so it cannot run again

### Preflight audit checks

1. Total production user count  
2. Total active user count (non-disabled)  
3. Total message count  
4. Admin dashboard user list matches the database  
5. Admin inbox matches the database  
6. Email recipient list matches the database  
7. No staging/test database is being used  
8. No filters are hiding users  
9. Email provider is configured and ready to send  

## Admin → Dashboard → Emails

Toggles, analytics, preflight audit, **Prepare emails (no send)**, one-time all-users send, manual onboarding/weekly runs, test sends, digest preview.

## Tests

```bash
NODE_ENV=test node scripts/test-email-engagement.js
```

## Sample previews

Generated under `/opt/cursor/artifacts/email-previews/` (`welcome`, `tips`, `explore`, `whats-new`).
