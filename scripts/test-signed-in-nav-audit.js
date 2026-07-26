#!/usr/bin/env node
/**
 * Signed-in navigation audit — reproduces live trap/dual-view failures.
 * Run: npm run test:signed-in-nav-audit
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19840 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-nav-audit-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const SIDEBAR_VIEWS = [
  { nav: "calendar", view: "calendar" },
  { nav: "lessons", view: "lessons" },
  { nav: "activities", view: "activities" },
  { nav: "child-tools-daily-logs", view: "children" },
  { nav: "children", view: "children" },
  { nav: "ai", view: "ai" },
  { nav: "behavior-support", view: "support-center" },
  { nav: "messages", view: "messages" },
  { nav: "whats-new", view: "whats-new" },
  { nav: "settings", view: "settings" },
];

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
  const plans = makePlans(24);
  const activities = makeActivities(450);
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    siteContent: {
      curriculumLibrary: { lessonPlans: plans, activities, resources: [], updatedAt: new Date().toISOString() },
      playBasedCurriculum: true,
    },
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: "nav-audit@test.local",
      ADMIN_PASSWORD: "nav-audit-pass",
      ADMIN_ACCESS_CODE: "nav-audit-code",
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
    id: `plan-nav-audit-${i}`,
    title: `Nav Audit Lesson ${i}`,
    age: "Preschool",
    theme: "Science",
    plan: "Pro",
    status: "published",
    locked: false,
    activityCount: 5,
    updatedAt: new Date().toISOString(),
  }));
}

function makeActivities(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `act-nav-audit-${i}`,
    lessonPlanId: `plan-nav-audit-${i % 20}`,
    title: `Nav Audit Activity ${i}`,
    activityCategory: "Art",
    dayOfWeek: "monday",
    plan: "Pro",
    locked: false,
    parentTitle: `Nav Audit Lesson ${i % 20}`,
    parentAge: "Preschool",
    parentPlan: "Pro",
    updatedAt: new Date().toISOString(),
  }));
}

function assertStaticContract() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(html, /body:not\(\.app-boot-ready\) \.view\.active-view/);
  assert.doesNotMatch(html, /#view-calendar \{ display: block !important/);
  assert.match(appJs, /ensureNavigationShellReady/);
  assert.match(appJs, /guardNavigationDuringBootVerification/);
}

async function evaluateShell(page) {
  return page.evaluate(() => {
    const views = [...document.querySelectorAll(".view")];
    const visible = views.filter((v) => {
      const style = getComputedStyle(v);
      return style.display !== "none" && style.visibility !== "hidden" && v.offsetParent !== null;
    });
    const active = [...document.querySelectorAll(".view.active-view")];
    const shellPe = getComputedStyle(document.querySelector(".app-shell")).pointerEvents;
    const blocking = [];
    if (document.querySelector("#resourceViewerModal.open")) blocking.push("resourceViewerModal");
    if (document.body.classList.contains("resource-viewer-open")) blocking.push("resource-viewer-open");
    if (document.body.classList.contains("lesson-workspace-sheet-open")) blocking.push("lesson-workspace-sheet-open");
    if (document.body.classList.contains("app-boot-verifying")) blocking.push("app-boot-verifying");
    return {
      activeId: document.querySelector(".active-view")?.id || "",
      activeCount: active.length,
      visibleIds: visible.map((v) => v.id),
      visibleCount: visible.length,
      bootReady: document.body.classList.contains("app-boot-ready"),
      bootAuth: document.documentElement.classList.contains("llh-boot-authenticated"),
      shellPointerEvents: shellPe,
      blocking,
    };
  });
}

function assertSingleView(shell, label, { allowResourceViewer = false } = {}) {
  assert.equal(shell.activeCount, 1, `${label}: expected one active-view, got ${shell.activeCount}`);
  assert.equal(shell.visibleCount, 1, `${label}: expected one visible view, got ${shell.visibleIds.join(", ")}`);
  assert.equal(shell.shellPointerEvents, "auto", `${label}: app-shell pointer-events blocked`);
  if (!allowResourceViewer) {
    assert.equal(shell.blocking.length, 0, `${label}: blocking overlays ${shell.blocking.join(", ")}`);
  }
}

async function seedProPersona(page, { lastView = "calendar", cacheActivities = 400 } = {}) {
  const plans = makePlans(24);
  const activities = makeActivities(cacheActivities);
  await page.addInitScript(({ cachedPlans, cachedActivities, rememberedView }) => {
    const email = "nav-audit-pro@test.local";
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
    sessionStorage.setItem("llhLastPlatformView", rememberedView);
    localStorage.setItem("llhCurriculumLibraryCacheV1", JSON.stringify({
      lessonPlans: cachedPlans,
      activities: cachedActivities,
      resources: [],
      updatedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    }));
  }, { cachedPlans: plans, cachedActivities: activities, rememberedView: lastView });
}

async function waitBootReady(page) {
  await page.waitForFunction(
    () => document.body.classList.contains("app-boot-ready") && !document.querySelector("#appBootGate:not([hidden])"),
    null,
    { timeout: 30000 },
  );
}

async function clickSidebar(page, navView, resolvedView = navView) {
  const toggle = page.locator("#mobileMenuToggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(`.sidebar [data-view="${navView}"]`).first().click();
  await page.waitForSelector(`#view-${resolvedView}.active-view`, { timeout: 15000 });
}

async function runDesktopAudit(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (/\/api\//.test(url)) failedRequests.push(url);
  });

  await seedProPersona(page, { lastView: "calendar" });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitBootReady(page);
  assertSingleView(await evaluateShell(page), "desktop boot");

  await clickSidebar(page, "lessons");
  await page.waitForSelector('#view-lessons [data-view-resource]', { timeout: 20000 });
  await page.locator('#view-lessons [data-view-resource]').first().click();
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 });
  assertSingleView(await evaluateShell(page), "desktop lesson open", { allowResourceViewer: true });
  await page.locator("#closeResourceViewer").click();
  await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });

  await clickSidebar(page, "activities");
  await page.waitForSelector('#view-activities [data-view-resource]', { timeout: 20000 });
  await page.locator('#view-activities [data-view-resource]').first().click();
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
  await page.locator("#closeResourceViewer").click();
  await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitBootReady(page);
  assertSingleView(await evaluateShell(page), "desktop refresh after closing activity");
  await clickSidebar(page, "calendar");

  for (const item of SIDEBAR_VIEWS) {
    await clickSidebar(page, item.nav, item.view);
    assertSingleView(await evaluateShell(page), `desktop sidebar ${item.nav}`);
  }

  await clickSidebar(page, "activities");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitBootReady(page);
  assertSingleView(await evaluateShell(page), "desktop refresh on activities");

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "signed-in-nav-audit-desktop.png"), fullPage: true });
  await page.close();
  return { consoleErrors, failedRequests };
}

async function runMobileAudit(browser, baseUrl) {
  const { devices } = require("playwright");
  const iphone = devices["iPhone 13"];
  const page = await browser.newPage({ ...iphone, viewport: { width: 390, height: 844 } });
  await seedProPersona(page, { lastView: "activities", cacheActivities: 400 });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitBootReady(page);
  assertSingleView(await evaluateShell(page), "mobile boot activities");

  await clickSidebar(page, "calendar");
  await clickSidebar(page, "lessons");
  await page.waitForSelector('#view-lessons [data-view-resource]', { timeout: 20000 });
  await page.locator('#view-lessons [data-view-resource]').first().click();
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 });
  await page.locator("#closeResourceViewer").click();
  await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });

  for (const view of ["activities", "messages", "settings", "calendar"]) {
    await clickSidebar(page, view);
    assertSingleView(await evaluateShell(page), `mobile sidebar ${view}`);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "signed-in-nav-audit-mobile.png"), fullPage: true });
  await page.close();
}

async function runBootRaceAudit(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route("**/api/subscription-status**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await seedProPersona(page, { lastView: "activities" });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(150);
  const shell = await evaluateShell(page);
  assert.equal(shell.visibleCount, 1, `boot race dual-view: ${shell.visibleIds.join(", ")}`);
  await page.close();
}

async function runServiceWorkerAudit(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage({ viewport: { width: 1280, height: 900 } });
  await seedProPersona(page);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitBootReady(page);
  await context.addInitScript(() => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitBootReady(page);
  await clickSidebar(page, "activities");
  await clickSidebar(page, "calendar");
  assertSingleView(await evaluateShell(page), "service worker reload");
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "signed-in-nav-audit-sw.png"), fullPage: true });
  await context.close();
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  assertStaticContract();
  const child = startServer();
  try {
    await waitForBoot(child);
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const baseUrl = `http://127.0.0.1:${PORT}`;
    try {
      console.log("1) Desktop signed-in navigation audit");
      const desktop = await runDesktopAudit(browser, baseUrl);
      console.log("2) Mobile signed-in navigation audit");
      await runMobileAudit(browser, baseUrl);
      console.log("3) Boot race — no dual view during verification");
      await runBootRaceAudit(browser, baseUrl);
      console.log("4) Service worker returning browser");
      await runServiceWorkerAudit(browser, baseUrl);
      const criticalFailures = desktop.failedRequests.filter((url) => /\/api\/(health|subscription-status)/.test(url));
      assert.equal(criticalFailures.length, 0, `Critical API failures: ${criticalFailures.join(", ")}`);
      const noisy = desktop.consoleErrors.filter((line) => !/403|favicon|Failed to load resource/.test(line));
      assert.equal(noisy.length, 0, `Console errors: ${noisy.join(" | ")}`);
    } finally {
      await browser.close();
    }
    console.log("signed-in-nav-audit: PASS");
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("signed-in-nav-audit: FAIL");
  console.error(error);
  process.exit(1);
});
