# Provider Navigation IA — Route Matrix (after cleanup)

**Branch:** `cursor/provider-nav-ia-cleanup-4eae`  
**Shell (PR, not deployed):** `20260810-provider-nav-ia-cleanup`  
**Deploy status:** NOT DEPLOYED (draft PR only)

## Primary navigation (work-mode testing)

| Role | Visible primary items | Destination views |
|---|---|---|
| Owner | Home, Children, Daily Care, Curriculum, Families, Management, More | `home`, `children`, `child-tools-daily-logs`, `lessons`, `families`, `business`, `more` |
| Director | same as Owner | same |
| Teacher | Today, My Children, Daily Care, Curriculum, Family Messages, More | `today`, `children`, `child-tools-daily-logs`, `lessons`, `home-daycare-hub`(+Family Hub jump), `more` |
| Assistant | Today, Children, Daily Care, Family Messages, More | `today`, `children`, `child-tools-daily-logs`, `home-daycare-hub`, `more` |
| Parent (Switch View) | Family Hub parent shell | `family-hub` (provider work-nav hidden) |

## Hub / action destinations

| Label | Classification | Destination | Back |
|---|---|---|---|
| Daily Care | Primary | Existing Daily Logs system (`child-tools-daily-logs`), chrome renamed | Origin stack / role landing |
| Organize notes with AI | Action | Daily Care → optional AI panel | Daily Care |
| Prepare end-of-day reports | Action | Daily Care → end-of-day / AI report path | Daily Care |
| Write observation / Draft parent message / etc. | Action | Documentation Helpers (`ai`) + type preselect; no child auto-select | Origin |
| Classroom | Hub (More / contextual) | Care-day hub; “Open full Curriculum” only | Origin |
| Family Hub / Messages / Tuition / Licensing | Hub cards | HDH + `data-hdh-jump` subsection focus | Origin |
| Forms / Paperwork HQ | Hub cards | Waves 1–4 surfaces (`forms`, `hdhFormsAttentionPanel`) | Origin |
| Staff & Access | Management | `staff` (merged label) | Management |
| Billing & Subscription | Management | `billing` (LLH SaaS) | Management |
| Family Tuition | Families/Management | `hdhTuitionBillingPanel` (not SaaS) | Origin |

## Contextual Back

Allowlist module: `scripts/nav-origin.js` (`LlhNavOrigin`).  
Never trusts arbitrary return URLs. Work-mode fallback is role landing (`home`/`today`), not Calendar.

## Parent Return

`scripts/multi-role-tester.js` `clearView` → `exitFamilyHubParentPreview` → clear FH session/UI → `setView(workModeLandingView)` without reload.

## Screenshots

`/opt/cursor/artifacts/provider-nav-ia-screenshots/` (desktop + mobile for Owner/Director/Teacher/Assistant/Parent + hubs).

## Explicit non-goals

Wave 5 not started. Production not deployed. PR #590 unmerged. Security #615 remains closed.
