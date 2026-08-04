#!/usr/bin/env node
/**
 * Read-only trial length audit helper.
 *
 * Usage (local store dump):
 *   node scripts/audit-trial-lengths.js --store=/path/to/launch-store.json
 *
 * Usage (live Admin API — does not mutate data):
 *   ADMIN_TOKEN=... BASE_URL=https://littlelearnershubbyleah.com \
 *     node scripts/audit-trial-lengths.js --live --enrich-stripe
 *
 * Never shortens trials. Prints count summary only to stdout.
 * Full account table (with PII) is written only to a secure local path.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const trialClassification = require("./trial-classification.js");

function parseArgs(argv) {
  const out = {
    store: "",
    live: false,
    enrichStripe: false,
    baseUrl: process.env.BASE_URL || "",
    secureOut: process.env.TRIAL_AUDIT_SECURE_OUT
      || "/opt/cursor/artifacts/secure/trial-audit-live.json",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--live") out.live = true;
    else if (a === "--enrich-stripe") out.enrichStripe = true;
    else if (a.startsWith("--store=")) out.store = a.slice("--store=".length);
    else if (a.startsWith("--base-url=")) out.baseUrl = a.slice("--base-url=".length);
    else if (a.startsWith("--secure-out=")) out.secureOut = a.slice("--secure-out=".length);
  }
  return out;
}

function requestJson(urlString, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
        timeout: 120000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function writeSecureReport(filePath, payload) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch { /* ignore */ }
  return filePath;
}

function printSummary(summary = {}) {
  console.log(JSON.stringify({
    totalActiveTrials: summary.totalActiveTrials ?? 0,
    standard7day: summary.standard7day ?? 0,
    promoExtended: summary.promoExtended ?? 0,
    manuallyExtended: summary.manuallyExtended ?? 0,
    legacy: summary.legacy ?? 0,
    unexpected30day: summary.unexpected30day ?? summary.affectedUnexpected30day ?? 0,
    stripeLocalMismatch: summary.stripeLocalMismatch ?? summary.localStripeMismatch ?? 0,
    try1monthCount: summary.try1monthCount ?? 0,
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.live) {
    const base = String(args.baseUrl || process.env.BASE_URL || "").replace(/\/$/, "");
    const token = String(process.env.ADMIN_TOKEN || "").trim();
    if (!base || !token) {
      console.error("Need BASE_URL and ADMIN_TOKEN for --live mode.");
      process.exit(2);
    }
    const qs = args.enrichStripe ? "&enrichStripe=1" : "";
    const res = await requestJson(
      `${base}/api/admin/trial-audit?adminToken=${encodeURIComponent(token)}${qs}`,
      { Authorization: `Bearer ${token}`, "X-Admin-Token": token },
    );
    if (res.status !== 200) {
      console.error("Audit failed:", res.status, res.text?.slice(0, 400));
      process.exit(1);
    }
    printSummary(res.json.summary || {});
    const securePath = writeSecureReport(args.secureOut, {
      generatedAt: new Date().toISOString(),
      enrichedFromStripe: Boolean(res.json.enrichedFromStripe),
      summary: res.json.summary,
      trials: res.json.trials || [],
      note: "PII — do not copy into PR comments, screenshots, or shared logs.",
    });
    console.log(`\nSecure full account table written to: ${securePath}`);
    console.log("Correction plan: do not shorten any trial without owner approval.");
    console.log("Promo-Extended and Manually Extended rows are intentional — leave as promised.");
    console.log("Unexpected 30-day / Stripe≠local rows need a correction proposal only (no auto-change).");
    return;
  }

  const storePath = args.store || process.env.LLH_STORE_PATH || "";
  if (!storePath || !fs.existsSync(storePath)) {
    console.error("Provide --store=/path/to/launch-store.json or use --live with ADMIN_TOKEN.");
    process.exit(2);
  }
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  const users = Object.values(store.users || {});
  const auditsByEmail = {};
  for (const entry of (store.membershipAudit || [])) {
    const email = String(entry?.email || "").toLowerCase();
    if (!email) continue;
    if (!auditsByEmail[email]) auditsByEmail[email] = [];
    auditsByEmail[email].push(entry);
  }
  const audit = trialClassification.auditTrialAccounts(users, { auditsByEmail });
  printSummary(audit.summary);
  const securePath = writeSecureReport(args.secureOut, {
    generatedAt: new Date().toISOString(),
    source: path.resolve(storePath),
    summary: audit.summary,
    trials: audit.rows,
    note: "PII — do not copy into PR comments, screenshots, or shared logs.",
  });
  console.log(`\nSecure full account table written to: ${securePath}`);
  console.log("Stripe trial end dates are not filled in offline mode — use --live --enrich-stripe.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
