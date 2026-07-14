#!/usr/bin/env node
/**
 * Lesson library mobile QA regression (Batches 6–8 highlights).
 * Run: npm run test:lesson-library-mobile-qa
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19660 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-mobile-qa-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-mobile-qa-admin@test.local",
  password: "lesson-mobile-qa-pass",
  code: "lesson-mobile-qa-code",
};
const USER_EMAIL = "lesson-mobile-qa@example.com";
const FREE_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const PRO_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");

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

async function seedLesson(token, { samplePath, title, plan, suffix }) {
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(samplePath, "utf8"));
  assert(parsed.ok, `Parse failed: ${(parsed.errors || []).join("; ")}`);
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const planId = `cur-lp-mobile-qa-${suffix}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title,
      plan,
      status: "published",
      age: "Preschool",
    },
  });
  assert(save.status === 200, `Seed failed (${title}): ${save.status} ${save.text}`);
  return { planId, title };
}

async function prepareFreeUser(page) {
  await page.evaluate((email) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: {
        email,
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
    }));
    localStorage.setItem("llhPlan", "Free");
    localStorage.removeItem("llhWeeklyPlanner");
    localStorage.removeItem(`llhCurriculumAssignments:${email}`);
  }, USER_EMAIL);
}

async function gotoLessons(page) {
  await page.evaluate(() => setView("lessons"));
  await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
  await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });
}

async function searchLesson(page, title) {
  await page.fill("#lessonPlanSearch", title);
  await page.waitForTimeout(350);
  await page.waitForSelector(`#view-lessons .lesson-plan-card:has-text("${title}")`, { timeout: 15000 });
}

async function openLessonByKeyboard(page, title) {
  const card = page.locator("#view-lessons .lesson-plan-card").filter({ hasText: title }).first();
  await card.waitFor({ timeout: 10000 });
  await card.focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
}

async function closeLessonViewer(page) {
  if (await page.locator("#resourceViewerModal.open").count()) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
  }
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

    const freeLesson = await seedLesson(login.json.token, {
      samplePath: FREE_SAMPLE,
      title: "Mobile QA Free Lesson",
      plan: "Free",
      suffix: "free",
    });
    const proLesson = await seedLesson(login.json.token, {
      samplePath: PRO_SAMPLE,
      title: "Mobile QA Pro Lesson",
      plan: "Pro",
      suffix: "pro",
    });

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
    await page.evaluate(() => {
      window.__printInvocations = [];
      window.print = () => {
        window.__printInvocations.push(window.__llhLastResourceOutputRequest || null);
        window.dispatchEvent(new Event("afterprint"));
      };
    });

    console.log("1) Mobile lesson library is compact and opens cards");
    await gotoLessons(page);
    await searchLesson(page, freeLesson.title);
    const libraryA = await page.evaluate((title) => {
      const cards = [...document.querySelectorAll("#view-lessons .lesson-plan-card")];
      const card = cards.find((item) => item.textContent.includes(title));
      return {
        hasLegacyHero: /What do you need today\?/i.test(document.querySelector("#view-lessons")?.textContent || ""),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        cardTop: card?.getBoundingClientRect().top || 9999,
        maxHeight: Math.max(...cards.map((item) => item.getBoundingClientRect().height)),
      };
    }, freeLesson.title);
    assert(!libraryA.hasLegacyHero, "lesson library still shows the old hero prompt");
    assert(!libraryA.overflow, "lesson library has horizontal overflow at 412px");
    assert(libraryA.cardTop < 420, `lesson cards sit too low on mobile (${libraryA.cardTop}px)`);
    assert(libraryA.maxHeight < 320, `lesson cards are too tall on mobile (${libraryA.maxHeight}px)`);
    const simplifiedBrowse = await page.evaluate(() => ({
      savedDestination: Boolean(document.querySelector('[data-lesson-library-mode="saved"]')),
      savedFilterToggle: Boolean(document.querySelector("[data-lesson-library-saved-toggle]")),
      moreFilters: /More filters/i.test(document.querySelector("[data-lesson-library-filters-toggle]")?.textContent || ""),
    }));
    assert(simplifiedBrowse.savedDestination, "Saved Plans destination missing on mobile");
    assert(!simplifiedBrowse.savedFilterToggle, "Saved filter chip should be removed on mobile");
    assert(simplifiedBrowse.moreFilters, "More filters control missing on mobile");

    await page.click('button[data-filter="Preschool"]');
    await page.waitForTimeout(200);
    const filterState = await page.locator('button[data-filter="Preschool"]').getAttribute("aria-pressed");
    assert(filterState === "true", "selected filter should expose aria-pressed");
    await openLessonByKeyboard(page, freeLesson.title);

    const workspaceA = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      tabs: [...document.querySelectorAll("[data-lesson-workspace-tab]")].map((el) => el.textContent.trim()),
      weekActive: document.querySelector('[data-lesson-workspace-panel="week"]')?.classList.contains("is-active"),
    }));
    assert(!workspaceA.overflow, "lesson workspace overflows on mobile");
    assert(workspaceA.tabs.join(",") === "Week,Plan,Activities,Materials", `unexpected lesson workspace tabs: ${workspaceA.tabs.join(",")}`);
    assert(workspaceA.weekActive, "week panel should be active by default");

    console.log("2) Search and filters persist after close");
    await closeLessonViewer(page);
    const persisted = await page.evaluate(() => ({
      search: document.querySelector("#lessonPlanSearch")?.value || "",
      filter: document.querySelector('button[data-filter="Preschool"]')?.getAttribute("aria-pressed") || "",
    }));
    assert(persisted.search === freeLesson.title, "lesson search should persist after close");
    assert(persisted.filter === "true", "selected filter should persist after close");

    console.log("3) Activity drill-down and back levels work");
    await page.locator("#view-lessons .lesson-plan-card").filter({ hasText: freeLesson.title }).first().click();
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    await page.click("[data-lesson-workspace-tab='activities']");
    await page.waitForSelector('[data-lesson-workspace-panel="activities"].is-active', { timeout: 3000 });
    await page.locator('[data-lesson-workspace-panel="activities"].is-active [data-open-curriculum-activity]').first().click();
    await page.waitForSelector("#resourceViewerModal.open:not(.lesson-workspace-mode)", { timeout: 10000 });
    const activityBackText = await page.locator("#resourceViewerBackButton").innerText();
    assert(/Lesson Plan/i.test(activityBackText), `activity detail back button wrong: ${activityBackText}`);
    await page.click("#resourceViewerBackButton");
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    await page.waitForSelector('[data-lesson-workspace-panel="activities"].is-active', { timeout: 3000 });

    await page.evaluate((planId) => {
      const resource = resources.find((item) => item.id === planId);
      if (!resource) throw new Error("lesson missing");
      setViewReturnContext("activities", {
        type: "view",
        view: "lessons",
        label: "← Back to Lesson Plans",
      });
      activeActivityLessonPlanId = planId;
      dismissResourceViewerForNavigation();
      setView("activities");
    }, freeLesson.planId);
    await page.waitForSelector("#view-activities.active-view", { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 5000 });
    const activityLibraryBack = await page.locator('#view-activities [data-contextual-back="activities"]').innerText();
    assert(/Lesson Plan/i.test(activityLibraryBack), `activity library back should return to lesson plan, got: ${activityLibraryBack}`);
    await page.locator('#view-activities [data-view-resource]').first().click();
    await page.waitForSelector("#resourceViewerModal.open:not(.lesson-workspace-mode)", { timeout: 10000 });
    const activityDetailBack = await page.locator("#resourceViewerBackButton").innerText();
    assert(/Activities/i.test(activityDetailBack), `activity detail should return to activities, got: ${activityDetailBack}`);
    await page.click("#resourceViewerBackButton");
    await page.waitForSelector("#view-activities.active-view", { timeout: 5000 });
    await page.click('#view-activities [data-contextual-back="activities"]');
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    assert(await page.locator(".lesson-workspace-title").innerText() === freeLesson.title, "activity library back should reopen the originating lesson");

    console.log("4) Escape closes transient lesson UI and Add to Calendar panel works");
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector(".lesson-workspace-action-sheet:not([hidden])", { timeout: 3000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector(".lesson-workspace-action-sheet")?.hidden === true, null, { timeout: 5000 });
    assert(await page.locator("#resourceViewerModal.lesson-workspace-mode.open").count(), "Escape should close the action sheet before closing the lesson");
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const planPanelCopy = await page.evaluate(() => ({
      title: document.querySelector('[data-lesson-workspace-action-panel="main-calendar"] .lesson-workspace-action-sheet-title')?.textContent.trim() || "",
      submit: document.querySelector('[data-lesson-main-calendar-form] button[type="submit"]')?.textContent.trim() || "",
    }));
    assert(planPanelCopy.title === "Add to Calendar", `Add to Calendar panel title wrong: ${planPanelCopy.title}`);
    assert(planPanelCopy.submit === "Add to Calendar", `Add to Calendar submit copy wrong: ${planPanelCopy.submit}`);
    await page.click("[data-lesson-workspace-action-sheet-dismiss]");
    await page.waitForFunction(() => document.querySelector(".lesson-workspace-action-sheet")?.hidden === true, null, { timeout: 5000 });

    console.log("5) Weekly planner can reopen its linked lesson");
    await page.click("[data-lesson-use-this-plan]");
    await page.waitForSelector('[data-lesson-workspace-action-panel="main-calendar"]:not([hidden])', { timeout: 5000 });
    const monday = await page.evaluate(() => {
      const date = new Date();
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      date.setDate(date.getDate() + diff);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    });
    await page.fill('[data-lesson-main-calendar-form] [name="weekStartDate"]', monday);
    await page.selectOption('[data-lesson-main-calendar-form] [name="ageGroup"]', "Preschool");
    await page.click('[data-lesson-main-calendar-form] button[type="submit"]');
    await page.waitForSelector('[data-lesson-workspace-action-panel="success"]:not([hidden])', { timeout: 15000 });
    await page.click("[data-lesson-open-weekly-planner]");
    await page.waitForSelector("#view-planner.active-view", { timeout: 10000 });
    await page.click('#weeklyPlannerApp [data-view-resource]');
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    const plannerBack = await page.locator(".lesson-workspace-back[data-lesson-workspace-back]").innerText();
    assert(/Calendar/i.test(plannerBack), `weekly planner lesson back should point to calendar, got: ${plannerBack}`);
    await page.click(".lesson-workspace-back[data-lesson-workspace-back]");
    await page.waitForSelector("#view-planner.active-view", { timeout: 5000 });

    console.log("6) Print/download action bar fires distinct workflows");
    await page.click('#weeklyPlannerApp [data-view-resource]');
    await page.waitForSelector("#resourceViewerModal.lesson-workspace-mode.open", { timeout: 10000 });
    const expectBarOutputRequest = async (selector, expected, { openMore = false } = {}) => {
      if (openMore) {
        await page.locator("[data-lesson-workspace-more-toggle]").click();
        await page.waitForSelector(".lesson-workspace-more-menu:not([hidden])", { timeout: 5000 });
        await page.locator(`.lesson-workspace-more-menu ${selector}`).first().click();
      } else {
        await page.locator(`[data-lesson-action-bars="top"] ${selector}`).first().click();
      }
      await page.waitForTimeout(50);
      const request = await page.evaluate(() => window.__llhLastResourceOutputRequest || null);
      assert(request, `missing resource output request after ${selector}`);
      assert(request.mode === expected.mode, `${selector} mode mismatch: ${JSON.stringify(request)}`);
      assert(request.printVariant === expected.printVariant, `${selector} variant mismatch: ${JSON.stringify(request)}`);
    };
    await expectBarOutputRequest('[data-lesson-print-variant="week"]', { mode: "print", printVariant: "week" });
    await expectBarOutputRequest('[data-lesson-download-variant="week"]', { mode: "download", printVariant: "week" }, { openMore: true });
    await expectBarOutputRequest('[data-lesson-download-variant="full"]', { mode: "download", printVariant: "full" }, { openMore: true });
    await expectBarOutputRequest('[data-download-pdf]', { mode: "download", printVariant: "full" });

    console.log("7) Locked Pro preview closes with Escape");
    await closeLessonViewer(page);
    await gotoLessons(page);
    await searchLesson(page, proLesson.title);
    const previewCard = page.locator("#view-lessons .resource-card").filter({ hasText: proLesson.title }).first();
    await previewCard.click({ force: true });
    await page.waitForSelector("#featurePreviewModal.open", { timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector("#featurePreviewModal.open", { state: "hidden", timeout: 5000 });

    console.log("\nLesson library mobile QA checks passed.");
    await browser.close();
    browser = null;
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
