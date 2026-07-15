#!/usr/bin/env node
/**
 * Audit subscription records without treating missing billing as cancellation.
 *
 * Dry run (default):
 *   node scripts/audit-repair-subscription-statuses.js
 * Apply only evidence-backed normalizations:
 *   node scripts/audit-repair-subscription-statuses.js --apply
 *
 * The script always writes a timestamped audit report. Before --apply writes any
 * record, it also exports the complete source store to a timestamped backup.
 * Ambiguous "ended" records are never changed automatically.
 */
const fs = require("fs");
const path = require("path");
const membership = require("./membership-access.js");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
const inputPath = path.resolve(inputArg ? inputArg.slice("--input=".length) : process.env.LLH_STORE_PATH || "data/launch-store.json");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.resolve(process.env.SUBSCRIPTION_AUDIT_DIR || "data/subscription-audits");

function hasVerifiedHistory(user) {
  return membership.membershipHasSubscriptionHistory(user);
}

function classify(user) {
  return {
    currentAccess: membership.membershipCurrentAccessKey(user),
    billingStatus: membership.membershipBillingStatusKey(user),
    billingStatusLabel: membership.membershipStatusDisplay(user),
    previousPlan: membership.membershipPreviousPlanDisplay(user),
    hasProAccess: membership.membershipHasProAccess(user),
    hasVerifiedHistory: hasVerifiedHistory(user),
  };
}

function evidenceBackedRepair(user, nowMs = Date.now()) {
  const next = { ...user };
  const changes = {};
  const trialEndMs = user.trialEnd ? new Date(user.trialEnd).getTime() : NaN;
  const expiredTrial = membership.membershipHasTrialHistory(user)
    && Number.isFinite(trialEndMs)
    && trialEndMs <= nowMs
    && !user.internalAccessOverride;

  if (expiredTrial && (user.plan !== "Free" || user.trialStatus === "In Trial")) {
    Object.assign(changes, {
      plan: "Free",
      subscriptionStatus: String(user.trialStatus || "").toLowerCase().includes("cancel")
        ? "Trial Canceled"
        : "Trial Ended",
      trialStatus: String(user.trialStatus || "").toLowerCase().includes("cancel")
        ? "Trial Canceled"
        : "Trial Ended",
      previousPlan: "Pro Trial",
      subscriptionEndedAt: user.subscriptionEndedAt || user.trialEnd,
      monthlyPrice: "$0/month",
      foundingMemberActive: false,
    });
  }

  // This is the normal never-subscribed state. Normalize only its explicit
  // state field; never convert an ambiguous ended record based on absence alone.
  if (!hasVerifiedHistory(user) && String(user.subscriptionStatus || "") === "Free Plan"
      && user.subscriptionState !== "No Subscription") {
    changes.subscriptionState = "No Subscription";
  }

  return { next: { ...next, ...changes }, changes };
}

if (!fs.existsSync(inputPath)) {
  console.error(`Store not found: ${inputPath}`);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const users = Object.values(store.users || {});
const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? "apply" : "dry-run",
  source: inputPath,
  totals: {},
  proposedRepairs: [],
  manualReview: [],
  users: [],
};

const repairedUsers = { ...(store.users || {}) };
for (const user of users) {
  const result = classify(user);
  const { next, changes } = evidenceBackedRepair(user);
  const rawStatus = String(user.subscriptionStatus || "");
  const ambiguousEnded = /canceled and ended|subscription ended/i.test(rawStatus) && !hasVerifiedHistory({
    ...user,
    subscriptionStatus: "",
  });

  report.users.push({
    email: user.email,
    rawPlan: user.plan || "Free",
    rawSubscriptionStatus: rawStatus || "",
    stripeCustomerId: user.stripeCustomerId || "",
    stripeSubscriptionId: user.stripeSubscriptionId || "",
    ...result,
  });
  report.totals[result.currentAccess] = (report.totals[result.currentAccess] || 0) + 1;
  report.totals[`billing:${result.billingStatus}`] = (report.totals[`billing:${result.billingStatus}`] || 0) + 1;
  if (Object.keys(changes).length) {
    report.proposedRepairs.push({ email: user.email, changes });
    repairedUsers[user.email] = { ...next, updatedAt: apply ? new Date().toISOString() : user.updatedAt };
  }
  if (ambiguousEnded) {
    report.manualReview.push({
      email: user.email,
      reason: "Ended status has no retained Stripe/trial/subscription evidence; verify Stripe history before changing.",
    });
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const reportPath = path.join(outputDir, `subscription-audit-${stamp}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (apply && report.proposedRepairs.length) {
  const backupPath = path.join(outputDir, `subscription-backup-${stamp}.json`);
  fs.copyFileSync(inputPath, backupPath);
  store.users = repairedUsers;
  fs.writeFileSync(inputPath, JSON.stringify(store, null, 2));
  console.log(`Backup: ${backupPath}`);
}

console.log(`${apply ? "Applied" : "Proposed"} ${report.proposedRepairs.length} evidence-backed repair(s).`);
console.log(`Manual review: ${report.manualReview.length} ambiguous record(s).`);
console.log(`Report: ${reportPath}`);
