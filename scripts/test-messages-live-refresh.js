#!/usr/bin/env node
/**
 * Messages live-refresh regression.
 * Ensures Admin Conversations and member Message Leah update without a hard reload.
 * Run: node scripts/test-messages-live-refresh.js
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
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const commsJs = fs.readFileSync(path.join(root, "comms-center.js"), "utf8");
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

const CACHE_V = "20260719-weekday-activities";

test("service worker never caches /api/ responses", () => {
  assert.match(sw, /Never cache \/api\//);
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  // Network-first shell caching must not include /api/ anymore.
  const networkFirstFn = sw.slice(
    sw.indexOf("function isNetworkFirstRequest"),
    sw.indexOf("self.addEventListener(\"fetch\""),
  );
  assert.doesNotMatch(networkFirstFn, /path\.startsWith\("\/api\/"\)/);
});

test("cache bust versions align for messages-live deploy", () => {
  assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], CACHE_V);
  assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], CACHE_V);
  assert.equal(indexHtml.match(/comms-center\.js\?v=([^"]+)/)?.[1], CACHE_V);
  assert.match(sw, new RegExp(`app\\.js\\?v=${CACHE_V}`));
  assert.match(sw, /llh-shell-v101-weekday-activities/);
});

test("admin conversations poll and soft-refresh the open thread", () => {
  assert.match(appJs, /function startAdminConversationsLiveRefresh\(/);
  assert.match(appJs, /function stopAdminConversationsLiveRefresh\(/);
  assert.match(appJs, /function refreshAdminConversationsLive\(/);
  assert.match(appJs, /function refreshAdminConversationThreadLive\(/);
  assert.match(appJs, /ADMIN_CONVERSATIONS_POLL_MS/);
  assert.match(appJs, /startAdminConversationsLiveRefresh\(\)/);
  assert.match(appJs, /stopAdminConversationsLiveRefresh\(\)/);
  // Preserve in-progress replies during live thread refresh.
  assert.match(appJs, /#adminConversationReplyInput/);
  const liveRefresh = appJs.slice(
    appJs.indexOf("async function refreshAdminConversationThreadLive"),
    appJs.indexOf("async function refreshAdminConversationsLive"),
  );
  assert.match(liveRefresh, /draft/);
});

test("View Conversation does not race-remount over the open thread", () => {
  const startFn = appJs.slice(
    appJs.indexOf("function startAdminMessageToUser"),
    appJs.indexOf("function renderAdminMessageUserPickerResults"),
  );
  assert.match(startFn, /activeConversationEmail = clean/);
  assert.match(startFn, /setAdminSectionTab\("messages-conversations"\)/);
  assert.doesNotMatch(startFn, /requestAnimationFrame/);
  assert.match(appJs, /await openAdminConversation\(adminMessagesState\.activeConversationEmail\)/);
});

test("admin conversation load surfaces auth errors instead of silently clearing", () => {
  assert.match(appJs, /Admin session expired\. Unlock Admin again to load conversations/);
  assert.match(appJs, /assertAdminApiResponse\(res, data/);
});

test("opening an admin conversation marks that member's unread as read", () => {
  const handler = serverJs.slice(
    serverJs.indexOf("function handleAdminConversationMessages"),
    serverJs.indexOf("// ─── Member-facing messaging endpoints"),
  );
  assert.match(handler, /n\.read = true/);
  assert.match(handler, /isAdminConversationUnreadNotification/);
  assert.match(handler, /conversationEmail/);
});

test("member reply notifies admin with conversationEmail (no duplicate notifyAdminsInApp)", () => {
  const reply = serverJs.slice(
    serverJs.indexOf("async function handleMemberMessageReply"),
    serverJs.indexOf("async function handleMemberInbox"),
  );
  assert.match(reply, /conversationEmail: identity\.email/);
  assert.doesNotMatch(reply, /notifyAdminsInApp\s*\(/);
  assert.match(reply, /emitAdminAlertSafe|fanOutNotificationsAndPush/);
});

test("admin unread badges include emitAdminAlert messaging types", () => {
  assert.match(serverJs, /function isAdminConversationUnreadNotification/);
  assert.match(serverJs, /admin_new_message/);
  assert.match(serverJs, /admin_message_reply/);
});

test("member Messages view polls and refreshes from the notification bell", () => {
  assert.match(commsJs, /function startMemberMessagesLiveRefresh\(/);
  assert.match(commsJs, /function refreshMyMessagesCenterLive\(/);
  assert.match(commsJs, /window\.refreshMyMessagesCenterLive = refreshMyMessagesCenterLive/);
  assert.match(commsJs, /MEMBER_MESSAGES_POLL_MS/);
  assert.match(commsJs, /Keep the current thread on transient/);
  assert.match(appJs, /refreshMyMessagesCenterLive/);
  assert.match(appJs, /notificationBellState\.unreadCount > previousUnread/);
});

if (!process.exitCode) {
  console.log("\nAll messages live-refresh tests passed.");
}
