# Production environment safeguards

These controls exist so coding agents and scripts **cannot wipe or silently shrink** the Render production environment-variable list again.

## Critical implementation note

Render’s `GET /v1/services/{id}/env-vars` **paginates** (default 20). A merge or PUT built from the first page only will wipe the rest.  
`scripts/lib/render-env-safety.js` → `listServiceEnvVars` always walks every page before planning or writing.

## Inventory (names only)

- `REQUIRED_ENV_INVENTORY.json` — canonical list of **variable names** (never values).
  - `protectedKeys`: removal always fails.
  - `requiredForDeploy`: preflight must pass before deploy/restart.
  - `recommended`: reported in audits; not deploy-blocking.
  - `nonSecretBlueprintSafe`: safe to manage via Blueprint / Environment Groups.
  - `platformInjectedKeys`: provided by Render (e.g. `PORT`); not required in Dashboard env list.

## Agent / script policy

| Mode | Who | Allowed |
|------|-----|---------|
| `read-only` (default) | Coding agents, CI without approval | `env:audit`, `env:preflight`, `env:verify`, `env:propose` |
| `merge-with-owner-approval` | Only with Leah’s explicit approval | `env:apply` after fresh read + names-only diff |

**Forbidden for all agents and automation:**

- Blind `PUT /v1/services/.../env-vars` with a partial key list
- Any “replace entire environment” operation
- Logging or committing secret values
- Production deploy/restart when preflight fails

## Commands

```bash
# Read-only audit (names only)
RENDER_API_KEY=... npm run env:audit

# Preflight — exit 1 blocks deploy/restart
RENDER_API_KEY=... npm run env:preflight

# Propose merge (no write); prints names-only diff
RENDER_API_KEY=... npm run env:propose -- --set MONITOR_INSTANCE_MEMORY_MB=2048

# Apply merge ONLY with owner approval (never default for agents)
ENV_WRITE_MODE=merge-with-owner-approval \
OWNER_APPROVAL_TOKEN=... \
RENDER_API_KEY=... \
npm run env:apply -- --from-json ./proposed.env.json \
  --i-have-owner-approval \
  --owner-approval-token "$OWNER_APPROVAL_TOKEN"

# Post-change verification (live URL + Dashboard names)
RENDER_API_KEY=... npm run env:verify

# Wrap any deploy/restart trigger
RENDER_API_KEY=... npm run env:deploy-guard -- --dry-run
```

## Required write workflow

1. Fresh `GET` of the complete current env (`env:propose` / `env:apply` does this).
2. Names-only diff: added / updated / removed.
3. Confirm **no existing keys removed** (unless explicit non-protected `--allow-removals` + owner approval).
4. Protected-key removal → automatic failure.
5. Owner sets `ENV_WRITE_MODE=merge-with-owner-approval`, provides approval token, and runs apply.
6. Run `env:preflight` + `env:verify` before any deploy/restart.

## Blueprint / Environment Groups

Prefer Render **Environment Groups** or Blueprint `envVars` with `sync: false` for secrets and plain values for non-secrets (`nonSecretBlueprintSafe`).

- Non-secrets (thresholds, email from/to, model names, feature flags) may live in `render.yaml`.
- Secrets must stay in the Dashboard / Environment Group — **never in Git**.
- Blueprint must not be used to replace a shorter secret set over a longer live set without the merge tool.

See `render.yaml` for the non-secret shared settings already declared.

## Audit log

`audit-log.jsonl` records who/when/action, key **names** changed, and preflight result.  
It must never contain secret values (enforced by the writer).

## Do not deploy yet

Until `npm run env:preflight` passes against production Dashboard env, **do not deploy or restart** production. Live process memory may still hold older values that Dashboard no longer lists.
