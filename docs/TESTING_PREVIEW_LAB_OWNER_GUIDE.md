# Testing and Preview Lab — Owner Guide

**Audience:** Approved testing administrators  
**Environment:** Non-production only  
**Flag:** `testingLab=true` + `ALLOW_TESTING_LAB_ADMIN_PREVIEW=true`

## Open the lab

1. Unlock Admin on the testing site  
2. Open **Testing Lab** from the Admin bar (or `#testing-lab`) on a **computer**  
3. Confirm the banner: **Private Testing Environment — Fake Data Only**

**Phone note:** On small/large phones the Lab shows a status summary only (“Testing Lab is computer recommended”). Scenario setup, fake accounts, role preview controls, resets, and device testing stay on the computer website. Phone may show current fake org/scenario, role-preview status, Exit Role Preview, and Return to the normal app — never passwords or tokens.

## Quick start

1. **Quick start (Small Center)** on Home — loads Phase 1–17 fake data  
2. **Accounts** — select a fake user → **Issue password** → copy once → use normal login  
3. **Role Preview** — quick UI checks without changing your admin role → **Exit Preview** when done  
4. **Device Preview** — pick a viewport; open in a real tab if needed  

## Release Readiness (Phase 20)

On a **computer**, open **Release Readiness** in the Lab for:

- Branch / environment identity and storage mode  
- External-service kill switches and feature flags  
- Security checklist summary (not a certification claim)  
- Migration readiness, fake-data confirmation, production locks  
- Known blockers and the manual owner-testing checklist  

**Phone:** shows a clear status summary and “Computer Recommended” — not the full desktop readiness UI.

## Migration simulator (Phase 20)

On a **computer**, open **Migration**:

1. **Inspect** legacy testing records (read-only)  
2. **Preview** create / update / skip / flag outcomes and export a sanitized report  
3. Type confirmation and **Apply** only to a validated fake testing organization  
4. Use **Rollback simulation** / **History** as needed  

Never run against production or real organizations. Production rejects these endpoints.

## Rules

- Never use this on production  
- Prefer the computer website for all Lab setup work  
- Use **Health** for storage/flag/external-service status and sanitized failed-save counts  
- Use **Data Controls** fake backup/restore simulation only on confirmed fake organizations (preview before confirm)  
- Use **Release Readiness** and **Migration** only with fake testing data  
- Never paste temporary passwords into docs, tickets, or screenshots  
- Resets and migrations only affect validated fake organizations  
- Checklist notes are manual; unchecked items are not automated failures  
- Accessibility, performance, and security Lab checklists are testing aids — not formal certification  

## Safety switches

Production keeps `testingLab` OFF regardless of stored flags. Stripe checkout, outbound email/SMS/push, and live AI stay disabled for this workstream. Migration and readiness mutation endpoints must remain rejected in production.
