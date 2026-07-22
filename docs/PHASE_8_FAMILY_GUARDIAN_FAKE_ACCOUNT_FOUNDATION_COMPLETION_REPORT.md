# Phase 8 — Family, Guardian, Household, and Safe Fake-Account Foundation

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only)  
**Date:** 2026-07-22  
**Started from tip:** `adbddca`

## What changed

Built the secure identity and relationship foundation for future parent accounts and Family Hub — without building the Family Hub product UI.

Owners/directors can manage households, guardians/contacts, child-specific access, invitations (no real messages), and resettable `@example.invalid` fake accounts inside Director Center → **Families**. Guardians who log in see a Family Hub OFF placeholder. All enforcement is server-side.

## Files changed

| Path | Role |
|------|------|
| `scripts/family-foundation-data-model.js` | Households, contacts, access rules, invitations, fake accounts, audit, merge reviews |
| `scripts/family-foundation-fixtures.js` | Resettable Phase 8 fake households/guardians/access scenarios/fake accounts |
| `scripts/family-invitation-tokens.js` | Hashed, expiring, revocable invitation tokens (header-based) |
| `scripts/org-permissions.js` | Family manage actions + foundation access-rule child scope |
| `server/family-foundation-api.js` | Director family APIs + guardian session + production locks |
| `server/index.js` | Mount routes; reject fake-account login on production |
| `family-foundation-ui.js` | Director Families tab + guardian-session placeholder |
| `director-center-ui.js` | New **Families** tab |
| `app.js` | Render guardian-session placeholder view |
| `index.html` | View mount + script include |
| `styles.css` | Families / guardian placeholder layout |
| `scripts/test-family-foundation-phase8.js` | Focused Phase 8 suite |
| `scripts/capture-family-foundation-phase8-screens.js` | Two essential screenshots |
| `package.json` | `test:family-foundation-phase8` + syntax-check entries |

## Household and guardian relationships

- Permanent IDs for organization, household, contact, child, access rule, invitation, user account, fake account.
- Supports siblings in one household, multiple guardians per child, child in multiple households (shared-custody notes are provider-entered — not legal determinations).
- Contacts mirror into existing foundation guardians / relationships for Phase 6 form compatibility.
- Relationships are ended/suspended with history retained — never silently deleted.

## Access levels

Configurable child-specific levels: full verified, limited, forms-only, messages-only, billing-only foundation, pickup-only, emergency-contact-only, no digital, temporarily suspended, ended.

Server checks every contact↔child capability. One guardian may have different permissions per child. Pickup-only / emergency-only / suspended / ended / no-digital do not grant digital/forms scope.

## Invitation foundation

Create → review access → generate expiring token (shown once) → revoke → regenerate → accept in approved testing mode → link accepted account to permanent contact ID. No email/SMS. No query-string auth. Tokens stored as hashes only.

## Fake-account security

- `@example.invalid` only; banner **Testing Account — Fake Data Only.**
- No hardcoded reusable passwords in source, fixtures, tests, or docs.
- Admin issues/resets a temporary password once; normal password login required afterward.
- Production rejects fake-account creation/login and testing invitation accept.
- Resetting fake org data does not alter other organizations or the admin’s real role.

## Existing feature connections

- Child Profiles, classrooms, form assignments/responses/signatures/document snapshots remain intact.
- Changing classrooms does not break family relationships.
- Removing current access does not erase previously submitted forms or program records.
- Family Hub flag remains forced OFF.

## Test results

```bash
npm run test:family-foundation-phase8
```

**36 PASS** — cross-org denial, wrong-child, siblings/multi-household, restricted/pickup/emergency/suspended/ended, revoked/expired invitations, altered IDs, parent vs staff API denial, fake-account production rejection, Family Hub OFF, history preservation.

Full regression (Phases 1–8 + platform/account) run once before completion — all suites PASS, zero failures (Phase 8 focused suite 36/36).

## Screenshots

<img alt="Household and guardian management desktop" src="/opt/cursor/artifacts/family-foundation-phase8/1-household-guardian-management-desktop.png" />
<img alt="Guardian account placeholder mobile" src="/opt/cursor/artifacts/family-foundation-phase8/2-guardian-placeholder-mobile.png" />

1. Desktop — household/guardian management in Director Center Families  
2. Phone — fake guardian Family Hub OFF placeholder  

## Deferred

- **Phase 9:** complete Family Hub interface / parent product surfaces  
- **Phase 18:** complete Testing and Preview Lab (quick role preview foundation only here)

## Handoff confirmations

- Branch: `cursor/director-family-foundation-bc66`  
- Latest tip: see `git log -1 --oneline` on this branch after push  
- Pushed to `origin/cursor/director-family-foundation-bc66`  
- Working tree clean after push  
- Family Hub remains OFF  
- Production and `main` untouched  
- Phase 9 not started  
