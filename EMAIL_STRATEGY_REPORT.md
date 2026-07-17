# Little Learner Hub — Email Strategy Report

**Status:** Delivery fix + automation pause shipped in code. **No bulk or welcome campaign should be sent until you explicitly approve content and set `EMAIL_AUTOMATIONS_ENABLED=true`.**

**Date:** 2026-07-17

---

## 1. Production delivery diagnosis (current issue)

### What Resend is saying

Failed onboarding events return:

> You can only send testing emails to your own email address (`leahivie@icloud.com`). … change the `from` address to an email using this [verified] domain.

### Evidence from production email log

| Metric | Value |
|--------|------:|
| Successful sends observed | **3** |
| Failed sends observed | **159+** |
| Successful recipients | Only `leahivie@icloud.com` |

That pattern is exactly Resend’s **unverified-From / testing restriction**: the API key works, but the **From domain Resend accepted was not a verified production domain**, so only the Resend account owner inbox could receive mail.

### Exact sender after this rebuild (code)

| Field | Value |
|-------|--------|
| Display name | `Little Learner Hub` |
| Sender email | `support@littlelearnershubbyleah.com` |
| From header | `Little Learner Hub <support@littlelearnershubbyleah.com>` |
| Domain | `littlelearnershubbyleah.com` |

### What was wrong before

- `SUPPORT_EMAIL_FROM` / `RESEND_FROM` was set in production (`fromConfigured: true`), but **not** to the verified domain sender above (or it used a Resend test sender / personal inbox domain).
- Code previously passed that env value straight through to Resend.
- Resend therefore treated the account as **testing mode for recipients**, even if the domain UI showed verified for a *different* address than the one being used as From.

### What the code now does

1. **Canonicalizes From** to `Little Learner Hub <support@littlelearnershubbyleah.com>`.
2. If env From is on `littlelearnershubbyleah.com`, it keeps that address (and fills display name if missing).
3. If env From is `@resend.dev`, a personal domain, or any other domain, it **overrides** to the canonical sender.
4. Admin diagnostics expose the live From/domain without revealing API keys:
   - `GET /api/admin/email-diagnostics`
   - Admin → Emails panel

### Render env you should set (after deploy)

```bash
SUPPORT_EMAIL_FROM=Little Learner Hub <support@littlelearnershubbyleah.com>
SUPPORT_EMAIL_TO=leahivie@icloud.com
EMAIL_AUTOMATIONS_ENABLED=false
```

Confirm in Resend → Domains that **`littlelearnershubbyleah.com` is Verified** for the same account that owns `RESEND_API_KEY`.

---

## 2. Automations paused (before any user mail)

| Automation | Previous | Now |
|------------|----------|-----|
| Hourly onboarding scheduler | Started on boot | **Not started** unless `EMAIL_AUTOMATIONS_ENABLED=true` |
| Signup welcome email | Fired on first signup | **Blocked** while automations off |
| Onboarding drip (welcome/tips/explore) | Default on | **Default off** + kill-switch |
| Weekly “What’s New” | Default on | **Default off** + kill-switch |
| One-time all-users welcome/update | Manual/audit-gated | **Also blocked** by kill-switch |
| Admin single-user “Send step” | Manual | **Still allowed** for delivery tests |
| Support / bug / feature / feedback notifications | Transactional | **Still allowed** (uses same From) |

Boot also forces store toggles `onboardingEnabled` / `weeklyWhatsNewEnabled` to **false** when the kill-switch is off.

---

## 3. Transactional emails (keep)

These should keep working once From/domain delivery is fixed. They are not marketing campaigns.

| Email | System | Status |
|-------|--------|--------|
| Forgot Password | Firebase Auth | Keep (not Resend) |
| Password Reset Confirmation | Firebase Auth | Keep (not Resend) |
| Email Verification | Firebase Auth | Keep (not Resend) |
| Support ticket → admin inbox | App `sendEmail()` / Resend | Keep |
| Support / bug / feature / feedback user ack | App `sendEmail()` / Resend | Keep |
| Staff invite / internal ops notices | App `sendEmail()` / Resend | Keep |
| Billing receipts / failed payment | Stripe | Keep (not app Resend) |

---

## 4. Optional / review-before-enable emails

Do **not** enable until you rewrite copy and approve.

| Email | Trigger | Recommendation |
|-------|---------|----------------|
| Welcome (onboarding step 1) | Signup / drip | Rewrite, then approve |
| Tips (day 2) | Onboarding drip | Rewrite or drop |
| Explore / what’s coming (day 5) | Onboarding drip | Rewrite or drop |
| Weekly What’s New | Monday scheduler | Rewrite; only if new curriculum exists |
| One-time welcome/update blast | Admin + audit | Rewrite; send once after approval |
| Feature announcements | Not built as a separate campaign yet | Design later |
| New lesson plan notifications | Partially covered by weekly digest | Design later |
| Trial reminder emails | Not a first-class app campaign today | Design later if needed |

---

## 5. Audience snapshot (post-recovery backup, 52 users)

From `backup_2026-07-17T02-21-37-919Z_post-deploy-manual` (52 users):

| Metric | Count |
|--------|------:|
| Total users | 52 |
| Active users | 52 |
| Valid email addresses | 52 |
| Duplicate emails | 0 |
| Test / probe addresses | 2 |
| Bounce-risk flagged | 2 |
| Marketing-eligible (excludes test/probe + unsubscribed) | ~50 |
| Unsubscribed | 0 |

**Test/probe to exclude from any bulk send**

- `prod-up2-1784133012362@example.com`
- `regression-probe-nonuser@example.com`

**Bounce-risk notes**

- No malformed production addresses in that snapshot.
- Risk is low for format; main historical failure was **sender misconfiguration**, not bad recipient data.
- Still recommend a small test cohort before any blast.

Live counts after deploy: Admin → Emails (audience line) or `GET /api/admin/email-diagnostics`.

---

## 6. Testing checklist (test accounts only)

Complete **after** deploy + Confirm From in Admin diagnostics.

| Test | How | Pass criteria |
|------|-----|----------------|
| Forgot Password | Firebase reset on a test account | Email arrives from Firebase sender |
| Support contact form | Submit support ticket as test user | Admin receives mail From `Little Learner Hub <support@…>` |
| Welcome email | Admin Emails → Send step `welcome` to test inbox | Delivered; not testing-mode error |
| Trial / tips email | Admin Send step `tips` to test inbox | Delivered |
| Notification / explore | Admin Send step `explore` to test inbox | Delivered |

Do **not** run onboarding sweep, weekly digest, or one-time all-users send until content approval.

---

## 7. Re-enable sequence (only after your approval)

1. Confirm diagnostics: `domainMatchesVerifiedTarget: true`, From = canonical support address.
2. Pass all test-account sends above.
3. Rewrite approved templates.
4. Set Render: `EMAIL_AUTOMATIONS_ENABLED=true`.
5. In Admin → Emails, enable only the campaigns you want (onboarding and/or weekly).
6. For a one-time recovery welcome: Run preflight audit → Prepare (no send) → review counts → Send with confirm.
7. Keep recovery banner until you decide to remove it.

---

## 8. Final rule

**No automatic welcome, weekly, drip, or bulk email goes to real users until you approve the content and turn automations on.**
