#!/usr/bin/env node
/**
 * Offline dry-run for Free Users welcome/upgrade email.
 * Never sends.
 *
 * Usage:
 *   node scripts/free-user-welcome-dry-run.js [path-to-store-or-users.json]
 *   node scripts/free-user-welcome-dry-run.js --json
 */
const fs = require("fs");
const path = require("path");
const {
  buildFreeUserRecipientDryRun,
  buildEmailContent,
  CONFIRM_PHRASE,
} = require("../server/free-user-welcome-email.js");

function loadStoreLike(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (raw?.users && typeof raw.users === "object" && !Array.isArray(raw.users)) {
    return { users: raw.users, foundingMembers: Array.isArray(raw.foundingMembers) ? raw.foundingMembers : [] };
  }
  if (raw?.backup?.users && typeof raw.backup.users === "object") {
    return {
      users: raw.backup.users,
      foundingMembers: Array.isArray(raw.backup.foundingMembers) ? raw.backup.foundingMembers : [],
    };
  }
  if (Array.isArray(raw?.users)) {
    const users = {};
    for (const user of raw.users) {
      const email = String(user?.email || "").trim().toLowerCase();
      if (!email) continue;
      users[email] = { ...user, email };
    }
    return { users, foundingMembers: [] };
  }
  throw new Error(`Unrecognized store shape in ${filePath}`);
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  const asJson = process.argv.includes("--json");
  const defaultPath = path.join(
    "/opt/cursor/artifacts/recovery-exports-20260717",
    "03-postgres-users-slim.json",
  );
  const filePath = path.resolve(args[0] || defaultPath);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const store = loadStoreLike(filePath);
  const adminEmail = String(process.env.ADMIN_EMAIL || "leahivie@icloud.com").trim().toLowerCase();
  const report = buildFreeUserRecipientDryRun(store, { adminEmail });
  const email = buildEmailContent();

  const out = {
    sourceFile: filePath,
    note: "OFFLINE DRY-RUN — re-run on production Admin before approving a send.",
    confirmPhraseRequired: CONFIRM_PHRASE,
    willSend: false,
    counts: report.counts,
    audienceRule: report.audienceRule,
    recipients: report.recipients.map((r) => ({
      email: r.email,
      accountStatus: r.accountStatus,
      membershipPlan: r.membershipPlan,
      qualifyReason: r.qualifyReason,
    })),
    excluded: report.excluded.map((r) => ({
      email: r.email,
      accountStatus: r.accountStatus,
      membershipPlan: r.membershipPlan,
      excludeReasons: r.excludeReasons,
    })),
    duplicateAnalysis: report.duplicateAnalysis,
    invalidEmailAnalysis: report.invalidEmailAnalysis,
    email: { subject: email.subject, text: email.text },
  };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log("=== Free Users welcome & upgrade — DRY RUN (no send) ===");
  console.log(`Source: ${filePath}`);
  console.log(`Audience: ${report.audienceRule}`);
  console.log("");
  console.log(`Total users scanned: ${report.counts.totalUsers}`);
  console.log(`Free access accounts: ${report.counts.freeAccessAccounts}`);
  console.log(`Recipients who would receive email: ${report.counts.recipients}`);
  console.log(`Excluded: ${report.counts.excluded}`);
  console.log(`Duplicates removed: ${report.counts.duplicatesRemoved}`);
  console.log(`Invalid/test emails: ${report.counts.invalidOrTestEmails}`);
  console.log("");
  console.log("--- Recipients ---");
  for (const row of report.recipients) {
    console.log(`✓ ${row.email}`);
    console.log(`    status: ${row.accountStatus} · plan: ${row.membershipPlan}`);
    console.log(`    why: ${row.qualifyReason}`);
  }
  if (!report.recipients.length) console.log("(none)");
  console.log("");
  console.log("--- Excluded (sample up to 40) ---");
  for (const row of report.excluded.slice(0, 40)) {
    console.log(`✗ ${row.email} · ${row.membershipPlan} · ${row.excludeReasons.join(", ")}`);
  }
  if (report.excluded.length > 40) console.log(`…and ${report.excluded.length - 40} more`);
  console.log("");
  console.log("--- Email preview ---");
  console.log(`Subject: ${email.subject}`);
  console.log("");
  console.log(email.text);
  console.log("");
  console.log(`Confirmation phrase required to send: ${CONFIRM_PHRASE}`);
  console.log("Nothing was sent.");
}

main();
