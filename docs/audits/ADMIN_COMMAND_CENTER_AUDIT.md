# Admin Command Center — Final Audit

Generated: 2026-07-14  
Branch: `cursor/admin-dashboard-user-management-70a5`

## Verdict

Admin is now wired as a **production command center**: live analytics load on unlock, signup profiles sync into the server user store, Founding Member emails become visible user rows, feedback saves + emails Leah, and user management supports plan/trial/founding/disable actions.

---

## What was broken (why you saw all zeros)

1. **Analytics did not load on Admin unlock** — overview/users rendered from an empty cache until a later tab refresh.
2. **Signup did not reliably create server users** — Free accounts could stay browser-only (`llhAccounts`) unless Stripe checkout or analytics events landed.
3. **Founding claim count ≠ user rows** — founding spots could exist without corresponding `store.users` records for Admin lists.
4. **Signup lacked business / account type / role**, so Admin had little identity data even when users existed.

## Fixes shipped

| Area | Change |
|---|---|
| Dashboard | Full user + subscription + activity/growth metric grids; Refresh Data button; Stripe Backfill callout when empty |
| Analytics load | `loadAdminAnalyticsFromBackend()` runs immediately after successful Admin unlock |
| User store | `POST /api/account/profile` creates/updates server users on signup/login and program settings save |
| Founding | `ensureFoundingMemberUserStubs()` materializes founding emails into Admin user rows |
| Users table | Name, email, business, account type, role, plan, status, signup, last active, trial end, usage chips; richer search |
| User details | Account / Membership / Usage tabs; upgrade, downgrade, founding add/remove, extend trial, disable/re-enable |
| Signup | First/Last name, daycare name, account type (Home Daycare / Center / Single Provider), role |
| Feedback | Global “Send Feedback” modal + sidebar/settings/login CTAs; Admin Feedback inbox (New / In Progress / Resolved / Archive + notes) |
| Emails | Feedback submissions notify admin inbox via existing `notifyAdmin()` / Resend-or-SendGrid pipeline |

---

## What data is being tracked

### Always (server store)
- `store.users[]` — identity, plan, Stripe fields, account type/role, business name, last login/seen, featureUsage, accountStatus
- `store.foundingMembers[]` — founding spot claims
- `store.analyticsEvents[]` — page views, signups, logins, checkouts, resource views, button clicks, AI generations, feedback submits
- `store.billingEvents[]` — payment/cancel billing events
- `store.feedbackItems[]` — feedback inbox
- `store.supportTickets[]` — contact/bug/feature tickets
- `store.membershipAudit[]` — admin plan overrides

### Feature-usage event names Admin aggregates
- Lesson views: `resource_view`, `lesson_plan_view`, `curriculum_lesson_view`
- Calendar adds: `lesson_plan_added_to_calendar`, `calendar_lesson_assigned`, `add_to_calendar`
- Observations: `observation_created`, `observation_saved`
- Daily logs: `daily_log_created`, `daily_report_saved`
- Incidents: `incident_report_created`, `incident_report_generated`
- Parent messages / AI: `parent_message_generated`, `ai_generation_success`
- Forms: `form_submitted`, `forms_submitted`

> Counts grow as the client emits these events. Some product flows may still need additional `trackEvent(...)` hooks for complete coverage.

---

## What Admin can see

### Dashboard overview
- Total / Free / Trial / Pro / Founding
- Home Daycare / Center / Single Provider
- Active, Canceling, Canceled, Past Due / Failed Payment
- Active today / week / month
- New users week/month, new founding (30d)
- Lesson views, calendar adds, observations, daily logs, incidents, parent messages, forms
- Open support + open feedback
- Recent accounts + recent activity

### Users
- Search by name, email, business, plan, role, account type
- Filters: All / Free / Trial / Pro / Founding / Canceling / Canceled / Past Due
- Per-user usage chips + detail modal

### Analytics tab
- Visitors, conversion, revenue periods, page views, sources, AI usage, feature usage

### Feedback inbox
- New / In Progress / Resolved / Archived
- User, email, type, subject, message, page, notes

### Support tickets
- Existing ticket workflow (New / In Progress / Complete)

### Stripe Backfill
- Import Stripe customers/subscriptions into `store.users` when Admin looks empty but Stripe has real customers

---

## What Admin can do

- Unlock / lock Admin; Preview as Free / Pro / Founding
- Refresh live analytics
- Open user details
- Upgrade / downgrade plan (internal override; Stripe not auto-changed)
- Add / remove / restore Founding access
- Extend / end trial
- Schedule cancel at period end (internal record)
- Disable / re-enable accounts
- Mark feedback In Progress / Resolved / Archived + admin notes
- Reply/update support tickets
- Run Stripe Backfill
- Manage content CMS, visibility, AI settings (existing)

---

## Verification performed in this branch

Local smoke test against temporary store:

- Admin login → analytics OK
- Profile sync creates Jane Provider (Home Daycare / Owner)
- Founding member emails appear as user stubs
- Feedback submission appears in Admin analytics payload
- Disable account via membership-update OK
- `npm run test:account-access` PASS
- `node --check` on `server/index.js` and `app.js` PASS

Production note after deploy:

1. Unlock Admin on https://little-learner-hub.onrender.com  
2. Confirm Overview counts are non-zero  
3. If still empty while Stripe has customers → **Users → Stripe Backfill**  
4. Submit a test feedback item and confirm inbox + email  
5. Create a test signup and confirm it appears under Users within seconds  

---

## Remaining gaps / future improvements

1. **Per-feature tracking completeness** — some Daily Log / Observation / Form save paths may not yet emit the aggregated event names; add `trackEvent` hooks where missing.
2. **Disable account enforcement** — Admin can mark Disabled; client-side login block for Disabled accounts should be a follow-up.
3. **Screenshot upload** on feedback is intentionally future.
4. **Leads** still primarily local unless separately wired to `store.leads`.
5. **Pagination/export** for very large user lists (CSV export would help at scale).
6. **Stripe vs internal override clarity** — membership buttons remain internal overrides; billing truth still lives in Stripe Customer Portal / Dashboard.
7. **Mobile polish** — feedback modal + admin cards are responsive; continue tightening Admin nav on small phones.

---

## Suggested merge / deploy checklist

1. Merge this PR and deploy to Render  
2. Unlock Admin → Refresh Data  
3. If users missing: run Stripe Backfill once  
4. Confirm Founding count matches paid founding reality  
5. Submit one feedback item end-to-end  
6. Create one new signup and confirm Admin Users shows name, business, type, role  
