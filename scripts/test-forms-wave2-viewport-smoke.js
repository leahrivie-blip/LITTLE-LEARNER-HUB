#!/usr/bin/env node
/**
 * Wave 2 — Paperwork HQ viewport smoke (Playwright).
 * Desktop: 1366x768, 1440x900, 1920x1080. Mobile ~390.
 * Testing only; disposable server + store.
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
      res.on("end", () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
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
  const email = "wave2.viewport@example.invalid";
  const storePath = path.join(os.tmpdir(), `llh-wave2-vp-${Date.now()}.json`);
  const port = 43000 + Math.floor(Math.random() * 800);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [email]: { email, role: "owner", accountType: "home_daycare", plan: "Pro", name: "Wave2 Owner" },
    },
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
      body: {
        data: {
          Profiles: [{ id: "vp-kid", name: "Viewport Kid" }],
          Documents: [{
            id: "vp-doc-1",
            childId: "vp-kid",
            title: "Enrollment",
            status: "notified",
            shareWithFamily: true,
            draftText: "Form body",
            dueDate: "2026-08-20",
            assignedAt: "2026-08-01T00:00:00.000Z",
          }],
        },
      },
    });

    const viewports = [
      { name: "1366x768", width: 1366, height: 768 },
      { name: "1440x900", width: 1440, height: 900 },
      { name: "1920x1080", width: 1920, height: 1080 },
      { name: "390x844", width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();
      await page.addInitScript(({ userEmail }) => {
        localStorage.setItem("llhUser", userEmail);
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhAccounts", JSON.stringify({
          [userEmail]: {
            email: userEmail,
            name: "Wave2 Owner",
            role: "owner",
            accountType: "home_daycare",
            plan: "Pro",
            programSettings: {},
          },
        }));
      }, { userEmail: email });
      await page.goto(`http://127.0.0.1:${port}/#home-daycare-hub`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      // Force hub render if hash routing needs a nudge
      await page.evaluate(() => {
        if (typeof setView === "function") setView("home-daycare-hub");
        else if (typeof renderHomeDaycareHubPage === "function") renderHomeDaycareHubPage({ refreshHouseholds: false });
      });
      await page.waitForSelector("[data-paperwork-hq]", { timeout: 15000 });
      const metrics = await page.evaluate(() => {
        const hq = document.querySelector("[data-paperwork-hq]");
        const rails = document.querySelector(".paperwork-hq-rails");
        const filters = document.querySelector("[data-paperwork-hq-filters]");
        const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
        const hqBox = hq?.getBoundingClientRect();
        const filterInputs = [...(filters?.querySelectorAll("input, select") || [])];
        const tiny = filterInputs.some((el) => el.getBoundingClientRect().height < 32);
        const railButtons = [...(rails?.querySelectorAll("button") || [])];
        return {
          hasHq: Boolean(hq),
          railCount: railButtons.length,
          filterCount: filterInputs.length,
          overflowX,
          tinyControls: tiny,
          hqWidth: hqBox?.width || 0,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      assert.ok(metrics.hasHq, `${vp.name}: HQ missing`);
      assert.ok(metrics.railCount >= 8, `${vp.name}: rails missing (${metrics.railCount})`);
      assert.ok(metrics.filterCount >= 4, `${vp.name}: filters missing`);
      assert.equal(metrics.overflowX, false, `${vp.name}: horizontal overflow`);
      assert.equal(metrics.tinyControls, false, `${vp.name}: cramped controls`);
      assert.ok(metrics.hqWidth <= metrics.clientWidth + 1, `${vp.name}: HQ wider than viewport`);
      // Type in filter without losing value (dirty-state / in-place refresh)
      const search = page.locator("[data-paperwork-filter='query']");
      await search.fill("Enrollment");
      await page.waitForTimeout(200);
      assert.equal(await search.inputValue(), "Enrollment", `${vp.name}: filter wiped on refresh`);
      console.log(`PASS  viewport.${vp.name}`);
      await context.close();
    }
    console.log("\nWave 2 viewport smoke: ALL PASSED");
  } finally {
    await browser.close().catch(() => {});
    try { childProc.kill("SIGTERM"); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL  wave2-viewport-smoke");
  console.error(error);
  process.exit(1);
});
