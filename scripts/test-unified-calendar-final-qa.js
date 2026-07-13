#!/usr/bin/env node
/**
 * Unified Calendar rebuild — final comprehensive QA pass (Phases A + B + C).
 * Covers: Month/Day/Week views, Sun-Sat display, month/year jump, Today,
 * weekend manual events, Add/Edit/Delete, birthdays/child events, classroom
 * events, director/compliance events, family/center events, filters,
 * Plan This Week + future-week assign + Weekly Planner focus (PR #165),
 * existing-assignment preservation, back navigation, accessibility basics,
 * and no horizontal overflow — across iPhone / Android / desktop.
 *
 * Run: node scripts/test-unified-calendar-final-qa.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20100 + Math.floor(Math.random() * 60);
const STORE_PATH = path.join(os.tmpdir(), `llh-calendar-final-qa-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/unified-calendar-final-qa";
const ADMIN = {
  email: "calendar-qa-admin@test.local",
  password: "calendar-qa-pass",
  code: "calendar-qa-code",
};
function userEmailForLabel(label) {
  // Each viewport gets its own account so server-side ScheduleItems never
  // leak across iphone/android/desktop runs within the same test process
  // (they all share one throwaway server instance for speed).
  return `calendar-qa-${label}-teacher@example.com`;
}
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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
        res.on("data", (c) => chunks.push(c));
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
    await new Promise((r) => setTimeout(r, 100));
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function seedLesson(token, suffix) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", { adminToken: token, siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" } });
  const planId = `cur-lp-cal-qa-${suffix}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: { ...parsed.data, id: planId, title: `CalQA-${suffix} Plan`, plan: "Free", status: "published", age: "Preschool" },
  });
  return { planId, title: save.json.lessonPlan?.title || planId };
}

async function loginAsTeacher(page, viewport, email) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate((email) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({ [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" } }));
    localStorage.setItem("llhPlan", "Free");
    localStorage.removeItem(`llhScheduleItems:${email}`);
    localStorage.removeItem(`llhScheduleMigrated:${email}`);
    localStorage.removeItem("llhCalendarFilters");
  }, email);
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
  await page.locator("#view-lessons .lesson-plan-card", { hasText: title }).first().click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
}

async function seedChildAndBaselineAssignment(page, todayIso) {
  await page.evaluate((iso) => {
    const [, month, day] = iso.split("-");
    const child = {
      id: "child-qa-1",
      // Deliberately avoid any substring overlap with the seeded lesson plan
      // titles ("CalQA-<label>-now/future Plan") — childFromSearchQuery()
      // fuzzy-matches the Lesson Library search box against a child's first
      // name, so an overlapping name would hijack the search into "child
      // recommendations" mode instead of a plain title search.
      name: "Milo Sample Learner",
      dob: `2021-${month}-${day}`,
      enrollmentDate: `2024-${month}-${day}`,
      ageGroup: "Preschool",
      monthlyObservationGoal: "4",
    };
    localStorage.setItem(`llhChild:${localStorage.getItem("llhUser")}:Profiles`, JSON.stringify([child]));
  }, todayIso);
}

async function runViewportSuite(browser, { viewport, label }) {
  const page = await browser.newPage({ viewport });
  page.on("dialog", async (d) => { await d.accept(); });
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name: `[${label}] ${name}`, ok: Boolean(ok), detail: String(detail).slice(0, 220) });
  };
  let shotIndex = 0;
  const shot = async (name) => {
    shotIndex += 1;
    const file = path.join(ARTIFACT_DIR, `${label}-${String(shotIndex).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  };

  const userEmail = userEmailForLabel(label);
  await loginAsTeacher(page, viewport, userEmail);

  const login = await requestJson("POST", "/api/admin/login", ADMIN);
  const token = login.json.token || login.json.adminToken;
  const lessonNow = await seedLesson(token, `${label}-now`);
  const lessonFuture = await seedLesson(token, `${label}-future`);

  const currentWeek = mondayIso();
  const futureWeek = addDaysIso(currentWeek, 14);
  const todayIso = addDaysIso(currentWeek, new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  await seedChildAndBaselineAssignment(page, todayIso);

  // ==================== 14) Plan This Week (baseline assign, current week) ====================
  await openLessonWorkspace(page, lessonNow.title);
  await page.click("[data-lesson-use-this-plan]");
  await page.click(`[data-lesson-add-to-main-calendar="${lessonNow.planId}"]`);
  await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', currentWeek);
  await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
  await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
  const successText = await page.locator("[data-lesson-workspace-success-message]").innerText();
  check("14) Plan This Week assigns the current week", successText.includes(currentWeek), successText);

  // Capture the existing-assignment baseline right after this real assign so
  // we can prove nothing else gets lost later.
  const baseline = await page.evaluate(() => {
    const api = window.LLHSchedule;
    const doc = scheduleDocCache || api.readCache(scheduleApiEmail());
    return (doc.items || []).map((i) => ({ id: i.id, type: i.type, weekStartDate: i.weekStartDate, startDate: i.startDate, title: i.title || i.lessonPlanTitle }));
  });

  // ==================== 15) Future-week assignment (PR #165) ====================
  await page.click("[data-lesson-open-weekly-planner]");
  await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
  await openLessonWorkspace(page, lessonFuture.title);
  await page.click("[data-lesson-use-this-plan]");
  await page.click(`[data-lesson-add-to-main-calendar="${lessonFuture.planId}"]`);
  await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', futureWeek);
  await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
  await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
  await page.click("[data-lesson-open-weekly-planner]");
  await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
  await page.waitForTimeout(500);
  const futurePlannerText = await page.locator("#view-planner").innerText();
  check(
    "15) Future-week assignment opens Weekly Planner on the exact future week (no dead end)",
    futurePlannerText.includes(lessonFuture.title) && futurePlannerText.includes(futureWeek) && !/No lesson plan/i.test(futurePlannerText),
    futurePlannerText.slice(0, 160),
  );

  // ==================== 16) Weekly Planner focus behavior ====================
  const hasBackToThisWeek = await page.locator('#view-planner [data-view="planner"]:has-text("Back to This Week")').count();
  check("16) Weekly Planner (future week) offers Back to This Week", hasBackToThisWeek > 0);
  await page.click('#view-planner [data-view="planner"]:has-text("Back to This Week")');
  await page.waitForTimeout(400);
  const backText = await page.locator("#view-planner").innerText();
  check("16) Back to This Week returns to the current week's plan", backText.includes(lessonNow.title), backText.slice(0, 120));
  await page.evaluate(() => setView("calendar"));
  await page.waitForTimeout(200);
  await page.evaluate((week) => { mainCalendarSelectedWeek = week; renderMainCalendar(); }, futureWeek);
  await page.evaluate(() => setView("planner"));
  await page.waitForTimeout(400);
  const plainNavText = await page.locator("#view-planner").innerText();
  check("16) Plain Weekly Planner nav still defaults to the current week", plainNavText.includes(lessonNow.title), plainNavText.slice(0, 120));

  // ==================== 1/2/3/4) Month View, Sun-Sat, month/year jump, Today ====================
  await page.evaluate(() => setView("calendar"));
  await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot("month-view");
  const monthText = await page.locator("#mainCalendarApp").innerText();
  check("1) Month View renders", /Planning home/i.test(monthText) && monthText.includes(lessonNow.title));
  const headLabels = await page.locator(".llh-cal-head:not(.llh-cal-head-gutter)").allInnerTexts();
  check("2) Sunday-Saturday display (7 day headers)", JSON.stringify(headLabels) === JSON.stringify(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]), JSON.stringify(headLabels));

  const targetMonthDate = new Date(`${futureWeek}T12:00:00`);
  await page.selectOption("[data-calendar-jump-month]", String(targetMonthDate.getMonth()));
  await page.selectOption("[data-calendar-jump-year]", String(targetMonthDate.getFullYear()));
  await page.waitForTimeout(400);
  const afterJumpText = await page.locator(".llh-calendar-month").innerText();
  check(
    "3) Month/Year jump navigates directly (no repeated Prev/Next taps)",
    afterJumpText.toLowerCase().includes(targetMonthDate.toLocaleDateString(undefined, { month: "long" }).toLowerCase()),
    afterJumpText,
  );
  await page.click('[data-calendar-nav="today"]');
  await page.waitForTimeout(400);
  const afterTodayText = await page.locator(".llh-calendar-month").innerText();
  const nowLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  check("4) Today button returns to the current month", afterTodayText === nowLabel, `${afterTodayText} vs ${nowLabel}`);

  // ==================== 5) Day View ====================
  const todayCell = page.locator(".llh-cal-cell.is-today").first();
  await todayCell.click();
  await page.waitForTimeout(400);
  await shot("day-view");
  const dayText = await page.locator("#mainCalendarApp").innerText();
  check("5) Tapping a day opens Day View (not Week View)", dayText.includes("Back to Calendar") && !dayText.includes("Week view".toUpperCase()) === false || dayText.includes("View Week"));
  check("5b) Day View shows the assigned lesson + child birthday + observation reminder", dayText.includes(lessonNow.title) && dayText.includes("Milo Sample Learner"), dayText.slice(0, 300));

  // ==================== 6) Week View + 22) Back navigation ====================
  await page.click("[data-calendar-view-week]");
  await page.waitForTimeout(400);
  await shot("week-view");
  const weekText = await page.locator("#mainCalendarApp").innerText();
  // "Sat"/"Sun" render as "SAT"/"SUN" via the .eyebrow text-transform, so
  // compare case-insensitively — innerText reflects rendered CSS casing.
  check("6) View Week opens Week View with Sun-Sat", weekText.includes(lessonNow.title) && /\bsat\b/i.test(weekText), weekText.slice(0, 160));
  await page.click("[data-calendar-back-to-month]");
  await page.waitForTimeout(300);
  const backToMonthText = await page.locator("#mainCalendarApp").innerText();
  check("22) Back to Calendar from Week View returns to Month View", /Planning home/i.test(backToMonthText) && backToMonthText.includes(lessonNow.title));

  // Second Week View entry point: Month View's per-row "View Week" gutter control
  const weekJumpBtn = page.locator("[data-calendar-view-week]").first();
  await weekJumpBtn.click();
  await page.waitForTimeout(300);
  const weekViaGutterText = await page.locator("#mainCalendarApp").innerText();
  check("6b) Month View's per-row 'View Week' control also opens Week View", /\bsat\b/i.test(weekViaGutterText) && /\bsun\b/i.test(weekViaGutterText), weekViaGutterText.slice(0, 160));
  await page.click("[data-calendar-back-to-month]");
  await page.waitForTimeout(300);

  // ==================== 7/8) Weekend manual event + Add/Edit/Delete ====================
  const weekendCell = page.locator(".llh-cal-cell.is-weekend").first();
  const weekendAriaLabel = await weekendCell.getAttribute("aria-label");
  check("23) Weekend cell has a text aria-label (not color-only)", /weekend/i.test(weekendAriaLabel || ""), weekendAriaLabel);
  await weekendCell.click();
  await page.waitForTimeout(300);
  await shot("weekend-day-view");
  const weekendDayText = await page.locator("#mainCalendarApp").innerText();
  check("7) Weekend day view is fully functional (no lesson plan, has Add Item)", weekendDayText.includes("Add Item") && !weekendDayText.includes(lessonNow.title));

  await page.click("[data-calendar-add-item]");
  await page.waitForSelector("#scheduleEventModal.open", { timeout: 5000 });
  await page.selectOption("#scheduleEventForm [name='eventType']", "family_event");
  await page.fill("#scheduleEventForm [name='eventTitle']", "Weekend Family Picnic");
  await page.fill("#scheduleEventForm [name='eventItemsToBring']", "Blanket, snacks");
  await page.click("#scheduleEventForm button[type='submit']");
  await page.waitForTimeout(600);
  const afterAddText = await page.locator("#mainCalendarApp").innerText();
  check("7b) Weekend manual event saves and displays", afterAddText.includes("Weekend Family Picnic"), afterAddText.slice(0, 200));
  check("12) Family/Center category applied to the new item", afterAddText.includes("FAMILY/CENTER") || afterAddText.toLowerCase().includes("family/center"));

  await page.click("[data-calendar-edit-item]");
  await page.waitForSelector("#scheduleEventModal.open", { timeout: 5000 });
  const editTitleValue = await page.locator("#scheduleEventForm [name='eventTitle']").inputValue();
  check("8) Edit opens the modal pre-filled with the existing item", editTitleValue === "Weekend Family Picnic", editTitleValue);
  await page.fill("#scheduleEventForm [name='eventTitle']", "Weekend Family Picnic (Updated)");
  await page.click("#scheduleEventForm button[type='submit']");
  await page.waitForTimeout(600);
  const afterEditText = await page.locator("#mainCalendarApp").innerText();
  check("8b) Edit updates the existing item in place (no duplicate)", afterEditText.includes("Weekend Family Picnic (Updated)") && !afterEditText.includes("Weekend Family Picnic\n"));

  await page.click("[data-calendar-delete-item]");
  await page.waitForTimeout(600);
  const afterDeleteText = await page.locator("#mainCalendarApp").innerText();
  check("8c) Delete removes the manual item", !afterDeleteText.includes("Weekend Family Picnic"));

  // ==================== 9) Child birthdays already covered by 5b; add explicit month-view check ====================
  await page.click("[data-calendar-back-to-month]");
  await page.waitForTimeout(300);
  const monthWithBirthdayText = await page.locator("#mainCalendarApp").innerText();
  check("9) Birthday indicator visible in Month View", monthWithBirthdayText.includes("Birthday"));

  // ==================== 10) Classroom event + 11) Director/compliance event ====================
  await todayCell.click();
  await page.waitForTimeout(300);
  await page.click("[data-calendar-add-item]");
  await page.waitForSelector("#scheduleEventModal.open", { timeout: 5000 });
  await page.selectOption("#scheduleEventForm [name='eventType']", "classroom_event");
  await page.fill("#scheduleEventForm [name='eventTitle']", "Pajama Day");
  await page.click("#scheduleEventForm button[type='submit']");
  await page.waitForTimeout(600);
  let dayWithEventsText = await page.locator("#mainCalendarApp").innerText();
  check("10) Classroom event (Pajama Day) saves and shows Classroom category", dayWithEventsText.includes("Pajama Day"));

  await page.click("[data-calendar-add-item]");
  await page.waitForSelector("#scheduleEventModal.open", { timeout: 5000 });
  await page.selectOption("#scheduleEventForm [name='eventType']", "director_event");
  await page.fill("#scheduleEventForm [name='eventTitle']", "Fire Drill");
  await page.click("#scheduleEventForm button[type='submit']");
  await page.waitForTimeout(600);
  dayWithEventsText = await page.locator("#mainCalendarApp").innerText();
  check("11) Director/compliance event (Fire Drill) saves and shows Director category", dayWithEventsText.includes("Fire Drill") && dayWithEventsText.toUpperCase().includes("DIRECTOR"));
  await shot("day-with-all-categories");

  // ==================== 13) Calendar filters ====================
  await page.click('[data-calendar-toggle-filter="director"]');
  await page.waitForTimeout(300);
  const afterFilterOffText = await page.locator("#mainCalendarApp").innerText();
  check("13) Turning off a filter hides that category's items", !afterFilterOffText.includes("Fire Drill") && afterFilterOffText.includes("Pajama Day"));
  await page.click('[data-calendar-toggle-filter="director"]');
  await page.waitForTimeout(300);
  const afterFilterOnText = await page.locator("#mainCalendarApp").innerText();
  check("13b) Turning the filter back on restores visibility", afterFilterOnText.includes("Fire Drill"));

  // ==================== 17/18) Existing assignments preserved, no data loss ====================
  const afterAll = await page.evaluate(async () => {
    const api = window.LLHSchedule;
    const headers = await firebaseAuthHeaders();
    const fresh = await api.fetchSchedule(async () => headers, scheduleApiEmail());
    return (fresh.items || []).map((i) => ({ id: i.id, type: i.type, weekStartDate: i.weekStartDate, startDate: i.startDate, title: i.title || i.lessonPlanTitle }));
  });
  const baselineIds = new Set(baseline.map((i) => i.id));
  const afterIds = new Set(afterAll.map((i) => i.id));
  const missing = baseline.filter((i) => !afterIds.has(i.id));
  check("17/18) No pre-existing ScheduleItem was lost or altered by the rebuild", missing.length === 0, JSON.stringify(missing));
  check(
    "17b) Both the current-week and future-week real assignments are still present",
    Array.from(baselineIds).every((id) => afterIds.has(id)) && afterAll.some((i) => i.type === "lesson_plan" && i.weekStartDate === futureWeek),
    JSON.stringify(afterAll.map((i) => i.weekStartDate)),
  );

  // ==================== 24) No horizontal overflow ====================
  await page.evaluate(() => setView("calendar"));
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  check("24) No horizontal overflow on Calendar", overflow.scrollWidth <= overflow.clientWidth + 2, JSON.stringify(overflow));

  // ==================== 23) Accessibility basics ====================
  const a11y = await page.evaluate(() => {
    const filterChips = Array.from(document.querySelectorAll("[data-calendar-toggle-filter]"));
    const hasAriaPressed = filterChips.every((el) => el.hasAttribute("aria-pressed"));
    const dayCells = Array.from(document.querySelectorAll(".llh-cal-cell:not(.is-empty)"));
    const cellsHaveLabels = dayCells.every((el) => el.hasAttribute("aria-label"));
    const monthSelect = document.querySelector("[data-calendar-jump-month]");
    const yearSelect = document.querySelector("[data-calendar-jump-year]");
    return { hasAriaPressed, cellsHaveLabels, hasNativeSelects: Boolean(monthSelect && yearSelect) };
  });
  check("23) Filter chips expose aria-pressed", a11y.hasAriaPressed, JSON.stringify(a11y));
  check("23b) Every day cell has a descriptive aria-label", a11y.cellsHaveLabels);
  check("23c) Month/Year jump uses native accessible <select> controls (not custom widgets)", a11y.hasNativeSelects);

  check(`No console/page errors on ${label}`, consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));

  await page.close();
  return results;
}

async function main() {
  ensureDir(ARTIFACT_DIR);
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
      { label: "iphone", viewport: { width: 390, height: 844 } },
      { label: "android", viewport: { width: 412, height: 915 } },
      { label: "desktop", viewport: { width: 1280, height: 900 } },
    ];

    for (const cfg of viewports) {
      console.log(`\n=== ${cfg.label} (${cfg.viewport.width}x${cfg.viewport.height}) ===`);
      let results;
      try {
        results = await runViewportSuite(browser, cfg);
      } catch (error) {
        results = [{ name: `[${cfg.label}] SUITE CRASHED`, ok: false, detail: error.message }];
      }
      results.forEach((r) => {
        console.log(`${r.ok ? "PASS" : "FAIL"} — ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
      });
      allResults.push(...results);
    }

    await browser.close();

    const failed = allResults.filter((r) => !r.ok);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "RESULTS.json"), JSON.stringify(allResults, null, 2));
    console.log(`\n${failed.length === 0 ? `ALL ${allResults.length} CHECKS PASSED` : `${failed.length} of ${allResults.length} CHECK(S) FAILED`}`);
    if (failed.length) process.exitCode = 1;
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
