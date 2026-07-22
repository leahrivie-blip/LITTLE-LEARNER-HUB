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

## Rules

- Never use this on production  
- Prefer the computer website for all Lab setup work  
- Never paste temporary passwords into docs, tickets, or screenshots  
- Resets only affect validated fake organizations  
- Checklist notes are manual; unchecked items are not automated failures  

## Safety switches

Production keeps `testingLab` OFF regardless of stored flags. Stripe checkout, outbound email/SMS/push, and live AI stay disabled for this workstream.
