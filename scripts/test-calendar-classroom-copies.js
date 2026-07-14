#!/usr/bin/env node
/**
 * Step 4 — Editable classroom copies (snapshot) without mutating library originals.
 * Run: node scripts/test-calendar-classroom-copies.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20300 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-class-copy-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "class-copy-admin@test.local",
  password: "class-copy-pass",
  code: "class-copy-code",
};
const USER_EMAIL = "class-copy-teacher@example.com";
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
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

async function seedFreeLesson(token, { title, suffix = "" } = {}) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-class-copy-${suffix || crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: title || `Class Copy ${planId}`,
      plan: "Free",
      status: "published",
      age: "Preschool",
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
  return {
    planId,
    title: title || save.json.lessonPlan?.title || planId,
    originalMondayTitle: save.json.lessonPlan?.dailyPlans?.monday?.items?.[0]?.title || "",
  };
}

async function loginAsTeacher(page) {
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
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof setView === "function" && typeof updateScheduleLessonSnapshot === "function", null, { timeout: 30000 });
}

async function main() {
  let child;
  let browser;
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "").slice(0, 200) });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${String(detail).slice(0, 120)}` : ""}`);
  };

  try {
    child = startServer();
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = login.json.token || login.json.adminToken;
    const lesson = await seedFreeLesson(token, { title: "Classroom Copy Ocean Plan", suffix: "ocean" });
    const week = mondayIso();
    const customTitle = `Bubble Sort Lab ${crypto.randomBytes(2).toString("hex")}`;

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", async (d) => { await d.accept(); });
    await loginAsTeacher(page);

    await page.evaluate(async ({ planId, weekStart }) => {
      await assignScheduleLessonPlan({
        resourceId: planId,
        weekStartDate: weekStart,
        ageGroup: "Preschool",
        replaceExisting: true,
      });
    }, { planId: lesson.planId, weekStart: week });

    await page.evaluate((weekStart) => setView("planner", { weekStartDate: weekStart }), week);
    await page.waitForSelector("#weeklyPlannerApp .llh-week-classroom", { timeout: 15000 });
    const plannerText = await page.locator("#weeklyPlannerApp").innerText();
    check("Weekly Planner shows classroom copy banner", /classroom copy/i.test(plannerText), plannerText.slice(0, 160));
    check("Edit day controls are present", await page.locator("[data-week-edit-day]").count() > 0);

    await page.locator('[data-week-edit-day="monday"]').first().click();
    await page.waitForSelector("[data-week-edit-panel]", { timeout: 10000 });
    check("Day editor opens with library-safe copy", /Lesson Library original is not changed/i.test(await page.locator("[data-week-edit-panel]").innerText()));

    await page.fill("[data-week-edit-day-theme]", "Bubble Monday");
    const firstTitle = page.locator("[data-week-edit-activity-title]").first();
    await firstTitle.fill(customTitle);
    await page.click("[data-week-edit-save]");
    await page.waitForSelector("[data-week-edit-panel]", { state: "detached", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);

    const afterEdit = await page.locator("#weeklyPlannerApp").innerText();
    check("Edited activity appears in Weekly Planner", afterEdit.includes(customTitle), afterEdit.slice(0, 220));
    check("Edited day theme appears", /Bubble Monday/i.test(afterEdit));
    check("Customized copy banner/state shows", /customized/i.test(afterEdit) || /Classroom copy customized/i.test(afterEdit));

    // Calendar Day View reflects the classroom snapshot edit
    await page.evaluate((weekStart) => {
      const monday = weekStart;
      mainCalendarSelectedDay = monday;
      mainCalendarSelectedWeek = weekStart;
      mainCalendarSubView = "day";
      setView("calendar");
    }, week);
    // Force day view with week focus then open monday
    await page.evaluate((weekStart) => setView("calendar", { weekStartDate: weekStart }), week);
    await page.waitForTimeout(400);
    await page.locator(`[data-calendar-select-day="${week}"]`).click();
    await page.waitForTimeout(400);
    const dayText = await page.locator("#mainCalendarApp").innerText();
    check("Calendar Day View shows customized activity", dayText.includes(customTitle), dayText.slice(0, 220));
    check("Calendar Day View offers Customize this day", /Customize this day/i.test(dayText));

    // Library original unchanged
    const library = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const libPlan = (library.json?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === lesson.planId);
    const libMondayTitles = (libPlan?.dailyPlans?.monday?.items || []).map((item) => item.title);
    check("Library original Monday activities unchanged", !libMondayTitles.includes(customTitle), libMondayTitles.join(" | "));
    if (lesson.originalMondayTitle) {
      check("Library still has original Monday activity title", libMondayTitles.includes(lesson.originalMondayTitle), lesson.originalMondayTitle);
    }

    // Schedule snapshot has edit marker
    const schedule = await requestJson("GET", `/api/schedule?types=lesson_plan&from=${week}&to=${week}`, null, {
      "X-LLH-User-Email": USER_EMAIL,
      Authorization: `Bearer test:${USER_EMAIL}`,
    });
    const item = (schedule.json?.items || schedule.json?.schedule?.items || []).find((entry) => entry.type === "lesson_plan")
      || (schedule.json?.items || []).find((entry) => entry.weekStartDate === week);
    // Fallback: read from page cache
    const snapshotInfo = await page.evaluate((weekStart) => {
      const api = window.LLHSchedule;
      const email = localStorage.getItem("llhUser");
      const doc = api?.readCache?.(email);
      const lessonItem = api?.lessonForWeek?.(doc, weekStart);
      return {
        editedAt: lessonItem?.snapshot?.snapshotEditedAt || "",
        mondayTitles: (lessonItem?.snapshot?.dailyPlans?.monday?.items || []).map((item) => item.title),
        theme: lessonItem?.snapshot?.dailyPlans?.monday?.theme || "",
      };
    }, week);
    check("Classroom snapshot marked edited", Boolean(snapshotInfo.editedAt), snapshotInfo.editedAt);
    check("Classroom snapshot has customized Monday activity", snapshotInfo.mondayTitles.includes(customTitle), snapshotInfo.mondayTitles.join(" | "));
    check("Classroom snapshot has customized Monday theme", snapshotInfo.theme === "Bubble Monday", snapshotInfo.theme);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      failed.forEach((f) => console.error(`FAIL detail: ${f.name} — ${f.detail}`));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
