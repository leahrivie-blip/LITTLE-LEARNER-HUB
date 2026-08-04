#!/usr/bin/env node
/**
 * Pass 3 — cookie banner, mobile brand, homepage polish markers.
 * Run: npm run test:pass3-cookie-mobile-home
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "llh-shell-manifest.json"), "utf8"));

  ok(appJs.includes("function dismissMetaCookieNotice"), "cookie dismiss helper present");
  ok(appJs.includes('classList.add("has-meta-cookie-notice")'), "body class when cookie notice shown");
  ok(appJs.includes("dismissMetaCookieNotice()"), "Escape can dismiss cookie notice");
  ok(styles.includes("body.has-meta-cookie-notice"), "page padding while cookie notice visible");
  ok(styles.includes("body.resource-viewer-open .llh-meta-cookie-notice"), "cookie hidden over resource viewer");
  ok(styles.includes("body.home-view .mobile-brand"), "mobile brand flex rules present");
  ok(styles.includes("@media (max-width: 390px)"), "390px brand polish present");
  ok(indexHtml.includes('aria-label="Little Learner Hub"'), "mobile brand accessible name");
  ok(indexHtml.includes("Have a classroom win to share?"), "reviews section no longer Coming Soon dominated");
  ok(!/Member ratings[\s\S]{0,40}coming soon/i.test(indexHtml), "coming soon reviews copy removed");
  ok(sw.includes("20260804-pass3-cookie-mobile-r1"), "shell cache bumped");
  ok(manifest.version === "20260804-pass3-cookie-mobile-r1", "manifest version bumped");

  console.log(`PASS pass3 cookie/mobile/home (${passed} asserts)`);
}

try {
  main();
} catch (error) {
  console.error("FAIL pass3 cookie/mobile/home:", error.message || error);
  process.exit(1);
}
