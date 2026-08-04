#!/usr/bin/env node
/**
 * Production-equivalent UI regression for overlay scroll-lock + sidebar.
 * Runs against a local server bootstrapped from this branch (pre/post deploy gate).
 * Also probes live production for whether the fix is present.
 *
 * Run: node scripts/prod-regression-overlay-scroll-lock.js
 * Optional: LLH_PROD_URL=https://littlelearnershubbyleah.com
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19880 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-prod-reg-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const PROD_URL = (process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const report = {
  liveFixPresent: false,
  liveProbe: null,
  local: { passed: [], failed: [], screenshots: [] },
  recommendation: "NO-GO",
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    }).on("error", reject);
  });
}

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
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

async function openAuthed(browser, viewport, email) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
  await page.route(/multi-role-tester\.js/i, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* stub */" });
  });
  await page.addInitScript(({ userEmail }) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [userEmail]: { email: userEmail, plan: "Free", subscriptionStatus: "Free Plan" },
    }));
    localStorage.setItem("llhPlan", "Free");
    try { localStorage.setItem("llhMetaCookieDismissed", "1"); } catch { /* ignore */ }
  }, { userEmail: email });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => (
    typeof isAppBootInteractive === "function"
    && isAppBootInteractive()
    && typeof acquireBodyScrollLock === "function"
  ), null, { timeout: 90000 });
  return { context, page };
}

async function ensureTallPage(page) {
  await page.evaluate(() => {
    let spacer = document.querySelector("#llh-reg-spacer");
    if (!spacer) {
      spacer = document.createElement("div");
      spacer.id = "llh-reg-spacer";
      spacer.style.height = "2200px";
      document.querySelector(".main")?.appendChild(spacer);
    }
  });
}

async function seedOpenableActivity(page, id = "reg-activity") {
  return page.evaluate((resourceId) => {
    const fake = {
      id: resourceId,
      title: "Regression Activity Long Content",
      category: "Activity Center",
      age: "Preschool",
      plan: "Free",
      tags: ["Art"],
      locked: false,
      _curriculumManaged: true,
      _userLessonCopy: true,
      _curriculumActivity: { id: resourceId, lessonPlanId: "user-copy" },
      body: `${"Detailed provider steps for scrolling inside the viewer.\n\n".repeat(60)}`,
      description: `${"Detailed provider steps for scrolling inside the viewer.\n\n".repeat(60)}`,
    };
    if (typeof resources === "undefined" || !Array.isArray(resources)) {
      throw new Error("resources array is not available in page context");
    }
    const idx = resources.findIndex((r) => r.id === resourceId);
    if (idx >= 0) resources[idx] = fake;
    else resources.push(fake);
    const found = resources.find((r) => r.id === resourceId);
    if (!found) throw new Error("failed to seed activity resource");
    return { id: resourceId, len: resources.length, access: typeof canAccess === "function" ? canAccess(found) : null };
  }, id).then((result) => result.id);
}

async function assertOverlayLock(page, label, openFn, closeFn, { expectBackdropClose = false } = {}) {
  await ensureTallPage(page);
  await page.evaluate(() => window.scrollTo(0, 520));
  const yBefore = await page.evaluate(() => window.scrollY);
  await openFn();
  await page.waitForTimeout(180);
  const locked = await page.evaluate(() => ({
    locked: document.body.classList.contains("llh-scroll-locked"),
    position: document.body.style.position,
    top: document.body.style.top,
    stateY: (() => {
      const top = document.body.style.top || "";
      const n = Math.abs(parseInt(top.replace("px", ""), 10));
      return Number.isFinite(n) ? n : null;
    })(),
    y: window.scrollY,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  assert.equal(locked.locked, true, `${label}: missing llh-scroll-locked`);
  assert.equal(locked.position, "fixed", `${label}: body not fixed`);
  assert.equal(locked.y, 0, `${label}: window.scrollY should be 0 while fixed`);
  assert.equal(locked.overflowX, false, `${label}: horizontal overflow while locked`);
  const savedY = Number.isFinite(locked.stateY)
    ? locked.stateY
    : Math.abs(parseInt(String(locked.top || "0").replace("px", ""), 10) || 0);
  assert.ok(savedY >= 0, `${label}: invalid saved scroll`);
  // Prefer exact pre-open scroll; allow small layout shift from dialog chrome.
  assert.ok(
    Math.abs(savedY - yBefore) <= 200,
    `${label}: saved scroll far from pre-open (${savedY} vs ${yBefore})`,
  );

  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(40);
  const afterWheel = await page.evaluate(() => ({
    y: window.scrollY,
    top: document.body.style.top,
  }));
  assert.equal(afterWheel.top, `-${savedY}px`, `${label}: wheel moved background lock offset`);
  assert.equal(afterWheel.y, 0, `${label}: wheel moved window scroll`);

  // ESC close path
  await page.keyboard.press("Escape");
  await page.waitForTimeout(220);
  let stillOpen = await page.evaluate(() => (
    document.body.classList.contains("llh-scroll-locked")
    || Boolean(document.querySelector(".modal.open"))
    || Boolean(document.querySelector(".llh-confirm-dialog:not([hidden])"))
  ));
  if (stillOpen) {
    await closeFn();
    await page.waitForTimeout(220);
  }
  await page.waitForFunction(() => !document.body.classList.contains("llh-scroll-locked"), null, { timeout: 4000 }).catch(() => {});
  const afterClose = await page.evaluate(() => ({
    locked: document.body.classList.contains("llh-scroll-locked"),
    y: window.scrollY,
    position: document.body.style.position,
  }));
  assert.equal(afterClose.locked, false, `${label}: stale lock after close`);
  assert.equal(afterClose.position, "");
  assert.ok(Math.abs(afterClose.y - savedY) <= 16, `${label}: scroll restore ${afterClose.y} vs ${savedY}`);

  if (expectBackdropClose) {
    await page.evaluate(() => window.scrollTo(0, 480));
    const y2 = await page.evaluate(() => window.scrollY);
    await openFn();
    await page.waitForTimeout(150);
    const lockedY = await page.evaluate(() => {
      const top = document.body.style.top || "";
      const n = Math.abs(parseInt(top.replace("px", ""), 10));
      return Number.isFinite(n) ? n : window.scrollY;
    });
    await page.evaluate(() => {
      const modal = document.querySelector(".modal.open");
      if (modal) modal.click();
    });
    await page.waitForTimeout(220);
    await page.waitForFunction(() => !document.body.classList.contains("llh-scroll-locked"), null, { timeout: 4000 }).catch(() => {});
    const afterBackdrop = await page.evaluate(() => ({
      locked: document.body.classList.contains("llh-scroll-locked"),
      y: window.scrollY,
    }));
    assert.equal(afterBackdrop.locked, false, `${label}: backdrop close left lock`);
    assert.ok(Math.abs(afterBackdrop.y - lockedY) <= 16, `${label}: backdrop restore failed`);
  }

  report.local.passed.push(label);
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  report.local.screenshots.push(file);
  console.log("SHOT", name);
}

async function probeLive() {
  const app = await fetchText(`${PROD_URL}/app.js`);
  const html = await fetchText(`${PROD_URL}/`);
  const hasLock = /function acquireBodyScrollLock|syncProviderBodyScrollLock/.test(app.text);
  const hasSidebar = /llhDesktopSidebarCollapsed|id="sidebarToggle"/.test(app.text + html.text);
  report.liveFixPresent = hasLock;
  report.liveProbe = {
    url: PROD_URL,
    appStatus: app.status,
    appBytes: app.text.length,
    hasAcquireBodyScrollLock: hasLock,
    hasSidebarToggle: hasSidebar,
    inventory: null,
  };
  try {
    const site = await fetchText(`${PROD_URL}/api/site-content`);
    const json = JSON.parse(site.text);
    const lib = json.curriculumLibrary
      || json.siteContent?.curriculumLibrary
      || {};
    report.liveProbe.inventory = {
      lessonPlans: (lib.lessonPlans || []).length,
      activities: (lib.activities || []).length,
    };
  } catch {
    report.liveProbe.inventory = "unavailable";
  }
  console.log("LIVE PROBE", JSON.stringify(report.liveProbe, null, 2));
}

async function main() {
  await probeLive();

  const playwright = require("playwright");
  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    // Desktop suite
    {
      const { context, page } = await openAuthed(browser, { width: 1360, height: 900 }, "prod-reg@example.com");

      // Sidebar collapse/expand + persist
      await page.evaluate(() => setView("calendar"));
      await page.waitForSelector("#view-calendar.active-view");
      const sideExpanded = await page.evaluate(() => ({
        collapsed: document.body.classList.contains("sidebar-collapsed"),
        mainLeft: document.querySelector(".main").getBoundingClientRect().left,
        toggle: Boolean(document.querySelector("#sidebarToggle")) && !document.querySelector("#sidebarToggle").hidden,
      }));
      assert.equal(sideExpanded.collapsed, false);
      assert.equal(sideExpanded.toggle, true);
      assert.ok(sideExpanded.mainLeft > 200);
      await shot(page, "prod-reg-desktop-sidebar-expanded.png");

      await page.click("#sidebarToggle");
      await page.waitForTimeout(220);
      const sideCollapsed = await page.evaluate(() => ({
        collapsed: document.body.classList.contains("sidebar-collapsed"),
        mainLeft: document.querySelector(".main").getBoundingClientRect().left,
        mainWidth: document.querySelector(".main").getBoundingClientRect().width,
        viewport: window.innerWidth,
        pref: localStorage.getItem("llhDesktopSidebarCollapsed"),
      }));
      assert.equal(sideCollapsed.collapsed, true);
      assert.equal(sideCollapsed.pref, "1");
      assert.ok(sideCollapsed.mainLeft <= 1);
      assert.ok(Math.abs(sideCollapsed.mainWidth - sideCollapsed.viewport) <= 2);
      await shot(page, "prod-reg-desktop-sidebar-collapsed.png");
      report.local.passed.push("desktop sidebar collapse/expand + no gutter");

      await page.evaluate(() => setView("settings"));
      await page.waitForSelector("#view-settings.active-view");
      assert.equal(await page.evaluate(() => document.body.classList.contains("sidebar-collapsed")), true);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => typeof isAppBootInteractive === "function" && isAppBootInteractive(), null, { timeout: 90000 });
      assert.equal(await page.evaluate(() => localStorage.getItem("llhDesktopSidebarCollapsed")), "1");
      assert.equal(await page.evaluate(() => document.body.classList.contains("sidebar-collapsed")), true);
      report.local.passed.push("sidebar preference survives navigation + refresh");

      // Expand again for overlay tests
      await page.click("#sidebarToggle");
      await page.waitForTimeout(180);

      // Activity viewer
      await page.evaluate(() => setView("activities"));
      await page.waitForSelector("#view-activities.active-view");
      const actId = await seedOpenableActivity(page, "reg-activity");
      const openActivity = async () => {
        // Re-seed immediately before open — library reloads can replace the resources array.
        await seedOpenableActivity(page, actId);
        const result = await page.evaluate(async (id) => {
          const resource = resources.find((r) => r.id === id);
          if (!resource) return { found: false, open: false };
          const access = typeof canAccess === "function" ? canAccess(resource) : null;
          try {
            await openResourceViewer(id);
          } catch (error) {
            return { error: String(error && error.message || error), access, found: true };
          }
          await new Promise((r) => setTimeout(r, 250));
          return {
            found: true,
            access,
            open: document.querySelector("#resourceViewerModal")?.classList.contains("open"),
            preview: document.querySelector("#featurePreviewModal")?.classList.contains("open"),
            lockedClass: document.body.classList.contains("resource-viewer-open"),
            title: document.querySelector("#resourceViewerTitle")?.textContent || "",
          };
        }, actId);
        if (!result.open) {
          throw new Error(`activity viewer did not open: ${JSON.stringify(result)}`);
        }
        await page.waitForSelector("#resourceViewerModal.open", { timeout: 5000 });
      };
      await assertOverlayLock(
        page,
        "activity viewer",
        openActivity,
        async () => {
          await page.evaluate(() => { if (typeof closeResourceViewer === "function") closeResourceViewer(); });
        },
        { expectBackdropClose: true },
      );
      await openActivity();
      await shot(page, "prod-reg-desktop-activity-viewer.png");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);

      // Auth / login dialog
      await assertOverlayLock(
        page,
        "auth modal",
        async () => {
          await page.evaluate(() => openAuthModal("login"));
          await page.waitForSelector("#authModal.open");
        },
        async () => {
          await page.evaluate(() => closeAuthModal());
        },
      );

      // Confirm dialog
      await assertOverlayLock(
        page,
        "confirmation dialog",
        async () => {
          await page.evaluate(() => {
            // Fire-and-forget confirm; we only need the overlay open.
            Promise.resolve(confirmAction({
              title: "Remove lesson?",
              message: "This is a regression confirmation dialog.",
              confirmLabel: "Remove",
              cancelLabel: "Cancel",
            })).catch(() => {});
          });
          await page.waitForSelector(".llh-confirm-dialog:not([hidden]), [data-llh-confirm-dialog]:not([hidden])", { timeout: 5000 });
        },
        async () => {
          await page.evaluate(() => {
            if (typeof closeConfirmActionDialog === "function") closeConfirmActionDialog(false);
            else document.querySelector(".llh-confirm-dialog")?.setAttribute("hidden", "");
            document.body.classList.remove("auth-modal-open");
            syncProviderBodyScrollLock();
          });
        },
      );

      // Feedback modal if present
      const hasFeedback = await page.evaluate(() => Boolean(document.querySelector("#feedbackModal") && typeof openFeedbackModal === "function"));
      if (hasFeedback) {
        await assertOverlayLock(
          page,
          "feedback / suggest improvement modal",
          async () => {
            await page.evaluate(() => openFeedbackModal());
            await page.waitForSelector("#feedbackModal.open");
          },
          async () => {
            await page.evaluate(() => closeFeedbackModal());
          },
        );
      } else {
        report.local.passed.push("feedback modal skipped (not available in this session)");
      }

      // Idea request modal
      const hasIdea = await page.evaluate(() => Boolean(document.querySelector("#ideaRequestModal") && typeof openIdeaRequestModal === "function"));
      if (hasIdea) {
        await assertOverlayLock(
          page,
          "request lesson / idea dialog",
          async () => {
            await page.evaluate(() => openIdeaRequestModal());
            await page.waitForSelector("#ideaRequestModal.open");
          },
          async () => {
            await page.evaluate(() => closeIdeaRequestModal());
          },
        );
      }

      // Install app modal
      const hasInstall = await page.evaluate(() => Boolean(document.querySelector("#installAppModal") && typeof openInstallAppModal === "function"));
      if (hasInstall) {
        await assertOverlayLock(
          page,
          "install app modal",
          async () => {
            await page.evaluate(() => openInstallAppModal({ source: "regression" }));
            await page.waitForSelector("#installAppModal.open");
          },
          async () => {
            await page.evaluate(() => closeInstallAppModal());
          },
        );
      }

      // Page walk — no overflow / no stale lock
      for (const [nav, active] of [
        ["calendar", "calendar"],
        ["lessons", "lessons"],
        ["activities", "activities"],
        ["children", "children"],
        ["ai", "ai"],
        ["behavior-support", "support-center"],
        ["messages", "messages"],
        ["settings", "settings"],
      ]) {
        await page.evaluate((v) => setView(v), nav);
        await page.waitForSelector(`#view-${active}.active-view`, { timeout: 15000 });
        const snap = await page.evaluate(() => ({
          locked: document.body.classList.contains("llh-scroll-locked"),
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          openModal: Boolean(document.querySelector(".modal.open")),
        }));
        assert.equal(snap.locked, false, `${nav}: stale lock`);
        assert.equal(snap.openModal, false, `${nav}: stray modal`);
        assert.equal(snap.overflowX, false, `${nav}: horizontal overflow`);
        report.local.passed.push(`page walk ${nav}`);
      }
      await shot(page, "prod-reg-desktop-settings.png");
      await context.close();
    }

    // Mobile suite
    {
      const { context, page } = await openAuthed(browser, { width: 390, height: 844 }, "prod-reg-mobile@example.com");
      await page.evaluate(() => setView("calendar"));
      await page.waitForSelector("#view-calendar.active-view");
      const chrome = await page.evaluate(() => ({
        desktopToggleHidden: (() => {
          const t = document.querySelector("#sidebarToggle");
          return !t || t.hidden || getComputedStyle(t).display === "none";
        })(),
        mobileToggle: Boolean(document.querySelector("#mobileMenuToggle")),
        drawerOpen: document.body.classList.contains("mobile-nav-open"),
      }));
      assert.equal(chrome.desktopToggleHidden, true);
      assert.equal(chrome.mobileToggle, true);
      assert.equal(chrome.drawerOpen, false);

      await page.click("#mobileMenuToggle");
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.body.classList.contains("mobile-nav-open")), true);
      assert.equal(await page.evaluate(() => document.body.classList.contains("llh-scroll-locked")), true);
      await shot(page, "prod-reg-mobile-drawer.png");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.body.classList.contains("mobile-nav-open")), false);
      report.local.passed.push("mobile drawer lock + Escape");

      await page.click("#mobileMenuToggle");
      await page.waitForTimeout(150);
      await page.click('.sidebar .nav-link[data-view="activities"]');
      await page.waitForSelector("#view-activities.active-view");
      assert.equal(await page.evaluate(() => document.body.classList.contains("mobile-nav-open")), false);
      report.local.passed.push("mobile drawer closes on nav");

      const actId = await seedOpenableActivity(page, "reg-activity-m");
      const openMobileActivity = async () => {
        await seedOpenableActivity(page, actId);
        await page.evaluate(async (id) => { await openResourceViewer(id); }, actId);
        await page.waitForSelector("#resourceViewerModal.open", { timeout: 10000 });
      };
      await assertOverlayLock(
        page,
        "mobile activity viewer",
        openMobileActivity,
        async () => {
          await page.evaluate(() => closeResourceViewer());
        },
      );
      await openMobileActivity();
      await shot(page, "prod-reg-mobile-activity-viewer.png");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      await context.close();
    }

    // Local branch fully passed. Live sign-off still requires merge/deploy of #523.
    report.recommendation = report.liveFixPresent
      ? "GO"
      : "NO-GO for live production sign-off — PR #523 is not deployed yet. Local branch regression: GO for merge/deploy.";
  } catch (error) {
    report.local.failed.push(error.message || String(error));
    report.recommendation = "NO-GO";
    console.error("FAIL:", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) child.kill("SIGKILL");
    fs.rmSync(STORE_PATH, { force: true });
    const outPath = path.join(OUT, "prod-regression-overlay-scroll-lock-report.json");
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log("\n===== PRODUCTION REGRESSION REPORT =====");
    console.log(JSON.stringify(report, null, 2));
    console.log("Report written:", outPath);
  }
}

main();
