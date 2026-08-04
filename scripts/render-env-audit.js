#!/usr/bin/env node
"use strict";

/**
 * Read-only production environment audit (key names only).
 * Never prints secret values.
 *
 * Usage:
 *   RENDER_API_KEY=... node scripts/render-env-audit.js
 *   npm run env:audit
 */

const {
  loadInventory,
  assertNoSecretValues,
  listServiceEnvVars,
  appendAuditLog,
  runPreflight
} = require("./lib/render-env-safety");

function parseArgs(argv) {
  const out = { serviceId: process.env.RENDER_SERVICE_ID || "srv-d8o3f3r6sc1c73comlc0" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--service-id" && argv[i + 1]) out.serviceId = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const inventory = loadInventory();
  const apiKey = String(process.env.RENDER_API_KEY || "").trim();
  if (!apiKey) {
    console.error("RENDER_API_KEY is required for live audit (read-only).");
    process.exit(2);
  }

  const envList = await listServiceEnvVars({ apiKey, serviceId: args.serviceId });
  const present = envList.map((row) => row.key);
  const preflight = runPreflight(present, inventory);
  const presentSet = new Set(present);

  const report = {
    mode: "read-only-audit",
    serviceId: args.serviceId,
    generatedAt: new Date().toISOString(),
    presentCount: present.length,
    presentKeys: [...present].sort(),
    missingRequired: preflight.missingRequired,
    missingRecommended: preflight.missingRecommended,
    missingProtected: preflight.missingProtected,
    unexpectedNotInInventory: present.filter((k) => !inventory.allKnownKeys.includes(k)).sort(),
    preflightOk: preflight.ok,
    blockDeploy: preflight.blockDeploy
  };

  assertNoSecretValues(report);
  console.log(JSON.stringify(report, null, 2));

  appendAuditLog({
    action: "audit",
    actor: process.env.AUDIT_ACTOR || "agent",
    serviceId: args.serviceId,
    result: report.missingRequired.length ? "missing_required" : "ok",
    missingRequired: report.missingRequired,
    missingProtected: report.missingProtected,
    presentCount: report.presentCount,
    preflightPassed: report.preflightOk
  });

  // Deploy-blocking only when required keys are missing.
  if (report.missingRequired.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
