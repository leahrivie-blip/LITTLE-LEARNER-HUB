# Little Learner Hub — Teaching Kit Master Specification

**Status:** Permanent · authoritative for every Teaching Kit upgrade  
**Audience:** Owner (Leah) + coding agents upgrading lessons  
**Product bar:** Every Teaching Kit must feel like a complete, premium digital teacher binder that a childcare provider would pay for and realistically use.

This document **controls every lesson upgrade**. It is not optional guidance. Companion product/UI specs (viewer, print, enrichment editor) do not override this content bar.

Related:

| Document | Role |
| --- | --- |
| [GOLD_STANDARD_PRODUCT_SPEC.md](./GOLD_STANDARD_PRODUCT_SPEC.md) | Provider product UX (Start the Week, Today’s Classroom, etc.) |
| [VISUAL_EXAMPLE_STYLE_GUIDE.md](./VISUAL_EXAMPLE_STYLE_GUIDE.md) | Image look-and-feel |
| [../curriculum-draft-review/LLH-CURRICULUM-GOLD-STANDARD.md](../curriculum-draft-review/LLH-CURRICULUM-GOLD-STANDARD.md) | Scoring + Draft Review Queue workflow |
| [../curriculum-draft-review/TRAINING-DELIVERABLE.md](../curriculum-draft-review/TRAINING-DELIVERABLE.md) | Amazing Apples / All About Me calibration notes |
| [owner-examples/README.md](./owner-examples/README.md) | Owner-supplied lesson plan examples + picture ideas |

---

## 1. Core goal (non-negotiable)

The goal is **not** to fill fields or reach an artificial score.

Every Teaching Kit must:

- Feel complete and premium
- Be something a real childcare provider would pay for
- Be realistically usable during a childcare day
- Read as a digital teacher binder, not a thin outline or worksheet packet

**Scores are diagnostic only.** Never call a lesson complete because it reaches a percentage. A human-quality review and **owner approval** are required.

---

## 2. Required lesson brief (before any upgrade build)

Before upgrading a lesson, create a **lesson brief** for owner review. Do not build or revise the Teaching Kit until the brief exists.

The brief must contain:

1. **Lesson title** and **exact age group**
2. **Weekly purpose** and **meaningful learning objectives**
3. **Five distinct Monday–Friday focuses** (each day must feel different)
4. **Existing activity decisions** — for every current activity: keep, substantially improve, replace, or remove — with a **reason for every decision**
5. **Developmental balance** across:
   - Language
   - Social-emotional
   - Cognitive
   - Fine motor
   - Gross motor
   - Sensory exploration
   - Creativity
6. **Exact printable plan** — every page and its classroom purpose
7. **Exact image plan** — identify only activities that genuinely need a setup image, process illustration, or finished example
8. **Songs** — original or verified public-domain only, with motions and teaching directions
9. **Books** — real, verified titles with authors, weekday placement, before/during/after questions, vocabulary connections, substitutes, and a no-book alternative
10. **Teacher support block** covering:
    - Teacher preparation
    - Affordable materials
    - Substitutions
    - Cleanup
    - Safety
    - Inclusion
    - Mixed-age adaptations
    - Support
    - Challenge
    - Observation prompts
    - Documentation prompts
    - Extensions
    - Family connections

Store briefs under `docs/teaching-kit/lesson-briefs/` (one markdown file per lesson) unless the owner directs otherwise.

---

## 3. Activity standards

Activities must be:

- Hands-on
- Play-based
- Open-ended
- Age-appropriate
- Affordable
- Realistic during a childcare day

Also required:

- Include a mix of **simple activities** and **more involved experiences** so the week is manageable
- Do **not** preserve weak legacy activities merely to avoid changing them
- Do **not** create repetitive variations of sorting, matching, coloring, or worksheets
- Every weekday must feel different and have its own:
  - Focus
  - Materials
  - Questions
  - Observations
  - Book
  - Song
  - Family connection

### Inclusion and family safety (hard bans)

Never:

- Compare children
- Rank families
- Require disclosure of private family information
- Assume one family structure, culture, ability, or living situation

---

## 4. Printable standards

Create **real US Letter PDFs**, not HTML concepts or text-only placeholders.

Printables must:

- Use **original, theme-specific illustrations** that children and teachers can actually use
- Have cards **large enough** for circle time, matching, sorting, dramatic play, or classroom display
- Use clear cut lines, safe margins, readable labels, strong contrast, and low-ink backgrounds when possible
- Avoid worksheet-heavy or one-correct-answer pages
- **Not** reuse generic abstract shapes as illustrations
- Include small, unobtrusive **Little Learner Hub** branding and **littlelearnershubbyleah.com** on every page

### Research / inspiration rule

Pinterest and teacher sites may inform ideas **only**. Never copy their images, wording, layouts, or products.

---

## 5. Image standards

Images are **not** required for:

- Obvious circle-time discussions
- Read-alouds
- Songs
- Simple movement activities

Require images **only** when they help a provider understand:

- An art result
- An unfamiliar setup
- Construction
- A sensory invitation
- Printable use
- A finished example

Image quality rules:

- Use original teacher-manual illustrations, paper-activity mockups, or believable classroom setups
- Do **not** use glossy, fake-looking AI classroom photos
- Every image must include useful **alt text** and a **caption**

Follow [VISUAL_EXAMPLE_STYLE_GUIDE.md](./VISUAL_EXAMPLE_STYLE_GUIDE.md) for look-and-feel.

---

## 6. Songs and books

### Songs

- Original Little Learner Hub songs, or verified public-domain only
- Include motions
- Include teaching directions (how to introduce, pace, adapt)

### Books

For every selected book include:

- Real, verified title + author
- Weekday placement
- Before / during / after questions
- Vocabulary connections
- Substitutes if the book is unavailable
- A no-book alternative activity or discussion path

---

## 7. Upgrade workflow (mandatory order)

1. **Prepare the complete lesson brief** for owner review
2. Wait for owner direction when a brief is being reviewed (do not skip ahead on a new lesson without brief approval when the owner has asked for brief-first review)
3. **Build or revise one Teaching Kit as a draft**
4. Run checks:
   - Contradiction
   - Duplication
   - Copyright
   - Safety
   - Age-fit
   - Printable
   - Image
   - Completeness
5. **Submit all changes to the owner-only Admin Draft Review Queue**
6. Include a **before/after activity list and rationale**
7. **Never** publish, deploy customer content, or modify the published lesson
8. Wait for owner feedback and **revise the same queue item**
9. **Do not begin a batch of ten** until **Amazing Apples** and **All About Me** are manually approved as the gold-standard examples

### Draft Review Queue

- Owner-only Admin → Content → Draft Review Queue
- Phase 1: submit, review, revise, discard, rollback — **no publish**
- Details: [../curriculum-draft-review/README.md](../curriculum-draft-review/README.md)

### Scoring

Use only `evaluateTeachingKit` from `scripts/teaching-kit-quality-review.js` (same as Enrichment Editor).

Report separately:

- Structural completeness (`completionPercent`)
- Premium readiness (`premiumReadinessPercent`)
- Blocking issues

Never inflate scores with draft printables, printable ideas, image briefs, song titles without teaching content, or book titles without prompts.

---

## 8. Owner examples and picture ideas

When the owner provides lesson plan examples, picture ideas, or reference notes:

1. Save them under [owner-examples/](./owner-examples/) (do not leave them only in chat)
2. Treat them as **design intent** for that lesson’s brief and draft
3. Follow this Master Specification **together with** those owner materials
4. Never copy third-party images, wording, layouts, or products that appear in inspiration sources
5. Prefer the owner’s stated activity decisions, printable ideas, and image needs when they do not conflict with safety, inclusion, copyright, or age-fit rules in this spec

---

## 9. Definition of “ready for owner review”

A Teaching Kit draft may be submitted to the Draft Review Queue only when:

- A lesson brief exists covering every item in §2
- Activities meet §3 (including keep/improve/replace/remove rationale)
- Printables meet §4 (real US Letter PDFs with branding)
- Images meet §5 (only where needed; alt text + captions)
- Songs/books meet §6
- Checks in §7 have been run
- Before/after activity list + rationale are included
- Published lesson content has **not** been modified
- No claim of “complete” is made based on score alone

---

## 10. Hard stops

Stop and do not proceed if any of the following would be required to “finish”:

- Publishing or deploying customer-facing curriculum
- Editing the live published lesson instead of a draft queue item
- Starting the next batch of ten lessons before Amazing Apples and All About Me are owner-approved
- Filling fields or inventing thin worksheets just to raise a score
- Reusing weak legacy activities without a keep/improve/replace/remove decision
- Copying Pinterest / teacher-site assets or wording
- Adding images that look like glossy fake AI classrooms
- Comparing children, ranking families, or assuming one family structure/culture/ability/living situation

---

## Change control

Updates to this Master Specification require owner approval. Agents may propose clarifications in a PR; they must not weaken the premium binder bar, draft-only workflow, or gold-standard gate without explicit owner instruction.
