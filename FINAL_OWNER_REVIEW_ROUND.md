# Final Owner Review — Phase 2 Status

**Do not merge yet.** Structure approved; small polish applied. Awaiting final owner Safari sign-off.

## Branch / PR
- Branch: `cursor/lesson-library-phase2-693d`
- Draft PR: https://github.com/leahrivie-blip/little-learner-hub/pull/161

## Weekly Schedule PDF (approved structure + small polish)
Teacher classroom overview still includes:
- Header with **LLH logo/branding**
- Theme / Age / **Week Of** (auto-filled from Curriculum Planner assignment when available)
- Weekly Snapshot
- **Teacher Prep This Week**
- **Weekly Materials** summary
- Monday–Friday activity cards (name, category, 1-sentence description, materials)
- Weekly Resources + Teacher Notes
- **Footer:** Little Learner Hub + page numbers (print CSS + PDF)

Not included: full directions, teacher role, per-activity learning goals.

## Real curriculum tested
Colors Everywhere · Infant Soft Sounds & Faces · Five Senses · Community Helpers · Toddler Color Hunt Friends

## Screenshots / print proof
`/opt/cursor/artifacts/lesson-library-owner-review-round/`
- `06-weekly-schedule-community-helpers.png`
- `06b-weekly-schedule-fullpage.png`
- `06c-weekly-schedule-print.pdf` (Chromium print PDF with LLH footer + page numbers)

## Merge criteria
- [x] Real curriculum tested
- [x] Weekly PDF structure approved by owner
- [x] Small polish complete (logo, prep, materials, Week Of, footer)
- [ ] Safari device print sign-off
- [ ] Android device print sign-off (recommended)
- [x] No dead-end navigation / no duplicate Use This Plan actions
- [x] Saved Plans destination verified
- [ ] Final owner visual sign-off

## Verify
```bash
npm run test:lesson-real-curriculum
npm run test:lesson-owner-review
node scripts/capture-owner-review-round-screens.js
```
