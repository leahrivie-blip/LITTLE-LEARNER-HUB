# Testing-site integration plan (checkpoint — do not run in Phase 20)

**Purpose:** Document the later testing-only integration process.  
**Status:** Preparation only. **Do not perform this integration during Phase 20.**

## Preconditions

- Phase 20 complete, tested, documented, committed, and pushed on `cursor/director-family-foundation-bc66`
- Owner written approval to begin the integration checkpoint
- Testing environment secrets configured without enabling live Stripe/email/SMS/AI payments
- Confirm production host and `main` remain untouched

## Steps (testing only)

1. **Backup the testing branch**  
   Tag or note the exact SHA of `cursor/director-family-foundation-bc66` (e.g. `git rev-parse HEAD`). Keep a remote backup reference.

2. **Create a separate testing integration branch**  
   Example: `cursor/testing-integration-<shortsha>` from the Phase 20 tip.  
   Do **not** work directly on `main`.

3. **Bring the latest `main` into that integration branch**  
   Fetch `origin/main` and merge or rebase **into the integration branch only**.  
   Preserve current live-site features from `main`.

4. **Resolve conflicts carefully**  
   Prefer keeping live-site production-safe behavior for shared surfaces while retaining Director/Forms/Family/Lab foundations behind flags.  
   Do **not** push anything into `main`.

5. **Run complete tests**  
   - `npm run check`  
   - Full Phase 1–20 regression from `docs/DIRECTOR_FORMS_FAMILY_PROJECT_HANDOFF.md`  
   - Platform nav + account-access  
   - Manual smoke of Testing Lab Release Readiness + migration preview (fake org only)

6. **Deploy only to testing after owner approval**  
   Target: **little-learner-hub-testing** only.  
   Never deploy this checkpoint to production without a separate, explicit owner approval.

## Hard stops

- No merge to `main` during this checkpoint unless the owner later writes that instruction
- No production migration apply
- No enabling live Stripe checkout, outbound email/SMS/push, or live AI
- No production data writes

## Related Phase 20 surfaces

- Testing Lab → **Release Readiness**
- Testing Lab → **Migration** simulator (fake orgs only)
- Report: `docs/PHASE_20_SECURITY_MIGRATION_RELEASE_READINESS_COMPLETION_REPORT.md`
