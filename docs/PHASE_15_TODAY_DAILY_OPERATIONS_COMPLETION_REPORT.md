# Phase 15 — Today Hub and Daily Operations Center

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only)  
**Date:** 2026-07-22  
**Started from tip:** `94bc315fd4f9dc63eeebf57f4215f821c2480e64`

## What changed

Role-specific **Today Hub** answering “What do I need to do right now?” with attendance foundation, provider-configured ratio monitoring (no compliance claim), task aggregation by secure refs (no record duplication), and in-app notifications only.

## Files

| Path | Role |
|------|------|
| `scripts/today-hub-data-model.js` | Attendance (append-only history), ratio config/eval/disclaimer, incidents, med tasks, notifications, task cards |
| `scripts/today-hub-fixtures.js` | Resettable fake scenarios (ratio, absent/late/move, pickup, med, incident, notifications) |
| `server/today-hub-api.js` | `/api/director-center/today/*` |
| `server/family-hub-api.js` | `GET /api/family-hub/today` + home `todayAttendance`; seed Phase 15 |
| `today-hub-ui.js` | Director Today tab + `data-feature-marker="phase15-today-hub"` |
| `family-hub-ui.js` | Home Today card + Today tab (`phase15-family-today`); Account → More |
| `director-center-ui.js` | `today_hub` tab + mount |
| `styles.css` | `.th-*` responsive (phone / tablet / computer) |
| `scripts/test-today-hub-phase15.js` | Focused suite |
| `scripts/capture-today-hub-phase15-screens.js` | ≤2 screenshots; fails without marker / on homepage |

## Role-based Today views

| Role | Behavior |
|------|----------|
| Owner / Director | Org-wide attendance, classrooms, ratios, staff on duty, aggregated tasks (forms/records/licensing/enrollment/messages/daily/incidents/med/calendar), quick actions |
| Teacher / Lead | Assigned classrooms only; roster, ratio, incomplete Daily Reports, med/allergy (permitted), incidents, messages, quick logs |
| Assistant | Assigned classrooms; actions limited (`check_in` / `mark_absent` / group log); medical/allergy only with permission override |
| Parent / Guardian | Permitted children only: check-in status, shared Daily Report, forms/docs/messages/calendar/enrollment; restricted/pickup/emergency follow Phase 8–9 rules |
| Curriculum Only | Curriculum/lesson actions only — center operations denied |

## Attendance and ratio

- Statuses: expected, checked in, absent, late, temporarily out, moved classroom, checked out, early pickup  
- Stores timestamps, classroom, actor, drop-off/pickup person, pickup verification, correction reason, **append-only edit history** (never silent overwrite)  
- Ratio: provider-configured max children/staff + near-limit threshold; statuses in / near / out / coverage needed  
- Disclaimer: *“Ratio status is based on provider-configured rules for this program. It is not a universal state compliance certification.”*

## Task aggregation

Tasks are **references** to Phase 11–14 records (forms, records, licensing, enrollment, messages, daily logs, incidents, medication, calendar, staff/ratio). Deduped by source + sourceRefId + href + childId. Cards open deep links to the exact permitted item or filtered list.

## Permissions

Server-enforced on every Today Hub and attendance action. Production preview rejected. Cross-org attendance denied (404/403). Admin-only notifications never reach teachers/guardians. Family notifications stay family-scoped.

## Responsive

- **Phone:** Today summary, attendance, quick actions, task sections; Computer Recommended for org-wide filters / ratio history  
- **Tablet:** Classroom roster + moderate oversight  
- **Computer:** Org-wide classroom + task summaries  

No horizontal overflow; metrics/roster wrap on phone.

## Tests

```bash
npm run test:today-hub-phase15
```

**17 PASS** focused (role dashboards, attendance history, transfers, pickup auth, ratios + disclaimer, task dedupe, deep links, teacher/assistant/curriculum/guardian/restricted, notification isolation, responsive markers, production rejection, Phase 12–14 smoke).

Full Phase 1–15 regression: **PASS** (foundation through Phase 15 + platform-nav + account-access).

## Screenshots (max 2)

<img alt="Teacher Today Hub phone" src="/opt/cursor/artifacts/today-hub-phase15/1-today-hub-teacher-phone.png" />
<img alt="Director Today Hub desktop" src="/opt/cursor/artifacts/today-hub-phase15/2-today-hub-director-desktop.png" />

## Deferred

- Staff scheduling / shift planning  
- Live billing / Stripe enrollment  
- External email / SMS / push  
- Live AI / production storage  
- Universal state ratio compliance (never claimed)  
- Phase 16 (not started in this commit)

## Safety

Production Family Hub locked. `main` untouched. Fake data only. No merge/deploy.

Latest tip after push: `git rev-parse origin/cursor/director-family-foundation-bc66`
