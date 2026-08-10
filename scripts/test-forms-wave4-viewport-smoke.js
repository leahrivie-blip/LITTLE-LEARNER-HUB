#!/usr/bin/env node
/**
 * Wave 4 viewport smoke — Confirm & Send / Template Library markers.
 * Run: npm run test:forms-wave4-viewport
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
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
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
}

async function waitForHealth(port, childProc) {
  for (let i = 0; i < 80; i += 1) {
    if (childProc.exitCode != null) throw new Error("server died");
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("health timeout");
}

async function main() {
  const storePath = path.join(os.tmpdir(), `llh-wave4-vp-${Date.now()}.json`);
  const port = 46000 + Math.floor(Math.random() * 500);
  const email = "viewport.wave4@example.invalid";
  fs.writeFileSync(storePath, JSON.stringify({
    users: { [email]: { email, role: "owner", accountType: "center", plan: "Pro" } },
  }, null, 2));
  const childProc = spawnServer({ port, storePath });
  const kill = () => { try { childProc.kill("SIGTERM"); } catch (_e) { /* ignore */ } };
  process.on("exit", kill);

  try {
    await waitForHealth(port, childProc);
    await request(port, "POST", "/api/child-data", {
      email,
      body: {
        data: {
          Profiles: [
            { id: "v1", name: "Kid One", classroomId: "room-a" },
            { id: "v2", name: "Kid Two", classroomId: "room-b" },
          ],
          Documents: [],
        },
      },
    });
    await request(port, "POST", "/api/program-forms/templates", {
      email,
      body: { title: "Viewport Form", body: "Hello", fields: [] },
    });

    const browser = await chromium.launch({ headless: true });
    const sizes = [
      { name: "1366x768", width: 1366, height: 768 },
      { name: "1440x900", width: 1440, height: 900 },
      { name: "1920x1080", width: 1920, height: 1080 },
      { name: "390x844", width: 390, height: 844 },
    ];
    for (const size of sizes) {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.evaluate((userEmail) => {
        localStorage.setItem("llhUser", JSON.stringify({
          email: userEmail,
          name: "Viewport Owner",
          role: "owner",
          accountType: "center",
          plan: "Pro",
        }));
        localStorage.setItem("HOME_DAYCARE_HUB_TESTING", "1");
      }, email);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      // Navigate toward hub if possible
      const hubBtn = page.locator('[data-view="home-daycare-hub"], a[href="#home-daycare-hub"], button:has-text("Home Daycare")').first();
      if (await hubBtn.count()) {
        await hubBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
      await page.evaluate(() => {
        if (typeof setView === "function") setView("home-daycare-hub");
        if (typeof renderHomeDaycareHubPage === "function") renderHomeDaycareHubPage({ refreshHouseholds: false });
      }).catch(() => {});
      await page.waitForTimeout(700);
      const lib = page.locator("[data-template-library]");
      const hq = page.locator("[data-paperwork-hq]");
      assert.ok(await lib.count() || await hq.count(), `${size.name}: library or HQ missing`);
      // Open assign flow if button present
      const assignBtn = page.locator("[data-assign-form-template], [data-open-assign-flow]").first();
      if (await assignBtn.count()) {
        await assignBtn.click().catch(() => {});
        await page.waitForTimeout(400);
      }
      const flow = page.locator("[data-assign-flow]");
      if (await flow.count()) {
        const box = await flow.boundingBox();
        if (box) {
          assert.ok(box.width <= size.width + 2, `${size.name}: assign flow overflow width`);
        }
        const confirm = page.locator("[data-assign-next-configure], [data-assign-confirm]");
        if (await confirm.count()) {
          const cbox = await confirm.first().boundingBox();
          if (cbox) {
            assert.ok(cbox.y + cbox.height <= size.height + 80, `${size.name}: action button off-screen`);
          }
        }
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      assert.equal(overflow, false, `${size.name}: horizontal overflow`);
      console.log(`PASS  viewport.${size.name}`);
      await page.close();
    }
    await browser.close();
    console.log("\nWave 4 viewport smoke: ALL PASSED\n");
  } catch (error) {
    console.error(error);
    console.error("\nWAVE 4 BLOCKED — DO NOT CONTINUE\n");
    process.exitCode = 1;
  } finally {
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main();
