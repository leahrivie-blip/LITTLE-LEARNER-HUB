# Infant / Toddler Pro Gold Standard Pre-Import Audit

Generated: 2026-07-21T03:21:13.733Z

**Status: NO FILES WERE IMPORTED OR PUBLISHED.** Paste files were audited only.

## Summary

- Files reviewed: **21**
- Ready for import (no blockers): **2**
- Blocked / needs repair: **19**
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
- Size: 22193 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Baby Sign Language

- File: `scripts/curriculum-infant-pro-batch2-imports/02-infant-baby-sign-language-pro.txt`
- Age: Infant 0-12 Months
- Theme: Early Communication Through Signs, Gestures, Sounds, and Responsive Care
- Plan: Pro
- Size: 22856 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - Invalid CATEGORY "Social Emotional". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Language & Literacy". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Parse error: monday: "More or All Done Bubble Turns" has invalid CATEGORY "Social Emotional". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: wednesday: "Help Sign Mirror Imitation" has invalid CATEGORY "Social Emotional". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - monday activity 1 (More or All Done Bubble Turns): blank/missing Category
  - wednesday activity 2 (Help Sign Mirror Imitation): blank/missing Category
  - Standards (high): monday "More or All Done Bubble Turns": missing Category
  - Standards (high): wednesday "Help Sign Mirror Imitation": missing Category
  - Preview block: monday: "More or All Done Bubble Turns" has invalid CATEGORY "Social Emotional". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Preview block: wednesday: "Help Sign Mirror Imitation" has invalid CATEGORY "Social Emotional". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Woodland Animals

- File: `scripts/curriculum-infant-pro-batch2-imports/03-infant-woodland-animals-pro.txt`
- Age: Infant 0-12 Months
- Theme: Woodland Animals and Nature
- Plan: Pro
- Size: 22076 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - Invalid CATEGORY "Cognitive Development". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Parse error: wednesday: "Where Is Bear?" has invalid CATEGORY "Cognitive Development". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - wednesday activity 2 (Where Is Bear?): blank/missing Category
  - Standards (high): wednesday "Where Is Bear?": missing Category
  - Preview block: wednesday: "Where Is Bear?" has invalid CATEGORY "Cognitive Development". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Pets We Love

- File: `scripts/curriculum-infant-pro-batch2-imports/04-infant-pets-we-love-pro.txt`
- Age: Infant 0-12 Months
- Theme: Pets and Caring Relationships
- Plan: Pro
- Size: 21532 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - Invalid CATEGORY "Cognitive Play". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Listening Game". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Parse error: tuesday: "Where Is the Kitty?" has invalid CATEGORY "Cognitive Play". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: thursday: "Find the Tweet" has invalid CATEGORY "Listening Game". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - tuesday activity 2 (Where Is the Kitty?): blank/missing Category
  - thursday activity 2 (Find the Tweet): blank/missing Category
  - Standards (high): tuesday "Where Is the Kitty?": missing Category
  - Standards (high): thursday "Find the Tweet": missing Category
  - Preview block: tuesday: "Where Is the Kitty?" has invalid CATEGORY "Cognitive Play". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Preview block: thursday: "Find the Tweet" has invalid CATEGORY "Listening Game". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Texture Adventures

- File: `scripts/curriculum-infant-pro-batch2-imports/05-infant-texture-adventures-pro.txt`
- Age: Infant 0-12 Months
- Theme: Sensory Textures
- Plan: Pro
- Size: 20147 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: true
- Verdict: **READY (pending duplicate/cover review)**
- Warnings:
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Move & Groove Babies

- File: `scripts/curriculum-infant-pro-batch2-imports/06-infant-move-and-groove-babies-pro.txt`
- Age: Infant 0-12 Months
- Theme: Music, Movement, and Body Awareness
- Plan: Pro
- Size: 21120 chars · Days parsed: 5 · Activities parsed: 10 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Duplicate candidates:
  - (0.6) Music and Movement (Infant 0-6 Months) — `scripts/curriculum-infant-core-imports/infant-music-and-movement-0-6-months.txt`
  - (0.6) Music and Movement (Infant 6-12 Months) — `scripts/curriculum-infant-core-imports/infant-music-and-movement-6-12-months.txt`
- Blockers:
  - Invalid CATEGORY "Social Emotional". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Parse error: friday: "Move Then Rest" has invalid CATEGORY "Social Emotional". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - friday activity 2 (Move Then Rest): blank/missing Category
  - Standards (high): friday "Move Then Rest": missing Category
  - Preview block: friday: "Move Then Rest" has invalid CATEGORY "Social Emotional". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
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
- Plan: PRO
- Size: 19034 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Duplicate candidates:
  - (0.5) Farm Friends — `scripts/curriculum-toddler-core-imports/toddler-farm-friends.txt`
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Engineering". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - Standards (high): thursday: missing Circle Time
  - Standards (high): thursday: missing Observation Opportunities
  - …and 8 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

### Little Bakers

- File: `scripts/curriculum-toddler-pro-batch2-imports/03-toddler-little-bakers-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Little Bakers
- Plan: PRO
- Size: 18268 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Self-Help". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - Standards (high): thursday: missing Circle Time
  - Standards (high): thursday: missing Observation Opportunities
  - …and 8 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

### Transportation Builders

- File: `scripts/curriculum-toddler-pro-batch2-imports/04-toddler-transportation-builders-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Transportation Builders
- Plan: PRO
- Size: 17974 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Engineering". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - Standards (high): thursday: missing Circle Time
  - Standards (high): thursday: missing Observation Opportunities
  - …and 8 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

### Little Scientists

- File: `scripts/curriculum-toddler-pro-batch2-imports/05-toddler-little-scientists-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Little Scientists
- Plan: PRO
- Size: 19217 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Engineering". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Social-Emotional". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - Standards (high): thursday: missing Circle Time
  - …and 9 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

### Amazing Insects

- File: `scripts/curriculum-toddler-pro-batch3-imports/01-toddler-amazing-insects-pro.txt`
- Age: Toddler (2–3 Years)
- Theme: Amazing Insects
- Plan: PRO
- Size: 17559 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Invalid CATEGORY "Engineering". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Creative Arts". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Math". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Cooperative Play". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Science". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Creative Reflection". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: monday: "Bug Movement Trail" has invalid CATEGORY "Engineering". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: monday: "Build a Bug Home" is missing CATEGORY.
  - Parse error: tuesday: "Dot Sticker Ladybugs" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: tuesday: "Ladybug Playdough" is missing CATEGORY.
  - Parse error: wednesday: "Clip the Butterfly Wings" is missing CATEGORY.
  - Parse error: thursday: "Ant Food Delivery" has invalid CATEGORY "Engineering". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: thursday: "Build an Ant Tunnel" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: thursday: "Ant Line Counting" is missing CATEGORY.
  - Parse error: friday: "Insect Observation Lab" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: friday: "Sort the Bugs" has invalid CATEGORY "Creative Reflection". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: friday: "My Favorite Bug Drawing" is missing CATEGORY.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday activity 1 (Hidden Bug Sensory Bin): only 1 direction(s); need 3–5 clear steps
  - monday activity 2 (Bug Movement Trail): blank/missing Category
  - monday activity 2 (Bug Movement Trail): only 1 direction(s); need 3–5 clear steps
  - monday activity 3 (Build a Bug Home): blank/missing Category
  - monday activity 3 (Build a Bug Home): only 1 direction(s); need 3–5 clear steps
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday activity 1 (Dot Sticker Ladybugs): blank/missing Category
  - tuesday activity 1 (Dot Sticker Ladybugs): only 1 direction(s); need 3–5 clear steps
  - tuesday activity 2 (Ladybug Spot Match): only 1 direction(s); need 3–5 clear steps
  - tuesday activity 3 (Ladybug Playdough): blank/missing Category
  - tuesday activity 3 (Ladybug Playdough): only 1 direction(s); need 3–5 clear steps
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - …and 68 more
- Warnings:
  - Uses ACTIVITY_1: / ACTIVITY_2: wrappers — verify every activity still has CATEGORY + ACTIVITY_NAME.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Nature Explorers

- File: `scripts/curriculum-toddler-pro-batch3-imports/02-toddler-nature-explorers-pro.txt`
- Age: Toddler (2–3 Years)
- Theme: Nature Explorers
- Plan: PRO
- Size: 14389 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Invalid CATEGORY "Science". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Math". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Creative Arts". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Engineering". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Music". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Language". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: monday: "Leaf Look Lab" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: monday: "Leaf Rubbings" is missing CATEGORY.
  - Parse error: tuesday: "Rock Compare" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: tuesday: "Painted Nature Stones" is missing CATEGORY.
  - Parse error: wednesday: "Playdough Stick Forest" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: wednesday: "Long and Short Match" is missing CATEGORY.
  - Parse error: thursday: "Move Like the Wind" is missing CATEGORY.
  - Parse error: friday: "My Nature Favorite" is missing CATEGORY.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday activity 1 (Leaf Look Lab): blank/missing Category
  - monday activity 1 (Leaf Look Lab): only 1 direction(s); need 3–5 clear steps
  - monday activity 2 (Sort the Leaves): only 1 direction(s); need 3–5 clear steps
  - monday activity 3 (Leaf Rubbings): blank/missing Category
  - monday activity 3 (Leaf Rubbings): only 1 direction(s); need 3–5 clear steps
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday activity 1 (Rock Compare): blank/missing Category
  - tuesday activity 1 (Rock Compare): only 1 direction(s); need 3–5 clear steps
  - tuesday activity 2 (Big Rock, Small Rock): only 1 direction(s); need 3–5 clear steps
  - tuesday activity 3 (Painted Nature Stones): blank/missing Category
  - tuesday activity 3 (Painted Nature Stones): only 1 direction(s); need 3–5 clear steps
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday activity 1 (Stick and Block Bridges): only 1 direction(s); need 3–5 clear steps
  - wednesday activity 2 (Playdough Stick Forest): blank/missing Category
  - wednesday activity 2 (Playdough Stick Forest): only 1 direction(s); need 3–5 clear steps
  - …and 56 more
- Warnings:
  - Uses ACTIVITY_1: / ACTIVITY_2: wrappers — verify every activity still has CATEGORY + ACTIVITY_NAME.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Rainbow Science

- File: `scripts/curriculum-toddler-pro-batch3-imports/03-toddler-rainbow-science-pro.txt`
- Age: Toddler (2–3 Years)
- Theme: Rainbow Science
- Plan: PRO
- Size: 15048 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Invalid CATEGORY "Math". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Creative Arts". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Science". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Cooperative Art". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Language". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: monday: "Primary Color Marks" is missing CATEGORY.
  - Parse error: tuesday: "Two-Color Roll Painting" is missing CATEGORY.
  - Parse error: wednesday: "Transparent Color Collage" is missing CATEGORY.
  - Parse error: thursday: "Rainbow Threading" is missing CATEGORY.
  - Parse error: friday: "Class Rainbow Mural" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: friday: "My Favorite Color Page" is missing CATEGORY.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday activity 1 (Primary Color Sort): only 1 direction(s); need 3–5 clear steps
  - monday activity 2 (Color Hoop Hop): only 1 direction(s); need 3–5 clear steps
  - monday activity 3 (Primary Color Marks): blank/missing Category
  - monday activity 3 (Primary Color Marks): only 1 direction(s); need 3–5 clear steps
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday activity 1 (Color Mixing Bags): only 1 direction(s); need 3–5 clear steps
  - tuesday activity 2 (Dropper Color Lab): only 1 direction(s); need 3–5 clear steps
  - tuesday activity 3 (Two-Color Roll Painting): blank/missing Category
  - tuesday activity 3 (Two-Color Roll Painting): only 1 direction(s); need 3–5 clear steps
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday activity 1 (Rainbow Reflection Hunt): only 1 direction(s); need 3–5 clear steps
  - wednesday activity 2 (Catch the Color): only 1 direction(s); need 3–5 clear steps
  - wednesday activity 3 (Transparent Color Collage): blank/missing Category
  - wednesday activity 3 (Transparent Color Collage): only 1 direction(s); need 3–5 clear steps
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday activity 1 (Color Block Patterns): only 1 direction(s); need 3–5 clear steps
  - thursday activity 2 (Rainbow Scarf Pattern Dance): only 1 direction(s); need 3–5 clear steps
  - …and 47 more
- Warnings:
  - Uses ACTIVITY_1: / ACTIVITY_2: wrappers — verify every activity still has CATEGORY + ACTIVITY_NAME.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Busy Builders

- File: `scripts/curriculum-toddler-pro-batch3-imports/04-toddler-busy-builders-pro.txt`
- Age: Toddler (2–3 Years)
- Theme: Busy Builders
- Plan: PRO
- Size: 15535 chars · Days parsed: 5 · Activities parsed: 15 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Invalid CATEGORY "Engineering". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Math". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Creative Arts". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Science". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Social-Emotional". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Invalid CATEGORY "Language & Reflection". Allowed: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: monday: "Tall Tower Challenge" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: monday: "Draw My Tower" is missing CATEGORY.
  - Parse error: tuesday: "Ramp Test" has invalid CATEGORY "Engineering". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: tuesday: "Construction Road Walk" is missing CATEGORY.
  - Parse error: wednesday: "Build a Bridge" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: wednesday: "Bridge Repair Crew" is missing CATEGORY.
  - Parse error: thursday: "Decorate a Cardboard House" has invalid CATEGORY "Social-Emotional". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: thursday: "Builders Together" is missing CATEGORY.
  - Parse error: friday: "Choose-a-Build Challenge" has invalid CATEGORY "Math". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: friday: "Measure Our Builds" has invalid CATEGORY "Language & Reflection". Use one of: Circle Time, Literacy, Sensory Play, Fine Motor, Gross Motor, Music & Movement, Art, STEM/Discovery, Dramatic Play, Outdoor Play, Open-Ended Exploration.
  - Parse error: friday: "My Favorite Build" is missing CATEGORY.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday activity 1 (Tall Tower Challenge): blank/missing Category
  - monday activity 1 (Tall Tower Challenge): only 1 direction(s); need 3–5 clear steps
  - monday activity 2 (Tall or Short Sort): only 1 direction(s); need 3–5 clear steps
  - monday activity 3 (Draw My Tower): blank/missing Category
  - monday activity 3 (Draw My Tower): only 1 direction(s); need 3–5 clear steps
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday activity 1 (Ramp Test): blank/missing Category
  - tuesday activity 1 (Ramp Test): only 1 direction(s); need 3–5 clear steps
  - tuesday activity 2 (Build a Road): only 1 direction(s); need 3–5 clear steps
  - tuesday activity 3 (Construction Road Walk): blank/missing Category
  - tuesday activity 3 (Construction Road Walk): only 1 direction(s); need 3–5 clear steps
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - …and 68 more
- Warnings:
  - Uses ACTIVITY_1: / ACTIVITY_2: wrappers — verify every activity still has CATEGORY + ACTIVITY_NAME.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: Auto-fill completed missing gold-standard fields (for example circle time, outdoor play, directions, teacher role, or weekly overview). Review every day and activity before confirming — do not publish invented content you did not intend.

### Weather Lab

- File: `scripts/curriculum-toddler-pro-batch3-imports/05-toddler-weather-lab-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Weather Lab
- Plan: PRO
- Size: 15487 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Language & Literacy". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - Standards (high): thursday: missing Circle Time
  - Standards (high): thursday: missing Observation Opportunities
  - …and 8 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

### Apple Orchard Adventures

- File: `scripts/curriculum-toddler-pro-batch3-imports/06-toddler-apple-orchard-adventures-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Apple Orchard Adventures
- Plan: PRO
- Size: 14960 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Duplicate candidates:
  - (0.5) Apple Orchard Adventure — `scripts/curriculum-toddler-pro-imports/13-toddler-apple-orchard-adventure-pro.txt`
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Language & Literacy". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Engineering". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Practical Life". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - …and 10 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

### Pond Life Explorers

- File: `scripts/curriculum-toddler-pro-batch3-imports/07-toddler-pond-life-explorers-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Pond Life Explorers
- Plan: PRO
- Size: 14010 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Engineering". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Language & Literacy". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - Standards (high): thursday: missing Circle Time
  - …and 9 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

### Growing Gardens STEM

- File: `scripts/curriculum-toddler-pro-batch3-imports/08-toddler-growing-gardens-stem-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Growing Gardens STEM
- Plan: PRO
- Size: 14319 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Duplicate candidates:
  - (1) Growing Gardens — `scripts/curriculum-toddler-core-imports/toddler-growing-gardens.txt`
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Language & Literacy". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Engineering". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - Standards (high): thursday: missing Circle Time
  - …and 9 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 3 more

### Space Explorers STEM

- File: `scripts/curriculum-toddler-pro-batch3-imports/09-toddler-space-explorers-stem-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Space Explorers STEM
- Plan: PRO
- Size: 14278 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Engineering". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Language & Literacy". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - Standards (high): thursday: missing Circle Time
  - …and 9 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

### Fossil Hunters

- File: `scripts/curriculum-toddler-pro-batch3-imports/10-toddler-fossil-hunters-pro.txt`
- Age: Toddler (2-3 Years)
- Theme: Fossil Hunters
- Plan: PRO
- Size: 15869 chars · Days parsed: 5 · Activities parsed: 0 · Parser ok: false
- Verdict: **NOT READY — do not import**
- Blockers:
  - PLAN must be exactly "Pro" or "Free" (not all-caps "PRO").
  - Uses ACTIVITY_1_NAME field style instead of importer ACTIVITY_NAME / CATEGORY blocks.
  - Invalid ACTIVITY_N_CATEGORY "Science". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Math". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Creative Arts". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Practical Life". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Engineering". Map to an allowed importer category.
  - Invalid ACTIVITY_N_CATEGORY "Language & Literacy". Map to an allowed importer category.
  - Parse error: PLAN must be Free or Pro (got "PRO").
  - Parse error: At least one ACTIVITY_NAME block under a weekday section (MONDAY–FRIDAY) is required.
  - Parse error: Missing activities on: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY. Every weekday (MONDAY–FRIDAY) needs at least one ACTIVITY_NAME block.
  - monday: blank/missing Circle Time
  - monday: blank/missing Observation Opportunities
  - monday: no activities
  - tuesday: blank/missing Circle Time
  - tuesday: blank/missing Observation Opportunities
  - tuesday: no activities
  - wednesday: blank/missing Circle Time
  - wednesday: blank/missing Observation Opportunities
  - wednesday: no activities
  - thursday: blank/missing Circle Time
  - thursday: blank/missing Observation Opportunities
  - thursday: no activities
  - friday: blank/missing Circle Time
  - friday: blank/missing Observation Opportunities
  - friday: no activities
  - Standards (high): monday: missing Circle Time
  - Standards (high): monday: missing Observation Opportunities
  - Standards (high): monday: no activities
  - Standards (high): tuesday: missing Circle Time
  - Standards (high): tuesday: missing Observation Opportunities
  - Standards (high): tuesday: no activities
  - Standards (high): wednesday: missing Circle Time
  - Standards (high): wednesday: missing Observation Opportunities
  - Standards (high): wednesday: no activities
  - …and 10 more
- Warnings:
  - Parse warning: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Parse warning: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: This lesson is marked published. After you Save in the editor, it may become visible according to its Free/Pro access rules.
  - Preview: monday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: tuesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: wednesday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: thursday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: friday: weekday section has content but no ACTIVITY_NAME blocks.
  - Preview: Monday has daily content but no activities.
  - Preview: Tuesday has daily content but no activities.
  - Preview: Wednesday has daily content but no activities.
  - Preview: Thursday has daily content but no activities.
  - …and 2 more

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
