#!/usr/bin/env node
/**
 * Signup conversion wizard markers.
 * Run: node scripts/test-signup-pricing-flow.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

const root = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("three-step signup wizard markup and state exist", () => {
  assert.match(indexHtml, /signupWizardProgress/);
  assert.match(indexHtml, /signupStepProgram/);
  assert.match(indexHtml, /signupStepPlan/);
  assert.match(appJs, /Create Your Free Little Learner Hub Account/);
  assert.match(appJs, /signupWizardStep/);
  assert.match(appJs, /renderSignupWizardStep/);
  assert.match(appJs, /renderSignupPlanChooser/);
  assert.match(appJs, /finishSignupWithPlan/);
  assert.match(appJs, /mapSignupPersona/);
});

test("plan chooser features Free, Founding featured, and Pro", () => {
  assert.match(appJs, /Claim My Founding Spot/);
  assert.match(appJs, /Start Free/);
  assert.match(appJs, /Continue with Pro/);
  assert.match(appJs, /Most Popular/);
  assert.match(appJs, /FOR LIFE/);
  assert.match(appJs, /Founding Spots Remaining/);
  assert.match(appJs, /Created by a Childcare Provider/);
  assert.match(appJs, /signup-plan-grid--founding-open/);
  assert.match(css, /signup-plan-card--founding/);
  assert.match(css, /signup-founding-urgency/);
});

test("Pro plan is hidden until founding spots are sold out", () => {
  const chooser = appJs.slice(appJs.indexOf("function renderSignupPlanChooser"), appJs.indexOf("async function finishSignupWithPlan"));
  assert.match(chooser, /\$\{!soldOut \? `/);
  assert.match(chooser, /signup-plan-card--pro signup-plan-card--pro-featured/);
  assert.match(chooser, /Claim My Founding Spot/);
  // Pro only appears in the sold-out branch, not alongside Founding in one grid render
  assert.match(chooser, /` : `\s*\n\s*<article class="signup-plan-card signup-plan-card--pro/);

  const pricing = appJs.slice(appJs.indexOf("function renderPricingPage"), appJs.indexOf("function renderUpgradePage"));
  assert.match(pricing, /\$\{!soldOut\s*\n\s*\? pricingCard\("Founding"/);
  assert.match(pricing, /\$\{soldOut \? pricingCard\("ProAnnual"/);

  const upgrade = appJs.slice(appJs.indexOf("function renderUpgradePage"), appJs.indexOf("function subscriptionSummaryHtml"));
  assert.match(upgrade, /\$\{soldOut \? pricingCard\("ProAnnual"/);
  assert.doesNotMatch(upgrade, /!soldOut \? pricingCard\("ProMonthly"/);
});

test("founding banners stay compact", () => {
  assert.match(appJs, /founding-banner--compact/);
  assert.match(css, /\.founding-banner--compact/);
  assert.match(css, /padding: 12px 14px/);
});

test("cache bust versions aligned", () => {
  assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], "20260717-signup-email-tap");
  assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], "20260717-signup-email-tap");
  assert.match(sw, /llh-shell-v74-signup-email-tap/);
});

test("signup center continue sticky actions and pathways exist", () => {
  assert.match(indexHtml, /signupWizardActions/);
  assert.match(indexHtml, /signupSkipButton/);
  assert.match(indexHtml, /data-signup-pathway="create_new"/);
  assert.match(indexHtml, /data-signup-pathway="join_existing"/);
  assert.match(indexHtml, /data-signup-pathway="independent"/);
  assert.match(indexHtml, /data-signup-pathway="skip"/);
  assert.match(appJs, /completeSignupProgramStep/);
  assert.match(appJs, /signupCenterPathway/);
  assert.match(css, /signup-wizard-actions/);
  assert.match(css, /body\.auth-modal-open/);
});

if (!process.exitCode) {
  console.log("\nAll signup pricing flow tests passed.");
}
