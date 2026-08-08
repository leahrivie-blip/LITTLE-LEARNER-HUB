# Cover Catalog Baseline — LOCKED

**Status:** COMPLETE AND LOCKED (owner approved 2026-08-08)  
**Baseline:** 127 published lesson-plan covers on production

## Rules going forward

- Do **NOT** regenerate, replace, remap, bulk-edit, or otherwise touch existing covers unless the owner specifically requests a cover change for an **individual** lesson.
- Individual Teaching Kit upgrades may revisit that lesson’s cover only when explicitly in scope for that lesson’s quality pass.
- Do **not** delay curriculum work (Fall Week imports, TK upgrades, content work) to perfect covers catalog-wide.

## Baseline composition

| Set | Count | Storage |
| --- | ---: | --- |
| KEEP (pre-existing picture-book JPGs) | 13 | static `/images/lesson-covers/…` |
| REPLACE (2026-08-08 durable media attach) | 114 | `/api/media/lesson-covers/{id}` (Postgres) |
| **Total published lessons with covers** | **127** | — |

Verification: `PRODUCTION_ATTACH_VERIFICATION.md`

## Explicit non-goals unless requested

- No catalog-wide cover regeneration
- No bulk cover remapping
- No infant “polish pass” / similarity cleanup
- No Fall curriculum blocked on cover perfection
