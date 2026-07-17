#!/usr/bin/env node
/**
 * Offline dry-run for the Founding Members thank-you email.
 * Never sends. Reads a store JSON (or slim users export) and prints the recipient report.
 *
 * Usage:
 *   node scripts/founding-member-thank-you-dry-run.js [path-to-store-or-users.json]
 *   node scripts/founding-member-thank-you-dry-run.js --json
 */
const fs = require("fs");
const path = require("path");
const {
  buildFoundingMemberRecipientDryRun,
  buildEmailContent,
  CONFIRM_PHRASE,
} = require("../server/founding-member-email.js");

function loadStoreLike(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (raw?.users && typeof raw.users === "object" && !Array.isArray(raw.users)) {
    return {
      users: raw.users,
      foundingMembers: Array.isArray(raw.foundingMembers) ? raw.foundingMembers : [],
    };
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
    const foundingMembers = Object.values(users)
      .filter((u) => u.foundingMemberNumber || u.foundingMemberHistorical || u.foundingMember || u.foundingMemberActive || u.plan === "Founding")
      .map((u) => u.email);
    return { users, foundingMembers };
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
  const report = buildFoundingMemberRecipientDryRun(store, {
    adminEmail,
    includeAdmin: false,
  });
  const email = buildEmailContent();

  const out = {
    sourceFile: filePath,
    note: "OFFLINE DRY-RUN — not production live store. Re-run via Admin → Founding Members thank-you on production before approving a send.",
    confirmPhraseRequired: CONFIRM_PHRASE,
    willSend: false,
    counts: report.counts,
    audienceRule: report.audienceRule,
    recipients: report.recipients.map((r) => ({
      email: r.email,
      accountStatus: r.accountStatus,
      membershipPlan: r.membershipPlan,
      qualifyReason: r.qualifyReason,
      stripeSubscriptionStatus: r.stripeSubscriptionStatus,
      foundingMemberNumber: r.foundingMemberNumber,
    })),
    excluded: report.excluded.map((r) => ({
      email: r.email,
      accountStatus: r.accountStatus,
      excludeReasons: r.excludeReasons,
      stripeSubscriptionStatus: r.stripeSubscriptionStatus,
    })),
    duplicatesRemoved: report.duplicatesRemoved,
    email: {
      subject: email.subject,
      text: email.text,
    },
  };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log("=== Founding Members thank-you — DRY RUN (no send) ===");
  console.log(`Source: ${filePath}`);
  console.log(`Audience: ${report.audienceRule}`);
  console.log("");
  console.log(`Founding list: ${report.counts.foundingList}`);
  console.log(`Active Founding access (non-trial): ${report.counts.activeFoundingAccessNonTrial}`);
  console.log(`Recipients who would receive email: ${report.counts.recipients}`);
  console.log(`Excluded near-misses: ${report.counts.excluded}`);
  console.log(`Duplicates removed: ${report.counts.duplicatesRemoved}`);
  console.log("");
  console.log("--- Recipients ---");
  for (const row of out.recipients) {
    console.log(`✓ ${row.email}`);
    console.log(`    status: ${row.accountStatus} · plan: ${row.membershipPlan} · stripe: ${row.stripeSubscriptionStatus}`);
    console.log(`    why: ${row.qualifyReason}`);
  }
  console.log("");
  console.log("--- Excluded ---");
  for (const row of out.excluded) {
    console.log(`✗ ${row.email} · ${row.accountStatus} · ${row.excludeReasons.join(", ")} · stripe=${row.stripeSubscriptionStatus}`);
  }
  if (!out.excluded.length) console.log("(none)");
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
