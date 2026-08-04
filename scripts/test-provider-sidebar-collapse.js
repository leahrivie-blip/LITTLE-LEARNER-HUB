#!/usr/bin/env node
/**
 * Provider collapsible sidebar + layout polish checks.
 * Run: npm run test:provider-sidebar-collapse
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19840 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-sidebar-${crypto.randomBytes(4).toString("hex")}.json`);

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
      ADMIN_EMAIL: "sidebar-admin@test.local",
      ADMIN_PASSWORD: "sidebar-pass",
      ADMIN_ACCESS_CODE: "sidebar-code",
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

function staticChecks() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(html, /id="sidebarToggle"/);
  assert.match(css, /sidebar-collapsed/);
  assert.match(css, /grid-template-columns:\s*268px/);
  assert.match(app, /DESKTOP_SIDEBAR_PREF_KEY/);
  assert.match(app, /syncSidebarToggleChrome/);
  assert.match(app, /toggleDesktopSidebar/);
  console.log("PASS static sidebar collapse markers");
}

async function preparePage(browser, viewport, email, { sidebarPref } = {}) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
  await page.route(/multi-role-tester\.js/i, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* stub */" });
  });
  // Fresh context starts empty — do not clear sidebar pref on every navigation/reload.
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
  return { context, page };
}

async function main() {
  staticChecks();
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

    // Desktop: expanded by default, collapses, persists, content expands.
    {
      const { context, page } = await preparePage(
        browser,
        { width: 1280, height: 900 },
        "sidebar@example.com",
      );

      const expanded = await page.evaluate(() => {
        const shell = document.querySelector(".app-shell");
        const sidebar = document.querySelector(".sidebar");
        const toggle = document.querySelector("#sidebarToggle");
        const sr = sidebar.getBoundingClientRect();
        const mr = document.querySelector(".main").getBoundingClientRect();
        return {
          collapsedClass: document.body.classList.contains("sidebar-collapsed"),
          toggleVisible: toggle && !toggle.hidden && getComputedStyle(toggle).display !== "none",
          sidebarWidth: sr.width,
          mainLeft: mr.left,
          shellColumns: getComputedStyle(shell).gridTemplateColumns,
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      assert.equal(expanded.collapsedClass, false, "desktop should default expanded");
      assert.equal(expanded.toggleVisible, true, "desktop toggle should be visible when authenticated");
      assert.ok(expanded.sidebarWidth > 200, `sidebar too narrow when expanded: ${expanded.sidebarWidth}`);
      assert.ok(expanded.mainLeft > 200, `main should sit beside sidebar: ${expanded.mainLeft}`);
      assert.equal(expanded.overflowX, false, "no horizontal overflow when expanded");

      await page.click("#sidebarToggle");
      await page.waitForTimeout(220);
      const collapsed = await page.evaluate(() => {
        const sidebar = document.querySelector(".sidebar");
        const main = document.querySelector(".main");
        const mr = main.getBoundingClientRect();
        return {
          collapsedClass: document.body.classList.contains("sidebar-collapsed"),
          pref: localStorage.getItem("llhDesktopSidebarCollapsed"),
          sidebarDisplay: getComputedStyle(sidebar).display,
          mainLeft: mr.left,
          mainWidth: mr.width,
          viewport: window.innerWidth,
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      assert.equal(collapsed.collapsedClass, true, "collapsed class missing");
      assert.equal(collapsed.pref, "1", "preference not persisted");
      assert.equal(collapsed.sidebarDisplay, "none", "sidebar should be hidden when collapsed");
      assert.ok(collapsed.mainLeft <= 1, `main should start at left edge, got ${collapsed.mainLeft}`);
      assert.ok(Math.abs(collapsed.mainWidth - collapsed.viewport) <= 2, `main should fill viewport width (${collapsed.mainWidth} vs ${collapsed.viewport})`);
      assert.equal(collapsed.overflowX, false, "no horizontal overflow when collapsed");

      await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => (
        typeof isAppBootInteractive === "function"
        && isAppBootInteractive()
        && document.body.classList.contains("user-authenticated")
      ), null, { timeout: 90000 });
      const persisted = await page.evaluate(() => ({
        collapsedClass: document.body.classList.contains("sidebar-collapsed"),
        pref: localStorage.getItem("llhDesktopSidebarCollapsed"),
        mainLeft: document.querySelector(".main").getBoundingClientRect().left,
      }));
      assert.equal(persisted.pref, "1", "preference lost after reload");
      assert.equal(persisted.collapsedClass, true, "collapsed state not restored after reload");
      assert.ok(persisted.mainLeft <= 1, "restored collapsed layout left a blank margin");

      await page.click("#sidebarToggle");
      await page.waitForTimeout(220);
      const reexpanded = await page.evaluate(() => ({
        collapsedClass: document.body.classList.contains("sidebar-collapsed"),
        pref: localStorage.getItem("llhDesktopSidebarCollapsed"),
        sidebarDisplay: getComputedStyle(document.querySelector(".sidebar")).display,
      }));
      assert.equal(reexpanded.collapsedClass, false);
      assert.equal(reexpanded.pref, "0");
      assert.notEqual(reexpanded.sidebarDisplay, "none");
      await context.close();
      console.log("PASS desktop collapse / expand / persist");
    }

    // Tablet/mobile: drawer defaults closed; content uses full width.
    {
      const { context, page } = await preparePage(
        browser,
        { width: 768, height: 1024 },
        "sidebar-mobile@example.com",
      );

      const mobile = await page.evaluate(() => {
        const sidebar = document.querySelector(".sidebar");
        const main = document.querySelector(".main");
        const toggle = document.querySelector("#mobileMenuToggle");
        const desktopToggle = document.querySelector("#sidebarToggle");
        return {
          drawerOpen: document.body.classList.contains("mobile-nav-open"),
          collapsedDesktop: document.body.classList.contains("sidebar-collapsed"),
          sidebarTransform: getComputedStyle(sidebar).transform,
          mainWidth: main.getBoundingClientRect().width,
          viewport: window.innerWidth,
          mobileToggle: Boolean(toggle),
          desktopToggleHidden: !desktopToggle || desktopToggle.hidden || getComputedStyle(desktopToggle).display === "none",
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      assert.equal(mobile.drawerOpen, false, "mobile drawer should default closed");
      assert.equal(mobile.collapsedDesktop, false, "desktop collapsed class should not apply on mobile");
      assert.equal(mobile.mobileToggle, true, "mobile hamburger missing");
      assert.equal(mobile.desktopToggleHidden, true, "desktop toggle should be hidden on tablet/mobile");
      assert.ok(Math.abs(mobile.mainWidth - mobile.viewport) <= 2, `mobile main should fill width (${mobile.mainWidth}/${mobile.viewport})`);
      assert.equal(mobile.overflowX, false, "no horizontal overflow on tablet");

      await page.click("#mobileMenuToggle");
      await page.waitForTimeout(200);
      const opened = await page.evaluate(() => document.body.classList.contains("mobile-nav-open"));
      assert.equal(opened, true, "mobile hamburger should open drawer");
      await page.click(".mobile-nav-backdrop");
      await page.waitForTimeout(200);
      const closed = await page.evaluate(() => document.body.classList.contains("mobile-nav-open"));
      assert.equal(closed, false, "backdrop should close drawer");
      await context.close();
      console.log("PASS tablet/mobile drawer defaults");
    }

    console.log("All provider sidebar collapse checks passed.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
