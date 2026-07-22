# Phase 12 — Enrollment

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only; feature not yet committed at doc write time)  
**Date:** 2026-07-22  
**Started from tip:** `b69707e`

## What changed

Built a provider Enrollment pipeline (inquiry → tour → application → waitlist/offer → forms → enrolled) with Family Hub checklist/offer views. Fake/testing only: no public production inquiries, no Stripe checkout, no outbound email/SMS/push. Capacity is advisory (`canAutoPlace: false`); conversion is director-confirmed with duplicate warnings and permanent household/contact/child IDs.

**Family Hub nav decision:** Enrollment is opened from Home (`tab=enrollment` / deep links) — not a sixth bottom-nav item — so Messages stays in the max-five nav. See `docs/OVERNIGHT_DECISIONS_AND_BLOCKERS.md`.

## Files changed

| Path | Role |
|------|------|
| `scripts/enrollment-data-model.js` | Pipeline stages, waitlist/offers/packets/capacity/conversion/audit |
| `scripts/enrollment-fixtures.js` | Resettable fake cases across stages |
| `server/enrollment-api.js` | Provider `/api/director-center/enrollment/*` |
| `server/family-hub-enrollment-handlers.js` | Family Hub `/api/family-hub/enrollment/*` (family-safe views) |
| `server/family-hub-api.js` / `server/index.js` | Mount + seed/status wiring |
| `enrollment-ui.js` | Director Center **Enrollment** tab |
| `director-center-ui.js` / `family-hub-ui.js` / `index.html` / `styles.css` | Wiring + Home → Enrollment entry |
| `scripts/test-family-enrollment-phase12.js` | Focused suite (**19 PASS**) |
| `scripts/capture-enrollment-phase12-screens.js` | Two screenshots |
| `package.json` | `test:family-enrollment-phase12` + `check` paths |

## Pipeline / waitlist

Stages cover inquiry through enrolled/withdrawn/declined/expired/archived. Waitlist updates keep history; priority is director-reviewed (`noAutomaticDiscriminatoryDecisions`). Families never see other applicants, internal priority rules, subsidy notes, or capacity guidance.

## Applications / offers

Enrollment packets track form items (approve/return preserves form version + signatures). Offers are testing-only; accept/decline records `stripeCheckoutUsed: false`. Real Stripe respond paths return `400 stripe_disabled`.

## Conversion

`conversion/preview` → `conversion/confirm` (directors/owners only). Duplicate warnings block confirm without acknowledgment; history preserved; permanent IDs returned; stage → `enrolled`.

## Permissions

No dedicated `docs/PERMISSIONS*` file. Notes:

- Directors/owners: full enrollment manage + conversion  
- Assistants: denied by default  
- Teachers: denied unless limited grant; offer/priority actions need offer grant  
- Curriculum Only: denied  
- Cross-org cases never listed  
- Family Hub: own-case checklist only; pickup-only/emergency-only denied for digital enrollment; internal notes never exposed  
- Production Family Hub enrollment locked  

## Tests and screenshots

```bash
npm run test:family-enrollment-phase12
```

**19 PASS** focused.

Screenshots (paths):

- `/opt/cursor/artifacts/enrollment-phase12/1-provider-enrollment-pipeline-desktop.png`
- `/opt/cursor/artifacts/enrollment-phase12/2-family-enrollment-checklist-phone.png`

Capture: `node scripts/capture-enrollment-phase12-screens.js`

## Deferred

- Live Stripe enrollment checkout / deposits  
- Public production inquiry intake  
- Live email/SMS/push for enrollment events  
- Phase 13+ work  

## Handoff confirmations

- Branch: `cursor/director-family-foundation-bc66`  
- Authoritative tip after push: `git rev-parse origin/cursor/director-family-foundation-bc66` (must match local `HEAD`; clean tree)  
- Feature not yet committed at doc write; tip SHA set after push via `git rev-parse`  
- Working tree not clean until feature + docs are committed/pushed  
- Production Family Hub locked; `main` untouched  
- Phase 13 not started (this report is Phase 12 only)  
