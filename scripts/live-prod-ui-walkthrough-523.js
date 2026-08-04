#!/usr/bin/env node
/**
 * Live production walkthrough after PR #523 / deploy.
 * Targets LLH_PROD_URL (default https://littlelearnershubbyleah.com).
 * Uses client-seeded Pro persona with server persistence blocked.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { chromium } = require("playwright");
const {
  DEVICES,
  PERSONAS,
  seedSession,
  waitBootReady,
  clickSidebarNav,
  evaluateShell,
  assertSingleView,
  dismissFreePlanNudgeIfPresent,
} = require("./test-helpers/llh-browser-nav");

const PROD = (process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const OUT = "/opt/cursor/artifacts/screenshots";
const REPORT_PATH = path.join(OUT, "live-prod-ui-walkthrough-523-report.json");
const EXPECTED_COMMIT_PREFIX = process.env.LLH_EXPECTED_COMMIT || "d0fac5d";

const report = {
  startedAt: new Date().toISOString(),
  prod: PROD,
  deploy: null,
  passed: [],
  failed: [],
  screenshots: [],
  recommendation: "NO-GO",
};

function record(ok, name, detail = "") {
  const row = { ok, name, detail, at: new Date().toISOString() };
  (ok ? report.passed : report.failed).push(row);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 45000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(file);
}

function attachMonitors(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err.message || err)));
  return {
    critical() {
      return [...consoleErrors, ...pageErrors].filter(
        (e) => !/favicon|Failed to load resource|net::ERR|ResizeObserver|fonts\.g|admin-analytics|stripe\.com\/v3|gstatic|ERR_BLOCKED_BY_CLIENT/i.test(e),
      );
    },
  };
}

async function openLive(browser, viewport, persona) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
  await page.route(/multi-role-tester\.js/i, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* stub */" });
  });
  const mon = attachMonitors(page);
  await seedSession(page, persona, {
    lastView: "calendar",
    cacheActivities: 80,
    blockServerPersistence: true,
  });
  await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitBootReady(page);
  await dismissFreePlanNudgeIfPresent(page);
  return { context, page, mon };
}

async function ensureTallPage(page) {
  await page.evaluate(() => {
    let spacer = document.querySelector("#llh-live-spacer");
    if (!spacer) {
      spacer = document.createElement("div");
      spacer.id = "llh-live-spacer";
      spacer.style.height = "2200px";
      document.querySelector(".main")?.appendChild(spacer);
    }
  });
}

async function seedOpenable(page, { id, kind }) {
  return page.evaluate(({ resourceId, resourceKind }) => {
    const longBody = `${"Detailed provider steps for scrolling inside the viewer.\n\n".repeat(50)}`;
    const fake = {
      id: resourceId,
      title: resourceKind === "lesson" ? "Live Walk Lesson Plan" : "Live Walk Activity",
      category: resourceKind === "lesson" ? "Lesson Plans" : "Activity Center",
      age: "Preschool",
      plan: "Pro",
      tags: ["Art"],
      locked: false,
      _curriculumManaged: true,
      _userLessonCopy: true,
      _curriculumActivity: resourceKind === "activity" ? { id: resourceId, lessonPlanId: "user-copy" } : undefined,
      body: longBody,
      description: longBody,
      days: resourceKind === "lesson" ? { monday: ["Intro"], tuesday: ["Play"] } : undefined,
    };
    if (!Array.isArray(resources)) throw new Error("resources missing");
    const idx = resources.findIndex((r) => r.id === resourceId);
    if (idx >= 0) resources[idx] = fake;
    else resources.push(fake);
    return resourceId;
  }, { resourceId: id, resourceKind: kind });
}

async function assertOverlayLock(page, label, openFn, closeFn, { expectBackdropClose = false, checkFocusRestore = true } = {}) {
  await ensureTallPage(page);
  await page.evaluate(() => window.scrollTo(0, 520));
  const focusBefore = await page.evaluate(() => {
    const btn = document.querySelector("#sidebarToggle, #mobileMenuToggle, .main button, button");
    if (btn) btn.focus();
    return document.activeElement?.id || document.activeElement?.tagName || "";
  });
  const yBefore = await page.evaluate(() => window.scrollY);
  await openFn();
  await page.waitForTimeout(200);
  const locked = await page.evaluate(() => ({
    locked: document.body.classList.contains("llh-scroll-locked"),
    position: document.body.style.position,
    top: document.body.style.top,
    y: window.scrollY,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    doubleScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight
      && document.body.scrollHeight > document.body.clientHeight
      && getComputedStyle(document.body).overflowY === "scroll"
      && getComputedStyle(document.documentElement).overflowY === "scroll",
  }));
  assert.equal(locked.locked, true, `${label}: missing llh-scroll-locked`);
  assert.equal(locked.position, "fixed", `${label}: body not fixed`);
  assert.equal(locked.y, 0, `${label}: window.scrollY should be 0 while fixed`);
  assert.equal(locked.overflowX, false, `${label}: horizontal overflow while locked`);
  assert.equal(locked.doubleScroll, false, `${label}: double scrollbar`);
  const savedY = Math.abs(parseInt(String(locked.top || "0").replace("px", ""), 10) || 0);
  assert.ok(Math.abs(savedY - yBefore) <= 200, `${label}: saved scroll far from pre-open (${savedY} vs ${yBefore})`);

  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(50);
  const afterWheel = await page.evaluate(() => ({ y: window.scrollY, top: document.body.style.top }));
  assert.equal(afterWheel.top, `-${savedY}px`, `${label}: wheel moved background lock offset`);
  assert.equal(afterWheel.y, 0, `${label}: wheel moved window scroll`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  let stillOpen = await page.evaluate(() => (
    document.body.classList.contains("llh-scroll-locked")
    || Boolean(document.querySelector(".modal.open"))
    || Boolean(document.querySelector(".llh-confirm-dialog:not([hidden])"))
    || document.body.classList.contains("mobile-nav-open")
  ));
  if (stillOpen) {
    await closeFn();
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => !document.body.classList.contains("llh-scroll-locked"), null, { timeout: 5000 }).catch(() => {});
  const afterClose = await page.evaluate(() => ({
    locked: document.body.classList.contains("llh-scroll-locked"),
    y: window.scrollY,
    position: document.body.style.position,
    active: document.activeElement?.id || document.activeElement?.tagName || "",
  }));
  assert.equal(afterClose.locked, false, `${label}: stale lock after close`);
  assert.equal(afterClose.position, "");
  assert.ok(Math.abs(afterClose.y - savedY) <= 24, `${label}: scroll restore ${afterClose.y} vs ${savedY}`);
  if (checkFocusRestore && focusBefore) {
    // Focus should leave the closed dialog; ideally return to prior control.
    const inDialog = await page.evaluate(() => Boolean(
      document.activeElement?.closest?.(".modal.open, .llh-confirm-dialog:not([hidden])"),
    ));
    assert.equal(inDialog, false, `${label}: focus still inside closed dialog`);
  }

  if (expectBackdropClose) {
    await page.evaluate(() => window.scrollTo(0, 480));
    await openFn();
    await page.waitForTimeout(180);
    const lockedY = await page.evaluate(() => Math.abs(parseInt(String(document.body.style.top || "0").replace("px", ""), 10) || 0));
    await page.evaluate(() => {
      const modal = document.querySelector(".modal.open");
      if (modal) modal.click();
    });
    await page.waitForTimeout(250);
    await page.waitForFunction(() => !document.body.classList.contains("llh-scroll-locked"), null, { timeout: 5000 }).catch(() => {});
    const afterBackdrop = await page.evaluate(() => ({
      locked: document.body.classList.contains("llh-scroll-locked"),
      y: window.scrollY,
    }));
    assert.equal(afterBackdrop.locked, false, `${label}: backdrop close left lock`);
    assert.ok(Math.abs(afterBackdrop.y - lockedY) <= 24, `${label}: backdrop restore failed`);
  }

  record(true, label);
}

async function openResource(page, id) {
  await seedOpenable(page, { id, kind: id.includes("lesson") ? "lesson" : "activity" });
  const result = await page.evaluate(async (resourceId) => {
    const resource = resources.find((r) => r.id === resourceId);
    if (!resource) return { found: false };
    try {
      await openResourceViewer(resourceId);
    } catch (error) {
      return { found: true, error: String(error && error.message || error) };
    }
    await new Promise((r) => setTimeout(r, 250));
    return {
      found: true,
      open: document.querySelector("#resourceViewerModal")?.classList.contains("open"),
      title: document.querySelector("#resourceViewerTitle")?.textContent || "",
    };
  }, id);
  if (!result.open) throw new Error(`viewer did not open: ${JSON.stringify(result)}`);
  await page.waitForSelector("#resourceViewerModal.open", { timeout: 8000 });
}

async function layoutOk(page, label) {
  const snap = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    locked: document.body.classList.contains("llh-scroll-locked"),
    openModal: Boolean(document.querySelector(".modal.open")),
    clippedHeader: (() => {
      const h = document.querySelector(".topbar, header, .app-header");
      if (!h) return false;
      const r = h.getBoundingClientRect();
      return r.left < -2 || r.right > window.innerWidth + 2;
    })(),
  }));
  assert.equal(snap.overflowX, false, `${label}: horizontal overflow`);
  assert.equal(snap.locked, false, `${label}: stale lock`);
  assert.equal(snap.openModal, false, `${label}: stray modal`);
  assert.equal(snap.clippedHeader, false, `${label}: clipped header`);
  record(true, `layout ${label}`);
}

async function runDesktop(browser) {
  const persona = {
    ...PERSONAS.pro,
    email: "live-walkthrough-pro@test.local",
  };
  const { context, page, mon } = await openLive(browser, DEVICES.desktop, persona);

  // Sidebar collapse / expand / persist
  await page.evaluate(() => setView("calendar"));
  await page.waitForSelector("#view-calendar.active-view");
  const side = await page.evaluate(() => ({
    collapsed: document.body.classList.contains("sidebar-collapsed"),
    mainLeft: document.querySelector(".main")?.getBoundingClientRect().left || 0,
    toggleVisible: (() => {
      const t = document.querySelector("#sidebarToggle");
      return Boolean(t) && !t.hidden && getComputedStyle(t).display !== "none";
    })(),
  }));
  assert.equal(side.collapsed, false);
  assert.equal(side.toggleVisible, true);
  assert.ok(side.mainLeft > 200);
  await shot(page, "live523-desktop-sidebar-expanded.png");
  record(true, "desktop sidebar expanded default");

  await page.click("#sidebarToggle");
  await page.waitForTimeout(220);
  const collapsed = await page.evaluate(() => ({
    collapsed: document.body.classList.contains("sidebar-collapsed"),
    mainLeft: document.querySelector(".main")?.getBoundingClientRect().left || 0,
    pref: localStorage.getItem("llhDesktopSidebarCollapsed"),
    mainWidth: document.querySelector(".main")?.getBoundingClientRect().width || 0,
    viewport: window.innerWidth,
  }));
  assert.equal(collapsed.collapsed, true);
  assert.equal(collapsed.pref, "1");
  assert.ok(collapsed.mainLeft <= 1);
  assert.ok(Math.abs(collapsed.mainWidth - collapsed.viewport) <= 2);
  await shot(page, "live523-desktop-sidebar-collapsed.png");
  record(true, "desktop sidebar collapse + no gutter");

  await page.evaluate(() => setView("settings"));
  await page.waitForSelector("#view-settings.active-view");
  // seedSession's addInitScript clears storage on every reload — restore auth + sidebar pref after that clear.
  const persistState = await page.evaluate(() => ({
    user: localStorage.getItem("llhUser"),
    plan: localStorage.getItem("llhPlan"),
    accounts: localStorage.getItem("llhAccounts"),
    sidebar: localStorage.getItem("llhDesktopSidebarCollapsed"),
    cache: localStorage.getItem("llhCurriculumLibraryCacheV1"),
    lastView: sessionStorage.getItem("llhLastPlatformView") || "settings",
  }));
  assert.equal(persistState.sidebar, "1");
  await page.addInitScript((s) => {
    if (s.user) localStorage.setItem("llhUser", s.user);
    if (s.plan) localStorage.setItem("llhPlan", s.plan);
    if (s.accounts) localStorage.setItem("llhAccounts", s.accounts);
    if (s.cache) localStorage.setItem("llhCurriculumLibraryCacheV1", s.cache);
    if (s.sidebar != null) localStorage.setItem("llhDesktopSidebarCollapsed", s.sidebar);
    if (s.lastView) sessionStorage.setItem("llhLastPlatformView", s.lastView);
    try { localStorage.setItem("llhMetaCookieDismissed", "1"); } catch { /* ignore */ }
  }, persistState);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await waitBootReady(page);
  assert.equal(await page.evaluate(() => localStorage.getItem("llhDesktopSidebarCollapsed")), "1");
  assert.equal(await page.evaluate(() => document.body.classList.contains("sidebar-collapsed")), true);
  record(true, "sidebar collapsed state persists after refresh");
  await page.click("#sidebarToggle");
  await page.waitForTimeout(180);

  // Lesson Plan Viewer
  await page.evaluate(() => setView("lessons"));
  await page.waitForSelector("#view-lessons.active-view");
  await assertOverlayLock(
    page,
    "Lesson Plan Viewer",
    async () => openResource(page, "live-lesson-1"),
    async () => page.evaluate(() => { if (typeof closeResourceViewer === "function") closeResourceViewer(); }),
    { expectBackdropClose: true },
  );
  await openResource(page, "live-lesson-1");
  await shot(page, "live523-desktop-lesson-viewer.png");
  // Close button path
  const closeBtn = page.locator("#resourceViewerModal.open [data-action='close-resource-viewer'], #resourceViewerModal.open .modal-close, #resourceViewerModal.open button[aria-label*='Close' i]").first();
  if (await closeBtn.count()) {
    await closeBtn.click();
  } else {
    await page.evaluate(() => closeResourceViewer());
  }
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.body.classList.contains("llh-scroll-locked")), false);
  record(true, "Lesson Plan Viewer close button");

  // Activity Viewer
  await page.evaluate(() => setView("activities"));
  await page.waitForSelector("#view-activities.active-view");
  await assertOverlayLock(
    page,
    "Activity Viewer",
    async () => openResource(page, "live-activity-1"),
    async () => page.evaluate(() => { if (typeof closeResourceViewer === "function") closeResourceViewer(); }),
    { expectBackdropClose: true },
  );
  await openResource(page, "live-activity-1");
  await shot(page, "live523-desktop-activity-viewer.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  // Calendar dialogs (confirm / day actions if available)
  await page.evaluate(() => setView("calendar"));
  await page.waitForSelector("#view-calendar.active-view");
  await assertOverlayLock(
    page,
    "Calendar confirmation dialog",
    async () => {
      await page.evaluate(() => {
        Promise.resolve(confirmAction({
          title: "Clear calendar day?",
          message: "Live walkthrough confirmation for calendar dialogs.",
          confirmLabel: "Clear",
          cancelLabel: "Keep",
        })).catch(() => {});
      });
      await page.waitForSelector(".llh-confirm-dialog:not([hidden]), [data-llh-confirm-dialog]:not([hidden])", { timeout: 8000 });
    },
    async () => {
      await page.evaluate(() => {
        if (typeof closeConfirmActionDialog === "function") closeConfirmActionDialog(false);
        else document.querySelector(".llh-confirm-dialog")?.setAttribute("hidden", "");
        if (typeof syncProviderBodyScrollLock === "function") syncProviderBodyScrollLock();
      });
    },
  );

  // Feedback / Suggest Improvement
  if (await page.evaluate(() => Boolean(document.querySelector("#feedbackModal") && typeof openFeedbackModal === "function"))) {
    await assertOverlayLock(
      page,
      "Feedback / Suggest Improvement",
      async () => {
        await page.evaluate(() => openFeedbackModal());
        await page.waitForSelector("#feedbackModal.open");
      },
      async () => page.evaluate(() => closeFeedbackModal()),
    );
    await shot(page, "live523-desktop-feedback.png");
  } else {
    record(false, "Feedback / Suggest Improvement", "modal API missing");
  }

  // Request Lesson
  if (await page.evaluate(() => Boolean(document.querySelector("#ideaRequestModal") && typeof openIdeaRequestModal === "function"))) {
    await assertOverlayLock(
      page,
      "Request Lesson",
      async () => {
        await page.evaluate(() => openIdeaRequestModal());
        await page.waitForSelector("#ideaRequestModal.open");
      },
      async () => page.evaluate(() => closeIdeaRequestModal()),
    );
  } else {
    record(false, "Request Lesson", "modal API missing");
  }

  // Install App dialog
  if (await page.evaluate(() => Boolean(document.querySelector("#installAppModal") && typeof openInstallAppModal === "function"))) {
    await assertOverlayLock(
      page,
      "Install App dialog",
      async () => {
        await page.evaluate(() => openInstallAppModal({ source: "live-walkthrough" }));
        await page.waitForSelector("#installAppModal.open");
      },
      async () => page.evaluate(() => closeInstallAppModal()),
    );
  } else {
    record(false, "Install App dialog", "modal API missing");
  }

  // Downloads / Print affordances on lesson viewer
  await openResource(page, "live-lesson-print");
  const printUi = await page.evaluate(() => {
    const modal = document.querySelector("#resourceViewerModal.open");
    const text = modal?.innerText || "";
    const hasPrint = /print|download|pdf|export/i.test(text)
      || Boolean(modal?.querySelector("[data-action*='print'], [data-action*='download'], .print-button, #resourceViewerPrint"));
    return { hasPrint, open: Boolean(modal) };
  });
  assert.equal(printUi.open, true);
  record(printUi.hasPrint, "Downloads / Print controls in viewer", printUi.hasPrint ? "" : "no print/download controls visible");
  await page.evaluate(() => closeResourceViewer());
  await page.waitForTimeout(200);

  // Notifications
  await clickSidebarNav(page, "whats-new", "whats-new").catch(async () => {
    await page.evaluate(() => setView("whats-new"));
    await page.waitForSelector("#view-whats-new.active-view, #view-notifications.active-view", { timeout: 15000 });
  });
  await layoutOk(page, "notifications");
  await shot(page, "live523-desktop-notifications.png");

  // Page walks
  const walks = [
    ["calendar", "calendar", "Calendar"],
    ["lessons", "lessons", "Lesson Plans"],
    ["activities", "activities", "Activities"],
    ["children", "children", "Child Profiles"],
    ["ai", "ai", "Documentation Helpers"],
    ["behavior-support", "support-center", "Behavior & Support"],
    ["messages", "messages", "Messages"],
    ["settings", "settings", "Settings"],
  ];
  for (const [nav, active, label] of walks) {
    await dismissFreePlanNudgeIfPresent(page);
    try {
      await clickSidebarNav(page, nav, active);
    } catch {
      await page.evaluate((v) => setView(v), nav);
      await page.waitForSelector(`#view-${active}.active-view`, { timeout: 15000 });
    }
    assertSingleView(await evaluateShell(page), label);
    await layoutOk(page, label);
    await shot(page, `live523-desktop-${active}.png`);
    record(true, `page: ${label}`);
  }

  const errs = mon.critical();
  record(errs.length === 0, "desktop no critical console errors", errs.slice(0, 3).join(" | "));
  await context.close();
}

async function runTablet(browser) {
  const persona = { ...PERSONAS.pro, email: "live-walkthrough-tablet@test.local" };
  const { context, page, mon } = await openLive(browser, DEVICES.tablet, persona);
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
  // Tablet uses drawer mode at <=1100
  assert.equal(chrome.mobileToggle, true);
  assert.equal(chrome.drawerOpen, false);
  await page.click("#mobileMenuToggle");
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => document.body.classList.contains("mobile-nav-open")), true);
  assert.equal(await page.evaluate(() => document.body.classList.contains("llh-scroll-locked")), true);
  await shot(page, "live523-tablet-drawer.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => document.body.classList.contains("mobile-nav-open")), false);
  record(true, "tablet drawer open/ESC/scroll-lock");

  await openResource(page, "live-tablet-activity");
  assert.equal(await page.evaluate(() => document.body.classList.contains("llh-scroll-locked")), true);
  await page.mouse.wheel(0, 400);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(220);
  record(true, "tablet activity viewer scroll lock");
  await layoutOk(page, "tablet after overlays");
  const errs = mon.critical();
  record(errs.length === 0, "tablet no critical console errors", errs.slice(0, 3).join(" | "));
  await context.close();
}

async function runMobile(browser) {
  const persona = { ...PERSONAS.pro, email: "live-walkthrough-mobile@test.local" };
  const { context, page, mon } = await openLive(browser, DEVICES.phone, persona);
  await page.evaluate(() => setView("calendar"));
  await page.waitForSelector("#view-calendar.active-view");
  const chrome = await page.evaluate(() => ({
    desktopToggleHidden: (() => {
      const t = document.querySelector("#sidebarToggle");
      return !t || t.hidden || getComputedStyle(t).display === "none";
    })(),
    mobileToggle: Boolean(document.querySelector("#mobileMenuToggle")),
  }));
  assert.equal(chrome.desktopToggleHidden, true);
  assert.equal(chrome.mobileToggle, true);
  record(true, "mobile chrome (drawer toggle, no desktop sidebar toggle)");

  await page.click("#mobileMenuToggle");
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => document.body.classList.contains("mobile-nav-open")), true);
  assert.equal(await page.evaluate(() => document.body.classList.contains("llh-scroll-locked")), true);
  await shot(page, "live523-mobile-drawer.png");
  // Backdrop click if present
  const backdrop = page.locator(".mobile-nav-backdrop, #mobileNavBackdrop, .nav-backdrop").first();
  if (await backdrop.count()) {
    await backdrop.click({ force: true });
    await page.waitForTimeout(220);
  } else {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(220);
  }
  assert.equal(await page.evaluate(() => document.body.classList.contains("mobile-nav-open")), false);
  record(true, "mobile drawer close (backdrop/ESC)");

  await assertOverlayLock(
    page,
    "mobile Activity Viewer",
    async () => openResource(page, "live-mobile-activity"),
    async () => page.evaluate(() => closeResourceViewer()),
    { expectBackdropClose: true },
  );
  await shot(page, "live523-mobile-activity.png");

  for (const [nav, active] of [
    ["children", "children"],
    ["ai", "ai"],
    ["messages", "messages"],
    ["settings", "settings"],
  ]) {
    await page.evaluate((v) => setView(v), nav);
    await page.waitForSelector(`#view-${active}.active-view`, { timeout: 15000 });
    await layoutOk(page, `mobile ${active}`);
  }
  const errs = mon.critical();
  record(errs.length === 0, "mobile no critical console errors", errs.slice(0, 3).join(" | "));
  await context.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const bv = await fetchJson(`${PROD}/api/build-version`);
  report.deploy = {
    buildVersion: bv.json,
    expectedPrefix: EXPECTED_COMMIT_PREFIX,
  };
  const commit = String(bv.json?.commit || "");
  const liveOk = bv.status === 200 && commit.startsWith(EXPECTED_COMMIT_PREFIX);
  record(liveOk, "live commit matches expected deploy", `${commit} shell=${bv.json?.shellVersion}`);
  if (!liveOk) {
    report.recommendation = "NO-GO";
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const markers = await new Promise((resolve, reject) => {
    https.get(`${PROD}/`, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
  record(/id="sidebarToggle"/.test(markers), "live HTML has sidebarToggle");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    await runDesktop(browser);
    await runTablet(browser);
    await runMobile(browser);
  } catch (error) {
    record(false, "walkthrough crashed", String(error && error.stack || error));
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  report.recommendation = report.failed.length === 0 ? "GO" : "NO-GO";
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("\nREPORT", REPORT_PATH);
  console.log("PASSED", report.passed.length, "FAILED", report.failed.length, "=>", report.recommendation);
  if (report.failed.length) {
    for (const f of report.failed) console.log(" -", f.name, f.detail);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
