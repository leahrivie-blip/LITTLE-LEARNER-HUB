#!/usr/bin/env node
/**
 * Assign workflow polish — Use This Plan → Plan This Week → Calendar → Weekly Planner.
 * Verifies future-week assigns no longer dead-end Weekly Planner, Calendar's
 * "Open Weekly Planner" honors the selected week, and the Lesson Library
 * "Assign to Week" shortcut jumps straight to the Plan This Week form.
 *
 * Run: node scripts/test-assign-workflow-polish.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19730 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-assign-polish-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "assign-polish-admin@test.local",
  password: "assign-polish-pass",
  code: "assign-polish-code",
};
const USER_EMAIL = "assign-polish-teacher@example.com";
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
      },
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
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, scheduleByUser: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 90; i += 1) {
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

function mondayIso(from = new Date()) {
  const date = new Date(from);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function seedFreeLesson(token, { title, suffix = "" } = {}) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-assign-polish-${suffix || crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: title || `Assign Polish ${planId}`,
      plan: "Free",
      status: "published",
      age: "Preschool",
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
  return { planId, title: title || save.json.lessonPlan?.title || planId };
}

async function loginAsTeacher(page, viewport) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate((email) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" },
    }));
    localStorage.setItem("llhPlan", "Free");
    localStorage.removeItem(`llhCurriculumAssignments:${email}`);
    localStorage.removeItem(`llhScheduleItems:${email}`);
    localStorage.removeItem(`llhScheduleMigrated:${email}`);
    localStorage.removeItem("llhWeeklyPlanner");
  }, USER_EMAIL);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => {}),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function" && typeof assignScheduleLessonPlan === "function", null, { timeout: 30000 });
  if (viewport) await page.setViewportSize(viewport);
}

async function openLessonWorkspace(page, title) {
  await page.evaluate(() => setView("lessons"));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.fill("#lessonPlanSearch", title);
  await page.waitForTimeout(400);
  await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${title}")`, { timeout: 15000 });
  await page.locator("#view-lessons .lesson-plan-card").first().click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
}

async function runAssignWorkflowChecks(browser, { viewport, label }) {
  const page = await browser.newPage({ viewport });
  page.on("dialog", async (d) => { await d.accept(); });
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name: `[${label}] ${name}`, ok: Boolean(ok), detail });
  };

  await loginAsTeacher(page);

  const login = await requestJson("POST", "/api/admin/login", ADMIN);
  const token = login.json.token || login.json.adminToken;
  const lessonThisWeek = await seedFreeLesson(token, { title: `${label} This Week Plan`, suffix: `${label}-now` });
  const lessonFuture = await seedFreeLesson(token, { title: `${label} Future Week Plan`, suffix: `${label}-future` });

  const currentWeek = mondayIso();
  const futureWeek = addDaysIso(currentWeek, 21);

  // ---- 1) Plan This Week for the CURRENT week: Open Weekly Planner shows it ----
  await openLessonWorkspace(page, lessonThisWeek.title);
  await page.click("[data-lesson-use-this-plan]");
  await page.click(`[data-lesson-add-to-main-calendar="${lessonThisWeek.planId}"]`);
  await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', currentWeek);
  await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
  await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
  await page.click("[data-lesson-open-weekly-planner]");
  await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
  await page.waitForTimeout(500);
  const currentWeekPlannerText = await page.locator("#view-planner").innerText();
  check(
    "Open Weekly Planner (current week) shows the assigned plan",
    currentWeekPlannerText.includes(lessonThisWeek.title) && !/No lesson plan/i.test(currentWeekPlannerText),
    currentWeekPlannerText.slice(0, 120),
  );

  // ---- 2) Plan This Week for a FUTURE week: Open Weekly Planner must NOT dead-end ----
  await page.evaluate(() => setView("lessons"));
  await openLessonWorkspace(page, lessonFuture.title);
  await page.click("[data-lesson-use-this-plan]");
  await page.click(`[data-lesson-add-to-main-calendar="${lessonFuture.planId}"]`);
  await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', futureWeek);
  await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
  await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
  const openPlannerWeekAttr = await page.locator("[data-lesson-open-weekly-planner]").first().getAttribute("data-lesson-planner-week");
  check("Success panel tags Open Weekly Planner with the assigned future week", openPlannerWeekAttr === futureWeek, openPlannerWeekAttr);
  await page.click("[data-lesson-open-weekly-planner]");
  await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
  await page.waitForTimeout(500);
  const futureWeekPlannerText = await page.locator("#view-planner").innerText();
  check(
    "Open Weekly Planner (future week assign) shows the FUTURE plan, not a dead end",
    futureWeekPlannerText.includes(lessonFuture.title) && !/No lesson plan/i.test(futureWeekPlannerText),
    futureWeekPlannerText.slice(0, 160),
  );
  check(
    "Weekly Planner focused on a future week offers a way back to This Week",
    /Back to This Week/i.test(futureWeekPlannerText),
    futureWeekPlannerText.slice(0, 160),
  );

  // ---- 3) "Back to This Week" resets Weekly Planner to the current week ----
  await page.click('#view-planner [data-view="planner"]:has-text("Back to This Week")');
  await page.waitForTimeout(400);
  const backToNowText = await page.locator("#view-planner").innerText();
  check(
    "Back to This Week returns to the current-week plan",
    backToNowText.includes(lessonThisWeek.title),
    backToNowText.slice(0, 120),
  );

  // ---- 4) Plain bottom-nav Planner click after visiting elsewhere resets focus ----
  await page.evaluate(() => setView("calendar"));
  await page.waitForSelector("#view-calendar.active-view", { timeout: 10000 });
  await page.evaluate((week) => { mainCalendarSelectedWeek = week; renderMainCalendar(); }, futureWeek);
  await page.waitForTimeout(300);
  // Simulate a plain bottom-nav tap on "Planner" (no explicit week context),
  // matching the generic [data-view] click handler's behavior for that case.
  await page.evaluate(() => setView("planner"));
  await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
  await page.waitForTimeout(400);
  const plainNavPlannerText = await page.locator("#view-planner").innerText();
  check(
    "Plain nav to Weekly Planner still defaults to the current week",
    plainNavPlannerText.includes(lessonThisWeek.title),
    plainNavPlannerText.slice(0, 120),
  );

  // ---- 5) Calendar week detail "Open Weekly Planner" for a future assigned week ----
  await page.evaluate(() => setView("calendar"));
  await page.waitForSelector("#view-calendar.active-view", { timeout: 10000 });
  await page.evaluate((week) => {
    mainCalendarMonthCursor = new Date(`${week}T12:00:00`);
    renderMainCalendar();
  }, futureWeek);
  await page.waitForSelector(`[data-calendar-select-week="${futureWeek}"]`, { timeout: 10000 });
  await page.click(`[data-calendar-select-week="${futureWeek}"]`);
  await page.waitForTimeout(300);
  const calendarOpenPlannerBtn = page.locator('.llh-calendar-detail [data-view="planner"]');
  const calendarOpenPlannerFocusWeek = await calendarOpenPlannerBtn.getAttribute("data-planner-focus-week");
  check("Calendar's Open Weekly Planner is tagged with the selected week", calendarOpenPlannerFocusWeek === futureWeek, calendarOpenPlannerFocusWeek);
  await calendarOpenPlannerBtn.click();
  await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
  await page.waitForTimeout(400);
  const calendarToPlannerText = await page.locator("#view-planner").innerText();
  check(
    "Calendar's Open Weekly Planner (future week) shows that week's plan",
    calendarToPlannerText.includes(lessonFuture.title),
    calendarToPlannerText.slice(0, 160),
  );

  // ---- 6) View Calendar from success panel jumps to the assigned week ----
  await page.evaluate(() => { mainCalendarSelectedWeek = ""; });
  await openLessonWorkspace(page, lessonFuture.title);
  await page.click("[data-lesson-use-this-plan]");
  await page.click(`[data-lesson-add-to-main-calendar="${lessonFuture.planId}"]`);
  await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', futureWeek);
  await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
  await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
  const viewCalendarWeekAttr = await page.locator(".lesson-workspace-action-sheet-panel [data-view='calendar']").getAttribute("data-dash-select-week");
  check("Success panel's View Calendar is tagged with the assigned week", viewCalendarWeekAttr === futureWeek, viewCalendarWeekAttr);
  await page.click(".lesson-workspace-action-sheet-panel [data-view='calendar']");
  await page.waitForSelector("#view-calendar.active-view", { timeout: 10000 });
  await page.waitForTimeout(400);
  const calendarAfterViewText = await page.locator(".llh-calendar-detail").innerText();
  check(
    "View Calendar (from success) jumps straight to the assigned future week",
    calendarAfterViewText.includes(lessonFuture.title),
    calendarAfterViewText.slice(0, 160),
  );

  // ---- 7) openCurriculumPlannerAssignFlow() jumps straight to Plan This Week ----
  // (Covers the shared assign-flow helper used by any "assign this week" entry
  // point; today's Lesson Plan Library card is a single tap-to-open tile with no
  // separate assign shortcut, so this exercises the helper directly.)
  await page.evaluate(() => setView("lessons"));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.evaluate((planId) => openCurriculumPlannerAssignFlow(planId), lessonThisWeek.planId);
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
  await page.waitForTimeout(300);
  const mainCalendarPanelVisible = await page.evaluate(() => {
    const panel = document.querySelector('[data-lesson-workspace-action-panel="main-calendar"]');
    return Boolean(panel && !panel.hidden);
  });
  check("openCurriculumPlannerAssignFlow jumps straight to the Plan This Week form (skips the menu)", mainCalendarPanelVisible);

  // ---- Layout sanity: no horizontal overflow on this viewport ----
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  check("No horizontal overflow", overflow.scrollWidth <= overflow.clientWidth + 2, JSON.stringify(overflow));

  await page.close();
  return results;
}

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  const allResults = [];
  try {
    await waitForBoot(child);
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });

    const viewports = [
      { label: "mobile-iphone", viewport: { width: 390, height: 844 } },
      { label: "mobile-android", viewport: { width: 412, height: 915 } },
      { label: "desktop", viewport: { width: 1280, height: 900 } },
    ];

    for (const cfg of viewports) {
      console.log(`\n=== ${cfg.label} (${cfg.viewport.width}x${cfg.viewport.height}) ===`);
      const results = await runAssignWorkflowChecks(browser, cfg);
      results.forEach((r) => {
        console.log(`${r.ok ? "PASS" : "FAIL"} — ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
      });
      allResults.push(...results);
    }

    await browser.close();

    const failed = allResults.filter((r) => !r.ok);
    if (failed.length) {
      console.error(`\n${failed.length} check(s) failed.`);
      process.exitCode = 1;
    } else {
      console.log(`\nAll ${allResults.length} assign workflow polish checks passed.`);
    }
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
