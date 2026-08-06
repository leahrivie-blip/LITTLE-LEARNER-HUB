# Phase 3 — Manual review worksheet (testing only)

**Site:** https://little-learner-hub-testing.onrender.com  
**Expected build:** `a066fd3` / `cursor/family-hub-testing-readiness-d3df`  
**Production:** do not use · do not deploy · do not enable customer Family Hub flags  
**Hold:** no next phase until this worksheet is complete and you give explicit approval

Confirm build before starting: open `/api/build-version` → `shortSha` should be `a066fd3` (or a later testing-only SHA that still includes Phase 3).

---

## Scorecard

| # | Scenario | Pass/Fail | Reviewer | Date |
|---|---|---|---|---|
| 1 | Two staff devices, same child | ☐ Pass ☐ Fail |  |  |
| 2 | Hard refresh mid-save (slow network) | ☐ Pass ☐ Fail |  |  |
| 3 | Linked Director sees all rooms | ☐ Pass ☐ Fail |  |  |
| 4 | Unassigned Teacher empty Daily Logs | ☐ Pass ☐ Fail |  |  |
| 5 | Assistant phone care + Settings denied | ☐ Pass ☐ Fail |  |  |
| 6 | Owner logout with offline pending queue | ☐ Pass ☐ Fail |  |  |

**Overall:** ☐ Ready to discuss production ☐ Needs fixes first ☐ Blocked  

**Notes:** _______________________________________________

---

## How to record queue state

In the browser console (testing site, signed in):

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

Paste the before/after JSON (or a short summary like `pending:1 → saved:0`) into each case.

Artifact folder suggestion: `/opt/cursor/artifacts/phase3-manual-review/` or your local notes folder.  
Use disposable `@yopmail.com` accounts; lock/revoke when done.

---

## Case 1 — Two staff devices, same child

| Field | Record |
|---|---|
| Test account and role | A: _______________ (Teacher) · B: _______________ (Teacher/Director) |
| Device and browser | A: _______________ · B: _______________ |
| Online/offline state | ☐ both online |
| Steps performed | 1. Both open same child Daily Logs. 2. A edits lunch / meal field and saves. 3. B edits a different field (notes) on the same record (or overlapping edit) and saves. 4. Resolve with **Keep latest** once and **Apply my change** once (separate trials OK). |
| Expected result | Conflict panel is human-readable (child + record type, no raw JSON). Keep latest / Apply my change work. Phone layout usable. |
| Actual result | |
| Queue state before | |
| Queue state after | |
| Console errors | ☐ none ☐ list: |
| Screenshots or video path | |
| Pass/fail | ☐ Pass ☐ Fail |

---

## Case 2 — Hard refresh mid-save (slow network)

| Field | Record |
|---|---|
| Test account and role | |
| Device and browser | |
| Online/offline state | ☐ online · ☐ throttled / slow (DevTools Network throttle OK) |
| Steps performed | 1. Open Daily Logs. 2. Add a meal (or check-in). 3. Immediately hard-refresh before “Saved to cloud”. 4. Wait for boot; check status bar + entry. |
| Expected result | Entry not lost. Status returns to pending/saving then cloud-saved (or clear retry). No false “Saved to cloud” before sync. |
| Actual result | |
| Queue state before | |
| Queue state after | |
| Console errors | ☐ none ☐ list: |
| Screenshots or video path | |
| Pass/fail | ☐ Pass ☐ Fail |

---

## Case 3 — Linked Director sees all rooms

| Field | Record |
|---|---|
| Test account and role | Director linked to owner program: _______________ |
| Device and browser | |
| Online/offline state | ☐ online |
| Steps performed | 1. Sign in as linked Director. 2. Open Daily Logs. 3. Confirm children from multiple rooms appear (or classroom filter can show all). 4. Spot-check one log write. |
| Expected result | Director sees full program children (not teacher-scoped). Settings OK; billing still owner-only if checked. |
| Actual result | |
| Queue state before | |
| Queue state after | |
| Console errors | ☐ none ☐ list: |
| Screenshots or video path | |
| Pass/fail | ☐ Pass ☐ Fail |

---

## Case 4 — Unassigned Teacher empty Daily Logs

| Field | Record |
|---|---|
| Test account and role | Teacher with **no** classroom assignment: _______________ |
| Device and browser | |
| Online/offline state | ☐ online |
| Steps performed | 1. Sign in as unassigned Teacher. 2. Open Daily Logs / Today. 3. Confirm child list. 4. (Optional) Owner assigns a classroom; Teacher refreshes and rechecks. |
| Expected result | No accidental “all children”. Empty / blocked state until assigned. After assign, only that room’s children. |
| Actual result | |
| Queue state before | |
| Queue state after | |
| Console errors | ☐ none ☐ list: |
| Screenshots or video path | |
| Pass/fail | ☐ Pass ☐ Fail |

---

## Case 5 — Assistant phone care + Settings denied

| Field | Record |
|---|---|
| Test account and role | Assistant: _______________ |
| Device and browser | ☐ phone width ~390 · browser: _______________ |
| Online/offline state | ☐ online |
| Steps performed | 1. Sign in on phone. 2. Check-in a child. 3. Log diaper + note quickly. 4. Confirm no Settings nav; Account still opens. 5. Confirm billing/upgrade not available. |
| Expected result | Care actions work. Settings hidden/denied. No billing portal/checkout. Touch targets usable under load. |
| Actual result | |
| Queue state before | |
| Queue state after | |
| Console errors | ☐ none ☐ list: |
| Screenshots or video path | |
| Pass/fail | ☐ Pass ☐ Fail |

---

## Case 6 — Owner logout with offline pending queue

| Field | Record |
|---|---|
| Test account and role | Owner: _______________ |
| Device and browser | |
| Online/offline state | ☐ go offline after writing · ☐ back online for Sync now trial |
| Steps performed | 1. Owner online → open Daily Logs. 2. Go offline. 3. Add a care entry. 4. Attempt logout. 5. Trial A: **Sync now** (after reconnect). Trial B (separate): **Discard unsynced**. |
| Expected result | Logout warns about unsynced work (no child-name leak). Sync now flushes queue. Discard clears pending and allows logout. |
| Actual result | |
| Queue state before | |
| Queue state after | |
| Console errors | ☐ none ☐ list: |
| Screenshots or video path | |
| Pass/fail | ☐ Pass ☐ Fail |

---

## Sign-off (after all six)

| Field | Record |
|---|---|
| Reviewer | |
| Testing SHA confirmed | |
| Production unchanged confirmed | ☐ yes (`main` / production SHA still not Phase 3) |
| Customer Family Hub flags | ☐ left off |
| Production approval | ☐ **not granted** · ☐ granted (date/note): _______________ |
| Next phase | ☐ **held** until explicit approval |
