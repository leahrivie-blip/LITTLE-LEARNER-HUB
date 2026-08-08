# Cover Replacement Plan (staged — awaiting owner approval)

**Prerequisite:** Owner approval of `LESSON_COVER_AUDIT_2026-08-08.md`  
**Hard rule:** Do not overwrite production covers until each replacement passes QC as a staged preview.

## Scope after approval

| Workstream | Count | Approach |
| --- | ---: | --- |
| KEEP | 13 | No change |
| REVIEW | 4 | Owner decides KEEP vs REPLACE; generate only if REPLACE |
| REPLACE — missing | 63 | New artwork from content-aware briefs |
| REPLACE — SVG placeholders | 43 | New artwork; retire SVG from lesson assignment |
| REPLACE — age-mismatch JPG | 4 | New **infant-specific** covers; leave preschool KEEP assignments intact |

**Total new covers if all REPLACE proceed:** 110  
**If all REVIEW also become REPLACE:** 114

## Safe workflow (no blind overwrite)

1. Generate candidate image from brief (local/staging only)
2. QC checklist in `LLH_COVER_STANDARD.md` — reject on any fail
3. Upload as durable media via Lesson Plan Admin cover tools (Postgres media path)
4. Attach **cover only** — do not edit activities, ages, IDs, publish state, or TK flags
5. Verify: desktop card, mobile card, lesson viewer, Preview as User, Teaching Kit viewer if available
6. Only then mark that lesson’s cover pass complete
7. After batch: scroll full catalog for visual outliers

## Generation constraints

- Style locked to LLH Cover Standard (picture-book cartoon)
- Exact canonical title via **UI overlay**, not baked AI text
- Age-matched characters required
- Theme from title **and** lesson content (activities/overview) — not title-only generics
- Prefer diversity across catalog; avoid identical character templates on every cover
- Crop-safe composition

## Priority order (recommended)

1. **Age-mismatch infants (4)** — quick wins; preschool assets already good where correctly assigned  
2. **High-visibility toddler/preschool SVG themes** that already have strong JPG siblings elsewhere (Music, Animals, Community, Holidays)  
3. **Missing covers** for Free/Pro lessons that appear early in catalog browsing  
4. **Remaining SVG + missing** by age band (Infant → Toddler → Preschool → School-age)  
5. **REVIEW** only after owner marks REPLACE

## Sample briefs (pattern for all 110)

Full briefs for every REPLACE lesson are in `lesson-cover-audit.json` → `replacementBriefs[]`.

### Example A — age mismatch
**Welcome, Baby!** (Infant 0–6 Months) — currently misusing `all-about-me.jpg`  
Brief: Soft nursery welcome — caregiver holding/soothing illustrated baby, soft toys, pastel room light; tummy-time mat optional; no preschool classroom mirror wall; no baked text.

### Example B — SVG placeholder
**Colors All Around Us** (Infant 0–6 Months) — currently `colors-all-around-us.svg`  
Brief: Infant sensory color exploration — high-contrast soft toys / scarves / light play with caregiver; warm picture-book style; babies not preschoolers; quiet upper crop for UI title.

### Example C — missing cover
Use lesson overview + sample activities from brief payload; communicate theme in one clear scene; match age band table in standard.

## Explicit non-goals until approved

- No Fall Week 1/2 imports or publishes in this pass  
- No Teaching Kit customer flag enablement  
- No billing/subscription changes  
- No lesson content edits  
- No mass regeneration of KEEP covers  

## After this pass (owner-sequenced next)

1. Apple Orchard Investigators / Fall Week 1 stable-ID reconciliation  
2. Pumpkin Patch Helpers / Fall Week 2 review  
3. Draft imports  
4. Cover attachment  
5. Preview as User  
6. Viewer/Print review  
7. Explicit approval before publishing  
