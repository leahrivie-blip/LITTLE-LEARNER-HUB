#!/usr/bin/env node
/**
 * Wave 3 — Form Builder / Template Library viewport smoke.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");

function request(port, method, pathname, { email, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (email) {
      headers["X-LLH-User-Email"] = email;
      headers.Authorization = `Bearer test:${email}`;
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers,
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port, childProc) {
  for (let i = 0; i < 60; i += 1) {
    if (childProc.exitCode != null) throw new Error("server exited");
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("health timeout");
}

async function main() {
  const email = "wave3.viewport@example.invalid";
  const storePath = path.join(os.tmpdir(), `llh-wave3-vp-${Date.now()}.json`);
  const port = 45000 + Math.floor(Math.random() * 800);
  fs.writeFileSync(storePath, JSON.stringify({
    users: { [email]: { email, role: "owner", accountType: "home_daycare", plan: "Pro", name: "Wave3" } },
  }, null, 2));
  const childProc = spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(port, childProc);
    await request(port, "POST", "/api/child-data", {
      email,
      body: { data: { Profiles: [{ id: "vp-kid", name: "Kid" }], Documents: [] } },
    });
    const viewports = [
      { name: "1366x768", width: 1366, height: 768 },
      { name: "1440x900", width: 1440, height: 900 },
      { name: "1920x1080", width: 1920, height: 1080 },
      { name: "390x844", width: 390, height: 844 },
    ];
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.addInitScript(({ userEmail }) => {
        localStorage.setItem("llhUser", userEmail);
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhAccounts", JSON.stringify({
          [userEmail]: {
            email: userEmail,
            name: "Wave3",
            role: "owner",
            accountType: "home_daycare",
            plan: "Pro",
            programSettings: {},
          },
        }));
      }, { userEmail: email });
      await page.goto(`http://127.0.0.1:${port}/#home-daycare-hub`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        if (typeof setView === "function") setView("home-daycare-hub");
        else if (typeof renderHomeDaycareHubPage === "function") renderHomeDaycareHubPage({ refreshHouseholds: false });
      });
      await page.waitForSelector("[data-template-library]", { timeout: 15000 });
      await page.click("[data-fb-create]");
      await page.waitForSelector("[data-form-builder]", { timeout: 10000 });
      const title = page.locator('[data-fb-meta="title"]');
      await title.fill("Viewport Trip Form");
      await page.selectOption("#fbAddFieldType", "short_text");
      await page.click("[data-fb-add-field]");
      await page.waitForSelector("[data-fb-field-prop='label']");
      const label = page.locator("[data-fb-field-prop='label']").first();
      await label.click({ clickCount: 3 });
      await label.type("Child name");
      assert.equal(await label.inputValue(), "Child name");
      await label.fill("");
      await label.type("Trip date");
      assert.equal(await label.inputValue(), "Trip date", `${vp.name}: label wiped/reverted`);
      // Rapid retype should keep newest value (dirty-state).
      await label.fill("Final label");
      assert.equal(await label.inputValue(), "Final label");
      const metrics = await page.evaluate(() => {
        const builder = document.querySelector("[data-form-builder]");
        const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
        const box = builder?.getBoundingClientRect();
        return {
          overflowX,
          builderWidth: box?.width || 0,
          clientWidth: document.documentElement.clientWidth,
          hasPreviewBtn: Boolean(document.querySelector("[data-fb-preview]")),
        };
      });
      assert.equal(metrics.overflowX, false, `${vp.name}: overflow`);
      assert.ok(metrics.builderWidth <= metrics.clientWidth + 1, `${vp.name}: builder wider than viewport`);
      assert.ok(metrics.hasPreviewBtn, `${vp.name}: preview missing`);
      console.log(`PASS  viewport.${vp.name}`);
      await context.close();
    }
    console.log("\nWave 3 viewport smoke: ALL PASSED");
  } finally {
    await browser.close().catch(() => {});
    try { childProc.kill("SIGTERM"); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL  wave3-viewport-smoke");
  console.error(error);
  process.exit(1);
});
