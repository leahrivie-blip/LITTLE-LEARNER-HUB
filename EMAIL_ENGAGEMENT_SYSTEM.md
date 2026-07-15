# Email & User Engagement System

## Summary

Built an outbound engagement layer on top of the existing `sendEmail()` helper (Resend / SendGrid / Postmark). No duplicate mail stack. Support/bug/feature/feedback/staff-invite emails are unchanged.

## What was added

### Onboarding drip (once-only)
| Step | Timing | Subject |
|------|--------|---------|
| `welcome` | Immediate on first signup (`POST /api/account/profile` with `signup: true`) | Welcome to Little Learner Hub |
| `tips` | Day 2+ (after welcome) | Your first week with Little Learner Hub |
| `explore` | Day 5+ (after tips) | New curriculum ideas waiting for you |

Flags live on the user as `onboardingEmails.welcomeSentAt|tipsSentAt|exploreSentAt`. A step never re-sends once stamped.

### Weekly Monday “What’s New”
- Hourly scheduler checks for Monday + enabled setting.
- Includes only **public** lesson plans with `publishedAt` in the last 7 days.
- **Skip if empty** — no blast when nothing new was published.
- Lesson saves now set `publishedAt` the first time a plan becomes `published` / `featured`.

### Admin → Dashboard → Emails
- Provider readiness, send/fail/skip totals
- Toggle onboarding + weekly digests
- Run onboarding sweep / force weekly digest
- Test-send one onboarding step to a user
- Preview lessons that would appear in What’s New
- Recent email event log

### APIs
- `GET /api/admin/email-engagement`
- `POST /api/admin/email-engagement/settings`
- `POST /api/admin/email-engagement/run-onboarding`
- `POST /api/admin/email-engagement/run-weekly`
- `POST /api/admin/email-engagement/send-step`
- `POST /api/email/unsubscribe`

## Reliability audit

| Check | Result |
|-------|--------|
| Soft-fail when email provider unconfigured | PASS — signup / digests stamp without crashing |
| Once-only welcome | PASS |
| Once-only tips / explore | PASS |
| Weekly skip-if-empty | PASS |
| Seed curriculum does not falsely trigger What’s New | PASS (`publishedAt` required) |
| Existing support ticket path preserved | PASS |
| Firebase verification / reset untouched | PASS (still client Firebase only) |
| In-app onboarding checklist untouched | PASS (separate UX) |

## Tests

```bash
NODE_ENV=test node scripts/test-email-engagement.js
```

All assertions passed in this environment.

## Ops notes

1. Configure `SUPPORT_EMAIL_FROM` + one of `RESEND_API_KEY` / `SENDGRID_API_KEY` / `POSTMARK_SERVER_TOKEN` (same as support mail).
2. Set `SITE_URL` to the production origin for CTA links.
3. Admin can disable either campaign from **Emails** without redeploying.
4. Users can stop digests via `POST /api/email/unsubscribe` (`emailPrefs.unsubscribedAt`).

## Files

- `server/email-engagement.js` — engagement engine
- `server/index.js` — hooks, `publishedAt`, routes, scheduler
- `app.js` / `index.html` / `styles.css` — Admin Emails panel
- `scripts/test-email-engagement.js` — coverage
