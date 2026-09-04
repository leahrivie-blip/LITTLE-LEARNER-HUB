# Farm Animals — Gold-Standard Readiness Audit (Read-Only)

**Date:** 2026-08-08  
**Lesson ID:** `cur-lp-preschool-farm-animals`  
**Title:** Farm Animals  
**Age group:** Preschool  
**Theme:** Farm Animals  
**Scope:** Inspect only. No lesson edits, no image/printable generation, no publish.

---

## Data sources and limits

| Source | Role |
| --- | --- |
| `scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json` | Canonical local copy of Farm Animals + enrichment draft (Enrichment Editor Slice 2 demo) |
| `scripts/curriculum-preschool-free-imports/09-preschool-farm-animals-free.txt` | Original free-import text (richer daily narrative than stored plan) |
| Scoring helpers | `scripts/teaching-kit-enrichment.js` (`computeReadinessScores`, `buildUpgradeSummary`) |

**Live Admin draft was not fetched.** This environment has no `ADMIN_*` credentials, and the public production API is Cloudflare-challenged. If your current Admin unpublished draft differs from the Slice 2 fixture, treat differences as owner-side updates and re-run this audit against Admin before approving the gold standard.

**Important status note:** The base lesson in the fixture is **`status: "published"`**. The **unpublished** work is the `enrichmentDraft` channel (updated `2026-08-03`, last edited by `slice2-demo@littlelearnershub.local`). `enrichmentPublished` is absent. That matches the draft-only safety pattern; it is not a separate unpublished CMS lesson.

---

## Baseline snapshot

| Field | Value |
| --- | --- |
| Lesson ID | `cur-lp-preschool-farm-animals` |
| Title / Theme | Farm Animals |
| Age | Preschool |
| CMS status | published |
| Cover | empty (`coverImageUrl` blank) |
| Weekly overview / objectives / materials / vocab / family | Present at week level |
| Daily narrative fields (theme, materials, circle, safety, family, etc.) | **Empty on all five days** in stored plan |
| Daily activity slots | 3 titled items per weekday (15 total) |
| Linked Activity Library records | 15 published activities (IDs match import titles 1:1) |
| Books | 3 (title + author only) |
| Songs | 3 (title only) |
| Printables / resourceIds | none |
| Enrichment draft week object | `{}` (empty) |
| Enrichment draft activity patches | **5 of 15** (tips, substitutions, setting tags, observation prompts, vocabulary chips) |
| Version / publish history on fixture | none recorded in fixture |
| Teaching Kit claim | `teachingKit.completeness: "complete"`, `completionPercent: 100` — **misleading** vs readiness scores below |

---

## Exact Teaching Kit structure (as stored)

### Week / Overview

Present:

- Weekly overview (play-based farm life summary)
- Learning objectives (6 bullets — mostly theme verbs; several are weak/mastery-ish)
- Weekly materials list (affordable classroom staples)
- Vocabulary list (12 words)
- Family connection (short)
- Week-level adaptations + observation opportunities
- Books list (3) and songs list (3)

Missing / empty at week level (draft and published enrichment):

- Teacher Toolkit (prep, tips lists, cleanup shortcuts, documentation prompts, mixed-age, inclusion, substitutions lists, reflection)
- Teacher preparation checklist with time estimates
- Printables / linked resources
- Cover image
- Completed book discussion records
- Completed song teaching records (motions, rights, directions)
- Extension bank / milestone documentation prompts as toolkit sections

### Weekly Plan / Monday–Friday

Stored `dailyPlans[day]` shape exists for Mon–Fri with keys for theme, objectives, domains, materials, vocabulary, books, songs, circleTime, transitions, outdoorPlay, familyConnection, observations, adaptations, safetyNotes, and `items[]`.

**Reality:** every narrative field is empty string / empty array. Only `items[]` (activity title stubs) are populated. Activity bodies live on linked Activity Library records, not in daily narrative fields.

Import TXT still contains intended daily themes/objectives/materials/circle/outdoor text that **did not survive** into the fixture’s `dailyPlans` narrative fields. That is a save/mapping gap relative to the import source, not evidence that Admin currently has those fields filled.

### Activities (15)

| Day | Activities | Categories |
| --- | --- | --- |
| Monday | Farm Animal Discovery Basket; Old MacDonald Sing Along; Farm Animal Walk | Open-Ended Exploration; Music & Movement; Gross Motor |
| Tuesday | Animal Sorting Center; Muddy Pig Sensory Bin; Farm Animal Puzzle Table | Fine Motor; STEM/Discovery; Fine Motor |
| Wednesday | Farmer's Market Dramatic Play; Milking the Cow Fine Motor; Farm Story Read-Aloud | Dramatic Play; Fine Motor; Literacy |
| Thursday | Egg Carton Counting; Farm Collage Art; Brush the Horse Grooming | Open-Ended Exploration; Art; Circle Time |
| Friday | Farm Sound Bingo; Harvest Hoedown Dance; Farm Animals Celebration Circle | Open-Ended Exploration; Music & Movement; Circle Time |

Every activity has: title, short objective, short description, materials line, short setup, 5 numbered steps, teacher role, learning goals (3 short phrases), observation opportunities text, generic adaptations string, generic safety string.

Every activity is missing or empty on base record: teacher language/prompts, activity vocabulary, extensions (indoor/outdoor alternatives), age modifications, learning domain tags (`[]`), cleanup, documentation prompt, image URLs, printable links, image briefs.

Draft patches enrich **only** five activities (one per weekday highlight): Discovery Basket, Muddy Pig, Farmer’s Market, Egg Carton Counting, Farm Sound Bingo — with teacher tips, substitutions, setting tags, observation prompts, vocabulary chips. Image URL fields in those patches are still empty.

### Books / Songs / Printables / Images

| Asset | Count | Complete per enrichment rules? |
| --- | --- | --- |
| Books | 3 verified-looking titles/authors | No — no weekday placement, why-it-fits, before/during/after prompts, extension, substitute |
| Songs | 3 traditional titles | No — no rights status, motions, teaching directions; title-only |
| Linked printables | 0 | Fail |
| Cover image | 0 | Fail |
| Setup images | 0/15 | Fail |
| Example images | 0/15 | Fail |
| Image briefs only | 0 | N/A (not inflated) |

---

## Fields complete vs missing

### Complete enough to keep as foundation

- Theme identity and preschool age labeling
- Week overview + materials skeleton
- 15 distinct activity titles with basic setup/steps
- Sensible Mon–Fri activity mix (sensory, sort, dramatic play, care, count, art, movement, celebration)
- Affordable material choices
- 5 draft activity patches showing the *direction* of premium enrichment tone

### Still missing for gold-standard Teaching Kit

- Unique daily focus + day-specific materials/vocab/prep/circle/indoor/outdoor/small/large/observation/adaptations/safety/family
- Strong, observable objectives (week + activity)
- Full activity depth on all 15 (not 5): teacher language, cleanup, mixed-age, support/challenge, indoor/outdoor, domains, documentation
- Replacement of identical generic adaptations/safety on all 15
- Complete books (discussion) and songs (motions + legal status)
- Teacher Toolkit (lesson-specific)
- Real printables (not ideas)
- Real cover + activity images (not briefs alone)
- Draft week object content
- Honest completeness label (remove false 100% claim before publish)

---

## Writing tone

**Current tone:** Clear, calm, preschool-curriculum voice. Short sentences. Practical materials. Not cartoonish.

**Strengths:** Reads like a usable free lesson skeleton; activity steps are concrete (“Reach into basket…”, “Freeze when music stops”).

**Gaps vs experienced-provider premium voice:**

- Week objectives lean generic (“Name…”, “Practice…”) rather than observable classroom behaviors
- Daily import themes use template phrasing (“and related play (introduce the theme through…)”)
- Identical adaptations/safety across all activities (AI/boilerplate fingerprint)
- Empty teacher language removes the “what I say in the moment” provider feel
- Family connection is one thin sentence
- Draft tips on the five enriched activities are closer to the desired voice (specific setup + language) — use that as the tone floor for the rest

---

## Activity-detail standard (current)

| Requirement | Status |
| --- | --- |
| Original title | Pass (15 unique) |
| Specific objective | Partial — short; often weak |
| Provider-friendly description | Pass (1 line) |
| Exact inexpensive materials | Partial — lists exist; little substitution on 10/15 |
| Prep time | Missing |
| Clear setup | Pass (short) |
| Numbered directions | Pass (always 5 steps) |
| Teacher’s role | Pass (1 line) |
| Suggested questions / language | Fail (empty on all 15 base) |
| Learning domains | Fail (empty arrays) |
| Vocabulary | Fail on base; chips only on 5 draft patches |
| Observation opportunities | Pass (text present); draft prompts stronger on 5 |
| Documentation prompt | Missing |
| Support / challenge / mixed-age | Fail — one shared generic adaptations string |
| Indoor / outdoor alternatives | Missing |
| Supply substitutions | Only on 5 draft patches |
| Safety notes | Present but identical boilerplate |
| Cleanup directions | Missing |
| Setup / example image | Missing |
| Printable links | Missing |

**Verdict:** Structurally sketched, not premium-complete. Do not treat Slice 2 patches as “done activities.”

---

## Daily progression

**Intended progression (from import TXT + activity placement):**

| Day | Intended focus | Fit to recommended arc |
| --- | --- | --- |
| Monday | Introduce / notice / vocabulary / movement | Good |
| Tuesday | Sort / investigate / sensory STEM | Good |
| Wednesday | Real-life jobs / market / story / milking | Good |
| Thursday | Counting / care / creative collage | Good |
| Friday | Synthesize / game / dance / share | Good |

**Stored Teaching Kit problem:** Daily narrative fields are empty, so the Teaching Kit cannot *teach* that progression in Overview/Today surfaces — only activity titles imply it. Weekday focus completeness score is **0%** even though activity coverage is 5/5 days.

---

## Image needs

Minimum to clear image gates for this lesson:

1. Original cover (warm teacher-manual / brand cartoon of farm theme)
2. Setup image × 15 activities
3. Play-in-progress or finished-example image × 15 (when useful; both required by current readiness counters)

Also needed: captions, alt text, ownership metadata, image briefs before generation/upload.

Current: **0 uploaded images, 0 briefs.** Draft patches reserve empty URL fields only.

---

## Printable needs (proposed plan — not created)

High-value original printables for this theme (examples for later work):

- Real-photo or original-illustration farm animal vocabulary cards
- Habitat / product sorting cards
- Farm sound matching / bingo boards (original art)
- Farmer’s market signs + simple shopping list
- Egg carton number / dot cards
- Horse grooming sequence cards
- Family connection page
- Teacher setup card / observation sheet
- Song sheets only where rights allow (traditional titles with teaching directions; no modern copyrighted lyrics)

Current: **0 linked printables.** `resourceIds: []`.

---

## Book needs

| Title | Author | Current | Needed |
| --- | --- | --- | --- |
| Big Red Barn | Margaret Wise Brown | Title/author | Weekday placement, why, vocab link, before/during/after prompts, extension, substitute |
| Click, Clack, Moo | Doreen Cronin | Title/author | Same |
| Farm Animals | Roger Priddy | Title/author | Same |

Do not invent books. Verify editions before saving. No book-page scans in printables.

---

## Song needs

| Title | Current | Needed |
| --- | --- | --- |
| Old MacDonald Had a Farm | Title only | Rights status (traditional/PD), motions, how to introduce/adapt, teaching purpose, weekday placement; lyrics only if legally allowed |
| The Farmer in the Dell | Title only | Same |
| B-I-N-G-O | Title only | Same |

Title-only songs fail `songRecordComplete`. Prefer adding short **original** LLH transition/cleanup songs rather than reproducing modern copyrighted lyrics.

---

## Mismatched titles / Activity Library links

- Fixture activity titles **match** import titles 1:1 (15/15).
- No duplicate activity titles within the lesson.
- Categories are slightly uneven (two Fine Motor on Tuesday; Brush the Horse labeled Circle Time while behaving like practical-life/care — review during gold-standard rewrite).
- Learning domains empty on all activities despite week-level domain list.

---

## Fields that failed to save / mapping gaps

| Gap | Evidence |
| --- | --- |
| Daily narrative hollow | Import has DAILY_THEME / MATERIALS / CIRCLE / etc.; fixture `dailyPlans.*.theme|materials|…` empty |
| Draft week empty | `enrichmentDraft.week = {}` |
| Image URLs empty after Slice 2 | Patches include `setupImageUrl` / `exampleImageUrl` keys with no values |
| False completeness claim | `teachingKit.completionPercent: 100` while readiness is 37% / 25% |
| No version history in fixture | Cannot verify Admin restore chain from this file alone |

Published enrichment remains null — **good** (draft did not leak into published channel in this fixture).

---

## Duplicate resources

- **No duplicate titles** among the 15 activities.
- **Severe content duplication:** one adaptations string and one safety string copied to all 15 activities.
- Weekly vocabulary repeated as the only daily vocab in import; stored days have no daily vocab at all.
- Songs/books lack differentiation by weekday (no placement), so Friday celebration and Monday intro cannot bind the right title yet.

---

## Scores

### Automated (enrichment readiness)

| Dimension | Score |
| --- | --- |
| Structural completeness (component) | 82 |
| Educational quality (component) | 54 |
| Activity completeness | 0 |
| Weekday focus completeness | 0 |
| Resource completeness | 0 |
| Image readiness | 0 |
| Print readiness | 0 |
| **Structural completion %** | **37** |
| **Premium readiness %** | **25** |
| Dashboard stage | Needs Changes |
| Completeness label (honest) | Legacy |
| Misleading UI claim | Complete / 100% |

### Rubric scores for owner decision (manual, aligned to premium Teaching Kit standard)

| Score type | Score | Notes |
| --- | --- | --- |
| **Structural completion** | **38 / 100** | Week skeleton + 15 activity shells + 5 draft patches; hollow days; empty toolkit |
| **Curriculum quality** | **42 / 100** | Sensible weekly arc and activity mix; weak objectives; boilerplate adaptations; thin teacher language; not yet “experienced provider” depth |
| **Premium readiness** | **18 / 100** | No images, no printables, incomplete books/songs, no toolkit, draft week empty |
| **Publication readiness** | **Blocked (≈ 10 / 100)** | Must remain unpublished enrichment until quality gates clear; base published legacy may stay live |

**Do not treat Farm Animals as gold-standard complete.** It is the correct **structural model candidate** and priority #1 upgrade target. Slice 2 draft patches show the enrichment tone to extend — not text to copy into other lessons after approval.

---

## Recommended next owner actions (no automation yet)

1. Open Farm Animals in Admin Enrichment / Complete Kit workflow (owner account only).
2. Confirm whether live draft matches this fixture; if richer, export/snapshot before further work.
3. Manually finish Farm Animals to the premium bar (this audit’s missing list).
4. Approve Farm Animals as the gold-standard **structure and quality bar**.
5. Only then pilot **All About Me** and **Colors Everywhere** as drafts — stop for review.
6. Batches of ≤10 only after that approval.

---

## Artifact

Machine-readable capture: `/opt/cursor/artifacts/farm-animals-gold-audit/audit-raw.json` (local agent artifact; not required in git).
