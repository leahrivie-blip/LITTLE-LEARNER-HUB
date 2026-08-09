# Owner Draft Review Workflow — Implementation Report

**Branch:** `cursor/admin-draft-review-workflow-a5dd`  
**Date:** 2026-08-09  
**Stop for owner approval — do not merge or deploy automatically.**

## Root causes (production problems)

1. **Open Review did nothing**  
   `Open Review` called `LLHTeachingKitEnrichmentEditor.open()`, which returned immediately when `featureFlags.teachingKitEnrichmentEditor` was `false` (production default).

2. **Content sidebar did not return to Content Home**  
   `setAdminGroup("content")` used `stayOnCurrent`, so clicking Content while already on Draft Review stayed on the queue.

3. **17 vs 20 Amazing Apples activities**  
   Queue counted enrichment keys / proposed activities (17). The live editor flattened the published plan’s daily items (still 20, including three removals: Apple Color Investigation, Round Apple Collage, Apple Basket Relay). Removals lived only in seed `decisions`, not in a draft overlay the editor honored.

4. **Contradictory statuses**  
   Surfaces could show workflow + library labels independently; Publish Ready could still be inferred from fill % while blockers remained. Canonical status now forces **Needs Changes** whenever hard blockers exist.

5. **Safety concern with no target**  
   `safety_concern` was week-wide text with no activity link. It now attaches activity title + `navigateTo` when a specific activity matches.

6. **Approve/Publish unavailable**  
   Phase 1 explicitly blocked `approve` / `publish` (`phase2_required`).

7. **DISPOSABLE TK Printable Prod Verify**  
   Exact title not present in this repo. Closest fixtures are other `ZZ Disposable…` / QA kits. **Do not delete in production until a live inventory confirms zero referenced resources.**

## Exact files changed

- `scripts/curriculum-draft-review.js` — statuses, stats, plain-language blockers, readable compare, publish phrase
- `server/curriculum-draft-review.js` — proposed plan overlay on seed submit, scoring/status, preview/printable/image review, approve/publish/rollback gates
- `scripts/curriculum-draft-review-ui.js` — full owner queue UI
- `scripts/teaching-kit-enrichment.js` — canonical activity flatten with proposedDailyPlans + remove decisions
- `scripts/teaching-kit-enrichment-editor.js` — owner Draft Review bypass (flag off), return-to-queue
- `scripts/teaching-kit-quality-review.js` — safety blocker activity targeting
- `scripts/teaching-kit-status.js` — (already had Publish Ready vs Blocked hard rule; shared by queue)
- `app.js` — Content → Content Home navigation; lesson-card status consistency
- `styles.css` — queue/preview/image/publish panel styles; sticky Open Review column
- `scripts/test-curriculum-draft-review.js` — expanded API coverage
- `scripts/test-draft-review-owner-workflow.js` — disposable end-to-end + desktop/mobile screenshots
- `docs/curriculum-draft-review/*` — workflow docs + report
- `package.json` — `test:draft-review-owner-workflow`

## Before / after behavior

| Area | Before | After |
| --- | --- | --- |
| Open Review | Dead when Enrichment Editor flag off | Opens real editor for owner via `ownerDraftReview: true` |
| Content nav | Stayed on queue | Returns to Content Home |
| Activity count | Queue 17 / editor 20 | Shared flatten uses proposed plan + removals |
| Status | Publish Ready could coexist with blockers | Needs Changes while blocked; Publish disabled |
| Preview | Weak / editor-flag dependent | Owner-only `preview` API + UI panel |
| Printables/images | Minimal links | Dedicated review panels + approve printable |
| Compare | Field-key dump | Readable added/removed/replaced/rewritten/unchanged |
| Approve/Publish | Phase-1 blocked | Approve → typed `PUBLISH TEACHING KIT` → Publish; blockers block both |
| Auth | Owner gate present | Re-verified: owner allow; other admin/logged-out/forged deny; draft PDF public 404 |

## Screenshots

Desktop/mobile artifacts under `/opt/cursor/artifacts/draft-review-owner-workflow/`:

- `queue-desktop.png` / `queue-mobile.png`
- `open-review-desktop.png` / `open-review-mobile.png`
- `content-home-desktop.png` / `content-home-mobile.png`

## Authorization results

| Actor | Result |
| --- | --- |
| Owner `leahivie@icloud.com` | Allowed |
| Other admin | 403 |
| Logged out / forged claims | 401 |
| Customer public draft PDF URL | 404 |
| Owner draft PDF URL | 200 |

## Data-preservation evidence

From `npm run test:curriculum-draft-review` + `test:draft-review-owner-workflow`:

- Farm Animals published body + activity links unchanged
- Lesson/activity totals unchanged during draft submit/revise/rollback/discard
- Customer Teaching Kit flags (`teachingKitViewer`, `teachingKitPrintCenter`, `teachingKitEnrichmentEditor`) remain `false`
- Seed/revise never auto-publishes

## Test results

```text
npm run test:curriculum-draft-review
→ PASS 99 assertions

npm run test:draft-review-owner-workflow
→ PASS 33 assertions
  including Open Review desktop+mobile (flag off),
  Content Home return, auth matrix, preview/printable/image/compare,
  revise-same-item, publish phrase rejection, Farm Animals unchanged
```

## Remaining risks

1. **Disposable fixture publish path** still hits real quality blockers (toolkit/books/songs/setup depth). Phrase + blocker gates are proven; a fully green disposable publish→rollback→purge path should be added once fixture content is thickened to pass `evaluateTeachingKit`.
2. **Production disposable lesson** title not found in repo — needs live inventory before delete.
3. **Printable page-thumbnail carousel** is metadata + PDF open today; richer per-page canvas thumbnails can be a follow-up.
4. **Editor stepper** still labels a greyed “Publish Ready” step even when inactive (status badges already suppress active Publish Ready while blocked).
5. Amazing Apples / All About Me still not owner-approved gold standards — **no next-ten batch**.

## GO / NO-GO

| Decision | Verdict | Why |
| --- | --- | --- |
| Merge | **NO-GO until owner approval** | Per your stop instruction; review screenshots + behavior first |
| Deploy | **NO-GO** | Do not deploy until you approve merge and production smoke |
| Use for next ten lessons | **NO-GO** | Workflow is much closer, but gold-standard manual approval of Amazing Apples + All About Me is still required before batch work |

## Recommended owner smoke (production, after deploy)

1. Admin → Content → Draft Review Queue  
2. Confirm Amazing Apples row shows **17** activities and plain-language blockers  
3. Open Review (must open real editor; Enrichment flag can stay off)  
4. Content sidebar → lands on Content Home  
5. Preview / Printable review / Image review / Compare  
6. Request revision → same queue item  
7. Do **not** publish customer lessons until blockers clear and you intentionally Approve + type the phrase
