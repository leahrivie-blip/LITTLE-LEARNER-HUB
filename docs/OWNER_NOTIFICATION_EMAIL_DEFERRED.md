# Owner Notification Emails — Deferred (Post Phase 1)

Do **not** implement these in Phase 1. Recommended for a later approved phase.

## Missing owner email triggers

| Item | Current behavior | Recommended later work |
|------|------------------|------------------------|
| Dedicated Lesson Plan Request owner email | In-app admin alert only (`admin_lesson_plan_request`); no email | Add `sendEmail: true` with owner shell template + Open Lesson Plan Requests CTA |
| Dedicated Trial Ended owner email | No owner email when trial ends without conversion | Emit owner email from the existing trial-end membership transition only if a single safe hook already runs (avoid double-fire with cancel/access-expired) |
| Trial-to-paid conversion owner email | Covered partially by New Pro Member checkout alert | Optional distinct “Trial converted to paid” subject when prior trial markers exist |
| Password-reset-requested owner alert | Customer reset email only | Optional low-volume owner alert (privacy-sensitive; consider sampling / admin setting) |
| Cancel-at-period-end owner email | In-app only (`admin_subscription_canceling`, `sendEmail: false`) | Enable owner email with access-until date; keep separate from Subscription Ended |
| Duplicate feedback/support-ticket cleanup | “Needs Improvement” / Suggest paths create **both** feedback and a support ticket (`app.js`) | Deduplicate client or server-side so owner inbox gets one notification; preserve both records only if product wants dual queues |

## Implementation notes for later

1. Prefer extending `emitAdminAlertSafe(..., { sendEmail: true })` over new side-effect paths.
2. Reuse `server/owner-notification-email.js` event types; do not invent a second shell.
3. Keep delivery best-effort; never block Stripe webhooks or auth flows.
4. For cancel-at-period-end vs subscription-ended, use distinct `ownerEventType` values so subjects stay clear.
