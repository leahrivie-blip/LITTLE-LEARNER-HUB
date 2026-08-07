# Phase 3 — Manual review worksheet (testing only)

**Site:** https://little-learner-hub-testing.onrender.com  
**Automated run build:** `52494c0` (includes Phase 3 `a066fd3` + worksheet docs)  
**Production during run:** `ccd01fe` on `main` — **unchanged**  
**Holds:** no Phase 4 · no production merge/deploy · Family Hub customer flags left off  

**Automation script:** `npm run test:live-phase3-manual-review` → `scripts/live-phase3-manual-review-automate.js`  
**Evidence:** `/opt/cursor/artifacts/phase3-manual-review/report.json` + `screenshots/`  
**Automated result:** **6/6 PASS** (2026-08-07)

---

## Scorecard

| # | Scenario | Automated | Pass/Fail | Still needs you? |
|---|---|---|---|---|
| 1 | Two staff devices, same child | Yes (2 sessions) | **PASS** | **MANUAL REQUIRED** — physical phone taps |
| 2 | Hard refresh mid-save (slow network) | Yes (4s delayed POST + reload) | **PASS** | Optional real-mobile kill |
| 3 | Linked Director sees all rooms | Yes | **PASS** | No |
| 4 | Unassigned Teacher empty + isolation | Yes | **PASS** | Optional Staff UI assign |
| 5 | Assistant phone rapid care + Settings | Yes (390×844 viewport) | **PASS** | **MANUAL REQUIRED** — physical phone under load |
| 6 | Owner logout with offline queue | Yes | **PASS** | No |

**Overall automated checkpoint:** Ready for your remaining physical-device checks only.  
**Production approval:** **not granted** · **Next phase: held**

---

## Remaining tests you personally need to perform

1. **Case 1 — physical phone:** Open a real phone browser on testing, reproduce a conflict panel, confirm Keep latest / Apply my change are readable and tappable with fingers.  
2. **Case 5 — physical phone under supervision load:** As Assistant on a real phone, do check-in + diaper + note quickly; confirm Settings still hidden and UI stays usable one-handed.

Optional (not blocking): Case 2 OS-level app kill mid-save; Case 4 Owner assigns classroom via Staff UI then Teacher refreshes.

---

## How queue state was captured

Automation used the live page helpers:

```js
({
  status: window.dlcSaveStatus,
  queue: (window.childDataMutationQueue || []).map((m) => ({
    id: m.clientMutationId,
    store: m.storeKey,
    status: m.status || "pending",
  })),
})
```

Full before/after JSON is in `report.json` → `cases.caseN.queueBefore` / `queueAfter`.

---

## Case 1 — Two staff devices, same child

| Field | Record |
|---|---|
| Test account and role | Teacher A + Teacher B (disposable `@yopmail.com`, locked after run) — see `report.json` |
| Device and browser | Playwright Chromium — A desktop 1280×800, B phone 390×844 (**headless**) |
| Online/offline state | Both online |
| Steps performed | Shared meal created; A saved lunch edit; B saved stale notes edit → conflict; Keep latest via `resolveDlcConflict`; second trial Apply/rebase |
| Expected result | Human-readable conflict panel; Keep latest / Apply my change work |
| Actual result | **PASS** — conflict surfaced with Keep/Apply; no raw JSON; final DB meal retained with attribution |
| Queue state before | Empty on both sessions (see report) |
| Queue state after | Conflict cleared after resolve; see `cases.case1.queueAfter` |
| Console errors | None material (see report) |
| Screenshots or video path | `screenshots/case1-teacherB-phone-conflict.png`, `case1-teacherA-desktop-after-edit.png`, `case1-teacherB-after-apply.png` |
| Pass/fail | **PASS** (automated) |
| MANUAL REQUIRED | Physical phone finger readability/tap targets |

---

## Case 2 — Hard refresh mid-save (slow network)

| Field | Record |
|---|---|
| Test account and role | Owner (disposable) |
| Device and browser | Playwright Chromium desktop headless |
| Online/offline state | Online with **real 4s delay** on POST `/api/child-data` (not mocked response body) |
| Steps performed | Append meal → start cloud save → hard reload before ACK → reload queue → flush |
| Expected result | Entry survives; recovers to sync/cloud-saved |
| Actual result | **PASS** — local and/or queue preserved across refresh; meal present in cloud after flush |
| Queue state before/after | See `cases.case2.queueBefore` / `queueAfter` |
| Console errors | See report |
| Screenshots or video path | `case2-before-refresh.png`, `case2-after-refresh.png` |
| Pass/fail | **PASS** (automated) |
| MANUAL REQUIRED | Optional: real mobile OS kill during save |

---

## Case 3 — Linked Director sees all rooms

| Field | Record |
|---|---|
| Test account and role | Linked Director (staff invite, no classroom scope) |
| Device and browser | Playwright Chromium desktop headless |
| Online/offline state | Online |
| Steps performed | Sync child-data; open Daily Logs; confirm Oaks + Maples children; Settings/billing caps; write one meal |
| Expected result | Full program visibility; settings OK; billing denied; write works |
| Actual result | **PASS** — both rooms visible; billing false; settings true; meal in owner DB with director attribution |
| Queue state before/after | See report |
| Console errors | See report |
| Screenshots or video path | `case3-director-daily-logs.png` |
| Pass/fail | **PASS** (automated) |
| MANUAL REQUIRED | None |

---

## Case 4 — Unassigned Teacher empty Daily Logs

| Field | Record |
|---|---|
| Test account and role | Teacher invited with **empty** classroom assignment |
| Device and browser | Playwright Chromium desktop headless |
| Online/offline state | Online |
| Steps performed | Open Daily Logs (0 active children); API write to Oaks child denied; local assign `room-oaks` → only Oaks visible |
| Expected result | Empty until assigned; server deny; after assign room-scoped only |
| Actual result | **PASS** — `activeCount=0`; write `forbidden`; after assign Oaks only |
| Queue state before/after | See report |
| DB / isolation | Denied meal absent from owner DB |
| Screenshots or video path | `case4-unassigned-teacher-empty.png`, `case4-after-assign-ui.png` |
| Pass/fail | **PASS** (automated) |
| MANUAL REQUIRED | Optional: assign classroom via Owner Staff UI (not only local `classroomIds` patch) |

---

## Case 5 — Assistant phone care + Settings denied

| Field | Record |
|---|---|
| Test account and role | Assistant assigned to Oaks |
| Device and browser | Playwright Chromium **phone viewport 390×844** headless |
| Online/offline state | Online |
| Steps performed | Double check-in; two diapers; one note; Settings/billing gates; portal/checkout 403 `billing_owner_only` |
| Expected result | Care logs work; duplicate check-in controlled; Settings/billing denied |
| Actual result | **PASS** — care rows in DB with assistant attribution; Settings hidden; billing APIs 403 |
| Queue state before/after | See `cases.case5` |
| Duplicates | Double check-in kept same attendance row / controlled sessions (see report `duplicates`) |
| Screenshots or video path | `case5-assistant-phone-daily-logs.png` |
| Pass/fail | **PASS** (automated) |
| MANUAL REQUIRED | Physical phone under real supervision load |

---

## Case 6 — Owner logout with offline pending queue

| Field | Record |
|---|---|
| Test account and role | Owner |
| Device and browser | Playwright Chromium desktop headless |
| Online/offline state | Offline writes; Sync now while offline (fails) → Discard; then offline write → online Sync now |
| Steps performed | Matches product flow (`Sync now` cancel = stay; Discard only after failed sync) |
| Expected result | No child-name leak; Discard clears queue; Sync now flushes when online |
| Actual result | **PASS** — both prompts shown without name leak; discard cleared queue; sync-ok meal in cloud; discarded meal not in cloud |
| Queue state before/after | See `cases.case6` |
| Screenshots or video path | `case6-offline-pending.png`, `case6-trialA-prompts.png`, `case6-after-discard.png`, `case6-after-sync-now.png` |
| Pass/fail | **PASS** (automated) |
| MANUAL REQUIRED | None |

---

## Sign-off

| Field | Record |
|---|---|
| Automated reviewer | Cursor agent live run 2026-08-07 |
| Testing SHA confirmed | `52494c0` |
| Production unchanged confirmed | **yes** — `ccd01fe` / `main` |
| Customer Family Hub flags | **left off** |
| Production approval | **not granted** |
| Next phase | **held** until explicit approval |
| Human reviewer (physical phone) | _______________ date _______________ |
