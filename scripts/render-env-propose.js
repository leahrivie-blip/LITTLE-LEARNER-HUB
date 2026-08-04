#!/usr/bin/env node
"use strict";

/**
 * Propose a merge-only environment update (names + change plan only).
 * Does NOT write to Render.
 *
 * Usage:
 *   RENDER_API_KEY=... node scripts/render-env-propose.js --set KEY=VALUE
 *   node scripts/render-env-propose.js --from-json ./proposed.env.json
 */

const fs = require("fs");
const path = require("path");
const {
  loadInventory,
  assertNoSecretValues,
  listServiceEnvVars,
  buildMergePlan,
  summarizePlan,
  assertNoProtectedRemovals,
  appendAuditLog
} = require("./lib/render-env-safety");

function parseArgs(argv) {
  const out = {
    serviceId: process.env.RENDER_SERVICE_ID || "srv-d8o3f3r6sc1c73comlc0",
    sets: {},
    fromJson: "",
    allowRemovals: false,
    removals: []
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
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const inventory = loadInventory();
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

  const current = await listServiceEnvVars({ apiKey, serviceId: args.serviceId });
  const removals = args.allowRemovals ? args.removals : [];
  if (!args.allowRemovals && args.removals.length) {
    throw new Error("Removals require --allow-removals (protected keys still cannot be removed).");
  }

  const plan = buildMergePlan({
    currentEnvVars: current,
    updates,
    removals,
    inventory
  });
  assertNoProtectedRemovals(current, plan.nextEnvVars, inventory.protectedKeys);

  if (!args.allowRemovals && plan.removedKeys.length) {
    throw new Error(
      `Refusing plan that removes keys without --allow-removals: ${plan.removedKeys.join(", ")}`
    );
  }

  const summary = summarizePlan(plan);
  assertNoSecretValues(summary);

  const output = {
    mode: "propose-only",
    serviceId: args.serviceId,
    generatedAt: new Date().toISOString(),
    ownerApprovalRequired: true,
    warning:
      "Writing requires npm run env:apply with ENV_WRITE_MODE=merge-with-owner-approval, "
      + "--i-have-owner-approval, and a matching OWNER_APPROVAL_TOKEN. Full env replace is forbidden.",
    ...summary,
    addedKeys: plan.addedKeys,
    updatedKeys: plan.updatedKeys,
    removedKeys: plan.removedKeys
  };

  console.log(JSON.stringify(output, null, 2));
  appendAuditLog({
    action: "propose",
    actor: process.env.AUDIT_ACTOR || "agent",
    serviceId: args.serviceId,
    keysAdded: plan.addedKeys,
    keysChanged: plan.updatedKeys,
    keysRemoved: plan.removedKeys
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
