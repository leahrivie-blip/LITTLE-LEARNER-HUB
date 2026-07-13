# Final Owner Review — Phase 2 Status

**Do not merge yet.** Awaiting owner visual sign-off, especially Weekly Schedule PDF.

## Branch / PR
- Branch: `cursor/lesson-library-phase2-693d`
- Draft PR: https://github.com/leahrivie-blip/little-learner-hub/pull/161

## 1. Real curriculum tested
Published LLH import files (not mutated samples):

| Owner request | Actual LLH plan |
|---|---|
| Colors All Around Us | Colors Everywhere |
| Familiar Faces & Bonding | Infant Soft Sounds & Faces |
| Sensory Discovery | Five Senses |
| Community Helpers | Community Helpers |
| Multi-activity days | Preschool plans (3/day) + Toddler Color Hunt Friends |

Proof: `npm run test:lesson-real-curriculum`

## 2. Weekly Schedule PDF redesign
Now a **teacher classroom overview** (not a name-only grid, not a full lesson dump):

- **Header:** title, theme, age group, Week Of blank
- **Weekly Snapshot:** learning domains + 3–5 objectives
- **Monday–Friday:** activity name, category, 1-sentence description, materials
- **Weekly Resources:** vocabulary, books, songs
- **Teacher Notes:** family connection + observation focus

Excluded on purpose: full directions, teacher role, per-activity learning goals.

## 3. Screenshots
`/opt/cursor/artifacts/lesson-library-owner-review-round/`
- Library, Saved, empty state
- Community Helpers week + Plan sections
- Use This Plan final actions
- Redesigned weekly schedule (`06` / `06b`)
- Colors / Faces / Five Senses / Community Helpers viewers
- Mobile widths 390 / 412 / 430

## 4. Use This Plan
Exactly:
1. Plan This Week
2. Print Full Lesson Plan
3. Download PDF

## 5. App readiness
See `APP_CONVERSION_READINESS.md`.

## Merge criteria
- [x] Real curriculum tested (automation + screenshots)
- [ ] Weekly PDF approved by owner
- [ ] Safari tested on device
- [ ] Android tested on device
- [x] No dead-end navigation
- [x] No duplicate actions
- [x] Saved Plans destination verified
- [ ] Owner visual sign-off complete

## Verify
```bash
npm run test:lesson-real-curriculum
npm run test:lesson-owner-review
npm run test:lesson-library-phase2
node scripts/capture-owner-review-round-screens.js
```
