#!/usr/bin/env node
/**
 * READ-ONLY audit: billing / membership access enforcement.
 *
 * Classifies each membership user and flags ACCESS MISMATCHES against
 * scripts/membership-access.js rules. Never writes to a store or production.
 *
 * Inputs (pick one):
 *   --input=<path>     Local launch-store JSON, backup JSON, slim users export,
 *                      or admin analytics JSON ({ users: [...] }).
 *   --users=<path>     JSON array of membership user objects, or { users: [...] }.
 *   (no input)         Reads LLH_STORE_PATH or server/data/launch-store.json.
 *
 * Output:
 *   Prints JSON summary (counts + mismatches) to stdout.
 *   Optional: --out=<path> also writes the same JSON to disk.
 *
 * Prod (via admin, no credentials baked in):
 *   1. Unlock Admin on production (email + password + access code).
 *   2. GET /api/admin/analytics?adminToken=<token>
 *      Save the response (or just the `users` array) to a file.
 *   3. node scripts/audit-billing-access-enforcement.js \
 *        --input=/path/to/admin-analytics.json --out=audit-billing-access.json
 *
 * Offline slim export example:
 *   node scripts/audit-billing-access-enforcement.js \
 *     --input=/opt/cursor/artifacts/recovery-exports-20260717/03-postgres-users-slim.json \
 *     --out=/opt/cursor/artifacts/audit-billing-access-offline.json
 */
"use strict";

const fs = require("fs");
const path = require("path");
const membership = require("./membership-access.js");

const CLASS_LABELS = [
  "Free",
  "Trial",
  "Founding Active",
  "Pro Monthly",
  "Pro Annual",
  "Past Due",
  "Canceled with residual access",
  "Canceled Free",
];

function argValue(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function parseIsoMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function hasStripeSubscriptionEvidence(user) {
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  return Boolean(user?.stripeSubscriptionId || user?.subscriptionStartedAt)
    || ["active", "trialing", "past_due", "unpaid", "canceled", "cancelled"].includes(stripeStatus);
}

function isPastDueOrUnpaid(user) {
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const subStatus = String(user?.subscriptionStatus || "").toLowerCase();
  return stripeStatus === "past_due"
    || stripeStatus === "unpaid"
    || subStatus.includes("past due")
    || subStatus.includes("payment failed");
}

function isCanceledStripe(user) {
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const subStatus = String(user?.subscriptionStatus || "").toLowerCase();
  return stripeStatus === "canceled"
    || stripeStatus === "cancelled"
    || subStatus.includes("canceled and ended")
    || subStatus.includes("subscription ended")
    || subStatus.includes("trial ended")
    || subStatus.includes("trial canceled");
}

function hasCancelResidualSignal(user) {
  const subStatus = String(user?.subscriptionStatus || "").toLowerCase();
  return Boolean(user?.cancelAtPeriodEnd)
    || subStatus.includes("access ends")
    || subStatus.includes("cancels at");
}

/**
 * Classify a membership user into one of the audit buckets.
 * Uses membership-access.js as the source of truth for access / trial / founding.
 */
function classifyUser(user, nowMs = Date.now()) {
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const statusKey = membership.membershipStatusDisplay(user, nowMs);
  const hasAccess = membership.membershipHasProAccess(user, nowMs);
  const inTrial = membership.membershipUserInTrial(user, nowMs);
  const foundingActive = membership.membershipFoundingActive(user, nowMs);
  const planDisplay = membership.membershipPlanDisplay(user, nowMs);

  if (statusKey === "Past Due" || statusKey === "Payment Failed" || isPastDueOrUnpaid(user)) {
    return "Past Due";
  }

  if (hasAccess && (hasCancelResidualSignal(user) || (
    (stripeStatus === "canceled" || stripeStatus === "cancelled")
    && (membership.accessEndMs(user) === null || membership.accessEndMs(user) > nowMs)
  ))) {
    return "Canceled with residual access";
  }

  if (hasAccess && inTrial) return "Trial";
  if (hasAccess && foundingActive) return "Founding Active";
  if (hasAccess && (planDisplay === "Pro Annual" || user?.subscriptionCadence === "annual")) {
    return "Pro Annual";
  }
  if (hasAccess) return "Pro Monthly";

  if (
    isCanceledStripe(user)
    || hasCancelResidualSignal(user)
    || membership.membershipBillingStatusKey(user, nowMs) === "ended"
    || membership.membershipBillingStatusKey(user, nowMs) === "canceled"
  ) {
    return "Canceled Free";
  }

  return "Free";
}

function flagMismatches(user, classification, nowMs = Date.now()) {
  const mismatches = [];
  const hasAccess = membership.membershipHasProAccess(user, nowMs);
  const storedHasAccess = typeof user?.hasProAccess === "boolean" ? user.hasProAccess : null;
  const effectiveHasAccess = hasAccess || storedHasAccess === true;
  const inTrial = membership.membershipUserInTrial(user, nowMs);
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const plan = String(user?.plan || "").trim();
  const endMs = membership.accessEndMs(user);

  // 1) hasProAccess but no stripe subscription evidence and not internalAccessOverride and not trial
  if (effectiveHasAccess
    && !hasStripeSubscriptionEvidence(user)
    && user?.internalAccessOverride !== true
    && !inTrial
    && !(String(user?.trialStatus || "").toLowerCase().includes("in trial"))) {
    mismatches.push({
      code: "pro_access_without_stripe_evidence",
      detail: "hasProAccess but no stripe subscription evidence and not internalAccessOverride and not trial",
    });
  }

  // 2) foundingMemberActive but !membershipHasProAccess
  if (user?.foundingMemberActive === true && !hasAccess) {
    mismatches.push({
      code: "founding_active_without_pro_access",
      detail: "foundingMemberActive but !membershipHasProAccess",
    });
  }

  // 3) plan says Pro/Founding but Free access
  if (["Pro", "Founding"].includes(plan) && !hasAccess) {
    mismatches.push({
      code: "paid_plan_label_with_free_access",
      detail: `plan says ${plan} but Free access`,
    });
  }

  // 4) stripe active/trialing but !hasProAccess (unless past_due/unpaid handled)
  if ((stripeStatus === "active" || stripeStatus === "trialing")
    && !hasAccess
    && !isPastDueOrUnpaid(user)) {
    mismatches.push({
      code: "stripe_active_without_pro_access",
      detail: `stripe ${stripeStatus} but !hasProAccess`,
    });
  }

  // 5) past_due with unlimited pro access
  if (isPastDueOrUnpaid(user) && effectiveHasAccess) {
    mismatches.push({
      code: "past_due_with_pro_access",
      detail: "past_due with unlimited pro access",
    });
  }

  // 6) canceled stripe but still hasProAccess beyond accessEndsAt
  if ((stripeStatus === "canceled" || stripeStatus === "cancelled" || hasCancelResidualSignal(user))
    && effectiveHasAccess
    && endMs !== null
    && endMs <= nowMs) {
    mismatches.push({
      code: "canceled_access_past_access_ends_at",
      detail: "canceled stripe but still hasProAccess beyond accessEndsAt",
    });
  }

  // Stored vs computed disagreement (helpful on slim admin exports)
  if (storedHasAccess !== null && storedHasAccess !== hasAccess) {
    mismatches.push({
      code: "stored_hasProAccess_mismatch",
      detail: `stored hasProAccess=${storedHasAccess} but membershipHasProAccess=${hasAccess}`,
    });
  }

  return mismatches;
}

function loadUsersFromValue(raw, sourceLabel) {
  if (Array.isArray(raw)) {
    return { users: raw.filter((u) => u && typeof u === "object"), sourceLabel, sourceShape: "array" };
  }
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.users)) {
      return { users: raw.users.filter((u) => u && typeof u === "object"), sourceLabel, sourceShape: "users-array" };
    }
    if (raw.users && typeof raw.users === "object" && !Array.isArray(raw.users)) {
      return {
        users: Object.values(raw.users).filter((u) => u && typeof u === "object"),
        sourceLabel,
        sourceShape: "store.users-map",
      };
    }
    if (raw.backup?.users && typeof raw.backup.users === "object" && !Array.isArray(raw.backup.users)) {
      return {
        users: Object.values(raw.backup.users).filter((u) => u && typeof u === "object"),
        sourceLabel,
        sourceShape: "backup.users-map",
      };
    }
    if (raw.backup && Array.isArray(raw.backup.users)) {
      return {
        users: raw.backup.users.filter((u) => u && typeof u === "object"),
        sourceLabel,
        sourceShape: "backup.users-array",
      };
    }
  }
  throw new Error(`Unrecognized membership/user payload in ${sourceLabel}`);
}

function loadUsersFromFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  return loadUsersFromValue(raw, abs);
}

/**
 * Programmatic entry: audit an array of membership user objects (or store-like).
 * @param {object[]|object} usersOrStore
 * @param {{ nowMs?: number, source?: string }} [opts]
 */
function auditMembershipUsers(usersOrStore, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const loaded = Array.isArray(usersOrStore)
    ? { users: usersOrStore, sourceLabel: opts.source || "(in-memory array)", sourceShape: "array" }
    : loadUsersFromValue(usersOrStore, opts.source || "(in-memory object)");

  const classCounts = Object.fromEntries(CLASS_LABELS.map((label) => [label, 0]));
  const mismatches = [];
  const users = [];

  for (const user of loaded.users) {
    const email = String(user.email || "").trim().toLowerCase() || "(missing-email)";
    const classification = classifyUser(user, nowMs);
    classCounts[classification] = (classCounts[classification] || 0) + 1;
    const flags = flagMismatches(user, classification, nowMs);
    const row = {
      email,
      classification,
      plan: user.plan || "",
      subscriptionStatus: user.subscriptionStatus || "",
      stripeSubscriptionStatus: user.stripeSubscriptionStatus || "",
      foundingMemberActive: Boolean(user.foundingMemberActive),
      internalAccessOverride: Boolean(user.internalAccessOverride),
      computedHasProAccess: membership.membershipHasProAccess(user, nowMs),
      storedHasProAccess: typeof user.hasProAccess === "boolean" ? user.hasProAccess : null,
      membershipPlanDisplay: membership.membershipPlanDisplay(user, nowMs),
      membershipStatusDisplay: membership.membershipStatusDisplay(user, nowMs),
      accessEndsAt: user.accessEndsAt || user.currentPeriodEnd || user.trialEnd || "",
      stripeSubscriptionId: user.stripeSubscriptionId || "",
      mismatchCodes: flags.map((f) => f.code),
    };
    users.push(row);
    for (const flag of flags) {
      mismatches.push({
        email,
        classification,
        code: flag.code,
        detail: flag.detail,
        plan: row.plan,
        subscriptionStatus: row.subscriptionStatus,
        stripeSubscriptionStatus: row.stripeSubscriptionStatus,
        computedHasProAccess: row.computedHasProAccess,
        storedHasProAccess: row.storedHasProAccess,
        foundingMemberActive: row.foundingMemberActive,
        accessEndsAt: row.accessEndsAt,
        stripeSubscriptionId: row.stripeSubscriptionId,
      });
    }
  }

  return {
    readOnly: true,
    generatedAt: new Date().toISOString(),
    nowMs,
    source: loaded.sourceLabel,
    sourceShape: loaded.sourceShape,
    rulesModule: "scripts/membership-access.js",
    totalUsers: loaded.users.length,
    classCounts,
    mismatchCount: mismatches.length,
    usersWithMismatches: new Set(mismatches.map((m) => m.email)).size,
    mismatches,
    howToRunAgainstProdViaAdmin: {
      steps: [
        "Unlock Admin on production with ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_ACCESS_CODE (no secrets in this script).",
        "GET /api/admin/analytics?adminToken=<session-token> and save the JSON response.",
        "node scripts/audit-billing-access-enforcement.js --input=/path/to/admin-analytics.json --out=audit-billing-access.json",
      ],
      note: "Admin analytics `users` rows already include membership fields (hasProAccess, foundingMemberActive, stripe*, accessEndsAt, etc.) suitable for this audit.",
    },
    users,
  };
}

function defaultStorePath() {
  return process.env.LLH_STORE_PATH
    || path.join(__dirname, "..", "server", "data", "launch-store.json");
}

function main() {
  const inputPath = argValue("--input=") || argValue("--store=");
  const usersPath = argValue("--users=");
  const outPath = argValue("--out=");
  const nowArg = argValue("--now=");
  const nowMs = nowArg ? Date.parse(nowArg) : Date.now();
  if (nowArg && !Number.isFinite(nowMs)) {
    console.error(`Invalid --now= value: ${nowArg}`);
    process.exit(1);
  }

  let report;
  try {
    if (usersPath) {
      const loaded = loadUsersFromFile(usersPath);
      report = auditMembershipUsers(loaded.users, { nowMs, source: loaded.sourceLabel });
      report.sourceShape = loaded.sourceShape;
    } else if (inputPath) {
      const loaded = loadUsersFromFile(inputPath);
      report = auditMembershipUsers(loaded.users, { nowMs, source: loaded.sourceLabel });
      report.sourceShape = loaded.sourceShape;
    } else {
      const storePath = defaultStorePath();
      if (!fs.existsSync(storePath)) {
        console.error("Usage:");
        console.error("  node scripts/audit-billing-access-enforcement.js --input=<store-or-slim.json> [--out=<report.json>]");
        console.error("  node scripts/audit-billing-access-enforcement.js --users=<users-array.json> [--out=<report.json>]");
        console.error(`Default store not found: ${storePath}`);
        process.exit(1);
      }
      const loaded = loadUsersFromFile(storePath);
      report = auditMembershipUsers(loaded.users, { nowMs, source: loaded.sourceLabel });
      report.sourceShape = loaded.sourceShape;
    }
  } catch (err) {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  }

  // Compact stdout for humans; full detail still includes users when --verbose
  const verbose = process.argv.includes("--verbose");
  const printable = verbose
    ? report
    : {
      readOnly: report.readOnly,
      generatedAt: report.generatedAt,
      source: report.source,
      sourceShape: report.sourceShape,
      rulesModule: report.rulesModule,
      totalUsers: report.totalUsers,
      classCounts: report.classCounts,
      mismatchCount: report.mismatchCount,
      usersWithMismatches: report.usersWithMismatches,
      mismatches: report.mismatches,
      howToRunAgainstProdViaAdmin: report.howToRunAgainstProdViaAdmin,
    };

  const text = `${JSON.stringify(printable, null, 2)}\n`;
  process.stdout.write(text);

  if (outPath) {
    const absOut = path.resolve(outPath);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    // Always write the full report (including per-user rows) to --out
    fs.writeFileSync(absOut, `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`Wrote ${absOut}\n`);
  }
}

module.exports = {
  CLASS_LABELS,
  classifyUser,
  flagMismatches,
  auditMembershipUsers,
  loadUsersFromFile,
  loadUsersFromValue,
  hasStripeSubscriptionEvidence,
};

if (require.main === module) {
  main();
}
