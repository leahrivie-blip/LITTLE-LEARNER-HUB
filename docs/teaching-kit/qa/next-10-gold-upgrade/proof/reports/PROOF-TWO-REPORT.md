# Honest proof revision — Amazing Apples + All About Me (PR #597)

**Status:** Draft PR only. Stop after these two lessons. No production import/apply/publish. No next batch.

**Batch:** `proof-two-revision-2026-08-08` (honest scoring revision)

## Scoring method (corrected)

| Mode | How scored |
|---|---|
| **Actual** | Linked printable `status=draft` in catalog. **No fake published credit.** |
| **Projected** | Same content scored as if owner published the printable after approval |
| Production publish count | **0** |

## Scores

| Lesson | Actual structural | Actual premium | Projected structural | Projected premium |
|---|---:|---:|---:|---:|
| Amazing Apples (Toddler) | **96%** | **89%** | 100% | 100% |
| All About Me (Preschool) | **96%** | **89%** | 100% | 100% |

**Why actual premium is 89%:** Product rule caps premium below 90% when printables are still draft (`printReadiness` 15, `hasLinkedPrintable` false). Claiming 100% while simulating publication was incorrect and has been removed.

**Quality publish block (actual):** `draft_printables_only` — expected until owner publishes resources.

## Contradiction scan

| Lesson | Contradictions | Empty required fields |
|---|---:|---:|
| Amazing Apples | **0** | **0** |
| All About Me | **0** | **0** |

Scan covers title, objective, description, steps, teacherRole, learningGoals, observationOpportunities, teacherLanguage, vocabulary, adaptations, extensions, and image-related copy. Affirmative leftover family-size / height / body-outline instructions fail the scan.

### People in My Circle (fixed)

Legacy contradictions removed from plan fields:

| Field | Was (bad) | Now |
|---|---|---|
| teacherRole | Help children place stickers and compare results | Coach belonging; pause ‘who has more’ talk |
| learningGoals | Data collection / Counting / Family representation | Trusted people / belonging / respect different circles |
| observationOpportunities | Reports family size / Compares quantities | Names caring people; kind response to different circles |
| objective/steps | Ranked family graph leftovers | Personal circles; no ranking |

Same cleanup applied to **Build & Measure My Tower** (no child-height leftovers) and **Friendship Scarf Path** (no body-outline tracing leftovers).

## Activity decisions

### Amazing Apples

| Activity | Decision |
|---|---|
| Apple Color Investigation | **Removed** (duplicate) |
| Round Apple Collage | **Removed** (duplicate) |
| Apple Basket Relay | **Removed** (duplicate locomotion) |
| My Favorite Apple Color | **Replaced** → Apple Peel Tear Collage |
| All other kept activities | **Substantially rewritten** (full plan fields + enrichment) |

### All About Me

| Activity | Decision |
|---|---|
| Family Graph | **Replaced** → People in My Circle |
| Height and Measure Me | **Replaced** → Build & Measure My Tower |
| Body Outline Tracing | **Replaced** → Friendship Scarf Path |
| All other kept activities | **Substantially rewritten** (full plan fields + enrichment) |

## Weekday plans

Generic “introduce the theme through literacy, sensory and language play” wording replaced with day-specific focus, materials, teacher preparation, activity flow, questions, observation focus, outdoor play, adaptations, and family connection (Mon–Fri) for both lessons.

## Printables (owner visual review required)

Customer-facing PDFs have **no DRAFT watermark**. Catalog status remains **draft** until you publish.

| Pack | PDF | Pages | Preview dir |
|---|---|---:|---|
| Amazing Apples | `docs/teaching-kit/qa/next-10-gold-upgrade/proof/amazing-apples/Amazing-Apples-Picture-Card-Pack.pdf` | 6 | `.../amazing-apples/pages/page-01.png` … `page-06.png` |
| All About Me | `docs/teaching-kit/qa/next-10-gold-upgrade/proof/all-about-me/All-About-Me-Picture-Card-Pack.pdf` | 16 | `.../all-about-me/pages/page-01.png` … `page-16.png` |

Artifact copies: `/opt/cursor/artifacts/proof-two/amazing-apples-pages/` (6) and `.../all-about-me-pages/` (16).

**Do not treat PDFs as approved merely because they exist** — please visually review every page for margins, cut lines, illustration quality, branding, and ink-friendly layout.

## Songs (all original LLH — uncertain PD replaced)

### Amazing Apples

| Song | Rights | Lyrics | Motions | Day | Evidence |
|---|---|---|---|---|---|
| Crunch Goes the Apple (LLH) | original | yes | yes | Thu | Written for this lesson |
| Apple Seeds Wiggle (LLH) | original | yes | yes | Fri | Replaces uncertain “Way Up High” PD claim |
| Basket Fill (LLH) | original | yes | yes | Tue | Original cleanup chant |

### All About Me

| Song | Rights | Lyrics | Motions | Day | Evidence |
|---|---|---|---|---|---|
| I Am Me (LLH Affirmation) | original | yes | yes | Mon | Written for this week |
| Wiggle What You Will (LLH) | original | yes | yes | Tue | Replaces uncertain Head/Shoulders PD claim |
| Friends Wave Hello (LLH) | original | yes | yes | Fri | Replaces uncertain More We Get Together PD claim |

Familiar classroom songs were **not** labeled public domain without reliable rights proof.

## Books (verified fields present)

Each book includes title, author, verification source, age fit, weekday, why, before / ≥2 during / after prompts, vocabulary connection, substitute, and no-book alternative.

**Amazing Apples:** Ten Apples Up On Top! (Theo LeSieg); Apple Farmer Annie (Monica Wellington); Apples and Pumpkins (Anne Rockwell)

**All About Me:** I Like Myself! (Karen Beaumont); From Head to Toe (Eric Carle); Chrysanthemum (Kevin Henkes)

## Duplicate-language scan

| Lesson | Dup tips | Generic tip templates | Bad substitutions |
|---|---:|---:|---:|
| Amazing Apples | 0 | 0 | 0 |
| All About Me | 0 | 0 | 0 |

## Persistence (disposable local store)

Draft PDF upload + enrichment draft save succeeded; survived refresh; `publishedUnchanged: true`. Production untouched.

## Remaining blockers

1. **Actual premium 89%** on both — expected while printables are draft; rises only after owner publishes resources
2. **Not in production admin TK** — repo proof + disposable store only
3. **Production feature flags not verified** — local disposable flags ≠ Render
4. **Owner visual approval of all PDF pages still required**
5. **Stop** — do not begin the other eight lessons until these two are approved

## Safety confirmations

| Check | Result |
|---|---|
| Nothing published to production | Confirmed |
| Farm Animals untouched | Confirmed |
| Customer flags unchanged in production | Confirmed (local ≠ production proof) |
| No fake published catalog in actual scores | Confirmed |
| PR #597 remains draft | Required |

## Rollback

- Branch: `cursor/tk-next-10-gold-upgrade-5d17`
- Plans: `cur-lp-toddler-amazing-apples`, `cur-lp-preschool-all-about-me`
- Runner: `scripts/run-proof-two-revision.js`
- Fields: `scripts/proof-two-plan-fields.js`
- Scan: `scripts/proof-two-contradiction-scan.js`

```bash
NODE_ENV=test node scripts/run-proof-two-revision.js
```
