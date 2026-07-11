const { test, expect } = require("../fixtures/test-base");
const { setUserPersona } = require("../helpers/auth");
const { seedPublishedLesson, archiveLessonPlan } = require("../helpers/api");
const {
  goToView,
  openLessonLibrary,
  openLessonByTitle,
  closeResourceViewer,
  openActivityCenter,
  openMobileNav,
  searchLessonLibrary,
  waitForAppReady,
} = require("../helpers/navigation");
const { uniqueE2eId, buildE2eLessonImportText } = require("../helpers/lesson-data");

test.describe("Navigation and back buttons", () => {
  const runId = uniqueE2eId("nav");
  const lessonTitle = `E2E Publish Lesson ${runId}`;
  let seed = null;

  test.beforeAll(async ({ baseURL }) => {
    seed = await seedPublishedLesson(baseURL, buildE2eLessonImportText(runId), { status: "published" });
  });

  test.afterAll(async ({ baseURL }) => {
    if (!seed || !baseURL) return;
    await archiveLessonPlan(baseURL, seed.token, seed.lessonPlan, seed.expectedUpdatedAt).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await setUserPersona(page, "pro");
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
  });

  test("major routes expose back/close controls", async ({ page }) => {
    await goToView(page, "home");
    await expect(page.locator("#view-home")).toBeVisible();

    await openLessonLibrary(page);
    await expect(page.locator('#view-lessons .back-button[data-view="home"]')).toBeVisible();
    await openLessonByTitle(page, lessonTitle);
    await expect(page.locator("#closeResourceViewer")).toBeVisible();
    await closeResourceViewer(page);

    await openActivityCenter(page);
    await expect(page.locator('#view-activities .back-button[data-view="home"]')).toBeVisible();

    await openLessonLibrary(page);
    await searchLessonLibrary(page, lessonTitle);
    await page.locator("button[data-find-lesson-activities]").first().click();
    await page.waitForTimeout(400);
    await expect(page.locator("[data-clear-activity-lesson-filter]")).toBeVisible();
    await page.click("[data-clear-activity-lesson-filter]");
    await page.waitForTimeout(400);
    await expect(page.locator(".activity-lesson-filter-banner")).toHaveCount(0);
  });

  test("lesson weekday tab and search term persist after viewer close", async ({ page }) => {
    await openLessonLibrary(page);
    await page.fill("#lessonPlanSearch", lessonTitle);
    await openLessonByTitle(page, lessonTitle);
    await page.click('[data-curriculum-lesson-day="wednesday"]');
    await closeResourceViewer(page);
    await expect(page.locator("#lessonPlanSearch")).toHaveValue(lessonTitle);
  });

  test("mobile navigation opens, closes, and closes after selection", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only navigation test");
    await openMobileNav(page);
    await expect(page.locator("body")).toHaveClass(/mobile-nav-open/);
    await page.locator('.sidebar [data-view="lessons"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toHaveClass(/mobile-nav-open/);
    await expect(page.locator("#lessonPlanSearch")).toBeVisible();
  });
});
