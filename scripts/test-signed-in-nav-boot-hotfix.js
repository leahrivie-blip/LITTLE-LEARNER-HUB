#!/usr/bin/env node
/**
 * Signed-in boot verification + navigation hotfix regression.
 * Run: node scripts/test-signed-in-nav-boot-hotfix.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19880 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-nav-boot-hotfix-${crypto.randomBytes(4).toString("hex")}.json`);

function requestJson(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, timeout: 30000 },
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
  fs.writeFileSync(STORE_PATH, JSON.stringify({ siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: "nav-boot@test.local",
      ADMIN_PASSWORD: "nav-boot-pass",
      ADMIN_ACCESS_CODE: "nav-boot-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

function makePlans(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `plan-boot-hotfix-${i}`,
    title: `Boot Hotfix Lesson ${i}`,
    age: "Toddler",
    theme: "Science",
    plan: "Pro",
    status: "published",
    locked: false,
    activityCount: 5,
    updatedAt: new Date().toISOString(),
  }));
}

function assertStaticContract() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(html, /app-boot-ready/);
  assert.match(appJs, /appBootGate/);
  assert.match(appJs, /runSignedInBootVerification/);
  assert.match(appJs, /markAppBootFailed/);
  assert.doesNotMatch(appJs, /App boot timed out — continuing with local UI/);
  assert.match(css, /\.app-boot-gate/);
}

async function runBrowserChecks() {
  const { chromium, devices } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const plans = makePlans(12);
  const timings = {};

  async function seedPersona(page) {
    await page.addInitScript((cachedPlans) => {
      const email = "boot-hotfix-pro@test.local";
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          subscriptionStatus: "Active",
          stripeSubscriptionStatus: "active",
          accountType: "home_daycare",
          role: "owner",
        },
      }));
      sessionStorage.setItem("llhLastPlatformView", "lessons");
      localStorage.setItem("llhCurriculumLibraryCacheV1", JSON.stringify({
        lessonPlans: cachedPlans,
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
      }));
    }, plans);
  }

  console.log("1) Desktop signed-in boot unlocks navigation");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedPersona(page);
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => document.body.classList.contains("app-boot-ready") && !document.querySelector("#appBootGate:not([hidden])"),
      null,
      { timeout: 30000 },
    );
    timings.desktopBootReadyMs = Date.now() - start;
    await page.locator('.sidebar [data-view="activities"]').click();
    await page.waitForSelector("#view-activities.active-view", { timeout: 10000 });
    await page.locator('.sidebar [data-view="lessons"]').click();
    await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 10000 });
    await page.locator('#view-lessons [data-view-resource]').first().click();
    await page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 });
    await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/signed-in-nav-boot-desktop.png", fullPage: true });
    await page.close();
  }

  console.log("2) Mobile signed-in boot unlocks navigation");
  {
    const iphone = devices["iPhone 13"];
    const page = await browser.newPage({ ...iphone, viewport: { width: 390, height: 844 } });
    await seedPersona(page);
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => document.body.classList.contains("app-boot-ready"),
      null,
      { timeout: 30000 },
    );
    timings.mobileBootReadyMs = Date.now() - start;
    const toggle = page.locator("#mobileMenuToggle");
    if (await toggle.isVisible()) await toggle.click();
    await page.locator('.sidebar [data-view="activities"]').click();
    await page.waitForSelector("#view-activities.active-view", { timeout: 10000 });
    await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/signed-in-nav-boot-mobile.png", fullPage: true });
    await page.close();
  }

  console.log("3) Slow membership sync shows recoverable boot error (no silent continue)");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route("**/api/subscription-status**", async (route) => {
      await new Promise((r) => setTimeout(r, 15000));
      await route.continue();
    });
    await seedPersona(page);
    const consoleLogs = [];
    page.on("console", (msg) => consoleLogs.push(msg.text()));
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#appBootGate:not([hidden]) #appBootGateRetry", { timeout: 20000 });
    timings.slowSyncErrorMs = Date.now() - start;
    const blocked = await page.evaluate(() => ({
      gateVisible: !document.querySelector("#appBootGate")?.hidden,
      bootReady: document.body.classList.contains("app-boot-ready"),
      homeActive: document.querySelector("#view-home")?.classList.contains("active-view"),
    }));
    assert.equal(blocked.gateVisible, true);
    assert.equal(blocked.bootReady, false);
    assert.equal(blocked.homeActive, false);
    assert.ok(!consoleLogs.some((line) => line.includes("continuing with local UI")));
    await page.unroute("**/api/subscription-status**");
    await page.click("#appBootGateRetry");
    await page.waitForFunction(
      () => document.body.classList.contains("app-boot-ready") && document.querySelector("#appBootGate")?.hidden,
      null,
      { timeout: 20000 },
    );
    await page.locator('.sidebar [data-view="activities"]').click();
    await page.waitForSelector("#view-activities.active-view", { timeout: 10000 });
    await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/signed-in-nav-boot-recovery.png", fullPage: true });
    await page.close();
  }

  await browser.close();
  return timings;
}

async function main() {
  assertStaticContract();
  const child = startServer();
  try {
    await waitForBoot(child);
    const timings = await runBrowserChecks();
    console.log(JSON.stringify({ ok: true, timings }, null, 2));
    console.log("signed-in-nav-boot-hotfix: PASS");
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("signed-in-nav-boot-hotfix: FAIL");
  console.error(error);
  process.exit(1);
});
