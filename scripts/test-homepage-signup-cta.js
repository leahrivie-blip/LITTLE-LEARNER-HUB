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

test("hero has Browse / Start Free CTAs and founding positioning", () => {
  const actionsIdx = html.indexOf('class="lp-hero-actions"');
  assert.ok(actionsIdx > -1, "hero actions missing");
  assert.match(html, /Browse Lesson Plans/);
  assert.match(html, /Start Free/);
  assert.match(html, /\$9\.99\/month/);
  assert.match(html, /data-action="start-free"/);
  assert.match(html, /Affordable Childcare Curriculum/);
});

test("founding, free, and final CTAs exist", () => {
  assert.match(html, /Claim Founding Member Pricing/);
  assert.match(html, /Create Free Account/);
  assert.match(html, /llh-final-cta|lp-final-cta/);
  assert.match(html, /lp-mobile-sticky-cta/);
  assert.match(html, /data-checkout-plan="founding"/);
});

test("Tiffany review remains on homepage", () => {
  assert.match(html, /I actually love it\. I would definitely use it for our lesson planning/);
  assert.match(html, /Tiffany/);
  assert.match(html, /What Childcare Providers Are Saying/);
});

test("public nav and mobile menu markers exist", () => {
  assert.match(html, /llh-public-nav/);
  assert.match(html, /llhPublicMenuToggle/);
  assert.match(html, /llhPublicMobileMenu/);
  assert.match(homeCss, /llh-public-menu-open/);
});

test("mobile no longer hides topbar Sign Up on homepage", () => {
  assert.doesNotMatch(css, /body\.home-view #signupButton \{\s*display:\s*none;/);
  assert.match(css, /Keep Sign Up visible above the fold on mobile/);
});

test("start-free opens signup modal for guests", () => {
  assert.match(appJs, /data-action='start-free'/);
  assert.match(appJs, /openAuthModal\("signup"\)/);
});

test("guest public previews and founding checkout wiring exist", () => {
  assert.match(appJs, /function renderHomePublicPreviews/);
  assert.match(appJs, /function openHomePublicPreview/);
  assert.match(appJs, /Create an account to use, edit, plan, print, and download lesson plans/);
  assert.match(appJs, /"lessons", "activities"/);
});

if (!process.exitCode) {
  console.log("\nAll homepage signup CTA tests passed.");
}
