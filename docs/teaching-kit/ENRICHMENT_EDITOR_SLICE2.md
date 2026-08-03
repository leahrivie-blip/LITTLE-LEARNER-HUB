# Teaching Kit Enrichment Editor — Slice 2

**Status:** Ready for owner review (do not merge / deploy / enable flag without approval)  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Depends on:** Slice 1 (approved)  
**Scope:** Activity Studio foundation — placeholders + editable enrichment fields  

---

## What Slice 2 delivers

| Area | Included |
| --- | --- |
| Setup photo **placeholders** | Read-only; upload stays off |
| Finished example photo **placeholders** | Read-only; upload stays off |
| Teacher tips | Add / remove in draft |
| Supply substitutions | Need → use cards in draft |
| Indoor / Outdoor | Setting chips |
| Small-group / Large-group | Setting chips |
| Observation prompts | Add / remove in draft |
| Activity vocabulary | Chip list in draft |
| Draft save | Single-lesson `enrichment_draft` only |

## Explicitly out of Slice 2

- Photo uploads (drag/drop, replace, remove-to-replace)
- AI suggestions
- Publishing enrichment to providers
- Live Preview (provider Teaching Kit viewer)
- Print integration
- Curriculum rewrite, migration, bulk updates, conversion

---

## Real-lesson demo fixture

`scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json`

- Source lesson: **Farm Animals** (`cur-lp-preschool-farm-animals`) — existing preschool plan  
- 15 linked activities preserved from curriculum  
- Enrichment draft populates 5 highlight activities (Mon–Fri) with tips, substitutions, chips, observations, vocabulary  
- Photo fields left empty so placeholders show honestly  

Review artifacts (written by `npm run test:teaching-kit-enrichment-slice-2`):

| File | What it shows |
| --- | --- |
| `tk-enrich-slice2-farm-desktop.png` | Full Enrichment Editor on Farm Animals (desktop) |
| `tk-enrich-slice2-farm-mobile.png` | Full Enrichment Editor on Farm Animals (mobile) |
| `tk-enrich-slice2-farm-studio-desktop.png` | Activity Studio stage with populated tips/subs/chips |
| `tk-enrich-slice2-farm-studio-mobile.png` | Activity Studio stage (mobile) |

---

## Safety constraints

1. Everything remains behind `teachingKitEnrichmentEditor` (default false).  
2. Draft save updates **only** `enrichmentDraft` on the **current** lesson id.  
3. No bulk curriculum writes; no conversion of existing plans.  
4. Schema changes are additive optional fields already used by the draft channel / activity normalize path (`teacherTips`, `substitutions`, `settingTags`, vocabulary text, observation text).  
5. Members ignore `enrichmentDraft` until a later publish slice.

---

## Local review

1. Temporarily set `teachingKitEnrichmentEditor: true`.  
2. Open **Farm Animals** → Enrich Teaching Kit (or load the Slice 2 fixture in the test harness).  
3. Confirm Activity Studio fields on Discovery Basket / Muddy Pig / etc.  
4. Save draft; confirm other lessons untouched.  
5. Reset flag to `false`.

---

## Tests & viewports

```bash
npm run test:teaching-kit-enrichment
npm run test:teaching-kit-enrichment-slice-2
npm run check
```

Slice 2 test covers:

- Flag still required for draft API  
- Publish still disabled  
- Farm Animals fixture draft round-trip (tips / subs / tags / obs / vocab)  
- Desktop (1280) + mobile (390) editor verification with populated real lesson  
- Screenshots for owner review  

---

## Rollback

1. Set `teachingKitEnrichmentEditor` to `false` (immediate hide).  
2. Stored `enrichmentDraft` blobs remain inert for members.  
3. Revert Slice 2 commits if needed; no migration to undo.  
4. Do **not** bulk-delete drafts unless intentionally clearing admin work.

---

## Approval gate

Stop here for owner review before Slice 3 (photo uploads / Live Preview / publish as planned).
