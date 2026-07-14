#!/usr/bin/env node
/**
 * Final Owner Review proof for Lesson Library Phase 2 UX simplification.
 * Run: npm run test:lesson-owner-review
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
const PORT = 19740 + Math.floor(Math.random() * 50);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-owner-review-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-owner-review-admin@test.local",
  password: "lesson-owner-review-pass",
  code: "lesson-owner-review-code",
};
const USER_EMAIL = "lesson-owner-review@example.com";
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

function ownerReviewPlanForAge(age, sourcePlan, index) {
  const copy = JSON.parse(JSON.stringify(sourcePlan));
  copy.title = `${age} Owner Review Real Curriculum Week`;
  copy.theme = `${age} Long-Form Classroom Routines and Play-Based Discovery`;
  copy.ageGroup = age;
  copy.materials = [
    ...(copy.materials || []),
    `${age} classroom baskets with labeled picture cards, soft movement props, sensory-safe manipulatives, family connection notes, and long-named activity setup cards for print overflow review ${index + 1}`,
  ];
  DAY_KEYS.forEach((day) => {
    const activities = Array.isArray(copy.days?.[day]) ? copy.days[day] : [];
    activities.forEach((activity, activityIndex) => {
      activity.name = `${age} ${activity.name} with extended classroom-ready title for wrapping and print proof ${day} ${activityIndex + 1}`;
      activity.materials = `${activity.materials || "Classroom materials"}, labeled bins, child-safe props, teacher clipboard, long material description for weekly print overflow checks`;
      activity.description = `${activity.description || activity.objective || activity.name} This owner-review version keeps the real curriculum structure while adding enough title length to prove wrapping.`;
    });
  });
  return copy;
}

async function seedLesson(token, { age, sourcePlan, index }) {
  const importText = formatLessonPlan(ownerReviewPlanForAge(age, sourcePlan, index), {
    planTier: "Free",
    status: "published",
    ageGroup: age,
  });
  const parsed = parseCurriculumLessonPlanImport(importText);
  assert(parsed.ok, `Parse failed for ${age}: ${(parsed.errors || []).join("; ")}`);
  const activityCount = DAY_KEYS.reduce((sum, day) => sum + (parsed.data.dailyPlans?.[day]?.items?.length || 0), 0);
  assert(activityCount >= 15, `${age} seeded plan should have 15+ activities, got ${activityCount}`);

  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-owner-review-${age.toLowerCase().replace(/\s+/g, "-")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: parsed.data.title,
      plan: "Free",
      status: "published",
      age,
      theme: parsed.data.theme,
    },
  });
  assert(save.status === 200, `Seed failed (${age}): ${save.status} ${save.text}`);
  return { planId, title: parsed.data.title, age, activityCount };
}

async function gotoLessonsBrowse(page) {
  await page.evaluate(() => setView("lessons", { lessonLibraryMode: "browse" }));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
}

async function openLesson(page, title) {
  await gotoLessonsBrowse(page);
  await page.fill("#lessonPlanSearch", title);
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
  let browser = null;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, `Admin login failed: ${login.status}`);
    assert(LESSON_PLANS.length >= 3, "preschool free lesson data should provide seed plans");
    const seeded = [
      await seedLesson(login.json.token, { age: "Infant", sourcePlan: LESSON_PLANS[0], index: 0 }),
      await seedLesson(login.json.token, { age: "Toddler", sourcePlan: LESSON_PLANS[1], index: 1 }),
      await seedLesson(login.json.token, { age: "Preschool", sourcePlan: LESSON_PLANS[2], index: 2 }),
    ];
    const primary = seeded.find((plan) => plan.age === "Preschool") || seeded[0];

    const { chromium } = playwright;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, acceptDownloads: true });
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
      localStorage.removeItem(`llhCurriculumAssignments:${email}`);
      localStorage.removeItem("llhWeeklyPlanner");
    }, { email: USER_EMAIL, favoriteIds: [primary.planId] });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    console.log("1) Browse library is clean and Saved Plans is a destination");
    await gotoLessonsBrowse(page);
    const browse = await page.evaluate(() => ({
      title: document.querySelector(".lesson-library-title")?.textContent.trim() || "",
      savedDestination: Boolean(document.querySelector('[data-lesson-library-mode="saved"]')),
      savedFilterToggle: Boolean(document.querySelector("[data-lesson-library-saved-toggle]")),
      ageFilters: [...document.querySelectorAll(".lesson-library-age-filters button")].map((button) => button.textContent.trim()),
      moreFiltersText: document.querySelector("[data-lesson-library-filters-toggle]")?.textContent.trim() || "",
    }));
    assert(browse.title === "Lesson Plan Library", `browse title wrong: ${browse.title}`);
    assert(browse.savedDestination, "Saved Plans destination missing");
    assert(!browse.savedFilterToggle, "Saved filter chip/toggle should not render");
    assert(browse.ageFilters.join(",") === "All,Infant,Toddler,Preschool", `age filters wrong: ${browse.ageFilters.join(",")}`);
    assert(/More filters/i.test(browse.moreFiltersText), `More filters label wrong: ${browse.moreFiltersText}`);

    console.log("2) Saved Lesson Plans mode lists only favorite plans");
    await page.click('[data-lesson-library-mode="saved"]');
    await page.waitForSelector("#view-lessons:has-text('Saved Lesson Plans')", { timeout: 10000 });
    const saved = await page.evaluate((title) => ({
      title: document.querySelector(".lesson-library-title")?.textContent.trim() || "",
      subtitle: document.querySelector(".lesson-library-subtitle")?.textContent.trim() || "",
      cardTitles: [...document.querySelectorAll("#view-lessons .lesson-plan-card h3")].map((item) => item.textContent.trim()),
      hasAgeFilters: Boolean(document.querySelector(".lesson-library-age-filters")),
      hasBack: /Back to Lesson Plans/i.test(document.querySelector('[data-lesson-library-mode="browse"]')?.textContent || ""),
      hasPrimary: [...document.querySelectorAll("#view-lessons .lesson-plan-card h3")].some((item) => item.textContent.trim() === title),
    }), primary.title);
    assert(saved.title === "Saved Lesson Plans", `saved title wrong: ${saved.title}`);
    assert(saved.subtitle === "Plans you saved for quick access.", `saved subtitle wrong: ${saved.subtitle}`);
    assert(saved.hasPrimary, `saved page missing favorite ${primary.title}`);
    assert(saved.cardTitles.length === 1, `saved page should list only favorites, got ${saved.cardTitles.join(" | ")}`);
    assert(!saved.hasAgeFilters, "saved mode should not show age filters");
    assert(saved.hasBack, "saved mode back button missing");

    console.log("2b) Device back returns from Saved Plans to browse library");
    await page.evaluate(() => window.history.back());
    await page.waitForFunction(() => {
      return document.querySelector(".lesson-library-title")?.textContent.trim() === "Lesson Plan Library"
        && Boolean(document.querySelector('[data-lesson-library-mode="saved"]'));
    }, null, { timeout: 5000 });
    await page.click('[data-lesson-library-mode="saved"]');
    await page.waitForSelector("#view-lessons:has-text('Saved Lesson Plans')", { timeout: 10000 });

    console.log("3) Action bar exposes manage actions; assign sheet is pick-week only");
    await openLesson(page, primary.title);
    const bar = await page.evaluate(() => ({
      edit: Boolean(document.querySelector('[data-lesson-action-bars="top"] [data-edit-lesson-plan]')),
      calendar: Boolean(document.querySelector("[data-lesson-use-this-plan]")),
      myWeek: Boolean(document.querySelector("[data-lesson-add-to-my-week]")),
      printWeekly: Boolean(document.querySelector('[data-lesson-action-bars="top"] [data-lesson-print-variant="week"]')),
      downloadWeekly: Boolean(document.querySelector('[data-lesson-action-bars="top"] [data-lesson-download-variant="week"]')),
      downloadFull: Boolean(document.querySelector('[data-lesson-action-bars="top"] [data-lesson-download-variant="full"]')),
      downloadPdf: Boolean(document.querySelector('[data-lesson-action-bars="top"] [data-download-pdf]')),
      bottomBar: Boolean(document.querySelector('[data-lesson-action-bars="bottom"]')),
      actionBarCount: document.querySelectorAll(".lesson-workspace-action-bars").length,
      hasMore: Boolean(document.querySelector("[data-lesson-workspace-more-toggle]")),
    }));
    assert(bar.edit && bar.calendar && bar.myWeek, "primary manage actions missing");
    assert(bar.printWeekly && bar.downloadWeekly && bar.downloadFull && bar.downloadPdf, "download/print actions missing");
    assert(!bar.bottomBar, "duplicate bottom action bar should be removed");
    assert(bar.actionBarCount === 1, "exactly one action bar should render");
    assert(bar.hasMore, "More actions menu should be present");
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const sheet = await page.evaluate(() => ({
      title: document.querySelector("[data-lesson-assign-sheet-title]")?.textContent.trim() || "",
      hasCancel: Boolean(document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-workspace-action-sheet-dismiss]')),
      hasPrintInSheet: Boolean(document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-print-variant]')),
    }));
    assert(sheet.title === "Add to Calendar", `assign title wrong: ${sheet.title}`);
    assert(sheet.hasCancel, "Cancel missing");
    assert(!sheet.hasPrintInSheet, "assign sheet should not mix print options");
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");

    console.log("4) Week tab has no top print/download and weekly print supports large plan");
    const weekAndPrint = await page.evaluate((expectedActivityCount) => {
      const weekPanel = document.querySelector('[data-lesson-workspace-panel="week"]');
      const html = resourcePrintableHtml(activeResourceViewerResource, { mode: "print", printVariant: "week" });
      return {
        hasTopPrint: Boolean(weekPanel?.querySelector('.lesson-workspace-week-actions [data-lesson-print-variant="week"]')),
        hasTopDownload: Boolean(weekPanel?.querySelector('.lesson-workspace-week-actions [data-lesson-download-variant="week"]')),
        html,
        activityRows: document.querySelectorAll(".lesson-workspace-activity-row").length,
        expectedActivityCount,
      };
    }, primary.activityCount);
    assert(!weekAndPrint.hasTopPrint && !weekAndPrint.hasTopDownload, "Week tab should not show top print/download buttons");
    assert(weekAndPrint.html.includes("lesson-week-day-stack"), "weekly print HTML missing day stack");
    assert(weekAndPrint.html.includes("Weekly Snapshot"), "weekly print HTML missing Weekly Snapshot");
    assert(weekAndPrint.html.includes("Teacher Prep This Week"), "weekly print HTML missing Teacher Prep");
    assert(weekAndPrint.html.includes("Weekly Materials"), "weekly print HTML missing Weekly Materials");
    assert(weekAndPrint.html.includes("Teacher Notes"), "weekly print HTML missing Teacher Notes");
    assert(weekAndPrint.html.includes("lesson-week-brand-logo"), "weekly print HTML missing LLH logo");
    assert(weekAndPrint.html.includes("lesson-week-print-footer"), "weekly print HTML missing footer");
    assert(weekAndPrint.html.includes("lesson-week-activity-card"), "weekly print HTML missing activity cards");
    assert(weekAndPrint.html.includes("Materials:"), "weekly print HTML missing per-activity materials");
    assert(weekAndPrint.html.includes("extended classroom-ready title"), "weekly print HTML should keep long activity titles");
    assert(weekAndPrint.activityRows >= primary.activityCount, `viewer should show many activities (${weekAndPrint.activityRows}/${primary.activityCount})`);

    console.log("5) Browser history returns from activity to lesson to library");
    await page.click("[data-lesson-workspace-tab='activities']");
    await page.waitForSelector('[data-lesson-workspace-panel="activities"].is-active [data-open-curriculum-activity]', { timeout: 10000 });
    await page.locator('[data-lesson-workspace-panel="activities"].is-active [data-open-curriculum-activity]').first().click();
    await page.waitForSelector("#resourceViewerModal.open:not(.lesson-workspace-mode)", { timeout: 10000 });
    await page.evaluate(() => window.history.back());
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    assert(await page.locator(".lesson-workspace-title").innerText() === primary.title, "history back from activity should reopen parent lesson");
    await page.evaluate(() => window.history.back());
    await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });

    console.log("6) Infant, toddler, and preschool real-ish plans open");
    for (const plan of seeded) {
      await openLesson(page, plan.title);
      const opened = await page.evaluate(() => ({
        title: document.querySelector(".lesson-workspace-title")?.textContent.trim() || "",
        activityRows: document.querySelectorAll(".lesson-workspace-activity-row").length,
      }));
      assert(opened.title === plan.title, `${plan.age} viewer title wrong: ${opened.title}`);
      assert(opened.activityRows >= plan.activityCount, `${plan.age} viewer missing activities (${opened.activityRows}/${plan.activityCount})`);
      await page.click("[data-lesson-workspace-back]");
      await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
    }

    console.log("Lesson owner review checks passed.");
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
