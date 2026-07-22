# Phase 18 — Testing and Preview Lab

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only) — mobile completion check done  
**Date:** 2026-07-22  
**Started from tip:** `13c7878`

## Access gates

Requires non-production host + `ALLOW_TESTING_LAB_ADMIN_PREVIEW` + stored `testingLab=true` + verified admin Bearer. Production rejects UI/APIs, fake-account creation, role preview, scenario seeding, password reset, device sessions, and resets. Query-string tokens rejected. Permanent banner: “Private Testing Environment — Fake Data Only”.

## Fake accounts

Resettable `@example.invalid` accounts for owner/director/teachers/assistants/substitute/guardian types/plan orgs. Real password-login flow; admin issues temporary password once (never in fixtures, logs, screenshots, or reports). Revoke session / reset supported.

## Quick Role Preview

Temporary preview sessions with expiry and exit. Does not change the administrator’s stored role. Uses real permission headers (`x-llh-role-preview-membership-id`). Actual Fake Login remains available for end-to-end auth.

## Scenarios

Packs: Home Daycare, Small/Growing/Large Center, Curriculum Only, Founding Member. Orchestrates Phase 1–17 fixture seeds. Feature-state labels for empty/limit/error/restricted/billing/licensing/etc.

## Device Preview

Presets for small/large phone, tablet portrait/landscape, laptop, desktop. Real app UI; dimensions labeled; open-in-tab supported. iframe alone does not claim native-app proof. **Device Preview controls live only in the computer Lab** — they are not the phone website experience.

## Computer-first + intentional phone summary

The complete Testing Lab is **computer recommended** and remains available on computer viewports. Phones (~360–430px) do **not** attempt to fit the full Lab. Instead they show a clean intentional summary:

- Banner: Private Testing Environment — Fake Data Only  
- “Testing Lab is computer recommended”  
- Short explanation that scenario setup, fake-account management, role preview controls, resets, and device testing should be completed on the computer website  
- Current fake organization / scenario when safe  
- Role-preview status when active, plus **Exit Role Preview** when applicable  
- **Return to the normal app**  
- No secrets, passwords, tokens, desktop tables, or unsafe Lab admin controls  

Verified at approximately **360px, 390px, and 430px**: no horizontal overflow, no clipped text, no overlapping controls, no tiny desktop tables, no inaccessible buttons, no exposed credentials.

## Data reset

Load/reset scenario for validated fake organizations only. Confirm required. Rejects production/`main`/real-looking targets.

## Testing checklist

Manual owner checklist with Pass / Needs Change / Bug / Question / Not Tested notes stored only on the testing organization. Unchecked items are not automated failures.

## Security tests

Production rejection, missing env, non-admin denial, query-token rejection, password not logged, real-target reset rejected, role preview exit, Phase 1–17 smoke. Phone summary checks assert no visible Lab password/token UI.

## Tests

```bash
npm run test:testing-lab-phase18
```

**18 PASS** focused (includes `phone_mobile_summary_360_390_430`). Full Phase 1–18 regression: **PASS**.

## Screenshots (max 2)

<img alt="Testing Lab dashboard desktop" src="/opt/cursor/artifacts/testing-lab-phase18/1-testing-lab-dashboard-desktop.png" />
<img alt="Testing Lab intentional phone summary" src="/opt/cursor/artifacts/testing-lab-phase18/2-testing-lab-mobile-summary-phone.png" />

Desktop screenshot kept from the valid computer capture. Incorrect phone device-preview capture replaced with the intentional mobile summary only. No passwords, tokens, or non-`@example.invalid` emails in screenshots.

## Owner guide

`docs/TESTING_PREVIEW_LAB_OWNER_GUIDE.md`

## Safety

Stripe/email/SMS/push/live AI/production storage untouched. `main` untouched. Phase 19 not started.

Latest tip: `4e3aeda4917c99a20979ba4284bfa37c3328c377` (pushed to `origin/cursor/director-family-foundation-bc66`). Working tree clean after docs stamp. Production and `main` untouched. Phase 19 not started.
