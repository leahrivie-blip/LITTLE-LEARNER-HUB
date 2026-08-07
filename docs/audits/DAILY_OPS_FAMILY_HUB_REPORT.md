# Milestone report: Daily ops → Family Hub

**Scope:** Testing branch only (`HOME_DAYCARE_HUB_TESTING`)  
**Branch:** `cursor/daily-ops-family-hub-9026`  
**Date:** 2026-08-07  
**Production merge/deploy:** NO — awaiting your approval for testing merge only  
**Do not continue to Priority 3 (Forms spine)** until you approve this milestone.

---

## Verdict

**Testing GO** for Daily ops → Family Hub polish behind the testing fence.  
**Production NO-GO** — Family Hub remains fenced; no production promote.

---

## Feature checklist

| Capability | Status |
|---|---|
| Log through the day (existing Daily Logs / room-mode) | Already present |
| One primary **Draft Daily Report** CTA (EOD) | Done |
| Grounded AI draft from logged facts only | Already present; section prefs now applied |
| Editable preview before share | Already present |
| Provider **Improve wording** (keeps facts / edits) | Done |
| Confirm → **Send to Family Hub** | Done (renamed primary CTA) |
| Full report body in parent Reports panel | Done (`body` on `publicSharedItem`) |
| Program **daily report sections** used in draft facts | Done |
| Program **share defaults** for quick actions / forms | Done (Settings → Daily Report Preferences) |
| Respect parent `notifyDailyReports` for in-app alerts | Done |
| Email / push delivery of reports | Deferred to Priority 4 |
| Autopay / unrelated billing | Out of scope |

---

## What changed

### Server
- `publicSharedItem` exposes full `body` (message/notes/text) plus a short `summary`.
- Provider notification POST skips households that opted out of report/photo/message alerts.

### Client
- EOD: single primary **Draft Daily Report**; secondary parent message / weekly summary.
- Preview: **Send to Family Hub**, **Improve wording**, Keep Internal, Discard.
- Parent Reports panel renders full `body` (`fh-report-body`).
- `getDlcShareDefaults` / `dlcShareDefaultFor` drive quick actions + form radios.
- `dailyReportSections` filters grounded facts for AI daily report drafts.
- Settings Section 6: share-default checkboxes saved as `programSettings.dlcShareDefaults`.

---

## Screenshots / demo

Artifacts: `/opt/cursor/artifacts/daily-ops-family-hub/screenshots/`

### Demo walkthrough (testing site)

1. Enable `HOME_DAYCARE_HUB_TESTING` (already on testing service).  
2. Settings → Daily Report Preferences: set sections + share defaults → Save.  
3. Daily Logs → log meals/naps/activities for a child.  
4. End of day → **Draft Daily Report** → edit → **Improve wording** → **Send to Family Hub**.  
5. As Parent: Family Hub → Reports → read the **full** report text.  
6. Parent settings: turn off Daily report alerts → sharing still works; in-app report toast is skipped.

---

## Testing results

| Suite | Result |
|---|---|
| `npm run check` | PASS |
| `npm run test:daily-ops-family-hub` | PASS |
| `npm run test:daily-logs-attendance` | PASS (pins updated for new preview copy) |
| `npm run test:phase3-daily-logs-classroom` | PASS |
| `npm run test:family-hub-provider-inbox` | PASS |
| `npm run test:family-tuition-billing-v1` | PASS |

---

## Database / schema changes

None. Uses existing child `Reports` records + `programSettings` JSON on the account.

---

## Production gates (unchanged)

- Phase 3 phone Case 1 & Case 5 — MANUAL REQUIRED  
- Family Hub customer flags OFF  
- Do not merge/deploy to production without explicit owner approval  

---

## Stop for approval

Priority 2 complete for testing. Next owner-approved item is **Priority 3 — Forms spine**. Awaiting your go-ahead before starting.
