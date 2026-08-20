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

## Batch progress

| Title | ID | Age | Orig acts | Draft patches | Mapping | Draft save | Published? | Cover | QA |
|---|---|---|---:|---:|---|---|---|---|---|
| Pet Vet Clinic | `cur-lp-toddler-pet-vet-clinic` | Toddler | 25 | 25 | 25/25 matched | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Zoo Adventures | `cur-lp-toddler-zoo-adventures` | Toddler | 25 | 25 | 25/25 matched | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Camping Under the Stars | `cur-lp-toddler-camping-under-the-stars` | Toddler | 25 | 25 | 25/25 matched | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | PASS |
| Pirate Adventure | `cur-lp-toddler-pirate-adventure` | Toddler | 25 | 25 | 25/25 matched | OK (re-author JSON after thin overwrite — re-apply recommended) | **NOT PUBLISHED** | COVER IMAGE PENDING | JSON QA PASS |
| Superhero Training Camp | `cur-lp-toddler-superhero-training-camp` | Toddler | 25 | 25 | 25/25 matched | OK | **NOT PUBLISHED** | COVER IMAGE PENDING | JSON QA PASS |
| Apples in the Kitchen | `cur-lp-toddler-apples-in-the-kitchen` | Toddler | 20 | — | — | pending | — | — | — |
| Johnny Appleseed & Apple Fun | `cur-lp-toddler-johnny-appleseed-apple-fun` | Toddler | 20 | — | — | pending | — | — | — |

### Per-lesson notes

#### Pet Vet Clinic
- All 25 activities substantially rewritten (objectives, what children do, prep, setup, steps, multi-prompts, safety, cleanup, adaptations, image briefs).
- Books updated to real pet/vet titles; songs include traditional + LLH chant.
- Printable ideas proposed (clinic signs, care choice cards) — not yet uploaded.
- Cover left pending; proposed activity: Veterinarian Dramatic Play Center.
- Public overview still shows pre-upgrade text (confirmed draft did not leak).

#### Zoo Adventures
- 25/25 matched and drafted; zookeeper/habitat/movement focus (differentiated from Pet Vet).
- Cover pending.

#### Camping Under the Stars
- 25/25 matched and drafted; battery lights only; flashlight eye-safety notes.
- Cover pending.

#### Pirate Adventure
- Upgrade JSON authored (`curriculum-drafts/pro-upgrade/pirate.upgrade.json`); 25/25 live titles preserved.
- Safety: no eye patches/weapons; cardboard telescopes; floor-level planks; large coins only; graduation reframed as celebration.
- Cover pending; proposed activity: Ocean Adventure Pretend Play.
- Enrichment draft was applied once from an earlier thin package; substantial JSON was rewritten afterward — re-apply enrichment draft from current JSON before owner review.
- Live published content unchanged (`enrichmentPublished` false).

#### Superhero Training Camp
- Upgrade JSON authored (`curriculum-drafts/pro-upgrade/superhero.upgrade.json`); 25/25 live titles preserved.
- Kindness-focused heroes (helping, not fighting); picture mission cards (no worksheets); graduation reframed as celebration.
- Cover pending; proposed activity: Helping Hands Art Project.
- Enrichment draft applied 25/25; not published to providers.

---

## QA checklist (completed for first three)

- [x] Lesson ID unchanged
- [x] Pro status unchanged
- [x] Lesson status remains published (catalog) while enrichment draft holds upgrades
- [x] `enrichmentPublished` false
- [x] No publish API called
- [x] Resource IDs preserved
- [x] Cover preserved (pending intentional replace)
- [x] Activity count unchanged on live published records
- [x] 5 weekdays still represented on live activities
- [x] Draft activity patch count = 25
- [x] Public lesson endpoint still locked / old overview for Pet Vet

---

## Artifacts

- Upgrade packages: `curriculum-drafts/pro-upgrade/*.upgrade.json`
- Apply script: `scripts/apply-pro-upgrade-enrichment-draft.js` (reads secrets from env only)
- Results: `docs/audits/pro-upgrade-*-draft-result.json`

## Next

Continue Priority 1: apply Pirate + Superhero enrichment drafts when credentials available → Apples in the Kitchen → Johnny Appleseed & Apple Fun.
