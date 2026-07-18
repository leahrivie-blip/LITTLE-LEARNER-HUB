#!/usr/bin/env node
/**
 * Platform-wide audit regression guards.
 * Covers auth session durability, billing access, importer safety,
 * messaging double-send protection, drafts, and cache-bust alignment.
 *
 * Run: node scripts/test-platform-wide-audit-regression.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const membershipAccess = require("./membership-access.js");

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
const commsJs = fs.readFileSync(path.join(root, "comms-center.js"), "utf8");
const previewJs = fs.readFileSync(path.join(root, "scripts/curriculum-import-preview.js"), "utf8");
const membershipJs = fs.readFileSync(path.join(root, "scripts/membership-access.js"), "utf8");

const CACHE_V = "20260718-domain-dns-check";

// ─── 1. Admin session durability ─────────────────────────────────────────────

test("admin login awaits durable writeStoreAsync before returning token", () => {
  assert.match(serverJs, /async function createAdminToken\(/);
  assert.match(serverJs, /await writeStoreAsync\(storeCache\)/);
  const loginSlice = serverJs.slice(
    serverJs.indexOf("async function handleAdminLogin"),
    serverJs.indexOf("async function handleAdminSiteContentSave"),
  );
  assert.match(loginSlice, /await createAdminToken\(/);
  assert.match(loginSlice, /admin_session_persist_failed/);
});

test("isAdminUnlocked requires a session token", () => {
  const slice = appJs.slice(appJs.indexOf("function isAdminUnlocked()"), appJs.indexOf("function adminPreviewMode()"));
  assert.match(slice, /adminSession\(\)/);
  assert.match(slice, /session\?\.token/);
  assert.doesNotMatch(slice, /return localStorage\.getItem\("llhAdminUnlocked"\) === "true";\s*}/);
});

test("assertAdminApiResponse centralizes 401 re-unlock handling", () => {
  assert.match(appJs, /function assertAdminApiResponse\(/);
  assert.match(appJs, /markAdminSessionInvalidOnServer/);
  assert.match(appJs, /renderAdminAccessShell/);
});

test("admin-only boot restores Admin view without provider login", () => {
  assert.match(appJs, /isAdminUnlocked\(\) && localStorage\.getItem\("llhAdminLastView"\) === "admin"/);
  assert.match(appJs, /setView\("admin", \{ fromBoot: true, replaceHistory: true \}\)/);
});

test("admin 401 payloads include admin_session_invalid code helper", () => {
  assert.match(serverJs, /function adminAuthFailurePayload\(/);
  assert.match(serverJs, /code: "admin_session_invalid"/);
});

// ─── 2. Cache bust alignment ─────────────────────────────────────────────────

test("index.html and service-worker cache-bust versions stay aligned", () => {
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  const indexComms = indexHtml.match(/comms-center\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, CACHE_V);
  assert.equal(indexJs, CACHE_V);
  assert.equal(indexComms, CACHE_V);
  assert.match(sw, new RegExp(`styles\\.css\\?v=${CACHE_V}`));
  assert.match(sw, new RegExp(`app\\.js\\?v=${CACHE_V}`));
  assert.match(sw, new RegExp(`comms-center\\.js\\?v=${CACHE_V}`));
  assert.match(sw, /llh-shell-v89-domain-dns-check/);
});

// ─── 3. Billing / membership access ──────────────────────────────────────────

test("bare 'failed' substring does not revoke active Pro access", () => {
  assert.doesNotMatch(membershipJs, /subStatus\.includes\("failed"\)/);
  const user = {
    plan: "Pro",
    subscriptionStatus: "Something failed somehow",
    stripeSubscriptionStatus: "active",
  };
  assert.equal(membershipAccess.membershipHasProAccess(user), true);
});

test("payment failed still revokes Pro access", () => {
  const user = {
    plan: "Pro",
    subscriptionStatus: "Payment Failed",
    stripeSubscriptionStatus: "unpaid",
  };
  assert.equal(membershipAccess.membershipHasProAccess(user), false);
});

test("admin extend-trial wording is recognized as In Trial", () => {
  assert.match(serverJs, /merged\.trialStatus = "In Trial"/);
  const trialUser = {
    plan: "Pro",
    trialStatus: "In Trial",
    subscriptionStatus: "Trialing — Access Ends 2099-01-01",
    trialEnd: "2099-01-01T00:00:00.000Z",
    accessEndsAt: "2099-01-01T00:00:00.000Z",
  };
  assert.equal(membershipAccess.membershipHasProAccess(trialUser), true);
  assert.equal(membershipAccess.membershipUserInTrial(trialUser), true);
  assert.equal(membershipAccess.membershipPlanDisplay(trialUser), "Trial");
});

test("legacy Trial Active status still counts as trial", () => {
  const trialUser = {
    plan: "Pro",
    trialStatus: "Trial Active",
    subscriptionStatus: "Trialing",
    trialEnd: "2099-01-01T00:00:00.000Z",
    accessEndsAt: "2099-01-01T00:00:00.000Z",
  };
  assert.equal(membershipAccess.membershipUserInTrial(trialUser), true);
});

test("checkout blocks already-subscribed accounts", () => {
  const slice = serverJs.slice(
    serverJs.indexOf("async function handleCheckout"),
    serverJs.indexOf("async function stripeGet"),
  );
  assert.match(slice, /already_subscribed/);
  assert.match(slice, /membershipHasProAccess\(existingUser\)/);
  assert.match(slice, /Manage billing from Account/);
});

test("checkout/live sync stamps lastStripeEventCreatedAt watermark", () => {
  const slice = serverJs.slice(
    serverJs.indexOf("function upsertStripeSubscription"),
    serverJs.indexOf("async function findStripeSubscriptionByEmail"),
  );
  assert.match(slice, /lastStripeEventCreatedAt: watermark/);
});

test("client inactive sync does not label never-subscribed Free as Canceled", () => {
  const start = appJs.indexOf("function subscriptionToAccountUpdates");
  const slice = appJs.slice(start, start + 1200);
  assert.match(slice, /hadPaidHistory/);
  assert.match(slice, /Free Plan/);
  assert.match(slice, /Canceled and Ended/);
});

test("client access helpers no longer match bare failed substring", () => {
  assert.doesNotMatch(appJs, /status\.includes\("payment failed"\) \|\| status\.includes\("failed"\)/);
  assert.doesNotMatch(appJs, /cleanStatus\.includes\("free plan"\) \|\| cleanStatus\.includes\("failed"\)/);
});

// ─── 4. Lesson plan importer safety ──────────────────────────────────────────

test("importer blocks multi-TITLE pastes that would merge plans", () => {
  assert.match(appJs, /function countCurriculumImportTitleBlocks\(/);
  assert.match(appJs, /TITLE: blocks/);
  assert.match(appJs, /Import one lesson plan at a time/);
});

test("importer guards against double-click / in-flight import", () => {
  assert.match(appJs, /adminCurriculumLessonImporting/);
  assert.match(appJs, /Import already in progress/);
  const importFn = appJs.slice(
    appJs.indexOf("async function importAndSaveCurriculumLessonPlan"),
    appJs.indexOf("function cancelCurriculumLessonPlanImport"),
  );
  assert.match(importFn, /finally \{[\s\S]*adminCurriculumLessonImporting = false/);
});

test("cancel import preserves pasted text", () => {
  const cancelFn = appJs.slice(
    appJs.indexOf("function cancelCurriculumLessonPlanImport"),
    appJs.indexOf("function clearCurriculumLessonImportPaste"),
  );
  assert.match(cancelFn, /adminCurriculumLessonImportTextCache = adminCurriculumLessonImportPreviewText/);
});

test("preview warns when enrichment auto-fills missing fields", () => {
  assert.match(previewJs, /enrichReport\?\.enriched/);
  assert.match(previewJs, /Auto-fill completed missing gold-standard fields/);
  assert.match(previewJs, /section: "enrichment"/);
});

// ─── 5. Messaging / drafts ───────────────────────────────────────────────────

test("member reply uses send fingerprint dedupe", () => {
  const slice = serverJs.slice(
    serverJs.indexOf("async function handleMemberMessageReply"),
    serverJs.indexOf("// Admin does not receive push"),
  );
  assert.match(slice, /isDuplicateSend\(fingerprint\)/);
  assert.match(slice, /member-reply/);
  assert.match(slice, /duplicate: true/);
});

test("legacy messages reply handler skips when Comms Center is active", () => {
  assert.match(appJs, /Comms Center has its own submit handler/);
  assert.match(appJs, /data-draft-form/);
  assert.match(appJs, /messages-center-tabs/);
});

test("comms center tabs no longer dual-bind data-messages-tab", () => {
  const tabsSlice = commsJs.slice(
    commsJs.indexOf("function renderMessagesCenterTabs"),
    commsJs.indexOf("function renderInboxTab"),
  );
  assert.match(tabsSlice, /data-messages-center-tab/);
  assert.doesNotMatch(tabsSlice, /data-messages-tab=/);
});

test("draft restore refuses to overwrite active typing", () => {
  assert.match(commsJs, /Never overwrite what the user is actively typing/);
  assert.match(commsJs, /restoreToken/);
  assert.match(commsJs, /dirtyDraftForms\.has\(form\)/);
});

test("empty draft clears local and server persistence", () => {
  assert.match(commsJs, /Empty form means the user cleared it/);
  assert.match(commsJs, /clearLocalDraft\(form\)/);
  assert.match(commsJs, /clearServerDraft\(form\)/);
});

test("draft detach clears intervals; delete uses POST /api/drafts/delete", () => {
  assert.match(commsJs, /detach\(form\)/);
  assert.match(commsJs, /clearInterval\(state\.intervalId\)/);
  assert.match(commsJs, /\/api\/drafts\/delete/);
});

// ─── 6. Search / form stability ──────────────────────────────────────────────

test("support and timeline search debounce and restore caret", () => {
  assert.match(appJs, /__llhSupportSearchTimer/);
  assert.match(appJs, /__llhTimelineSearchTimer/);
  assert.match(appJs, /setSelectionRange/);
});

// ─── 7. Admin Pro activity content ───────────────────────────────────────────

test("admin full access loads full curriculum activities not locked teasers", () => {
  const slice = appJs.slice(
    appJs.indexOf("function loadCurriculumManagedActivities"),
    appJs.indexOf("function loadCurriculumManagedActivities") + 1800,
  );
  assert.match(slice, /hasAdminFullAccess\(\)/);
  assert.match(slice, /effectiveCurriculum\(\)/);
  assert.match(slice, /locked: false/);
});

test("admin activity hydration fills empty how-to from private curriculum", () => {
  const slice = appJs.slice(
    appJs.indexOf("async function withHydratedCurriculumActivityContent"),
    appJs.indexOf("async function withHydratedCurriculumActivityContent") + 1200,
  );
  assert.match(slice, /curriculumActivityById/);
  assert.match(slice, /hasAdminFullAccess\(\)/);
});

// ─── 8. Membership matrix smoke ──────────────────────────────────────────────

test("access matrix: free / trial / pro / founding / manual / past due", () => {
  assert.equal(membershipAccess.membershipHasProAccess({ plan: "Free", subscriptionStatus: "Free Plan" }), false);
  assert.equal(membershipAccess.membershipHasProAccess({
    plan: "Pro",
    stripeSubscriptionStatus: "trialing",
    trialEnd: "2099-06-01T00:00:00.000Z",
    accessEndsAt: "2099-06-01T00:00:00.000Z",
    trialStatus: "In Trial",
  }), true);
  assert.equal(membershipAccess.membershipHasProAccess({
    plan: "Pro",
    stripeSubscriptionStatus: "active",
    subscriptionStatus: "Pro Subscription Active",
  }), true);
  assert.equal(membershipAccess.membershipHasProAccess({
    plan: "Founding",
    foundingMemberActive: true,
    stripeSubscriptionStatus: "active",
  }), true);
  assert.equal(membershipAccess.membershipHasProAccess({
    plan: "Pro",
    internalAccessOverride: true,
    subscriptionStatus: "Manual Access",
  }), true);
  assert.equal(membershipAccess.membershipHasProAccess({
    plan: "Pro",
    stripeSubscriptionStatus: "past_due",
    subscriptionStatus: "Past Due",
  }), false);
  assert.equal(membershipAccess.membershipHasProAccess({
    plan: "Pro",
    cancelAtPeriodEnd: true,
    stripeSubscriptionStatus: "active",
    accessEndsAt: "2099-12-01T00:00:00.000Z",
    subscriptionStatus: "Canceled — Access Ends 2099-12-01",
  }), true);
});

if (!process.exitCode) {
  console.log("\nAll platform-wide audit regression tests passed.");
}
