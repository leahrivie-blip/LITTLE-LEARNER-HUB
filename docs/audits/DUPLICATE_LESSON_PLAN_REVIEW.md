# Duplicate Lesson Plan Review (Careful)

**Date:** 2026-07-14  
**Source:** Live `/api/site-content` → `curriculumLibrary.lessonPlans`  
**Policy:** Same/similar titles are allowed when age group, plan level, or content differs. Do **not** delete age-specific versions.

## Live title matches

| Title | Plans | Verdict |
| --- | --- | --- |
| Colors Everywhere | `cur-lp-preschool-colors-everywhere` (Preschool, Free) · `cur-lp-toddler-colors-everywhere` (Toddler, Free) | **Keep both** — different age groups |
| All About Me | Preschool Free · Toddler Free | **Keep both** — different age groups |
| Community Helpers | Preschool Free · Toddler Free | **Keep both** — different age groups |
| Dinosaur Discovery | Preschool Pro (19 activities) · Toddler Pro (3 activities) | **Keep both** — different age groups; toddler may need content enrichment later, not deletion |
| Fairy Tale Adventures | Preschool Pro (18) · Toddler Pro (5) | **Keep both** — different age groups |

## Not duplicates

Age-banded Music & Movement / seasonal / STEM / Free vs Pro variants remain searchable and labeled by age + plan badge. No merge/delete recommended from this review.

## Action taken

- No lesson plans deleted or merged.
- Incomplete-day repairs (Space Adventure Wed–Fri) handled separately via `scripts/repair-incomplete-curriculum-plans.js` — content repair, not duplicate cleanup.
