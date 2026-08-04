#!/usr/bin/env node
"use strict";

/**
 * Blocks production deploy/restart unless env preflight passes.
 * Wrap any deploy trigger with this script.
 *
 * Usage:
 *   RENDER_API_KEY=... node scripts/render-env-deploy-guard.js -- echo "would deploy"
 *   RENDER_API_KEY=... npm run env:deploy-guard -- --dry-run
 */

const { spawnSync } = require("child_process");
const path = require("path");
const { appendAuditLog } = require("./lib/render-env-safety");

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const sep = argv.indexOf("--");
  const passthrough = sep >= 0 ? argv.slice(sep + 1) : [];

  const preflight = spawnSync(process.execPath, [path.join(__dirname, "render-env-preflight.js")], {
    stdio: "inherit",
    env: process.env
  });

  if (preflight.status !== 0) {
    appendAuditLog({
      action: "deploy-blocked",
      actor: process.env.AUDIT_ACTOR || "agent",
      reason: "preflight_failed",
      preflightPassed: false
    });
    console.error("Deploy/restart blocked: env preflight failed.");
    process.exit(preflight.status || 1);
  }

  appendAuditLog({
    action: "deploy-preflight-ok",
    actor: process.env.AUDIT_ACTOR || "agent",
    preflightPassed: true,
    dryRun
  });

  if (dryRun || !passthrough.length) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          preflightPassed: true,
          dryRun: true,
          message: "Preflight passed. No deploy command executed."
        },
        null,
        2
      )
    );
    return;
  }

  const child = spawnSync(passthrough[0], passthrough.slice(1), {
    stdio: "inherit",
    env: process.env,
    shell: false
  });
  process.exit(child.status == null ? 1 : child.status);
}

main();
