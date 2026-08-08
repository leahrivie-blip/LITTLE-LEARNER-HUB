# Training Deliverable — Amazing Apples & All About Me

Calibration set for premium Little Learner Hub Teaching Kits. Drafts only — nothing published.

## Score discrepancy resolved

Earlier queue screenshots showed ~70%/55% for two separate reasons:

1. `seed://` image URLs were stripped before scoring, so required images looked missing.
2. Enrichment activity keys used `planId:weekday:itemId`, while the live normalized plan flattens activities as `planId:itemId` (`sourceKey`). Patches did not apply, so the scorer treated activities as incomplete.

Both are fixed. Queue + Enrichment Editor now share `evaluateTeachingKit`. With draft printables still draft, honest scores are:

| Lesson | Structural | Premium | Publish | Blockers |
|---|---:|---:|---|---|
| Amazing Apples (Toddler) | 96% | 89% | blocked | draft_printables_only |

## Amazing Apples — Toddler

### Before vs after activity decisions

| Activity | Decision | Why |
|---|---|---|
| Apple Investigation | rewrite | Kept STEM look/touch; unique tips and allergy-safe boundaries. |
| Apple Stamp Painting | rewrite | Process emphasis; example illustration linked. |
| Count the Apples | rewrite | Dot matching before numerals; toddler dump-fill honored. |
| Pick the Apples | rewrite | Two-height picks; music pause for safety. |
| Apple Color Sort | rewrite | Sample anchors; purposeful substitutions. |
| My Favorite Apple Color | replace | Replaced template tissue craft with Apple Peel Tear Collage. |
| Apple Color Investigation | remove | Duplicate of Monday investigation. |
| Apple Color Dance | rewrite | Short color-cue freezes. |
| Big or Small? | rewrite | Clear size contrast; child debate welcomed. |
| Apple Measuring Station | rewrite | Setup illustration; non-standard units. |
| Round Apple Collage | remove | Duplicate of tear collage / stamp art. |
| Roll Like an Apple | rewrite | Log rolls first; mat safety. |
| Apple Taste Test | rewrite | Allergy protocol; equal non-taster roles. |
| Favorite Apple Graph | rewrite | Uses picture cards; includes non-tasters. |
| Apple Market | rewrite | Restock practice; polite phrase model. |
| Apple Basket Relay | remove | Duplicate locomotion of Pick the Apples. |
| Apple Life Cycle | rewrite | Uses PDF growth cards; setup image. |
| Apple Seed Discovery | rewrite | Adult cut; sealed seed jar. |
| My Apple Tree | rewrite | Process tree; no sticker rows. |
| Apple Harvest Celebration | rewrite | Short parade; vocabulary share. |

### Assets

- PDF: `Amazing-Apples-Picture-Card-Pack.pdf` (draft only)
- Images (4): `life-cycle-setup.png`, `measuring-station-setup.png`, `stamp-painting-example.png`, `tear-collage-example.png`
- Songs: Crunch Goes the Apple (LLH) [original]; Apple Seeds Wiggle (LLH) [original]; Basket Fill (LLH) [original]
- Books: Ten Apples Up On Top! — Theo LeSieg (Dr. Seuss); Apple Farmer Annie — Monica Wellington; Apples and Pumpkins — Anne Rockwell
- Contradiction scan: 0 blocking, 0 warnings
| All About Me (Preschool) | 96% | 89% | blocked | draft_printables_only |

## All About Me — Preschool

### Before vs after activity decisions

| Activity | Decision | Why |
|---|---|---|
| Mirror Me | rewrite | Copy child first; inclusive mirrors. |
| My Name Discovery | rewrite | Preferred names; setup illustration. |
| Family Photo Sharing | rewrite | Drawings accepted; no forced structure talk. |
| Family Graph | replace | Replaced with People in My Circle (no family-size ranking). |
| Body Part Movement Game | rewrite | Inclusive language; adapted motions. |
| Self-Portrait Studio | rewrite | Process example image; no adult model. |
| Family Dramatic Play | rewrite | Open role naming. |
| Friend Interview | rewrite | Safe picture prompts only. |
| Name Letter Hunt | rewrite | Name letters + decoys; no speed contests. |
| Height and Measure Me | replace | Replaced with Build & Measure My Tower (measure objects, not children). |
| Feelings Faces Art | rewrite | Optional emotion cues; mixed feelings OK. |
| All About Me Book Making | rewrite | Three pages; scribbles count. |
| Body Outline Tracing | replace | Replaced with Friendship Scarf Path (no body outlines). |
| Celebration Circle | rewrite | Opt-in sharing. |
| All About Me Movement Parade | rewrite | Mobility-device leaders included. |

### Assets

- PDF: `All-About-Me-Picture-Card-Pack.pdf` (draft only)
- Images (2): `name-discovery-setup.png`, `self-portrait-example.png`
- Songs: I Am Me (LLH Affirmation) [original]; Wiggle What You Will (LLH) [original]; Friends Wave Hello (LLH) [original]
- Books: I Like Myself! — Karen Beaumont; From Head to Toe — Eric Carle; Chrysanthemum — Kevin Henkes
- Contradiction scan: 0 blocking, 0 warnings

## Seed asset necessity

| Asset | Purpose |
|---|---|
| Amazing-Apples-Picture-Card-Pack.pdf | Color/life-cycle/growth cards used in sort, graph, Friday sequencing |
| stamp-painting-example.png | Example-only illustration for Apple Stamp Painting |
| tear-collage-example.png | Example for Apple Peel Tear Collage |
| measuring-station-setup.png | Setup for Apple Measuring Station |
| life-cycle-setup.png | Setup for Apple Life Cycle with PDF cards |
| All-About-Me-Picture-Card-Pack.pdf | Name/feelings/self visual supports |
| name-discovery-setup.png | Setup for My Name Discovery |
| self-portrait-example.png | Example for Self-Portrait Studio |

No page-preview PNGs, screenshots, or QA report images are included.

## Gold standard validator

`scripts/llh-curriculum-gold-standard.js` + `docs/curriculum-draft-review/LLH-CURRICULUM-GOLD-STANDARD.md`

Run before any future Draft Review submission. Queue remains a delivery tool only.
