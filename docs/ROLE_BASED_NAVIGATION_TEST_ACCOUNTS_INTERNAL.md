# Test Accounts — Internal / Owner Use Only

**Do not share these email addresses or this file outside the owner/testing team.** No password is ever a fixed string in this system — every password shown below is generated fresh, on demand, and displayed exactly once at the moment of issuance. This file documents the accounts and the exact steps to get a working login for each, not a static credential list.

All accounts below use the `@example.invalid` domain (never resolvable, never a real mailbox) and are rejected outright by the server on any production host — see `docs/ROLE_BASED_NAVIGATION_TESTING_HANDOFF.md` §6.

## Prerequisites (one time, per fresh testing database)

1. Log in as admin: `https://<testing-host>/admin` with your `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ACCESS_CODE`.
2. Open **Testing Lab** from the sidebar (only visible to a verified admin on a non-production host).
3. In **Feature Flags**, ensure `testingLab` is on (required for every route below).

## 1. Admin

Already exists — use your own `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ACCESS_CODE` env vars for this testing service (set on Render, or in a local `.env`).

## 2. Home daycare owner (complete home daycare — NOT a placeholder)

1. Testing Lab → **Accounts** panel → **"Add External Tester — Home Daycare Pilot"**.
2. Enter a tester name and an `@example.invalid` email (e.g. `owner.demo@example.invalid`), choose a starting child count (2–6), submit.
3. Copy the **one-time password** and **welcome message** shown immediately — it will not be shown again. (If you lose it, use "Reissue password" for that account in the same panel.)
4. Log in at the regular site with that email/password. She lands as **Solo Home Daycare Provider** with a real, connected Families/Daily Care/Messages/Forms/Billing roster.
5. To preview the **connected Parent/Guardian** side for the same family: click **Switch Testing Role** in the testing banner → **Parent/Guardian** → pick a guardian from the picker (if more than one) → she now sees the SAME child(ren)/updates/forms/billing the owner just entered.

## 3. Home daycare staff member (optional, one per owner)

Requires the owner's `organizationId` (returned in step 2 above, or via `GET /api/external-tester/list` as admin).

```
POST /api/external-tester/add-staff-member
Authorization: Bearer <admin token>
{ "organizationId": "<owner's organizationId>", "email": "staff.demo@example.invalid", "displayName": "Staff Member" }
```

Returns a one-time `temporaryPassword`. Log in with `staff.demo@example.invalid` — she shares the exact same organization/children as the owner (`role: assistant`, `accountType: home_daycare`), with no ownership/billing-settings/staff-invite capability. There is currently no Testing Lab UI button for this — use the API call above (or `curl`) until one is added.

## 4. Center director & 5. Center teacher

1. Testing Lab → **Scenarios** → seed **Small Center** (or Growing/Large Center) if not already seeded for this store.
2. In **Accounts**, find:
   - `phase8.director@example.invalid` (Director) — click **Issue password**.
   - `phase8.teacher@example.invalid` (Lead Teacher) — click **Issue password**.
3. Log in with either email + the one-time password shown. Both now also have connected `/api/pilot/*` access to their own organization's Families/Daily Care/Messages/Forms/Billing, in addition to their existing core-app Classrooms/Staff/Reports/Settings navigation.

Additional pre-seeded staff-adjacent accounts from the same scenario, if useful: `phase8.assistant.broad@example.invalid`, `phase8.assistant.limited@example.invalid`, `phase18.teacher@example.invalid`, `phase18.substitute@example.invalid`.

## 6. Parent / Guardian connected to a real child

From the SAME seeded scenario (step 4.1 above):

- `priya.lin@example.invalid` — guardian of **Ava Lin** and **Ben Lin** (full verified guardian, financially responsible).
- `frank.cole@example.invalid` — guardian of **Dana Cole** (full verified guardian).
- `sam.shared@example.invalid`, `grace.cole.restricted@example.invalid`, `pat.pickup@example.invalid` — additional guardian permission-level variations (shared custody, restricted/no-digital-access, pickup-only) if you need to test access-level differences specifically.

Issue a password the same way (Testing Lab → Accounts → find the email → **Issue password**), then log in. She lands directly in **Family Hub** (Phase 9) — a real, working parent experience, not a placeholder — and (with this task's generalization) `/api/pilot/parent-home` also works for her if you want to view the pilot-style aggregated home screen instead.

## Resetting / re-testing

- **Reissue any password** any time from the same Testing Lab Accounts panel — the previous password stops working immediately.
- **Suspend / reactivate / end** any account from the same panel.
- **Reset fake data for a Home Daycare Pilot organization**: `POST /api/external-tester/reset-fake-data` with `{ organizationId, confirm: true }` as admin — clears children/guardians/updates/messages/forms/billing/photos for that org only, and NEVER touches Testing Feedback threads or the audit trail.
- The Phase 8 fixture organization (director/teacher/parents above) can be reset via Testing Lab's **Scenarios** panel "Reset" action.
