#!/usr/bin/env node
/**
 * Production homepage reliability + signed-out shell/CSS guards.
 * Fails when critical styles are missing, duplicate nav is visible, or stale SW cache
 * serves HTML as CSS without recovery.
 *
 * Run: npm run test:homepage-production-reliability
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const shellManifest = require("./llh-shell-manifest.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19820 + Math.floor(Math.random() * 60);
const STORE_PATH = path.join(os.tmpdir(), `llh-home-prod-rel-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join("/opt/cursor/artifacts", "homepage-production-reliability");
const SCREEN_DIR = path.join(OUT_DIR, "screenshots");

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "phone", width: 390, height: 844 },
];

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, timeout: 15000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: "home-prod-rel@test.local",
      ADMIN_PASSWORD: "home-prod-rel-pass",
      ADMIN_ACCESS_CODE: "home-prod-rel-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      FOUNDING_MEMBER_LIMIT: "50",
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function test(name, fn) {
  return fn().then(() => {
    console.log(`PASS  ${name}`);
  }).catch((error) => {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  });
}

async function evaluateHomeHealth(page) {
  return page.evaluate(() => {
    function countShellCssRules() {
      let total = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        if (!sheet.href) continue;
        if (!/styles\.css|llh-homepage|llh-design-tokens/.test(sheet.href)) continue;
        try {
          total += (sheet.cssRules || []).length;
        } catch {
          return -1;
        }
      }
      return total;
    }
    const shellCssRules = countShellCssRules();
    const bodyFont = window.getComputedStyle(document.body).fontFamily || "";
    const token = window.getComputedStyle(document.documentElement).getPropertyValue("--llh-primary").trim();
    const sidebarVisible = (() => {
      const sidebar = document.querySelector(".sidebar");
      if (!sidebar) return false;
      const style = window.getComputedStyle(sidebar);
      const rect = sidebar.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })();
    const publicNavVisible = (() => {
      const nav = document.querySelector(".llh-public-nav");
      if (!nav) return false;
      const style = window.getComputedStyle(nav);
      const rect = nav.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })();
    const visibleViews = Array.from(document.querySelectorAll(".view")).filter((view) => {
      const style = window.getComputedStyle(view);
      const rect = view.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }).map((view) => view.id);
    const activeViews = Array.from(document.querySelectorAll(".view.active-view")).filter((view) => {
      const style = window.getComputedStyle(view);
      const rect = view.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }).map((view) => view.id);
    return {
      shellCssRules,
      bodyFont,
      token,
      sidebarVisible,
      publicNavVisible,
      visibleViews,
      activeViews,
      timesNewRoman: /Times New Roman/i.test(bodyFont),
    };
  });
}

async function auditSignedOutViewport(browser, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const baseUrl = `http://127.0.0.1:${PORT}/`;
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => document.querySelector("#view-home.landing-home"), null, { timeout: 30000 });
    const health = await evaluateHomeHealth(page);
    assert.ok(health.shellCssRules >= 20, `${viewport.name}: expected shell CSS rules, got ${health.shellCssRules}`);
    assert.ok(health.token, `${viewport.name}: missing --llh-primary design token`);
    assert.ok(!health.timesNewRoman, `${viewport.name}: body still in Times New Roman (${health.bodyFont})`);
    assert.equal(health.sidebarVisible, false, `${viewport.name}: signed-in sidebar visible while signed out`);
    assert.equal(health.publicNavVisible, true, `${viewport.name}: public nav missing`);
    assert.ok(health.activeViews.length <= 1, `${viewport.name}: multiple active views: ${health.activeViews.join(", ")}`);
    assert.ok(health.visibleViews.length <= 1, `${viewport.name}: multiple visible views: ${health.visibleViews.join(", ")}`);
    const inventory = await page.locator("#homeHeroInventory").getAttribute("data-state");
    assert.ok(inventory === "ready" || inventory === "unavailable", `${viewport.name}: inventory stuck loading (${inventory})`);
    if (inventory === "ready") {
      const inventoryText = await page.locator("#homeHeroInventory").innerText();
      assert.doesNotMatch(inventoryText, /\b0 published lesson plans\b/);
      assert.doesNotMatch(inventoryText, /\b0 published activities\b/);
    }
    fs.mkdirSync(SCREEN_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREEN_DIR, `signed-out-${viewport.name}.png`), fullPage: false });
  } finally {
    await page.close();
  }
}

async function auditStaleServiceWorkerRecovery(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const baseUrl = `http://127.0.0.1:${PORT}/`;
  let navigations = 0;
  page.on("framenavigated", () => {
    navigations += 1;
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (
      navigations <= 1
      && /styles\.css|llh-homepage\.css|llh-design-tokens\.css/.test(url)
      && route.request().resourceType() === "stylesheet"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body>stale shell poison</body></html>",
      });
      return;
    }
    await route.continue();
  });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3500);
    const health = await evaluateHomeHealth(page);
    assert.ok(health.shellCssRules >= 20, `stale CSS recovery: shell CSS rules ${health.shellCssRules}`);
    assert.ok(!health.timesNewRoman, `stale CSS recovery: body font ${health.bodyFont}`);
    assert.equal(health.sidebarVisible, false, "stale CSS recovery: duplicate signed-in nav visible");
  } finally {
    await page.unroute("**/*").catch(() => {});
    await page.close();
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");

  await test("shell manifest aligns across index.html and service worker", async () => {
    assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], shellManifest.version);
    assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], shellManifest.version);
    assert.equal(indexHtml.match(/comms-center\.js\?v=([^"]+)/)?.[1], shellManifest.version);
    assert.match(sw, new RegExp(shellManifest.cacheName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(sw, /network-first/i.test(sw) ? /fetch\(event\.request\)/ : /fetch\(event\.request\)/);
    assert.match(sw, /isValidShellAssetResponse/);
    assert.match(sw, /llh-comms\.css/);
    assert.match(indexHtml, /llhShellCssRecovery/);
  });

  await test("home inventory API returns live counts", async () => {
    const child = startServer();
    try {
      await waitForBoot(child);
      const res = await requestJson("GET", "/api/public/home-inventory");
      assert.equal(res.status, 200);
      assert.equal(res.json?.ok, true);
      assert.ok(Number.isFinite(res.json.lessonPlanCount));
      assert.ok(Number.isFinite(res.json.activityCount));
      assert.ok(res.json.ageCoverage && typeof res.json.ageCoverage === "object");
    } finally {
      await stopServer(child);
    }
  });

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (chunk) => { bootLog += chunk.toString(); });
  child.stderr.on("data", (chunk) => { bootLog += chunk.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);
    for (const viewport of VIEWPORTS) {
      await test(`signed-out homepage health (${viewport.name})`, async () => {
        await auditSignedOutViewport(browser, viewport);
      });
    }
    await test("stale service-worker CSS mismatch recovers safely", async () => {
      await auditStaleServiceWorkerRecovery(browser);
    });
  } catch (error) {
    console.error(bootLog.slice(-2500));
    throw error;
  } finally {
    await browser.close().catch(() => {});
    await stopServer(child);
  }

  if (!process.exitCode) {
    console.log("\nAll homepage production reliability tests passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
