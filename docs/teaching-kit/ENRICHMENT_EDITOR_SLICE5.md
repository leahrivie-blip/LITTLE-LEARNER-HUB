# Teaching Kit Enrichment Editor — Slice 5

**Status:** Ready for owner review (do not merge / deploy / enable flag without approval)  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Depends on:** Slice 1–4 (approved) + media lifecycle hardening  
**Scope:** Controlled publishing of enrichment drafts (atomic, versioned, single-lesson)

---

## What Slice 5 delivers

| Area | Behavior |
| --- | --- |
| **Explicit publish** | Admin clicks **Publish…** → confirmation summary → confirm |
| **Confirmation summary** | Lesson name, photo/tip counts, linked activities affected, completeness before→after, prior-version note |
| **Atomic publish** | Curriculum + linked activities + media visibility update in one store commit; wipe-blocked path rolls media visibility back |
| **Prior version** | Snapshot stored on `enrichmentPublishHistory` for rollback |
| **Single lesson** | Only the edited lesson plan id is published; unrelated lessons untouched |
| **Photo visibility** | Draft photos stay on `/api/admin/media/…` until publish; then `/api/media/enrichment-photos/…` |
| **No private URL leak** | Admin draft URLs are never written onto published lesson/activity fields |
| **Idempotent publish** | Duplicate publish (same fingerprint / empty draft) does not create another version |
| **Feature flag** | Publish API returns `404 enrichment_editor_disabled` when flag is off |

## Media lifecycle (verified before Slice 5)

| Rule | Behavior |
| --- | --- |
| Replace photo | New asset uploaded; old asset cleaned only after successful draft save if unreferenced |
| Remove photo | Draft reference cleared on save; unreferenced asset cleaned |
| Still referenced | Delete returns `409 asset_still_referenced` — never deletes |
| Failed upload | No partial full/thumb files; no registry row left behind |
| Failed draft save | Previous draft photo refs preserved; pending client cleanup not flushed |
| Draft privacy | Public `/api/media/enrichment-photos/:id` is **404** while `draft_private` |
| Published/shared guard | Cleanup skips `published` / `shared` (`409 asset_published_or_shared`) |
| Cleanup log | JSON lines with `assetId`, `lessonPlanId`, `reason`, `timestamp`, `result` |

Cleanup log path (local-json): `<LLH_STORE_PATH>.enrichment-media-cleanup.log`

## Explicitly out of Slice 5

- AI tip suggestions  
- Print integration  
- Bulk publish / multi-lesson publish  
- Enabling the feature flag in production  

---

## Publish flow

1. Admin edits enrichment draft (autosave / Save draft) — published lesson unchanged.  
2. **Publish…** opens confirmation summarizing exact impact.  
3. On confirm, client saves draft then `POST /api/admin/curriculum/lesson-plans` with `saveMode: "publish_enrichment"`.  
4. Server:
   - Fingerprints draft (idempotency)
   - Snapshots prior published state → `enrichmentPublishHistory`
   - Promotes draft photo URLs to public media URLs
   - Merges draft into the single lesson + its linked activities
   - Marks media registry visibility `published`
   - Clears `enrichmentDraft`
5. Providers see enrichment (including photos) only after step 4 succeeds.

---

## Real-lesson demo

Farm Animals (`cur-lp-preschool-farm-animals`) — Discovery Basket publish with setup photo + tips.

Screenshots from `npm run test:teaching-kit-enrichment-slice-5`:

| File | Viewport |
| --- | --- |
| `tk-enrich-slice5-publish-confirm-farm-animals.png` | Publish confirmation summary |
| `tk-enrich-slice5-publish-success-farm-animals.png` | Post-publish editor status |

---

## Tests

```bash
npm run test:teaching-kit-enrichment-media-lifecycle
npm run test:teaching-kit-enrichment-slice-5
npm run test:teaching-kit-enrichment-slice-4
npm run test:teaching-kit-enrichment-slice-3
npm run test:teaching-kit-enrichment-slice-2
npm run test:teaching-kit-enrichment-slice-1
npm run check
```

Slice 5 asserts:

- Successful publish merges tips/photos for Farm Animals only  
- Failed publish (stale concurrency) leaves published lesson intact  
- Draft remains private before publish  
- Photos become visible only after publish  
- Previous published version remains in `enrichmentPublishHistory`  
- No unrelated lesson changes  
- Free / Trial / Pro Teaching Kit access labels unchanged  
- Duplicate publish does not create duplicate versions  
- Flag-off blocks publish  

---

## Files changed

| Path | Change |
| --- | --- |
| `server/enrichment-media.js` | Public URL helpers, ref collection, cleanup logging, promote-to-public |
| `server/index.js` | Ref-safe cleanup; atomic `publish_enrichment`; public media route |
| `scripts/teaching-kit-enrichment-editor.js` | Deferred media cleanup; `publish: true`; confirmation modal |
| `scripts/test-teaching-kit-enrichment-media-lifecycle.js` | **New** lifecycle suite |
| `scripts/test-teaching-kit-enrichment-slice-5.js` | **New** publish suite |
| `scripts/test-teaching-kit-enrichment-slice-1.js` … `slice-4.js` | Align with publish capability + flag gating |
| `package.json` | New test scripts |
| `index.html` | Cache bust |
| `docs/teaching-kit/ENRICHMENT_EDITOR_SLICE5.md` | This doc |
| `docs/teaching-kit/ENRICHMENT_EDITOR_UI_SPEC.md` / `README.md` | Slice index |

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Partial publish | Single store write after in-memory merge; wipe-blocked rolls media visibility back |
| Private URL leak | `sanitizedPublishedEnrichmentImageUrl` strips admin draft URLs |
| Orphan media | Draft-save cleanup + ref checks; published/shared never deleted by cleanup |
| Duplicate versions | Fingerprint short-circuit returns `duplicate: true` |

---

## Rollback

1. Keep `teachingKitEnrichmentEditor` **false** (default).  
2. To restore a prior published enrichment: apply `enrichmentPublishHistory[0].snapshot` fields back onto the lesson (manual/admin follow-up — not auto-UI in this slice).  
3. Revert Slice 5 commits if needed — no curriculum migration required.

---

## Approval gate

Stop here for owner review. Do **not** merge, deploy, enable flags, or begin Slice 6 until approved.
