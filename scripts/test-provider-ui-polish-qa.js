#!/usr/bin/env node
/**
 * Provider UI polish QA: page walk, overflow, console errors, nav + responsive.
 * Run: npm run test:provider-ui-polish-qa
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19910 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-provider-polish-${crypto.randomBytes(4).toString("hex")}.json`);

const PROVIDER_VIEWS = [
  { nav: "calendar", active: "calendar" },
  { nav: "lessons", active: "lessons" },
  { nav: "activities", active: "activities" },
  { nav: "child-tools-daily-logs", active: "children" },
  { nav: "children", active: "children" },
  { nav: "ai", active: "ai" },
  { nav: "behavior-support", active: "support-center" },
  { nav: "messages", active: "messages" },
  { nav: "settings", active: "settings" },
  { nav: "billing", active: "billing" },
];

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
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
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: "polish-admin@test.local",
      ADMIN_PASSWORD: "polish-pass",
      ADMIN_ACCESS_CODE: "polish-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 160; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGKILL");
  await new Promise((resolve) => setTimeout(resolve, 400));
}

function attachConsole(page, bucket) {
  page.on("pageerror", (err) => bucket.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") bucket.push(`console: ${msg.text()}`);
  });
}

async function openAuthedPage(browser, viewport, email, { sidebarPref } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  attachConsole(page, (context.__errors = []));
  await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
  await page.route(/multi-role-tester\.js/i, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* stub */" });
  });
  // Fresh context starts empty — avoid clearing sidebar pref on reload.
  await page.addInitScript(({ userEmail, pref }) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [userEmail]: {
        email: userEmail,
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
    }));
    localStorage.setItem("llhPlan", "Free");
    if (pref === "0" || pref === "1") {
      localStorage.setItem("llhDesktopSidebarCollapsed", pref);
    }
  }, { userEmail: email, pref: sidebarPref == null ? "" : String(sidebarPref) });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => (
    typeof isAppBootInteractive === "function"
    && isAppBootInteractive()
    && document.body.classList.contains("user-authenticated")
  ), null, { timeout: 90000 });
  return { context, page, errors: context.__errors };
}

async function layoutSnapshot(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const active = document.querySelector(".view.active-view");
    return {
      view: active?.id || "",
      overflowX: doc.scrollWidth > doc.clientWidth + 1,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      mainLeft: document.querySelector(".main")?.getBoundingClientRect().left || 0,
      collapsed: document.body.classList.contains("sidebar-collapsed"),
    };
  });
}

async function gotoView(page, nav, active) {
  await page.evaluate((v) => {
    if (typeof setView === "function") setView(v);
  }, nav);
  await page.waitForSelector(`#view-${active}.active-view`, { timeout: 15000 });
  await page.waitForTimeout(120);
}

async function main() {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(html, /id="sidebarToggle"/);
  assert.match(css, /grid-template-columns:\s*268px/);
  assert.match(css, /sidebar-collapsed/);
  assert.match(app, /DESKTOP_SIDEBAR_PREF_KEY/);
  console.log("PASS static polish markers");

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    // Desktop walkthrough — expanded + collapsed
    {
      const { context, page, errors } = await openAuthedPage(
        browser,
        { width: 1360, height: 900 },
        "polish@example.com",
      );

      for (const item of PROVIDER_VIEWS) {
        await gotoView(page, item.nav, item.active);
        const snap = await layoutSnapshot(page);
        assert.equal(snap.overflowX, false, `horizontal overflow on ${item.nav} (expanded): ${snap.scrollWidth}/${snap.clientWidth}`);
        assert.ok(snap.mainLeft > 180, `main should sit beside sidebar on ${item.nav}`);
      }
      console.log("PASS desktop expanded page walk (no overflow)");

      await page.click("#sidebarToggle");
      await page.waitForTimeout(200);
      for (const item of PROVIDER_VIEWS) {
        await gotoView(page, item.nav, item.active);
        const snap = await layoutSnapshot(page);
        assert.equal(snap.collapsed, true, `expected collapsed on ${item.nav}`);
        assert.equal(snap.overflowX, false, `horizontal overflow on ${item.nav} (collapsed)`);
        assert.ok(snap.mainLeft <= 1, `blank margin when collapsed on ${item.nav}: ${snap.mainLeft}`);
      }

      // Refresh while collapsed
      await gotoView(page, "calendar", "calendar");
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => (
        typeof isAppBootInteractive === "function"
        && isAppBootInteractive()
        && document.body.classList.contains("user-authenticated")
      ), null, { timeout: 90000 });
      const afterRefresh = await layoutSnapshot(page);
      assert.equal(afterRefresh.collapsed, true, "collapsed preference should survive refresh");
      assert.ok(afterRefresh.mainLeft <= 1, "collapsed after refresh left a blank margin");

      // History back/forward between two views
      await gotoView(page, "settings", "settings");
      await gotoView(page, "calendar", "calendar");
      await page.goBack();
      await page.waitForTimeout(350);
      await page.goForward();
      await page.waitForTimeout(350);
      const histSnap = await layoutSnapshot(page);
      assert.equal(histSnap.overflowX, false, "overflow after history navigation");

      const severe = errors.filter((e) => !/favicon|fonts\.|net::ERR_FAILED|Failed to load resource/i.test(e));
      assert.equal(severe.length, 0, `console/page errors:\n${severe.join("\n")}`);
      await context.close();
      console.log("PASS desktop collapsed walk + nav/history");
    }

    // Tablet + phone responsive checks
    for (const viewport of [
      { width: 834, height: 1112, label: "tablet" },
      { width: 390, height: 844, label: "phone" },
    ]) {
      const { context, page, errors } = await openAuthedPage(
        browser,
        viewport,
        `polish-${viewport.label}@example.com`,
      );

      const chrome = await page.evaluate(() => ({
        drawerOpen: document.body.classList.contains("mobile-nav-open"),
        desktopCollapsed: document.body.classList.contains("sidebar-collapsed"),
        desktopToggleHidden: (() => {
          const t = document.querySelector("#sidebarToggle");
          return !t || t.hidden || getComputedStyle(t).display === "none";
        })(),
        mobileToggle: Boolean(document.querySelector("#mobileMenuToggle")),
      }));
      assert.equal(chrome.drawerOpen, false, `${viewport.label}: drawer should default closed`);
      assert.equal(chrome.desktopCollapsed, false, `${viewport.label}: desktop collapsed class should be off`);
      assert.equal(chrome.desktopToggleHidden, true, `${viewport.label}: desktop toggle hidden`);
      assert.equal(chrome.mobileToggle, true, `${viewport.label}: mobile hamburger present`);

      for (const item of [
        { nav: "calendar", active: "calendar" },
        { nav: "children", active: "children" },
        { nav: "ai", active: "ai" },
        { nav: "settings", active: "settings" },
        { nav: "billing", active: "billing" },
        { nav: "messages", active: "messages" },
      ]) {
        await gotoView(page, item.nav, item.active);
        const snap = await layoutSnapshot(page);
        assert.equal(snap.overflowX, false, `${viewport.label} overflow on ${item.nav}`);
      }

      await page.click("#mobileMenuToggle");
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => document.body.classList.contains("mobile-nav-open")), true);
      await page.click('.sidebar .nav-link[data-view="calendar"]');
      await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
      await page.waitForTimeout(180);
      assert.equal(
        await page.evaluate(() => document.body.classList.contains("mobile-nav-open")),
        false,
        `${viewport.label}: nav click should close drawer`,
      );

      const severe = errors.filter((e) => !/favicon|fonts\.|net::ERR_FAILED|Failed to load resource/i.test(e));
      assert.equal(severe.length, 0, `${viewport.label} errors:\n${severe.join("\n")}`);
      await context.close();
      console.log(`PASS ${viewport.label} responsive walk`);
    }

    console.log("All provider UI polish QA checks passed.");
  } catch (error) {
    console.error("FAIL:", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
