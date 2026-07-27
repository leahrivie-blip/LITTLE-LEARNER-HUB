#!/usr/bin/env node
/**
 * Admin messaging name-first UX regression.
 * Run: node scripts/test-admin-message-by-name.js
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
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const commsJs = fs.readFileSync(path.join(root, "comms-center.js"), "utf8");
const messagingCss = fs.readFileSync(path.join(root, "styles/llh-messaging.css"), "utf8");

test("admin compose searches members by name instead of requiring email memory", () => {
  assert.match(appJs, /function adminMessagingDirectoryUsers\(/);
  assert.match(appJs, /function adminMessagingUserMatchesQuery\(/);
  assert.match(appJs, /Find member by name/);
  assert.match(appJs, /you do not need to remember their email/i);
  assert.match(appJs, /id="adminMessageUserSearch"/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("function renderAdminMessagesCompose"), appJs.indexOf("async function renderAdminMessagesConversations")),
    />\s*User email\s*</,
  );
});

test("selected recipients use name chips instead of paste-only emails", () => {
  assert.match(appJs, /Add members by name/);
  assert.match(appJs, /adminMessageSelectedChips/);
  assert.match(appJs, /data-admin-message-remove/);
});

test("conversations API and list are name-first with search", () => {
  const apiSlice = serverJs.slice(
    serverJs.indexOf("function handleAdminConversationsList"),
    serverJs.indexOf("function publicConversationUserProfile"),
  );
  assert.match(apiSlice, /userName: profile\.name/);
  assert.match(apiSlice, /businessName: profile\.businessName/);
  assert.match(appJs, /function filteredAdminConversations\(/);
  assert.match(appJs, /id="adminConversationsSearch"/);
  assert.match(appJs, /Search by name, email, or subject/);
  assert.match(appJs, /admin-conversation-email/);
});

test("Message User and View Conversation exist on Users surfaces", () => {
  assert.match(appJs, /function startAdminMessageToUser\(/);
  assert.match(appJs, /data-aup-message=/);
  assert.match(appJs, /data-aup-open-conversation=/);
  assert.match(appJs, />Message User</);
  assert.match(appJs, />View Conversation</);
  assert.match(appJs, /setAdminSectionTab\("messages-compose"\)/);
  assert.match(appJs, /setAdminSectionTab\("messages-conversations"\)/);
});

test("admin Messages nav labels point people to compose + conversations", () => {
  assert.match(appJs, /"messages-compose": "New Message"/);
  assert.match(appJs, /"messages-conversations": "All Conversations"/);
});

test("member Messages tab clearly starts with Message Leah", () => {
  assert.match(commsJs, /label: "Message Leah"/);
  assert.match(commsJs, /Start with <strong>Message Leah<\/strong>/);
});

test("picker styles exist for name results and chips", () => {
  assert.match(messagingCss, /\.admin-user-picker-option-name/);
  assert.match(messagingCss, /\.admin-user-chip/);
  assert.match(messagingCss, /\.admin-conversations-search/);
});

if (!process.exitCode) {
  console.log("\nAll admin message-by-name tests passed.");
}
