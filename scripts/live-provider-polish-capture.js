#!/usr/bin/env node
/**
 * Visual capture for provider polish pass — live production, Pro-seeded session.
 * Dismisses chrome that hides content, opens real long curriculum items when possible.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  DEVICES,
  PERSONAS,
  seedSession,
  waitBootReady,
  dismissFreePlanNudgeIfPresent,
} = require("./test-helpers/llh-browser-nav");

const PROD = (process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const OUT = "/opt/cursor/artifacts/screenshots/polish-pass";

async function dismissChrome(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("llhMetaCookieDismissed", "1");
      localStorage.setItem("llhCookieConsent", "1");
      localStorage.setItem("llhTeachingKitAnnouncementDismissed", "1");
    } catch { /* ignore */ }
    document.querySelectorAll(
      "#cookieBanner, .cookie-banner, [data-cookie-banner], .meta-cookie-banner, #teachingKitAnnouncement, .announcement-banner",
    ).forEach((el) => {
      el.hidden = true;
      el.style.display = "none";
    });
    document.querySelectorAll("button").forEach((btn) => {
      const t = (btn.textContent || "").trim().toLowerCase();
      if (t === "got it" || t === "dismiss") btn.click();
    });
  });
  await page.waitForTimeout(200);
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("SHOT", file);
  return file;
}

async function openLive(browser, viewport, email) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
  await page.route(/multi-role-tester\.js/i, (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "/* stub */",
  }));
  await seedSession(page, { ...PERSONAS.pro, email }, {
    lastView: "calendar",
    cacheActivities: 40,
    blockServerPersistence: true,
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("llhMetaCookieDismissed", "1");
      localStorage.setItem("llhCookieConsent", "1");
      localStorage.setItem("llhTeachingKitAnnouncementDismissed", "1");
    } catch { /* ignore */ }
  });
  await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitBootReady(page);
  await dismissFreePlanNudgeIfPresent(page);
  await dismissChrome(page);
  return { context, page };
}

async function waitLibrary(page) {
  await page.waitForFunction(() => Array.isArray(resources) && resources.length > 20, null, { timeout: 60000 }).catch(() => {});
}

async function openFirstAccessible(page, kind) {
  return page.evaluate(async (resourceKind) => {
    const list = (resources || []).filter((r) => {
      const cat = String(r.category || "").toLowerCase();
      const isLesson = /lesson/.test(cat) || r.days || r.weekPlan;
      const isActivity = /activity/.test(cat) || r._curriculumActivity;
      if (resourceKind === "lesson" && !isLesson) return false;
      if (resourceKind === "activity" && !isActivity) return false;
      if (typeof canAccess === "function" && !canAccess(r)) return false;
      return true;
    });
    // Prefer longest body for polish of long content
    list.sort((a, b) => String(b.body || b.description || "").length - String(a.body || a.description || "").length);
    const pick = list[0];
    if (!pick) return { ok: false, reason: "none" };
    await openResourceViewer(pick.id);
    await new Promise((r) => setTimeout(r, 400));
    return {
      ok: Boolean(document.querySelector("#resourceViewerModal.open")),
      id: pick.id,
      title: pick.title,
      bodyLen: String(pick.body || pick.description || "").length,
    };
  }, kind);
}

async function captureDevice(browser, deviceKey) {
  const vp = DEVICES[deviceKey];
  const { context, page } = await openLive(browser, vp, `polish-${deviceKey}@test.local`);
  await waitLibrary(page);

  const views = [
    ["calendar", "calendar"],
    ["lessons", "lessons"],
    ["activities", "activities"],
    ["children", "children"],
    ["ai", "ai"],
    ["behavior-support", "support-center"],
    ["messages", "messages"],
    ["whats-new", "whats-new"],
    ["settings", "settings"],
  ];

  for (const [nav, active] of views) {
    await page.evaluate((v) => setView(v), nav);
    await page.waitForSelector(`#view-${active}.active-view`, { timeout: 20000 }).catch(() => {});
    await dismissChrome(page);
    await page.waitForTimeout(350);
    await shot(page, `${deviceKey}-${active}`);
  }

  // Sidebar collapse (desktop only)
  if (deviceKey === "desktop") {
    await page.evaluate(() => setView("calendar"));
    await page.waitForSelector("#view-calendar.active-view");
    if (await page.locator("#sidebarToggle").isVisible()) {
      await page.click("#sidebarToggle");
      await page.waitForTimeout(300);
      await shot(page, "desktop-sidebar-collapsed");
      await page.click("#sidebarToggle");
      await page.waitForTimeout(250);
    }
  }

  // Mobile/tablet drawer
  if (deviceKey !== "desktop") {
    await page.evaluate(() => setView("calendar"));
    const toggle = page.locator("#mobileMenuToggle");
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(300);
      await shot(page, `${deviceKey}-drawer-open`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }

  // Long lesson + activity viewers
  await page.evaluate(() => setView("lessons"));
  await page.waitForTimeout(400);
  let lesson = await openFirstAccessible(page, "lesson");
  if (!lesson.ok) {
    // seed long fake
    await page.evaluate(() => {
      const id = "polish-long-lesson";
      const body = Array.from({ length: 40 }, (_, i) => `Week goal ${i + 1}: detailed teaching notes, transitions, materials, and observation prompts for providers.`).join("\n\n");
      const fake = {
        id, title: "Long Polish Lesson Plan", category: "Lesson Plans", age: "Preschool", plan: "Pro",
        locked: false, _curriculumManaged: true, _userLessonCopy: true, body, description: body,
        days: { monday: ["Circle"], tuesday: ["Art"], wednesday: ["Science"], thursday: ["Music"], friday: ["Outdoor"] },
      };
      const idx = resources.findIndex((r) => r.id === id);
      if (idx >= 0) resources[idx] = fake; else resources.push(fake);
    });
    lesson = await openFirstAccessible(page, "lesson");
  }
  console.log("lesson open", lesson);
  await page.waitForTimeout(400);
  await shot(page, `${deviceKey}-lesson-viewer-top`);
  await page.evaluate(() => {
    const scroller = document.querySelector("#resourceViewerModal .modal-body, #resourceViewerModal .resource-viewer-body, #resourceViewerModal .lesson-workspace, #resourceViewerModal");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await page.waitForTimeout(200);
  await shot(page, `${deviceKey}-lesson-viewer-bottom`);
  // print/download chrome
  const printChrome = await page.evaluate(() => {
    const m = document.querySelector("#resourceViewerModal.open");
    const buttons = [...(m?.querySelectorAll("button, a") || [])].map((b) => (b.textContent || b.getAttribute("aria-label") || "").trim()).filter(Boolean);
    return buttons.slice(0, 20);
  });
  console.log("viewer buttons", printChrome);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  await page.evaluate(() => setView("activities"));
  await page.waitForTimeout(300);
  let act = await openFirstAccessible(page, "activity");
  if (!act.ok) {
    await page.evaluate(() => {
      const id = "polish-long-activity";
      const body = Array.from({ length: 50 }, (_, i) => `Step ${i + 1}: prepare materials, guide children, observe, and document learning.`).join("\n\n");
      const fake = {
        id, title: "Long Polish Activity", category: "Activity Center", age: "Preschool", plan: "Pro",
        locked: false, _curriculumManaged: true, _userLessonCopy: true,
        _curriculumActivity: { id, lessonPlanId: "user-copy" }, body, description: body,
      };
      const idx = resources.findIndex((r) => r.id === id);
      if (idx >= 0) resources[idx] = fake; else resources.push(fake);
    });
    act = await openFirstAccessible(page, "activity");
  }
  console.log("activity open", act);
  await shot(page, `${deviceKey}-activity-viewer`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Dialogs
  for (const [name, openFn] of [
    ["feedback", () => page.evaluate(() => openFeedbackModal())],
    ["request-lesson", () => page.evaluate(() => openIdeaRequestModal())],
    ["install", () => page.evaluate(() => openInstallAppModal({ source: "polish" }))],
    ["confirm", () => page.evaluate(() => { Promise.resolve(confirmAction({ title: "Remove this plan?", message: "This cannot be undone for the selected week.", confirmLabel: "Remove", cancelLabel: "Keep" })).catch(() => {}); })],
  ]) {
    try {
      await openFn();
      await page.waitForTimeout(350);
      await shot(page, `${deviceKey}-dialog-${name}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        if (typeof closeFeedbackModal === "function") try { closeFeedbackModal(); } catch {}
        if (typeof closeIdeaRequestModal === "function") try { closeIdeaRequestModal(); } catch {}
        if (typeof closeInstallAppModal === "function") try { closeInstallAppModal(); } catch {}
        if (typeof closeConfirmActionDialog === "function") try { closeConfirmActionDialog(false); } catch {}
        if (typeof syncProviderBodyScrollLock === "function") syncProviderBodyScrollLock();
      });
    } catch (e) {
      console.log("dialog skip", name, e.message);
    }
  }

  // Calendar day dialog if possible
  await page.evaluate(() => setView("calendar"));
  await page.waitForTimeout(500);
  const dayCell = page.locator(".calendar-day, .cal-day, [data-day], .month-grid button, .calendar-grid td button").first();
  if (await dayCell.count()) {
    await dayCell.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `${deviceKey}-calendar-day`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // Billing card in settings
  await page.evaluate(() => setView("settings"));
  await page.waitForTimeout(400);
  const billing = page.locator("text=Billing").first();
  if (await billing.count()) {
    await billing.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `${deviceKey}-billing`);
  }

  // Measure polish metrics
  const metrics = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
      issues.push("horizontal-overflow");
    }
    const hide = document.querySelector("#sidebarToggle");
    if (hide && !hide.hidden) {
      const r = hide.getBoundingClientRect();
      if (r.width > 280) issues.push(`hide-menu-too-wide:${Math.round(r.width)}`);
    }
    const msgNav = [...document.querySelectorAll(".sidebar a, .sidebar button, nav a")].find((el) => /message/i.test(el.textContent || ""));
    if (msgNav) {
      const cs = getComputedStyle(msgNav);
      issues.push(`message-nav-opacity:${cs.opacity};bg:${cs.backgroundColor}`);
    }
    const loading = [...document.querySelectorAll("body *")].filter((el) => /loading your/i.test(el.textContent || "") && el.offsetParent).slice(0, 5).map((el) => (el.textContent || "").trim().slice(0, 80));
    if (loading.length) issues.push(`loading-visible:${loading.join("|")}`);
    return { issues, viewport: { w: innerWidth, h: innerHeight } };
  });
  console.log("METRICS", deviceKey, JSON.stringify(metrics));

  await context.close();
  return metrics;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const all = {};
  try {
    for (const device of ["desktop", "tablet", "phone"]) {
      all[device] = await captureDevice(browser, device);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(all, null, 2));
  console.log("DONE", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
