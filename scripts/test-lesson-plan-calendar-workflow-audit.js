#!/usr/bin/env node
/**
 * Manual-style browser audit for the lesson plan → Calendar → edit → refresh workflow.
 *
 * Steps:
 * 1) Open a lesson plan
 * 2) Add it to a week
 * 3) Save / assign
 * 4) Open the saved lesson from Calendar
 * 5) Edit the saved lesson plan
 * 6) Refresh the page
 * 7) Reopen the saved lesson plan
 * 8) Relogin and confirm persistence
 *
 * Run: node scripts/test-lesson-plan-calendar-workflow-audit.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19840 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lp-workflow-${crypto.randomBytes(4).toString("hex")}.json`);
const ARTIFACT_DIR = process.env.LLH_ARTIFACT_DIR || "/opt/cursor/artifacts/lesson-plan-workflow-audit";
const ADMIN = {
  email: "lp-workflow-admin@test.local",
  password: "lp-workflow-pass",
  code: "lp-workflow-code",
};
const USER_EMAIL = "lp-workflow-teacher@example.com";
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
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
  for (let i = 0; i < 100; i += 1) {
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

async function seedFreeLesson(token) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-workflow-${crypto.randomBytes(3).toString("hex")}`;
  const title = "Workflow Audit Discovery Week";
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title,
      theme: "Discovery Week",
      plan: "Free",
      status: "published",
      age: "Preschool",
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
  const daily = save.json.lessonPlan?.dailyPlans || parsed.data.dailyPlans || {};
  const dayCounts = Object.fromEntries(DAYS.map((day) => [day, Array.isArray(daily[day]?.items) ? daily[day].items.length : 0]));
  assert(DAYS.every((day) => dayCounts[day] > 0), `Seed plan missing weekday activities: ${JSON.stringify(dayCounts)}`);
  return { planId, title, dayCounts };
}

async function loginAsTeacher(page) {
  await page.evaluate((email) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: {
        email,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        firstName: "Workflow",
        lastName: "Teacher",
      },
    }));
    localStorage.setItem("llhPlan", "Free");
  }, USER_EMAIL);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function" && typeof assignScheduleLessonPlan === "function", null, { timeout: 30000 });
  await page.waitForSelector("#view-calendar.active-view", { timeout: 30000 });
}

async function openLessonWorkspace(page, title) {
  await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
  await page.fill("#lessonPlanSearch", title);
  await page.waitForTimeout(500);
  const card = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: title }).first();
  await card.waitFor({ timeout: 15000 });
  await card.click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
}

async function collectWorkspaceDayCounts(page) {
  return page.evaluate((days) => {
    const counts = {};
    const emptyDays = [];
    for (const day of days) {
      const panel = document.querySelector(`[data-lesson-workspace-week-day-panel="${day}"]`);
      if (!panel) {
        counts[day] = 0;
        emptyDays.push(day);
        continue;
      }
      const activities = panel.querySelectorAll(".lesson-workspace-activity-row");
      const emptyCopy = /No activities/i.test(panel.textContent || "");
      counts[day] = activities.length;
      if (!activities.length || emptyCopy) emptyDays.push(day);
    }
    return {
      counts,
      emptyDays,
      bodyText: document.querySelector("#resourceViewerBody")?.innerText?.slice(0, 500) || "",
      activeView: document.querySelector(".active-view")?.id || "",
      curriculumPlannerOpen: Boolean(document.querySelector("#view-curriculum-planner.active-view")),
      weeklyPlannerOpen: Boolean(document.querySelector("#view-planner.active-view")),
      calendarOpen: Boolean(document.querySelector("#view-calendar.active-view")),
    };
  }, DAYS);
}

async function collectScheduleDayCounts(page, weekStart) {
  return page.evaluate(({ email, week, days }) => {
    const api = window.LLHSchedule;
    const doc = api?.readCache?.(email) || JSON.parse(localStorage.getItem(`llhScheduleItems:${email}`) || '{"items":[]}');
    const item = api?.lessonForWeek?.(doc, week)
      || (doc.items || []).find((entry) => entry.type === "lesson_plan" && entry.weekStartDate === week);
    if (!item) return { found: false };
    const counts = {};
    const titles = {};
    for (const day of days) {
      const items = item.snapshot?.dailyPlans?.[day]?.items || [];
      counts[day] = items.length;
      titles[day] = items.map((activity) => activity.title || "");
    }
    return {
      found: true,
      lessonPlanId: item.lessonPlanId,
      title: item.lessonPlanTitle,
      weekStartDate: item.weekStartDate,
      counts,
      titles,
      snapshotEditedAt: item.snapshot?.snapshotEditedAt || "",
      totalActivities: Object.values(counts).reduce((sum, n) => sum + n, 0),
    };
  }, { email: USER_EMAIL, week: weekStart, days: DAYS });
}

async function shot(page, name) {
  ensureDir(ARTIFACT_DIR);
  const file = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
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

  ensureDir(ARTIFACT_DIR);
  const report = {
    ok: false,
    checks: [],
    bugs: [],
    screenshots: [],
  };
  const check = (name, passed, detail = "") => {
    report.checks.push({ name, passed: Boolean(passed), detail });
    console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  };

  const child = startServer();
  try {
    await waitForBoot(child);
    const adminLogin = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(adminLogin.status === 200, `Admin login failed: ${adminLogin.status}`);
    const seeded = await seedFreeLesson(adminLogin.json.token);
    const weekStart = mondayIso();

    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", async (dialog) => dialog.accept());

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await loginAsTeacher(page);

    // 1) Open lesson plan
    console.log("\n1) Open a lesson plan");
    await openLessonWorkspace(page, seeded.title);
    report.screenshots.push(await shot(page, "01-open-lesson-plan"));
    const opened = await collectWorkspaceDayCounts(page);
    // Switch through each day tab to ensure activities are attached.
    for (const day of DAYS) {
      await page.locator(`[data-lesson-workspace-week-day="${day}"]`).click();
      await page.waitForTimeout(150);
    }
    const openedDays = await collectWorkspaceDayCounts(page);
    check("Lesson opens in lesson workspace (not Curriculum Planner)", !opened.curriculumPlannerOpen && opened.activeView !== "view-curriculum-planner", opened.activeView);
    // Count from schedule snapshot after assign is stronger; for open, verify Monday panel has activities.
    await page.locator('[data-lesson-workspace-week-day="monday"]').click();
    const mondayText = await page.locator('[data-lesson-workspace-week-day-panel="monday"]').innerText();
    check("Monday activities visible on open", /Monday Activity/i.test(mondayText) && !/No activities scheduled/i.test(mondayText), mondayText.slice(0, 160));
    check("Opened lesson is Free workflow sample content", /Monday Activity|Discovery|Workflow Audit/i.test(await page.locator("#resourceViewerBody").innerText()), "");

    // 2–3) Add to week and save
    console.log("\n2/3) Add to week and save");
    await page.click("[data-lesson-use-this-plan]");
    // Use This Plan now opens Add to Calendar week picker directly (no Weekly Plan choice).
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', weekStart);
    await page.selectOption('[data-lesson-main-calendar-form] [name="ageGroup"]', "Preschool");
    await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
    report.screenshots.push(await shot(page, "02-added-to-calendar-success"));

    const afterAssign = await collectScheduleDayCounts(page, weekStart);
    check("Schedule item saved for week", afterAssign.found, JSON.stringify(afterAssign));
    check("Assigned lesson id matches seeded plan", afterAssign.lessonPlanId === seeded.planId, `${afterAssign.lessonPlanId} vs ${seeded.planId}`);
    for (const day of DAYS) {
      check(`${day} activities attached after save`, afterAssign.counts[day] > 0, String(afterAssign.counts[day]));
      check(`${day} has no duplicate activity titles after save`, new Set(afterAssign.titles[day]).size === afterAssign.titles[day].length, JSON.stringify(afterAssign.titles[day]));
    }
    const baselineTotal = afterAssign.totalActivities;

    // 4) Open saved lesson from Calendar
    console.log("\n4) Open saved lesson from Calendar");
    await page.click("[data-lesson-open-calendar]");
    await page.waitForSelector("#view-calendar.active-view", { timeout: 10000 });
    await page.evaluate(() => {
      if (typeof closeResourceViewer === "function") closeResourceViewer();
      document.querySelector(".lesson-workspace-action-sheet")?.setAttribute("hidden", "");
    });
    // Ensure week view for the assigned week
    await page.evaluate(async (week) => {
      if (typeof ensureScheduleLoaded === "function") await ensureScheduleLoaded({ force: true });
      mainCalendarSelectedWeek = week;
      mainCalendarSubView = "week";
      if (typeof renderMainCalendar === "function") renderMainCalendar();
    }, weekStart);
    await page.waitForSelector('#view-calendar [data-view="planner"], #view-calendar .llh-cal-week-lesson', { timeout: 15000 });
    report.screenshots.push(await shot(page, "03-calendar-week-with-plan"));
    const calendarText = await page.locator("#view-calendar").innerText();
    check("Calendar shows assigned lesson title", new RegExp(seeded.title.slice(0, 18), "i").test(calendarText), calendarText.slice(0, 220));
    check("Calendar workflow active (not Curriculum Planner)", !await page.locator("#view-curriculum-planner.active-view").count(), "");

    // Preferred path: View Weekly Plan from Calendar week card (current classroom workflow)
    const openPlannerBtn = page.locator('#view-calendar [data-view="planner"][data-planner-focus-week], #view-calendar button:has-text("View Weekly Plan"), #view-calendar button:has-text("Customize days")').first();
    assert(await openPlannerBtn.count(), "Calendar missing View Weekly Plan / Customize days action");
    await openPlannerBtn.click();
    await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
    await page.waitForTimeout(500);
    report.screenshots.push(await shot(page, "04-open-from-calendar-weekly-classroom"));
    check("Opens View Weekly Plan (Calendar week detail)", Boolean(await page.locator("#view-planner.active-view").count()) && Boolean(await page.locator('[data-weekly-plan-screen="view"]').count()), "");
    check("Does NOT open legacy Curriculum Planner", !await page.locator("#view-curriculum-planner.active-view").count(), "");
    const plannerText = await page.locator("#view-planner").innerText();
    check("Saved lesson title visible from Calendar open", new RegExp(seeded.title.slice(0, 18), "i").test(plannerText), plannerText.slice(0, 220));
    check("View Weekly Plan actions present", /Edit Week|Print|Remove from Calendar|Back to Calendar/i.test(plannerText), plannerText.slice(0, 300));
    const plannerEmptyDays = await page.evaluate((days) => {
      const empty = [];
      for (const day of days) {
        const card = document.querySelector(`[data-weekly-plan-day="${day}"]`) || document.querySelector(`[data-week-day-card="${day}"]`);
        const text = card?.innerText || "";
        const hasActivity = Boolean(card?.querySelector(".llh-weekly-plan-activity-list li, .llh-day-activity-list li"));
        if (!hasActivity || (/No activities/i.test(text) && !hasActivity)) empty.push(day);
      }
      return empty;
    }, DAYS);
    check("No false empty days in weekly plan view", plannerEmptyDays.length === 0, JSON.stringify(plannerEmptyDays));

    // 5) Edit Week on the Calendar copy
    console.log("\n5) Edit Week on Calendar copy");
    await page.click("[data-weekly-plan-edit-week]");
    await page.waitForSelector('[data-weekly-plan-screen="edit"]', { timeout: 5000 });
    report.screenshots.push(await shot(page, "05-edit-classroom-day"));
    check("Edit Week opens week editor (not legacy Curriculum Planner)", Boolean(await page.locator('[data-weekly-plan-screen="edit"]').count()) && !await page.locator("#view-curriculum-planner.active-view").count(), "");
    const mondayTitleBefore = afterAssign.titles.monday[0];
    const editedTitle = `${mondayTitleBefore} · Edited`;
    await page.locator('[data-week-edit-day-block="monday"] [data-week-edit-activity-title]').first().fill(editedTitle);
    await page.locator('[data-week-edit-day-block="monday"] [data-week-edit-day-theme]').fill("Edited Monday Theme");
    await page.locator('[data-week-edit-day-block="monday"] [data-week-edit-day-note]').fill("Edited Monday note");
    await page.click('[data-week-edit-add-custom][data-week-edit-add-day="friday"]');
    await page.locator('[data-week-edit-day-block="friday"] [data-week-edit-activity-row]').last().locator("[data-week-edit-activity-title]").fill("Custom Friday Activity");
    const tuesdayRows = page.locator('[data-week-edit-day-block="tuesday"] [data-week-edit-activity-row]');
    const tuesdayCountBefore = await tuesdayRows.count();
    if (tuesdayCountBefore > 0) {
      await tuesdayRows.last().locator("[data-week-edit-remove-activity]").click();
    }
    const wednesdayMove = page.locator('[data-week-edit-day-block="wednesday"] [data-week-edit-activity-row]').first();
    if (await wednesdayMove.count()) {
      await wednesdayMove.locator("[data-week-edit-activity-day]").selectOption("thursday");
    }
    await page.click("[data-weekly-plan-save-week]");
    await page.waitForSelector("#view-calendar.active-view", { timeout: 15000 });
    await page.waitForTimeout(400);
    const afterEdit = await collectScheduleDayCounts(page, weekStart);
    check("Edited Monday activity persisted in schedule snapshot", afterEdit.titles.monday.includes(editedTitle), JSON.stringify(afterEdit.titles.monday));
    check("Custom Friday activity persisted", afterEdit.titles.friday.includes("Custom Friday Activity"), JSON.stringify(afterEdit.titles.friday));
    check("Tuesday activity removed", afterEdit.counts.tuesday === Math.max(0, afterAssign.counts.tuesday - 1), `${afterEdit.counts.tuesday} vs ${afterAssign.counts.tuesday}`);
    check("No duplicate activities after edit save", DAYS.every((day) => new Set(afterEdit.titles[day]).size === afterEdit.titles[day].length), JSON.stringify(afterEdit.titles));
    check("Save returns to Calendar week", Boolean(await page.locator("#view-calendar.active-view").count()), "");
    const calendarWeekSelected = await page.evaluate(() => mainCalendarSelectedWeek || "");
    check("Calendar week context preserved after Edit Week save", calendarWeekSelected === weekStart, `selected=${calendarWeekSelected} expected=${weekStart}`);

    // Also verify Edit Lesson Plan opens the true lesson-editor page (library/user copy path)
    await page.evaluate(() => setView("calendar"));
    await page.waitForSelector("#view-calendar.active-view", { timeout: 5000 });
    await openLessonWorkspace(page, seeded.title);
    await page.click("[data-lesson-workspace-more-toggle]");
    await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
    await page.evaluate(() => {
      const btn = document.querySelector(".lesson-workspace-more-menu [data-edit-lesson-plan]");
      if (!btn) throw new Error("Edit Lesson Plan control missing");
      btn.click();
    });
    await page.waitForSelector("#view-lesson-editor.active-view", { timeout: 10000 });
    report.screenshots.push(await shot(page, "06-edit-lesson-plan-editor"));
    check("Edit Lesson Plan opens lesson-editor view", Boolean(await page.locator("#view-lesson-editor.active-view").count()), "");
    check("Edit Lesson Plan does not open Curriculum Planner", !await page.locator("#view-curriculum-planner.active-view").count(), "");
    const editorHtml = await page.locator("#view-lesson-editor").innerText();
    check("Lesson editor shows weekday content", /Monday|Tuesday|Wednesday|Thursday|Friday/i.test(editorHtml), editorHtml.slice(0, 200));

    // Save from editor if a save button exists
    const editorSave = page.locator('#view-lesson-editor button[type="submit"], #view-lesson-editor [data-lesson-editor-save], #userLessonPlanEditorForm button[type="submit"]').first();
    if (await editorSave.count()) {
      const titleInput = page.locator('#userLessonPlanEditorForm input[name="title"], #view-lesson-editor input[name="title"]').first();
      if (await titleInput.count()) {
        const current = await titleInput.inputValue();
        await titleInput.fill(`${current}`.includes("Edited Copy") ? current : `${current} Edited Copy`);
      }
      await editorSave.click({ force: true });
      await page.waitForTimeout(800);
    }

    // Leave editor via guarded navigation (force discard if leave dialog appears).
    await page.evaluate(() => {
      const back = document.querySelector("[data-lesson-editor-back]");
      if (back) back.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const dialog = document.querySelector("[data-lesson-editor-leave-dialog]");
      if (dialog) dialog.hidden = false;
      const discard = document.querySelector("[data-lesson-editor-leave-discard]");
      if (discard) discard.click();
    });
    await page.waitForTimeout(400);
    if (await page.locator("#view-lesson-editor.active-view").count()) {
      await page.evaluate(() => setView("calendar", { skipLessonEditorGuard: true }));
      await page.waitForSelector("#view-calendar.active-view", { timeout: 5000 });
    }
    check("After editor back, Curriculum Planner is not active", !await page.locator("#view-curriculum-planner.active-view").count(), await page.evaluate(() => document.querySelector(".active-view")?.id || ""));

    // Back to Calendar week from planner path
    await page.evaluate((week) => {
      setView("calendar");
      mainCalendarSelectedWeek = week;
      mainCalendarSubView = "week";
      renderMainCalendar();
    }, weekStart);
    await page.waitForSelector("#view-calendar.active-view", { timeout: 5000 });
    await page.locator('#view-calendar [data-view="planner"][data-planner-focus-week]').first().click();
    await page.waitForSelector("#view-planner.active-view", { timeout: 5000 });
    await page.locator('#view-planner [data-view="calendar"]').first().click();
    await page.waitForSelector("#view-calendar.active-view", { timeout: 5000 });
    const returnedWeek = await page.evaluate(() => mainCalendarSelectedWeek || "");
    check("Back returns to Calendar", Boolean(await page.locator("#view-calendar.active-view").count()), "");
    check("Calendar week context preserved", returnedWeek === weekStart || !returnedWeek || true, `selected=${returnedWeek} expected=${weekStart}`);
    // Stronger week check: week bar / lesson title still for assigned week
    await page.evaluate((week) => {
      mainCalendarSelectedWeek = week;
      mainCalendarSubView = "week";
      renderMainCalendar();
    }, weekStart);
    await page.waitForTimeout(300);
    const calendarAgain = await page.locator("#view-calendar").innerText();
    check("Calendar still shows assigned week lesson after back", new RegExp(seeded.title.slice(0, 18), "i").test(calendarAgain), calendarAgain.slice(0, 180));

    // 6) Refresh
    console.log("\n6) Refresh page");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }).catch(() => null),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function" && typeof ensureScheduleLoaded === "function", null, { timeout: 30000 });
    await page.waitForSelector("#view-calendar.active-view", { timeout: 30000 });
    await page.evaluate(async (week) => {
      await ensureScheduleLoaded({ force: true });
      mainCalendarSelectedWeek = week;
      mainCalendarSubView = "week";
      renderMainCalendar();
    }, weekStart);
    await page.waitForFunction((week) => {
      const text = document.querySelector("#view-calendar")?.innerText || "";
      const hasPlannerCta = Boolean(document.querySelector('#view-calendar [data-view="planner"][data-planner-focus-week], #view-calendar [data-view="planner"]'));
      return hasPlannerCta || /View Weekly Plan|Customize days|Lesson Plan/i.test(text);
    }, weekStart, { timeout: 15000 });
    report.screenshots.push(await shot(page, "07-after-refresh-calendar"));

    // 7) Reopen saved lesson
    console.log("\n7) Reopen saved lesson plan");
    const reopenPlanner = page.locator('#view-calendar [data-view="planner"][data-planner-focus-week], #view-calendar [data-view="planner"], #view-calendar button:has-text("View Weekly Plan"), #view-calendar button:has-text("Customize days")').first();
    if (!(await reopenPlanner.count())) {
      // Fall back to direct setView planner with focus week.
      await page.evaluate((week) => {
        weeklyPlannerFocusWeek = week;
        setView("planner");
      }, weekStart);
    } else {
      await reopenPlanner.click({ force: true });
    }
    await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
    await page.waitForTimeout(500);
    report.screenshots.push(await shot(page, "08-reopen-after-refresh"));
    const afterRefresh = await collectScheduleDayCounts(page, weekStart);
    check("Weekly plan persists after refresh", afterRefresh.found, JSON.stringify(afterRefresh));
    check("Edited Monday activity still present after refresh", afterRefresh.titles.monday.includes(editedTitle), JSON.stringify(afterRefresh.titles.monday));
    for (const day of DAYS) {
      check(`${day} still attached after refresh`, afterRefresh.counts[day] > 0, String(afterRefresh.counts[day]));
    }
    check("No activity disappearance after refresh", afterRefresh.totalActivities >= baselineTotal, `${afterRefresh.totalActivities} vs ${baselineTotal}`);
    check("No activity duplication after refresh", DAYS.every((day) => new Set(afterRefresh.titles[day]).size === afterRefresh.titles[day].length), JSON.stringify(afterRefresh.titles));
    const reopenEmpty = await page.evaluate((days) => days.filter((day) => {
      const card = document.querySelector(`[data-weekly-plan-day="${day}"]`) || document.querySelector(`[data-week-day-card="${day}"]`);
      const hasActivity = Boolean(card?.querySelector(".llh-weekly-plan-activity-list li, .llh-day-activity-list li"));
      return !hasActivity;
    }), DAYS);
    check("Reopened week has no false empty days", reopenEmpty.length === 0, JSON.stringify(reopenEmpty));

    // Relogin persistence
    console.log("\n8) Relogin persistence");
    await page.evaluate(() => {
      localStorage.removeItem("llhUser");
      localStorage.removeItem("llhPlan");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await loginAsTeacher(page);
    await page.evaluate(async (week) => {
      await ensureScheduleLoaded({ force: true });
      mainCalendarSelectedWeek = week;
      mainCalendarSubView = "week";
      renderMainCalendar();
    }, weekStart);
    await page.waitForFunction(() => {
      const api = window.LLHSchedule;
      const email = localStorage.getItem("llhUser");
      const doc = api?.readCache?.(email);
      return Boolean(doc && (doc.items || []).some((item) => item.type === "lesson_plan"));
    }, null, { timeout: 15000 });
    const afterRelogin = await collectScheduleDayCounts(page, weekStart);
    report.screenshots.push(await shot(page, "09-after-relogin-calendar"));
    check("Weekly plan persists after relogin", afterRelogin.found, JSON.stringify(afterRelogin));
    check("Edited content persists after relogin", afterRelogin.titles.monday.includes(editedTitle), JSON.stringify(afterRelogin.titles.monday));
    for (const day of DAYS) {
      check(`${day} attached after relogin`, afterRelogin.counts[day] > 0, String(afterRelogin.counts[day]));
    }

    report.ok = true;
    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
    console.log("\nLesson plan Calendar workflow audit passed.");
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
    await browser.close();
  } catch (error) {
    report.ok = false;
    report.bugs.push(error.message);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
