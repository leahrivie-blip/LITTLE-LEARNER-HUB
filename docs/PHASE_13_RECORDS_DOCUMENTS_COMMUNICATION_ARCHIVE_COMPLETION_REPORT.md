# Phase 13 — Records, Documents, and Communication Archive

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete for backend/permissions; **responsive + screenshots remediated 2026-07-22** (see `docs/PHASE_12_14_REMEDIATION_COMPLETION_REPORT.md`)  
**Date:** 2026-07-22  
**Started from tip:** `80effb47ce0866ab0287e503d3cfee24cb7235cc`

## What changed

Added a Director Center **Records Center** with authoritative master records, unfiled inbox, manual filing, missing/expiring tracking, profile connections, communication archive references (Phase 11 source of truth), unified timeline references, and Family Hub family-visible documents. Fake files only; no production storage, public URLs, OCR/AI, or outbound delivery.

## Files changed

| Path | Role |
|------|------|
| `scripts/records-center-data-model.js` | Records, files, categories, retention, timeline |
| `scripts/records-center-fixtures.js` | Fake fixtures (unfiled, medical, staff CPR, custody, drills, supersede, archive, message refs) |
| `server/records-center-api.js` | `/api/director-center/records/*` |
| `server/family-hub-records-handlers.js` | Family Hub records list/upload |
| `records-center-ui.js` | Director Records tab + `data-feature-marker="phase13-records"` |
| `styles.css` | Real `.rc-*` responsive rules (computer-first bulk filing) |
| `scripts/test-records-center-phase13.js` | Focused suite (**27 PASS**) |
| `scripts/capture-records-center-phase13-screens.js` | Two screenshots (marker-asserted) |

## Records Center and filing

Overview summary cards, Unfiled Inbox upload/file/reject/archive, starter categories, permission-aware search/filters. Manual filing works without AI/OCR (future suggestion hook only).

## Profile connections / missing / communication archive

Records link to child/guardian/household/staff/classroom/enrollment via permanent IDs. Missing/expiring from configured expected types. Communication archive shows secure refs to Phase 11 conversations (no message copies).

## Permissions and file security

Server-side confidentiality levels; teachers/assistants limited; guardians see family-visible only; pickup/curriculum denied patterns; private authenticated file access; allowlist + executable rejection; `publicUrl: null`.

## Responsive (remediated)

- Full Records Center / bulk filing remains **computer-first**
- Phone shows summaries + Computer Recommended; does not squeeze the full bulk-filing UI
- Tablet layout verified in remediation suite (no tablet screenshot required)

## Tests and screenshots

```bash
npm run test:records-center-phase13
npm run test:phase12-14-remediation
```

**27 PASS** focused. Remediation **24 PASS**.

Valid screenshots:

<img alt="Records Center overview desktop" src="/opt/cursor/artifacts/records-center-phase13/1-records-center-overview-desktop.png" />
<img alt="Family documents phone" src="/opt/cursor/artifacts/records-center-phase13/2-family-documents-phone.png" />

Earlier homepage-identical PNGs were invalid and have been replaced.

## Deferred

- AI/OCR filing suggestions  
- Production cloud storage  
- External reminder delivery  
- Phase 15 (not started)  

## Handoff confirmations

- Latest tip: `git rev-parse origin/cursor/director-family-foundation-bc66`  
- Production Family Hub locked; `main` untouched  
- Responsive/screenshot completeness claimed only after remediation  
