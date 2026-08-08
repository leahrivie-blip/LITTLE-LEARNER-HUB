# Proof revision — Amazing Apples + All About Me (PR #597)

**Status:** Draft PR only. Stop after these two lessons. No production import/apply/publish. No next batch.

**Batch:** `proof-two-revision-2026-08-08`

## Scores (quality gate)

| Lesson | Structural before→after | Premium before→after | Gate |
|---|---:|---:|---|
| Amazing Apples (Toddler) | 47% → **100%** | 49% → **100%** | PASS (≥95 / ≥90) |
| All About Me (Preschool) | 47% → **100%** | 49% → **100%** | PASS (≥95 / ≥90) |

Automated gates: no duplicate tips, no generic tip templates, no fragment substitutions, quality publish blockers cleared in disposable proof scoring.

**Printable scoring note:** Finished US Letter PDFs exist on disk and were uploaded as **draft** resources in a disposable local store. Calculator used a published catalog entry **only inside the proof scorer** to evaluate finished-resource quality. **Production publish count = 0.**

## Safety confirmations

| Check | Result |
|---|---|
| Nothing published to production | **Confirmed** |
| Production import/apply not performed | **Confirmed** |
| Farm Animals untouched | **Confirmed** (no Farm files in diff; pending Farm picture pack/songs untouched) |
| Customer feature flags unchanged in production | **Confirmed** — local disposable store flags restored `false`; **local flags do not verify production Render config** |
| Generic HTML picture packs deleted | **Confirmed** (10 HTML packs removed from proposed deliverables) |
| Obsolete bulk JSON exports removed from `drafts/` | **Confirmed** — proof paths are canonical for these two lessons |
| PR #597 remains draft | **Required** — do not mark ready / merge until owner approval |

## Rollback identifiers

- Branch: `cursor/tk-next-10-gold-upgrade-5d17`
- Plan IDs: `cur-lp-toddler-amazing-apples`, `cur-lp-preschool-all-about-me`
- Proof resource IDs (local/disposable only): `cur-res-proof-amazing-apples-picture-cards`, `cur-res-proof-all-about-me-picture-cards`
- Draft JSON: `docs/teaching-kit/qa/next-10-gold-upgrade/proof/{amazing-apples,all-about-me}/enrichment-draft.json`
- Runner: `scripts/run-proof-two-revision.js`
- Batch: `proof-two-revision-2026-08-08`

To discard: revert this PR branch / delete proof draft JSON + PDFs; production was never written.

## Disposable-store persistence

| Lesson | PDF draft upload | Enrichment draft save | Survived refresh | Published unchanged |
|---|---|---|---|---|
| Amazing Apples | 200 | 200 | true | true |
| All About Me | 200 | 200 | true | true |

## Duplicate-language scan

| Lesson | Tip count | Duplicate tips | Generic templates | Bad substitutions |
|---|---:|---:|---:|---:|
| Amazing Apples | 34 | 0 | 0 | 0 |
| All About Me | 30 | 0 | 0 | 0 |

Rejected patterns scanned: “Set materials for [activity] at child height…”, “Model one move for…”, “What [theme] words…”, color-word fragment subs, “spare basket”, “household stand-in”.

---

## Amazing Apples — before/after activity table

| Activity | Decision | After |
|---|---|---|
| Apple Investigation | **Rewrite** | Unique tips; look/touch only; hand-lens sub |
| Apple Stamp Painting | **Rewrite** | Process stamps; example image |
| Count the Apples | **Rewrite** | Dot baskets before numerals |
| Pick the Apples | **Rewrite** | Two-height picks; music pause |
| Apple Color Sort | **Rewrite** | Sample anchors; paper-circle sub |
| My Favorite Apple Color | **Replace** | → **Apple Peel Tear Collage** |
| Apple Color Investigation | **Remove** | Duplicate of Monday investigation |
| Apple Color Dance | **Rewrite** | Short color-cue freezes |
| Big or Small? | **Rewrite** | Clear size contrast |
| Apple Measuring Station | **Rewrite** | Setup image; yarn/cubes |
| Round Apple Collage | **Remove** | Duplicate art |
| Roll Like an Apple | **Rewrite** | Log rolls first |
| Apple Taste Test | **Rewrite** | Allergy protocol; equal non-taster roles |
| Favorite Apple Graph | **Rewrite** | Uses picture cards |
| Apple Market | **Rewrite** | Restock practice |
| Apple Basket Relay | **Remove** | Duplicate locomotion |
| Apple Life Cycle | **Rewrite** | PDF growth cards; setup image |
| Apple Seed Discovery | **Rewrite** | Adult cut; sealed seed jar |
| My Apple Tree | **Rewrite** | Process tree |
| Apple Harvest Celebration | **Rewrite** | Short parade |

**Kept unchanged:** none (all kept activities were substantially rewritten).

### Printable (finished PDF)

- File: `docs/teaching-kit/qa/next-10-gold-upgrade/proof/amazing-apples/Amazing-Apples-Picture-Card-Pack.pdf`
- US Letter, 6 pages, unique illustrations (red/green/yellow/whole/half/seed/leaf/tree/basket/growth sequence)
- Branding + littlelearnershubbyleah.com on every page; DRAFT watermark
- Rendered pages: `proof/amazing-apples/pages/page-01.png` … `page-06.png`
- Artifact screenshots: `/opt/cursor/artifacts/proof-two/amazing-apples/`

### Required images

| Activity | Classification | Asset |
|---|---|---|
| Apple Stamp Painting | example_only | `images/stamp-painting-example.png` |
| Apple Peel Tear Collage | example_only | `images/tear-collage-example.png` |
| Apple Measuring Station | setup_only | `images/measuring-station-setup.png` |
| Apple Life Cycle | setup_only | `images/life-cycle-setup.png` |
| Apple Seed Discovery | setup_only | life-cycle tray cue |
| My Apple Tree | example_only | stamp process example |
| Songs / circle / ordinary movement | not_needed | — |

### Songs (rights evidence)

| Song | Rights | Evidence |
|---|---|---|
| Crunch Goes the Apple (LLH) | **original** | Written for this lesson; lyrics + motions present |
| Way Up High in the Apple Tree | **public_domain** | Traditional nursery fingerplay; documented in nursery-rhyme collections (e.g. allnurseryrhymes.com/way-up-high-in-the-apple-tree/). Not auto-labeled original. |
| Basket Fill (LLH) | **original** | LLH cleanup chant; lyrics + motions |

### Books (verification evidence)

| Title | Author | Source | Age | Day |
|---|---|---|---|---|
| Ten Apples Up On Top! | Theo LeSieg (Dr. Seuss) | PRH Beginner Books ISBN 9780394800196 | Toddler–early PS (adult paces) | Mon |
| Apple Farmer Annie | Monica Wellington | Dutton / library cataloging | Toddler–PS | Wed |
| Apples and Pumpkins | Anne Rockwell | Standard library cataloging | Toddler–PS | Fri |

Each book has before / ≥2 during / after prompts, vocabulary connection, substitute or no-book alternative.

---

## All About Me — before/after activity table

| Activity | Decision | After |
|---|---|---|
| Mirror Me | **Rewrite** | Copy child first; inclusive mirrors |
| My Name Discovery | **Rewrite** | Preferred names; setup image |
| Family Photo Sharing | **Rewrite** | Drawings accepted; no forced structure talk |
| Family Graph | **Replace** | → **People in My Circle** (no family-size ranking) |
| Body Part Movement Game | **Rewrite** | Inclusive / adapted motions |
| Self-Portrait Studio | **Rewrite** | Process example; no adult model |
| Family Dramatic Play | **Rewrite** | Open role naming |
| Friend Interview | **Rewrite** | Safe picture prompts |
| Name Letter Hunt | **Rewrite** | Name letters + decoys |
| Height and Measure Me | **Replace** | → **Build & Measure My Tower** (objects, not bodies) |
| Feelings Faces Art | **Rewrite** | Mixed feelings OK |
| All About Me Book Making | **Rewrite** | Three pages; scribbles count |
| Body Outline Tracing | **Replace** | → **Friendship Scarf Path** |
| Celebration Circle | **Rewrite** | Opt-in sharing |
| All About Me Movement Parade | **Rewrite** | Mobility-device leaders included |

### Printable (finished PDF)

- File: `docs/teaching-kit/qa/next-10-gold-upgrade/proof/all-about-me/All-About-Me-Picture-Card-Pack.pdf`
- US Letter, 16 pages; inclusive faces, families, emotions, interests, mobility (“Wheels & Joy”)
- No body-comparison worksheets; DRAFT branding on every page
- Rendered pages: `proof/all-about-me/pages/page-01.png` … `page-16.png`
- Artifact screenshots: `/opt/cursor/artifacts/proof-two/all-about-me/`

### Required images

| Activity | Classification | Asset |
|---|---|---|
| My Name Discovery | setup_only | `images/name-discovery-setup.png` |
| Self-Portrait Studio | example_only | `images/self-portrait-example.png` |
| Songs / circle / ordinary movement / interviews | not_needed | — |

### Songs (rights evidence)

| Song | Rights | Evidence |
|---|---|---|
| I Am Me (LLH Affirmation) | **original** | Written for this week; full lyrics |
| Head, Shoulders, Knees and Toes | **public_domain** | Traditional ECE movement song / oral tradition; adapted inclusive motions. Not labeled original. |
| The More We Get Together | **public_domain** | Traditional folk children’s verse used in ECE; not labeled original. |

### Books (verification evidence)

| Title | Author | Source | Age | Day |
|---|---|---|---|---|
| I Like Myself! | Karen Beaumont (ill. David Catrow) | karenbeaumont.com/i-like-myself/ + HMH ISBN 9780152020132 | Preschool | Mon |
| From Head to Toe | Eric Carle | HarperCollins / standard catalogs | Toddler–PS | Tue |
| Chrysanthemum | Kevin Henkes | Greenwillow / HarperCollins | Preschool (paced) | Wed |

---

## Remaining blockers (owner review)

1. **Not in production Teaching Kit workspace** — cloud agent has no production DB credentials; drafts live in repo proof paths + disposable local store only. Owner must import/review in admin when ready.
2. **Production feature flags not verified** — local disposable flags ≠ Render production config.
3. **PDF illustrations are original vector/process art**, not photographs — intentional; no fake classroom photos.
4. **Stop here** — do not begin the other eight lessons until these two are approved.

## How to re-prove locally

```bash
NODE_ENV=test node scripts/run-proof-two-revision.js
```

Outputs refresh under `docs/teaching-kit/qa/next-10-gold-upgrade/proof/`. After running, keep this fuller report (or re-apply from git) — the runner also writes a short score summary to the same path.
