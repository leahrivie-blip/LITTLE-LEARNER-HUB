# Teaching Kit — Customer Launch Record

**Date:** 2026-08-07  
**Owner decision:** Enable Teaching Kit for all users so kits can be reviewed, edited, and gradually released.  
**Production store updatedAt after enable:** `2026-08-07T14:53:25.847Z`

## Flags enabled (production site-content)

| Flag | Value | Notes |
| --- | --- | --- |
| `teachingKitViewer` | **true** | Customer Teaching Kit workspace |
| `teachingKitPrintCenter` | **true** | Binder / print / PDF controls |
| `teachingKitAttachments` | **false** | Slice 1G still deferred |
| `teachingKitEnrichmentEditor` | true | Owner authoring (unchanged) |
| `teachingKitAuthoring` | true | Owner authoring (unchanged) |
| `teachingKitCurriculumDirector` | true | Owner tooling (unchanged) |
| `teachingKitQualityReview` | true | Owner tooling (unchanged) |

Enablement used `POST /api/admin/site-content` with a **flags-only** merge (no curriculum body). Lesson plan count remained **127**.

## Pre-enable automated QA

| Suite | Result |
| --- | --- |
| `test:teaching-kit-production-smoke` (baseline) | Pass (22) |
| `test:teaching-kit-phase1-qa` | Pass (91) |
| `test:teaching-kit-viewer-remediation` | Pass (124) |
| `test:teaching-kit-slice-1f` | Pass (70) |
| `test:teaching-kit-curriculum-production` | Pass (226) |
| `test:curriculum-access-security` | Pass |

## Post-enable live checks

- Public `/api/site-content` exposes Viewer+Print = true, Attachments = false; omits admin tooling flags
- Guest Pro kit → `locked: true`, no companion leak
- Guest Free starter (Farm Animals) → unlocked Teaching Kit
- Desktop + mobile: Start / Setup / Today / Binder / Build panels load; no `[object Object]` / lorem junk; no horizontal overflow
- Binder tabs (Books, Songs, Activities, Overview, Weekly) navigate
- Print Center shows Print Teaching Kit binder + related PDF controls
- Classic lesson library still lists Free + Pro plans (127 total)

Artifacts: `/opt/cursor/artifacts/tk-customer-launch/`

## Still needs attention before calling quality “complete”

These are **not** launch blockers for visibility, but should guide today’s review/release work:

1. **Manual kit-by-kit review** — most kits still map from classic lesson data; enrichment quality varies. Use Admin → Upgrade Lesson / Enrichment Editor to improve, then Publish per lesson.
2. **Attachments (Slice 1G)** — keep `teachingKitAttachments: false` until attachment types / admin attach UX ships.
3. **Missing images** — many activities correctly show “Image not added yet”; expected until photos/briefs are added.
4. **Materials completeness** — some companions report empty materials lists; improve via enrichment / authoring.
5. **Monday Setup checkboxes** — visual only (not persisted); acceptable for Phase 1.
6. **Trial print watermark smoke** — confirm with a real Trial member session that print authorize watermarks and decrements allowance (admin bearer is not a member session).
7. **Free vs Pro matrix on real devices** — spot-check one Free starter unlock and one locked Pro plan on phone + desktop after cache refresh.
8. **Rollback** — Admin → Settings → Teaching Kit flags → turn Viewer/Print off (same safe flags-only save).

## Rollback

Admin Settings → Teaching Kit feature flags → uncheck Viewer and Print Center → Save.  
Or flags-only admin site-content POST with those keys `false`. Curriculum is not touched.
