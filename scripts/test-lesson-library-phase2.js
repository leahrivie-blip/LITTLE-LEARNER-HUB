#!/usr/bin/env node
/**
 * Lesson library Phase 2 completion checks.
 * Run: npm run test:lesson-library-phase2
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19690 + Math.floor(Math.random() * 50);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-phase2-${crypto.randomBytes(4).toString("hex")}.json`);
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const ADMIN = {
  email: "lesson-phase2-admin@test.local",
  password: "lesson-phase2-pass",
  code: "lesson-phase2-code",
};
const USER_EMAIL = "lesson-phase2@example.com";

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
  for (let i = 0; i < 80; i += 1) {
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

async function seedLesson(token, { age, title, suffix }) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-phase2-${suffix}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title,
      plan: "Free",
      status: "published",
      age,
      theme: `${age} classroom routines`,
    },
  });
  assert(save.status === 200, `Seed failed (${title}): ${save.status} ${save.text}`);
  return { planId, title, age };
}

async function prepareFreeUser(page) {
  await page.evaluate((email) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: { email, plan: "Free", subscriptionStatus: "Free Plan" },
    }));
    localStorage.setItem("llhPlan", "Free");
    localStorage.removeItem("llhWeeklyPlanner");
    localStorage.removeItem(`llhCurriculumAssignments:${email}`);
  }, USER_EMAIL);
}

async function gotoLessons(page) {
  await page.evaluate(() => {
    searchInput.value = "";
    activeFilter = "All";
    setView("lessons", { lessonLibraryMode: "browse" });
  });
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.waitForSelector("#view-lessons.active-view #lessonPlanSearch", { timeout: 10000 });
}

async function openLessonWorkspace(page, title) {
  await gotoLessons(page);
  await page.fill("#view-lessons.active-view #lessonPlanSearch", title);
  await page.waitForTimeout(350);
  await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${title}")`, { timeout: 15000 });
  await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: title }).first().click();
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
}

async function closeViewerProgrammatically(page) {
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

  const child = startServer();
  let browser = null;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200, `Admin login failed: ${login.status}`);
    const seeded = [
      await seedLesson(login.json.token, { age: "Infant", title: "Infant Gentle Routines Week", suffix: "infant" }),
      await seedLesson(login.json.token, { age: "Toddler", title: "Toddler Busy Builders Week", suffix: "toddler" }),
      await seedLesson(login.json.token, { age: "Preschool", title: "Preschool Curious Classroom Week", suffix: "preschool" }),
    ];
    const primary = seeded.find((item) => item.age === "Preschool") || seeded[0];

    const { chromium } = playwright;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await prepareFreeUser(page);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    console.log("A) Library to lesson to activity browser history");
    await openLessonWorkspace(page, primary.title);
    await page.click("[data-lesson-workspace-tab='activities']");
    await page.waitForSelector('[data-lesson-workspace-panel="activities"].is-active [data-open-curriculum-activity]', { timeout: 10000 });
    await page.locator('[data-lesson-workspace-panel="activities"].is-active [data-open-curriculum-activity]').first().click();
    await page.waitForSelector("#resourceViewerModal.open:not(.lesson-workspace-mode)", { timeout: 10000 });
    await page.evaluate(() => window.history.back());
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    assert(await page.locator(".lesson-workspace-title").innerText() === primary.title, "history.back from activity should reopen parent lesson");
    await page.evaluate(() => window.history.back());
    await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });

    console.log("B) Library browse has Saved Plans destination and no Saved filter chip");
    await gotoLessons(page);
    const libraryChrome = await page.evaluate(() => ({
      hasSavedDestination: Boolean(document.querySelector('[data-lesson-library-mode="saved"]')),
      hasSavedToggle: Boolean(document.querySelector("[data-lesson-library-saved-toggle]")),
      hasMoreFilters: /More filters/i.test(document.querySelector("[data-lesson-library-filters-toggle]")?.textContent || ""),
    }));
    assert(libraryChrome.hasSavedDestination, "Saved Plans destination missing from browse");
    assert(!libraryChrome.hasSavedToggle, "Saved filter toggle should not render in browse");
    assert(libraryChrome.hasMoreFilters, "More filters control missing");
    await page.click('[data-lesson-library-mode="saved"]');
    await page.waitForSelector("#view-lessons:has-text('Saved Lesson Plans')", { timeout: 5000 });
    const savedMode = await page.evaluate(() => ({
      title: document.querySelector(".lesson-library-title")?.textContent.trim() || "",
      hasAgeFilters: Boolean(document.querySelector(".lesson-library-age-filters")),
      empty: document.querySelector(".lesson-library-grid")?.textContent || "",
    }));
    assert(savedMode.title === "Saved Lesson Plans", `saved page title wrong: ${savedMode.title}`);
    assert(!savedMode.hasAgeFilters, "saved page should not show age filters");
    assert(/No saved lesson plans yet|Saved lesson plans are included with Pro/i.test(savedMode.empty), "saved page empty/helpful copy missing");
    await page.click('[data-lesson-library-mode="browse"]');
    await page.waitForSelector("#view-lessons:has-text('Lesson Plan Library')", { timeout: 5000 });

    console.log("C) Use This Plan → Add to Calendar opens pick-week form (no nested print menu)");
    await openLessonWorkspace(page, primary.title);
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="use-plan"]:not([hidden])', { timeout: 5000 });
    await page.click('[data-lesson-use-plan-choice="calendar"]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const sheetCopy = await page.evaluate(() => ({
      title: document.querySelector("[data-lesson-assign-sheet-title]")?.textContent.trim() || "",
      submit: document.querySelector("[data-lesson-assign-submit]")?.textContent.trim() || "",
      hasCancel: Boolean(document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-workspace-action-sheet-dismiss]')),
      hasPrintInSheet: Boolean(document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] [data-lesson-print-variant]')),
      hasEdit: Boolean(document.querySelector('.lesson-workspace-more-menu [data-edit-lesson-plan]')),
      hasUsePlan: Boolean(document.querySelector("[data-lesson-use-this-plan]")),
    }));
    assert(sheetCopy.title === "Add to Calendar", `sheet title wrong: ${sheetCopy.title}`);
    assert(sheetCopy.submit === "Add to Calendar", `submit wrong: ${sheetCopy.submit}`);
    assert(sheetCopy.hasCancel, "cancel action missing");
    assert(!sheetCopy.hasPrintInSheet, "assign sheet should not mix print options");
    assert(sheetCopy.hasEdit && sheetCopy.hasUsePlan, "primary action bar missing Use This Plan / Edit");
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");

    console.log("D) Global search renders lesson plan compact cards");
    await closeViewerProgrammatically(page);
    await page.evaluate((query) => {
      setView("home");
      searchInput.value = query;
      showSearchResults();
    }, primary.title);
    await page.waitForSelector(`#view-home .lesson-plan-card:has-text("${primary.title}")`, { timeout: 10000 });
    const searchState = await page.evaluate(() => ({
      hasLessonCard: Boolean(document.querySelector("#view-home .lesson-plan-card")),
      hasSearchGrid: Boolean(document.querySelector("#view-home .search-results-grid.lesson-library-grid")),
      hasBack: /Back to (Dashboard|Home)/.test(document.querySelector("#view-home .back-button")?.textContent || ""),
    }));
    assert(searchState.hasLessonCard, "global search lesson result should use .lesson-plan-card");
    assert(searchState.hasSearchGrid, "global search grid should support compact lesson cards");
    assert(searchState.hasBack, "global search should include Back to Home/Dashboard");

    console.log("E) Weekly print variant uses professional schedule grid");
    await openLessonWorkspace(page, primary.title);
    const weeklyHtml = await page.evaluate(() => resourcePrintableHtml(activeResourceViewerResource, { mode: "print", printVariant: "week" }));
    assert(weeklyHtml.includes("lesson-week-day-stack"), "weekly print HTML missing day stack class");
    assert(weeklyHtml.includes("Weekly Snapshot"), "weekly print HTML missing Weekly Snapshot");
    assert(weeklyHtml.includes("Teacher Prep This Week"), "weekly print HTML missing Teacher Prep");
    assert(weeklyHtml.includes("Weekly Materials"), "weekly print HTML missing Weekly Materials");
    assert(weeklyHtml.includes("Weekly Resources"), "weekly print HTML missing Weekly Resources");
    assert(weeklyHtml.includes("Teacher Notes"), "weekly print HTML missing Teacher Notes");
    assert(weeklyHtml.includes("lesson-week-brand-logo"), "weekly print HTML missing LLH logo");
    assert(weeklyHtml.includes("lesson-week-print-footer"), "weekly print HTML missing footer");
    assert(weeklyHtml.includes("lesson-week-activity-card"), "weekly print HTML missing activity cards");
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].forEach((day) => {
      assert(weeklyHtml.includes(day), `weekly print HTML missing ${day}`);
    });

    console.log("F) Real-ish Free plans open by age with tabs and weekday activity");
    for (const plan of seeded) {
      await closeViewerProgrammatically(page);
      await openLessonWorkspace(page, plan.title);
      const workspace = await page.evaluate(() => ({
        tabs: [...document.querySelectorAll("[data-lesson-workspace-tab]")].map((el) => el.textContent.trim()),
        activityCount: document.querySelectorAll(".lesson-workspace-activity-row").length,
      }));
      assert(workspace.tabs.join(",") === "Week,Plan,Activities,Materials", `${plan.age} workspace tabs missing`);
      assert(workspace.activityCount > 0, `${plan.age} plan should expose at least one weekday activity`);
    }

    console.log("Lesson library Phase 2 checks passed.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
