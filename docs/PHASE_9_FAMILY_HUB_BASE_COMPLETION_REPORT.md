# Phase 9 — Responsive Family Hub Base

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only)  
**Date:** 2026-07-22  
**Started from tip:** `ab61b776711488f23930f10646b733a578dc73c2`

## What changed

Built a mobile-first Family Hub so approved fake parents/guardians can log in and use Home, Children, Forms, Calendar, and Account. Photos/media, messaging/notifications delivery, and billing remain deferred.

## Files changed

| Path | Role |
|------|------|
| `scripts/expansion-feature-flags.js` | Family Hub testing-preview gate (`ALLOW_FAMILY_HUB_TESTING_PREVIEW`); production still locked |
| `scripts/family-hub-data-model.js` | Family-visible documents, change requests, notification preference structure, calendar events |
| `scripts/family-hub-fixtures.js` | Phase 9 fake docs/events/change requests on Phase 8 fixtures |
| `server/family-hub-api.js` | `/api/family-hub/*` home/children/forms/docs/calendar/account |
| `server/index.js` | Mount Family Hub; feature-flag viewer for guardians |
| `family-hub-ui.js` | Mobile bottom nav + desktop sidebar UI |
| `app.js` / `index.html` / `styles.css` | View wiring + responsive layout |
| `scripts/test-family-hub-phase9.js` | Focused Phase 9 suite |
| `scripts/capture-family-hub-phase9-screens.js` | Two essential screenshots |
| Phase 1/4/8 test updates | Reflect testing-preview (not forever forced-off) semantics |

## Preview-gate behavior

Family Hub is allowed only when **all** are true:

1. Non-production testing host  
2. `ALLOW_FAMILY_HUB_TESTING_PREVIEW=true`  
3. Stored `familyHub=true`  
4. Authenticated fake guardian (member session)  
5. Active child-specific access for the requested child  

Production rejects Family Hub even if the stored flag is accidentally enabled. Query-string tokens are rejected.

## Navigation and responsive design

- Phone: bottom nav — Home, Children, Forms, Calendar, Account (max five)  
- Tablet/computer: simple sidebar with the same destinations  
- No Messages, Media, or Billing nav; small roadmap note only  

## Child switching

Supports one-child, siblings, shared-household, different per-child permissions, restricted/suspended/ended. Changing the selected child refreshes every screen and server request (`childId` query + `x-llh-selected-child-id`). Altered/cached IDs cannot escalate access.

## Forms, documents, calendar, account

- **Forms:** Phase 6 assignments — filter, open, draft, correct, sign/submit, document/snapshot view  
- **Documents:** family-visible only; upload goes to pending provider review (never auto-approved)  
- **Calendar:** family-visible program/classroom events and shared theme titles only  
- **Account:** profile, children/access, household contacts, change requests (provider review), notification preference structure (nothing sent), password change, sign out  

## Restricted guardian enforcement

Pickup-only, emergency-only, no-digital, suspended, and ended relationships are denied server-side with a neutral unavailable message. Forbidden controls are not merely hidden.

## Tests and screenshots

```bash
npm run test:family-hub-phase9
```

**21 PASS** focused suite. Full Phase 1–9 regression run once before completion.

<img alt="Family Hub Home phone" src="/opt/cursor/artifacts/family-hub-phase9/1-family-hub-home-phone.png" />
<img alt="Family Hub Forms or Child desktop" src="/opt/cursor/artifacts/family-hub-phase9/2-family-hub-forms-or-child-desktop.png" />

1. Phone — Home with child switching and Action Needed  
2. Computer — Forms or Child view  

## Deferred

- **Phase 10:** photos, videos, detailed daily updates, family sharing  
- **Phase 11:** full messaging and notification delivery  

## Handoff confirmations

- Branch: `cursor/director-family-foundation-bc66`  
- Latest tip: see `git log -1 --oneline` after push  
- Pushed to `origin/cursor/director-family-foundation-bc66`  
- Working tree clean after push  
- Production Family Hub remains locked; `main` untouched  
- Phase 10 not started  
