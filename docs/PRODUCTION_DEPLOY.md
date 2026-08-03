# Production deploy process

**Status:** Active policy as of 2026-08-03 (confirmed during PR #442 deploy).

## Auto-deploy is disabled

The live production web service **`LITTLE-LEARNER-HUB`** (`srv-d8o3f3r6sc1c73comlc0`) has **auto-deploy turned off** in Render (`autoDeploy: no`).

**Merging an approved PR to `main` does not deploy production.** After every approved merge, a **separate manual Render deploy** is required before production serves the new commit.

This is intentional: production deploys are owner-controlled and should not run automatically on every merge.

## After an approved merge

1. Confirm the merge commit is on `main` (GitHub).
2. Open the service in Render:  
   https://dashboard.render.com/web/srv-d8o3f3r6sc1c73comlc0
3. **Manual Deploy** → **Deploy latest commit** (or equivalent).
4. Wait for the deploy to reach **`live`** in Render **Events**.
5. Verify production is serving the expected SHA:

   ```bash
   curl -sS https://littlelearnershubbyleah.com/api/build-version
   ```

   Confirm `shortSha` matches the merge commit (first 7 characters).

6. Run read-only production verification as appropriate for the change (e.g. `npm run test:production-post-merge-smoke`).

## Rollback

Render Dashboard → service → **Events** / **Deploys** → select the previous successful deploy → **Rollback**.

Alternatively: revert the merge commit on `main`, push, then **manual deploy** again (auto-deploy remains off).

## API / CLI deploys

Manual deploys may also be triggered via the Render Dashboard, Render CLI, or Render API using credentials managed by the owner.

- **Do not** commit Render API keys or other deploy secrets to the repository.
- **Do not** store deploy credentials in agent notes, chat logs, or shared docs.
- Rotate API keys if they are ever exposed.

## Related docs

- `docs/RENDER_STARTER_UPGRADE.md` — instance plan / cold-start notes
- `docs/RENDER_OOM_MEMORY.md` — memory limits after deploy
- `docs/release/LINKED_PROGRAM_RC_CHECKLIST.md` — pre/post deploy checklists (update deploy steps there if process changes)

## Teaching Kit (separate track)

Teaching Kit Enrichment Editor work stays in **its own PRs**. Do **not** merge, deploy, or enable Teaching Kit feature flags until Leah explicitly approves the final integration review.
