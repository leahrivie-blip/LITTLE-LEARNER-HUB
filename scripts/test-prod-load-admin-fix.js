#!/usr/bin/env node
/**
 * Production load + Admin analytics hardening markers.
 * Run: node scripts/test-prod-load-admin-fix.js
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
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("service worker cache bumped and stale-while-revalidate for JS/CSS", () => {
  assert.match(sw, /llh-shell-v\d+-/);
  assert.match(sw, /isShellAssetRequest/);
  assert.match(sw, /NETWORK_TIMEOUT_MS/);
  assert.match(sw, /path\.endsWith\("\.js"\)/);
  assert.match(sw, /path\.endsWith\("\.css"\)/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /shell precache incomplete/);
  assert.match(sw, /cached \|\| networkFetch/);
});

test("index and SW share the same app/styles cache bust", () => {
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.ok(indexCss && indexJs, "index.html must version styles.css and app.js");
  assert.match(sw, new RegExp(`styles\\.css\\?v=${indexCss.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(sw, new RegExp(`app\\.js\\?v=${indexJs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("PWA registration forces waiting worker activation", () => {
  assert.match(appJs, /postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(appJs, /controllerchange/);
  assert.match(appJs, /window\.location\.reload\(\)/);
});

test("Admin analytics load coalesces and supports force refresh", () => {
  assert.match(appJs, /adminAnalyticsLoadPromise/);
  assert.match(appJs, /adminAnalyticsLastError/);
  assert.match(appJs, /async function loadAdminAnalyticsFromBackend\(options = \{\}\)/);
  assert.match(appJs, /loadAdminAnalyticsFromBackend\(\{ force: true \}\)/);
  assert.match(appJs, /ADMIN_ANALYTICS_TIMEOUT_MS/);
  assert.match(appJs, /AbortController/);
});

test("boot path has a timeout so hang cannot blank the site forever", () => {
  assert.match(appJs, /App boot timed out/);
  assert.match(appJs, /delayMs\(12000\)/);
  assert.match(appJs, /Promise\.race\(\[\s*client\.auth\.authStateReady\(\)/);
});

if (!process.exitCode) {
  console.log("\nAll prod load / admin fix tests passed.");
}
