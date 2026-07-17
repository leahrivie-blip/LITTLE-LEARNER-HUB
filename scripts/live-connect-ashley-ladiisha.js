#!/usr/bin/env node
/**
 * Production dry-run / optional live connect for Ashley + Ladiisha.
 *
 * Dry-run (default):
 *   LLH_ADMIN_TOKEN=admin_... node scripts/live-connect-ashley-ladiisha.js
 *
 * Apply ONLY after dry-run is clean (or with --force-ambiguities after review):
 *   LLH_ADMIN_TOKEN=admin_... node scripts/live-connect-ashley-ladiisha.js --apply
 *
 * Requires deployed /api/admin/program-migration-plan and a valid admin token.
 */
const https = require("node:https");
const http = require("node:http");

const BASE = String(process.env.LLH_AUDIT_BASE || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const TOKEN = String(process.env.LLH_ADMIN_TOKEN || "").trim();
const OWNER = "tclashley@icloud.com";
const DIRECTOR = "ladiisha01@gmail.com";
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force-ambiguities");

function fetchJson(urlPath) {
  const url = new URL(urlPath, BASE);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, { headers: { Accept: "application/json" } }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw: raw.slice(0, 400) }; }
        resolve({ status: res.statusCode, json });
      });
    }).on("error", reject);
  });
}

async function main() {
  if (!TOKEN) {
    console.error("Missing LLH_ADMIN_TOKEN. Unlock Admin in the app and export the token.");
    process.exit(1);
  }
  const dryUrl = `/api/admin/program-migration-plan?adminToken=${encodeURIComponent(TOKEN)}&ownerEmail=${encodeURIComponent(OWNER)}&memberEmail=${encodeURIComponent(DIRECTOR)}`;
  console.log("=== DRY RUN ===");
  const dry = await fetchJson(dryUrl);
  console.log(JSON.stringify(dry.json, null, 2));
  if (dry.status !== 200) {
    console.error("\nDRY RUN FAILED");
    process.exit(2);
  }
  const ambiguities = dry.json.ambiguities || [];
  const ownerOk = Boolean(dry.json.ownerEmail === OWNER || dry.json.programOwnerEmail === OWNER);
  console.log("\nSummary:", {
    status: dry.status,
    mode: dry.json.mode,
    programOwnerEmail: dry.json.programOwnerEmail || dry.json.ownerEmail,
    directorEmail: dry.json.directorEmail || dry.json.memberEmail,
    ambiguities: ambiguities.length,
    childSource: dry.json.childSource,
    scheduleSource: dry.json.scheduleSource,
    ownerOk,
  });
  if (!APPLY) {
    if (ambiguities.length) {
      console.log("\nDRY RUN COMPLETE WITH AMBIGUITIES — do not apply until reviewed.");
      process.exitCode = 3;
    } else {
      console.log("\nDRY RUN CLEAN — re-run with --apply to connect live accounts.");
    }
    return;
  }
  if (ambiguities.length && !FORCE) {
    console.error("\nRefusing apply: ambiguities present. Re-run with --force-ambiguities only after manual review.");
    process.exit(4);
  }
  let applyUrl = `${dryUrl}&apply=1&linkMember=1&clearMemberFounding=1&confirm=${encodeURIComponent("CONNECT_ASHLEY_LADIISHA")}`;
  if (FORCE || ambiguities.length) applyUrl += "&forceAmbiguities=1";
  console.log("\n=== APPLY LIVE CONNECT ===");
  const applied = await fetchJson(applyUrl);
  console.log(JSON.stringify(applied.json, null, 2));
  if (applied.status !== 200 || !applied.json.applied) {
    console.error("\nAPPLY FAILED");
    process.exit(5);
  }
  console.log("\nAPPLY COMPLETE", {
    memberLinked: applied.json.memberLinked,
    memberFoundingCleared: applied.json.memberFoundingCleared,
    ashleyBillingProtected: applied.json.ashleyBillingProtected,
    backupId: applied.json.backupId,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
