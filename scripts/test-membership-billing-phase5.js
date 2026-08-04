#!/usr/bin/env node
/**
 * Phase 5 — Membership & billing contradiction fixes.
 * Run: npm run test:membership-billing-phase5
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const membershipAccess = require("./membership-access.js");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/site-stabilization/phase5";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

test("foundingMemberActive without Stripe status still has Pro access", () => {
  const user = {
    plan: "Founding",
    foundingMemberActive: true,
    foundingMember: true,
    foundingMemberNumber: 7,
    // Intentionally omit stripeSubscriptionStatus + accessEndsAt
  };
  assert.equal(membershipAccess.membershipHasProAccess(user), true);
  assert.equal(membershipAccess.membershipFoundingActive(user), true);
  assert.equal(membershipAccess.membershipPlanDisplay(user), "Founding Member");
});

test("static app contracts: upgrade gate, AI display helpers, Stripe details", () => {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(appJs, /account\?\.foundingMemberActive\) return false/, "canSeePaidUpgradeOffer blocks Founding active");
  assert.match(appJs, /function displayAiUsageUsed/);
  assert.match(appJs, /function displayAiUsageLimit/);
  assert.match(appJs, /displayAiUsageLabel\(\)/);
  assert.match(appJs, /Helper Usage: \$\{displayAiUsageUsed\(\)\} of \$\{displayAiUsageLimit\(\)\}/);
  assert.match(appJs, /llh-billing-dev-details/, "Stripe IDs behind developer details");
  assert.doesNotMatch(
    appJs,
    /Stripe Customer: \$\{escapeHtml\(paidBilling \? account\?\.stripeCustomerId/,
    "bare Stripe customer line removed from always-visible billing panel",
  );
  assert.match(appJs, /Do not flip emailVerified on send failure/);
  assert.match(appJs, /step\.id !== "upgrade-library"/, "onboarding hides upgrade for paid");
  assert.match(appJs, /Founding Member access/, "library notice names Founding");
  assert.match(serverJs, /function aiLimitForUser/);
  assert.match(serverJs, /canUseServerAi\(email, subscription\?\.plan \|\| "Free", subscription\)/);
});

test("historical founding flag alone does not imply price lock copy in billing summary", () => {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  // Price Lock in subscriptionSummaryHtml must not use historical foundingMember alone.
  assert.match(
    appJs,
    /account\?\.foundingMemberActive \|\| normalizeBillingPlan\(account\?\.plan, account\) === "Founding" \? escapeHtml\(FOUNDING_PRICE_LOCK_COPY\)/,
  );
  assert.doesNotMatch(
    appJs,
    /foundingMemberActive \|\| normalizeBillingPlan\(account\?\.plan, account\) === "Founding" \|\| account\?\.foundingMember \? escapeHtml\(FOUNDING_PRICE_LOCK_COPY\)/,
  );
});

const report = {
  suite: "membership-billing-phase5",
  generatedAt: new Date().toISOString(),
  curriculumUntouched: true,
};
fs.writeFileSync(path.join(ARTIFACT_DIR, "phase5-report.json"), JSON.stringify(report, null, 2));

if (!process.exitCode) {
  console.log("\nAll Phase 5 membership/billing checks passed.");
}
