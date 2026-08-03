# Teaching Kit Enrichment Editor — Slice 3

**Status:** Ready for owner review (do not merge / deploy / enable flag without approval)  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Depends on:** Slice 1 + Slice 2 (approved)  
**Scope:** Live Preview + draft-to-provider parity  

---

## What Slice 3 delivers

| Area | Behavior |
| --- | --- |
| **Live Preview** | Uses the real `LLHTeachingKitViewer` + `mapLessonPlanToTeachingKit` (same renderer providers use) |
| **Draft-driven** | Preview merges the current admin draft in memory — no publish required |
| **Draft Preview label** | Explicit banner + chip so admins never confuse preview with published |
| **Viewports** | Desktop / Tablet / Mobile preview frames + Mon–Fri day chips |
| **Activity surface** | Draft Preview auto-opens the first activity with tips/substitutions so enrichment is visible immediately |
| **Provider safety** | Provider Teaching Kit API strips `enrichmentDraft` before mapping |
| **Fail-safe** | Empty/malformed draft kits never break the editor shell or legacy lesson |
| **Draft save** | Still single-lesson `enrichment_draft` only |

## Explicitly out of Slice 3

- Publishing enrichment to providers  
- AI suggestions  
- Photo uploads  
- Print integration  
- Curriculum rewrite / migration / bulk updates  

---

## Parity rules

1. **Admin Draft Preview** = `mergeDraftIntoPlan(plan, activities, draft)` → same mapper → same viewer.  
2. **Published provider kit** = mapper on plan/activities **without** draft merge (`planForProviderMapping` deletes `enrichmentDraft`).  
3. Incomplete draft enrichment **must not** change the member Teaching Kit response.  
4. Empty enrichment fields fall back safely; preview failures show a message instead of crashing.

---

## Real-lesson demo

Farm Animals (`cur-lp-preschool-farm-animals`) with Slice 2 enrichment draft fixture:

`scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json`

Review screenshots from `npm run test:teaching-kit-enrichment-slice-3`:

| File | Viewport |
| --- | --- |
| `tk-enrich-slice3-farm-preview-desktop.png` | Desktop Draft Preview |
| `tk-enrich-slice3-farm-preview-tablet.png` | Tablet Draft Preview |
| `tk-enrich-slice3-farm-preview-mobile.png` | Mobile Draft Preview |

---

## Tests

```bash
npm run test:teaching-kit-enrichment-slice-3
npm run test:teaching-kit-enrichment-slice-2
npm run test:teaching-kit-enrichment-slice-1
npm run check
```

Slice 3 asserts:

- Draft kit includes enrichment tips; published kit does not (parity split)  
- Empty draft → draft kit matches published kit companion titles  
- Provider API ignores stored `enrichmentDraft` when TK viewer flag is on for the test  
- Live Preview UI shows Draft Preview label + real TK workspace nav  
- Desktop / tablet / mobile screenshots  

---

## Rollback

1. Set `teachingKitEnrichmentEditor` to `false` (hides editor + draft API).  
2. Provider kits remain draft-free (strip happens server-side regardless).  
3. Revert Slice 3 commits if needed — no curriculum migration to undo.  
4. Optional: leave any stored `enrichmentDraft` blobs; they stay inert for members.

---

## Approval gate

Stop here for owner review. Do **not** merge, deploy, enable flags, or begin Slice 4 until approved.
