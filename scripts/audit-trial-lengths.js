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
 * Never shortens trials. Prints a names-only classification table.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const trialClassification = require("./trial-classification.js");

function parseArgs(argv) {
  const out = { store: "", live: false, enrichStripe: false, baseUrl: process.env.BASE_URL || "" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--live") out.live = true;
    else if (a === "--enrich-stripe") out.enrichStripe = true;
    else if (a.startsWith("--store=")) out.store = a.slice("--store=".length);
    else if (a.startsWith("--base-url=")) out.baseUrl = a.slice("--base-url=".length);
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
        timeout: 60000,
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

function printTable(rows) {
  console.log("\nemail | kind | start | local_end | stripe_end | days_left | duration | promo | extension | verdict");
  console.log("-".repeat(120));
  for (const row of rows) {
    console.log([
      row.email,
      row.kindLabel || row.kind,
      (row.trialStart || "").slice(0, 10) || "—",
      (row.localTrialEnd || "").slice(0, 10) || "—",
      (row.stripeTrialEnd || "").slice(0, 10) || "—",
      row.daysRemainingShown ?? "—",
      row.durationDays ?? "—",
      row.promoCode || "—",
      row.extensionSource || "—",
      row.verdict,
    ].join(" | "));
  }
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
    console.log(JSON.stringify(res.json.summary, null, 2));
    printTable(res.json.trials || []);
    console.log("\nCorrection plan: do not shorten any trial without owner approval.");
    console.log("Promo-Extended and Manually Extended rows are intentional.");
    console.log("affected_unexpected_30day / local≠Stripe rows need Stripe Dashboard confirmation first.");
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
  console.log(JSON.stringify(audit.summary, null, 2));
  printTable(audit.rows);
  console.log(`\nSource file: ${path.resolve(storePath)}`);
  console.log("Stripe trial end dates are not filled in offline mode — use --live --enrich-stripe.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
