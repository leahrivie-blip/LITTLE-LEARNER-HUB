#!/usr/bin/env node
/**
 * Admin panel loading audit — verifies key sections render after unlock.
 * Run: npm run test:admin-panel-loading
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  ROOT, waitForHealth, startServer, seedStore, test,
} = require("./lib/messaging-test-harness.js");
const { unlockAdminInBrowser } = require("./lib/admin-browser-unlock.js");

const PORT = 4355;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.admin-panel-audit-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const ADMIN_EMAIL = "leah@littlelearnerhub.com";

const SECTIONS = [
  { tab: "admin-home", expect: "#adminWorkspaceLandingApp", label: "Admin Home" },
  { tab: "users", expect: ".admin-users-panel", label: "Users" },
  { tab: "billing-home", expect: ".admin-workspace-landing-panel", label: "Billing" },
  { tab: "content-home", expect: "#adminWorkspaceLandingApp", label: "Content Home" },
  { tab: "messages-home", expect: "#adminWorkspaceLandingApp", label: "Messages Home" },
  { tab: "curriculum-lesson-plans", expect: ".admin-content-manager-panel", label: "Lesson Plans" },
  { tab: "messages-conversations", expect: "#adminMessagesApp .admin-messages-workspace-nav", label: "Conversations" },
  { tab: "messages-sent", expect: "#adminMessagesApp", label: "Sent Messages" },
  { tab: "message-templates", expect: "#adminTemplatesApp", label: "Message Templates" },
  { tab: "welcome-messages", expect: "#adminWelcomeMessagesApp", label: "Welcome Messages" },
  { tab: "automations", expect: "#adminAutomationsApp", label: "Automations" },
  { tab: "website-home", expect: "#adminWorkspaceLandingApp", label: "Website Home" },
  { tab: "system-health", expect: "#adminWorkspaceLandingApp", label: "System Health" },
];

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL, firstName: "Leah", plan: "Pro" },
    "free-user@example.com": {
      email: "free-user@example.com",
      firstName: "Free",
      plan: "Free",
      subscriptionStatus: "Free Plan",
      signupAt: new Date().toISOString(),
    },
  });

  const { child } = startServer({ port: PORT, storeFile: STORE });
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  try {
    await waitForHealth(BASE);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (err) => consoleErrors.push(String(err.message || err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await test("admin unlock succeeds", async () => {
      await unlockAdminInBrowser(page, BASE);
    });

    for (const section of SECTIONS) {
      // eslint-disable-next-line no-await-in-loop
      await test(`section loads: ${section.label}`, async () => {
        await page.evaluate((tab) => {
          if (typeof window.setAdminSectionTab === "function") window.setAdminSectionTab(tab);
        }, section.tab);
        await page.waitForTimeout(1200);
        const selector = section.expect.split(",")[0].trim();
        await page.waitForSelector(selector, { state: "visible", timeout: 20000 });
        if (section.tab === "system-health") {
          await page.waitForFunction(
            () => {
              const el = document.querySelector("#adminWorkspaceLandingApp");
              const text = el?.innerText || "";
              return text.length > 20 && !/^\s*Loading…\s*$/i.test(text.trim());
            },
            null,
            { timeout: 25000 },
          );
        }
        const stuckLoading = await page.locator(`${selector} .messages-loading`).first().isVisible().catch(() => false);
        assert.equal(stuckLoading, false, `${section.label} stuck on loading`);
        const text = await page.locator(selector).innerText().catch(() => "");
        assert.ok(text.length > 10, `${section.label} panel appears empty`);
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `admin-load-${section.tab}.png`),
          fullPage: false,
        });
      });
    }

    await test("welcome messages API content renders", async () => {
      await page.evaluate(() => window.setAdminSectionTab("welcome-messages"));
      await page.waitForTimeout(1500);
      const html = await page.locator("#adminWelcomeMessagesApp").innerText();
      assert.match(html, /Welcome Messages|Communication Templates/i);
      assert.match(html, /Enable Free welcome sequence/i);
      assert.doesNotMatch(html, /Could not load welcome configuration/i);
    });

    await test("workspace nav includes welcome messages tab", async () => {
      await page.evaluate(() => window.setAdminSectionTab("message-templates"));
      await page.waitForTimeout(800);
      const labels = await page.$$eval(".admin-messages-workspace-btn", (els) => els.map((el) => el.textContent.trim()));
      assert.ok(labels.some((l) => /Welcome Messages/i.test(l)));
      assert.ok(labels.some((l) => /Templates/i.test(l)));
    });

    await test("no fatal page errors during admin navigation", async () => {
      const fatal = consoleErrors.filter((line) => !/favicon|Failed to load resource|net::ERR|admin-analytics:client|Analytics timed out/i.test(line));
      if (fatal.length) console.error("Console errors:", fatal);
      assert.equal(fatal.length, 0, `Unexpected console errors: ${fatal.join(" | ")}`);
    });
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
