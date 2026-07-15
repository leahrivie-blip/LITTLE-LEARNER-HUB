# Email & User Engagement System

## Summary

Built an outbound engagement layer on top of the existing `sendEmail()` helper (Resend / SendGrid / Postmark). No duplicate mail stack. Support/bug/feature/feedback/staff-invite emails are unchanged.

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

## Admin → Dashboard → Emails

Toggles, analytics, manual runs, test sends, digest preview.

## Tests

```bash
NODE_ENV=test node scripts/test-email-engagement.js
```

## Sample previews

Generated under `/opt/cursor/artifacts/email-previews/` (`welcome`, `tips`, `explore`, `whats-new`).
