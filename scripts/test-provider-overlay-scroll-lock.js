#!/usr/bin/env node
/**
 * Provider overlay body scroll-lock + nested overlay + restore checks.
 * Run: npm run test:provider-overlay-scroll-lock
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19720 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-scroll-lock-${crypto.randomBytes(4).toString("hex")}.json`);

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
  const freeIds = [
    "free-starter-infant-1",
    "free-starter-toddler-1",
    "free-starter-preschool-1",
  ];
  const plans = freeIds.map((id, i) => ({
    id,
    title: `Scroll Lock Lesson ${i + 1}`,
    age: "Preschool",
    theme: "Science",
    plan: "Free",
    status: "published",
    locked: false,
    activityCount: 2,
    updatedAt: new Date().toISOString(),
  }));
  const activities = Array.from({ length: 12 }, (_, i) => ({
    id: `scroll-lock-act-${i}`,
    lessonPlanId: freeIds[i % freeIds.length],
    title: `Scroll Lock Activity ${i + 1} — ${"long content ".repeat(40)}`,
    activityCategory: "Art",
    dayOfWeek: "monday",
    plan: "Free",
    locked: false,
    parentTitle: `Scroll Lock Lesson ${(i % freeIds.length) + 1}`,
    parentAge: "Preschool",
    parentPlan: "Free",
    description: `${"Step by step activity instructions. ".repeat(80)}`,
    materials: ["Paper", "Crayons", "Glue"],
    updatedAt: new Date().toISOString(),
  }));
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
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
      ADMIN_EMAIL: "scroll-lock@test.local",
      ADMIN_PASSWORD: "scroll-pass",
      ADMIN_ACCESS_CODE: "scroll-code",
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
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 300));
}

function staticChecks() {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(app, /function acquireBodyScrollLock/);
  assert.match(app, /function releaseBodyScrollLock/);
  assert.match(app, /function syncProviderBodyScrollLock/);
  assert.match(app, /llhBodyScrollLockTokens/);
  assert.match(app, /installProviderOverlayScrollLock/);
  assert.match(css, /llh-scroll-locked/);
  assert.match(css, /resource-viewer-modal\.open:not\(\.lesson-workspace-mode\)/);
  console.log("PASS static scroll-lock markers");
}

async function openAuthedPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
  await page.route(/multi-role-tester\.js/i, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* stub */" });
  });
  await page.addInitScript(() => {
    const email = "scroll-lock@example.com";
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" },
    }));
    localStorage.setItem("llhPlan", "Free");
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => (
    typeof isAppBootInteractive === "function"
    && isAppBootInteractive()
    && typeof acquireBodyScrollLock === "function"
  ), null, { timeout: 90000 });
  return { context, page };
}

async function main() {
  staticChecks();
  const playwright = require("playwright");
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const { context, page } = await openAuthedPage(browser);

    // Grow page so background can scroll.
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.id = "llh-scroll-spacer";
      spacer.style.height = "2400px";
      document.querySelector(".main")?.appendChild(spacer);
      window.scrollTo(0, 640);
    });
    await page.waitForTimeout(80);
    const before = await page.evaluate(() => ({
      y: window.scrollY,
      locked: document.body.classList.contains("llh-scroll-locked"),
      bodyTop: document.body.style.top,
    }));
    assert.ok(before.y >= 600, `expected scrolled page, got ${before.y}`);
    assert.equal(before.locked, false);

    // Nested token lock preserves scroll and unlocks only after final release.
    const nested = await page.evaluate(() => {
      const y0 = window.scrollY;
      acquireBodyScrollLock("test-a");
      const mid = {
        locked: document.body.classList.contains("llh-scroll-locked"),
        top: document.body.style.top,
        position: document.body.style.position,
        y: window.scrollY,
      };
      acquireBodyScrollLock("test-b");
      releaseBodyScrollLock("test-a");
      const still = document.body.classList.contains("llh-scroll-locked");
      releaseBodyScrollLock("test-b");
      return {
        y0,
        mid,
        stillAfterPartialRelease: still,
        after: {
          locked: document.body.classList.contains("llh-scroll-locked"),
          y: window.scrollY,
          position: document.body.style.position,
          top: document.body.style.top,
        },
      };
    });
    assert.equal(nested.mid.locked, true);
    assert.equal(nested.mid.position, "fixed");
    assert.equal(nested.mid.top, `-${nested.y0}px`);
    assert.equal(nested.stillAfterPartialRelease, true, "nested lock released too early");
    assert.equal(nested.after.locked, false);
    assert.equal(nested.after.position, "");
    assert.ok(Math.abs(nested.after.y - nested.y0) <= 2, `scroll not restored (${nested.after.y} vs ${nested.y0})`);
    console.log("PASS nested token acquire/release + restore");

    // Wheel on background while locked does not move page.
    await page.evaluate(() => {
      window.scrollTo(0, 500);
      acquireBodyScrollLock("wheel-test");
    });
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(60);
    const wheelLocked = await page.evaluate(() => ({
      y: window.scrollY,
      top: document.body.style.top,
    }));
    assert.equal(wheelLocked.top, "-500px");
    assert.equal(wheelLocked.y, 0, "window.scrollY should stay 0 while body is fixed");
    await page.evaluate(() => releaseBodyScrollLock("wheel-test"));
    const afterWheel = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(afterWheel - 500) <= 2, `restore after wheel lock failed: ${afterWheel}`);
    console.log("PASS wheel does not move locked background");

    // Open activity viewer and verify background lock + panel scroll + Escape.
    await page.evaluate(() => {
      window.scrollTo(0, 420);
      if (typeof setView === "function") setView("activities");
    });
    await page.waitForSelector("#view-activities.active-view", { timeout: 15000 });
    await page.waitForTimeout(300);
    const opened = await page.evaluate(async () => {
      const yBefore = window.scrollY;
      const id = "scroll-lock-test-activity";
      const fake = {
        id,
        title: "Scroll Lock Test Activity",
        category: "Activity Center",
        age: "Preschool",
        plan: "Free",
        format: "In-app resource",
        tags: ["Art"],
        locked: false,
        // Treat as an entitled user-owned copy so Free canAccess() allows the viewer.
        _curriculumManaged: true,
        _userLessonCopy: true,
        _curriculumActivity: { id, lessonPlanId: "user-copy-parent", title: "Scroll Lock Test Activity" },
        body: `${"Detailed activity steps for providers. ".repeat(120)}`,
        description: `${"Detailed activity steps for providers. ".repeat(120)}`,
      };
      if (Array.isArray(resources)) {
        const idx = resources.findIndex((r) => r.id === id);
        if (idx >= 0) resources[idx] = fake;
        else resources.push(fake);
      }
      await openResourceViewer(id);
      await new Promise((r) => setTimeout(r, 250));
      const modal = document.querySelector("#resourceViewerModal");
      const body = document.querySelector("#resourceViewerBody");
      return {
        ok: true,
        yBefore,
        open: modal?.classList.contains("open"),
        locked: document.body.classList.contains("llh-scroll-locked")
          || document.body.classList.contains("resource-viewer-open"),
        bodyPosition: document.body.style.position,
        bodyTop: document.body.style.top,
        bodyCanScroll: body ? (body.scrollHeight > body.clientHeight - 1) : false,
        title: document.querySelector("#resourceViewerTitle")?.textContent || "",
        closeVisible: Boolean(document.querySelector("#closeResourceViewer")),
        printVisible: Boolean(document.querySelector("#printResourceButton")),
        resourceId: id,
      };
    });
    assert.equal(opened.ok, true, opened.reason || "open failed");
    assert.equal(opened.open, true, "resource viewer did not open");
    assert.equal(opened.locked, true, "viewer open did not lock body");
    assert.equal(opened.bodyPosition, "fixed", "body should be position fixed while viewer open");
    assert.equal(opened.closeVisible, true);
    assert.equal(opened.printVisible, true);
    console.log("PASS activity/resource viewer locks background");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    const afterEscape = await page.evaluate(() => ({
      open: document.querySelector("#resourceViewerModal")?.classList.contains("open"),
      locked: document.body.classList.contains("llh-scroll-locked"),
      y: window.scrollY,
      position: document.body.style.position,
    }));
    assert.equal(afterEscape.open, false, "Escape should close viewer");
    assert.equal(afterEscape.locked, false, "stale scroll lock after Escape");
    assert.equal(afterEscape.position, "");
    assert.ok(Math.abs(afterEscape.y - opened.yBefore) <= 8, `scroll not restored after Escape (${afterEscape.y} vs ${opened.yBefore})`);
    console.log("PASS Escape closes viewer and restores scroll");

    // Confirm sidebar toggle still present (from prior polish)
    const sidebar = await page.evaluate(() => Boolean(document.querySelector("#sidebarToggle")));
    assert.equal(sidebar, true);
    await context.close();
    console.log("PASS activity viewer + Escape path");

    // Auth modal lock on a fresh page (avoids deferred library scroll restores).
    {
      const authCtx = await openAuthedPage(browser);
      const authPage = authCtx.page;
      await authPage.evaluate(() => {
        const spacer = document.createElement("div");
        spacer.style.height = "2000px";
        document.querySelector(".main")?.appendChild(spacer);
        window.scrollTo(0, 300);
      });
      const authOpen = await authPage.evaluate(() => {
        window.scrollTo(0, 300);
        const yBefore = window.scrollY;
        openAuthModal("login");
        return {
          open: document.querySelector("#authModal")?.classList.contains("open"),
          locked: document.body.classList.contains("llh-scroll-locked"),
          position: document.body.style.position,
          top: document.body.style.top,
          yBefore,
        };
      });
      assert.equal(authOpen.open, true);
      assert.equal(authOpen.locked, true);
      assert.equal(authOpen.position, "fixed");
      assert.equal(authOpen.top, `-${authOpen.yBefore}px`);
      await authPage.evaluate(() => closeAuthModal());
      // Unlock restores again on rAF after focus/layout settles.
      await authPage.waitForFunction((expected) => (
        !document.body.classList.contains("llh-scroll-locked")
        && Math.abs(window.scrollY - expected) <= 8
      ), authOpen.yBefore, { timeout: 3000 });
      const authClosed = await authPage.evaluate(() => ({
        locked: document.body.classList.contains("llh-scroll-locked"),
        y: window.scrollY,
        position: document.body.style.position,
      }));
      assert.equal(authClosed.locked, false);
      assert.equal(authClosed.position, "");
      assert.ok(Math.abs(authClosed.y - authOpen.yBefore) <= 8, `auth close scroll restore failed: ${authClosed.y} vs ${authOpen.yBefore}`);
      await authCtx.context.close();
      console.log("PASS auth modal scroll lock");
    }

    console.log("All provider overlay scroll-lock checks passed.");
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
