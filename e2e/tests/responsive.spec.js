const { test, expect } = require("../fixtures/test-base");
const { setUserPersona } = require("../helpers/auth");
const { seedPublishedLesson, archiveLessonPlan } = require("../helpers/api");
const { openLessonLibrary, openLessonByTitle, assertNoHorizontalScroll } = require("../helpers/navigation");
const { uniqueE2eId, buildE2eLessonImportText } = require("../helpers/lesson-data");

test.describe("Responsive layout @core", () => {
  const runId = uniqueE2eId("responsive");
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
    await page.goto("/index.html", { waitUntil: "networkidle" });
  });

  test("lesson library and viewer fit viewport without horizontal scroll", async ({ page }) => {
    await openLessonLibrary(page);
    expect(await assertNoHorizontalScroll(page)).toBe(false);

    const toolbarVisible = await page.locator("#lessonPlanSearch").isVisible();
    expect(toolbarVisible).toBe(true);

    await openLessonByTitle(page, lessonTitle);
    await expect(page.locator("#closeResourceViewer")).toBeVisible();
    await expect(page.locator("#printResourceButton")).toBeVisible();
    expect(await assertNoHorizontalScroll(page)).toBe(false);

    const body = page.locator("#resourceViewerBody");
    await expect(body).toBeVisible();
    const clipped = await page.evaluate(() => {
      const modal = document.querySelector(".resource-viewer-card");
      if (!modal) return false;
      const rect = modal.getBoundingClientRect();
      return rect.right > window.innerWidth + 2 || rect.left < -2;
    });
    expect(clipped).toBe(false);
  });

  test("weekday tabs and accordions remain usable", async ({ page }) => {
    await openLessonByTitle(page, lessonTitle);
    for (const day of ["tuesday", "friday"]) {
      const tab = page.locator(`[data-curriculum-lesson-day="${day}"]`);
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page.locator(`[data-curriculum-lesson-day-panel="${day}"]`)).toHaveClass(/is-active/);
    }
  });
});
