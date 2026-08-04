# Smart Automation Pass — Deliverables

**Environment:** Testing site only (`HOME_DAYCARE_HUB_TESTING`)  
**Branch:** `cursor/smart-automation-d3df`  
**Shell:** `20260804-smart-automation`  
**Acceptance:** `npm run test:smart-automation`  
**Do not merge. Do not deploy production.**

Nav role experience was merged to `main` first (`09615e2`), then this pass was built on top.

---

## Every new automatic connection added

| Trigger | Automatic updates |
|---|---|
| **Child created** | Timeline “Child enrolled”; HDH forms pack folder (12 forms); readiness markers (observations/goals/daily reports/docs); Family Hub household link (existing); ops alert “child is set up” |
| **Attendance** | Timeline (existing Attendance entries); Family Hub Today when shared (existing, silent — no push); Owner/Teacher home pulse + classroom count/ratios refresh |
| **Meal logged** | Timeline/history (existing); Family Hub Today when shared (silent); home/today pulse refresh; feeds grounded EOD AI facts |
| **Observation** | Timeline (existing); quiet goal suggestion; Family Hub notify when shared; ops alert when shared; main child form now uses `appendChildRecord` (was bypassing notify) |
| **Incident** | Internal Documents “on file”; parent message draft; behavior history note; child timeline; director/owner ops alert (`incident_review`) |
| **Parent signs form** | Status mirror (existing); child timeline Forms entry; ops alert; clears matching overdue noise; refreshes Owner Home / Families when open |
| **Photo uploaded** | Profile + timeline + Family Hub gallery/Today + notify when shared (existing paths kept; no duplicate system event) |
| **Lesson assigned** | Classroom calendar (existing); timeline on roster children; Teacher Today / Owner Home lesson card; ops alert; Daily Logs already shows `weekLessonForChild` |

Central fan-out: `appendChildRecord` → `runSmartAutomationForRecord` (testing fence only).

---

## Every duplicate workflow removed / reduced

| Duplicate | Change |
|---|---|
| Observation form vs Daily Logs / notify path | Child observation form now saves through `appendChildRecord` (or explicit notify + automation on edit) |
| Manual HDH pack assign after every new child | Auto-runs `addAllHomeDaycarePackFormsToChild` on create |
| Incident → separately filing doc + drafting parent note | One incident save creates document, parent draft, behavior history, director alert |
| Owner Home “Needs attention” static tiles | Replaced with action-only cards from real ops alerts / pending forms / EOD-ready children — empty placeholder tiles removed |
| Teacher Today generic lesson tiles only | Live “Today’s assigned lesson” when a week plan exists; EOD-ready action when facts exist |
| Re-entering form signed status into timeline | Documents included in `childTimelineEntries` automatically |

---

## Every AI improvement

| Area | Improvement |
|---|---|
| Observations | Quiet goal suggestion on every observation save (not only AI Daily Log / Doc Helper paths) |
| End-of-day | Owner/Teacher homes surface “daily reports ready to generate” from grounded logged facts (no new AI page) |
| Incidents | Parent message draft auto-written from incident description (provider reviews before share) |
| Teacher Today | Quick Observation / Incident copy points at quiet helpers already in product |
| Meals / attendance | Continue feeding `buildGroundedDayFactsForAi` without inventing new AI surfaces |

No new AI page was added.

---

## Every notification improvement

| Kept / added (matter-worthy) | Suppressed / avoided |
|---|---|
| Parent signed form | Meal / attendance / nap push noise (still on Family Hub Today) |
| Incident needs review (director/owner ops alert) | Static “Business alerts” / empty AI recommendation cards |
| Observation shared | Duplicate timeline spam for care logs already visible on timeline |
| Lesson assigned (staff ops alert) | Non-allowlisted ops alert types discarded |
| Child ready (setup complete) | |
| Forms awaiting parent (count-driven action card) | |
| Existing FH notifies: photo, report, observation, goal, support-plan, form | |

Ops alerts live in `llhOpsAlerts:<email>` and only accept:  
`incident_review`, `form_signed`, `form_overdue`, `observation_shared`, `message`, `medication_due`, `lesson_assigned`, `child_ready`.

---

## Dashboard review

- **Owner Home:** pulse includes classroom counts/ratios; Needs attention is action-only (hidden when empty); no placeholder Business/AI cards; recent observations only if present; assigned lesson card when applicable.
- **Teacher Today:** live lesson card; needs-you-now from real alerts; EOD-ready tile when facts exist; removed redundant “Quick AI” filler tile.

---

## Remaining disconnected workflows

| Gap | Why still open |
|---|---|
| Absent → parent notice | Intentionally private today |
| Legal e-sign / PDF return path | Broader forms product work |
| Platform bell vs Family Hub notification unification | Separate stores; label cleanup still needed |
| Staff assigned-children model | No first-class assignment model yet |
| Activity Center → one-tap ActivityLogs for present children | Soft gap; lesson assign does not auto-log activities |
| Medication due reminders | Type reserved in allowlist; no scheduler wired tonight |
| Multi-device live care sync without backend/Firebase | Existing infra limitation |
| Email/SMS delivery for forms/incidents | Testing still simulated |

---

## Merge note (prior ask)

Navigation & role experience was merged into `main` at `09615e2` (testing shell kept; teaching-kit / free-UX from main preserved). This Smart Automation branch is **not** merged and must not deploy production.
