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
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("hero has Start Free / Create Account CTAs above benefits", () => {
  const actionsIdx = html.indexOf('class="lp-hero-actions"');
  const benefitsIdx = html.indexOf('class="lp-hero-benefits"');
  assert.ok(actionsIdx > -1 && benefitsIdx > actionsIdx, "CTA should appear before benefits list");
  assert.match(html, /Start Free/);
  assert.match(html, /Create Your Account/);
  assert.match(html, /Founding Spots Still Available/);
  assert.match(html, /data-action="start-free"/);
});

test("mid-page and final signup CTAs exist", () => {
  assert.match(html, /lp-mid-cta/);
  assert.match(html, /Sign Up — Create Free Account/);
  assert.match(html, /Sign Up — Get Started/);
  assert.match(html, /lp-mobile-sticky-cta/);
});

test("mobile no longer hides topbar Sign Up on homepage", () => {
  assert.doesNotMatch(css, /body\.home-view #signupButton \{\s*display:\s*none;/);
  assert.match(css, /Keep Sign Up visible above the fold on mobile/);
});

test("start-free opens signup modal for guests", () => {
  assert.match(appJs, /data-action='start-free'/);
  assert.match(appJs, /openAuthModal\("signup"\)/);
});

if (!process.exitCode) {
  console.log("\nAll homepage signup CTA tests passed.");
}
