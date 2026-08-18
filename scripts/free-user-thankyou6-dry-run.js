#!/usr/bin/env node
/**
 * Offline preview for Free User Thank You — THANKYOU6.
 * Never sends.
 *
 * Usage:
 *   node scripts/free-user-thankyou6-dry-run.js [path-to-store-or-users.json]
 */
const fs = require("fs");
const path = require("path");
const {
  buildThankYou6RecipientDryRun,
  buildEmailContent,
  CONFIRM_PHRASE,
  CAMPAIGN_ID,
} = require("../server/free-user-thankyou6-email.js");

function loadStoreLike(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (raw?.users && typeof raw.users === "object" && !Array.isArray(raw.users)) {
    return { users: raw.users };
  }
  if (raw?.backup?.users && typeof raw.backup.users === "object") {
    return { users: raw.backup.users };
  }
  if (Array.isArray(raw?.users)) {
    const users = {};
    for (const user of raw.users) {
      const email = String(user?.email || "").trim().toLowerCase();
      if (!email) continue;
      users[email] = { ...user, email };
    }
    return { users };
  }
  throw new Error(`Unrecognized store shape in ${filePath}`);
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--json");
  const asJson = process.argv.includes("--json");
  const filePath = args[0] ? path.resolve(args[0]) : "";
  if (!filePath || !fs.existsSync(filePath)) {
    console.error("Pass a store/users JSON path. This script never sends email.");
    process.exit(filePath ? 1 : 0);
  }
  const store = loadStoreLike(filePath);
  const report = buildThankYou6RecipientDryRun(store, {
    adminEmail: process.env.ADMIN_EMAIL || "",
    adminEmails: String(process.env.ADMIN_EMAILS || "").split(","),
    siteUrl: "https://littlelearnershubbyleah.com",
  });
  const email = buildEmailContent({ siteUrl: "https://littlelearnershubbyleah.com" });
  if (asJson) {
    console.log(JSON.stringify({ ...report, emailPreview: email.text, confirmPhraseRequired: CONFIRM_PHRASE }, null, 2));
    return;
  }
  console.log("=== THANKYOU6 preview (no send) ===");
  console.log(`Campaign: ${CAMPAIGN_ID}`);
  console.log(`Total Free: ${report.counts.totalFreeUsers}`);
  console.log(`Eligible: ${report.counts.totalEligible}`);
  console.log(`Selected: ${report.counts.selected}`);
  console.log(`Measurable activity: ${report.counts.measurableActivity}`);
  if (report.stopReason) console.log(`STOP: ${report.stopReason}`);
  console.log("");
  for (const row of report.recipients) {
    console.log(`✓ ${row.email}  score=${row.activityScore}  lastActive=${row.lastActiveAt || "n/a"}`);
    console.log(`    ${row.rankWhy}`);
  }
  console.log("");
  console.log(`Subject: ${email.subject}`);
  console.log(email.text);
  console.log("");
  console.log(`Confirmation phrase: ${CONFIRM_PHRASE}`);
  console.log("Nothing was sent.");
}

main();
