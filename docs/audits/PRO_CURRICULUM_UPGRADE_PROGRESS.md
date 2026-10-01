# Pro Curriculum Upgrade — Progress Log

**Rule:** Every upgraded lesson stays **NOT PUBLISHED / REVIEW NEEDED**.  
**Draft channel:** `saveMode=enrichment_draft` (providers keep published content until you manually Publish Enrichment).

## Why not live Replace From Master Paste on published lessons?

Verified against `server/index.js`: `replace_from_master_paste` preserves `status: published` and overwrites live `dailyPlans` / activities. Entitled Pro providers would see new content immediately. That violates the absolute draft-only rule.

Established safe channel for published lessons (same as prior Teaching Kit premium repairs):

- Keep lesson `status: published` (catalog membership)
- Save upgraded authored fields into `enrichmentDraft`
- `enrichmentPublished` remains false
- Owner reviews in Teaching Kit editor, then publishes manually

Master Paste content is authored into upgrade JSON packages, matched 1:1 to live activity IDs/titles, then applied as enrichment draft patches (`replaceOwned: true`).

---

## Priority 1 — COMPLETE (drafts saved, nothing published)

| Title | ID | Age | Orig acts | Draft patches | Mapping | Draft save | Published? | Cover | QA |
|---|---|---|---:|---:|---|---|---|---|---|
| Pet Vet Clinic | `cur-lp-toddler-pet-vet-clinic` | Toddler | 25 | 25 | 25/25 | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Zoo Adventures | `cur-lp-toddler-zoo-adventures` | Toddler | 25 | 25 | 25/25 | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Camping Under the Stars | `cur-lp-toddler-camping-under-the-stars` | Toddler | 25 | 25 | 25/25 | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Pirate Adventure | `cur-lp-toddler-pirate-adventure` | Toddler | 25 | 25 | 25/25 | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Superhero Training Camp | `cur-lp-toddler-superhero-training-camp` | Toddler | 25 | 25 | 25/25 | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Apples in the Kitchen | `cur-lp-toddler-apples-in-the-kitchen` | Toddler | 20 | 20 | 20/20 | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Johnny Appleseed & Apple Fun | `cur-lp-toddler-johnny-appleseed-apple-fun` | Toddler | 20 | 20 | 20/20 | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |

### Live QA snapshot (admin hydrate after all Priority 1 writes)

For every Priority 1 lesson:

- Lesson ID unchanged
- `plan` still **Pro**
- Catalog `status` still **published** (providers see old live content)
- `enrichmentPublished` = **false**
- Live activity counts unchanged; all 5 weekdays present
- Draft patch counts match activity counts
- Draft weekly overview length differs from public overview (draft did not leak to public fields)
- Covers preserved; flagged **COVER IMAGE PENDING**
- Resource IDs preserved

### Per-lesson notes

#### Pet Vet Clinic
- All 25 activities substantially rewritten (objectives, what children do, prep, setup, steps, multi-prompts, safety, cleanup, adaptations, image briefs).
- Books updated to real pet/vet titles; songs include traditional + LLH chant.
- Printable ideas proposed (clinic signs, care choice cards) — not yet uploaded.
- Cover left pending; proposed activity: Veterinarian Dramatic Play Center.

#### Zoo Adventures
- 25/25 matched and drafted; zookeeper/habitat/movement focus (differentiated from Pet Vet).
- Cover pending.

#### Camping Under the Stars
- 25/25 matched and drafted; battery lights only; flashlight eye-safety notes.
- Cover pending.

#### Pirate Adventure
- 25/25 matched and drafted; toddler-safe treasure/map/boat play (no weapon focus).
- Cover pending; printables/images proposed in package, not yet uploaded.

#### Superhero Training Camp
- 25/25 matched and drafted; kindness/helping “powers,” obstacle play, process capes — not fighting.
- Cover pending.

#### Apples in the Kitchen
- 20/20 matched and drafted; **no child knives/stoves**; teacher-cooked cooled mash; optional allergy-aware tasting.
- Differentiated from Johnny week (kitchen/chef vs orchard/planting).
- Printable ideas: picture recipe cards, kitchen zone signs, café menus.
- Cover pending; proposed: Little Apple Kitchen.

#### Johnny Appleseed & Apple Fun
- 20/20 matched and drafted; orchard/planting/life-cycle talk with oversized cards (not worksheets).
- Seed safety: sealed bags / large props; choking watch.
- Real books: Houran Little Golden Book; Coombs Little Naturalists; Lindbergh; Hutchins; Hall.
- Differentiated from Apples in the Kitchen.
- Cover pending; proposed: Plant Your Own Apple Seed.
- Printable ideas: oversized life-cycle cards, orchard signs, seed–plant–water choice cards.

---

## Shared QA checklist (Priority 1)

- [x] Lesson IDs unchanged
- [x] Pro status unchanged
- [x] Lesson status remains published (catalog) while enrichment draft holds upgrades
- [x] `enrichmentPublished` false on all seven
- [x] No publish API called
- [x] Resource IDs preserved
- [x] Covers preserved (pending intentional replace)
- [x] Activity counts unchanged on live published records
- [x] 5 weekdays represented on live activities
- [x] Public/provider-facing authored fields not replaced by draft text

---

## Artifacts

- Upgrade packages: `curriculum-drafts/pro-upgrade/*.upgrade.json`
  - `pet-vet`, `zoo-adventures`, `camping`, `pirate`, `superhero`, `apples-kitchen`, `johnny-appleseed`
- Apply script: `scripts/apply-pro-upgrade-enrichment-draft.js` (reads secrets from env only)
- Results: `docs/audits/pro-upgrade-*-draft-result.json`

## Still pending (not blockers for draft review)

- Realistic activity/example images + branding footer
- Useful printable uploads/links (ideas recorded in packages)
- Cover swaps only when a strong realistic image is ready
- Owner manual review + Publish Enrichment (human only)

## Next

Begin **Priority 2** by need (generic AI-template wording, missing questions, weak setup, age issues, missing TK sections, weak images/printables)—still draft-only, small batches, never publish.
