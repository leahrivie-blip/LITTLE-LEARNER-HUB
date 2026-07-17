# Lesson cover redesign — final rollout

**Status:** Implemented on branch — awaiting final screenshot approval before merge.

## What shipped

- Netflix-style lesson cards with title overlay on a dark cover gradient
- Highly visible age chip on every card
- FREE/PRO badge, favorite star, activity count, Use This Plan, View Plan retained
- Unique illustrated JPG covers for all **53** seeded lesson plans
- Featured banner updated to overlay title + age on the cover image
- SVG covers retained as fallbacks / admin picker alternatives

## Preview

```bash
npm run start
# open http://localhost:4242/#lessons
```

Mockup page (design review):

```bash
python3 -m http.server 4173
# open http://localhost:4173/mockups/lesson-cover-redesign/
```

## Screenshots

See `screenshots/final-library-*.png` and `/opt/cursor/artifacts/screenshots/`.

## Regression

- `npm run test:lesson-plan-covers`
- `npm run test:lesson-card-buttons`
- `npm run test:lesson-library-cards`
- `npm run test:library-browse-redesign`
- `npm run test:curriculum-access-security`
- `npm run test:post-merge-library-audit`
- `npm run test:lesson-plan-calendar-workflow`
- Final capture: `node scripts/capture-cover-redesign-final.js`
