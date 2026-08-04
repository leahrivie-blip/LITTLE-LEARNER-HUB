#!/usr/bin/env node
/**
 * Messaging unread/automation labels, nav back rules, member update banner.
 * Run: npm run test:messaging-nav-banner
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
  const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const welcome = fs.readFileSync(path.join(ROOT, "server/onboarding-welcome.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const commsApi = fs.readFileSync(path.join(ROOT, "server/comms-api.js"), "utf8");

  ok(welcome.includes("Welcome to Little Learner Hub — I’m so glad you’re here."), "short Free welcome present");
  ok(!welcome.includes("I personally read every message, and many of the updates you see are inspired"), "long Free welcome removed");
  ok(serverJs.includes("isAutomation: Boolean(isWelcome || message.isAutomation)"), "member publicMessage exposes automation");
  ok(comms.includes("Automated welcome"), "member bubble labels automation");
  ok(commsApi.includes("unread: unreadItems"), "message center returns unread items");
  ok(comms.includes("Do not use message.read"), "fallback unread avoids broken message.read");
  ok(css.includes("max-height: none"), "messaging thread nested scroll removed");
  ok(css.includes("position: sticky"), "reply form sticky");
  ok(!/data-contextual-back="ai"[^>]*data-always-visible="true"/.test(indexHtml), "Documentation fake always-visible Back removed");
  ok(!/data-contextual-back="children"[^>]*data-always-visible="true"/.test(indexHtml), "Child Profiles fake always-visible Back removed");
  ok(indexHtml.includes("Documentation Helpers"), "Documentation page title matches nav");
  ok(appJs.includes("closeConfirmActionDialog(false)"), "Escape closes confirm dialog");
  ok(appJs.includes("confirmActionReturnFocus"), "confirm dialog restores focus");
  ok(indexHtml.includes('id="memberUpdateBanner"'), "member update banner host present");
  ok(appJs.includes("function refreshMemberUpdateBanner"), "banner refresh helper present");
  ok(appJs.includes("MEMBER_UPDATE_BANNER_DISMISS_MS"), "7-day dismiss TTL present");
  ok(appJs.includes("memberUpdateBannerEnabled === false"), "admin disable gate present");
  ok(serverJs.includes("memberUpdateBannerEnabled: input.memberUpdateBannerEnabled !== false"), "server normalizes banner flag");
  ok(styles.includes(".member-update-banner"), "banner styles present");
  ok(!appJs.includes("Teaching Kits are already") && !indexHtml.includes("Teaching Kits are already"), "banner does not claim kits are customer-accessible");

  console.log(`PASS messaging/nav/banner (${passed} asserts)`);
}

try {
  main();
} catch (error) {
  console.error("FAIL messaging/nav/banner:", error.message || error);
  process.exit(1);
}
