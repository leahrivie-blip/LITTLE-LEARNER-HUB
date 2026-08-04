#!/usr/bin/env node
/**
 * Phase 1 — Admin navigation crash + Alerts→Admin Home sticky content.
 * Disposable local store only. Run: npm run test:admin-nav-phase1
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  ROOT, waitForHealth, startServer, seedStore, test,
} = require("./lib/messaging-test-harness.js");
const { unlockAdminInBrowser } = require("./lib/admin-browser-unlock.js");

const PORT = 4371 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.admin-nav-phase1-${process.pid}.json`);
const ADMIN_EMAIL = "admin@test.local";

const SIDEBAR = [
  { group: "admin-home", expectText: /Admin Home|calm owner workspace/i, label: "Admin Home" },
  { group: "insights", expectText: /Advisor|Insights|Marketing Funnel|Why/i, label: "Insights" },
  { group: "marketing", expectText: /Marketing|Funnel|Analytics/i, label: "Marketing Funnel" },
  { group: "content", expectText: /Content|Lesson|Curriculum/i, label: "Content" },
  { group: "messages", expectText: /Message|Conversation|Inbox/i, label: "Messages" },
  { group: "system-health", expectText: /System Health|Health|Stripe|Memory|RSS/i, label: "System Health" },
  { group: "advanced", expectText: /Advanced|Settings|Support|Feedback/i, label: "Advanced / Settings area" },
];

const TABS = [
  { tab: "admin-home", label: "Admin Home" },
  { tab: "advisor", label: "Insights Advisor" },
  { tab: "marketing-funnel", label: "Marketing Funnel" },
  { tab: "churn-dashboard", label: "Why They Left" },
  { tab: "content-home", label: "Content" },
  { tab: "curriculum-lesson-plans", label: "Lesson Plans / Curriculum" },
  { tab: "messages-conversations", label: "Messages" },
  { tab: "admin-notifications", label: "Alerts" },
  { tab: "system-health", label: "System Health" },
  { tab: "admin-settings", label: "Settings" },
  { tab: "images", label: "Site Content / Images" },
];

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  await test("getAdminSectionTab helper is defined", async () => {
    assert.match(appJs, /function getAdminSectionTab\s*\(/);
    assert.match(appJs, /window\.getAdminSectionTab\s*=\s*getAdminSectionTab/);
    assert.match(appJs, /leavingAlertsForHome|Admin Home" always opens/);
    assert.match(appJs, /showAdminSectionLoadError/);
  });

  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL, firstName: "Leah", plan: "Pro" },
  });
  const { child } = startServer({ port: PORT, storeFile: STORE });
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  try {
    await waitForHealth(BASE);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror:${err.message || err}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`console:${msg.text()}`);
    });

    await test("admin unlock succeeds", async () => {
      await unlockAdminInBrowser(page, BASE);
      const hasGetter = await page.evaluate(() => typeof window.getAdminSectionTab === "function");
      assert.equal(hasGetter, true, "getAdminSectionTab exported on window");
    });

    await test("Alerts → Admin Home replaces Alerts content", async () => {
      await page.click('[data-admin-open-notifications]');
      await page.waitForTimeout(600);
      const onAlerts = await page.evaluate(() => window.getAdminSectionTab());
      assert.equal(onAlerts, "admin-notifications");
      const alertsText = await page.locator("#adminWorkspaceLandingApp").innerText();
      assert.match(alertsText, /Owner alerts|Notifications|inbox/i);

      await page.click('[data-admin-group="admin-home"]');
      await page.waitForTimeout(700);
      const onHome = await page.evaluate(() => window.getAdminSectionTab());
      assert.equal(onHome, "admin-home", "Admin Home tab active after Alerts");
      const homeText = await page.locator("#adminWorkspaceLandingApp").innerText();
      assert.match(homeText, /Admin Home|calm owner workspace/i);
      assert.doesNotMatch(homeText, /^\s*Owner alerts inbox\s*$/i);
      const activeHome = await page.locator('[data-admin-group="admin-home"]').getAttribute("aria-pressed");
      assert.equal(activeHome, "true");
    });

    await test("Admin Home → Alerts → Admin Home repeated switching", async () => {
      for (let i = 0; i < 3; i += 1) {
        await page.click('[data-admin-open-notifications]');
        await page.waitForTimeout(350);
        assert.equal(await page.evaluate(() => window.getAdminSectionTab()), "admin-notifications");
        await page.click('[data-admin-group="admin-home"]');
        await page.waitForTimeout(350);
        assert.equal(await page.evaluate(() => window.getAdminSectionTab()), "admin-home");
      }
    });

    for (const item of SIDEBAR) {
      // eslint-disable-next-line no-await-in-loop
      await test(`sidebar opens ${item.label}`, async () => {
        await page.click(`[data-admin-group="${item.group}"]`);
        await page.waitForTimeout(900);
        const tab = await page.evaluate(() => window.getAdminSectionTab());
        assert.ok(tab, `tab set for ${item.label}`);
        const bodyText = await page.locator("#adminView, #adminWorkspaceMain, #adminWorkspaceLandingApp").first().innerText();
        assert.match(bodyText, item.expectText, `${item.label} content visible`);
        const pressed = await page.locator(`[data-admin-group="${item.group}"]`).getAttribute("aria-pressed");
        assert.equal(pressed, "true", `${item.label} active state`);
      });
    }

    for (const item of TABS) {
      // eslint-disable-next-line no-await-in-loop
      await test(`direct tab ${item.label}`, async () => {
        await page.evaluate((tab) => window.setAdminSectionTab(tab), item.tab);
        await page.waitForTimeout(700);
        const active = await page.evaluate(() => window.getAdminSectionTab());
        assert.equal(active, item.tab);
        const err = await page.locator("[data-admin-section-error]").count();
        assert.equal(err, 0, `no section load error for ${item.label}`);
      });
    }

    await test("deep link adminPanel opens section", async () => {
      await page.goto(`${BASE}/?view=admin&adminPanel=system-health`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("body.app-boot-ready", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);
      // Session should still be in localStorage from unlock
      await page.evaluate(() => {
        if (typeof window.setView === "function") window.setView("admin");
        if (typeof window.applyAdminLocationDeepLink === "function") window.applyAdminLocationDeepLink();
        else if (typeof window.setAdminSectionTab === "function") window.setAdminSectionTab("system-health");
      });
      await page.waitForTimeout(800);
      const tab = await page.evaluate(() => window.getAdminSectionTab());
      assert.equal(tab, "system-health");
    });

    await test("mobile viewport sidebar navigation works", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.setAdminSectionTab("admin-home"));
      await page.waitForTimeout(400);
      await page.click('[data-admin-open-notifications]');
      await page.waitForTimeout(500);
      await page.click('[data-admin-group="admin-home"]');
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => window.getAdminSectionTab()), "admin-home");
      const text = await page.locator("#adminWorkspaceLandingApp").innerText();
      assert.match(text, /Admin Home|calm owner workspace/i);
    });

    await test("no getAdminSectionTab ReferenceError in console", async () => {
      const bad = consoleErrors.filter((line) => /getAdminSectionTab is not defined/i.test(line));
      assert.equal(bad.length, 0, `console errors: ${bad.join(" | ") || "none"}`);
      // Extension noise is ignored; only fail on app ReferenceErrors for admin nav helpers.
      const appRefErrors = consoleErrors.filter((line) => /pageerror:.*is not defined/i.test(line));
      assert.equal(appRefErrors.length, 0, appRefErrors.join(" | "));
    });

    console.log("\nPASS admin-nav-phase1");
  } finally {
    await browser.close().catch(() => {});
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
