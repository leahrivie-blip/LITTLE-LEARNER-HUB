# Teaching Kit Enrichment Editor — Slice 4

**Status:** Ready for owner review (do not merge / deploy / enable flag without approval)  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Depends on:** Slice 1–3 (approved)  
**Scope:** Activity Studio photo upload + private draft media handling  

---

## What Slice 4 delivers

| Area | Behavior |
| --- | --- |
| **Setup + finished example photos** | Drag/drop + click-to-upload in Activity Studio |
| **Replace / remove / full-size** | Replace uploads a new asset; Remove clears draft refs + deletes media; lightbox preview |
| **Optimize + thumbnails** | Server generates optimized full (≤1600px) + thumb (≤360px) via `sharp` |
| **Validation** | JPEG / PNG / WebP / GIF only; max **5 MB**; magic-byte check |
| **Storage** | Binaries in `llh_media_assets` (Postgres) or store-sidecar dir (local-json) — **never** in curriculum JSON |
| **Draft privacy** | Served only at `/api/admin/media/enrichment-photos/:id` with valid admin token; members/public get **404** |
| **Provider safety** | Draft photos stay out of provider Teaching Kit until a later Publish slice |
| **Fail-safe** | Missing/broken images show placeholders; invalid uploads rejected; data URLs stripped on draft save |
| **Draft save** | Single-lesson `enrichment_draft` only |

## Explicitly out of Slice 4

- Publishing enrichment to providers  
- AI tip suggestions  
- Print integration  
- Curriculum rewrite / migration / bulk updates  

---

## Storage behavior

1. Admin uploads image (data URL transport, same pattern as curriculum resource upload).  
2. Server validates type/size → optimizes full + thumb → stores bytes:
   - **Postgres:** `llh_media_assets` kind `teaching-kit-enrichment` (`{id}` + `{id}-thumb`)
   - **local-json:** `<LLH_STORE_PATH>.enrichment-media/` sidecar files (not inside curriculum JSON)
3. Draft stores only:
   - `setupImageUrl` / `exampleImageUrl` (admin media URL)
   - `setupImageThumbUrl` / `exampleImageThumbUrl`
   - `setupMediaAssetId` / `exampleMediaAssetId`
4. Provider mapper continues to ignore `enrichmentDraft` (Slice 3 parity).

## Real-lesson demo

Farm Animals (`cur-lp-preschool-farm-animals`) — Discovery Basket activity photos.

Screenshots from `npm run test:teaching-kit-enrichment-slice-4`:

| File | Viewport |
| --- | --- |
| `tk-enrich-slice4-farm-photos-desktop.png` | Desktop Activity Studio photos |
| `tk-enrich-slice4-farm-photos-tablet.png` | Tablet |
| `tk-enrich-slice4-farm-photos-mobile.png` | Mobile upload |

---

## Tests

```bash
npm run test:teaching-kit-enrichment-slice-4
npm run test:teaching-kit-enrichment-slice-3
npm run test:teaching-kit-enrichment-slice-2
npm run test:teaching-kit-enrichment-slice-1
npm run check
```

Slice 4 asserts:

- Valid upload → mediaAssetId + private URLs + optimized thumb  
- Invalid type → 400 `invalid_type`  
- Oversized → 400 `file_too_large`  
- Replace creates a new asset  
- Remove deletes bytes (subsequent GET 404)  
- Thumbnail served smaller/equal  
- Mobile `setInputFiles` upload path  
- Draft privacy (public/member 404; admin 200 + `Cache-Control: private`)  
- Broken-image fallback in studio  
- No `data:image` blobs in saved curriculum draft  
- Published lesson body + unrelated lesson unchanged  

---

## Files changed

| Path | Change |
| --- | --- |
| `server/enrichment-media.js` | **New** — validate, optimize, sanitize, local/Postgres helpers |
| `server/index.js` | Upload / serve / delete handlers; draft photo sanitization on save |
| `scripts/teaching-kit-enrichment-editor.js` | `photoUpload: true`; upload/replace/remove/lightbox; admin tokenized imgs |
| `scripts/teaching-kit-enrichment.js` | Thumb + mediaAssetId fields in draft view/merge |
| `scripts/teaching-kit-viewer.js` | Broken photo fallback |
| `scripts/test-teaching-kit-enrichment-slice-4.js` | **New** regression suite |
| `scripts/test-teaching-kit-enrichment-slice-1.js` … `slice-3.js` | Stop requiring `photoUpload === false` |
| `styles.css` | Dragover + broken-image styles |
| `package.json` | `sharp` dependency + `test:teaching-kit-enrichment-slice-4` + check |
| `index.html` | Cache bust |
| `docs/teaching-kit/ENRICHMENT_EDITOR_SLICE4.md` | This doc |
| `docs/teaching-kit/ENRICHMENT_EDITOR_UI_SPEC.md` / `README.md` | Slice index |

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Admin token in `<img src>` query for draft preview | Required for browser img tags; URLs stay admin-only; `Cache-Control: private, no-store` |
| `sharp` native dependency | Pinned; if unavailable optimizer falls back to original bytes (still no curriculum blobs) |
| Orphan media after replace | Replace deletes previous asset id best-effort |
| Accidental public exposure | No public route; serve handler always requires admin token |

---

## Rollback

1. Set `teachingKitEnrichmentEditor` to `false` (hides editor + upload/serve APIs).  
2. Draft photo URLs remain inert for members (never on provider TK).  
3. Revert Slice 4 commits if needed — no curriculum migration.  
4. Optional: delete `llh_media_assets` rows with `kind = teaching-kit-enrichment` or local `*.enrichment-media` sidecars.

---

## Approval gate

Stop here for owner review. Do **not** merge, deploy, enable flags, or begin Slice 5 until approved.
