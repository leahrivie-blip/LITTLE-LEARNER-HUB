# Infant / Toddler Pro Gold Standard Pre-Import Audit

Generated: 2026-07-21T03:32:31.741Z

**Status: NO FILES WERE IMPORTED OR PUBLISHED.** Paste files were audited only.

## Summary

- Files reviewed: **21**
- Ready for import (no blockers): **20**
- Blocked / needs repair: **1**
- Possible duplicate themes to compare: **4**

## Common repair themes

1. Change `PLAN: PRO` → `PLAN: Pro`.
2. Replace non-standard categories (`Math`, `Engineering`, `Science`, `Creative Arts`, `Social Emotional`, etc.) with importer categories: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
3. Convert `ACTIVITY_1_NAME` / `ACTIVITY_1_CATEGORY` style (Toddler Pro batch 2 / some batch 3) into gold-standard `ACTIVITY_NAME` + `CATEGORY` blocks.
4. Complete stub files (Construction Zone) with full Mon–Fri content — do not import scaffolds.
5. Resolve near-duplicate themes against existing core/pro plans before publishing.

## Per-file results

### Zoo Animals

- File: `scripts/curriculum-infant-pro-batch2-imports/01-infant-zoo-animals-pro.txt`
- Age: Infant 0-12 Months
- Theme: Zoo Animals
- Plan: Pro
- Size: 22191 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Baby Sign Language

- File: `scripts/curriculum-infant-pro-batch2-imports/02-infant-baby-sign-language-pro.txt`
- Age: Infant 0-12 Months
- Theme: Early Communication Through Signs, Gestures, Sounds, and Responsive Care
- Plan: Pro
- Size: 22844 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Woodland Animals

- File: `scripts/curriculum-infant-pro-batch2-imports/03-infant-woodland-animals-pro.txt`
- Age: Infant 0-12 Months
- Theme: Woodland Animals and Nature
- Plan: Pro
- Size: 22075 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Pets We Love

- File: `scripts/curriculum-infant-pro-batch2-imports/04-infant-pets-we-love-pro.txt`
- Age: Infant 0-12 Months
- Theme: Pets and Caring Relationships
- Plan: Pro
- Size: 21540 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Texture Adventures

- File: `scripts/curriculum-infant-pro-batch2-imports/05-infant-texture-adventures-pro.txt`
- Age: Infant 0-12 Months
- Theme: Sensory Textures
- Plan: Pro
- Size: 20145 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Move & Groove Babies

- File: `scripts/curriculum-infant-pro-batch2-imports/06-infant-move-and-groove-babies-pro.txt`
- Age: Infant 0-12 Months
- Theme: Music, Movement, and Body Awareness
- Plan: Pro
- Size: 21124 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Duplicate candidates:
  - (0.6) Music and Movement (Infant 0-6 Months) — `scripts/curriculum-infant-core-imports/infant-music-and-movement-0-6-months.txt`
  - (0.6) Music and Movement (Infant 6-12 Months) — `scripts/curriculum-infant-core-imports/infant-music-and-movement-6-12-months.txt`
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.
  - Possible duplicate (0.6): "Music and Movement (Infant 0-6 Months)" in scripts/curriculum-infant-core-imports/infant-music-and-movement-0-6-months.txt
  - Possible duplicate (0.6): "Music and Movement (Infant 6-12 Months)" in scripts/curriculum-infant-core-imports/infant-music-and-movement-6-12-months.txt

### Construction Zone

- File: `scripts/curriculum-toddler-pro-batch2-imports/01-toddler-construction-zone-pro.txt`
- Age: Toddler 2-3 Years
- Theme: (missing)
- Plan: Pro
- Size: 239 chars · Days parsed: 0 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - File is a scaffold/stub — not complete enough to import.
  - File is unusually short (239 chars) for a paid Pro weekly plan.
  - Parse error: Paste a complete lesson plan using TITLE:, AGE_GROUP:, THEME:, PLAN:, STATUS:, WEEKLY_OVERVIEW:, weekday headers (MONDAY–FRIDAY), and ACTIVITY_NAME: blocks. No special markers are required.
  - Could not build a usable structured lesson plan from this paste format.
  - Preview block: Paste a complete lesson plan using TITLE:, AGE_GROUP:, THEME:, PLAN:, STATUS:, WEEKLY_OVERVIEW:, weekday headers (MONDAY–FRIDAY), and ACTIVITY_NAME: blocks. No special markers are required.
  - Preview block: TITLE is required. Put the lesson name at the top so the importer can place it correctly.
  - Preview block: THEME is required. Every activity must match this theme — do not leave theme blank or paste unrelated content.
  - Preview block: AGE_GROUP is required (Infant 0–6 Months, Infant 6–12 Months, Toddler, or Preschool).
- Warnings:
  - Preview: Unrecognized paste format. Use V3 Strict labels or switch to V5 Flexible Import for ChatGPT-style pastes.

### Farm STEM

- File: `scripts/curriculum-toddler-pro-batch2-imports/02-toddler-farm-stem-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Farm STEM
- Plan: Pro
- Size: 17144 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Duplicate candidates:
  - (0.5) Farm Friends — `scripts/curriculum-toddler-core-imports/toddler-farm-friends.txt`
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Little Bakers

- File: `scripts/curriculum-toddler-pro-batch2-imports/03-toddler-little-bakers-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Little Bakers
- Plan: Pro
- Size: 16375 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Transportation Builders

- File: `scripts/curriculum-toddler-pro-batch2-imports/04-toddler-transportation-builders-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Transportation Builders
- Plan: Pro
- Size: 16090 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Little Scientists

- File: `scripts/curriculum-toddler-pro-batch2-imports/05-toddler-little-scientists-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Little Scientists
- Plan: Pro
- Size: 17326 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Amazing Insects

- File: `scripts/curriculum-toddler-pro-batch3-imports/01-toddler-amazing-insects-pro.txt`
- Age: Toddler (2–3 Years)
- Theme: Amazing Insects
- Plan: Pro
- Size: 17283 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Nature Explorers

- File: `scripts/curriculum-toddler-pro-batch3-imports/02-toddler-nature-explorers-pro.txt`
- Age: Toddler (2–3 Years)
- Theme: Nature Explorers
- Plan: Pro
- Size: 14166 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Rainbow Science

- File: `scripts/curriculum-toddler-pro-batch3-imports/03-toddler-rainbow-science-pro.txt`
- Age: Toddler (2–3 Years)
- Theme: Rainbow Science
- Plan: Pro
- Size: 14795 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Busy Builders

- File: `scripts/curriculum-toddler-pro-batch3-imports/04-toddler-busy-builders-pro.txt`
- Age: Toddler (2–3 Years)
- Theme: Busy Builders
- Plan: Pro
- Size: 15309 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Weather Lab

- File: `scripts/curriculum-toddler-pro-batch3-imports/05-toddler-weather-lab-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Weather Lab
- Plan: Pro
- Size: 13552 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Apple Orchard Adventures

- File: `scripts/curriculum-toddler-pro-batch3-imports/06-toddler-apple-orchard-adventures-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Apple Orchard Adventures
- Plan: Pro
- Size: 13059 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Duplicate candidates:
  - (0.5) Apple Orchard Adventure — `scripts/curriculum-toddler-pro-imports/13-toddler-apple-orchard-adventure-pro.txt`
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Pond Life Explorers

- File: `scripts/curriculum-toddler-pro-batch3-imports/07-toddler-pond-life-explorers-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Pond Life Explorers
- Plan: Pro
- Size: 12084 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Growing Gardens STEM

- File: `scripts/curriculum-toddler-pro-batch3-imports/08-toddler-growing-gardens-stem-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Growing Gardens STEM
- Plan: Pro
- Size: 12386 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Duplicate candidates:
  - (1) Growing Gardens — `scripts/curriculum-toddler-core-imports/toddler-growing-gardens.txt`
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.
  - Possible duplicate (1): "Growing Gardens" in scripts/curriculum-toddler-core-imports/toddler-growing-gardens.txt

### Space Explorers STEM

- File: `scripts/curriculum-toddler-pro-batch3-imports/09-toddler-space-explorers-stem-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Space Explorers STEM
- Plan: Pro
- Size: 12343 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Fossil Hunters

- File: `scripts/curriculum-toddler-pro-batch3-imports/10-toddler-fossil-hunters-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Fossil Hunters
- Plan: Pro
- Size: 13968 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

## Monthly curriculum note

Monthly curriculum collections (Week 1–4 + optional Week 5) should live inside Lesson Plans as Netflix-style collections, not a second lesson-plan system.
Phase 1 foundation already exists on `cursor/monthly-curriculum-phase1-a1ac` (`CurriculumSeries` links weekly plan IDs; UI lives in Lesson Plans).
Finish/rebase monthly collections only after weekly plans are Gold Standard–ready.

Planned monthly capabilities:

- Monthly overview + monthly learning goals
- Four linked weekly lesson plans (optional fifth week)
- Full-month materials list
- Family connection / newsletter
- Add entire month to calendar
- Print / download entire month
- Still open any single week on its own

## Cover images

Do not roll themed covers across every plan until mockups are approved.
Review samples in `mockups/infant-toddler-pro-covers/index.html`.

## Duplicate watchlist (compare before import)

| New plan | Existing similar plan | Notes |
|---|---|---|
| Growing Gardens STEM | toddler-growing-gardens.txt | Exact/near title match — differentiate or skip |
| Apple Orchard Adventures | 13-toddler-apple-orchard-adventure-pro.txt | Overlaps existing Apple Pro unit |
| Farm STEM | toddler-farm-friends.txt | Differentiate STEM farm vs farm friends |
| Move & Groove Babies | Infant Music and Movement core plans | Differentiate movement focus |

## Next steps

1. Repair every **NOT READY** file (categories, PLAN casing, ACTIVITY_NAME format, Construction Zone stub).
2. Re-run `npm run audit:infant-toddler-pro-batches` until ready count rises.
3. Approve cover mockups.
4. Import + publish only then.
5. Group into monthly curriculum collections and regression-test viewer/mobile/admin/print/calendar/favorites/permissions/covers.
