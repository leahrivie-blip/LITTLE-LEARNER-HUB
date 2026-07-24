#!/usr/bin/env node
/**
 * Home Screen / installed-PWA boot regression.
 * Ensures standalone cold opens with SW + curriculum cache do not TDZ-crash,
 * and that index.html registers the service worker before app.js.
 *
 * Run: node scripts/test-homescreen-pwa-boot.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19680 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-homescreen-${crypto.randomBytes(4).toString("hex")}.json`);

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
      ADMIN_EMAIL: "homescreen@test.local",
      ADMIN_PASSWORD: "homescreen-pass",
      ADMIN_ACCESS_CODE: "homescreen-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
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

function assertStaticGuards() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const earlyIdx = html.indexOf("__LLH_SW_EARLY_REGISTERED");
  const appIdx = html.indexOf("app.js?");
  assert.ok(earlyIdx > 0, "index.html must early-register the service worker");
  assert.ok(appIdx > earlyIdx, "early SW register must appear before app.js script tag");
  assert.match(html, /serviceWorker\.register\("\/service-worker\.js"\)/);
  assert.match(sw, /llh-shell-v110-incident-fix/);
  assert.match(html, /app\.js\?v=20260724-incident-fix/);
}

async function browserHomescreenBoot() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, "standalone", { get: () => true, configurable: true });
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (String(query).includes("display-mode: standalone")) {
        return {
          matches: true,
          media: query,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          onchange: null,
          dispatchEvent() { return false; },
        };
      }
      return mm(query);
    };
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));

  const baseUrl = `http://127.0.0.1:${PORT}/`;
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem("llhUser", "homescreen-boot@example.com");
    localStorage.setItem("llhPlan", "Free");
    localStorage.setItem("llhAccounts", JSON.stringify({
      "homescreen-boot@example.com": {
        email: "homescreen-boot@example.com",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        accountType: "home_daycare",
        role: "owner",
      },
    }));
    localStorage.setItem("llhCurriculumLibraryCacheV1", JSON.stringify({
      lessonPlans: [{
        id: "plan-hs",
        title: "Home Screen Plan",
        age: "Toddler",
        theme: "Art",
        plan: "Pro",
        status: "published",
        locked: true,
      }],
      activities: [{
        id: "act-hs",
        lessonPlanId: "plan-hs",
        title: "Home Screen Activity",
        activityCategory: "Art",
        dayOfWeek: "monday",
        plan: "Pro",
        locked: true,
        parentTitle: "Home Screen Plan",
        parentAge: "Toddler",
        parentPlan: "Pro",
      }],
      resources: [],
      updatedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    }));
  });

  for (let i = 0; i < 20; i += 1) {
    const controlled = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      return Boolean(navigator.serviceWorker.controller);
    });
    if (controlled) break;
    await page.waitForTimeout(400);
  }

  // Tap Home Screen icon: navigate to start_url again.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);

  const state = await page.evaluate(() => ({
    earlyRegistered: Boolean(window.__LLH_SW_EARLY_REGISTERED),
    standalone: window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true,
    controller: Boolean(navigator.serviceWorker.controller),
    authed: document.body.classList.contains("user-authenticated"),
    booted: document.body.classList.contains("app-booted"),
    active: document.querySelector(".active-view")?.id || "",
    appJs: [...document.scripts].map((s) => s.src).find((s) => s.includes("app.js")) || "",
  }));

  await browser.close();
  return { pageErrors, state };
}

async function main() {
  assertStaticGuards();
  const child = startServer();
  try {
    await waitForBoot(child);
    const { pageErrors, state } = await browserHomescreenBoot();
    const tdz = pageErrors.filter((message) => /currentUser|before initialization/i.test(message));
    assert.equal(tdz.length, 0, `TDZ errors: ${tdz.join(" | ")}`);
    assert.equal(state.earlyRegistered, true);
    assert.equal(state.standalone, true);
    assert.equal(state.controller, true);
    assert.equal(state.authed, true);
    assert.ok(state.booted || state.active === "view-calendar", `expected booted calendar, got ${JSON.stringify(state)}`);
    assert.match(state.appJs, /20260724-incident-fix/);
    console.log("homescreen-pwa-boot: PASS");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("homescreen-pwa-boot: FAIL");
  console.error(error);
  process.exit(1);
});
