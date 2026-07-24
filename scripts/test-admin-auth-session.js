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
  // Live-site write path preserves email campaigns around adminSessions (main + Phase tip).
  assert.match(serverJs, /storeCache = mergeStorePreserveEmailCampaigns\(mergeStorePreserveAdminSessions\(store\)\)/);
  assert.match(serverJs, /Always mutate the live cache/);
});

test("server exposes admin session validation endpoint", () => {
  assert.match(serverJs, /function handleAdminSession\(/);
  assert.match(serverJs, /\/api\/admin\/session/);
  assert.match(serverJs, /admin_session_invalid/);
  assert.match(serverJs, /Unlock Admin again/);
});

test("server Lock Admin logout revokes session before merge can reinject it", () => {
  assert.match(serverJs, /async function handleAdminLogout\(/);
  assert.match(serverJs, /\/api\/admin\/logout/);
  assert.match(serverJs, /Clears live cache first so mergeStorePreserveAdminSessions cannot reinject/);
  assert.match(serverJs, /delete storeCache\.adminSessions\[token\]/);
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
  const CACHE_V = "20260724-incident-fix";
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, CACHE_V);
  assert.equal(indexJs, CACHE_V);
  assert.match(sw, new RegExp(`styles\\.css\\?v=${CACHE_V}`));
  assert.match(sw, new RegExp(`app\\.js\\?v=${CACHE_V}`));
  assert.match(sw, /llh-shell-v110-incident-fix/);
});

test("admin session heartbeat refreshes unlock without random logout", () => {
  assert.match(appJs, /function startAdminSessionHeartbeat\(/);
  assert.match(appJs, /function stopAdminSessionHeartbeat\(/);
  assert.match(appJs, /lastValidatedAt/);
  assert.match(appJs, /keeping unlock/);
  assert.match(serverJs, /lastValidatedAt: nowIso/);
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

test("Lock Admin calls server logout with adminToken before clearing local session", () => {
  assert.match(appJs, /\/api\/admin\/logout/);
  assert.match(appJs, /adminToken:\s*token/);
  assert.match(appJs, /clearAdminSession\(\{ forgetDevice: true \}\)/);
});

test("Phase 23: setAdminSession mirrors token into llhAdminToken for admin-preview UI modules", () => {
  // billing-simulator-ui.js, classroom-assistant-ui.js, enrollment-ui.js,
  // family-messaging-ui.js, family-updates-ui.js, licensing-center-ui.js,
  // provider-productivity-ui.js, records-center-ui.js, staff-experience-ui.js,
  // testing-lab-ui.js, and today-hub-ui.js all read their bearer token from
  // localStorage/sessionStorage "llhAdminToken" — a real admin unlock via
  // setAdminSession() never wrote that key (it was only ever set by
  // test/screenshot scripts), so opening any of those Director Center tabs
  // after a normal admin login produced an unauthenticated request.
  const setAdminSessionFn = appJs.slice(appJs.indexOf("function setAdminSession("), appJs.indexOf("function clearAdminSession("));
  assert.match(setAdminSessionFn, /localStorage\.setItem\("llhAdminToken", session\.token\)/);
  assert.match(setAdminSessionFn, /sessionStorage\.setItem\("llhAdminToken", session\.token\)/);
  const clearAdminSessionFn = appJs.slice(appJs.indexOf("function clearAdminSession("), appJs.indexOf("function clearAdminSession(") + 2000);
  assert.match(clearAdminSessionFn, /localStorage\.removeItem\("llhAdminToken"\)/);
  assert.match(clearAdminSessionFn, /sessionStorage\.removeItem\("llhAdminToken"\)/);
  // Every admin-preview UI module must actually consume this key.
  const modulesExpectedToReadToken = [
    "billing-simulator-ui.js", "classroom-assistant-ui.js", "enrollment-ui.js",
    "family-messaging-ui.js", "family-updates-ui.js", "licensing-center-ui.js",
    "provider-productivity-ui.js", "records-center-ui.js", "staff-experience-ui.js",
    "testing-lab-ui.js", "today-hub-ui.js",
  ];
  for (const moduleFile of modulesExpectedToReadToken) {
    const moduleJs = fs.readFileSync(path.join(root, moduleFile), "utf8");
    assert.match(moduleJs, /getItem\("llhAdminToken"\)/, `${moduleFile} should still read llhAdminToken (mirrored by setAdminSession)`);
  }
});

test("boot restores Admin before Calendar when last view was admin", () => {
  const boot = appJs.slice(appJs.indexOf("async function initializeAppView()"), appJs.indexOf("initializeAppView();"));
  const adminRestoreIdx = boot.indexOf('llhAdminLastView") === "admin"');
  const landingIdx = boot.indexOf("defaultLoggedInLandingView()");
  assert.ok(adminRestoreIdx > 0, "admin restore missing from boot");
  assert.ok(landingIdx > 0, "default logged-in landing missing from boot");
  assert.ok(adminRestoreIdx < landingIdx, "admin restore must run before default calendar landing");
});

if (!process.exitCode) {
  console.log("\nAll admin auth session tests passed.");
}
