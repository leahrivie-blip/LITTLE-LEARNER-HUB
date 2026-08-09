# Owner Draft Review Workflow — Implementation Report

**Branch:** `cursor/admin-draft-review-workflow-a5dd`  
**PR:** #600  
**Date:** 2026-08-09  
**Stop for owner approval — do not merge or deploy automatically.**

## What this turn finished

1. **Complete printable review** — every PDF page renders as a thumbnail; page count; large preview with previous/next/zoom; download; system print preview; branding/website/cut-lines/margins/labels/illustrations checklist; approve gated on inspecting every page; replace PDF without losing the lesson draft; draft PDFs remain owner-only.
2. **Disposable publish workflow proof** — rich Mon–Fri fixture (15 activities after legacy removal, song, book, Teacher Toolkit, required example image, multi-page printable) through submit → revise → page-inspect → approve printable → Approve → `PUBLISH TEACHING KIT` → customer access change → full publish rollback → safe cleanup.
3. **Production inventory (read-only)** — title not found in repo; live admin inventory blocked without owner credentials in this environment.
4. **Status/count consistency** — queue / get / preview / compare / printable review share canonical activity + page counts; blocked drafts never report Publish Ready; draft printables never count as published.
5. **Evidence** — desktop + mobile screenshots under `/opt/cursor/artifacts/screenshots/` and `/opt/cursor/artifacts/draft-review-owner-workflow/`.

## Root causes (still accurate)

1. Open Review no-oped when Enrichment Editor flag was off — fixed via owner Draft Review bypass.
2. Content sidebar stayed on queue — fixed to return to Content Home.
3. Amazing Apples 17 vs 20 — proposed daily plan + remove decisions now shared by queue/editor flatten.
4. Publish Ready while blocked — canonical status forces Needs Changes while hard blockers remain.
5. Approve/Publish were Phase-1 blocked — now Approve + typed `PUBLISH TEACHING KIT`.
6. Printable “review” was only Open PDF — now every-page thumbnails + inspection gate.
7. Draft Review publish wrote `enrichmentPublished` but normalizer dropped it — **fixed** so customer publish persists.
8. Draft Review rollback did not restore a published kit — **fixed** via `publishSnapshot` full restore.

## Exact files changed (this completion)

- `scripts/curriculum-draft-printable-review.js` — pdf.js every-page thumbnail + lightbox viewer
- `scripts/vendor/pdf.min.mjs`, `scripts/vendor/pdf.worker.min.mjs` — vendored pdf.js
- `scripts/curriculum-draft-review-ui.js` — printable panel wiring, replace PDF, publish-rollback copy
- `scripts/curriculum-draft-review.js` — `record-printable-pages`, `replace-printable` actions
- `server/curriculum-draft-review.js` — page-count via pdf-lib, page-inspection gate, replace-printable, publish snapshot + publish rollback
- `server/index.js` — `.mjs` MIME; preserve `enrichmentPublished` in lesson normalizer
- `styles.css` — printable thumb/lightbox styles
- `index.html` / `package.json` — script include + pdfjs-dist + check target
- `scripts/test-draft-review-owner-workflow.js` — rich disposable end-to-end + screenshots
- `docs/curriculum-draft-review/OWNER-WORKFLOW-REPORT.md` — this report

## Complete printable review — verified

| Requirement | Result |
| --- | --- |
| Complete page count | Shown (`4 pages`, long PDF replace → `12`) |
| Every page thumbnail | Rendered (desktop + mobile) |
| Click page → large preview | Lightbox with prev/next/zoom |
| Download draft PDF | Owner admin file JSON → data URL download |
| System print preview | Opens printable HTML + `window.print()` |
| Branding / website / cut lines / margins / labels / illustrations | Checklist + multi-page fixture markers |
| Approve / request revision | Approve blocked until every page inspected |
| Replace PDF without losing lesson draft | Proven (`lessonDraftPreserved`) |
| Opening file alone ≠ reviewed | `pages_not_reviewed` until `record-printable-pages` |
| Multi-page / long / corrupt / mobile / refresh | Covered in owner-workflow test |
| Draft files owner-only | Public draft PDF `404`; owner `200` |

## Disposable publish workflow — proven

Fixture includes: Mon–Fri Teaching Kit, activities, removed/replaced legacy activity (`OLD Disposable Sorting Cards`), song, book, 4-page printable, required example image URLs, Teacher Toolkit.

| Step | Result |
| --- | --- |
| Submit → queue | 1 item, **15** activities, **4** pages, removals counted |
| Open Review | Editor opens with Enrichment flag **false** |
| Inspect Teaching Kit / preview | Preview activities 15; legacy absent |
| Inspect every PDF page | Page gate enforced |
| Inspect image / compare | Required images listed; readable remove/replace |
| Request revision → revise same item | Still 1 queue item |
| Approve → type phrase → publish | Disposable published |
| Customer printable access | Draft `404` → published Pro gate `403` (no longer missing) |
| Old draft inaccessible after publish | `enrichmentDraft` cleared |
| Rollback | Restores prior enrichmentPublished (none), restores draft, printable → draft, customer PDF `404` again |
| Cleanup | Disposable archived/removed from test store |
| Farm Animals / customer TK flags | Unchanged throughout |
| Nothing real published | Disposable QA fixture only |

## Status consistency

Canonical surfaces checked in tests:

- Draft Review Queue activity count **15** = get = owner preview
- Printable pages **4** = queue = printable-review
- Legacy removal appears in compare + proposed customer activities (not in live proposed items)
- `publishReady !== true` while draft printables / blockers remain
- Queue badges: **Needs Changes** / **Library Blocked** (not Publish Ready)

**Known cosmetic inconsistency:** Enrichment Editor stepper still shows a greyed “Publish Ready” step label while the active badge correctly says Needs Changes. Do not treat that stepper label as readiness.

## 3. Disposable production inventory — `DISPOSABLE TK Printable Prod Verify`

**Read-only result from this environment:**

| Field | Finding |
| --- | --- |
| Exact lesson ID | **Unknown** — title not present in git/seed fixtures |
| Published/draft/archive status | **Unknown without owner Admin login** |
| Linked printables / images / activities / calendar / history / shared resources | **Unknown** |
| Would delete remove shared refs? | **Unknown — do not delete yet** |

Production `GET /api/health` is healthy. Admin login without credentials correctly rejects. This cloud run has **no production Admin password / access code**, so a live inventory of the named lesson cannot be completed here.

### Safe-cleanup recommendation (do not execute yet)

1. Owner logs into production Admin as `leahivie@icloud.com`.
2. Content → Lesson Plans: search exact title `DISPOSABLE TK Printable Prod Verify`; record `id`, status, `resourceIds`, enrichment history.
3. Content → Resources: for each linked printable/image, list every `lessonPlanIds` entry.
4. Delete **only if** every linked resource is referenced solely by this disposable lesson (or archive resources first).
5. Prefer **Archive lesson + archive orphan draft resources** over hard delete.
6. Re-check Farm Animals and Amazing Apples/All About Me IDs untouched.
7. Keep a names-only inventory note before any delete.

## Test results

```text
npm run test:curriculum-draft-review
→ PASS 99 assertions

npm run test:draft-review-owner-workflow
→ PASS 77 assertions
  including every-page printable thumbs (desktop+mobile),
  page-inspection approve gate, replace PDF, publish→rollback,
  Farm Animals + customer TK flags unchanged, Content Home return
```

## Evidence screenshots

Under `/opt/cursor/artifacts/screenshots/`:

- `queue-desktop.png` / `queue-mobile.png`
- `open-review-desktop.png` / `open-review-mobile.png`
- `content-home-desktop.png` / `content-home-mobile.png`
- `teaching-kit-preview-desktop.png` / `teaching-kit-preview-mobile.png`
- `printable-thumbs-desktop.png` / `printable-thumbs-mobile.png`
- `printable-page-preview-desktop.png` / `printable-page-preview-mobile.png`
- `image-review-desktop.png` / `image-review-mobile.png`
- `compare-desktop.png` / `compare-mobile.png`
- `revision-request-desktop.png` / `revision-request-mobile.png`

API-proven (no customer UI flags enabled): publish disposable, customer printable access transition, successful publish rollback, cleanup.

## Remaining risks

1. Editor stepper still shows a greyed “Publish Ready” label while Needs Changes is the real status.
2. Production disposable lesson inventory still needs owner Admin session.
3. Amazing Apples / All About Me still need your manual gold-standard printable page review before any real publish.
4. Customer Teaching Kit viewer/print flags remain off — published enrichment is stored, but customer TK surfaces stay gated by flags.
5. Large PDF lightbox paint can briefly show empty canvas until render finishes (thumbs + page gate are authoritative).

## GO / NO-GO (separate verdicts)

| Decision | Verdict | Why |
| --- | --- | --- |
| **Merge PR #600** | **NO-GO until you approve** | Implementation + disposable proof are in; stop for your review of screenshots/behavior |
| **Deploy PR #600** | **NO-GO** | Do not deploy until you approve merge and a production smoke |
| **Use Admin to review Amazing Apples and All About Me** | **GO after deploy (or local/staging with seeds)** | Workflow is ready for owner review; do not publish yet |
| **Publish either real lesson** | **NO-GO** | Gold-standard manual approval + printable every-page review still required |
| **Begin the next lesson batch** | **NO-GO** | Wait until Amazing Apples + All About Me are manually approved |

## Recommended owner smoke (after you approve deploy)

1. Admin → Content → Draft Review Queue  
2. Amazing Apples: confirm **17** activities, plain-language blockers, not Publish Ready  
3. Open Review → Content sidebar → Content Home  
4. Printable review: see every page thumbnail, open large preview, prev/next/zoom  
5. Request revision on a disposable only if needed  
6. Do **not** publish Amazing Apples / All About Me until you intentionally Approve + type `PUBLISH TEACHING KIT`
