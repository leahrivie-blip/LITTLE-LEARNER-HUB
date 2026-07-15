#!/usr/bin/env node
/**
 * Admin auth: server session survival + stay-logged-in client behavior.
 * Run: node scripts/test-admin-auth-session.js
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
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("server preserves adminSessions across stale writeStore clones", () => {
  assert.match(serverJs, /function mergeStorePreserveAdminSessions\(/);
  assert.match(serverJs, /preserve adminSessions/);
  assert.match(serverJs, /mergeStorePreserveAdminSessions\(mergeStorePreferNewerSiteContent\(store\)\)/);
  assert.match(serverJs, /storeCache = mergeStorePreserveAdminSessions\(store\)/);
  assert.match(serverJs, /Always mutate the live cache/);
});

test("server exposes admin session validation endpoint", () => {
  assert.match(serverJs, /function handleAdminSession\(/);
  assert.match(serverJs, /\/api\/admin\/session/);
  assert.match(serverJs, /admin_session_invalid/);
  assert.match(serverJs, /Unlock Admin again/);
});

test("client detects expired admin server session and offers re-unlock", () => {
  assert.match(appJs, /adminSessionInvalidOnServer/);
  assert.match(appJs, /function markAdminSessionInvalidOnServer\(/);
  assert.match(appJs, /function validateAdminSessionOnServer\(/);
  assert.match(appJs, /data-admin-reunlock/);
  assert.match(appJs, /Admin server session expired/);
  assert.match(appJs, /Unlock Admin Again/);
});

test("cache bust versions stay aligned for admin stay-logged-in", () => {
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, "20260715-lesson-importer");
  assert.equal(indexJs, "20260715-lesson-importer");
  assert.match(sw, /styles\.css\?v=20260715-lesson-importer/);
  assert.match(sw, /app\.js\?v=20260715-lesson-importer/);
  assert.match(sw, /llh-shell-v37-lesson-importer/);
});

test("owner can always see Admin nav to reach unlock form", () => {
  assert.match(appJs, /function isSignedInPlatformOwner\(/);
  assert.match(appJs, /function hasRememberedAdminDevice\(/);
  assert.match(appJs, /hasRememberedAdminDevice\(\)/);
  assert.match(appJs, /setView\("admin"\)/);
  assert.match(appJs, /Bookmark <code>\/admin<\/code>/);
});

test("provider sign-out keeps Admin unlock on this browser", () => {
  assert.match(appJs, /Keep Admin unlock on this browser/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("async function signOut()"), appJs.indexOf("async function signOut()") + 1200),
    /clearAdminSession\(/,
  );
  assert.match(appJs, /clearAdminSession\(\{ forgetDevice: true \}\)/);
  assert.match(appJs, /Stays unlocked on this browser until you tap Lock Admin/);
});

test("boot restores Admin before Calendar when last view was admin", () => {
  const boot = appJs.slice(appJs.indexOf("async function initializeAppView()"), appJs.indexOf("initializeAppView();"));
  const adminRestoreIdx = boot.indexOf('llhAdminLastView") === "admin"');
  const calendarIdx = boot.indexOf('setView("calendar")');
  assert.ok(adminRestoreIdx > 0, "admin restore missing from boot");
  assert.ok(calendarIdx > 0, "calendar boot redirect missing");
  assert.ok(adminRestoreIdx < calendarIdx, "admin restore must run before calendar redirect");
});

if (!process.exitCode) {
  console.log("\nAll admin auth session tests passed.");
}
