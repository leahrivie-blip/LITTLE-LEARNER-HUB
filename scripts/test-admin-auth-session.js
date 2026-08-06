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

test("server preserves legacy adminSessions field across stale writeStore clones (rollback safety net)", () => {
  // Admin sessions are no longer written here going forward (see adminSessionStore in
  // server/admin-session-store.js) — this merge helper is kept as inert legacy
  // scaffolding so a rollback to older code still finds a consistent shape.
  assert.match(serverJs, /function mergeStorePreserveAdminSessions\(/);
  assert.match(serverJs, /preserve adminSessions/);
  assert.match(serverJs, /function applyStoreWriteMerges\(/);
  assert.match(serverJs, /next = mergeStorePreserveAdminSessions\(next\)/);
  assert.match(serverJs, /next = mergeStorePreserveEmailCampaigns\(next\)/);
  assert.match(serverJs, /const nextStore = applyStoreWriteMerges\(store\)/);
});

test("admin sessions are stored in a dedicated store, not the shared application document", () => {
  assert.match(serverJs, /const \{ createAdminSessionStore \} = require\("\.\/admin-session-store\.js"\)/);
  assert.match(serverJs, /const adminSessionStore = createAdminSessionStore\(/);
  assert.match(serverJs, /return adminSessionStore\.create\(normalizeEmail\(email\)\)/);
  assert.match(serverJs, /return Boolean\(adminSessionStore\.validate\(token\)\)/);
  assert.match(serverJs, /entire multi-MB application store on every single admin login/);
});

test("server exposes admin session validation endpoint", () => {
  assert.match(serverJs, /function handleAdminSession\(/);
  assert.match(serverJs, /\/api\/admin\/session/);
  assert.match(serverJs, /admin_session_invalid/);
  assert.match(serverJs, /Unlock Admin again/);
});

test("server Lock Admin logout revokes the dedicated session record", () => {
  assert.match(serverJs, /async function handleAdminLogout\(/);
  assert.match(serverJs, /\/api\/admin\/logout/);
  assert.match(serverJs, /const revoked = await adminSessionStore\.revoke\(token\)/);
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
  const shellManifest = JSON.parse(fs.readFileSync(path.join(root, "llh-shell-manifest.json"), "utf8"));
  const cacheV = shellManifest.version;
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, cacheV);
  assert.equal(indexJs, cacheV);
  assert.match(sw, new RegExp(`styles\\.css\\?v=${cacheV}`));
  assert.match(sw, new RegExp(`app\\.js\\?v=${cacheV}`));
  assert.match(sw, new RegExp(shellManifest.cacheName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("admin session heartbeat refreshes unlock without random logout", () => {
  assert.match(appJs, /function startAdminSessionHeartbeat\(/);
  assert.match(appJs, /function stopAdminSessionHeartbeat\(/);
  assert.match(appJs, /lastValidatedAt/);
  assert.match(appJs, /keeping unlock/);
  assert.match(serverJs, /adminSessionStore\.touch\(token\)/);
});

test("owner can always see Admin nav to reach unlock form", () => {
  assert.match(appJs, /function isSignedInPlatformOwner\(/);
  assert.match(appJs, /function hasRememberedAdminDevice\(/);
  assert.match(appJs, /hasRememberedAdminDevice\(\)/);
  assert.match(appJs, /setView\("admin"\)/);
  assert.match(appJs, /Bookmark <code>\/admin<\/code>/);
});

test("admin login trims password and access code before compare", () => {
  assert.match(serverJs, /const password = String\(body\.password \|\| ""\)\.trim\(\)/);
  assert.match(serverJs, /const code = String\(body\.code \|\| ""\)\.trim\(\)/);
  assert.match(serverJs, /timingSafeEqualText\(password, String\(ADMIN_PASSWORD\)\.trim\(\)\)/);
  assert.match(serverJs, /timingSafeEqualText\(code, String\(ADMIN_ACCESS_CODE\)\.trim\(\)\)/);
  assert.match(serverJs, /Owner email, password, and admin access code must all match/);
  assert.match(appJs, /const cleanPassword = String\(password \|\| ""\)\.trim\(\)/);
  assert.match(appJs, /const cleanCode = String\(code \|\| ""\)\.trim\(\)/);
  assert.match(appJs, /separate from your regular member sign-in/);
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

test("Lock Admin calls server logout with the token sent as an Authorization header (not a body/query field) before clearing local session", () => {
  const lockIdx = appJs.indexOf('fetch("/api/admin/logout"');
  assert.ok(lockIdx > 0, "Lock Admin logout fetch missing");
  const lockSnippet = appJs.slice(lockIdx, lockIdx + 500);
  assert.match(lockSnippet, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(lockSnippet, /adminToken:\s*token/);
  assert.match(appJs, /clearAdminSession\(\{ forgetDevice: true \}\)/);
});

test("boot restores Admin only for admin-only unlock, not signed-in providers", () => {
  const bootStart = appJs.indexOf("async function initializeAppView(");
  const bootEnd = appJs.indexOf("initializeAppView();", bootStart);
  const boot = appJs.slice(bootStart, bootEnd);
  assert.match(
    boot,
    /if \(!currentUser && isAdminUnlocked\(\) && localStorage\.getItem\("llhAdminLastView"\) === "admin"\)/,
    "admin restore must require no provider login",
  );
  const landingIdx = boot.indexOf("defaultLoggedInLandingView()");
  assert.ok(landingIdx > 0, "default logged-in landing missing from boot");
  // Signed-in early boot must not force Admin from llhAdminLastView.
  const earlyBoot = appJs.slice(
    appJs.indexOf("// Guests get the marketing homepage"),
    appJs.indexOf("loadSiteContentFromBackend"),
  );
  assert.doesNotMatch(
    earlyBoot,
    /if \(isAdminUnlocked\(\) && localStorage\.getItem\("llhAdminLastView"\) === "admin"\) return "admin"/,
    "signed-in early landing must not auto-open Admin",
  );
});

if (!process.exitCode) {
  console.log("\nAll admin auth session tests passed.");
}
