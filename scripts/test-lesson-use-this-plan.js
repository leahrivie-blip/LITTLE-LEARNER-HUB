#!/usr/bin/env node
/**
 * Lesson workspace "Use This Plan" → weekly plan integration (Batch 5).
 * Run: npm run test:lesson-use-this-plan
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19620 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-use-plan-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-use-plan-admin@test.local",
  password: "lesson-use-plan-pass",
  code: "lesson-use-plan-code",
};
const USER_EMAIL = "lesson-use-plan@example.com";
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
  // Pro membership so seeded plans unlock (curated Free only opens Starter Library IDs).
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [USER_EMAIL]: {
        email: USER_EMAIL,
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
      },
    },
    siteContent: {},
    adminSessions: {},
  }, null, 2));
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
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
  const planId = `cur-lp-use-plan-${suffix || crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: title || `Use Plan Calendar ${planId}`,
      plan: "Pro",
      status: "published",
      age: "Preschool",
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
  return { planId, title: title || save.json.lessonPlan?.title || planId };
}

async function openLessonWorkspace(page, title) {
  await page.waitForFunction(
    () => typeof setView === "function"
      && document.body.classList.contains("app-booted")
      && document.body.classList.contains("app-boot-ready")
      && !document.body.classList.contains("app-boot-verifying"),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 10000 });
  await page.fill("#view-lessons.active-view #lessonPlanSearch", title);
  await page.waitForTimeout(400);
  await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${title}")`, { timeout: 15000 });
  await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: title }).first().click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
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
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200, `Admin login failed: ${login.status}`);

    const lessonA = await seedFreeLesson(login.json.token, {
      title: "Use Plan Alpha Week",
      suffix: "alpha",
    });
    const lessonB = await seedFreeLesson(login.json.token, {
      title: "Use Plan Beta Week",
      suffix: "beta",
    });

    const weekStart = mondayIso();
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate((email) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
        },
      }));
      localStorage.setItem("llhPlan", "Pro");
      localStorage.removeItem(`llhCurriculumAssignments:${email}`);
      localStorage.removeItem("llhWeeklyPlanner");
    }, USER_EMAIL);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(
      () => typeof setView === "function"
        && typeof isProUser === "function"
        && isProUser()
        && document.body.classList.contains("app-booted")
        && document.body.classList.contains("app-boot-ready")
        && !document.body.classList.contains("app-boot-verifying"),
      null,
      { timeout: 30000 },
    );
    await page.waitForSelector("#view-calendar.active-view", { timeout: 30000 });

    console.log("1) Use This Plan → Add to Calendar opens pick-week form");
    await openLessonWorkspace(page, lessonA.title);
    const barCopy = await page.evaluate(() => ({
      primaryLabel: document.querySelector("[data-lesson-use-this-plan]")?.textContent.trim() || "",
      plannerDownload: document.querySelector('[data-lesson-action-bars="top"] .lesson-workspace-primary-actions > [data-lesson-download-variant="week"]')?.textContent.trim() || "",
      fullDownload: document.querySelector('[data-lesson-action-bars="top"] .lesson-workspace-primary-actions > [data-lesson-download-variant="full"]')?.textContent.trim() || "",
      printInMore: document.querySelector('.lesson-workspace-more-menu [data-lesson-print-variant="week"]')?.textContent.trim() || "",
      hasMyWeekPrimary: Boolean(document.querySelector("[data-lesson-add-to-my-week]")),
      editInMore: Boolean(document.querySelector(".lesson-workspace-more-menu [data-edit-lesson-plan]")),
    }));
    assert(barCopy.primaryLabel === "Use This Plan", `primary CTA wrong: ${barCopy.primaryLabel}`);
    assert(/Download Teacher Weekly Planner/i.test(barCopy.plannerDownload), `planner download CTA wrong: ${barCopy.plannerDownload}`);
    assert(/Download Full Lesson Plan/i.test(barCopy.fullDownload), `full download CTA wrong: ${barCopy.fullDownload}`);
    assert(/Print Teacher Weekly Planner/i.test(barCopy.printInMore), `print CTA wrong: ${barCopy.printInMore}`);
    assert(!barCopy.hasMyWeekPrimary, "duplicate Add to My Week should not be on primary bar");
    assert(barCopy.editInMore, "Edit should live in More menu");

    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const formCopy = await page.evaluate(() => ({
      title: document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] .lesson-workspace-action-sheet-title')?.textContent.trim() || "",
      submit: document.querySelector('[data-lesson-main-calendar-form] button[type="submit"]')?.textContent.trim() || "",
    }));
    assert(formCopy.title === "Add to Calendar", `form title wrong: ${formCopy.title}`);
    assert(formCopy.submit === "Add to Calendar", `submit copy wrong: ${formCopy.submit}`);

    console.log("2) Add to Calendar assigns curriculum + updates weekly planner");
    await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', weekStart);
    await page.selectOption('[data-lesson-main-calendar-form] [name="ageGroup"]', "Preschool");
    await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });

    const afterFirst = await page.evaluate(({ email, week, planId }) => {
      const assignments = JSON.parse(localStorage.getItem(`llhCurriculumAssignments:${email}`) || "[]");
      const planner = JSON.parse(localStorage.getItem("llhWeeklyPlanner") || "null");
      const assignment = assignments.find((item) => item.weekStartDate === week) || null;
      return {
        assignment,
        planner,
        successTitle: document.querySelector('[data-lesson-workspace-action-panel="success"] .lesson-workspace-action-sheet-title')?.textContent.trim() || "",
        successText: document.querySelector("[data-lesson-workspace-success-message]")?.textContent || "",
        openCalendar: Boolean(document.querySelector("[data-lesson-open-calendar]")),
      };
    }, { email: USER_EMAIL, week: weekStart, planId: lessonA.planId });

    assert(afterFirst.assignment?.lessonPlanId === lessonA.planId, "Curriculum assignment not stored for lesson A");
    assert(afterFirst.assignment?.snapshot?.dailyPlans?.monday, "Assignment snapshot missing Monday");
    assert(afterFirst.planner?.weekOf === weekStart, "Weekly planner weekOf not set");
    assert(afterFirst.planner?.resourceId === lessonA.planId, "Weekly planner resourceId not linked");
    assert(String(afterFirst.planner?.theme || "").includes("Use Plan Alpha"), "Weekly planner theme should use lesson title");
    assert(String(afterFirst.planner?.days?.Monday?.activity || "").includes("Monday Activity"), "Monday activity summary missing");
    assert(afterFirst.successTitle === "Added to Calendar", `success title wrong: ${afterFirst.successTitle}`);
    assert(afterFirst.successText.includes(weekStart), "Success message should mention assigned week");
    assert(afterFirst.openCalendar, "Open Calendar success CTA missing");

    console.log("3) Replacement warning when assigning different plan to same week");
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");
    await page.waitForFunction(() => document.querySelector(".lesson-workspace-action-sheet")?.hidden === true, null, { timeout: 5000 });
    await page.click("[data-lesson-workspace-back]");
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });

    const dialogs = [];
    page.on("dialog", async (dialog) => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      await dialog.accept();
    });

    await openLessonWorkspace(page, lessonB.title);
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', weekStart);
    await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });

    assert(dialogs.some((entry) => /replace/i.test(entry.message)), `Expected replace confirm dialog, got: ${JSON.stringify(dialogs)}`);

    const afterReplace = await page.evaluate(({ email, week, planId }) => {
      const assignments = JSON.parse(localStorage.getItem(`llhCurriculumAssignments:${email}`) || "[]");
      const planner = JSON.parse(localStorage.getItem("llhWeeklyPlanner") || "null");
      return {
        assignment: assignments.find((item) => item.weekStartDate === week) || null,
        planner,
      };
    }, { email: USER_EMAIL, week: weekStart, planId: lessonB.planId });

    assert(afterReplace.assignment?.lessonPlanId === lessonB.planId, "Week assignment should be replaced with lesson B");
    assert(afterReplace.planner?.resourceId === lessonB.planId, "Weekly planner should point to lesson B after replace");

    console.log("Lesson Use This Plan weekly plan checks passed.");
    await browser.close();
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
