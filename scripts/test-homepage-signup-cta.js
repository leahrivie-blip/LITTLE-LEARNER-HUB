#!/usr/bin/env node
/**
 * Homepage signup CTA markers.
 * Run: node scripts/test-homepage-signup-cta.js
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
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const homeCss = fs.readFileSync(path.join(root, "styles/llh-homepage.css"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("hero prioritizes Start Free for TikTok conversion (no pricing in hero)", () => {
  const actionsIdx = html.indexOf('class="lp-hero-actions"');
  assert.ok(actionsIdx > -1, "hero actions missing");
  const actionsHtml = html.slice(actionsIdx, actionsIdx + 900);
  assert.match(actionsHtml, /data-action="start-free"/);
  assert.match(actionsHtml, />Start Free</);
  assert.match(actionsHtml, /data-home-open-farm/);
  assert.match(actionsHtml, /Preview a Real Lesson/);
  assert.doesNotMatch(actionsHtml, /data-checkout-plan="monthly"/);
  assert.doesNotMatch(actionsHtml, /\$19\.99/);
  assert.doesNotMatch(actionsHtml, /Founding/);
  assert.doesNotMatch(actionsHtml, /llh-hero-login-link/);
  assert.match(html, /Your whole week planned before Monday/);
  assert.match(html, /id="homeFarmPreview"/);
  assert.doesNotMatch(html, /127 lesson plans/);
  assert.doesNotMatch(html, /2,110 activities/);
  assert.doesNotMatch(html, /id="homeHeroInventory"/);
  assert.doesNotMatch(html, /Founding Member/);
});

test("Pro, free, and final CTAs exist; sticky CTA is Start Free; Early User announce visible", () => {
  assert.match(html, /Choose Early User/);
  assert.match(html, /Create Free Account/);
  assert.match(html, /llh-final-cta|lp-final-cta/);
  assert.match(html, /lp-mobile-sticky-cta/);
  const stickyIdx = html.indexOf('class="lp-mobile-sticky-cta"');
  assert.ok(stickyIdx > -1);
  const stickyHtml = html.slice(stickyIdx, stickyIdx + 250);
  assert.match(stickyHtml, /data-action="start-free"/);
  assert.match(stickyHtml, />Start Free</);
  assert.doesNotMatch(stickyHtml, /Preview Free Lesson Plans/);
  assert.match(html, /data-checkout-plan="early_user"/);
  assert.match(html, /id="llhFoundingAnnounceBanner"/);
  assert.match(html, /Early User access is \$13\.99\/month/);
  assert.match(appJs, /FOUNDING_CLOSED_FOR_ACQUISITION\s*=\s*true/);
});

test("Tiffany review remains on homepage without star ratings", () => {
  assert.match(html, /I actually love it\. I would definitely use it for our lesson planning/);
  assert.match(html, /Tiffany/);
  assert.match(html, /What childcare providers are saying/);
  assert.match(html, /I requested a theme and it showed up in the library/);
  assert.match(html, /Works for my mixed ages without rewriting everything/);
  assert.match(html, /made by someone who(?:'|\&rsquo;|&apos;)?s been in the room/);
  assert.match(html, /id="homeReviews"/);
  assert.doesNotMatch(html, /Rated 5 stars/);
  assert.doesNotMatch(html, /llh-nav-rating/);
  assert.doesNotMatch(html, /lp-review-stars|llh-reviews-stars/);
  assert.doesNotMatch(html, /★★★★★|⭐⭐⭐⭐⭐/);
  for (const name of ["Maria", "Ashley", "Jenna", "Denise", "Carla"]) {
    assert.match(html, new RegExp(`<strong>${name}</strong>`));
  }
  // CMS apply must append unique reviews — never wipe the curated cards.
  assert.match(appJs, /cmsReviewsAppended/);
  assert.doesNotMatch(appJs, /\.lp-review-card:not\(\.llh-review-featured\)/);
  assert.doesNotMatch(appJs, /lp-review-stars|⭐⭐⭐⭐⭐/);
  // Keep fake business contact placeholders off the public homepage.
  assert.doesNotMatch(html, /123 Main/);
  assert.doesNotMatch(html, /\(555\)\s*123-4567|555-123-4567/);
  assert.doesNotMatch(html, /example@email\.com/);
  assert.doesNotMatch(html, /Sunshine Learning Center/);
  assert.doesNotMatch(html, /placeholder="Jane Smith"/);
  assert.doesNotMatch(html, /placeholder="Little Learner Home Daycare"/);
});

test("private Help Shape feedback remains available via existing handlers", () => {
  assert.match(appJs, /submitHomeShapeFeedbackForm/);
  assert.match(appJs, /homepage_shape/);
  assert.match(homeCss, /\.llh-shape-feedback-form/);
  assert.match(html, /data-action="open-idea-request"/);
  const reviewsIdx = html.indexOf('id="homeReviews"');
  const pricingIdx = html.indexOf('id="homePricing"');
  assert.ok(reviewsIdx > -1 && pricingIdx > reviewsIdx);
  assert.doesNotMatch(html, /AggregateRating|aggregateRating/);
});

test("public nav and mobile menu markers exist", () => {
  assert.match(html, /llh-public-nav/);
  assert.match(html, /llhPublicMenuToggle/);
  assert.match(html, /llhPublicMobileMenu/);
  assert.match(homeCss, /llh-public-menu-open/);
});

test("sticky public nav always shows Log In and Sign Up (not buried in menu/filters)", () => {
  const navActions = html.slice(
    html.indexOf('class="llh-public-nav-actions"'),
    html.indexOf("llhPublicMenuToggle"),
  );
  assert.match(navActions, /data-action="open-login"/);
  assert.match(navActions, /data-action="start-free"/);
  assert.match(navActions, />Log In</);
  assert.match(navActions, />Sign Up</);
  // Mobile breakpoint must keep account actions visible in the sticky bar.
  assert.match(homeCss, /Always keep Log In \/ Sign Up in the sticky top bar/);
  const mobileBlock = homeCss.slice(
    homeCss.indexOf("@media (max-width: 980px)"),
    homeCss.indexOf("@media (max-width: 700px)"),
  );
  assert.match(mobileBlock, /\.llh-public-nav-actions\s*\{\s*display:\s*flex;/);
  assert.doesNotMatch(mobileBlock, /\.llh-public-nav-actions\s*\{\s*display:\s*none;/);
});

test("mobile no longer hides topbar Sign Up on homepage", () => {
  assert.doesNotMatch(css, /body\.home-view #signupButton \{\s*display:\s*none;/);
  assert.match(css, /Keep Sign Up visible above the fold on mobile/);
});

test("start-free opens signup modal for guests", () => {
  assert.match(appJs, /data-action='start-free'/);
  assert.match(appJs, /openAuthModal\("signup"\)/);
});

test("guest library browse keeps a signup path", () => {
  assert.match(appJs, /library-upgrade-strip--guest/);
  assert.match(appJs, /Create a free account to save Free lesson plans and explore the all-in-one childcare platform/);
  const browseCss = fs.readFileSync(path.join(root, "styles/llh-library-browse.css"), "utf8");
  assert.match(browseCss, /body\.activities-view:not\(\.user-authenticated\) \.topbar \.account-actions/);
  assert.match(css, /body\.lessons-view:not\(\.user-authenticated\) \.topbar \.account-actions/);
  assert.match(appJs, /setPreferredSignupPlan\("free"\)/);
});

test("signup modal copy derives from selected plan intent", () => {
  assert.match(appJs, /function signupIntentPresentation/);
  assert.match(appJs, /function applySignupIntentCopyToAuthModal/);
  assert.match(appJs, /Create your free account to start exploring Little Learner Hub/);
  assert.match(appJs, /Create your account to continue with Pro membership/);
  assert.match(appJs, /Create your account to start a 7-day Pro trial/);
  assert.match(appJs, /credit card is required/i);
  // Header / start-free must not force Founding/Pro copy.
  assert.match(appJs, /Header Sign Up is neutral\/Free/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf('document.querySelector("#signupButton")'), appJs.indexOf('document.querySelector("#closeModal")')),
    /setPreferredSignupPlan\("founding"\)/,
  );
  // Free CTA path sets free intent; Pro checkout keeps monthly; trial uses trial intent.
  assert.match(appJs, /setPreferredSignupPlan\(intent \|\| "free"\)/);
  assert.match(appJs, /setPreferredSignupPlan\("trial"\)/);
  assert.match(appJs, /clearPreferredSignupPlan\(\)/);
});

test("founding announcement dismissal persists in localStorage", () => {
  assert.match(appJs, /LLH_FOUNDING_ANNOUNCE_DISMISS_KEY/);
  const slice = appJs.slice(appJs.indexOf("function bindHomePublicChrome"), appJs.indexOf("function scrollToHomeSection"));
  assert.match(slice, /localStorage\.getItem\(LLH_FOUNDING_ANNOUNCE_DISMISS_KEY\)/);
  assert.match(slice, /localStorage\.setItem\(LLH_FOUNDING_ANNOUNCE_DISMISS_KEY/);
});

test("guest public previews and founding checkout wiring exist", () => {
  assert.match(appJs, /function renderHomePublicPreviews/);
  assert.match(appJs, /function openHomePublicPreview/);
  assert.match(appJs, /function refreshHomeHeroInventory/);
  assert.match(appJs, /Create an account to use, edit, plan, print, and download lesson plans/);
  assert.match(appJs, /"lessons", "activities"/);
});

if (!process.exitCode) {
  console.log("\nAll homepage signup CTA tests passed.");
}
