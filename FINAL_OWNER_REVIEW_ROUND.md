# Final Owner Review Round — Status

**Do not merge yet.** Awaiting owner visual sign-off on real curriculum + weekly PDF.

## Branch / PR
- Branch: `cursor/lesson-library-phase2-693d`
- Draft PR: https://github.com/leahrivie-blip/little-learner-hub/pull/161

## Real curriculum tested (published LLH import files)

Owner-requested themes mapped to actual published LLH plans in-repo:

| Owner request | Actual LLH plan used | File |
|---|---|---|
| Colors All Around Us | **Colors Everywhere** | `scripts/curriculum-preschool-free-imports/01-preschool-colors-everywhere-free.txt` |
| Familiar Faces & Bonding | **Infant Soft Sounds & Faces** | `scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt` |
| Sensory Discovery | **Five Senses** | `scripts/curriculum-preschool-free-imports/10-preschool-five-senses-free.txt` |
| Community Helpers | **Community Helpers** | `scripts/curriculum-preschool-free-imports/06-preschool-community-helpers-free.txt` |
| Multi-activity / day | **Toddler Color Hunt Friends** + preschool plans (3 activities/day) | phase-2f + free imports |

Proof command: `npm run test:lesson-real-curriculum`

Verified for each:
- Mon–Fri day chips / schedule
- Activities not truncated in Week glance
- Vocabulary, Books, Songs, Family Connection, Observation Opportunities, Adaptations visible on Plan tab
- Weekly print includes schedule + Classroom Support Notes
- Full print includes curriculum sections

## Weekly Schedule PDF
- Stronger day headers (solid bar labels)
- Cleaner borders / hierarchy
- Support notes now include materials, vocabulary, books, songs, family connection, observation, adaptations
- Capture: `/opt/cursor/artifacts/lesson-library-owner-review-round/06-weekly-schedule-community-helpers.png`

## Use This Plan final actions
Exactly:
1. Plan This Week
2. Print Full Lesson Plan
3. Download PDF
(+ Cancel)

No Assign / Add to This Week’s Plan / View in Curriculum Planner duplicates.

## Saved Plans
- Own destination page
- Professional empty state
- Opens favorites directly
- Device back returns to browse

## App conversion report
See `APP_CONVERSION_READINESS.md`.

## Merge criteria checklist
- [x] Real curriculum tested (automation + screenshots)
- [ ] Weekly PDF approved by owner
- [ ] Safari tested by owner on device
- [ ] Android tested by owner on device
- [x] No dead-end navigation (automated path)
- [x] No duplicate Use This Plan actions
- [x] Saved Plans destination + empty state
- [ ] Owner visual sign-off complete

## How to verify
```bash
npm run test:lesson-real-curriculum
npm run test:lesson-owner-review
npm run test:lesson-library-phase2
npm run test:lesson-use-this-plan
npm run test:lesson-library-mobile-qa
node scripts/capture-owner-review-round-screens.js
```
