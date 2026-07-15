#!/usr/bin/env node
/**
 * Step 3 — Add to Calendar CTA rename + pick-week → Calendar highlight flow.
 * Run: node scripts/test-calendar-add-to-calendar.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20260 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-add-cal-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "add-cal-admin@test.local",
  password: "add-cal-pass",
  code: "add-cal-code",
};
const USER_EMAIL = "add-cal-teacher@example.com";
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
  const planId = `cur-lp-add-cal-${suffix || crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: title || `Add Cal ${planId}`,
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
  await page.waitForFunction(() => typeof setView === "function" && typeof assignScheduleLessonPlan === "function", null, { timeout: 30000 });
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
    const lesson = await seedFreeLesson(token, { title: "Add to Calendar Flow Plan", suffix: "flow" });
    const week = addDaysIso(mondayIso(), 14);

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("dialog", async (d) => { await d.accept(); });
    await loginAsTeacher(page);
    await openLessonWorkspace(page, lesson.title);

    const primary = await page.locator("[data-lesson-use-this-plan]").first().innerText();
    const edit = await page.locator('.lesson-workspace-more-menu [data-edit-lesson-plan]').first().innerText();
    const printBtn = await page.locator('[data-lesson-action-bars="top"] [data-lesson-print-variant="week"]').innerText();
    const downloadBtn = await page.locator('[data-lesson-action-bars="top"] [data-lesson-download-variant="week"]').innerText();
    check("Use This Plan CTA is visible", /Use This Plan/i.test(primary), primary);
    check("Edit Lesson Plan lives in More", /Edit Lesson Plan/i.test(edit), edit);
    check("Print CTA is visible", /^Print$/i.test(printBtn.trim()), printBtn);
    check("Download CTA is visible", /^Download$/i.test(downloadBtn.trim()), downloadBtn);
    check("Duplicate Add to My Week removed from primary", await page.locator("[data-lesson-add-to-my-week]").count() === 0);

    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="use-plan"]:not([hidden])', { timeout: 10000 });
    check("Use This Plan opens choice sheet", await page.locator('[data-lesson-use-plan-choice="calendar"]').count() > 0);
    await page.click('[data-lesson-use-plan-choice="calendar"]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 10000 });
    const formTitle = await page.locator('[data-lesson-workspace-action-panel="main-calendar"] .lesson-workspace-action-sheet-title').innerText();
    check("Add to Calendar opens pick-week form", /Add to Calendar/i.test(formTitle), formTitle);
    check("Form has Cancel button", await page.locator('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-workspace-action-sheet-dismiss]').count() > 0);

    await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', week);
    await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
    const successTitle = await page.locator('[data-lesson-workspace-action-panel="success"] .lesson-workspace-action-sheet-title').innerText();
    check("Success title is Added to Calendar", /Added to Calendar/i.test(successTitle), successTitle);
    const openCalWeek = await page.locator("[data-lesson-open-calendar]").getAttribute("data-dash-select-week");
    check("Open Calendar is tagged with the chosen week", openCalWeek === week, openCalWeek);

    await page.click("[data-lesson-open-calendar]");
    await page.waitForSelector("#view-calendar.active-view", { timeout: 10000 });
    await page.waitForTimeout(500);
    const calText = await page.locator("#mainCalendarApp").innerText();
    check("Opens Calendar Week View for the assigned week", /Week view/i.test(calText) && calText.includes(lesson.title), calText.slice(0, 200));
    check("Shows assign confirmation notice", await page.locator("[data-calendar-assign-notice]").count() > 0);

    // Library card / assign shortcut label (tile cards may omit the button)
    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
    const assignLabels = await page.evaluate(() => (
      [...document.querySelectorAll("[data-curriculum-assign-week]")]
        .map((el) => el.textContent.trim())
    ));
    check(
      "Any Assign-to-week shortcuts are labeled Add to Calendar",
      assignLabels.every((label) => label === "Add to Calendar"),
      assignLabels.join(" | ") || "(no card shortcuts — tile open only)",
    );

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
