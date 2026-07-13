#!/usr/bin/env node
/**
 * Capture Final Owner Review Round screenshots using real LLH curriculum imports.
 * Output: /opt/cursor/artifacts/lesson-library-owner-review-round/
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = "/opt/cursor/artifacts/lesson-library-owner-review-round";
const PORT = 19840 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-round-screens-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "owner-round-screens-admin@test.local",
  password: "owner-round-screens-pass",
  code: "owner-round-screens-code",
};
const USER_EMAIL = "owner-round-screens@example.com";

const REAL_PLANS = [
  {
    file: path.join(ROOT, "scripts/curriculum-preschool-free-imports/01-preschool-colors-everywhere-free.txt"),
    id: "cur-lp-preschool-colors-everywhere",
    slug: "colors-everywhere",
  },
  {
    file: path.join(ROOT, "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt"),
    id: "cur-lp-infant-soft-sounds-faces",
    slug: "familiar-faces",
  },
  {
    file: path.join(ROOT, "scripts/curriculum-preschool-free-imports/10-preschool-five-senses-free.txt"),
    id: "cur-lp-preschool-five-senses",
    slug: "five-senses",
  },
  {
    file: path.join(ROOT, "scripts/curriculum-preschool-free-imports/06-preschool-community-helpers-free.txt"),
    id: "cur-lp-preschool-community-helpers",
    slug: "community-helpers",
  },
];

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

async function seedPlan(token, target) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(target.file, "utf8"));
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: target.id,
      title: parsed.data.title,
      plan: parsed.data.plan || "Free",
      status: "published",
      age: parsed.data.age || parsed.data.ageGroup,
      theme: parsed.data.theme,
    },
  });
  assert(save.status === 200, `Seed failed: ${save.status} ${save.text}`);
  return { ...target, title: parsed.data.title, age: parsed.data.age || parsed.data.ageGroup };
}

async function capture(page, name, selector = "body") {
  const filePath = path.join(OUT_DIR, `${name}.png`);
  await page.locator(selector).first().screenshot({ path: filePath });
  console.log(filePath);
}

async function openLesson(page, title) {
  await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
  await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
  await page.fill("#lessonPlanSearch", title);
  await page.waitForTimeout(300);
  await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: title }).first().click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
}

async function closeViewer(page) {
  await page.evaluate(() => {
    if (document.querySelector("#resourceViewerModal.open")) closeResourceViewer();
  });
  await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
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
    const seeded = [];
    for (const target of REAL_PLANS) seeded.push(await seedPlan(login.json.token, target));
    const helpers = seeded.find((plan) => plan.slug === "community-helpers") || seeded[0];

    browser = await playwright.chromium.launch({ headless: true });
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
    }, { email: USER_EMAIL, favoriteIds: [helpers.id] });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
    await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
    await capture(page, "01-library-browse", "#view-lessons");

    await page.click('[data-lesson-library-mode="saved"]');
    await page.waitForSelector("#view-lessons:has-text('Saved Lesson Plans')", { timeout: 10000 });
    await capture(page, "02-saved-plans", "#view-lessons");

    await openLesson(page, helpers.title);
    await capture(page, "03-community-helpers-week", "#resourceViewerModal .resource-viewer-card");
    await page.click('[data-lesson-workspace-tab="plan"]');
    await page.waitForSelector('[data-lesson-workspace-panel="plan"].is-active', { timeout: 5000 });
    await capture(page, "04-community-helpers-plan-sections", "#resourceViewerModal .resource-viewer-card");
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector(".lesson-workspace-action-sheet:not([hidden])", { timeout: 5000 });
    await capture(page, "05-use-this-plan-final-actions", "#resourceViewerModal");
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");

    await page.evaluate((planId) => {
      const weekStartDate = curriculumPlannerWeekStartIso("2026-07-13");
      localStorage.setItem(`llhCurriculumAssignments:${localStorage.getItem("llhUser")}`, JSON.stringify([{
        id: "cwa-owner-round-week",
        lessonPlanId: planId,
        weekStartDate,
        ageGroup: "Preschool",
        teacherNotes: "",
        preparationNotes: "",
        dailyTeacherNotes: {},
        observations: [],
        parentCalendar: {},
      }]));
    }, helpers.id);

    const weeklyHtml = await page.evaluate((planId) => resourcePrintableHtml(
      resources.find((item) => item.id === planId),
      { mode: "print", printVariant: "week" },
    ), helpers.id);
    const printPage = await browser.newPage({ viewport: { width: 900, height: 1600 }, deviceScaleFactor: 1 });
    await printPage.setContent(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <base href="http://127.0.0.1:${PORT}/" />
          <link rel="stylesheet" href="http://127.0.0.1:${PORT}/styles.css" />
          <style>
            body { margin: 24px; background: #eef2f6; }
            .lesson-week-schedule-print { max-width: 820px; margin: 0 auto; background: #fff; padding: 8px; }
          </style>
        </head>
        <body class="printing-resource">${weeklyHtml}</body>
      </html>
    `, { waitUntil: "networkidle" });
    await capture(printPage, "06-weekly-schedule-community-helpers", ".lesson-week-schedule-print");
    await printPage.screenshot({ path: path.join(OUT_DIR, "06b-weekly-schedule-fullpage.png"), fullPage: true });
    console.log(path.join(OUT_DIR, "06b-weekly-schedule-fullpage.png"));
    const pdfPath = path.join(OUT_DIR, "06c-weekly-schedule-print.pdf");
    await printPage.pdf({
      path: pdfPath,
      format: "Letter",
      printBackground: true,
      margin: { top: "0.55in", right: "0.55in", bottom: "0.7in", left: "0.55in" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8pt;width:100%;padding:0 0.55in;color:#667487;display:flex;justify-content:space-between;"><span>Little Learner Hub</span><span>Page <span class="pageNumber"></span></span></div>`,
    });
    console.log(pdfPath);
    await printPage.close();
    await closeViewer(page);

    for (const plan of seeded) {
      await openLesson(page, plan.title);
      await capture(page, `07-${plan.slug}-viewer`, "#resourceViewerModal .resource-viewer-card");
      await closeViewer(page);
    }

    await page.evaluate(() => {
      favorites = [];
      localStorage.setItem("llhFavorites", "[]");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      const email = localStorage.getItem("llhUser");
      if (accounts[email]) {
        accounts[email].favorites = [];
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      }
      lessonLibraryMode = "saved";
      if (typeof saveCurrentAccountState === "function") {
        try { saveCurrentAccountState(); } catch (_) { /* ignore */ }
      }
      renderCategoryPage("lessons");
    });
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll("#view-lessons .lesson-plan-card").length;
      const empty = document.querySelector("#view-lessons .empty-state")?.textContent || "";
      return cards === 0 && /No saved lesson plans yet/i.test(empty);
    }, null, { timeout: 5000 });
    await capture(page, "08-saved-empty-state", "#view-lessons");

    for (const width of [390, 412, 430]) {
      await page.setViewportSize({ width, height: 915 });
      await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
      await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
      await capture(page, `09-library-${width}`, "#view-lessons");
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
