#!/usr/bin/env node
/**
 * Step 5 — Calendar print polish + classroom-copy print + guided cues.
 * Run: node scripts/test-calendar-print-mobile.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20340 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-print-mobile-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "print-mobile-admin@test.local",
  password: "print-mobile-pass",
  code: "print-mobile-code",
};
const USER_EMAIL = "print-mobile-teacher@example.com";
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

async function seedFreeLesson(token, { title, suffix = "" } = {}) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-print-mobile-${suffix || crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: title || `Print Mobile ${planId}`,
      plan: "Free",
      status: "published",
      age: "Preschool",
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
  return { planId, title: title || save.json.lessonPlan?.title || planId };
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
  await page.waitForFunction(() => typeof setView === "function" && typeof printCalendarWeekSchedule === "function", null, { timeout: 30000 });
}

async function main() {
  let child;
  let browser;
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "").slice(0, 180) });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${String(detail).slice(0, 120)}` : ""}`);
  };

  try {
    child = startServer();
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = login.json.token || login.json.adminToken;
    const lesson = await seedFreeLesson(token, { title: "Print Mobile Ocean Plan", suffix: "ocean" });
    const week = mondayIso();
    const customTitle = `Printed Bubble ${crypto.randomBytes(2).toString("hex")}`;

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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

    // Customize snapshot so print must prefer classroom copy
    const itemId = await page.evaluate((weekStart) => {
      const api = LLHSchedule;
      const item = api.lessonForWeek(api.readCache(localStorage.getItem("llhUser")), weekStart);
      return item?.id || "";
    }, week);
    await page.evaluate(async ({ itemId, customTitle }) => {
      await updateScheduleLessonSnapshot(itemId, (snapshot) => {
        const dailyPlans = { ...(snapshot.dailyPlans || {}) };
        dailyPlans.monday = {
          ...(dailyPlans.monday || {}),
          theme: "Print Bubble Monday",
          items: [{ itemId: "act-print-1", title: customTitle }],
        };
        return { ...snapshot, dailyPlans };
      });
    }, { itemId, customTitle });

    await page.evaluate((weekStart) => setView("calendar", { weekStartDate: weekStart }), week);
    await page.waitForSelector("#mainCalendarApp .llh-calendar-week-view, #mainCalendarApp [data-calendar-print-week]", { timeout: 15000 });
    const weekText = await page.locator("#mainCalendarApp").innerText();
    check("Week View shows Print Week PDF + Print Full Plan", /Print Week PDF/i.test(weekText) && /Print Full Plan/i.test(weekText), weekText.slice(0, 200));
    check("Mobile week actions use stacked layout class", await page.locator(".llh-cal-week-actions").count() > 0);

    const resourceInfo = await page.evaluate((weekStart) => {
      const api = LLHSchedule;
      const item = api.lessonForWeek(api.readCache(localStorage.getItem("llhUser")), weekStart);
      const resource = calendarWeekPrintResource(item);
      return {
        usesSnapshot: resource?._curriculumLessonPlan === item?.snapshot
          || resource?._curriculumLessonPlan?.snapshotEditedAt === item?.snapshot?.snapshotEditedAt,
        mondayTitles: (resource?._curriculumLessonPlan?.dailyPlans?.monday?.items || []).map((entry) => entry.title),
        theme: resource?._curriculumLessonPlan?.dailyPlans?.monday?.theme || "",
      };
    }, week);
    check("Print resource prefers classroom snapshot", resourceInfo.mondayTitles.includes(customTitle), resourceInfo.mondayTitles.join(" | "));
    check("Print resource includes customized Monday theme", resourceInfo.theme === "Print Bubble Monday", resourceInfo.theme);

    // Week PDF download path
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
    await page.locator("[data-calendar-print-week]").first().click();
    const download = await downloadPromise;
    check("Print Week PDF triggers a download", Boolean(download), download ? download.suggestedFilename() : "no download");
    const statusText = await page.locator("[data-calendar-print-status]").innerText().catch(() => "");
    check("Print status confirms week PDF", /Downloaded week-at-a-glance/i.test(statusText) || Boolean(download), statusText);

    // Full plan print path creates print host
    await page.evaluate(() => {
      window.__printCalled = false;
      window.print = () => { window.__printCalled = true; };
    });
    await page.locator("[data-calendar-print-full]").first().click();
    await page.waitForTimeout(400);
    const fullPrint = await page.evaluate(() => ({
      printed: Boolean(window.__printCalled),
      host: Boolean(document.querySelector(".llh-calendar-print-host")),
      bodyClass: document.body.className,
    }));
    check("Print Full Plan invokes window.print", fullPrint.printed, JSON.stringify(fullPrint));

    // Guided notice actions on Day View
    await page.evaluate((weekStart) => {
      pendingCalendarAssignNotice = `Added “${"Print Mobile Ocean Plan"}” to the week of ${weekStart}. Customize days, then print your week-at-a-glance.`;
      mainCalendarSelectedDay = weekStart;
      mainCalendarSelectedWeek = weekStart;
      mainCalendarSubView = "day";
      renderMainCalendar();
    }, week);
    await page.waitForTimeout(300);
    const dayText = await page.locator("#mainCalendarApp").innerText();
    check("Day View shows assign notice with Customize + Print actions", /Customize days/i.test(dayText) && /Print Week PDF/i.test(dayText), dayText.slice(0, 220));
    check("Mobile viewport has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2));

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
