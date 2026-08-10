# Provider Navigation IA Inventory (Testing)

**Phase:** Between Forms Wave 4 and Wave 5 — cleanup only  
**Shell baseline at inventory:** `20260810-tester-invite-login-fix7` (pre-deploy; this PR does not deploy)  
**Date:** 2026-08-10  

## Confirmed root causes (before edits)

| Issue | Root cause | Key symbols |
|---|---|---|
| Daily Logs / Daily Logs AI / EOD feel like separate products | Hub tiles all `data-view="child-tools-daily-logs"` with different titles; no action params | `renderOwnerHomeDashboard`, `renderClassroomHubPage`, `renderTeacherToday` |
| Documentation Helpers repeats | Same `view:"ai"` tile on Home, Classroom, Families, Today, More | `workHubTile({ view: "ai" })` |
| Back → Calendar | `navigateContextualBack` / `fallbackBackLabel` / category pages default logged-in fallback to `calendar` | `navigateContextualBack` (~26465), `platformBackView`, Activity/Curriculum back buttons |
| Classroom duplicates Curriculum | Classroom hub embeds Lesson Plans / Activity Center / Calendar | `renderClassroomHubPage` |
| Families tiles → same giant HDH | Multiple labels share `home-daycare-hub`; jumps exist but incomplete (Licensing etc.) | `renderFamiliesHubPage`, `data-hdh-jump` |
| Staff vs Users & Access | Both open `staff` | `renderBusinessHubPage` |
| “This is your own Teacher space” | Hard-coded for independent HDH tester | `renderHomeDaycareTesterGuidePanel` |
| Parent → Return leaves FH login | `clearView()` clears storage + persona but does **not** clear FH session / unmount / `setView` landing | `scripts/multi-role-tester.js` `clearView` |
| Activity overload | Filtered Activity Center maps **all** matching cards with no page size | `renderCategoryPage` Activity Center branch |
| Curriculum overload | Browse rows + collections render large overlapping sets on first paint | `buildLessonBrowseRows` / `useBrowseRows` |

## Current primary work-nav (testing, `data-work-nav-root`)

| Role | Current items → views |
|---|---|
| Owner / Director | Home→`home`, Children→`children`, Classroom→`classroom`, Curriculum→`lessons`, Families→`families`, Management→`business`, Settings→`settings` |
| Teacher | Today→`today`, My Children→`children`, Classroom→`classroom`, Curriculum→`lessons`, Families→`families`, More→`more` |
| Assistant | Today→`today`, Children→`children`, Classroom→`classroom`, Family messages→`home-daycare-hub`, More→`more` |
| Parent (Switch View) | Family Hub shell (`family-hub`); provider work-nav hidden via `isFamilyHubParentMode` |

Legacy nav (`data-legacy-nav`) still present but hidden when work-mode on: Calendar, Lesson Plans, Activities, Daily Logs, Child Profiles, Documentation Helpers, etc.

## Target primary navigation

| Role | Target |
|---|---|
| Owner / Director | Home · Children · **Daily Care** · Curriculum · Families · Management · **More** |
| Teacher | Today · My Children · **Daily Care** · Curriculum · **Family Messages** · More |
| Assistant | Today · Children · **Daily Care** · Family Messages · More |
| Parent | Today · Reports · Photos · Messages · Calendar · Forms · More *(Family Hub parent shell; preserve existing FH panels)* |

## Destination map (proposed)

| Label | Classification | Destination | Notes |
|---|---|---|---|
| Daily Care | Primary navigation | `child-tools-daily-logs` | Rename chrome; AI + EOD = actions inside |
| Organize notes with AI | Contextual action | Daily Care + AI mode / optional AI panel | Not a separate nav product |
| End-of-Day Report | Contextual action | Daily Care daily-report tab / Generate Daily Reports | Not a separate nav product |
| Documentation Helpers | One tool + contextual actions | `ai` + `data-quick-doc-type` | Preselect type; no child auto-select |
| Classroom | Hub (not primary for Owner) | Care-day hub; “Open full Curriculum” action | Remove curriculum directory duplication |
| Family Hub | Hub card | `home-daycare-hub` + `hdhFamilyHubPanel` | Deep-link + focus |
| Family Messages | Primary (Teacher/Assistant) / hub card | `home-daycare-hub` + family messages panel | |
| Family Tuition | Hub card | `hdhTuitionBillingPanel` | Copy: not LLH SaaS billing |
| Licensing Helpers | Hub card | HDH trainings/packets jump | |
| Forms / Paperwork | Hub card | Waves 1–4 surfaces (`forms`, Paperwork HQ jumps) | No new Forms system |
| Staff & Access | Management card | `staff` | Merge Staff + Users & Access labels |
| Billing & Subscription | Management | `billing` | LLH membership only |
| More | Primary | `more` | Settings, Message Support, Resources, Classroom (secondary), Doc Helpers |

## Return origin allowlist (proposed)

`today`, `home`, `classroom`, `child-tools-daily-logs` (Daily Care), `lessons` (Curriculum), `families`, `business` (Management), `more`, `children`, `activities`, `ai`, `home-daycare-hub`, `settings`, `staff`, `reports`

Never: arbitrary URLs. Never default Calendar for logged-in work-mode.

## Forms Waves 1–4 / invite login

- Do not alter assignment APIs, idempotency, Family Hub isolation, AI review-before-save.
- Tester invite FSM + auth network priority must remain intact (`completeTesterInviteCredentialFlow`, `beginAuthNetworkPriority`).

## Out of scope

Wave 5, production deploy, curriculum content/publish, billing logic, Teaching Kit flags, PR #590 merge.
