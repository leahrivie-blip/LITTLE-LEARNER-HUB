# Little Learner Hub Curriculum Gold Standard

Reusable quality bar for Teaching Kit upgrades before Draft Review Queue submission.

## Workflow

1. Select an existing lesson (never create silently)
2. Audit published content
3. Research inspiration (do not copy)
4. Build complete proposed upgrade
5. Run `node scripts/llh-curriculum-gold-standard.js --seed <package>`
6. Fix all blocking findings yourself
7. Submit to Admin → Draft Review Queue
8. Leah reviews the **real** Teaching Kit + printables
9. Revise the same queue item if requested
10. Nothing publishes until Leah approves manually (Phase 2)

## Authoritative scoring

Use **only** `evaluateTeachingKit` from `scripts/teaching-kit-quality-review.js` (same as Enrichment Editor).

Report separately:

- Structural completeness (`completionPercent`)
- Premium readiness (`premiumReadinessPercent`)
- Blocking issues

Never inflate with draft printables, printable ideas, image briefs, song titles without teaching content, or book titles without prompts.

Draft printables correctly keep Publish Ready blocked and typically cap premium at **89** until Leah publishes the printable.

## Training calibration set

- Amazing Apples — Toddler
- All About Me — Preschool

Do not start the other eight lessons until this standard is approved.

## Validator

```bash
node scripts/llh-curriculum-gold-standard.js
npm run test:curriculum-draft-review
```
