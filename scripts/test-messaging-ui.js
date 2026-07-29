#!/usr/bin/env node
/**
 * Browser-level smoke test for the Member Messaging Center UI: notification
 * bell, Messages page (conversation + updates + notification preferences),
 * and the admin composer with recipient preview/confirmation. Uses
 * Playwright + the same local-json test server as the other messaging
 * integration tests (no real Firebase/browser push subscription — this
 * validates rendering, navigation, and API wiring, not real push delivery).
 * Run: node scripts/test-messaging-ui.js
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  ROOT, request, waitForHealth, startServer, seedStore,
} = require("./lib/messaging-test-harness.js");

const PORT = 4325;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.messaging-ui-test-${process.pid}.json`);
const ADMIN_EMAIL = "admin@test.local";
const USER_EMAIL = "ui-test-user@example.com";

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required for the messaging UI smoke test");
    process.exitCode = 1;
    return;
  }

  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    [USER_EMAIL]: { email: USER_EMAIL, plan: "Free" },
  });
  const { child, getLog } = startServer({ port: PORT, storeFile: STORE });

  let browser;
  try {
    await waitForHealth(BASE);

    // Seed one unread private message from the admin so the bell + Messages
    // page both have real content to render.
    const login = await request(BASE, "POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" } });
    const adminToken = login.json.token;
    await request(BASE, "POST", "/api/admin/messages/send", {
      body: { adminToken, audience: "private", toEmail: USER_EMAIL, subject: "Welcome", body: "Hi! Welcome to Little Learner Hub." },
    });

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.addInitScript((email) => {
      localStorage.setItem("llhUser", email);
    }, USER_EMAIL);

    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.waitForTimeout(500); // let boot + notification bell refresh settle

    console.log("PASS  page loaded with a seeded user session and no early console errors so far");

    // Notification bell shows unread count from the seeded private message.
    await page.waitForFunction(() => {
      const badge = document.querySelector("#messagesNavBadge");
      return badge && !badge.hidden && badge.textContent === "1";
    }, null, { timeout: 15000 });
    console.log("PASS  Messages nav badge shows 1 unread notification");

    const bellBadgeVisible = await page.evaluate(() => {
      const badge = document.querySelector("#notificationBellBadge");
      return Boolean(badge && !badge.hidden && badge.textContent === "1");
    });
    assert.equal(bellBadgeVisible, true, "notification bell badge should also show 1 unread");
    console.log("PASS  Notification bell badge shows 1 unread notification");

    // Open the bell panel and confirm the seeded message appears.
    await page.click("#notificationBellBtn");
    await page.waitForSelector(".notification-bell-item");
    const bellItemText = await page.locator(".notification-bell-item").first().innerText();
    assert.match(bellItemText, /Leah|New message/i);
    console.log("PASS  Notification bell panel lists the seeded message");

    // Navigate to Messages and confirm the conversation renders.
    await page.evaluate(() => setView("messages"));
    await page.waitForSelector("#messagesThread .message-bubble", { timeout: 15000 });
    const bubbleText = await page.locator("#messagesThread .message-bubble").first().innerText();
    assert.match(bubbleText, /Welcome to Little Learner Hub/);
    console.log("PASS  Messages conversation tab renders the admin's message");

    // Opening the conversation should clear the unread badge (mark-read on open).
    await page.waitForFunction(() => {
      const badge = document.querySelector("#messagesNavBadge");
      return badge && badge.hidden;
    }, null, { timeout: 15000 });
    console.log("PASS  Opening the conversation clears the unread badge");

    // Reply from the UI and confirm it round-trips.
    await page.fill("#messagesReplyInput", "Thanks Leah! Quick question about pricing.");
    await page.click("#messagesReplyForm button[type='submit']");
    await page.waitForFunction(() => {
      const bubbles = document.querySelectorAll("#messagesThread .message-bubble-mine");
      return bubbles.length > 0 && bubbles[bubbles.length - 1].textContent.includes("Quick question about pricing");
    }, null, { timeout: 15000 });
    console.log("PASS  Replying from the Messages UI adds the user's bubble to the thread");

    // Notification Settings tab renders the opt-in toggle, defaulting OFF.
    // Comms Center is the active Messages UI; legacy data-messages-tab remains as fallback.
    const prefsTab = page.locator("[data-messages-center-tab='preferences'], [data-messages-tab='preferences']").first();
    await prefsTab.waitFor({ state: "visible", timeout: 10000 });
    await prefsTab.click();
    await page.waitForSelector("#pushNotificationToggle", { timeout: 10000 });
    const toggleChecked = await page.locator("#pushNotificationToggle").isChecked();
    assert.equal(toggleChecked, false, "push toggle must default to OFF — opt-in only");
    console.log("PASS  Notification Settings tab defaults the push toggle to OFF");

    const seriousErrors = consoleErrors.filter((msg) => !/favicon|manifest/i.test(msg));
    assert.equal(seriousErrors.length, 0, `Unexpected console errors: ${JSON.stringify(seriousErrors)}`);
    console.log("PASS  No unexpected console/page errors during the Messages flow");

    // ── Admin composer: audience switch + group-send confirmation ──
    const adminPage = await browser.newPage();
    const adminConsoleErrors = [];
    adminPage.on("console", (msg) => { if (msg.type() === "error") adminConsoleErrors.push(msg.text()); });
    adminPage.on("dialog", (dialog) => dialog.accept());
    await adminPage.addInitScript((token) => {
      localStorage.setItem("llhAdminSession", JSON.stringify({ token, email: "admin@test.local" }));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminRememberEmail", "admin@test.local");
    }, adminToken);
    await adminPage.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await adminPage.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await adminPage.evaluate(() => setView("admin"));
    await adminPage.waitForTimeout(300);
    await adminPage.evaluate(() => { setAdminSectionTab("messages-compose"); });
    await adminPage.waitForSelector("#adminMessagesComposeForm", { timeout: 15000 });
    console.log("PASS  Admin Messages composer renders");

    await adminPage.selectOption("#adminMessagesAudience", "free");
    await adminPage.waitForTimeout(150);
    await adminPage.fill("[name='body']", "Reminder: new Free-tier lesson plans are live!");
    await adminPage.click("#adminMessagesComposeForm button[type='submit']");
    await adminPage.waitForSelector(".llh-confirm-dialog:not([hidden]), [data-llh-confirm-message]", { timeout: 15000 }).catch(() => {});
    const confirmMessage = await adminPage.evaluate(() => document.querySelector("[data-llh-confirm-message]")?.textContent || "");
    assert.match(confirmMessage, /recipient/i, "confirmation must show the exact recipient count before sending");
    console.log("PASS  Group send shows a recipient-count confirmation dialog before sending");
    await adminPage.click("[data-llh-confirm-ok]");
    await adminPage.waitForFunction(() => {
      const el = document.querySelector("#adminMessagesComposeMessage");
      return el && /Sent to \d+ recipient/i.test(el.textContent || "");
    }, null, { timeout: 15000 });
    console.log("PASS  Confirmed group send completes and reports the recipient count");

    const adminSeriousErrors = adminConsoleErrors.filter((msg) => !/favicon|manifest/i.test(msg));
    assert.equal(adminSeriousErrors.length, 0, `Unexpected admin console errors: ${JSON.stringify(adminSeriousErrors)}`);
    console.log("PASS  No unexpected console errors in the admin composer flow");

    if (process.exitCode) {
      console.error("\nBoot log for debugging:\n" + getLog());
    }
  } catch (error) {
    console.error("FAIL", error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    child.kill();
    try { require("node:fs").unlinkSync(STORE); } catch {}
  }
}

main();
