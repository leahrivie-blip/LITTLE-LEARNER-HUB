#!/usr/bin/env node
/**
 * Manual-style browser verification for guest shell reliability + homepage CTAs.
 * Run: node scripts/test-guest-shell-browser-verification.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19910 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-guest-shell-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = path.join("/opt/cursor/artifacts", "guest-shell-browser-verification");

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
          resolve({ status: res.statusCode, json, text });
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
      ADMIN_EMAIL: "guest-shell@test.local",
      ADMIN_PASSWORD: "guest-shell-pass",
      ADMIN_ACCESS_CODE: "guest-shell-code",
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

async function evaluateShellHealth(page) {
  return page.evaluate(() => {
    function countShellCssRules() {
      let total = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        if (!sheet.href) continue;
        if (!/styles\.css|llh-homepage|llh-design-tokens/.test(sheet.href)) continue;
        try { total += (sheet.cssRules || []).length; } catch { return -1; }
      }
      return total;
    }
    const landing = document.querySelector(".landing-home");
    const bodyFont = window.getComputedStyle(document.body).fontFamily || "";
    const landingFont = landing ? window.getComputedStyle(landing).fontFamily || "" : "";
    const sidebar = document.querySelector(".sidebar");
    const sidebarVisible = sidebar ? window.getComputedStyle(sidebar).display !== "none" : false;
    const publicNav = document.querySelector(".llh-public-nav");
    const publicNavVisible = publicNav ? window.getComputedStyle(publicNav).display !== "none" : false;
    return {
      shellCssRules: countShellCssRules(),
      token: window.getComputedStyle(document.documentElement).getPropertyValue("--llh-primary").trim(),
      bodyFont,
      landingFont,
      sidebarVisible,
      publicNavVisible,
      timesNewRoman: /Times New Roman/i.test(bodyFont) || /Times New Roman/i.test(landingFont),
      reloadCount: Number(window.__LLH_TEST_RELOAD_COUNT || 0),
    };
  });
}

async function verifyGuestFlow(browser, viewport, label) {
  const baseUrl = `http://127.0.0.1:${PORT}/`;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: "allow",
  });
  await context.addInitScript(() => {
    window.__LLH_TEST_RELOAD_COUNT = Number(window.__LLH_TEST_RELOAD_COUNT || 0);
    window.addEventListener("beforeunload", () => {
      try {
        sessionStorage.setItem("llhTestReloadCount", String(Number(sessionStorage.getItem("llhTestReloadCount") || "0") + 1));
      } catch { /* ignore */ }
    });
  });
  const page = await context.newPage();
  fs.mkdirSync(path.join(OUT_DIR, label), { recursive: true });

  // First visit — empty cache
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  let health = await evaluateShellHealth(page);
  assert.ok(health.shellCssRules >= 20, `${label}: first visit css rules`);
  assert.ok(health.token, `${label}: design token present`);
  assert.equal(health.timesNewRoman, false, `${label}: Times New Roman on first visit`);
  assert.equal(health.sidebarVisible, false, `${label}: duplicate sidebar on first visit`);
  assert.equal(health.publicNavVisible, true, `${label}: public nav missing on first visit`);
  await page.screenshot({ path: path.join(OUT_DIR, label, "01-first-visit.png") });

  // Inventory should not flash zero counts
  const inventoryStates = [];
  const inventoryTextSnapshots = [];
  for (let i = 0; i < 6; i += 1) {
    inventoryStates.push(await page.locator("#homeHeroInventory").getAttribute("data-state"));
    inventoryTextSnapshots.push(await page.locator("#homeHeroInventory").innerText().catch(() => ""));
    await page.waitForTimeout(250);
  }
  assert.ok(inventoryStates.every((state) => state === "loading" || state === "ready" || state === "unavailable"), `${label}: inventory state invalid ${inventoryStates.join(",")}`);
  assert.ok(!inventoryTextSnapshots.some((text) => /\b0 published lesson plans\b/i.test(text) || /\b0 published activities\b/i.test(text)), `${label}: inventory flashed zero`);

  // Real clicks — preview, founding, login
  await page.locator(".lp-hero-actions [data-home-nav='lessons']").click();
  await page.waitForFunction(() => document.querySelector("#homeLessonPlans"), null, { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT_DIR, label, "02-preview-lessons-scroll.png") });

  await page.locator(".lp-hero-actions [data-checkout-plan='founding']").click();
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT_DIR, label, "03-founding-pricing.png") });
  await page.click("#closeModal");

  await page.locator(".lp-hero-actions .llh-hero-login-link").click();
  await page.waitForSelector("#authModal.open", { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT_DIR, label, "04-login.png") });
  await page.click("#closeModal");

  // Returning visit with existing SW cache
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 60000 });
  health = await evaluateShellHealth(page);
  assert.equal(health.timesNewRoman, false, `${label}: Times New Roman on returning visit`);
  await page.screenshot({ path: path.join(OUT_DIR, label, "05-returning-visit.png") });

  // Simulated invalid CSS then recovery (at most one reload)
  const reloadBefore = Number(await page.evaluate(() => Number(sessionStorage.getItem("llhTestReloadCount") || "0")));
  let navigations = 0;
  page.on("framenavigated", () => { navigations += 1; });
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
        body: "<!doctype html><html><body>invalid css shell</body></html>",
      });
      return;
    }
    await route.continue();
  });
  try {
    await page.evaluate(() => sessionStorage.removeItem("llhShellCssRecovery"));
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    health = await evaluateShellHealth(page);
    assert.ok(health.shellCssRules >= 20, `${label}: recovered css rules`);
    assert.equal(health.timesNewRoman, false, `${label}: Times New Roman after recovery`);
    const reloadAfter = Number(await page.evaluate(() => Number(sessionStorage.getItem("llhTestReloadCount") || "0")));
    assert.ok(reloadAfter - reloadBefore <= 1, `${label}: recovery reloaded more than once (${reloadBefore} -> ${reloadAfter})`);
    await page.screenshot({ path: path.join(OUT_DIR, label, "06-after-invalid-css-recovery.png") });
  } finally {
    await page.unroute("**/*").catch(() => {});
  }

  await context.close();
}

async function verifySignedInStillWorks(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const email = "guest-shell-signed-in@test.local";
  await page.addInitScript((acct) => {
    localStorage.setItem("llhUser", acct);
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [acct]: {
        email: acct,
        plan: "Pro",
        subscriptionStatus: "active",
        stripeSubscriptionStatus: "active",
        role: "owner",
        accountType: "home_daycare",
      },
    }));
  }, email);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => document.body.classList.contains("app-boot-ready"), null, { timeout: 60000 });
  await page.evaluate(() => {
    if (typeof loadAccountState === "function") loadAccountState(localStorage.getItem("llhUser"));
    if (typeof setView === "function") setView("calendar");
  });
  await page.waitForTimeout(600);

  for (const view of ["lessons", "activities", "settings"]) {
    await page.evaluate((v) => setView(v), view);
    await page.waitForFunction((v) => document.querySelector(`#view-${v}.active-view`), view, { timeout: 15000 });
  }
  await page.screenshot({ path: path.join(OUT_DIR, "signed-in-settings.png") });
  await page.close();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const child = startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(child);
    await verifyGuestFlow(browser, { width: 1280, height: 800 }, "desktop");
    console.log("PASS  guest desktop browser verification");
    await verifyGuestFlow(browser, { width: 390, height: 844 }, "phone");
    console.log("PASS  guest phone browser verification");
    await verifySignedInStillWorks(browser);
    console.log("PASS  signed-in lessons/activities/settings still work");
    console.log(`\nArtifacts: ${OUT_DIR}`);
  } finally {
    await browser.close().catch(() => {});
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error("FAIL ", error);
  process.exitCode = 1;
});
