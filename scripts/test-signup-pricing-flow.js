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
  assert.match(appJs, /Create Free Account/);
  assert.match(appJs, /Continue with Pro/);
  assert.match(appJs, /Most Popular/);
  assert.match(appJs, /locked while continuously active/);
  assert.match(appJs, /Founding Spots Remaining/);
  assert.match(appJs, /Created by a Childcare Provider/);
  assert.match(appJs, /Stop spending hours planning each week/);
  assert.match(appJs, /signup-plan-grid--paid-first/);
  assert.match(appJs, /signup-plan-card--preview/);
  assert.match(appJs, /showSignupFreeConfirm/);
  assert.match(appJs, /context:\s*"signup"/);
  assert.match(appJs, /data-checkout-promo-input/);
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

test("public pricing/upgrade pages show Founding as primary and Pro Monthly as a visible secondary option while spots remain (pricing-clarity change)", () => {
  const pricing = appJs.slice(appJs.indexOf("function renderPricingPage"), appJs.indexOf("function renderUpgradePage"));
  // Founding renders featured/primary while spots remain.
  assert.match(pricing, /\$\{!soldOut\s*\n\s*\? pricingCard\("Founding", \{\s*\n\s*featured: true, primary: true/);
  // Pro Monthly is ALSO rendered (as a secondary card, not hidden) while spots remain.
  assert.match(pricing, /\$\{!soldOut\s*\n\s*\? pricingCard\("ProMonthly", \{\s*\n\s*secondary: true/);
  assert.match(pricing, /includesNote: "\$9\.99\/month locked while your membership remains continuously active/);
  assert.match(pricing, /rationale: "For providers who prefer regular Pro pricing/);

  const upgrade = appJs.slice(appJs.indexOf("function renderUpgradePage"), appJs.indexOf("function subscriptionSummaryHtml"));
  assert.match(upgrade, /\$\{!soldOut\s*\n\s*\? pricingCard\("Founding", \{\s*\n\s*featured: true, primary: true/);
  assert.match(upgrade, /\$\{!soldOut\s*\n\s*\? pricingCard\("ProMonthly", \{\s*\n\s*secondary: true/);
});

test("the required Founding copy exists and the 'no meaningful reason' wording has been removed (v2 correction)", () => {
  assert.equal(appJs.includes("$9.99/month locked while your membership remains continuously active"), true);
  assert.equal(appJs.includes('const FOUNDING_INCLUDES_NOTE = "Includes all current and future Pro features. $9.99/month locked while your membership remains continuously active."'), true);
  assert.equal(appJs.includes('foundingIncludesNote: "Includes Pro access. $9.99/month locked while your membership remains continuously active."'), true);
  // Required replacement copy for the Pro Monthly secondary card.
  assert.equal(appJs.includes('const PRO_MONTHLY_RATIONALE = "For providers who prefer regular Pro pricing instead of claiming a Founding spot."'), true);
  assert.equal(/proRationale:/.test(appJs), true);
  // The old "no meaningful reason" framing must be completely gone from the shipped copy.
  assert.equal(/no meaningful/i.test(appJs), false);
  assert.equal(/exact same features as Founding/i.test(appJs), false);
});

test("choosing Regular Pro while eligible and Founding is open shows the required 3-button confirmation", () => {
  assert.match(appJs, /function isEligibleForFoundingCheckout\(account = currentAccount\(\)\)/);
  assert.match(appJs, /function shouldConfirmBeforeRegularPro\(type, account = currentAccount\(\)\)/);
  assert.match(appJs, /function showFoundingVsProConfirm\(onChoice\)/);
  assert.match(appJs, /Founding pricing is still available for \$9\.99\/month\./);
  assert.match(appJs, /Are you sure you want Regular Pro for \$19\.99\/month\?/);
  assert.match(appJs, /Choose Founding — \\\$9\.99/);
  assert.match(appJs, /Continue with Regular Pro — \\\$19\.99/);
  assert.match(appJs, /data-founding-vs-pro-choice="go_back">Go Back/);
  assert.match(appJs, /async function startCheckoutWithFoundingGuard\(type, trackingContext = "checkout"\)/);
  // Confirmation must re-sync the founding count before deciding (stale-counter safety).
  assert.match(appJs, /await syncFoundingStatus\(\{ render: false \}\)\.catch\(\(\) => \{\}\);/);
});

test("the confirmation is skipped for genuinely ineligible users and when Founding is sold out", () => {
  const eligibilityFn = appJs.slice(
    appJs.indexOf("function isEligibleForFoundingCheckout"),
    appJs.indexOf("function shouldConfirmBeforeRegularPro"),
  );
  // Former Founding members (historical but not currently active) must be ineligible.
  assert.match(eligibilityFn, /everFounding && !currentlyFounding/);
  const guardFn = appJs.slice(
    appJs.indexOf("function shouldConfirmBeforeRegularPro"),
    appJs.indexOf("function showFoundingVsProConfirm"),
  );
  assert.match(guardFn, /if \(type !== "monthly"\) return false;/);
  assert.match(guardFn, /if \(foundingSpotsRemaining\(\) <= 0\) return false;/);
});

test("pricing card shown/selected analytics tracking is wired on every Founding-vs-Pro comparison surface", () => {
  assert.match(appJs, /trackEvent\("pricing_cards_shown", \{\s*\n\s*context: "signup"/);
  assert.match(appJs, /trackEvent\("pricing_cards_shown", \{\s*\n\s*context: "pricing_page"/);
  assert.match(appJs, /trackEvent\("pricing_cards_shown", \{\s*\n\s*context: "upgrade_page"/);
  assert.match(appJs, /trackEvent\("pricing_cards_shown", \{\s*\n\s*context: "homepage_hero"/);
  assert.match(appJs, /async function startCheckout\(type, trackingContext = "checkout"\)/);
  assert.match(appJs, /trackEvent\("pricing_card_selected", \{\s*\n\s*context: trackingContext/);
  assert.match(appJs, /await startCheckoutWithFoundingGuard\("founding", "signup"\)/);
  assert.match(appJs, /await startCheckoutWithFoundingGuard\("monthly", "signup"\)/);
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
  assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], "20260730-admin-messaging-inbox");
  assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], "20260730-admin-messaging-inbox");
  assert.match(sw, /llh-shell-v121-admin-messaging-inbox/);
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
