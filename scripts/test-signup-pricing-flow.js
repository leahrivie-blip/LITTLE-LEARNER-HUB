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

test("plan chooser features paid-first Founding/Pro and Free preview", () => {
  assert.match(appJs, /Claim My Founding Spot/);
  assert.match(appJs, /Start with Free Preview/);
  assert.match(appJs, /Continue with Pro/);
  assert.match(appJs, /Most Popular/);
  assert.match(appJs, /FOR LIFE/);
  assert.match(appJs, /Founding Spots Remaining/);
  assert.match(appJs, /Created by a Childcare Provider/);
  assert.match(appJs, /Stop spending hours planning each week/);
  assert.match(appJs, /signup-plan-grid--paid-first/);
  assert.match(appJs, /signup-plan-card--preview/);
  assert.match(appJs, /showSignupFreeConfirm/);
  assert.match(css, /signup-plan-card--founding/);
  assert.match(css, /signup-founding-urgency/);
  assert.match(css, /signup-free-confirm/);
  assert.match(css, /signup-plan-trust/);
});

test("signup chooser keeps Free as preview while featuring paid plans", () => {
  const chooser = appJs.slice(appJs.indexOf("function renderSignupPlanChooser"), appJs.indexOf("async function finishSignupWithPlan"));
  assert.match(chooser, /signup-plan-card--founding/);
  assert.match(chooser, /signup-plan-card--pro/);
  assert.match(chooser, /signup-plan-card--free signup-plan-card--preview/);
  assert.match(chooser, /copy\.foundingCta/);
  assert.match(chooser, /data-signup-choose-plan="monthly"/);
  assert.match(appJs, /foundingCta:\s*"Claim My Founding Spot"/);
  // Free card should appear after paid grid in the template.
  const freeIdx = chooser.indexOf("signup-plan-card--preview");
  const foundingIdx = chooser.indexOf("signup-plan-card--founding");
  assert.ok(foundingIdx > -1 && freeIdx > foundingIdx, "Free preview should render after paid cards");
});

test("public pricing/upgrade pages still hide Pro until founding sells out", () => {
  const pricing = appJs.slice(appJs.indexOf("function renderPricingPage"), appJs.indexOf("function renderUpgradePage"));
  assert.match(pricing, /\$\{!soldOut\s*\n\s*\? pricingCard\("Founding"/);
  assert.match(pricing, /\$\{soldOut \? pricingCard\("ProAnnual"/);

  const upgrade = appJs.slice(appJs.indexOf("function renderUpgradePage"), appJs.indexOf("function subscriptionSummaryHtml"));
  assert.match(upgrade, /\$\{soldOut \? pricingCard\("ProAnnual"/);
  assert.doesNotMatch(upgrade, /!soldOut \? pricingCard\("ProMonthly"/);
});

test("signup conversion copy is overridable for A/B tests", () => {
  assert.match(appJs, /DEFAULT_SIGNUP_PLAN_COPY/);
  assert.match(appJs, /function signupPlanCopy/);
  assert.match(appJs, /function signupPlanVariantKey/);
  assert.match(appJs, /SIGNUP_PLAN_VARIANT_OVERRIDES/);
  assert.match(appJs, /llhSignupConversionCopy/);
  assert.match(appJs, /LLH_SIGNUP_CONVERSION/);
  assert.match(appJs, /signupConversion/);
  assert.match(appJs, /signupVariant/);
});

test("free plan confirmation copy and actions exist", () => {
  assert.match(appJs, /You’re choosing the Free Plan/);
  assert.match(appJs, /Continue with Free/);
  assert.match(appJs, /Upgrade Instead/);
  assert.match(appJs, /data-signup-confirm-free/);
  assert.match(appJs, /data-signup-upgrade-instead/);
});

test("founding banners stay compact", () => {
  assert.match(appJs, /founding-banner--compact/);
  assert.match(css, /\.founding-banner--compact/);
  assert.match(css, /padding: 12px 14px/);
});

test("cache bust versions aligned", () => {
  assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], "20260718-domain-dns-check");
  assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], "20260718-domain-dns-check");
  assert.match(sw, /llh-shell-v89-domain-dns-check/);
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
