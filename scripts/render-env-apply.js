#!/usr/bin/env node
"use strict";

/**
 * Merge-only production environment apply.
 *
 * HARD RULES:
 * - Never replaces the full env with a partial list.
 * - Requires a fresh read, prints a names-only diff, refuses protected removals.
 * - Requires ENV_WRITE_MODE=merge-with-owner-approval + owner approval flags.
 * - Blocks when ENV_WRITE_MODE is unset/read-only (default).
 *
 * Usage:
 *   ENV_WRITE_MODE=merge-with-owner-approval \
 *   OWNER_APPROVAL_TOKEN=... \
 *   RENDER_API_KEY=... \
 *   node scripts/render-env-apply.js \
 *     --from-json ./proposed.env.json \
 *     --i-have-owner-approval \
 *     --owner-approval-token "$OWNER_APPROVAL_TOKEN"
 */

const fs = require("fs");
const path = require("path");
const {
  loadInventory,
  assertNoSecretValues,
  listServiceEnvVars,
  putServiceEnvVarsMergeOnly,
  buildMergePlan,
  summarizePlan,
  assertNoProtectedRemovals,
  assertOwnerApproval,
  assertWriteModeAllowed,
  appendAuditLog,
  runPreflight
} = require("./lib/render-env-safety");

function parseArgs(argv) {
  const out = {
    serviceId: process.env.RENDER_SERVICE_ID || "srv-d8o3f3r6sc1c73comlc0",
    sets: {},
    fromJson: "",
    allowRemovals: false,
    removals: [],
    iHaveOwnerApproval: false,
    ownerApprovalToken: "",
    dryRun: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--service-id" && argv[i + 1]) out.serviceId = argv[++i];
    else if (a === "--set" && argv[i + 1]) {
      const raw = argv[++i];
      const eq = raw.indexOf("=");
      if (eq <= 0) throw new Error(`Invalid --set ${raw}`);
      out.sets[raw.slice(0, eq)] = raw.slice(eq + 1);
    } else if (a === "--from-json" && argv[i + 1]) out.fromJson = argv[++i];
    else if (a === "--allow-removals") out.allowRemovals = true;
    else if (a === "--remove" && argv[i + 1]) out.removals.push(argv[++i]);
    else if (a === "--i-have-owner-approval") out.iHaveOwnerApproval = true;
    else if (a === "--owner-approval-token" && argv[i + 1]) out.ownerApprovalToken = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const inventory = loadInventory();

  if (!args.dryRun) {
    assertWriteModeAllowed(process.env);
    assertOwnerApproval({
      flagPresent: args.iHaveOwnerApproval,
      token: args.ownerApprovalToken || process.env.OWNER_APPROVAL_TOKEN_PROVIDED || "",
      expectedToken: process.env.OWNER_APPROVAL_TOKEN || ""
    });
  }

  const apiKey = String(process.env.RENDER_API_KEY || "").trim();
  if (!apiKey) {
    console.error("RENDER_API_KEY is required.");
    process.exit(2);
  }

  let updates = { ...args.sets };
  if (args.fromJson) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(args.fromJson), "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("--from-json must be an object of KEY -> value");
    }
    updates = { ...updates, ...raw };
  }
  if (!Object.keys(updates).length && !args.removals.length) {
    throw new Error("Nothing to apply. Pass --set KEY=VALUE and/or --from-json.");
  }

  const removals = args.allowRemovals ? args.removals : [];
  if (!args.allowRemovals && args.removals.length) {
    throw new Error("Removals require --allow-removals (and still cannot remove protected keys).");
  }

  // Fresh read of complete current environment (required).
  const current = await listServiceEnvVars({ apiKey, serviceId: args.serviceId });
  const plan = buildMergePlan({
    currentEnvVars: current,
    updates,
    removals,
    inventory
  });
  assertNoProtectedRemovals(current, plan.nextEnvVars, inventory.protectedKeys);

  if (!args.allowRemovals && plan.removedKeys.length) {
    throw new Error(`Refusing removals: ${plan.removedKeys.join(", ")}`);
  }

  const summary = summarizePlan(plan);
  assertNoSecretValues(summary);
  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? "dry-run" : "apply-merge",
        serviceId: args.serviceId,
        ...summary,
        addedKeys: plan.addedKeys,
        updatedKeys: plan.updatedKeys,
        removedKeys: plan.removedKeys,
        confirmation: plan.removedKeys.length
          ? "explicit non-protected removals requested"
          : "no existing keys will be removed"
      },
      null,
      2
    )
  );

  if (args.dryRun) {
    appendAuditLog({
      action: "apply-dry-run",
      actor: process.env.AUDIT_ACTOR || "agent",
      serviceId: args.serviceId,
      keysAdded: plan.addedKeys,
      keysChanged: plan.updatedKeys,
      keysRemoved: plan.removedKeys
    });
    return;
  }

  const after = await putServiceEnvVarsMergeOnly({
    apiKey,
    serviceId: args.serviceId,
    currentEnvList: current,
    proposedEnvList: plan.nextEnvVars,
    protectedKeys: inventory.protectedKeys
  });

  const afterKeys = after.map((row) => row.key);
  const preflight = runPreflight(afterKeys, inventory);

  appendAuditLog({
    action: "apply",
    actor: process.env.AUDIT_ACTOR || "agent",
    serviceId: args.serviceId,
    keysAdded: plan.addedKeys,
    keysChanged: plan.updatedKeys,
    keysRemoved: plan.removedKeys,
    afterKeyCount: afterKeys.length,
    preflightPassed: preflight.ok,
    missingRequired: preflight.missingRequired,
    missingProtected: preflight.missingProtected
  });

  if (!preflight.ok) {
    console.error(
      JSON.stringify(
        {
          error: "Required keys missing after write — do not deploy/restart",
          missingRequired: preflight.missingRequired
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        afterKeyCount: afterKeys.length,
        preflightPassed: true,
        next: "Run npm run env:preflight and npm run env:verify before any deploy/restart."
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || error);
  try {
    appendAuditLog({
      action: "apply-failed",
      actor: process.env.AUDIT_ACTOR || "agent",
      error: String(error.message || error)
    });
  } catch {
    // ignore audit failures after primary error
  }
  process.exit(1);
});
