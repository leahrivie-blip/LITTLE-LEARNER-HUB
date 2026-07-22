# Phase 18 — Testing and Preview Lab

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only)  
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

Presets for small/large phone, tablet portrait/landscape, laptop, desktop. Real app UI; dimensions labeled; open-in-tab supported. iframe alone does not claim native-app proof.

## Data reset

Load/reset scenario for validated fake organizations only. Confirm required. Rejects production/`main`/real-looking targets.

## Testing checklist

Manual owner checklist with Pass / Needs Change / Bug / Question / Not Tested notes stored only on the testing organization. Unchecked items are not automated failures.

## Security tests

Production rejection, missing env, non-admin denial, query-token rejection, password not logged, real-target reset rejected, role preview exit, Phase 1–17 smoke.

## Tests

```bash
npm run test:testing-lab-phase18
```

**17 PASS** focused. Full Phase 1–18 regression: **PASS**.

## Screenshots (max 2)

<img alt="Testing Lab dashboard desktop" src="/opt/cursor/artifacts/testing-lab-phase18/1-testing-lab-dashboard-desktop.png" />
<img alt="Device preview phone" src="/opt/cursor/artifacts/testing-lab-phase18/2-device-preview-phone.png" />

No passwords, tokens, or non-`@example.invalid` emails in screenshots.

## Owner guide

`docs/TESTING_PREVIEW_LAB_OWNER_GUIDE.md`

## Safety

Stripe/email/SMS/push/live AI/production storage untouched. `main` untouched.

Latest tip: `9dda2109bcebd447cde6e0af4f1bb60021f25a84` (pushed to `origin/cursor/director-family-foundation-bc66`). Working tree clean after docs stamp. Production and `main` untouched. Phase 19 not started.
