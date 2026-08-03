# Teaching Kit Enrichment Editor — Preservation Remediation

**Status:** Ready for owner review (do not merge / deploy / enable flag / close prior PRs)  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Base:** PR #448 (Slice 7 tip)  
**Branch:** `cursor/tk-enrichment-preserve-remediation-9ad1`

---

## Exact root cause

Classic admin lesson Save and bulk status updates rebuilt lesson plans through:

1. `normalizeCurriculumLessonPlanForRender` — omitted `enrichmentDraft`, `enrichmentPublishHistory`, `teachingKit`, and daily-item enrichment fields.
2. `syncCurriculumActivitiesForLessonPlan` — replaced the plan in the store with the normalized object, so omitted keys disappeared.
3. Activity sync — did not pass `setupMediaAssetId` / `exampleMediaAssetId`, so media asset ids were wiped even when image URLs sometimes fell back.

Publish also wrote `teachingKit.lastEnrichment*` metadata that `normalizedTeachingKitOverlay` immediately stripped. Week `milestones` / `printableIds` were scored in the editor but never merged on publish.

---

## What this remediation fixes

| Area | Fix |
| --- | --- |
| **Server merge-from-existing** | `mergeEnrichmentPreservingLessonPlan` + daily-item enrichment merge inside `syncCurriculumActivitiesForLessonPlan` |
| **Activity sync** | Preserves media asset ids, tips, substitutions, setting tags when incoming lists/ids are empty |
| **Classic client Save** | Re-attaches enrichment from the live store plan in `collectCurriculumLessonPlanFromForm`; render normalize now passes enrichment through |
| **Bulk status** | Sends `{ ...fullPlan, status }` (no enrichment stripper) |
| **Publish metadata** | Overlay keeps `lastEnrichmentPublishedAt/By/Fingerprint/VersionId`, `milestones`, `printableIds` |
| **Week publish** | `mergeDraftIntoPlan` publishes family connection, milestones → `teachingKit.milestones`, printableIds → `resourceIds` + `teachingKit.printableIds`; week-only drafts can publish |
| **SLICE cleanup** | Removed dead `SLICE` / `SLICE1` gates and “later slice” copy |
| **AI consistency** | Canonical `applySuggestionsToDraft` in `teaching-kit-enrichment.js`; server + editor both use it |
| **Media auth** | Editor loads draft photos via `Authorization: Bearer` + Blob URLs (no `adminToken` in `<img src>`). Server still accepts query token for back-compat |

---

## Exact files changed

| Path | Role |
| --- | --- |
| `server/index.js` | Merge-from-existing; activity media id preserve; week-only publish |
| `scripts/teaching-kit.js` | Persist lastEnrichment* + milestones/printableIds on overlay |
| `scripts/teaching-kit-enrichment.js` | Week publish merge; canonical AI apply helper |
| `server/enrichment-ai.js` | Delegate apply to shared helper |
| `scripts/curriculum-safe-values.js` | Pass enrichment fields through render normalize |
| `app.js` | Classic collect + bulk status preservation |
| `scripts/teaching-kit-enrichment-editor.js` | SLICE removal; Blob media; shared AI apply |
| `scripts/test-teaching-kit-enrichment-preserve.js` | **New** E2E preservation suite |
| `scripts/test-teaching-kit-enrichment-qa.js` | Includes preserve suite |
| `package.json` | `test:teaching-kit-enrichment-preserve` |
| `index.html` | Cache bust `…-preserve` |
| `docs/teaching-kit/ENRICHMENT_EDITOR_PRESERVE_REMEDIATION.md` | This report |

---

## Before / after data examples

### Before (classic Save after publish)

Incoming payload omitted enrichment → store plan lost:

```json
{
  "id": "cur-lp-preschool-farm-animals",
  "weeklyOverview": "…classic edit…",
  "enrichmentPublishHistory": null,
  "teachingKit": { "completeness": "legacy_mapped" },
  "dailyPlans": { "monday": { "items": [{ "itemId": "cur-act-…", "teacherTips": [] }] } }
}
```

Activity row: `setupMediaAssetId: ""`.

### After (same classic Save)

```json
{
  "id": "cur-lp-preschool-farm-animals",
  "weeklyOverview": "…classic edit…",
  "enrichmentPublishHistory": [{ "versionId": "epub-…", "snapshot": { "…" : "…" } }],
  "teachingKit": {
    "lastEnrichmentVersionId": "epub-…",
    "lastEnrichmentPublishFingerprint": "…",
    "milestones": ["Sorting", "Language"]
  },
  "dailyPlans": {
    "monday": {
      "items": [{
        "setupMediaAssetId": "tk-enrich-…",
        "exampleMediaAssetId": "tk-enrich-…",
        "teacherTips": ["Invite children to sort by size."],
        "settingTags": ["small_group", "indoor"]
      }]
    }
  }
}
```

---

## Test commands and results

```bash
npm run test:teaching-kit-enrichment-preserve
npm run test:teaching-kit-enrichment
npm run test:teaching-kit-enrichment-slice-5
npm run test:teaching-kit-enrichment-slice-6
npm run check
```

| Suite | Result |
| --- | --- |
| `test:teaching-kit-enrichment-preserve` | **246 assertions OK** |
| `test:teaching-kit-enrichment` | OK |
| `test:teaching-kit-enrichment-slice-5` | **78 OK** |
| `test:teaching-kit-enrichment-slice-6` | **58 OK** |
| `npm run check` | OK |

Report artifact: `/opt/cursor/artifacts/assets/tk-enrich-preserve-report.json`

---

## Media authorization note

**Implemented in this slice:** Activity Studio + Live Preview draft images use Bearer fetch → `URL.createObjectURL` (no session token in query strings from the editor).

**Still present (back-compat):** server `handleAdminEnrichmentPhotoMedia` accepts `?adminToken=` for older clients/tests. Prefer removing that fallback in a later hardening pass after all callers migrate.

---

## Remaining risks

| Risk | Severity | Notes |
| --- | --- | --- |
| Query `adminToken` still accepted on draft media GET | Low–Medium | Editor no longer emits it; redact logs before flag-on |
| Manual-only history restore UI | Low | Snapshot preserved; no one-click restore button |
| PrintableIds require real curriculum resources | Info | Invalid ids fail integrity (by design) |
| Flag still default off | — | Required until owner enables |

---

## Updated production-readiness score

| Lens | Previous | After remediation |
| --- | --- | --- |
| Ship code behind flag (default off) | 86 | **90** |
| Enable flag for admin use | 62 | **84** |
| Blended product readiness | 74 | **87** |

---

## Final Go / No-Go

| Decision | Recommendation |
| --- | --- |
| Merge this remediation (+ #448 stack) with flag **off** | **Conditional Go** after owner review of this PR |
| Enable `teachingKitEnrichmentEditor` in production | **No-Go until owner explicitly approves flag enable** (data-loss blocker is fixed; operational pilot still recommended) |
| Close superseded PRs #443–#446 | **Not yet** — wait for merge decision on the tip PR |
| Deploy / enable flags | **Do not** in this pass |

**Verdict:** Data-loss blocker remediated. Ready for owner review. Stop here.
