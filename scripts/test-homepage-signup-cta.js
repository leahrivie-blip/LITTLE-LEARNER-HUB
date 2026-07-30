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

test("hero prioritizes Preview Free Lesson Plans, founding pricing, and Log In text link", () => {
  const actionsIdx = html.indexOf('class="lp-hero-actions"');
  assert.ok(actionsIdx > -1, "hero actions missing");
  const actionsHtml = html.slice(actionsIdx, actionsIdx + 700);
  assert.match(actionsHtml, /data-home-nav="lessons"/);
  assert.match(actionsHtml, /Preview Free Lesson Plans/);
  assert.match(actionsHtml, /data-checkout-plan="founding"/);
  assert.match(actionsHtml, /Lock In \$9\.99 Pricing/);
  assert.match(actionsHtml, /data-action="open-login"/);
  assert.match(actionsHtml, /llh-hero-login-link/);
  assert.doesNotMatch(actionsHtml, />Sign Up</);
  assert.doesNotMatch(actionsHtml, /Browse Lesson Plans/);
  assert.match(html, /Curriculum today\. Growing into the complete childcare platform providers need\./);
  assert.match(html, /id="homeHeroInventory"/);
  assert.match(html, /\$9\.99\/month/);
  assert.match(html, /Affordable Childcare Curriculum/);
});

test("founding, free, and final CTAs exist", () => {
  assert.match(html, /Lock In \$9\.99 Pricing/);
  assert.match(html, /Create Free Account/);
  assert.match(html, /llh-final-cta|lp-final-cta/);
  assert.match(html, /lp-mobile-sticky-cta/);
  assert.match(html, /data-checkout-plan="founding"/);
});

test("Tiffany review remains on homepage", () => {
  assert.match(html, /I actually love it\. I would definitely use it for our lesson planning/);
  assert.match(html, /Tiffany/);
  assert.match(html, /What Childcare Providers Are Saying/);
  assert.match(html, /Rated 5 stars by teachers/);
  assert.match(html, /Built with providers, not for a textbook/);
  assert.match(html, /data-action="request-lesson-plan"/);
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
  assert.match(appJs, /Create a free account to save free sample plans and explore Founding Member pricing/);
  const browseCss = fs.readFileSync(path.join(root, "styles/llh-library-browse.css"), "utf8");
  assert.match(browseCss, /body\.activities-view:not\(\.user-authenticated\) \.topbar \.account-actions/);
  assert.match(css, /body\.lessons-view:not\(\.user-authenticated\) \.topbar \.account-actions/);
  assert.match(appJs, /dismissOverlaysForAuthOrUpgrade\(\);\s*\n\s*setPreferredSignupPlan\("founding"\)/);
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
