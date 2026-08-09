# Little Learner Hub Curriculum Gold Standard

Reusable quality bar for Teaching Kit upgrades before Draft Review Queue submission.

**Authoritative content + workflow bar:** [../teaching-kit/TEACHING_KIT_MASTER_SPECIFICATION.md](../teaching-kit/TEACHING_KIT_MASTER_SPECIFICATION.md)  
(Always-apply Cursor rule: `.cursor/rules/teaching-kit-master-spec.mdc`)

## Workflow

1. Select an existing lesson (never create silently)
2. Create the required **lesson brief** (Master Spec §2) for owner review
3. Audit published content
4. Research inspiration (do not copy); save owner examples under `docs/teaching-kit/owner-examples/`
5. Build complete proposed upgrade as a **draft**
6. Run contradiction / duplication / copyright / safety / age-fit / printable / image / completeness checks
7. Run `node scripts/llh-curriculum-gold-standard.js --seed <package>`
8. Fix all blocking findings yourself
9. Submit to Admin → Draft Review Queue with before/after activity list + rationale
10. Leah reviews the **real** Teaching Kit + printables
11. Revise the same queue item if requested
12. Nothing publishes until Leah approves manually (Phase 2)

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
