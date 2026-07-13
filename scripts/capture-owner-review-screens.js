#!/usr/bin/env node
/**
 * Capture final owner-review Lesson Library screenshots.
 * Output: /opt/cursor/artifacts/lesson-library-owner-review/
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { LESSON_PLANS } = require("./lib/preschool-free-lesson-data.js");
const { formatLessonPlan } = require("./lib/preschool-import-format.js");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = "/opt/cursor/artifacts/lesson-library-owner-review";
const PORT = 19810 + Math.floor(Math.random() * 50);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-review-screens-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "owner-review-screens-admin@test.local",
  password: "owner-review-screens-pass",
  code: "owner-review-screens-code",
};
const USER_EMAIL = "owner-review-screens@example.com";
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

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
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
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
  for (let i = 0; i < 90; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch {
      /* retry */
    }
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

function screenshotPlanForAge(age, sourcePlan, index) {
  const copy = JSON.parse(JSON.stringify(sourcePlan));
  copy.title = `${age} Owner Review Screenshot Curriculum Week`;
  copy.theme = `${age} Classroom Routines, Rich Play, and Long Weekly Planning Titles`;
  copy.ageGroup = age;
  copy.materials = [
    ...(copy.materials || []),
    `${age} labeled supply bins, teacher clipboard, movement props, picture cards, sensory materials, family note copies, and extended material descriptions for print-readiness screenshot ${index + 1}`,
  ];
  DAY_KEYS.forEach((day) => {
    const activities = Array.isArray(copy.days?.[day]) ? copy.days[day] : [];
    activities.forEach((activity, activityIndex) => {
      activity.name = `${age} ${activity.name} with long classroom-ready title for owner screenshot wrapping ${day} ${activityIndex + 1}`;
      activity.materials = `${activity.materials || "Classroom materials"}, labeled trays, safe props, and long material wording for print overflow`;
      activity.description = `${activity.description || activity.objective || activity.name} This version uses real free curriculum data with extended naming for overflow checks.`;
    });
  });
  return copy;
}

async function seedLesson(token, { age, sourcePlan, index }) {
  const importText = formatLessonPlan(screenshotPlanForAge(age, sourcePlan, index), {
    planTier: "Free",
    status: "published",
    ageGroup: age,
  });
  const parsed = parseCurriculumLessonPlanImport(importText);
  assert(parsed.ok, `Parse failed for ${age}: ${(parsed.errors || []).join("; ")}`);
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-owner-screens-${age.toLowerCase().replace(/\s+/g, "-")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: parsed.data.title,
      age,
      plan: "Free",
      status: "published",
      theme: parsed.data.theme,
    },
  });
  assert(save.status === 200, `Seed failed (${age}): ${save.status} ${save.text}`);
  return { planId, title: parsed.data.title, age };
}

async function setupPage(browser, seeded) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  await page.evaluate(({ email, favoriteIds }) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: {
        email,
        plan: "Pro",
        subscriptionStatus: "Pro Active",
        stripeSubscriptionStatus: "active",
        monthlyPrice: "$19.99/month",
        favorites: favoriteIds,
      },
    }));
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhFavorites", JSON.stringify(favoriteIds));
  }, { email: USER_EMAIL, favoriteIds: [seeded[2]?.planId || seeded[0].planId] });
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
    page.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
  return page;
}

async function gotoLessons(page, mode = "browse") {
  await page.evaluate((lessonLibraryMode) => setView("lessons", { lessonLibraryMode }), mode);
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
}

async function openLesson(page, title) {
  await gotoLessons(page, "browse");
  await page.fill("#lessonPlanSearch", title);
  await page.waitForTimeout(350);
  await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${title}")`, { timeout: 15000 });
  await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: title }).first().click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
}

async function capture(page, name, selector = "body") {
  const filePath = path.join(OUT_DIR, `${name}.png`);
  const target = page.locator(selector).first();
  await target.screenshot({ path: filePath });
  console.log(filePath);
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

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const child = startServer();
  let browser = null;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, `Admin login failed: ${login.status}`);
    const seeded = [
      await seedLesson(login.json.token, { age: "Infant", sourcePlan: LESSON_PLANS[0], index: 0 }),
      await seedLesson(login.json.token, { age: "Toddler", sourcePlan: LESSON_PLANS[1], index: 1 }),
      await seedLesson(login.json.token, { age: "Preschool", sourcePlan: LESSON_PLANS[2], index: 2 }),
    ];
    const primary = seeded[2];

    browser = await playwright.chromium.launch({ headless: true });
    const page = await setupPage(browser, seeded);

    await gotoLessons(page, "browse");
    await capture(page, "01-browse-library-clean", "#view-lessons");

    await gotoLessons(page, "saved");
    await capture(page, "02-saved-lesson-plans", "#view-lessons");

    await openLesson(page, primary.title);
    await capture(page, "03-viewer-week-no-top-print", "#resourceViewerModal .resource-viewer-card");

    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector(".lesson-workspace-action-sheet:not([hidden])", { timeout: 5000 });
    await capture(page, "04-use-this-plan-minimal-sheet", "#resourceViewerModal");
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");

    const weeklyHtml = await page.evaluate(() => resourcePrintableHtml(activeResourceViewerResource, { mode: "print", printVariant: "week" }));
    const printPage = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
    await printPage.setContent(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <link rel="stylesheet" href="http://127.0.0.1:${PORT}/styles.css" />
        </head>
        <body class="printing-resource">${weeklyHtml}</body>
      </html>
    `, { waitUntil: "networkidle" });
    await capture(printPage, "05-weekly-print-large-plan", ".lesson-week-schedule-print");
    await printPage.close();

    await page.evaluate(() => {
      if (document.querySelector("#resourceViewerModal.open")) closeResourceViewer();
    });
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });

    for (const plan of seeded) {
      await openLesson(page, plan.title);
      await capture(page, `06-${plan.age.toLowerCase()}-viewer`, "#resourceViewerModal .resource-viewer-card");
      await page.click("[data-lesson-workspace-back]");
      await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
    }

    for (const width of [390, 412, 430]) {
      await page.setViewportSize({ width, height: 915 });
      await gotoLessons(page, "browse");
      await capture(page, `07-overflow-${width}`, "#view-lessons");
    }

    console.log(`Screenshots written to ${OUT_DIR}`);
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
