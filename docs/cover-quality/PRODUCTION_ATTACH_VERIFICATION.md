# Production Cover Attachment Verification

**Attached at:** 2026-08-08 (cover fields only)  
**Method:** Admin cover upload → durable Postgres `/api/media/lesson-covers/{id}` → assign by **stable lesson ID**  
**Production attached:** YES (114 REPLACE). KEEP static URLs untouched.

## Results

| Check | Result |
| --- | --- |
| Published lessons | **127** |
| Missing covers | **0** |
| SVG placeholders remaining | **0** |
| Durable media covers | **114** |
| KEEP static covers unchanged | **13 / 13** |
| REPLACE attached by stable ID | **114 / 114** |
| Infant lessons using preschool static artwork | **0** |
| Lesson titles / ages / themes / overviews / domains | **unchanged** vs pre-audit snapshot |
| Activities fingerprint (2110) | **unchanged** |
| `freeLessonAccessMode` | unchanged (`curated`) |
| Teaching Kit director surface | **unchanged** |
| Sample media URL HTTP | **200 image/jpeg** (multiple IDs) |
| KEEP static URL HTTP | **200 image/jpeg** |
| Lesson cards UI smoke | covers load (desktop + mobile scroll); **0 broken** naturalWidth |

## Fingerprints

- Cover map changed as expected (static/SVG/missing → durable media for 114).
- Non-cover curriculum content matches pre-audit snapshot (0 content-field diffs).

## Notes

- Two KEEP infant apple lessons already had `coverImageSource: "uploaded"` **before** this pass while still using static `/images/...` URLs; URLs were not changed.
- Going forward: individual Teaching Kit upgrades can revisit a lesson’s cover if a more theme-specific image is warranted.

## Safety confirmations

1. Lesson content untouched  
2. Activities untouched  
3. Stable IDs untouched  
4. Publishing states untouched  
5. Teaching Kit flags / director surface untouched  
6. Billing/access mode untouched  
7. No Fall Week 1/2 import performed  

## Stop

Ready for owner review. **Do not start Fall Week 1/2 until owner proceeds.**
