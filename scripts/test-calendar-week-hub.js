#!/usr/bin/env node
/**
 * Step 2 — Calendar week hub smoke:
 * - Empty weeks stay empty with friendly CTAs (no auto-fill copy)
 * - Always-visible week header actions (Add / Browse / AI / Print)
 * - Week-at-a-glance indicators when a plan exists
 *
 * Run: node scripts/test-calendar-week-hub.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20220 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-week-hub-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "week-hub-admin@test.local",
  password: "week-hub-pass",
  code: "week-hub-code",
};
const USER_EMAIL = "week-hub-teacher@example.com";
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
  const planId = `cur-lp-week-hub-${suffix || crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: title || `Week Hub ${planId}`,
      theme: parsed.data.theme || "Ocean Friends",
      plan: "Free",
      status: "published",
      age: "Preschool",
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
  return { planId, title: title || save.json.lessonPlan?.title || planId, theme: save.json.lessonPlan?.theme || "Ocean Friends" };
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
  await page.waitForFunction(() => typeof setView === "function" && typeof assignScheduleLessonPlan === "function", null, { timeout: 30000 });
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
    const lesson = await seedFreeLesson(token, { title: "Week Hub Ocean Plan", suffix: "ocean" });
    const week = mondayIso();

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", async (d) => { await d.accept(); });

    await loginAsTeacher(page);
    await page.evaluate(() => setView("calendar"));
    await page.waitForSelector("#mainCalendarApp .llh-calendar-grid-7", { timeout: 15000 });

    // Open current week via gutter (empty — no assignment yet)
    await page.locator("[data-calendar-view-week]").first().click();
    await page.waitForTimeout(400);
    let weekText = await page.locator("#mainCalendarApp").innerText();
    let weekHtml = await page.locator("#mainCalendarApp").innerHTML();

    check("Empty week shows friendly empty state", /This week is empty/i.test(weekText) && /Nothing planned yet/i.test(weekText), weekText.slice(0, 160));
    check("Empty week says nothing is auto-filled", /auto-filled/i.test(weekText) || /stay empty/i.test(weekText));
    check("Always-visible week actions include Add / Browse / AI / Print", /Add Lesson Plan/i.test(weekText) && /Browse Library/i.test(weekText) && /AI Ideas/i.test(weekText) && /Print \/ Download/i.test(weekText));
    check("Print is disabled while week is empty", await page.locator("[data-calendar-print-week]").isDisabled());
    check("Empty-state CTA block is present", /data-calendar-empty-week/.test(weekHtml));

    // AI Ideas navigates
    await page.locator('.llh-cal-week-actions [data-view="ai"]').click();
    await page.waitForSelector("#view-ai.active-view, #view-ai.view.active-view", { timeout: 10000 }).catch(() => {});
    const aiActive = await page.evaluate(() => {
      const el = document.querySelector("#view-ai");
      return Boolean(el && (el.classList.contains("active-view") || el.classList.contains("active")));
    });
    check("AI Ideas opens AI view", aiActive);

    // Assign a plan to this week, then reopen week view
    await page.evaluate(async ({ planId, weekStart }) => {
      await assignScheduleLessonPlan({
        resourceId: planId,
        weekStartDate: weekStart,
        ageGroup: "Preschool",
        replaceExisting: true,
      });
    }, { planId: lesson.planId, weekStart: week });

    await page.evaluate((weekStart) => {
      setView("calendar", { weekStartDate: weekStart });
    }, week);
    await page.waitForSelector("#mainCalendarApp .llh-calendar-week-view, #mainCalendarApp [data-calendar-print-week]", { timeout: 15000 });
    await page.waitForTimeout(500);
    weekText = await page.locator("#mainCalendarApp").innerText();
    weekHtml = await page.locator("#mainCalendarApp").innerHTML();

    check("Assigned week shows the lesson title", weekText.includes(lesson.title), weekText.slice(0, 200));
    check("Empty-state block is gone after assign", !/data-calendar-empty-week/.test(weekHtml) && !/Nothing planned yet/i.test(weekText));
    check("Week-at-a-glance shows theme", /Theme:/i.test(weekText), weekText.slice(0, 220));
    check("Week-at-a-glance shows activity count", /\d+\s+activit/i.test(weekText));
    check("Week actions still visible with a plan", /Add Lesson Plan/i.test(weekText) && /Print \/ Download/i.test(weekText));
    check("Print is enabled when week has a plan", !(await page.locator("[data-calendar-print-week]").isDisabled()));
    check("Day strip shows activity meta pills", /llh-cal-meta-pill/.test(weekHtml) || /\d+\s+act/.test(weekText));

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
