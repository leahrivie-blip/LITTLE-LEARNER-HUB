#!/usr/bin/env node
"use strict";

/**
 * Preflight before production deploy/restart.
 * Confirms every required env var is present (names only).
 * Exit 1 blocks deploy/restart.
 *
 * Usage:
 *   RENDER_API_KEY=... npm run env:preflight
 *   node scripts/render-env-preflight.js --from-process
 */

const {
  loadInventory,
  assertNoSecretValues,
  listServiceEnvVars,
  runPreflight,
  appendAuditLog
} = require("./lib/render-env-safety");

function parseArgs(argv) {
  const out = {
    serviceId: process.env.RENDER_SERVICE_ID || "srv-d8o3f3r6sc1c73comlc0",
    fromProcess: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--service-id" && argv[i + 1]) out.serviceId = argv[++i];
    else if (a === "--from-process") out.fromProcess = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const inventory = loadInventory();
  let presentKeys;

  if (args.fromProcess) {
    presentKeys = Object.keys(process.env);
  } else {
    const apiKey = String(process.env.RENDER_API_KEY || "").trim();
    if (!apiKey) {
      console.error("RENDER_API_KEY is required (or pass --from-process).");
      process.exit(2);
    }
    const envList = await listServiceEnvVars({ apiKey, serviceId: args.serviceId });
    presentKeys = envList.map((row) => row.key);
  }

  const report = runPreflight(presentKeys, inventory);
  assertNoSecretValues(report);
  console.log(JSON.stringify({ serviceId: args.serviceId, ...report }, null, 2));

  appendAuditLog({
    action: "preflight",
    actor: process.env.AUDIT_ACTOR || "agent",
    serviceId: args.serviceId,
    ok: report.ok,
    preflightPassed: report.ok,
    missingRequired: report.missingRequired,
    missingProtected: report.missingProtected,
    presentCount: report.presentCount
  });

  if (!report.ok || report.blockDeploy) {
    console.error("PREFLIGHT FAILED — do not deploy or restart production.");
    process.exit(1);
  }
  console.error("PREFLIGHT PASSED — required keys are present.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
