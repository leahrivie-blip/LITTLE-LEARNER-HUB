#!/usr/bin/env node
/**
 * Local admin performance benchmark — measures unlock + section switch times.
 * Run: NODE_ENV=test node scripts/test-admin-performance-local.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { waitForHealth, startServer, seedStore } = require("./lib/messaging-test-harness.js");
const { unlockAdminInBrowser } = require("./lib/admin-browser-unlock.js");

const PORT = 4371;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(__dirname, "..", "server", `.admin-perf-${process.pid}.json`);
const ADMIN_EMAIL = "leah@littlelearnerhub.com";

const SECTIONS = [
  "admin-home", "users", "billing-home", "content-home", "messages-home",
  "website-home", "ai-home", "system-health", "advanced-home", "messages-conversations",
];

const SECTION_WAIT = {
  "admin-home": "#adminWorkspaceLandingApp",
  "users": ".admin-users-panel",
  "billing-home": "#adminWorkspaceLandingApp",
  "content-home": "#adminWorkspaceLandingApp",
  "messages-home": "#adminWorkspaceLandingApp",
  "website-home": "#adminWorkspaceLandingApp",
  "ai-home": "#adminWorkspaceLandingApp",
  "system-health": "#adminWorkspaceLandingApp",
  "advanced-home": "#adminWorkspaceLandingApp",
  "messages-conversations": "#adminMessagesApp .admin-messages-workspace-nav",
};

async function timeSection(page, tab) {
  const started = Date.now();
  try {
    await page.evaluate((t) => window.setAdminSectionTab(t), tab);
  } catch {
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await page.evaluate((t) => window.setAdminSectionTab(t), tab);
  }
  const selector = SECTION_WAIT[tab] || "#adminWorkspaceLandingApp";
  await page.waitForSelector(selector, { state: "visible", timeout: 20000 });
  await page.waitForTimeout(300);
  const stuck = await page.evaluate(() => {
    const loading = document.querySelector("[data-admin-async='loading'], .messages-loading");
    return Boolean(loading && loading.offsetParent !== null);
  });
  return { tab, ms: Date.now() - started, stuck };
}

async function main() {
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL, firstName: "Leah", plan: "Pro" },
    "user1@example.com": { email: "user1@example.com", plan: "Free", signupAt: new Date().toISOString() },
  });
  const { child } = startServer({ port: PORT, storeFile: STORE });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const results = [];

  try {
    await waitForHealth(BASE);
    const unlockStart = Date.now();
    await unlockAdminInBrowser(page, BASE);
    results.push({ name: "unlock-to-protected", ms: Date.now() - unlockStart });

    for (const tab of SECTIONS) {
      // eslint-disable-next-line no-await-in-loop
      const row = await timeSection(page, tab);
      results.push({ name: `section:${tab}`, ms: row.ms, stuck: row.stuck });
      if (row.stuck) {
        console.error(`WARN section ${tab} still showing loading state`);
        process.exitCode = 1;
      }
    }
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }

  console.log("\nAdmin local performance:");
  results.forEach((r) => console.log(`  ${String(r.ms).padStart(5)}ms  ${r.name}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
