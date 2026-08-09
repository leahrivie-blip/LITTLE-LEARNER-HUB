#!/usr/bin/env node
/**
 * Owner Testing Admin — typed drafts must survive refresh, tab switches, and
 * Admin sidebar remounts (the "typing disappears when I move on" bug).
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { unlockAdminInBrowser } = require("./lib/admin-browser-unlock");

const ROOT = path.join(__dirname, "..");

function waitHealth(port, child, timeoutMs = 60000) {
  const http = require("node:http");
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (child.exitCode != null) return reject(new Error(`server exited ${child.exitCode}`));
      http
        .get({ hostname: "127.0.0.1", port, path: "/api/health", timeout: 2000 }, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else if (Date.now() - started > timeoutMs) reject(new Error("health timeout"));
          else setTimeout(tick, 250);
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) reject(new Error("health timeout"));
          else setTimeout(tick, 250);
        });
    };
    tick();
  });
}

async function main() {
  const ui = fs.readFileSync(path.join(ROOT, "scripts/owner-testing-admin-ui.js"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(ui, /captureDraftsBeforeUnmount/);
  assert.match(ui, /formDrafts/);
  assert.match(ui, /ensureDraftListeners/);
  assert.match(ui, /formControl/);
  assert.match(app, /captureDraftsBeforeUnmount/);
  assert.match(app, /reuseOta/);

  const storePath = path.join(os.tmpdir(), `llh-ota-typing-${Date.now()}.json`);
  const port = 4500 + Math.floor(Math.random() * 200);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      ADMIN_EMAIL: "e2e-admin@test.local",
      ADMIN_PASSWORD: "e2e-admin-pass-1b07",
      ADMIN_ACCESS_CODE: "e2e-admin-code-1b07",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitHealth(port, child);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${port}`;
    await unlockAdminInBrowser(page, base, {
      email: "e2e-admin@test.local",
      password: "e2e-admin-pass-1b07",
      code: "e2e-admin-code-1b07",
    });
    await page.evaluate(() => {
      if (typeof setAdminGroup === "function") setAdminGroup("testing");
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("testing-testers");
    });
    await page.waitForSelector("[data-ota-add-form] input[name='name']", { timeout: 20000 });

    await page.fill("[data-ota-add-form] input[name='name']", "Keep Name");
    await page.fill("[data-ota-add-form] input[name='email']", "keep@example.com");
    await page.fill("[data-ota-add-form] input[name='programName']", "Keep Program");
    await page.fill("[data-ota-add-form] textarea[name='notes']", "Keep notes");

    // Move on: blur + refresh should not wipe.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.click("[data-ota-refresh]");
    await page.waitForTimeout(900);
    let vals = await page.evaluate(() => {
      const f = document.querySelector("[data-ota-add-form]");
      return {
        name: f?.elements?.namedItem("name")?.value,
        email: f?.elements?.namedItem("email")?.value,
        programName: f?.elements?.namedItem("programName")?.value,
        notes: f?.elements?.namedItem("notes")?.value,
      };
    });
    assert.equal(vals.name, "Keep Name", `refresh wiped name: ${JSON.stringify(vals)}`);
    assert.equal(vals.email, "keep@example.com");
    assert.equal(vals.programName, "Keep Program");
    assert.equal(vals.notes, "Keep notes");

    // Move on: Admin sidebar Programs then back to Testers.
    await page.evaluate(() => setAdminSectionTab("testing-programs"));
    await page.waitForSelector("[data-ota-create-program-form]", { timeout: 15000 });
    await page.fill("[data-ota-create-program-form] input[name='programName']", "Draft Center");
    await page.evaluate(() => setAdminSectionTab("testing-testers"));
    await page.waitForSelector("[data-ota-add-form]", { timeout: 15000 });
    await page.waitForTimeout(700);
    vals = await page.evaluate(() => {
      const f = document.querySelector("[data-ota-add-form]");
      return {
        name: f?.elements?.namedItem("name")?.value,
        email: f?.elements?.namedItem("email")?.value,
        notes: f?.elements?.namedItem("notes")?.value,
      };
    });
    assert.equal(vals.name, "Keep Name", `sidebar switch wiped add-tester: ${JSON.stringify(vals)}`);
    assert.equal(vals.email, "keep@example.com");
    assert.equal(vals.notes, "Keep notes");

    await page.evaluate(() => setAdminSectionTab("testing-programs"));
    await page.waitForSelector("[data-ota-create-program-form]", { timeout: 15000 });
    await page.waitForTimeout(500);
    const programDraft = await page.evaluate(
      () => document.querySelector("[data-ota-create-program-form] input[name='programName']")?.value,
    );
    assert.equal(programDraft, "Draft Center", "create-program draft lost after leaving and returning");

    // Leave testing group entirely, then return — drafts must still restore from state.
    await page.evaluate(() => setAdminSectionTab("admin-home"));
    await page.waitForTimeout(600);
    await page.evaluate(() => setAdminSectionTab("testing-testers"));
    await page.waitForSelector("[data-ota-add-form]", { timeout: 15000 });
    await page.waitForTimeout(800);
    vals = await page.evaluate(() => {
      const f = document.querySelector("[data-ota-add-form]");
      return {
        name: f?.elements?.namedItem("name")?.value,
        email: f?.elements?.namedItem("email")?.value,
      };
    });
    assert.equal(vals.name, "Keep Name", `left testing group wiped drafts: ${JSON.stringify(vals)}`);
    assert.equal(vals.email, "keep@example.com");

    await browser.close();
    console.log("PASS  ota typing draft persist");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
